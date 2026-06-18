import { callRatewareApi } from "./rateware-api.js";

export async function fetchApprovedRateware({ search = "", operation = "", service = "" } = {}) {
  return (await callRatewareApi("list_rateware", { search, operation, service })).rows;
}

export async function fetchRatewareOptions() {
  return await callRatewareApi("list_staging_options");
}

export async function updateApprovedRatewareRow(id, patch) {
  return (await callRatewareApi("update_rateware", { id, patch })).row;
}

export async function renormalizeApprovedRatewareRows(ids = []) {
  return await callRatewareApi("renormalize_rate_rows", { ids, status: "approved" });
}

export async function matchApprovedRatewareVendors(ids = []) {
  return await callRatewareApi("match_rate_vendors", { ids, status: "approved" });
}

export async function enrichApprovedRatewareLocationZips(ids = []) {
  return await callRatewareApi("enrich_missing_location_zips", { ids, status: "approved" });
}

export async function returnApprovedRatesToStaging(ids = []) {
  return await callRatewareApi("return_rateware_to_staging", { ids });
}
