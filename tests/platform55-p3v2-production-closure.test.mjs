import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const production = await import("../tools/platform55-p3v2-production-closure.mjs");

const canonical = () => production.loadP3V2ProductionClosure(ROOT);

test("accepts only the exact P3-V2 read-only production closure", () => {
  const loaded = canonical();
  const record = production.validateP3V2ProductionRecord(loaded.record);
  assert.equal(record.release.sha, "f329b3c580ba9a7c3bf9f7836d2af4986f946f3f");
  assert.equal(record.release.tree, "82e053ac9979b8ec86430708870a79346fd70202");
  assert.equal(record.reviewed_head.sha, "99fbd18e469763ff90d346135bd1e7fda9b417d6");
  assert.equal(record.reviewed_head.tree, record.release.tree);
  assert.equal(record.p3v_progress, 40);
  assert.deepEqual(record.formal_ledger, { general: 83, p3: 0, changed: false });
  assert.equal(production.validateP3V2ProductionReport(loaded.report, loaded.recordBytes), loaded.recordSha256);
  assert.deepEqual(production.validateP3V2ProductionGitState(ROOT), {
    release: "f329b3c580ba9a7c3bf9f7836d2af4986f946f3f",
    tree: "82e053ac9979b8ec86430708870a79346fd70202",
  });
});

test("rejects fabricated release, smoke, Supabase, mutation, and progress claims", () => {
  const { record } = canonical();
  const attacks = [
    (value) => { value.release.deployment_id = "dpl_fabricated"; },
    (value) => { value.release.manual_promotion = true; },
    (value) => { value.routes.pop(); },
    (value) => { value.routes[0].authenticated = false; },
    (value) => { value.routes[1].console_errors = 1; },
    (value) => { value.supabase.persistent_preview_count = 2; },
    (value) => { value.supabase.changed = true; },
    (value) => { value.boundaries.row_approved = true; },
    (value) => { value.p3v_progress = 100; },
    (value) => { value.formal_ledger.p3 = 40; },
    (value) => { value.verdict = "NO-GO"; },
  ];
  for (const mutate of attacks) {
    const value = structuredClone(record);
    mutate(value);
    assert.throws(() => production.validateP3V2ProductionRecord(value));
  }
});
test("binds the report to exact record bytes and release boundaries", () => {
  const loaded = canonical();
  assert.throws(() => production.validateP3V2ProductionReport(loaded.report, `${loaded.recordBytes} `), /digest/i);
  for (const marker of [
    "f329b3c580ba9a7c3bf9f7836d2af4986f946f3f",
    "dpl_AvCeNfRhG3T5YzgehByP53h7Kcnc",
    "rateware.vercel.app",
    "No manual promotion occurred.",
    "Formal release progress remains General `83%`; P3 `0%`.",
  ]) {
    assert.throws(() => production.validateP3V2ProductionReport(loaded.report.replace(marker, "REMOVED"), loaded.recordBytes));
  }
});
