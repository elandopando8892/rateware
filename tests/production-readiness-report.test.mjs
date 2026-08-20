import assert from "node:assert/strict";
import test from "node:test";
import {
  computeOverallProgress,
  formatProgressReport,
  validateLedger
} from "../tools/production-readiness-report.mjs";

const ledger = {
  schema_version: 1,
  baseline: 63,
  sprints: [
    { id: "P0", weight: 4, progress: 10, evidence: { scope: ["spec", "plan"] } },
    { id: "P1", weight: 9, progress: 0, evidence: {} },
    { id: "P2", weight: 7, progress: 0, evidence: {} },
    { id: "P3", weight: 7, progress: 0, evidence: {} },
    { id: "P4", weight: 6, progress: 0, evidence: {} },
    { id: "P5", weight: 4, progress: 0, evidence: {} }
  ]
};

test("computes weighted progress", () => {
  validateLedger(ledger);
  assert.equal(computeOverallProgress(ledger), 63.4);
});

test("rejects progress without evidence", () => {
  const invalid = structuredClone(ledger);
  invalid.sprints[0].evidence = {};
  assert.throws(() => validateLedger(invalid), /P0.*evidence/i);
});

test("requires high-risk gates", () => {
  const prerequisites = {
    independent_review: ["scope", "evidence_plan", "implementation", "automated_suite"],
    deployment: ["scope", "evidence_plan", "implementation", "automated_suite", "independent_review", "preview_smoke"],
    production_smoke: ["scope", "evidence_plan", "implementation", "automated_suite", "independent_review", "preview_smoke", "deployment"],
    monitoring: ["scope", "evidence_plan", "implementation", "automated_suite", "independent_review", "preview_smoke", "deployment", "production_smoke"]
  };
  for (const [progress, key] of [[85, "independent_review"], [97, "deployment"], [100, "production_smoke"], [100, "monitoring"]]) {
    const invalid = structuredClone(ledger);
    invalid.sprints[0].progress = progress;
    invalid.sprints[0].evidence = Object.fromEntries(prerequisites[key].map((name) => [name, ["spec"]]));
    assert.throws(() => validateLedger(invalid), new RegExp(key, "i"));
  }
});

test("formats general and sprint progress", () => {
  const output = formatProgressReport(ledger);
  assert.match(output, /General:\s+63\.4%/);
  assert.match(output, /P0:\s+10%/);
});
