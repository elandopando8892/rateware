import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const apiSource = readFileSync(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url), "utf8");
const interpretUploadSource = readFileSync(new URL("../supabase/functions/interpret-upload/index.ts", import.meta.url), "utf8");
const uploadHistorySource = readFileSync(new URL("../src/upload-history.js", import.meta.url), "utf8");
const rpcMigration = readFileSync(new URL("../supabase/migrations/20260626143000_rate_filter_rpc.sql", import.meta.url), "utf8");
const compositeRpcMigration = readFileSync(new URL("../supabase/migrations/20260626153000_composite_rate_filter_values.sql", import.meta.url), "utf8");
const optimizedPredicateMigration = readFileSync(new URL("../supabase/migrations/20260626160000_optimize_rate_filter_predicates.sql", import.meta.url), "utf8");
const fastFilterValuesMigration = readFileSync(new URL("../supabase/migrations/20260626161000_fast_rate_filter_values.sql", import.meta.url), "utf8");
const ratewarePageIndexMigration = readFileSync(new URL("../supabase/migrations/20260626162500_rateware_page_index.sql", import.meta.url), "utf8");
const vendorMetricRpcMigration = readFileSync(new URL("../supabase/migrations/20260626171000_vendor_metric_rpc.sql", import.meta.url), "utf8");
const biAggregationRpcMigration = readFileSync(new URL("../supabase/migrations/20260626183000_bi_aggregation_rpc.sql", import.meta.url), "utf8");
const optimizedBiVendorMetricMigration = readFileSync(new URL("../supabase/migrations/20260626184500_optimize_bi_vendor_metrics.sql", import.meta.url), "utf8");
const fastBiVendorMetricMigration = readFileSync(new URL("../supabase/migrations/20260626190000_fast_bi_vendor_metric_arrays.sql", import.meta.url), "utf8");
const biGenericDomainLabelsMigration = readFileSync(new URL("../supabase/migrations/20260626191000_bi_generic_domain_labels.sql", import.meta.url), "utf8");
const uploadBulkImportIndexesMigration = readFileSync(new URL("../supabase/migrations/20260627162000_upload_bulk_import_catalog_indexes.sql", import.meta.url), "utf8");
const laneLocationAliasesMigration = readFileSync(new URL("../supabase/migrations/20260627173500_strengthen_lane_location_aliases.sql", import.meta.url), "utf8");

for (const domain of ["gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "yahoo.com.mx"]) {
  assert.match(apiSource, new RegExp(`"${domain.replace(".", "\\.")}"`), `generic domain ${domain} should be blocked`);
}

assert.match(apiSource, /function isGenericEmailDomain/, "API should expose generic-domain guard");
assert.match(apiSource, /!genericDomain && domain && vendorDomain && vendorDomain === domain/, "domain matching should skip generic email domains");
assert.match(apiSource, /if \(!email && genericDomain\) return/, "bare generic domains should not create vendor matches");
assert.match(apiSource, /const INTERNAL_RATEWARE_DOMAINS = new Set/, "internal Rateware and Marksman domains should be blocked from carrier matching");
assert.match(apiSource, /function attachUploadVendorHints/, "rate vendor matching should use upload-level vendor hints when rate rows are missing vendor domains");
assert.match(apiSource, /plannedVendorPatchForRateRow/, "rate vendor matching should centralize patch planning per row");
assert.match(apiSource, /const pageSize = 5000/, "filtered vendor matching should scan database rows in bounded pages");
const filteredVendorMatchSource = apiSource.slice(apiSource.indexOf("async function matchRateVendorRowsByFilter"), apiSource.indexOf("async function renormalizeRateRows"));
assert.ok(filteredVendorMatchSource.length > 100, "filtered vendor matching helper should be present");
assert.match(filteredVendorMatchSource, /collectRateRowIdsByFilter/, "filtered vendor matching should freeze all target row ids before updates");
assert.match(filteredVendorMatchSource, /for \(const chunk of chunkValues\(ids, pageSize\)\)/, "filtered vendor matching should process frozen ids in bounded chunks");
assert.doesNotMatch(filteredVendorMatchSource, /offset \+=/, "filtered vendor matching should not page mutable filtered sets while updating vendor ids");
assert.match(apiSource, /Number\(body\.max_rows\) \|\| 100000/, "filtered vendor matching should support whole-base matching above 50k rows");

assert.match(apiSource, /function canUseSqlRateFilters/, "API should decide when filters can stay in SQL");
assert.match(apiSource, /applySqlRateFilters\(query, filterPayload\)/, "list endpoints should use SQL-backed filters");
assert.match(apiSource, /fetchSqlRateFilterValues/, "column filter value menus should have SQL-backed loading");
assert.match(apiSource, /fetchRateRowIdsByFilter/, "derived filters should resolve row ids through database RPC");
assert.match(apiSource, /async function collectRateRowIdsByFilter/, "filtered bulk actions should collect row ids through paged RPC calls");
assert.match(apiSource, /rateware_filtered_rate_ids/, "API should call the filtered rate id RPC");
assert.match(apiSource, /rateware_filtered_rate_values/, "filter dropdown values should come from database RPC");
const bulkActionSource = apiSource.slice(apiSource.indexOf('if (body.action === "bulk_rate_rows_by_filter")'));
assert.ok(bulkActionSource.length > 100, "bulk filtered action block should be present");
assert.doesNotMatch(
  bulkActionSource,
  /fetchBulkRateRowsByFilter/,
  "filtered bulk actions should not use Edge Function row scans"
);
assert.match(
  bulkActionSource,
  /Math\.max\(Number\(body\.max_rows\) \|\| 100000/,
  "filtered bulk archive/remove should allow large database-scoped operations"
);
assert.match(
  bulkActionSource,
  /matched: filtered\.database_count \|\| ids\.length/,
  "filtered bulk dry-runs should report database total, not just hydrated ids"
);
const filteredUpdateSource = apiSource.slice(apiSource.indexOf('if (body.action === "bulk_update_rate_rows_by_filter")'), apiSource.indexOf('if (body.action === "archive_staging")'));
assert.ok(filteredUpdateSource.length > 100, "filtered bulk update block should be present");
assert.match(
  filteredUpdateSource,
  /collectRateRowIdsByFilter/,
  "filtered bulk updates should collect all target ids before changing rows"
);
assert.match(
  filteredUpdateSource,
  /Math\.max\(Number\(body\.max_rows\) \|\| 100000/,
  "filtered bulk updates should support large database-scoped operations"
);
assert.match(
  filteredUpdateSource,
  /matched: filtered\.database_count \|\| ids\.length/,
  "filtered bulk update responses should preserve database total"
);
const filterValuesSource = apiSource.slice(apiSource.indexOf("async function fetchRateFilterValuesByRpc"), apiSource.indexOf("function chunkValues"));
assert.ok(filterValuesSource.length > 100, "filter values helper should be present");
assert.doesNotMatch(
  filterValuesSource,
  /fetchRateRowsForIds/,
  "filter value dropdowns should not hydrate filtered rows in Edge Function"
);
const listRatewareSource = apiSource.slice(apiSource.indexOf('if (body.action === "list_rateware")'), apiSource.indexOf('if (body.action === "list_rateware_filter_values")'));
assert.ok(listRatewareSource.length > 100, "Rateware list block should be present");
assert.match(
  listRatewareSource,
  /if \(usesGlobalFilters\)[\s\S]*fetchRateRowIdsByFilter/,
  "Rateware column and quick filters should use the normalized database filter path"
);
assert.doesNotMatch(
  listRatewareSource,
  /usesGlobalFilters && !canUseSqlRateFilters/,
  "Rateware filters should not fall back to case-sensitive SQL column matching"
);
assert.match(
  apiSource,
  /function hasActiveRatewareFilters/,
  "Rateware should consistently detect search, operation, service, quick, and column filters"
);
assert.match(
  apiSource,
  /if \(operation\) query = query\.ilike\("operation", operation\)/,
  "Rateware operation filters should not depend on exact casing"
);
assert.match(
  apiSource,
  /if \(service\) query = query\.ilike\("service", service\)/,
  "Rateware service filters should not depend on exact casing"
);
assert.match(
  apiSource,
  /function normalizedRpcRateFilters/,
  "Rateware RPC filters should normalize operation and service before calling database functions"
);

assert.match(uploadHistorySource, /const BULK_IMPORT_BATCH_SIZE = 250/, "structured upload import should use larger browser batches");
assert.match(apiSource, /async function fetchScopedTemplateLocations/, "structured upload import should scope location catalog reads per batch");
assert.match(apiSource, /function templateLocationScope/, "structured upload import should derive location scope from source rows");
assert.match(apiSource, /async function fetchScopedTemplateMileage/, "structured upload import should avoid loading the full mileage catalog");
const bulkImportSource = apiSource.slice(apiSource.indexOf("async function bulkImportStructuredUpload"), apiSource.indexOf("function normalizeOutreachTemplate"));
assert.ok(bulkImportSource.length > 100, "bulk structured import helper should be present");
assert.doesNotMatch(bulkImportSource, /rateware_locations"\)[\s\S]*limit\(20000\)/, "bulk import should not load all location rows");
assert.doesNotMatch(bulkImportSource, /rateware_lane_mileage"\)[\s\S]*limit\(20000\)/, "bulk import should not load all mileage rows");
assert.match(uploadBulkImportIndexesMigration, /rateware_locations_state_active_idx/, "bulk import should have state lookup index support");
assert.match(uploadBulkImportIndexesMigration, /rateware_locations_location_key_active_idx/, "bulk import should have location key lookup index support");
const apiLocationMatchSource = apiSource.slice(apiSource.indexOf("function locationMatch"), apiSource.indexOf("function applyLocation"));
const interpretLocationMatchSource = interpretUploadSource.slice(interpretUploadSource.indexOf("function locationMatch"), interpretUploadSource.indexOf("function applyLocation"));
assert.match(apiLocationMatchSource, /if \(!locationMatchesProfile\(location, profile\)\) continue;/, "API location matching should reject country-incompatible candidates");
assert.match(interpretLocationMatchSource, /if \(!locationMatchesProfile\(location, profile\)\) continue;/, "Interpretation location matching should reject country-incompatible candidates");
for (const locationAlias of [
  "Ramos Arizpe, CU 25900",
  "Escobedo, NL 66050",
  "Acuna, CU 26220",
  "Hermosillo, SO 83200",
  "San Luis Potosi, SL 79255"
]) {
  assert.match(laneLocationAliasesMigration, new RegExp(locationAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${locationAlias} should be protected by manual MX catalog aliases`);
}
assert.match(laneLocationAliasesMigration, /rateware_locations_country_state_active_idx/, "lane normalization should have country/state lookup support");
const renormalizeRowsSource = apiSource.slice(apiSource.indexOf("async function renormalizeRateRows"), apiSource.indexOf("async function saveRatewareLocationAlias"));
assert.match(renormalizeRowsSource, /fetchScopedTemplateLocations/, "rate row re-normalization should use scoped location lookup");
assert.match(renormalizeRowsSource, /fetchScopedTemplateMileage/, "rate row re-normalization should use scoped mileage lookup");
assert.doesNotMatch(renormalizeRowsSource, /rateware_locations"\)[\s\S]*limit\(20000\)/, "rate row re-normalization should not load all location rows");
assert.doesNotMatch(renormalizeRowsSource, /rateware_lane_mileage"\)[\s\S]*limit\(20000\)/, "rate row re-normalization should not load all mileage rows");
assert.match(interpretUploadSource, /expected_rate_rows/, "AI interpretation summary should report expected source rows");
assert.match(interpretUploadSource, /source_table_count/, "AI interpretation summary should report source table count");
assert.match(interpretUploadSource, /carrier_response_scope/, "AI interpretation audit should document carrier response scope");
assert.match(interpretUploadSource, /completeness_notes/, "AI interpretation audit should carry row-count reasoning");
assert.match(interpretUploadSource, /source_service_marker/, "AI interpretation rows should preserve visible OW/RT service markers");
assert.match(interpretUploadSource, /summary_expected_rate_rows/, "Upload audit should compare summary expected rows with staged rows");
assert.match(interpretUploadSource, /internal_vendor_domain/, "Upload audit should flag internal Marksman domains as carrier errors");
assert.match(interpretUploadSource, /Document summary expected/, "Missing-row warnings should explain summary-vs-staged gaps");
assert.match(
  apiSource,
  /if \(operation\) columnFilters\.operation = mergeRpcColumnFilterValue/,
  "Rateware RPC operation filters should route through normalized column filters"
);
assert.match(
  apiSource,
  /if \(service\) columnFilters\.service = mergeRpcColumnFilterValue/,
  "Rateware RPC service filters should route through normalized column filters"
);
const listRatewareFilterValuesSource = apiSource.slice(apiSource.indexOf('if (body.action === "list_rateware_filter_values")'), apiSource.indexOf('if (body.action === "list_rateware_audit")'));
assert.ok(listRatewareFilterValuesSource.length > 100, "Rateware filter value block should be present");
assert.match(
  listRatewareFilterValuesSource,
  /fetchRateFilterValuesByRpc[\s\S]*catch[\s\S]*fetchSqlRateFilterValues/,
  "Rateware filter dropdown values should use normalized RPC first and SQL only as a fallback"
);

assert.match(apiSource, /body\.action === "get_rate_row_detail"/, "Rateware should lazy-load row detail");
assert.match(apiSource, /RATE_ROW_RESPONSE_WITH_LEGS_SELECT/, "row detail should include full audit and lane-leg payload");
const listColumnsSource = apiSource.slice(apiSource.indexOf("const RATE_ROW_LIST_COLUMNS"), apiSource.indexOf("const RATE_ROW_LIST_SELECT"));
for (const heavyColumn of ["source_evidence", "field_confidence", "audit_flags", "origin_location_candidates", "destination_location_candidates", "extraction_warnings"]) {
  assert.doesNotMatch(listColumnsSource, new RegExp(`"${heavyColumn}"`), `Rateware list payload should not include ${heavyColumn}`);
}

assert.match(apiSource, /async function resolveCanonicalUser/, "API should canonicalize owner identity");
assert.match(apiSource, /from\("user_profiles"\)/, "canonical owner resolution should use user_profiles");
assert.match(apiSource, /resolveCanonicalUser\(supabase, userContext/, "request user should be canonicalized before action routing");

for (const functionName of [
  "rateware_filtered_rate_ids",
  "rateware_row_conflict",
  "rateware_row_source_audit",
  "rateware_row_ready",
  "rateware_row_cross_border"
]) {
  assert.match(rpcMigration, new RegExp(`function public\\.${functionName}`), `${functionName} should exist in RPC migration`);
}

for (const functionName of [
  "rateware_values_filter_match",
  "rateware_filter_values_for_field",
  "rateware_rate_matches_filters",
  "rateware_filtered_rate_values"
]) {
  assert.match(compositeRpcMigration, new RegExp(`function public\\.${functionName}`), `${functionName} should exist in composite filter migration`);
}

for (const compositeField of ["'vendor'", "'origin'", "'destination'"]) {
  assert.match(compositeRpcMigration, new RegExp(compositeField), `composite field ${compositeField} should be handled in database filters`);
  assert.match(optimizedPredicateMigration, new RegExp(`filters \\? ${compositeField}`), `composite field ${compositeField} should be guarded before matching`);
}

assert.match(
  optimizedPredicateMigration,
  /language plpgsql[\s\S]*filters jsonb := coalesce\(p_column_filters, '\{\}'::jsonb\)/,
  "rate filter predicate should evaluate only active column filters"
);

assert.match(
  fastFilterValuesMigration,
  /coalesce\(p_column_filters, '\{\}'::jsonb\) = '\{\}'::jsonb/,
  "filter value dropdowns should have a fast path when no column filters are active"
);

assert.match(
  fastFilterValuesMigration,
  /or public\.rateware_rate_matches_filters/,
  "filter value dropdowns should still use the full matcher when advanced filters are active"
);

assert.match(ratewarePageIndexMigration, /where status = 'approved'/, "Rateware page index should target approved rows");
assert.match(ratewarePageIndexMigration, /quote_date desc nulls last, created_at desc, id desc/, "Rateware page index should match default sort order");

for (const functionName of [
  "rateware_domain_key",
  "rateware_is_generic_email_domain",
  "vendor_rate_metrics_for_owner"
]) {
  assert.match(vendorMetricRpcMigration, new RegExp(`function public\\.${functionName}`), `${functionName} should exist in vendor metric migration`);
}

assert.match(vendorMetricRpcMigration, /rate_staging_vendor_status_idx/, "vendor metric RPC should have vendor/status index support");
assert.match(vendorMetricRpcMigration, /rate_staging_vendor_domain_status_idx/, "vendor metric RPC should have vendor-domain/status index support");
assert.match(vendorMetricRpcMigration, /not public\.rateware_is_generic_email_domain/, "vendor metric domain matching should ignore generic email domains");
assert.match(apiSource, /async function fetchVendorRateMetrics/, "API should fetch vendor metrics through database RPC");
assert.match(apiSource, /vendor_rate_metrics_for_owner/, "API should call vendor rate metrics RPC");
assert.match(apiSource, /async function fetchVendorRateMetricsSafe/, "Vendor metric enrichment should have a safe fallback");
assert.match(apiSource, /Quote metrics are temporarily unavailable/, "Vendor metric fallback should explain partial CRM loading");

for (const functionName of [
  "rateware_bi_dimension_value",
  "rateware_bi_metric_value",
  "rateware_bi_rate_matches_filters",
  "rateware_bi_pivot_for_owner",
  "rateware_bi_drilldown_for_owner",
  "rateware_bi_geo_density_for_owner",
  "rateware_bi_summary_for_owner",
  "rateware_bi_vendor_metrics_for_owner"
]) {
  assert.match(biAggregationRpcMigration, new RegExp(`function public\\.${functionName}`), `${functionName} should exist in BI aggregation migration`);
}

assert.match(apiSource, /rateware_bi_pivot_for_owner/, "BI pivot should use database aggregation RPC");
assert.match(apiSource, /rateware_bi_drilldown_for_owner/, "BI drilldown should use database aggregation RPC");
assert.match(apiSource, /rateware_bi_geo_density_for_owner/, "BI geo density should use database aggregation RPC");
assert.match(apiSource, /rateware_bi_vendor_metrics_for_owner/, "carrier recommendations should use BI vendor metric RPC");
assert.match(apiSource, /rateware_bi_summary_for_owner/, "AI Analyst should use BI summary RPC");
assert.match(optimizedBiVendorMetricMigration, /rate_staging_vendor_domain_key_status_idx/, "BI vendor metrics should have an indexed domain-key lookup");
assert.match(optimizedBiVendorMetricMigration, /linked_rates as/, "BI vendor metrics should separate direct vendor_id links");
assert.match(optimizedBiVendorMetricMigration, /domain_rates as/, "BI vendor metrics should separate domain-key matches");
assert.match(fastBiVendorMetricMigration, /array_agg\(distinct/, "BI vendor metric arrays should aggregate in one grouped pass");
assert.doesNotMatch(fastBiVendorMetricMigration, /from prepared market_rows/, "BI vendor metrics should not use correlated market subqueries");
assert.doesNotMatch(fastBiVendorMetricMigration, /from prepared lane_rows/, "BI vendor metrics should not use correlated lane subqueries");
assert.match(biGenericDomainLabelsMigration, /safe_vendor_domain/, "BI labels should suppress generic email domains");
assert.match(biGenericDomainLabelsMigration, /Unmatched carrier/, "generic unlinked BI vendors should roll up as unmatched");

const vendorIntelligenceSource = apiSource.slice(apiSource.indexOf("async function buildVendorIntelligence"), apiSource.indexOf("function vendorEffectiveFunnelStage"));
assert.ok(vendorIntelligenceSource.length > 100, "vendor intelligence helper should be present");
assert.match(vendorIntelligenceSource, /fetchVendorRateMetricsSafe/, "Vendor Intelligence should not fail the full view when quote metrics are unavailable");
assert.match(vendorIntelligenceSource, /warnings: metricsResult\.warnings/, "Vendor Intelligence should return partial-load warnings");
assert.doesNotMatch(
  vendorIntelligenceSource,
  /fetchBusinessIntelligenceRows/,
  "Vendor Intelligence should not load raw BI rate rows in the Edge Function"
);

const vendorFunnelSource = apiSource.slice(apiSource.indexOf("async function buildVendorFunnel"), apiSource.indexOf("function scoreCarrierFit"));
assert.ok(vendorFunnelSource.length > 100, "vendor funnel helper should be present");
assert.match(vendorFunnelSource, /fetchVendorRateMetricsSafe/, "Procurement Pipeline should not fail the full funnel when quote metrics are unavailable");
assert.match(vendorFunnelSource, /warnings: metricsResult\.warnings/, "Procurement Pipeline should return partial-load warnings");
assert.doesNotMatch(
  vendorFunnelSource,
  /fetchBusinessIntelligenceRows/,
  "Procurement Pipeline should not load raw BI rate rows in the Edge Function"
);

for (const [helperName, nextHelperName] of [
  ["async function buildCarrierIntelligence", "function recommendationIntentFromConfig"],
  ["async function buildCarrierRecommendations", "const BI_DIMENSIONS"],
  ["async function buildBusinessIntelligencePivotFromDb", "function drilldownRow"],
  ["async function buildBusinessIntelligenceDrilldown", "const GEO_CITY_COORDINATES"],
  ["async function buildBusinessIntelligenceGeoDensityFromDb", "function normalizeTags"]
]) {
  const helperSource = apiSource.slice(apiSource.indexOf(helperName), apiSource.indexOf(nextHelperName));
  assert.ok(helperSource.length > 100, `${helperName} should be present`);
  assert.doesNotMatch(
    helperSource,
    /fetchBusinessIntelligenceRows/,
    `${helperName} should not load raw BI rate rows in the Edge Function`
  );
}

const carrierIntelligenceSource = apiSource.slice(apiSource.indexOf("async function buildCarrierIntelligence"), apiSource.indexOf("function recommendationIntentFromConfig"));
assert.doesNotMatch(carrierIntelligenceSource, /\.from\("rate_staging"\)/, "AI Analyst should not query rate_staging directly");
assert.doesNotMatch(carrierIntelligenceSource, /\.limit\(1500\)/, "AI Analyst should not rely on a 1500-row rate sample");

console.log("Rateware stability guards passed.");
