import { callRatewareApi } from "./rateware-api.js";

export async function fetchStagingPage({ status = "pending_review", rawUploadId = "", limit = 500, offset = 0, search = "", reviewFilter = "all", columnFilters = {} } = {}) {
  return await callRatewareApi("list_staging", {
    status,
    raw_upload_id: rawUploadId,
    limit,
    offset,
    search,
    review_filter: reviewFilter,
    column_filters: columnFilters
  });
}

export async function fetchStagingRows({ status = "pending_review", rawUploadId = "", limit = 1000, offset = 0, search = "", reviewFilter = "all", columnFilters = {} } = {}) {
  return (await fetchStagingPage({ status, rawUploadId, limit, offset, search, reviewFilter, columnFilters })).rows;
}

export async function fetchStagingDetail(id) {
  return (await callRatewareApi("get_rate_row_detail", { id })).row;
}

export async function fetchStagingFilterValues({ field, status = "pending_review", rawUploadId = "", search = "", valueSearch = "", reviewFilter = "all", columnFilters = {}, limit = 1000 } = {}) {
  return (await callRatewareApi("list_staging_filter_values", {
    field,
    status,
    raw_upload_id: rawUploadId,
    search,
    value_search: valueSearch,
    review_filter: reviewFilter,
    column_filters: columnFilters,
    limit
  })).values;
}

export async function fetchStagingOptions() {
  return await callRatewareApi("list_staging_options");
}

export async function saveLocationAlias(alias) {
  return await callRatewareApi("save_location_alias", alias);
}

export async function updateStagingRow(id, patch) {
  return (await callRatewareApi("update_staging", { id, patch })).row;
}

export async function renormalizeStagingRows(ids = []) {
  return await callRatewareApi("renormalize_rate_rows", { ids });
}

export async function matchStagingVendors(ids = []) {
  return await callRatewareApi("match_rate_vendors", { ids });
}

export async function matchStagingVendorsByFilter(filters = {}, { dryRun = false, maxRows = undefined, confirmed = false, previewCount = undefined } = {}) {
  return await callRatewareApi("match_rate_vendors_by_filter", {
    filters: { ...filters, mode: "staging" },
    dry_run: dryRun,
    max_rows: maxRows,
    confirmed,
    preview_count: previewCount
  });
}

export async function enrichStagingLocationZips(ids = []) {
  return await callRatewareApi("enrich_missing_location_zips", { ids });
}

export async function archiveStagingRows(ids = []) {
  return await callRatewareApi("archive_staging", { ids, confirmed: true });
}

export async function removeStagingRows(ids = []) {
  return await callRatewareApi("remove_staging", { ids, confirmed: true });
}

export async function archiveStagingRowsByFilter(filters = {}, { dryRun = false, maxRows = undefined, confirmed = false, previewCount = undefined } = {}) {
  return await callRatewareApi("bulk_rate_rows_by_filter", {
    target_action: "archive",
    filters: { ...filters, mode: "staging" },
    dry_run: dryRun,
    max_rows: maxRows,
    confirmed,
    preview_count: previewCount
  });
}

export async function removeStagingRowsByFilter(filters = {}, { dryRun = false, maxRows = undefined, confirmed = false, previewCount = undefined } = {}) {
  return await callRatewareApi("bulk_rate_rows_by_filter", {
    target_action: "remove",
    filters: { ...filters, mode: "staging" },
    dry_run: dryRun,
    max_rows: maxRows,
    confirmed,
    preview_count: previewCount
  });
}

export async function updateStagingRowsByFilter(filters = {}, patch = {}, { dryRun = false, maxRows = undefined, confirmed = false, previewCount = undefined } = {}) {
  return await callRatewareApi("bulk_update_rate_rows_by_filter", {
    filters: { ...filters, mode: "staging" },
    patch,
    dry_run: dryRun,
    max_rows: maxRows,
    confirmed,
    preview_count: previewCount
  });
}
