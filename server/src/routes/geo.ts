import { Hono } from "hono";

type ApproxLocation = {
  lat: number;
  lng: number;
  accuracyM: number;
  city: string | null;
  source: "ip";
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
 */
geoRoutes.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) {
    return c.json({ results: [] });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "6");
    url.searchParams.set("addressdetails", "0");

    const data = (await fetchJson(url.toString())) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;

    return c.json({
      results: data.map((item) => ({
        name: item.display_name.split(",").slice(0, 3).join(",").trim(),
        location: {
          lat: Number(item.lat),
          lng: Number(item.lon),
        },
      })),
    });
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
