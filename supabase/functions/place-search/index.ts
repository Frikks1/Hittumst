import { createClient } from "npm:@supabase/supabase-js@2.57.4";

import { handleOptions, jsonResponse } from "../_shared/http.ts";

interface SearchRequest {
  query?: unknown;
  coordinate?: unknown;
  locale?: unknown;
  limit?: unknown;
}

interface MapTilerFeature {
  id?: unknown;
  text?: unknown;
  place_name?: unknown;
  center?: unknown;
  bbox?: unknown;
  place_type?: unknown;
  properties?: { country_code?: unknown };
  context?: Array<{ id?: unknown; short_code?: unknown; text?: unknown }>;
}

type Coordinate = { latitude: number; longitude: number };

const ICELAND_BOUNDS = {
  west: -24.8,
  south: 63.2,
  east: -13.2,
  north: 66.7,
} as const;

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function publishableKey() {
  const modern = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modern) {
    const keys = JSON.parse(modern) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  return requiredEnv("SUPABASE_ANON_KEY");
}

function numberPair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null;
}

function isIcelandPoint([longitude, latitude]: [number, number]) {
  return longitude >= ICELAND_BOUNDS.west && longitude <= ICELAND_BOUNDS.east &&
    latitude >= ICELAND_BOUNDS.south && latitude <= ICELAND_BOUNDS.north;
}

function isIcelandFeature(feature: MapTilerFeature, center: [number, number]) {
  const code = typeof feature.properties?.country_code === "string"
    ? feature.properties.country_code.toLowerCase()
    : "";
  const contextCode = feature.context?.some((item) =>
    typeof item.short_code === "string" &&
    item.short_code.toLowerCase().startsWith("is")
  );
  return isIcelandPoint(center) && (code === "is" || contextCode === true);
}

function coordinate(value: unknown): Coordinate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const pair: [number, number] = [longitude, latitude];
  return isIcelandPoint(pair) ? { latitude, longitude } : null;
}

function normalizedPlaceText(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function generalAreaId(value: string) {
  const normalized = normalizedPlaceText(value);
  const areas = [
    ["vesturbaer", "vesturbaer"],
    ["reykjavik", "reykjavik"],
    ["kopavogur", "kopavogur"],
    ["hafnarfjordur", "hafnarfjordur"],
    ["keflavik", "keflavik"],
    ["borgarnes", "borgarnes"],
    ["isafjordur", "isafjordur"],
    ["saudarkrokur", "saudarkrokur"],
    ["akureyri", "akureyri"],
    ["egilsstadir", "egilsstadir"],
    ["selfoss", "selfoss"],
    ["vestmannaeyjar", "vestmannaeyjar"],
  ] as const;
  return areas.find(([label]) => normalized.includes(label))?.[1];
}

function placeKind(feature: MapTilerFeature) {
  const raw = Array.isArray(feature.place_type) &&
      typeof feature.place_type[0] === "string"
    ? feature.place_type[0]
    : "other";
  if (raw === "poi") return "venue";
  if (raw === "address") return "address";
  if (raw === "neighbourhood") return "neighbourhood";
  if (
    ["locality", "place", "municipality", "municipal_district"].includes(raw)
  ) {
    return "locality";
  }
  if (raw === "road") return "road";
  if (["region", "subregion", "county"].includes(raw)) return "region";
  return "other";
}

async function placeSearch(request: Request) {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }

  const supabase = createClient(requiredEnv("SUPABASE_URL"), publishableKey(), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || authData.user.is_anonymous) {
    return jsonResponse({ error: "Authentication required" }, 401);
  }
  const { data: canCreate, error: eligibilityError } = await supabase.rpc(
    "can_create_meetup",
  );
  if (eligibilityError || canCreate !== true) {
    return jsonResponse({ error: "Meetup account eligibility required" }, 403);
  }

  let body: SearchRequest;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    body = parsed as SearchRequest;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const reverseCoordinate = coordinate(body.coordinate);
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!reverseCoordinate && (query.length < 2 || query.length > 120)) {
    return jsonResponse({ error: "Search must contain 2–120 characters" }, 400);
  }
  if (body.coordinate !== undefined && !reverseCoordinate) {
    return jsonResponse({ error: "Coordinate must be within Iceland" }, 400);
  }
  const locale = body.locale === "en" ? "en" : "is";
  const limit = Math.min(
    8,
    Math.max(
      1,
      Number.isInteger(body.limit)
        ? Number(body.limit)
        : reverseCoordinate
        ? 1
        : 6,
    ),
  );

  // Validate deployment settings before spending a member's search quota.
  const providerKey = requiredEnv("MAPTILER_SERVER_API_KEY");
  const providerBase = new URL(
    Deno.env.get("MAPTILER_GEOCODING_BASE_URL") ?? "https://api.maptiler.eu",
  );
  if (providerBase.protocol !== "https:" || providerBase.username || providerBase.password) {
    return jsonResponse({ error: "Place search is temporarily unavailable" }, 503);
  }

  // Count only well-formed searches, immediately before contacting the paid
  // provider. The authenticated RPC also re-checks the rollout flag and host
  // eligibility and enforces the rolling per-member quota atomically.
  const { data: quotaAccepted, error: quotaError } = await supabase.rpc(
    "consume_meetup_place_search_quota",
  );
  if (quotaError) {
    if (
      quotaError.code === "54000" ||
      quotaError.message.includes("meetup_place_search_rate_limit_exceeded")
    ) {
      return jsonResponse({ error: "Place search rate limit exceeded" }, 429);
    }
    return jsonResponse(
      { error: "Place search is temporarily unavailable" },
      503,
    );
  }
  if (quotaAccepted !== true) {
    return jsonResponse({ error: "Place search rate limit exceeded" }, 429);
  }

  const providerQuery = reverseCoordinate
    ? `${reverseCoordinate.longitude},${reverseCoordinate.latitude}`
    : query;

  const endpoint = new URL(
    `/geocoding/${encodeURIComponent(providerQuery)}.json`,
    providerBase,
  );
  endpoint.searchParams.set("key", providerKey);
  endpoint.searchParams.set("country", "is");
  endpoint.searchParams.set("language", locale === "is" ? "is,en" : "en,is");
  endpoint.searchParams.set(
    "autocomplete",
    reverseCoordinate ? "false" : "true",
  );
  endpoint.searchParams.set("limit", String(reverseCoordinate ? 1 : limit));
  if (!reverseCoordinate) {
    endpoint.searchParams.set(
      "bbox",
      [
        ICELAND_BOUNDS.west,
        ICELAND_BOUNDS.south,
        ICELAND_BOUNDS.east,
        ICELAND_BOUNDS.north,
      ].join(","),
    );
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      redirect: "error",
      headers: {
        Accept: "application/json",
        "User-Agent": "Rummal-Hittingar/1.0",
      },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return jsonResponse(
      { error: "Place search is temporarily unavailable" },
      503,
    );
  }
  if (!response.ok) {
    return jsonResponse(
      { error: "Place search is temporarily unavailable" },
      502,
    );
  }

  let features: unknown[];
  try {
    const payload = await response.json() as { features?: unknown } | null;
    if (!Array.isArray(payload?.features)) throw new Error("Invalid provider response");
    features = payload.features;
  } catch {
    return jsonResponse({ error: "Place search is temporarily unavailable" }, 502);
  }
  const places = features.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const raw = candidate as MapTilerFeature;
    const feature: MapTilerFeature = { ...raw, context: Array.isArray(raw.context)
      ? raw.context.filter((item) => item && typeof item === "object") : [] };
    const center = numberPair(feature.center);
    if (!center || !isIcelandFeature(feature, center)) return [];
    const [longitude, latitude] = center;
    const name = typeof feature.text === "string"
      ? feature.text.trim()
      : typeof feature.place_name === "string"
      ? feature.place_name.trim()
      : "";
    if (!name) return [];
    const fullAddress = typeof feature.place_name === "string"
      ? feature.place_name.trim()
      : "";
    const areaContext = feature.context?.find((item) =>
      typeof item.id === "string" &&
      /^(neighbourhood|locality|place|municipality)\./.test(item.id)
    );
    const generalArea = typeof areaContext?.text === "string"
      ? areaContext.text.trim()
      : fullAddress.split(",").slice(-2, -1)[0]?.trim() || name;
    const areaId = generalAreaId(`${generalArea} ${fullAddress}`);
    return [{
      id: `maptiler:${longitude.toFixed(6)}:${latitude.toFixed(6)}`,
      provider: "maptiler",
      name,
      ...(fullAddress ? { fullAddress } : {}),
      generalArea,
      ...(areaId ? { generalAreaId: areaId } : {}),
      kind: placeKind(feature),
      coordinate: { latitude, longitude },
    }];
  }).slice(0, reverseCoordinate ? 1 : limit);

  return jsonResponse({ places });
}

Deno.serve(async (request) => {
  try {
    return await placeSearch(request);
  } catch {
    // Configuration/Auth/RPC failures must not leak credentials or provider details.
    return jsonResponse({ error: "Place search is temporarily unavailable" }, 503);
  }
});
