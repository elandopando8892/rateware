// Recovered from production 2026-08-18. Deployed to rateware-prod on 2026-08-16
// (version 1) without a source commit; reconstructed verbatim from the deployed
// bundle so the repository is the source of truth again.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY") || "";
const KINDE_DOMAIN = (Deno.env.get("KINDE_DOMAIN") || "").replace(/\/$/, "");
const KINDE_AUDIENCE = Deno.env.get("KINDE_AUDIENCE") || undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_ORIGINS = ["https://rateware.vercel.app", "http://127.0.0.1:3000", "http://localhost:3000"];
const configuredOrigins = (Deno.env.get("RATEWARE_CORS_ORIGINS") || DEFAULT_ORIGINS.join(","))
  .split(",").map((value) => value.trim()).filter((value) => /^https?:\/\/[^\s,]+$/i.test(value));
const ALLOWED_ORIGINS = new Set(configuredOrigins.length ? configuredOrigins : DEFAULT_ORIGINS);
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function headers(request: Request) {
  const origin = request.headers.get("Origin")?.trim() || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : (configuredOrigins[0] || DEFAULT_ORIGINS[0]),
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}

function response(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(request) });
}

function claim(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

async function authenticate(request: Request) {
  if (!KINDE_DOMAIN) throw new Error("auth_configuration_missing");
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("authorization_required");
  if (!jwks) jwks = createRemoteJWKSet(new URL(`${KINDE_DOMAIN}/.well-known/jwks.json`));
  const options: Parameters<typeof jwtVerify>[2] = { issuer: KINDE_DOMAIN };
  if (KINDE_AUDIENCE) options.audience = KINDE_AUDIENCE;
  const { payload } = await jwtVerify(token, jwks, options);
  const subject = claim(payload.sub);
  const email = claim(payload.email || payload.preferred_email || payload["https://kinde.com/email"])?.toLowerCase() || null;
  if (!subject && !email) throw new Error("identity_missing");
  return { subject, email };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(request) });
  if (request.method !== "POST") return response(request, { ok: false, error: "method_not_allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return response(request, { ok: false, error: "service_configuration_missing" }, 500);
    const actor = await authenticate(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const packageId = claim(body.package_id || body.packageId);
    const action = claim(body.action) || "get_manifest";
    if (!packageId || !UUID.test(packageId)) return response(request, { ok: false, error: "invalid_package_id" }, 400);
    if (!new Set(["get_manifest", "get_download_url"]).has(action)) {
      return response(request, { ok: false, error: "unsupported_action" }, 400);
    }

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const packageResult = await client.from("provider_onboarding_release_packages")
      .select("id,organization_id,case_id,package_version,package_status,revision,purpose_code,recipient_key,manifest_sha256,approved_at,expires_at,revoked_at,metadata")
      .eq("id", packageId).maybeSingle();
    if (packageResult.error) throw packageResult.error;
    const pkg = packageResult.data as Record<string, any> | null;
    if (!pkg) return response(request, { ok: false, error: "package_not_found" }, 404);

    const identityKeys = [actor.subject, actor.email].filter(Boolean) as string[];
    const membership = await client.from("workspace_identity_aliases")
      .select("organization_id")
      .eq("organization_id", pkg.organization_id)
      .in("identity_key", identityKeys)
      .limit(1);
    if (membership.error) throw membership.error;
    if (!membership.data?.length) return response(request, { ok: false, error: "forbidden" }, 403);

    const metadata = (pkg.metadata || {}) as Record<string, unknown>;
    const expiresAt = pkg.expires_at ? Date.parse(pkg.expires_at) : 0;
    const accessible = pkg.package_status === "approved"
      && !pkg.revoked_at
      && expiresAt > Date.now()
      && metadata.release_enabled === true
      && metadata.release_authorization_granted === true
      && metadata.protected_retrieval_enabled === true
      && metadata.outbound_enabled !== true;
    if (!accessible) return response(request, { ok: false, error: "package_not_available" }, 409);

    const itemsResult = await client.from("provider_onboarding_release_package_items")
      .select("id,item_key,item_kind,source_document_asset_id,disclosure_mode,sensitivity,evidence_sha256,included_at")
      .eq("organization_id", pkg.organization_id)
      .eq("package_id", pkg.id)
      .order("included_at", { ascending: true });
    if (itemsResult.error) throw itemsResult.error;
    const items = itemsResult.data || [];

    if (action === "get_download_url") {
      const itemId = claim(body.item_id || body.itemId);
      const item = items.find((candidate: any) => candidate.id === itemId);
      if (!item) return response(request, { ok: false, error: "item_not_found" }, 404);
      if (item.disclosure_mode === "reference_only") {
        return response(request, { ok: false, error: "item_reference_only" }, 403);
      }
      return response(request, { ok: false, error: "download_not_implemented_for_disclosure_mode" }, 501);
    }

    return response(request, {
      ok: true,
      package: {
        id: pkg.id, case_id: pkg.case_id, package_version: pkg.package_version,
        status: pkg.package_status, revision: pkg.revision, purpose_code: pkg.purpose_code,
        recipient_key: pkg.recipient_key, manifest_sha256: pkg.manifest_sha256,
        approved_at: pkg.approved_at, expires_at: pkg.expires_at,
        release_mode: metadata.release_mode, release_scope: metadata.release_scope,
      },
      items: items.map((item: any) => ({
        id: item.id, item_key: item.item_key, item_kind: item.item_kind,
        disclosure_mode: item.disclosure_mode, sensitivity: item.sensitivity,
        evidence_sha256: item.evidence_sha256, included_at: item.included_at,
        downloadable: item.disclosure_mode !== "reference_only",
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const status = ["authorization_required", "identity_missing"].includes(message) ? 401 : 500;
    console.error("PROVIDER_RELEASE_PACKAGE_API_ERROR", { request_id: crypto.randomUUID(), code: message });
    return response(request, { ok: false, error: status === 401 ? message : "internal_error" }, status);
  }
});
