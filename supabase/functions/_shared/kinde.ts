const DEFAULT_CORS_ORIGINS = [
  "https://rateware.vercel.app",
  "https://rates.heymarksman.com",
  "http://127.0.0.1:3000",
  "http://localhost:3000"
];
const configuredCorsOrigins = [
  Deno.env.get("RATEWARE_CORS_ORIGINS") || Deno.env.get("RATEWARE_CORS_ORIGIN") || DEFAULT_CORS_ORIGINS.join(","),
  Deno.env.get("RATEWARE_CORS_EXTRA_ORIGINS") || ""
]
  .join(",")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => /^https?:\/\/[^\s,]+$/i.test(origin));
const CORS_ORIGINS = new Set(configuredCorsOrigins.length ? configuredCorsOrigins : DEFAULT_CORS_ORIGINS);
const FALLBACK_CORS_ORIGIN = configuredCorsOrigins[0] || DEFAULT_CORS_ORIGINS[0];

export function corsHeaders(request?: Request) {
  const requestOrigin = request?.headers.get("Origin")?.trim() || "";
  const responseOrigin = requestOrigin && CORS_ORIGINS.has(requestOrigin)
    ? requestOrigin
    : FALLBACK_CORS_ORIGIN;

  return {
    // Keep the API browser-accessible only from the Rateware deployment. Local
    // development can override this with RATEWARE_CORS_ORIGIN without changing
    // the function code or weakening production defaults.
    "Access-Control-Allow-Origin": responseOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400"
  };
}

export function jsonResponse(body: unknown, status = 200, request?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      // Dynamic API and token-backed responses must never be replayed from a
      // browser, CDN, or intermediary cache after a workspace changes state.
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache"
    }
  });
}
