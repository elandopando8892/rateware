import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260831031500_idempotent_rfx_award_package_creation.sql", "utf8");
const api = readFileSync("supabase/functions/rateware-api/index.ts", "utf8");

test("award packages persist a workspace-scoped operation receipt", () => {
  assert.match(migration, /add column if not exists operation_id uuid/);
  assert.match(migration, /operation_payload_fingerprint text/);
  assert.match(migration, /rfx_award_packages_owner_operation_uidx[\s\S]+owner_email, operation_id/);
  assert.match(migration, /operation_payload_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
});

test("award package lanes have stable replay ordinals", () => {
  assert.match(migration, /add column if not exists operation_line_index integer/);
  assert.match(migration, /rfx_award_package_lanes_operation_line_uidx[\s\S]+award_package_id, operation_line_index/);
  assert.match(api, /operation_line_index: operationLineIndex/);
  assert.match(api, /upsert\(batch, \{ onConflict: "award_package_id,operation_line_index" \}\)/);
});

test("award package retries reject payload drift and suppress duplicate audit", () => {
  assert.match(api, /operation_payload_fingerprint\) !== payloadFingerprint/);
  assert.match(api, /operation id was already used with a different payload/);
  assert.match(migration, /rfx_process_audit_owner_action_operation_uidx/);
  assert.match(api, /ignoreDuplicates: true/);
});

test("award package creation receives the correlated operation id", () => {
  assert.match(api, /"create_rfx_award_package",[\s\S]+"generate_outreach_drafts"/);
  assert.match(api, /createRfxAwardPackage\(supabase, user, body, operationId\)/);
  assert.match(api, /RFx award package operation id is required/);
});
