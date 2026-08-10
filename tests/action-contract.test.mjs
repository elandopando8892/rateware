import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACTION_CONTRACT } from "../supabase/functions/_shared/action-contract.mjs";
import { discoverGovernableSurfaces, formatValidationResult, validateActionContract } from "../tools/action-contract-lib.mjs";

const baseEntry = {
  contractVersion: "1.0.0",
  canonicalId: "edge.example.read_item",
  actionName: "read_item",
  sourceKind: "edge-selector",
  sourceFile: "source.ts",
  handler: "readItem",
  endpoint: "POST /example body.action",
  businessModule: "Platform/Security",
  operation: "read",
  resource: "example",
  access: "read",
  exposure: "human",
  sensitivity: "medium",
  tenantRelevance: "tenant-scoped",
  proposedPermissionKey: "example.read",
  functionalOwner: "Platform/Security",
  decisionStatus: "pending_human_approval",
  lifecycle: "active",
  replacementAction: null,
  sourceFingerprint: "a".repeat(64),
  notes: "fixture"
};

const baseActual = {
  canonicalId: baseEntry.canonicalId,
  actionName: baseEntry.actionName,
  sourceKind: baseEntry.sourceKind,
  sourceFile: baseEntry.sourceFile,
  handler: baseEntry.handler,
  endpoint: baseEntry.endpoint,
  exposureHint: baseEntry.exposure,
  sourceFingerprint: baseEntry.sourceFingerprint
};

function contract(...surfaces) {
  return {
    contractVersion: "1.0.0",
    expectedCounts: { governable: surfaces.length, edge: surfaces.length, postgres: 0, ratewareApi: 0 },
    surfaces,
    nonGovernableDeclarations: []
  };
}

function codes(result) {
  return result.issues.map((entry) => entry.code);
}

const valid = validateActionContract(contract(baseEntry), [baseActual]);
assert.equal(valid.ok, true, "valid inventory should pass");

assert.ok(codes(validateActionContract(contract(baseEntry), [baseActual, { ...baseActual, canonicalId: "edge.example.new_action" }])).includes("UNREGISTERED_SURFACE"));
assert.ok(codes(validateActionContract(contract(baseEntry, { ...baseEntry }), [baseActual])).includes("DUPLICATE_CANONICAL_ID"));
assert.ok(codes(validateActionContract(contract({ ...baseEntry, handler: "missingHandler" }), [baseActual])).includes("SENSITIVE_SOURCE_CHANGE"));
assert.ok(codes(validateActionContract(contract({ ...baseEntry, lifecycle: "alias", replacementAction: "edge.unknown.target" }), [baseActual])).includes("ALIAS_TARGET_UNKNOWN"));
assert.ok(codes(validateActionContract(contract({ ...baseEntry, decisionStatus: "allowed" }), [baseActual])).includes("INVALID_DECISION_STATUS"));
assert.ok(codes(validateActionContract(contract({ ...baseEntry, access: "write", sensitivity: "" }), [baseActual])).includes("WRITE_WITHOUT_SENSITIVITY"));
assert.ok(codes(validateActionContract(contract(baseEntry), [{ ...baseActual, exposureHint: "public" }])).includes("EXPOSURE_CHANGED"));
assert.ok(codes(validateActionContract(contract({ ...baseEntry, sourceKind: "postgres-function", exposure: "human" }), [{ ...baseActual, sourceKind: "postgres-function" }])).includes("SERVICE_ROLE_EXPOSED"));

const incompatiblePermission = { ...baseEntry, canonicalId: "edge.example.write_item", actionName: "write_item", operation: "manage", access: "write" };
assert.ok(codes(validateActionContract(contract(baseEntry, incompatiblePermission), [baseActual, { ...baseActual, canonicalId: incompatiblePermission.canonicalId, actionName: incompatiblePermission.actionName }])).includes("INCOMPATIBLE_PERMISSION_REUSE"));

const aliasA = { ...baseEntry, canonicalId: "edge.example.alias_a", actionName: "alias_a", lifecycle: "alias", replacementAction: "edge.example.alias_b" };
const aliasB = { ...baseEntry, canonicalId: "edge.example.alias_b", actionName: "alias_b", lifecycle: "alias", replacementAction: "edge.example.alias_a" };
assert.ok(codes(validateActionContract(contract(aliasA, aliasB), [])).includes("ALIAS_CYCLE"));

const deterministicContract = contract(baseEntry);
const deterministicActual = [{ ...baseActual, canonicalId: "edge.z" }, { ...baseActual, canonicalId: "edge.a" }];
assert.equal(
  formatValidationResult(validateActionContract(deterministicContract, deterministicActual)),
  formatValidationResult(validateActionContract(deterministicContract, deterministicActual.toReversed())),
  "output must be deterministic"
);

const secretMarker = "SENSITIVE_FIXTURE_VALUE_SHOULD_NOT_APPEAR";
const secretResult = validateActionContract(contract({ ...baseEntry, notes: secretMarker }), [{ ...baseActual, canonicalId: "edge.unregistered" }]);
assert.equal(formatValidationResult(secretResult).includes(secretMarker), false, "output must not reproduce notes or secrets");

const temp = mkdtempSync(join(tmpdir(), "rateware-action-contract-"));
try {
  mkdirSync(join(temp, "nested"));
  writeFileSync(join(temp, "source.ts"), "async function readItem() {}\n");
  const missingHandler = validateActionContract(contract({ ...baseEntry, handler: "notThere" }), [], { repoRoot: temp });
  assert.ok(codes(missingHandler).includes("HANDLER_MISSING"), "missing handler must block");
} finally {
  rmSync(temp, { recursive: true, force: true });
}

if (!process.argv.includes("--unit-only")) {
  const discovered = discoverGovernableSurfaces(process.cwd());
  const baseline = validateActionContract(ACTION_CONTRACT, discovered, { repoRoot: process.cwd() });
  assert.equal(baseline.ok, true, formatValidationResult(baseline));
  assert.equal(discovered.length, 349, "baseline must reproduce 349 governable surfaces");
  assert.equal(discovered.filter((entry) => entry.canonicalId.startsWith("edge.")).length, 284);
  assert.equal(discovered.filter((entry) => entry.canonicalId.startsWith("rpc.")).length, 65);
}

console.log("Action contract tests passed.");
