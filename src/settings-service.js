import { callRatewareApi } from "./rateware-api.js";

export async function fetchSaasSettings() {
  return await callRatewareApi("get_saas_settings");
}

export async function updateSaasProfile(profile) {
  return (await callRatewareApi("update_saas_profile", { profile })).profile;
}

export async function updateSaasOrganization(organization) {
  return (await callRatewareApi("update_saas_organization", { organization })).organization;
}

export async function updateOnboardingTask(taskKey, completed = true) {
  return await callRatewareApi("update_onboarding_task", { task_key: taskKey, completed });
}

export async function fetchSaasAuditLog(limit = 100) {
  return (await callRatewareApi("list_saas_audit_log", { limit })).rows;
}

export async function fetchObservabilityEvents(filters = {}) {
  return await callRatewareApi("list_observability_events", filters);
}

export async function fetchCatalogValues(category = "") {
  return (await callRatewareApi("list_catalog_values", { category })).rows;
}

export async function saveCatalogValue(catalogValue) {
  return (await callRatewareApi("save_catalog_value", { catalog_value: catalogValue })).row;
}

export async function archiveCatalogValue(id) {
  return (await callRatewareApi("archive_catalog_value", { id })).row;
}

export async function fetchGmailConnections() {
  return await callRatewareApi("list_gmail_connections");
}

export async function startGmailOAuth(mailboxEmail, redirectAfter = "settings.html?view=integrations") {
  return await callRatewareApi("start_gmail_oauth", {
    mailbox_email: mailboxEmail,
    redirect_after: redirectAfter
  });
}

export async function disconnectGmailConnection() {
  return (await callRatewareApi("disconnect_gmail_connection")).row;
}

export async function syncGmailBounces(limit = 50) {
  return await callRatewareApi("sync_gmail_bounces", { limit });
}

export async function fetchGoogleChatConnections() {
  return await callRatewareApi("list_google_chat_connections");
}

export async function startGoogleChatOAuth(accountEmail, redirectAfter = "settings.html?view=integrations") {
  return await callRatewareApi("start_google_chat_oauth", {
    account_email: accountEmail,
    redirect_after: redirectAfter
  });
}

export async function disconnectGoogleChatConnection() {
  return (await callRatewareApi("disconnect_google_chat_connection")).row;
}

export async function fetchGoogleChatSpaces() {
  return await callRatewareApi("list_google_chat_spaces");
}

export async function saveGoogleChatSettings(defaultSpaceName, manualSpaceName = "") {
  return (await callRatewareApi("save_google_chat_settings", {
    default_space_name: defaultSpaceName,
    manual_space_name: manualSpaceName
  })).row;
}

export async function retryGoogleChatSync(limit = 50) {
  return await callRatewareApi("retry_google_chat_sync", { limit });
}
