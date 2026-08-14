const SCHEMA_VERSION = "rateware.platform_control_readiness.v1";

const CONTROL_DEFAULTS = Object.freeze({
  job_execution_authorized: false,
  catalog_publish_authorized: false,
  rfc_approval_authorized: false,
  identity_change_authorized: false,
  secret_access_authorized: false,
  flag_change_authorized: false,
  cutover_authorized: false
});

const SURFACES = Object.freeze([
  ["runtime-jobs", "Runtime jobs", "idempotency + leases + receipts + tenant"],
  ["service-catalog", "Service catalog", "owner + dependency graph + SLO"],
  ["architecture-rfc", "Architecture RFC", "versioned decision + review"],
  ["enterprise-identity", "Enterprise identity", "required gate + session lifecycle + separation of duties"],
  ["secrets-overview", "Secrets overview", "never render secret + rotation + receipt"],
  ["feature-flags", "Feature flags", "entitlement separation + cohort + kill switch"],
  ["implementation", "Implementation gates", "PLAN + PREPARE + VALIDATE + PILOT + CUTOVER + STABILIZE"]
]);

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(value) {
  return isRecord(value) ? value : {};
}

function rows(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function generatedTimestamp(value) {
  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return new Date().toISOString();
}

function blockedSurface(pageId, name, releaseGate, evidence, gaps) {
  return {
    page_id: pageId,
    name,
    state: "blocked",
    release_gate: releaseGate,
    evidence,
    gaps
  };
}

function invalidResult(generatedAt) {
  const surfaces = SURFACES.map(([pageId, name, releaseGate]) => blockedSurface(
    pageId,
    name,
    releaseGate,
    [],
    [{ code: `${pageId}:input_invalid`, message: "Readiness evidence could not be evaluated safely." }]
  ));
  return {
    schema_version: SCHEMA_VERSION,
    mode: "observation_only",
    status: "blocked",
    generated_at: generatedTimestamp(generatedAt),
    summary: { surfaces: surfaces.length, observed_surfaces: 0, blocked_surfaces: surfaces.length, server_only_gates: 7 },
    surfaces,
    implementation_stages: ["PLAN", "PREPARE", "VALIDATE", "PILOT", "CUTOVER", "STABILIZE"].map((stage) => ({
      stage,
      state: "blocked",
      detail: "Valid readiness evidence is required before this stage can advance."
    })),
    controls: { ...CONTROL_DEFAULTS }
  };
}

export function buildPlatformControlReadiness(input = {}) {
  try {
    if (!isRecord(input)) throw new Error("invalid input");
    const settings = record(input.settings);
    const governance = record(input.governance);
    const observability = record(input.observability);
    const auditRows = rows(settings.audit);
    const catalogValues = rows(input.catalogValues);
    const observabilityEvents = rows(observability.events);
    const governanceEvidence = rows(governance.evidence);
    const governanceGaps = rows(governance.gaps);

    const jobsEvidence = input.observabilityLoaded === true
      ? [{ status: "observed", detail: `${observabilityEvents.length} operational event(s) are loaded; this does not prove job leases or receipts.` }]
      : [];
    const catalogEvidence = input.catalogLoaded === true
      ? [{ status: "observed", detail: `${catalogValues.filter((row) => row.active !== false).length} active catalog value(s) are loaded; ownership, dependencies, and SLO remain server-side gates.` }]
      : [];
    const rfcAuditCount = auditRows.filter((row) => typeof row.action === "string" && /(?:architecture|rfc)/i.test(row.action)).length;
    const rfcEvidence = rfcAuditCount
      ? [{ status: "observed", detail: `${rfcAuditCount} architecture-related audit event(s) are visible; a versioned decision and approval receipt are still required.` }]
      : [];
    const sessionObserved = governanceEvidence.some((item) => item.control === "Authenticated session" && item.status === "observed");
    const roleObserved = governanceEvidence.some((item) => item.control === "Role authorization" && item.status === "observed");
    const identityEvidence = [
      ...(sessionObserved ? [{ status: "observed", detail: "An authenticated browser session is present." }] : []),
      ...(roleObserved ? [{ status: "observed", detail: "The Settings contract reports role enforcement; required-mode tenant evidence remains server-only." }] : [])
    ];

    const surfaces = [
      blockedSurface("runtime-jobs", "Runtime jobs", SURFACES[0][2], jobsEvidence, [
        { code: "jobs:server_receipt_required", message: "Prove tenant-scoped idempotency, lease ownership, retries, and immutable execution receipts on the server." }
      ]),
      blockedSurface("service-catalog", "Service catalog", SURFACES[1][2], catalogEvidence, [
        { code: "catalog:governance_required", message: "Prove service ownership, dependency graph, publishing review, and SLO before catalog release." }
      ]),
      blockedSurface("architecture-rfc", "Architecture RFC", SURFACES[2][2], rfcEvidence, [
        { code: "rfc:versioned_review_required", message: "A versioned architecture decision and human approval receipt are required." }
      ]),
      blockedSurface("enterprise-identity", "Enterprise identity", SURFACES[3][2], identityEvidence, [
        { code: "identity:server_gate_required", message: "Confirm canonical identity links, session lifecycle, separation of duties, and required-mode enforcement server-side." },
        ...governanceGaps.filter((gap) => gap.severity === "blocking").slice(0, 3).map(() => ({
          code: "governance:blocking_gap",
          message: "Administration governance still contains a blocking control gap."
        }))
      ]),
      blockedSurface("secrets-overview", "Secrets overview", SURFACES[4][2], [
        { status: "guarded", detail: "Secret names, values, tokens, and environment contents are intentionally not rendered or inferred in the browser." }
      ], [
        { code: "secrets:rotation_receipt_required", message: "Verify secret ownership, rotation policy, last rotation, and receipt in a privileged server-side workflow." }
      ]),
      blockedSurface("feature-flags", "Feature flags", SURFACES[5][2], [], [
        { code: "flags:server_state_required", message: "Verify entitlement separation, cohort targeting, audit trail, and kill switch without exposing flag controls here." }
      ]),
      blockedSurface("implementation", "Implementation gates", SURFACES[6][2], [], [
        { code: "implementation:upstream_gates_blocked", message: "Preparation cannot advance while any platform control surface remains blocked." }
      ])
    ];

    const observedSurfaces = surfaces.filter((surface) => surface.evidence.some((item) => item.status === "observed")).length;
    return {
      schema_version: SCHEMA_VERSION,
      mode: "observation_only",
      status: "blocked",
      generated_at: generatedTimestamp(input.generatedAt),
      summary: {
        surfaces: surfaces.length,
        observed_surfaces: observedSurfaces,
        blocked_surfaces: surfaces.filter((surface) => surface.state === "blocked").length,
        server_only_gates: 7
      },
      surfaces,
      implementation_stages: [
        { stage: "PLAN", state: "review_required", detail: "Readiness gaps may be reviewed and assigned; this is not implementation authorization." },
        { stage: "PREPARE", state: "blocked", detail: "Complete control ownership and server-side evidence first." },
        { stage: "VALIDATE", state: "blocked", detail: "Independent validation requires an approved preparation package." },
        { stage: "PILOT", state: "blocked", detail: "No pilot is authorized from this browser view." },
        { stage: "CUTOVER", state: "blocked", detail: "Cutover requires explicit human authorization and rollback evidence." },
        { stage: "STABILIZE", state: "blocked", detail: "Stabilization begins only after an authorized cutover." }
      ],
      controls: { ...CONTROL_DEFAULTS }
    };
  } catch {
    return invalidResult();
  }
}

export { SCHEMA_VERSION };
