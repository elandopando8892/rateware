import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const apiSource = readFileSync(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url), "utf8");
const interpretUploadSource = readFileSync(new URL("../supabase/functions/interpret-upload/index.ts", import.meta.url), "utf8");
const uploadHistorySource = readFileSync(new URL("../src/upload-history.js", import.meta.url), "utf8");
const uploadCenterSource = readFileSync(new URL("../src/upload-center.js", import.meta.url), "utf8");
const uploadServiceSource = readFileSync(new URL("../src/upload-service.js", import.meta.url), "utf8");
const uploadHistoryHtml = readFileSync(new URL("../upload-history.html", import.meta.url), "utf8");
const uploadCenterHtml = readFileSync(new URL("../upload-center.html", import.meta.url), "utf8");
const appHtml = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const businessIntelligenceSource = readFileSync(new URL("../src/business-intelligence.js", import.meta.url), "utf8");
const businessIntelligenceHtml = readFileSync(new URL("../business-intelligence.html", import.meta.url), "utf8");
const bulkImportTemplateSource = readFileSync(new URL("../src/bulk-import-template.js", import.meta.url), "utf8");
const stagingReviewSource = readFileSync(new URL("../src/staging-review.js", import.meta.url), "utf8");
const ratewareSource = readFileSync(new URL("../src/rateware.js", import.meta.url), "utf8");
const spreadsheetGridSource = readFileSync(new URL("../src/spreadsheet-grid.js", import.meta.url), "utf8");
const spreadsheetColumnFiltersSource = readFileSync(new URL("../src/spreadsheet-column-filters.js", import.meta.url), "utf8");
const sheetUiSource = readFileSync(new URL("../src/sheet-ui.js", import.meta.url), "utf8");
const catalogWorkbenchSource = readFileSync(new URL("../src/catalog-workbench.js", import.meta.url), "utf8");
const catalogServiceSource = readFileSync(new URL("../src/catalog-service.js", import.meta.url), "utf8");
const locationMatchDrawerSource = readFileSync(new URL("../src/location-match-drawer.js", import.meta.url), "utf8");
const stagingReviewHtml = readFileSync(new URL("../staging-review.html", import.meta.url), "utf8");
const ratewareHtml = readFileSync(new URL("../rateware.html", import.meta.url), "utf8");
const vendorsSource = readFileSync(new URL("../src/vendors.js", import.meta.url), "utf8");
const vendorsHtml = readFileSync(new URL("../vendors.html", import.meta.url), "utf8");
const vendorServiceSource = readFileSync(new URL("../src/vendor-service.js", import.meta.url), "utf8");
const vendorSupportSource = readFileSync(new URL("../src/vendor-support.js", import.meta.url), "utf8");
const vendorSupportServiceSource = readFileSync(new URL("../src/vendor-support-service.js", import.meta.url), "utf8");
const vendorSupportHtml = readFileSync(new URL("../vendor-support.html", import.meta.url), "utf8");
const vendorImprovementSource = readFileSync(new URL("../src/vendor-improvement.js", import.meta.url), "utf8");
const vendorImprovementServiceSource = readFileSync(new URL("../src/vendor-improvement-service.js", import.meta.url), "utf8");
const vendorImprovementHtml = readFileSync(new URL("../vendor-improvement.html", import.meta.url), "utf8");
const shippersSource = readFileSync(new URL("../src/shippers.js", import.meta.url), "utf8");
const carrierProfileSource = readFileSync(new URL("../src/carrier-profile.js", import.meta.url), "utf8");
const carrierProfileHtml = readFileSync(new URL("../carrier-profile.html", import.meta.url), "utf8");
const catalogWorkbenchHtml = readFileSync(new URL("../catalog-workbench.html", import.meta.url), "utf8");
const interpretationMemoryHtml = readFileSync(new URL("../interpretation-memory.html", import.meta.url), "utf8");
const carrierProfileApiSource = readFileSync(new URL("../supabase/functions/carrier-profile-api/index.ts", import.meta.url), "utf8");
const rfxEventsSource = readFileSync(new URL("../src/rfx-events.js", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
const rfxEventsHtml = readFileSync(new URL("../rfx-events.html", import.meta.url), "utf8");
const rfxProcessSource = readFileSync(new URL("../src/rfx-process.js", import.meta.url), "utf8");
const rfxProcessServiceSource = readFileSync(new URL("../src/rfx-process-service.js", import.meta.url), "utf8");
const rfxProcessHtml = readFileSync(new URL("../rfx-process.html", import.meta.url), "utf8");
const customerRfiSource = readFileSync(new URL("../src/customer-rfi.js", import.meta.url), "utf8");
const customerRfiServiceSource = readFileSync(new URL("../src/customer-rfi-service.js", import.meta.url), "utf8");
const customerRfiHtml = readFileSync(new URL("../customer-rfi.html", import.meta.url), "utf8");
const rfxBidSource = readFileSync(new URL("../src/rfx-bid.js", import.meta.url), "utf8");
const rfxBidApiSource = readFileSync(new URL("../supabase/functions/rfx-bid-api/index.ts", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../src/auth.js", import.meta.url), "utf8");
const ratewareApiClientSource = readFileSync(new URL("../src/rateware-api.js", import.meta.url), "utf8");
const errorCopySource = readFileSync(new URL("../src/error-copy.js", import.meta.url), "utf8");
const bidRoomBoardSource = readFileSync(new URL("../src/bid-room-board.js", import.meta.url), "utf8");
const bidRoomBoardHtml = readFileSync(new URL("../bid-room-board.html", import.meta.url), "utf8");
const bidRoomE2eSource = readFileSync(new URL("../tools/bid-room-e2e.mjs", import.meta.url), "utf8");
const integrationSmokeSource = readFileSync(new URL("../tools/integration-smoke.mjs", import.meta.url), "utf8");
const whatsappEnvCheckSource = readFileSync(new URL("../tools/whatsapp-env-check.mjs", import.meta.url), "utf8");
const packageJsonSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const readmeSource = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const gmailOauthCallbackSource = readFileSync(new URL("../supabase/functions/gmail-oauth-callback/index.ts", import.meta.url), "utf8");
const googleChatAppSource = readFileSync(new URL("../supabase/functions/google-chat-app/index.ts", import.meta.url), "utf8");
const rfxServiceSource = readFileSync(new URL("../src/rfx-service.js", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/settings.js", import.meta.url), "utf8");
const settingsServiceSource = readFileSync(new URL("../src/settings-service.js", import.meta.url), "utf8");
const settingsHtml = readFileSync(new URL("../settings.html", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const outreachSource = readFileSync(new URL("../src/outreach.js", import.meta.url), "utf8");
const outreachServiceSource = readFileSync(new URL("../src/outreach-service.js", import.meta.url), "utf8");
const ratewareServiceSource = readFileSync(new URL("../src/rateware-service.js", import.meta.url), "utf8");
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
const rfxBidRatewareCaptureMigration = readFileSync(new URL("../supabase/migrations/20260708162000_rfx_bid_rateware_capture.sql", import.meta.url), "utf8");
const rfxBidValidityMigration = readFileSync(new URL("../supabase/migrations/20260708170000_rfx_bid_validity.sql", import.meta.url), "utf8");
const rfxBidDeadheadMigration = readFileSync(new URL("../supabase/migrations/20260709090000_rfx_bid_deadhead_commitment.sql", import.meta.url), "utf8");
const rfxBidWithdrawnStatusMigration = readFileSync(new URL("../supabase/migrations/20260710183000_rfx_bid_withdrawn_status.sql", import.meta.url), "utf8");
const emailBounceSuppressionMigration = readFileSync(new URL("../supabase/migrations/20260709103000_email_bounce_suppression.sql", import.meta.url), "utf8");
const vendorContinuousImprovementMigration = readFileSync(new URL("../supabase/migrations/20260710100000_vendor_continuous_improvement.sql", import.meta.url), "utf8");
const rfxProcessMigration = readFileSync(new URL("../supabase/migrations/20260710120000_rfx_process.sql", import.meta.url), "utf8");
const vendorSegmentsCoverageMigration = readFileSync(new URL("../supabase/migrations/20260706143000_vendor_segments_coverage_filter.sql", import.meta.url), "utf8");
const vendorProfileRequestsMigration = readFileSync(new URL("../supabase/migrations/20260706152000_vendor_profile_requests.sql", import.meta.url), "utf8");
const rfxLaneDetailSectionsMigration = readFileSync(new URL("../supabase/migrations/20260707170000_rfx_lane_detail_sections.sql", import.meta.url), "utf8");
const rfxDefaultTemplateMigration = readFileSync(new URL("../supabase/migrations/20260708093000_enrich_rfx_default_invitation_template.sql", import.meta.url), "utf8");
const rfxBilingualTemplateMigration = readFileSync(new URL("../supabase/migrations/20260708101500_simplify_bilingual_rfx_invitation_templates.sql", import.meta.url), "utf8");
const rfxSpanishTemplateNameMigration = readFileSync(new URL("../supabase/migrations/20260708103000_normalize_spanish_template_name.sql", import.meta.url), "utf8");
const rfxTemplateSignatureMigration = readFileSync(new URL("../supabase/migrations/20260708110000_add_marksman_signature_to_rfx_templates.sql", import.meta.url), "utf8");
const rfxTemplateSignatureImageMigration = readFileSync(new URL("../supabase/migrations/20260708112500_add_signature_image_to_rfx_templates.sql", import.meta.url), "utf8");
const rfxTemplateProfileLinkMigration = readFileSync(new URL("../supabase/migrations/20260708123000_add_profile_update_link_to_rfx_templates.sql", import.meta.url), "utf8");
const vendorSupportMigration = readFileSync(new URL("../supabase/migrations/20260708143000_vendor_support_tickets.sql", import.meta.url), "utf8");
const whatsappBusinessMigration = readFileSync(new URL("../supabase/migrations/20260710133000_whatsapp_business_integration.sql", import.meta.url), "utf8");
const whatsappWorkspaceMigration = readFileSync(new URL("../supabase/migrations/20260710190000_whatsapp_workspace_connections.sql", import.meta.url), "utf8");
const whatsappTenantAppMigration = readFileSync(new URL("../supabase/migrations/20260711190000_whatsapp_tenant_app_credentials.sql", import.meta.url), "utf8");
const whatsappTemplateMappingMigration = readFileSync(new URL("../supabase/migrations/20260711203000_whatsapp_outreach_template_mappings.sql", import.meta.url), "utf8");
const outreachDeliveryIdempotencyMigration = readFileSync(new URL("../supabase/migrations/20260722210449_outreach_delivery_idempotency.sql", import.meta.url), "utf8");
const outreachDeliveryTraceMigration = readFileSync(new URL("../supabase/migrations/20260723002150_outreach_delivery_trace.sql", import.meta.url), "utf8");
const whatsappWebhookSource = readFileSync(new URL("../supabase/functions/whatsapp-webhook/index.ts", import.meta.url), "utf8");
const whatsappWebhookRoutingMigration = readFileSync(new URL("../supabase/migrations/20260723005859_whatsapp_webhook_routing_indexes.sql", import.meta.url), "utf8");
const workspaceRateScopeMigration = readFileSync(new URL("../supabase/migrations/20260722120000_scope_uploads_and_rates_by_workspace.sql", import.meta.url), "utf8");
const rfxInvitationTableSource = rfxEventsSource.slice(rfxEventsSource.indexOf("function laneTableLabels"), rfxEventsSource.indexOf("function firstOutreachTarget"));
const apiInvitationTableSource = apiSource.slice(apiSource.indexOf("function outreachLaneTableLabels"), apiSource.indexOf("function phoneForWhatsapp"));
const marksmanSignatureAsset = new URL("../assets/marksman-email-signature.png", import.meta.url);

assert.match(vendorsSource, /let vendorDirectoryLoadVersion = 0/, "Carrier CRM should guard against stale directory responses");
assert.match(vendorsSource, /let vendorFunnelLoadVersion = 0/, "Carrier CRM should guard against stale funnel responses");
assert.match(vendorsSource, /let vendorIntelligenceLoadVersion = 0/, "Carrier CRM should guard against stale intelligence responses");
assert.match(vendorsSource, /loadVersion !== vendorDirectoryLoadVersion/, "Carrier directory should ignore stale response rendering");
assert.match(vendorsSource, /loadVersion !== vendorFunnelLoadVersion/, "Procurement funnel should ignore stale response rendering");
assert.match(vendorsSource, /loadVersion !== vendorIntelligenceLoadVersion/, "Vendor intelligence should ignore stale response rendering");
assert.match(rfxEventsSource, /let rfxEventsLoadVersion = 0/, "Bid Room event list should guard against stale responses");
assert.match(rfxEventsSource, /let rfxDetailLoadVersion = 0/, "Bid Room detail should guard against stale event responses");
assert.match(rfxEventsSource, /let bidRoomChatLoadVersion = 0/, "Bid Room chat should guard against stale refreshes");
assert.match(rfxEventsSource, /loadVersion !== rfxDetailLoadVersion \|\| selectedEventId !== eventId/, "Bid Room detail should retain the active event context");
assert.match(rfxEventsSource, /loadVersion !== bidRoomChatLoadVersion \|\| selectedEventId !== eventId/, "Bid Room chat should retain the active event context");
assert.match(rfxEventsSource, /async function refreshOutreachStateForEvent\(eventId\)/, "Bid Room outreach mutations should share one event-scoped refresh guard");
assert.match(rfxEventsSource, /if \(selectedEventId !== eventId\) return false;[\s\S]*contactHistoryRows = historyRows \|\| \[\];[\s\S]*outreachMessages = messageRows \|\| \[\];/, "Bid Room outreach refreshes should discard results after the active event changes");
for (const mutationName of [
  "generateAwardNoticeDrafts",
  "sendAwardNoticeDrafts",
  "sendSelectedDraftEmails",
  "sendSingleDraftEmail",
  "sendSelectedDraftWhatsapp",
  "sendSingleDraftWhatsapp",
  "archiveSelectedDrafts",
  "deleteSelectedDrafts"
]) {
  const start = rfxEventsSource.indexOf(`async function ${mutationName}`);
  const end = rfxEventsSource.indexOf("\nasync function ", start + 1);
  const mutationSource = rfxEventsSource.slice(start, end > start ? end : undefined);
  assert.ok(start >= 0, `${mutationName} should exist`);
  assert.match(mutationSource, /const eventId = selectedEventId;/, `${mutationName} should capture its initiating Bid Room`);
  assert.match(mutationSource, /refreshOutreachStateForEvent\(eventId\)/, `${mutationName} should refresh only its initiating Bid Room`);
  assert.doesNotMatch(mutationSource, /fetchContactHistory\(\{ rfx_event_id: selectedEventId/, `${mutationName} should not query whichever Bid Room happens to be active later`);
}
assert.match(rfxEventsSource, /async function createCurrentOutreachDrafts[\s\S]*const eventId = selectedEventId;[\s\S]*rfx_event_id: eventId[\s\S]*if \(selectedEventId !== eventId\) return result;/, "Draft generation should not reselect or overwrite a different Bid Room after a slow request");
for (const mutationName of [
  "applyRfxAwardDecision",
  "clearRfxAwardDecision",
  "applyRecommendedAwardDecisions",
  "closeoutSelectedAwardsToRateware"
]) {
  const start = rfxEventsSource.indexOf(`async function ${mutationName}`);
  const end = rfxEventsSource.indexOf("\nasync function ", start + 1);
  const mutationSource = rfxEventsSource.slice(start, end > start ? end : undefined);
  assert.ok(start >= 0, `${mutationName} should exist`);
  assert.match(mutationSource, /const eventId = selectedEventId;/, `${mutationName} should capture its initiating Bid Room`);
  assert.match(mutationSource, /selectedEventId !== eventId/, `${mutationName} should stop stale updates after navigation`);
}
for (const listenerName of ["importCarrierTemplateButton"]) {
  const start = rfxEventsSource.indexOf(`${listenerName}?.addEventListener`);
  const end = rfxEventsSource.indexOf("\n\n", start + 1);
  const listenerSource = rfxEventsSource.slice(start, end > start ? end : undefined);
  assert.ok(start >= 0, `${listenerName} handler should exist`);
  assert.match(listenerSource, /const eventId = selectedEventId;/, `${listenerName} should capture its initiating Bid Room`);
  assert.match(listenerSource, /selectedEventId !== eventId/, `${listenerName} should stop stale updates after navigation`);
}
const addParticipantsStart = rfxEventsSource.indexOf("async function addSelectedManualCarriersToBid");
const addParticipantsEnd = rfxEventsSource.indexOf("\nasync function ", addParticipantsStart + 1);
const addParticipantsSource = rfxEventsSource.slice(addParticipantsStart, addParticipantsEnd > addParticipantsStart ? addParticipantsEnd : undefined);
assert.ok(addParticipantsStart >= 0, "Shared Bid Room participant add flow should exist");
assert.match(addParticipantsSource, /const eventId = selectedEventId;/, "Shared participant add flow should capture its initiating Bid Room");
assert.match(addParticipantsSource, /selectedEventId !== eventId/, "Shared participant add flow should stop stale updates after navigation");
assert.match(rfxEventsSource, /manualShortlistButton\?\.addEventListener\("click", async \(\) => \{\s+await addSelectedManualCarriersToBid\(manualShortlistStatus\);/, "Step 3 should use the shared participant add flow");
assert.match(rfxEventsSource, /rfxAddOutreachCarriersButton\?\.addEventListener\("click", async \(\) => \{\s+await addSelectedManualCarriersToBid\(rfxOutreachCarrierStatus\);/, "Step 4 should use the shared participant add flow");
for (const laneImportButton of ["importLanesButton", "importManualLanesButton"]) {
  const start = rfxEventsSource.indexOf(`${laneImportButton}?.addEventListener`);
  const end = rfxEventsSource.indexOf("\n\n", start + 1);
  const handlerSource = rfxEventsSource.slice(start, end > start ? end : undefined);
  assert.ok(start >= 0, `${laneImportButton} handler should exist`);
  assert.match(handlerSource, /const eventId = selectedEventId;/, `${laneImportButton} should capture its initiating Bid Room`);
  assert.match(handlerSource, /importRfxLanes\(eventId, rows\)/, `${laneImportButton} should import into its initiating Bid Room`);
  assert.match(handlerSource, /selectedEventId !== eventId/, `${laneImportButton} should ignore stale results after navigation`);
}
for (const lifecycleButton of ["openRfxButton", "closeRfxButton", "duplicateRfxButton", "archiveRfxButton", "deleteRfxButton"]) {
  const start = rfxEventsSource.indexOf(`${lifecycleButton}?.addEventListener`);
  const end = rfxEventsSource.indexOf("\n\n", start + 1);
  const handlerSource = rfxEventsSource.slice(start, end > start ? end : undefined);
  assert.ok(start >= 0, `${lifecycleButton} handler should exist`);
  assert.match(handlerSource, /const eventId = selectedEventId;/, `${lifecycleButton} should capture its initiating Bid Room`);
  assert.match(handlerSource, /selectedEventId === eventId|selectedEventId !== eventId/, `${lifecycleButton} should not hijack a different Bid Room after navigation`);
}
assert.match(rfxEventsSource, /async function saveRfxLaneEdits[\s\S]*const eventId = selectedEventId;[\s\S]*selectedEventId !== eventId/, "Lane edits should ignore stale responses after navigation");
assert.match(rfxEventsSource, /async function autoShortlistLaneIds[\s\S]*const eventId = selectedEventId;[\s\S]*selectedEventId !== eventId/, "Bulk shortlisting should ignore stale responses after navigation");
assert.match(dashboardSource, /let dashboardLoadVersion = 0/, "Command Center should guard against stale dashboard responses");
assert.match(dashboardSource, /loadVersion !== dashboardLoadVersion/, "Command Center should ignore stale dashboard responses");

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
for (const [label, html] of [
  ["Command Center", appHtml],
  ["Import", uploadCenterHtml],
  ["Source Files", uploadHistoryHtml],
  ["Review Queue", stagingReviewHtml],
  ["Rateware", ratewareHtml],
  ["Analyze", businessIntelligenceHtml],
  ["Carrier CRM", vendorsHtml],
  ["RFx Process", rfxProcessHtml],
  ["Bid Room", rfxEventsHtml],
  ["Vendor Support", vendorSupportHtml],
  ["Settings", settingsHtml],
  ["Learning Rules", interpretationMemoryHtml],
  ["Catalog", catalogWorkbenchHtml]
]) {
  const nav = html.match(/<nav class="nav-groups"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.match(nav, /data-nav-code="CC">Command Center/, `${label} shell should use the modern Command Center nav label`);
  assert.match(nav, /data-nav-code="IM">Import/, `${label} shell should use the modern Import nav label`);
  assert.match(nav, /data-nav-code="SF">Source Files/, `${label} shell should use the modern Source Files nav label`);
  assert.match(nav, /data-nav-code="RQ">Review Queue/, `${label} shell should use the modern Review Queue nav label`);
  assert.match(nav, /data-nav-code="CM">Carrier CRM/, `${label} shell should use the modern Carrier CRM nav label`);
  assert.match(nav, /data-nav-code="RP">RFx Process/, `${label} shell should expose RFx Process before Bid Room`);
  assert.match(nav, /data-nav-code="LR">Learning Rules/, `${label} shell should use the modern Learning Rules nav label`);
  assert.match(nav, /data-nav-code="CT">Catalog/, `${label} shell should use the modern Catalog nav label`);
  assert.doesNotMatch(nav, />Dashboard<|>Upload Center<|>Upload History<|>Staging Review<|>AI Analyst<|>Vendors<|>Memory<|>Catalogs</, `${label} shell should not render legacy nav labels`);
}

for (const table of [
  "rfx_projects",
  "rfx_rfi_magic_links",
  "rfx_rfi_submissions",
  "rfx_rfi_origins",
  "rfx_rfi_destinations",
  "rfx_rfi_lanes",
  "rfx_rfi_business_rules",
  "rfx_rfi_service_requirements",
  "rfx_rfi_carrier_requirements",
  "rfx_rfi_crossborder_details",
  "rfx_rfi_attachments",
  "rfx_rfi_exception_notes",
  "rfx_demand_snapshots",
  "rfx_demand_lanes",
  "rfx_packages",
  "rfx_package_lanes",
  "rfx_award_packages",
  "rfx_award_package_lanes",
  "rfx_process_audit"
]) {
  assert.match(rfxProcessMigration, new RegExp(`create table if not exists public\\.${table}`), `RFx Process migration should create ${table}`);
}
assert.match(rfxProcessMigration, /token_hash text not null unique/, "Customer RFI magic links should store only hashed tokens");
const rfxRecoverableLinkMigration = readFileSync(new URL("../supabase/migrations/20260713220000_rfx_rfi_recoverable_links.sql", import.meta.url), "utf8");
assert.match(rfxRecoverableLinkMigration, /token_encrypted text/, "New Customer RFI links should retain an encrypted token for fixed owner-visible URLs.");
assert.match(rfxProcessMigration, /source_rfx_process_project_id uuid references public\.rfx_projects/, "Bid Room events should link back to RFx Process projects");
assert.doesNotMatch(rfxProcessMigration, /using\s*\(true\)\s*with check\s*\(true\)/i, "RFx Process migration should not expose broad direct table access");
assert.match(apiSource, /list_rfx_process_projects/, "Rateware API should list RFx Process projects");
assert.match(apiSource, /create_rfx_process_project/, "Rateware API should create RFx Process projects");
assert.match(apiSource, /get_rfx_process_project/, "Rateware API should fetch RFx Process detail");
assert.match(apiSource, /update_rfx_process_project/, "Rateware API should update RFx Process status and metadata");
assert.match(apiSource, /create_rfx_rfi_magic_link/, "Rateware API should generate Customer RFI magic links");
assert.match(apiSource, /encryptRfxMagicLinkToken/, "Rateware API should encrypt new Customer RFI tokens for fixed link retrieval.");
assert.match(apiSource, /recoverable: Boolean\(linkUrl\)/, "Rateware API should never expose stored ciphertext and only return a recoverable owner link.");
assert.match(apiSource, /revoke_rfx_rfi_magic_link/, "Rateware API should revoke Customer RFI magic links");
assert.match(apiSource, /reopen_rfx_rfi/, "Rateware API should reopen submitted Customer RFIs");
assert.match(apiSource, /create_rfx_demand_snapshot/, "Rateware API should create demand snapshots");
assert.match(apiSource, /create_rfx_package/, "Rateware API should create RFx sourcing packages");
assert.match(apiSource, /launch_rfx_package_to_bid_room/, "Rateware API should launch an RFx Package into Bid Room");
assert.match(apiSource, /create_rfx_award_package/, "Rateware API should create RFx award packages");
assert.match(apiSource, /validateRfxProjectStatusChange/, "RFx Process status changes should be guarded by workflow validation");
assert.match(apiSource, /frozen_rfi_snapshot/, "Demand snapshots should preserve a frozen submitted RFI snapshot");
assert.match(rfxBidApiSource, /get_customer_rfi/, "Public Bid Room API should expose Customer RFI read action before invite token validation");
assert.match(rfxBidApiSource, /save_customer_rfi/, "Public Bid Room API should save Customer RFI drafts");
assert.match(rfxBidApiSource, /submit_customer_rfi/, "Public Bid Room API should submit final Customer RFI responses");
assert.match(rfxBidApiSource, /hashCustomerRfiToken/, "Public Customer RFI tokens should be hashed before lookup");
assert.match(rfxBidApiSource, /already been submitted/, "Submitted Customer RFIs should be locked until internally reopened");
assert.match(rfxBidApiSource, /customer_rfi_submitted/, "Customer RFI submission should be audit logged");
assert.match(rfxBidApiSource, /rfx_rfi_business_rules/, "Customer RFI API should persist structured business rules");
assert.match(rfxBidApiSource, /rfx_rfi_service_requirements/, "Customer RFI API should persist structured service requirements");
assert.match(rfxBidApiSource, /rfx_rfi_carrier_requirements/, "Customer RFI API should persist structured carrier requirements");

for (const table of ["whatsapp_business_connections", "vendor_whatsapp_contacts", "vendor_whatsapp_groups"]) {
  assert.match(whatsappBusinessMigration, new RegExp(`create table if not exists public\\.${table}`), `WhatsApp migration should create ${table}`);
}
for (const column of [
  "whatsapp_permission_basis",
  "whatsapp_do_not_contact",
  "whatsapp_opt_in_status",
  "whatsapp_group_url",
  "whatsapp_group_name",
  "whatsapp_meta_group_id",
  "whatsapp_group_status",
  "whatsapp_notes"
]) {
  assert.match(whatsappBusinessMigration, new RegExp(`add column if not exists ${column}`), `WhatsApp migration should add vendors.${column}`);
  assert.match(apiSource, new RegExp(column), `Rateware API should handle ${column}`);
  assert.match(vendorsSource, new RegExp(column), `Carrier CRM should handle ${column}`);
}
assert.match(whatsappBusinessMigration, /email_whatsapp_group/, "Outreach templates and campaigns should support composite WhatsApp group channels");
assert.match(whatsappBusinessMigration, /check \(channel in \('email', 'whatsapp', 'whatsapp_group'\)\)/, "Outreach messages should support WhatsApp message rows");
assert.match(apiSource, /list_whatsapp_connections/, "Rateware API should expose WhatsApp connection status");
for (const envName of [
  "WHATSAPP_PROVIDER",
  "WHATSAPP_CONNECTION_MODE",
  "WHATSAPP_GRAPH_API_VERSION",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_WABA_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_TOKEN_ENCRYPTION_KEY",
  "WHATSAPP_INTERNAL_OWNER_EMAILS",
  "WHATSAPP_GROUPS_ENABLED"
]) {
  assert.match(apiSource, new RegExp(`Deno\\.env\\.get\\("${envName}"\\)`), `Rateware API should read ${envName}`);
  assert.match(readmeSource, new RegExp(envName), `README should document ${envName}`);
  assert.match(whatsappEnvCheckSource, new RegExp(`"${envName}"`), `WhatsApp env check should verify ${envName}`);
}
const whatsappPublicConnectionSource = apiSource.slice(apiSource.indexOf("function publicWhatsappConnection"), apiSource.indexOf("async function ensureInternalWhatsappConnection"));
assert.doesNotMatch(whatsappPublicConnectionSource, /access_token(?:_encrypted)?\s*:/i, "Public WhatsApp connection payload must not expose access tokens");
assert.doesNotMatch(whatsappPublicConnectionSource, /app_secret_encrypted\s*:/i, "Public WhatsApp connection payload must not expose tenant app secrets");
assert.match(whatsappPublicConnectionSource, /maskedSecret\(storedPhoneNumberId\)/, "Public WhatsApp connection should mask phone number ids");
assert.doesNotMatch(whatsappPublicConnectionSource, /storedPhoneNumberId[^;]+\|\| WHATSAPP_PHONE_NUMBER_ID/, "External WhatsApp payload must not fall back to the internal phone id");
assert.match(whatsappPublicConnectionSource, /app_secret_configured:/, "Public WhatsApp connection should expose only app secret configured state");
assert.match(whatsappPublicConnectionSource, /status === "connected" && connectionValidated/, "WhatsApp should be connected only after Meta validation succeeds");
assert.match(whatsappPublicConnectionSource, /connection_validated: connectionValidated/, "Public WhatsApp status should expose safe validation readiness without secrets");
assert.match(whatsappPublicConnectionSource, /token_access_validated:/, "Public WhatsApp status should report whether Meta accepted the workspace token");
assert.match(whatsappPublicConnectionSource, /waba_phone_validated:/, "Public WhatsApp status should report whether the phone belongs to the configured WABA");
for (const column of [
  "organization_id",
  "meta_business_id",
  "meta_waba_id",
  "meta_phone_number_id",
  "webhook_verify_token_encrypted"
]) {
  assert.match(whatsappWorkspaceMigration, new RegExp(`add column if not exists ${column}`), `Workspace WhatsApp migration should add ${column}`);
}
assert.match(whatsappWorkspaceMigration, /add column if not exists whatsapp_connection_id uuid/, "Contact history should link to the WhatsApp connection used");
assert.doesNotMatch(whatsappWorkspaceMigration, /using\s*\(true\)/i, "WhatsApp connection RLS must not allow every authenticated workspace");
assert.match(apiSource, /function isInternalWhatsappWorkspace/, "WhatsApp resolver should explicitly identify the internal HeyMarksman workspace");
assert.match(apiSource, /WHATSAPP_INTERNAL_OWNER_EMAILS\.has\(email\)/, "Internal WhatsApp access should require an allowed owner email");
assert.match(apiSource, /WHATSAPP_INTERNAL_ORGANIZATION_IDS\.has\(organizationId\)/, "Internal WhatsApp access should support an allowed organization id");
const internalWhatsappWorkspaceSource = apiSource.slice(
  apiSource.indexOf("async function isInternalWhatsappWorkspace"),
  apiSource.indexOf("function maskedSecret")
);
assert.match(internalWhatsappWorkspaceSource, /return isInternalWhatsappWorkspaceIdentity\(user\)/, "Internal WhatsApp access should resolve only from the authenticated workspace identity");
assert.doesNotMatch(internalWhatsappWorkspaceSource, /gmail_mailbox_connections|GMAIL_ALLOWED_SENDER/, "A connected Gmail mailbox must never grant access to the internal WhatsApp sender");
assert.match(apiSource, /\.eq\("connection_mode", "tenant_connected"\)[\s\S]+scopeWhatsappConnectionQuery\(query, user\)/, "External WhatsApp connections should be scoped to the authenticated workspace");
assert.match(apiSource, /const accessToken = internalWorkspace\s+\? WHATSAPP_ACCESS_TOKEN\s+: await decryptWhatsappSecret\(row\.access_token_encrypted/, "External workspaces must use only their tenant WhatsApp token");
assert.match(apiSource, /if \(await isInternalWhatsappWorkspace\(supabase, user\)\) \{\s+throw new Error\("The internal HeyMarksman WhatsApp Business sender is managed server-side\."\)/, "Internal workspaces should not overwrite the managed sender with tenant credentials");
assert.match(apiSource, /const existingMetadata = objectRecord\(existingResult\.data\?\.metadata\)/, "Refreshing the internal WhatsApp connection must preserve synced Meta templates");
assert.match(apiSource, /const internalWabaId = WHATSAPP_WABA_ID[\s\S]+cleanText\(existingMetadata\.template_waba_id\)/, "Internal WhatsApp refresh must prefer the server WABA over stale stored template metadata");
assert.match(apiSource, /const wabaId = internalWorkspace\s+\?\s+\(WHATSAPP_WABA_ID \|\| cleanText\(metadata\.template_waba_id\) \|\| WHATSAPP_BUSINESS_ACCOUNT_ID\)/, "Internal WhatsApp actions must resolve templates against the server WABA first");
assert.match(whatsappTenantAppMigration, /add column if not exists meta_app_id text/, "Tenant WhatsApp connections should store their own Meta App ID");
assert.match(whatsappTenantAppMigration, /add column if not exists app_secret_encrypted text/, "Tenant WhatsApp connections should store only an encrypted Meta App Secret");
assert.match(apiSource, /connection_mode: "tenant_connected"/, "External workspaces should save tenant-connected rows");
assert.match(apiSource, /await encryptWhatsappSecret\(accessToken\)/, "Tenant WhatsApp access tokens should be encrypted before storage");
assert.match(apiSource, /await encryptWhatsappSecret\(appSecret\)/, "Tenant Meta App Secrets should be encrypted before storage");
assert.match(apiSource, /await decryptWhatsappSecret\(row\.access_token_encrypted/, "Tenant Meta requests should decrypt only the active workspace token server-side");
assert.match(apiSource, /WHATSAPP_CONNECTION_REQUIRED_MESSAGE/, "External WhatsApp actions should fail closed without a tenant connection");
assert.match(apiSource, /WHATSAPP_CONNECTION_VALIDATION_MESSAGE/, "Unvalidated WhatsApp connections should return an actionable validation error");
assert.match(apiSource, /function whatsappConnectionIsValidated[\s\S]+token_access === true[\s\S]+phone_number_id_match === true[\s\S]+waba_phone_match === true/, "WhatsApp readiness should require token, exact Phone Number ID, and WABA membership validation");
assert.match(apiSource, /async function validateWhatsappConnectionAgainstMeta/, "Rateware API should centralize live Meta connection validation");
assert.match(apiSource, /configuredPhoneNumberId}\?fields=id,display_phone_number,verified_name,quality_rating/, "WhatsApp validation should read the exact configured Phone Number ID from Meta");
assert.match(apiSource, /configuredWabaId}\/phone_numbers\?fields=id,display_phone_number,verified_name,quality_rating&limit=100/, "WhatsApp validation should verify the sender belongs to the exact configured WABA");
assert.match(apiSource, /returnedPhoneNumberId !== configuredPhoneNumberId/, "WhatsApp validation should reject a different Phone Number ID returned by Meta");
assert.match(apiSource, /wabaPhones\.find\(\(candidate\) => cleanText\(candidate\.id\) === configuredPhoneNumberId\)/, "WhatsApp validation should reject phones outside the configured WABA");
assert.match(apiSource, /async function validatedWhatsappConnection[\s\S]+validateWhatsappConnectionAgainstMeta/, "Provider operations should use a live validated WhatsApp connection");
assert.match(apiSource, /Authorization: `Bearer \$\{connection\.accessToken\}`/, "Meta calls should use the resolved workspace connection token");
assert.match(apiSource, /connection\.wabaId}\/message_templates/, "Template sync should use the resolved workspace WABA");
assert.match(apiSource, /discoverWhatsappWabaFromPhone/, "WhatsApp template sync should try to discover the WABA from the sender phone number");
assert.match(apiSource, /template_waba_id/, "WhatsApp template sync should persist the working WABA candidate");
assert.match(apiSource, /WHATSAPP_TEMPLATE_SETUP_MESSAGE/, "WhatsApp template errors should return actionable Meta setup guidance");
assert.match(whatsappTemplateMappingMigration, /create table if not exists public\.whatsapp_outreach_template_mappings/, "WhatsApp Outreach mappings should have a dedicated workspace table");
assert.match(whatsappTemplateMappingMigration, /unique \(whatsapp_connection_id, outreach_template_id\)/, "WhatsApp template mappings should be isolated by connection and Outreach template");
assert.doesNotMatch(whatsappTemplateMappingMigration, /using\s*\(true\)/i, "WhatsApp template mapping RLS must not expose mappings across workspaces");
assert.match(apiSource, /publish_outreach_template_to_whatsapp/, "Rateware API should publish Outreach copy to Meta templates");
assert.match(apiSource, /rateware_rfx_invitation_en/, "WhatsApp should use the active stable English RFx notifier");
assert.match(apiSource, /rateware_rfx_invitation_es/, "WhatsApp should use the active stable Spanish RFx notifier");
assert.match(apiSource, /WHATSAPP_RFX_NOTIFICATION_PLACEHOLDERS[\s\S]+vendor_name[\s\S]+event_name[\s\S]+lane_count[\s\S]+due_date[\s\S]+bid_link/, "Stable Meta notifiers should use the five ordered RFx parameters");
assert.match(apiSource, /delivery_strategy: "stable_rfx_notification"/, "WhatsApp mappings should identify the stable notifier strategy");
assert.match(apiSource, /source_placeholders: placeholders/, "Workspace mappings should persist the ordered source placeholders");
const generateOutreachDraftsSource = apiSource.slice(
  apiSource.indexOf('if (body.action === "generate_outreach_drafts")'),
  apiSource.indexOf('if (body.action === "list_outreach_messages")')
);
const sendGmailOutreachSource = apiSource.slice(
  apiSource.indexOf("async function sendOutreachMessages("),
  apiSource.indexOf("async function metaSendWhatsappTemplate(")
);
assert.match(apiSource, /if \(normalized === "email" \|\| normalized === "gmail" \|\| normalized === "gmail_only"\) return \["email"\]/, "Gmail-only outreach should resolve to email only");
assert.match(apiSource, /const channel = cleanText\(input\.channel\)\?\.toLowerCase\(\) \|\| "email"/, "Outreach templates and campaigns should default to Gmail only");
assert.match(apiSource, /const normalized = cleanText\(channel\)\?\.toLowerCase\(\) \|\| "email"/, "Unknown outreach channels should default to Gmail only");
assert.match(generateOutreachDraftsSource, /const wantsDirectWhatsapp = requestedChannels\.includes\("whatsapp"\)/, "Draft generation should explicitly gate direct WhatsApp work");
assert.match(generateOutreachDraftsSource, /messageChannels\(body\.channel \|\| campaign\.channel \|\| template\.channel\)/, "The channel selected in the launchpad should be authoritative for draft generation");
assert.match(generateOutreachDraftsSource, /const wantsEmail = requestedChannels\.includes\("email"\)/, "Draft generation should explicitly gate Gmail preparation");
assert.match(generateOutreachDraftsSource, /const wantsWhatsappGroup = requestedChannels\.includes\("whatsapp_group"\)/, "Draft generation should explicitly gate WhatsApp group preparation");
assert.match(generateOutreachDraftsSource, /const whatsappText = wantsDirectWhatsapp[\s\S]+: ""/, "Gmail-only draft generation should not render direct WhatsApp copy");
assert.match(generateOutreachDraftsSource, /const whatsappGroupText = wantsWhatsappGroup[\s\S]+: ""/, "Gmail-only draft generation should not render WhatsApp group copy");
assert.match(generateOutreachDraftsSource, /const whatsappParameters = wantsDirectWhatsapp[\s\S]+: \[\]/, "Gmail-only draft generation should not resolve Meta template parameters");
assert.match(generateOutreachDraftsSource, /const vendorIdsForGroups = wantsWhatsappGroup[\s\S]+\? \[\.\.\.new Set/, "Gmail and direct WhatsApp queues must not load WhatsApp groups");
assert.match(generateOutreachDraftsSource, /if \(wantsEmail\) \{[\s\S]+suppressedEmailSet/, "Only Gmail queues should load email suppressions");
assert.match(generateOutreachDraftsSource, /const channels = requestedChannels/, "Every carrier group should use the request-scoped channel selection");
assert.match(generateOutreachDraftsSource, /requested_channels: requestedChannels[\s\S]+channel_errors: channelPreparationErrors[\s\S]+channel_results: channelResults/, "Draft generation should report isolated results and errors per channel");
assert.match(apiSource, /gmail\.queue_preparation_error/, "Gmail queue preparation failures should have their own audit source");
assert.match(apiSource, /whatsapp\.queue_preparation_error/, "WhatsApp queue preparation failures should have their own audit source");
assert.match(apiSource, /outreach_queue\.error/, "Queue creation failures should not be reported as generic provider API failures");
assert.doesNotMatch(
  generateOutreachDraftsSource.slice(0, generateOutreachDraftsSource.indexOf("if (wantsDirectWhatsapp)")),
  /listWhatsappConnections/,
  "Gmail-only draft generation must not resolve WhatsApp connections before the WhatsApp gate"
);
assert.match(generateOutreachDraftsSource, /if \(wantsDirectWhatsapp\) \{[\s\S]+publishOutreachTemplateToWhatsapp\(supabase, user, \{ template_id: template\.id \}\)/, "Generating a WhatsApp queue should automatically create or refresh the Meta notifier");
assert.match(generateOutreachDraftsSource, /if \(wantsDirectWhatsapp\) \{[\s\S]+listWhatsappConnections/, "WhatsApp connection lookup should only run for direct WhatsApp queues");
assert.match(apiSource, /whatsapp_notifier: whatsappNotifier/, "Draft generation should return the automatic Meta notifier state");
assert.match(apiSource, /whatsapp_template_parameters: whatsappParameters/, "Generated WhatsApp drafts should persist rendered Meta parameter values");
assert.match(apiSource, /parameters: parameterRows\.map/, "WhatsApp sends should submit the rendered body parameters to Meta");
assert.match(apiSource, /notifierByTemplate[\s\S]+publishOutreachTemplateToWhatsapp\(supabase, user, \{ template_id: outreachTemplateId \}\)/, "WhatsApp send should refresh Meta notifier status automatically");
assert.match(apiSource, /whatsapp_template_auto_checked_at: now/, "WhatsApp drafts should record the automatic send-time Meta check");
assert.match(apiSource, /whatsappMetaStatusNeedsApproval[\s\S]+IN_REVIEW/, "WhatsApp direct sends should recognize Meta in-review templates as pending approval");
assert.match(rfxEventsSource, /metaNotifierPendingReview[\s\S]+IN_REVIEW/, "RFx Bid Room should show Meta in-review template status without treating it as unpublished");
assert.match(rfxEventsSource, /function metaNotifierNeedsSync[\s\S]+LANGUAGE_MISMATCH/, "RFx Bid Room should distinguish unsynced and language-incompatible Meta templates");
assert.match(rfxEventsSource, /message\.whatsapp_template_name \? "NOT_SYNCED" : "NOT_PUBLISHED"/, "RFx draft rows must not display an unverified template name as approved");
assert.match(outreachSource, /metaNotifierPendingReview[\s\S]+IN_REVIEW/, "Outreach should show Meta in-review template status without exposing secrets or raw provider errors");
assert.match(outreachSource, /No approved Meta translation matches this Outreach language/, "Outreach should explain incompatible Meta template languages");
assert.match(apiSource, /\.eq\("id", connection\.row\.id\)/, "WhatsApp connection tests and updates should target the resolved connection row");
assert.match(apiSource, /whatsapp_connection_id: connection\.row\.id/, "WhatsApp sends should persist the resolved connection id");
assert.match(apiSource, /sender_display_phone: senderDisplayPhone/, "WhatsApp contact history should persist the sender display phone");
assert.match(readFileSync(new URL("../src/outreach.js", import.meta.url), "utf8"), /Sent from .*sender_display_phone/s, "Contact history should show the WhatsApp sender connection");
assert.match(apiSource, /display_phone_number: cleanText\(data\.display_phone_number\)/, "WhatsApp connection test should return display phone number at top level");
assert.match(apiSource, /quality_rating: cleanText\(data\.quality_rating\)/, "WhatsApp connection test should return quality rating at top level");
assert.doesNotMatch(apiSource, /provider_response:\s*\{\s*id:\s*data\.id/, "WhatsApp connection test should not expose raw provider phone number id");
assert.match(apiSource, /send_whatsapp_outreach_messages/, "Rateware API should send direct WhatsApp Business drafts");
assert.match(apiSource, /whatsapp_template_name: cleanText\(message\.whatsapp_template_name\) \|\| null/, "WhatsApp failures should preserve the mapped Meta template name for retriable diagnostics");
assert.match(apiSource, /updateWhatsappMessageFailure\(supabase, user, resolvedMessage, reason, now, connection\)/, "WhatsApp failures should persist the resolved message and connection mapping instead of discarding them");
assert.match(apiSource, /mark_whatsapp_group_message_manually_sent/, "Rateware API should support manual WhatsApp group completion");
assert.match(apiSource, /send_whatsapp_group_outreach_messages/, "Rateware API should explicitly guard WhatsApp group automation");
assert.match(apiSource, /test_whatsapp_business_connection/, "Rateware API should expose WhatsApp Business connection test");
assert.match(apiSource, /testWhatsappBusinessConnection[\s\S]+validateWhatsappConnectionAgainstMeta/, "Test line should validate token, Phone Number ID, and WABA together");
assert.match(apiSource, /sync_whatsapp_templates/, "Rateware API should expose WhatsApp template sync");
assert.match(apiSource, /syncWhatsappTemplates[\s\S]+validatedWhatsappConnection/, "Template sync should require a live validated WhatsApp connection");
assert.match(apiSource, /sendWhatsappOutreachMessages[\s\S]+validatedWhatsappConnection/, "Direct WhatsApp sends should revalidate the workspace sender before delivery");
assert.match(apiSource, /rateware_rfx_invitation_en/, "WhatsApp RFx delivery should use the approved stable English Meta template name");
assert.match(apiSource, /whatsappTemplateNamesMatch/, "WhatsApp template sync should reconcile legacy and current stable RFx template aliases");
assert.match(apiSource, /rateware_rfx_invitation_\$\{suffix\}rateware_rfx_invitation_\$\{suffix\}/, "WhatsApp publishing should reconcile duplicated legacy notifier names");
assert.match(apiSource, /whatsappTemplateLanguagesMatch/, "WhatsApp template sync should reconcile Meta language roots such as en and en_US");
assert.match(apiSource, /function selectWhatsappMetaTemplate[\s\S]+whatsappTemplateStatusPriority/, "WhatsApp template resolution should rank compatible Meta catalog rows by approval status");
assert.match(apiSource, /status === "APPROVED"[\s\S]+return 40/, "An approved Meta translation should win over pending or rejected duplicates");
assert.match(apiSource, /selection\.availableLanguages\.length \? "LANGUAGE_MISMATCH" : "NOT_FOUND"/, "Template sync should distinguish a missing translation from a missing template");
assert.match(apiSource, /last_error: metaTemplate \? null : missingError/, "Template sync should persist an actionable missing-template or language diagnostic");
assert.match(apiSource, /templateName \? "NOT_SYNCED" : "NOT_PUBLISHED"/, "A saved Meta template name must not imply approval when its status is absent");
assert.match(apiSource, /templateStatus === "LANGUAGE_MISMATCH"[\s\S]+no approved translation compatible/, "WhatsApp sending should block an incompatible Meta translation before provider delivery");
assert.match(apiSource, /\["NOT_SYNCED", "NOT_FOUND"\]\.includes\(templateStatus\)/, "WhatsApp sending should block catalog-unverified templates");
assert.match(apiSource, /name: "rateware_rfx_invitation_en"[\s\S]+language: "en"/, "WhatsApp approved English RFx notifier should send with Meta's English language code");
assert.match(apiSource, /meta_template_language: metaTemplate \? cleanText\(metaTemplate\.language\)/, "WhatsApp template sync should persist Meta's real template language code");
assert.match(apiSource, /whatsappTemplateLanguageCandidates/, "WhatsApp sending should retry equivalent Meta language codes for approved templates");
assert.match(apiSource, /\(cleanText\(template\.meta_template_language\) \|\| ""\)\.replace/, "WhatsApp template publishing must tolerate an omitted template language");
assert.match(apiSource, /const raw = \(cleanText\(value\) \|\| ""\)\.trim\(\)\.replace/, "WhatsApp template language candidates must tolerate null values");
assert.match(apiSource, /english: "en"/, "WhatsApp template sending must normalize human-readable English mappings before calling Meta");
assert.match(apiSource, /replace\(\/\[\(\)\]\/g, ""\)/, "WhatsApp template sending must normalize Meta language labels such as English (US)");
assert.match(apiSource, /en_GB/, "WhatsApp template sending should retry equivalent English Meta locale codes");
assert.match(apiSource, /message\.includes\("132001"\)/, "WhatsApp sending should recognize Meta translation mismatch errors");
assert.match(apiSource, /normalized\.startsWith\("ACTIVE_"\)[\s\S]+APPROVED/, "WhatsApp Active quality-pending templates should be treated as approved for sending");
assert.match(apiSource, /replace\(\s*\/\[\^A-Z0-9\]\+\/g,\s*"_"\s*\)/, "WhatsApp Meta status normalization should handle punctuation and unicode separators");
assert.match(apiSource, /function whatsappTemplateStatusFromRow[\s\S]+quality_score[\s\S]+quality_rating/, "WhatsApp template sync should derive sendable status from Meta template row variants");
assert.match(apiSource, /function whatsappMetaQualityStatusIsSendable[\s\S]+"GREEN"[\s\S]+"QUALITY_PENDING"/, "WhatsApp quality score signals should unlock approved Meta templates");
assert.match(apiSource, /candidates\.includes\("APPROVED"\)[\s\S]+return "APPROVED"/, "WhatsApp template status should prefer approved or active quality signals over stale pending values");
assert.match(apiSource, /approved: templates\.filter\(\(template: Record<string, unknown>\) => whatsappTemplateStatusFromRow\(template\) === "APPROVED"\)\.length/, "WhatsApp template sync approved count should use Rateware's normalized Meta status");
assert.match(apiSource, /selectWhatsappMetaTemplate\(catalogRows, name, language\)/, "WhatsApp publish should select the best compatible Meta translation instead of trusting the first catalog row");
assert.match(apiSource, /normalized\.startsWith\("APPROVED_"\)/, "WhatsApp approved quality variants should remain sendable");
assert.match(apiSource, /list_whatsapp_phone_numbers/, "Rateware API should expose WhatsApp sender phone listing");
assert.match(apiSource, /whatsappWabaGraphFetch\([\s\S]+phone_numbers\?fields=id,display_phone_number,verified_name,quality_rating/, "WhatsApp phone listing should resolve the WABA from the sender phone relationship before falling back to saved account ids");
assert.match(apiSource, /resolved_waba_id/, "WhatsApp WABA resolution should persist the verified sender account without exposing credentials");
assert.match(apiSource, /verify_whatsapp_webhook/, "Rateware API should expose WhatsApp webhook verification");
assert.match(apiSource, /webhook_verified_at: verified \? now : null/, "Webhook verification should persist its result on the resolved WhatsApp connection");
assert.match(apiSource, /\?fields=name,language,status,category,components,quality_score&limit=100/, "WhatsApp template sync should read Meta quality status from message_templates");
assert.match(apiSource, /"\?fields=id,name,language,status,category,components,quality_score&limit=100"/, "WhatsApp publishing should resolve the exact approved Meta template from the catalog");
assert.match(settingsHtml, /connect-whatsapp-button/, "Settings should expose WhatsApp Business connection controls");
assert.match(settingsHtml, /whatsapp-manual-form/, "External workspaces should have a manual WhatsApp Business setup form");
assert.match(settingsHtml, /whatsapp-access-token[^>]+type="password"/, "WhatsApp access token should use a password input");
assert.match(settingsHtml, /whatsapp-app-secret[^>]+type="password"/, "WhatsApp App Secret should use a password input");
assert.match(settingsSource, /Connect your own WhatsApp Business/, "External Settings should ask tenants to connect their own WhatsApp Business account");
assert.match(settingsSource, /Internal HeyMarksman WhatsApp Business sender/, "Internal Settings should label the managed HeyMarksman sender clearly");
assert.match(settingsSource, /row\.status === "connected" && connectionValidated/, "Settings should not display WhatsApp as connected from stored ids alone");
assert.match(settingsSource, /Token, Phone Number ID and WABA verified/, "Settings should explain successful WhatsApp sender validation");
assert.match(settingsSource, /Not validated\. Run Test line before sending\./, "Settings should guide configured but unvalidated WhatsApp workspaces");
assert.match(settingsServiceSource, /save_whatsapp_business_connection/, "Settings should save tenant WhatsApp credentials server-side");
assert.match(settingsSource, /WHATSAPP_WEBHOOK_ENDPOINT/, "Settings should show the Meta webhook endpoint");
assert.match(settingsSource, /WhatsApp Business connector is not enabled for this deployment\. Configure Meta WhatsApp secrets server-side\./, "Settings should show clear missing WhatsApp secrets copy");
assert.match(settingsSource, /Meta cannot read the WhatsApp template catalog for this sender/, "Settings should explain Meta template catalog errors");
assert.doesNotMatch(settingsSource, /WHATSAPP_ACCESS_TOKEN|WHATSAPP_APP_SECRET|WHATSAPP_WEBHOOK_VERIFY_TOKEN/, "Settings UI source should not reference secret values");
assert.match(readmeSource, /## WhatsApp Business Meta setup/, "README should document WhatsApp Business Meta setup");
assert.match(readmeSource, /never prints secret values/i, "README should explain that the WhatsApp check does not print secret values");
assert.match(whatsappEnvCheckSource, /Secret values are never printed/, "WhatsApp env check should explicitly avoid printing secret values");
assert.match(whatsappEnvCheckSource, /sync_whatsapp_templates/, "WhatsApp env check should call template sync when authenticated");
assert.match(rfxEventsHtml, /rfx-send-selected-whatsapp-drafts/, "RFx Bid Room should expose selected WhatsApp draft sending");
assert.match(rfxEventsHtml, /Generate one channel at a time\. Gmail, WhatsApp Business, and WhatsApp groups use separate queues\./, "Bid Room Step 4 should make channel separation explicit");
assert.doesNotMatch(rfxEventsHtml, /<option value="multi">/, "Bid Room Step 4 should not expose mixed Email + WhatsApp as the default workflow");
assert.match(rfxEventsHtml, /WhatsApp Business readiness/, "RFx Bid Room should explain WhatsApp Business readiness separately from Gmail");
assert.match(rfxEventsSource, /publishOutreachTemplateToWhatsapp/, "RFx Bid Room should use Outreach as the WhatsApp template source");
assert.match(rfxEventsSource, /Full Outreach \/ Bid Room copy/, "RFx Bid Room should distinguish editable Outreach copy from the Meta notifier");
assert.match(rfxEventsSource, /function draftRowsForSelectedOutreachChannel/, "Draft queue should isolate visible rows by selected outreach channel");
assert.match(rfxEventsSource, /const rows = draftRowsForSelectedOutreachChannel\(allRows\)/, "Draft queue should render only the selected channel's drafts");
assert.match(rfxEventsHtml, /rfx-mark-selected-whatsapp-groups/, "RFx Bid Room should expose manual WhatsApp group completion");
assert.match(rfxEventsSource, /selectableWhatsappDrafts/, "RFx Bid Room should calculate direct WhatsApp selectable drafts");
assert.match(rfxEventsSource, /selectableWhatsappGroupDrafts/, "RFx Bid Room should calculate manual group selectable drafts");
assert.match(outreachServiceSource, /sendWhatsappOutreachMessages/, "Outreach service should call direct WhatsApp sending action");
assert.match(whatsappWebhookSource, /hub\.verify_token/, "WhatsApp webhook should implement Meta verification");
assert.match(whatsappWebhookSource, /x-hub-signature-256/, "WhatsApp webhook should validate Meta signatures when configured");
assert.doesNotMatch(whatsappWebhookSource, /if \(!WHATSAPP_APP_SECRET\) return true/, "WhatsApp webhook must reject unsigned POST requests when the Meta app secret is missing");
assert.match(whatsappWebhookSource, /provider_message_id/, "WhatsApp webhook should update outreach messages by provider message id");
assert.match(whatsappWebhookSource, /findWebhookConnection/, "WhatsApp webhook should resolve the workspace connection before routing events");
assert.match(whatsappWebhookSource, /connectionAppSecret\(item\.connection\)/, "WhatsApp webhook should select each resolved workspace App Secret before signature validation");
assert.match(whatsappWebhookSource, /signatureValid\(request, bodyText, appSecret\)/, "WhatsApp webhook should validate with the selected tenant App Secret");
assert.match(whatsappWebhookSource, /meta_phone_number_id/, "WhatsApp webhook should route by Meta phone number id");
assert.match(whatsappWebhookSource, /meta_waba_id/, "WhatsApp webhook should fall back to WABA routing");
assert.match(whatsappWebhookSource, /whatsapp_connection_id/, "WhatsApp webhook should scope message updates to the resolved connection");
assert.match(whatsappWebhookSource, /connectionPhone\(row\) === phoneNumberId[\s\S]+connectionWaba\(row\) === wabaId/, "WhatsApp webhook should require the saved phone number and WABA to match the same connection");
assert.match(whatsappWebhookSource, /if \(phoneNumberId\) return \{ connection: null, phoneNumberId, wabaId \}/, "WhatsApp webhook should reject WABA fallback when Meta supplies a mismatched phone number id");
assert.match(whatsappWebhookSource, /\.is\("whatsapp_connection_id", null\)[\s\S]+\.eq\("owner_user_id", ownerUserId\)/, "Legacy WhatsApp callback fallback should remain scoped to the connection owner");
assert.doesNotMatch(whatsappWebhookSource, /whatsapp_connection_id\.eq\.\$\{connection\.id\},whatsapp_connection_id\.is\.null/, "WhatsApp webhook should not update exact and unscoped legacy messages in one query");
assert.match(whatsappWebhookSource, /appSecrets\.size !== 1/, "WhatsApp webhook should reject a payload spanning different Meta apps");
assert.match(whatsappWebhookSource, /webhook_phone_number_id:[\s\S]+webhook_waba_id:/, "WhatsApp webhook should persist the Meta routing identity with delivery results");
assert.match(whatsappWebhookRoutingMigration, /whatsapp_business_connections_webhook_route_idx/, "WhatsApp connection lookup should have a phone and WABA routing index");
assert.match(whatsappWebhookRoutingMigration, /outreach_messages_whatsapp_webhook_route_idx/, "WhatsApp delivery callbacks should have a connection and provider message index");
assert.match(rfxBidApiSource, /rfx_rfi_crossborder_details/, "Customer RFI API should persist structured crossborder details");
assert.match(apiSource, /business_rules: businessRules\.data/, "RFx Process detail should expose structured business rules");
assert.match(rfxProcessServiceSource, /fetchRfxProcessProjects/, "RFx Process service should expose project listing");
assert.match(rfxProcessServiceSource, /launchRfxPackageToBidRoom/, "RFx Process service should expose Bid Room launch");
assert.doesNotMatch(rfxProcessServiceSource, /fetchCustomerRfi|get_customer_rfi|PUBLIC_RFI_ENDPOINT/, "RFx Process internal service should not expose public Customer RFI wrappers");
assert.match(rfxProcessSource, /let projectLoadVersion = 0/, "RFx Process project listing should guard against stale responses");
assert.match(rfxProcessSource, /let projectDetailLoadVersion = 0/, "RFx Process detail should guard against stale responses");
assert.match(rfxProcessSource, /loadVersion !== projectLoadVersion/, "RFx Process should ignore stale project list responses");
assert.match(rfxProcessSource, /loadVersion !== projectDetailLoadVersion \|\| state\.selectedId !== projectId/, "RFx Process should ignore stale project detail responses");
assert.match(rfxProcessSource, /const projectId = project\.id/, "RFx Process actions should capture the initiating project");
assert.match(customerRfiServiceSource, /fetchCustomerRfi/, "Customer RFI public service should expose public Customer RFI loading");
assert.match(customerRfiServiceSource, /get_customer_rfi/, "Customer RFI public service should call the public API without Kinde");
assert.doesNotMatch(customerRfiSource, /rfx-process-service/, "Customer RFI page should not import the internal authenticated RFx Process service");
assert.doesNotMatch(customerRfiServiceSource, /callRatewareApi|getKindeToken|auth\.js/, "Customer RFI public service should not depend on authenticated Rateware APIs");
assert.match(rfxProcessHtml, /Customer RFI/, "RFx Process page should include Customer RFI tab");
assert.match(rfxProcessHtml, /Demand/, "RFx Process page should include Demand tab");
assert.match(rfxProcessHtml, /RFx Design/, "RFx Process page should include RFx Design tab");
assert.match(rfxProcessHtml, /Evaluation/, "RFx Process page should include Bid Evaluation tab");
assert.match(customerRfiHtml, /rfi-lanes/, "Customer RFI page should collect a structured route schedule");
assert.match(customerRfiHtml, /rfi-lanes-head/, "Customer RFI route schedule should render a dynamic RFI spreadsheet header");
assert.match(customerRfiHtml, /import-rfi-segment-template/, "Customer RFI should import an existing segment workbook through the active segment workspace");
assert.match(customerRfiHtml, /rfi-segment-template-copy/, "Customer RFI template help and status should use a dedicated layout row");
assert.doesNotMatch(customerRfiHtml, /id="download-rfi-template"/, "Customer RFI should not expose a duplicate route-level template download");
assert.doesNotMatch(customerRfiHtml, /id="import-rfi-workbook"/, "Customer RFI should not expose a duplicate route-level workbook import");
assert.match(apiSource, /The active Customer RFI link is still valid/, "RFx Process should reuse an active Customer RFI link instead of issuing duplicates");
assert.match(customerRfiSource, /Ubicacion de salida/, "Customer RFI route schedule should align to the customer RFI origin columns");
assert.match(customerRfiSource, /Ubicacion de llegada/, "Customer RFI route schedule should align to the customer RFI destination columns");
assert.match(customerRfiSource, /Volumen semanal esperado/, "Customer RFI route schedule should include expected weekly volume from the RFI template");
assert.match(customerRfiHtml, /rfi-segment-checklists/, "Customer RFI page should collect segment checklist rubrics");
assert.match(customerRfiSource, /CHECKLIST_GROUPS/, "Customer RFI segment rubrics should use structured B-G checklist groups");
assert.match(customerRfiSource, /rubric_items/, "Customer RFI segment rubrics should persist row-level checklist items");
assert.match(customerRfiSource, /Que preguntar/, "Customer RFI segment rubrics should show the question to validate");
assert.match(customerRfiSource, /Respuesta esperada/, "Customer RFI segment rubrics should show the expected answer type");
assert.match(customerRfiSource, /d_border_wait/, "Customer RFI business rules should explicitly capture border wait risk");
assert.match(customerRfiSource, /carrier_requirements/, "Customer RFI should persist required carrier profile rubric details");
assert.match(customerRfiHtml, /rfi-segment-tabs/, "Customer RFI should organize work by operating-segment tabs");
assert.match(customerRfiHtml, /data-rfi-workspace-view="lanes"/, "Customer RFI should expose a compact routes workspace view");
assert.match(customerRfiHtml, /data-rfi-workspace-view="rubrics"/, "Customer RFI should expose a compact requirements workspace view");
assert.match(customerRfiHtml, /data-rfi-workspace-view="files"/, "Customer RFI should expose a segment file-vault workspace view");
assert.match(customerRfiHtml, /rfi-segment-files/, "Customer RFI should keep the active segment file vault separate from the checklist grid");
assert.match(customerRfiHtml, /rfi-language-toggle/, "Customer RFI should provide an English and Spanish toggle");
assert.doesNotMatch(customerRfiHtml, /rfi-wizard-panel/, "Customer RFI should not show a redundant wizard ribbon");
assert.match(customerRfiHtml, /rfi-segment-selector/, "Customer RFI should select operating segments from the compact scope control");
assert.match(customerRfiSource, /data-remove-rfi-segment/, "Customer RFI should expose removable selected segment tabs");
assert.match(customerRfiHtml, /data-rfi-save-segment/, "Customer RFI should expose explicit segment save controls");
assert.match(customerRfiHtml, /data-rfi-delete-segment/, "Customer RFI should expose explicit segment delete controls");
assert.doesNotMatch(customerRfiHtml, /add-segment-checklist/, "Customer RFI should not expose a redundant add-segment button outside the operating scope");
assert.match(customerRfiSource, /renderAutofillCatalogs/, "Customer RFI route fields should provide catalog autofill without blocking new values");
assert.match(customerRfiSource, /RFI_IMPORT_ALIASES/, "Customer RFI workbook import should map the source RFI headings instead of relying on column position");
assert.match(customerRfiSource, /findRfiImportSheet/, "Customer RFI workbook import should locate the schedule sheet and header automatically");
assert.match(customerRfiSource, /importRfiWorkbook/, "Customer RFI workbook import should keep route parsing inside the public RFI workflow");
assert.match(customerRfiSource, /laneHasMeaningfulData/, "Customer RFI should discard blank placeholder routes when importing or validating");
assert.match(customerRfiSource, /syncSegmentWorkspaceFromScope/, "Customer RFI should sync segment tabs from operating scope changes");
assert.match(customerRfiSource, /renderWorkspaceState/, "Customer RFI should show one active segment workspace panel at a time");
assert.match(customerRfiSource, /rfi-route-group-head/, "Customer RFI route matrix should group the full workbook fields into scannable sections");
assert.match(customerRfiSource, /rfi-rubric-group/, "Customer RFI should collapse structured B-G requirements by rubric group");
assert.match(customerRfiSource, /rfi-file-vault/, "Customer RFI should keep file references within the relevant operating segment");
assert.match(stylesSource, /rfi-route-head-label/, "Customer RFI route matrix should use compact wrapped route headers");
assert.match(stylesSource, /data-rfi-workspace-panel\]\[hidden\]/, "Customer RFI should hide inactive workspace panels even when card styles are present");
assert.match(stylesSource, /rfi-help-note/, "Customer RFI field guide copy should render as normal text rather than squeezed helper text");
assert.doesNotMatch(customerRfiHtml, /Global notes and attachments/, "Customer RFI should not show a redundant global notes and attachments section");
assert.match(customerRfiSource, /submitCustomerRfi/, "Customer RFI UI should call the public submit API");
assert.match(customerRfiSource, /Completa salida, llegada, tipo de camion y volumen semanal/, "Customer RFI UI should validate only the essential RFI lane fields before final submission");
assert.match(customerRfiSource, /validateFinalRfi/, "Customer RFI final validation should keep non-essential RFI fields as warnings");
assert.match(customerRfiSource, /state\.submitted/, "Customer RFI UI should lock submitted responses");
assert.doesNotMatch(apiSource, /frequency_missing/, "RFx Process demand readiness should not require non-template frequency fields as hard blockers");
assert.doesNotMatch(apiSource, /crossborder_details_missing/, "RFx Process demand readiness should not require narrative crossborder details as hard blockers");
assert.match(rfxProcessSource, /does not mutate the customer submission/, "RFx Process UI should explain that demand normalization does not mutate the submitted RFI");
for (const [label, source] of [
  ["RFx Process UI", rfxProcessSource],
  ["Customer RFI UI", customerRfiSource],
  ["RFx Process service", rfxProcessServiceSource],
  ["RFx Process migration", rfxProcessMigration]
]) {
  assert.doesNotMatch(source, /dispatchShipment|loadTender|driverDispatch/i, `${label} should not implement shipment dispatching in the RFx Process scope`);
}
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
assert.match(rfxEventsSource, /fetchVendorSegments\(\{ segmentType: "participant_template" \}\)/, "Bid Room should load only reusable participant templates, not unrelated CRM segments");
assert.match(rfxEventsSource, /participantTemplateNameKey/, "Bid Room should normalize participant template names before creating duplicates");
assert.match(rfxEventsSource, /participantTemplateMutationRunning/, "Bid Room should serialize participant template save, update, and delete actions");
assert.match(rfxEventsHtml, /manual-shortlist-template-name/, "Bid Room should render a named participant template input");
assert.match(rfxEventsHtml, /load-manual-shortlist-template/, "Bid Room should render a saved participant template loader");
assert.match(rfxEventsHtml, /update-manual-shortlist-template/, "Bid Room should render an update button for selected participant templates");
assert.match(rfxEventsHtml, /delete-manual-shortlist-template/, "Bid Room should render a delete button for selected participant templates");
assert.match(apiSource, /findParticipantTemplateNameConflict/, "Rateware API should reject duplicate participant template names server-side");
assert.match(apiSource, /vendor\.segment\.create/, "Rateware API should audit participant template creation");
assert.match(apiSource, /vendor\.segment\.update/, "Rateware API should audit participant template updates");
assert.match(apiSource, /requestedSegmentType === "participant_template"/, "Rateware API should scope reusable participant templates to their owner");
assert.match(rfxEventsSource, /function confirmBidRoomBulkAction/, "Bid Room should require human confirmation for shortlist and participant bulk actions");
assert.match(rfxEventsSource, /confirmBidRoomBulkAction\("auto_shortlist", ids\)/, "Bid Room should confirm before auto-shortlisting selected lanes");
assert.match(rfxEventsSource, /confirmBidRoomBulkAction\("mark_invited", ids\)/, "Bid Room should confirm before marking selected participants invited");
assert.match(rfxEventsSource, /confirmBidRoomBulkAction\("archive_participants", ids\)/, "Bid Room should confirm before archiving selected participants");
assert.match(ratewareApiClientSource, /function apiErrorMessage/, "Rateware API client should normalize object error payloads before throwing");
assert.doesNotMatch(ratewareApiClientSource, /new Error\(data\.error \|\| data\.message/, "Rateware API client should not throw raw object errors that render as [object Object]");
assert.match(authSource, /return await kinde\.getAccessToken\?\.\(\)/, "Kinde auth should use the supported access-token API for normal authenticated requests");
assert.match(authSource, /let kindeRefreshPromise/, "Kinde session restoration should be single-flight across concurrent bulk requests");
assert.match(authSource, /kindePromise = null;[\s\S]+await getKindeClient\(\)/, "Kinde session restoration should reinitialize the PKCE client so checkAuth can renew the cached token");
assert.match(authSource, /export async function authenticatedFetch/, "Authenticated requests should use one shared session-aware fetch executor");
assert.match(authSource, /response\.status !== 401[\s\S]+forceRefresh: true[\s\S]+fetch\(input, withBearerToken\(init, freshToken\)\)/, "Authenticated fetch should retry one unauthorized request after session restoration");
assert.match(authSource, /rateware:session-required/, "Failed silent restoration should raise one controlled reauthentication signal");
assert.match(authSource, /app_state: \{ returnTo \}/, "Kinde reauthentication should preserve the current module route");
assert.match(ratewareApiClientSource, /import \{ authenticatedFetch \} from "\.\/auth\.js"/, "Rateware API calls should use the shared authenticated request executor");
assert.doesNotMatch(ratewareApiClientSource, /getKindeToken|response\.status === 401/, "Rateware API calls should not duplicate token refresh and retry logic");
assert.match(apiSource, /function errorMessage\(value: unknown/, "Rateware API should reduce nested provider errors to readable text");
assert.doesNotMatch(apiSource, /error instanceof Error \? error\.message : String\(error\)/, "Rateware API should not serialize caught objects as [object Object]");
assert.match(apiSource, /safeOperationalError\(error\)/, "Rateware API should sanitize caught provider errors before returning or logging them");
for (const [label, source] of [["Upload service", uploadServiceSource], ["Catalog service", catalogServiceSource]]) {
  assert.match(source, /authenticatedFetch/, `${label} should recover Kinde sessions through the shared request executor`);
  assert.doesNotMatch(source, /getKindeToken/, `${label} should not bypass shared Kinde session recovery`);
}
assert.match(stylesSource, /session-recovery-banner/, "Expired sessions should expose a compact reauthentication prompt without clearing the current page");
assert.match(errorCopySource, /function rawErrorMessage/, "Human error copy should convert nested object errors to readable text");
assert.match(errorCopySource, /record\.reason/, "Human error copy should read provider reason fields instead of rendering an object");
assert.match(errorCopySource, /record\.description/, "Human error copy should read provider description fields instead of rendering an object");
assert.doesNotMatch(errorCopySource, /JSON\.stringify\(errorOrMessage\)/, "Human error copy should not render raw JSON error payloads to users");
assert.match(errorCopySource, /lower === "\[object object\]"/, "Human error copy should never display [object Object] to users");
assert.match(errorCopySource, /lower === "bad request"/, "Human error copy should not show bare Bad Request messages to users");
assert.match(errorCopySource, /export function apiErrorMessage/, "Shared UI modules should use a common API error formatter");
assert.match(stagingReviewSource, /import \{ humanizeError \} from "\.\/error-copy\.js"/, "Staging should use shared human error copy");
assert.match(stagingReviewSource, /tone === "error" \? humanizeError\(message\) : message/, "Staging status messages should humanize user-facing errors");
assert.match(ratewareSource, /import \{ humanizeError \} from "\.\/error-copy\.js"/, "Rateware should use shared human error copy");
assert.match(ratewareSource, /tone === "error" \? humanizeError\(message\) : message/, "Rateware status messages should humanize user-facing errors");
assert.match(vendorSupportSource, /tone === "error" \? humanizeError\(message\) : message/, "Vendor Support should humanize user-facing errors");
assert.match(bidRoomBoardSource, /import \{ apiErrorMessage, humanizeError \} from "\.\/error-copy\.js"/, "Public Bid Room board should use shared human error copy");
assert.doesNotMatch(bidRoomBoardSource, /error\.message \|\| "Could/, "Public Bid Room board should not expose raw caught errors to carriers");
assert.match(carrierProfileSource, /import \{ apiErrorMessage, humanizeError \} from "\.\/error-copy\.js"/, "Carrier profile portal should use shared human error copy");
assert.doesNotMatch(carrierProfileSource, /saveStatus\.textContent = error\.message/, "Carrier profile portal should not expose raw save errors");
assert.match(catalogWorkbenchSource, /import \{ humanizeError \} from "\.\/error-copy\.js"/, "Catalog workbench should use shared human error copy");
assert.match(catalogWorkbenchSource, /tone === "error" \? humanizeError\(message\) : message/, "Catalog workbench status messages should humanize user-facing errors");
assert.match(locationMatchDrawerSource, /import \{ humanizeError \} from "\.\/error-copy\.js"/, "Location match drawer should use shared human error copy");
assert.doesNotMatch(locationMatchDrawerSource, /setMessage\?\.\(error\.message/, "Location match drawer should not expose raw alias-save errors");
assert.match(settingsSource, /import \{ humanizeError \} from "\.\/error-copy\.js"/, "Settings should use shared human error copy");
assert.match(settingsSource, /tone === "error" \? humanizeError\(message\) : message/, "Settings status messages should humanize integration and catalog errors");
assert.doesNotMatch(settingsSource, /button\.textContent = error\.message/, "Settings onboarding actions should not replace button labels with raw errors");
for (const [label, source] of [
  ["Upload service", uploadServiceSource],
  ["Catalog service", catalogServiceSource],
  ["Public Bid Room board", bidRoomBoardSource],
  ["Private carrier Bid Room", rfxBidSource],
  ["Carrier profile portal", carrierProfileSource]
]) {
  assert.doesNotMatch(source, /new Error\(data\.(error|message)\s*\|\|/, `${label} should not throw raw object API errors`);
  assert.doesNotMatch(source, /data\.error\s*\|\|\s*data\.message/, `${label} should not prefer raw object API errors over normalized copy`);
}
assert.match(apiSource, /const BULK_SELECTED_ID_LIMIT = 1000;/, "General bulk actions should support up to 1,000 selected rows per request");
assert.match(apiSource, /const BULK_SEND_LIMIT = 100;/, "Gmail sending should keep the smaller send batch size separate from general bulk actions");
assert.match(rfxEventsSource, /Draft queue could not be generated/, "Bid Room Step 4 should show contextual outreach errors");
assert.match(ratewareApiClientSource, /HTTP \$\{response\.status\}: \$\{apiErrorMessage\(data, text, response\.status\)\}/, "Rateware API client should preserve HTTP status for accurate session error handling");
assert.match(errorCopySource, /lower\.includes\("invalid bearer token"\)/, "Shared error copy should reserve session messaging for explicit authentication errors");
assert.doesNotMatch(errorCopySource, /lower\.includes\("unauthorized"\)/, "Shared error copy should not classify arbitrary unauthorized text as a session failure");
assert.match(rfxEventsSource, /function eventLifecycleRiskSummary/, "Bid Room event lifecycle actions should summarize event risk before changes");
assert.match(rfxEventsSource, /function confirmEventLifecycleAction/, "Bid Room event lifecycle actions should use a shared confirmation guard");
assert.match(rfxEventsSource, /confirmEventLifecycleAction\("open"\)/, "Bid Room should confirm before opening an event");
assert.match(rfxEventsSource, /confirmEventLifecycleAction\("close"\)/, "Bid Room should confirm before closing an event");
assert.match(rfxEventsSource, /confirmEventLifecycleAction\("duplicate"\)/, "Bid Room should confirm before duplicating an event");
assert.match(rfxEventsSource, /confirmEventLifecycleAction\("archive"\)/, "Bid Room should confirm before archiving an event");
assert.match(rfxEventsSource, /confirmEventLifecycleAction\("delete"\)/, "Bid Room should require typed confirmation before deleting an event");
assert.match(rfxEventsSource, /window\.prompt\(`Type "\$\{label\}" to delete/, "Bid Room event delete should require typing the RFx label");
assert.match(rfxEventsHtml, /rfx-outreach-sender/, "Bid Room Step 4 should include a sender account selector");
assert.match(rfxEventsHtml, /rfx-outreach-carrier-adder/, "Bid Room Step 4 should let procurement add late carriers without leaving outreach");
assert.match(rfxEventsHtml, /rfx-add-outreach-carriers/, "Bid Room Step 4 should provide a direct action to add selected CRM carriers");
assert.match(rfxEventsHtml, /sales@heymarksman\.com/, "Bid Room Step 4 should use sales@heymarksman.com as the approved sender");
assert.doesNotMatch(rfxEventsHtml, /carriers@xbfreight\.com/, "Bid Room Step 4 should not offer legacy sender accounts");
assert.doesNotMatch(rfxEventsHtml, /Advanced source editor/, "Bid Room Step 4 should not expose the advanced source editor in the main flow");
assert.match(rfxEventsSource, /sender_email: rfxOutreachSender/, "Bid Room should pass the selected sender into outreach campaign creation");
assert.match(outreachServiceSource, /sender_email: options\.senderEmail/, "Outreach draft generation should send selected sender metadata to the API");
assert.match(outreachServiceSource, /channel: options\.channel \|\| ""/, "Outreach service should pass the selected channel explicitly to the API");
assert.match(rfxEventsSource, /generateOutreachDrafts\(campaign\.id, \{[\s\S]+channel: outreachChannel/, "Bid Room queue creation should pass the launchpad channel explicitly");
assert.match(rfxEventsSource, /const includesWhatsappChannel = requestedDraftChannels\.some/, "Bid Room should detect whether the selected queue actually needs WhatsApp configuration");
assert.match(rfxEventsSource, /\.\.\.\(includesWhatsappChannel \? \{[\s\S]+whatsapp_target_mode:[\s\S]+group_delivery_policy:[\s\S]+\} : \{\}\)/, "Gmail campaign creation should omit WhatsApp-only settings");
assert.match(rfxEventsSource, /const isWhatsappQueue = requestedDraftChannels\.includes\("whatsapp"\)/, "Bid Room should only interpret Meta notifier state for direct WhatsApp queues");
assert.match(rfxEventsSource, /const key = `\$\{campaignId\}:\$\{channel\}:\$\{invitationIds\.join\(","\)\}`/, "Targeted draft refresh should keep Gmail and WhatsApp groups separate");
assert.match(rfxEventsSource, /campaignId,[\s\S]+channel: message\.channel \|\| "email",[\s\S]+invitationIds/, "Targeted draft refresh should preserve the original message channel");
assert.match(outreachServiceSource, /send_outreach_messages/, "Outreach service should expose direct Gmail send for selected draft messages");
assert.match(outreachServiceSource, /send_outreach_messages[\s\S]+provider: "gmail"[\s\S]+channel: "email"/, "Gmail send requests should explicitly identify the provider and channel");
assert.match(sendGmailOutreachSource, /requestedProvider !== "gmail"/, "Gmail send should reject non-Gmail provider requests");
assert.match(sendGmailOutreachSource, /\.eq\("channel", "email"\)/, "Gmail send should load only email outreach rows");
assert.doesNotMatch(sendGmailOutreachSource, /activeWhatsappConnection|listWhatsappConnections|whatsappGraphFetch/, "Gmail send must not resolve or call WhatsApp providers");
assert.match(rfxEventsHtml, /rfx-send-selected-email-drafts/, "Bid Room draft queue should include a bulk send selected emails action");
assert.match(rfxEventsHtml, /rfx-refresh-selected-drafts/, "Bid Room draft queue should support refreshing selected sent or stale drafts without regenerating the full queue");
assert.match(rfxEventsHtml, /rfx-archive-selected-drafts/, "Bid Room draft queue should include archive selected action");
assert.match(rfxEventsHtml, /rfx-delete-selected-drafts/, "Bid Room draft queue should include delete selected action");
assert.match(rfxEventsSource, /const OUTREACH_SEND_BATCH_SIZE = 100/, "Bid Room Step 4 should respect the backend Gmail send batch size");
assert.match(rfxEventsSource, /const BID_ROOM_PARTICIPANT_BATCH_SIZE = 1000/, "Bid Room participant mutations should use 1,000-row backend batches");
assert.match(rfxEventsSource, /const BID_ROOM_PARTICIPANT_SELECTION_STORAGE_PREFIX = "rateware:bid-room:participant-selection:";/, "Bid Room should store participant selections per RFx");
assert.match(rfxEventsSource, /function persistManualParticipantSelection\(/, "Bid Room should persist a participant selection while the user changes steps");
assert.match(rfxEventsSource, /function restoreManualParticipantSelection\(/, "Bid Room should restore a participant selection when RFx detail reloads");
assert.match(rfxEventsSource, /hydrateVendorOptionIds\(missingIds\)/, "Restored participant IDs should rehydrate their Carrier CRM names");
assert.match(rfxEventsSource, /const unassignedSelection = !previousEventId/, "Participant selections made before an RFx is chosen should transfer to that RFx");
assert.match(rfxEventsSource, /selectedManualVendorIdsState\.clear\(\);\s+persistManualParticipantSelection\(eventId\);/, "Persisted participant selections should clear only after confirmed shortlist creation");
assert.match(rfxEventsSource, /async function shortlistVendorsByLane/, "Bid Room should batch large carrier shortlists by lane");
assert.match(rfxEventsSource, /async function addSelectedManualCarriersToBid/, "Bid Room should reuse one safe participant add flow from shortlist and outreach");
assert.match(rfxEventsSource, /selectedInvitationIds\.clear\(\);[\s\S]{0,180}Generate the draft queue to reach only new carriers/, "Adding carriers from Step 4 should clear stale scope and preserve existing outreach history");
assert.match(rfxEventsSource, /chunkRows\(vendorIds, BID_ROOM_PARTICIPANT_BATCH_SIZE\)/, "Bid Room should split selected carriers into 1,000-row shortlist batches");
assert.match(rfxEventsSource, /async function mutateRfxParticipantsInBatches/, "Bid Room should batch participant invite and archive operations");
assert.match(rfxEventsSource, /mutateRfxParticipantsInBatches\(ids, "invite", actionStatus\)/, "Bid Room should batch-mark invitations over 1,000 rows");
assert.match(rfxEventsSource, /mutateRfxParticipantsInBatches\(ids, "archive", actionStatus\)/, "Bid Room should batch-archive participants over 1,000 rows");
assert.match(rfxEventsSource, /function sendDraftEmailIds/, "Bid Room Step 4 should send selected emails through automatic batches");
assert.match(rfxEventsSource, /function refreshSelectedOutreachDrafts/, "Bid Room should refresh selected draft rows within the existing campaign");
assert.match(rfxEventsSource, /Existing send history stays intact/, "Bid Room should explain that refresh preserves send history");
assert.match(rfxEventsSource, /chunkRows\(ids, OUTREACH_SEND_BATCH_SIZE\)/, "Bid Room Step 4 should split large sends before calling the API");
assert.match(rfxEventsSource, /data-rfx-send-draft-now/, "Bid Room Step 4 should allow sending a single carrier invitation from the draft queue");
assert.match(rfxEventsSource, /function sendSingleDraftEmail/, "Bid Room Step 4 should support individual same-day carrier invite sends");
assert.match(rfxEventsSource, /targetHasActiveOutreachDraft/, "Bid Room Step 4 should generate missing drafts without duplicating the whole wave");
assert.match(rfxEventsSource, /function outreachDraftChannels/, "Bid Room Step 4 should resolve draft coverage by the selected outreach channel");
assert.match(rfxEventsSource, /async function loadWhatsappConnectionReadiness/, "Bid Room should load server-validated WhatsApp readiness");
assert.match(rfxEventsSource, /row\.status === "connected" && row\.connection_validated === true/, "Bid Room should enable WhatsApp only after server-side Meta validation");
assert.match(rfxEventsSource, /sendSelectedDraftWhatsapp[\s\S]+loadWhatsappConnectionReadiness\(\{ render: false \}\)/, "Bulk WhatsApp sends should refresh connection validation immediately before sending");
assert.match(rfxEventsSource, /sendSingleDraftWhatsapp[\s\S]+loadWhatsappConnectionReadiness\(\{ render: false \}\)/, "Single WhatsApp sends should refresh connection validation immediately before sending");
assert.match(rfxEventsSource, /targetHasActiveOutreachDraft\(target, requestedDraftChannels\)/, "A WhatsApp draft must not block creation of a missing Gmail draft for the same invitation");
assert.match(rfxEventsSource, /requestedChannels\.every\(\(channel\) => activeChannels\.has/, "Draft deduplication should require coverage for every requested channel");
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
assert.doesNotMatch(rfxBidSource, /window\.alert\(/, "Carrier Bid Room should use inline statuses instead of native browser alerts");
assert.match(rfxBidSource, /function formatNumber\(value, digits = 0\)/, "Carrier Bid Room should define number formatting before rendering RFx package summaries");
assert.match(bidRoomBoardHtml, /Live Bid Room Board/, "Public Bid Room board page should exist");
assert.match(rfxEventsHtml, /bid-room-board\.html/, "Internal Bid Room should link to the public board");
assert.match(bidRoomBoardHtml, /data-board-view="pipeline"/, "Public Bid Room board should support pipeline view");
assert.match(bidRoomBoardHtml, /data-board-view="sheet"/, "Public Bid Room board should support spreadsheet view");
assert.match(bidRoomBoardSource, /public_bid_room_board/, "Public Bid Room board should call the public board action");
assert.doesNotMatch(bidRoomBoardSource, /event_id: scopedEventId/, "Public Bid Room board should not filter opportunities by a scoped event");
assert.doesNotMatch(bidRoomBoardHtml, /public-board-status-filter/, "Public Bid Room board should not hide opportunities behind a status filter");
assert.doesNotMatch(bidRoomBoardSource, /public-board-status-filter/, "Public Bid Room board script should not keep a hidden status filter");
assert.match(bidRoomBoardSource, /callPublicBoard\(\{ limit: 1000 \}\)/, "Public Bid Room board should request the full opportunity board");
assert.match(rfxEventsSource, /marketplaceUrlForEvent/, "Bid Room should build event-specific marketplace links");
assert.match(rfxEventsSource, /Public marketplace/, "Bid Room event links should open the full public opportunity board");
assert.match(rfxEventsSource, /data-rfx-marketplace-link/, "Bid Room event cards should expose a marketplace button");
assert.match(bidRoomBoardHtml, /public-board-detail-drawer/, "Public Bid Room board should render an opportunity detail drawer");
assert.match(bidRoomBoardHtml, /public-board-soft-login-drawer/, "Public Bid Room board should render soft login for already invited carriers");
assert.match(bidRoomBoardHtml, /Find my invitations/, "Public Bid Room board should expose a carrier soft login entry point");
assert.match(bidRoomBoardSource, /Request invitation/, "Public Bid Room board should require invitation requests instead of direct bidding");
assert.match(bidRoomBoardSource, /public_bid_room_request_invite/, "Public Bid Room board should call the public invitation request action");
assert.match(bidRoomBoardSource, /public_bid_room_find_invitations/, "Public Bid Room board should call the public invitation lookup action");
assert.match(bidRoomBoardSource, /invitedLaneIds/, "Public Bid Room board should remember invited lanes after soft login");
assert.match(bidRoomBoardSource, /data-public-board-private-link/, "Public Bid Room board should resend private links instead of requesting access for invited lanes");
assert.match(bidRoomBoardSource, /data-public-board-open-private/, "Public Bid Room board should open verified private bids directly");
assert.match(bidRoomBoardSource, /Open private bid/, "Public Bid Room board should show direct access after a verified private invitation");
assert.match(bidRoomBoardSource, /Check access/, "Public Bid Room cards should check access before showing request invitation for unknown carriers");
assert.match(bidRoomBoardSource, /You already have an invitation for this opportunity/, "Public Bid Room card detail should explain already invited access");
assert.match(rfxBidSource, /rememberPublicBoardInvitationAccess/, "Private Bid Room should remember verified public board access after token entry");
assert.match(rfxBidSource, /rateware\.publicBidBoard\.verifiedInvitations/, "Private Bid Room should persist verified invitation tokens locally for direct marketplace access");
assert.match(bidRoomBoardSource, /Private Bid Room links sent/, "Public Bid Room board should announce private link delivery");
assert.match(bidRoomBoardSource, /New opportunity available/, "Public Bid Room board should announce new public opportunities");
assert.match(bidRoomBoardSource, /soundEnabled: localStorage\.getItem\("rateware\.publicBidBoard\.sound"\) !== "off"/, "Public Bid Room board should start with sound enabled unless the user turns it off");
assert.match(bidRoomBoardSource, /Sound is on for opportunity, quote, deadline, and ranking alerts/, "Public Bid Room board should explain that sound is enabled by default");
assert.match(bidRoomBoardSource, /function publicLaneDetailSections/, "Public Bid Room board should render lane business detail sections");
assert.match(bidRoomBoardSource, /Logistics model \/ Modelo logistico/, "Public Bid Room board should expose logistics model details");
assert.match(bidRoomBoardSource, /Operation criteria \/ Criterios de operacion/, "Public Bid Room board should expose operation criteria details");
assert.match(bidRoomBoardSource, /Business rules \/ Reglas de negocio/, "Public Bid Room board should expose business rules details");
assert.match(bidRoomBoardSource, /function countdownMeta/, "Public Bid Room cards should compute a live deadline countdown");
assert.match(bidRoomBoardSource, /data-public-countdown/, "Public Bid Room cards should render countdown timers per opportunity");
assert.match(bidRoomBoardSource, /setInterval\(updateCountdowns, 1000\)/, "Public Bid Room countdowns should update every second without reloading the board");
assert.match(stylesSource, /public-opportunity-countdown/, "Public Bid Room countdowns should have dedicated card styling");
assert.match(bidRoomBoardSource, /Deadline closing soon/, "Public Bid Room board should announce deadline risk");
assert.match(bidRoomBoardSource, /Invitation request sent/, "Public Bid Room board should announce invitation requests");
assert.match(bidRoomBoardSource, /Quote Available/, "Public Bid Room board should announce new quotes in English");
assert.match(bidRoomBoardSource, /Cotización disponible/, "Public Bid Room board should announce new quotes in Spanish");
assert.match(bidRoomBoardSource, /Best offer updated/, "Public Bid Room board should announce best offer movement without implying the viewer was displaced");
assert.match(bidRoomBoardSource, /queueAlert\("bestUpdated", row\)/, "Public Bid Room board should treat best-rate changes as neutral market movement");
assert.match(bidRoomBoardSource, /speechSynthesis/, "Public Bid Room board should use browser speech announcements");
assert.match(rfxBidApiSource, /body\.action === "public_bid_room_board"[\s\S]*const token = cleanText\(body\.token\)/, "Public Bid Room board action should be handled before invitation token validation");
assert.match(rfxBidApiSource, /body\.action === "public_bid_room_request_invite"[\s\S]*const token = cleanText\(body\.token\)/, "Public invitation requests should be handled before invitation token validation");
assert.match(rfxBidApiSource, /body\.action === "public_bid_room_find_invitations"[\s\S]*const token = cleanText\(body\.token\)/, "Public invitation lookup should be handled before invitation token validation");
const publicBidBoardApiSource = rfxBidApiSource.slice(rfxBidApiSource.indexOf("async function publicBidRoomBoard"), rfxBidApiSource.indexOf("async function publicBidRoomInviteRequest"));
const publicBidInviteApiSource = rfxBidApiSource.slice(rfxBidApiSource.indexOf("async function publicBidRoomInviteRequest"), rfxBidApiSource.indexOf("async function publicInvitationVendorIds"));
const publicBidInviteVendorApiSource = rfxBidApiSource.slice(rfxBidApiSource.indexOf("async function publicInvitationVendorIds"), rfxBidApiSource.indexOf("function privateBidLink"));
const publicBidFindInviteApiSource = rfxBidApiSource.slice(rfxBidApiSource.indexOf("async function publicBidRoomFindInvitations"), rfxBidApiSource.indexOf("Deno.serve"));
assert.match(publicBidBoardApiSource, /eventId[\s\S]*eventsQuery\.eq\("id", eventId\)/, "Public Bid Room board API should support event-specific filtering");
assert.match(publicBidBoardApiSource, /\["draft", "open", "closed", "awarded"\]/, "Public Bid Room marketplace should include draft/setup opportunities loaded into Bid Room");
assert.match(publicBidBoardApiSource, /Math\.min\(1000/, "Public Bid Room board API should support a larger full-board response");
assert.match(rfxBidApiSource, /if \(status === "draft"\) return "live"/, "Draft Bid Room opportunities should appear as live marketplace opportunities");
assert.match(publicBidBoardApiSource, /carrier_identity_visible: false/, "Public Bid Room board should hide carrier identity");
assert.doesNotMatch(publicBidBoardApiSource, /vendors\(/, "Public Bid Room board should not join carrier vendor records");
assert.doesNotMatch(publicBidBoardApiSource, /invitation_token/, "Public Bid Room board should not expose invitation tokens");
assert.match(publicBidInviteApiSource, /\.from\("contact_history"\)\.insert/, "Public invitation requests should be recorded in contact history");
assert.match(publicBidInviteApiSource, /status: "requested_invite"/, "Public invitation requests should use requested_invite status");
assert.match(publicBidInviteApiSource, /source: "public_bid_room_board"/, "Public invitation requests should be traceable to the public marketplace");
assert.match(publicBidInviteApiSource, /contains\("metadata", \{ source: "public_bid_room_board", lane_id: lane\.id, email \}\)/, "Public invitation requests should avoid duplicate email and lane requests");
assert.match(publicBidFindInviteApiSource, /publicInvitationVendorIds/, "Public invitation lookup should match existing CRM vendors by verified email");
assert.match(publicBidInviteVendorApiSource, /GENERIC_EMAIL_DOMAINS/, "Public invitation lookup should avoid generic-domain matching");
assert.match(publicBidFindInviteApiSource, /eventOwnerMap/, "Public invitation lookup should resolve event owners directly when nested event data is incomplete");
assert.match(publicBidFindInviteApiSource, /resolvedPublicInvitationEvent/, "Public invitation lookup should normalize event owner context before sending private links");
assert.match(publicBidFindInviteApiSource, /matched_lane_ids/, "Public invitation lookup should return safe lane ids for card-level access state");
assert.match(publicBidFindInviteApiSource, /matched_invitations/, "Public invitation lookup should return safe invitation metadata without exposing private tokens");
assert.doesNotMatch(publicBidFindInviteApiSource, /matched_invitations:[\s\S]*privateBidLink/, "Public invitation access metadata should not expose private token links");
assert.match(publicBidFindInviteApiSource, /GMAIL_ALLOWED_SENDER/, "Public invitation lookup should use the approved Gmail sender as a legacy fallback owner");
assert.match(publicBidFindInviteApiSource, /sendGmailMessageForOwner/, "Public invitation lookup should email private links instead of returning tokens");
assert.match(publicBidFindInviteApiSource, /status: "magic_link_sent"/, "Public invitation lookup should audit magic link sends");
assert.match(publicBidFindInviteApiSource, /source: "public_bid_room_soft_login"/, "Public invitation lookup should tag soft-login contact history");
assert.match(bidRoomBoardSource, /verifiedInvitationForRow/, "Public Bid Room board should only open private bid tokens after local token verification");
assert.doesNotMatch(publicBidFindInviteApiSource, /link: privateBidLink/, "Public invitation lookup should not return private bid token links to the browser");
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
assert.match(rfxBidRatewareCaptureMigration, /bid_rate_staging_id uuid references public\.rate_staging/, "RFx carrier bids should link to their own Rateware staging rows before award");
assert.match(rfxBidRatewareCaptureMigration, /carrier_cost_rate numeric/, "Rateware staging should persist the carrier cost rate from each bid");
assert.match(rfxBidRatewareCaptureMigration, /customer_board_rate numeric/, "Rateware staging should persist the comparable board rate from commercial economics");
assert.match(rfxBidRatewareCaptureMigration, /source_bid_status text/, "Rateware staging should identify initial, revision, or best-and-final bid captures");
assert.match(rfxBidValidityMigration, /add column if not exists valid_through date/, "RFx carrier bids and Rateware staging should persist carrier offer validity dates");
assert.match(rfxBidDeadheadMigration, /add column if not exists current_unit_location text/, "RFx carrier bids and Rateware staging should persist current unit location");
assert.match(rfxBidDeadheadMigration, /add column if not exists deadhead_distance numeric/, "RFx carrier bids and Rateware staging should persist deadhead distance");
assert.match(rfxBidDeadheadMigration, /deadhead_unit[\s\S]*in \('mi', 'km'\)/, "Deadhead unit should be constrained to miles or kilometers");
assert.match(apiSource, /async function awardRfxLaneVendor/, "API should save primary and backup RFx award decisions");
assert.match(apiSource, /async function closeoutAwardedRfxToRateware/, "API should convert primary RFx awards into Rateware rows");
assert.match(apiSource, /rfx_award_closeout/, "Rateware rows created from RFx awards should carry closeout source metadata");
assert.match(rfxBidApiSource, /async function ensureBidRateStagingRow/, "Carrier portal should capture submitted bids into Rateware staging");
assert.match(rfxBidApiSource, /\.from\("rate_staging"\)[\s\S]*status: "pending_review"/, "Carrier bid captures should remain pending review in Rateware staging");
assert.match(rfxBidApiSource, /bid_rate_staging_id: insert\.data\.id/, "Carrier bid captures should link the invitation to the created staging row");
assert.match(rfxBidApiSource, /bid_rate_staging_id: update\.data\.id/, "Carrier bid revisions should keep the invitation linked to the updated staging row");
assert.match(rfxBidApiSource, /all_in_rate: rateText\(economics\.carrier_rate \?\? updatedBid\.bid_rate\)/, "Rateware staging all-in should store the carrier cost, not the adjusted board rate");
assert.match(rfxBidApiSource, /customer_board_rate: economics\.board_rate/, "Rateware staging should retain the adjusted board rate separately");
assert.match(rfxBidApiSource, /valid_through: strictDateOnly\(body\.valid_through, "Valid through"\)/, "Carrier portal API should validate submitted offer validity dates");
assert.match(rfxBidApiSource, /valid_through: validThrough/, "Carrier bid captures should copy validity into Rateware staging");
assert.match(rfxBidApiSource, /strictNonNegativeBidNumber\(body\.deadhead_distance, "Deadhead distance"\)/, "Carrier portal API should reject invalid deadhead distances");
assert.match(rfxBidApiSource, /current_unit_location: cleanText\(body\.current_unit_location\)/, "Carrier portal API should persist current unit location");
assert.match(rfxBidApiSource, /deadhead_distance: deadheadDistance/, "Carrier bid captures should copy deadhead distance into Rateware staging");
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
const rfxGmailAccessTokenSource = rfxBidApiSource.slice(rfxBidApiSource.indexOf("async function gmailAccessTokenForOwner"), rfxBidApiSource.indexOf("async function sendGmailMessageForOwner"));
assert.match(rfxGmailAccessTokenSource, /\.eq\("mailbox_email", GMAIL_ALLOWED_SENDER\)[\s\S]*\.eq\("status", "connected"\)[\s\S]*\.order\("updated_at"/, "Bid Room Gmail sender should fall back to the approved connected mailbox when owner metadata is inconsistent");
assert.match(rfxGmailAccessTokenSource, /const connectionOwner = cleanEmail\(connection\.owner_email\) \|\| owner/, "Bid Room Gmail token refresh should update the actual connection owner");
assert.match(rfxGmailAccessTokenSource, /\.eq\("owner_email", connectionOwner\)/, "Bid Room Gmail token refresh should not write against stale event owner metadata");
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
assert.match(rfxEventsHtml, /<th>Supply depth<\/th>/, "Bid Room Step 2 should show supply depth instead of a simple benchmark column");
assert.match(rfxEventsHtml, /<th>Progress<\/th>/, "Bid Room Step 2 should summarize lane progress instead of rendering shortlist controls");
assert.doesNotMatch(rfxEventsHtml, /Shortlist \/ bids/, "Bid Room Step 2 should keep carrier shortlist work out of the business book table");
assert.doesNotMatch(rfxEventsHtml, /Manual paste fallback/, "Bid Room Step 2 should not expose technical paste fallback language");
assert.match(rfxEventsHtml, /rfx-manual-lanes-body/, "Bid Room Step 2 should allow quick manual lane entry");
assert.match(rfxEventsHtml, /import-manual-rfx-lanes-button/, "Bid Room Step 2 should import manually captured lanes");
assert.match(rfxEventsSource, /function manualLaneImportRows/, "Bid Room Step 2 should normalize manual lane rows before import");
assert.match(rfxEventsSource, /importManualLanesButton\?\.addEventListener\("click"/, "Bid Room Step 2 should wire manual lane import to the RFx lane API");
assert.match(rfxEventsHtml, /toggle-rfx-lane-edit/, "Bid Room Step 2 should allow editing loaded lanes");
assert.match(rfxEventsHtml, /save-rfx-lane-edits/, "Bid Room Step 2 should save edits across loaded lanes");
assert.match(rfxEventsSource, /function renderEditableLaneRow/, "Bid Room Step 2 should render imported lanes as editable rows");
assert.match(rfxEventsSource, /function saveRfxLaneEdits/, "Bid Room Step 2 should save loaded lane edits");
assert.match(rfxEventsSource, /function renderSupplyDepthCell/, "Bid Room Step 2 should render supply depth by lane");
assert.match(rfxEventsSource, /rfx-supply-meter/, "Bid Room Step 2 should show a thermometer-style supply signal");
assert.match(rfxEventsSource, /Typical range/, "Bid Room supply depth should use plain operational rate-range language");
assert.match(rfxEventsSource, /rawProbability === null/, "Bid Room supply depth should not convert missing target probability into zero");
assert.match(rfxEventsSource, /History \$\{historyCurrencies/, "Bid Room supply depth should explain currency mismatch without showing false converted rates");
assert.doesNotMatch(rfxEventsSource, /P50 \$/, "Bid Room supply depth should not expose percentile labels in the UI");
assert.doesNotMatch(rfxEventsSource, /P75 \$/, "Bid Room supply depth should not expose percentile labels in the UI");
assert.match(rfxEventsSource, /function insertClipboardHtmlIntoTextarea/, "Bid Room lane detail editors should accept pasted HTML source");
assert.match(rfxEventsSource, /getData\("text\/html"\)/, "Bid Room lane detail paste should prefer clipboard HTML when available");
assert.match(rfxEventsSource, /manualLanesBody\?\.addEventListener\("paste"/, "Manual lane detail editor should support pasted HTML");
assert.match(rfxEventsSource, /lanesBody\?\.addEventListener\("paste"/, "Loaded lane detail editor should support pasted HTML");
assert.match(rfxDefaultTemplateMigration, /{{lane_table}}/, "Default RFx carrier invitation should include the business book table");
assert.doesNotMatch(rfxEventsSource, /function laneBidInstructionSummary/, "Bid Room outreach preview should keep invitation lanes simple and push details to the Bid Room");
assert.doesNotMatch(apiSource, /function outreachLaneBidInstructionSummary/, "Rateware API outreach drafts should keep invitation lanes simple and push details to the Bid Room");
assert.match(rfxBilingualTemplateMigration, /RFx carrier invitation - English/, "Bid Room should provide an English default invitation template");
assert.match(rfxBilingualTemplateMigration, /RFx carrier invitation - Spanish/, "Bid Room should provide a Spanish default invitation template");
assert.match(rfxBilingualTemplateMigration, /logistics model, operating criteria, business rules, service specifications, and additional notes/, "English template should direct carriers to the Bid Room for operational details");
assert.match(rfxBilingualTemplateMigration, /modelo logistico, criterios de operacion, reglas de negocio, especificaciones de servicio y otras notas/, "Spanish template should direct carriers to the Bid Room for operational details");
assert.match(rfxSpanishTemplateNameMigration, /name like 'RFx carrier invitation - Espa%'/, "Spanish template migration should normalize old accented or mojibake names");
assert.match(rfxTemplateSignatureMigration, /https:\/\/www\.linkedin\.com\/in\/andresgzz88\//, "RFx email templates should include the Marksman LinkedIn signature link");
assert.match(rfxTemplateSignatureMigration, /https:\/\/www\.heymarksman\.com\//, "RFx email templates should include the Marksman website signature link");
assert.match(rfxTemplateSignatureMigration, /Confidentiality &amp; Privacy Notice/, "RFx email templates should include the confidentiality and privacy notice");
assert.match(rfxTemplateSignatureMigration, /XBF SISTEMAS LOG&Iacute;STICOS/, "RFx email templates should include the full company privacy scope");
assert.ok(existsSync(marksmanSignatureAsset), "RFx email templates should have a hosted Marksman signature image asset");
assert.match(rfxTemplateSignatureImageMigration, /marksman-email-signature\.png/, "RFx email templates should render the Marksman signature image");
assert.match(rfxTemplateProfileLinkMigration, /\{\{profile_link\}\}/, "RFx email templates should include a carrier profile update link");
assert.match(rfxTemplateProfileLinkMigration, /Keep your carrier profile current/, "English RFx template should prompt carriers to refresh CRM profile data");
assert.match(rfxTemplateProfileLinkMigration, /Manten actualizado tu perfil de carrier/, "Spanish RFx template should prompt carriers to refresh CRM profile data");
assert.match(apiSource, /function vendorProfileLinksForInvitations/, "RFx outreach drafts should generate carrier profile links in batch");
assert.match(apiSource, /generated_from: "rfx_outreach"/, "RFx-created profile links should be traceable to outreach");
assert.match(apiSource, /profile_link: context\.profile_link/, "RFx outreach messages should preserve the profile link in metadata");
assert.match(rfxEventsSource, /Carrier profile link \{\{profile_link\}\}/, "RFx template editor should label the profile link token");
assert.match(rfxEventsSource, /function canonicalRfxInvitationTemplateName/, "Bid Room templates should canonicalize RFx invitation template names by language");
assert.match(rfxEventsSource, /function visibleOutreachTemplates/, "Bid Room template select should collapse duplicate RFx invitation templates by language");
assert.match(rfxEventsHtml, /id="restore-rfx-template-original"/, "Bid Room template editor should offer a persistent restore-original action");
assert.match(rfxEventsSource, /function originalRfxInvitationTemplate/, "Bid Room template restore should resolve the system default by language");
assert.match(rfxEventsSource, /await deleteOutreachTemplate\(template\.id\)/, "Restoring a saved workspace template should remove only the workspace override");
assert.match(rfxEventsSource, /Original template restored/, "Bid Room template restore should confirm the active system template");
{
  const saveTemplateStart = rfxEventsSource.indexOf("async function saveSelectedRfxTemplate");
  const saveTemplateEnd = rfxEventsSource.indexOf("async function publishSelectedWhatsappTemplate", saveTemplateStart);
  const saveTemplateBody = rfxEventsSource.slice(saveTemplateStart, saveTemplateEnd);
  assert.match(saveTemplateBody, /ownedCanonicalTemplate/, "Saving a default RFx invitation template should reuse the workspace canonical template");
  assert.match(saveTemplateBody, /await updateOutreachTemplate\(targetTemplate\.id, payload\)/, "Saving an existing RFx invitation template should update it instead of creating another copy");
  assert.doesNotMatch(saveTemplateBody, /`[^`]*- custom[^`]*`/, "Saving RFx invitation templates should not create named custom copies");
}
assert.match(rfxEventsHtml, /id="rfx-draft-search"/, "Bid Room draft queue should expose a vendor/email search box");
assert.doesNotMatch(rfxEventsHtml, /rfx-touchpoint-summary/, "Bid Room Step 4 should not duplicate drafts in an invitation tracking section");
assert.match(rfxEventsSource, /function filteredDraftRows/, "Bid Room draft queue should filter rows before rendering");
assert.match(rfxEventsSource, /draftSearchText\(message\)/, "Draft queue search should match against each message payload");
{
  const draftSearchStart = rfxEventsSource.indexOf("function draftSearchText");
  const draftSearchEnd = rfxEventsSource.indexOf("function normalizeDraftSearch", draftSearchStart);
  const draftSearchBody = rfxEventsSource.slice(draftSearchStart, draftSearchEnd);
  assert.doesNotMatch(draftSearchBody, /message\.text_body|message\.whatsapp_text|message\.sender_email|metadata\.bid_link|metadata\.profile_link/, "Draft queue search should not match common email body, signature, sender, or shared links");
}
assert.match(rfxEventsSource, /\.normalize\("NFD"\)/, "Draft queue search should be accent-insensitive");
assert.match(rfxEventsSource, /addEventListener\("search", applyDraftQueueSearch\)/, "Draft queue search should react when the browser clears a search input");
assert.match(rfxEventsSource, /addEventListener\("input", scheduleDraftQueueSearch\)/, "Draft queue search should debounce typing before rerendering the table");
assert.match(rfxEventsSource, /selectableEmailDrafts\(rows\)\.forEach/, "Select sendable should add filtered drafts instead of replacing previous selections");
assert.doesNotMatch(rfxEventsSource, /draftRowsForEvent\(\)\.slice\(0, 200\)/, "Draft queue selection should not be capped to the first 200 unfiltered rows");
for (const source of [rfxInvitationTableSource, apiInvitationTableSource]) {
  assert.doesNotMatch(source, /Tu tarifa|Tu capacidad|Rango objetivo|Millas|Peso/, "RFx invitation lane table should not include carrier response or heavy analysis columns");
  assert.match(source, /Weekly<br>volume/, "RFx invitation lane table should keep a compact weekly volume column");
  assert.match(source, /Volumen<br>semanal/, "RFx invitation lane table should localize Spanish headers");
  assert.match(source, /Target/, "RFx invitation lane table should keep the target rate column");
}
assert.match(rfxBilingualTemplateMigration, /active = false[\s\S]*Marksman RFx lane book invitation/, "Long Marksman template should be hidden from the default workflow");
assert.match(rfxServiceSource, /update_rfx_lane/, "RFx service should expose loaded lane updates");
assert.match(apiSource, /body\.action === "update_rfx_lane"/, "Rateware API should update existing RFx lanes");
assert.match(apiSource, /function normalizeRfxLanePatch/, "Rateware API should normalize partial RFx lane updates");
assert.match(apiSource, /function supplyDepthForLane/, "Rateware API should calculate RFx lane supply depth");
assert.match(apiSource, /target_probability_reason/, "RFx lane supply depth should explain missing target probability");
assert.match(apiSource, /comparable_quote_count/, "RFx lane supply depth should separate route supply from same-currency price history");
for (const field of ["logistics_model", "operation_criteria", "business_rules", "service_specifications", "other_notes"]) {
  assert.match(rfxLaneDetailSectionsMigration, new RegExp(`add column if not exists ${field} text`), `RFx lanes should persist ${field}`);
  assert.match(rfxEventsSource, new RegExp(`key: "${field}"`), `RFx lane template should expose ${field}`);
  assert.match(rfxEventsSource, new RegExp(`data-manual-lane-field="${field}"`), `manual lane detail should edit ${field}`);
  assert.match(rfxEventsSource, new RegExp(`data-rfx-lane-field="\\$\\{escapeHtml\\(field\\)\\}"`), `loaded lane detail should edit ${field}`);
  assert.match(apiSource, new RegExp(`${field}: cleanText`), `Rateware API should normalize ${field}`);
}
assert.match(rfxEventsSource, /notas_adicionales: "other_notes"/, "RFx lane import should map Spanish RFI additional notes");
assert.match(rfxEventsSource, /elementos_adicionales_en_el_remolque_camion_almacenamiento_de_carga_etc: "service_specifications"/, "RFx lane import should map RFI service specification notes");
assert.match(rfxEventsSource, /function laneDetailSections/, "Bid Room should render lane detail sections");
assert.match(rfxBidSource, /function laneDetailSections/, "Carrier portal should render lane detail sections");
assert.match(rfxBidSource, /function renderLaneDetailValue/, "Carrier portal should render pasted HTML lane detail as readable rich text");
assert.match(rfxBidSource, /label class="\$\{answer === value \? "is-selected" : ""\}"/, "Carrier fit confirmations should expose a clear selected response state");
assert.match(stylesSource, /\.segment-rubric-controls \{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, "Carrier fit confirmations should keep all four answers aligned in one desktop row");
assert.match(rfxBidApiSource, /comment: \(cleanText\(record\.comment\) \|\| ""\)\.slice\(0, 1200\)/, "Carrier fit checklist saves should allow blank exception comments");
assert.match(rfxBidSource, /sanitizeRichTextNode/, "Carrier portal should sanitize lane detail HTML before inserting it");
assert.match(rfxBidSource, /bid-lane-detail-disclosure/, "Carrier portal should collapse selected-lane details so they do not duplicate the RFx master package");
assert.doesNotMatch(rfxBidSource, /<p>\$\{escapeHtml\(value\)\}<\/p>/, "Carrier portal should not show pasted lane detail HTML as escaped source");
assert.match(rfxBidSource, /function renderCarrierLaneSwitcher/, "Carrier portal should expose all invited event lanes before the selected lane bid form");
assert.match(rfxBidSource, /function segmentFitProgress/, "Carrier master package should summarize confirmations by segment");
assert.match(rfxBidSource, /function activeMasterSegmentIndex/, "Carrier master package should open the first segment that still needs action");
assert.match(rfxBidSource, /master-package-route-disclosure/, "Carrier route schedule should collapse when the RFx package has many lanes");
assert.match(rfxBidSource, /import \* as XLSX from "https:\/\/esm\.sh\/xlsx@0\.18\.5"/, "Carrier portal should load XLSX support for bid templates");
assert.match(rfxBidSource, /import\("https:\/\/esm\.sh\/exceljs@4\.4\.0\?bundle"\)/, "Carrier portal should use ExcelJS for XLSX dropdown data validations");
assert.match(rfxBidSource, /const BID_TEMPLATE_COLUMNS = \[/, "Carrier portal should define a prefilled XLSX bid template schema");
assert.match(rfxBidSource, /function downloadBidTemplate/, "Carrier portal should download a prefilled XLSX bid template");
assert.match(rfxBidSource, /function parseBidTemplateFile/, "Carrier portal should parse uploaded bid templates");
assert.match(rfxBidSource, /function validateBidTemplateRow/, "Carrier portal should validate uploaded XLSX bid rows before submit");
assert.match(rfxBidSource, /dataValidation = validation/, "Carrier portal XLSX template should write dropdown and numeric validations");
assert.match(rfxBidSource, /Instructions - Instrucciones/, "Carrier portal XLSX template should include bilingual instructions with an Excel-safe worksheet name");
assert.match(rfxBidSource, /Commercial model \/ Modelo comercial/, "Carrier portal XLSX template should use bilingual headers");
assert.match(rfxBidSource, /Required columns/, "Carrier portal XLSX instructions should explain only the required bid columns");
assert.match(rfxBidSource, /recommended, but not required/i, "Carrier portal XLSX template should mark non-blocking recommended columns");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.weekly_capacity, "bid-capacity", "Weekly capacity", false\)/, "Carrier portal should not require weekly capacity to submit a bid");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.transit_days, "bid-transit-days", "Transit days", false\)/, "Carrier portal should not require transit days to submit a bid");
assert.match(rfxBidSource, /data-download-bid-template/, "Carrier portal should render a bid template download action");
assert.match(rfxBidSource, /data-submit-bid-template/, "Carrier portal should require confirmation before submitting XLSX bids");
assert.match(rfxBidSource, /callBidApi\("submit_bid", \{ token: row\.invitation_token, \.\.\.row\.draft \}\)/, "Carrier portal should submit each XLSX row through the normal tokenized bid API");
assert.match(rfxBidSource, /const BID_PORTAL_COPY = \{/, "Carrier portal should provide English and Spanish UI copy");
assert.match(rfxBidSource, /data-private-language-toggle="en"/, "Carrier portal should expose an English/Spanish language toggle");
assert.match(rfxBidSource, /function eventMarketplaceUrl/, "Carrier portal should build a contextual public Bid Room board URL");
assert.match(rfxBidSource, /return "\.\/bid-room-board\.html"/, "Carrier portal should link bid-specific pages to the full public live board");
assert.match(stylesSource, /\.carrier-bid-template-tools/, "Carrier portal should style the XLSX bid template workflow");
assert.match(stylesSource, /\.bid-lane-detail-sections[\s\S]*grid-template-columns: minmax\(280px/, "Carrier portal lane detail sections should use a wider readable layout");
assert.match(apiSource, /invitationGroup\.length > 1 \? "&view=book" : ""/, "RFx outreach links with multiple lanes should open the carrier business book view");
assert.match(rfxEventsSource, /portalUrl\(invitation\.invitation_token, targetRows\.length\)/, "Bid Room preview should show the same multi-lane business book link behavior");
assert.match(rfxBidApiSource, /logistics_model,operation_criteria,business_rules,service_specifications,carrier_requirements,other_notes,notes/, "Carrier public board should select RFx lane detail sections");
assert.match(rfxEventsSource, /rfx-lane-progress-cell/, "Bid Room Step 2 should render compact lane progress");
assert.match(rfxEventsSource, /Needs participants/, "Bid Room Step 2 should describe missing carrier work as participant work");
assert.doesNotMatch(rfxEventsSource, /data-rfx-save-bid/, "Bid Room Step 2 should not expose bid editing controls");
assert.doesNotMatch(rfxEventsSource, /data-rfx-copy-link/, "Bid Room Step 2 should not expose private bid links");
assert.doesNotMatch(rfxEventsSource, /data-rfx-auto-shortlist/, "Bid Room Step 2 should not expose per-row shortlist actions");
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
assert.match(rfxBidApiSource, /DEFAULT_COMMERCIAL_SHARE_PCT = 3/, "Carrier portal API should default cost-plus and carrier-share percentages to 3 percent");
assert.match(rfxBidApiSource, /XBF_BUY_SELL_DEFAULT_MARKUP_PCT = 12/, "Carrier portal API should default XBF buy-sell markup to 12 percent");
assert.match(rfxBidApiSource, /strictOptionalPercentWithDefault\(body\.marksman_margin_pct, "Suggested margin to share", 2, 5, DEFAULT_COMMERCIAL_SHARE_PCT\)/, "Carrier portal API should allow blank cost-plus percentage and default it");
assert.match(rfxBidApiSource, /strictOptionalPercentWithDefault\(body\.carrier_share_pct, "Carrier invoice share", 2, 5, DEFAULT_COMMERCIAL_SHARE_PCT\)/, "Carrier portal API should allow blank carrier-share percentage and default it");
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
assert.match(rfxBidSource, /private-bid-sound/, "Carrier portal should expose private multimedia alert controls");
assert.match(rfxBidSource, /PRIVATE_BID_ANNOUNCEMENTS/, "Carrier portal should define private bid room alert phrases");
assert.match(rfxBidSource, /Place new bid\. Your offer has been displaced\./, "Carrier portal should announce rank displacement");
assert.match(rfxBidSource, /rankChanged: "Your rank changed\. Review your offer\."/,
  "Carrier portal should have a neutral rank-change alert for self-updates");
assert.match(rfxBidSource, /ownOfferChanged[\s\S]*queuePrivateBidAlert\("rankChanged"/,
  "Carrier portal should not announce displacement when the carrier's own update changed rank");
assert.match(rfxBidSource, /Bid submitted\./, "Carrier portal should announce successful bid submission");
assert.match(rfxBidSource, /New message in Bid Room chat\./, "Carrier portal should announce new chat messages");
assert.match(rfxBidSource, /speechSynthesis/, "Carrier portal should use browser speech announcements");
assert.match(rfxBidSource, /detectPrivateBidRoomSignals/, "Carrier portal should compare live board snapshots before alerting");
assert.match(rfxBidSource, /snapshot\.historyCount > previous\.historyCount/, "Carrier portal rank alerts should treat own bid history changes as self-updates");
assert.match(rfxBidSource, /snapshot\.currentRate !== previous\.currentRate/, "Carrier portal rank alerts should not announce competitor displacement when the carrier changed its own rate");
assert.match(rfxBidSource, /detectPrivateChatSignals/, "Carrier portal should compare chat snapshots before alerting");
assert.match(rfxBidSource, /function bidDraftWarnings/, "Carrier portal should validate bid completeness before submit");
assert.match(rfxBidSource, /function validateBidDraft/, "Carrier portal should block invalid bid submissions before API submit");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.bid_rate, "bid-rate", "All-in rate"\)/, "Carrier portal should require numeric all-in rate");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.weekly_capacity, "bid-capacity", "Weekly capacity", false\)/, "Carrier portal should validate capacity only when provided");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.transit_days, "bid-transit-days", "Transit days", false\)/, "Carrier portal should validate transit days only when provided");
assert.match(rfxBidSource, /id="bid-valid-through"/, "Carrier portal should ask carriers for offer validity in the guided bid form");
assert.match(rfxBidSource, /valid_through: card\.querySelector\("#bid-valid-through"\)\?\.value \|\| ""/, "Carrier portal should collect offer validity from the guided bid form");
assert.match(rfxBidSource, /Valid through \/ Vigente hasta/, "Carrier XLSX bid template should include a bilingual validity column");
assert.match(rfxBidSource, /valid_through: quickBidField\(rowElement, "valid_through"\)/, "Carrier quick bid rows should save offer validity");
assert.match(rfxBidSource, /id="bid-current-unit-location"/, "Carrier portal should ask where the available unit is located");
assert.match(rfxBidSource, /id="bid-deadhead-distance"/, "Carrier portal should ask for empty miles or kilometers to pickup");
assert.match(rfxBidSource, /deadhead_distance: card\.querySelector\("#bid-deadhead-distance"\)\?\.value \|\| ""/, "Carrier portal should collect deadhead from the guided bid form");
assert.match(rfxBidSource, /validateNonNegativeNumberIssue\(draft\.deadhead_distance, "bid-deadhead-distance", "Deadhead distance", false\)/, "Carrier portal should validate deadhead as optional non-negative distance");
assert.match(rfxBidSource, /Current unit location \/ Ubicacion unidad/, "Carrier XLSX bid template should include current unit location");
assert.match(rfxBidSource, /Deadhead distance \/ Vacio mi-km/, "Carrier XLSX bid template should include deadhead distance");
assert.match(rfxBidSource, /Deadhead unit \/ Unidad deadhead/, "Carrier XLSX bid template should include deadhead unit");
assert.match(rfxBidSource, /nonNegativeNumberBlank/, "Carrier XLSX bid template should validate optional deadhead distance");
assert.match(rfxBidSource, /deadhead_distance: rowElement\.dataset\.deadheadDistance \|\| ""/, "Carrier quick bid rows should preserve deadhead details when saving inline");
assert.match(rfxBidSource, /function commercialStructureConfig/, "Carrier portal should explain each commercial structure");
assert.match(rfxBidSource, /syncCommercialStructureFields/, "Carrier portal should show only the applicable commercial percentage input");
assert.match(rfxBidSource, /validatePercentIssue\(draft\.marksman_margin_pct, "bid-marksman-margin", "Suggested margin to share %", \{ required: false, procurementRange: true \}\)/, "Carrier portal should validate optional suggested margin range for cost-plus");
assert.match(rfxBidSource, /validatePercentIssue\(draft\.carrier_share_pct, "bid-carrier-share", "Carrier invoice share %", \{ required: false, procurementRange: true \}\)/, "Carrier portal should validate optional invoice share range for carrier-share");
assert.match(rfxBidSource, /Suggested XBF margin %/, "Carrier portal should expose an XBF margin label when XBF buy-sell is selected");
assert.match(rfxBidSource, /XBF_BUY_SELL_DEFAULT_MARKUP_PCT = 12/, "Carrier portal should explain the 12 percent XBF buy-sell default");
assert.match(rfxBidApiSource, /function commercialRateEconomics/, "Carrier portal API should separate carrier rate, board rate, commission and markup economics");
assert.match(rfxBidApiSource, /commercialModel === "carrier_share"[\s\S]*board_rate: roundMoney\(carrierRate\)[\s\S]*commission_fee: roundMoney\(commissionFee\)/, "Carrier-share bids should keep the carrier price unchanged and calculate invoice-share commission");
assert.match(rfxBidApiSource, /commercialModel === "xbf_buy_sell"[\s\S]*boardRate = carrierRate \* \(1 \+ marksmanMarginPct \/ 100\)/, "XBF buy-sell bids should apply the selected or default buy-sell markup");
assert.match(rfxEventsSource, /XBF_BUY_SELL_DEFAULT_MARKUP_PCT = 12/, "Internal Bid Room should use the same XBF buy-sell default markup");
assert.match(rfxEventsSource, /model === "xbf_buy_sell" \? XBF_BUY_SELL_DEFAULT_MARKUP_PCT : DEFAULT_COMMERCIAL_SHARE_PCT/, "Internal Bid Room should default XBF and regular commercial percentages consistently");
assert.match(rfxBidSource, /function commercialRateDetails/, "Carrier portal should explain carrier price, board price and commercial fee");
assert.match(rfxBidSource, /setFormValue\("#bid-rate", firstDefined\(source\.carrier_bid_rate, invitation\.bid_rate, source\.amount, ""\)\)/, "Editing submitted bids should preload the carrier rate before the board rate");
assert.match(rfxEventsSource, /function bidCommercialEconomics/, "Internal Bid Room should compare and award against commercial board economics");
assert.match(rfxBidSource, /thread_type: threadType/, "Carrier portal chat should post to the selected chat scope");
assert.match(rfxBidSource, /\["carrier_private", "event_group", "lane_group"\]/, "Carrier portal chat should expose private, event and lane scopes");
assert.match(rfxBidSource, /carrierChatLabel\(type\)/, "Carrier portal chat should label each chat scope");
assert.match(rfxEventsSource, /const BID_ROOM_EVENT_THREAD_TYPE = "event_group"/, "Internal Bid Room chat should use event group as the only visible compose scope");
assert.doesNotMatch(rfxEventsHtml, /id="rfx-chat-lane"|id="rfx-chat-vendor"|Carrier private|Lane group/, "Internal Bid Room chat should not expose lane or private compose controls");
assert.match(rfxBidSource, /Best alternative needs equipment or a positive unit count/, "Carrier portal should validate alternative offers");
assert.match(rfxBidSource, /Delivery ETA must be after pickup ETA/, "Carrier portal should validate pickup and delivery ETA order");
assert.match(rfxBidSource, /focusBidValidationField/, "Carrier portal should focus the first invalid field");
assert.match(rfxBidSource, /clearBidValidationState/, "Carrier portal should clear invalid field markers as the carrier edits");
assert.match(rfxBidSource, /function updateBidReviewSummary/, "Carrier portal should update the review summary as carriers edit");
assert.match(rfxBidSource, /function renderBidHistory/, "Carrier portal should render offer revision history");
assert.match(rfxBidSource, /carrier-bid-history/, "Carrier portal should include offer history in the bid room");
assert.match(rfxBidSource, /data-edit-current-offer/, "Carrier portal should let carriers edit their submitted live offer row");
assert.match(rfxBidSource, /function hydrateBidFormFromOffer/, "Carrier portal should preload the bid form from the current submitted offer");
assert.match(rfxBidSource, /data-bid-submit-button/, "Carrier portal should relabel submit as update when a published offer exists");
assert.match(rfxBidSource, /bid-editor-modal/, "Carrier portal should render the advanced offer editor as a modal");
assert.match(rfxBidSource, /data-open-bid-editor/, "Carrier portal should open the advanced offer editor from a compact launcher");
assert.match(rfxBidSource, /data-close-bid-editor/, "Carrier portal should close the advanced offer editor without page navigation");
assert.match(rfxBidApiSource, /revisionType = bestFinal \? "best_final" : previousBidRate !== null \? "revision" : "initial"/, "Carrier portal API should classify repeated submitted bids as revisions");
assert.match(rfxBidSource, /carrier-quick-bid-grid/, "Carrier portal should render an inline editable lane bid grid");
assert.match(rfxBidSource, /data-save-quick-bid/, "Carrier portal should save or update bids directly from each lane row");
assert.match(rfxBidSource, /function saveQuickBidRow/, "Carrier portal should submit quick row edits through the tokenized bid API");
assert.match(rfxBidSource, /callBidApi\("submit_bid", \{ token: rowToken, \.\.\.draft \}\)/, "Carrier quick bid grid should submit the selected row token instead of forcing lane navigation");
assert.match(rfxBidApiSource, /notes: cleanText\(row\.notes\)/, "Carrier business book API should expose notes so quick row edits can preserve existing bid notes");
assert.match(rfxBidSource, /data-decline-invitation/, "Carrier portal should let carriers reject an invited lane before bidding");
assert.match(rfxBidSource, /data-withdraw-offer/, "Carrier portal should let carriers withdraw an active published offer");
assert.match(rfxBidSource, /data-decline-quick-invitation/, "Carrier quick bid grid should expose lane-level rejection");
assert.match(rfxBidSource, /data-withdraw-quick-bid/, "Carrier quick bid grid should expose lane-level offer withdrawal");
assert.match(rfxBidSource, /callBidApi\(action, \{ token: actionToken \}\)/, "Carrier reject and withdraw actions should use the selected invitation token");
assert.match(rfxBidApiSource, /body\.action === "decline_invitation" \|\| body\.action === "withdraw_bid"/, "Carrier portal API should expose separate reject and withdraw actions");
assert.match(rfxBidApiSource, /invitation_status: "declined"/, "Rejecting an invitation should persist a declined status");
assert.match(rfxBidApiSource, /invitation_status: "withdrawn"[\s\S]*bid_rate: null/, "Withdrawing an offer should remove the active bid rate while preserving history");
assert.match(rfxBidApiSource, /status: "withdrawn"/, "Withdrawing an offer should audit a withdrawn contact history event");
assert.match(rfxBidWithdrawnStatusMigration, /'withdrawn'/, "Bid Room status constraint should allow withdrawn offers");
assert.match(stylesSource, /carrier-bid-workflow/, "Carrier portal guided bid flow should have compact navigation styling");
assert.match(stylesSource, /bid-offer-launcher/, "Carrier portal should keep the advanced bid editor launcher compact");
assert.match(stylesSource, /bid-editor-panel/, "Carrier portal should style the advanced offer editor as a focused popup panel");
assert.match(stylesSource, /bid-review-summary-grid/, "Carrier portal review summary should have card styling");
assert.match(stylesSource, /bid-room-alert-feed/, "Carrier portal multimedia alerts should have compact hero styling");
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
assert.match(apiSource, /function googleChatThreadTarget/, "Google Chat sync should target the persisted Chat thread name before creating a new thread");
assert.match(apiSource, /REPLY_MESSAGE_OR_FAIL/, "Google Chat sync should fail instead of creating stray messages when a real thread already exists");
assert.match(apiSource, /url\.searchParams\.set\("messageReplyOption", "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD"\)/, "Google Chat webhook fallback should include explicit thread reply behavior");
assert.match(rfxBidApiSource, /function googleChatThreadTarget/, "Carrier portal Google Chat sync should use the same thread targeting rules");
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
assert.match(apiSource, /\.from\("outreach_messages"\)[\s\S]*\.limit\(1000\)/, "Outreach draft queue should load up to 1000 rows for large Bid Room waves");
assert.match(outreachSenderMigration, /add column if not exists sender_email text/, "Outreach schema should store sender identity");
assert.match(settingsHtml, /sync-gmail-bounces-button/, "Settings should expose Gmail delivery failure sync");
assert.match(settingsServiceSource, /sync_gmail_bounces/, "Settings service should call Gmail bounce sync");
assert.match(apiSource, /https:\/\/www\.googleapis\.com\/auth\/gmail\.readonly/, "Gmail OAuth should request read access for delivery failure monitoring");
assert.match(apiSource, /function syncGmailBounces/, "Rateware API should sync Gmail delivery failures");
assert.match(apiSource, /email_suppression_list/, "Rateware API should maintain a suppressed email list");
assert.match(apiSource, /status: "bounced"/, "Outreach send should mark hard bounced emails as bounced");
assert.match(emailBounceSuppressionMigration, /create table if not exists public\.email_suppression_list/, "Email bounce suppression should have a durable table");
assert.match(emailBounceSuppressionMigration, /'bounced'/, "Outreach message status should support bounced delivery failures");
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
assert.match(apiSource, /function apiErrorInfo/, "Rateware API should serialize object errors before returning them to the UI");
assert.match(apiSource, /function apiErrorStatus/, "Rateware API should return appropriate status codes for serialized backend errors");
assert.match(apiSource, /function safeOperationalError/, "Rateware API errors should be sanitized before returning or auditing them");
assert.match(apiSource, /event: "rateware_api\.error"/, "Rateware API should emit structured server-side error logs");
assert.match(apiSource, /incident_id: incidentId/, "Rateware API failures should carry a correlation incident ID");
assert.match(apiSource, /cause_chain: errorCauseChain/, "Rateware API should preserve the nested backend cause chain");
assert.match(apiSource, /stack: safeOperationalValue\(errorInfo\.stack/, "Backend stacks should remain sanitized and server-side only");
assert.match(ratewareApiClientSource, /error\.incidentId = data\?\.incident_id/, "Rateware API client should preserve backend incident IDs");
assert.match(apiSource, /function observabilityAuditErrorDetail/, "Observability should render exact sanitized backend diagnostics");
assert.match(apiSource, /const explicitAuthFailure = \[/, "Rateware API should classify only explicit authentication failures as 401");
assert.doesNotMatch(apiSource.slice(apiSource.indexOf("function apiErrorStatus"), apiSource.indexOf("function bulkFilterKey")), /message\.includes\("kinde"\)|message\.includes\("jwt"\)/, "Database errors mentioning Kinde or JWT should not be misclassified as session failures");
assert.match(apiSource, /action\.endsWith\("\.error"\)[\s\S]*observabilityAuditErrorDetail\(auditMetadata\)/, "Observability should expose sanitized details for provider and queue errors");
assert.match(apiSource, /BULK_SEND_LIMIT = 100/, "API should cap direct Gmail send batches");
assert.match(apiSource, /BULK_SHORTLIST_VENDOR_LIMIT = 1000/, "Bid Room participant shortlist should support up to 1,000 vendors per request");
assert.match(apiSource, /BULK_FILTER_CONFIRM_THRESHOLD = 250/, "API should require confirmation for large filtered database actions");
assert.match(rfxBidApiSource, /bid_support_reply/, "Bid Room API should expose contextual support replies");
assert.match(rfxBidApiSource, /function bidSupportAnswerFromContext/, "Bid Room support should answer from scoped context");
assert.match(rfxBidApiSource, /function bidSupportAnswerFromOpportunityContext/, "Bid Room support should answer from full opportunity context");
assert.match(rfxBidApiSource, /invited_lanes/, "Bid Room support should include all invited lanes in the private context");
assert.match(rfxBidApiSource, /supportSelectLane\(question/, "Bid Room support should select a lane mentioned in the carrier question");
assert.match(rfxBidApiSource, /supportCleanDetailText/, "Bid Room support should sanitize lane detail HTML before answering");
assert.match(rfxBidApiSource, /function supportPromptOptions/, "Bid Room support should return guided next-question prompts");
assert.match(rfxBidApiSource, /function supportQuestionIntent/, "Bid Room support prompts should change by question intent");
assert.match(rfxBidApiSource, /lane_detail/, "Bid Room support should guide from route details into deeper lane sections");
assert.match(rfxBidApiSource, /What should I change first\?/, "Bid Room support should suggest deeper ranking follow-up questions");
assert.match(rfxBidApiSource, /let support = bidSupportAnswerFromOpportunityContext/, "Bid Room support should keep a deterministic fallback before ticket escalation");
assert.match(rfxBidApiSource, /bidSupportAiAnswer\(question/, "Bid Room support can use AI only after building deterministic context");
assert.match(rfxBidApiSource, /supportConversationalAnswer/, "Bid Room support should normalize answers for conversational replies");
assert.match(rfxBidApiSource, /status: "support_ticket"/, "Bid Room support should escalate unknown questions as support tickets");
assert.match(rfxBidSource, /id="bid-support-agent"/, "Private Bid Room should render a contextual support agent");
assert.match(rfxBidSource, /function askBidSupport/, "Private Bid Room should call the support agent");
assert.match(rfxBidSource, /function setBidSupportOpen/, "Private Bid Room support should open as a chat pop-up");
assert.match(rfxBidSource, /data-bid-support-toggle/, "Private Bid Room support should have a floating chat launcher");
assert.match(rfxBidSource, /supportAnswer/, "Private Bid Room support should trigger multimedia support replies");
assert.match(rfxBidSource, /Ask about this opportunity/, "Private support should describe opportunity-level help, not only one bid");
assert.match(rfxBidSource, /Opportunity summary/, "Private support should include an opportunity summary prompt");
assert.match(rfxBidSource, /function setCarrierChatOpen/, "Private Bid Room chat should open as a pop-up");
assert.match(rfxBidSource, /data-carrier-chat-toggle/, "Private Bid Room chat should have a floating chat launcher");
assert.match(rfxBidSource, /renderBookFitSummary/, "Private business book should keep lane fit compact in each row");
assert.match(rfxBidSource, /rateware\.privateBidRoom\.sound"\) !== "off"/, "Private Bid Room should start with sound enabled unless the carrier turns it off");
assert.match(rfxBidSource, /PRIVATE_BID_SOUND_DEFAULT_VERSION/, "Private Bid Room should reset old sound-off defaults");
assert.match(rfxBidSource, /data-bid-support-focus/, "Private Bid Room should expose top-level support access");
assert.match(rfxBidSource, /function armPrivateBidAudio/, "Private Bid Room should arm multimedia alerts on first interaction");
assert.match(bidRoomBoardHtml, /id="public-board-support-form"/, "Public Bid Room board should render public support");
assert.match(bidRoomBoardHtml, /public-board-support-widget/, "Public Bid Room support should be a floating assistant widget");
assert.match(bidRoomBoardHtml, /public-board-support-followup/, "Public Bid Room support should show follow-up email only when a ticket is needed");
assert.match(bidRoomBoardHtml, /id="public-board-support-jump"/, "Public Bid Room board should expose header support access");
assert.match(rfxBidSource, /bid-support-suggestions/, "Private Bid Room support should render guided follow-up prompts");
assert.match(bidRoomBoardSource, /data-public-support-prompt/, "Public Bid Room support should render guided follow-up prompts");
assert.match(bidRoomBoardSource, /function setPublicSupportOpen/, "Public Bid Room support should open as a chat pop-up");
assert.match(bidRoomBoardSource, /supportFollowup\?\.removeAttribute\("hidden"\)/, "Public support should reveal email follow-up only during ticket escalation");
assert.match(bidRoomBoardSource, /function askPublicSupport/, "Public Bid Room board should call the support agent");
assert.match(bidRoomBoardSource, /bid-support-thread/, "Public Bid Room support should render conversational turns");
assert.match(bidRoomBoardSource, /queueSupportAlert/, "Public Bid Room support should trigger multimedia support replies");
assert.match(bidRoomBoardSource, /PUBLIC_BOARD_SOUND_DEFAULT_VERSION/, "Public Bid Room board should reset old sound-off defaults");
assert.match(bidRoomBoardSource, /function armPublicBoardAudio/, "Public Bid Room board should arm multimedia alerts on first interaction");
assert.match(rfxBidApiSource, /async function mirrorSupportTicketToGoogleChat/, "Bid support tickets should mirror to the Bid Room Google Chat event thread");
assert.match(rfxBidApiSource, /source: "vendor_support_ticket"/, "Google Chat mirrored support messages should be traceable to vendor support tickets");
assert.match(rfxBidApiSource, /google_chat_sync_status: chatSync\.status/, "Support tickets should store Google Chat sync status in contact history metadata");
assert.match(apiSource, /list_vendor_support_tickets/, "Rateware API should expose vendor support ticket listing");
assert.match(apiSource, /update_vendor_support_ticket/, "Rateware API should expose vendor support ticket updates");
assert.match(apiSource, /SUPPORT_TICKET_DB_STATUSES/, "Vendor support should normalize support statuses over contact history");
assert.match(vendorSupportMigration, /contact_history_support_owner_idx/, "Vendor support tickets should have owner/status index");
assert.match(vendorSupportHtml, /Vendor Support/, "Vendor Support module page should exist");
assert.match(vendorSupportHtml, /support-ticket-body/, "Vendor Support module should render a ticket table");
assert.match(vendorSupportSource, /fetchVendorSupportTickets/, "Vendor Support UI should fetch tickets from the API");
assert.match(vendorSupportSource, /updateVendorSupportTicket/, "Vendor Support UI should update ticket state");
assert.match(vendorSupportSource, /let supportLoadVersion = 0;/, "Vendor Support filters should version concurrent loads");
assert.match(vendorSupportSource, /loadVersion !== supportLoadVersion/, "Vendor Support should ignore stale filter responses");
assert.match(vendorSupportSource, /const supportTicketMutationQueues = new Map\(\)/, "Vendor Support should serialize updates per ticket");
assert.match(vendorSupportSource, /supportTicketMutationVersions\.get\(id\) === mutationVersion/, "Vendor Support should suppress stale mutation status updates");
assert.match(vendorSupportServiceSource, /list_vendor_support_tickets/, "Vendor Support service should call the ticket listing action");
assert.match(vendorSupportServiceSource, /update_vendor_support_ticket/, "Vendor Support service should call the ticket update action");
assert.match(vendorsHtml, /drawer-vendor-support/, "Vendor profile drawer should include a Vendor Support section");
assert.match(vendorsSource, /loadDrawerVendorSupport/, "Vendor drawer should load carrier-specific support tickets");
assert.match(vendorsSource, /updateVendorSupportTicket/, "Vendor drawer should update support ticket statuses without reloading the CRM");
assert.match(appHtml, /vendor-support\.html/, "Dashboard navigation should include Vendor Support");
assert.match(vendorContinuousImprovementMigration, /vendor_improvement_cases/, "Vendor CI should persist continuous improvement cases");
assert.match(vendorContinuousImprovementMigration, /vendor_value_scorecards/, "Vendor CI should persist carrier value scorecards");
assert.match(vendorContinuousImprovementMigration, /vendor_improvement_cases_owner_status_idx/, "Vendor CI cases should have owner/status index");
assert.match(apiSource, /list_vendor_improvement_cases/, "Rateware API should expose Vendor CI listing");
assert.match(apiSource, /create_vendor_improvement_case/, "Rateware API should expose Vendor CI case creation");
assert.match(apiSource, /submit_vendor_improvement_case/, "Rateware API should expose Vendor CI email submission");
assert.match(apiSource, /process_vendor_ci_reminders/, "Rateware API should process automatic Vendor CI reminders");
assert.match(apiSource, /vendor_ci_sent/, "Vendor CI submission should write contact history touchpoints");
assert.match(apiSource, /vendor_ci_reminder_sent/, "Vendor CI reminders should write contact history touchpoints");
assert.match(apiSource, /next_reminder_at/, "Vendor CI submission should schedule reminder metadata");
assert.match(apiSource, /sendVendorCiGmail/, "Vendor CI submission and reminders should use a shared Gmail sender");
assert.match(apiSource, /gmailRawMessage\(message, GMAIL_ALLOWED_SENDER\)/, "Vendor CI submission should send through the approved Gmail sender");
assert.match(apiSource, /upsert_vendor_value_scorecard/, "Rateware API should expose Vendor CI scorecard upsert");
assert.match(apiSource, /VENDOR_CI_CASE_TYPES/, "Vendor CI API should validate improvement case types");
assert.match(apiSource, /vendorCiPlaybooks/, "Vendor CI API should provide process playbooks by case type");
assert.match(apiSource, /vendor_request_template/, "Vendor CI playbooks should provide actionable vendor request templates");
assert.match(apiSource, /success_metric/, "Vendor CI playbooks should provide measurable success metrics");
assert.match(apiSource, /actions: \[/, "Vendor CI playbooks should expose recommended actions");
assert.match(vendorImprovementHtml, /Vendor Continuous Improvement/, "Vendor CI module page should exist");
assert.match(vendorImprovementHtml, /ci-case-body/, "Vendor CI module should render the case queue");
assert.match(vendorImprovementHtml, /ci-value-curve/, "Vendor CI module should render the carrier value curve");
assert.match(vendorImprovementHtml, /ci-vendor-search/, "Vendor CI should use a CRM search picker instead of a static vendor dropdown");
assert.match(vendorImprovementHtml, /run-vendor-ci-reminders/, "Vendor CI should expose a due reminder action");
assert.match(vendorImprovementHtml, /CRM \+ Rateware \+ Bid Room \+ Support signals/, "Vendor CI value curve should explain its multi-source carrier signals");
assert.match(vendorImprovementSource, /fetchVendorImprovementCases/, "Vendor CI UI should fetch cases from the API");
assert.match(vendorImprovementSource, /createVendorImprovementCase/, "Vendor CI UI should create improvement cases");
assert.match(vendorImprovementSource, /upsertVendorValueScorecard/, "Vendor CI UI should update scorecards");
assert.match(vendorImprovementSource, /function searchCrmVendors/, "Vendor CI should search the Carrier CRM dynamically when creating a case");
assert.match(vendorImprovementSource, /function scorecardSignals/, "Vendor CI value curve should render Rateware, Bid Room, support, and chat evidence per carrier");
assert.match(vendorImprovementSource, /function applyPlaybookToCaseForm/, "Vendor CI playbooks should prefill an improvement case");
assert.match(vendorImprovementSource, /data-ci-playbook-action="use"/, "Vendor CI playbooks should expose a create-case action");
assert.match(vendorImprovementSource, /data-ci-playbook-action="filter"/, "Vendor CI playbooks should filter existing cases by playbook type");
assert.match(vendorImprovementSource, /data-ci-case-action="submit"/, "Vendor CI cases should expose a submit-to-carrier action");
assert.match(vendorImprovementSource, /submitVendorImprovementCase/, "Vendor CI UI should submit cases by email");
assert.match(vendorImprovementSource, /processVendorCiReminders/, "Vendor CI UI should run due reminders on demand");
assert.match(vendorImprovementSource, /reminder_interval_days: 3/, "Vendor CI submit action should schedule automatic reminders");
assert.match(vendorImprovementSource, /source: activePlaybook \? "playbook" : "manual"/, "Vendor CI cases should remember when they came from a playbook");
assert.match(vendorImprovementSource, /fetchVendors\(\{ limit: CRM_VENDOR_SEARCH_LIMIT, offset: 0, view: "all", lightweight: true, search: term \}\)/, "Vendor CI search should query the full CRM, not a preloaded procurement-only list");
assert.match(vendorImprovementSource, /let vendorSearchSequence = 0;/, "Vendor CI vendor search should ignore stale CRM responses");
assert.match(vendorImprovementSource, /matchingRows = rows\.filter/, "Vendor CI vendor search should filter returned CRM rows before rendering");
assert.match(vendorImprovementSource, /sequence !== vendorSearchSequence/, "Vendor CI vendor search should not render older searches over newer input");
assert.match(vendorImprovementSource, /let improvementLoadVersion = 0;/, "Vendor CI case filters should version concurrent loads");
assert.match(vendorImprovementSource, /loadVersion !== improvementLoadVersion/, "Vendor CI should ignore stale case responses");
assert.match(vendorImprovementSource, /if \(createCaseRunning\) return;/, "Vendor CI should prevent duplicate case creation");
assert.match(vendorImprovementSource, /const improvementCaseMutationQueues = new Map\(\)/, "Vendor CI should serialize updates per case");
assert.match(vendorImprovementSource, /improvementCaseSubmissionIds\.has\(id\)/, "Vendor CI should prevent duplicate carrier submissions");
assert.match(vendorImprovementSource, /scorecardMutationIds\.has\(vendorId\)/, "Vendor CI should prevent duplicate scorecard saves");
assert.doesNotMatch(vendorImprovementSource, /fetchVendors\(\{ base_stage: "procurement"/, "Vendor CI create-case picker should not be limited to Procurement vendors");
assert.match(apiSource, /async function buildVendorValueCurve/, "Vendor CI API should compute the carrier value curve from all CRM vendors");
assert.match(apiSource, /fetchVendorRateMetricsSafe\(supabase, user\)/, "Vendor CI value curve should include Rateware quote signals");
assert.match(apiSource, /\.from\("rfx_lane_vendors"\)/, "Vendor CI value curve should include Bid Room participation and award signals");
assert.match(apiSource, /\.from\("contact_history"\)/, "Vendor CI value curve should include support and outreach signals");
assert.match(apiSource, /\.from\("bid_room_chat_messages"\)/, "Vendor CI value curve should include carrier chat participation signals");
assert.match(vendorImprovementServiceSource, /list_vendor_improvement_cases/, "Vendor CI service should call the listing action");
assert.match(vendorImprovementServiceSource, /create_vendor_improvement_case/, "Vendor CI service should call the create action");
assert.match(vendorImprovementServiceSource, /submit_vendor_improvement_case/, "Vendor CI service should call the email submit action");
assert.match(vendorImprovementServiceSource, /process_vendor_ci_reminders/, "Vendor CI service should call the reminder processor action");
assert.match(appHtml, /vendor-improvement\.html/, "Dashboard navigation should include Vendor CI");
assert.match(apiSource, /const invitationIdChunks = invitationIds\.length \? chunkValues\(invitationIds, 100\) : \[\[\]\]/, "Outreach draft generation should read selected invitations in small id batches");
assert.match(apiSource, /label: "RFx invitation ids", limit: 5000/, "Outreach draft generation should support large carrier waves without unbounded requests");
assert.match(apiSource, /mapWithConcurrency\(invitationIdChunks, 4/, "Outreach draft generation should load invitation batches with bounded concurrency");
assert.match(apiSource, /mapWithConcurrency\(chunkValues\(rowsToUpsert, 100\), 4/, "Outreach draft generation should upsert draft messages in bounded batches");
assert.match(apiSource, /generated: generatedMessages\.length,[\s\S]+rows: \[\]/, "Outreach draft generation should avoid returning large HTML draft payloads");
assert.match(apiSource, /function outreachLaneTableSignature/, "Outreach draft generation should fingerprint the current Business Book route table");
assert.match(apiSource, /lane_table_signature: context\.lane_table_signature/, "Outreach drafts should persist the Business Book route-table signature in metadata");
assert.match(apiSource, /const completeInvitationGroups = new Map/, "Outreach draft generation should hydrate complete event/vendor lane groups before rendering templates");
assert.match(apiSource, /requestedGroupKeys\.has\(key\)/, "Outreach draft generation should only expand lane groups for requested event/vendor participants");
assert.match(apiSource, /\.in\("vendor_id", vendorChunk\)[\s\S]+\.range\(offset, offset \+ 999\)/, "Outreach lane hydration should paginate only the requested carriers instead of scanning the full event");
assert.match(apiSource, /sortRfxInvitationGroup\(completeInvitationGroups\.get\(groupKey\) \|\| requestedInvitationGroup\)/, "Outreach drafts should render stable complete route tables per carrier");
assert.match(apiSource, /const protectedStatuses = new Set\(\["queued", "sending", "sent", "delivered", "read", "replied", "delivery_unknown", "bounced", "manual_sent", "archived"\]\)/, "Outreach regeneration must preserve messages that already moved beyond draft state");
assert.match(apiSource, /const createdMessages = generatedMessages\.filter/, "Outreach history should distinguish newly created drafts from refreshed drafts");
assert.match(apiSource, /const historyRows = createdMessages\.map/, "Outreach regeneration should not duplicate contact history for refreshed drafts");
assert.match(outreachDeliveryIdempotencyMigration, /add column if not exists idempotency_key text/, "Outreach campaigns should persist a retry idempotency key");
assert.match(outreachDeliveryIdempotencyMigration, /outreach_campaigns_owner_idempotency_unique[\s\S]+owner_email, idempotency_key/, "Outreach campaign retry keys should be unique per workspace owner");
assert.match(outreachDeliveryIdempotencyMigration, /add column if not exists send_attempt_id uuid/, "Outreach messages should persist an atomic provider-send claim");
assert.match(outreachDeliveryIdempotencyMigration, /'sending'[\s\S]+'delivery_unknown'/, "Outreach delivery states should distinguish active and uncertain provider attempts");
for (const column of ["gmail_connection_id", "sender_address", "sender_connection_type", "provider_response_status", "provider_thread_id", "send_result"]) {
  assert.match(outreachDeliveryTraceMigration, new RegExp(`add column if not exists ${column}`), `Outreach delivery trace should persist ${column}`);
}
assert.match(outreachDeliveryTraceMigration, /alter table public\.contact_history[\s\S]+add column if not exists gmail_connection_id uuid/, "Contact history should link Gmail sends to the resolved mailbox connection");
assert.match(outreachDeliveryTraceMigration, /Must not contain access tokens, secrets, or raw provider payloads/, "Delivery trace schema should forbid provider secrets and raw payload storage");
assert.match(apiSource, /function outreachSendResult[\s\S]+recorded_at: new Date\(\)\.toISOString\(\)/, "Outreach drafts and sends should use a normalized timestamped delivery result");
assert.match(generateOutreachDraftsSource, /channel: "email"[\s\S]+provider: "gmail"[\s\S]+gmail_connection_id:[\s\S]+sender_address:[\s\S]+provider_response_status: "drafted"[\s\S]+send_result: outreachSendResult/, "Gmail drafts should persist channel, provider, connection, sender, and initial result");
assert.match(generateOutreachDraftsSource, /channel: "whatsapp"[\s\S]+provider: "meta"[\s\S]+whatsapp_connection_id:[\s\S]+sender_address:[\s\S]+provider_response_status: "drafted"[\s\S]+send_result: outreachSendResult/, "WhatsApp drafts should persist channel, provider, connection, sender, and initial result");
assert.match(apiSource, /provider_thread_id: cleanText\(data\.threadId\)[\s\S]+provider_response_status: "accepted"[\s\S]+send_result: outreachSendResult/, "Gmail success should persist provider ids and normalized acceptance result");
assert.match(apiSource, /whatsapp_connection_id: connection\.row\.id[\s\S]+provider_response_status: "accepted"[\s\S]+send_result: outreachSendResult/, "WhatsApp success should persist the resolved connection and normalized acceptance result");
assert.match(whatsappWebhookSource, /provider_response_status = providerStatus[\s\S]+send_result = deliveryResult\("webhook_status"/, "WhatsApp webhook statuses should update the original outreach delivery result");
assert.match(apiSource, /async function claimOutreachMessageForSend[\s\S]+\.eq\("status", status\)/, "Provider sends should atomically claim a message from its current status");
assert.match(apiSource, /async function updateClaimedOutreachMessage[\s\S]+\.eq\("send_attempt_id", attemptId\)/, "Provider results should only be finalized by the attempt that owns the claim");
assert.match(apiSource, /sendOutreachMessages[\s\S]+claimOutreachMessageForSend\(supabase, user, message, \{/, "Gmail sends should acquire the persistent send claim with its delivery trace before invoking the provider");
assert.match(apiSource, /sendWhatsappOutreachMessages[\s\S]+claimOutreachMessageForSend\(supabase, user, resolvedMessage, \{/, "WhatsApp sends should acquire the persistent send claim with its delivery trace before invoking Meta");
assert.match(apiSource, /deliveryUncertain[\s\S]+delivery_unknown/, "Ambiguous provider responses should be held for reconciliation instead of automatic resend");
assert.match(apiSource, /response\.status === 408 \|\| response\.status >= 500/, "Timeout and provider server responses should remain blocked as uncertain delivery");
assert.match(apiSource, /body\.action === "create_outreach_campaign"[\s\S]+normalized\.idempotency_key[\s\S]+reused: true/, "Campaign creation retries should reuse the original outreach wave");
assert.match(rfxEventsSource, /window\.sessionStorage\.getItem\(storageKey\)/, "Bid Room should retain the current draft request key across a lost response");
assert.match(rfxEventsSource, /idempotency_key: idempotencyKey/, "Bid Room should send the retry key when creating an outreach wave");
assert.match(rfxEventsSource, /function laneTableSignatureForTargets/, "Bid Room UI should fingerprint current carrier lane groups");
assert.match(rfxEventsSource, /function allOutreachTargetInvitations/, "Bid Room preview should be able to render every active event lane for the selected carrier");
assert.match(rfxEventsSource, /const sourceTargets = selectedOnly \? outreachTargetInvitations\(\) : allOutreachTargetInvitations\(\)/, "Bid Room preview should default to the full carrier lane package, not only the selected row");
assert.match(rfxEventsSource, /function draftMatchesCurrentLaneTable/, "Bid Room UI should compare draft route-table signatures against current lanes");
assert.match(rfxEventsSource, /Business book changed\. Refresh this draft to update its route table\./, "Draft queue should explain how to refresh a stale route table");
assert.match(rfxEventsSource, /data-rfx-refresh-draft/, "Draft queue should expose a targeted refresh action for stale drafts");
assert.match(rfxEventsSource, /async function refreshSingleOutreachDraft/, "Stale drafts should be refreshable without rebuilding the full outreach queue");
assert.match(rfxEventsSource, /await generateOutreachDrafts\(refresh\.campaignId, refresh\)/, "Draft refresh should reuse the original outreach campaign for each selected carrier group");
const outreachSignatureMatch = apiSource.match(/function outreachLaneTableSignature[\s\S]*?\n}\r?\n\r?\nfunction /);
const outreachSignatureSource = outreachSignatureMatch?.[0] || "";
assert.ok(outreachSignatureSource, "Outreach lane signature helper should be present");
assert.doesNotMatch(outreachSignatureSource, /updated_at:/, "Outreach draft freshness should not change for an unrelated row update timestamp");
assert.match(rfxEventsSource, /&& !isStaleOutreachDraft\(message\)/, "Stale outreach drafts should not be selectable for email, WhatsApp, or group sends");
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
assert.match(
  spreadsheetColumnFiltersSource,
  /let searchRevision = 0/,
  "Spreadsheet filters should track the latest search input revision"
);
assert.match(
  spreadsheetColumnFiltersSource,
  /revision !== searchRevision/,
  "Spreadsheet filters should ignore stale delayed search updates"
);
assert.match(
  spreadsheetColumnFiltersSource,
  /event\.key === "Enter"/,
  "Spreadsheet filter search should let operators apply a typed filter with Enter"
);
assert.match(
  spreadsheetColumnFiltersSource,
  /MENU_VALUES_TIMEOUT_MS = 8000/,
  "Spreadsheet filter value requests should time out instead of leaving the menu stuck loading"
);
assert.match(
  spreadsheetColumnFiltersSource,
  /data-sheet-filter-apply-search/,
  "Spreadsheet filter menus should offer applying typed search text across the full database"
);
assert.match(
  spreadsheetColumnFiltersSource,
  /state\.set\(field, query\)/,
  "Spreadsheet filter text searches should serialize as database contains filters"
);
assert.match(
  spreadsheetColumnFiltersSource,
  /isTextFilter\(values\)[\s\S]*result\[field\] = values\.trim\(\)/,
  "Spreadsheet filter serialization should preserve text filters for backend-wide matching"
);
assert.match(
  spreadsheetColumnFiltersSource,
  /function normalizeMenuValuesResponse/,
  "Spreadsheet filters should preserve backend value metadata"
);
assert.match(
  spreadsheetColumnFiltersSource,
  /Select loaded/,
  "Spreadsheet filter menus should not imply that a capped value list is the whole database"
);
assert.match(
  spreadsheetColumnFiltersSource,
  /database value\(s\) loaded/,
  "Spreadsheet filter menus should explain how many database values were loaded"
);
assert.match(
  spreadsheetColumnFiltersSource,
  /Search to narrow additional database values/,
  "Spreadsheet filter menus should tell operators how to find values beyond the loaded menu page"
);
assert.match(
  spreadsheetColumnFiltersSource,
  /await menuValues\(field, query\)/,
  "Spreadsheet filter search should query backend values instead of only filtering the loaded menu slice"
);
assert.match(
  spreadsheetColumnFiltersSource,
  /defaultAll && !activeMenu\.dirty/,
  "Spreadsheet filter search should keep the unfiltered default from becoming a partial loaded-value filter"
);
assert.match(
  apiSource,
  /Number\(body\.limit\) \|\| 5000, 1\), 5000\)/,
  "Filter-value APIs should allow a 5000-value menu page for large Rateware datasets"
);
assert.match(
  ratewareServiceSource,
  /hard_limit_reached: Boolean\(result\?\.hard_limit_reached\)/,
  "Rateware service should keep filter-value truncation metadata"
);
assert.match(
  stagingServiceSource,
  /hard_limit_reached: Boolean\(result\?\.hard_limit_reached\)/,
  "Staging service should keep filter-value truncation metadata"
);
assert.match(
  ratewareSource,
  /const rowSaveChains = new Map\(\)/,
  "Rateware should serialize writes to the same spreadsheet row"
);
assert.match(
  ratewareSource,
  /Newer edits are waiting to save/,
  "Rateware should preserve newer row edits while a previous save is in flight"
);
assert.match(
  stagingReviewSource,
  /const rowSaveChains = new Map\(\)/,
  "Staging should serialize writes to the same spreadsheet row"
);
assert.match(
  stagingReviewSource,
  /Newer edits are waiting to save/,
  "Staging should preserve newer row edits while a previous save is in flight"
);
assert.match(
  stagingReviewSource,
  /const token = stagingLoadToken;[\s\S]*if \(token !== stagingLoadToken\) return;[\s\S]*catch \(error\) \{[\s\S]*if \(token !== stagingLoadToken\) return;/,
  "Staging should ignore stale load failures instead of overwriting newer filter results"
);
assert.match(
  ratewareSource,
  /Page selected:/,
  "Rateware should make page-level selection distinct from database-wide actions"
);
assert.match(
  stagingReviewSource,
  /Page selected:/,
  "Staging should make page-level selection distinct from database-wide actions"
);
assert.match(ratewareSource, /Database matches:/, "Rateware should label global matches separately from the loaded page");
assert.match(stagingReviewSource, /Database matches:/, "Staging should label global matches separately from the loaded page");
assert.match(ratewareSource, /\[50, 100, 200, 500, 1000\]\.includes\(value\)/, "Rateware should allow the backend-supported 1000-row page size");
assert.match(stagingReviewSource, /\[50, 100, 200, 500, 1000\]\.includes\(value\)/, "Staging should allow the backend-supported 1000-row page size");
assert.match(ratewareHtml, /<option value="1000">1,000<\/option>/, "Rateware should expose the 1000-row page size");
assert.match(stagingReviewHtml, /<option value="1000">1,000<\/option>/, "Staging should expose the 1000-row page size");
assert.match(
  ratewareSource,
  /Global scope: \$\{filteredTotal\.toLocaleString\(\)\} filtered rates/,
  "Rateware should make filtered database scope compact and explicit"
);
assert.match(
  stagingReviewSource,
  /Global scope: \$\{filteredTotal\.toLocaleString\(\)\} filtered rows/,
  "Staging should make filtered database scope compact and explicit"
);
assert.match(
  sheetUiSource,
  /showStarterViews = false/,
  "Spreadsheet layout menus should default to personal layouts instead of preconfigured presets"
);
assert.match(
  sheetUiSource,
  /showStarterViews && presetViews\(\)\.length/,
  "Starter layouts should be opt-in instead of cluttering the column layout menu"
);
assert.match(
  sheetUiSource,
  /setActiveView\(name, "named", "View applied"\);\s*renderToggleInputs\(\);/,
  "Applying a saved spreadsheet view should immediately refresh the visible layout state"
);
assert.match(
  sheetUiSource,
  /data-column-order-key=/,
  "Spreadsheet column menus should support direct drag-to-reorder controls"
);
assert.match(
  sheetUiSource,
  /list\?\.addEventListener\("drop"/,
  "Spreadsheet column menus should save reorder drops without relying only on header dragging"
);
assert.match(
  spreadsheetGridSource,
  /event\.key\.toLowerCase\(\) === "a"/,
  "Spreadsheet grids should support selecting the visible grid with Ctrl or Cmd+A"
);
assert.match(
  spreadsheetGridSource,
  /event\.shiftKey && event\.key === " "/,
  "Spreadsheet grids should support selecting an active row with Shift+Space"
);
assert.match(
  spreadsheetGridSource,
  /\(event\.ctrlKey \|\| event\.metaKey\) && event\.key === " "/,
  "Spreadsheet grids should support selecting an active column with Ctrl or Cmd+Space"
);
assert.match(stagingReviewHtml, /selects visible cells/, "Staging should document visible-cell selection.");
assert.match(ratewareHtml, /selects the active row/, "Rateware should document active-row selection.");
assert.match(ratewareHtml, /Export matching CSV/, "Rateware export should state that it covers every matching database row");
assert.match(ratewareHtml, /Archive matching/, "Rateware lifecycle actions should state matching database scope");
assert.match(stagingReviewHtml, /Approve matching/, "Staging approval should state matching database scope");
assert.match(stagingReviewHtml, /Remove matching/, "Staging removal should state matching database scope");
assert.match(
  ratewareSource,
  /columnFilters: activeColumnFilters\(\)/,
  "Rateware paginated loads should carry the active column filters"
);
assert.match(
  stagingReviewSource,
  /columnFilters: activeColumnFilters\(\)/,
  "Staging paginated loads should carry the active column filters"
);
assert.match(
  stagingReviewSource,
  /async function loadStagingOptions\(\{ force = false \} = \{\}\)/,
  "Staging should cache auxiliary options instead of refetching them for every page or filter change"
);
assert.match(
  stagingReviewSource,
  /refreshButton\.addEventListener\("click", \(\) => loadRows\(\{ refreshOptions: true \}\)\)/,
  "Staging refresh should explicitly reload catalogs and vendor options"
);
assert.match(
  ratewareSource,
  /async function loadRatewareOptions\(\{ force = false \} = \{\}\)/,
  "Rateware should cache auxiliary options instead of refetching them for every page or filter change"
);
assert.match(
  ratewareSource,
  /refreshButton\.addEventListener\("click", \(\) => loadRateware\(\{ refreshOptions: true \}\)\)/,
  "Rateware refresh should explicitly reload catalogs and vendor options"
);
assert.match(
  ratewareServiceSource,
  /column_filters: columnFilters/,
  "Rateware service calls should send column filters to the API"
);
assert.match(
  stagingServiceSource,
  /column_filters: columnFilters/,
  "Staging service calls should send column filters to the API"
);
assert.match(
  apiSource,
  /if \(body\.action === "list_rateware"\)[\s\S]*column_filters: columnFilters[\s\S]*fetchRatewareRowsBySql/,
  "Rateware API pagination should apply column filters server-side"
);
assert.match(
  apiSource,
  /if \(body\.action === "list_staging"\)[\s\S]*column_filters: columnFilters[\s\S]*fetchRateRowIdsByFilter/,
  "Staging API pagination should apply column filters server-side when needed"
);
assert.match(ratewareSource, /No matching rates\. Use Clear filters above/, "Rateware empty state should explain how to recover from filters");
assert.match(stagingReviewSource, /No matching staged rows\. Use Clear filters above/, "Staging empty state should explain how to recover from filters");
assert.match(
  stylesSource,
  /\.column-order-grip/,
  "Spreadsheet column menus should provide a visible reorder affordance"
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
  /const sqlValues = await fetchSqlRateFilterValues[\s\S]*if \(sqlValues\) return jsonResponse\(sqlValues\)[\s\S]*fetchRateFilterValuesByRpc/,
  "Rateware filter dropdown values should use SQL first for simple database-backed menus and RPC only as fallback"
);
const fetchRateIdsSource = apiSource.slice(apiSource.indexOf("async function fetchRateRowIdsByFilter"), apiSource.indexOf("async function fetchRateRowsForIds"));
assert.ok(fetchRateIdsSource.length > 100, "Rateware filtered id helper should be present");
assert.match(
  fetchRateIdsSource,
  /if \(canUseSqlRateFilters\(filters\)\)/,
  "Rateware compatible filtered actions should use SQL directly instead of waiting on RPC"
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
assert.match(listVendorsSource, /contact_name/, "Lightweight Carrier CRM loading should include contact names for Bid Room search");
assert.match(listVendorsSource, /contact_name\.ilike/, "Carrier CRM search should include contact names");
assert.match(listVendorsSource, /legal_name\.ilike/, "Carrier CRM search should include legal names");
assert.match(listVendorsSource, /coverage_notes\.ilike/, "Carrier CRM search should include coverage notes");
assert.match(listVendorsSource, /if \(!lightweight && rows\.length\)/, "Bid Room carrier selector should be able to skip heavy CRM metric enrichment");
assert.match(listVendorsSource, /return jsonResponse\(\{ rows: enrichedRows[\s\S]*warnings/, "Carrier CRM directory should surface partial metric warnings");
assert.match(listVendorsSource, /const maxLimit = lightweight \? 1000 : 250;/, "Lightweight CRM selectors should support up to 1,000 vendors without enabling heavy CRM payloads");
assert.match(apiSource, /logo_url: cleanText\(vendor\.logo_url\)/, "Vendor intelligence rows should keep uploaded logo URLs");
assert.match(apiSource, /profile_data: typeof vendor\.profile_data/, "Vendor intelligence rows should keep structured profile data");
assert.match(vendorsSource, /key: "health"/, "Carrier CRM spreadsheet should include a health column");
assert.match(vendorsSource, /key: "quotes"/, "Carrier CRM spreadsheet should include a quotes column");
assert.match(vendorsSource, /key: "coverage_delta"/, "Carrier CRM spreadsheet should include a coverage fit column");
assert.doesNotMatch(vendorsHtml, /id="(?:wizard-primary-email|primary-email|drawer-edit-email)"[^>]*type="email"/, "Carrier CRM email fields should accept multiple email addresses without native single-email blocking");
assert.match(vendorsSource, /function splitVendorEmails/, "Carrier CRM should split pasted email lists into primary and secondary emails");
assert.match(vendorsSource, /secondary_emails: emails\.slice\(1\)/, "Carrier CRM should preserve extra emails as secondary contacts");
assert.match(apiSource, /function normalizeEmailList/, "Rateware API should accept multiple vendor emails");
assert.match(apiSource, /secondary_emails: secondaryEmails/, "Rateware API should persist additional vendor emails");
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
assert.match(vendorsSource, /const vendorCellSaveQueues = new Map\(\)/, "Carrier CRM should serialize overlapping saves for the same cell");
assert.match(vendorsSource, /vendorCellSaveVersions\.get\(saveKey\) !== saveVersion/, "Carrier CRM should ignore stale cell-save completions");
assert.match(vendorsSource, /loadVersion !== vendorDrawerSupportLoadVersion \|\| activeDrawerVendorId !== vendorId/, "Carrier CRM support should stay scoped to the open vendor drawer");
assert.match(vendorsSource, /if \(vendorFunnelMutationIds\.has\(vendorId\)\) return false/, "Carrier CRM should reject duplicate per-vendor funnel moves");
assert.match(rfxEventsSource, /fetchVendors\(\{ limit: pageSize, offset: 0, view: "all", lightweight: true \}\)/, "Bid Room should load the initial Carrier CRM page through the lightweight vendor path");
assert.match(rfxEventsSource, /function loadVendorSearchOptions/, "Bid Room should search the full CRM on participant search input");
assert.match(rfxEventsSource, /const CRM_VENDOR_PAGE_SIZE = 1000;/, "Bid Room should load CRM candidates in larger lightweight pages");
assert.match(rfxEventsSource, /const CRM_VENDOR_SEARCH_LIMIT = 1000;/, "Bid Room participant search should request enough CRM matches for large carrier bases");
assert.match(rfxEventsSource, /fetchVendors\(\{ limit: CRM_VENDOR_SEARCH_LIMIT, offset: 0, view: "all", lightweight: true, search: term \}\)/, "Bid Room participant search should call the CRM search endpoint with the large lightweight limit");
assert.match(rfxEventsSource, /const vendorOptionCache = new Map\(\)/, "Bid Room should preserve selected CRM carriers outside the current search result");
assert.doesNotMatch(rfxEventsSource, /selectedManualVendorIdsState = new Set\(\[\.\.\.selectedManualVendorIdsState\]\.filter\(/, "Changing the CRM search must not discard selected bid participants");
assert.match(rfxEventsSource, /vendorSearchRows = sortedVendorOptions\(rows\)/, "Bid Room should render server-side CRM search results instead of waiting for the complete CRM preload");
assert.match(rfxEventsSource, /fetchVendors\(\{ limit: pageSize, offset: 0, view: "all", lightweight: true \}\)/, "Bid Room should make one fast initial CRM request before server-side search");
assert.match(vendorServiceSource, /ids = \[\]/, "Vendor service should support resolving saved participant IDs without relying on the visible list");
assert.match(listVendorsSource, /const requestedIds = normalizeUuidList\(body\.ids \|\| body\.vendor_ids\)/, "Vendor API should support owner-scoped vendor resolution by ID");
assert.match(rfxEventsSource, /async function hydrateVendorOptionIds\(ids = \[\]\)/, "Bid Room should hydrate saved participant templates by ID from Carrier CRM");
assert.match(rfxEventsSource, /ids: requestedIds\.slice\(offset, offset \+ CRM_VENDOR_SEARCH_LIMIT\)/, "Saved participant hydration should use bounded CRM requests");
assert.match(rfxEventsSource, /const savedIds = segmentVendorIds\(selectedSegment\);/, "Saved templates should remain loadable even when their vendors are outside the initial CRM page");
assert.match(rfxEventsSource, /row\.contact_name/, "Bid Room participant search should include CRM contact names");
assert.match(rfxEventsSource, /\.normalize\("NFD"\)/, "Bid Room participant search should normalize accents for Spanish names");
assert.match(rfxEventsSource, /<strong>\$\{escapeHtml\(vendorDisplayName\(row\)\)\}<\/strong>/, "Bid Room participant cards should stay focused on vendor name only");
assert.match(rfxEventsSource, /Carrier CRM partially loaded/, "Bid Room should keep partial CRM carrier results when a later page fails");
assert.match(rfxEventsSource, /if \(participantBulkMutationRunning\) return;/, "Bid Room participant bulk actions should reject duplicate submissions");
assert.match(rfxEventsSource, /if \(selectedEventId === eventId\)[\s\S]*?selectedInvitationIds\.clear\(\);[\s\S]*?await loadDetail\(eventId\)/, "Bid Room participant mutations should only refresh the event that initiated them");
assert.match(rfxEventsSource, /fetchShippers/, "Bid Room event setup should source customers from Shipper CRM");
assert.match(rfxEventsSource, /function loadRfxCustomerOptions/, "Bid Room should load customer options through the Shipper CRM API");
assert.match(rfxEventsSource, /function selectedRfxCustomerName/, "Bid Room should normalize selected Shipper CRM customers before saving");
assert.match(rfxEventsHtml, /rfx-customer-options/, "Bid Room customer field should expose Shipper CRM autocomplete options");
assert.match(vendorsSource, /data-copy-profile-link/, "Vendor drawer should expose profile link creation");
assert.match(carrierProfileHtml, /carrier-profile\.js/, "Carrier profile page should load the public profile script");
assert.match(carrierProfileHtml, /carrier-profile-eyebrow/, "Carrier profile page header should be translatable");
assert.match(carrierProfileSource, /carrier-profile-api/, "Carrier profile page should call the public profile API");
assert.match(carrierProfileSource, /submit_profile/, "Carrier profile page should submit profile data");
assert.match(carrierProfileSource, /LANGUAGE_KEY/, "Carrier profile should persist the selected language");
assert.match(carrierProfileSource, /data-language-toggle/, "Carrier profile should expose an English/Spanish language switch");
assert.match(carrierProfileSource, /carrier-profile-stepper/, "Carrier profile should use a guided stepper instead of one long form");
assert.match(carrierProfileSource, /recommendedMissing/, "Carrier profile should show recommended profile gaps without blocking submission");
assert.doesNotMatch(carrierProfileSource, /required: true/, "Carrier profile fields should be recommended instead of mandatory");
assert.match(carrierProfileSource, /data-recommended-field/, "Carrier profile should label helpful fields as recommended");
assert.doesNotMatch(carrierProfileSource, /return;\s*\}\s*button\.disabled = true;/, "Carrier profile should not block save when recommended fields are missing");
assert.match(carrierProfileSource, /response_language: currentLanguage/, "Carrier profile submissions should record the response language");
assert.match(carrierProfileApiSource, /patch\.vendor_name = patch\.domain \|\| patch\.primary_email \|\| "Carrier profile"/, "Carrier profile API should allow partial profile saves without requiring a vendor name from the carrier");
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
assert.match(stylesSource, /\.bulk-action-bar \{[\s\S]*?overflow-x: auto/, "Spreadsheet bulk actions should scroll inside their own toolbar on narrow laptop layouts");
assert.match(stylesSource, /\.bulk-action-bar:has\(\.sheet-more-actions\[open\]\)[\s\S]*?overflow: visible/, "The More actions menu should not be clipped by the compact toolbar");
assert.match(ratewareSource, /showStarterViews: false/, "Rateware should not surface starter column presets by default");
assert.match(stagingReviewSource, /showStarterViews: false/, "Staging should not surface starter column presets by default");
assert.match(sheetUiSource, /Changes auto-save in this browser/, "Column layout storage should be explicit to operators");
assert.match(sheetUiSource, /data-column-reset-layout>Reset default/, "Column controls should provide an explicit default-layout recovery action");
assert.match(sheetUiSource, /window\.localStorage\.removeItem\(activeViewStorageKey\)/, "Resetting a layout should clear a stale saved-view marker");
assert.match(ratewareSource, /let ratewareOptionsRequest = 0/, "Rateware option refreshes should be versioned");
assert.match(ratewareSource, /request !== ratewareOptionsRequest/, "Rateware should ignore stale option responses");
assert.match(stagingReviewSource, /let stagingOptionsRequest = 0/, "Staging option refreshes should be versioned");
assert.match(stagingReviewSource, /request !== stagingOptionsRequest/, "Staging should ignore stale option responses");
assert.match(ratewareSource, /const optionsRequest = loadRatewareOptions/, "Rateware should begin option hydration without blocking its page query");
assert.match(ratewareSource, /let page = await fetchApprovedRatewarePage/, "Rateware should render its page before waiting on option hydration");
assert.match(ratewareSource, /Rateware rows loaded\. Dropdown catalogs are temporarily unavailable/, "Rateware should retain rendered rows when secondary dropdown hydration fails");
assert.match(ratewareSource, /const hasRenderedRows = currentRows\.length > 0 \|\| loadedRows\.length > 0/, "Rateware should preserve visible rows while loading another page or filter result");
assert.match(ratewareSource, /if \(hasRenderedRows\) \{\s+setActionStatus\("Updating Rateware rows\.\.\."\);/, "Rateware should show inline loading instead of blanking rendered rows");
assert.match(ratewareSource, /if \(hasRenderedRows\) setActionStatus\(""\)/, "Rateware should clear temporary inline loading after a successful preserved-row refresh");
assert.match(ratewareSource, /ratewareTotalCount = Number\(page\.total \?\? rows\.length \?\? 0\)/, "Rateware should treat a zero database count as a real zero");
assert.match(ratewareSource, /ratewareTable\?\.setAttribute\("aria-busy", "true"\)/, "Rateware should expose loading state to assistive technology");
assert.match(ratewareSource, /ratewareTable\?\.removeAttribute\("aria-busy"\)/, "Rateware should clear its loading state after requests finish");
assert.match(ratewareSource, /function resetRatewareSelectionForFilter\(\)/, "Rateware should clear selection when the result set changes");
assert.match(ratewareSource, /searchInput\.addEventListener\("input", debounce\(\(\) =>/, "Rateware search should reset selection before loading new results");
assert.match(ratewareSource, /operationFilter\.addEventListener\("change", \(\) =>/, "Rateware operation filtering should reset selection before loading new results");
assert.match(ratewareSource, /serviceFilter\.addEventListener\("change", \(\) =>/, "Rateware service filtering should reset selection before loading new results");
assert.match(ratewareSource, /if \(refreshOptions\) resetRatewareSelectionForFilter\(\)/, "Rateware refresh should clear stale selection before reloading data");
const ratewarePageNavigationSource = ratewareSource.slice(ratewareSource.indexOf("async function goToRatewarePage"), ratewareSource.indexOf("function ratewarePageParams"));
assert.ok(ratewarePageNavigationSource.length > 100, "Rateware page navigation block should be present");
assert.match(ratewarePageNavigationSource, /selectedRowIds\.clear\(\)/, "Rateware should clear page selections when changing pages");
const ratewarePageSizeSource = ratewareSource.slice(ratewareSource.indexOf("async function setRatewarePageSize"), ratewareSource.indexOf("async function performRatewareTableRowSave"));
assert.ok(ratewarePageSizeSource.length > 100, "Rateware page-size block should be present");
assert.match(ratewarePageSizeSource, /selectedRowIds\.clear\(\)/, "Rateware should clear page selections when page size changes");
const ratewareSavedViewSource = ratewareSource.slice(ratewareSource.indexOf("columnVisibilityController = initColumnVisibility"), ratewareSource.indexOf("columnFilterController = initSpreadsheetColumnFilters"));
assert.ok(ratewareSavedViewSource.length > 100, "Rateware saved-view controller block should be present");
assert.match(ratewareSavedViewSource, /selectedRowIds\.clear\(\)/, "Rateware saved views should clear stale page selections before reloading");
assert.match(stagingReviewSource, /const optionsRequest = loadStagingOptions/, "Staging should begin option hydration without blocking its page query");
assert.match(stagingReviewSource, /let page = await fetchStagingPage/, "Staging should render its page before waiting on option hydration");
assert.match(stagingReviewSource, /Staging rows loaded\. Dropdown catalogs are temporarily unavailable/, "Staging should retain rendered rows when secondary dropdown hydration fails");
assert.match(stagingReviewSource, /const hasRenderedRows = currentRows\.length > 0 \|\| loadedRows\.length > 0/, "Staging should preserve visible rows while loading another page or filter result");
assert.match(stagingReviewSource, /if \(hasRenderedRows\) \{\s+setBulkStatus\("Updating staging rows\.\.\."\);/, "Staging should show inline loading instead of blanking rendered rows");
assert.match(stagingReviewSource, /else if \(hasRenderedRows\) \{\s+setBulkStatus\(""\);/, "Staging should clear temporary inline loading after a successful preserved-row refresh");
assert.match(stagingReviewSource, /await optionsRequest;\s+if \(token !== stagingLoadToken\) return;\s+if \(optionsError\)/, "Staging should ignore stale option responses before updating status");
assert.match(stagingReviewSource, /stagingTotalCount = Number\(page\.total \?\? rows\.length \?\? 0\)/, "Staging should treat a zero database count as a real zero");
assert.match(stagingReviewSource, /stagingTable\?\.setAttribute\("aria-busy", "true"\)/, "Staging should expose loading state to assistive technology");
assert.match(stagingReviewSource, /stagingTable\?\.removeAttribute\("aria-busy"\)/, "Staging should clear its loading state after requests finish");
assert.match(stagingReviewSource, /if \(refreshOptions\) \{\s+selectedRowIds\.clear\(\);\s+setBulkStatus\(""\);/, "Staging refresh should clear stale selection before reloading data");
const stagingPageNavigationSource = stagingReviewSource.slice(stagingReviewSource.indexOf("async function goToStagingPage"), stagingReviewSource.indexOf("async function setStagingPageSize"));
assert.ok(stagingPageNavigationSource.length > 100, "Staging page navigation block should be present");
assert.match(stagingPageNavigationSource, /selectedRowIds\.clear\(\)/, "Staging should clear page selections when changing pages");
const stagingPageSizeSource = stagingReviewSource.slice(stagingReviewSource.indexOf("async function setStagingPageSize"), stagingReviewSource.indexOf("function detailLine"));
assert.ok(stagingPageSizeSource.length > 100, "Staging page-size block should be present");
assert.match(stagingPageSizeSource, /selectedRowIds\.clear\(\)/, "Staging should clear page selections when page size changes");
const stagingSavedViewSource = stagingReviewSource.slice(stagingReviewSource.indexOf("columnVisibilityController = initColumnVisibility"), stagingReviewSource.indexOf("columnFilterController = initSpreadsheetColumnFilters"));
assert.ok(stagingSavedViewSource.length > 100, "Staging saved-view controller block should be present");
assert.match(stagingSavedViewSource, /selectedRowIds\.clear\(\)/, "Staging saved views should clear stale page selections before reloading");
assert.match(shippersSource, /let directoryLoadVersion = 0;/, "Shipper directory should version concurrent searches");
assert.match(shippersSource, /loadVersion !== directoryLoadVersion/, "Shipper directory should ignore stale search responses");
assert.match(shippersSource, /loadVersion !== pipelineLoadVersion/, "Shipper pipeline should ignore stale filter responses");
assert.match(shippersSource, /loadVersion !== commercialLoadVersion/, "Shipper commercial workspace should ignore stale filter responses");
assert.match(shippersSource, /loadVersion !== cadenceLoadVersion/, "Shipper cadence should ignore stale filter responses");
assert.match(shippersSource, /loadVersion !== intelligenceLoadVersion/, "Shipper intelligence should ignore stale filter responses");
assert.match(shippersSource, /loadVersion !== drawerLoadVersion \|\| state\.activeShipperId !== id/, "Shipper profile drawer should not render a previously requested account");
assert.doesNotMatch(shippersSource, /if \(state\.(?:cadence|intelligence)Loading\) return;/, "Shipper filtered views should allow a newer request to supersede an in-flight request");
assert.match(businessIntelligenceSource, /let analystLoadVersion = 0;/, "AI Analyst should version concurrent prompts");
assert.match(businessIntelligenceSource, /loadVersion !== recommendationLoadVersion/, "Carrier recommendations should ignore stale results");
assert.match(businessIntelligenceSource, /loadVersion !== pivotLoadVersion/, "BI pivots should ignore stale results");
assert.match(businessIntelligenceSource, /loadVersion !== drilldownLoadVersion/, "BI drilldowns should ignore stale results");
assert.match(businessIntelligenceSource, /loadVersion !== geoLoadVersion/, "BI geo density should ignore stale results");
assert.match(uploadHistorySource, /let uploadHistoryLoadVersion = 0;/, "Upload History should version concurrent list loads");
assert.match(uploadHistorySource, /loadVersion !== uploadHistoryLoadVersion/, "Upload History should ignore stale list responses");
assert.match(uploadHistorySource, /activeUploadDetailId !== row\.id/, "Upload source comparison should stay scoped to the open drawer row");
assert.match(uploadHistorySource, /pendingReprocessIds\[0\] !== rawUploadId/, "Upload interpretation memory should stay scoped to the active reprocess selection");
assert.match(uploadHistorySource, /if \(uploadBulkActionRunning\) return;/, "Upload bulk actions should reject duplicate submissions while running");
assert.match(outreachSource, /let outreachLoadVersion = 0;/, "Outreach should version full workspace loads");
assert.match(outreachSource, /loadVersion !== outreachMessagesLoadVersion \|\| selectedCampaignId !== campaignId/, "Outreach should not render messages from a previously selected campaign");
assert.match(outreachSource, /if \(outreachMessageMutationRunning\) return;/, "Outreach bulk message updates should reject duplicate submissions while running");
assert.match(apiSource, /mapWithConcurrency\(chunkValues\(cleanEmails, 75\), 4/, "Outreach suppression checks should batch large recipient lists with bounded concurrency");
assert.match(apiSource, /\.in\("email", emailBatch\)/, "Outreach suppression checks should query each bounded recipient batch");

assert.match(apiSource, /const BULK_SELECTED_ID_LIMIT = 1000;/, "Selected-row mutations should have a bounded request limit");
assert.match(apiSource, /const BULK_SEND_LIMIT = 100;/, "Provider sends should use a smaller bounded request limit");
assert.match(apiSource, /const BULK_FILTER_CONFIRM_THRESHOLD = 250;/, "Large filtered mutations should require reviewed preview confirmation");
assert.match(apiSource, /return explicitlyConfirmed && Boolean\(actionKey\) && actionText === actionKey\.toLowerCase\(\);/, "Bulk confirmations should be bound to the exact requested action");
assert.match(apiSource, /requires a fresh dry-run preview count before applying changes/, "Large full-dataset actions should require a fresh database preview");
assert.match(apiSource, /A completed destructive\/provider action must not look failed and become unsafe to retry/, "Audit failures should not make completed destructive or provider actions retryable");
assert.match(apiSource, /outreach\.gmail\.bulk_send/, "Gmail bulk sends should be audited separately");
assert.match(apiSource, /outreach\.whatsapp\.bulk_send/, "WhatsApp bulk sends should be audited separately");
assert.match(apiSource, /outreach\.whatsapp_group\.bulk_send/, "Manual WhatsApp group sends should be audited separately");
assert.match(workspaceRateScopeMigration, /add column if not exists owner_email text/, "Uploads and staged rates should persist workspace ownership");
assert.match(workspaceRateScopeMigration, /lower\(trim\(rs\.owner_email\)\) = lower\(trim\(p_owner_email\)\)/, "Filtered rate mutations should resolve ids only within the active workspace");
assert.match(workspaceRateScopeMigration, /revoke all on function public\.rateware_filtered_rate_ids[\s\S]*from public, anon, authenticated/, "The filtered mutation RPC should not be callable by browser roles");
assert.match(workspaceRateScopeMigration, /grant execute on function public\.rateware_filtered_rate_ids[\s\S]*to service_role/, "The filtered mutation RPC should remain available to the trusted API only");
for (const [source, action] of [
  [outreachServiceSource, "send_outreach_messages"],
  [outreachServiceSource, "send_whatsapp_outreach_messages"],
  [outreachServiceSource, "delete_outreach_messages"],
  [vendorServiceSource, "remove_vendors"],
  [stagingServiceSource, "remove_staging"],
  [ratewareServiceSource, "return_rateware_to_staging"]
]) {
  assert.match(source, new RegExp(`confirmed: true,[\\s\\S]{0,120}confirmation_action: "${action}"`), `${action} should send an action-bound confirmation`);
}

console.log("Rateware stability guards passed.");
