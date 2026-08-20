import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPlatformControlReadiness, SCHEMA_VERSION } from "../src/platform-readiness.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "settings.html"), "utf8");
const source = fs.readFileSync(path.join(root, "src", "settings.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const generatedAt = "2026-08-14T12:00:00.000Z";

const readiness = buildPlatformControlReadiness({
  generatedAt,
  settings: {
    audit: [{ action: "architecture.rfc.reviewed" }],
    secrets: { production_key: "must-never-render" },
    feature_flags: { required_mode: true }
  },
  governance: {
    status: "review_required",
    evidence: [
      { control: "Authenticated session", status: "observed" },
      { control: "Role authorization", status: "observed" }
    ],
    gaps: [{ code: "tenant:server_evidence_required", severity: "review" }]
  },
  observabilityLoaded: true,
  observability: { events: [{ source: "rateware_api" }] },
  catalogLoaded: true,
  catalogValues: [{ active: true }]
});

assert.equal(readiness.schema_version, SCHEMA_VERSION);
assert.equal(readiness.status, "blocked");
assert.equal(readiness.mode, "observation_only");
assert.equal(readiness.surfaces.length, 7);
assert.deepEqual(readiness.surfaces.map((surface) => surface.page_id), [
  "runtime-jobs",
  "service-catalog",
  "architecture-rfc",
  "enterprise-identity",
  "secrets-overview",
  "feature-flags",
  "implementation"
]);
assert.equal(readiness.surfaces.every((surface) => surface.state === "blocked"), true);
assert.equal(readiness.implementation_stages.length, 6);
assert.equal(readiness.implementation_stages.find((stage) => stage.stage === "CUTOVER")?.state, "blocked");
assert.equal(Object.values(readiness.controls).some(Boolean), false);

const serialized = JSON.stringify(readiness);
assert.doesNotMatch(serialized, /must-never-render/);
assert.doesNotMatch(serialized, /production_key/);
assert.ok(readiness.surfaces.find((surface) => surface.page_id === "secrets-overview")?.gaps.some((gap) => gap.code === "secrets:rotation_receipt_required"));
assert.ok(readiness.surfaces.find((surface) => surface.page_id === "feature-flags")?.gaps.some((gap) => gap.code === "flags:server_state_required"));
assert.ok(readiness.surfaces.find((surface) => surface.page_id === "enterprise-identity")?.gaps.some((gap) => gap.code === "identity:server_gate_required"));

for (const malformed of [null, [], "evidence", 42, { catalogValues: "not-an-array" }]) {
  assert.doesNotThrow(() => buildPlatformControlReadiness(malformed));
  assert.equal(buildPlatformControlReadiness(malformed).status, "blocked");
}

const hostile = new Proxy({}, { getPrototypeOf() { throw new Error("hostile"); } });
assert.doesNotThrow(() => buildPlatformControlReadiness(hostile));
assert.equal(buildPlatformControlReadiness(hostile).summary.blocked_surfaces, 7);

for (const [label, input, pageId] of [
  ["invalid observability collection", { observabilityLoaded: true, observability: { events: "not-an-array" } }, "runtime-jobs"],
  ["invalid catalog collection", { catalogLoaded: true, catalogValues: "not-an-array" }, "service-catalog"]
]) {
  const invalidEvidence = buildPlatformControlReadiness(input);
  assert.equal(invalidEvidence.status, "blocked", label);
  assert.equal(invalidEvidence.summary.observed_surfaces, 0, `${label} must not become observed`);
  assert.deepEqual(invalidEvidence.surfaces.find((surface) => surface.page_id === pageId)?.evidence, [], label);
}

const accessorEvents = [];
Object.defineProperty(accessorEvents, "0", {
  enumerable: true,
  get() {
    return { source: "must-not-be-observed" };
  }
});
accessorEvents.length = 1;
const accessorEvidence = buildPlatformControlReadiness({
  observabilityLoaded: true,
  observability: { events: accessorEvents }
});
assert.equal(accessorEvidence.summary.observed_surfaces, 0, "accessor-backed rows are not parsed JSON evidence");

const accessorLoadedFlag = { observability: { events: [] } };
Object.defineProperty(accessorLoadedFlag, "observabilityLoaded", { enumerable: true, get: () => true });
assert.equal(
  buildPlatformControlReadiness(accessorLoadedFlag).summary.observed_surfaces,
  0,
  "accessor-backed loaded flags are not parsed JSON evidence"
);

const accessorObservability = {};
Object.defineProperty(accessorObservability, "observability", { enumerable: true, get: () => ({ events: [] }) });
Object.defineProperty(accessorObservability, "observabilityLoaded", { enumerable: true, value: true });
assert.equal(
  buildPlatformControlReadiness(accessorObservability).summary.observed_surfaces,
  0,
  "accessor-backed evidence containers are not observed"
);

const accessorGovernance = {};
Object.defineProperty(accessorGovernance, "evidence", {
  enumerable: true,
  get: () => [{ control: "Role authorization", status: "observed" }]
});
assert.equal(
  buildPlatformControlReadiness({ governance: accessorGovernance }).summary.observed_surfaces,
  0,
  "accessor-backed governance evidence is not observed"
);

const forgedObservability = { events: [{ source: "forged" }] };
const forgedTopLevelInput = new Proxy({}, {
  ownKeys: () => ["observabilityLoaded", "observability"],
  getOwnPropertyDescriptor: (_, key) => key === "observabilityLoaded"
    ? { configurable: true, enumerable: true, writable: true, value: true }
    : key === "observability"
      ? { configurable: true, enumerable: true, writable: true, value: forgedObservability }
      : undefined,
  get: (_, key) => key === "observabilityLoaded" ? true : key === "observability" ? forgedObservability : undefined,
  getPrototypeOf: () => Object.prototype
});
const forgedTopLevelEvidence = buildPlatformControlReadiness(forgedTopLevelInput);
assert.equal(forgedTopLevelEvidence.summary.observed_surfaces, 0, "Proxy-forged top-level evidence fails closed");
assert.deepEqual(forgedTopLevelEvidence.surfaces.find((surface) => surface.page_id === "runtime-jobs")?.evidence, []);

const injectedEvent = { source: "forged-row" };
const proxiedEvents = new Proxy([{ source: "real-row" }], {
  getOwnPropertyDescriptor: (target, key) => key === "0"
    ? { configurable: true, enumerable: true, writable: true, value: injectedEvent }
    : Reflect.getOwnPropertyDescriptor(target, key),
  get: (target, key, receiver) => key === "0" ? injectedEvent : Reflect.get(target, key, receiver)
});
const forgedCollectionEvidence = buildPlatformControlReadiness({
  observabilityLoaded: true,
  observability: { events: proxiedEvents }
});
assert.equal(forgedCollectionEvidence.summary.observed_surfaces, 0, "Proxy-forged collection evidence fails closed");
assert.deepEqual(forgedCollectionEvidence.surfaces.find((surface) => surface.page_id === "runtime-jobs")?.evidence, []);

const contradictoryGovernance = buildPlatformControlReadiness({
  governance: {
    status: "blocked",
    evidence: [
      { control: "Authenticated session", status: "observed" },
      { control: "Authenticated session", status: "missing" },
      { control: "Role authorization", status: "observed" },
      { control: "Role authorization", status: "missing" }
    ],
    gaps: [
      { code: "session:missing", severity: "blocking" },
      { code: "access:role_enforcement_missing", severity: "blocking" }
    ]
  }
});
assert.equal(contradictoryGovernance.summary.observed_surfaces, 0, "contradictory blocked Governance cannot become observed");
assert.deepEqual(contradictoryGovernance.surfaces.find((surface) => surface.page_id === "enterprise-identity")?.evidence, []);

const freshRfc = buildPlatformControlReadiness({
  generatedAt,
  settings: { audit: [{ action: "architecture.rfc.reviewed", created_at: generatedAt }] }
});
assert.equal(freshRfc.surfaces.find((surface) => surface.page_id === "architecture-rfc")?.evidence.length, 1);
for (const createdAt of ["2025-01-01T00:00:00.000Z", "2026-02-31T12:00:00.000Z", "not-a-date"]) {
  const invalidRfc = buildPlatformControlReadiness({
    generatedAt,
    settings: { audit: [{ action: "architecture.rfc.reviewed", created_at: createdAt }] }
  });
  assert.deepEqual(
    invalidRfc.surfaces.find((surface) => surface.page_id === "architecture-rfc")?.evidence,
    [],
    `RFC evidence timestamp must be recent and valid: ${createdAt}`
  );
}

const impossibleDate = buildPlatformControlReadiness({ generatedAt: "2026-02-31T12:00:00.000Z" });
assert.notEqual(impossibleDate.generated_at, "2026-03-03T12:00:00.000Z", "invalid calendar dates must not normalize into audit evidence");

assert.match(html, /data-workbench-view-button="platform"/);
assert.match(html, /data-workbench-view-panel="platform"/);
assert.match(html, /data-workbench-view-button="governance"/);
assert.match(html, /settings-governance-panel/);
assert.match(html, /Evidence is not authorization/);
assert.match(source, /buildPlatformControlReadiness/);
assert.match(source, /buildAdminGovernanceReadiness/);
assert.match(source, /function renderReadinessViews/);
assert.match(styles, /\.settings-governance-panel,\s*\.settings-platform-panel/);
assert.match(packageJson.scripts.test, /platform55-intelligence\.test\.mjs/);
assert.match(packageJson.scripts.test, /platform55-admin-governance\.test\.mjs/);
assert.match(packageJson.scripts.test, /platform55-platform-readiness\.test\.mjs/);
const renderStart = source.indexOf("function renderPlatformReadiness");
const renderEnd = source.indexOf("function renderReadinessViews", renderStart);
const renderSource = source.slice(renderStart, renderEnd);
assert.doesNotMatch(renderSource, /(?:fetch|save|update|archive)[A-Z]/);
const platformPanelStart = html.indexOf('id="settings-platform-panel"');
const platformPanelEnd = html.indexOf('data-workbench-view-panel="profile"', platformPanelStart);
const platformPanel = html.slice(platformPanelStart, platformPanelEnd);
assert.doesNotMatch(platformPanel, /<(?:button|input|select|textarea|form|a)\b/i);

console.log("Platform 55 Sprint 10 platform readiness tests passed.");
