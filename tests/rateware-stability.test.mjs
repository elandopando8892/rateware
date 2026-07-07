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
const sheetUiSource = readFileSync(new URL("../src/sheet-ui.js", import.meta.url), "utf8");
const catalogWorkbenchSource = readFileSync(new URL("../src/catalog-workbench.js", import.meta.url), "utf8");
const locationMatchDrawerSource = readFileSync(new URL("../src/location-match-drawer.js", import.meta.url), "utf8");
const stagingReviewHtml = readFileSync(new URL("../staging-review.html", import.meta.url), "utf8");
const ratewareHtml = readFileSync(new URL("../rateware.html", import.meta.url), "utf8");
const vendorsSource = readFileSync(new URL("../src/vendors.js", import.meta.url), "utf8");
const vendorsHtml = readFileSync(new URL("../vendors.html", import.meta.url), "utf8");
const vendorServiceSource = readFileSync(new URL("../src/vendor-service.js", import.meta.url), "utf8");
const carrierProfileSource = readFileSync(new URL("../src/carrier-profile.js", import.meta.url), "utf8");
const carrierProfileHtml = readFileSync(new URL("../carrier-profile.html", import.meta.url), "utf8");
const carrierProfileApiSource = readFileSync(new URL("../supabase/functions/carrier-profile-api/index.ts", import.meta.url), "utf8");
const rfxEventsSource = readFileSync(new URL("../src/rfx-events.js", import.meta.url), "utf8");
const rfxEventsHtml = readFileSync(new URL("../rfx-events.html", import.meta.url), "utf8");
const rfxBidSource = readFileSync(new URL("../src/rfx-bid.js", import.meta.url), "utf8");
const rfxBidApiSource = readFileSync(new URL("../supabase/functions/rfx-bid-api/index.ts", import.meta.url), "utf8");
const bidRoomBoardSource = readFileSync(new URL("../src/bid-room-board.js", import.meta.url), "utf8");
const bidRoomBoardHtml = readFileSync(new URL("../bid-room-board.html", import.meta.url), "utf8");
const bidRoomE2eSource = readFileSync(new URL("../tools/bid-room-e2e.mjs", import.meta.url), "utf8");
const integrationSmokeSource = readFileSync(new URL("../tools/integration-smoke.mjs", import.meta.url), "utf8");
const packageJsonSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const gmailOauthCallbackSource = readFileSync(new URL("../supabase/functions/gmail-oauth-callback/index.ts", import.meta.url), "utf8");
const googleChatAppSource = readFileSync(new URL("../supabase/functions/google-chat-app/index.ts", import.meta.url), "utf8");
const rfxServiceSource = readFileSync(new URL("../src/rfx-service.js", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/settings.js", import.meta.url), "utf8");
const settingsServiceSource = readFileSync(new URL("../src/settings-service.js", import.meta.url), "utf8");
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
const laneLocationCountryZipGuardsMigration = readFileSync(new URL("../supabase/migrations/20260706120000_strengthen_location_country_zip_guards.sql", import.meta.url), "utf8");
const shipmentIdFilterMigration = readFileSync(new URL("../supabase/migrations/20260628123000_add_shipment_id_rate_filters.sql", import.meta.url), "utf8");
const outreachSenderMigration = readFileSync(new URL("../supabase/migrations/20260703165000_outreach_sender_identity.sql", import.meta.url), "utf8");
const bidVisibilityMigration = readFileSync(new URL("../supabase/migrations/20260703235500_rfx_bid_visibility_mode.sql", import.meta.url), "utf8");
const bidRoomChatMigration = readFileSync(new URL("../supabase/migrations/20260704001000_bid_room_chat_threads.sql", import.meta.url), "utf8");
const googleChatConnectionsMigration = readFileSync(new URL("../supabase/migrations/20260704012000_google_chat_connections.sql", import.meta.url), "utf8");
const googleChatInboundMigration = readFileSync(new URL("../supabase/migrations/20260704052000_google_chat_inbound_sync.sql", import.meta.url), "utf8");
const bidRoomCommunicationActionsMigration = readFileSync(new URL("../supabase/migrations/20260704062000_bid_room_communication_actions.sql", import.meta.url), "utf8");
const bidRoomChatBidUpdatesMigration = readFileSync(new URL("../supabase/migrations/20260704070000_bid_room_chat_bid_updates.sql", import.meta.url), "utf8");
const rfxAwardCloseoutMigration = readFileSync(new URL("../supabase/migrations/20260704080000_rfx_award_closeout.sql", import.meta.url), "utf8");
const rfxBidSubmissionV2Migration = readFileSync(new URL("../supabase/migrations/20260704093000_rfx_bid_submission_v2.sql", import.meta.url), "utf8");
const vendorSegmentsCoverageMigration = readFileSync(new URL("../supabase/migrations/20260706143000_vendor_segments_coverage_filter.sql", import.meta.url), "utf8");
const vendorProfileRequestsMigration = readFileSync(new URL("../supabase/migrations/20260706152000_vendor_profile_requests.sql", import.meta.url), "utf8");

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
assert.match(apiSource, /normalizeBulkMaxRows\(body\.max_rows\)/, "filtered vendor matching should support whole-base matching above 50k rows");
assert.match(apiSource, /filtered vendor match[\s\S]*requirePreviewCountForFilteredBulk/, "filtered vendor matching should require confirmed dry-run preview before applying whole-base updates");
assert.match(stagingReviewSource, /source upload\(s\) repaired/, "Staging vendor matching should explain source upload repair counts");
assert.match(ratewareSource, /source upload\(s\) repaired/, "Rateware vendor matching should explain source upload repair counts");
assert.match(stagingReviewSource, /downloadVendorMatchErrors/, "Staging should download unmatched vendor diagnostics");
assert.match(ratewareSource, /downloadVendorMatchErrors/, "Rateware should download unmatched vendor diagnostics");
assert.match(stagingReviewSource, /Shipment ID/, "Staging should expose Shipment ID");
assert.match(ratewareSource, /Shipment ID/, "Rateware should expose Shipment ID");
assert.match(stagingReviewHtml, /staging-next-issue/, "Staging spreadsheet should expose a next-issue navigator");
assert.match(stagingReviewHtml, /staging-select-issue-rows/, "Staging spreadsheet should select visible rows with validation issues");
assert.match(ratewareHtml, /rateware-next-issue/, "Rateware spreadsheet should expose a next-issue navigator");
assert.match(ratewareHtml, /rateware-select-issue-rows/, "Rateware spreadsheet should select visible rows with validation issues");
assert.match(stagingReviewSource, /function focusNextVisibleIssue/, "Staging should focus the next visible validation issue");
assert.match(ratewareSource, /function focusNextVisibleIssue/, "Rateware should focus the next visible validation issue");
assert.match(stagingReviewSource, /rowsWithCriticalValidation\(rows\)/, "Staging bulk save should warn before saving selected rows with critical validation issues");
assert.match(ratewareSource, /rowsWithCriticalValidation\(rows\)/, "Rateware bulk save should warn before saving selected rows with critical validation issues");
assert.match(stylesSource, /sheet-issue-nav/, "Spreadsheet issue navigator should have compact styling");
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
assert.match(rfxEventsSource, /function confirmBidRoomBulkAction/, "Bid Room should require human confirmation for shortlist and participant bulk actions");
assert.match(rfxEventsSource, /confirmBidRoomBulkAction\("auto_shortlist", ids\)/, "Bid Room should confirm before auto-shortlisting selected lanes");
assert.match(rfxEventsSource, /confirmBidRoomBulkAction\("mark_invited", ids\)/, "Bid Room should confirm before marking selected participants invited");
assert.match(rfxEventsSource, /confirmBidRoomBulkAction\("archive_participants", ids\)/, "Bid Room should confirm before archiving selected participants");
assert.match(rfxEventsSource, /function eventLifecycleRiskSummary/, "Bid Room event lifecycle actions should summarize event risk before changes");
assert.match(rfxEventsSource, /function confirmEventLifecycleAction/, "Bid Room event lifecycle actions should use a shared confirmation guard");
assert.match(rfxEventsSource, /confirmEventLifecycleAction\("open"\)/, "Bid Room should confirm before opening an event");
assert.match(rfxEventsSource, /confirmEventLifecycleAction\("close"\)/, "Bid Room should confirm before closing an event");
assert.match(rfxEventsSource, /confirmEventLifecycleAction\("duplicate"\)/, "Bid Room should confirm before duplicating an event");
assert.match(rfxEventsSource, /confirmEventLifecycleAction\("archive"\)/, "Bid Room should confirm before archiving an event");
assert.match(rfxEventsSource, /confirmEventLifecycleAction\("delete"\)/, "Bid Room should require typed confirmation before deleting an event");
assert.match(rfxEventsSource, /window\.prompt\(`Type "\$\{label\}" to delete/, "Bid Room event delete should require typing the RFx label");
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
assert.match(rfxEventsSource, /function confirmDraftQueueAction/, "Bid Room draft queue should require human confirmation for bulk queue actions");
assert.match(rfxEventsSource, /confirmDraftQueueAction\("send", ids\)/, "Bid Room should confirm before sending selected draft emails");
assert.match(rfxEventsSource, /confirmDraftQueueAction\("archive", ids\)/, "Bid Room should confirm before archiving selected draft rows");
assert.match(rfxEventsHtml, /rfx-launch-readiness/, "Bid Room should render a launch readiness QA panel");
assert.match(rfxEventsSource, /function bidRoomReadinessSnapshot/, "Bid Room should calculate end-to-end readiness blockers");
assert.match(rfxEventsSource, /function renderBidRoomLaunchReadiness/, "Bid Room should render readiness checks from live event state");
assert.match(rfxEventsSource, /function readinessReportLines/, "Bid Room should produce a copyable launch QA report");
assert.match(rfxEventsSource, /function bidRoomWorkflowProgress/, "Bid Room should calculate a unified RFx to award workflow progress");
assert.match(rfxEventsSource, /Command center/, "Bid Room should expose one primary command center instead of fragmented RFx and outreach controls");
assert.match(rfxEventsHtml, /One workflow: event setup, lane book, participants, outreach, auction, award/, "Bid Room should describe RFx, Outreach, Auction, and Award as one workflow");
assert.match(stylesSource, /bid-room-workflow-meter/, "Bid Room should render a compact workflow progress meter");
assert.match(rfxEventsSource, /data-rfx-readiness-first-issue/, "Bid Room readiness QA should navigate to the first blocker");
assert.match(rfxEventsSource, /data-rfx-copy-readiness/, "Bid Room readiness QA should copy a report for debugging");
assert.match(rfxEventsSource, /function launchPreflightIssues/, "Bid Room should classify launch-blocking readiness issues");
assert.match(rfxEventsSource, /function blockIfLaunchPreflightFails/, "Bid Room should block invitation launch when required readiness checks fail");
assert.match(rfxEventsSource, /blockIfLaunchPreflightFails\(statusElement\)/, "Bid Room draft generation should run launch preflight before creating campaigns");
assert.match(rfxEventsSource, /No targets have usable/, "Bid Room contactability should block launch when no selected target can be contacted");
assert.match(stylesSource, /bid-room-readiness-grid/, "Bid Room readiness QA should have compact operational styling");
assert.match(bidVisibilityMigration, /bid_visibility_mode text not null default 'anonymous_rank'/, "RFx events should store a per-event Bid Room visibility mode");
assert.match(bidVisibilityMigration, /open_leaderboard/, "Bid Room visibility should support open leaderboard events");
assert.match(rfxEventsHtml, /rfx-bid-visibility/, "Bid Room setup should expose visibility mode selection");
assert.match(rfxEventsSource, /bid_visibility_mode: rfxBidVisibilityInput/, "Bid Room should save visibility mode from the setup form");
assert.match(apiSource, /"private", "anonymous_rank", "open_leaderboard"/, "API should validate Bid Room visibility modes");
assert.match(rfxBidApiSource, /competitor_names_visible: normalizedMode === "open_leaderboard"/, "Carrier portal should reveal competitor names only in open leaderboard mode");
assert.match(rfxBidSource, /Open leaderboard - competitor names and exact submitted rates are visible/, "Carrier portal should explain open leaderboard visibility");
assert.match(bidRoomBoardHtml, /Live Bid Room Board/, "Public Bid Room board page should exist");
assert.match(rfxEventsHtml, /bid-room-board\.html/, "Internal Bid Room should link to the public board");
assert.match(bidRoomBoardHtml, /data-board-view="pipeline"/, "Public Bid Room board should support pipeline view");
assert.match(bidRoomBoardHtml, /data-board-view="sheet"/, "Public Bid Room board should support spreadsheet view");
assert.match(bidRoomBoardSource, /public_bid_room_board/, "Public Bid Room board should call the public board action");
assert.match(bidRoomBoardSource, /Quote Available/, "Public Bid Room board should announce new quotes in English");
assert.match(bidRoomBoardSource, /Cotización disponible/, "Public Bid Room board should announce new quotes in Spanish");
assert.match(bidRoomBoardSource, /Your offer has been displaced/, "Public Bid Room board should announce ranking displacement");
assert.match(bidRoomBoardSource, /speechSynthesis/, "Public Bid Room board should use browser speech announcements");
assert.match(rfxBidApiSource, /body\.action === "public_bid_room_board"[\s\S]*const token = cleanText\(body\.token\)/, "Public Bid Room board action should be handled before invitation token validation");
const publicBidBoardApiSource = rfxBidApiSource.slice(rfxBidApiSource.indexOf("async function publicBidRoomBoard"), rfxBidApiSource.indexOf("Deno.serve"));
assert.match(publicBidBoardApiSource, /carrier_identity_visible: false/, "Public Bid Room board should hide carrier identity");
assert.doesNotMatch(publicBidBoardApiSource, /vendors\(/, "Public Bid Room board should not join carrier vendor records");
assert.doesNotMatch(publicBidBoardApiSource, /invitation_token/, "Public Bid Room board should not expose invitation tokens");
assert.match(bidRoomChatMigration, /create table if not exists public\.bid_room_chat_threads/, "Bid Room chat should store durable threads");
assert.match(bidRoomChatMigration, /thread_type in \('event_group', 'lane_group', 'carrier_private'\)/, "Bid Room chat should support group, lane, and private threads");
assert.match(bidRoomChatMigration, /google_chat_thread_key/, "Bid Room chat should be ready for Google Chat thread mirroring");
assert.match(apiSource, /post_bid_room_chat_message/, "Internal API should post Bid Room chat messages");
assert.match(rfxBidApiSource, /postCarrierBidRoomChatMessage/, "Carrier portal API should post token-scoped chat messages");
assert.match(rfxEventsHtml, /rfx-chat-thread-type/, "Bid Room should render internal chat controls");
assert.match(rfxEventsHtml, /rfx-chat-command-center/, "Bid Room communications should expose an operational command center");
assert.match(rfxEventsHtml, /data-rfx-chat-filter="unread"/, "Bid Room communications should filter unread threads");
assert.match(rfxEventsHtml, /data-rfx-chat-filter="needs_reply"/, "Bid Room communications should filter threads that need reply");
assert.match(rfxEventsHtml, /data-rfx-chat-filter="signals"/, "Bid Room communications should filter threads with detected signals");
assert.match(rfxEventsHtml, /rfx-chat-signal-queue/, "Bid Room communications should render an intelligence signal queue");
assert.match(rfxEventsSource, /chatOpsSummary/, "Bid Room communications should summarize operational chat state");
assert.match(rfxEventsSource, /threadNeedsReply/, "Bid Room communications should prioritize carrier threads that need reply");
assert.match(rfxEventsSource, /rfxChatCopySummary/, "Bid Room communications should copy a procurement summary");
assert.match(rfxEventsSource, /detectMessageIntent/, "Bid Room communications should detect message intent locally");
assert.match(rfxEventsSource, /suggestedReplyForThread/, "Bid Room communications should draft suggested replies for review");
assert.match(rfxEventsSource, /extractedBidUpdateText/, "Bid Room communications should extract bid update candidates without applying them automatically");
assert.match(rfxEventsSource, /openChatBidUpdateDrawer/, "Bid Room communications should open bid updates for human review");
assert.match(rfxEventsSource, /review_bid_update/, "Bid Room communications should review extracted bid updates before applying");
assert.match(rfxEventsHtml, /rfx-chat-bid-update-drawer/, "Bid Room communications should render a bid update review drawer");
assert.match(rfxServiceSource, /apply_bid_update_from_chat/, "RFx service should expose chat-to-bid updates");
assert.match(apiSource, /applyBidUpdateFromChat/, "API should apply reviewed chat bid updates");
assert.match(apiSource, /bid_room\.chat\.apply_bid_update/, "API should audit reviewed chat bid updates");
assert.match(apiSource, /function strictBidNumber/, "Internal API should expose strict numeric validation for user-entered bid fields");
assert.match(apiSource, /strictBidNumber\(patchInput\.bid_rate, "Bid rate"\)/, "Internal API should validate direct bid edits before updating RFx rows");
assert.match(apiSource, /strictBidNumber\(input\.bid_rate, "All-in rate", \{ required: true \}\)/, "Internal API should validate chat-to-bid rates before applying updates");
assert.match(apiSource, /strictCurrencyCode\(patchInput\.currency\)/, "Internal API should reject invalid bid currency codes");
assert.match(bidRoomChatBidUpdatesMigration, /bid_source_thread_id/, "RFx bid rows should persist the source chat thread");
assert.match(bidRoomChatBidUpdatesMigration, /bid_source_message_id/, "RFx bid rows should persist the source chat message");
assert.match(bidRoomChatBidUpdatesMigration, /bid_updated_from_chat_at/, "RFx bid rows should timestamp chat-applied updates");
assert.match(rfxAwardCloseoutMigration, /award_role text/, "RFx lane vendors should persist primary or backup award roles");
assert.match(rfxAwardCloseoutMigration, /rate_staging_id uuid references public\.rate_staging/, "RFx awards should link to created Rateware rows");
assert.match(rfxAwardCloseoutMigration, /rateware_closeout_at timestamptz/, "RFx awards should timestamp Rateware closeout");
assert.match(apiSource, /async function awardRfxLaneVendor/, "API should save primary and backup RFx award decisions");
assert.match(apiSource, /async function closeoutAwardedRfxToRateware/, "API should convert primary RFx awards into Rateware rows");
assert.match(apiSource, /rfx_award_closeout/, "Rateware rows created from RFx awards should carry closeout source metadata");
assert.match(apiSource, /rfx\.award\.closeout/, "API should audit RFx award closeout");
assert.match(apiSource, /async function generateRfxAwardNotices/, "API should generate RFx award, backup, and not-awarded notice drafts");
assert.match(apiSource, /notice_type: "rfx_award_closeout"/, "RFx award notices should be identifiable in outreach metadata");
assert.match(apiSource, /rfx\.award\.notices\.generate/, "API should audit RFx award notice generation");
assert.match(rfxServiceSource, /award_rfx_lane_vendor/, "RFx service should expose award decisions");
assert.match(rfxServiceSource, /closeout_awarded_rfx_to_rateware/, "RFx service should expose Rateware closeout");
assert.match(rfxServiceSource, /generate_rfx_award_notices/, "RFx service should expose award notice draft generation");
assert.match(rfxEventsHtml, /rfx-award-board/, "Bid Room should render an operational award board");
assert.match(rfxEventsHtml, /rfx-closeout-awards-to-rateware/, "Bid Room should expose Rateware closeout from awards");
assert.match(rfxEventsHtml, /rfx-generate-award-notices/, "Bid Room Step 6 should generate award notice drafts");
assert.match(rfxEventsHtml, /rfx-send-award-notices/, "Bid Room Step 6 should send award notice emails in bulk");
assert.match(rfxEventsHtml, /rfx-apply-recommended-awards/, "Bid Room Step 6 should apply recommended awards in bulk");
assert.match(rfxEventsHtml, /rfx-award-readiness/, "Bid Room Step 6 should show closeout readiness");
assert.match(rfxEventsHtml, /rfx-award-notice-queue/, "Bid Room Step 6 should show the award notice queue");
assert.match(packageJsonSource, /"e2e:bid-room": "node tools\/bid-room-e2e\.mjs"/, "Package scripts should expose the Bid Room production E2E runner");
assert.match(packageJsonSource, /"smoke:integrations": "node tools\/integration-smoke\.mjs"/, "Package scripts should expose the production integration smoke runner");
assert.match(bidRoomE2eSource, /RATEWARE_E2E_KINDE_TOKEN/, "Bid Room E2E should require a real Kinde token for production API calls");
assert.match(bidRoomE2eSource, /create_rfx_event/, "Bid Room E2E should create a real RFx event");
assert.match(bidRoomE2eSource, /import_rfx_lanes/, "Bid Room E2E should load lane book rows");
assert.match(bidRoomE2eSource, /shortlist_rfx_lane_vendors/, "Bid Room E2E should select CRM carriers as participants");
assert.match(bidRoomE2eSource, /generate_outreach_drafts/, "Bid Room E2E should generate invitation drafts");
assert.match(bidRoomE2eSource, /send_outreach_messages/, "Bid Room E2E should cover optional Gmail sending");
assert.match(bidRoomE2eSource, /Refusing to send real Gmail to external recipient/, "Bid Room E2E should block accidental external Gmail sends");
assert.match(bidRoomE2eSource, /carrier\("get_invitation"/, "Bid Room E2E should validate the carrier portal token flow");
assert.match(bidRoomE2eSource, /carrier\("submit_bid"/, "Bid Room E2E should submit a bid through the carrier API");
assert.match(bidRoomE2eSource, /post_bid_room_chat_message/, "Bid Room E2E should exercise Bid Room chat");
assert.match(bidRoomE2eSource, /sync_bid_room_event_thread/, "Bid Room E2E should attempt Google Chat thread sync");
assert.match(bidRoomE2eSource, /award_rfx_lane_vendor/, "Bid Room E2E should award a primary carrier");
assert.match(bidRoomE2eSource, /closeout_awarded_rfx_to_rateware/, "Bid Room E2E should close awarded bids into Rateware");
assert.match(bidRoomE2eSource, /pending_review/, "Bid Room E2E should default closeout to pending review unless explicitly approved");
assert.match(integrationSmokeSource, /Vercel deploy/, "Integration smoke should confirm Vercel deployment");
assert.match(integrationSmokeSource, /Kinde login/, "Integration smoke should confirm Kinde login");
assert.match(integrationSmokeSource, /get_saas_settings/, "Integration smoke should confirm authenticated Supabase API access");
assert.match(integrationSmokeSource, /list_gmail_connections/, "Integration smoke should check Gmail connection status");
assert.match(integrationSmokeSource, /send_outreach_messages/, "Integration smoke should cover real Gmail sending when enabled");
assert.match(integrationSmokeSource, /google-chat-app/, "Integration smoke should hit the Google Chat inbound endpoint");
assert.match(integrationSmokeSource, /list_google_chat_connections/, "Integration smoke should check Google Chat OAuth connection");
assert.match(integrationSmokeSource, /google_chat_sync_status/, "Integration smoke should validate Google Chat outbound sync status");
assert.match(integrationSmokeSource, /google_chat_inbound/, "Integration smoke should validate Google Chat inbound sync status");
assert.match(integrationSmokeSource, /closeout_awarded_rfx_to_rateware/, "Integration smoke should validate Rateware closeout");
assert.match(integrationSmokeSource, /pending_review/, "Integration smoke should default Rateware closeout to pending review");
assert.match(integrationSmokeSource, /Refusing to send real Gmail to external recipient/, "Integration smoke should block accidental external Gmail sends");
assert.match(rfxEventsHtml, /<th>Score<\/th>/, "Bid Room response board should expose procurement decision score");
assert.match(rfxEventsSource, /renderAwardBoard/, "Bid Room should render award decisions by lane");
assert.match(rfxEventsSource, /function validateRfxBidPatch/, "Bid Room should validate internal bid edits before saving");
assert.match(rfxEventsSource, /parseOptionalBidNumber\(patch\[field\], label\)/, "Bid Room should reject non-numeric rate, capacity, or transit edits");
assert.match(rfxEventsSource, /validateRfxBidPatch\(patch\)/, "Bid Room save bid action should use validated numeric fields");
assert.match(rfxEventsSource, /Currency must be a 3-letter code/, "Bid Room should validate bid currency codes before saving");
assert.match(rfxEventsSource, /data-rfx-award-primary/, "Bid Room should allow primary awards per carrier bid");
assert.match(rfxEventsSource, /data-rfx-award-backup/, "Bid Room should allow backup carrier awards");
assert.match(rfxEventsSource, /function procurementDecisionForBid/, "Bid Room should score bids beyond cheapest rate");
assert.match(rfxEventsSource, /decisionBadgesForBid/, "Bid Room should explain decision score with badges");
assert.match(rfxEventsSource, /renderDecisionScorecard/, "Bid Room should render side-by-side decision scorecards");
assert.match(rfxEventsSource, /Best overall score/, "Bid Room award reasons should include best-overall score");
assert.match(rfxEventsSource, /function awardReadinessSnapshot/, "Bid Room should calculate award closeout readiness");
assert.match(rfxEventsSource, /function awardPreflightIssues/, "Bid Room award closeout should classify blocking award readiness issues");
assert.match(rfxEventsSource, /function blockIfAwardPreflightFails/, "Bid Room award closeout should block unsafe Rateware or Gmail actions");
assert.match(rfxEventsSource, /blockIfAwardPreflightFails\("closeout"\)/, "Bid Room should guard Rateware closeout with award preflight checks");
assert.match(rfxEventsSource, /blockIfAwardPreflightFails\("generate_notices"\)/, "Bid Room should guard award notice generation with award preflight checks");
assert.match(rfxEventsSource, /blockIfAwardPreflightFails\("send_notices"\)/, "Bid Room should guard award notice sending with award preflight checks");
assert.match(rfxEventsSource, /function applyRecommendedAwardDecisions/, "Bid Room should save recommended primary awards in bulk");
assert.match(rfxEventsSource, /function renderAwardNoticeQueue/, "Bid Room should render award notice queue from generated drafts");
assert.match(rfxEventsSource, /data-rfx-mark-award-notice/, "Bid Room should update award notice draft status from Step 6");
assert.match(stylesSource, /rfx-decision-scorecards/, "Bid Room decision view should style scorecards");
assert.match(stylesSource, /rfx-decision-badge/, "Bid Room decision view should style badges");
assert.match(stylesSource, /rfx-award-readiness-grid/, "Bid Room award readiness should have compact styling");
assert.match(stylesSource, /rfx-award-notice-queue/, "Bid Room award notice queue should have compact styling");
assert.match(rfxEventsSource, /generateAwardNoticeDrafts/, "Bid Room should generate award notices from Step 6");
assert.match(rfxEventsSource, /sendAwardNoticeDrafts/, "Bid Room should send generated award notices from Step 6");
assert.match(rfxBidApiSource, /award_outcome/, "Carrier portal API should expose award outcome per invitation");
assert.match(rfxBidSource, /renderAwardOutcome/, "Carrier portal should render awarded, backup, and not-awarded outcomes");
assert.match(rfxBidSource, /function awardNextSteps/, "Carrier portal should guide carriers through post-award next steps");
assert.match(rfxBidSource, /function renderCarrierAwardTimeline/, "Carrier portal should render lane-level award closeout context");
assert.match(rfxBidSource, /data-carrier-award-filter/, "Carrier portal award outcome should link into filtered business book views");
assert.match(stylesSource, /carrier-award-next/, "Carrier portal post-award panel should have next-step styling");
assert.match(stylesSource, /carrier-award-timeline/, "Carrier portal post-award panel should have closeout timeline styling");
assert.match(rfxBidSubmissionV2Migration, /commercial_model text/, "RFx bid submission v2 should persist commercial model");
assert.match(rfxBidSubmissionV2Migration, /best_alternative_offered boolean not null default false/, "RFx bid submission v2 should persist best-alternative offers");
assert.match(rfxBidSubmissionV2Migration, /eta_pickup timestamptz/, "RFx bid submission v2 should persist pickup ETA");
assert.match(rfxBidSubmissionV2Migration, /mirror_account_enabled boolean not null default false/, "RFx bid submission v2 should persist mirror account requests");
assert.match(rfxBidApiSource, /normalizeCommercialModel/, "Carrier portal API should normalize commercial model submissions");
assert.match(rfxBidApiSource, /function strictBidNumber/, "Carrier portal API should expose strict numeric validation for submitted bids");
assert.match(rfxBidApiSource, /strictBidNumber\(body\.bid_rate, "Bid rate", \{ required: true \}\)/, "Carrier portal API should reject missing or invalid bid rates");
assert.match(rfxBidApiSource, /strictCommercialSharePercent\(body\.marksman_margin_pct, "Suggested margin to share"\)/, "Carrier portal API should validate cost-plus suggested margin percentages");
assert.match(rfxBidApiSource, /commercialModel === "carrier_share"[\s\S]*strictCommercialSharePercent\(body\.carrier_share_pct, "Carrier invoice share"\)/, "Carrier portal API should validate carrier invoice share percentages only for carrier-share model");
assert.match(rfxBidApiSource, /commercialModel === "direct_cost_plus"[\s\S]*: null/, "Carrier portal API should clear inapplicable commercial percentages by model");
assert.match(rfxBidApiSource, /strictCurrencyCode\(body\.currency\)/, "Carrier portal API should reject invalid currency codes");
assert.match(rfxBidApiSource, /commercial_model: commercialModel/, "Carrier portal API should write normalized commercial model");
assert.match(rfxBidApiSource, /best_alternative_offered: cleanBoolean\(body\.best_alternative_offered\) === true/, "Carrier portal API should write best-alternative flag");
assert.match(rfxBidApiSource, /eta_pickup: cleanTimestamp\(body\.eta_pickup\)/, "Carrier portal API should write pickup ETA");
assert.match(apiSource, /commercial_model = normalizeCommercialModel|patch\.commercial_model = normalizeCommercialModel/, "Internal API should accept commercial model bid updates");
assert.match(rfxBidSource, /bid-commercial-model/, "Carrier portal should render commercial model input");
assert.match(rfxBidSource, /bid-alt-enabled/, "Carrier portal should render best-alternative input");
assert.match(rfxBidSource, /bid-equipment-available/, "Carrier portal should render equipment availability input");
assert.match(rfxBidSource, /bid-eta-pickup/, "Carrier portal should render pickup ETA input");
assert.match(rfxBidSource, /Guided bid flow/, "Carrier portal should present the bid form as a guided workflow");
assert.match(rfxBidSource, /data-bid-section-target="primary"/, "Carrier portal should let carriers jump to primary bid section");
assert.match(rfxBidSource, /data-bid-section-target="alternative"/, "Carrier portal should let carriers add alternative offers");
assert.match(rfxBidSource, /bid-review-summary/, "Carrier portal should render a pre-submit review summary");
assert.match(rfxBidSource, /bid-best-final/, "Carrier portal should support best-and-final confirmation");
assert.match(rfxBidSource, /bid-confirm-review/, "Carrier portal should require capacity and commercial terms confirmation");
assert.match(rfxBidSource, /function bidDraftWarnings/, "Carrier portal should validate bid completeness before submit");
assert.match(rfxBidSource, /function validateBidDraft/, "Carrier portal should block invalid bid submissions before API submit");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.bid_rate, "bid-rate", "All-in rate"\)/, "Carrier portal should require numeric all-in rate");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.weekly_capacity, "bid-capacity", "Weekly capacity"\)/, "Carrier portal should require numeric capacity");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.transit_days, "bid-transit-days", "Transit days"\)/, "Carrier portal should require numeric transit days");
assert.match(rfxBidSource, /function commercialStructureConfig/, "Carrier portal should explain each commercial structure");
assert.match(rfxBidSource, /syncCommercialStructureFields/, "Carrier portal should show only the applicable commercial percentage input");
assert.match(rfxBidSource, /validatePercentIssue\(draft\.marksman_margin_pct, "bid-marksman-margin", "Suggested margin to share %", \{ required: true, procurementRange: true \}\)/, "Carrier portal should enforce suggested margin range for cost-plus");
assert.match(rfxBidSource, /validatePercentIssue\(draft\.carrier_share_pct, "bid-carrier-share", "Carrier invoice share %", \{ required: true, procurementRange: true \}\)/, "Carrier portal should enforce invoice share range for carrier-share");
assert.match(rfxBidSource, /thread_type: "event_group"/, "Carrier portal chat should post only to the event group");
assert.doesNotMatch(rfxBidSource, /<option value="carrier_private">/, "Carrier portal chat should not expose private chat scope");
assert.doesNotMatch(rfxBidSource, /<option value="lane_group">/, "Carrier portal chat should not expose lane chat scope");
assert.match(rfxEventsSource, /const BID_ROOM_EVENT_THREAD_TYPE = "event_group"/, "Internal Bid Room chat should use event group as the only visible compose scope");
assert.doesNotMatch(rfxEventsHtml, /id="rfx-chat-lane"|id="rfx-chat-vendor"|Carrier private|Lane group/, "Internal Bid Room chat should not expose lane or private compose controls");
assert.match(rfxBidSource, /Best alternative needs equipment or a positive unit count/, "Carrier portal should validate alternative offers");
assert.match(rfxBidSource, /Delivery ETA must be after pickup ETA/, "Carrier portal should validate pickup and delivery ETA order");
assert.match(rfxBidSource, /focusBidValidationField/, "Carrier portal should focus the first invalid field");
assert.match(rfxBidSource, /clearBidValidationState/, "Carrier portal should clear invalid field markers as the carrier edits");
assert.match(rfxBidSource, /function updateBidReviewSummary/, "Carrier portal should update the review summary as carriers edit");
assert.match(rfxBidSource, /function renderBidHistory/, "Carrier portal should render offer revision history");
assert.match(rfxBidSource, /carrier-bid-history/, "Carrier portal should include offer history in the bid room");
assert.match(stylesSource, /carrier-bid-workflow/, "Carrier portal guided bid flow should have compact navigation styling");
assert.match(stylesSource, /bid-review-summary-grid/, "Carrier portal review summary should have card styling");
assert.match(stylesSource, /bid-form \[aria-invalid="true"\]/, "Carrier portal should highlight invalid bid fields inline");
assert.match(stylesSource, /carrier-bid-history-list/, "Carrier portal offer history should have compact timeline styling");
assert.match(rfxBidApiSource, /function liveBoardRowScore/, "Carrier portal API should score bids for the live capacity marketplace");
assert.match(rfxBidApiSource, /marketplace_score/, "Carrier portal API should expose marketplace score");
assert.match(rfxBidApiSource, /score_bucket/, "Carrier portal API should expose marketplace score buckets");
assert.match(rfxBidApiSource, /price_signal/, "Carrier portal API should explain marketplace price signals");
assert.match(rfxBidApiSource, /bid_history: bidHistory/, "Carrier portal API should return lane-specific bid revision history");
assert.match(rfxBidApiSource, /revision_type: revisionType/, "Carrier portal API should classify initial, revision, and best-final bids");
assert.match(rfxBidSource, /function marketplaceBucketLabel/, "Carrier portal should label marketplace score buckets");
assert.match(rfxBidSource, /marketplaceBadgesHtml/, "Carrier portal should render marketplace score signals");
assert.match(stylesSource, /marketplace-score-pill/, "Carrier portal marketplace score should have compact styling");
assert.match(stylesSource, /marketplace-badge/, "Carrier portal marketplace signals should have compact badges");
assert.match(rfxEventsSource, /offerCommercialSummary/, "Internal Bid Room should display commercial offer summaries");
assert.match(rfxEventsSource, /offerAvailabilitySummary/, "Internal Bid Room should display availability summaries");
assert.match(rfxEventsSource, /AI proposes, user confirms/, "Bid Room communications should keep bid updates confirm-first");
assert.match(rfxEventsSource, /updateBidRoomChatThread/, "Bid Room communications should update thread actions from the UI");
assert.match(rfxServiceSource, /update_bid_room_chat_thread/, "RFx service should expose Bid Room thread actions");
assert.match(apiSource, /updateBidRoomChatThreadAction/, "API should persist Bid Room communication actions");
assert.match(apiSource, /bid_room\.chat\.thread_action/, "API should audit Bid Room communication actions");
assert.match(bidRoomCommunicationActionsMigration, /communication_status text not null default 'open'/, "Bid Room chat threads should persist communication status");
assert.match(bidRoomCommunicationActionsMigration, /needs_reply boolean not null default false/, "Bid Room chat threads should persist needs-reply state");
assert.match(bidRoomCommunicationActionsMigration, /read_status text not null default 'read'/, "Bid Room chat threads should persist read/unread state");
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
assert.match(settingsHtml, /data-workbench-view-button="observability"/, "Settings should expose an Observability tab for integration and API incidents");
assert.match(settingsHtml, /observability-log-body/, "Settings should render a visible operational log table");
assert.match(settingsSource, /fetchObservabilityEvents/, "Settings should load operational logs from Rateware API");
assert.match(settingsServiceSource, /list_observability_events/, "Settings service should call the observability endpoint");
assert.match(apiSource, /buildObservabilityEvents/, "Rateware API should aggregate operational logs into one observability response");
for (const tableName of ["saas_audit_log", "outreach_messages", "gmail_mailbox_connections", "google_chat_connections", "bid_room_chat_messages", "bid_room_chat_threads"]) {
  assert.match(apiSource, new RegExp(`\\.from\\("${tableName}"\\)`), `Observability should read ${tableName}`);
}
assert.match(apiSource, /"api\.error"/, "Rateware API should audit unhandled endpoint failures");
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
assert.match(apiSource, /function normalizeBulkIds/, "API should normalize and validate bulk id lists before updates");
assert.match(apiSource, /function requireBulkConfirmation/, "API should require explicit backend confirmation for risky bulk actions");
assert.match(apiSource, /function requirePreviewCountForFilteredBulk/, "API should require dry-run preview counts before large filtered bulk actions");
assert.match(apiSource, /BULK_SEND_LIMIT = 100/, "API should cap direct Gmail send batches");
assert.match(apiSource, /BULK_FILTER_CONFIRM_THRESHOLD = 250/, "API should require confirmation for large filtered database actions");
const bulkActionSource = apiSource.slice(apiSource.indexOf('if (body.action === "bulk_rate_rows_by_filter")'));
assert.ok(bulkActionSource.length > 100, "bulk filtered action block should be present");
assert.doesNotMatch(
  bulkActionSource,
  /fetchBulkRateRowsByFilter/,
  "filtered bulk actions should not use Edge Function row scans"
);
assert.match(
  bulkActionSource,
  /normalizeBulkMaxRows\(body\.max_rows\)/,
  "filtered bulk archive/remove should allow large database-scoped operations"
);
assert.match(
  bulkActionSource,
  /requirePreviewCountForFilteredBulk/,
  "filtered bulk archive/remove should require confirmed dry-run preview before changing rows"
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
  /normalizeBulkMaxRows\(body\.max_rows\)/,
  "filtered bulk updates should support large database-scoped operations"
);
assert.match(
  filteredUpdateSource,
  /requirePreviewCountForFilteredBulk/,
  "filtered bulk updates should require confirmed dry-run preview before changing rows"
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
const templateLocationScopeSource = apiSource.slice(apiSource.indexOf("function templateLocationScope"), apiSource.indexOf("async function fetchScopedTemplateLocations"));
assert.match(apiSource, /function profileExplicitCountry/, "API location matching should derive one explicit country guard");
assert.match(interpretUploadSource, /function profileExplicitCountry/, "Interpretation matching should derive one explicit country guard");
assert.match(apiSource, /if \(explicitCountry\) return country === explicitCountry;/, "API location matching should reject blank or wrong-country candidates when text is explicit");
assert.match(interpretUploadSource, /if \(explicitCountry\) return country === explicitCountry;/, "Interpretation matching should reject blank or wrong-country candidates when text is explicit");
assert.match(apiSource, /if \(state === "CU"\) return "CO";/, "API location matching should treat CU and CO as Coahuila aliases");
assert.match(interpretUploadSource, /if \(state === "CU"\) return "CO";/, "Interpretation matching should treat CU and CO as Coahuila aliases");
assert.match(apiLocationMatchSource, /if \(!locationMatchesProfile\(location, profile\)\) continue;/, "API location matching should reject country-incompatible candidates");
assert.match(interpretLocationMatchSource, /if \(!locationMatchesProfile\(location, profile\)\) continue;/, "Interpretation location matching should reject country-incompatible candidates");
assert.match(apiLocationMatchSource, /locationZipPrefixMatches\(profile, zipPrefix\)/, "API location matching should use token-safe ZIP prefix matching");
assert.match(interpretLocationMatchSource, /locationZipPrefixMatches\(profile, zipPrefix\)/, "Interpretation location matching should use token-safe ZIP prefix matching");
assert.doesNotMatch(apiLocationMatchSource, /lookup\.includes\(zipPrefix\)/, "API location matching should not treat ZIP prefixes as arbitrary substrings");
assert.doesNotMatch(interpretLocationMatchSource, /lookup\.includes\(zipPrefix\)/, "Interpretation location matching should not treat ZIP prefixes as arbitrary substrings");
assert.match(templateLocationScopeSource, /zipPrefixes\.add\(numericPostal\)/, "structured import should fetch full MX postal aliases as well as prefixes");
assert.match(templateLocationScopeSource, /zipPrefixes\.add\(numericPostal\.slice\(0, 3\)\)/, "structured import should still fetch US\/CA three-digit prefix aliases");
assert.match(locationMatchDrawerSource, /function zipPrefixMatchesText/, "location drawer should explain matches with token-safe ZIP prefix checks");
assert.match(locationMatchDrawerSource, /optionCountry && optionCountry !== country\) return null;/, "location drawer should hide wrong-country candidates when text is explicit");
assert.doesNotMatch(locationMatchDrawerSource, /lookup\.includes\(lookupKey\(option\.zip_prefix\)\)/, "location drawer should not score ZIP prefixes by substring");
assert.match(catalogWorkbenchSource, /function zipPrefixMatchesTokens/, "catalog workbench should score ZIP prefixes by token or leading prefix");
assert.match(catalogWorkbenchSource, /optionCountry && optionCountry !== inferredCountry\) return null;/, "catalog workbench candidates should respect inferred country");
assert.match(sheetUiSource, /function zipPrefixMatchesQuery/, "spreadsheet autocomplete should protect ZIP prefix matching");
assert.match(sheetUiSource, /!isZipLikeField\(field\) \|\| zipPrefixMatchesQuery\(query, field\)/, "spreadsheet autocomplete should not match ZIP prefixes by arbitrary substring");
for (const locationAlias of [
  "Ramos Arizpe, CU 25900",
  "Escobedo, NL 66050",
  "Monterrey, NL 64000",
  "Acuna, CU 26220",
  "Hermosillo, SO 83200",
  "San Luis Potosi, SL 79255"
]) {
  assert.match(laneLocationAliasesMigration, new RegExp(locationAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${locationAlias} should be protected by manual MX catalog aliases`);
}
assert.match(laneLocationAliasesMigration, /rateware_locations_country_state_active_idx/, "lane normalization should have country/state lookup support");
for (const locationAlias of [
  "Apodaca, NL 66600",
  "Lerma, MX 52000",
  "Toluca, MX 50000",
  "Dallas, TX 75000",
  "Laredo, TX 78000",
  "Nuevo Laredo, TM 88000"
]) {
  assert.match(laneLocationCountryZipGuardsMigration, new RegExp(locationAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${locationAlias} should be protected by country/ZIP catalog guards`);
}
assert.match(laneLocationCountryZipGuardsMigration, /rateware_locations_country_zip_active_idx/, "lane normalization should have country/ZIP lookup support");
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
const listVendorsSource = apiSource.slice(apiSource.indexOf('if (body.action === "list_vendors")'), apiSource.indexOf('if (body.action === "vendor_intelligence")'));
assert.ok(listVendorsSource.length > 100, "list vendors block should be present");
assert.match(listVendorsSource, /fetchVendorRateMetricsSafe/, "Carrier CRM directory should enrich vendors with quote metrics");
assert.match(listVendorsSource, /buildVendorIntelligenceRows\(rows, metricsResult\.metrics\)/, "Carrier CRM directory should share the Vendor Intelligence scoring model");
assert.match(listVendorsSource, /const lightweight =/, "Carrier CRM vendor list should support lightweight selector loading");
assert.match(listVendorsSource, /if \(!lightweight && rows\.length\)/, "Bid Room carrier selector should be able to skip heavy CRM metric enrichment");
assert.match(listVendorsSource, /return jsonResponse\(\{ rows: enrichedRows[\s\S]*warnings/, "Carrier CRM directory should surface partial metric warnings");
assert.match(apiSource, /logo_url: cleanText\(vendor\.logo_url\)/, "Vendor intelligence rows should keep uploaded logo URLs");
assert.match(apiSource, /profile_data: typeof vendor\.profile_data/, "Vendor intelligence rows should keep structured profile data");
assert.match(vendorsSource, /key: "health"/, "Carrier CRM spreadsheet should include a health column");
assert.match(vendorsSource, /key: "quotes"/, "Carrier CRM spreadsheet should include a quotes column");
assert.match(vendorsSource, /key: "coverage_delta"/, "Carrier CRM spreadsheet should include a coverage fit column");
assert.match(vendorsSource, /function renderDrawerRatewareEvidence/, "Vendor drawer should explain Rateware evidence");
assert.match(vendorsHtml, /drawer-rateware-evidence/, "Vendor drawer should have a Rateware evidence section");
assert.match(vendorSegmentsCoverageMigration, /coverage_filter text/, "Vendor saved lists should persist a coverage filter");
assert.match(apiSource, /coverage_filter: coverageFilter/, "Vendor segment API should persist coverage filters");
assert.match(vendorsSource, /segment\.coverage_filter/, "Vendor saved lists should apply coverage filters in the UI");
assert.match(vendorProfileRequestsMigration, /create table if not exists public\.vendor_profile_requests/, "Carrier profile requests should have a token table");
assert.match(vendorProfileRequestsMigration, /request_token text not null/, "Carrier profile requests should store a secure request token");
assert.match(apiSource, /body\.action === "create_vendor_profile_request"/, "Carrier CRM should create carrier profile request tokens");
assert.match(vendorServiceSource, /createVendorProfileRequest/, "Vendor service should expose profile request creation");
assert.match(vendorServiceSource, /lightweight = false/, "Vendor service should expose lightweight CRM loading for Bid Room selectors");
assert.match(vendorsSource, /fetchVendors\(\{[\s\S]*lightweight: true,[\s\S]*limit: vendorPageSize/, "Carrier CRM directory should load vendors through the lightweight path");
const vendorFunnelMoveSource = vendorsSource.slice(vendorsSource.indexOf("async function moveVendorFunnelStage"), vendorsSource.indexOf("function setVendorFunnelBulkBusy"));
assert.match(vendorFunnelMoveSource, /applyVendorUpdateToFunnel/, "Vendor Pipeline stage moves should update the kanban locally");
assert.doesNotMatch(vendorFunnelMoveSource, /loadVendorFunnel\(/, "Vendor Pipeline stage moves should not reload the whole funnel");
const vendorDrawerSaveSource = vendorsSource.slice(vendorsSource.indexOf("drawerEditForm.addEventListener"), vendorsSource.indexOf("drawerArchiveButton.addEventListener"));
assert.match(vendorDrawerSaveSource, /applyVendorUpdateToFunnel/, "Vendor drawer saves should refresh funnel cards from local state");
assert.doesNotMatch(vendorDrawerSaveSource, /loadVendors\(/, "Vendor drawer saves should not reload the whole Carrier CRM directory");
assert.match(rfxEventsSource, /fetchVendors\(\{ limit: pageSize, offset, view: "all", lightweight: true \}\)/, "Bid Room should load CRM carriers through the lightweight vendor path");
assert.match(rfxEventsSource, /Carrier CRM partially loaded/, "Bid Room should keep partial CRM carrier results when a later page fails");
assert.match(vendorsSource, /data-copy-profile-link/, "Vendor drawer should expose profile link creation");
assert.match(carrierProfileHtml, /carrier-profile\.js/, "Carrier profile page should load the public profile script");
assert.match(carrierProfileHtml, /carrier-profile-eyebrow/, "Carrier profile page header should be translatable");
assert.match(carrierProfileSource, /carrier-profile-api/, "Carrier profile page should call the public profile API");
assert.match(carrierProfileSource, /submit_profile/, "Carrier profile page should submit profile data");
assert.match(carrierProfileSource, /LANGUAGE_KEY/, "Carrier profile should persist the selected language");
assert.match(carrierProfileSource, /data-language-toggle/, "Carrier profile should expose an English/Spanish language switch");
assert.match(carrierProfileSource, /carrier-profile-stepper/, "Carrier profile should use a guided stepper instead of one long form");
assert.match(carrierProfileSource, /requiredMissing/, "Carrier profile should validate required fields before submit");
assert.match(carrierProfileSource, /response_language: currentLanguage/, "Carrier profile submissions should record the response language");
assert.match(stylesSource, /carrier-profile-stepper/, "Carrier profile stepper should have dedicated UI styling");
assert.match(stylesSource, /profile-progress-track/, "Carrier profile should show a completion progress bar");
assert.match(carrierProfileApiSource, /Deno\.serve/, "Carrier profile API should be an Edge Function");
assert.match(carrierProfileApiSource, /get_profile/, "Carrier profile API should expose token-scoped profile loading");
assert.match(carrierProfileApiSource, /submit_profile/, "Carrier profile API should expose token-scoped profile submission");
assert.doesNotMatch(carrierProfileApiSource, /requireKindeUser/, "Carrier profile API should not require Kinde for token-scoped access");

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
