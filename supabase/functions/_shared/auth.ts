const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

function bearerToken(request: Request) {
  return (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
}

async function requireSupabaseUser(token: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase Auth is not configured for Rateware.");
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Supabase bearer token is invalid.");
  const user = await response.json() as Record<string, unknown>;
  const appMetadata = user.app_metadata && typeof user.app_metadata === "object"
    ? user.app_metadata as Record<string, unknown>
    : {};
  return {
    sub: user.id,
    email: user.email,
    auth_provider: "supabase",
    organization_id: appMetadata.rateware_organization_id || appMetadata.organization_id
  };
}

export async function requireRatewareUser(request: Request) {
  const token = bearerToken(request);
  if (!token) throw new Error("Bearer token is required.");
  return requireSupabaseUser(token);
}
