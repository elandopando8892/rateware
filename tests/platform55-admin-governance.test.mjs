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
