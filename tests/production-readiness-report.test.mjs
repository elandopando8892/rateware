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

const completeEvidence = {
  scope: ["docs/superpowers/specs/2026-08-19-rateware-production-closure-design.md"],
  evidence_plan: ["docs/release/evidence/2026-08-19-p0-git-github.md"],
  implementation: ["docs/release/2026-08-19-p0-release-baseline.md"],
  automated_suite: ["node tests/production-readiness-report.test.mjs"],
  independent_review: ["detached independent review completed"],
  preview_smoke: ["read-only preview inventory verified"],
  deployment: ["documentation-only release required no application deployment"],
  production_smoke: ["read-only production inventory verified"],
  monitoring: ["production remained unchanged"]
};

const completeLedger = () => {
  const value = structuredClone(ledger);
  value.sprints[0].progress = 100;
  value.sprints[0].evidence = structuredClone(completeEvidence);
  value.sprints[0].verdicts = { independent_review: "GO" };
  return value;
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
    preview_smoke: ["scope", "evidence_plan", "implementation", "automated_suite", "independent_review"],
    deployment: ["scope", "evidence_plan", "implementation", "automated_suite", "independent_review", "preview_smoke"],
    production_smoke: ["scope", "evidence_plan", "implementation", "automated_suite", "independent_review", "preview_smoke", "deployment"],
    monitoring: ["scope", "evidence_plan", "implementation", "automated_suite", "independent_review", "preview_smoke", "deployment", "production_smoke"]
  };
  for (const [progress, key] of [[85, "independent_review"], [93, "preview_smoke"], [97, "deployment"], [100, "production_smoke"], [100, "monitoring"]]) {
    const invalid = structuredClone(ledger);
    invalid.sprints[0].progress = progress;
    invalid.sprints[0].evidence = Object.fromEntries(prerequisites[key].map((name) => [name, ["spec"]]));
    invalid.sprints[0].verdicts = key === "independent_review" ? {} : { independent_review: "GO" };
    assert.throws(() => validateLedger(invalid), new RegExp(key, "i"));
  }
});

test("requires an explicit independent review GO verdict", () => {
  const evidence = { scope: ["spec"], evidence_plan: ["plan"], implementation: ["code"], automated_suite: ["tests"], independent_review: ["detached-review"], preview_smoke: ["preview"], deployment: ["deploy"], production_smoke: ["production"], monitoring: ["monitoring"] };
  for (const verdict of [undefined, "NO-GO"]) {
    const invalid = structuredClone(ledger);
    invalid.sprints[0].progress = 100;
    invalid.sprints[0].evidence = evidence;
    invalid.sprints[0].verdicts = verdict === undefined ? {} : { independent_review: verdict };
    assert.throws(() => validateLedger(invalid), /independent_review.*GO/i);
  }
});

test("formats general and sprint progress", () => {
  const output = formatProgressReport(ledger);
  assert.match(output, /General:\s+63\.4%/);
  assert.match(output, /P0:\s+10%/);
});

test("rejects the shifted negative weight vector that falsely reports 133 percent", () => {
  const invalid = structuredClone(ledger);
  invalid.sprints.forEach((sprint, index) => {
    sprint.weight = [100, -87, 7, 7, 6, 4][index];
  });
  invalid.sprints[0].progress = 70;
  invalid.sprints[0].evidence = {
    scope: completeEvidence.scope,
    evidence_plan: completeEvidence.evidence_plan,
    implementation: completeEvidence.implementation,
    automated_suite: completeEvidence.automated_suite
  };

  assert.throws(() => validateLedger(invalid), /P0.*weight/i);
  assert.throws(() => computeOverallProgress(invalid), /P0.*weight/i);
});

test("requires each schema-version-one sprint ID exactly once", () => {
  const cases = {
    duplicate: ["P0", "P0", "P2", "P3", "P4", "P5"],
    missing: ["P0", "P1", "P2", "P3", "P4"],
    extra: ["P0", "P1", "P2", "P3", "P4", "P5", "P6"]
  };

  for (const [name, ids] of Object.entries(cases)) {
    const invalid = structuredClone(ledger);
    invalid.sprints = ids.map((id, index) => ({
      ...(invalid.sprints[index] || { weight: 0, progress: 0, evidence: {} }),
      id
    }));
    assert.throws(() => validateLedger(invalid), /sprints must be P0-P5/i, name);
  }
});

test("rejects fractional, non-finite, negative, and shifted weights", () => {
  for (const [name, weights] of [
    ["fractional", [3.5, 9.5, 7, 7, 6, 4]],
    ["NaN", [NaN, 9, 7, 7, 6, 4]],
    ["Infinity", [Infinity, 9, 7, 7, 6, 4]],
    ["negative", [-1, 14, 7, 7, 6, 4]],
    ["shifted", [5, 8, 7, 7, 6, 4]]
  ]) {
    const invalid = structuredClone(ledger);
    invalid.sprints.forEach((sprint, index) => {
      sprint.weight = weights[index];
    });
    assert.throws(() => validateLedger(invalid), /weight/i, name);
  }
});

test("requires finite integer sprint progress in the inclusive 0-100 range", () => {
  for (const progress of [0.5, NaN, Infinity, -1, 101]) {
    const invalid = structuredClone(ledger);
    invalid.sprints[1].progress = progress;
    invalid.sprints[1].evidence = { note: ["validation fixture"] };
    assert.throws(() => validateLedger(invalid), /P1.*progress/i, String(progress));
  }
});

test("rejects empty, whitespace-only, non-string, and missing closure evidence", () => {
  for (const evidence of [[""], ["   "], [42], undefined]) {
    const invalid = completeLedger();
    if (evidence === undefined) delete invalid.sprints[0].evidence.monitoring;
    else invalid.sprints[0].evidence.monitoring = evidence;
    assert.throws(() => validateLedger(invalid), /P0.*monitoring/i, JSON.stringify(evidence));
  }
});

test("rejects file-backed evidence that does not exist in the evaluated checkout", () => {
  for (const path of [
    "docs/release/evidence/does-not-exist.md",
    "docs/release/evidence/does not exist.md",
    "missing root evidence.md"
  ]) {
    const invalid = structuredClone(ledger);
    invalid.sprints[0].evidence.scope = [path];
    assert.throws(() => validateLedger(invalid), /P0.*scope.*does not exist/i, path);
  }
});

test("rejects directories as file-backed evidence", () => {
  const invalidDirectory = structuredClone(ledger);
  invalidDirectory.sprints[0].evidence.scope = ["docs/release"];
  assert.throws(() => validateLedger(invalidDirectory), /P0.*scope.*regular file/i);
});

test("rejects absolute evidence paths outside the evaluated checkout", () => {
  const invalidOutside = structuredClone(ledger);
  invalidOutside.sprints[0].evidence.scope = ["C:\\Windows\\win.ini"];
  assert.throws(() => validateLedger(invalidOutside), /P0.*scope.*outside.*checkout/i);
});

test("accepts descriptions, commands, and in-checkout evidence files with spaces", () => {
  const descriptions = structuredClone(ledger);
  descriptions.sprints[0].evidence.scope = [
    "release scope approved",
    "node tests/production-readiness-report.test.mjs"
  ];
  validateLedger(descriptions);

  const fileWithSpaces = structuredClone(ledger);
  fileWithSpaces.sprints[0].evidence.scope = ["output/import guide-preview.png"];
  validateLedger(fileWithSpaces);
});

test("accepts the current P0=70 ledger shape and computes 65.8 percent", () => {
  const current = structuredClone(ledger);
  current.sprints[0].progress = 70;
  current.sprints[0].evidence = {
    scope: completeEvidence.scope,
    evidence_plan: completeEvidence.evidence_plan,
    implementation: completeEvidence.implementation,
    automated_suite: completeEvidence.automated_suite
  };
  assert.equal(computeOverallProgress(current), 65.8);
});

test("accepts a valid P0=100 GO fixture and preserves NO-GO rejection", () => {
  assert.equal(computeOverallProgress(completeLedger()), 67);

  const noGo = completeLedger();
  noGo.sprints[0].verdicts.independent_review = "NO-GO";
  assert.throws(() => validateLedger(noGo), /independent_review.*GO/i);
});
