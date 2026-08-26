const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);

type GoogleJwk = JsonWebKey & { kid?: string };

let cachedJwks: { keys: GoogleJwk[]; expiresAt: number } | null = null;

function clean(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function base64UrlBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
}

function base64UrlJson(value: string) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value))) as Record<
    string,
    unknown
  >;
}

function audienceMatches(actual: unknown, expected: string) {
  if (typeof actual === "string") return actual === expected;
  return Array.isArray(actual) && actual.some((value) => value === expected);
}

async function loadGoogleJwks(force = false) {
  if (!force && cachedJwks && cachedJwks.expiresAt > Date.now()) {
    return cachedJwks.keys;
  }
  const response = await fetch(GOOGLE_JWKS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Google OIDC signing keys could not be loaded.");
  }
  const payload = await response.json() as { keys?: GoogleJwk[] };
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  if (!keys.length) throw new Error("Google OIDC signing key set is empty.");
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1]) || 3600;
  cachedJwks = {
    keys,
    expiresAt: Date.now() + Math.max(300, Math.min(maxAge, 3600)) * 1000,
  };
  return keys;
}

async function verifySignature(token: string, header: Record<string, unknown>) {
  if (header.alg !== "RS256") {
    throw new Error("Pub/Sub OIDC token must use RS256.");
  }
  const kid = clean(header.kid);
  if (!kid) throw new Error("Pub/Sub OIDC token is missing kid.");
  let keys = await loadGoogleJwks(false);
  let jwk = keys.find((key) => key.kid === kid);
  if (!jwk) {
    keys = await loadGoogleJwks(true);
    jwk = keys.find((key) => key.kid === kid);
  }
  if (!jwk) throw new Error("Pub/Sub OIDC signing key was not found.");

  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) throw new Error("Pub/Sub OIDC signature is invalid.");
}

export async function verifyProviderPubSubRequest(request: Request) {
  const expectedAudience = clean(
    Deno.env.get("PROVIDER_GMAIL_PUBSUB_AUDIENCE"),
  );
  const expectedServiceAccount = clean(
    Deno.env.get("PROVIDER_GMAIL_PUBSUB_SERVICE_ACCOUNT"),
  )?.toLowerCase();
  if (!expectedAudience || !expectedServiceAccount) {
    throw new Error("Provider Gmail Pub/Sub OIDC configuration is incomplete.");
  }

  const authorization = clean(request.headers.get("authorization"));
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    throw new Error("Pub/Sub push request is missing a Bearer token.");
  }
  const segments = token.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new Error("Pub/Sub OIDC token is malformed.");
  }

  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = base64UrlJson(segments[0]);
    claims = base64UrlJson(segments[1]);
  } catch {
    throw new Error("Pub/Sub OIDC token payload is malformed.");
  }
  await verifySignature(token, header);

  const now = Math.floor(Date.now() / 1000);
  const exp = Number(claims.exp);
  const iat = Number(claims.iat);
  if (!GOOGLE_ISSUERS.has(String(claims.iss || ""))) {
    throw new Error("Pub/Sub OIDC issuer is invalid.");
  }
  if (!audienceMatches(claims.aud, expectedAudience)) {
    throw new Error("Pub/Sub OIDC audience is invalid.");
  }
  if (!Number.isFinite(exp) || exp < now - 30) {
    throw new Error("Pub/Sub OIDC token is expired.");
  }
  if (!Number.isFinite(iat) || iat > now + 300) {
    throw new Error("Pub/Sub OIDC issued-at claim is invalid.");
  }
  const email = clean(claims.email)?.toLowerCase();
  if (email !== expectedServiceAccount) {
    throw new Error("Pub/Sub OIDC service account is invalid.");
  }
  if (!(claims.email_verified === true || claims.email_verified === "true")) {
    throw new Error("Pub/Sub OIDC service account email is not verified.");
  }

  return Object.freeze({
    audience: expectedAudience,
    serviceAccountEmail: expectedServiceAccount,
    subject: clean(claims.sub),
    expiresAt: exp,
  });
}
