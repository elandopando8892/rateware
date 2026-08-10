import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACTION_CONTRACT } from "../supabase/functions/_shared/action-contract.mjs";
import {
  discoverGovernableInventory,
  discoverGovernableSurfaces,
  discoverPostgresFunctionsFromSources,
  discoverSelectorSurfacesFromText,
  fingerprint,
  formatValidationResult,
  metadataFingerprint,
  semanticTokens,
  validateActionContract,
  validationExitCode
} from "../tools/action-contract-lib.mjs";

function codes(result) {
  return result.issues.map((entry) => entry.code);
}

function edgeSource(body, declarations = "") {
  return declarations + "\nDeno.serve(async () => { const body = {}; " + body + " });\n";
}

function entryFrom(actual, overrides = {}) {
  return {
    contractVersion: "1.1.0",
    canonicalId: actual.canonicalId,
    actionName: actual.actionName,
    sourceKind: actual.sourceKind,
    sourceFile: actual.sourceFile,
    handler: actual.handler,
    endpoint: actual.endpoint,
    businessModule: "Test",
    operation: "read",
    resource: "fixture",
    access: "read",
    exposure: actual.exposureHint,
    sensitivity: "medium",
    tenantRelevance: "tenant-scoped",
    proposedPermissionKey: "fixture.read",
    functionalOwner: "Test",
    decisionStatus: actual.exposureHint === "internal/service-role" ? "internal_only" : "pending_human_approval",
    lifecycle: "active",
    replacementAction: null,
    sourceFingerprint: actual.sourceFingerprint,
    analysisCoverage: actual.analysisCoverage,
    dependencyFiles: actual.dependencyFiles || [actual.sourceFile],
    rpcSignature: actual.rpcSignature || null,
    notes: "independent fixture",
    ...overrides
  };
}

function contractFor(surfaces, discovered) {
  const metadata = {};
  const authorization = {};
  for (const entry of surfaces) metadata[entry.canonicalId] = metadataFingerprint(entry);
  for (const actual of discovered) authorization[actual.canonicalId] = actual.authorizationFingerprint;
  for (const entry of surfaces) if (!authorization[entry.canonicalId]) authorization[entry.canonicalId] = entry.sourceFingerprint;
  return {
    contractVersion: "1.1.0",
    expectedCounts: {
      governable: discovered.length,
      edge: discovered.filter((entry) => entry.canonicalId.startsWith("edge.")).length,
      postgres: discovered.filter((entry) => entry.canonicalId.startsWith("rpc.")).length,
      ratewareApi: discovered.filter((entry) => entry.canonicalId.startsWith("edge.rateware-api.")).length
    },
    reviewedMetadataFingerprints: metadata,
    reviewedAuthorizationFingerprints: authorization,
    surfaces,
    nonGovernableDeclarations: []
  };
}

function selector(source, functionName = "fixture-api") {
  return discoverSelectorSurfacesFromText(functionName, "supabase/functions/" + functionName + "/index.ts", source, null);
}

// 1-4: handler states are independently derived from source fixtures.
const inlineActual = selector(edgeSource('if (body.action === "inline_action") { return jsonResponse({ ok: true }); }'));
assert.equal(inlineActual[0].handlerStatus, "inline-real");
assert.equal(validateActionContract(contractFor([entryFrom(inlineActual[0])], inlineActual), inlineActual).ok, true);

const namedSource = edgeSource('if (body.action === "named_action") { return await namedHandler(); }', "async function namedHandler() { return { ok: true }; }");
const namedActual = selector(namedSource);
assert.equal(namedActual[0].handlerStatus, "named-existing");
assert.equal(namedActual[0].handler, "namedHandler");
assert.equal(validateActionContract(contractFor([entryFrom(namedActual[0])], namedActual), namedActual).ok, true);

const missingActual = selector(edgeSource('if (body.action === "missing_action") { return await absentHandler(); }'));
assert.equal(missingActual[0].handlerStatus, "named-missing");
assert.ok(codes(validateActionContract(contractFor([entryFrom(missingActual[0])], missingActual), missingActual)).includes("HANDLER_MISSING"));

const ambiguousActual = selector(edgeSource('if (body.action === "ambiguous_action") { const selected = registry[key]; }'));
assert.equal(ambiguousActual[0].handlerStatus, "undetermined");
assert.ok(codes(validateActionContract(contractFor([entryFrom(ambiguousActual[0])], ambiguousActual), ambiguousActual)).includes("HANDLER_UNDETERMINED"));

// 5-10: sensitive metadata changes are blocked unless the reviewed fingerprint is deliberately refreshed.
for (const [field, value] of [
  ["actionName", "renamed_action"],
  ["access", "write"],
  ["exposure", "public"],
  ["tenantRelevance", "platform-scoped"],
  ["sensitivity", "critical"],
  ["proposedPermissionKey", "fixture.manage"]
]) {
  const entry = entryFrom(inlineActual[0]);
  const fixture = contractFor([entry], inlineActual);
  entry[field] = value;
  const result = validateActionContract(fixture, inlineActual);
  assert.ok(codes(result).includes("SENSITIVE_METADATA_CHANGED"), field + " drift must block");
}

// 11-13: signature-aware RPC state, overloads, drops, and disposition.
const overloaded = discoverPostgresFunctionsFromSources([{
  sourceFile: "supabase/migrations/fixture.sql",
  source: "create function public.quote_score(value integer) returns integer language sql as $$ select value $$; create function public.quote_score(value text) returns text language sql as $$ select value $$;"
}]);
assert.equal(overloaded.length, 2);
assert.notEqual(overloaded[0].canonicalId, overloaded[1].canonicalId);

const dropped = discoverPostgresFunctionsFromSources([{
  sourceFile: "supabase/migrations/fixture.sql",
  source: "create function public.retired(value integer) returns integer language sql as $$ select value $$; drop function public.retired(integer);"
}]);
assert.equal(dropped.length, 0);

const retiredActual = discoverPostgresFunctionsFromSources([{
  sourceFile: "supabase/migrations/fixture.sql",
  source: "create function public.retired(value integer) returns integer language sql as $$ select value $$;"
}])[0];
const retiredEntry = entryFrom(retiredActual);
const retiredContract = contractFor([retiredEntry], []);
assert.ok(codes(validateActionContract(retiredContract, [])).includes("REMOVED_WITHOUT_DISPOSITION"));

const quoted = discoverPostgresFunctionsFromSources([{
  sourceFile: "supabase/migrations/quoted.sql",
  source: 'create function "Ops"."Score"(value integer) returns integer language sql as $$ select value $$;'
}]);
assert.equal(quoted[0].canonicalId, 'rpc."Ops"."Score"(integer)');

// 14-17: repository-driven Edge universe, switch/map support, and explicit dynamic ambiguity.
const switchSource = edgeSource('switch (cleanText(body.action)) { case "switch_action": return await switchHandler(); default: throw new Error("x"); }', "async function switchHandler() { return {}; }");
const switchActual = selector(switchSource);
assert.equal(switchActual.some((entry) => entry.actionName === "switch_action"), true);

const mapSource = 'async function mapHandler() { return {}; }\nconst handlers = { "map_action": mapHandler };\n' +
  'Deno.serve(async () => { const body = {}; const selected = handlers[body.action]; return await selected(); });\n';
const mapActual = selector(mapSource);
assert.equal(mapActual.some((entry) => entry.actionName === "map_action"), true);

const dynamicActual = selector('Deno.serve(async () => { const body = {}; const selected = unknownRegistry[body.action]; return await selected(); });');
assert.equal(dynamicActual.length, 0);
assert.equal(dynamicActual.dynamicDispatch, true);

const fixtureRoot = mkdtempSync(join(tmpdir(), "rateware-action-hardening-"));
try {
  mkdirSync(join(fixtureRoot, "supabase", "functions", "new-edge-api"), { recursive: true });
  mkdirSync(join(fixtureRoot, "supabase", "migrations"), { recursive: true });
  writeFileSync(join(fixtureRoot, "package.json"), '{"private":true}\n');
  writeFileSync(join(fixtureRoot, "supabase", "functions", "new-edge-api", "index.ts"), edgeSource('if (body.action === "new_edge_action") { return jsonResponse({ ok: true }); }'));
  const inventory = discoverGovernableInventory(fixtureRoot);
  assert.equal(inventory.surfaces.some((entry) => entry.canonicalId === "edge.new-edge-api.new_edge_action"), true);

  writeFileSync(join(fixtureRoot, "supabase", "functions", "new-edge-api", "index.ts"), 'Deno.serve(async () => { const body = {}; const selected = registry[body.action]; return await selected(); });\n');
  const dynamicInventory = discoverGovernableInventory(fixtureRoot);
  assert.equal(dynamicInventory.candidates.some((entry) => entry.code === "DYNAMIC_DISPATCH_REQUIRES_REVIEW"), true);
  dynamicInventory.surfaces.discoveryCandidates = dynamicInventory.candidates;
  const dynamicResult = validateActionContract(contractFor([], dynamicInventory.surfaces), dynamicInventory.surfaces);
  assert.equal(validationExitCode(dynamicResult), 1);

  // 18-20: source, auth guard, tenant guard, and shared helper changes affect the authorization envelope.
  writeFileSync(join(fixtureRoot, "supabase", "functions", "new-edge-api", "guard.ts"), "export function guard() { return 'tenant-a'; }\n");
  const guarded = 'import { guard } from "./guard.ts";\n' + edgeSource('if (body.action === "guarded") { guard(); return jsonResponse({ ok: true }); }');
  writeFileSync(join(fixtureRoot, "supabase", "functions", "new-edge-api", "index.ts"), guarded);
  const first = discoverGovernableInventory(fixtureRoot).surfaces[0].authorizationFingerprint;
  writeFileSync(join(fixtureRoot, "supabase", "functions", "new-edge-api", "guard.ts"), "export function guard() { return 'tenant-b'; }\n");
  const second = discoverGovernableInventory(fixtureRoot).surfaces[0].authorizationFingerprint;
  assert.notEqual(first, second, "shared tenant helper drift must change envelope");

  const authA = selector(edgeSource('if (body.action === "auth") { requireAuth(); return jsonResponse({ ok: true }); }'))[0].authorizationFingerprint;
  const authB = selector(edgeSource('if (body.action === "auth") { requireDifferentAuth(); return jsonResponse({ ok: true }); }'))[0].authorizationFingerprint;
  assert.notEqual(authA, authB);
  const tenantA = selector(edgeSource('if (body.action === "tenant") { requireTenant("a"); return jsonResponse({ ok: true }); }'))[0].authorizationFingerprint;
  const tenantB = selector(edgeSource('if (body.action === "tenant") { requireTenant("b"); return jsonResponse({ ok: true }); }'))[0].authorizationFingerprint;
  assert.notEqual(tenantA, tenantB);
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}

// 21-22: alias errors remain blocking.
const aliasBase = entryFrom(inlineActual[0]);
const unknownAlias = { ...aliasBase, lifecycle: "alias", replacementAction: "edge.fixture-api.unknown" };
assert.ok(codes(validateActionContract(contractFor([unknownAlias], []), [])).includes("ALIAS_TARGET_UNKNOWN"));
const aliasA = { ...aliasBase, canonicalId: "edge.fixture-api.alias_a", actionName: "alias_a", lifecycle: "alias", replacementAction: "edge.fixture-api.alias_b" };
const aliasB = { ...aliasBase, canonicalId: "edge.fixture-api.alias_b", actionName: "alias_b", lifecycle: "alias", replacementAction: "edge.fixture-api.alias_a" };
assert.ok(codes(validateActionContract(contractFor([aliasA, aliasB], []), [])).includes("ALIAS_CYCLE"));

// 23-24: deterministic, bounded output without notes/secrets.
const deterministicContract = contractFor([entryFrom(inlineActual[0])], inlineActual);
const extra = { ...inlineActual[0], canonicalId: "edge.fixture-api.z_extra", actionName: "z_extra" };
assert.equal(
  formatValidationResult(validateActionContract(deterministicContract, [inlineActual[0], extra])),
  formatValidationResult(validateActionContract(deterministicContract, [extra, inlineActual[0]]))
);
const secretMarker = "SENSITIVE_FIXTURE_VALUE_SHOULD_NOT_APPEAR";
deterministicContract.surfaces[0].notes = secretMarker;
assert.equal(formatValidationResult(validateActionContract(deterministicContract, inlineActual)).includes(secretMarker), false);

// P08/P09: comments/format do not drift; malformed fingerprint blocks.
assert.equal(semanticTokens("const x = 1; // comment\n"), semanticTokens(" const   x=1; /* comment */ "));
assert.equal(fingerprint("const x = 1; // a"), fingerprint(" const x=1; /* b */ "));
const malformed = entryFrom(inlineActual[0], { sourceFingerprint: "not-a-sha" });
assert.ok(codes(validateActionContract(contractFor([malformed], [{ ...inlineActual[0], sourceFingerprint: "not-a-sha" }]), [{ ...inlineActual[0], sourceFingerprint: "not-a-sha" }])).includes("INVALID_SOURCE_FINGERPRINT"));

// 25-30: committed baseline, status preservation, non-governable declaration, divergence and explicit limitations.
const baseline = discoverGovernableSurfaces(process.cwd());
const baselineResult = validateActionContract(ACTION_CONTRACT, baseline, { repoRoot: process.cwd() });
assert.equal(baseline.length, 347);
assert.equal(baseline.filter((entry) => entry.canonicalId.startsWith("edge.")).length, 284);
assert.equal(baseline.filter((entry) => entry.canonicalId.startsWith("rpc.")).length, 63);
assert.equal(baseline.filter((entry) => entry.canonicalId.startsWith("edge.rateware-api.")).length, 244);
assert.equal(ACTION_CONTRACT.surfaces.length, 349);
assert.equal(ACTION_CONTRACT.surfaces.filter((entry) => entry.decisionStatus === "pending_human_approval").length, 256);
assert.equal(ACTION_CONTRACT.surfaces.filter((entry) => entry.decisionStatus === "explicitly_allowed").length, 27);
assert.equal(ACTION_CONTRACT.surfaces.filter((entry) => entry.decisionStatus === "internal_only").length, 66);
assert.equal(baseline.some((entry) => entry.canonicalId.includes("whatsapp-healthcheck")), false);
assert.equal(ACTION_CONTRACT.nonGovernableDeclarations.some((entry) => entry.canonicalId === "declaration.edge.whatsapp-healthcheck"), true);
assert.deepEqual(
  baselineResult.issues.filter((entry) => entry.level === "error").map((entry) => entry.code),
  ["REMOVED_WITHOUT_DISPOSITION", "REMOVED_WITHOUT_DISPOSITION"],
  formatValidationResult(baselineResult)
);
assert.equal(validationExitCode(baselineResult), 1, "unresolved H07 dispositions must remain non-zero");

const divergence = validateActionContract(deterministicContract, [inlineActual[0], extra]);
assert.ok(codes(divergence).includes("UNREGISTERED_SURFACE"));
assert.equal(validationExitCode(divergence), 1);

console.log("Action contract hardening tests passed.");
