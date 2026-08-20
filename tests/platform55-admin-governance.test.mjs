import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildAdminGovernanceReadiness, SCHEMA_VERSION } from "../src/admin-governance.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "settings.html"), "utf8");
const intelligenceHtml = fs.readFileSync(path.join(root, "business-intelligence.html"), "utf8");
const source = fs.readFileSync(path.join(root, "src", "settings.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");
const generatedAt = "2026-08-13T12:00:00.000Z";

const settings = {
  profile: { owner_email: "operator@example.com" },
  organization: { org_name: "Example Logistics", workspace_slug: "example" },
  access: { mode: "full_access" },
  audit: [{ action: "settings.reviewed", created_at: generatedAt }],
  gmail: { rows: [{ status: "connected", configured: true }] },
  google_chat: { rows: [{ status: "connected", configured: true }] },
  whatsapp: { rows: [{ status: "connected", credentials_configured: true, connection_validated: true }] }
};

const broadAccess = buildAdminGovernanceReadiness({
  generatedAt,
  settings,
  session: { user: { email: "operator@example.com" } },
  observability: { events: [] },
  observabilityLoaded: true,
  catalogValues: [{ active: true }],
  catalogLoaded: true
});
assert.equal(broadAccess.schema_version, SCHEMA_VERSION);
assert.equal(broadAccess.status, "blocked");
assert.equal(broadAccess.mode, "observation_only");
assert.ok(broadAccess.gaps.some((gap) => gap.code === "access:role_enforcement_missing"));
assert.ok(broadAccess.gaps.some((gap) => gap.code === "tenant:server_evidence_required"));
assert.equal(Object.values(broadAccess.controls).some(Boolean), false);

const roleEnforced = buildAdminGovernanceReadiness({
  generatedAt,
  settings: { ...settings, access: { mode: "role_enforced" } },
  session: { user: { email: "operator@example.com" } },
  observability: { events: [] },
  observabilityLoaded: true,
  catalogValues: [{ active: true }],
  catalogLoaded: true
});
assert.equal(roleEnforced.status, "review_required", "server-only tenant evidence must remain explicit");
assert.equal(roleEnforced.summary.blocking_gaps, 0);

const missingSession = buildAdminGovernanceReadiness({ generatedAt, settings: { organization: {}, access: {} } });
assert.equal(missingSession.status, "blocked");
assert.ok(missingSession.gaps.some((gap) => gap.code === "session:missing"));
assert.ok(missingSession.gaps.some((gap) => gap.code === "workspace:missing"));

const staleProfile = buildAdminGovernanceReadiness({
  generatedAt,
  settings: { ...settings, access: { mode: "role_enforced" } },
  observabilityLoaded: true,
  catalogLoaded: true,
  catalogValues: []
});
assert.ok(staleProfile.gaps.some((gap) => gap.code === "session:missing"), "a cached profile must not prove a live session");
assert.ok(staleProfile.gaps.some((gap) => gap.code === "catalog:empty"));

const malformedAudit = buildAdminGovernanceReadiness({
  generatedAt,
  settings: { ...settings, audit: [{ arbitrary: true }] },
  session: { token: "present-but-never-exported" },
  observabilityLoaded: true,
  catalogLoaded: true,
  catalogValues: [{ active: true }]
});
assert.ok(malformedAudit.gaps.some((gap) => gap.code === "audit:evidence_missing"));

const invalid = new Proxy({}, { getPrototypeOf() { throw new Error("hostile"); } });
assert.doesNotThrow(() => buildAdminGovernanceReadiness(invalid));
assert.equal(buildAdminGovernanceReadiness(invalid).status, "blocked");

const roleEnforcedSettings = { ...settings, access: { mode: "role_enforced" } };
const completeEvidence = {
  generatedAt,
  observability: { events: [] },
  observabilityLoaded: true,
  catalogValues: [{ active: true }],
  catalogLoaded: true
};
const hasGap = (readiness, code) => readiness.gaps.some((gap) => gap.code === code);
const evidenceStatus = (readiness, control) => readiness.evidence.find((item) => item.control === control)?.status;

const whitespaceScalars = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: {
    ...roleEnforcedSettings,
    organization: { org_name: " \t\n ", workspace_slug: "  ", id: "\r\n" }
  },
  session: { token: " \t\n ", user: { email: "  " } }
});

const nonStringScalars = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: { ...roleEnforcedSettings, organization: { id: [] } },
  session: { token: {}, user: { email: false } }
});

const hiddenDescriptor = (forged) => new Proxy({}, {
  getPrototypeOf() { return Object.prototype; },
  get(_target, key) { return forged[key]; },
  getOwnPropertyDescriptor() { return undefined; },
  ownKeys() { return []; }
});
const descriptorHiding = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: {
    ...settings,
    organization: hiddenDescriptor({ id: "workspace-forged" }),
    access: hiddenDescriptor({ mode: "role_enforced" })
  },
  session: hiddenDescriptor({ token: "session-forged" })
});
const accessorSession = {};
const accessorOrganization = {};
const accessorAccess = {};
Object.defineProperty(accessorSession, "token", { enumerable: true, get: () => "session-forged" });
Object.defineProperty(accessorOrganization, "id", { enumerable: true, get: () => "workspace-forged" });
Object.defineProperty(accessorAccess, "mode", { enumerable: true, get: () => "role_enforced" });
const accessorEvidence = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: { ...settings, organization: accessorOrganization, access: accessorAccess },
  session: accessorSession
});

const invalidObservability = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: roleEnforcedSettings,
  session: { token: "session-valid" },
  observability: { events: { forged: true } }
});

const invalidAuditTimestamp = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: {
    ...roleEnforcedSettings,
    audit: [{ action: "settings.reviewed", created_at: "not-a-date" }]
  },
  session: { token: "session-valid" }
});

const unconfiguredGmail = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: {
    ...roleEnforcedSettings,
    gmail: { rows: [{ status: "connected", configured: false }] }
  },
  session: { token: "session-valid" }
});

assert.deepEqual([
  {
    family: "whitespace-only session and workspace evidence",
    passed: whitespaceScalars.status === "blocked"
      && hasGap(whitespaceScalars, "session:missing")
      && hasGap(whitespaceScalars, "workspace:missing")
  },
  {
    family: "non-string session and workspace evidence",
    passed: nonStringScalars.status === "blocked"
      && hasGap(nonStringScalars, "session:missing")
      && hasGap(nonStringScalars, "workspace:missing")
  },
  {
    family: "descriptor-hiding proxies and accessor evidence",
    passed: descriptorHiding.status === "blocked"
      && hasGap(descriptorHiding, "session:missing")
      && hasGap(descriptorHiding, "workspace:missing")
      && hasGap(descriptorHiding, "access:role_enforcement_missing")
      && accessorEvidence.status === "blocked"
      && hasGap(accessorEvidence, "session:missing")
      && hasGap(accessorEvidence, "workspace:missing")
      && hasGap(accessorEvidence, "access:role_enforcement_missing")
  },
  {
    family: "invalid observability container",
    passed: evidenceStatus(invalidObservability, "Operational observability") === "not_observed"
      && hasGap(invalidObservability, "observability:not_loaded")
  },
  {
    family: "invalid audit timestamp",
    passed: evidenceStatus(invalidAuditTimestamp, "Audit trail") === "not_observed"
      && hasGap(invalidAuditTimestamp, "audit:evidence_missing")
  },
  {
    family: "explicitly unconfigured Gmail integration",
    passed: evidenceStatus(unconfiguredGmail, "Gmail integration") === "not_observed"
      && hasGap(unconfiguredGmail, "integration:gmail")
  }
], [
  { family: "whitespace-only session and workspace evidence", passed: true },
  { family: "non-string session and workspace evidence", passed: true },
  { family: "descriptor-hiding proxies and accessor evidence", passed: true },
  { family: "invalid observability container", passed: true },
  { family: "invalid audit timestamp", passed: true },
  { family: "explicitly unconfigured Gmail integration", passed: true }
]);

assert.match(html, /data-workbench-view-button="governance"/);
assert.match(html, /data-workbench-view-panel="governance"/);
assert.match(html, /Readiness is not authorization/);
assert.match(html, /Authentication is active, but broad module access is not equivalent to governed authorization/);
assert.match(html, /switch tenant enforcement/);
assert.match(intelligenceHtml, /data-bi-view-button="brief"[^>]*>Decision brief</);
assert.match(intelligenceHtml, /data-bi-view-panel="brief" hidden/);
assert.match(styles, /\.bi-workbench-nav,\s*\.module-workbench-nav\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(source, /buildAdminGovernanceReadiness/);
assert.doesNotMatch(source, /function renderGovernance[\s\S]+callRatewareApi/);

console.log("Platform 55 Sprint 9 administration governance tests passed.");
