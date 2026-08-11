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
    coverageSignals: actual.coverageSignals || [actual.analysisCoverage === "shared-observed" ? "shared_dependency_observed" : "direct"],
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
  assert.equal(dynamicInventory.candidates.some((entry) => entry.code === "UNRESOLVED_DISPATCH_REGISTRY"), true);
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

// Step 7H scenarios 1-18: dispatch completeness and handler attribution.
function selectorWithCandidates(source, functionName = "fixture-api") {
  const actual = selector(source, functionName);
  actual.discoveryCandidates = (actual.dispatchCandidates || []).map((entry) => ({ ...entry, functionName }));
  return actual;
}

function assertCandidateBlocks(actual, expectedCode) {
  const contract = contractFor(actual.map((entry) => entryFrom(entry)), actual);
  const result = validateActionContract(contract, actual);
  assert.ok(codes(result).includes(expectedCode), formatValidationResult(result));
  assert.equal(validationExitCode(result), 1);
}

const aliasDispatch = selectorWithCandidates(edgeSource('if (body.action === "known") return new Response("ok"); const selectedAction = body.action; if (selectedAction === "alias_action") return new Response("alias");'));
assert.deepEqual(aliasDispatch.map((entry) => entry.actionName), ["known", "alias_action"]);

const sanitizedAliases = selectorWithCandidates(edgeSource('const cleanAction = cleanText(body.action, 80); const textAction = text(body.action, 80); if (cleanAction === "clean_alias") return new Response("clean"); if (textAction === "text_alias") return new Response("text");'));
assert.deepEqual(sanitizedAliases.map((entry) => entry.actionName), ["clean_alias", "text_alias"]);

const staticTemplate = selectorWithCandidates(edgeSource('if (body.action === `template_action`) return new Response("ok");'));
assert.equal(staticTemplate[0].actionName, "template_action");

const dynamicTemplate = selectorWithCandidates(edgeSource('if (body.action === "known") return new Response("ok"); if (body.action === `dynamic_${suffix}`) return new Response("dynamic");'));
assertCandidateBlocks(dynamicTemplate, "DYNAMIC_TEMPLATE_ACTION");

const spreadRegistry = selectorWithCandidates('async function knownHandler(){return {}}\nconst base={hidden:knownHandler}; const handlers={...base,known:knownHandler};\nDeno.serve(async()=>{const body={};return await handlers[body.action]();});');
assertCandidateBlocks(spreadRegistry, "NONDETERMINISTIC_DISPATCH_REGISTRY");

const computedLiteral = selectorWithCandidates('async function knownHandler(){return {}}\nconst handlers={["computed_action"]:knownHandler};\nDeno.serve(async()=>{const body={};return await handlers[body.action]();});');
assert.equal(computedLiteral[0].actionName, "computed_action");

const computedDynamic = selectorWithCandidates('async function knownHandler(){return {}}\nconst key="computed_action"; const handlers={[key]:knownHandler};\nDeno.serve(async()=>{const body={};return await handlers[body.action]();});');
assertCandidateBlocks(computedDynamic, "NONDETERMINISTIC_DISPATCH_REGISTRY");

const callbackWrapper = selectorWithCandidates('async function knownHandler(){return {}}\nconst handlers={known:(...args)=>knownHandler(...args)};\nDeno.serve(async()=>{const body={};return await handlers[body.action]();});');
assertCandidateBlocks(callbackWrapper, "NONDETERMINISTIC_DISPATCH_REGISTRY");

const multipleRegistries = selectorWithCandidates('async function knownHandler(){return {}}\nconst handlers={known:knownHandler};\nDeno.serve(async()=>{const body={};const first=handlers[body.action];const second=otherHandlers[body.action];return await (first||second)();});');
assertCandidateBlocks(multipleRegistries, "UNRESOLVED_DISPATCH_REGISTRY");

const multipleDispatchers = selectorWithCandidates('Deno.serve(async()=>{const body={};if(body.action==="one")return new Response("1")});\nDeno.serve(async()=>{const body={};if(body.action==="two")return new Response("2")});');
assertCandidateBlocks(multipleDispatchers, "MULTIPLE_EDGE_DISPATCHERS");

const newMapDispatch = selectorWithCandidates('async function knownHandler(){return {}}\nconst handlers=new Map([["map_action",knownHandler]]);\nDeno.serve(async()=>{const body={};return await handlers.get(body.action)();});');
assert.equal(newMapDispatch[0].actionName, "map_action");

const fallbackDispatch = selectorWithCandidates('async function knownHandler(){return {}}\nconst handlers={known:knownHandler};\nDeno.serve(async()=>{const body={};const selected=handlers[body.action]||knownHandler;return await selected();});');
assertCandidateBlocks(fallbackDispatch, "AMBIGUOUS_DISPATCH_FALLBACK");

const helperBeforeBusiness = selector(edgeSource('if(body.action==="helper_then_business"){await requireGuard();return await businessHandler();}', 'async function requireGuard(){return true}\nasync function businessHandler(){return {}}'));
assert.equal(helperBeforeBusiness[0].handler, "businessHandler");

const declineEquivalent = selector(edgeSource('if(body.action==="decline_equivalent"){const invitation=await findInvitation();const result=await db.from("items").update({status:"declined"});return jsonResponse(result);}', 'async function findInvitation(){return {}}'));
assert.equal(declineEquivalent[0].handlerStatus, "inline-real");
assert.equal(declineEquivalent[0].handler, "inline");

const plausibleOperations = selector(edgeSource('if(body.action==="ambiguous_ops"){await firstOperation();await secondOperation();}', 'async function firstOperation(){return {}}\nasync function secondOperation(){return {}}'));
assert.equal(plausibleOperations[0].handlerStatus, "undetermined");
assert.ok(codes(validateActionContract(contractFor([entryFrom(plausibleOperations[0])], plausibleOperations), plausibleOperations)).includes("HANDLER_UNDETERMINED"));

// Step 7H scenarios 12-15 and 19-24 use independent repository fixtures.
const advancedRoot = mkdtempSync(join(tmpdir(), "rateware-action-7h-"));
try {
  mkdirSync(join(advancedRoot, "supabase", "functions", "fixture-api"), { recursive: true });
  mkdirSync(join(advancedRoot, "supabase", "migrations"), { recursive: true });
  writeFileSync(join(advancedRoot, "package.json"), '{"private":true}\n');
  const functionRoot = join(advancedRoot, "supabase", "functions", "fixture-api");
  const discoverFixture = () => discoverGovernableInventory(advancedRoot);

  writeFileSync(join(functionRoot, "handler.ts"), 'export async function importedHandler(){return new Response("ok")}\n');
  writeFileSync(join(functionRoot, "index.ts"), 'import { importedHandler } from "./handler.ts"; Deno.serve(async()=>{const body={};if(body.action==="imported")return await importedHandler();});\n');
  let inventory = discoverFixture();
  assert.equal(inventory.surfaces[0].handlerStatus, "named-existing");
  assert.equal(inventory.surfaces[0].handlerResolution, "imported-static");
  inventory.surfaces.discoveryCandidates = inventory.candidates;
  assert.equal(validationExitCode(validateActionContract(contractFor([entryFrom(inventory.surfaces[0])], inventory.surfaces), inventory.surfaces, { repoRoot: advancedRoot })), 0);

  writeFileSync(join(functionRoot, "index.ts"), 'import { missingHandler } from "./missing.ts"; Deno.serve(async()=>{const body={};if(body.action==="missing_import")return await missingHandler();});\n');
  inventory = discoverFixture();
  inventory.surfaces.discoveryCandidates = inventory.candidates;
  assert.equal(inventory.surfaces[0].analysisCoverage, "dependency-undetermined");
  assert.equal(validationExitCode(validateActionContract(contractFor([entryFrom(inventory.surfaces[0])], inventory.surfaces), inventory.surfaces)), 1);

  writeFileSync(join(functionRoot, "barrel.ts"), 'export { importedHandler } from "./handler.ts";\n');
  writeFileSync(join(functionRoot, "index.ts"), 'import { importedHandler } from "./barrel.ts"; Deno.serve(async()=>{const body={};if(body.action==="reexported")return await importedHandler();});\n');
  inventory = discoverFixture();
  assert.equal(inventory.surfaces[0].handlerStatus, "named-existing");
  assert.equal(inventory.surfaces[0].handlerResolution, "imported-static");
  inventory.surfaces.discoveryCandidates = inventory.candidates;
  assert.equal(validationExitCode(validateActionContract(contractFor([entryFrom(inventory.surfaces[0])], inventory.surfaces), inventory.surfaces, { repoRoot: advancedRoot })), 0);

  writeFileSync(join(functionRoot, "barrel.ts"), 'export * from "./handler.ts";\n');
  inventory = discoverFixture();
  assert.equal(inventory.surfaces[0].handlerStatus, "undetermined");

  writeFileSync(join(functionRoot, "guard.ts"), 'export function guard(){return "a"}\n');
  writeFileSync(join(functionRoot, "index.ts"), 'Deno.serve(async()=>{const body={};if(body.action==="dynamic_literal"){const m=await import("./guard.ts");return new Response(String(m.guard()));}});\n');
  inventory = discoverFixture();
  const literalFingerprint = inventory.surfaces[0].authorizationFingerprint;
  assert.equal(inventory.surfaces[0].coverageSignals.includes("shared_dependency_observed"), true);
  writeFileSync(join(functionRoot, "guard.ts"), 'export function guard(){return "b"}\n');
  assert.notEqual(discoverFixture().surfaces[0].authorizationFingerprint, literalFingerprint);

  writeFileSync(join(functionRoot, "index.ts"), 'Deno.serve(async()=>{const body={};if(body.action==="dynamic_nonliteral"){const name="guard";const m=await import("./"+name+".ts");return new Response(String(m.guard()));}});\n');
  inventory = discoverFixture();
  assert.equal(inventory.surfaces[0].analysisCoverage, "dependency-undetermined");
  assert.equal(inventory.surfaces[0].coverageSignals.includes("dynamic_dependency"), true);
  const dynamicContract = contractFor([entryFrom(inventory.surfaces[0])], inventory.surfaces);
  assert.ok(codes(validateActionContract(dynamicContract, inventory.surfaces)).includes("AUTHORIZATION_DEPENDENCY_UNDETERMINED"));

  writeFileSync(join(functionRoot, "index.ts"), 'import { guard } from "./absent.ts"; Deno.serve(async()=>{const body={};if(body.action==="unresolved")return new Response(String(guard()));});\n');
  inventory = discoverFixture();
  assert.equal(inventory.surfaces[0].analysisCoverage, "dependency-undetermined");
  assert.equal(inventory.surfaces[0].coverageSignals.includes("unresolved_local_dependency"), true);

  writeFileSync(join(functionRoot, "a.ts"), 'import { b } from "./b.ts"; export function a(){return b()}\n');
  writeFileSync(join(functionRoot, "b.ts"), 'import { a } from "./a.ts"; export function b(){return typeof a}\n');
  writeFileSync(join(functionRoot, "index.ts"), 'import { a } from "./a.ts"; Deno.serve(async()=>{const body={};if(body.action==="cycle")return new Response(String(a()));});\n');
  inventory = discoverFixture();
  assert.equal(inventory.surfaces[0].dependencyFiles.length, 3);
  assert.equal(inventory.surfaces[0].unresolvedDependencies.length, 0);

  writeFileSync(join(functionRoot, "index.ts"), 'import client from "https://example.invalid/pinned@1/mod.ts"; Deno.serve(async()=>{const body={};if(body.action==="external")return new Response(String(client));});\n');
  inventory = discoverFixture();
  assert.equal(inventory.surfaces[0].coverageSignals.includes("external_dependency"), true);
  assert.equal(inventory.surfaces[0].coverageSignals.includes("coverage_not_determinable"), false);

  writeFileSync(join(functionRoot, "guard.ts"), 'globalThis.guardPolicy = "a";\n');
  writeFileSync(join(functionRoot, "index.ts"), 'import "./guard.ts"; Deno.serve(async()=>{const body={};if(body.action==="side_effect")return new Response("ok");});\n');
  inventory = discoverFixture();
  const sideEffectFingerprint = inventory.surfaces[0].authorizationFingerprint;
  assert.equal(inventory.surfaces[0].dependencyFiles.includes("supabase/functions/fixture-api/guard.ts"), true);
  assert.equal(inventory.surfaces[0].analysisCoverage, "shared-observed");
  writeFileSync(join(functionRoot, "guard.ts"), 'globalThis.guardPolicy = "b";\n');
  assert.notEqual(discoverFixture().surfaces[0].authorizationFingerprint, sideEffectFingerprint);

  writeFileSync(join(functionRoot, "guard.ts"), 'globalThis.guardPolicy = "comment-a";\n');
  writeFileSync(join(functionRoot, "index.ts"), 'import /* authorization guard */ "./guard.ts"; Deno.serve(async()=>{const body={};if(body.action==="commented_side_effect")return new Response("ok");});\n');
  inventory = discoverFixture();
  const commentedSideEffectFingerprint = inventory.surfaces[0].authorizationFingerprint;
  assert.equal(inventory.surfaces[0].dependencyFiles.includes("supabase/functions/fixture-api/guard.ts"), true);
  writeFileSync(join(functionRoot, "guard.ts"), 'globalThis.guardPolicy = "comment-b";\n');
  assert.notEqual(discoverFixture().surfaces[0].authorizationFingerprint, commentedSideEffectFingerprint);

  writeFileSync(join(functionRoot, "index.ts"), 'import { guard } from "@/guard.ts"; Deno.serve(async()=>{const body={};if(body.action==="alias_import")return new Response(String(guard()));});\n');
  inventory = discoverFixture();
  inventory.surfaces.discoveryCandidates = inventory.candidates;
  assert.equal(inventory.surfaces[0].analysisCoverage, "dependency-undetermined");
  assert.equal(inventory.surfaces[0].coverageSignals.includes("unresolved_local_dependency"), true);
  assert.equal(inventory.surfaces[0].externalDependencies.some((entry) => entry.specifier === "@/guard.ts"), false);
  assert.ok(codes(validateActionContract(contractFor([entryFrom(inventory.surfaces[0])], inventory.surfaces), inventory.surfaces)).includes("AUTHORIZATION_DEPENDENCY_UNDETERMINED"));
} finally {
  rmSync(advancedRoot, { recursive: true, force: true });
}

// Step 7H scenarios 25-37: conservative RPC statement/lifecycle parsing.
const rpc = (source) => discoverPostgresFunctionsFromSources([{ sourceFile: "supabase/migrations/fixture.sql", source }]);
assert.equal(rpc('create function public.single(integer) returns integer language sql as $$select 1$$; drop function public.single(integer);').length, 0);
assert.equal(rpc('create function public.a(integer) returns integer language sql as $$select 1$$; create function public.b(text) returns integer language sql as $$select 1$$; drop function public.a(integer), public.b(text);').length, 0);
assert.equal(rpc('create function public.single(integer) returns integer language sql as $$select 1$$; drop function public.single;').length, 0);
const unsignedOverloads = rpc('create function public.overloaded(integer) returns integer language sql as $$select 1$$; create function public.overloaded(text) returns integer language sql as $$select 1$$; drop function public.overloaded;');
assert.equal(unsignedOverloads.length, 2);
assert.equal(unsignedOverloads.ddlCandidates[0].code, "AMBIGUOUS_RPC_DROP");
unsignedOverloads.discoveryCandidates = unsignedOverloads.ddlCandidates;
assert.equal(validationExitCode(validateActionContract(contractFor(unsignedOverloads.map((entry) => entryFrom(entry)), unsignedOverloads), unsignedOverloads)), 1);
assert.equal(rpc('create function public.a(integer) returns integer language sql as $$select 1$$; drop function if exists public.a(integer);').length, 0);
assert.equal(rpc('create function public.a(integer) returns integer language sql as $$select 1$$; drop function public.a(integer) cascade;').length, 0);
assert.equal(rpc('create function public.a(integer) returns integer language sql as $$select 1$$; drop function public.a(integer) restrict;').length, 0);
assert.equal(rpc('drop function if exists public.a(integer); create function public.a(integer) returns integer language sql as $$select 2$$;').length, 1);
assert.equal(rpc('create function public.a(integer) returns integer language sql as $$select 1$$; drop function public.a(integer);').length, 0);
assert.equal(rpc('create function public.a(integer) returns integer language sql as $$select 1$$; create or replace function public.a(integer) returns integer language sql as $$select 2$$;').length, 1);
const dollarQuoted = rpc("create function public.victim(integer) returns integer language sql as $$select 1$$; create function public.outer() returns void language plpgsql as $$begin execute 'drop function public.victim(integer)';end$$;");
assert.equal(dollarQuoted.some((entry) => entry.canonicalId === "rpc.public.victim(integer)"), true);
assert.equal(rpc('-- drop function public.a(integer);\ncreate function public.a(integer) returns integer language sql as $$select 1$$; /* drop function public.a(integer); */').length, 1);
assert.equal(rpc('create function "Ops"."Score"(value integer) returns integer language sql as $$select value$$;')[0].canonicalId, 'rpc."Ops"."Score"(integer)');
const typed = rpc('create function public.typed(p_value integer default 1, p_ids uuid[], p_row public.rate_staging, variadic p_labels text[]) returns integer language sql as $$select 1$$;');
assert.equal(typed[0].rpcSignature, "integer,uuid[],public.rate_staging,text[]");

// Step 7J independent regressions from the third review.
const conflictingRegistries = selectorWithCandidates('async function alpha(){return {}} async function beta(){return {}} const first={same:alpha}; const second={same:beta}; Deno.serve(async()=>{const body={};return (body.flag?first[body.action]:second[body.action])();});');
assertCandidateBlocks(conflictingRegistries, "AMBIGUOUS_ACTION_ATTRIBUTION");

const bracketAlias = selectorWithCandidates(edgeSource('if(body.action==="known")return new Response("ok"); const hidden=body["action"]; if(hidden==="hidden")return new Response("hidden");'));
assert.deepEqual(bracketAlias.map((entry) => entry.actionName), ["known", "hidden"]);
assert.equal(validationExitCode(validateActionContract(contractFor(bracketAlias.map((entry) => entryFrom(entry)), bracketAlias), bracketAlias)), 0);

const dynamicSwitch = selectorWithCandidates(edgeSource('switch(body.action){case "known":return knownHandler();case `dynamic_${suffix}`:return dynamicHandler();}', 'function knownHandler(){return {}}\nfunction dynamicHandler(){return {}}'));
assertCandidateBlocks(dynamicSwitch, "DYNAMIC_TEMPLATE_ACTION");

const commentedDynamicSwitch = selectorWithCandidates(edgeSource('switch(body.action){case "known":return knownHandler();case /* computed */ `dynamic_${suffix}`:return dynamicHandler();}', 'function knownHandler(){return {}}\nfunction dynamicHandler(){return {}}'));
assertCandidateBlocks(commentedDynamicSwitch, "DYNAMIC_TEMPLATE_ACTION");

const callbackTerminal = selectorWithCandidates(edgeSource('const chosen=body.action;if(chosen==="wrapped")return await withAuth({required:true},()=>business());', 'async function withAuth(_options,cb){return cb()}\nasync function business(){return {}}'));
assert.equal(callbackTerminal[0].handlerStatus, "undetermined");
assert.equal(callbackTerminal[0].handlerResolution, "callback-wrapper-terminal-undetermined");
assert.ok(codes(validateActionContract(contractFor(callbackTerminal.map((entry) => entryFrom(entry)), callbackTerminal), callbackTerminal)).includes("HANDLER_UNDETERMINED"));

const memberCallbackTerminal = selectorWithCandidates(edgeSource('const chosen=body.action;if(chosen==="member_wrapped")return wrappers.run(async()=>business());', 'const wrappers={run:async(cb)=>cb()}\nasync function business(){return {}}'));
assert.equal(memberCallbackTerminal[0].handlerStatus, "undetermined");
assert.equal(memberCallbackTerminal[0].handlerResolution, "callback-wrapper-terminal-undetermined");
assert.equal(validationExitCode(validateActionContract(contractFor(memberCallbackTerminal.map((entry) => entryFrom(entry)), memberCallbackTerminal), memberCallbackTerminal)), 1);

for (const returnedCall of ['wrappers["run"](async()=>business())', 'wrappers?.["run"](async()=>business())', 'wrappers.run?.(async()=>business())', 'wrappers[method](async()=>business())']) {
  const computedCallbackTerminal = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="computed_wrapped")return ${returnedCall};`, 'const method="run"\nconst wrappers={run:async(cb)=>cb()}\nasync function business(){return {}}'));
  assert.equal(computedCallbackTerminal[0].handlerStatus, "undetermined", returnedCall);
  assert.equal(computedCallbackTerminal[0].handlerResolution, "callback-wrapper-terminal-undetermined", returnedCall);
  assert.equal(validationExitCode(validateActionContract(contractFor(computedCallbackTerminal.map((entry) => entryFrom(entry)), computedCallbackTerminal), computedCallbackTerminal)), 1, returnedCall);
}

for (const returnedCall of ['wrappers /*comment*/ ["run"](async()=>business())', 'wrappers./*comment*/run(async()=>business())', 'wrappers.run /*comment*/ (async()=>business())', 'wrappers.run /*comment*/ ?.(async()=>business())', 'wrappers[methods[0]](async()=>business())']) {
  const triviaCallbackTerminal = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="trivia_wrapped")return ${returnedCall};`, 'const methods=["run"]\nconst wrappers={run:async(cb)=>cb()}\nasync function business(){return {}}'));
  assert.equal(triviaCallbackTerminal[0].handlerStatus, "undetermined", returnedCall);
  assert.equal(triviaCallbackTerminal[0].handlerResolution, "callback-wrapper-terminal-undetermined", returnedCall);
  assert.equal(validationExitCode(validateActionContract(contractFor(triviaCallbackTerminal.map((entry) => entryFrom(entry)), triviaCallbackTerminal), triviaCallbackTerminal)), 1, returnedCall);
}

const responseWithNestedCallback = selectorWithCandidates(edgeSource('const chosen=body.action;if(chosen==="response_map")return new Response(JSON.stringify([1].map(value=>value)));'));
assert.equal(responseWithNestedCallback[0].handlerStatus, "inline-real");

for (const regexArgument of ['/=>/', '/function/', '/[=>/]+/g']) {
  const regexHandler = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="regex_handler")return await businessHandler(${regexArgument});`, 'async function businessHandler(_pattern){return {}}'));
  assert.equal(regexHandler[0].handlerStatus, "named-existing", regexArgument);
  assert.equal(validationExitCode(validateActionContract(contractFor(regexHandler.map((entry) => entryFrom(entry)), regexHandler), regexHandler)), 0, regexArgument);
}

const jsonResponseMap = selectorWithCandidates(edgeSource('const chosen=body.action;if(chosen==="json_map")return jsonResponse(items.map(value=>value));', 'const items=[1]\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}'));
assert.equal(jsonResponseMap[0].handlerStatus, "inline-real");
assert.equal(validationExitCode(validateActionContract(contractFor(jsonResponseMap.map((entry) => entryFrom(entry)), jsonResponseMap), jsonResponseMap)), 0);

const jsonResponseWrapper = selectorWithCandidates(edgeSource('const chosen=body.action;if(chosen==="json_wrapped")return jsonResponse(await wrappers.run(async()=>business()));', 'const wrappers={run:async(cb)=>cb()}\nasync function business(){return {}}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}'));
assert.equal(jsonResponseWrapper[0].handlerStatus, "undetermined");
assert.equal(validationExitCode(validateActionContract(contractFor(jsonResponseWrapper.map((entry) => entryFrom(entry)), jsonResponseWrapper), jsonResponseWrapper)), 1);

for (const returnedCall of ['wrappers.map(async()=>business())', 'wrappers.filter(async()=>business())', 'map(async()=>business())']) {
  const namedTransformWrapper = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="named_transform_wrapper")return jsonResponse(await ${returnedCall});`, 'const wrappers={map:async(cb)=>cb(),filter:async(cb)=>cb()}\nasync function map(cb){return cb()}\nasync function business(){return {}}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}'));
  assert.equal(namedTransformWrapper[0].handlerStatus, "undetermined", returnedCall);
  assert.equal(validationExitCode(validateActionContract(contractFor(namedTransformWrapper.map((entry) => entryFrom(entry)), namedTransformWrapper), namedTransformWrapper)), 1, returnedCall);
}

const jsonResponseSorted = selectorWithCandidates(edgeSource('const chosen=body.action;if(chosen==="json_sorted")return jsonResponse(items.toSorted((a,b)=>a-b));', 'const items=[2,1]\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}'));
assert.equal(jsonResponseSorted[0].handlerStatus, "inline-real");
assert.equal(validationExitCode(validateActionContract(contractFor(jsonResponseSorted.map((entry) => entryFrom(entry)), jsonResponseSorted), jsonResponseSorted)), 0);

for (const [declarations, expression] of [
  ['let items=[1,2]', 'items.filter(x=>x)'],
  ['var items=[2,1]', 'items.toSorted((a,b)=>a-b)'],
  ['const items /* list */ =[1]', 'items.map(x=>x)'],
  ['const items: number[]=[1]', 'items.map(x=>x)'],
  ['', '[1,2].map(x=>x)'],
  ['const state={items:[1]}', 'state.items.map(x=>x)'],
  ['const items=Array.from([1])', 'items.map(x=>x)']
]) {
  const provenDataTransform = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="proven_data_transform")return jsonResponse(${expression});`, `${declarations}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}`));
  assert.equal(provenDataTransform[0].handlerStatus, "inline-real", expression);
  assert.equal(validationExitCode(validateActionContract(contractFor(provenDataTransform.map((entry) => entryFrom(entry)), provenDataTransform), provenDataTransform)), 0, expression);
}

for (const [declarations, prefix] of [
  ['const wrappers={map:async cb=>cb()};let items=[];items=wrappers', ''],
  ['const wrappers={map:async cb=>cb()};const items=[]', 'const items=wrappers;'],
  ['const wrappers={map:async cb=>cb()};/* const items=[]; */const items=wrappers', ''],
  ['const wrappers={map:async cb=>cb()};const marker="const items=[";const items=wrappers', '']
]) {
  const unprovenDataTransform = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="unproven_data_transform"){${prefix}return jsonResponse(await items.map(async()=>new Response("ok")));}`, `${declarations}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}`));
  assert.equal(unprovenDataTransform[0].handlerStatus, "undetermined");
  assert.equal(validationExitCode(validateActionContract(contractFor(unprovenDataTransform.map((entry) => entryFrom(entry)), unprovenDataTransform), unprovenDataTransform)), 1);
}

for (const [declarations, prefix] of [
  ['const wrappers={map:async cb=>cb()};const state={items:[]};state.items=wrappers', ''],
  ['const wrappers={map:async cb=>cb()};const state={items:[]}', 'state.items=wrappers;']
]) {
  const reassignedProperty = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="reassigned_property"){${prefix}return jsonResponse(await state.items.map(async()=>new Response("ok")));}`, `${declarations}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}`));
  assert.equal(reassignedProperty[0].handlerStatus, "undetermined");
  assert.equal(validationExitCode(validateActionContract(contractFor(reassignedProperty.map((entry) => entryFrom(entry)), reassignedProperty), reassignedProperty)), 1);
}

for (const [declarations, prefix, expression] of [
  ['const wrappers={};const items=[1]', '{const items=wrappers;}', 'items.map(x=>x)'],
  ['const wrappers={};let items=[1];function mutate(){items=wrappers}', '', 'items.map(x=>x)'],
  ['const wrappers={};const items=[1];const same=items==wrappers', '', 'items.map(x=>x)'],
  ['const wrappers={};const items=[1];const same=items===wrappers', '', 'items.map(x=>x)'],
  ['const items=[1];const identity=items=>items', '', 'items.map(x=>x)'],
  ['const items=[1];const alias=items', '', 'alias.map(x=>x)'],
  ['', 'const [head,...items]=[0,1,2];', 'items.map(x=>x)'],
  ['const state={items:[1]}', 'const {items}=state;', 'items.map(x=>x)']
]) {
  const scopedDataTransform = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="scoped_data_transform"){${prefix}return jsonResponse(${expression});}`, `${declarations}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}`));
  assert.equal(scopedDataTransform[0].handlerStatus, "inline-real", expression);
  assert.equal(validationExitCode(validateActionContract(contractFor(scopedDataTransform.map((entry) => entryFrom(entry)), scopedDataTransform), scopedDataTransform)), 0, expression);
}

const assignmentAfterUse = selectorWithCandidates(edgeSource('const chosen=body.action;if(chosen==="assignment_after_use"){return jsonResponse(items.map(x=>x));items=wrappers;}', 'const wrappers={}\nlet items=[1]\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}'));
assert.equal(assignmentAfterUse[0].handlerStatus, "inline-real");
assert.equal(validationExitCode(validateActionContract(contractFor(assignmentAfterUse.map((entry) => entryFrom(entry)), assignmentAfterUse), assignmentAfterUse)), 0);

for (const declarations of [
  'const wrappers={map:async cb=>cb()};const state={items:[]};state["items"]=wrappers',
  'const wrappers={map:async cb=>cb()};const state={items:[]};const alias=state;alias.items=wrappers',
  'const wrappers={map:async cb=>cb()};let items=[1];if(true){items=wrappers}',
  'const wrappers={map:async cb=>cb()};let items=[1];try{items=wrappers}catch{}',
  'const wrappers={map:async cb=>cb()};const key="items";const state={items:[]};state[key]=wrappers'
]) {
  const computedWrite = selectorWithCandidates(edgeSource('const chosen=body.action;if(chosen==="computed_write")return jsonResponse(await ' + (declarations.includes('state=') ? 'state.items' : 'items') + '.map(async()=>new Response("ok")));', `${declarations}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}`));
  assert.equal(computedWrite[0].handlerStatus, "undetermined", declarations);
  assert.equal(validationExitCode(validateActionContract(contractFor(computedWrite.map((entry) => entryFrom(entry)), computedWrite), computedWrite)), 1, declarations);
}

for (const [declarations, expression] of [
  ['const state={["items"]:[1]}', 'state.items.map(x=>x)'],
  ['const state={"items":[1]}', 'state.items.map(x=>x)'],
  ['const state={items:[1]};const {items:rows}=state', 'rows.map(x=>x)'],
  ['const source=[1,2];const [head,...items]=source', 'items.map(x=>x)'],
  ['const state={items:[1],other:2};const {other,...rest}=state', 'rest.items.map(x=>x)']
]) {
  const structuredRead = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="structured_read")return jsonResponse(${expression});`, `${declarations}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}`));
  assert.equal(structuredRead[0].handlerStatus, "inline-real", expression);
  assert.equal(validationExitCode(validateActionContract(contractFor(structuredRead.map((entry) => entryFrom(entry)), structuredRead), structuredRead)), 0, expression);
}

const duplicateCalleeActions = selectorWithCandidates('function jsonResponse(x){return new Response(JSON.stringify(x))}\nconst wrappers={map:async cb=>cb()};\nDeno.serve(async()=>{const body={};if(body.action==="duplicate_array"){const items=[1];return jsonResponse(items.map(x=>x));}if(body.action==="duplicate_wrapper"){const items=wrappers;return jsonResponse(items.map(x=>x));}});');
assert.equal(duplicateCalleeActions.find((entry) => entry.actionName === "duplicate_array").handlerStatus, "inline-real");
assert.equal(duplicateCalleeActions.find((entry) => entry.actionName === "duplicate_wrapper").handlerStatus, "undetermined");

for (const [declarations, branch, expected] of [
  ['const wrappers={map:async cb=>cb()};const state={items:[]};state["it\\u0065ms"]=wrappers', 'return jsonResponse(await state.items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const key="items";const state={[key]:[1]}', 'return jsonResponse(state.items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};let items=[1];const mutate=()=>{items=wrappers}', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};let items=[1];function mutate(){items=wrappers}', 'mutate();return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};let items=[1]', 'items.map(async()=>new Response("ok"));items=wrappers;return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};let items=wrappers', 'items.map(async()=>new Response("ok"));items=[1];return jsonResponse(items.map(async()=>new Response("ok")));', 'inline-real']
]) {
  const astReceiverFlow = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="ast_receiver_flow"){${branch}}`, `${declarations}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}`));
  assert.equal(astReceiverFlow[0].handlerStatus, expected, branch);
  assert.equal(validationExitCode(validateActionContract(contractFor(astReceiverFlow.map((entry) => entryFrom(entry)), astReceiverFlow), astReceiverFlow)), expected === "undetermined" ? 1 : 0, branch);
}

// Step 7I scenarios 27-29: conservative AST path joins, mutations, returns and parse failures.
for (const [declarations, branch, expected] of [
  ['const wrappers={map:async cb=>cb()};let items=[1];const flag=body.flag;', 'if(flag){items=wrappers}else{items=[]}return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['let items=[1];const flag=body.flag;', 'if(flag){items=[2]}else{items=[]}return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};let items=[1];', 'try{items=wrappers}catch{items=[]}return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['let items=[1];', 'try{items=[2]}catch{items=[]}return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};let items=wrappers;', 'while(false){items=[]}return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['let items=[1];', 'while(body.more){items=[]}return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const items=wrappers||[];', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};let items=[];({items}={items:wrappers});', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};const state={items:[]};const alias=state;Object.assign(alias,{items:wrappers});', 'return jsonResponse(await state.items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const state={items:[]};const alias=state;Object.assign(alias,{items:[2]});', 'return jsonResponse(state.items.map(x=>x));', 'inline-real'],
  ['function getItems(){return [1]};const items=getItems();', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const items=(()=>[1])();', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};', 'return jsonResponse(await wrappers?.map?.(async()=>new Response("ok")));', 'undetermined'],
  ['const items=[1];', 'return jsonResponse(items?.map?.(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const key="it\\u0065ms";const state={items:[]};const alias=state;alias[key]=wrappers;', 'return jsonResponse(await state.items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const key="items";const state={items:[1]};const {[key]:rows}=state;', 'return jsonResponse(rows.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};let items=[1];', 'items.map(async()=>new Response("ok"));items=wrappers;return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};let items=[1];const helper={mutate(){items=wrappers}};', 'helper.mutate();return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};let items=[1];const helper={mutate(){items=wrappers}};', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['@sealed class Example{};const wrappers={map:async cb=>cb()};const state={items:[]};state["it\\u0065ms"]=wrappers;', 'return jsonResponse(await state.items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const items=do{[1]};', 'return jsonResponse(items.map(x=>x));', 'undetermined']
]) {
  const conservativeAstFlow = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="conservative_ast_flow"){${branch}}`, `${declarations}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}`));
  assert.equal(conservativeAstFlow[0].handlerStatus, expected, `${declarations} ${branch}`);
  assert.equal(validationExitCode(validateActionContract(contractFor(conservativeAstFlow.map((entry) => entryFrom(entry)), conservativeAstFlow), conservativeAstFlow)), expected === "undetermined" ? 1 : 0, `${declarations} ${branch}`);
}

// Step 7I scenarios 30-33: abrupt completion, unknown values and nested path joins.
for (const [declarations, branch, expected] of [
  ['const wrappers={map:async cb=>cb()};let items=[1];', 'switch(body.kind){case "wrapper":items=wrappers;break;default:items=[]}return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['let items=[1];', 'switch(body.kind){case "a":items=[2];break;default:items=[]}return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};let items=[1];', 'try{items=wrappers}finally{if(body.reset){items=[]}}return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};let items=wrappers;', 'try{items=wrappers}finally{items=[]}return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};let items=wrappers;', 'do{break;items=[]}while(false);return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};let items=[1];function mutate(){items=wrappers;return;items=[]}', 'mutate();return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['function getItems(){return body.value};const items=getItems()||[];', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['function getItems(){return body.value};const items=getItems()??[];', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const state={deep:{items:[1]}};', 'if(body.flag){state.deep.items=[2]}else{state.deep.items=[]}return jsonResponse(state.deep.items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const state={deep:{items:[1]}};', 'if(body.flag){state.deep.items=wrappers}else{state.deep.items=[]}return jsonResponse(await state.deep.items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};const key="items";let rows=[];({[key]:rows}={items:wrappers});', 'return jsonResponse(await rows.map(async()=>new Response("ok")));', 'undetermined'],
  ['const state={items:[]};const unknown=body.value;Object.assign(state,unknown);', 'return jsonResponse(await state.items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const unknown=body.value;const state={items:[],...unknown};', 'return jsonResponse(await state.items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};const key=body.key;const state={items:[],[key]:wrappers};', 'return jsonResponse(await state.items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};function getItems(): unknown[]{return wrappers as unknown as unknown[]};const items=getItems();', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const fake={from(){return this},select(){return this},map:async cb=>cb()};const items=fake.from("rows").select("*");', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['function identity(x){return x};const items=identity([1]);', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const broken = ;const items=[1];', 'return jsonResponse(items.map(x=>x));', 'undetermined']
]) {
  const conservativeUnknownFlow = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="conservative_unknown_flow"){${branch}}`, `${declarations}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}`));
  assert.equal(conservativeUnknownFlow[0].handlerStatus, expected, `${declarations} ${branch}`);
  assert.equal(validationExitCode(validateActionContract(contractFor(conservativeUnknownFlow.map((entry) => entryFrom(entry)), conservativeUnknownFlow), conservativeUnknownFlow)), expected === "undetermined" ? 1 : 0, `${declarations} ${branch}`);
}

// Step 7I scenarios 34-37: labeled completion, short-circuit values and trusted bindings.
for (const [declarations, branch, expected] of [
  ['const wrappers={map:async cb=>cb()};let items=[1];', 'switch(body.kind){case "wrapper":items=wrappers;case "array":items=[];break;default:items=[]}return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};let items=wrappers;', 'switch(body.kind){case "array":items=[];break}return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['let items=[1];', 'switch(body.kind){case "a":items=[2];break;default:items=[];break;case "b":items=[3]}return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};let items=[1];', 'outer:{switch(body.kind){case "wrapper":items=wrappers;break outer;default:items=[]}items=[]}return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};let items=[1];', 'outer:for(let i=0;i<1;i++){items=wrappers;continue outer;items=[]}return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};let items=[1];function mutate(){items=wrappers;throw new Error("x");items=[]}', 'try{mutate()}catch{}return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};let items=wrappers;function mutate(){try{return}finally{items=[]}}', 'mutate();return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const items=[]||wrappers;', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const items=[]??wrappers;', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const unknown=body.value;const key=body.key;const state={items:[],...unknown,[key]:wrappers};Object.assign(state,unknown);', 'return jsonResponse(await state.items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const state={items:[1]};state.self=state;const alias=state.self;', 'return jsonResponse(alias.items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const state={items:[1]};state.self=state;const alias=state.self;alias.items=wrappers;', 'return jsonResponse(await state.items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const [items]=await Promise.all([[1]]);', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const [items]=await Promise.all([wrappers]);', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const P=Promise;const [items]=await P.all([[1]]);', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const Promise={all:async()=>[wrappers]};const [items]=await Promise.all([[1]]);', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const supabase=createClient("url","key");const {data}=await supabase.from("rows").select();', 'return jsonResponse(data.map(x=>x));', 'inline-real'],
  ['import {createClient as makeClient} from "https://esm.sh/@supabase/supabase-js@2";const supabase=makeClient("url","key");const {data}=await supabase.from("rows").select();', 'return jsonResponse(data.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};function createClient(){return {from(){return {select(){return {data:wrappers}}}}}}const supabase=createClient();const {data}=await supabase.from("rows").select();', 'return jsonResponse(await data.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};function createClient(){return wrappers}function getClient(){return createClient()}const supabase=getClient();const {data}=await supabase.from("rows").select();', 'return jsonResponse(await data.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};const fake={from(){return {select(){return {data:wrappers}}}}};const {data}=await fake.from("rows").select();', 'return jsonResponse(await data.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};function getItems():unknown[]{const value=wrappers;return value as unknown as unknown[]}const items=getItems();', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const broken=;const items=[1];', 'return jsonResponse(items.map(x=>x));', 'undetermined']
]) {
  const trustedBindingFlow = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="trusted_binding_flow"){${branch}}`, `${declarations}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}`));
  assert.equal(trustedBindingFlow[0].handlerStatus, expected, `${declarations} ${branch}`);
  assert.equal(validationExitCode(validateActionContract(contractFor(trustedBindingFlow.map((entry) => entryFrom(entry)), trustedBindingFlow), trustedBindingFlow)), expected === "undetermined" ? 1 : 0, `${declarations} ${branch}`);
}

// Step 7I scenarios 38-49: nested labels, primitive short-circuit, imports and exhaustive returns.
for (const [declarations, branch, expected] of [
  ['const wrappers={map:async cb=>cb()};let items=[1];', 'outer:for(let i=0;i<1;i++){switch(body.kind){case "bad":items=wrappers;break outer;default:items=[]}items=[]}return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};let items=[1];', 'outer:{inner:{items=wrappers;break inner;items=[]}items=[]}return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};let items=[1];', 'outer:for(let i=0;i<1;i++){inner:for(let j=0;j<1;j++){items=wrappers;continue outer;items=[]}items=[]}return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};const items=[]||wrappers;', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const items=[]??wrappers;', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const items=[]&&wrappers;', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const items=false||[];', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const items=""||[];', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const items=null??[];', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const items=undefined??[];', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const items=NaN||[];', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const items=true&&[];', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const items="rows"&&[];', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const items=Infinity&&[];', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const items=(-1)&&[];', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const items=0n||[];', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const items=(!body.flag)&&[];', 'return jsonResponse(items.map(x=>x));', 'undetermined'],
  ['const items=(typeof body.flag)&&[];', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const items=(void body.flag)??[];', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const P=Promise;const [items]=await P.all([[1]]);', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const Promise={all:async()=>[wrappers]};const P=Promise;const [items]=await P.all([[1]]);', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const A=Array;const items=A.from([1]);', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const Array={from(){return wrappers}};const A=Array;const items=A.from([1]);', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const O=Object;const items=O.values({a:1});', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};const Object={values(){return wrappers}};const O=Object;const items=O.values({a:1});', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['import {createClient as makeClient} from "https://esm.sh/@supabase/supabase-js@2";const supabase=makeClient("url","key");const {data}=await supabase.from("rows").select();', 'return jsonResponse(data.map(x=>x));', 'inline-real'],
  ['import * as sb from "https://esm.sh/@supabase/supabase-js@2";const supabase=sb.createClient("url","key");const {data}=await supabase.from("rows").select();', 'return jsonResponse(data.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};import createClient from "https://esm.sh/@supabase/supabase-js@2";const supabase=createClient();const {data}=await supabase.from("rows").select();', 'return jsonResponse(await data.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};import {createClient as makeClient} from "https://evil.example/@supabase/supabase-js-fake";const supabase=makeClient();const {data}=await supabase.from("rows").select();', 'return jsonResponse(await data.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};import * as sb from "https://evil.example/@supabase/supabase-js-fake";const supabase=sb.createClient();const {data}=await supabase.from("rows").select();', 'return jsonResponse(await data.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};function createClient(){return {from(){return {select(){return {data:wrappers}}}}}}const supabase=createClient();const {data}=await supabase.from("rows").select();', 'return jsonResponse(await data.map(async()=>new Response("ok")));', 'undetermined'],
  ['import {createClient as makeClient} from "https://esm.sh/@supabase/supabase-js@2";function getClient(){if(body.cached)return makeClient("u","k");return makeClient("u","k")}const supabase=getClient();const {data}=await supabase.from("rows").select();', 'return jsonResponse(data.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};import {createClient as makeClient} from "https://esm.sh/@supabase/supabase-js@2";const fake={from(){return {select(){return {data:wrappers}}}}};function getClient(){if(body.fake)return fake;return makeClient("u","k")}const supabase=getClient();const {data}=await supabase.from("rows").select();', 'return jsonResponse(await data.map(async()=>new Response("ok")));', 'undetermined'],
  ['type Rows=unknown[];function getItems():Rows{const value=[1] as Rows;return value}const items=getItems();', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};type Rows=unknown[];function getItems():Rows{const value=wrappers;return value as unknown as Rows}const items=getItems();', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['type Rows=unknown[];function getItems():Rows{function hidden(){return body.value}const value=[1];return value}const items=getItems();', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['function getItems(){if(body.a)return [1];else return [2]}const items=getItems();', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['function getItems(){if(body.a)return [1]}const items=getItems();', 'return jsonResponse(items.map(x=>x));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};function getItems(){if(body.a){return [1]}else{return [2]}return wrappers}const items=getItems();', 'return jsonResponse(items.map(x=>x));', 'inline-real'],
  ['const wrappers={map:async cb=>cb()};function getItems(){if(body.a)return wrappers;return [1]}const items=getItems();', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const wrappers={map:async cb=>cb()};function getItems(){function hidden(){return wrappers}return hidden()}const items=getItems();', 'return jsonResponse(await items.map(async()=>new Response("ok")));', 'undetermined'],
  ['const broken=;const items=[1];', 'return jsonResponse(items.map(x=>x));', 'undetermined'],
  ['const state={items:[1]};state.self=state;const a=state.self;const b=a.self;', 'return jsonResponse(b.items.map(x=>x));', 'inline-real']
]) {
  const nestedBindingFlow = selectorWithCandidates(edgeSource(`const chosen=body.action;if(chosen==="nested_binding_flow"){${branch}}`, `${declarations}\nfunction jsonResponse(value){return new Response(JSON.stringify(value))}`));
  assert.equal(nestedBindingFlow[0].handlerStatus, expected, `${declarations} ${branch}`);
  assert.equal(validationExitCode(validateActionContract(contractFor(nestedBindingFlow.map((entry) => entryFrom(entry)), nestedBindingFlow), nestedBindingFlow)), expected === "undetermined" ? 1 : 0, `${declarations} ${branch}`);
}

const nestedLeadingComment = rpc('/* outer /* nested drop function public.fake(); */ outer */ create function public.outer() returns void language plpgsql as $$begin perform 1; end$$;');
assert.equal(nestedLeadingComment.length, 1);
assert.equal(nestedLeadingComment[0].canonicalId, "rpc.public.outer()");

// Step 7H scenarios 38-46: exits, determinism, snapshot, H07 and no silent candidate omission.
const countContract = contractFor([entryFrom(inlineActual[0])], inlineActual);
countContract.expectedCounts.edge = 2;
assert.equal(validationExitCode(validateActionContract(countContract, inlineActual)), 1);
assertCandidateBlocks(dynamicTemplate, "DYNAMIC_TEMPLATE_ACTION");
assert.equal(formatValidationResult(validateActionContract(deterministicContract, [inlineActual[0], extra])), formatValidationResult(validateActionContract(deterministicContract, [extra, inlineActual[0]])));
assert.equal(formatValidationResult(validateActionContract(deterministicContract, inlineActual)).includes(secretMarker), false);
const finalBaseline = discoverGovernableSurfaces(process.cwd());
const finalBaselineResult = validateActionContract(ACTION_CONTRACT, finalBaseline, { repoRoot: process.cwd() });
assert.deepEqual({ total: finalBaseline.length, edge: finalBaseline.filter((entry) => entry.canonicalId.startsWith("edge.")).length, rpc: finalBaseline.filter((entry) => entry.canonicalId.startsWith("rpc.")).length }, { total: 347, edge: 284, rpc: 63 });
assert.deepEqual(finalBaselineResult.issues.filter((entry) => entry.level === "error").map((entry) => entry.code), ["REMOVED_WITHOUT_DISPOSITION", "REMOVED_WITHOUT_DISPOSITION"]);
assert.equal(ACTION_CONTRACT.surfaces.filter((entry) => entry.decisionStatus === "pending_human_approval").length, 256);
assert.equal(ACTION_CONTRACT.nonGovernableDeclarations.some((entry) => entry.canonicalId === "declaration.edge.whatsapp-healthcheck" && entry.decisionStatus === "pending_human_approval"), true);
for (const actual of [dynamicTemplate, spreadRegistry, computedDynamic, callbackWrapper, multipleRegistries, multipleDispatchers, fallbackDispatch]) {
  assert.equal(actual.dispatchCandidates.length > 0, true, "No unsupported dispatch fixture may omit its blocking candidate.");
  assert.equal(validationExitCode(validateActionContract(contractFor(actual.map((entry) => entryFrom(entry)), actual), actual)), 1);
}

console.log("Action contract hardening tests passed.");
