import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";

const KINDE_DOMAIN = Deno.env.get("KINDE_DOMAIN");
const KINDE_AUDIENCE = Deno.env.get("KINDE_AUDIENCE") || undefined;
const DEFAULT_CORS_ORIGINS = [
  "https://rateware.vercel.app",
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

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

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

export async function requireKindeUser(request: Request) {
  if (!KINDE_DOMAIN) throw new Error("KINDE_DOMAIN secret is not configured.");

  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Kinde bearer token is required.");

  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${KINDE_DOMAIN.replace(/\/$/, "")}/.well-known/jwks.json`));
  }

  const verifyOptions: Parameters<typeof jwtVerify>[2] = {
    issuer: KINDE_DOMAIN.replace(/\/$/, "")
  };

  if (KINDE_AUDIENCE) {
    verifyOptions.audience = KINDE_AUDIENCE;
  }

  const { payload } = await jwtVerify(token, jwks, verifyOptions);
  return payload;
}
