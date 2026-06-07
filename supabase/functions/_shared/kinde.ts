import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";

const KINDE_DOMAIN = Deno.env.get("KINDE_DOMAIN");
const KINDE_AUDIENCE = Deno.env.get("KINDE_AUDIENCE") || undefined;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
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
