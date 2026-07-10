import { callRatewareApi } from "./rateware-api.js";

export async function fetchVendorImprovementCases(filters = {}) {
  return await callRatewareApi("list_vendor_improvement_cases", filters);
}

export async function createVendorImprovementCase(improvementCase = {}) {
  return (await callRatewareApi("create_vendor_improvement_case", { case: improvementCase })).row;
}

export async function updateVendorImprovementCase(id, patch = {}) {
  return (await callRatewareApi("update_vendor_improvement_case", { id, patch })).row;
}

export async function submitVendorImprovementCase(id, options = {}) {
  return await callRatewareApi("submit_vendor_improvement_case", { id, ...options });
}

export async function processVendorCiReminders(options = {}) {
  return await callRatewareApi("process_vendor_ci_reminders", options);
}

export async function upsertVendorValueScorecard(scorecard = {}) {
  return (await callRatewareApi("upsert_vendor_value_scorecard", { scorecard })).row;
}
