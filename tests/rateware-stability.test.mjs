import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const apiSource = readFileSync(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url), "utf8");
const interpretUploadSource = readFileSync(new URL("../supabase/functions/interpret-upload/index.ts", import.meta.url), "utf8");
const uploadHistorySource = readFileSync(new URL("../src/upload-history.js", import.meta.url), "utf8");
const uploadCenterSource = readFileSync(new URL("../src/upload-center.js", import.meta.url), "utf8");
const uploadHistoryHtml = readFileSync(new URL("../upload-history.html", import.meta.url), "utf8");
const uploadCenterHtml = readFileSync(new URL("../upload-center.html", import.meta.url), "utf8");
const bulkImportTemplateSource = readFileSync(new URL("../src/bulk-import-template.js", import.meta.url), "utf8");
const stagingReviewSource = readFileSync(new URL("../src/staging-review.js", import.meta.url), "utf8");
const ratewareSource = readFileSync(new URL("../src/rateware.js", import.meta.url), "utf8");
const vendorsSource = readFileSync(new URL("../src/vendors.js", import.meta.url), "utf8");
const rfxEventsSource = readFileSync(new URL("../src/rfx-events.js", import.meta.url), "utf8");
const rfxEventsHtml = readFileSync(new URL("../rfx-events.html", import.meta.url), "utf8");
const rfxBidSource = readFileSync(new URL("../src/rfx-bid.js", import.meta.url), "utf8");
const rfxBidApiSource = readFileSync(new URL("../supabase/functions/rfx-bid-api/index.ts", import.meta.url), "utf8");
const gmailOauthCallbackSource = readFileSync(new URL("../supabase/functions/gmail-oauth-callback/index.ts", import.meta.url), "utf8");
const googleChatAppSource = readFileSync(new URL("../supabase/functions/google-chat-app/index.ts", import.meta.url), "utf8");
const rfxServiceSource = readFileSync(new URL("../src/rfx-service.js", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/settings.js", import.meta.url), "utf8");
const settingsHtml = readFileSync(new URL("../settings.html", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const outreachServiceSource = readFileSync(new URL("../src/outreach-service.js", import.meta.url), "utf8");
const stagingServiceSource = readFileSync(new URL("../src/staging-service.js", import.meta.url), "utf8");
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
const shipmentIdFilterMigration = readFileSync(new URL("../supabase/migrations/20260628123000_add_shipment_id_rate_filters.sql", import.meta.url), "utf8");
const outreachSenderMigration = readFileSync(new URL("../supabase/migrations/20260703165000_outreach_sender_identity.sql", import.meta.url), "utf8");
const bidVisibilityMigration = readFileSync(new URL("../supabase/migrations/20260703235500_rfx_bid_visibility_mode.sql", import.meta.url), "utf8");
const bidRoomChatMigration = readFileSync(new URL("../supabase/migrations/20260704001000_bid_room_chat_threads.sql", import.meta.url), "utf8");
const googleChatConnectionsMigration = readFileSync(new URL("../supabase/migrations/20260704012000_google_chat_connections.sql", import.meta.url), "utf8");
const googleChatInboundMigration = readFileSync(new URL("../supabase/migrations/20260704052000_google_chat_inbound_sync.sql", import.meta.url), "utf8");

for (const domain of ["gmail.com", "hotmail.com", "yahoo.com", "outlook.com", "yahoo.com.mx"]) {
  assert.match(apiSource, new RegExp(`"${domain.replace(".", "\\.")}"`), `generic domain ${domain} should be blocked`);
}

assert.match(apiSource, /function isGenericEmailDomain/, "API should expose generic-domain guard");
assert.match(apiSource, /!genericDomain && domain && vendorDomain && vendorDomain === domain/, "domain matching should skip generic email domains");
assert.match(apiSource, /if \(!email && genericDomain && !nameScore\.score\) return/, "bare generic domains should not create vendor matches unless a legal or commercial name is present");
assert.match(apiSource, /const INTERNAL_RATEWARE_DOMAINS = new Set/, "internal Rateware and Marksman domains should be blocked from carrier matching");
assert.match(apiSource, /function vendorReferenceCandidatesFromText/, "vendor matching should extract carrier domains from source filenames and hints");
assert.match(apiSource, /function vendorBusinessNameCandidateFromText/, "vendor matching should keep legal or commercial names when domains are generic or missing");
assert.match(apiSource, /businessNameKey\(reference\)/, "direct vendor reference matching should accept legal or commercial names");
assert.match(apiSource, /const VENDOR_REFERENCE_SELECT = "id,vendor_name,legal_name,domain,primary_email,secondary_emails,status,base_stage"/, "vendor matching should load legal names");
assert.match(apiSource, /function nameMatchScore/, "vendor matching should score legal and commercial name candidates");
assert.match(apiSource, /source: "legal_name"/, "vendor matching should compare detected names against legal_name");
assert.match(apiSource, /function attachUploadVendorHints/, "rate vendor matching should use upload-level vendor hints when rate rows are missing vendor domains");
assert.match(apiSource, /original_filename,vendor_id,vendor_hint,vendor_match_source/, "upload hints should include filenames for carrier-domain repair");
assert.match(apiSource, /plannedVendorPatchForRateRow/, "rate vendor matching should centralize patch planning per row");
assert.match(apiSource, /plannedVendorPatchForRawUpload/, "vendor matching should repair source uploads as well as rate rows");
assert.match(apiSource, /upload_updated/, "vendor matching responses should report repaired source uploads");
assert.match(apiSource, /unmatched_errors/, "vendor matching responses should include unmatched vendor diagnostics");
assert.match(apiSource, /corrected_vendor_domain/, "vendor match diagnostics should produce a correction template");
assert.match(apiSource, /shipment_id: cleanText\(row\.row_id\)/, "vendor match diagnostics should include Shipment ID");
assert.match(apiSource, /async function fetchVendorReferenceRows/, "vendor/domain matching should page through the user's full vendor base");
assert.match(apiSource, /range\(offset, Math\.min\(offset \+ pageSize - 1, maxRows - 1\)\)/, "vendor/domain matching should not stop at the first 1000 vendors");
const directVendorResolverSource = apiSource.slice(apiSource.indexOf("async function resolveVendorReference"), apiSource.indexOf("async function vendorLinkPatch"));
assert.ok(directVendorResolverSource.length > 100, "direct vendor resolver should be present");
assert.doesNotMatch(directVendorResolverSource, /\.limit\(1000\)/, "direct vendor resolver should not cap matching at 1000 vendors");
assert.match(apiSource, /const pageSize = 5000/, "filtered vendor matching should scan database rows in bounded pages");
const filteredVendorMatchSource = apiSource.slice(apiSource.indexOf("async function matchRateVendorRowsByFilter"), apiSource.indexOf("async function renormalizeRateRows"));
assert.ok(filteredVendorMatchSource.length > 100, "filtered vendor matching helper should be present");
assert.match(filteredVendorMatchSource, /collectRateRowIdsByFilter/, "filtered vendor matching should freeze all target row ids before updates");
assert.match(filteredVendorMatchSource, /for \(const chunk of chunkValues\(ids, pageSize\)\)/, "filtered vendor matching should process frozen ids in bounded chunks");
assert.doesNotMatch(filteredVendorMatchSource, /offset \+=/, "filtered vendor matching should not page mutable filtered sets while updating vendor ids");
assert.match(apiSource, /Number\(body\.max_rows\) \|\| 100000/, "filtered vendor matching should support whole-base matching above 50k rows");
assert.match(stagingReviewSource, /source upload\(s\) repaired/, "Staging vendor matching should explain source upload repair counts");
assert.match(ratewareSource, /source upload\(s\) repaired/, "Rateware vendor matching should explain source upload repair counts");
assert.match(stagingReviewSource, /downloadVendorMatchErrors/, "Staging should download unmatched vendor diagnostics");
assert.match(ratewareSource, /downloadVendorMatchErrors/, "Rateware should download unmatched vendor diagnostics");
assert.match(stagingReviewSource, /Shipment ID/, "Staging should expose Shipment ID");
assert.match(ratewareSource, /Shipment ID/, "Rateware should expose Shipment ID");
assert.match(apiSource, /vendor_ids: vendorIds/, "Vendor segments should support exact participant template vendor ids");
assert.match(apiSource, /update_vendor_segment/, "API should support updating reusable vendor participant templates");
assert.match(rfxEventsSource, /createVendorSegment/, "Bid Room should save selected participants as reusable vendor templates");
assert.match(rfxEventsSource, /updateVendorSegment/, "Bid Room should update saved participant templates after carrier changes");
assert.match(rfxEventsSource, /deleteVendorSegment/, "Bid Room should delete saved participant templates without touching CRM carriers");
assert.match(rfxEventsSource, /segmentVendorIds/, "Bid Room should preload exact vendor id templates");
assert.match(rfxEventsHtml, /manual-shortlist-template-name/, "Bid Room should render a named participant template input");
assert.match(rfxEventsHtml, /load-manual-shortlist-template/, "Bid Room should render a saved participant template loader");
assert.match(rfxEventsHtml, /update-manual-shortlist-template/, "Bid Room should render an update button for selected participant templates");
assert.match(rfxEventsHtml, /delete-manual-shortlist-template/, "Bid Room should render a delete button for selected participant templates");
assert.match(rfxEventsHtml, /rfx-outreach-sender/, "Bid Room Step 4 should include a sender account selector");
assert.match(rfxEventsHtml, /sales@heymarksman\.com/, "Bid Room Step 4 should use sales@heymarksman.com as the approved sender");
assert.doesNotMatch(rfxEventsHtml, /carriers@xbfreight\.com/, "Bid Room Step 4 should not offer legacy sender accounts");
assert.doesNotMatch(rfxEventsHtml, /Advanced source editor/, "Bid Room Step 4 should not expose the advanced source editor in the main flow");
assert.match(rfxEventsSource, /sender_email: rfxOutreachSender/, "Bid Room should pass the selected sender into outreach campaign creation");
assert.match(outreachServiceSource, /sender_email: options\.senderEmail/, "Outreach draft generation should send selected sender metadata to the API");
assert.match(outreachServiceSource, /send_outreach_messages/, "Outreach service should expose direct Gmail send for selected draft messages");
assert.match(rfxEventsHtml, /rfx-send-selected-email-drafts/, "Bid Room draft queue should include a bulk send selected emails action");
assert.match(rfxEventsHtml, /rfx-archive-selected-drafts/, "Bid Room draft queue should include archive selected action");
assert.match(rfxEventsHtml, /rfx-delete-selected-drafts/, "Bid Room draft queue should include delete selected action");
assert.match(bidVisibilityMigration, /bid_visibility_mode text not null default 'anonymous_rank'/, "RFx events should store a per-event Bid Room visibility mode");
assert.match(bidVisibilityMigration, /open_leaderboard/, "Bid Room visibility should support open leaderboard events");
assert.match(rfxEventsHtml, /rfx-bid-visibility/, "Bid Room setup should expose visibility mode selection");
assert.match(rfxEventsSource, /bid_visibility_mode: rfxBidVisibilityInput/, "Bid Room should save visibility mode from the setup form");
assert.match(apiSource, /"private", "anonymous_rank", "open_leaderboard"/, "API should validate Bid Room visibility modes");
assert.match(rfxBidApiSource, /competitor_names_visible: normalizedMode === "open_leaderboard"/, "Carrier portal should reveal competitor names only in open leaderboard mode");
assert.match(rfxBidSource, /Open leaderboard - competitor names and exact submitted rates are visible/, "Carrier portal should explain open leaderboard visibility");
assert.match(bidRoomChatMigration, /create table if not exists public\.bid_room_chat_threads/, "Bid Room chat should store durable threads");
assert.match(bidRoomChatMigration, /thread_type in \('event_group', 'lane_group', 'carrier_private'\)/, "Bid Room chat should support group, lane, and private threads");
assert.match(bidRoomChatMigration, /google_chat_thread_key/, "Bid Room chat should be ready for Google Chat thread mirroring");
assert.match(apiSource, /post_bid_room_chat_message/, "Internal API should post Bid Room chat messages");
assert.match(rfxBidApiSource, /postCarrierBidRoomChatMessage/, "Carrier portal API should post token-scoped chat messages");
assert.match(rfxEventsHtml, /rfx-chat-thread-type/, "Bid Room should render internal chat controls");
assert.match(rfxEventsSource, /fetchBidRoomChat/, "Bid Room UI should load chat threads");
assert.match(rfxServiceSource, /postBidRoomChatMessage/, "RFx service should expose chat posting");
assert.match(rfxBidSource, /carrier-chat-form/, "Carrier portal should render chat form");
assert.match(stylesSource, /bid-room-chat-panel/, "Bid Room chat should have compact UI styling");
assert.match(googleChatConnectionsMigration, /create table if not exists public\.google_chat_connections/, "Google Chat should store OAuth connections separately from Gmail");
assert.match(apiSource, /start_google_chat_oauth/, "API should start Google Chat OAuth consent");
assert.match(apiSource, /list_google_chat_spaces/, "API should list Google Chat spaces for the connected user");
assert.match(apiSource, /chat\.messages\.create/, "Google Chat OAuth should request message creation scope");
assert.match(apiSource, /chat\.messages\.readonly/, "Google Chat OAuth should request message read scope for inbound sync");
assert.match(apiSource, /syncBidRoomMessageToGoogleChatApi/, "Bid Room chat should prefer Google Chat API sync over webhook-only mirroring");
assert.match(apiSource, /syncGoogleChatInboundMessagesForThreads/, "Internal Bid Room chat should import Google Chat replies back into Rateware");
assert.match(rfxBidApiSource, /syncGoogleChatInboundMessagesForThreads/, "Carrier Bid Room portal should import Google Chat replies before rendering chat");
assert.match(googleChatInboundMigration, /google_chat_thread_name text/, "Bid Room chat should persist the real Google Chat thread name for inbound matching");
assert.match(googleChatInboundMigration, /bid_room_chat_messages_google_name_idx/, "Bid Room chat should deduplicate inbound Google Chat messages by message name");
assert.match(settingsHtml, /connect-google-chat-button/, "Settings should expose a Google Chat connection action");
assert.match(settingsSource, /saveGoogleChatSettings/, "Settings should save the default Bid Room Google Chat Space");
assert.match(settingsSource, /Reconnect Google Chat/, "Settings should let users reconnect Google Chat when inbound read scope is missing");
assert.match(settingsHtml, /google-chat-space-manual-input/, "Settings should let users paste a Google Chat Space link when list lookup is incomplete");
assert.match(apiSource, /normalizeGoogleChatSpaceName/, "API should normalize pasted Google Chat Space links or resource names");
assert.match(settingsSource, /applyOAuthUrlFeedback/, "Settings should show OAuth redirect success or error messages");
assert.match(gmailOauthCallbackSource, /if \(!state\)/, "OAuth callback should read state before classifying provider-specific OAuth errors");
assert.match(gmailOauthCallbackSource, /oauthError\) return redirectTo\(cleanText\(stateRow\.redirect_after\)/, "OAuth callback should surface Google Chat OAuth errors on the Chat integration");
assert.match(googleChatAppSource, /ADDED_TO_SPACE/, "Google Chat app endpoint should respond when added to a Space");
assert.match(settingsHtml, /retry-google-chat-sync-button/, "Settings should expose retry for failed Google Chat syncs");
assert.match(apiSource, /retry_google_chat_sync/, "API should retry failed Google Chat message syncs after setup is complete");
assert.match(apiSource, /sync_bid_room_event_thread/, "Bid Room should create an explicit Google Chat event thread");
assert.match(rfxEventsHtml, /rfx-chat-start-event-thread/, "Bid Room chat should expose a start event thread action");
assert.match(rfxEventsSource, /syncBidRoomEventThread/, "Bid Room UI should call the event thread sync action");
assert.match(rfxEventsSource, /ensureSelectedEventChatThread\(eventId, \{ silent: true \}\)/, "Bid Room should automatically ensure event chat thread on event load");
assert.match(apiSource, /already_synced: true/, "Google Chat event thread sync should be idempotent once synced");
assert.match(apiSource, /sendOutreachMessages/, "API should send selected outreach messages through Gmail");
assert.match(apiSource, /delete_outreach_messages/, "API should delete selected outreach draft rows");
assert.match(apiSource, /sender_email: senderEmail/, "API should persist sender email on outreach draft rows");
assert.match(outreachSenderMigration, /add column if not exists sender_email text/, "Outreach schema should store sender identity");
assert.doesNotMatch(settingsHtml, /Redirect URI|OAuth setup|Google secrets/i, "Settings UI should not expose deployment-level Gmail OAuth details to users");
assert.doesNotMatch(settingsSource, /Redirect URI|OAuth setup|Missing Google secrets|Add Google OAuth secrets/i, "Settings copy should keep Gmail setup SaaS-like and non-technical");
assert.doesNotMatch(apiSource, /Add GOOGLE_CLIENT_ID/i, "API errors should not instruct end users to manage deployment secrets");
assert.match(settingsSource, /No user credentials are required/, "Settings should explain that users do not type Gmail credentials into Rateware");
assert.match(shipmentIdFilterMigration, /when 'row_id' then array\[rate_row\.row_id\]/, "SQL filter values should support Shipment ID");
assert.match(shipmentIdFilterMigration, /public\.rateware_values_filter_match\(p_column_filters, 'row_id', array\[rate_row\.row_id\]\)/, "SQL row filters should support Shipment ID");
assert.match(shipmentIdFilterMigration, /when 'row_id' then rs\.row_id/, "SQL column value menus should support Shipment ID");
assert.match(apiSource, /rawUploadVendorReferenceCandidates/, "raw upload vendor matching should use safe domain candidates");
assert.match(bulkImportTemplateSource, /BULK_IMPORT_TEMPLATE_COLUMNS/, "bulk import should have an official template column definition");
assert.match(bulkImportTemplateSource, /header: "Shipment ID"/, "bulk import template should include Shipment ID");
assert.match(bulkImportTemplateSource, /header: "Vendor Domain"/, "bulk import template should include vendor domain");
assert.match(bulkImportTemplateSource, /header: "Vendor Name"/, "bulk import template should include vendor name for generic email carriers");
assert.match(bulkImportTemplateSource, /header: "Origin ZIP"/, "bulk import template should include origin ZIP");
assert.match(bulkImportTemplateSource, /header: "Origin State"/, "bulk import template should include origin state");
assert.match(bulkImportTemplateSource, /header: "Origin Key Market Area"/, "bulk import template should include origin key market area");
assert.match(bulkImportTemplateSource, /header: "Origin Region"/, "bulk import template should include origin region");
assert.match(bulkImportTemplateSource, /header: "Destination ZIP"/, "bulk import template should include destination ZIP");
assert.match(bulkImportTemplateSource, /header: "Destination State"/, "bulk import template should include destination state");
assert.match(bulkImportTemplateSource, /header: "Destination Key Market Area"/, "bulk import template should include destination key market area");
assert.match(bulkImportTemplateSource, /header: "Destination Region"/, "bulk import template should include destination region");
assert.match(bulkImportTemplateSource, /All-in Rate must be numeric/, "bulk import template should warn about invalid rate placeholders");
assert.match(uploadHistorySource, /downloadBulkImportTemplate/, "Upload History should expose template download");
assert.match(uploadCenterSource, /downloadBulkImportTemplate/, "Upload Center should expose template download");
assert.match(uploadHistoryHtml, /data-download-bulk-template/, "Upload History should render template download button");
assert.match(uploadCenterHtml, /data-download-bulk-template/, "Upload Center should render template download button");
assert.match(uploadHistorySource, /"vendor name"/, "bulk import parser should recognize Vendor Name header");
assert.match(uploadHistorySource, /"legal name"/, "bulk import parser should recognize Legal Name header");
assert.match(uploadHistorySource, /"razon social"/i, "bulk import parser should recognize Razon Social header");
assert.match(uploadHistorySource, /origin_zip_prefix/, "bulk import parser should recognize origin ZIP headers");
assert.match(uploadHistorySource, /origin_market/, "bulk import parser should recognize origin market headers");
assert.match(uploadHistorySource, /destination_zip_prefix/, "bulk import parser should recognize destination ZIP headers");
assert.match(uploadHistorySource, /destination_market/, "bulk import parser should recognize destination market headers");
assert.match(apiSource, /origin_match_source: hasOriginLocationMetadata \? "template"/, "structured bulk import should mark origin metadata as template supplied");
assert.match(apiSource, /destination_match_source: hasDestinationLocationMetadata \? "template"/, "structured bulk import should mark destination metadata as template supplied");
assert.match(apiSource, /row\.origin_zip_prefix \|\| row\.origin_state \|\| row\.origin_market/, "manual origin metadata preservation should include ZIP and state");
assert.match(apiSource, /row\.destination_zip_prefix \|\| row\.destination_state \|\| row\.destination_market/, "manual destination metadata preservation should include ZIP and state");

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
  /async function fetchRatewareRowsBySql/,
  "Rateware list should have a SQL fallback helper for compatible filters"
);
assert.match(
  listRatewareSource,
  /fetchRateRowIdsByFilter[\s\S]*catch \(error\)[\s\S]*canUseSqlRateFilters\(filterPayload\)[\s\S]*fetchRatewareRowsBySql/,
  "Rateware list should recover with SQL when the normalized RPC path is unavailable"
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
assert.match(uploadHistorySource, /const BULK_IMPORT_MIN_BATCH_SIZE = 25/, "structured upload import should have a safe minimum retry batch size");
assert.match(uploadHistorySource, /function shouldSplitBulkImportError/, "structured upload import should detect resource errors that need smaller batches");
assert.match(uploadHistorySource, /async function importBulkBatchAdaptive/, "structured upload import should retry heavy batches as smaller chunks");
assert.match(apiSource, /async function fetchScopedTemplateLocations/, "structured upload import should scope location catalog reads per batch");
assert.match(apiSource, /function templateLocationScope/, "structured upload import should derive location scope from source rows");
assert.match(apiSource, /async function fetchScopedTemplateMileage/, "structured upload import should avoid loading the full mileage catalog");
const bulkImportSource = apiSource.slice(apiSource.indexOf("async function bulkImportStructuredUpload"), apiSource.indexOf("function normalizeOutreachTemplate"));
assert.ok(bulkImportSource.length > 100, "bulk structured import helper should be present");
assert.match(bulkImportSource, /const vendorsPromise = inheritedVendorId[\s\S]*Promise\.resolve/, "bulk import should skip full vendor lookup when upload already has a vendor");
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
const listStagingSource = apiSource.slice(apiSource.indexOf('if (body.action === "list_staging")'), apiSource.indexOf('if (body.action === "list_staging_filter_values")'));
assert.ok(listStagingSource.length > 100, "Staging list block should be present");
assert.match(listStagingSource, /RATE_ROW_LIST_SELECT/, "Staging list should use the same lightweight row payload as Rateware");
assert.doesNotMatch(listStagingSource, /RATE_ROW_RESPONSE_WITH_LEGS_SELECT/, "Staging list should not hydrate lane legs and evidence for every visible row");
const rateRowDetailSource = apiSource.slice(apiSource.indexOf('if (body.action === "get_rate_row_detail")'), apiSource.indexOf('if (body.action === "bulk_update_rateware")'));
assert.match(rateRowDetailSource, /RATE_ROW_RESPONSE_WITH_LEGS_SELECT/, "Row detail should still lazy-load full evidence and lane legs");
assert.match(stagingServiceSource, /fetchStagingDetail/, "Staging service should expose lazy row detail loading");
assert.match(stagingReviewSource, /fetchStagingDetail\(id\)/, "Staging drawer should fetch full evidence only when opened");

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
assert.match(apiSource, /async function fetchVendorIntelligenceVendors/, "Vendor Intelligence should page vendor loading separately from scoring");
assert.match(vendorIntelligenceSource, /fetchVendorIntelligenceVendors\(supabase, user, options\)/, "Vendor Intelligence should load only the requested vendor page");
assert.doesNotMatch(vendorIntelligenceSource, /\.limit\(2000\)/, "Vendor Intelligence should not depend on a fixed 2000-vendor Edge Function payload");
assert.doesNotMatch(
  vendorIntelligenceSource,
  /fetchBusinessIntelligenceRows/,
  "Vendor Intelligence should not load raw BI rate rows in the Edge Function"
);
const applyVendorIntelligenceTagsSource = apiSource.slice(apiSource.indexOf('if (body.action === "apply_vendor_intelligence_tags")'), apiSource.indexOf('if (body.action === "carrier_intelligence_chat")'));
assert.ok(applyVendorIntelligenceTagsSource.length > 100, "apply vendor intelligence tags block should be present");
assert.match(applyVendorIntelligenceTagsSource, /buildVendorIntelligence\(supabase, user, \{ ids \}\)/, "applying suggested tags should score only selected vendors");

const vendorFunnelSource = apiSource.slice(apiSource.indexOf("async function buildVendorFunnel"), apiSource.indexOf("function scoreCarrierFit"));
assert.ok(vendorFunnelSource.length > 100, "vendor funnel helper should be present");
assert.match(vendorFunnelSource, /fetchVendorRateMetricsSafe/, "Procurement Pipeline should not fail the full funnel when quote metrics are unavailable");
assert.match(vendorFunnelSource, /warnings: metricsResult\.warnings/, "Procurement Pipeline should return partial-load warnings");
assert.doesNotMatch(
  vendorFunnelSource,
  /fetchBusinessIntelligenceRows/,
  "Procurement Pipeline should not load raw BI rate rows in the Edge Function"
);
assert.match(vendorsSource, /function bulkMoveActiveFunnelStage/, "Vendor Pipeline should support bulk moves for the active stage");
assert.match(vendorsSource, /funnelStageRows\(sourceStage\)/, "Vendor Pipeline bulk moves should use active funnel filters");
assert.match(vendorsSource, /bulkUpdateVendors\(ids, \{ base_stage: "procurement", funnel_stage: targetStage \}\)/, "Vendor Pipeline bulk moves should update existing vendors through the bulk API");
const vendorOnboardingGapsSource = apiSource.slice(apiSource.indexOf("async function buildVendorOnboardingGaps"), apiSource.indexOf("function normalizeImportedVendor"));
assert.ok(vendorOnboardingGapsSource.length > 100, "vendor onboarding gaps helper should be present");
assert.match(vendorOnboardingGapsSource, /\.eq\("owner_email", user\.owner_email\)/, "vendor onboarding gaps should be scoped to the signed-in owner");
assert.match(vendorOnboardingGapsSource, /vendorOnboardingGapReport/, "vendor onboarding gaps should return row-level gap reports");
assert.match(apiSource, /body\.action === "vendor_onboarding_gaps"/, "rateware API should expose vendor onboarding gaps export");
assert.match(apiSource, /body\.action === "import_vendor_onboarding_corrections"/, "rateware API should accept onboarding gap correction imports");
assert.match(apiSource, /async function importVendorOnboardingCorrections/, "onboarding gap corrections should have a dedicated updater");
const vendorOnboardingCorrectionsSource = apiSource.slice(apiSource.indexOf("async function importVendorOnboardingCorrections"), apiSource.indexOf("function normalizeImportedVendor"));
assert.ok(vendorOnboardingCorrectionsSource.length > 100, "vendor onboarding correction helper should be present");
assert.match(vendorOnboardingCorrectionsSource, /findVendorForOnboardingCorrection/, "gap correction imports should match existing vendors first");
assert.match(vendorOnboardingCorrectionsSource, /\.update\(patch\)/, "gap correction imports should update existing vendors instead of inserting duplicates");
assert.doesNotMatch(vendorOnboardingCorrectionsSource, /\.insert\(/, "gap correction imports should not insert new vendor records");
const vendorPatchSource = apiSource.slice(apiSource.indexOf("function normalizeVendorPatch"), apiSource.indexOf("function normalizeSegment"));
assert.ok(vendorPatchSource.length > 100, "vendor patch normalizer should be present");
assert.match(apiSource, /function normalizeVendorProfileData/, "vendors should support structured onboarding profile data");
assert.match(vendorPatchSource, /patch\.profile_data = profileData/, "vendor updates should persist structured onboarding profile data");
assert.match(vendorPatchSource, /vendorProfileDerivedTags\(profileData\)/, "vendor updates should derive CRM tags from onboarding profile data");
assert.match(vendorPatchSource, /vendorFunnelUpdatePatch\(normalizeVendorFunnelStage\(current\.funnel_stage\) \|\| "targeted"/, "moving vendors to Procurement should default missing funnel stage to Targeted");
assert.match(vendorPatchSource, /baseStage === "sourcing" \|\| baseStage === "archived"/, "leaving Procurement should clear the active funnel stage");
const bulkVendorUpdateSource = apiSource.slice(apiSource.indexOf('if (body.action === "bulk_update_vendors")'), apiSource.indexOf('if (body.action === "remove_vendors")'));
assert.ok(bulkVendorUpdateSource.length > 100, "bulk vendor update block should be present");
assert.match(bulkVendorUpdateSource, /select\("\*"\)/, "bulk vendor updates should read current vendor state before applying funnel transitions");
assert.match(bulkVendorUpdateSource, /normalizeVendorPatch\(patchInput, vendor \|\| \{\}\)/, "bulk vendor updates should normalize each vendor against its current funnel state");
assert.match(bulkVendorUpdateSource, /for \(const idBatch of chunkValues\(ids, 100\)\)/, "bulk vendor updates should page selected ids in bounded chunks");
assert.match(bulkVendorUpdateSource, /for \(const vendorBatch of chunkValues\(current\.data \|\| \[\], 20\)\)/, "bulk vendor updates should limit concurrent row updates");

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
