export const REQUIRED_SHADOW_ENTRYPOINTS = Object.freeze([
  "rateware-api",
  "shipper-directory-api",
  "create-raw-upload",
  "interpret-upload",
  "sync-rateware-catalog"
]);

const TENANT_REF_PATTERN = /^[a-f0-9]{16}$/;
const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "email",
  "subject",
  "external_subject",
  "external_organization_id",
  "token",
  "bearer_token",
  "user_metadata",
  "raw_user_meta_data"
]);

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function validDate(value) {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function gate(id, pass, detail) {
  return Object.freeze({ id, pass: Boolean(pass), detail });
}

function containsForbiddenEvidence(value, seen = new Set()) {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_KEYS.has(key.toLowerCase())) return true;
    if (containsForbiddenEvidence(child, seen)) return true;
  }
  return false;
}

function smokeGate(entrypoint, smoke, tenantRef) {
  if (!smoke) return gate(`smoke:${entrypoint}`, false, "missing authenticated smoke");
  if (smoke.entrypoint !== entrypoint) return gate(`smoke:${entrypoint}`, false, "entrypoint mismatch");
  if (smoke.status !== "pass" || smoke.authenticated !== true) {
    return gate(`smoke:${entrypoint}`, false, "smoke did not pass with authentication");
  }
  if (!TENANT_REF_PATTERN.test(smoke.tenant_ref || "") || smoke.tenant_ref !== tenantRef) {
    return gate(`smoke:${entrypoint}`, false, "tenant reference is missing, invalid, or inconsistent");
  }

  if (entrypoint === "create-raw-upload") {
    const created = nonNegativeInteger(smoke.raw_uploads_created);
    if (created !== 1 || !String(smoke.artifact_ref || "").trim()) {
      return gate(`smoke:${entrypoint}`, false, "expected exactly one auditable raw upload");
    }
  }

  if (entrypoint === "interpret-upload") {
    const staged = nonNegativeInteger(smoke.staging_rows_created);
    const approved = nonNegativeInteger(smoke.approved_rows_created);
    if (staged === null || staged < 1 || approved !== 0 || smoke.approval_status !== "pending_review") {
      return gate(`smoke:${entrypoint}`, false, "interpretation must stage rows without approval");
    }
  }

  if (entrypoint === "sync-rateware-catalog") {
    const writes = nonNegativeInteger(smoke.writes);
    if (smoke.dry_run !== true || writes !== 0) {
      return gate(`smoke:${entrypoint}`, false, "catalog smoke must be a zero-write dry run");
    }
  }

  return gate(`smoke:${entrypoint}`, true, "authenticated smoke passed");
}

export function evaluateShadowReadiness(evidence, options = {}) {
  const minimumWindowHours = Number.isFinite(options.minimumWindowHours)
    ? Math.max(0, Number(options.minimumWindowHours))
    : 24;
  const mapping = evidence?.mapping || {};
  const shadow = evidence?.shadow_window || {};
  const tenantRef = typeof evidence?.tenant_ref === "string" ? evidence.tenant_ref : "";
  const gates = [];

  gates.push(gate(
    "mode",
    evidence?.mode === "shadow",
    evidence?.mode === "shadow" ? "shadow is explicitly enabled" : "mode must remain shadow"
  ));
  gates.push(gate(
    "tenant_ref",
    TENANT_REF_PATTERN.test(tenantRef),
    TENANT_REF_PATTERN.test(tenantRef) ? "pseudonymous tenant reference is valid" : "tenant_ref must be 16 lowercase hex characters"
  ));
  gates.push(gate(
    "evidence_redaction",
    !containsForbiddenEvidence(evidence),
    "evidence must not contain raw identity, organization, token, or metadata fields"
  ));

  const operators = nonNegativeInteger(mapping.operator_subjects_total);
  const mappedOperators = nonNegativeInteger(mapping.operator_subjects_with_exactly_one_active_reviewed_identity);
  const ambiguousOperators = nonNegativeInteger(mapping.operator_subjects_ambiguous);
  gates.push(gate(
    "identities",
    operators !== null && operators > 0 && mappedOperators === operators && ambiguousOperators === 0,
    "every in-scope operator must have exactly one active reviewed identity"
  ));
  gates.push(gate(
    "organization_link",
    mapping.active_reviewed_organization_links === 1,
    "exactly one active reviewed organization link is required"
  ));
  gates.push(gate(
    "workspace_registry",
    mapping.workspace_registry_rows === 1 && mapping.reconciled_workspace_rows === 1 && mapping.link_matches_registry === true,
    "the single workspace UUID must be reconciled and match the organization link"
  ));

  const startedAt = validDate(shadow.started_at);
  const endedAt = validDate(shadow.ended_at);
  const durationHours = startedAt !== null && endedAt !== null && endedAt >= startedAt
    ? (endedAt - startedAt) / 3_600_000
    : null;
  const legitimateRequests = nonNegativeInteger(shadow.legitimate_requests);
  const legitimateRejections = nonNegativeInteger(shadow.legitimate_rejections);
  gates.push(gate(
    "shadow_window",
    durationHours !== null && durationHours >= minimumWindowHours && legitimateRequests !== null && legitimateRequests > 0 && legitimateRejections === 0,
    `requires at least ${minimumWindowHours}h, observed legitimate traffic, and zero legitimate rejections`
  ));

  const smokeRows = Array.isArray(evidence?.smokes) ? evidence.smokes : [];
  const smokeEntrypoints = smokeRows.map((row) => row?.entrypoint).filter(Boolean);
  const duplicates = smokeRows
    .map((row) => row?.entrypoint)
    .filter((entrypoint, index, all) => entrypoint && all.indexOf(entrypoint) !== index);
  gates.push(gate("smoke_uniqueness", duplicates.length === 0, "each entrypoint must have one smoke result"));
  gates.push(gate(
    "smoke_set",
    smokeRows.length === REQUIRED_SHADOW_ENTRYPOINTS.length
      && smokeEntrypoints.every((entrypoint) => REQUIRED_SHADOW_ENTRYPOINTS.includes(entrypoint)),
    "the evidence must contain exactly the five governed entrypoints"
  ));
  for (const entrypoint of REQUIRED_SHADOW_ENTRYPOINTS) {
    gates.push(smokeGate(entrypoint, smokeRows.find((row) => row?.entrypoint === entrypoint), tenantRef));
  }

  const blockers = gates.filter((item) => !item.pass).map((item) => item.id);
  return Object.freeze({
    ready: blockers.length === 0,
    verdict: blockers.length === 0 ? "GO" : "NO-GO",
    minimum_window_hours: minimumWindowHours,
    gates: Object.freeze(gates),
    blockers: Object.freeze(blockers)
  });
}
