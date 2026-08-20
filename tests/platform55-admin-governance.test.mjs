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
const forgedDescriptor = (forged) => new Proxy({}, {
  getPrototypeOf() { return Object.prototype; },
  get() { return undefined; },
  getOwnPropertyDescriptor(_target, key) {
    if (!Object.prototype.hasOwnProperty.call(forged, key)) return undefined;
    return { configurable: true, enumerable: true, writable: true, value: forged[key] };
  },
  ownKeys() { return []; }
});
const descriptorForging = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: {
    ...settings,
    organization: forgedDescriptor({ id: "workspace-forged" }),
    access: forgedDescriptor({ mode: "role_enforced" })
  },
  session: forgedDescriptor({ token: "session-forged" })
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
    family: "descriptor-forging proxy inconsistency",
    passed: descriptorForging.status === "blocked"
      && hasGap(descriptorForging, "session:missing")
      && hasGap(descriptorForging, "workspace:missing")
      && hasGap(descriptorForging, "access:role_enforcement_missing")
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
  { family: "descriptor-forging proxy inconsistency", passed: true },
  { family: "invalid observability container", passed: true },
  { family: "invalid audit timestamp", passed: true },
  { family: "explicitly unconfigured Gmail integration", passed: true }
]);

const connectedGmailRow = { status: "connected", configured: true };
const validAuditRow = { action: "settings.reviewed", created_at: generatedAt };
const inheritedElementArray = (element) => {
  const prototype = Object.create(Array.prototype);
  Object.defineProperty(prototype, "0", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: element
  });
  const value = [];
  Object.setPrototypeOf(value, prototype);
  value.length = 1;
  return value;
};

const accessorConnectorRows = [];
Object.defineProperty(accessorConnectorRows, "0", {
  configurable: true,
  enumerable: true,
  get: () => connectedGmailRow
});
const accessorConnectorEvidence = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: { ...roleEnforcedSettings, gmail: { rows: accessorConnectorRows } },
  session: { token: "session-valid" }
});

const inheritedAuditEvidence = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: { ...roleEnforcedSettings, audit: inheritedElementArray(validAuditRow) },
  session: { token: "session-valid" }
});

const inheritedConnectorEvidence = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: { ...roleEnforcedSettings, gmail: { rows: inheritedElementArray(connectedGmailRow) } },
  session: { token: "session-valid" }
});

const inheritedCatalogEvidence = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: roleEnforcedSettings,
  session: { token: "session-valid" },
  catalogValues: inheritedElementArray({ active: true })
});

const proxyConnectorRows = new Proxy([], {
  get(target, key, receiver) {
    if (key === "length") return 1;
    if (key === "0") return connectedGmailRow;
    return Reflect.get(target, key, receiver);
  },
  has(target, key) {
    if (key === "0") return true;
    return Reflect.has(target, key);
  }
});
const proxyConnectorEvidence = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: { ...roleEnforcedSettings, gmail: { rows: proxyConnectorRows } },
  session: { token: "session-valid" }
});

const bareNumberTimestampEvidence = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: {
    ...roleEnforcedSettings,
    audit: [{ action: "settings.reviewed", created_at: "1" }]
  },
  session: { token: "session-valid" }
});

const impossibleTimestampEvidence = buildAdminGovernanceReadiness({
  ...completeEvidence,
  settings: {
    ...roleEnforcedSettings,
    audit: [{ action: "settings.reviewed", created_at: "2026-02-30T00:00:00.000Z" }]
  },
  session: { token: "session-valid" }
});

const roundThreeEvidence = [
  accessorConnectorEvidence,
  inheritedAuditEvidence,
  inheritedConnectorEvidence,
  inheritedCatalogEvidence,
  proxyConnectorEvidence,
  bareNumberTimestampEvidence,
  impossibleTimestampEvidence
];
assert.deepEqual([
  {
    family: "connector rows[0] accessor",
    passed: evidenceStatus(accessorConnectorEvidence, "Gmail integration") === "not_observed"
      && hasGap(accessorConnectorEvidence, "integration:gmail")
  },
  {
    family: "inherited audit[0]",
    passed: evidenceStatus(inheritedAuditEvidence, "Audit trail") === "not_observed"
      && hasGap(inheritedAuditEvidence, "audit:evidence_missing")
  },
  {
    family: "inherited Gmail rows[0]",
    passed: evidenceStatus(inheritedConnectorEvidence, "Gmail integration") === "not_observed"
      && hasGap(inheritedConnectorEvidence, "integration:gmail")
  },
  {
    family: "inherited catalogValues[0]",
    passed: evidenceStatus(inheritedCatalogEvidence, "Master-data catalog") === "not_observed"
      && hasGap(inheritedCatalogEvidence, "catalog:not_loaded")
  },
  {
    family: "Proxy array fabricating rows[0] through has/get",
    passed: evidenceStatus(proxyConnectorEvidence, "Gmail integration") === "not_observed"
      && hasGap(proxyConnectorEvidence, "integration:gmail")
  },
  {
    family: "bare numeric audit timestamp",
    passed: evidenceStatus(bareNumberTimestampEvidence, "Audit trail") === "not_observed"
      && hasGap(bareNumberTimestampEvidence, "audit:evidence_missing")
  },
  {
    family: "impossible calendar audit timestamp",
    passed: evidenceStatus(impossibleTimestampEvidence, "Audit trail") === "not_observed"
      && hasGap(impossibleTimestampEvidence, "audit:evidence_missing")
  }
], [
  { family: "connector rows[0] accessor", passed: true },
  { family: "inherited audit[0]", passed: true },
  { family: "inherited Gmail rows[0]", passed: true },
  { family: "inherited catalogValues[0]", passed: true },
  { family: "Proxy array fabricating rows[0] through has/get", passed: true },
  { family: "bare numeric audit timestamp", passed: true },
  { family: "impossible calendar audit timestamp", passed: true }
]);
assert.equal(roundThreeEvidence.some((readiness) => Object.values(readiness.controls).some(Boolean)), false);

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
