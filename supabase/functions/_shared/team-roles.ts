/**
 * Team roles on the server (decided 2026-09-27). Bidware applies the same rules
 * on screen; this is the lock that holds when someone calls the API directly.
 *
 * The role lives in the account's app_metadata.roles, which only the server
 * can write; _shared/auth.ts passes it on as `claims.roles`.
 *
 *   admin     everything.
 *   operator  day-to-day work: builds and runs events and quotes, talks to
 *             carriers and shippers. Doesn't award or hand awards to rateware,
 *             publish a Ratebook, archive, restore, merge or delete records,
 *             change the shared catalog, revoke what a shipper was given, or
 *             disconnect an integration.
 *   viewer    reads only.
 *
 * Only accounts that belong to an organization are held to a role, and one of
 * them without a role reads only. An account outside every organization keeps
 * working in its own space as before; it never sees a team's data.
 */
export type TeamRole = "admin" | "operator" | "viewer";
export type TeamNeed = "read" | "operate" | "admin";

const RANK: Record<TeamRole, number> = { viewer: 0, operator: 1, admin: 2 };

/**
 * Actions that only read. rateware-api's are the ones the action contract
 * marks access "read", except three that write (they stay day-to-day work):
 * apply_vendor_intelligence_tags, import_vendor_onboarding_corrections and
 * update_onboarding_task.
 */
const READS: Record<string, ReadonlySet<string>> = {
  "rateware-api": new Set([
    "book_audit", "business_intelligence_drilldown", "business_intelligence_geo_density",
    "business_intelligence_pivot", "carrier_intelligence_chat", "dashboard_summary", "export_growth_campaign",
    "export_ratebook_routes", "get_carrier_list_template", "get_growth_campaign", "get_outreach_message",
    "get_outreach_tracking_summary", "get_rate_row_detail", "get_ratebook", "get_ratebook_audit",
    "get_ratebook_health", "get_ratebook_route_detail", "get_ratebook_route_quotes", "get_rateware_version",
    "get_rfx_process_project", "get_saas_settings", "get_shipper", "get_upload_source_url",
    "get_vendor_relationship_activity", "get_whatsapp_connection_status", "growth_dashboard",
    "list_bid_room_chat", "list_carrier_list_templates", "list_catalog_values", "list_contact_history",
    "list_gmail_connections", "list_google_chat_connections", "list_google_chat_spaces",
    "list_growth_campaigns", "list_growth_results", "list_growth_segments", "list_interpretation_memory",
    "list_interpretation_memory_audit", "list_location_catalog_values", "list_observability_events",
    "list_outreach_audience_segments", "list_outreach_campaigns", "list_outreach_messages",
    "list_outreach_templates", "list_ratebook_carriers", "list_ratebooks", "list_rateware",
    "list_rateware_audit", "list_rateware_filter_values", "list_rateware_rows_by_ids",
    "list_rateware_versions", "list_rfx_detail", "list_rfx_event_context", "list_rfx_events",
    "list_rfx_process_projects", "list_rfx_response_vendor_ids", "list_saas_audit_log",
    "list_shipper_duplicates", "list_shippers", "list_staging", "list_staging_filter_values",
    "list_staging_options", "list_upload_staged_rows", "list_uploads", "list_vendor_improvement_cases",
    "list_vendor_segments", "list_vendor_support_tickets", "list_vendor_unmatched_ids", "list_vendors",
    "list_whatsapp_connections", "list_whatsapp_phone_numbers", "list_whatsapp_templates",
    "preview_growth_segment", "preview_outreach_audience", "resolve_carrier_list_template_rows",
    "search_staging_locations", "shipper_crm_summary", "shipper_intelligence", "vendor_funnel",
    "vendor_intelligence", "vendor_onboarding_gaps",
  ]),
  "quotedesk-api": new Set([
    "event_origins", "get_context", "get_quote", "list_fcm_cost_bases", "list_quote_emails", "list_quotes",
    "preview_quote_email", "suggest_lane_miles",
  ]),
};

/** An Administrador's decisions. */
const ADMIN: Record<string, ReadonlySet<string>> = {
  "rateware-api": new Set([
    // Awarding, handing the awards to rateware, and publishing the Ratebook (decided 2026-09-27)
    "award_rfx_lane_vendor", "clear_rfx_award", "closeout_awarded_rfx_to_rateware", "create_rfx_award_package",
    "generate_rfx_award_notices", "mark_rfx_award_package_implementation_ready", "publish_ratebook",
    // Archiving, restoring and deleting records; merging shippers archives the duplicate
    "archive_rfx_event", "delete_rfx_event", "archive_carrier_list_template", "restore_carrier_list_template",
    "delete_vendor_segment", "remove_vendors", "archive_shippers", "delete_shipper_record", "archive_ratebook",
    "merge_shipper_accounts",
    // Taking approved rates out of the rate base (decided 2026-09-28)
    "return_rateware_to_staging",
    "archive_outreach_campaign", "delete_outreach_campaign", "archive_outreach_template", "delete_outreach_template",
    // Taking back what a shipper was given
    "revoke_rfx_rfi_magic_link", "revoke_shipper_profile_request",
    // The shared catalog
    "save_catalog_value", "save_location_catalog_value", "save_location_alias", "archive_catalog_value",
    "archive_location_catalog_value", "bulk_import_catalog_values",
    // Disconnecting an integration
    "disconnect_gmail_connection", "disconnect_google_chat_connection", "disconnect_whatsapp_business_connection",
  ]),
  "quotedesk-api": new Set(["save_accessorial"]),
};

/**
 * Statuses only an Administrador sets through a general update. In rateware,
 * closing an event IS the hand-off of its awards; "draft" and "new" restore an
 * event or a quote from the archive; "approved" puts a staged rate in the rate
 * base (decided 2026-09-28). "open", the project review stages, and correcting,
 * rejecting or archiving a staged rate stay day-to-day work.
 */
const ADMIN_STATUSES: Record<string, ReadonlySet<string>> = {
  "rateware-api.update_rfx_event": new Set(["archived", "draft", "closed", "awarded"]),
  "rateware-api.update_rfx_process_project": new Set(["archived"]),
  "rateware-api.update_staging": new Set(["approved"]),
  "rateware-api.bulk_update_staging": new Set(["approved"]),
  "rateware-api.bulk_update_rate_rows_by_filter": new Set(["approved"]),
  "rateware-api.update_shipper": new Set(["archived"]),
  "quotedesk-api.set_quote_status": new Set(["archived", "new"]),
};

/**
 * Carrier stages only an Administrador sets (decided 2026-09-29). A carrier is
 * archived through its base stage, not its status, so ADMIN_STATUSES can't
 * see it.
 */
const ADMIN_BASE_STAGES: Record<string, ReadonlySet<string>> = {
  "rateware-api.bulk_update_vendors": new Set(["archived"]),
  "rateware-api.update_vendor": new Set(["archived"]),
};

/**
 * Actions whose preview only reads and whose confirmed run (`dry_run: false`)
 * is an Administrador's. Merging duplicate carriers deletes the duplicate
 * (decided 2026-09-29), like merging shippers archives it.
 */
const ADMIN_UNLESS_PREVIEW: Record<string, ReadonlySet<string>> = {
  "rateware-api": new Set(["consolidate_exact_vendor_duplicates"]),
};

const record = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Every place a status could travel in the body; any admin status there makes it an admin call. */
function statusesIn(body: Record<string, unknown>) {
  return [body.status, record(body.patch).status, record(body.event).status, record(body.project).status]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);
}

/** What calling `action` on `fn` asks of the role. Anything unlisted is day-to-day work. */
export function teamRoleNeed(fn: string, action: string, body: Record<string, unknown> = {}): TeamNeed {
  if (ADMIN[fn]?.has(action)) return "admin";
  if (ADMIN_UNLESS_PREVIEW[fn]?.has(action)) return body.dry_run === false ? "admin" : "read";
  const statuses = ADMIN_STATUSES[`${fn}.${action}`];
  if (statuses && statusesIn(body).some((status) => statuses.has(status))) return "admin";
  const stages = ADMIN_BASE_STAGES[`${fn}.${action}`];
  if (stages?.has(String(record(body.patch).base_stage ?? "").trim().toLowerCase())) return "admin";
  if (READS[fn]?.has(action)) return "read";
  return "operate";
}

/** The highest role the claims carry; none means viewer. */
export function teamRoleFromClaims(claims: Record<string, unknown>): TeamRole {
  let best: TeamRole = "viewer";
  for (const value of Array.isArray(claims.roles) ? claims.roles : []) {
    const role = String(value).trim().toLowerCase();
    if (role in RANK && RANK[role as TeamRole] > RANK[best]) best = role as TeamRole;
  }
  return best;
}

export function belongsToOrganization(claims: Record<string, unknown>) {
  return Boolean(String(claims.rateware_organization_id ?? claims.organization_id ?? "").trim());
}

export const teamRoleAllows = (role: TeamRole, need: TeamNeed) =>
  need === "read" || (need === "operate" ? role !== "viewer" : role === "admin");

/**
 * What only a row can tell, the handler checks after reading it: taking
 * approved rates out of the rate base (archiving, deleting or reopening them,
 * directly or through their upload) and restoring an archived shipper
 * (decided 2026-09-28), and archiving a carrier through the CRM template or
 * when importing carriers, decided 2026-09-29. The 403 body when the account
 * isn't an Administrador, otherwise null.
 */
export function adminOnlyDenial(fn: string, claims: Record<string, unknown>, action: string, error: string) {
  if (!belongsToOrganization(claims)) return null;
  const role = teamRoleFromClaims(claims);
  if (role === "admin") return null;
  console.warn("TEAM_ROLE_DENIED", { fn, action, role, required: "admin" });
  return { error, code: "role_forbidden", role, required: "admin" as TeamNeed, action };
}

export const RATE_BASE_REMOVAL_ERROR = "Solo un Administrador puede sacar tarifas del tarifario.";
export const SHIPPER_ARCHIVE_ERROR = "Solo un Administrador puede archivar o restaurar un shipper.";
export const CARRIER_ARCHIVE_ERROR = "Solo un Administrador puede archivar un carrier.";

/** The 403 body when the account's role doesn't allow the call, otherwise null. */
export function teamRoleDenial(fn: string, claims: Record<string, unknown>, body: Record<string, unknown>) {
  if (!belongsToOrganization(claims)) return null;
  const action = typeof body.action === "string" ? body.action : "";
  const required = teamRoleNeed(fn, action, body);
  const role = teamRoleFromClaims(claims);
  if (teamRoleAllows(role, required)) return null;
  console.warn("TEAM_ROLE_DENIED", { fn, action, role, required });
  return {
    error: required === "admin"
      ? "Solo un Administrador puede hacer esto."
      : "Tu cuenta es de Consulta: puede ver, pero no cambiar nada.",
    code: "role_forbidden",
    role,
    required,
    action,
  };
}
