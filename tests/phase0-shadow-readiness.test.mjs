import assert from "node:assert/strict";
import test from "node:test";

import { evaluateShadowReadiness, REQUIRED_SHADOW_ENTRYPOINTS } from "../tools/phase0-shadow-readiness-lib.mjs";

const tenantRef = "0123456789abcdef";

function readyEvidence() {
  return {
    mode: "shadow",
    tenant_ref: tenantRef,
    mapping: {
      operator_subjects_total: 1,
      operator_subjects_with_exactly_one_active_reviewed_identity: 1,
      operator_subjects_ambiguous: 0,
      active_reviewed_organization_links: 1,
      workspace_registry_rows: 1,
      reconciled_workspace_rows: 1,
      link_matches_registry: true
    },
    shadow_window: {
      started_at: "2026-08-11T00:00:00.000Z",
      ended_at: "2026-08-12T00:00:00.000Z",
      legitimate_requests: 20,
      legitimate_rejections: 0
    },
    smokes: REQUIRED_SHADOW_ENTRYPOINTS.map((entrypoint) => ({
      entrypoint,
      tenant_ref: tenantRef,
      authenticated: true,
      status: "pass",
      ...(entrypoint === "create-raw-upload" ? { raw_uploads_created: 1, artifact_ref: "smoke-upload-ref" } : {}),
      ...(entrypoint === "interpret-upload" ? { staging_rows_created: 1, approved_rows_created: 0, approval_status: "pending_review" } : {}),
      ...(entrypoint === "sync-rateware-catalog" ? { dry_run: true, writes: 0 } : {})
    }))
  };
}

test("readiness passes only when all canonical, shadow, and smoke gates pass", () => {
  const result = evaluateShadowReadiness(readyEvidence());
  assert.equal(result.ready, true);
  assert.equal(result.verdict, "GO");
  assert.deepEqual(result.blockers, []);
});

test("identity ambiguity and tenant mapping conflicts fail closed", () => {
  const evidence = readyEvidence();
  evidence.mapping.operator_subjects_ambiguous = 1;
  evidence.mapping.link_matches_registry = false;
  const result = evaluateShadowReadiness(evidence);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("identities"));
  assert.ok(result.blockers.includes("workspace_registry"));
});

test("short windows and legitimate shadow rejections block required mode", () => {
  const evidence = readyEvidence();
  evidence.shadow_window.ended_at = "2026-08-11T01:00:00.000Z";
  evidence.shadow_window.legitimate_rejections = 1;
  const result = evaluateShadowReadiness(evidence);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("shadow_window"));
});

test("all five authenticated entrypoints are mandatory and unique", () => {
  const evidence = readyEvidence();
  evidence.smokes = evidence.smokes.filter((row) => row.entrypoint !== "shipper-directory-api");
  evidence.smokes.push({ ...evidence.smokes[0] });
  const result = evaluateShadowReadiness(evidence);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("smoke_uniqueness"));
  assert.ok(result.blockers.includes("smoke:shipper-directory-api"));
});

test("unknown smokes and raw identity evidence fail closed", () => {
  const evidence = readyEvidence();
  evidence.smokes.push({
    entrypoint: "unknown-api",
    tenant_ref: tenantRef,
    authenticated: true,
    status: "pass"
  });
  evidence.operator = { email: "operator@example.test" };
  const result = evaluateShadowReadiness(evidence);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("smoke_set"));
  assert.ok(result.blockers.includes("evidence_redaction"));
});

test("interpretation can never satisfy readiness by auto-approving rows", () => {
  const evidence = readyEvidence();
  const smoke = evidence.smokes.find((row) => row.entrypoint === "interpret-upload");
  smoke.approval_status = "approved";
  smoke.approved_rows_created = 1;
  const result = evaluateShadowReadiness(evidence);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("smoke:interpret-upload"));
});

test("catalog readiness requires an explicit zero-write dry run", () => {
  const evidence = readyEvidence();
  const smoke = evidence.smokes.find((row) => row.entrypoint === "sync-rateware-catalog");
  smoke.dry_run = false;
  smoke.writes = 10;
  const result = evaluateShadowReadiness(evidence);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("smoke:sync-rateware-catalog"));
});

test("smokes cannot mix tenants or expose a raw tenant identifier", () => {
  const evidence = readyEvidence();
  evidence.smokes[0].tenant_ref = "external-org-id";
  const result = evaluateShadowReadiness(evidence);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.includes("smoke:rateware-api"));
});
