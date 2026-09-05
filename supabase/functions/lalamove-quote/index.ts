import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const quotationPath = "/v3/quotations";
type QuoteRequest = { deliveryAddress?: unknown; deliveryLatitude?: unknown; deliveryLongitude?: unknown; requestedDate?: unknown; requestedTime?: unknown };

function allowedOrigins(): Set<string> {
  return new Set((Deno.env.get("LALAMOVE_ALLOWED_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean));
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

function finiteCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scheduleAtUtc(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const parsed = new Date(`${date}T${time}:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") ?? "";
  if (!origin || !allowedOrigins().has(origin)) return new Response("Forbidden origin", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405, origin);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const authClient = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) return response({ error: "Authentication required" }, 401, origin);

    const input = await req.json() as QuoteRequest;
    const address = typeof input.deliveryAddress === "string" ? input.deliveryAddress.trim() : "";
    const latitude = finiteCoordinate(input.deliveryLatitude);
    const longitude = finiteCoordinate(input.deliveryLongitude);
    const requestedDate = typeof input.requestedDate === "string" ? input.requestedDate : "";
    const requestedTime = typeof input.requestedTime === "string" ? input.requestedTime : "";
    const scheduleAt = scheduleAtUtc(requestedDate, requestedTime);
    if (address.length < 8 || address.length > 300 || latitude === null || longitude === null || !scheduleAt) {
      return response({ error: "A valid selected delivery address, coordinates, date and time are required." }, 400, origin);
    }
    const scheduledTime = new Date(scheduleAt).getTime();
    if (scheduledTime <= Date.now() || scheduledTime > Date.now() + 30 * 24 * 60 * 60 * 1000) {
      return response({ error: "The requested pickup time must be in the future and within 30 days." }, 400, origin);
    }
    if (latitude < 0.8 || latitude > 7.5 || longitude < 99.5 || longitude > 120) {
      return response({ error: "The delivery location must be within Malaysia." }, 400, origin);
    }

    const environment = (Deno.env.get("LALAMOVE_ENV") ?? "sandbox").trim().toLowerCase();
    if (environment !== "sandbox" && environment !== "production") throw new Error("Invalid LALAMOVE_ENV");
    if (environment === "production" && Deno.env.get("LALAMOVE_PRODUCTION_QUOTES_ENABLED") !== "true") {
      throw new Error("Production quotations are not enabled");
    }

    const apiKey = requiredEnv("LALAMOVE_API_KEY");
    const apiSecret = requiredEnv("LALAMOVE_API_SECRET");
    const serviceType = requiredEnv("LALAMOVE_SERVICE_TYPE");
    const pickupAddress = requiredEnv("LALAMOVE_PICKUP_ADDRESS");
    const pickupLatitude = Number(requiredEnv("LALAMOVE_PICKUP_LAT"));
    const pickupLongitude = Number(requiredEnv("LALAMOVE_PICKUP_LNG"));
    if (
      !Number.isFinite(pickupLatitude) || !Number.isFinite(pickupLongitude) ||
      pickupLatitude < 0.8 || pickupLatitude > 7.5 || pickupLongitude < 99.5 || pickupLongitude > 120
    ) throw new Error("Invalid pickup coordinates");

    const body = JSON.stringify({ data: {
      scheduleAt,
      serviceType,
      language: "ms_MY",
      stops: [
{ coordinates: { lat: pickupLatitude.toFixed(6), lng: pickupLongitude.toFixed(6) }, address: pickupAddress },
{ coordinates: { lat: latitude.toFixed(6), lng: longitude.toFixed(6) }, address },
      ],
    } });
    const timestamp = Date.now().toString();
    const rawSignature = `${timestamp}\r\nPOST\r\n${quotationPath}\r\n\r\n${body}`;
    const signature = await hmacSha256Hex(apiSecret, rawSignature);
    const baseUrl = environment === "production" ? "https://rest.lalamove.com" : "https://rest.sandbox.lalamove.com";
    const upstream = await fetch(`${baseUrl}${quotationPath}`, {
      method: "POST",
      headers: {
        "Authorization": `hmac ${apiKey}:${timestamp}:${signature}`,
        "Content-Type": "application/json",
        "Market": "MY",
        "Request-ID": crypto.randomUUID(),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await upstream.json().catch(() => null) as Record<string, unknown> | null;

    if (!upstream.ok) {
  console.error("Lalamove quotation rejected", {
    status: upstream.status,
  });

  const upstreamMessage =
    payload && typeof payload.message === "string"
      ? payload.message
      : "Lalamove quotation is currently unavailable.";

  return response(
    { error: upstreamMessage },
    upstream.status >= 400 && upstream.status < 500 ? 422 : 502,
    origin,
  );
}
    const data = payload?.data as Record<string, unknown> | undefined;
    const price = data?.priceBreakdown as Record<string, unknown> | undefined;
    if (typeof data?.quotationId !== "string" || typeof data.expiresAt !== "string" || typeof price?.total !== "string" || typeof price.currency !== "string") {
      return response({ error: "Lalamove returned an incomplete quotation." }, 502, origin);
    }
    return response({ quotationId: data.quotationId, quotedFee: price.total, currency: price.currency, expiresAt: data.expiresAt }, 200, origin);
  } catch (error) {
    console.error("lalamove-quote failed", error);
    const message = error instanceof Error && error.name === "TimeoutError" ? "Lalamove quotation timed out. Please try again." : "Lalamove quotation is currently unavailable.";
    return response({ error: message }, 500, origin);
  }
});
