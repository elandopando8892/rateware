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

const lineageWithoutIdentifier = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    metric: "transaction_count",
    data_as_of: "2026-08-12",
    summary: { transactions: 20, carriers: 4 },
    lineage: [{ type: "rate_staging" }]
  }
});
assert.notEqual(lineageWithoutIdentifier.status, "reviewable");
assert.deepEqual(lineageWithoutIdentifier.lineage.references, []);
assert.ok(lineageWithoutIdentifier.gaps.some((gap) => gap.code === "lineage:missing"));

const emptyObjectRows = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    rows: [{}, {}, {}, {}, {}],
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(emptyObjectRows.sample.rows, 0);
assert.equal(emptyObjectRows.status, "blocked");
assert.ok(emptyObjectRows.gaps.some((gap) => gap.code === "sample:empty"));

const metadataOnlyRows = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    rows: Array.from({ length: 5 }, () => ({ selected: false })),
    lineage: [{ source_file: "quote.xlsx", type: "raw_upload" }]
  }
});
assert.equal(metadataOnlyRows.status, "blocked");
assert.ok(metadataOnlyRows.gaps.some((gap) => gap.code === "sample:empty"));
assert.ok(metadataOnlyRows.gaps.some((gap) => gap.code === "lineage:missing"));

const rowMoneyWithoutCurrency = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    rows: Array.from({ length: 5 }, (_, index) => ({ lane: `lane-${index}`, linehaul: 1000 + index })),
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(rowMoneyWithoutCurrency.status, "blocked");
assert.ok(rowMoneyWithoutCurrency.gaps.some((gap) => gap.code === "currency:missing"));

const stringMoneyWithoutCurrency = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    rows: Array.from({ length: 5 }, (_, index) => ({ lane: `lane-${index}`, linehaul: "1000.00" })),
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(stringMoneyWithoutCurrency.status, "blocked");
assert.ok(stringMoneyWithoutCurrency.gaps.some((gap) => gap.code === "currency:missing"));

const rankingMoneyWithoutCurrency = buildIntelligenceBrief({
  source: "ranking",
  generatedAt,
  context: { ranking_mode: "cost_per_mile" },
  result: {
    data_as_of: "2026-08-12",
    recommendations: Array.from({ length: 5 }, (_, index) => ({
      vendor_id: `vendor-${index}`,
      metrics: { avg_cost_per_mile: 2 + index / 10 }
    })),
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(rankingMoneyWithoutCurrency.status, "blocked");
assert.ok(rankingMoneyWithoutCurrency.gaps.some((gap) => gap.code === "currency:missing"));

const nestedCurrency = buildIntelligenceBrief({
  source: "ranking",
  generatedAt,
  context: { ranking_mode: "cost_per_mile" },
  result: {
    data_as_of: "2026-08-12",
    recommendations: Array.from({ length: 5 }, (_, index) => ({
      vendor_id: `vendor-${index}`,
      metrics: { avg_cost_per_mile: 2 + index / 10, currency: "USD" }
    })),
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(nestedCurrency.status, "reviewable");
assert.deepEqual(nestedCurrency.evidence.currencies, ["USD"]);

const rankingModeMustNotBeMaskedByMetric = buildIntelligenceBrief({
  source: "ranking",
  generatedAt,
  context: { metric: "transaction_count", ranking_mode: "cost_per_mile" },
  result: {
    metric: "transaction_count",
    data_as_of: "2026-08-12",
    recommendations: Array.from({ length: 5 }, (_, index) => ({
      vendor_id: `vendor-${index}`,
      metrics: { avg_cost_per_mile: 2 + index / 10 }
    })),
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(rankingModeMustNotBeMaskedByMetric.status, "blocked");
assert.ok(rankingModeMustNotBeMaskedByMetric.gaps.some((gap) => gap.code === "currency:missing"));

const booleanLineage = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    summary: { transactions: 5, carriers: 2 },
    lineage: [{ id: true }]
  }
});
assert.equal(booleanLineage.status, "review_required");
assert.deepEqual(booleanLineage.lineage.references, []);
assert.ok(booleanLineage.gaps.some((gap) => gap.code === "lineage:missing"));

const formattedMoneyWithoutCurrency = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    rows: Array.from({ length: 5 }, (_, index) => ({ lane: `lane-${index}`, linehaul: "1,000.00" })),
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(formattedMoneyWithoutCurrency.status, "blocked");
assert.ok(formattedMoneyWithoutCurrency.gaps.some((gap) => gap.code === "currency:missing"));

const summaryStringMoneyWithoutCurrency = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    summary: { transactions: 5, carriers: 2, avg_all_in_rate: "1000.00" },
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(summaryStringMoneyWithoutCurrency.status, "blocked");
assert.ok(summaryStringMoneyWithoutCurrency.gaps.some((gap) => gap.code === "currency:missing"));

const nestedArrayMoneyWithoutCurrency = buildIntelligenceBrief({
  source: "ranking",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    recommendations: Array.from({ length: 5 }, (_, index) => ({
      vendor_id: `vendor-${index}`,
      metrics: { lanes: [{ linehaul: 100 + index }] }
    })),
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(nestedArrayMoneyWithoutCurrency.status, "blocked");
assert.ok(nestedArrayMoneyWithoutCurrency.gaps.some((gap) => gap.code === "currency:missing"));

const moneyAfterFiveHundred = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    rows: [
      ...Array.from({ length: 500 }, (_, index) => ({ lane: `lane-${index}`, transaction_count: 1 })),
      { lane: "lane-500", linehaul: 1000 }
    ],
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(moneyAfterFiveHundred.status, "blocked");
assert.ok(moneyAfterFiveHundred.gaps.some((gap) => gap.code === "currency:missing"));

const partialObservationCurrency = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    rows: Array.from({ length: 5 }, (_, index) => ({
      lane: `lane-${index}`,
      linehaul: 1000 + index,
      ...(index === 0 ? { currency: "USD" } : {})
    })),
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(partialObservationCurrency.status, "blocked");
assert.ok(partialObservationCurrency.gaps.some((gap) => gap.code === "currency:missing"));

const nonMonetaryRates = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    rows: Array.from({ length: 5 }, (_, index) => ({ lane: `lane-${index}`, on_time_rate: 0.95, margin_percent: 5 })),
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(nonMonetaryRates.status, "reviewable");
assert.ok(!nonMonetaryRates.gaps.some((gap) => gap.code.startsWith("currency:")));

const deeplyNestedCurrency = buildIntelligenceBrief({
  source: "ranking",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    recommendations: Array.from({ length: 5 }, (_, index) => ({
      vendor_id: `vendor-${index}`,
      metrics: { commercial: { linehaul: 1000 + index, currency: "USD" } }
    })),
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(deeplyNestedCurrency.status, "reviewable");
assert.deepEqual(deeplyNestedCurrency.evidence.currencies, ["USD"]);

const globalCurrencyCoverage = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    currency: "USD",
    rows: Array.from({ length: 5 }, (_, index) => ({ lane: `lane-${index}`, linehaul: 1000 + index })),
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(globalCurrencyCoverage.status, "reviewable");

const unrelatedCurrencyDoesNotCreateMixedMoney = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    rows: [
      { lane: "lane-money", linehaul: 1000, currency: "USD" },
      ...Array.from({ length: 4 }, (_, index) => ({ lane: `lane-count-${index}`, transaction_count: 1, currency: "MXN" }))
    ],
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(unrelatedCurrencyDoesNotCreateMixedMoney.status, "reviewable");
assert.deepEqual(unrelatedCurrencyDoesNotCreateMixedMoney.evidence.currencies, ["USD"]);

const invalidMoney = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    currency: "USD",
    rows: Array.from({ length: 5 }, (_, index) => ({ lane: `lane-${index}`, linehaul: "N/A" })),
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(invalidMoney.status, "blocked");
assert.ok(invalidMoney.gaps.some((gap) => gap.code === "monetary:invalid"));

const oversizedEvidence = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    rows: [{ lane: "large", values: Array.from({ length: 21000 }, () => 1) }],
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(oversizedEvidence.status, "blocked");
assert.ok(oversizedEvidence.gaps.some((gap) => gap.code === "evidence:incomplete"));

const cyclicRow = { lane: "cycle" };
cyclicRow.self = cyclicRow;
const cyclicEvidence = buildIntelligenceBrief({
  source: "pivot",
  generatedAt,
  result: {
    data_as_of: "2026-08-12",
    rows: [cyclicRow],
    lineage: [{ id: "rate-1" }]
  }
});
assert.equal(cyclicEvidence.status, "blocked");
assert.ok(cyclicEvidence.gaps.some((gap) => gap.code === "evidence:incomplete"));

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
