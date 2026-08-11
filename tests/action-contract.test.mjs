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

const callbackTerminal = selectorWithCandidates(edgeSource('const chosen=body.action;if(chosen==="wrapped")return await withAuth({required:true},()=>business());', 'async function withAuth(_options,cb){return cb()}\nasync function business(){return {}}'));
assert.equal(callbackTerminal[0].handlerStatus, "undetermined");
assert.equal(callbackTerminal[0].handlerResolution, "callback-wrapper-terminal-undetermined");
assert.ok(codes(validateActionContract(contractFor(callbackTerminal.map((entry) => entryFrom(entry)), callbackTerminal), callbackTerminal)).includes("HANDLER_UNDETERMINED"));

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
