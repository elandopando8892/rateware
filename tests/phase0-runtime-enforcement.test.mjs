import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimeSource = readFileSync(new URL("../supabase/functions/_shared/runtime-identity.ts", import.meta.url), "utf8");

test("runtime identity supports an explicit staged rollout", () => {
  assert.match(runtimeSource, /"disabled" \| "shadow" \| "required"/);
  assert.match(runtimeSource, /RATEWARE_TENANT_ENFORCEMENT/);
  assert.match(runtimeSource, /if \(mode === "required"\) throw error/);
  assert.match(runtimeSource, /TENANT_ENFORCEMENT_SHADOW_REJECT/);
  assert.match(runtimeSource, /TENANT_ENFORCEMENT_MODE_INVALID/);
  assert.match(runtimeSource, /const mode = enforcementMode\(options\.mode\)/);
  assert.match(runtimeSource, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(runtimeSource, /request_id: crypto\.randomUUID\(\)/);
  assert.match(runtimeSource, /identity_ref: await safeCorrelationRef\(verifiedClaims\.sub\)/);
  assert.doesNotMatch(runtimeSource, /console\.warn[\s\S]{0,500}(email|token):/i);
});

test("required mode authorizes through the canonical tenant contract", () => {
  assert.match(runtimeSource, /resolveCanonicalTenant\(client, verifiedClaims\)/);
  assert.match(runtimeSource, /canonical_tenant_id: tenant\.canonicalTenantId/);
  assert.match(runtimeSource, /identity_id: tenant\.identityId/);
  assert.match(runtimeSource, /organization_id: tenant\.externalOrganizationId/);
  assert.doesNotMatch(runtimeSource, /user_metadata|raw_user_meta_data/);
});

test("all Kinde-protected runtime entrypoints use the enforcement adapter", () => {
  const entrypoints = [
    "create-raw-upload/index.ts",
    "interpret-upload/index.ts",
    "rateware-api/index.ts",
    "shipper-directory-api/index.ts",
    "sync-rateware-catalog/index.ts"
  ];
  for (const entrypoint of entrypoints) {
    const source = readFileSync(new URL(`../supabase/functions/${entrypoint}`, import.meta.url), "utf8");
    assert.match(source, /resolveRuntimeWorkspaceUser\(/, `${entrypoint} must resolve the canonical runtime identity`);
    assert.doesNotMatch(source, /resolveWorkspaceUser\(/, `${entrypoint} must not bypass runtime enforcement`);
    assert.match(source, /runtimeIdentityStatus/, `${entrypoint} must expose tenant rejection as an authorization failure`);
  }
});

test("legacy data scope remains explicit until the bounded UUID cutover", () => {
  assert.match(runtimeSource, /Existing Rateware rows remain keyed by the reconciled external organization id/);
  assert.match(runtimeSource, /organization_id: tenant\.externalOrganizationId/);
});

test("read-heavy endpoints do not restore legacy identity writes during rollout", () => {
  for (const entrypoint of ["rateware-api/index.ts", "shipper-directory-api/index.ts", "sync-rateware-catalog/index.ts"]) {
    const source = readFileSync(new URL(`../supabase/functions/${entrypoint}`, import.meta.url), "utf8");
    assert.match(source, /persistLegacyIdentity: false/, `${entrypoint} must remain read-only during identity resolution`);
  }
});
