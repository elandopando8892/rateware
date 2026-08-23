import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { P2_S4_CLOSURE, validateP2S4Manifest } from "../tools/platform55-network-service-evidence.mjs";
import {
  P2_S5_CLOSURE,
  validateP2S5IndependentReviewBody,
  validateP2S5SurfaceCandidateBody,
} from "../tools/platform55-intelligence-admin-evidence.mjs";
import {
  computeOverallProgress,
  formatProgressReport,
  validateP2S3Manifest,
  validateP2S3SourceBlobParity,
  validateP2S2ReviewBody,
  validateLedger
} from "../tools/production-readiness-report.mjs";
import * as productionReadiness from "../tools/production-readiness-report.mjs";

const P2_S4_SEMANTIC_FIXTURE = [
  ["build_05", "5516", "onboarding", "build_05/rateware_procurement_carrier_network_build_v05.html"],
  ["build_05", "5521", "onboarding-workflow", "build_05/rateware_procurement_carrier_network_build_v05.html"],
  ["build_07", "14", "communications", "build_07/rateware_operations_execution_build_v07.html"],
  ["build_07", "49", "communications-thread", "build_07/rateware_operations_execution_build_v07.html"],
  ["build_10", "25", "support", "build_10/rateware_integrations_ecosystem_platform_operations_build_v10.html"],
  ["build_10", "27", "connection-wizard", "build_10/rateware_integrations_ecosystem_platform_operations_build_v10.html"],
  ["build_10", "44", "gmail-connection", "build_10/rateware_integrations_ecosystem_platform_operations_build_v10.html"],
  ["build_10", "67", "support-cases", "build_10/rateware_integrations_ecosystem_platform_operations_build_v10.html"],
  ["build_11", "20", "vendor-risk", "build_11/rateware_security_compliance_enterprise_governance_build_v11.html"],
  ["build_12", "14", "onboarding", "build_12/rateware_experience_configuration_release_readiness_build_v12.html"],
  ["build_12", "23", "support", "build_12/rateware_experience_configuration_release_readiness_build_v12.html"],
  ["build_12", "81", "support-center", "build_12/rateware_experience_configuration_release_readiness_build_v12.html"],
  ["build_12", "82", "support-case", "build_12/rateware_experience_configuration_release_readiness_build_v12.html"],
];

const P2_S4_SEMANTIC_CANDIDATE = "docs/release/evidence/2026-08-22-p2-s4-semantic-closure.json";

const proposedP2S4Disposition = (build, ordinal) => {
  if (build === "build_10" && ordinal === "44") {
    return {
      mapping_status: "verified",
      target_route: "provider-gmail.html",
      target_component: "integration-runtime",
      disposition: "shared_surface",
    };
  }
  return {
    mapping_status: "dispositioned",
    target_route: "",
    target_component: "",
    disposition: "reference_only",
  };
};

const mixedP2S4Review = () => ({
  schema_version: 2,
  verdict: "PENDING-INDEPENDENT-REVIEW",
  semantic_credit: "withheld",
  mappings: P2_S4_SEMANTIC_FIXTURE.map(([build, ordinal, state, reference_asset]) => ({
    build,
    ordinal,
    state,
    reference_asset,
    ...proposedP2S4Disposition(build, ordinal),
    evidence: P2_S4_SEMANTIC_CANDIDATE,
    rationale: `${build}:${ordinal} has an exact, row-specific semantic disposition.`,
  })),
});

const acceptedMixedP2S4IndependentReview = () => {
  const semantic = mixedP2S4Review();
  return {
    verdict: "GO",
    semantic_credit: "accepted",
    findings: [],
    mappings: semantic.mappings.map((mapping) => ({
      build: mapping.build,
      ordinal: mapping.ordinal,
      state: mapping.state,
      reference_asset: mapping.reference_asset,
      matrix_status: mapping.mapping_status,
      target_route: mapping.target_route,
      target_component: mapping.target_component,
      disposition: mapping.disposition,
      rationale: mapping.rationale,
      evidence: mapping.evidence,
      result: "accepted",
    })),
  };
};

const mixedP2S4Matrix = (matrixText) => {
  const keys = new Set(P2_S4_SEMANTIC_FIXTURE.map(([build, ordinal]) => `${build}:${ordinal}`));
  return matrixText.split(/\r?\n/).map((line, index) => {
    if (index === 0 || !line) return line;
    const fields = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((match) => match[1].replace(/""/g, '"'));
    if (!keys.has(`${fields[0]}:${fields[1]}`)) return line;
    const decision = proposedP2S4Disposition(fields[0], fields[1]);
    fields[14] = decision.mapping_status;
    fields[15] = decision.target_route;
    fields[16] = decision.target_component;
    fields[17] = decision.disposition;
    fields[18] = P2_S4_SEMANTIC_CANDIDATE;
    return fields.map((field) => `"${field.replace(/"/g, '""')}"`).join(",");
  }).join("\n");
};

const acceptedP2S4Review = (targetRoute = "does-not-exist.html", targetComponent = "invented-component") => ({
  mappings: P2_S4_SEMANTIC_FIXTURE.map(([build, ordinal, state, reference_asset]) => ({
    build,
    ordinal,
    state,
    reference_asset,
    matrix_status: "implemented",
    target_route: targetRoute,
    target_component: targetComponent,
    evidence: P2_S4_CLOSURE.independentReview,
    result: "accepted",
  })),
});

const creditedP2S4Matrix = (matrixText, targetRoute = "does-not-exist.html", targetComponent = "invented-component") => {
  const keys = new Set(P2_S4_SEMANTIC_FIXTURE.map(([build, ordinal]) => `${build}:${ordinal}`));
  return matrixText.split(/\r?\n/).map((line, index) => {
    if (index === 0 || !line) return line;
    const fields = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((match) => match[1].replace(/""/g, '"'));
    if (!keys.has(`${fields[0]}:${fields[1]}`)) return line;
    fields[14] = "implemented";
    fields[15] = targetRoute;
    fields[16] = targetComponent;
    fields[17] = "implemented";
    fields[18] = P2_S4_CLOSURE.independentReview;
    return fields.map((field) => `"${field.replace(/"/g, '""')}"`).join(",");
  }).join("\n");
};

const driftP2S4SourceProjection = (matrixText) => {
  const lines = matrixText.split(/\r?\n/);
  const fields = [...lines[1].matchAll(/"((?:[^"]|"")*)"/g)].map((match) => match[1].replace(/""/g, '"'));
  fields[2] = "fabricated-source";
  fields[9] = `${fields[0]}|${fields[2]}|${fields[3]}|${fields[4]}|${fields[5]}`;
  lines[1] = fields.map((field) => `"${field.replace(/"/g, '""')}"`).join(",");
  return lines.join("\n");
};

const ledger = {
  schema_version: 1,
  baseline: 63,
  sprints: [
    { id: "P0", weight: 4, progress: 10, evidence: { scope: ["docs/superpowers/specs/2026-08-19-rateware-production-closure-design.md"] } },
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
  independent_review: ["docs/release/evidence/2026-08-19-p0-vercel.md"],
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
    invalid.sprints[0].evidence = Object.fromEntries(prerequisites[key].map((name) => [name, completeEvidence[name]]));
    invalid.sprints[0].verdicts = key === "independent_review" ? {} : { independent_review: "GO" };
    assert.throws(() => validateLedger(invalid), new RegExp(key, "i"));
  }
});

test("requires an explicit independent review GO verdict", () => {
  const evidence = structuredClone(completeEvidence);
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

test("requires file-backed evidence to use relative paths inside the evaluated checkout", () => {
  const invalidOutside = structuredClone(ledger);
  invalidOutside.sprints[0].evidence.scope = ["C:\\Windows\\win.ini"];
  assert.throws(() => validateLedger(invalidOutside), /P0.*scope.*relative path/i);
});

test("does not permit descriptions under file-backed evidence keys", () => {
  const invalidDescription = structuredClone(ledger);
  invalidDescription.sprints[0].evidence.scope = ["release scope approved"];
  assert.throws(() => validateLedger(invalidDescription), /P0.*scope.*does not exist/i);
});

test("accepts a Vercel command under automated-suite evidence", () => {
  const descriptions = completeLedger();
  descriptions.sprints[0].evidence.automated_suite = ["vercel inspect rateware.vercel.app"];
  validateLedger(descriptions);
});

test("accepts a CORS URL description under preview-smoke evidence", () => {
  const descriptions = completeLedger();
  descriptions.sprints[0].evidence.preview_smoke = ["CORS origin https://rateware.vercel.app"];
  validateLedger(descriptions);
});

test("accepts a dotted release version under deployment evidence", () => {
  const descriptions = completeLedger();
  descriptions.sprints[0].evidence.deployment = ["release evidence version v1.0"];
  validateLedger(descriptions);
});

test("accepts an in-checkout file-backed evidence path with spaces", () => {
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

test("accepts the P1 evidence-plan gate and reports the one-decimal starting score", () => {
  const p1 = completeLedger();
  p1.sprints[1] = {
    id: "P1",
    weight: 9,
    progress: 25,
    evidence: {
      scope: ["docs/superpowers/specs/2026-08-19-rateware-production-closure-design.md"],
      evidence_plan: [
        "docs/superpowers/plans/2026-08-20-rateware-p1-platform55-release-closure.md",
        "docs/release/2026-08-20-p1-platform55-release-ledger.md"
      ]
    }
  };

  validateLedger(p1);
  assert.equal(computeOverallProgress(p1), 69.3);
});

test("keeps the persisted P1 production closure backed while P2 advances", () => {
  const persisted = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const p1 = persisted.sprints.find((sprint) => sprint.id === "P1");
  const trackedEvidence = [
    "docs/superpowers/specs/2026-08-19-rateware-production-closure-design.md",
    "docs/superpowers/plans/2026-08-20-rateware-p1-platform55-release-closure.md",
    "docs/release/2026-08-20-p1-platform55-release-ledger.md",
    "docs/release/evidence/2026-08-20-p1-implementation.md",
    "docs/release/evidence/2026-08-21-p1-final-independent-review.md"
  ];

  assert.equal(p1.progress, 100);
  assert.deepEqual(
    [...p1.evidence.scope, ...p1.evidence.evidence_plan, ...p1.evidence.implementation, ...p1.evidence.independent_review],
    trackedEvidence,
  );
  assert.equal(p1.verdicts.independent_review, "GO");
  for (const key of ["automated_suite", "preview_smoke", "deployment", "production_smoke", "monitoring"]) {
    assert.ok(Array.isArray(p1.evidence[key]) && p1.evidence[key].length > 0, `${key} evidence is required`);
  }
  for (const path of trackedEvidence) execFileSync("git", ["ls-files", "--error-unmatch", "--", path], { encoding: "utf8" });
  validateLedger(persisted);
  assert.equal(computeOverallProgress(persisted), 83);
});

test("preserves P2-S2 immutable actual-route evidence and independent GO while P2 advances", () => {
  const p2Ledger = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const p2 = p2Ledger.sprints.find((sprint) => sprint.id === "P2");

  validateLedger(p2Ledger);
  assert.equal(p2.progress, 100);
  assert.deepEqual(p2.evidence.scope, [
    "docs/superpowers/specs/2026-08-21-rateware-platform55-shell-migration-design.md"
  ]);
  assert.deepEqual(p2.evidence.evidence_plan, [
    "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-master.md",
    "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s2-operate.md",
    "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s3-procurement.md",
    "docs/superpowers/plans/2026-08-21-rateware-platform55-shell-p2-s4-network-service.md",
    P2_S5_CLOSURE.plan,
    productionReadiness.P2_S6_CLOSURE.plan,
  ]);
  assert.deepEqual(p2.evidence.implementation, [
    "docs/release/evidence/2026-08-21-p2-shell-s1-command-center.md",
    "docs/release/evidence/2026-08-21-p2-s2-operate.md",
    "docs/release/evidence/2026-08-21-p2-s3-procurement.md",
    "docs/release/evidence/2026-08-21-p2-s4-network-service.md",
    P2_S5_CLOSURE.implementation,
    productionReadiness.P2_S6_CLOSURE.implementation,
    productionReadiness.P2_S6_PRODUCTION_CLOSURE.record,
    productionReadiness.P2_S6_PRODUCTION_CLOSURE.report,
  ]);
  assert.deepEqual(p2.evidence.independent_review, [
    "docs/release/evidence/2026-08-21-p2-s2-independent-review.md",
    P2_S4_SEMANTIC_CANDIDATE,
    P2_S4_CLOSURE.independentReview,
    P2_S5_CLOSURE.candidate,
    P2_S5_CLOSURE.independentReview,
    productionReadiness.P2_S6_CLOSURE.independentReview,
  ]);
  assert.equal(p2.verdicts.independent_review, "GO");
  assert.deepEqual(p2.evidence.automated_suite, [
    "npm test PASS on exact closure head 18955d06443d3532823da6725eda90041b15b2e8",
    "npm run validate:action-contract PASS with 0 errors and 1 pre-existing warning",
    "npm audit --audit-level=low PASS with 0 vulnerabilities",
    "node tests/platform55-operate-evidence-server.test.mjs PASS with 24 of 24 actual-route captures",
    "npm test PASS on exact Procurement evidence head 23584f218d094a622608c813715247cf16190375",
    "npm run test:platform55:procurement PASS with 90 of 90 actual-route captures",
    ...P2_S4_CLOSURE.automatedSuite,
    "npm test PASS on exact P2-S5 reviewed head e159cd205c631220613809aef0d21f7e1ec4f19b",
    "npm run test:platform55:intelligence-admin PASS with 36 of 36 actual-route captures and 56 of 56 reconciled surfaces",
    ...productionReadiness.P2_S6_CLOSURE.automatedSuite,
    "npm test PASS after the production squash with 46 of 46 production-readiness gates",
  ]);
  const review = readFileSync(p2.evidence.independent_review[0], "utf8");
  assert.match(review, /Verdict:\s*GO/i);
  assert.match(review, /18955d06443d3532823da6725eda90041b15b2e8/);
  assert.match(review, /60eb7f341a09f6d65f4344b8606a9779c339712c/);
  assert.match(review, /No push, pull-request mutation, preview, deployment, promotion, Supabase change/i);
  for (const path of [...p2.evidence.scope, ...p2.evidence.evidence_plan, ...p2.evidence.implementation, ...p2.evidence.independent_review]) {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", path], { encoding: "utf8" });
  }
  assert.equal(computeOverallProgress(p2Ledger), 83);
  assert.match(formatProgressReport(p2Ledger), /P2:\s+100%/);
});

test("credits P2-S3 only from the immutable Procurement matrix and exact local gates", () => {
  const persisted = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const p2 = persisted.sprints.find((sprint) => sprint.id === "P2");

  validateLedger(persisted);
  assert.equal(p2.progress, 100);
  const evidence = readFileSync("docs/release/evidence/2026-08-21-p2-s3-procurement.md", "utf8");
  assert.match(evidence, /Visual subject SHA:\s*`6917246927a6a13e82abf9e1e84b00b27f172ab7`/i);
  assert.match(evidence, /Evidence and full-gate HEAD:\s*`23584f218d094a622608c813715247cf16190375`/i);
  assert.match(evidence, /90 of 90 actual-route captures/i);
  assert.match(evidence, /Local implementation verdict:\s*GO/i);
  assert.match(evidence, /independent review.*pending/i);
  assert.match(evidence, /global Platform55 verdict:\s*NO-GO/i);

  const fakeSuite = structuredClone(persisted);
  fakeSuite.sprints.find((sprint) => sprint.id === "P2").evidence.automated_suite = [
    "fabricated procurement test",
    "fabricated visual matrix"
  ];
  assert.throws(() => validateLedger(fakeSuite), /P2.*P2-S2|P2-S3|automated_suite/i);

  const manifest = JSON.parse(readFileSync("docs/platform55-evidence/p2-s3/6917246927a6a13e82abf9e1e84b00b27f172ab7/manifest.json", "utf8"));
  validateP2S3Manifest(manifest);
  const broadCustomerError = structuredClone(manifest);
  const customerError = broadCustomerError.captures.find((capture) => capture.file === "customer-rfi-error-390x844.png");
  customerError.state_selector = "text:Deterministic";
  customerError.state_marker = "Deterministic Customer RFI evidence error plus offscreen content";
  customerError.state_intersection_ratio = 0.45;
  assert.throws(() => validateP2S3Manifest(broadCustomerError), /Customer RFI error target/i);
  const wrongKind = structuredClone(manifest);
  const publicCapture = wrongKind.captures.find((capture) => capture.kind === "public");
  publicCapture.kind = "unclassified";
  publicCapture.private_controls = 99;
  assert.throws(() => validateP2S3Manifest(wrongKind), /public isolation/i);
  const wrongRoute = structuredClone(manifest);
  wrongRoute.captures.find((capture) => capture.kind === "public").route = "vendors.html";
  assert.throws(() => validateP2S3Manifest(wrongRoute), /public isolation/i);
  const wrongState = structuredClone(manifest);
  wrongState.captures[0].state = "unclassified";
  assert.throws(() => validateP2S3Manifest(wrongState), /public isolation/i);
  const wrongViewport = structuredClone(manifest);
  wrongViewport.captures[0].viewport = "390x844";
  wrongViewport.captures[0].source_frame = "390x844";
  assert.throws(() => validateP2S3Manifest(wrongViewport), /public isolation/i);
  const duplicateTuple = structuredClone(manifest);
  duplicateTuple.captures[1].file = duplicateTuple.captures[0].file;
  assert.throws(() => validateP2S3Manifest(duplicateTuple), /10 x 3 x 3 matrix/i);
  const wrongSourceHash = structuredClone(manifest);
  wrongSourceHash.source_git_blobs[Object.keys(wrongSourceHash.source_git_blobs)[0]] = "0".repeat(40);
  assert.throws(() => validateP2S3Manifest(wrongSourceHash), /digest mismatch/i);
  const wrongCaptureHash = structuredClone(manifest);
  wrongCaptureHash.captures[0].sha256 = "0".repeat(64);
  assert.throws(() => validateP2S3Manifest(wrongCaptureHash), /digest mismatch/i);
  const manifestBlobs = manifest.source_git_blobs;
  const currentBlobs = Object.values(manifestBlobs);
  validateP2S3SourceBlobParity(manifestBlobs, currentBlobs);
  const driftedHeadBlobs = [...currentBlobs];
  driftedHeadBlobs[0] = "0".repeat(40);
  assert.throws(() => validateP2S3SourceBlobParity(manifestBlobs, driftedHeadBlobs), /unapproved current drift/i);
});

test("credits P2-S4 only after semantic fidelity and visual accessibility are independently accepted", () => {
  const persisted = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const p2 = persisted.sprints.find((sprint) => sprint.id === "P2");
  validateLedger(persisted);
  assert.equal(p2.progress, 100);
  assert.ok(p2.evidence.evidence_plan.includes(P2_S4_CLOSURE.plan));
  assert.ok(p2.evidence.implementation.includes(P2_S4_CLOSURE.implementation));
  assert.ok(P2_S4_CLOSURE.automatedSuite.every((entry) => p2.evidence.automated_suite.includes(entry)));
  const evidence = readFileSync(P2_S4_CLOSURE.implementation, "utf8");
  assert.match(evidence, /48 of 48 actual-route captures/i);
  assert.match(evidence, /Build12 semantic equivalence credit:\s*withheld/i);
  assert.match(evidence, /Independent review:\s*NO-GO/i);
  assert.match(evidence, /Global Platform55 verdict:\s*NO-GO/i);
  validateP2S4Manifest(JSON.parse(readFileSync(P2_S4_CLOSURE.manifest, "utf8")));
});

test("records the exact accepted mixed P2-S4 semantic review before granting milestone credit", () => {
  const persisted = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const p2 = persisted.sprints.find((sprint) => sprint.id === "P2");
  const semantic = productionReadiness.validateP2S4SemanticClosureBody(
    readFileSync(P2_S4_SEMANTIC_CANDIDATE, "utf8"),
    { requireGo: false },
  );
  const review = readFileSync(P2_S4_CLOSURE.independentReview, "utf8");
  const record = productionReadiness.validateP2S4IndependentReviewBody(review, { semanticRecord: semantic });
  assert.ok(p2.evidence.independent_review.includes(P2_S4_CLOSURE.independentReview));
  assert.equal(record.reviewed_sha, P2_S4_CLOSURE.reviewedHead);
  assert.equal(record.verdict, "GO");
  assert.equal(record.semantic_credit, "accepted");
  assert.equal(record.mappings.length, 13);
  assert.ok(record.mappings.every((mapping) => (
    mapping.result === "accepted" &&
    ["verified", "dispositioned"].includes(mapping.matrix_status) &&
    mapping.evidence === P2_S4_SEMANTIC_CANDIDATE
  )));
  assert.equal(record.mappings.filter((mapping) => mapping.matrix_status === "verified").length, 1);
  assert.equal(record.mappings.filter((mapping) => mapping.matrix_status === "dispositioned").length, 12);
  assert.equal(p2.progress, 100);
  assert.equal(computeOverallProgress(persisted), 83);
});

test("rejects P2 at 70 without the exact P2-S4 Network and Service closure", () => {
  const fabricated = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const p2 = fabricated.sprints.find((sprint) => sprint.id === "P2");
  p2.progress = 70;
  p2.evidence.automated_suite = p2.evidence.automated_suite.filter((entry) => !entry.includes("P2-S4") && !entry.includes("network-service") && !entry.includes("37 files"));

  assert.throws(() => validateLedger(fabricated), /P2-S4/i);
});

test("rejects P2-S4 credit without an exact independent semantic review", () => {
  const fabricated = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const p2 = fabricated.sprints.find((sprint) => sprint.id === "P2");
  p2.progress = 70;
  p2.evidence.automated_suite.push(...P2_S4_CLOSURE.automatedSuite);
  p2.evidence.independent_review = p2.evidence.independent_review.filter((entry) => entry !== P2_S4_CLOSURE.independentReview);

  assert.throws(() => validateLedger(fabricated), /P2-S4 independent review/i);
});

test("rejects a fabricated P2-S4 review even when it contains every declarative phrase", () => {
  assert.equal(
    typeof productionReadiness.validateP2S4IndependentReviewBody,
    "function",
    "production readiness must expose the content-addressed P2-S4 review validator",
  );
  const fabricated = JSON.stringify({
    verdict: "GO",
    reviewed_sha: P2_S4_CLOSURE.gateHead,
    visual_subject: P2_S4_CLOSURE.subject,
    evidence_head: P2_S4_CLOSURE.evidenceHead,
    semantic_credit: "accepted",
    review_mode: "independent-detached-read-only",
  });
  assert.throws(
    () => productionReadiness.validateP2S4IndependentReviewBody(fabricated),
    /digest mismatch/i,
  );
});

test("rejects P2-S4 semantic credit while the thirteen reference mappings remain uncredited", () => {
  assert.equal(
    typeof productionReadiness.validateP2S4SemanticReconciliation,
    "function",
    "production readiness must expose the exact thirteen-row reconciliation validator",
  );
  const acceptedReview = {
    mappings: P2_S4_SEMANTIC_FIXTURE.map(([build, ordinal, state, reference_asset]) => ({
      build,
      ordinal,
      state,
      reference_asset,
      target_route: "semantically-reviewed.html",
      target_component: "semantically reviewed surface",
      evidence: P2_S4_CLOSURE.independentReview,
      result: "accepted",
    })),
  };
  assert.throws(
    () => productionReadiness.validateP2S4SemanticReconciliation(
      readFileSync("docs/platform55-shell-build-matrix.csv", "utf8"),
      acceptedReview,
    ),
    /build_05:5516.*implemented/i,
  );
});

test("accepts only the exact detached P2-S5 independent review without inflating reference-only surfaces", () => {
  const candidate = validateP2S5SurfaceCandidateBody(readFileSync(P2_S5_CLOSURE.candidate, "utf8"));
  const reviewBody = readFileSync(P2_S5_CLOSURE.independentReview, "utf8");
  const review = validateP2S5IndependentReviewBody(reviewBody, { candidateRecord: candidate });
  assert.equal(review.reviewed_sha, P2_S5_CLOSURE.reviewedHead);
  assert.equal(review.verdict, "GO");
  assert.equal(review.semantic_credit, "accepted");
  assert.equal(review.mappings.length, 56);
  assert.equal(review.mappings.filter((mapping) => mapping.disposition === "reference_only").length, 17);
  assert.equal(review.mappings.filter((mapping) => mapping.mapping_status === "verified").length, 39);
  assert.equal(review.mappings.filter((mapping) => mapping.mapping_status === "dispositioned").length, 17);
  assert.throws(
    () => validateP2S5IndependentReviewBody(reviewBody.replace('"verdict": "GO"', '"verdict": "NO-GO"'), { candidateRecord: candidate }),
    /digest mismatch/i,
  );
});

test("credits P2-S5 only from the exact candidate, review, captures, and detached gates", () => {
  const persisted = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const p2 = persisted.sprints.find((sprint) => sprint.id === "P2");
  validateLedger(persisted);
  assert.equal(p2.progress, 100);
  assert.equal(computeOverallProgress(persisted), 83);
  assert.ok(p2.evidence.evidence_plan.includes(P2_S5_CLOSURE.plan));
  assert.ok(p2.evidence.implementation.includes(P2_S5_CLOSURE.implementation));
  assert.ok(p2.evidence.independent_review.includes(P2_S5_CLOSURE.candidate));
  assert.ok(p2.evidence.independent_review.includes(P2_S5_CLOSURE.independentReview));
  assert.ok(P2_S5_CLOSURE.automatedSuite.every((entry) => p2.evidence.automated_suite.includes(entry)));

  const missingReview = structuredClone(persisted);
  missingReview.sprints.find((sprint) => sprint.id === "P2").evidence.independent_review = p2.evidence.independent_review.filter((entry) => entry !== P2_S5_CLOSURE.independentReview);
  assert.throws(() => validateLedger(missingReview), /P2-S5 independent_review/i);

  const missingSuite = structuredClone(persisted);
  missingSuite.sprints.find((sprint) => sprint.id === "P2").evidence.automated_suite = p2.evidence.automated_suite.filter((entry) => !entry.includes("P2-S5 reviewed head"));
  assert.throws(() => validateLedger(missingSuite), /P2-S5 automated_suite/i);
});

test("credits P2-S6 only from the exact accessible product candidate and detached independent GO", () => {
  const persisted = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const p2 = persisted.sprints.find((sprint) => sprint.id === "P2");
  const closure = productionReadiness.P2_S6_CLOSURE;

  validateLedger(persisted);
  assert.equal(p2.progress, 100);
  assert.equal(computeOverallProgress(persisted), 83);
  assert.ok(p2.evidence.evidence_plan.includes(closure.plan));
  assert.ok(p2.evidence.implementation.includes(closure.implementation));
  assert.ok(p2.evidence.independent_review.includes(closure.independentReview));
  assert.ok(closure.automatedSuite.every((entry) => p2.evidence.automated_suite.includes(entry)));

  const reviewBody = readFileSync(closure.independentReview, "utf8");
  const review = productionReadiness.validateP2S6IndependentReviewBody(reviewBody);
  assert.equal(review.verdict, "GO");
  assert.equal(review.reviewedClosure, closure.reviewedClosure);
  assert.equal(review.productCandidate, closure.productCandidate);
  assert.equal(review.productTree, closure.productTree);
  assert.equal(review.manifestSha256, closure.manifestSha256);
  assert.equal(review.routes, 29);
  assert.equal(review.captures, 42);
  assert.equal(review.contrastSamples, 3312);
  assert.equal(review.minimumContrast, 4.521);
  assert.equal(review.missingNames, 0);
  assert.equal(review.contrastFailures, 0);
  assert.equal(review.p0, 0);
  assert.equal(review.p1, 0);
  assert.equal(review.p2, 0);

  const missingReview = structuredClone(persisted);
  missingReview.sprints.find((sprint) => sprint.id === "P2").evidence.independent_review = p2.evidence.independent_review.filter((entry) => entry !== closure.independentReview);
  assert.throws(() => validateLedger(missingReview), /P2-S6 independent_review/i);

  const missingSuite = structuredClone(persisted);
  missingSuite.sprints.find((sprint) => sprint.id === "P2").evidence.automated_suite = p2.evidence.automated_suite.filter((entry) => !entry.includes("3,312 contrast samples"));
  assert.throws(() => validateLedger(missingSuite), /P2-S6 automated_suite/i);

  assert.throws(
    () => productionReadiness.validateP2S6IndependentReviewBody(reviewBody.replace("Verdict: GO", "Verdict: NO-GO")),
    /digest mismatch|verdict/i,
  );
  assert.throws(
    () => productionReadiness.validateP2S6IndependentReviewBody(reviewBody.replace("Minimum contrast: `4.521:1`", "Minimum contrast: `1:1`")),
    /digest mismatch|contrast/i,
  );
});

const validP2S6ProductionRecord = () => ({
  schema_version: 1,
  mode: "read_only",
  environment: "production",
  release: {
    sha: "7a146765ac38bd18a320f32f7e3ed7a7f13c8da7",
    tree: "f044987b224c54578a0ee19db398f612d67e4b76",
    deployment_id: "dpl_3P6nWwoaqUeDktTMi7HifGG6XAwk",
    deployment_url: "rateware-gk93pxg5n-elandopando8892s-projects.vercel.app",
    production_alias: "rateware.vercel.app",
    state: "READY",
    manual_promotion: false,
  },
  routes: [
    ["command-center", "tenant"],
    ["operate", "tenant"],
    ["procurement", "tenant"],
    ["network-service", "tenant"],
    ["intelligence", "tenant"],
    ["administration", "tenant"],
    ["public-carrier", "public"],
  ].map(([id, shell]) => ({ id, shell, passed: true, overflow: false, console_errors: 0 })),
  responsive: {
    viewports: ["1440x900", "1024x768", "390x844"],
    mobile_navigation: true,
    focus_trap: true,
    focus_restoration: true,
    viewport_overflow: 0,
  },
  monitoring: [
    ["T+0", "2026-08-23T23:21:00.000Z"],
    ["T+5", "2026-08-23T23:26:00.000Z"],
    ["T+15", "2026-08-23T23:36:00.000Z"],
  ].map(([checkpoint, observed_at]) => ({ checkpoint, observed_at, deployment_ready: true, runtime_errors: 0, unexpected_writes: 0 })),
  supabase: {
    project_status: "ACTIVE_HEALTHY",
    persistent_preview_count: 1,
    unexpected_writes: 0,
    mutation_authorized: false,
  },
  verdict: "GO",
});

test("requires exact fail-closed production evidence before crediting P2 at 100", () => {
  const record = validP2S6ProductionRecord();
  assert.deepEqual(productionReadiness.validateP2S6ProductionRecord(record), record);

  for (const [label, mutate] of [
    ["release SHA", (value) => { value.release.sha = "0".repeat(40); }],
    ["deployment state", (value) => { value.release.state = "ERROR"; }],
    ["manual promotion", (value) => { value.release.manual_promotion = true; }],
    ["route failure", (value) => { value.routes[2].passed = false; }],
    ["console error", (value) => { value.routes[4].console_errors = 1; }],
    ["missing viewport", (value) => { value.responsive.viewports.pop(); }],
    ["runtime error", (value) => { value.monitoring[1].runtime_errors = 1; }],
    ["short monitoring window", (value) => { value.monitoring[2].observed_at = "2026-08-23T23:30:00.000Z"; }],
    ["unexpected write", (value) => { value.supabase.unexpected_writes = 1; }],
    ["mutation authorization", (value) => { value.supabase.mutation_authorized = true; }],
    ["verdict", (value) => { value.verdict = "NO-GO"; }],
  ]) {
    const changed = structuredClone(record);
    mutate(changed);
    assert.throws(() => productionReadiness.validateP2S6ProductionRecord(changed), new RegExp(label, "i"));
  }

  const persisted = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const persistedP2 = persisted.sprints.find((sprint) => sprint.id === "P2");
  validateLedger(persisted);
  assert.equal(persistedP2.progress, 100);
  assert.equal(computeOverallProgress(persisted), 83);
  assert.ok(persistedP2.evidence.implementation.includes(productionReadiness.P2_S6_PRODUCTION_CLOSURE.record));
  assert.ok(persistedP2.evidence.implementation.includes(productionReadiness.P2_S6_PRODUCTION_CLOSURE.report));
  assert.ok(persistedP2.evidence.preview_smoke.includes(productionReadiness.P2_S6_PRODUCTION_CLOSURE.previewSmoke));
  assert.ok(persistedP2.evidence.deployment.includes(productionReadiness.P2_S6_PRODUCTION_CLOSURE.deployment));
  assert.ok(persistedP2.evidence.production_smoke.includes(productionReadiness.P2_S6_PRODUCTION_CLOSURE.productionSmoke));
  assert.ok(persistedP2.evidence.monitoring.includes(productionReadiness.P2_S6_PRODUCTION_CLOSURE.monitoring));
  assert.equal(persistedP2.verdicts.production_release, "GO");
  assert.deepEqual(
    productionReadiness.validateP2S6ProductionRecord(JSON.parse(readFileSync(productionReadiness.P2_S6_PRODUCTION_CLOSURE.record, "utf8"))),
    JSON.parse(readFileSync(productionReadiness.P2_S6_PRODUCTION_CLOSURE.record, "utf8")),
  );

  const fabricated = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const p2 = fabricated.sprints.find((sprint) => sprint.id === "P2");
  p2.progress = 100;
  p2.evidence.production_smoke = ["generic smoke PASS"];
  p2.evidence.monitoring = ["generic monitoring PASS"];
  p2.verdicts.production_release = "GO";
  assert.throws(() => validateLedger(fabricated), /production/i);
});

test("accepts a complete mixed P2-S4 semantic candidate without granting independent credit", () => {
  const reconciled = productionReadiness.validateP2S4SemanticReconciliation(
    mixedP2S4Matrix(readFileSync("docs/platform55-shell-build-matrix.csv", "utf8")),
    mixedP2S4Review(),
    { requireGo: false },
  );
  assert.equal(reconciled.verdict, "PENDING-INDEPENDENT-REVIEW");
  assert.equal(reconciled.semantic_credit, "withheld");
  assert.equal(reconciled.mappings.filter((mapping) => mapping.mapping_status === "verified").length, 1);
  assert.equal(reconciled.mappings.filter((mapping) => mapping.mapping_status === "dispositioned").length, 12);
});

test("accepts only an exact independent review of the mixed P2-S4 semantic dispositions", () => {
  const semantic = mixedP2S4Review();
  const accepted = acceptedMixedP2S4IndependentReview();
  const validated = productionReadiness.validateP2S4IndependentReviewRecord(accepted, semantic);
  assert.equal(validated.semantic_credit, "accepted");
  assert.equal(validated.mappings.filter((mapping) => mapping.matrix_status === "verified").length, 1);
  assert.equal(validated.mappings.filter((mapping) => mapping.matrix_status === "dispositioned").length, 12);

  const inventedTarget = structuredClone(accepted);
  inventedTarget.mappings[0].target_route = "provider-onboarding.html";
  inventedTarget.mappings[0].target_component = "provider-onboarding";
  assert.throws(
    () => productionReadiness.validateP2S4IndependentReviewRecord(inventedTarget, semantic),
    /semantic decision mismatch/i,
  );

  const alteredSharedStatus = structuredClone(accepted);
  alteredSharedStatus.mappings.find((mapping) => mapping.ordinal === "44").matrix_status = "implemented";
  assert.throws(
    () => productionReadiness.validateP2S4IndependentReviewRecord(alteredSharedStatus, semantic),
    /semantic decision mismatch/i,
  );
});

test("accepts only the pinned P2-S4 semantic closure candidate and keeps GO fail-closed", () => {
  assert.equal(
    typeof productionReadiness.validateP2S4SemanticClosureBody,
    "function",
    "production readiness must expose the content-addressed semantic candidate validator",
  );
  const body = readFileSync(P2_S4_SEMANTIC_CANDIDATE, "utf8");
  const record = productionReadiness.validateP2S4SemanticClosureBody(body, { requireGo: false });
  assert.equal(record.verdict, "PENDING-INDEPENDENT-REVIEW");
  assert.equal(record.semantic_credit, "withheld");
  assert.equal(record.mappings.length, 13);
  assert.throws(
    () => productionReadiness.validateP2S4SemanticClosureBody(body),
    /independent GO/i,
  );
  assert.throws(
    () => productionReadiness.validateP2S4SemanticClosureBody(body.replace("shipment-execution communication", "fabricated communication"), { requireGo: false }),
    /digest mismatch/i,
  );
});

test("rejects a non-implementation P2-S4 disposition that claims an executable target", () => {
  const review = mixedP2S4Review();
  const mapping = review.mappings.find((candidate) => candidate.build === "build_07" && candidate.ordinal === "14");
  mapping.target_route = "provider-communications.html";
  mapping.target_component = "communications";
  assert.throws(
    () => productionReadiness.validateP2S4SemanticReconciliation(
      mixedP2S4Matrix(readFileSync("docs/platform55-shell-build-matrix.csv", "utf8")),
      review,
      { requireGo: false },
    ),
    /non-implementation.*target/i,
  );
});

test("rejects a shared P2-S4 surface without exact route, component, and evidence", () => {
  const review = mixedP2S4Review();
  const mapping = review.mappings.find((candidate) => candidate.build === "build_10" && candidate.ordinal === "44");
  mapping.target_component = "";
  mapping.evidence = "";
  assert.throws(
    () => productionReadiness.validateP2S4SemanticReconciliation(
      mixedP2S4Matrix(readFileSync("docs/platform55-shell-build-matrix.csv", "utf8")),
      review,
      { requireGo: false },
    ),
    /shared_surface.*route.*component.*evidence/i,
  );
});

test("rejects P2-S4 semantic credit from a truncated thirteen-row matrix", () => {
  const credited = creditedP2S4Matrix(readFileSync("docs/platform55-shell-build-matrix.csv", "utf8"));
  const keys = new Set(P2_S4_SEMANTIC_FIXTURE.map(([build, ordinal]) => `${build}:${ordinal}`));
  const lines = credited.split(/\r?\n/);
  const truncated = [lines[0], ...lines.slice(1).filter((line) => {
    const match = line.match(/^"([^"]+)","([^"]+)"/);
    return match && keys.has(`${match[1]}:${match[2]}`);
  })].join("\n");
  assert.throws(
    () => productionReadiness.validateP2S4SemanticReconciliation(truncated, acceptedP2S4Review()),
    /exact 1,150/i,
  );
});

test("rejects P2-S4 semantic credit for a target outside the real S4 route inventory", () => {
  const credited = creditedP2S4Matrix(readFileSync("docs/platform55-shell-build-matrix.csv", "utf8"));
  assert.throws(
    () => productionReadiness.validateP2S4SemanticReconciliation(credited, acceptedP2S4Review()),
    /does-not-exist|real P2-S4 target route/i,
  );
});

test("rejects P2-S4 semantic credit for an invented component on a real S4 route", () => {
  const credited = creditedP2S4Matrix(readFileSync("docs/platform55-shell-build-matrix.csv", "utf8"), "shipper-crm.html", "invented-component");
  assert.throws(
    () => productionReadiness.validateP2S4SemanticReconciliation(
      credited,
      acceptedP2S4Review("shipper-crm.html", "invented-component"),
    ),
    /declared component/i,
  );
});

test("rejects P2-S4 semantic credit when the route map invents the reviewed component", () => {
  const credited = creditedP2S4Matrix(readFileSync("docs/platform55-shell-build-matrix.csv", "utf8"), "shipper-crm.html", "invented-component");
  const routeMap = readFileSync("docs/platform55-shell-route-map.csv", "utf8");
  const driftedRouteMap = routeMap.replace(
    /^(shipper-crm\.html,[^\r\n]*?,)(contract_ready,[^\r\n]*)$/m,
    (row, prefix, suffix) => `${prefix.replace(/,([^,]*),$/, ",$1;invented-component,")}${suffix}`,
  );
  assert.notEqual(driftedRouteMap, routeMap, "the route-map mutation fixture must alter shipper-crm surfaces");
  assert.throws(
    () => productionReadiness.validateP2S4SemanticReconciliation(
      credited,
      acceptedP2S4Review("shipper-crm.html", "invented-component"),
      { routeMapText: driftedRouteMap },
    ),
    /route map.*digest/i,
  );
});

test("rejects P2-S4 semantic credit when the immutable Build source projection drifts", () => {
  const credited = creditedP2S4Matrix(readFileSync("docs/platform55-shell-build-matrix.csv", "utf8"), "shipper-crm.html", "shippers");
  assert.throws(
    () => productionReadiness.validateP2S4SemanticReconciliation(
      driftP2S4SourceProjection(credited),
      acceptedP2S4Review("shipper-crm.html", "shippers"),
    ),
    /source projection/i,
  );
});

test("rejects fabricated P2-S2 closure evidence", () => {
  const persisted = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const fakeSuite = structuredClone(persisted);
  fakeSuite.sprints.find((sprint) => sprint.id === "P2").evidence.automated_suite = ["fabricated 1", "fabricated 2", "fabricated 3", "fabricated 4"];
  assert.throws(() => validateLedger(fakeSuite), /P2.*automated_suite/i);

  const wrongReview = structuredClone(persisted);
  wrongReview.sprints.find((sprint) => sprint.id === "P2").evidence.independent_review = ["docs/release/evidence/2026-08-19-p0-independent-review.md"];
  assert.throws(() => validateLedger(wrongReview), /P2.*independent_review/i);

  const missingVerdict = structuredClone(persisted);
  missingVerdict.sprints.find((sprint) => sprint.id === "P2").verdicts = {};
  assert.throws(() => validateLedger(missingVerdict), /P2.*independent_review.*GO/i);

  const review = readFileSync("docs/release/evidence/2026-08-21-p2-s2-independent-review.md", "utf8");
  validateP2S2ReviewBody(review);
  assert.throws(
    () => validateP2S2ReviewBody(review.replace("Findings: P0 0, P1 0, P2 0.", "Findings: P0 0, P1 0, P2 2.")),
    /digest/i,
  );
  assert.throws(
    () => validateP2S2ReviewBody(review.replace("Full `npm test`: PASS, exit 0.", "Full `npm test`: FAIL, exit 1.")),
    /digest/i,
  );
});

test("does not credit P2-S2 visual completion without immutable actual-route evidence", () => {
  const persisted = JSON.parse(readFileSync("docs/release/production-readiness-ledger.json", "utf8"));
  const p2 = persisted.sprints.find((sprint) => sprint.id === "P2");
  if (p2.progress < 45) return;

  const evidence = readFileSync("docs/release/evidence/2026-08-21-p2-s2-operate.md", "utf8");
  const candidate = evidence.match(/Final candidate SHA:\s*`([0-9a-f]{40})`/i)?.[1];
  assert.ok(candidate, "45% requires the immutable final candidate SHA");

  const evidenceDir = `docs/platform55-evidence/p2-s2/${candidate}`;
  assert.ok(existsSync(evidenceDir), "45% requires a SHA-scoped visual evidence directory");

  const pngs = readdirSync(evidenceDir).filter((name) => name.endsWith(".png"));
  assert.equal(pngs.length, 24, "45% requires four actual routes x two states x three viewports");
  assert.match(evidence, /actual route HTML and page modules/i);
  assert.doesNotMatch(evidence, /synthetic page|synthetic reconstruction/i);
});
