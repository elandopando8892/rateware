import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const apiSource = readFileSync(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url), "utf8");
const rpcMigration = readFileSync(new URL("../supabase/migrations/20260626143000_rate_filter_rpc.sql", import.meta.url), "utf8");
const compositeRpcMigration = readFileSync(new URL("../supabase/migrations/20260626153000_composite_rate_filter_values.sql", import.meta.url), "utf8");
const optimizedPredicateMigration = readFileSync(new URL("../supabase/migrations/20260626160000_optimize_rate_filter_predicates.sql", import.meta.url), "utf8");
const fastFilterValuesMigration = readFileSync(new URL("../supabase/migrations/20260626161000_fast_rate_filter_values.sql", import.meta.url), "utf8");
const ratewarePageIndexMigration = readFileSync(new URL("../supabase/migrations/20260626162500_rateware_page_index.sql", import.meta.url), "utf8");
const vendorMetricRpcMigration = readFileSync(new URL("../supabase/migrations/20260626171000_vendor_metric_rpc.sql", import.meta.url), "utf8");

for (const domain of ["gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "yahoo.com.mx"]) {
  assert.match(apiSource, new RegExp(`"${domain.replace(".", "\\.")}"`), `generic domain ${domain} should be blocked`);
}

assert.match(apiSource, /function isGenericEmailDomain/, "API should expose generic-domain guard");
assert.match(apiSource, /!genericDomain && domain && vendorDomain && vendorDomain === domain/, "domain matching should skip generic email domains");
assert.match(apiSource, /if \(!email && genericDomain\) return/, "bare generic domains should not create vendor matches");

assert.match(apiSource, /function canUseSqlRateFilters/, "API should decide when filters can stay in SQL");
assert.match(apiSource, /applySqlRateFilters\(query, filterPayload\)/, "list endpoints should use SQL-backed filters");
assert.match(apiSource, /fetchSqlRateFilterValues/, "column filter value menus should have SQL-backed loading");
assert.match(apiSource, /fetchRateRowIdsByFilter/, "derived filters should resolve row ids through database RPC");
assert.match(apiSource, /rateware_filtered_rate_ids/, "API should call the filtered rate id RPC");
assert.match(apiSource, /rateware_filtered_rate_values/, "filter dropdown values should come from database RPC");
const bulkActionSource = apiSource.slice(apiSource.indexOf('if (body.action === "bulk_rate_rows_by_filter")'));
assert.ok(bulkActionSource.length > 100, "bulk filtered action block should be present");
assert.doesNotMatch(
  bulkActionSource,
  /fetchBulkRateRowsByFilter/,
  "filtered bulk actions should not use Edge Function row scans"
);
const filterValuesSource = apiSource.slice(apiSource.indexOf("async function fetchRateFilterValuesByRpc"), apiSource.indexOf("function chunkValues"));
assert.ok(filterValuesSource.length > 100, "filter values helper should be present");
assert.doesNotMatch(
  filterValuesSource,
  /fetchRateRowsForIds/,
  "filter value dropdowns should not hydrate filtered rows in Edge Function"
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

const vendorIntelligenceSource = apiSource.slice(apiSource.indexOf("async function buildVendorIntelligence"), apiSource.indexOf("function vendorEffectiveFunnelStage"));
assert.ok(vendorIntelligenceSource.length > 100, "vendor intelligence helper should be present");
assert.doesNotMatch(
  vendorIntelligenceSource,
  /fetchBusinessIntelligenceRows/,
  "Vendor Intelligence should not load raw BI rate rows in the Edge Function"
);

const vendorFunnelSource = apiSource.slice(apiSource.indexOf("async function buildVendorFunnel"), apiSource.indexOf("function scoreCarrierFit"));
assert.ok(vendorFunnelSource.length > 100, "vendor funnel helper should be present");
assert.doesNotMatch(
  vendorFunnelSource,
  /fetchBusinessIntelligenceRows/,
  "Procurement Pipeline should not load raw BI rate rows in the Edge Function"
);

console.log("Rateware stability guards passed.");
