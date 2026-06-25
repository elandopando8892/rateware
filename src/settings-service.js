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

export async function fetchCatalogValues(category = "") {
  return (await callRatewareApi("list_catalog_values", { category })).rows;
}

export async function saveCatalogValue(catalogValue) {
  return (await callRatewareApi("save_catalog_value", { catalog_value: catalogValue })).row;
}

export async function archiveCatalogValue(id) {
  return (await callRatewareApi("archive_catalog_value", { id })).row;
}
