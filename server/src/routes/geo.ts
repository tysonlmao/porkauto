import { Hono } from "hono";

type ApproxLocation = {
  lat: number;
  lng: number;
  accuracyM: number;
  city: string | null;
  source: "ip";
};

type NominatimResult = {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  importance?: number;
  address?: Record<string, string>;
};

const UA = "porkauto-dev/0.0.1 (car display; contact: dev@porkauto.local)";

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
      ...(init?.headers ?? {}),
    },
  });
  const status = Number(
    (response as unknown as { status?: number }).status ?? 0,
  );
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status || "error"} for ${url}`);
  }
  const text = await (
    response as unknown as { text: () => Promise<string> }
  ).text();
  return JSON.parse(text) as unknown;
}

async function fromGeoJs(): Promise<ApproxLocation> {
  const data = (await fetchJson("https://get.geojs.io/v1/ip/geo.json")) as {
    latitude?: string;
    longitude?: string;
    city?: string;
  };
  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("geojs missing coordinates");
  }
  return {
    lat,
    lng,
    accuracyM: 25_000,
    city: data.city ?? null,
    source: "ip",
  };
}

async function fromIpWho(): Promise<ApproxLocation> {
  const data = (await fetchJson("https://ipwho.is/")) as {
    success?: boolean;
    latitude?: number;
    longitude?: number;
    city?: string;
  };
  if (data.success === false) throw new Error("ipwho failed");
  const lat = data.latitude;
  const lng = data.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new Error("ipwho missing coordinates");
  }
  return {
    lat,
    lng,
    accuracyM: 25_000,
    city: data.city ?? null,
    source: "ip",
  };
}

function formatPlaceName(item: NominatimResult): string {
  const a = item.address;
  if (a) {
    const line1 =
      a.amenity ||
      a.shop ||
      a.tourism ||
      a.building ||
      a.road ||
      a.pedestrian ||
      a.neighbourhood ||
      a.suburb;
    const house = a.house_number ? `${a.house_number} ` : "";
    const street = a.road ? `${house}${a.road}` : null;
    const primary = line1 && !a.road ? line1 : street || line1;
    const locality =
      a.suburb || a.neighbourhood || a.city || a.town || a.village || a.hamlet;
    const region = a.state || a.province;
    const parts = [primary, locality, region].filter(
      (p): p is string => Boolean(p && p.trim()),
    );
    if (parts.length > 0) return parts.join(", ");
  }
  return item.display_name.split(",").slice(0, 3).join(",").trim();
}

export const geoRoutes = new Hono();

/** Approximate client location via public IP (Electrobun / desktop fallback). */
geoRoutes.get("/approx", async (c) => {
  try {
    const location = await fromGeoJs().catch(() => fromIpWho());
    return c.json(location);
  } catch (err) {
    console.error("geo/approx failed", err);
    return c.json({ error: "Could not resolve approximate location" }, 502);
  }
});

/**
 * Place search — proxied so browser/tunnel clients aren't blocked by Nominatim CORS.
 * Optional nearLat/nearLng bias results toward the vehicle.
 */
geoRoutes.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) {
    return c.json({ results: [] });
  }

  const nearLat = Number(c.req.query("nearLat"));
  const nearLng = Number(c.req.query("nearLng"));
  const hasNear = Number.isFinite(nearLat) && Number.isFinite(nearLng);

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "8");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("dedupe", "1");

    if (hasNear) {
      const pad = 0.45; // ~50km box — soft bias, not hard bound
      url.searchParams.set(
        "viewbox",
        `${nearLng - pad},${nearLat + pad},${nearLng + pad},${nearLat - pad}`,
      );
      url.searchParams.set("bounded", "0");
    }

    const data = (await fetchJson(url.toString())) as NominatimResult[];

    const results = data
      .map((item) => ({
        name: formatPlaceName(item),
        location: {
          lat: Number(item.lat),
          lng: Number(item.lon),
        },
        importance: item.importance ?? 0,
      }))
      .filter(
        (r) =>
          Number.isFinite(r.location.lat) && Number.isFinite(r.location.lng),
      )
      .sort((a, b) => b.importance - a.importance)
      .map(({ name, location }) => ({ name, location }));

    return c.json({ results });
  } catch (err) {
    console.error("geo/search failed", err);
    return c.json({ error: "Place search failed" }, 502);
  }
});

/** Driving route via OSRM — same-origin for HTTPS tunnel clients. */
geoRoutes.get("/route", async (c) => {
  const fromLat = Number(c.req.query("fromLat"));
  const fromLng = Number(c.req.query("fromLng"));
  const toLat = Number(c.req.query("toLat"));
  const toLng = Number(c.req.query("toLng"));

  if (
    ![fromLat, fromLng, toLat, toLng].every((n) => Number.isFinite(n))
  ) {
    return c.json({ error: "Invalid coordinates" }, 400);
  }

  try {
    const path = `${fromLng},${fromLat};${toLng},${toLat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;
    const data = (await fetchJson(url)) as {
      code: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }>;
    };

    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) {
      return c.json({ error: "No driving route found" }, 404);
    }

    return c.json({
      distanceM: route.distance,
      durationSec: route.duration,
      coordinates: route.geometry.coordinates.map(([lng, lat]) => ({
        lat,
        lng,
      })),
    });
  } catch (err) {
    console.error("geo/route failed", err);
    return c.json({ error: "Routing failed" }, 502);
  }
});
