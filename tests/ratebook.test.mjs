import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const api = read("../supabase/functions/rateware-api/index.ts");
const migration = read("../supabase/migrations/20260718192709_ratebook_consolidation.sql");
const foundationMigration = read("../supabase/migrations/20260720110000_ratebook_foundation.sql");
const carrierAccessMigration = read("../supabase/migrations/20260720120000_ratebook_carrier_access.sql");
const carrierQuotesMigration = read("../supabase/migrations/20260720130000_ratebook_carrier_quotes.sql");
const quoteReviewMigration = read("../supabase/migrations/20260720140000_ratebook_quote_review.sql");
const versionControlMigration = read("../supabase/migrations/20260720150000_ratebook_version_control.sql");
const distributionMigration = read("../supabase/migrations/20260720160000_ratebook_distribution_engagement.sql");
const service = read("../src/ratebook-service.js");
const client = read("../src/ratebook.js");
const page = read("../ratebook.html");
const carrierAccessApi = read("../supabase/functions/ratebook-carrier-api/index.ts");
const carrierAccessPage = read("../ratebook-carrier.html");
const carrierAccessClient = read("../src/ratebook-carrier.js");
const auth = read("../src/auth.js");

for (const table of ["rfx_ratebooks", "rfx_ratebook_shares"]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
}

assert.match(foundationMigration, /lifecycle_status/);
assert.match(foundationMigration, /source_type/);
assert.match(foundationMigration, /shipper_id/);
assert.match(foundationMigration, /version_number/);
assert.match(foundationMigration, /create table if not exists public\.rfx_ratebook_segments/);
assert.match(foundationMigration, /alter table public\.rfx_ratebook_segments enable row level security/);
assert.match(carrierAccessMigration, /access_token_hash/);
assert.match(carrierAccessMigration, /access_token_last4/);
assert.match(carrierAccessMigration, /Raw tokens are never persisted/);
assert.match(carrierQuotesMigration, /create table if not exists public\.rfx_ratebook_carrier_quotes/);
assert.match(carrierQuotesMigration, /create table if not exists public\.rfx_ratebook_carrier_quote_revisions/);
assert.match(carrierQuotesMigration, /unique \(ratebook_share_id, package_lane_id\)/);
assert.match(carrierQuotesMigration, /alter table public\.rfx_ratebook_carrier_quotes enable row level security/);
assert.match(carrierQuotesMigration, /alter table public\.rfx_ratebook_carrier_quote_revisions enable row level security/);
assert.match(quoteReviewMigration, /create table if not exists public\.rfx_ratebook_quote_reviews/);
assert.match(quoteReviewMigration, /unique \(quote_id\)/);
assert.match(quoteReviewMigration, /check \(decision in \('pending', 'shortlisted', 'not_selected'\)\)/);
assert.match(quoteReviewMigration, /alter table public\.rfx_ratebook_quote_reviews enable row level security/);
assert.match(versionControlMigration, /parent_ratebook_id/);
assert.match(versionControlMigration, /source_snapshot_hash/);
assert.match(versionControlMigration, /source_changed_at/);
assert.match(versionControlMigration, /drop constraint if exists rfx_ratebooks_owner_email_rfx_package_id_key/);
assert.match(versionControlMigration, /rfx_ratebooks_owner_package_version_unique_idx/);
assert.match(distributionMigration, /add column if not exists ratebook_id/);
assert.match(distributionMigration, /add column if not exists ratebook_share_id/);
assert.match(distributionMigration, /access_count integer not null default 0/);
assert.match(distributionMigration, /last_accessed_at/);
assert.match(distributionMigration, /last_quote_at/);

for (const action of [
  "list_ratebooks",
  "export_ratebook_routes",
  "get_ratebook",
  "get_ratebook_route_detail",
  "get_ratebook_route_quotes",
  "update_ratebook_quote_review",
  "list_ratebook_carriers",
  "share_ratebook_with_carriers",
  "queue_ratebook_distribution",
  "send_ratebook_distribution",
  "publish_ratebook",
  "archive_ratebook",
  "create_ratebook_revision",
  "get_ratebook_audit",
  "get_ratebook_health",
]) {
  assert.match(api, new RegExp(`body\\.action === "${action}"`));
  assert.match(service, new RegExp(`"${action}"`));
}

assert.match(api, /upsertRatebookForPackage/);
assert.match(api, /materializeRatebooksForProjects/);
assert.match(api, /ensureRatebookForBidRoomEvent/);
assert.match(api, /async function listRatebookCarriers[\s\S]+safeShipperSearch\(input\.search\)[\s\S]+\.range\(offset, offset \+ limit - 1\)/, "Ratebook carrier search should run server-side across the full CRM instead of a truncated local list");
assert.match(api, /async function listRatebookCarriers[\s\S]+vendorSearchClauses\(search\)/, "Ratebook carrier search should use the same legal-name and secondary-email matching as Carrier CRM");
assert.match(api, /ratebookSourceTypeForEvent/);
assert.match(api, /source_rfx_lane_id/);
assert.match(api, /ratebook_sync/);
assert.match(api, /ratebookRouteSummary/);
assert.match(api, /ratebookLifecycleStatus/);
assert.match(api, /evaluateRatebookReadiness/);
assert.match(api, /syncRatebookSegments/);
assert.match(api, /ratebookSourceSnapshot/);
assert.match(api, /ratebookSourceFreshness/);
assert.match(api, /async function createRatebookRevision/);
assert.match(api, /async function getRatebookHealth/);
assert.match(api, /async function exportRatebookRoutes/);
assert.match(api, /async function buildRatebookRouteExportRows/);
assert.match(api, /input\.include_routes === true[\s\S]+buildRatebookRouteExportRows\(supabase, user, rows, input\)/, "Ratebook list should return the consolidated route ledger without rematerializing the same books in a second request");
assert.match(api, /async function fetchAllOwnedRfxEvents[\s\S]+options: \{ includeArchived\?: boolean \}/, "RFx event pagination should explicitly support historical Ratebook synchronization");
assert.match(api, /async function fetchAllOwnedRfxEvents[\s\S]+\.order\("created_at", \{ ascending: false \}\)[\s\S]+\.order\("id", \{ ascending: false \}\)/, "RFx event pagination should use a stable secondary id order");
assert.match(api, /function rfxEventColumnsWithoutCustomerId/, "Ratebook should support a safe legacy event-column fallback during schema rollout");
assert.match(api, /isMissingRfxEventCustomerIdError\(error\)/, "Ratebook should retry historical matching only when customer_id is not yet deployed");
assert.match(api, /customer_id: null/, "Legacy RFx event fallback should preserve the Ratebook event response shape");
assert.match(api, /async function fetchAllOwnedRfxPackages[\s\S]+\.order\("updated_at", \{ ascending: false \}\)[\s\S]+\.order\("id", \{ ascending: false \}\)/, "RFx package pagination should use a stable secondary id order");
assert.match(api, /async function fetchAllOwnedRfxRatebooks[\s\S]+\.order\("updated_at", \{ ascending: false \}\)[\s\S]+\.order\("id", \{ ascending: false \}\)/, "Ratebook pagination should use a stable secondary id order");
assert.match(api, /syncBidRoomEventsForRatebookScope[\s\S]+customer_id[\s\S]+includeArchived: true/, "Ratebook synchronization should retain archived Bid Room history and use the stable shipper id");
assert.match(api, /syncBidRoomEventsForRatebookScope[\s\S]+fetchAllRfxProjectIdsForShipper/, "Shipper-scoped Ratebook sync should paginate linked RFx projects");
const ratebookHealthSource = api.slice(
  api.indexOf("async function getRatebookHealth"),
  api.indexOf("async function updateRatebookLifecycle")
);
assert.match(ratebookHealthSource, /fetchAllOwnedRfxRatebooks/, "Ratebook health should inspect every owned Ratebook, not a fixed first page");
assert.match(ratebookHealthSource, /fetchAllRatebookPackageRows[\s\S]+fetchAllRatebookRowsByRatebookIds[\s\S]+fetchAllOutreachMessagesByCampaignIds/, "Ratebook health should paginate lanes, distribution, offers, and outreach history consistently");
assert.doesNotMatch(ratebookHealthSource, /\.limit\(1000\)/, "Ratebook health should not silently omit older active Ratebooks");
assert.match(api, /ratebook_count: ratebooks\.length/);
assert.match(api, /fetchAllRatebookPackageRows\(supabase, "rfx_package_lanes", packageIds, "package_id,id,demand_lane_id,rfx_demand_lanes\(\*\)"\)/);
assert.match(api, /routes_without_offers/);
assert.match(api, /offers_to_review/);
assert.match(api, /source_outdated/);
assert.match(api, /delivery_failed/);
assert.match(api, /ratebook_revision_created/);
assert.match(api, /lifecycle_status: "superseded"/);
assert.match(api, /package_segments: segmentRows/);
assert.match(api, /shipper: shipperContexts\.get\(cleanText\(project\.id\)\)/);
assert.match(api, /staleSegmentIds/);
assert.match(api, /rfx_ratebook_segments"\)\s*\.delete\(\)/);
assert.match(api, /Publish this Ratebook before distributing private carrier links/);
assert.match(api, /source_rfx_demand_lane_id/);
assert.match(api, /rfx_ratebook_shares/);
assert.match(api, /magic_links/);
assert.match(client, /const ratebookLifecycleMutationKeys = new Set\(\);/, "Ratebook UI should key lifecycle mutations by action and ratebook");
assert.match(client, /ratebookLifecycleMutationKeys\.has\(mutationKey\)/, "Ratebook UI should ignore duplicate publish/archive clicks");
assert.match(client, /let ratebookRevisionRunning = false;/, "Ratebook UI should block duplicate revision creation");
assert.match(client, /if \(ratebookRevisionRunning\) return;/, "Ratebook UI should ignore duplicate revision clicks");
assert.match(client, /let ratebookShareRunning = false;/, "Ratebook UI should block duplicate carrier share creation");
assert.match(client, /if \(ratebookShareRunning\) return;/, "Ratebook UI should ignore duplicate share clicks");
assert.match(client, /let ratebookDistributionRunning = false;/, "Ratebook UI should block duplicate distribution sends");
assert.match(client, /if \(ratebookDistributionRunning\) return;/, "Ratebook UI should ignore duplicate distribution send clicks");
assert.match(client, /const ratebookQuoteReviewMutationKeys = new Set\(\);/, "Ratebook UI should key quote review saves per quote");
assert.match(client, /ratebookQuoteReviewMutationKeys\.has\(mutationKey\)/, "Ratebook UI should ignore duplicate quote review saves");
assert.match(api, /async function queueRatebookDistribution/);
assert.match(api, /async function sendRatebookDistribution/);
assert.match(api, /ratebook_distribution_queued/);
assert.match(api, /ratebook_distribution_sent/);
assert.match(api, /ratebook_share_id/);
assert.match(api, /Open Settings > Integrations, confirm Gmail is connected/);
assert.match(api, /owner_email", user\.owner_email/);
assert.match(api, /base_stage\.is\.null,base_stage\.neq\.archived/);
const listRatebooksSource = api.slice(
  api.indexOf("async function listRatebooks"),
  api.indexOf("async function materializeRatebooksForProjects")
);
const materializeRatebooksSource = api.slice(
  api.indexOf("async function materializeRatebooksForProjects"),
  api.indexOf("function ratebookRouteSummary")
);
assert.match(listRatebooksSource, /if \(requestedShipperId\)[\s\S]+fetchOwnedRfxRatebooksForShipper[\s\S]+fetchOwnedRfxPackagesForScope/, "Shipper filtering should query only account-linked Ratebooks and packages before materialization");
assert.match(listRatebooksSource, /else \{\s*packs = await fetchAllOwnedRfxPackages/, "Only unscoped Ratebook views should load all workspace packages");
assert.match(listRatebooksSource, /input\.skip_materialization === true \? \[\] : await mapWithConcurrency\(packs/, "Read-only account views should be able to reuse persisted Ratebooks without rewriting every package");
assert.doesNotMatch(listRatebooksSource, /neq\("status", "archived"\)/);
assert.doesNotMatch(materializeRatebooksSource, /neq\("status", "archived"\)/);
assert.match(listRatebooksSource, /\[\.\.\.materializedRatebooks, \.\.\.persistedRatebooks\][\s\S]+ratebookById\.set/, "Ratebook consolidation should retain freshly materialized books when persisted reads are temporarily incomplete");

for (const id of [
  "ratebook-search",
  "ratebook-status-filter",
  "ratebook-shipper-filter",
  "ratebook-source-filter",
  "ratebook-segment-filter",
  "ratebook-saved-view",
  "save-ratebook-view",
  "delete-ratebook-view",
  "export-ratebook-routes",
  "ratebook-overview-books",
  "ratebook-overview-shippers",
  "ratebook-overview-routes",
  "ratebook-overview-published",
  "ratebook-health-priority",
  "ratebook-health-expiring",
  "ratebook-health-unquoted",
  "ratebook-health-review",
  "ratebook-decision-queue",
  "ratebook-list",
  "ratebook-detail",
  "ratebook-route-drawer",
  "ratebook-share-dialog",
  "ratebook-audit-dialog",
  "ratebook-audit-content",
  "ratebook-carrier-search",
  "ratebook-create-email-drafts",
  "send-ratebook-distribution",
  "share-ratebook-with-carriers",
]) {
  assert.match(page, new RegExp(`id="${id}"`));
}

assert.match(client, /Transaction ID/);
assert.match(client, /RFI route detail/);
assert.match(page, /Share private Ratebook/);
assert.match(page, /Every carrier receives its own private link/);
assert.match(client, /fetchRatebookRouteDetail/);
assert.match(client, /shareRatebookWithCarriers/);
assert.match(client, /queueRatebookDistribution/);
assert.match(client, /sendRatebookDistribution/);
assert.match(client, /Ratebook invitation\(s\) sent/);
assert.match(page, /Create email drafts in Outreach/);
assert.match(client, /publishRatebook/);
assert.match(client, /archiveRatebook/);
assert.match(client, /createRatebookRevision/);
assert.match(client, /fetchRatebookAudit/);
assert.match(service, /fetchRatebookHealth/);
assert.match(client, /loadRatebookHealth/);
assert.match(client, /Decision queue/);
assert.match(client, /data-ratebook-health-action/);
assert.match(client, /Publish this Ratebook before creating carrier links/);
assert.match(client, /View audit/);
assert.match(client, /Create revision/);
assert.match(client, /source_freshness/);
assert.match(client, /data-open-route-id/);
assert.match(client, /data-copy-ratebook-link/);
assert.match(client, /row\.project\?\.customer_name/);
assert.match(client, /state\.selectedCarrierIds\.clear\(\)/);
assert.match(client, /renderRatebookOverview/);
assert.match(client, /renderBookFilters/);
assert.match(service, /exportRatebookRoutes/);
assert.match(service, /fetchRatebookRouteLedger/);
assert.match(client, /RATEBOOK_FILTER_VIEW_STORAGE_KEY/);
assert.match(client, /RATEBOOK_XLSX_MODULE_URL/);
assert.match(client, /saveCurrentRatebookView/);
assert.match(client, /deleteSelectedRatebookView/);
assert.match(client, /exportFilteredRatebookRoutes/);
assert.match(client, /exportRatebookRoutes\(currentRatebookFilters\(\)\)/);
assert.match(client, /renderConsolidatedRouteLedger/);
assert.match(client, /All Shipper Routes/);
assert.match(client, /Opportunity origin/);
assert.match(client, /include_routes: true/);
assert.match(client, /state\.routeLedgerRows = result\.route_rows \|\| \[\]/, "Ratebook should hydrate the list and consolidated ledger from one API response");
assert.doesNotMatch(client, /fetchRatebookRouteLedger\(\{ \.\.\.filters, skip_bid_room_sync: true \}\)/, "Ratebook should not repeat the full list/materialization request just to load route rows");
assert.match(client, /result\.sync\?\.failed/, "Ratebook UI should keep the usable ledger visible when a source needs a retry");
assert.match(client, /materialization_failed/, "Ratebook UI should surface a partial Ratebook materialization warning without clearing loaded books");
assert.match(client, /data-ratebook-ledger-view/);
assert.match(client, /data-ledger-route-ratebook-id/);
assert.match(client, /renderRatebookRouteGrid/);
assert.match(client, /data-ratebook-route-search/);
assert.match(client, /data-ratebook-route-segment/);
assert.match(client, /data-ratebook-route-status/);
assert.match(client, /let ratebookListLoadVersion = 0/);
assert.match(client, /let ratebookLedgerLoadVersion = 0/);
assert.match(client, /let ratebookDetailLoadVersion = 0/);
assert.match(client, /let ratebookRouteLoadVersion = 0/);
assert.match(client, /let ratebookQuoteReviewLoadVersion = 0/);
assert.match(client, /let ratebookCarrierLoadVersion = 0/);
assert.match(client, /let ratebookAuditLoadVersion = 0/);
assert.match(client, /loadVersion !== ratebookListLoadVersion/);
assert.match(client, /loadVersion !== ratebookDetailLoadVersion \|\| state\.activeRatebookId !== ratebookId/);
assert.match(client, /loadVersion !== ratebookRouteLoadVersion/);
assert.match(client, /loadVersion !== ratebookQuoteReviewLoadVersion \|\| state\.quoteReviewPackageLaneId !== packageLaneId/);
assert.match(client, /loadVersion !== ratebookCarrierLoadVersion \|\| state\.activeRatebookId !== ratebookId/);
assert.match(client, /loadVersion !== ratebookAuditLoadVersion \|\| state\.activeRatebookId !== ratebookId/);
assert.match(api, /requestedShipperId/);
assert.match(api, /requestedSourceType/);
assert.match(api, /requestedSegmentKey/);
assert.match(api, /syncBidRoomEventsForRatebookScope/);
assert.match(api, /await syncBidRoomEventsForRatebookScope\(supabase, user, input\)/);
assert.match(api, /skip_bid_room_sync !== true/);
assert.match(api, /linkedEventId && \(projectStatus\.includes\("bid_room"\) \|\| projectStatus\.includes\("bid"\)\)/);
assert.match(api, /laneSearchTextByPackage/);
assert.match(api, /normalized\.origin_market/);
assert.match(api, /facets: \{ shippers: \[\], sources: \[\], segments: \[\] \}/);
assert.match(api, /segment_count/);
assert.match(api, /total: allRows\.length/);
assert.match(auth, /id: "ratebook"/);
assert.match(auth, /title: "Ratebook"/);

const shareRatebookSource = api.slice(
  api.indexOf("async function shareRatebookWithCarriers"),
  api.indexOf("async function syncShipperOpportunityFromImplementationReadyAward")
);
assert.match(shareRatebookSource, /ratebookCarrierAccessToken/);
assert.match(shareRatebookSource, /hashRatebookCarrierAccessToken/);
assert.match(shareRatebookSource, /carrier_links_rotated/);
assert.match(shareRatebookSource, /ratebook-carrier\.html\?token=/);
assert.match(shareRatebookSource, /vendor_id: vendor\.id/);
assert.doesNotMatch(shareRatebookSource, /launchRfxProcessPackageToBidRoom/);
assert.doesNotMatch(shareRatebookSource, /rfx_lane_vendors/);
assert.doesNotMatch(shareRatebookSource, /rfx-bid\.html/);
assert.match(api, /access_token_hash: _accessTokenHash/);

assert.match(carrierAccessApi, /get_ratebook_access/);
assert.match(carrierAccessApi, /submit_ratebook_quote/);
assert.match(carrierAccessApi, /withdraw_ratebook_quote/);
assert.match(carrierAccessApi, /function publicErrorMessage/);
assert.doesNotMatch(carrierAccessApi, /error instanceof Error \? error\.message/);
assert.match(carrierAccessApi, /access_token_hash/);
assert.match(carrierAccessApi, /last_viewed_at/);
assert.match(carrierAccessApi, /last_accessed_at/);
assert.match(carrierAccessApi, /access_count/);
assert.match(carrierAccessApi, /last_quote_at/);
assert.match(carrierAccessApi, /rfx_ratebook_shares/);
assert.match(carrierAccessApi, /rfx_package_lanes/);
assert.match(carrierAccessApi, /rfx_ratebook_segments/);
assert.match(carrierAccessApi, /rfx_ratebook_carrier_quotes/);
assert.match(carrierAccessApi, /rfx_ratebook_carrier_quote_revisions/);
assert.match(carrierAccessApi, /vendor_id: share\.vendor_id/);
assert.match(carrierAccessApi, /requiredPositiveNumber\(input\.all_in_rate/);
assert.doesNotMatch(carrierAccessApi.slice(carrierAccessApi.indexOf("async function submitRatebookQuote")), /rfx_lane_vendors/);
assert.doesNotMatch(carrierAccessApi.slice(carrierAccessApi.indexOf("async function submitRatebookQuote")), /rate_staging/);
assert.doesNotMatch(carrierAccessApi, /access_token_hash:\s*token/);
assert.match(carrierAccessPage, /Private Ratebook/);
assert.match(carrierAccessPage, /ratebook-carrier-route-dialog/);
assert.match(carrierAccessPage, /ratebook-carrier-quote-dialog/);
assert.match(carrierAccessPage, /All-in rate/);
assert.match(carrierAccessClient, /get_ratebook_access/);
assert.match(carrierAccessClient, /import \{ apiErrorMessage, humanizeError \} from "\.\/error-copy\.js"/, "Private Ratebook carrier portal should use shared human error copy");
assert.match(carrierAccessClient, /apiErrorMessage\(payload, responseText, "Ratebook access is unavailable\."\)/, "Private Ratebook carrier portal should normalize API errors");
assert.match(carrierAccessClient, /catch \{[\s\S]+payload = \{\};[\s\S]+\}/, "Private Ratebook carrier portal should tolerate non-JSON API error bodies");
assert.match(carrierAccessClient, /Submit offer/);
assert.match(carrierAccessClient, /Update offer/);
assert.match(carrierAccessClient, /withdraw_ratebook_quote/);
assert.match(carrierAccessClient, /const ratebookCarrierQuoteMutationKeys = new Set\(\);/, "Private Ratebook carrier portal should key quote mutations per route and action");
assert.match(carrierAccessClient, /ratebookCarrierQuoteMutationKeys\.has\(mutationKey\)/, "Private Ratebook carrier portal should ignore duplicate quote submit or withdraw actions");
assert.match(carrierAccessClient, /elements\.withdrawQuote\.disabled = true;[\s\S]+submit_ratebook_quote/, "Private Ratebook carrier portal should disable withdraw while saving a quote");
assert.match(carrierAccessClient, /elements\.submitQuote\.disabled = true;[\s\S]+withdraw_ratebook_quote/, "Private Ratebook carrier portal should disable submit while withdrawing a quote");
assert.doesNotMatch(carrierAccessClient, /error\.message \|\| "Your offer could not be/, "Private Ratebook carrier portal should not render raw quote mutation errors");
assert.match(carrierAccessClient, /Ratebook access is unavailable/);
assert.match(api, /rfx_ratebook_carrier_quotes/);
assert.match(api, /ratebook_quote_count/);
assert.match(api, /rfx_ratebook_quote_reviews/);
assert.match(api, /shortlisted_quote_count/);
assert.match(api, /This carrier offer is no longer available for Ratebook review/);
assert.match(api, /ratebook_quote_\$\{decision\}/);
assert.match(service, /fetchRatebookRouteQuotes/);
assert.match(service, /updateRatebookQuoteReview/);
assert.match(page, /id="ratebook-quote-review-dialog"/);
assert.match(page, /id="ratebook-quote-review-content"/);
assert.match(client, /data-review-ratebook-route/);
assert.match(client, /Shortlisting keeps the carrier's submitted offer unchanged/);
assert.match(client, /data-save-ratebook-quote-review/);
assert.match(client, /updateRatebookQuoteReview/);

console.log("ratebook tests passed");
