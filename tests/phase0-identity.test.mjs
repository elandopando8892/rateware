import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  IdentityContractError,
  normalizeVerifiedKindeIdentity,
  normalizeVerifiedIdentity,
  resolveCanonicalTenant
} from "../supabase/functions/_shared/identity-contract.mjs";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const IDENTITY_ID = "22222222-2222-4222-8222-222222222222";

function claims(overrides = {}) {
  return { auth_provider: "supabase", sub: "kp_subject", org_code: "org_verified", email: "USER@EXAMPLE.COM", ...overrides };
}

function fakeClient(rowsByTable) {
  const reads = [];
  const defaults = {
    external_identities: { provider: "supabase", external_subject: "kp_subject" },
    external_organization_links: { provider: "supabase", external_organization_id: "org_verified" },
    workspace_registry: { organization_id: "org_verified" }
  };
  return {
    reads,
    from(table) {
      const filters = [];
      const builder = {
        select() { return builder; },
        eq(column, value) { filters.push([column, value]); return builder; },
        async limit() {
          reads.push({ table, filters });
          const rows = (rowsByTable[table] || []).map((row) => ({ ...defaults[table], ...row }));
          return {
            data: rows.filter((row) => filters.every(([column, value]) => row[column] === value)),
            error: null
          };
        }
      };
      return builder;
    }
  };
}

function errorCode(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    assert.ok(error instanceof IdentityContractError);
    return error.code;
  }
}

test("normalizes only verified subject and one organization", () => {
  assert.deepEqual(normalizeVerifiedKindeIdentity(claims()), {
    provider: "kinde",
    externalSubject: "kp_subject",
    externalOrganizationId: "org_verified",
    email: "user@example.com"
  });
  assert.equal(errorCode(() => normalizeVerifiedKindeIdentity(claims({ sub: "", id: "fallback" }))), "IDENTITY_SUBJECT_REQUIRED");
  assert.equal(errorCode(() => normalizeVerifiedKindeIdentity(claims({ org_code: "", organization_id: "" }))), "IDENTITY_ORGANIZATION_REQUIRED");
  assert.equal(errorCode(() => normalizeVerifiedKindeIdentity(claims({ organization_id: "other_org" }))), "IDENTITY_ORGANIZATION_AMBIGUOUS");
});

test("nested equivalent organization claims remain deterministic", () => {
  const result = normalizeVerifiedKindeIdentity(claims({ organization: { id: "ORG_VERIFIED" } }));
  assert.equal(result.externalOrganizationId, "org_verified");
});

test("normalizes a verified Supabase user with a reviewed organization claim", () => {
  assert.deepEqual(normalizeVerifiedIdentity({
    auth_provider: "supabase",
    sub: "11111111-1111-4111-8111-111111111112",
    email: "USER@EXAMPLE.COM",
    organization_id: "ORG_VERIFIED"
  }), {
    provider: "supabase",
    externalSubject: "11111111-1111-4111-8111-111111111112",
    externalOrganizationId: "org_verified",
    email: "user@example.com"
  });
});

test("rejects non-textual identity and organization claims instead of coercing them", () => {
  for (const sub of [["kp_subject"], 42, { value: "kp_subject" }]) {
    assert.equal(
      errorCode(() => normalizeVerifiedKindeIdentity(claims({ sub }))),
      "IDENTITY_SUBJECT_REQUIRED"
    );
  }
  for (const org_code of [["org_verified"], 42, { value: "org_verified" }]) {
    assert.equal(
      errorCode(() => normalizeVerifiedKindeIdentity(claims({ org_code }))),
      "IDENTITY_ORGANIZATION_REQUIRED"
    );
  }
});

test("resolver returns a canonical tenant only when all reviewed mappings agree", async () => {
  const client = fakeClient({
    external_identities: [{ id: IDENTITY_ID, status: "active" }],
    external_organization_links: [{ organization_id: TENANT_ID, status: "active" }],
    workspace_registry: [{ organization_uuid: TENANT_ID, canonical_owner_key: "org:org_verified" }]
  });
  const context = await resolveCanonicalTenant(client, claims());
  assert.equal(context.identityId, IDENTITY_ID);
  assert.equal(context.canonicalTenantId, TENANT_ID);
  assert.equal(context.canonicalOwnerKey, "org:org_verified");
  assert.deepEqual(client.reads, [
    { table: "external_identities", filters: [["provider", "supabase"], ["external_subject", "kp_subject"]] },
    { table: "external_organization_links", filters: [["provider", "supabase"], ["external_organization_id", "org_verified"]] },
    { table: "workspace_registry", filters: [["organization_id", "org_verified"]] }
  ]);
});

for (const [label, rows, expectedCode] of [
  ["missing identity", { external_identities: [] }, "IDENTITY_NOT_REGISTERED"],
  ["ambiguous identity", { external_identities: [{ id: IDENTITY_ID, status: "active" }, { id: IDENTITY_ID, status: "active" }] }, "IDENTITY_RECORD_AMBIGUOUS"],
  ["inactive identity", { external_identities: [{ id: IDENTITY_ID, status: "needs_review" }] }, "IDENTITY_NOT_ACTIVE"],
  ["missing tenant link", { external_identities: [{ id: IDENTITY_ID, status: "active" }] }, "TENANT_LINK_NOT_REGISTERED"],
  ["ambiguous tenant link", {
    external_identities: [{ id: IDENTITY_ID, status: "active" }],
    external_organization_links: [{ organization_id: TENANT_ID, status: "active" }, { organization_id: TENANT_ID, status: "active" }]
  }, "TENANT_LINK_AMBIGUOUS"],
  ["unreviewed tenant link", {
    external_identities: [{ id: IDENTITY_ID, status: "active" }],
    external_organization_links: [{ organization_id: TENANT_ID, status: "needs_review" }]
  }, "TENANT_LINK_NOT_ACTIVE"],
  ["unreconciled registry", {
    external_identities: [{ id: IDENTITY_ID, status: "active" }],
    external_organization_links: [{ organization_id: TENANT_ID, status: "active" }],
    workspace_registry: [{ organization_uuid: null, canonical_owner_key: "org:org_verified" }]
  }, "WORKSPACE_REGISTRY_UNRECONCILED"],
  ["ambiguous registry", {
    external_identities: [{ id: IDENTITY_ID, status: "active" }],
    external_organization_links: [{ organization_id: TENANT_ID, status: "active" }],
    workspace_registry: [
      { organization_uuid: TENANT_ID, canonical_owner_key: "org:org_verified" },
      { organization_uuid: TENANT_ID, canonical_owner_key: "org:org_verified" }
    ]
  }, "WORKSPACE_REGISTRY_AMBIGUOUS"],
  ["conflicting registry", {
    external_identities: [{ id: IDENTITY_ID, status: "active" }],
    external_organization_links: [{ organization_id: TENANT_ID, status: "active" }],
    workspace_registry: [{ organization_uuid: "33333333-3333-4333-8333-333333333333", canonical_owner_key: "org:org_verified" }]
  }, "TENANT_MAPPING_CONFLICT"]
]) {
  test(`resolver fails closed for ${label}`, async () => {
    await assert.rejects(() => resolveCanonicalTenant(fakeClient(rows), claims()), (error) => {
      assert.equal(error.code, expectedCode);
      return true;
    });
  });
}

test("Phase 0.2A remains additive and performs no heuristic activation", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260811200000_phase0_identity_tenant_bridge.sql", import.meta.url), "utf8");
  const resolver = readFileSync(new URL("../supabase/functions/_shared/identity-contract.mjs", import.meta.url), "utf8");
  assert.match(migration, /add column if not exists organization_uuid uuid/);
  assert.match(migration, /foreign key \(organization_uuid\)[\s\S]+not valid/);
  assert.match(migration, /default 'needs_review'/);
  assert.match(migration, /phase0_workspace_tenant_candidates/);
  assert.match(migration, /revoke all on table public\.phase0_workspace_tenant_candidates from public, anon, authenticated/);
  assert.match(migration, /revoke all on table public\.external_identities from public, anon, authenticated/);
  assert.match(migration, /revoke all on table public\.external_organization_links from public, anon, authenticated/);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.(external_identities|external_organization_links)/i);
  assert.doesNotMatch(resolver, /\.(insert|upsert|update|delete)\s*\(/);

  const invalidationMigration = readFileSync(
    new URL("../supabase/migrations/20260811200618_phase0_invalidate_changed_identity_reviews.sql", import.meta.url),
    "utf8"
  );
  assert.match(invalidationMigration, /new\.status := 'needs_review'/);
  assert.match(invalidationMigration, /new\.reviewed_at := null/);
  assert.match(invalidationMigration, /before update of provider, external_subject/);
  assert.match(invalidationMigration, /before update of provider, external_organization_id, organization_id/);

  const reactivationMigration = readFileSync(
    new URL("../supabase/migrations/20260811203237_phase0_invalidate_reactivated_identity_reviews.sql", import.meta.url),
    "utf8"
  );
  assert.match(reactivationMigration, /old\.status = 'active' and new\.status <> 'active'/);
  assert.match(reactivationMigration, /old\.status <> 'active' and new\.status = 'active'/);
  assert.match(reactivationMigration, /new\.reviewed_at is distinct from old\.reviewed_at/);
  assert.match(reactivationMigration, /external_identities_invalidate_status_review/);
  assert.match(reactivationMigration, /external_organization_links_invalidate_status_review/);

  const tableFieldFixMigration = readFileSync(
    new URL("../supabase/migrations/20260811204142_phase0_fix_status_review_table_fields.sql", import.meta.url),
    "utf8"
  );
  assert.match(tableFieldFixMigration, /if tg_table_name = 'external_organization_links' then[\s\S]+new\.review_note/);
  assert.doesNotMatch(tableFieldFixMigration, /tg_table_name <> 'external_organization_links'[\s\S]+new\.review_note/);
});
