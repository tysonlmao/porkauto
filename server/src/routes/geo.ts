import { Hono } from "hono";
import { requireDeviceBearer } from "../middleware/auth";

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

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  // Clear timer if aborted early (fetch completes) — AbortSignal has no cleanup hook;
  // unref so it doesn't keep the process alive in tests.
  timer.unref?.();
  return controller.signal;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    signal: timeoutSignal(12_000),
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
geoRoutes.get("/search", requireDeviceBearer, async (c) => {
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

/** Common OSM maxspeed zone tags → km/h (Australia-biased defaults). */
const MAXSPEED_ZONES: Record<string, number> = {
  "AU:urban": 50,
  "AU:rural": 100,
  "AU:motorway": 110,
  "AU:living_street": 10,
  "AU:school": 40,
  "GB:nsl_single": 96,
  "GB:nsl_dual": 113,
  "GB:motorway": 113,
  "GB:urban": 48,
  "DE:urban": 50,
  "DE:rural": 100,
  "DE:living_street": 7,
  "US:urban": 40,
  "US:residential": 40,
  walk: 5,
  walking: 5,
  none: 999,
  signals: 50,
};

/**
 * Parse OSM maxspeed tag into km/h.
 * Handles "60", "60 km/h", "40 mph", zone tags, and "implicit" suffixes.
 */
function parseMaxspeed(raw: string): number | null {
  const tag = raw.trim();
  if (!tag) return null;

  const zone = MAXSPEED_ZONES[tag] ?? MAXSPEED_ZONES[tag.replace(/:implicit$/i, "")];
  if (zone != null) return zone === 999 ? null : zone;

  const mph = tag.match(/^(\d+(?:\.\d+)?)\s*mph$/i);
  if (mph) {
    const n = Number(mph[1]);
    return Number.isFinite(n) ? Math.round(n * 1.60934) : null;
  }

  const kmh = tag.match(/^(\d+(?:\.\d+)?)\s*(?:km\/h|kph)?$/i);
  if (kmh) {
    const n = Number(kmh[1]);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  return null;
}

type OverpassElement = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  center?: { lat: number; lon: number };
};

/** Lower score = preferred road class for speed-limit matching. */
const HIGHWAY_RANK: Record<string, number> = {
  motorway: 0,
  motorway_link: 1,
  trunk: 2,
  trunk_link: 3,
  primary: 4,
  primary_link: 5,
  secondary: 6,
  secondary_link: 7,
  tertiary: 8,
  tertiary_link: 9,
  unclassified: 10,
  residential: 11,
  living_street: 12,
  service: 13,
};

function highwayRank(highway: string | undefined): number {
  if (!highway) return 20;
  return HIGHWAY_RANK[highway] ?? 15;
}

function wayDistanceM(
  lat: number,
  lng: number,
  el: OverpassElement,
): number {
  const pts = el.geometry;
  if (pts?.length) {
    let best = Infinity;
    for (const p of pts) {
      const dLat = ((p.lat - lat) * Math.PI) / 180;
      const dLng = ((p.lon - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((p.lat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const d = 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
      if (d < best) best = d;
    }
    return best;
  }
  const c = el.center;
  if (c) {
    const dLat = ((c.lat - lat) * Math.PI) / 180;
    const dLng = ((c.lon - lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((c.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return Infinity;
}

type SpeedLimitCacheEntry = {
  speedLimitKmh: number | null;
  fetchedAt: number;
};

/** ~50 m grid cells; TTL 8 minutes. */
const SPEED_LIMIT_CACHE = new Map<string, SpeedLimitCacheEntry>();
const SPEED_LIMIT_CACHE_TTL_MS = 8 * 60_000;

function speedLimitCacheKey(lat: number, lng: number): string {
  const cell = 0.00045; // ~50 m
  return `${Math.round(lat / cell)}:${Math.round(lng / cell)}`;
}

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function queryOverpass(
  endpoint: string,
  query: string,
): Promise<OverpassElement[]> {
  const response = await fetch(endpoint, {
    method: "POST",
    signal: timeoutSignal(10_000),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": UA,
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  const status = Number(
    (response as unknown as { status?: number }).status ?? 0,
  );
  if (status < 200 || status >= 300) {
    throw new Error(`Overpass HTTP ${status || "error"}`);
  }

  const text = await (
    response as unknown as { text: () => Promise<string> }
  ).text();
  const data = JSON.parse(text) as { elements?: OverpassElement[] };
  return data.elements ?? [];
}

function pickBestSpeedLimit(
  lat: number,
  lng: number,
  elements: OverpassElement[],
): number | null {
  let best: { kmh: number; dist: number; rank: number } | null = null;
  for (const el of elements) {
    const raw = el.tags?.maxspeed;
    if (!raw) continue;
    const kmh = parseMaxspeed(raw);
    if (kmh == null || kmh <= 0) continue;
    const dist = wayDistanceM(lat, lng, el);
    const rank = highwayRank(el.tags?.highway);
    if (
      !best ||
      dist < best.dist - 8 ||
      (Math.abs(dist - best.dist) <= 8 && rank < best.rank)
    ) {
      best = { kmh, dist, rank };
    }
  }
  return best?.kmh ?? null;
}

/** Live speed limit near a point via Overpass (OSM maxspeed). */
geoRoutes.get("/speed-limit", requireDeviceBearer, async (c) => {
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return c.json({ error: "Invalid coordinates" }, 400);
  }

  const cacheKey = speedLimitCacheKey(lat, lng);
  const cached = SPEED_LIMIT_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SPEED_LIMIT_CACHE_TTL_MS) {
    return c.json({
      speedLimitKmh: cached.speedLimitKmh,
      fetchedAt: cached.fetchedAt,
    });
  }

  const radiusM = 45;
  const query = `
[out:json][timeout:8];
way(around:${radiusM},${lat},${lng})[highway][maxspeed];
out geom;
`.trim();

  try {
    let elements: OverpassElement[] | null = null;
    let lastError: unknown = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        elements = await queryOverpass(endpoint, query);
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!elements) {
      throw lastError ?? new Error("Overpass unavailable");
    }

    const speedLimitKmh = pickBestSpeedLimit(lat, lng, elements);
    const fetchedAt = Date.now();
    SPEED_LIMIT_CACHE.set(cacheKey, { speedLimitKmh, fetchedAt });

    return c.json({ speedLimitKmh, fetchedAt });
  } catch (err) {
    console.error("geo/speed-limit failed", err);
    return c.json({ error: "Speed limit lookup failed" }, 502);
  }
});

type OsrmStep = {
  distance: number;
  duration: number;
  name?: string;
  maneuver?: {
    type?: string;
    modifier?: string;
    location?: [number, number];
    bearing_after?: number;
  };
};

function formatOsrmInstruction(step: OsrmStep): string {
  const type = step.maneuver?.type ?? "continue";
  const modifier = step.maneuver?.modifier;
  const road = step.name?.trim();
  const onto = road ? ` onto ${road}` : "";

  switch (type) {
    case "depart":
      return road ? `Head toward ${road}` : "Depart";
    case "arrive":
      return "Arrive at destination";
    case "turn":
      return `Turn ${modifier ?? "ahead"}${onto}`;
    case "new name":
      return road ? `Continue on ${road}` : "Continue";
    case "merge":
      return `Merge ${modifier ?? ""}${onto}`.replace(/\s+/g, " ").trim();
    case "on ramp":
      return `Take the ramp${onto}`;
    case "off ramp":
      return `Take the exit${modifier ? ` ${modifier}` : ""}${onto}`;
    case "fork":
      return `Keep ${modifier ?? "straight"} at the fork${onto}`;
    case "end of road":
      return `At end of road, turn ${modifier ?? "ahead"}${onto}`;
    case "continue":
      return modifier && modifier !== "straight"
        ? `Continue ${modifier}${onto}`
        : road
          ? `Continue on ${road}`
          : "Continue";
    case "roundabout":
    case "rotary":
      return `Enter the roundabout${onto}`;
    case "exit roundabout":
    case "exit rotary":
      return `Exit the roundabout${onto}`;
    case "notification":
      return road ? `Continue on ${road}` : "Continue";
    default:
      return modifier
        ? `${type.replace(/_/g, " ")} ${modifier}${onto}`
        : `${type.replace(/_/g, " ")}${onto}`;
  }
}

/** Driving route via OSRM — same-origin for HTTPS tunnel clients. */
geoRoutes.get("/route", requireDeviceBearer, async (c) => {
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
    const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson&steps=true`;
    const data = (await fetchJson(url)) as {
      code: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
        legs?: Array<{ steps?: OsrmStep[] }>;
      }>;
    };

    const route = data.routes?.[0];
    if (data.code !== "Ok" || !route) {
      return c.json({ error: "No driving route found" }, 404);
    }

    const steps = (route.legs ?? [])
      .flatMap((leg) => leg.steps ?? [])
      .filter((step) => step.maneuver?.type !== "notification")
      .map((step) => {
        const loc = step.maneuver?.location;
        return {
          instruction: formatOsrmInstruction(step),
          distanceM: step.distance,
          durationSec: step.duration,
          location: {
            lat: loc?.[1] ?? fromLat,
            lng: loc?.[0] ?? fromLng,
          },
          type: step.maneuver?.type ?? "continue",
          modifier: step.maneuver?.modifier,
        };
      });

    return c.json({
      distanceM: route.distance,
      durationSec: route.duration,
      coordinates: route.geometry.coordinates.map(([lng, lat]) => ({
        lat,
        lng,
      })),
      steps,
    });
  } catch (err) {
    console.error("geo/route failed", err);
    return c.json({ error: "Routing failed" }, 502);
  }
});
