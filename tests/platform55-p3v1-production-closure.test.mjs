import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const production = await import("../tools/platform55-p3v1-production-closure.mjs");

function canonical() {
  return production.loadP3V1ProductionClosure(ROOT);
}

test("accepts only the exact P3-V1 read-only production closure", () => {
  const loaded = canonical();
  const record = production.validateP3V1ProductionRecord(loaded.record);
  assert.equal(record.release.sha, "209e40a3764716af165064e00b359068442a6d4d");
  assert.equal(record.release.tree, "740868975bf855415e577019415d76cb826d6d48");
  assert.equal(record.reviewed_head.sha, "93db2a40d9e93ceb5c0e70453fbc83f85dcd89e5");
  assert.equal(record.reviewed_head.tree, record.release.tree);
  assert.equal(record.p3v_progress, 25);
  assert.deepEqual(record.formal_ledger, { general: 83, p3: 0, changed: false });
  assert.equal(production.validateP3V1ProductionReport(loaded.report, loaded.recordBytes), loaded.recordSha256);
  assert.deepEqual(production.validateP3V1ProductionGitState(ROOT), {
    release: "209e40a3764716af165064e00b359068442a6d4d",
    tree: "740868975bf855415e577019415d76cb826d6d48",
  });
});

test("rejects false production, smoke, Supabase, mutation, and progress claims", () => {
  const { record } = canonical();
  const attacks = [
    ["reviewed head", (value) => { value.reviewed_head.sha = "f".repeat(40); }],
    ["reviewed tree", (value) => { value.reviewed_head.tree = "e".repeat(40); }],
    ["release SHA", (value) => { value.release.sha = "d".repeat(40); }],
    ["release tree", (value) => { value.release.tree = "c".repeat(40); }],
    ["deployment", (value) => { value.release.deployment_id = "dpl_fabricated"; }],
    ["alias", (value) => { value.release.production_alias = "preview.invalid"; }],
    ["state", (value) => { value.release.state = "ERROR"; }],
    ["manual promotion", (value) => { value.release.manual_promotion = true; }],
    ["missing route", (value) => { value.routes.pop(); }],
    ["duplicate route", (value) => { value.routes[1] = structuredClone(value.routes[0]); }],
    ["unauthenticated", (value) => { value.routes[0].authenticated = false; }],
    ["route failure", (value) => { value.routes[1].passed = false; }],
    ["console error", (value) => { value.routes[0].console_errors = 1; }],
    ["console warning", (value) => { value.routes[1].console_warnings = 1; }],
    ["no live data", (value) => { value.routes[0].approved_rates = 0; }],
    ["second preview", (value) => { value.supabase.persistent_preview_count = 2; }],
    ["Supabase change", (value) => { value.supabase.changed = true; }],
    ["Supabase mutation", (value) => { value.supabase.mutation_authorized = true; }],
    ["production mutation", (value) => { value.boundaries.production_data_mutation = true; }],
    ["approval", (value) => { value.boundaries.row_approved = true; }],
    ["visual over-credit", (value) => { value.p3v_progress = 40; }],
    ["formal P3 credit", (value) => { value.formal_ledger.p3 = 25; }],
    ["formal ledger change", (value) => { value.formal_ledger.changed = true; }],
    ["NO-GO", (value) => { value.verdict = "NO-GO"; }],
  ];
  for (const [label, mutate] of attacks) {
    const value = structuredClone(record);
    mutate(value);
    assert.throws(() => production.validateP3V1ProductionRecord(value), Error, label);
  }
});

test("binds the report to the exact JSON bytes and release boundaries", () => {
  const loaded = canonical();
  assert.throws(
    () => production.validateP3V1ProductionReport(loaded.report, `${loaded.recordBytes} `),
    /digest/i,
  );
  for (const marker of [
    "209e40a3764716af165064e00b359068442a6d4d",
    "dpl_GR34Gm4xAtvWkRgyNRJ1eZHFL45y",
    "rateware.vercel.app",
    "No manual promotion occurred.",
    "Formal release progress remains General `83%`; P3 `0%`.",
  ]) {
    assert.throws(
      () => production.validateP3V1ProductionReport(loaded.report.replace(marker, "REMOVED"), loaded.recordBytes),
      Error,
      marker,
    );
  }
});

test("rejects coordinated JSON and report byte drift even when the embedded digest is updated", () => {
  const loaded = canonical();
  const driftedRecordBytes = `${JSON.stringify(loaded.record, null, 4)}\n`;
  const driftedDigest = createHash("sha256")
    .update(driftedRecordBytes.replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
  const driftedReport = loaded.report
    .replace(loaded.recordSha256, driftedDigest)
    .replace("## Progress boundary", "Additional unreviewed production claim.\n\n## Progress boundary");

  assert.notEqual(driftedRecordBytes, loaded.recordBytes);
  assert.notEqual(driftedReport, loaded.report);
  assert.doesNotThrow(() => production.validateP3V1ProductionRecord(JSON.parse(driftedRecordBytes)));
  assert.throws(
    () => production.validateP3V1ProductionReport(driftedReport, driftedRecordBytes),
    /canonical|digest|reviewed/i,
  );
});

test("rejects report-only byte drift with canonical JSON, digest, and markers", () => {
  const loaded = canonical();
  const driftedReport = loaded.report.replace(
    "## Progress boundary",
    "Additional unreviewed production claim.\n\n## Progress boundary",
  );

  assert.notEqual(driftedReport, loaded.report);
  assert.throws(
    () => production.validateP3V1ProductionReport(driftedReport, loaded.recordBytes),
    /canonical|digest|reviewed/i,
  );
});
