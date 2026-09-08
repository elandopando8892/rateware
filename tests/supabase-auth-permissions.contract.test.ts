import { requireCarrierTemplateManagePermission } from "../supabase/functions/rateware-api/carrier-list-templates.ts";

Deno.test("verified Supabase metadata alone grants carrier template permissions", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = Deno.env.get("SUPABASE_URL");
  const originalKey = Deno.env.get("SUPABASE_ANON_KEY");
  Deno.env.set("SUPABASE_URL", "https://auth-test.invalid");
  Deno.env.set("SUPABASE_ANON_KEY", "test-only");
  try {
    const { requireRatewareUser } = await import("../supabase/functions/_shared/auth.ts");
    let authCalls = 0;
    let authStatus = 200;
    let metadata: unknown = { permissions: [" vendors:manage ", 42, null] };
    globalThis.fetch = async (input, init) => {
      authCalls++;
      if (String(input) !== "https://auth-test.invalid/auth/v1/user" ||
        new Headers(init?.headers).get("Authorization") !== "Bearer test-token") {
        throw new Error("Unexpected verification request");
      }
      return new Response(JSON.stringify({
        id: "verified-user", email: "test@example.invalid", app_metadata: metadata,
        user_metadata: { permissions: ["vendors:manage"], organization_id: "attacker" },
        permissions: ["vendors:manage"],
      }), { status: authStatus });
    };
    const request = new Request("https://api-test.invalid", {
      headers: { Authorization: "Bearer test-token" },
    });
    const claims = await requireRatewareUser(request);
    requireCarrierTemplateManagePermission(claims);
    if (JSON.stringify(claims.permissions) !== '["vendors:manage"]') {
      throw new Error("Malformed permission entries were not removed");
    }
    for (metadata of [{}, null, { permissions: "vendors:manage" }, { permissions: [42, {}] }]) {
      const denied = await requireRatewareUser(request);
      if (denied.organization_id) throw new Error("Editable organization was trusted");
      let rejected = false;
      try { requireCarrierTemplateManagePermission(denied); } catch { rejected = true; }
      if (!rejected) throw new Error("Untrusted permissions granted template management");
    }
    authStatus = 401;
    let rejected = false;
    try { await requireRatewareUser(request); } catch { rejected = true; }
    if (!rejected) throw new Error("Auth rejection was ignored");
    const before = authCalls;
    rejected = false;
    try { await requireRatewareUser(new Request("https://api-test.invalid")); } catch { rejected = true; }
    if (!rejected || authCalls !== before) throw new Error("Missing bearer was not rejected locally");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", originalUrl);
    if (originalKey === undefined) Deno.env.delete("SUPABASE_ANON_KEY");
    else Deno.env.set("SUPABASE_ANON_KEY", originalKey);
  }
});
