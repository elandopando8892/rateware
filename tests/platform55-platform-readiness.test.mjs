import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildPlatformControlReadiness, SCHEMA_VERSION } from "../src/platform-readiness.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "settings.html"), "utf8");
const source = fs.readFileSync(path.join(root, "src", "settings.js"), "utf8");
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

assert.match(html, /data-workbench-view-button="platform"/);
assert.match(html, /data-workbench-view-panel="platform"/);
assert.match(html, /Evidence is not authorization/);
assert.match(source, /buildPlatformControlReadiness/);
const renderStart = source.indexOf("function renderPlatformReadiness");
const renderEnd = source.indexOf("function renderReadinessViews", renderStart);
const renderSource = source.slice(renderStart, renderEnd);
assert.doesNotMatch(renderSource, /(?:fetch|save|update|archive)[A-Z]/);

console.log("Platform 55 Sprint 10 platform readiness tests passed.");
