import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260831022000_atomic_rfx_lane_vendor_award.sql", "utf8");
const api = readFileSync("supabase/functions/rateware-api/index.ts", "utf8");

test("RFx awards use a tenant-scoped durable operation receipt", () => {
  assert.match(migration, /create table if not exists public\.rfx_award_operations/);
  assert.match(migration, /primary key \(owner_email, operation_id\)/);
  assert.match(migration, /payload_fingerprint text not null/);
  assert.match(migration, /lower\(event\.owner_email\) = lower\(btrim\(p_owner_email\)\)/);
  assert.match(migration, /already used with a different payload/);
});

test("RFx award transition locks the operation and the complete lane", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /where rfx_lane_id = v_invitation\.rfx_lane_id[\s\S]+for update/);
  assert.match(migration, /update public\.rfx_lane_vendors[\s\S]+award_role = null/);
  assert.match(migration, /update public\.rate_staging[\s\S]+rfx_bid_outcome = case when v_role = 'primary' then 'awarded' else 'backup' end/);
});

test("RFx award RPC is service-role only", () => {
  assert.match(migration, /revoke all on function public\.rateware_award_rfx_lane_vendor[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.rateware_award_rfx_lane_vendor[\s\S]+to service_role/);
});

test("Rateware API delegates award writes to the atomic RPC and suppresses replay audits", () => {
  assert.match(api, /awardRfxLaneVendor\([\s\S]+operationId: string \| null/);
  assert.match(api, /supabase\.rpc\("rateware_award_rfx_lane_vendor"/);
  assert.match(api, /p_operation_id: operationId/);
  assert.match(api, /if \(!result\.idempotent\) await writeAuditLog/);
});
