const SCHEMA_VERSION = "rateware.admin_governance_readiness.v1";

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

function integrationState(value, options = {}) {
  const row = rows(record(value).rows)[0] || {};
  const connected = row.status === "connected"
    && (options.requiresValidation !== true || row.connection_validated === true);
  return {
    configured: row.configured === true || row.credentials_configured === true,
    connected,
    status: connected ? "observed" : row.status === "error" ? "error" : "not_observed"
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
    const settings = record(input.settings);
    const session = record(input.session);
    const organization = record(settings.organization);
    const access = record(settings.access);
    const audit = rows(settings.audit).filter((row) => typeof row.action === "string" && row.action.trim() && typeof row.created_at === "string" && row.created_at.trim());
    const catalogValues = rows(input.catalogValues);
    const observability = record(input.observability);
    const observabilityEvents = rows(observability.events);
    const gmail = integrationState(settings.gmail);
    const googleChat = integrationState(settings.google_chat);
    const whatsapp = integrationState(settings.whatsapp, { requiresValidation: true });
    const gaps = [];
    const evidence = [];

    const addGap = (code, severity, message) => gaps.push({ code, severity, message });
    const addEvidence = (control, status, detail) => evidence.push({ control, status, detail });

    const authenticated = Boolean(session.token || record(session.user).email);
    addEvidence("Authenticated session", authenticated ? "observed" : "missing", authenticated
      ? "A private user session is present. Authentication alone does not grant a role."
      : "No authenticated user session was observed.");
    if (!authenticated) addGap("session:missing", "blocking", "An authenticated private session is required.");

    const workspacePresent = Boolean(organization.org_name || organization.workspace_slug || organization.id);
    addEvidence("Workspace context", workspacePresent ? "observed" : "missing", workspacePresent
      ? "A workspace organization is present in the existing Settings response."
      : "No workspace organization was supplied by Settings.");
    if (!workspacePresent) addGap("workspace:missing", "blocking", "A workspace organization is required for governed administration.");

    const rolesEnforced = access.mode === "role_enforced";
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

    const observabilityLoaded = input.observabilityLoaded === true;
    addEvidence("Operational observability", observabilityLoaded ? "observed" : "not_observed", observabilityLoaded
      ? `${observabilityEvents.length} recent operational event(s) were loaded.`
      : "Operational events have not been loaded in this session.");
    if (!observabilityLoaded) addGap("observability:not_loaded", "review", "Load operational evidence before treating the readiness view as current.");

    const catalogLoaded = input.catalogLoaded === true;
    addEvidence("Master-data catalog", catalogLoaded ? "observed" : "not_observed", catalogLoaded
      ? `${catalogValues.filter((row) => row.active !== false).length} active catalog value(s) were loaded.`
      : "Catalog evidence has not been loaded in this session.");
    if (!catalogLoaded) addGap("catalog:not_loaded", "review", "Load the catalog before reviewing master-data governance.");
    else if (!catalogValues.some((row) => row.active !== false)) addGap("catalog:empty", "review", "The loaded catalog contains no active master-data values.");

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
      generated_at: generatedTimestamp(input.generatedAt),
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
