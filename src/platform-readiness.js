const SCHEMA_VERSION = "rateware.platform_control_readiness.v1";
const INVALID_DATA_PROPERTY = Symbol("invalid-data-property");
const AUDIT_RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const AUDIT_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

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

function isJsonEvidence(value, seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === "symbol")) return false;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor
      || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value")
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || keys.length !== lengthDescriptor.value + 1) return false;
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor
        || !descriptor.enumerable
        || !Object.prototype.hasOwnProperty.call(descriptor, "value")
        || !isJsonEvidence(descriptor.value, seen)) return false;
    }
    return true;
  }

  if (!isRecord(value)) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor
      || !descriptor.enumerable
      || !Object.prototype.hasOwnProperty.call(descriptor, "value")
      || !isJsonEvidence(descriptor.value, seen)) return false;
  }
  return true;
}

function jsonEvidenceSnapshot(value) {
  if (!isJsonEvidence(value) || typeof globalThis.structuredClone !== "function") {
    return INVALID_DATA_PROPERTY;
  }
  try {
    const snapshot = globalThis.structuredClone(value);
    return isJsonEvidence(snapshot) ? snapshot : INVALID_DATA_PROPERTY;
  } catch {
    return INVALID_DATA_PROPERTY;
  }
}

function ownDataProperty(value, key) {
  if (!isRecord(value)) return INVALID_DATA_PROPERTY;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) return INVALID_DATA_PROPERTY;
  if (!Reflect.ownKeys(value).includes(key)) return INVALID_DATA_PROPERTY;
  return Object.is(Reflect.get(value, key, value), descriptor.value)
    ? descriptor.value
    : INVALID_DATA_PROPERTY;
}

function recordProperty(value, key) {
  const property = ownDataProperty(value, key);
  return property === INVALID_DATA_PROPERTY ? {} : record(property);
}

function textProperty(value, key) {
  const property = ownDataProperty(value, key);
  return typeof property === "string" ? property.trim() : "";
}

function rowCollection(value) {
  if (!Array.isArray(value)) return { valid: false, rows: [] };
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value")) {
    return { valid: false, rows: [] };
  }
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length < 0 || Reflect.get(value, "length", value) !== length) {
    return { valid: false, rows: [] };
  }
  const ownKeys = Reflect.ownKeys(value);
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, "value")
      || !ownKeys.includes(key)
      || !Object.is(Reflect.get(value, key, value), descriptor.value)
      || !isRecord(descriptor.value)) {
      return { valid: false, rows: [] };
    }
    result.push(descriptor.value);
  }
  return { valid: true, rows: result };
}

function rows(value) {
  return rowCollection(value).rows;
}

function strictTimestamp(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour
    || calendar.getUTCMinutes() !== minute
    || calendar.getUTCSeconds() !== second) return null;
  if (zone !== "Z") {
    const [offsetHour, offsetMinute] = zone.slice(1).split(":").map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function generatedTimestamp(value) {
  return new Date(strictTimestamp(value) ?? Date.now()).toISOString();
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
    const snapshot = jsonEvidenceSnapshot(input);
    if (snapshot === INVALID_DATA_PROPERTY || !isRecord(snapshot)) throw new Error("invalid input");
    input = snapshot;
    const settings = recordProperty(input, "settings");
    const governance = recordProperty(input, "governance");
    const observability = recordProperty(input, "observability");
    const generatedAtValue = ownDataProperty(input, "generatedAt");
    const generatedAtTimestamp = generatedAtValue === undefined ? Date.now() : strictTimestamp(generatedAtValue);
    const auditCollection = rowCollection(ownDataProperty(settings, "audit"));
    const auditRows = auditCollection.rows.filter((row) => {
      const action = textProperty(row, "action");
      const createdAtTimestamp = strictTimestamp(textProperty(row, "created_at"));
      return Boolean(action
        && generatedAtTimestamp !== null
        && createdAtTimestamp !== null
        && createdAtTimestamp >= generatedAtTimestamp - AUDIT_RECENCY_WINDOW_MS
        && createdAtTimestamp <= generatedAtTimestamp + AUDIT_FUTURE_CLOCK_SKEW_MS);
    });
    const catalogCollection = rowCollection(ownDataProperty(input, "catalogValues"));
    const observabilityCollection = rowCollection(ownDataProperty(observability, "events"));
    const catalogValues = catalogCollection.rows;
    const observabilityEvents = observabilityCollection.rows;
    const governanceEvidence = rows(ownDataProperty(governance, "evidence"));
    const governanceGaps = rows(ownDataProperty(governance, "gaps"));

    const jobsEvidence = ownDataProperty(input, "observabilityLoaded") === true && observabilityCollection.valid
      ? [{ status: "observed", detail: `${observabilityEvents.length} operational event(s) are loaded; this does not prove job leases or receipts.` }]
      : [];
    const catalogEvidence = ownDataProperty(input, "catalogLoaded") === true && catalogCollection.valid
      ? [{ status: "observed", detail: `${catalogValues.filter((row) => ownDataProperty(row, "active") !== false).length} active catalog value(s) are loaded; ownership, dependencies, and SLO remain server-side gates.` }]
      : [];
    const rfcAuditCount = auditRows.filter((row) => /(?:architecture|rfc)/i.test(textProperty(row, "action"))).length;
    const rfcEvidence = rfcAuditCount
      ? [{ status: "observed", detail: `${rfcAuditCount} architecture-related audit event(s) are visible; a versioned decision and approval receipt are still required.` }]
      : [];
    const governanceBlocked = textProperty(governance, "status") === "blocked"
      || governanceGaps.some((gap) => textProperty(gap, "severity") === "blocking");
    const controlObserved = (control) => {
      const matches = governanceEvidence.filter((item) => textProperty(item, "control") === control);
      return !governanceBlocked && matches.length === 1 && textProperty(matches[0], "status") === "observed";
    };
    const sessionObserved = controlObserved("Authenticated session");
    const roleObserved = controlObserved("Role authorization");
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
        ...governanceGaps.filter((gap) => textProperty(gap, "severity") === "blocking").slice(0, 3).map(() => ({
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
      generated_at: generatedTimestamp(generatedAtValue),
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
