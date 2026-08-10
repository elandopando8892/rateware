import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260809215032_markos_callback_scheduler.sql", import.meta.url), "utf8");
const bidApi = readFileSync(new URL("../supabase/functions/rfx-bid-api/index.ts", import.meta.url), "utf8");
const dispatcher = readFileSync(new URL("../supabase/functions/markos-callback-dispatcher/index.ts", import.meta.url), "utf8");
const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");

test("MarkOS callback schedule is durable, private and atomically claimed", () => {
  assert.match(migration, /create table if not exists public\.markos_callback_jobs/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.markos_callback_jobs from public, anon, authenticated/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /unique \(source_session_id, rfx_lane_vendor_id, scheduled_at\)/i);
  assert.match(migration, /needs_review/i);
  assert.doesNotMatch(migration, /invitation_token\s+text/i);
});

test("Bid API validates UTC against local time and replaces an unstarted callback", () => {
  assert.match(bidApi, /request_markos_callback/);
  assert.match(bidApi, /markosCallbackLocalMinute/);
  assert.match(bidApi, /does not match the confirmed local date, time and timezone/i);
  assert.match(bidApi, /rescheduled_during_same_call/);
  assert.match(bidApi, /update_markos_callback_status/);
});

test("dispatcher uses protected secrets and suppresses uncertain retries", () => {
  assert.match(dispatcher, /MARKOS_CALLBACK_CRON_SECRET/);
  assert.match(dispatcher, /claim_due_markos_callback_jobs/);
  assert.match(dispatcher, /automatic retry suppressed/i);
  assert.match(dispatcher, /status: "needs_review"/);
  assert.match(dispatcher, /scheduled-callbacks\/dispatch/);
  assert.match(config, /\[functions\.markos-callback-dispatcher\][\s\S]*verify_jwt = false/);
});
