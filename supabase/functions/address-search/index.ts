import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Input = {
  action?: unknown;
  query?: unknown;
  placeId?: unknown;
  sessionToken?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  language?: unknown;
};

const malaysiaBounds = { minLat: 0.8, maxLat: 7.5, minLng: 99.5, maxLng: 120 };

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get("ADDRESS_SEARCH_ALLOWED_ORIGINS") ?? Deno.env.get("LALAMOVE_ALLOWED_ORIGINS") ?? "";
  return new Set(configured.split(",").map((value) => value.trim()).filter(Boolean));
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

function response(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function isMalaysiaCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= malaysiaBounds.minLat && latitude <= malaysiaBounds.maxLat &&
    longitude >= malaysiaBounds.minLng && longitude <= malaysiaBounds.maxLng;
}

function languageCode(value: unknown): "en" | "ms" {
  return value === "ms" ? "ms" : "en";
}

function selectedAddress(displayAddress: unknown, latitude: unknown, longitude: unknown) {
  if (typeof displayAddress !== "string" || displayAddress.trim().length < 5 ||
      typeof latitude !== "number" || typeof longitude !== "number" ||
      !isMalaysiaCoordinate(latitude, longitude)) return null;
  return { display_address: displayAddress.trim(), latitude, longitude };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  if (!origin || !allowedOrigins().has(origin)) return new Response("Forbidden origin", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405, origin);

  try {
    const authClient = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) return response({ error: "Authentication required" }, 401, origin);

    const input = await req.json() as Input;
    const action = typeof input.action === "string" ? input.action : "";
    const language = languageCode(input.language);
    const apiKey = requiredEnv("GOOGLE_MAPS_API_KEY");

    if (action === "search") {
      const query = typeof input.query === "string" ? input.query.trim() : "";
      const sessionToken = typeof input.sessionToken === "string" ? input.sessionToken.trim() : "";
      if (query.length < 3 || query.length > 160 || sessionToken.length < 20 || sessionToken.length > 80) {
        return response({ error: "Invalid address search request" }, 400, origin);
      }
      const upstream = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
        },
        body: JSON.stringify({ input: query, includedRegionCodes: ["my"], regionCode: "MY", languageCode: language, sessionToken }),
        signal: AbortSignal.timeout(8_000),
      });
      const payload = await upstream.json().catch(() => null) as Record<string, unknown> | null;
      if (!upstream.ok) return response({ error: "Address suggestions are temporarily unavailable." }, 502, origin);
      const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions.flatMap((entry) => {
        const prediction = entry && typeof entry === "object" ? (entry as Record<string, unknown>).placePrediction : null;
        if (!prediction || typeof prediction !== "object") return [];
        const record = prediction as Record<string, unknown>;
        const textValue = record.text && typeof record.text === "object" ? (record.text as Record<string, unknown>).text : null;
        return typeof record.placeId === "string" && typeof textValue === "string"
          ? [{ placeId: record.placeId, displayAddress: textValue }]
          : [];
      }).slice(0, 6) : [];
      return response({ suggestions }, 200, origin);
    }

    if (action === "resolve") {
      const placeId = typeof input.placeId === "string" ? input.placeId.trim() : "";
      const sessionToken = typeof input.sessionToken === "string" ? input.sessionToken.trim() : "";
      if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId) || sessionToken.length < 20 || sessionToken.length > 80) {
        return response({ error: "Invalid selected address" }, 400, origin);
      }
      const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
      url.searchParams.set("languageCode", language);
      url.searchParams.set("regionCode", "MY");
      url.searchParams.set("sessionToken", sessionToken);
      const upstream = await fetch(url, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "formattedAddress,location" },
        signal: AbortSignal.timeout(8_000),
      });
      const payload = await upstream.json().catch(() => null) as Record<string, unknown> | null;
      const location = payload?.location as Record<string, unknown> | undefined;
      const address = selectedAddress(payload?.formattedAddress, location?.latitude, location?.longitude);
      if (!upstream.ok || !address) return response({ error: "The selected Malaysian address could not be resolved." }, 422, origin);
      return response({ address }, 200, origin);
    }

    if (action === "reverse") {
      const latitude = typeof input.latitude === "number" ? input.latitude : Number.NaN;
      const longitude = typeof input.longitude === "number" ? input.longitude : Number.NaN;
      if (!isMalaysiaCoordinate(latitude, longitude)) return response({ error: "The current location must be within Malaysia." }, 400, origin);
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("latlng", `${latitude},${longitude}`);
      url.searchParams.set("language", language);
      url.searchParams.set("region", "my");
      url.searchParams.set("key", apiKey);
      const upstream = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      const payload = await upstream.json().catch(() => null) as { status?: string; results?: Array<{ formatted_address?: unknown }> } | null;
      const address = selectedAddress(payload?.results?.[0]?.formatted_address, latitude, longitude);
      if (!upstream.ok || payload?.status !== "OK" || !address) return response({ error: "Your current Malaysian address could not be resolved." }, 422, origin);
      return response({ address }, 200, origin);
    }

    return response({ error: "Unsupported address search action" }, 400, origin);
  } catch (error) {
    console.error("address-search failed", error instanceof Error ? error.message : "Unknown error");
    return response({ error: "Address search is temporarily unavailable." }, 500, origin);
  }
});
