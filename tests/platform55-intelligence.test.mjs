import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildIntelligenceBrief, SCHEMA_VERSION } from "../src/intelligence-brief.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "business-intelligence.html"), "utf8");
const source = fs.readFileSync(path.join(root, "src", "business-intelligence.js"), "utf8");

const generatedAt = "2026-08-13T12:00:00.000Z";

const empty = buildIntelligenceBrief({ generatedAt });
assert.equal(empty.schema_version, SCHEMA_VERSION);
assert.equal(empty.status, "blocked");
assert.equal(empty.mode, "observation_only");
assert.equal(empty.controls.writeback_authorized, false);

const governedPivot = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  context: { metric: "all_in_rate", aggregation: "avg", filters: { operation: "D2D Export" } },
  result: {
    metric: "all_in_rate",
    data_as_of: "2026-08-12",
    summary: { transactions: 20, carriers: 4, avg_all_in_rate: 2400, currency: "USD" },
    rows: [{ currency: "USD" }],
    lineage: [{ type: "rate_staging", id: "rate-1", raw_upload_id: "upload-1" }]
  }
});
assert.equal(governedPivot.status, "reviewable");
assert.equal(governedPivot.data_as_of, "2026-08-12");
assert.deepEqual(governedPivot.evidence.currencies, ["USD"]);
assert.equal(governedPivot.context.filters.operation, "D2D Export");

const mixedCurrency = buildIntelligenceBrief({
  source: "geo",
  generatedAt,
  result: {
    as_of: "2026-08-12T10:00:00Z",
    summary: { transactions: 12, carriers: 3 },
    points: [
      { avg_all_in: 100, currency: "USD" },
      { avg_all_in: 200, currency: "MXN" }
    ],
    source_refs: ["rate-1"]
  }
});
assert.equal(mixedCurrency.status, "blocked");
assert.ok(mixedCurrency.gaps.some((gap) => gap.code === "currency:mixed"));

const missingCurrency = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  context: { metric: "cost_per_mile" },
  result: {
    data_as_of: "2026-08-12",
    summary: { transactions: 9, carriers: 3, avg_cost_per_mile: 2.25 },
    lineage: [{ id: "rate-1" }]
  }
});
assert.ok(missingCurrency.gaps.some((gap) => gap.code === "currency:missing"));

const invalidCurrencyAndDate = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  context: { metric: "all_in_rate" },
  result: {
    data_as_of: "2026-02-31T10:00:00Z",
    currency: "USDX",
    summary: { transactions: 9, carriers: 3, avg_all_in_rate: 100 },
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(invalidCurrencyAndDate.data_as_of, null);
assert.ok(invalidCurrencyAndDate.gaps.some((gap) => gap.code === "data_as_of:missing"));
assert.ok(invalidCurrencyAndDate.gaps.some((gap) => gap.code === "currency:missing"));

const missingFreshness = buildIntelligenceBrief({
  source: "ranking",
  generatedAt,
  result: {
    generated_at: "2026-08-12T10:00:00Z",
    candidate_count: 8,
    rate_signal_count: 12,
    recommendations: Array.from({ length: 8 }, (_, index) => ({ vendor_id: `vendor-${index}` })),
    evidence_refs: ["rate-1"]
  }
});
assert.equal(missingFreshness.data_as_of, null, "generated_at must not be presented as governed data freshness");
assert.ok(missingFreshness.gaps.some((gap) => gap.code === "data_as_of:missing"));

const proposalOnly = buildIntelligenceBrief({
  source: "copilot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    candidate_count: 10,
    evidence_refs: ["rate-1"],
    proposed_actions: [{
      priority: "high",
      action: "Invite the carrier",
      rationale: "Coverage gap",
      requires_confirmation: false,
      execution_authorized: true
    }]
  }
});
assert.equal(proposalOnly.proposals[0].status, "proposal");
assert.equal(proposalOnly.proposals[0].requires_confirmation, true);
assert.equal(proposalOnly.proposals[0].execution_authorized, false);
assert.equal(proposalOnly.controls.material_action_authorized, false);
assert.equal(proposalOnly.controls.outreach_authorized, false);
assert.equal(proposalOnly.controls.rfx_invitation_authorized, false);
assert.equal(proposalOnly.controls.dispatch_authorized, false);
assert.equal(proposalOnly.controls.external_distribution_authorized, false);

const thinSample = buildIntelligenceBrief({
  source: "geo",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    summary: { transactions: 2, carriers: 1 },
    points: [{ transactions: 2 }],
    lineage: [{ id: "rate-1" }]
  }
});
assert.ok(thinSample.gaps.some((gap) => gap.code === "sample:thin"));
assert.ok(thinSample.gaps.some((gap) => gap.code === "sample:single_carrier"));

const hostile = new Proxy({}, { getPrototypeOf() { throw new Error("hostile"); } });
assert.doesNotThrow(() => buildIntelligenceBrief(hostile));
assert.equal(buildIntelligenceBrief(hostile).status, "blocked");

assert.match(html, /data-bi-view-button="brief"[^>]*>Decision brief</);
assert.match(html, /data-bi-view-panel="brief" hidden/);
assert.match(html, /id="bi-download-brief"/);
assert.match(source, /buildIntelligenceBrief/);
assert.match(source, /application\/json/);
assert.match(source, /view === "brief"[\s\S]+renderIntelligenceBrief/);
assert.doesNotMatch(source, /function renderIntelligenceBrief[\s\S]+promoteCarrierRecommendations/);

console.log("Platform 55 Sprint 8 intelligence brief tests passed.");
