import { callRatewareApi } from "./rateware-api.js";

export async function fetchApprovedRatewarePage({ search = "", operation = "", service = "", quickFilter = "all", columnFilters = {}, limit = 500, offset = 0 } = {}) {
  return await callRatewareApi("list_rateware", {
    search,
    operation,
    service,
    quick_filter: quickFilter,
    column_filters: columnFilters,
    limit,
    offset
  });
}

export async function fetchApprovedRateware({ search = "", operation = "", service = "", quickFilter = "all", columnFilters = {}, limit = 500, offset = 0 } = {}) {
  return (await fetchApprovedRatewarePage({ search, operation, service, quickFilter, columnFilters, limit, offset })).rows;
}

const FILTER_VALUE_LIMIT = 5000;

export async function fetchRatewareFilterValues({ field, search = "", valueSearch = "", operation = "", service = "", quickFilter = "all", columnFilters = {}, limit = FILTER_VALUE_LIMIT } = {}) {
  const result = await callRatewareApi("list_rateware_filter_values", {
    field,
    search,
    value_search: valueSearch,
    operation,
    service,
    quick_filter: quickFilter,
    column_filters: columnFilters,
    limit
  });
  const values = Array.isArray(result?.values) ? result.values : [];
  return {
    values,
    total: Number(result?.total ?? values.length),
    database_count: Number(result?.database_count ?? result?.total ?? values.length),
    hard_limit_reached: Boolean(result?.hard_limit_reached),
    limit
  };
}

export async function fetchRatewareAudit(id, limit = 80) {
  return (await callRatewareApi("list_rateware_audit", { id, limit })).rows;
}

export async function fetchApprovedRatewareDetail(id) {
  return (await callRatewareApi("get_rate_row_detail", { id, status: "approved" })).row;
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
  return await callRatewareApi("bulk_update_rateware", { ids, patch, confirmed: true, confirmation_action: "bulk_update_rateware" });
}

export async function updateApprovedRatewareByFilter(filters = {}, patch = {}, { dryRun = false, maxRows = undefined, confirmed = false, previewCount = undefined } = {}) {
  return await callRatewareApi("bulk_update_rate_rows_by_filter", {
    filters: { ...filters, mode: "rateware" },
    patch,
    dry_run: dryRun,
    max_rows: maxRows,
    confirmed,
    confirmation_action: "bulk_filter",
    preview_count: previewCount
  });
}

export async function renormalizeApprovedRatewareRows(ids = []) {
  return await callRatewareApi("renormalize_rate_rows", { ids, status: "approved" });
}

export async function matchApprovedRatewareVendors(ids = []) {
  return await callRatewareApi("match_rate_vendors", { ids, status: "approved" });
}

export async function matchApprovedRatewareVendorsByFilter(filters = {}, { dryRun = false, maxRows = undefined, confirmed = false, previewCount = undefined } = {}) {
  return await callRatewareApi("match_rate_vendors_by_filter", {
    filters: { ...filters, mode: "rateware" },
    dry_run: dryRun,
    max_rows: maxRows,
    confirmed,
    confirmation_action: "bulk_filter",
    preview_count: previewCount
  });
}

export async function enrichApprovedRatewareLocationZips(ids = []) {
  return await callRatewareApi("enrich_missing_location_zips", { ids, status: "approved" });
}

export async function returnApprovedRatesToStaging(ids = [], reason = "") {
  return await callRatewareApi("return_rateware_to_staging", { ids, reason, confirmed: true, confirmation_action: "return_rateware_to_staging" });
}

export async function archiveApprovedRatewareByFilter(filters = {}, { dryRun = false, maxRows = undefined, confirmed = false, previewCount = undefined } = {}) {
  return await callRatewareApi("bulk_rate_rows_by_filter", {
    target_action: "archive",
    filters: { ...filters, mode: "rateware" },
    dry_run: dryRun,
    max_rows: maxRows,
    confirmed,
    confirmation_action: "archive",
    preview_count: previewCount
  });
}

export async function removeApprovedRatewareByFilter(filters = {}, { dryRun = false, maxRows = undefined, confirmed = false, previewCount = undefined } = {}) {
  return await callRatewareApi("bulk_rate_rows_by_filter", {
    target_action: "remove",
    filters: { ...filters, mode: "rateware" },
    dry_run: dryRun,
    max_rows: maxRows,
    confirmed,
    confirmation_action: "remove",
    preview_count: previewCount
  });
}

export async function fetchRatewareBookVersions() {
  return (await callRatewareApi("list_rateware_versions")).rows;
}

export async function fetchRatewareBookVersion(id) {
  return (await callRatewareApi("get_rateware_version", { id })).version;
}

export async function createRatewareBookVersion({ ids = [], filters = null, name = "", description = "", filterSummary = {} } = {}) {
  return (await callRatewareApi("create_rateware_version", {
    ids,
    filters,
    name,
    description,
    filter_summary: filterSummary
  })).version;
}
