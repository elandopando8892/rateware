import { callRatewareApi } from "./rateware-api.js";

export async function fetchApprovedRateware({ search = "", operation = "", service = "" } = {}) {
  return (await callRatewareApi("list_rateware", { search, operation, service })).rows;
}

export async function fetchRatewareAudit(id, limit = 80) {
  return (await callRatewareApi("list_rateware_audit", { id, limit })).rows;
}

export async function fetchRatewareOptions() {
  return await callRatewareApi("list_staging_options");
}

export async function saveLocationAlias(alias) {
  return await callRatewareApi("save_location_alias", alias);
}

export async function updateApprovedRatewareRow(id, patch) {
  return (await callRatewareApi("update_rateware", { id, patch })).row;
}

export async function bulkUpdateApprovedRatewareRows(ids = [], patch = {}) {
  return await callRatewareApi("bulk_update_rateware", { ids, patch });
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

export async function returnApprovedRatesToStaging(ids = [], reason = "") {
  return await callRatewareApi("return_rateware_to_staging", { ids, reason });
}

export async function archiveApprovedRatewareByFilter(filters = {}, { dryRun = false, maxRows = undefined } = {}) {
  return await callRatewareApi("bulk_rate_rows_by_filter", {
    target_action: "archive",
    filters: { ...filters, mode: "rateware" },
    dry_run: dryRun,
    max_rows: maxRows
  });
}

export async function removeApprovedRatewareByFilter(filters = {}, { dryRun = false, maxRows = undefined } = {}) {
  return await callRatewareApi("bulk_rate_rows_by_filter", {
    target_action: "remove",
    filters: { ...filters, mode: "rateware" },
    dry_run: dryRun,
    max_rows: maxRows
  });
}

export async function fetchRatewareBookVersions() {
  return (await callRatewareApi("list_rateware_versions")).rows;
}

export async function fetchRatewareBookVersion(id) {
  return (await callRatewareApi("get_rateware_version", { id })).version;
}

export async function createRatewareBookVersion({ ids = [], name = "", description = "", filterSummary = {} } = {}) {
  return (await callRatewareApi("create_rateware_version", {
    ids,
    name,
    description,
    filter_summary: filterSummary
  })).version;
}
