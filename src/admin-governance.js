const SCHEMA_VERSION = "rateware.admin_governance_readiness.v1";
const INVALID_DATA_PROPERTY = Symbol("invalid-data-property");

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(value) {
  return isRecord(value) ? value : {};
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
      || !Object.is(Reflect.get(value, key, value), descriptor.value)) {
      return { valid: false, rows: [] };
    }
    if (isRecord(descriptor.value)) result.push(descriptor.value);
  }
  return { valid: true, rows: result };
}

function validAuditTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (calendar.getUTCFullYear() !== year
    || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour
    || calendar.getUTCMinutes() !== minute
    || calendar.getUTCSeconds() !== second) return false;
  if (zone !== "Z") {
    const [offsetHour, offsetMinute] = zone.slice(1).split(":").map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return Number.isFinite(Date.parse(value));
}

function integrationState(value, options = {}) {
  const row = rowCollection(ownDataProperty(record(value), "rows")).rows[0] || {};
  const status = textProperty(row, "status");
  const configured = ownDataProperty(row, "configured") === true
    || ownDataProperty(row, "credentials_configured") === true;
  const connected = configured
    && status === "connected"
    && (options.requiresValidation !== true || ownDataProperty(row, "connection_validated") === true);
  return {
    configured,
    connected,
    status: connected ? "observed" : status === "error" ? "error" : "not_observed"
  };
}

function generatedTimestamp(value) {
  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return new Date().toISOString();
}

export function buildAdminGovernanceReadiness(input = {}) {
  try {
    if (!isRecord(input)) throw new Error("invalid input");
    const settings = recordProperty(input, "settings");
    const session = recordProperty(input, "session");
    const organization = recordProperty(settings, "organization");
    const access = recordProperty(settings, "access");
    const auditCollection = rowCollection(ownDataProperty(settings, "audit"));
    const audit = auditCollection.rows.filter((row) => {
      const action = textProperty(row, "action");
      const createdAt = textProperty(row, "created_at");
      return Boolean(action && createdAt && validAuditTimestamp(createdAt));
    });
    const catalogValueContainer = ownDataProperty(input, "catalogValues");
    const catalogCollection = rowCollection(catalogValueContainer);
    const catalogValues = catalogCollection.rows;
    const observability = recordProperty(input, "observability");
    const observabilityEventContainer = ownDataProperty(observability, "events");
    const observabilityCollection = rowCollection(observabilityEventContainer);
    const observabilityEvents = observabilityCollection.rows;
    const gmail = integrationState(ownDataProperty(settings, "gmail"));
    const googleChat = integrationState(ownDataProperty(settings, "google_chat"));
    const whatsapp = integrationState(ownDataProperty(settings, "whatsapp"), { requiresValidation: true });
    const gaps = [];
    const evidence = [];

    const addGap = (code, severity, message) => gaps.push({ code, severity, message });
    const addEvidence = (control, status, detail) => evidence.push({ control, status, detail });

    const authenticated = Boolean(textProperty(session, "token") || textProperty(recordProperty(session, "user"), "email"));
    addEvidence("Authenticated session", authenticated ? "observed" : "missing", authenticated
      ? "A private user session is present. Authentication alone does not grant a role."
      : "No authenticated user session was observed.");
    if (!authenticated) addGap("session:missing", "blocking", "An authenticated private session is required.");

    const workspacePresent = Boolean(
      textProperty(organization, "org_name")
      || textProperty(organization, "workspace_slug")
      || textProperty(organization, "id")
    );
    addEvidence("Workspace context", workspacePresent ? "observed" : "missing", workspacePresent
      ? "A workspace organization is present in the existing Settings response."
      : "No workspace organization was supplied by Settings.");
    if (!workspacePresent) addGap("workspace:missing", "blocking", "A workspace organization is required for governed administration.");

    const rolesEnforced = textProperty(access, "mode") === "role_enforced";
    addEvidence("Role authorization", rolesEnforced ? "observed" : "missing", rolesEnforced
      ? "The Settings contract reports role enforcement."
      : "The Settings contract reports broad authenticated access; roles and separation of duties are not enforced.");
    if (!rolesEnforced) addGap("access:role_enforcement_missing", "blocking", "Role-based authorization and separation of duties are not enforced.");

    addEvidence("Canonical tenant enforcement", "not_observable", "Browser Settings does not expose server enforcement secrets or prove canonical identity mappings.");
    addGap("tenant:server_evidence_required", "review", "Confirm canonical identity, organization link, workspace registry, and enforcement mode through server-side evidence.");

    addEvidence("Audit trail", audit.length ? "observed" : "not_observed", audit.length
      ? `${audit.length} recent audit event(s) were returned by the existing Settings response.`
      : "No recent audit event was returned.");
    if (!audit.length) addGap("audit:evidence_missing", "review", "No recent administration audit evidence is available in this session.");

    const observabilityLoaded = ownDataProperty(input, "observabilityLoaded") === true
      && observabilityCollection.valid;
    addEvidence("Operational observability", observabilityLoaded ? "observed" : "not_observed", observabilityLoaded
      ? `${observabilityEvents.length} recent operational event(s) were loaded.`
      : "Operational events have not been loaded in this session.");
    if (!observabilityLoaded) addGap("observability:not_loaded", "review", "Load operational evidence before treating the readiness view as current.");

    const catalogLoaded = ownDataProperty(input, "catalogLoaded") === true
      && catalogCollection.valid;
    addEvidence("Master-data catalog", catalogLoaded ? "observed" : "not_observed", catalogLoaded
      ? `${catalogValues.filter((row) => ownDataProperty(row, "active") !== false).length} active catalog value(s) were loaded.`
      : "Catalog evidence has not been loaded in this session.");
    if (!catalogLoaded) addGap("catalog:not_loaded", "review", "Load the catalog before reviewing master-data governance.");
    else if (!catalogValues.some((row) => ownDataProperty(row, "active") !== false)) addGap("catalog:empty", "review", "The loaded catalog contains no active master-data values.");

    for (const [name, state] of [["Gmail", gmail], ["Google Chat", googleChat], ["WhatsApp", whatsapp]]) {
      addEvidence(`${name} integration`, state.status, state.connected
        ? "A validated workspace connection was observed. Sending still requires the existing human-controlled workflow."
        : state.configured
          ? "The connector is configured but not fully connected or validated."
          : "No governed workspace connection was observed.");
      if (!state.connected) addGap(`integration:${name.toLowerCase().replace(/\s+/g, "_")}`, "review", `${name} is not fully connected and validated for this workspace.`);
    }

    const blocking = gaps.some((gap) => gap.severity === "blocking");
    return {
      schema_version: SCHEMA_VERSION,
      mode: "observation_only",
      status: blocking ? "blocked" : gaps.length ? "review_required" : "ready",
      generated_at: generatedTimestamp(ownDataProperty(input, "generatedAt")),
      summary: {
        evidence_observed: evidence.filter((item) => item.status === "observed").length,
        blocking_gaps: gaps.filter((item) => item.severity === "blocking").length,
        review_gaps: gaps.filter((item) => item.severity === "review").length
      },
      evidence,
      gaps,
      controls: {
        user_provisioning_authorized: false,
        role_change_authorized: false,
        integration_change_authorized: false,
        catalog_change_authorized: false,
        secret_access_authorized: false,
        enforcement_change_authorized: false
      }
    };
  } catch {
    return {
      schema_version: SCHEMA_VERSION,
      mode: "observation_only",
      status: "blocked",
      generated_at: generatedTimestamp(),
      summary: { evidence_observed: 0, blocking_gaps: 1, review_gaps: 0 },
      evidence: [],
      gaps: [{ code: "input:invalid", severity: "blocking", message: "Governance evidence could not be evaluated safely." }],
      controls: {
        user_provisioning_authorized: false,
        role_change_authorized: false,
        integration_change_authorized: false,
        catalog_change_authorized: false,
        secret_access_authorized: false,
        enforcement_change_authorized: false
      }
    };
  }
}

export { SCHEMA_VERSION };
