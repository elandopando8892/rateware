import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const apiSource = readFileSync(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url), "utf8");
assert.match(apiSource, /@supabase\/supabase-js@2\.57\.4/, "The primary Edge API should pin its Supabase client dependency for reproducible deploys");
const kindeSharedSource = readFileSync(new URL("../supabase/functions/_shared/kinde.ts", import.meta.url), "utf8");
const workspaceIdentitySource = readFileSync(new URL("../supabase/functions/_shared/workspace.ts", import.meta.url), "utf8");
const createRawUploadSource = readFileSync(new URL("../supabase/functions/create-raw-upload/index.ts", import.meta.url), "utf8");
const interpretUploadSource = readFileSync(new URL("../supabase/functions/interpret-upload/index.ts", import.meta.url), "utf8");
const uploadHistorySource = readFileSync(new URL("../src/upload-history.js", import.meta.url), "utf8");
const uploadCenterSource = readFileSync(new URL("../src/upload-center.js", import.meta.url), "utf8");
const uploadServiceSource = readFileSync(new URL("../src/upload-service.js", import.meta.url), "utf8");
const uploadHistoryHtml = readFileSync(new URL("../upload-history.html", import.meta.url), "utf8");
const uploadCenterHtml = readFileSync(new URL("../upload-center.html", import.meta.url), "utf8");
const appHtml = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const platform55ShellModelSource = readFileSync(new URL("../src/platform55-shell-model.js", import.meta.url), "utf8");
const platform55ShellSource = readFileSync(new URL("../src/platform55-shell.js", import.meta.url), "utf8");
const platform55ShellCssSource = readFileSync(new URL("../src/platform55-shell.css", import.meta.url), "utf8");
const platform55SearchSource = readFileSync(new URL("../src/platform55-search.js", import.meta.url), "utf8");
const businessIntelligenceSource = readFileSync(new URL("../src/business-intelligence.js", import.meta.url), "utf8");
const businessIntelligenceHtml = readFileSync(new URL("../business-intelligence.html", import.meta.url), "utf8");
const bulkImportTemplateSource = readFileSync(new URL("../src/bulk-import-template.js", import.meta.url), "utf8");
const stagingReviewSource = readFileSync(new URL("../src/staging-review.js", import.meta.url), "utf8");
assert.match(stagingReviewSource, /data-field="\$\{field\}" aria-label="\$\{escapeHtml\(options\.label \|\| sheetColumnLabel\(field\)\)\}"/, "Editable staging cells must have a stable column-derived accessible name");
const ratewareSource = readFileSync(new URL("../src/rateware.js", import.meta.url), "utf8");
assert.match(ratewareSource, /data-rateware-field="\$\{field\}" aria-label="\$\{escapeHtml\(options\.label \|\| sheetColumnLabel\(field\)\)\}"/, "Editable Rateware cells must have a stable column-derived accessible name");
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
const carrierListTemplatesUrl = new URL("../src/carrier-list-templates.js", import.meta.url);
const carrierListTemplatesSource = existsSync(carrierListTemplatesUrl)
  ? readFileSync(carrierListTemplatesUrl, "utf8")
  : "";
const carrierTemplatePreviewSource = readFileSync(new URL("../src/carrier-list-templates-preview.js", import.meta.url), "utf8");
const carrierTemplateCapabilitySource = readFileSync(new URL("../src/carrier-list-template-capability.js", import.meta.url), "utf8");
const vendorSupportSource = readFileSync(new URL("../src/vendor-support.js", import.meta.url), "utf8");
const vendorSupportServiceSource = readFileSync(new URL("../src/vendor-support-service.js", import.meta.url), "utf8");
const vendorSupportHtml = readFileSync(new URL("../vendor-support.html", import.meta.url), "utf8");
const vendorImprovementSource = readFileSync(new URL("../src/vendor-improvement.js", import.meta.url), "utf8");
const vendorImprovementServiceSource = readFileSync(new URL("../src/vendor-improvement-service.js", import.meta.url), "utf8");
const vendorImprovementHtml = readFileSync(new URL("../vendor-improvement.html", import.meta.url), "utf8");
const shippersSource = readFileSync(new URL("../src/shippers.js", import.meta.url), "utf8");
const shipperCrmHtml = readFileSync(new URL("../shipper-crm.html", import.meta.url), "utf8");
const carrierProfileSource = readFileSync(new URL("../src/carrier-profile.js", import.meta.url), "utf8");
const carrierProfileHtml = readFileSync(new URL("../carrier-profile.html", import.meta.url), "utf8");
const catalogWorkbenchHtml = readFileSync(new URL("../catalog-workbench.html", import.meta.url), "utf8");
const interpretationMemorySource = readFileSync(new URL("../src/interpretation-memory.js", import.meta.url), "utf8");
const interpretationMemoryHtml = readFileSync(new URL("../interpretation-memory.html", import.meta.url), "utf8");
const carrierProfileApiSource = readFileSync(new URL("../supabase/functions/carrier-profile-api/index.ts", import.meta.url), "utf8");
const shipperProfileApiSource = readFileSync(new URL("../supabase/functions/shipper-profile-api/index.ts", import.meta.url), "utf8");
const rfxEventsSource = readFileSync(new URL("../src/rfx-events.js", import.meta.url), "utf8");
const outreachHtml = readFileSync(new URL("../outreach.html", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
const rfxEventsHtml = readFileSync(new URL("../rfx-events.html", import.meta.url), "utf8");
const rfxProcessSource = readFileSync(new URL("../src/rfx-process.js", import.meta.url), "utf8");
const rfxProcessServiceSource = readFileSync(new URL("../src/rfx-process-service.js", import.meta.url), "utf8");
const rfxProcessHtml = readFileSync(new URL("../rfx-process.html", import.meta.url), "utf8");
const customerRfiSource = readFileSync(new URL("../src/customer-rfi.js", import.meta.url), "utf8");
const customerRfiServiceSource = readFileSync(new URL("../src/customer-rfi-service.js", import.meta.url), "utf8");
const customerRfiHtml = readFileSync(new URL("../customer-rfi.html", import.meta.url), "utf8");
const rfxBidSource = readFileSync(new URL("../src/rfx-bid.js", import.meta.url), "utf8");
const rfxBidLaneScopeSource = readFileSync(new URL("../src/rfx-bid-lane-scope.js", import.meta.url), "utf8");
const rfxBidHtml = readFileSync(new URL("../rfx-bid.html", import.meta.url), "utf8");
const rfxBidApiSource = readFileSync(new URL("../supabase/functions/rfx-bid-api/index.ts", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../src/auth.js", import.meta.url), "utf8");
const landingSource = readFileSync(new URL("../src/landing.js", import.meta.url), "utf8");
const uiNotificationsSource = readFileSync(new URL("../src/ui-notifications.js", import.meta.url), "utf8");
const unsavedChangesSource = readFileSync(new URL("../src/unsaved-changes.js", import.meta.url), "utf8");
const ratewareApiClientSource = readFileSync(new URL("../src/rateware-api.js", import.meta.url), "utf8");
const errorCopySource = readFileSync(new URL("../src/error-copy.js", import.meta.url), "utf8");
const workbenchTabsSource = readFileSync(new URL("../src/workbench-tabs.js", import.meta.url), "utf8");
const bidRoomBoardSource = readFileSync(new URL("../src/bid-room-board.js", import.meta.url), "utf8");
const bidRoomBoardHtml = readFileSync(new URL("../bid-room-board.html", import.meta.url), "utf8");
const bidRoomE2eSource = readFileSync(new URL("../tools/bid-room-e2e.mjs", import.meta.url), "utf8");
const integrationSmokeSource = readFileSync(new URL("../tools/integration-smoke.mjs", import.meta.url), "utf8");
const whatsappEnvCheckSource = readFileSync(new URL("../tools/whatsapp-env-check.mjs", import.meta.url), "utf8");
const packageJsonSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const readmeSource = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const supabaseConfigSource = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
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
const rfxBidCostHistoryMigration = readFileSync(new URL("../supabase/migrations/20260723173000_rfx_bid_cost_history.sql", import.meta.url), "utf8");
const rfxBidValidityMigration = readFileSync(new URL("../supabase/migrations/20260708170000_rfx_bid_validity.sql", import.meta.url), "utf8");
const rfxBidDeadheadMigration = readFileSync(new URL("../supabase/migrations/20260709090000_rfx_bid_deadhead_commitment.sql", import.meta.url), "utf8");
const rfxBidWithdrawnStatusMigration = readFileSync(new URL("../supabase/migrations/20260710183000_rfx_bid_withdrawn_status.sql", import.meta.url), "utf8");
const emailBounceSuppressionMigration = readFileSync(new URL("../supabase/migrations/20260709103000_email_bounce_suppression.sql", import.meta.url), "utf8");
const emailBounceResolutionMigration = readFileSync(new URL("../supabase/migrations/20260723130000_email_bounce_resolution.sql", import.meta.url), "utf8");
const vendorContinuousImprovementMigration = readFileSync(new URL("../supabase/migrations/20260710100000_vendor_continuous_improvement.sql", import.meta.url), "utf8");
const rfxProcessMigration = readFileSync(new URL("../supabase/migrations/20260710120000_rfx_process.sql", import.meta.url), "utf8");
const vendorSegmentsCoverageMigration = readFileSync(new URL("../supabase/migrations/20260706143000_vendor_segments_coverage_filter.sql", import.meta.url), "utf8");
const carrierTemplateMigration = readFileSync(new URL("../supabase/migrations/20260825160000_carrier_list_templates.sql", import.meta.url), "utf8");
const vendorProfileRequestsMigration = readFileSync(new URL("../supabase/migrations/20260706152000_vendor_profile_requests.sql", import.meta.url), "utf8");
const vendorProfileTokenMigration = readFileSync(new URL("../supabase/migrations/20260801021411_hash_vendor_profile_request_tokens.sql", import.meta.url), "utf8");
const rfxInvitationTokenMigration = readFileSync(new URL("../supabase/migrations/20260801023832_hash_rfx_bid_invitation_tokens.sql", import.meta.url), "utf8");
const rfxLaneDetailSectionsMigration = readFileSync(new URL("../supabase/migrations/20260707170000_rfx_lane_detail_sections.sql", import.meta.url), "utf8");
const rfxDefaultTemplateMigration = readFileSync(new URL("../supabase/migrations/20260708093000_enrich_rfx_default_invitation_template.sql", import.meta.url), "utf8");
const rfxBilingualTemplateMigration = readFileSync(new URL("../supabase/migrations/20260708101500_simplify_bilingual_rfx_invitation_templates.sql", import.meta.url), "utf8");
const rfxSpanishTemplateNameMigration = readFileSync(new URL("../supabase/migrations/20260708103000_normalize_spanish_template_name.sql", import.meta.url), "utf8");
const rfxTemplateSignatureMigration = readFileSync(new URL("../supabase/migrations/20260708110000_add_marksman_signature_to_rfx_templates.sql", import.meta.url), "utf8");
const rfxTemplateSignatureImageMigration = readFileSync(new URL("../supabase/migrations/20260708112500_add_signature_image_to_rfx_templates.sql", import.meta.url), "utf8");
const rfxTemplateProfileLinkMigration = readFileSync(new URL("../supabase/migrations/20260708123000_add_profile_update_link_to_rfx_templates.sql", import.meta.url), "utf8");
const vendorSupportMigration = readFileSync(new URL("../supabase/migrations/20260708143000_vendor_support_tickets.sql", import.meta.url), "utf8");
const whatsappBusinessMigration = readFileSync(new URL("../supabase/migrations/20260710133000_whatsapp_business_integration.sql", import.meta.url), "utf8");
const outreachDeliveryStateGuardMigration = readFileSync(new URL("../supabase/migrations/20260804082758_protect_outreach_delivery_state.sql", import.meta.url), "utf8");
const whatsappWorkspaceMigration = readFileSync(new URL("../supabase/migrations/20260710190000_whatsapp_workspace_connections.sql", import.meta.url), "utf8");
const whatsappTenantAppMigration = readFileSync(new URL("../supabase/migrations/20260711190000_whatsapp_tenant_app_credentials.sql", import.meta.url), "utf8");
const whatsappTemplateMappingMigration = readFileSync(new URL("../supabase/migrations/20260711203000_whatsapp_outreach_template_mappings.sql", import.meta.url), "utf8");
const outreachDeliveryIdempotencyMigration = readFileSync(new URL("../supabase/migrations/20260722210449_outreach_delivery_idempotency.sql", import.meta.url), "utf8");
const outreachDeliveryTraceMigration = readFileSync(new URL("../supabase/migrations/20260723002150_outreach_delivery_trace.sql", import.meta.url), "utf8");
const outreachControlCenterMigration = readFileSync(new URL("../supabase/migrations/20260724130000_outreach_control_center.sql", import.meta.url), "utf8");
const whatsappWebhookSource = readFileSync(new URL("../supabase/functions/whatsapp-webhook/index.ts", import.meta.url), "utf8");
const whatsappWebhookRoutingMigration = readFileSync(new URL("../supabase/migrations/20260723005859_whatsapp_webhook_routing_indexes.sql", import.meta.url), "utf8");
const vendorWorkspaceSearchMigration = readFileSync(new URL("../supabase/migrations/20260723190000_vendor_workspace_search.sql", import.meta.url), "utf8");
const vendorWorkspaceSearchHardeningMigration = readFileSync(new URL("../supabase/migrations/20260725160000_vendor_workspace_search_hardening.sql", import.meta.url), "utf8");
const vendorPagePerformanceMigration = readFileSync(new URL("../supabase/migrations/20260804075304_optimize_vendor_search_page_metrics.sql", import.meta.url), "utf8");
const exactVendorConsolidationMigration = readFileSync(new URL("../supabase/migrations/20260805035742_consolidate_exact_vendor_duplicates.sql", import.meta.url), "utf8");
const exactVendorConsolidationBooleanFixMigration = readFileSync(new URL("../supabase/migrations/20260805041201_fix_vendor_consolidation_equipment_available.sql", import.meta.url), "utf8");
const exactVendorConsolidationBatchMigration = readFileSync(new URL("../supabase/migrations/20260805044343_batch_exact_vendor_consolidation.sql", import.meta.url), "utf8");
const exactVendorConsolidationWalLimitMigration = readFileSync(new URL("../supabase/migrations/20260805052208_limit_vendor_consolidation_wal.sql", import.meta.url), "utf8");
const vendorRelationshipMergeMigration = readFileSync(new URL("../supabase/migrations/20260805054258_merge_exact_vendor_relationship_collisions.sql", import.meta.url), "utf8");
const exactVendorSingleGroupMigration = readFileSync(new URL("../supabase/migrations/20260805061000_single_group_vendor_consolidation.sql", import.meta.url), "utf8");
const exactVendorSingleLoserMigration = readFileSync(new URL("../supabase/migrations/20260805063000_single_loser_vendor_consolidation.sql", import.meta.url), "utf8");
const operationalPageIndexMigration = readFileSync(new URL("../supabase/migrations/20260804075700_optimize_operational_page_indexes.sql", import.meta.url), "utf8");
const ratewareOriginDestinationIndexMigration = readFileSync(new URL("../supabase/migrations/20260807070148_index_and_fast_path_rateware_origin_destination.sql", import.meta.url), "utf8");
const bidRoomBenchmarkCandidateMigration = readFileSync(new URL("../supabase/migrations/20260804080309_optimize_bid_room_benchmark_candidates.sql", import.meta.url), "utf8");
const bidRoomBenchmarkTuningMigration = readFileSync(new URL("../supabase/migrations/20260804080554_tune_bid_room_benchmark_candidates.sql", import.meta.url), "utf8");
const vendorLifecycleUnificationMigration = readFileSync(new URL("../supabase/migrations/20260723225311_vendor_lifecycle_unification.sql", import.meta.url), "utf8");
const workspaceRateScopeMigration = readFileSync(new URL("../supabase/migrations/20260722120000_scope_uploads_and_rates_by_workspace.sql", import.meta.url), "utf8");
const workspaceRateFilterValuesMigration = readFileSync(new URL("../supabase/migrations/20260723235900_scope_rate_filter_values_by_workspace.sql", import.meta.url), "utf8");
const publicApiHardeningMigration = readFileSync(new URL("../supabase/migrations/20260801015155_harden_public_data_api_access.sql", import.meta.url), "utf8");
const biRpcIsolationMigration = readFileSync(new URL("../supabase/migrations/20260801062025_isolate_business_intelligence_rpcs.sql", import.meta.url), "utf8");
const canonicalWorkspaceMigration = readFileSync(new URL("../supabase/migrations/20260801070829_canonical_workspace_identity.sql", import.meta.url), "utf8");
const rlsInitplanMigration = readFileSync(new URL("../supabase/migrations/20260803015150_optimize_rls_auth_initplans.sql", import.meta.url), "utf8");
const internalTriggerPermissionsMigration = readFileSync(new URL("../supabase/migrations/20260803020639_restrict_internal_trigger_functions.sql", import.meta.url), "utf8");
const functionSearchPathMigration = readFileSync(new URL("../supabase/migrations/20260803025651_secure_mutable_function_search_paths.sql", import.meta.url), "utf8");
const permissiveRlsRemovalMigration = readFileSync(new URL("../supabase/migrations/20260803043030_remove_permissive_browser_rls_policies.sql", import.meta.url), "utf8");
const vendorLogoListingMigration = readFileSync(new URL("../supabase/migrations/20260803054359_remove_public_vendor_logo_listing_policy.sql", import.meta.url), "utf8");
const duplicateIndexMigration = readFileSync(new URL("../supabase/migrations/20260803055103_remove_duplicate_rate_and_whatsapp_indexes.sql", import.meta.url), "utf8");
const missingForeignKeyIndexMigration = readFileSync(new URL("../supabase/migrations/20260807064922_add_missing_foreign_key_indexes.sql", import.meta.url), "utf8");
const criticalForeignKeyIndexMigration = readFileSync(new URL("../supabase/migrations/20260803055952_index_critical_active_foreign_keys.sql", import.meta.url), "utf8");
const operationalForeignKeyIndexMigration = readFileSync(new URL("../supabase/migrations/20260803060845_index_active_operational_foreign_keys.sql", import.meta.url), "utf8");
const rfxRatebookForeignKeyIndexMigration = readFileSync(new URL("../supabase/migrations/20260803062045_index_rfx_ratebook_pipeline_foreign_keys.sql", import.meta.url), "utf8");
const rfiOpportunityForeignKeyIndexMigration = readFileSync(new URL("../supabase/migrations/20260803063109_index_rfi_opportunity_foreign_keys.sql", import.meta.url), "utf8");
const whatsappTemplateMappingForeignKeyIndexMigration = readFileSync(new URL("../supabase/migrations/20260803064226_index_whatsapp_template_mapping_foreign_key.sql", import.meta.url), "utf8");
const bidRoomChatSnapshotMigration = readFileSync(new URL("../supabase/migrations/20260803070837_optimize_bid_room_chat_snapshot.sql", import.meta.url), "utf8");
const biFilterPerformanceMigration = readFileSync(new URL("../supabase/migrations/20260801073452_optimize_bi_filter_execution.sql", import.meta.url), "utf8");
const biSummaryPerformanceMigration = readFileSync(new URL("../supabase/migrations/20260801075234_optimize_bi_summary_execution.sql", import.meta.url), "utf8");
const biFactsMigration = readFileSync(new URL("../supabase/migrations/20260801080326_create_bi_rate_facts.sql", import.meta.url), "utf8");
const biFactSemanticsMigration = readFileSync(new URL("../supabase/migrations/20260801080707_preserve_bi_missing_vendor_semantics.sql", import.meta.url), "utf8");
const biInteractivePerformanceMigration = readFileSync(new URL("../supabase/migrations/20260801081449_optimize_bi_pivot_drilldown_geo.sql", import.meta.url), "utf8");
const biProjectionPerformanceMigration = readFileSync(new URL("../supabase/migrations/20260801081904_tune_bi_fact_projections.sql", import.meta.url), "utf8");
const biComponentMetricMigration = readFileSync(new URL("../supabase/migrations/20260801082236_cache_bi_component_metrics.sql", import.meta.url), "utf8");
const biPivotCellMigration = readFileSync(new URL("../supabase/migrations/20260801082717_optimize_bi_pivot_cells.sql", import.meta.url), "utf8");
const biSummaryVendorPerformanceMigration = readFileSync(new URL("../supabase/migrations/20260801185055_optimize_bi_summary_vendor_metrics.sql", import.meta.url), "utf8");
const biRuntimeFilterMigration = readFileSync(new URL("../supabase/migrations/20260802041548_optimize_bi_runtime_filters.sql", import.meta.url), "utf8");
const biGeoProjectionMigration = readFileSync(new URL("../supabase/migrations/20260802042015_optimize_bi_geo_projection.sql", import.meta.url), "utf8");
const biGeoMemoryMigration = readFileSync(new URL("../supabase/migrations/20260802053718_tune_bi_geo_work_mem.sql", import.meta.url), "utf8");
const biGeoMemoryRevertMigration = readFileSync(new URL("../supabase/migrations/20260802061510_revert_bi_geo_work_mem.sql", import.meta.url), "utf8");
const outreachEventReadMigration = readFileSync(new URL("../supabase/migrations/20260801221809_optimize_outreach_event_reads.sql", import.meta.url), "utf8");
const bidRoomSecondaryReadMigration = readFileSync(new URL("../supabase/migrations/20260801231855_optimize_bid_room_secondary_reads.sql", import.meta.url), "utf8");
const outreachTrackingPerformanceMigration = readFileSync(new URL("../supabase/migrations/20260803013322_optimize_outreach_tracking_queries.sql", import.meta.url), "utf8");
const outreachTrackingScopeMigration = readFileSync(new URL("../supabase/migrations/20260803013648_optimize_outreach_tracking_scope_arrays.sql", import.meta.url), "utf8");
const outreachTrackingSummaryScopeMigration = readFileSync(new URL("../supabase/migrations/20260803013918_optimize_outreach_tracking_summary_scope.sql", import.meta.url), "utf8");
const rfxInvitationTableSource = rfxEventsSource.slice(rfxEventsSource.indexOf("function laneTableLabels"), rfxEventsSource.indexOf("function firstOutreachTarget"));
const apiInvitationTableSource = apiSource.slice(apiSource.indexOf("function outreachLaneTableLabels"), apiSource.indexOf("function phoneForWhatsapp"));
const marksmanSignatureAsset = new URL("../assets/marksman-email-signature.png", import.meta.url);

assert.match(vendorsSource, /let vendorDirectoryLoadVersion = 0/, "Carrier CRM should guard against stale directory responses");
assert.match(vendorsSource, /let vendorFunnelLoadVersion = 0/, "Carrier CRM should guard against stale funnel responses");
assert.match(vendorsSource, /function duplicateGroups\(rows = allVendors\)[\s\S]+const queue = \[startId\]/, "Carrier CRM duplicate review should resolve connected duplicate clusters before choosing a record");
assert.match(vendorsSource, /function duplicateHealthScore\(vendor\)/, "Carrier CRM duplicate review should rank records by health");
assert.match(vendorsSource, /function vendorHasApolloSourceId\(vendor\)/, "Carrier CRM duplicate review should identify paid Apollo records from Source ID notes");
assert.match(vendorsSource, /function duplicateQuoteEvidence\(vendor\)/, "Carrier CRM duplicate review should count linked quotation evidence before health");
assert.match(vendorsSource, /Keep: Apollo Source ID/, "Carrier CRM duplicate review should explain why an Apollo-enriched record wins");
assert.match(vendorsSource, /function uniqueVendorFunnelRows/, "Procurement Pipeline should de-duplicate vendor cards before rendering counts");
assert.match(vendorsSource, /numberValue\(bidMetrics\.quoted\)/, "Procurement Pipeline should count Bid Room quotes with Rateware-linked quotes");
assert.match(vendorsSource, /const stageNumber = funnelStages\(\)\.findIndex/, "Pipeline stage numbering should remain stable when empty stages are hidden");
assert.match(vendorsHtml, /id="vendor-funnel-scroll"/, "Pipeline stage header and Kanban board should share one horizontal scroll surface");
assert.match(stylesSource, /\.vendor-funnel-scroll \{[\s\S]*--funnel-column-width/, "Pipeline scroll surface should define one shared column width");
assert.match(vendorsSource, /let vendorIntelligenceLoadVersion = 0/, "Carrier CRM should guard against stale intelligence responses");
assert.match(vendorsSource, /loadVersion !== vendorDirectoryLoadVersion/, "Carrier directory should ignore stale response rendering");
assert.match(vendorsSource, /loadVersion !== vendorFunnelLoadVersion/, "Procurement funnel should ignore stale response rendering");
assert.match(vendorsSource, /loadVersion !== vendorIntelligenceLoadVersion/, "Vendor intelligence should ignore stale response rendering");
assert.match(rfxEventsSource, /let rfxEventsLoadVersion = 0/, "Bid Room event list should guard against stale responses");
assert.match(apiSource, /listRfxEventContext[\s\S]+listBidRoomChat\(supabase, user, \{[\s\S]+sync_google_chat: false/, "Bid Room initial rendering should use the database snapshot instead of blocking on Google Chat sync");
assert.match(rfxEventsSource, /document\.visibilityState === "visible"[\s\S]+loadBidRoomChat\(\{ syncInbound: false \}\)/, "Bid Room polling should stop while the browser tab is hidden");
assert.match(rfxEventsSource, /function shouldRefreshBidRoomCommunications[\s\S]+rfxOperateWorkspace === "communications"[\s\S]+rfxWorkbench\?\.current\(\) === "responses"/, "Bid Room chat polling should run only while the communication workspace is visible");
assert.match(rfxEventsSource, /shouldRefreshBidRoomCommunications\(eventId\)[\s\S]+loadBidRoomChat\(\{ syncInbound: false \}\)/, "Bid Room chat interval should suspend outside the communication workspace");
assert.match(rfxEventsSource, /data-workbench-view-button='responses'[\s\S]+activateRfxOperateWorkspace\(rfxOperateWorkspace/, "Opening the Operate stage should refresh the selected communication workspace on demand");
assert.match(rfxEventsSource, /document\.addEventListener\("visibilitychange"[\s\S]+shouldRefreshBidRoomCommunications\(\)[\s\S]+loadBidRoomChat\(\{ syncInbound: false \}\)/, "Bid Room should refresh once when its visible communication workspace becomes active again");
assert.match(rfxEventsSource, /rfxChatRefresh\?\.addEventListener\("click", \(\) => loadBidRoomChat\(\{ force: true, syncInbound: true \}\)\)/, "Manual Bid Room refresh should retain explicit Google Chat inbound synchronization");
assert.match(rfxEventsSource, /let rfxEventsLoadRequest = null;/, "Bid Room should track an in-flight event list request");
assert.match(rfxEventsSource, /async function loadEvents\(\{ force = false \} = \{\}\)[\s\S]+rfxEventsLoadRequest\)[\s\S]+function loadEventsRequest\(\)/, "Bid Room should reuse identical event list requests");
assert.match(rfxEventsSource, /refreshButton\?\.addEventListener\("click", \(\) => loadEvents\(\{ force: true \}\)\)/, "Bid Room refresh should bypass the in-flight event request");
assert.match(rfxEventsSource, /let rfxDetailLoadVersion = 0/, "Bid Room detail should guard against stale event responses");
assert.match(rfxEventsSource, /const rfxDetailRequests = new Map\(\);/, "Bid Room should track in-flight detail requests by event");
assert.match(rfxEventsSource, /function requestRfxDetail\(eventId, \{ force = false \} = \{\}\)[\s\S]+rfxDetailRequests\.has\(key\)[\s\S]+fetchRfxDetail/, "Bid Room should reuse identical event detail requests");
assert.match(rfxEventsSource, /await loadDetail\(eventId, \{ force: true \}\)/, "Bid Room lane edits should force fresh event detail");
assert.match(rfxEventsSource, /const rfxOutreachMessageRequests = new Map\(\);/, "Bid Room should track outreach message requests by event");
assert.match(rfxEventsSource, /const rfxResponseVendorRequests = new Map\(\);/, "Bid Room should track lightweight carrier-response requests by event");
assert.match(rfxEventsSource, /const rfxChatRequests = new Map\(\);/, "Bid Room should track chat requests by event");
assert.match(rfxEventsSource, /function requestRfxEventResource\(requestMap, eventId, loader, \{ force = false \} = \{\}\)[\s\S]+requestMap\.has\(key\)[\s\S]+loader\(\)/, "Bid Room should coalesce in-flight history, outreach, and chat requests");
assert.match(rfxEventsSource, /requestRfxEventResource\([\s\S]+rfxChatRequests,[\s\S]+sync_google_chat: syncInbound[\s\S]+\{ force \}[\s\S]+\)/, "Bid Room chat refresh should reuse pending requests unless forced");
assert.match(rfxEventsSource, /requestRfxEventResource\([\s\S]+rfxOutreachMessageRequests,[\s\S]+\{ force: true \}[\s\S]+\)/, "Outreach mutations should force fresh event messages without reloading contact history");
assert.match(rfxEventsSource, /let draftQueueLoadRequest = null;/, "Draft Queue should track an in-flight page request");
assert.match(rfxEventsSource, /let draftQueueTrackingRequest = null;/, "Draft Queue should track an in-flight tracking summary request");
assert.match(rfxEventsSource, /let draftQueueTrackingLoadVersion = 0;/, "Draft Queue tracking should guard against stale filter responses");
assert.match(rfxEventsHtml, /id="rfx-delivery-participation-list"/, "Delivery Queue should expose an RFx carrier participation ledger separate from message rows");
assert.match(rfxEventsSource, /const DELIVERY_PARTICIPATION_FILTERS = \[/, "Delivery Queue should define focused carrier participation filters");
assert.match(rfxEventsSource, /async function loadDeliveryParticipation\(\{ force = false \} = \{\}\)/, "Delivery Queue should load carrier participation separately from outbound messages");
assert.match(rfxEventsSource, /mode: "all_eligible",[\s\S]+exclude_previously_contacted: false,[\s\S]+exclude_bounced: false/, "Carrier participation should include the full RFx roster, including contacted and attention states");
assert.match(rfxEventsSource, /response: \["replied", "quoted"\],[\s\S]+attention: \["bounced", "failed", "suppressed", "no_contact"\]/, "RFx participation should classify responses and attention independently from delivery logs");
assert.doesNotMatch(rfxEventsSource.slice(rfxEventsSource.indexOf("const DRAFT_TRACKING_STATES"), rfxEventsSource.indexOf("const BID_ROOM_PARTICIPANT_BATCH_SIZE")), /\["replied", "Replied"\]|\["quoted", "Quoted"\]/, "Message delivery lifecycle should not present carrier responses or bids as outbound-message states");
assert.match(rfxEventsSource, /function draftQueuePageQuery\(eventId\)[\s\S]+function loadDraftQueuePage\(eventId = selectedEventId, options = \{\}\)[\s\S]+requestKey = JSON\.stringify\(query\)/, "Draft Queue should key requests by event, filters, page, and size");
assert.match(rfxEventsSource, /function loadDraftQueuePageRequest\(eventId, \{ render, refreshTracking, query \}\)[\s\S]+fetchOutreachMessagesPage\(query\)/, "Draft Queue should fetch the normalized page query");
assert.match(rfxEventsSource, /return await loadDraftQueuePage\(eventId, \{ render, force: true \}\)/, "Draft Queue should force a valid page after an out-of-range offset");
assert.match(rfxEventsSource, /async function loadDraftQueueTrackingSummary\(eventId = selectedEventId, \{ force = false \} = \{\}\)[\s\S]+draftQueueTrackingRequest\?\.key === scopeKey[\s\S]+function loadDraftQueueTrackingSummaryRequest\(eventId, scopeKey\)/, "Draft Queue tracking should coalesce requests by event and channel");
assert.match(rfxEventsSource, /loadVersion !== draftQueueTrackingLoadVersion[\s\S]+draftQueueTrackingSummary =/, "Draft Queue tracking should ignore stale lifecycle responses");
assert.match(rfxEventsSource, /let bidRoomChatLoadVersion = 0/, "Bid Room chat should guard against stale refreshes");
assert.match(rfxEventsSource, /const RFX_WORKSPACE_CONTEXT_STORAGE_KEY = "rateware:bid-room:workspace-context:v1"/, "Bid Room should persist one scoped workspace context");
assert.match(rfxEventsSource, /function persistRfxWorkspaceContext\(\)/, "Bid Room should persist the selected RFx and operational filters");
assert.match(rfxEventsSource, /let selectedEventId = requestedRfxEventId \|\| String\(storedRfxWorkspaceContext\.eventId \|\| ""\)/, "An explicit RFx URL should take precedence over the saved Bid Room event");
assert.match(rfxEventsSource, /function syncRfxWorkspaceUrl\(\)/, "Bid Room should expose a shareable URL for its active context");
assert.match(rfxEventsSource, /setOrRemove\("rfx_event_id", selectedEventId\)/, "Bid Room URL state should include the selected RFx without exposing participant data");
assert.match(rfxEventsSource, /function applyRfxUrlStateFromBrowser\(\)/, "Bid Room should react to browser history navigation");
assert.match(rfxEventsSource, /window\.addEventListener\("popstate", applyRfxUrlStateFromBrowser\)/, "Bid Room should keep Back and Forward navigation synchronized");
assert.match(rfxEventsSource, /const urlEventId = new URLSearchParams\(window\.location\.search\)\.get\("rfx_event_id"\)/, "Bid Room event loading should read the current URL instead of a stale initial parameter");
assert.match(rfxEventsSource, /laneSearch: String\(laneSearch\?\.value \|\| ""\)/, "Bid Room should restore the lane search");
assert.match(rfxEventsSource, /draftTracking: draftQueueTrackingStatus/, "Bid Room should restore the Draft Queue lifecycle filter");
assert.match(rfxEventsSource, /chatFilter: bidRoomChatFilter/, "Bid Room should restore the event chat filter");
assert.match(rfxEventsSource, /persistRfxWorkspaceContext\(\);\s*return await loadDraftQueuePage\(eventId, \{ render, force: true \}\)/, "Draft Queue should persist a recovered valid page");
assert.match(rfxEventsSource, /loadVersion !== rfxDetailLoadVersion \|\| selectedEventId !== eventId/, "Bid Room detail should retain the active event context");
assert.match(rfxEventsSource, /loadVersion !== bidRoomChatLoadVersion \|\| selectedEventId !== eventId/, "Bid Room chat should retain the active event context");
assert.match(rfxEventsSource, /async function refreshOutreachStateForEvent\(eventId\)/, "Bid Room outreach mutations should share one event-scoped refresh guard");
assert.doesNotMatch(rfxEventsSource, /fetchContactHistory/, "Bid Room should not download redundant contact history when invitations and outreach already identify managed carriers");
assert.match(rfxEventsSource, /fetchOutreachMessages\(\{ rfx_event_id: eventId, view: "event_context" \}\)/, "Bid Room should load all RFx outreach status rows through the join-free event projection");
assert.match(apiSource, /listRfxEventContext[\s\S]+listBidRoomChat\(supabase, user, \{[\s\S]+sync_google_chat: false/, "Bid Room should open from its local chat snapshot without blocking on Google Chat");
assert.match(rfxEventsSource, /loadBidRoomChat\(\{ syncInbound: false \}\)/, "Bid Room background polling should read local messages without repeatedly calling Google Chat");
assert.match(rfxEventsSource, /rfxChatRefresh\?\.addEventListener\("click", \(\) => loadBidRoomChat\(\{ force: true, syncInbound: true \}\)\)/, "Manual chat refresh should explicitly request Google Chat synchronization");
assert.match(outreachServiceSource, /export async function fetchOutreachMessages[\s\S]+for \(let offset = 0; offset < maxRows; offset \+= pageSize\)[\s\S]+page\?\.has_more/, "Bid Room event history should accumulate all paginated Outreach rows instead of stopping at the first page");
assert.match(rfxEventsSource, /if \(selectedEventId !== eventId\) return false;[\s\S]*outreachMessages = messageRows \|\| \[\];/, "Bid Room outreach refreshes should discard results after the active event changes");
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
const addParticipantsStart = rfxEventsSource.indexOf("async function addSelectedManualCarriersToBid");
const addParticipantsEnd = rfxEventsSource.indexOf("\nasync function ", addParticipantsStart + 1);
const addParticipantsSource = rfxEventsSource.slice(addParticipantsStart, addParticipantsEnd > addParticipantsStart ? addParticipantsEnd : undefined);
assert.ok(addParticipantsStart >= 0, "Shared Bid Room participant add flow should exist");
assert.match(addParticipantsSource, /const eventId = selectedEventId;/, "Shared participant add flow should capture its initiating Bid Room");
assert.match(addParticipantsSource, /selectedEventId !== eventId/, "Shared participant add flow should stop stale updates after navigation");
assert.match(rfxEventsSource, /manualShortlistButton\?\.addEventListener\("click", async \(\) => \{\s+await addSelectedManualCarriersToBid\(manualShortlistStatus\);/, "Step 3 should use the shared participant add flow");
assert.match(rfxEventsSource, /rfxAddOutreachCarriersButton\?\.addEventListener\("click", async \(\) => \{\s+await addSelectedManualCarriersToBid\(rfxOutreachCarrierStatus\);/, "Step 4 should use the shared participant add flow");
assert.match(rfxEventsSource, /function activeEventParticipantVendorIds\(\)/, "Carrier fit should identify vendors already participating in the active RFx");
assert.match(rfxEventsSource, /function currentRfxManagedVendorIds\(\)/, "Carrier fit should also identify event-scoped replies, bids, and rejections outside a lane invitation row");
assert.match(rfxEventsSource, /outreachMessages\.forEach\(\(row\) => \{[\s\S]*?rfx_event_id[\s\S]*?vendorId/, "Carrier fit should keep every carrier already handled in this RFx out of the recommendation pool, including archived delivery messages");
assert.match(apiSource, /async function listRfxResponseVendorIds[\s\S]+direction\.eq\.inbound,status\.in\.\(replied,responded,quoted,quote,bid_submitted,declined,rejected,withdrawn\)[\s\S]+vendor_ids/, "Carrier fit should identify responses without downloading complete contact-history rows");
assert.match(rfxEventsSource, /rfxResponseVendorIds\.forEach\(\(vendorId\) => ids\.add\(String\(vendorId\)\)\)/, "Carrier fit should merge response vendor ids into the managed participant set");
assert.match(rfxEventsSource, /\.filter\(\(vendor\) => !existingParticipantIds\.has\(String\(vendor\.id \|\| ""\)\)\)/, "Carrier fit should not offer an existing RFx participant again");
assert.match(rfxEventsSource, /Use Delivery queue to follow up or re-invite/, "Existing RFx participants should be directed to the event-scoped delivery queue");
assert.match(rfxEventsSource, /Continue \$\{formatNumber\(selectedCount\)\} to Message/, "Carrier fit should make the next Message step explicit without sending outreach");
assert.match(rfxEventsSource, /Select all ready/, "Carrier fit should expose a direct selection action for eligible carriers");
assert.match(rfxEventsSource, /data-rfx-show-all-draft-queue[\s\S]+draftQueueTrackingStatus = "all"/, "Delivery Queue should let users recover from a narrow lifecycle filter without losing RFx scope");
assert.match(rfxEventsSource, /const vendorIds = selectedManualVendorIds\(\)\.filter\(\(vendorId\) => !existingParticipantIds\.has/, "Participant add should reject stale selections that already belong to the RFx");
assert.match(vendorsSource, /const requestedVendorTab = new URLSearchParams\(window\.location\.search\)\.get\("tab"\)/, "Carrier CRM should support deep links to saved list management");
for (const laneImportButton of ["importLanesButton", "importManualLanesButton"]) {
  const start = rfxEventsSource.indexOf(`${laneImportButton}?.addEventListener`);
  const end = rfxEventsSource.indexOf("\n\n", start + 1);
  const handlerSource = rfxEventsSource.slice(start, end > start ? end : undefined);
  assert.ok(start >= 0, `${laneImportButton} handler should exist`);
  assert.match(handlerSource, /const eventId = selectedEventId;/, `${laneImportButton} should capture its initiating Bid Room`);
  assert.match(handlerSource, /importRfxLanes\(eventId, rows\)/, `${laneImportButton} should import into its initiating Bid Room`);
  assert.match(handlerSource, /selectedEventId !== eventId/, `${laneImportButton} should ignore stale results after navigation`);
}
assert.match(rfxEventsSource, /let eventLifecycleMutationRunning = false;/, "Bid Room lifecycle actions should share a mutation guard");
assert.match(rfxEventsSource, /button\.disabled = !hasSelection \|\| eventLifecycleMutationRunning/, "Bid Room lifecycle buttons should disable while an event mutation is running");
for (const lifecycleButton of ["openRfxButton", "closeRfxButton", "duplicateRfxButton", "archiveRfxButton", "deleteRfxButton"]) {
  const start = rfxEventsSource.indexOf(`${lifecycleButton}?.addEventListener`);
  const end = rfxEventsSource.indexOf("\n\n", start + 1);
  const handlerSource = rfxEventsSource.slice(start, end > start ? end : undefined);
  assert.ok(start >= 0, `${lifecycleButton} handler should exist`);
  assert.match(handlerSource, /if \(eventLifecycleMutationRunning\) return;/, `${lifecycleButton} should ignore duplicate clicks while another lifecycle action is running`);
  assert.match(handlerSource, /const eventId = selectedEventId;/, `${lifecycleButton} should capture its initiating Bid Room`);
  assert.match(handlerSource, /eventLifecycleMutationRunning = true;[\s\S]+updateEventActionState\(\);/, `${lifecycleButton} should disable lifecycle actions before mutating`);
  assert.match(handlerSource, /selectedEventId === eventId|selectedEventId !== eventId/, `${lifecycleButton} should not hijack a different Bid Room after navigation`);
  assert.match(handlerSource, /finally \{[\s\S]+eventLifecycleMutationRunning = false;[\s\S]+updateEventActionState\(\);[\s\S]+\}/, `${lifecycleButton} should restore lifecycle controls after finishing`);
}
assert.match(rfxEventsSource, /setStatus\(actionStatus, "Opening bid event\.\.\."\);[\s\S]+setStatus\(actionStatus, "Bid event opened\.", "success"\);/, "Opening a Bid Room should show progress and success feedback");
assert.match(rfxEventsSource, /setStatus\(actionStatus, "Closing bid event\.\.\."\);[\s\S]+setStatus\(actionStatus, "Bid event closed\.", "success"\);/, "Closing a Bid Room should show progress and success feedback");
assert.match(rfxEventsSource, /async function saveRfxLaneEdits[\s\S]*const eventId = selectedEventId;[\s\S]*selectedEventId !== eventId/, "Lane edits should ignore stale responses after navigation");
assert.match(rfxEventsSource, /async function autoShortlistLaneIds[\s\S]*const eventId = selectedEventId;[\s\S]*selectedEventId !== eventId/, "Bulk shortlisting should ignore stale responses after navigation");
assert.match(dashboardSource, /let dashboardLoadVersion = 0/, "Command Center should guard against stale dashboard responses");
assert.match(dashboardSource, /loadVersion !== dashboardLoadVersion/, "Command Center should ignore stale dashboard responses");
assert.match(dashboardSource, /const items = buildActionList\(summary\)\.slice\(1, 6\)/, "Command Center should not duplicate the next best action in the priority queue");
assert.match(dashboardSource, /No additional priorities/, "Command Center should show a clear state when no secondary priorities exist");
assert.match(appHtml, /id="next-action-link" class="page-primary-action" href="#" aria-disabled="true">Loading/, "Command Center should not expose a stale action while its summary is loading");
assert.match(dashboardSource, /nextActionLink\.setAttribute\("aria-disabled", "true"\)/, "Command Center should disable the next action while loading");
assert.match(dashboardSource, /nextActionLink\.removeAttribute\("aria-disabled"\)/, "Command Center should re-enable the next action after loading or on retry");
assert.match(stylesSource, /\.next-best-action-card a\[aria-disabled="true"\]/, "Command Center loading action should look and behave disabled");
const nextActionPosition = appHtml.indexOf('id="next-best-action"');
const priorityQueuePosition = appHtml.indexOf('id="priority-queue-title"');
const workflowStatusPosition = appHtml.indexOf('id="business-lifecycle"');
const metricsPosition = appHtml.indexOf('id="network-pulse"');
assert.ok(nextActionPosition >= 0 && priorityQueuePosition > nextActionPosition, "Command Center should place the priority queue after the next action");
assert.ok(priorityQueuePosition >= 0 && workflowStatusPosition > priorityQueuePosition, "Command Center should show business lifecycle after priorities in source order");
assert.ok(workflowStatusPosition >= 0 && metricsPosition > workflowStatusPosition, "Command Center should keep network pulse after lifecycle context in source order");
assert.match(appHtml, /class="rw-command-priority workspace-panel dashboard-priority-panel p55-vp-workspace-card" aria-labelledby="priority-queue-title"/, "Command Center priority queue should keep its stable accessible heading when visual primitives are added");
assert.doesNotMatch(appHtml, /class="secondary-link" href="\.\/business-intelligence\.html">Ask AI Analyst<\//, "Command Center should keep the AI action in the global header instead of duplicating it in Priority Queue");
assert.match(appHtml, /<p class="eyebrow">Network pulse<\/p>\s+<h2>Scoped operational signals<\/h2>/, "Command Center metrics should read as scoped network signals");
assert.match(stylesSource, /\.dashboard-priority-panel \.priority-queue \{[\s\S]*grid-template-columns: repeat\(2/, "Command Center priorities should use a compact two-column layout");

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
assert.match(apiSource, /const VENDOR_REFERENCE_SELECT = "id,vendor_name,legal_name,domain,primary_email,secondary_emails,profile_data,status,base_stage"/, "vendor matching should load legal names and workspace profile aliases");
assert.match(apiSource, /function nameMatchScore/, "vendor matching should score legal and commercial name candidates");
assert.match(apiSource, /source: "legal_name"/, "vendor matching should compare detected names against legal_name");
assert.match(apiSource, /function vendorBusinessNameCandidates/, "vendor matching should load commercial and DBA names from the carrier profile");
assert.match(apiSource, /source: "commercial_name"/, "vendor matching should compare detected names against commercial_name");
assert.match(apiSource, /source: "dba_name"/, "vendor matching should compare detected names against DBA names");
assert.match(apiSource, /function vendorReferenceValues/, "vendor matching should use domain, email, legal name, and commercial name inputs together");
assert.match(apiSource, /record\.vendor_email/, "vendor matching should support an explicit carrier email reference");
assert.match(apiSource, /function resolveVendorReferencesFromRows/, "vendor matching should resolve the strongest deterministic reference across available evidence");
assert.match(apiSource, /runnerUp\.score >= top\.score - 4/, "vendor matching should refuse ambiguous near-duplicate carrier matches");
assert.match(apiSource, /function attachUploadVendorHints/, "rate vendor matching should use upload-level vendor hints when rate rows are missing vendor domains");
assert.match(apiSource, /original_filename,vendor_id,vendor_hint,vendor_match_source/, "upload hints should include filenames for carrier-domain repair");
assert.match(apiSource, /Workspace owner is required for upload vendor hints/, "upload vendor hints should require a canonical workspace owner");
assert.match(apiSource, /from\("raw_uploads"\)[\s\S]*?\.eq\("owner_email", scopedOwnerEmail\)[\s\S]*?\.in\("id", chunk\)/, "upload vendor hints should be workspace-scoped and chunked");
assert.match(apiSource, /plannedVendorPatchForRateRow/, "rate vendor matching should centralize patch planning per row");
assert.match(apiSource, /plannedVendorPatchForRawUpload/, "vendor matching should repair source uploads as well as rate rows");
assert.match(apiSource, /upload_updated/, "vendor matching responses should report repaired source uploads");
assert.match(apiSource, /unmatched_errors/, "vendor matching responses should include unmatched vendor diagnostics");
assert.match(apiSource, /corrected_vendor_domain/, "vendor match diagnostics should produce a correction template");
assert.match(apiSource, /shipment_id: cleanText\(row\.row_id\)/, "vendor match diagnostics should include Shipment ID");
assert.match(apiSource, /async function fetchVendorReferenceRows/, "vendor/domain matching should page through the user's full vendor base");
assert.match(apiSource, /Vendor matching exceeded the \$\{maxRows\} row safety limit/, "vendor matching should fail explicitly instead of silently truncating a workspace catalog");
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
const selectedVendorMatchSource = apiSource.slice(apiSource.indexOf("async function matchRateVendorRows("), apiSource.indexOf("async function matchRateVendorRowsByFilter"));
assert.match(selectedVendorMatchSource, /fetchRateRowsForIds/, "selected vendor matching should fetch every selected row in bounded chunks");
assert.doesNotMatch(selectedVendorMatchSource, /\.limit\(500\)/, "selected vendor matching should not truncate explicit selections at 500 rows");
assert.match(interpretUploadSource, /async function fetchAllActiveVendorMatchRows/, "upload interpretation should page through the full active workspace vendor catalog");
assert.match(interpretUploadSource, /\.eq\("owner_email", user\.owner_email\)[\s\S]*?\.eq\("status", "active"\)/, "upload interpretation vendor lookup should remain workspace-scoped");
assert.match(interpretUploadSource, /\.range\(offset, offset \+ VENDOR_MATCH_PAGE_SIZE - 1\)/, "upload interpretation vendor lookup should page beyond 500 vendors");
const interpretationVendorMatcherSource = interpretUploadSource.slice(interpretUploadSource.indexOf("async function findBestVendor"), interpretUploadSource.indexOf("function buildKeys"));
assert.doesNotMatch(interpretationVendorMatcherSource, /\.limit\(500\)/, "upload interpretation should not sample only the first 500 vendors");
assert.match(interpretationVendorMatcherSource, /runnerUp && runnerUp\.score >= top\.score - 4/, "upload interpretation should refuse ambiguous near-duplicate vendor matches");
assert.match(apiSource, /normalizeBulkMaxRows\(body\.max_rows\)/, "filtered vendor matching should support whole-base matching above 50k rows");
assert.match(apiSource, /filtered vendor match[\s\S]*requirePreviewCountForFilteredBulk/, "filtered vendor matching should require confirmed dry-run preview before applying whole-base updates");
assert.match(stagingReviewSource, /source upload\(s\) repaired/, "Staging vendor matching should explain source upload repair counts");
assert.match(ratewareSource, /source upload\(s\) repaired/, "Rateware vendor matching should explain source upload repair counts");
assert.match(stagingReviewSource, /downloadVendorMatchErrors/, "Staging should download unmatched vendor diagnostics");
assert.match(ratewareSource, /downloadVendorMatchErrors/, "Rateware should download unmatched vendor diagnostics");
assert.match(stagingReviewSource, /Shipment ID/, "Staging should expose Shipment ID");
assert.match(ratewareSource, /Shipment ID/, "Rateware should expose Shipment ID");
assert.match(appHtml, /data-platform55-shell="tenant"/, "Command Center should opt into the Platform 55 tenant shell");
for (const label of ["Command Center", "Import", "Source Files", "Review Queue", "Carrier CRM", "RFx Process", "Learning Rules", "Catalog"]) {
  assert.match(platform55ShellModelSource, new RegExp(`label: "${label}"`), `Platform 55 shell model should expose ${label}`);
}

for (const [label, html] of [
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
  if (/data-platform55-shell="tenant"/.test(html)) {
    assert.match(html, /data-platform55-app/, `${label} should expose the shared Platform55 app host`);
    assert.match(html, /data-platform55-sidebar/, `${label} should expose the shared Platform55 navigation host`);
    assert.match(html, /data-platform55-topbar/, `${label} should expose the shared Platform55 topbar host`);
    assert.doesNotMatch(html, /<nav class="nav-groups"|class="[^"]*\bside-nav\b/, `${label} should not retain page-owned global navigation`);
    continue;
  }
  const nav = html.match(/<nav class="nav-groups"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.match(nav, /data-nav-code="CC"[^>]*>Command Center/, `${label} shell should use the modern Command Center nav label`);
  assert.match(nav, /data-nav-code="IM"[^>]*>Import/, `${label} shell should use the modern Import nav label`);
  assert.match(nav, /data-nav-code="SF"[^>]*>Source Files/, `${label} shell should use the modern Source Files nav label`);
  assert.match(nav, /data-nav-code="RQ"[^>]*>Review Queue/, `${label} shell should use the modern Review Queue nav label`);
  assert.match(nav, /data-nav-code="CM"[^>]*>Carrier CRM/, `${label} shell should use the modern Carrier CRM nav label`);
  assert.match(nav, /data-nav-code="RP"[^>]*>RFx Process/, `${label} shell should expose RFx Process before Bid Room`);
  assert.match(nav, /data-nav-code="LR"[^>]*>Learning Rules/, `${label} shell should use the modern Learning Rules nav label`);
  assert.match(nav, /data-nav-code="CT"[^>]*>Catalog/, `${label} shell should use the modern Catalog nav label`);
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
assert.match(rfxInvitationTokenMigration, /invitation_token_hash text/, "Bid Room invitation migration should add a token digest column");
assert.match(rfxInvitationTokenMigration, /invitation_token_encrypted text/, "Bid Room invitation migration should add server-only encrypted recovery storage");
assert.match(rfxInvitationTokenMigration, /alter column invitation_token drop not null/, "Bid Room invitation plaintext storage must be nullable for the migration path");
assert.match(rfxInvitationTokenMigration, /rfx_lane_vendors_invitation_token_hash_unique_idx/, "Bid Room invitation token hashes must be unique");
assert.match(apiSource, /async function newRfxInvitationTokenFields\(\)[\s\S]*invitation_token: null[\s\S]*invitation_token_hash[\s\S]*invitation_token_encrypted/, "New Bid Room invitations must store a hash and ciphertext instead of plaintext");
assert.doesNotMatch(apiSource, /invitation_token:\s*randomToken\(\)/, "New Bid Room invitations must never persist a raw random token");
assert.match(apiSource, /async function hydrateRfxInvitationTokens/, "Internal RFx workflows should recover invitation links only server-side");
assert.match(apiSource, /async function requireHydratedRfxInvitationTokens[\s\S]+hydrated\.length !== rows\.length[\s\S]+invitation token could not be resolved/, "Private Bid Room workflows should fail closed when a stored invitation token cannot be recovered");
assert.match(apiSource, /function outreachContext[\s\S]+if \(!invitationToken\)[\s\S]+encodeURIComponent\(invitationToken\)/, "Outreach templates must reject an empty private Bid Room token before rendering a link");
assert.doesNotMatch(apiSource, /rfx-bid\.html\?token=\$\{encodeURIComponent\([^\n]+\|\| ""\)/, "Private Bid Room links must never render an empty-token fallback");
assert.match(rfxBidApiSource, /async function findInvitationByToken[\s\S]*\.eq\("invitation_token_hash", tokenHash\)/, "Carrier portal access should resolve invitation tokens by hash");
assert.match(rfxBidApiSource, /async function migrateLegacyInvitationToken/, "Legacy Bid Room links should be migrated after successful use");
assert.doesNotMatch(rfxBidApiSource, /\.eq\("invitation_token", token\)\.single\(\)/, "Carrier portal actions must not depend on plaintext invitation token lookup");
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
  "WHATSAPP_INTERNAL_USER_IDS",
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
assert.match(apiSource, /WHATSAPP_INTERNAL_USER_IDS\.has\(ownerUserId\)/, "Internal WhatsApp access should support an allowed stable Kinde user id");
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
const sendWhatsappOutreachSource = apiSource.slice(
  apiSource.indexOf("async function sendWhatsappOutreachMessages("),
  apiSource.indexOf("async function sendWhatsappGroupOutreachMessages(")
);
const sendWhatsappGroupOutreachSource = apiSource.slice(
  apiSource.indexOf("async function sendWhatsappGroupOutreachMessages("),
  apiSource.indexOf("async function markWhatsappGroupMessageManuallySent(")
);
assert.match(apiSource, /if \(normalized === "email" \|\| normalized === "gmail" \|\| normalized === "gmail_only"\) return \["email"\]/, "Gmail-only outreach should resolve to email only");
assert.match(apiSource, /const channel = cleanText\(input\.channel\)\?\.toLowerCase\(\) \|\| "email"/, "Outreach templates and campaigns should default to Gmail only");
assert.match(apiSource, /const normalized = cleanText\(channel\)\?\.toLowerCase\(\) \|\| "email"/, "Unknown outreach channels should default to Gmail only");
assert.match(generateOutreachDraftsSource, /const wantsDirectWhatsapp = requestedChannels\.includes\("whatsapp"\)/, "Draft generation should explicitly gate direct WhatsApp work");
assert.match(generateOutreachDraftsSource, /messageChannels\(body\.channel \|\| campaign\.channel \|\| template\.channel\)/, "The channel selected in the launchpad should be authoritative for draft generation");
assert.match(generateOutreachDraftsSource, /requestedChannels\.length !== 1[\s\S]+Generate one outreach channel at a time/, "Draft generation should reject hybrid channel queues");
assert.match(generateOutreachDraftsSource, /const targetMode = requestedChannels\[0\] === "whatsapp_group" \? "vendor_group" : "direct_vendor"/, "The selected channel should own the direct or manual recipient model");
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
assert.match(outreachSource, /function contactHistoryDetailLines/, "Outreach contact history should render provider, sender, and delivery details");
assert.match(outreachSource, /meta\.delivery_error/, "Outreach contact history should show delivery errors from Gmail and WhatsApp attempts");
assert.match(outreachSource, /Provider: \$\{meta\.provider\}/, "Outreach contact history should show which provider produced a touchpoint");
assert.match(outreachSource, /function mergeContactHistoryRows/, "Outreach should merge contextual contact-history reloads without dropping global activity");
assert.match(outreachSource, /fetchContactHistory\(\{ campaign_id: campaignId, limit: 1000 \}\)/, "Outreach should load selected campaign history beyond the global startup cap");
assert.match(outreachSource, /fetchOutreachMessagesPage\(\{[\s\S]+campaign_id: campaignId,[\s\S]+limit: 1000,[\s\S]+archivedScope \? \{ status: "archived", include_archived: true \} : \{\}/, "Outreach should preserve backend message totals and has_more metadata while supporting archived campaign queues");
assert.match(outreachSource, /Showing \$\{formatCount\(messages\.length\)\} of \$\{formatCount\(messagePageInfo\.total\)\} campaign messages/, "Outreach should disclose when the campaign message queue is partially loaded");
assert.match(outreachSource, /selected\$\{scope\}/, "Outreach bulk selection copy should disclose when only loaded campaign rows are selected");
assert.match(outreachSource, /from the loaded \$\{formatCount\(messages\.length\)\} of \$\{formatCount\(messagePageInfo\.total\)\} campaign messages/, "Outreach bulk actions should disclose partial campaign scope before mutating rows");
assert.match(outreachSource, /const rows = selectedOutreachMessageRows\(\);[\s\S]+const ids = rows\.map\(\(row\) => row\.id\)\.filter\(Boolean\);[\s\S]+selectedMessageIds = new Set\(ids\);/, "Outreach bulk actions should discard stale selected ids that are no longer loaded in the active scope");
assert.match(apiSource, /body\.action === "list_contact_history"[\s\S]*const requestedLimit = Number\(body\.limit\)[\s\S]*Math\.min\(Math\.max\(requestedLimit, 25\), 1000\)[\s\S]*count: "exact"[\s\S]*\.order\("id", \{ ascending: false \}\)[\s\S]*has_more: offset \+ rows\.length < total/, "Contact history API should provide stable bounded paging metadata for campaign/vendor timelines");
assert.match(outreachServiceSource, /export async function fetchContactHistory[\s\S]+for \(let offset = 0; offset < maxRows; offset \+= pageSize\)[\s\S]+page\?\.has_more/, "Contact History consumers should load every page for an event timeline");
assert.match(apiSource, /display_phone_number: cleanText\(data\.display_phone_number\)/, "WhatsApp connection test should return display phone number at top level");
assert.match(apiSource, /quality_rating: cleanText\(data\.quality_rating\)/, "WhatsApp connection test should return quality rating at top level");
assert.doesNotMatch(apiSource, /provider_response:\s*\{\s*id:\s*data\.id/, "WhatsApp connection test should not expose raw provider phone number id");
assert.match(apiSource, /send_whatsapp_outreach_messages/, "Rateware API should send direct WhatsApp Business drafts");
assert.match(apiSource, /whatsapp_template_name: cleanText\(message\.whatsapp_template_name\) \|\| null/, "WhatsApp failures should preserve the mapped Meta template name for retriable diagnostics");
assert.match(apiSource, /updateWhatsappMessageFailure\(supabase, user, resolvedMessage, reason, now, connection\)/, "WhatsApp failures should persist the resolved message and connection mapping instead of discarding them");
assert.match(apiSource, /mark_whatsapp_group_message_manually_sent/, "Rateware API should support manual WhatsApp group completion");
assert.match(apiSource, /send_whatsapp_group_outreach_messages/, "Rateware API should explicitly guard WhatsApp group automation");
assert.match(sendWhatsappGroupOutreachSource, /WhatsApp groups are manual-only\. Open the group, copy the message, then mark the draft as manually sent\./, "WhatsApp group sends should clearly fail closed as a manual-only workflow");
assert.doesNotMatch(sendWhatsappGroupOutreachSource, /activeWhatsappConnection|delivery_status:\s*"failed"/, "Manual WhatsApp group actions should not require a Meta connection or mark drafts as provider failures");
assert.match(rfxEventsSource, /function syncOutreachChannelUi/, "Bid Room should render controls for only the active outreach channel");
assert.match(rfxEventsSource, /clearDraftQueueSelection\(\);[\s\S]+syncOutreachChannelUi\(\);/, "Changing outreach channels should clear mixed draft selections");
assert.match(rfxEventsSource, /const selectable = channel === "whatsapp"[\s\S]+selectable\.forEach\(rememberDraftRow\)/, "Select-all should only select drafts from the active channel queue");
assert.match(rfxEventsHtml, /data-rfx-draft-action-channel="email"[\s\S]+data-rfx-draft-action-channel="whatsapp"[\s\S]+data-rfx-draft-action-channel="whatsapp_group"/, "Draft queue actions should be scoped to Gmail, direct WhatsApp, or manual group delivery");
assert.match(apiSource, /test_whatsapp_business_connection/, "Rateware API should expose WhatsApp Business connection test");
assert.match(apiSource, /testWhatsappBusinessConnection[\s\S]+validateWhatsappConnectionAgainstMeta/, "Test line should validate token, Phone Number ID, and WABA together");
assert.match(apiSource, /listWhatsappConnections[\s\S]+validateWhatsappConnectionAgainstMeta/, "Internal WhatsApp settings should auto-validate a configured sender once");
assert.match(apiSource, /Meta WhatsApp request timed out after/, "Meta WhatsApp requests should fail with a bounded, actionable timeout");
assert.match(apiSource, /existingValidationStatus === "failed"[\s\S]+existingResult\.data\?\.last_error/, "Internal WhatsApp refresh should preserve a failed validation diagnosis");
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
assert.match(rfxEventsSource, /Meta sends the approved notifier/, "RFx Bid Room should distinguish the channel-specific Outreach copy from the Meta notifier");
assert.match(rfxEventsSource, /fetchOutreachMessagesPage/, "Draft queue should use a paginated backend query instead of filtering the loaded browser rows");
assert.match(rfxEventsSource, /channels: outreachDraftChannels\(selectedOutreachChannel\(\)\)/, "Draft queue should request only the selected outreach channel");
assert.match(rfxEventsSource, /search: draftQueueSearch[\s\S]+offset: draftQueueOffset[\s\S]+limit: draftQueuePageSize/, "Draft queue should send search, offset, and limit to the backend");
assert.match(rfxEventsSource, /draftPageSize\?\.addEventListener\("change"/, "Draft queue should expose a rows-per-page control");
assert.match(rfxEventsSource, /draftPreviousPageButton\?\.addEventListener\("click"[\s\S]+draftNextPageButton\?\.addEventListener\("click"/, "Draft queue should support previous and next page navigation");
assert.match(rfxEventsHtml, /rfx-draft-page-summary/, "Draft queue should display page totals");
assert.match(apiSource, /if \(body\.action === "list_outreach_messages"\)[\s\S]+count: "exact"[\s\S]+\.range\(offset, offset \+ limit - 1\)/, "Outreach messages should return an exact scoped total and a backend page");
assert.match(apiSource, /const searchTerms = String\(body\.search \|\| ""\)/, "Outreach message search should run server-side");
const compactOutreachSelect = apiSource.slice(
  apiSource.indexOf("const OUTREACH_MESSAGE_COMPACT_SELECT"),
  apiSource.indexOf("const OUTREACH_TRACKING_STATES")
);
assert.doesNotMatch(compactOutreachSelect, /html_body|text_body|whatsapp_body|whatsapp_text|send_result|invitation_token/, "Compact outreach reads must not serialize message bodies, provider payloads, or invitation tokens");
assert.match(apiSource, /get_outreach_tracking_summary[\s\S]+rateware_outreach_tracking_summary/, "Outreach lifecycle counts should aggregate inside Postgres instead of downloading the event");
assert.match(apiSource, /body\.action === "get_outreach_message"[\s\S]+\.eq\("owner_email", user\.owner_email\)[\s\S]+\.eq\("id", messageId\)/, "Full outreach detail should remain workspace-scoped and load only one requested message");
assert.match(outreachServiceSource, /fetchOutreachMessage\(id\)[\s\S]+get_outreach_message/, "Outreach service should expose one-message detail loading");
assert.match(rfxEventsSource, /compact: true/, "Bid Room event and Draft Queue reads should request compact outreach rows");
assert.match(apiSource, /const OUTREACH_MESSAGE_EVENT_SELECT =/, "Bid Room event context should have a join-free outreach projection");
assert.match(rfxEventsSource, /fetchOutreachMessages\(\{ rfx_event_id: eventId, view: "event_context" \}\)/, "Bid Room should load lightweight event message context separately from the detailed queue");
assert.match(rfxEventsSource, /ensureOutreachMessageDetail[\s\S]+Loading email preview/, "Bid Room should lazily load a full email body only when previewed");
assert.match(outreachEventReadMigration, /outreach_messages_owner_event_channel_created_idx[\s\S]+owner_email, rfx_event_id, channel, created_at desc, id desc/, "Bid Room outreach paging should have an index matching workspace, event, channel, and stable sort");
assert.match(outreachEventReadMigration, /outreach_messages_owner_campaign_created_idx[\s\S]+owner_email, campaign_id, created_at desc, id desc/, "Campaign outreach paging should have an index matching its stable sort");
assert.match(outreachTrackingPerformanceMigration, /create or replace function public\.rateware_outreach_tracking_page/, "Outreach lifecycle filters should have a server-side page RPC");
assert.match(outreachTrackingPerformanceMigration, /create or replace function public\.rateware_outreach_tracking_summary/, "Outreach lifecycle totals should have a server-side aggregation RPC");
assert.match(outreachTrackingPerformanceMigration, /security invoker/g, "Outreach tracking RPCs should preserve the caller's database permissions");
assert.match(outreachTrackingPerformanceMigration, /revoke all on function public\.rateware_outreach_tracking_page[\s\S]+from public, anon, authenticated/, "Outreach tracking pages should remain backend-only");
assert.match(outreachTrackingPerformanceMigration, /grant execute on function public\.rateware_outreach_tracking_summary[\s\S]+to service_role/, "The backend service should be able to aggregate outreach lifecycle state");
assert.match(outreachTrackingScopeMigration, /array_agg\(id\)[\s\S]+array_agg\(id::text\)[\s\S]+array_agg\(distinct vendor_id\)/, "Outreach lifecycle pages should snapshot active RFx scope once per query");
assert.match(outreachTrackingScopeMigration, /\?\| scope\.invitation_id_texts/, "Outreach lifecycle pages should match multi-lane invitation metadata against the active scope snapshot");
assert.match(outreachTrackingSummaryScopeMigration, /cross join scope/, "Outreach lifecycle totals should reuse one event-scope snapshot instead of a correlated scan per message");
assert.match(outreachTrackingSummaryScopeMigration, /'carrier_total'[\s\S]+'carrier_states'/, "Optimized outreach summaries should preserve carrier-level lifecycle totals");
assert.match(outreachTrackingSummaryScopeMigration, /revoke all on function public\.rateware_outreach_tracking_summary[\s\S]+from public, anon, authenticated/, "Optimized outreach summaries should remain backend-only");
assert.match(apiSource, /input\.sync_google_chat === true[\s\S]+syncGoogleChatInboundMessagesForThreads/, "Bid Room reads should call Google Chat only when explicitly requested");
assert.match(apiSource, /const messageLimit =[\s\S]+Math\.min\(Math\.max\(Math\.trunc\(requestedMessageLimit\), 50\), 1000\)[\s\S]+: 500/, "Bid Room chat history should have a bounded recent-message window");
assert.match(apiSource, /\.eq\("owner_email", user\.owner_email\)[\s\S]+\.eq\("rfx_event_id", event\.id\)[\s\S]+\.order\("id", \{ ascending: false \}\)[\s\S]+\.limit\(messageLimit\)/, "Bid Room chat messages should be workspace/event scoped and stably bounded");
assert.match(bidRoomSecondaryReadMigration, /contact_history_event_timeline_idx[\s\S]+rfx_event_id, occurred_at desc, id desc/, "RFx contact-history timelines should have a stable event index");
assert.match(bidRoomSecondaryReadMigration, /contact_history_campaign_timeline_idx[\s\S]+campaign_id, occurred_at desc, id desc/, "Campaign contact-history timelines should have a stable campaign index");
assert.match(bidRoomSecondaryReadMigration, /bid_room_chat_messages_event_timeline_idx[\s\S]+rfx_event_id, created_at desc, id desc/, "Bid Room chat polling should have a stable event timeline index");
assert.match(apiSource, /const \[threadsResult, chatConnection\] = await Promise\.all\(\[query, chatConnectionQuery\]\)/, "Bid Room chat polling should load threads and Google Chat readiness in parallel");
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
assert.match(rfxProcessSource, /let projectActionRunning = false;/, "RFx Process project actions should have a mutation guard");
assert.match(rfxProcessSource, /async function handleProjectAction\(action, target\) \{[\s\S]+if \(projectActionRunning\) return;[\s\S]+const projectId = project\.id;[\s\S]+projectActionRunning = true;[\s\S]+if \(target\) target\.disabled = true;[\s\S]+finally \{[\s\S]+projectActionRunning = false;[\s\S]+if \(target\) target\.disabled = false;[\s\S]+\}/, "RFx Process project actions should reject duplicate clicks and restore the initiating button");
assert.match(rfxProcessSource, /if \(state\.selectedId === projectId \|\| action === "archive-project"\) await loadProjects\(\);/, "RFx Process actions should not refresh over a different selected project");
assert.match(rfxProcessSource, /let projectCreateRunning = false;/, "RFx Process project creation should have a submit guard");
assert.match(rfxProcessSource, /rfx-process-project-table/, "RFx Process should render projects as an operational table");
assert.match(rfxProcessSource, /data-open-rfx/, "RFx Process project rows should expose a direct Open RFx action");
assert.match(rfxProcessSource, /window\.open\(target, "_blank"/, "Open RFx should open the linked Bid Room in a new tab");
assert.match(rfxProcessSource, /bid_room_event_id/, "RFx Process should use the linked Bid Room event when opening an RFx");
assert.match(rfxProcessSource, /state\.loading = false;[\s\S]+renderProjectList\(\);[\s\S]+if \(state\.selectedId\) await loadDetail/, "RFx Process should render the project table after loading completes");
assert.match(rfxProcessSource, /saveRfxProcessRfi/, "RFx Process should save internal RFI edits through the authenticated service");
assert.match(rfxProcessSource, /function rfiPanel\(\) \{[\s\S]+rfxProcessRfiEditorPanel\(\)/, "RFx Process should expose the internal RFI editor as the primary view");
assert.match(rfxProcessSource, /Public marketplace preview/, "RFx Design should show the public marketplace preview before launch");
assert.match(rfxProcessSource, /rfx-process-single-page/, "RFx Process should render RFI and RFx Design as one continuous workspace");
assert.match(rfxProcessSource, /const RFX_RFI_LANE_COLUMNS = \[/, "RFx Process should restore the full Customer RFI route matrix");
assert.match(rfxProcessSource, /data-rfx-rubric-field=\"observation\"/, "RFx Process should expose checklist observations beside each rubric");
assert.match(rfxProcessSource, /segment_checklists/, "RFx Process should preserve segment checklists when editing the RFI");
assert.match(rfxProcessSource, /rfx-process-rfi-legacy-layout/, "RFx Process should use the restored broad Customer RFI editor layout");
assert.match(rfxProcessSource, /data-rfx-segment-tab/, "RFx Process should switch the active operating segment");
assert.match(rfxProcessSource, /data-rfx-workspace-view/, "RFx Process should switch routes, requirements and files without leaving the editor");
assert.match(rfxProcessSource, /const segmentIndex = Number\.isInteger\(Number\(row\.dataset\.segmentIndex\)\)/, "RFx Process should preserve the checklist belonging to the active segment");
assert.match(rfxProcessSource, /rfx-public-preview-card/, "RFx Design should render a structured public opportunity preview");
assert.match(rfxProcessSource, /rfx-golden-card/, "RFx Design should render a master Golden Bid Room Card preview");
assert.match(rfxProcessSource, /rfx-golden-card-v2/, "Golden Bid Room Card should show a carrier-facing decision summary");
assert.match(rfxProcessSource, /function resetRfxProcessRfiDraft\(detail = state\.detail\)/, "RFx Process should initialize the editable route draft when a project loads");
assert.doesNotMatch(rfxProcessSource, /Capacity sourcing design/, "RFx Design should remove the redundant Capacity sourcing design block");
assert.match(rfxProcessSource, /data-rfx-action="import-rfi-template"/, "Internal Customer RFI editor should expose template import");
assert.match(rfxProcessSource, /data-rfx-action="download-rfi-template"/, "Internal Customer RFI editor should expose template download");
assert.match(rfxProcessSource, /async function downloadRfxProcessTemplate/, "Internal Customer RFI editor should generate a fillable template");
assert.match(rfxProcessSource, /async function importRfxProcessTemplate/, "Internal Customer RFI editor should parse uploaded templates");
assert.match(rfxProcessSource, /rfxProcessCanonicalSegmentKey/, "RFx Process template imports should resolve the active operating segment");
assert.match(rfxProcessSource, /rfxProcessIsAuxiliaryTemplateSheet/, "RFx Process template imports should skip instructions, catalog, and checklist sheets when finding routes");
assert.match(rfxProcessSource, /rfxProcessFindRubricSheet/, "RFx Process segment templates should preserve checklist rows");
assert.match(rfxProcessSource, /This template belongs to segment/, "RFx Process should explain when a segment template is uploaded to the wrong segment");
assert.match(rfxProcessSource, /rateware-customer-rfi-\$\{segmentKey\}-template/, "RFx Process downloads should identify the active segment in the filename");
assert.match(rfxProcessSource, /data-rfx-action="download-rfi-template">Download segment template/, "RFx Process should expose segment-specific template copy");
assert.match(rfxProcessSource, /data-rfx-action="import-rfi-template">Import segment template/, "RFx Process should expose segment-specific template import copy");
assert.match(rfxProcessSource, /Existing routes were preserved/, "Customer RFI template import should append without deleting existing routes");
assert.match(rfxProcessSource, /Account overview/, "Customer RFI editor should include the account overview");
assert.match(rfxProcessSource, /Operating segments/, "Customer RFI editor should include operating segments");
assert.match(rfxProcessSource, /Operating workspace/, "Customer RFI editor should include the operating workspace");
assert.doesNotMatch(rfxProcessSource, /<h3>Procurement source<\/h3>/, "Customer RFI should not use the redundant Procurement source summary heading");
assert.match(rfxProcessSource, /<th class="rfi-action-column" rowspan="2">Actions<\/th><th rowspan="2"/, "Customer RFI route actions should appear before Lane ID");
assert.match(rfxProcessSource, /data-rfx-action="remove-rfi-lane"/, "Customer RFI route remove should appear before Lane ID in each row");
assert.match(rfxProcessSource, /data-rfx-action="edit-rfi-lane"/, "Customer RFI routes should support row-level editing");
assert.match(rfxProcessSource, /data-rfx-action="cancel-rfi-lane"/, "Customer RFI row editing should support cancel without deleting routes");
assert.match(rfxProcessSource, /state\.rfiDraftLanes = \[\.\.\.current, \{ lane_id: `L\$\{laneIndex \+ 1\}`, currency: "USD", operating_segment: state\.rfiActiveSegmentKey \}\]/, "New Customer RFI lanes should belong to the active operating segment");
assert.match(rfxProcessSource, /const segmentToggle = event\.target\.closest\("\[data-rfi-editor-segment\]"\)/, "Customer RFI segment selection should update the active workspace");
assert.match(rfxProcessSource, /resetRfxProcessRfiDraft\(state\.detail\)/, "Customer RFI cancel should restore persisted routes and segments");
assert.match(rfxProcessSource, /rfx-process-preview-grid/, "RFx Design previews should render side by side");
assert.match(stylesSource, /\.rfx-package-config-card \{[\s\S]*display: none !important/, "Capacity sourcing design should be removed from the visible RFx Process flow");
assert.match(stylesSource, /\.rfx-process-preview-grid \{[\s\S]*grid-template-columns: repeat\(2/, "RFx Design previews should use a two-column desktop layout");
assert.match(apiSource, /async function saveRfxProcessRfi/, "Rateware API should support authenticated Procurement Design RFI edits");
assert.match(apiSource, /body\.action === \"save_rfx_process_rfi\"/, "Rateware API should route internal RFI saves");
assert.match(apiSource, /raw_payload: rawPayload/, "RFx Process RFI saves should preserve source fields that are not normalized yet");
assert.doesNotMatch(rfxProcessHtml, /data-rfx-process-tab=\"demand\"/, "RFx Process should remove the redundant Demand tab");
assert.doesNotMatch(rfxProcessHtml, /data-rfx-process-tab=\"bidroom\"/, "RFx Process should remove the redundant Bid Room tab");
assert.doesNotMatch(rfxProcessHtml, /rfx-process-tabs/, "RFx Process should not render the removed tab navigation");
assert.doesNotMatch(rfxProcessHtml, /data-rfx-process-tab=/, "RFx Process should not ship hidden legacy tab controls");
assert.match(rfxProcessHtml, /rfx-process-hero-actions/, "RFx Project header should host the launch/open Bid Room action");
assert.match(rfxProcessHtml, /rfx-process-project-count/, "RFx Process should show the project count beside the horizontal filters");
assert.match(stylesSource, /RFx Process project directory: full-width operational list/, "RFx Process should use the full-width project directory layout");
assert.match(apiSource, /bid_room_event_id: eventsByProject/, "RFx Process project listing should return the linked Bid Room event for direct opening");
assert.match(rfxProcessSource, /createForm\?\.addEventListener\("submit"[\s\S]+if \(projectCreateRunning\) return;[\s\S]+projectCreateRunning = true;[\s\S]+if \(submitButton\) submitButton\.disabled = true;[\s\S]+finally \{[\s\S]+projectCreateRunning = false;[\s\S]+if \(submitButton\) submitButton\.disabled = false;[\s\S]+\}/, "RFx Process project creation should reject duplicate submits and restore the submit button");
assert.match(customerRfiServiceSource, /fetchCustomerRfi/, "Customer RFI public service should expose public Customer RFI loading");
assert.match(customerRfiServiceSource, /get_customer_rfi/, "Customer RFI public service should call the public API without Kinde");
assert.doesNotMatch(customerRfiSource, /rfx-process-service/, "Customer RFI page should not import the internal authenticated RFx Process service");
assert.doesNotMatch(customerRfiServiceSource, /callRatewareApi|getKindeToken|auth\.js/, "Customer RFI public service should not depend on authenticated Rateware APIs");
assert.match(rfxProcessSource, /<p class=\"eyebrow\">Customer RFI<\/p>/, "RFx Process should include the Customer RFI section");
assert.match(rfxProcessSource, /<p class=\"eyebrow\">RFx Design<\/p>/, "RFx Process should include the RFx Design section");
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
assert.match(customerRfiSource, /let rfiSaveRunning = false;/, "Customer RFI draft save should have a running guard");
assert.match(customerRfiSource, /let rfiSubmitRunning = false;/, "Customer RFI final submit should have a running guard");
assert.match(customerRfiSource, /let rfiSegmentTemplateRunning = false;/, "Customer RFI segment template actions should have a running guard");
assert.match(customerRfiSource, /let rfiSegmentActionRunning = false;/, "Customer RFI segment actions should have a running guard");
assert.match(customerRfiSource, /const busy = rfiSaveRunning \|\| rfiSubmitRunning \|\| rfiSegmentTemplateRunning \|\| rfiSegmentActionRunning;/, "Customer RFI readonly controls should respect in-flight actions");
assert.match(customerRfiSource, /async function saveDraft\(\) \{[\s\S]+if \(rfiSaveRunning \|\| rfiSubmitRunning\) return;[\s\S]+rfiSaveRunning = true;[\s\S]+finally \{[\s\S]+rfiSaveRunning = false;[\s\S]+setReadonlyMode\(\);[\s\S]+\}/, "Customer RFI draft save should reject duplicate saves and restore controls");
assert.match(customerRfiSource, /async function submitFinal\(\) \{[\s\S]+if \(rfiSubmitRunning \|\| rfiSaveRunning\) return;[\s\S]+rfiSubmitRunning = true;[\s\S]+finally \{[\s\S]+rfiSubmitRunning = false;[\s\S]+setReadonlyMode\(\);[\s\S]+\}/, "Customer RFI final submit should reject duplicate submits and restore controls");
assert.match(customerRfiSource, /async function saveActiveSegment\(\{ asNew = false \} = \{\}\) \{[\s\S]+if \(rfiSegmentActionRunning\) return;[\s\S]+rfiSegmentActionRunning = true;[\s\S]+finally \{[\s\S]+rfiSegmentActionRunning = false;[\s\S]+setReadonlyMode\(\);[\s\S]+\}/, "Customer RFI segment save should reject duplicate segment mutations and restore controls");
assert.match(customerRfiSource, /downloadSegmentTemplate\?\.addEventListener\("click"[\s\S]+if \(rfiSegmentTemplateRunning\) return;[\s\S]+rfiSegmentTemplateRunning = true;[\s\S]+finally \{[\s\S]+rfiSegmentTemplateRunning = false;[\s\S]+setReadonlyMode\(\);[\s\S]+\}/, "Customer RFI segment template download should reject duplicate downloads and restore controls");
assert.match(customerRfiSource, /importSegmentTemplateFile\?\.addEventListener\("change"[\s\S]+if \(rfiSegmentTemplateRunning\)[\s\S]+rfiSegmentTemplateRunning = true;[\s\S]+finally \{[\s\S]+rfiSegmentTemplateRunning = false;[\s\S]+setReadonlyMode\(\);[\s\S]+event\.target\.value = "";[\s\S]+\}/, "Customer RFI segment template import should reject duplicate imports, clear file input, and restore controls");
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
assert.match(stagingReviewSource, /function hasLocationCountryConflict[\s\S]+mexicanLocation/, "Staging should flag obvious MX versus US or Canada country conflicts without overwriting manual matches");
assert.match(stagingReviewSource, /hasLocationCountryConflict\(row\)[\s\S]+Country conflict/, "Staging country conflicts should block approval and remain visible inline");
assert.match(ratewareSource, /function hasLocationCountryConflict[\s\S]+Location text conflicts with the selected country/, "Rateware should expose country conflicts for approved rows without silently rewriting them");
assert.match(stagingReviewSource, /rowsWithCriticalValidation\(rows\)/, "Staging bulk save should warn before saving selected rows with critical validation issues");
assert.match(ratewareSource, /rowsWithCriticalValidation\(rows\)/, "Rateware bulk save should warn before saving selected rows with critical validation issues");
assert.match(stagingReviewSource, /function locationOptionMatch\(value, \{ allowPartial = false \} = \{\}\)/, "Staging should only normalize an exact catalog location match while the user is editing a cell");
assert.match(ratewareSource, /function locationOptionMatch\(value, \{ allowPartial = false \} = \{\}\)/, "Rateware should only normalize an exact catalog location match while the user is editing a cell");
assert.match(stagingReviewSource, /data-grid-invalid-option/, "Staging should surface pasted dropdown values that are not in the catalog");
assert.match(ratewareSource, /data-grid-invalid-option/, "Rateware should surface pasted dropdown values that are not in the catalog");
assert.match(spreadsheetGridSource, /control\.dataset\.gridInvalidOption = text/, "Spreadsheet paste should retain an unrecognized dropdown value for inline validation instead of discarding it");
assert.match(stylesSource, /sheet-issue-nav/, "Spreadsheet issue navigator should have compact styling");
assert.match(apiSource, /vendor_ids: vendorIds/, "Vendor segments should support exact participant template vendor ids");
assert.match(apiSource, /update_vendor_segment/, "API should support updating reusable vendor participant templates");
const buildParticipantsHtml = rfxEventsHtml.slice(
  rfxEventsHtml.indexOf('<details id="rfx-participant-manager"'),
  rfxEventsHtml.indexOf('<section class="bid-room-stage-panel" data-workbench-view-panel="outreach"')
);
const legacyParticipantTemplateHtml = buildParticipantsHtml.slice(
  buildParticipantsHtml.indexOf('id="rfx-participant-template-legacy-fallback"'),
  buildParticipantsHtml.indexOf('id="rfx-participant-template-crm-link"')
);
const carrierCrmTemplateLinkHtml = buildParticipantsHtml.slice(
  buildParticipantsHtml.indexOf('id="rfx-participant-template-crm-link"')
);
assert.match(buildParticipantsHtml, /id="rfx-participant-template-capability-status"[^>]*role="status"/, "Build Participants should expose a capability status without replacing manual carrier selection");
assert.match(buildParticipantsHtml, /id="retry-rfx-participant-template-capability"/, "Build Participants should expose a safe capability retry");
assert.match(legacyParticipantTemplateHtml, /^id="rfx-participant-template-legacy-fallback"[^>]*hidden[^>]*disabled/, "The legacy fallback should be an identifiable disabled fieldset hidden by default");
assert.match(carrierCrmTemplateLinkHtml, /^id="rfx-participant-template-crm-link"[^>]*hidden/, "The Carrier CRM link surface should be identifiable and hidden by default");
for (const legacyControlId of [
  "manual-shortlist-template-name",
  "save-manual-shortlist-template",
  "load-manual-shortlist-template",
  "update-manual-shortlist-template",
  "delete-manual-shortlist-template",
  "download-rfx-carrier-template",
  "rfx-carrier-template-file",
  "rfx-carrier-template-preview",
  "rfx-carrier-template-preview-body",
  "import-rfx-carrier-template",
  "rfx-carrier-template-status"
]) {
  assert.match(legacyParticipantTemplateHtml, new RegExp(`id=["']${legacyControlId}["']`), `Disabled-mode fallback should contain #${legacyControlId}`);
  assert.doesNotMatch(carrierCrmTemplateLinkHtml, new RegExp(`id=["']${legacyControlId}["']`), `The enabled-mode Carrier CRM surface should not contain #${legacyControlId}`);
}
assert.deepEqual(
  [...legacyParticipantTemplateHtml.matchAll(/data-rfx-legacy-template-action="([^"]+)"/g)].map((match) => match[1]).sort(),
  ["delete", "download", "file", "import", "load", "save", "update"],
  "Disabled mode should expose exactly the legacy create/load/update/delete/download/file-import action set"
);
assert.equal([...carrierCrmTemplateLinkHtml.matchAll(/data-rfx-legacy-template-action=/g)].length, 0, "Enabled mode should expose zero legacy mutation/import actions");
assert.match(carrierCrmTemplateLinkHtml, /<a href="\.\/vendors\.html\?tab=list-templates">Manage carrier list templates in Carrier CRM<\/a>/, "Enabled-mode Build Participants should link to the single Carrier CRM template editor");
assert.doesNotMatch(legacyParticipantTemplateHtml, /vendors\.html\?tab=list-templates/, "Disabled-mode legacy fallback should not expose the V2 editor link");

const capabilityControllerStart = rfxEventsSource.indexOf("// BID_ROOM_TEMPLATE_CAPABILITY_CONTROLLER_START");
const capabilityControllerEnd = rfxEventsSource.indexOf("// BID_ROOM_TEMPLATE_CAPABILITY_CONTROLLER_END");
assert.ok(capabilityControllerStart >= 0 && capabilityControllerEnd > capabilityControllerStart, "Bid Room should provide an executable template capability controller");
const capabilityControllerSource = rfxEventsSource.slice(capabilityControllerStart, capabilityControllerEnd);
const createCapabilityController = new Function(`${capabilityControllerSource}\nreturn createBidRoomCarrierTemplateCapabilityController;`)();
const dispatchLegacyTemplateEvent = new Function(`${capabilityControllerSource}\nreturn dispatchBidRoomLegacyTemplateEvent;`)();
const legacyTemplateActionKeys = new Function(`${capabilityControllerSource}\nreturn BID_ROOM_LEGACY_TEMPLATE_ACTION_KEYS;`)();
const legacyTemplateEvent = (action) => ({
  target: {
    closest: (selector) => selector === "[data-rfx-legacy-template-action]"
      ? { dataset: { rfxLegacyTemplateAction: action } }
      : null
  }
});
const capabilityTransitions = [];
const capabilityController = createCapabilityController({ onTransition: (state) => capabilityTransitions.push(state) });
let legacyApiCalls = 0;
const firstProbe = capabilityController.beginProbe();
const secondProbe = capabilityController.beginProbe();
assert.equal(capabilityController.resolveProbe(secondProbe, { enabled: true }), true, "The newest explicit enabled response should settle the gate");
assert.equal(capabilityController.rejectProbe(firstProbe, Object.assign(new Error("late disabled"), { enabled: false })), false, "An out-of-order disabled response should be ignored");
assert.equal(capabilityController.state, "enabled", "An out-of-order response must not race Carrier Fit into the opposite mode");
assert.deepEqual([...legacyTemplateActionKeys].sort(), ["delete", "download", "file", "import", "load", "save", "update"], "The controller should derive one exact fallback action allowlist");
for (const action of legacyTemplateActionKeys) {
  dispatchLegacyTemplateEvent(capabilityController, legacyTemplateEvent(action), () => { legacyApiCalls += 1; });
}
assert.equal(legacyApiCalls, 0, "Enabled mode should keep every stale legacy mutation/import action inert");
const successfulDisabledController = createCapabilityController();
const successfulDisabledProbe = successfulDisabledController.beginProbe();
successfulDisabledController.resolveProbe(successfulDisabledProbe, { enabled: false });
assert.equal(successfulDisabledController.state, "disabled", "A successful explicit disabled envelope should enable only the legacy fallback");
const pendingProbe = capabilityController.beginProbe();
for (const action of ["save", "load", "delete", "file", "import"]) {
  dispatchLegacyTemplateEvent(capabilityController, legacyTemplateEvent(action), () => { legacyApiCalls += 1; });
}
assert.equal(legacyApiCalls, 0, "Pending mode should keep stale delegated clicks and file events inert");
capabilityController.rejectProbe(pendingProbe, Object.assign(new Error("ordinary outage"), { status: 500 }));
for (const action of ["save", "load", "delete", "file", "import"]) {
  dispatchLegacyTemplateEvent(capabilityController, legacyTemplateEvent(action), () => { legacyApiCalls += 1; });
}
assert.equal(capabilityController.state, "error", "An ordinary failure should fail closed instead of silently enabling legacy templates");
assert.equal(legacyApiCalls, 0, "Error mode should keep stale delegated clicks and file events inert");
const disabledProbe = capabilityController.beginProbe();
capabilityController.rejectProbe(disabledProbe, Object.assign(new Error("structured disabled"), { enabled: false }));
assert.equal(capabilityController.state, "disabled", "Only an explicit disabled capability error should enable the fallback");
dispatchLegacyTemplateEvent(capabilityController, legacyTemplateEvent("save"), () => { legacyApiCalls += 1; });
assert.equal(legacyApiCalls, 1, "Disabled mode should permit the guarded fallback action");
for (const unknownAction of ["hard-delete", "remove", "DELETE", ""]) {
  assert.equal(
    dispatchLegacyTemplateEvent(capabilityController, legacyTemplateEvent(unknownAction), () => { legacyApiCalls += 1; }),
    false,
    `Disabled mode should block unknown delegated action alias ${unknownAction || "<blank>"}`
  );
}
assert.equal(legacyApiCalls, 1, "Unknown delegated aliases should never invoke a callback, even while the fallback is enabled");

function deferredLegacyResult() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

async function assertStaleLegacyContinuation({ label, action, transition, delegated = false }) {
  const controller = createCapabilityController();
  const disabledToken = controller.beginProbe();
  controller.resolveProbe(disabledToken, { enabled: false });
  const deferred = deferredLegacyResult();
  const selection = ["preserved-carrier"];
  let selectionChanges = 0;
  let stateChanges = 0;
  let domChanges = 0;
  const continuation = (_action, operation) => (async () => {
    const rows = await deferred.promise;
    if (!controller.isLegacyOperationCurrent(operation)) return false;
    selection.splice(0, selection.length, ...rows);
    selectionChanges += 1;
    stateChanges += 1;
    domChanges += 1;
    return true;
  })();
  const pendingWork = delegated
    ? dispatchLegacyTemplateEvent(controller, legacyTemplateEvent(action), continuation)
    : controller.runLegacyAction(action, continuation);
  const transitionToken = controller.beginProbe();
  if (transition === "enabled") controller.resolveProbe(transitionToken, { enabled: true });
  if (transition === "error") controller.rejectProbe(transitionToken, Object.assign(new Error("capability failed"), { status: 500 }));
  deferred.resolve(["stale-carrier"]);
  await pendingWork;
  assert.deepEqual(selection, ["preserved-carrier"], `${label} should preserve manual selection after capability ${transition}`);
  assert.equal(selectionChanges, 0, `${label} should make zero selection changes after capability ${transition}`);
  assert.equal(stateChanges, 0, `${label} should make zero state changes after capability ${transition}`);
  assert.equal(domChanges, 0, `${label} should make zero DOM changes after capability ${transition}`);
}

for (const transition of ["pending", "error", "enabled"]) {
  await assertStaleLegacyContinuation({ label: "legacy load", action: "load", transition, delegated: true });
  await assertStaleLegacyContinuation({ label: "legacy scope selection", action: "load", transition });
  await assertStaleLegacyContinuation({ label: "legacy file parse", action: "file", transition, delegated: true });
}
const supersededController = createCapabilityController();
const supersededDisabledProbe = supersededController.beginProbe();
supersededController.resolveProbe(supersededDisabledProbe, { enabled: false });
let olderOperation;
let newerOperation;
supersededController.runLegacyAction("load", (_action, operation) => { olderOperation = operation; });
supersededController.runLegacyAction("load", (_action, operation) => { newerOperation = operation; });
assert.equal(Number.isInteger(newerOperation.capabilityGeneration), true, "Legacy operations should capture the capability generation before awaiting");
assert.equal(Number.isInteger(newerOperation.legacyOperationGeneration), true, "Legacy operations should capture their own operation generation before awaiting");
assert.equal(supersededController.isLegacyOperationCurrent(olderOperation), false, "A newer disabled operation should invalidate older disabled work");
assert.equal(supersededController.isLegacyOperationCurrent(newerOperation), true, "The newest disabled operation should retain both current generations");
const malformedProbe = capabilityController.beginProbe();
capabilityController.resolveProbe(malformedProbe, { rows: [] });
assert.equal(capabilityController.state, "error", "A successful response without an explicit boolean capability should fail closed");
assert.match(rfxEventsSource, /function renderBidRoomParticipantTemplateCapability[\s\S]+legacyParticipantTemplateFallback\.hidden = !legacyEnabled;[\s\S]+legacyParticipantTemplateFallback\.disabled = !legacyEnabled;[\s\S]+participantTemplateCrmLink\.hidden = !carrierCrmEnabled;/, "Capability rendering should make the legacy fallback and Carrier CRM link mutually exclusive and disable the inactive fieldset");
assert.match(rfxEventsSource, /async function loadActiveCarrierTemplates\(\)[\s\S]+beginProbe\(\)[\s\S]+fetchCarrierListTemplates\([\s\S]+resolveProbe\(capabilityProbe, page\)[\s\S]+rejectProbe\(capabilityProbe, error\)/, "Carrier Fit and Build should share one ordered list-service capability probe");
assert.match(rfxEventsSource, /async function loadVendorSegments\(\) \{[\s\S]{0,180}state !== "disabled"\) return;/, "Legacy template reads should run only in explicit disabled mode");
assert.match(rfxEventsSource, /legacyParticipantTemplateFallback\?\.addEventListener\("click"[\s\S]+dispatchBidRoomLegacyTemplateEvent/, "Legacy click actions should use one delegated semantic guard");
assert.match(rfxEventsSource, /legacyParticipantTemplateFallback\?\.addEventListener\("change"[\s\S]+dispatchBidRoomLegacyTemplateEvent/, "Legacy file actions should use one delegated semantic guard");
assert.match(rfxEventsSource, /selectSegmentCarriersButton\?\.addEventListener\("click"[\s\S]+runLegacyAction\("load"[\s\S]+await loadManualScopeCandidateRows\(scopeId, \{ guard: legacyGuard \}\)[\s\S]+isLegacyOperationCurrent\(legacyOperation\)[\s\S]+selectManualVendorIds/, "Legacy scope selection should verify both operation generations after its await before selecting carriers");
assert.match(rfxEventsSource, /loadManualShortlistTemplateButton\?\.addEventListener\("click", async \(event\)[\s\S]+await loadManualScopeCandidateRows\(segmentId, \{ guard: legacyGuard \}\)[\s\S]+isLegacyOperationCurrent\(legacyOperation\)[\s\S]+selectedManualVendorIdsState = new Set/, "Legacy load should verify both operation generations after its await before replacing manual selection");
assert.match(rfxEventsSource, /carrierTemplateFileInput\?\.addEventListener\("change", async \(event\)[\s\S]+await parseCarrierTemplateFile\(file\)[\s\S]+isLegacyOperationCurrent\(legacyOperation\)[\s\S]+pendingCarrierTemplateRows = rows/, "Legacy file parsing should verify both operation generations after its await before changing preview state or DOM");
assert.match(rfxEventsSource, /async function hydrateVendorOptionIds\([\s\S]+await fetchVendors\([\s\S]+if \(typeof guard === "function" && !guard\(\)\) return \[\];[\s\S]+mergeVendorOptionRows/, "Legacy saved-ID hydration should verify its operation guard after every vendor await before mutating the shared CRM cache");
assert.match(rfxEventsSource, /error\?\.enabled === false/, "Bid Room should recognize disabled fallback only from structured capability metadata");
assert.doesNotMatch(rfxEventsSource, /status\s*===\s*404[\s\S]{0,160}disabled|message[\s\S]{0,160}not enabled/i, "Bid Room should not infer disabled mode from generic status or message text");
assert.match(rfxEventsHtml, /id="manual-shortlist-search"/, "Build Participants should preserve manual Carrier CRM search");
assert.match(rfxEventsHtml, /id="manual-shortlist-button"/, "Build Participants should preserve the manual RFx add action");
assert.match(rfxEventsHtml, /id="rfx-lane-template-file"/, "Build should preserve the unrelated RFx lane template import");
assert.match(rfxEventsSource, /async function parseLaneTemplateFile/, "Bid Room should preserve the unrelated RFx lane template parser");
assert.match(apiSource, /findParticipantTemplateNameConflict/, "Rateware API should reject duplicate participant template names server-side");
assert.match(apiSource, /vendor\.segment\.create/, "Rateware API should audit participant template creation");
assert.match(apiSource, /vendor\.segment\.update/, "Rateware API should audit participant template updates");
assert.match(apiSource, /requestedSegmentType === "participant_template"/, "Rateware API should scope reusable participant templates to their owner");
assert.match(rfxEventsSource, /function confirmBidRoomBulkAction/, "Bid Room should require human confirmation for shortlist and participant bulk actions");
assert.match(rfxEventsSource, /function selectedVisibleLaneIds\(\)[\s\S]+visibleLanes\(\)[\s\S]+selectedLaneIds\.has\(lane\.id\)/, "Bid Room lane bulk actions should resolve selected lanes from the active visible lane scope");
assert.match(rfxEventsSource, /function selectedVisibleInvitationIds\(\)[\s\S]+visibleLanes\(\)[\s\S]+selectedInvitationIds\.has\(invite\.id\)/, "Bid Room participant bulk actions should resolve selected vendors from the active visible lane scope");
assert.match(rfxEventsSource, /confirmBidRoomBulkAction\("auto_shortlist", ids\)/, "Bid Room should confirm before auto-shortlisting selected lanes");
assert.match(rfxEventsSource, /confirmBidRoomBulkAction\("mark_invited", ids\)/, "Bid Room should confirm before marking selected participants invited");
assert.match(rfxEventsSource, /confirmBidRoomBulkAction\("archive_participants", ids\)/, "Bid Room should confirm before archiving selected participants");
assert.match(rfxEventsSource, /autoShortlistButton\?\.addEventListener\("click", async \(\) => \{[\s\S]+const ids = selectedVisibleLaneIds\(\);/, "Bid Room auto-shortlist should ignore hidden stale selected lanes");
assert.match(rfxEventsSource, /inviteSelectedButton\?\.addEventListener\("click", async \(\) => \{[\s\S]+const ids = selectedVisibleInvitationIds\(\);/, "Bid Room invite bulk action should ignore hidden stale selected participants");
assert.match(rfxEventsSource, /archiveSelectedButton\?\.addEventListener\("click", async \(\) => \{[\s\S]+const ids = selectedVisibleInvitationIds\(\);/, "Bid Room archive bulk action should ignore hidden stale selected participants");
assert.match(ratewareApiClientSource, /function apiErrorMessage/, "Rateware API client should normalize object error payloads before throwing");
assert.doesNotMatch(ratewareApiClientSource, /new Error\(data\.error \|\| data\.message/, "Rateware API client should not throw raw object errors that render as [object Object]");
assert.match(authSource, /return await kinde\.getAccessToken\?\.\(\)/, "Kinde auth should use the supported access-token API for normal authenticated requests");
assert.match(authSource, /let kindeRefreshPromise/, "Kinde session restoration should be single-flight across concurrent bulk requests");
assert.match(authSource, /let kindeReauthenticationPromise;/, "Kinde reauthentication should be single-flight across repeated sign-in clicks");
assert.match(authSource, /if \(kindeReauthenticationPromise\) return kindeReauthenticationPromise;/, "Kinde reauthentication should reuse an in-flight login restart");
assert.match(authSource, /kindePromise = null;[\s\S]+await getKindeClient\(\)/, "Kinde session restoration should reinitialize the PKCE client so checkAuth can renew the cached token");
assert.match(authSource, /export async function authenticatedFetch/, "Authenticated requests should use one shared session-aware fetch executor");
assert.match(authSource, /response\.status !== 401[\s\S]+forceRefresh: true[\s\S]+fetch\(input, withBearerToken\(init, freshToken\)\)/, "Authenticated fetch should retry one unauthorized request after session restoration");
assert.match(authSource, /rateware:session-required/, "Failed silent restoration should raise one controlled reauthentication signal");
assert.match(authSource, /app_state: \{ returnTo \}/, "Kinde reauthentication should preserve the current module route");
assert.match(authSource, /async function hasUsableKindeSession\(\)/, "The shell should distinguish a usable Kinde token from stale local authentication state");
assert.match(authSource, /locallyAuthenticated && await hasUsableKindeSession\(\)/, "The shell should not render a stale Kinde session as an authenticated user");
assert.match(authSource, /kindePromise = null;[\s\S]+await kinde\.login\(\{ app_state: \{ returnTo \} \}\)/, "Reauthentication should recreate the Kinde client before restarting OAuth");
assert.match(authSource, /let authControlActionRunning = false;/, "Auth controls should block duplicate sign-in and sign-out clicks");
assert.match(authSource, /if \(authControlActionRunning\) return;[\s\S]+authButton\.disabled = true;[\s\S]+await reauthenticateKinde\(\)/, "Sign-in control should serialize reauthentication");
assert.match(authSource, /authButton\.textContent = "Opening sign-in\.\.\."/, "Sign-in control should show an in-progress state");
assert.match(landingSource, /heroButton\.textContent = "Opening sign-in\.\.\."/, "Landing sign-in should show an in-progress state");
assert.match(authSource, /if \(authControlActionRunning\) return;[\s\S]+signOutButton\.disabled = true;[\s\S]+await kinde\.logout\(\)/, "Sign-out control should serialize logout");
assert.doesNotMatch(authSource, /setStatus\(error\.message\)/, "Auth controls should pass caught errors through shared humanization");
assert.match(authSource, /showSessionRecovery\(\);\s*throw error;/, "Protected modules should expose session recovery rather than continuing with an expired token");
assert.doesNotMatch(readFileSync(new URL("../index.html", import.meta.url), "utf8"), /Open SaaS dashboard/, "Landing should not offer a redundant unauthenticated dashboard link");
for (const page of [
  "app.html",
  "business-intelligence.html",
  "catalog-workbench.html",
  "interpretation-memory.html",
  "outreach.html",
  "rateware.html",
  "rfx-process.html",
  "settings.html",
  "shipper-crm.html",
  "rfx-events.html",
  "staging-review.html",
  "upload-history.html",
  "upload-center.html",
  "vendors.html",
  "vendor-support.html",
  "vendor-improvement.html"
]) {
  assert.doesNotMatch(readFileSync(new URL(`../${page}`, import.meta.url), "utf8"), /Sign in with Kinde/, `${page} should keep provider branding out of the login CTA`);
}
for (const [source, label] of [
  [catalogWorkbenchSource, "Catalog"],
  [outreachSource, "Outreach"],
  [rfxEventsSource, "Bid Room"]
]) {
  assert.match(source, /requirePrivatePage\(\)\.then\([\s\S]+\.catch\(\(\) => \{\}\);/, `${label} should absorb the expected unauthenticated redirect rejection`);
}
assert.match(supabaseConfigSource, /\[functions\.rateware-api\]\s*verify_jwt\s*=\s*false/, "Rateware API must bypass Supabase gateway JWT verification so its Kinde RS256 verifier can authenticate requests");
assert.match(apiSource, /const authenticate = dependencies\.authenticate \?\? requireKindeUser/, "Rateware API handler factory must default to the custom Kinde verifier when gateway JWT verification is disabled");
assert.match(apiSource, /const claims = await authenticate\(request\)/, "Rateware API handler must preserve verified raw claims before workspace resolution");
assert.match(apiSource, /Deno\.serve\(createRatewareApiHandler\(\)\)/, "Production serving must use the same injectable Rateware API handler factory as request tests");
assert.match(ratewareApiClientSource, /import \{ authenticatedFetch \} from "\.\/auth\.js"/, "Rateware API calls should use the shared authenticated request executor");
assert.doesNotMatch(ratewareApiClientSource, /getKindeToken|response\.status === 401/, "Rateware API calls should not duplicate token refresh and retry logic");
assert.doesNotMatch(ratewareApiClientSource, /JSON\.stringify\(value\)/, "Rateware API client should not render opaque backend objects as raw JSON errors");
assert.match(ratewareApiClientSource, /value\.reason \|\| value\.description \|\| value\.detail/, "Rateware API client should extract readable backend error fields before falling back");
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
assert.doesNotMatch(stagingReviewSource, /error\.message/, "Staging should not pass raw caught error messages to visible status UI");
assert.match(ratewareSource, /import \{ humanizeError \} from "\.\/error-copy\.js"/, "Rateware should use shared human error copy");
assert.match(ratewareSource, /tone === "error" \? humanizeError\(message\) : message/, "Rateware status messages should humanize user-facing errors");
assert.doesNotMatch(ratewareSource, /error\.message/, "Rateware should not pass raw caught error messages to visible status UI");
assert.match(vendorSupportSource, /tone === "error" \? humanizeError\(message\) : message/, "Vendor Support should humanize user-facing errors");
assert.match(bidRoomBoardSource, /import \{ apiErrorMessage, humanizeError \} from "\.\/error-copy\.js"/, "Public Bid Room board should use shared human error copy");
assert.doesNotMatch(bidRoomBoardSource, /error\.message \|\| "Could/, "Public Bid Room board should not expose raw caught errors to carriers");
assert.match(carrierProfileSource, /import \{ apiErrorMessage, humanizeError \} from "\.\/error-copy\.js"/, "Carrier profile portal should use shared human error copy");
assert.doesNotMatch(carrierProfileSource, /saveStatus\.textContent = error\.message/, "Carrier profile portal should not expose raw save errors");
assert.match(catalogWorkbenchSource, /import \{ humanizeError \} from "\.\/error-copy\.js"/, "Catalog workbench should use shared human error copy");
assert.match(catalogWorkbenchSource, /tone === "error" \? humanizeError\(message\) : message/, "Catalog workbench status messages should humanize user-facing errors");
assert.doesNotMatch(catalogWorkbenchSource, /error\.message/, "Catalog workbench should not pass raw caught error messages to import, operational catalog, or location catalog status UI");
assert.match(locationMatchDrawerSource, /import \{ humanizeError \} from "\.\/error-copy\.js"/, "Location match drawer should use shared human error copy");
assert.doesNotMatch(locationMatchDrawerSource, /setMessage\?\.\(error\.message/, "Location match drawer should not expose raw alias-save errors");
assert.doesNotMatch(uploadCenterSource, /vendorSelect\.title = error\.message/, "Upload Center vendor dropdown tooltip should not expose raw load errors");
assert.doesNotMatch(vendorsSource, /\.title = error\.message/, "Carrier CRM button tooltips should not expose raw backend errors");
assert.doesNotMatch(vendorsSource, /error\.message/, "Carrier CRM should not pass raw caught error messages to funnel, import, drawer, intelligence, match, or bulk status UI");
assert.match(settingsSource, /import \{ humanizeError \} from "\.\/error-copy\.js"/, "Settings should use shared human error copy");
assert.match(settingsSource, /tone === "error" \? humanizeError\(message\) : message/, "Settings status messages should humanize integration and catalog errors");
assert.doesNotMatch(settingsSource, /error\.message/, "Settings should not pass raw caught error messages to integration, catalog, profile, or organization status UI");
assert.doesNotMatch(settingsSource, /button\.textContent = error\.message/, "Settings onboarding actions should not replace button labels with raw errors");
assert.match(settingsSource, /let gmailIntegrationActionRunning = false;/, "Settings Gmail actions should have a running guard");
assert.match(settingsSource, /syncGmailBouncesButton\.disabled = gmailIntegrationActionRunning \|\| !connected \|\| !canReadDeliveryFailures/, "Settings Gmail bounce sync should stay disabled while running");
assert.match(settingsSource, /syncGmailBouncesButton\?\.addEventListener\("click"[\s\S]+if \(gmailIntegrationActionRunning\) return;[\s\S]+gmailIntegrationActionRunning = true;[\s\S]+finally \{[\s\S]+gmailIntegrationActionRunning = false;[\s\S]+renderGmailConnections\(currentSettings\?\.gmail\);[\s\S]+\}/, "Settings Gmail bounce sync should ignore duplicate clicks and restore through renderer");
assert.match(settingsSource, /let googleChatIntegrationActionRunning = false;/, "Settings Google Chat actions should have a running guard");
assert.match(settingsSource, /saveGoogleChatSpaceButton\.disabled = googleChatIntegrationActionRunning \|\| !connected \|\| !hasGoogleChatSpaceCandidate\(\)/, "Settings Google Chat Space save should stay disabled while running");
assert.match(settingsSource, /retryGoogleChatSyncButton\?\.addEventListener\("click"[\s\S]+if \(googleChatIntegrationActionRunning\) return;[\s\S]+googleChatIntegrationActionRunning = true;[\s\S]+finally \{[\s\S]+googleChatIntegrationActionRunning = false;[\s\S]+retryGoogleChatSyncButton\.disabled = false;[\s\S]+\}/, "Settings Google Chat retry should ignore duplicate clicks and restore button state");
assert.match(settingsSource, /saveGoogleChatSpaceButton\?\.addEventListener\("click"[\s\S]+if \(googleChatIntegrationActionRunning\) return;[\s\S]+googleChatIntegrationActionRunning = true;[\s\S]+finally \{[\s\S]+googleChatIntegrationActionRunning = false;[\s\S]+updateGoogleChatSpaceSaveState\(false\);[\s\S]+\}/, "Settings Google Chat Space save should ignore duplicate clicks and restore save state");
assert.match(settingsSource, /let whatsappIntegrationActionRunning = false;/, "Settings WhatsApp actions should have a running guard");
assert.match(settingsSource, /testWhatsappButton\.disabled = whatsappIntegrationActionRunning \|\| !configured/, "Settings WhatsApp test should stay disabled while integration actions run");
assert.match(settingsSource, /syncWhatsappTemplatesButton\.disabled = whatsappIntegrationActionRunning \|\| !connected/, "Settings WhatsApp template sync should stay disabled while integration actions run");
assert.match(settingsSource, /verifyWhatsappWebhookButton\.disabled = whatsappIntegrationActionRunning \|\| !configured/, "Settings WhatsApp webhook verification should stay disabled while integration actions run");
for (const handlerName of [
  "whatsappManualForm?.addEventListener(\"submit\"",
  "disconnectWhatsappButton?.addEventListener(\"click\"",
  "testWhatsappButton?.addEventListener(\"click\"",
  "syncWhatsappTemplatesButton?.addEventListener(\"click\"",
  "verifyWhatsappWebhookButton?.addEventListener(\"click\""
]) {
  const start = settingsSource.indexOf(handlerName);
  const end = settingsSource.indexOf("\n\n", start + 1);
  const handlerSource = settingsSource.slice(start, end > start ? end : undefined);
  assert.ok(start >= 0, `${handlerName} handler should exist`);
  assert.match(handlerSource, /if \(whatsappIntegrationActionRunning\) return;/, `${handlerName} should ignore duplicate WhatsApp integration actions`);
  assert.match(handlerSource, /whatsappIntegrationActionRunning = true;/, `${handlerName} should lock WhatsApp integration actions before mutating`);
  assert.match(handlerSource, /finally \{[\s\S]+whatsappIntegrationActionRunning = false;/, `${handlerName} should restore WhatsApp integration guard after completion`);
}
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
assert.match(ratewareSource, /function displayValue\(value, fallback = "-"\)/, "Rateware drawers should normalize structured values before rendering");
assert.match(ratewareSource, /function laneEndpointLabel\(row, prefix\)/, "Rateware lane labels should use explicit row locations before normalized fallback values");
assert.match(ratewareSource, /escapeHtml\(displayValue\(value\)\)/, "Rateware detail fields should not render objects as [object Object]");
assert.match(vendorsSource, /const tone = score === 0 \? "neutral" : score >= 70 \? "strong" : score >= 35 \? "medium" : "weak";/, "Vendor health should keep zero-state profiles neutral");
assert.match(vendorsSource, /const health = combinedVendorHealth\(row\);[\s\S]*score-pill \$\{escapeHtml\(health\.tone\)\}/, "Vendor Intelligence should use the shared health tone calculation");
assert.match(vendorsSource, /import \{ installSpreadsheetGrid \} from "\.\/spreadsheet-grid\.js"/, "Carrier CRM should use the shared spreadsheet interaction engine");
assert.match(vendorsSource, /querySelectorAll\("\[data-vendor-tab\]"\)/, "Carrier CRM primary and secondary navigation should share one tab controller");
assert.match(vendorsHtml, /<strong>Directory<\/strong>/, "Carrier CRM should label the primary spreadsheet view as Directory");
assert.match(vendorsHtml, /class="vendor-secondary-tools"[\s\S]+Vendor Match/, "Carrier CRM should keep Vendor Match under secondary tools instead of the primary navigation");
assert.match(vendorsHtml, /class="vendor-directory-filter-drawer"[\s\S]+id="vendor-status-filter"[\s\S]+id="vendor-channel-filter"/, "Carrier CRM should keep secondary filters in one collapsible command surface");
assert.match(stylesSource, /\.vendor-directory-filter-drawer > summary/, "Carrier CRM filter drawer should have a compact summary control");
assert.match(stylesSource, /\.vendor-directory-filter-grid \{[\s\S]+grid-template-columns: repeat\(4, minmax\(130px, 1fr\)\) auto/, "Carrier CRM filter drawer should keep secondary filters on one compact desktop row");
assert.doesNotMatch(rfxEventsHtml, /class="bid-room-readiness-disclosure bid-room-side-checklist" open/, "Bid Room diagnostics should stay secondary and collapsed by default");
assert.match(stylesSource, /\.bid-room-flow-shell \.bid-room-stage-rail \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, "Bid Room stage rail should use all four operating columns");
assert.match(stylesSource, /Bid Room correction: keep the opportunity breakdown primary and the process reel compact[\s\S]*?\.bid-room-page \.bid-room-event-overview \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 1;/, "Bid Room should place a compact active-room summary above the right process reel");
assert.match(stylesSource, /Bid Room correction: keep the opportunity breakdown primary and the process reel compact[\s\S]*?\.bid-room-page \.bid-room-stage-panel \{[\s\S]*?grid-column: 1;[\s\S]*?grid-row: 1 \/ span 2;/, "Bid Room should keep the opportunity breakdown in the main column");
assert.match(stylesSource, /Bid Room correction: use a readable row summary instead of a cramped metric matrix[\s\S]*?\.bid-room-page \.bid-room-event-overview \.bid-room-metrics \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/, "Bid Room summary metrics should render as readable rows");
assert.match(stylesSource, /\.bid-room-stage-header > div > \.eyebrow \{[\s\S]*?display: none/, "Bid Room panels should not repeat the stage kicker below the main rail");
assert.match(uploadHistorySource, /function primaryUploadActionKey\(row\)/, "Upload History should define one primary action per source row");
assert.match(uploadHistorySource, /primaryAction === "bulk-import"|primaryAction === "interpret"|primaryAction === "rows"/, "Upload History secondary actions should avoid repeating the row primary action");
assert.match(businessIntelligenceHtml, /class="bi-filter-disclosure"[\s\S]+id="bi-filter-crossborder"/, "Analyze advanced filters should be available behind one compact disclosure");
assert.match(stylesSource, /\.bi-filter-disclosure > summary/, "Analyze advanced filters should use a compact disclosure control");
assert.match(businessIntelligenceHtml, /data-bi-view-panel="copilot" hidden/, "Analyze should hide non-default Copilot panels before JavaScript initializes");
assert.match(businessIntelligenceHtml, /data-bi-view-panel="pivots" hidden/, "Analyze should hide the Pivot panel before JavaScript initializes");
assert.match(businessIntelligenceHtml, /data-bi-view-panel="ranking" hidden/, "Analyze should hide Ranking panels before JavaScript initializes");
assert.match(catalogWorkbenchHtml, /data-workbench-view-panel="operational" hidden/, "Catalog should hide non-default operational panels before JavaScript initializes");
assert.match(catalogWorkbenchHtml, /data-workbench-view-panel="locations" hidden/, "Catalog should hide location panels before JavaScript initializes");
assert.match(catalogWorkbenchHtml, /data-workbench-view-panel="matching" hidden/, "Catalog should hide matching panels before JavaScript initializes");
assert.match(outreachHtml, /data-workbench-view-panel="dashboard" hidden/, "Outreach should hide the redundant dashboard panel before JavaScript initializes");
assert.match(outreachHtml, /data-workbench-view-panel="templates" hidden/, "Outreach should hide templates while Campaigns is the default view");
assert.match(outreachHtml, /data-workbench-view-panel="drafts" hidden/, "Outreach should hide Draft Queue while Campaigns is the default view");
assert.match(outreachHtml, /data-workbench-view-panel="history" hidden/, "Outreach should hide Contact History while Campaigns is the default view");
assert.match(catalogWorkbenchHtml, /data-workbench-view-panel="matching"[\s\S]+class="review-insight-grid catalog-match-summary"/, "Catalog match metrics should stay inside Match Review");
assert.match(stylesSource, /\.catalog-match-summary/, "Catalog match metrics should have local compact spacing");
assert.match(catalogWorkbenchSource, /import \{ tableErrorState, tableLoadingState, tableState \} from "\.\/ui-state\.js"/, "Catalog Workbench should use shared table state helpers");
assert.match(catalogWorkbenchSource, /tableLoadingState\(7,/, "Catalog Workbench should show a compact loading state while matching loads");
assert.match(catalogWorkbenchSource, /tableErrorState\(7, error, \{[\s\S]+retryAction: "load-catalog-workbench"/, "Catalog Workbench should provide a real retry action after matching errors");
assert.match(catalogWorkbenchSource, /tableState\(6, \{[\s\S]+No catalog values found/, "Operational catalog empty states should explain the next action");
assert.match(catalogWorkbenchSource, /data-retry-action='load-catalog-workbench'/, "Catalog Workbench should handle its retry action");
assert.match(catalogWorkbenchSource, /const workbenchTabs = initWorkbenchTabs\(\{ defaultView: "import" \}\)/, "Catalog Workbench should keep the active view available for lazy loading");
assert.match(catalogWorkbenchSource, /const initialView = workbenchTabs\?\.current\(\) \|\| "import";[\s\S]+if \(initialView === "matching"\) loadWorkbench\(\)/, "Catalog Workbench should only load the heavy match dataset when Match Review is active");
assert.match(catalogWorkbenchSource, /data-workbench-view-button='matching'[\s\S]+if \(!catalogWorkbenchLoaded\) loadWorkbench/, "Catalog Workbench should load the heavy match dataset when the user opens Match Review");
assert.match(catalogWorkbenchSource, /if \(catalogWorkbenchLoading\) return;/, "Catalog Workbench should ignore duplicate heavy-load requests");
assert.match(catalogWorkbenchSource, /async function loadAdminCatalogs\(\{ all = false \} = \{\}\)/, "Catalog admin data should support view-aware loading");
assert.match(catalogWorkbenchSource, /if \(all \|\| activeView === "operational"\) requests\.push\(loadCatalogValues\(\)\)/, "Operational dropdown values should load only when needed");
assert.match(catalogWorkbenchSource, /if \(all \|\| activeView === "locations"\) requests\.push\(loadLocationCatalogValues\(\)\)/, "Location catalog values should load only when needed");
assert.match(catalogWorkbenchSource, /const catalogValuesRequests = new Map\(\)/, "Catalog value loading should coalesce duplicate requests");
assert.match(catalogWorkbenchSource, /const locationCatalogValuesRequests = new Map\(\)/, "Location catalog loading should coalesce duplicate requests");
assert.match(catalogWorkbenchSource, /const existingRequest = catalogValuesRequests\.get\(category\)/, "Catalog value loading should reuse an in-flight request for the same category");
assert.match(catalogWorkbenchSource, /const existingRequest = locationCatalogValuesRequests\.get\(key\)/, "Location catalog loading should reuse an in-flight request for the same filter set");
assert.match(catalogWorkbenchSource, /const CATALOG_CACHE_TTL_MS = 30_000/, "Catalog cache should have a short freshness window");
assert.match(catalogWorkbenchSource, /function invalidateCatalogCaches\(\)/, "Catalog mutations should have an explicit cache invalidation path");
assert.match(catalogWorkbenchSource, /let catalogImportRunning = false;/, "Catalog import should track a shared import mutation guard");
assert.match(catalogWorkbenchSource, /async function confirmCatalogImport\(\) \{[\s\S]+if \(catalogImportRunning\) return;[\s\S]+catalogImportRunning = true;[\s\S]+finally \{[\s\S]+catalogImportRunning = false;[\s\S]+confirmCatalogImportButton\.disabled = !catalogImportPreviewRows\.some/, "Catalog import should reject duplicate submissions and restore controls deterministically");
assert.match(catalogWorkbenchSource, /let catalogSyncRunning = false;/, "Catalog sync should track a shared mutation guard");
assert.match(catalogWorkbenchSource, /async function syncCatalog\(\) \{[\s\S]+if \(catalogSyncRunning\) return;[\s\S]+catalogSyncRunning = true;[\s\S]+finally \{[\s\S]+catalogSyncRunning = false;[\s\S]+syncButton\.disabled = false;/, "Catalog sync should reject duplicate submissions and restore controls deterministically");
assert.match(catalogWorkbenchSource, /let catalogValueMutationRunning = false;/, "Operational catalog values should have a mutation guard");
assert.match(catalogWorkbenchSource, /let locationCatalogMutationRunning = false;/, "Location catalog values should have a mutation guard");
assert.match(catalogWorkbenchSource, /catalogValueForm\?\.addEventListener\("submit", async \(event\) => \{[\s\S]+if \(catalogValueMutationRunning\) return;[\s\S]+catalogValueMutationRunning = true;[\s\S]+finally \{[\s\S]+catalogValueMutationRunning = false;/, "Operational catalog save should reject duplicate submissions and restore controls");
assert.match(catalogWorkbenchSource, /catalogValuesBody\?\.addEventListener\("click", async \(event\) => \{[\s\S]+if \(catalogValueMutationRunning\) return;[\s\S]+archiveCatalogValue[\s\S]+finally \{[\s\S]+catalogValueMutationRunning = false;/, "Operational catalog archive should reject duplicate submissions and restore controls");
assert.match(catalogWorkbenchSource, /locationCatalogForm\?\.addEventListener\("submit", async \(event\) => \{[\s\S]+if \(locationCatalogMutationRunning\) return;[\s\S]+locationCatalogMutationRunning = true;[\s\S]+finally \{[\s\S]+locationCatalogMutationRunning = false;/, "Location catalog save should reject duplicate submissions and restore controls");
assert.match(catalogWorkbenchSource, /locationCatalogBody\?\.addEventListener\("click", async \(event\) => \{[\s\S]+if \(locationCatalogMutationRunning\) return;[\s\S]+archiveLocationCatalogValue[\s\S]+finally \{[\s\S]+locationCatalogMutationRunning = false;/, "Location catalog archive should reject duplicate submissions and restore controls");
assert.match(catalogWorkbenchSource, /const catalogMatchMutationKeys = new Set\(\);/, "Catalog Workbench match actions should guard duplicate updates per gap");
assert.match(catalogWorkbenchSource, /async function applyCatalogMatch\(tableRow,[\s\S]+const mutationKey = Number\.isFinite\(index\) \? String\(index\) : "";[\s\S]+catalogMatchMutationKeys\.has\(mutationKey\)/, "Catalog Workbench match actions should ignore duplicate submits for the same gap");
assert.match(catalogWorkbenchSource, /catalogMatchMutationKeys\.add\(mutationKey\);[\s\S]+querySelectorAll\("\[data-apply-catalog-match\], \[data-apply-catalog-alias\], \[data-catalog-suggestion\]"\)[\s\S]+finally \{[\s\S]+catalogMatchMutationKeys\.delete\(mutationKey\)/, "Catalog Workbench match actions should disable and restore per-gap controls");
assert.match(catalogWorkbenchHtml, /class="ui-state ui-state-loading"[\s\S]+Loading catalog values/, "Catalog values should start with a compact loading state");
assert.match(ratewareHtml, /class="ui-state ui-state-loading"[\s\S]+Loading approved rates/, "Rateware should start with a compact loading state");
assert.match(stagingReviewHtml, /class="ui-state ui-state-loading"[\s\S]+Loading staging rows/, "Staging Review should start with a compact loading state");
assert.match(stylesSource, /\.ui-state-row > td > \.ui-state/, "Table states should use compact spacing inside operational grids");
assert.match(uploadHistoryHtml, /class="ui-state ui-state-loading"[\s\S]+Loading upload history/, "Upload History should start with a compact loading state");
assert.match(rfxEventsHtml, /id="rfx-event-list"[\s\S]+class="ui-state ui-state-loading"[\s\S]+Loading bid events/, "Bid Room event list should start with a clear loading state");
assert.match(rfxEventsHtml, /id="manual-shortlist-vendor-list"[\s\S]+class="ui-state ui-state-loading"[\s\S]+Loading Carrier CRM/, "Bid Room carrier search should start with a clear loading state");
assert.match(rfxEventsHtml, /id="rfx-live-offer-manager"[\s\S]+class="ui-state"[\s\S]+No live bids yet/, "Bid Room auction should explain its empty state");
assert.match(stylesSource, /\.rfx-event-list > \.ui-state/, "Bid Room empty and loading states should stay compact");
assert.match(appHtml, /id="priority-queue"[\s\S]+class="ui-state ui-state-loading"[\s\S]+Loading priorities/, "Command Center should start with a clear compact loading state");
assert.match(businessIntelligenceHtml, /No route density yet[\s\S]+Run the geo density view to map/, "Analyze density should explain how to populate an empty map");
assert.match(businessIntelligenceHtml, /No actions proposed[\s\S]+Ask the analyst a commercial question/, "AI Analyst empty actions should explain the next step");
assert.match(businessIntelligenceHtml, /Pivot not built[\s\S]+Choose dimensions, filters and a metric/, "Analyze pivot empty state should explain how to build it");
assert.match(businessIntelligenceHtml, /No carrier ranking yet[\s\S]+Run a recommendation template/, "Analyze ranking empty state should explain how to run it");
assert.match(rfxEventsHtml, /id="rfx-chat-signal-queue"[\s\S]+No communication signals yet/, "Bid Room signals should explain when they appear");
assert.match(rfxEventsHtml, /id="rfx-chat-thread-list"[\s\S]+Select a bid event/, "Bid Room threads should explain their required context");
assert.match(stylesSource, /\.priority-queue > \.ui-state[\s\S]+\.bid-room-chat-thread-list > \.ui-state/, "Command Center and chat states should share compact spacing");
assert.match(rfxEventsSource, /let carrierWorkspaceLoadPromise = null;/, "Bid Room should track deferred carrier workspace loading");
assert.match(rfxEventsSource, /function loadCarrierWorkspaceData\(\{ force = false \} = \{\}\)[\s\S]+loadVendorOptions\(\{ force \}\)[\s\S]+loadActiveCarrierTemplates\(\)/, "Bid Room should load CRM carriers and active Carrier Fit templates as one deferred request with an explicit refresh path");
assert.match(rfxEventsSource, /const initialView = rfxWorkbench\?\.current\(\) \|\| "setup";[\s\S]+if \(initialView === "carriers"\) loadCarrierWorkspaceData\(\)/, "Bid Room should avoid carrier CRM loading on the default Event view");
assert.match(rfxEventsSource, /data-workbench-view-button='carriers'[\s\S]+loadCarrierWorkspaceData\(\)/, "Bid Room should load carrier CRM when Participants is opened");
assert.match(rfxEventsSource, /data-workbench-view-button='outreach'[\s\S]+loadOutreachAssets\(\)[\s\S]+loadWhatsappConnectionReadiness\(\)[\s\S]+loadCarrierWorkspaceData\(\)/, "Bid Room should load outreach assets, WhatsApp readiness, and non-blocking CRM fit when Launch is opened");
assert.match(vendorsSource, /let vendorSegmentsLoaded = false;[\s\S]+let vendorSegmentsLoadPromise = null;/, "Carrier CRM should track deferred segment loading");
assert.match(vendorsSource, /function ensureVendorSegmentsLoaded\(\)[\s\S]+vendorSegmentsLoadPromise = loadSegments\(\)/, "Carrier CRM should coalesce segment loads when Segments is opened");
assert.match(vendorsSource, /let vendorDirectoryLoadRequest = null;/, "Carrier CRM should track an in-flight directory request");
assert.match(vendorsSource, /function vendorDirectoryQuery\(\)[\s\S]+function loadVendors\(\{ force = false \} = \{\}\)[\s\S]+vendorDirectoryLoadRequest\?\.key === requestKey/, "Carrier CRM should reuse identical in-flight directory requests");
assert.match(vendorsSource, /refreshButton\.addEventListener\("click", \(\) => loadVendors\(\{ force: true \}\)\)/, "Carrier CRM refresh should bypass the in-flight request cache");
assert.match(vendorsSource, /let vendorFunnelLoadRequest = null;/, "Carrier CRM should track an in-flight funnel request");
assert.match(vendorsSource, /async function loadVendorFunnel\(\{ force = false \} = \{\}\)[\s\S]+vendorFunnelLoadRequest\)[\s\S]+function loadVendorFunnelRequest\(\)/, "Carrier CRM should reuse identical in-flight funnel requests");
assert.match(vendorsSource, /refreshVendorFunnelButton\?\.addEventListener\("click", \(\) => loadVendorFunnel\(\{ force: true \}\)\)/, "Carrier CRM funnel refresh should bypass the in-flight request cache");
assert.match(vendorsSource, /let vendorIntelligenceLoadRequest = null;/, "Carrier CRM should track an in-flight intelligence request");
assert.match(vendorsSource, /let vendorIntelligenceStale = false;/, "Carrier CRM should track derived intelligence freshness");
assert.match(vendorsSource, /async function loadVendorIntelligence\(options = \{\}\)[\s\S]+requestKey = JSON\.stringify\(\{ append, offset, search \}\)[\s\S]+function loadVendorIntelligenceRequest\(\{ append, search, offset \}\)/, "Carrier Intelligence should reuse identical in-flight searches without breaking pagination");
assert.match(vendorsSource, /if \(tabName === "intelligence" && \(!vendorIntelligenceRows\.length \|\| vendorIntelligenceStale\)\) loadVendorIntelligence\(\)/, "Carrier Intelligence should refresh after a vendor mutation when its derived data is stale");
assert.match(vendorsSource, /refreshVendorIntelligenceButton\?\.addEventListener\("click", \(\) => loadVendorIntelligence\(\{ force: true \}\)\)/, "Carrier Intelligence refresh should bypass the in-flight request cache");
assert.match(vendorsSource, /let vendorMatchLoadRequest = null;/, "Carrier CRM should track an in-flight vendor match analysis");
assert.match(vendorsSource, /async function analyzeVendorMatchQueue\(\{ force = false \} = \{\}\)[\s\S]+vendorMatchLoadRequest\)[\s\S]+function analyzeVendorMatchQueueRequest\(\)/, "Vendor matching should reuse identical in-flight scans");
assert.match(vendorsSource, /refreshVendorMatchButton\?\.addEventListener\("click", \(\) => analyzeVendorMatchQueue\(\{ force: true \}\)\)/, "Vendor matching refresh should bypass the in-flight request cache");
assert.match(vendorsSource, /vendorIntelligenceStale = true;[\s\S]+vendorMatchLoaded = false;/, "Vendor edits should invalidate derived intelligence and match results");
assert.match(vendorsSource, /const vendorDrawerSupportRequests = new Map\(\);[\s\S]+const vendorDrawerRelationshipRequests = new Map\(\);/, "Carrier drawer should track per-vendor support and relationship requests");
assert.match(vendorsSource, /function requestDrawerVendorSupport\(vendorId\)[\s\S]+vendorDrawerSupportRequests\.has\(vendorId\)[\s\S]+fetchVendorSupportTickets/, "Carrier drawer should coalesce support requests for the same vendor");
assert.match(vendorsSource, /function requestDrawerVendorRelationship\(vendorId\)[\s\S]+vendorDrawerRelationshipRequests\.has\(vendorId\)[\s\S]+fetchVendorRelationshipActivity/, "Carrier drawer should coalesce relationship requests for the same vendor");
assert.match(vendorsSource, /if \(tabName === "segments"\)[\s\S]+ensureVendorSegmentsLoaded\(\)/, "Carrier CRM should load segments only when the Segments view opens");
assert.match(vendorsSource, /if \(tabName === "duplicates" && !allVendors\.length\)[\s\S]+loadVendors\(\)\.then\(\(\) => renderDuplicateReview\(\)\)/, "Carrier CRM should load the duplicate source rows on demand");
assert.match(vendorsSource, /if \(isVendorBaseTab\(tabName\) && \(previousTab !== tabName \|\| !allVendors\.length\)\) loadVendors\(\)/, "Carrier CRM should avoid reloading the same directory tab without a filter change");
assert.doesNotMatch(vendorsSource, /renderVendorSavedViews\(""\);[\s\S]+activateVendorTab\(activeVendorTab\);[\s\S]+loadSegments\(\);[\s\S]+loadVendors\(\);/, "Carrier CRM should not eagerly load segments and vendors after tab activation");
assert.match(vendorsSource, /function saveVendorGridRow\(row\)/, "Carrier CRM should persist pasted and filled spreadsheet rows");
assert.match(vendorsSource, /rowSelector: "\[data-vendor-row-id\]"/, "Carrier CRM spreadsheet should target vendor rows");
assert.match(vendorsSource, /cellSelector: "\[data-vendor-cell\]"/, "Carrier CRM spreadsheet should target editable vendor cells");
assert.match(vendorsSource, /function selectedVisibleVendorIds\(\)[\s\S]+selectedVisibleVendorRows\(\)\.map\(\(vendor\) => vendor\.id\)\.filter\(Boolean\)/, "Carrier CRM bulk actions should resolve selected ids from the active visible vendor scope");
assert.match(vendorsSource, /bulkButton\.addEventListener\("click", async \(\) => \{[\s\S]+const ids = selectedVisibleVendorIds\(\);/, "Carrier CRM generic bulk update should ignore hidden stale selections");
assert.match(vendorsSource, /async function runBulkBaseAction\(baseStage, label\) \{[\s\S]+const ids = selectedVisibleVendorIds\(\);/, "Carrier CRM base-stage bulk actions should ignore hidden stale selections");
assert.match(vendorsSource, /bulkRemoveVendorsButton\?\.addEventListener\("click", async \(\) => \{[\s\S]+const ids = selectedVisibleVendorIds\(\);/, "Carrier CRM destructive remove should ignore hidden stale selections");
assert.match(vendorsSource, /let vendorBulkActionRunning = false;/, "Carrier CRM bulk toolbar should share a mutation guard");
assert.match(vendorsSource, /const mutationRunning = vendorBulkActionRunning;/, "Carrier CRM bulk toolbar controls should read the shared mutation guard");
assert.match(vendorsSource, /bulkProcurementButton\.disabled = mutationRunning \|\| visibleSelectedCount === 0/, "Carrier CRM procurement bulk action should disable while a bulk mutation is running");
assert.match(vendorsSource, /bulkArchiveVendorsButton\.disabled = mutationRunning \|\| visibleSelectedCount === 0 \|\| activeBaseStage === "archived"/, "Carrier CRM archive bulk action should disable while a bulk mutation is running");
assert.match(vendorsSource, /bulkButton\.addEventListener\("click", async \(\) => \{[\s\S]+if \(vendorBulkActionRunning\) return;[\s\S]+vendorBulkActionRunning = true;[\s\S]+finally \{[\s\S]+vendorBulkActionRunning = false;[\s\S]+updateBulkState\(\);[\s\S]+\}/, "Carrier CRM generic bulk update should reject duplicate submissions and restore toolbar controls");
assert.match(vendorsSource, /async function runBulkBaseAction\(baseStage, label\) \{[\s\S]+if \(vendorBulkActionRunning\) return;[\s\S]+vendorBulkActionRunning = true;[\s\S]+finally \{[\s\S]+vendorBulkActionRunning = false;[\s\S]+updateBulkState\(\);[\s\S]+\}/, "Carrier CRM base-stage bulk action should reject duplicate submissions and restore toolbar controls");
assert.match(vendorsSource, /bulkRemoveVendorsButton\?\.addEventListener\("click", async \(\) => \{[\s\S]+if \(vendorBulkActionRunning\) return;[\s\S]+vendorBulkActionRunning = true;[\s\S]+finally \{[\s\S]+vendorBulkActionRunning = false;[\s\S]+updateBulkState\(\);[\s\S]+\}/, "Carrier CRM destructive remove should reject duplicate submissions and restore toolbar controls");
assert.match(vendorsSource, /let vendorImportActionRunning = false;/, "Carrier CRM imports should share a mutation guard");
assert.match(vendorsSource, /applyVendorUpdateButton\?\.addEventListener\("click", async \(\) => \{[\s\S]+if \(vendorImportActionRunning\) return;[\s\S]+vendorImportActionRunning = true;[\s\S]+finally \{[\s\S]+vendorImportActionRunning = false;/, "Carrier CRM update template apply should reject duplicate submissions and restore import controls");
assert.match(vendorsSource, /googleImportButton\?\.addEventListener\("click", async \(\) => \{[\s\S]+if \(vendorImportActionRunning\) return;[\s\S]+vendorImportActionRunning = true;[\s\S]+finally \{[\s\S]+vendorImportActionRunning = false;/, "Carrier CRM Google Sheet import should reject duplicate submissions and restore import controls");
assert.match(vendorsSource, /confirmImportButton\.addEventListener\("click", async \(\) => \{[\s\S]+if \(vendorImportActionRunning\) return;[\s\S]+if \(!vendors\.length\) \{[\s\S]+No valid vendor rows are ready to import/, "Carrier CRM file import should block duplicate submits and empty imports");
assert.match(vendorsSource, /confirmImportButton\.addEventListener\("click", async \(\) => \{[\s\S]+vendorImportActionRunning = true;[\s\S]+finally \{[\s\S]+vendorImportActionRunning = false;/, "Carrier CRM file import should release the shared import guard");
assert.match(vendorsSource, /if \(filterButton\) \{[\s\S]+coverageFilter\.value = segment\.coverage_filter \|\| "";[\s\S]+clearVendorSelection\(\);[\s\S]+renderVendors\(allVendors\.filter\(\(vendor\) => segmentMatches\(segment, vendor\)\)\);/, "Applying a saved vendor segment should clear stale selections before rendering a new filtered CRM scope");
assert.match(vendorsSource, /function selectedVisibleVendorIntelligenceIds\(\)[\s\S]+currentVendorIntelligenceRows[\s\S]+selectedVendorIntelligenceIds\.has\(row\.vendor_id\)/, "Vendor Intelligence bulk actions should resolve selected ids from the active filtered intelligence rows");
assert.match(vendorsSource, /async function applySelectedIntelligenceTags\(\) \{[\s\S]+const ids = selectedVisibleVendorIntelligenceIds\(\);/, "Vendor Intelligence tag enrichment should ignore hidden stale selections");
assert.match(vendorsSource, /async function promoteSelectedIntelligenceVendors\(\) \{[\s\S]+const ids = selectedVisibleVendorIntelligenceIds\(\);/, "Vendor Intelligence promotion should ignore hidden stale selections");
assert.match(vendorsSource, /async function applySelectedIntelligenceTags\(\) \{[\s\S]+finally \{[\s\S]+updateVendorIntelligenceSelectionState\(\);[\s\S]+\}/, "Vendor Intelligence tag enrichment should restore selection controls after success or failure");
assert.match(vendorsSource, /async function promoteSelectedIntelligenceVendors\(\) \{[\s\S]+finally \{[\s\S]+updateVendorIntelligenceSelectionState\(\);[\s\S]+\}/, "Vendor Intelligence promotion should restore selection controls after success or failure");
assert.match(vendorsHtml, /spreadsheet-workbench vendor-directory-workspace/, "Carrier CRM directory should share the spreadsheet workspace shell");
assert.match(vendorsHtml, /id="vendor-grid-selection"/, "Carrier CRM spreadsheet should expose selection state");
assert.match(vendorsHtml, /class="table-wrap sheet-table-wrap vendor-sheet-wrap"/, "Carrier CRM should use the shared spreadsheet scroll surface");
assert.match(stylesSource, /vendor-directory-workspace \.vendor-sheet-table td\.selected-sheet-cell/, "Carrier CRM should show spreadsheet range selection");
assert.doesNotMatch(authSource, /SHELL_NAV_COLLAPSED_KEY|SHELL_FOCUS_MODE_KEY|initCommandPalette|data-command-palette-trigger/, "Auth should not retain the retired shell owner");
assert.match(platform55ShellSource, /data-platform55-nav-collapse/, "Platform55 shell should expose one shared navigation toggle");
assert.match(platform55ShellSource, /data-platform55-search-trigger/, "Platform55 shell should expose one shared search trigger");
assert.match(platform55SearchSource, /event\.ctrlKey \|\| event\.metaKey/, "Platform55 search should support a cross-platform keyboard shortcut");
assert.match(platform55SearchSource, /ArrowDown[\s\S]+ArrowUp/, "Platform55 search should support keyboard result movement");
assert.match(platform55ShellCssSource, /\.rw-app\[data-nav-collapsed="true"\]/, "Platform55 shell should support compact navigation");
assert.match(platform55ShellCssSource, /\.rw-search-dialog/, "Platform55 search should have a focused dialog presentation");
assert.match(uiNotificationsSource, /export function showNotification/, "SaaS shell should expose a shared notification renderer");
assert.match(uiNotificationsSource, /window\.ratewareNotify =/, "Operational modules should have a shared notification API");
assert.match(authSource, /initGlobalNotifications\(\)/, "SaaS shell should initialize global notifications once");
assert.match(stylesSource, /\.notification-host/, "Global notifications should use a compact fixed host");
assert.match(landingSource, /let heroAuthRunning = false;/, "Landing login CTA should block duplicate Kinde login starts");
assert.match(landingSource, /if \(heroAuthRunning\) return;/, "Landing login CTA should ignore duplicate submits");
assert.match(landingSource, /if \(heroButton\) \{\s+heroButton\.disabled = true;/, "Landing login CTA should be null-safe when disabling");
assert.match(unsavedChangesSource, /export function initUnsavedChangesGuard/, "SaaS shell should expose a shared unsaved-change guard");
assert.match(unsavedChangesSource, /beforeunload/, "Unsaved forms should warn before the browser unloads the page");
assert.match(unsavedChangesSource, /isNavigableSameOriginLink/, "Unsaved forms should guard same-origin navigation");
assert.match(unsavedChangesSource, /window\.ratewareConfirmUnsavedChanges =/, "Unsaved forms should expose a reusable confirmation for in-app navigation");
assert.match(authSource, /initUnsavedChangesGuard\(\)/, "SaaS shell should initialize the unsaved-change guard");
for (const [html, formId] of [
  [settingsHtml, "profile-form"],
  [rfxEventsHtml, "rfx-event-form"],
  [outreachHtml, "outreach-template-form"],
  [vendorsHtml, "vendor-form"],
  [stagingReviewHtml, "staging-edit-form"],
  [vendorImprovementHtml, "ci-create-form"]
]) {
  assert.match(html, new RegExp(`id="${formId}"[^>]*data-unsaved-guard`), `${formId} should protect edits from accidental navigation`);
}
for (const [source, label] of [
  [outreachSource, "Outreach"],
  [vendorsSource, "Carrier CRM"],
  [rfxEventsSource, "Bid Room"],
  [stagingReviewSource, "Staging"],
  [ratewareSource, "Rateware"]
]) {
  assert.match(source, /window\.ratewareNotify\?\./, `${label} should publish important success and error states globally`);
}
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
assert.match(rfxEventsHtml, /rfx-outreach-carrier-scope/, "Bid Room Launch should expose one clear starting set for carrier fit");
assert.match(rfxEventsHtml, /rfx-outreach-carrier-fit/, "Bid Room Launch should filter CRM carriers by equipment, operation, service, or contactability");
assert.match(rfxEventsHtml, /rfx-outreach-carrier-lane/, "Bid Room Launch should let procurement focus carrier fit on a specific route");
assert.match(rfxEventsSource, /const lanes = activeOutreachCarrierLanes\(\);/, "Carrier fit evidence should use the same selected lane as the visible recommendation list");
assert.match(rfxEventsSource, /rfxOutreachCarrierLane\?\.addEventListener\("change", \(\) => \{[\s\S]*loadRfxCarrierFitEvidence\(\{ force: true \}\)/, "Changing the Carrier fit lane should refresh its Rateware evidence");
assert.match(rfxEventsHtml, /Find carriers for this opportunity/, "Bid Room Launch should name candidate selection by the operational task");
assert.match(rfxEventsHtml, /Invitation status/, "Bid Room Launch should keep event invitation status separate from CRM candidate selection");
assert.match(rfxEventsHtml, /rfx-outreach-launch-grid/, "Bid Room Launch should keep Carrier fit and event invitation status in one coordinated workspace");
assert.match(rfxEventsHtml, /id="rfx-open-this-rfx-drawer"[\s\S]*?aria-expanded="false"/, "Carrier fit should expose event invitation status without permanently consuming canvas width");
assert.match(rfxEventsHtml, /id="rfx-outreach-audience-builder"[\s\S]*?rfx-this-rfx-drawer[\s\S]*?aria-hidden="true"[\s\S]*?inert/, "This RFx should start as an inaccessible closed drawer");
assert.match(rfxEventsSource, /function setThisRfxDrawerOpen\(open,[\s\S]*?toggleAttribute\("inert", !shouldOpen\)[\s\S]*?setAttribute\("aria-hidden", String\(!shouldOpen\)\)/, "This RFx drawer should keep keyboard and screen-reader state aligned with its visual state");
assert.match(rfxEventsSource, /event\.key === "Escape"[\s\S]*?setThisRfxDrawerOpen\(false\)/, "This RFx drawer should close with Escape");
assert.match(stylesSource, /\.rfx-outreach-launch-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/, "Carrier fit should own the full Launch canvas");
assert.match(stylesSource, /\.rfx-this-rfx-drawer \{[\s\S]*?position: fixed[\s\S]*?width: min\(420px, calc\(100vw - 36px\)\)/, "This RFx should use a bounded right-side drawer");
assert.match(rfxEventsHtml, /data-rfx-launch-workspace="carrier"/, "Bid Room Launch should provide a dedicated Carrier fit workspace");
assert.match(rfxEventsHtml, /data-rfx-launch-workspace="message"/, "Bid Room Launch should provide a dedicated Message workspace");
assert.match(rfxEventsHtml, /data-rfx-launch-workspace="delivery"/, "Bid Room Launch should provide a dedicated Delivery queue workspace");
assert.match(rfxEventsHtml, /id="rfx-outreach-preview-channel"/, "Message workspace should identify the one channel being previewed");
assert.match(rfxEventsSource, /const RFX_LAUNCH_WORKSPACE_KEYS = new Set\(\["carrier", "message", "delivery"\]\)/, "Bid Room Launch should constrain its internal workspaces");
assert.match(rfxEventsSource, /function activateRfxLaunchWorkspace\(workspace, options = \{\}\)/, "Bid Room Launch should preserve its active internal workspace");
assert.match(rfxEventsSource, /launchWorkspace: rfxLaunchWorkspace/, "Bid Room Launch should restore the active workspace with the RFx context");
assert.match(rfxEventsSource, /activateRfxLaunchWorkspace\("delivery", \{ refresh: true \}\)/, "Creating a delivery queue should move procurement to its event-specific delivery workspace");
assert.match(rfxEventsHtml, /data-rfx-operate-workspace-tab="auction"/, "Bid Room Operate should provide a dedicated Auction room workspace");
assert.match(rfxEventsHtml, /data-rfx-operate-workspace-tab="communications"/, "Bid Room Operate should provide a dedicated Carrier communications workspace");
assert.match(rfxEventsHtml, /data-rfx-operate-workspace-tab="carrier-bids"/, "Bid Room Operate should provide a dedicated Carrier bids workspace");
assert.match(rfxEventsSource, /function activateRfxOperateWorkspace\(workspace, options = \{\}\)/, "Bid Room should preserve the active Operate workspace");
assert.match(rfxEventsSource, /function openCarrierCommunication\(invitationId, laneId = ""\)/, "Auction and bid rows should open carrier communication with event context");
assert.match(rfxEventsSource, /thread_type: selectedChatRecipient\?\.vendorId \? "carrier_private" : BID_ROOM_EVENT_THREAD_TYPE/, "Carrier questions should create private event threads while preserving the event group");
assert.match(rfxEventsSource, /data-rfx-ask-carrier/, "Auction and carrier bid rows should expose a targeted Ask action");
assert.match(rfxEventsSource, /const channelPreview = emailChannel/, "Message preview should render one channel-specific recipient view");
assert.match(stylesSource, /data-rfx-launch-workspace-panel="message"\],[\s\S]*?data-rfx-launch-workspace-panel="delivery"[\s\S]*?min-height: clamp\(480px, calc\(100vh - 188px\), 760px\)/, "Message and delivery workspaces should use the available viewport height");
assert.match(stylesSource, /\.rfx-outreach-carrier-adder\.is-empty \{[\s\S]*?align-self: start/, "An empty Carrier fit panel should collapse instead of leaving a blank work area");
assert.match(stylesSource, /\.bid-room-page \.rfx-outreach-carrier-list \{[\s\S]*?max-height: none/, "Carrier fit lists should grow vertically within the Launch workspace");
assert.match(stylesSource, /\.bid-room-page \.rfx-outreach-audience-table-wrap \{[\s\S]*?height: 100%/, "Invitation status should use the available workspace height");
assert.match(stylesSource, /\.bid-room-page \.rfx-draft-queue-panel \.rfx-draft-table-wrap \{[\s\S]*?height: 100%/, "Delivery queue should use the available workspace height");
assert.match(rfxEventsHtml, /rfx-event-delivery-overview/, "Bid Room Launch should summarize delivery outcomes for the selected RFx");
assert.match(rfxEventsHtml, /value="in_delivery"/, "Bid Room Launch should group queued delivery states into one clear event filter");
assert.doesNotMatch(rfxEventsHtml, /Outreach launchpad/, "Bid Room Launch should not use a vague launchpad label");
assert.match(rfxEventsSource, /function fitCarrierToOutreachLanes/, "Bid Room should calculate visible CRM fit against the active lane book");
assert.match(rfxEventsSource, /function loadRfxCarrierFitEvidence/, "Bid Room should enrich carrier fit with Rateware evidence without blocking CRM loading");
assert.match(rfxEventsSource, /contact ready" : "no verified contact/, "Carrier fit should surface whether a recommended carrier has a verified contact");
assert.match(rfxEventsSource, /<summary>Why this carrier<\/summary>/, "Carrier fit should keep the detailed CRM and Rateware evidence available on demand");
assert.match(rfxEventsSource, /function eventInvitationStatus/, "Bid Room should render delivery state at the selected RFx level");
assert.match(rfxEventsSource, /function outreachCarrierCandidateRows/, "Bid Room should apply source and fit filters before rendering CRM candidates");
assert.match(rfxEventsSource, /scope === "recommended" && !fit\.hasRecommendedFit/, "Recommended carrier mode should require meaningful lane coverage or contactable Rateware evidence");
assert.match(rfxEventsSource, /Select carriers that fit this RFx, then add them to this RFx\. Message prepares drafts next; Delivery queue sends and follows up\. Carriers already in this RFx stay in Delivery queue\./, "Bid Room Launch should keep existing participants in the event-scoped delivery queue");
assert.match(rfxEventsSource, /async function createCurrentOutreachDrafts[\s\S]*?const targets = outreachWaveTargets\(\);/, "Carrier fit waves should scope Message previews and the draft queue to the selected carriers");
assert.match(rfxEventsSource, /const hasAudienceWave = selectedOutreachAudienceVendorIds\.size > 0;[\s\S]*?const selectedIds = !hasAudienceWave && selectedInvitationIds\.size/, "Carrier-fit waves should take precedence over stale row selections");
assert.match(rfxEventsSource, /const draftTargets = channelReadyTargets\.filter\(\(target\) => !targetHasActiveOutreachDraft/, "Draft generation should preserve active event drafts instead of recreating them from stale selections");
assert.match(rfxEventsSource, /rfx-select-visible-outreach-carriers/, "Carrier fit should offer a direct action to select the compatible carriers currently visible");
assert.match(rfxEventsSource, /rfx-select-all-outreach-carriers/, "Carrier fit should offer a direct action to select the full matching carrier wave");
assert.match(rfxEventsSource, /function carrierCanReceiveOutreachChannel\(vendor, channel = selectedOutreachChannel\(\)\)/, "Carrier Fit should evaluate eligibility against the chosen delivery channel");
assert.match(rfxEventsSource, /const contactReadyCandidates = candidates\.filter\(\(\{ vendor \}\) => carrierCanReceiveOutreachChannel\(vendor, deliveryChannel\)\);/, "Carrier Fit should distinguish matching carriers that can actually receive delivery");
assert.match(rfxEventsSource, /const candidates = allCandidates\.filter\(\(\{ vendor \}\) => carrierCanReceiveOutreachChannel\(vendor, channel\)\);/, "Select all matching should exclude carriers without a contact compatible with the selected channel");
assert.match(rfxEventsSource, /need a compatible contact before they can enter delivery/, "Message should identify selected carriers that still need a channel-compatible contact");
assert.match(rfxEventsSource, /const channelReadyTargets = scopedTargets\.filter\(\(target\) => targetHasChannel\(target, outreachChannel\)\);/, "Queue preparation should keep only recipients compatible with the selected channel");
assert.match(rfxEventsSource, /outside this delivery queue until a compatible contact is added/, "Queue preparation should explain which selected carriers remain pending contact correction");
assert.match(rfxEventsSource, /Add \$\{formatNumber\(selectedIds\.length\)\} carrier/, "The Carrier fit action should clearly distinguish adding the wave from creating its delivery queue");
assert.match(rfxEventsSource, /hasRecommendedFit: hasOperationalFit \|\| hasCoverageFit \|\| \(\(evidence\.hasRatewareEvidence \|\| evidence\.hasHistoricBidEvidence\) && contactable\)/, "Recommended carrier fit should require meaningful lane coverage or contactable quote or bid evidence");
assert.match(rfxEventsSource, /function rfxCarrierProfileFitSignals/, "Carrier Fit should evaluate CRM tags, declared coverage, and CRM notes against selected lanes");
assert.match(rfxEventsSource, /label: "CRM note", value: vendor\.notes \|\| ""/, "Carrier Fit should evaluate CRM notes as an explicit source of lane fit");
assert.match(rfxEventsSource, /Prior RFx: \$\{fit\.evidence\.historicBidSignals\.join/, "Carrier Fit should explain matching historical RFx bid evidence in the UI");
assert.match(rfxEventsSource, /rfx_event_id: selectedEventId/, "Carrier Fit evidence should identify the current RFx so its own activity can be excluded");
assert.match(apiSource, /async function fetchRfxCarrierFitBidSignals/, "Carrier Fit API should load bounded prior RFx bid evidence");
assert.match(apiSource, /function canonicalizeVendorRows\(/, "Carrier recommendations should collapse duplicate vendor profiles before ranking");
assert.match(apiSource, /canonicalizeVendorRows\(vendorsResult\.data \|\| \[\], metricsByVendor, historicalBidResult\.metrics\)/, "Carrier Fit should rank only canonical vendor profiles");
assert.match(apiSource, /duplicate_profiles_collapsed/, "Carrier Fit should disclose collapsed duplicate profiles without exposing duplicate records as candidates");
assert.match(apiSource, /sourceId: vendorHasApolloSourceId\(vendor\) \? 1 : 0/, "Carrier Fit canonicalization should prioritize Apollo Source ID records");
assert.match(apiSource, /quoteEvidence: canonicalVendorQuoteEvidence\(metrics, bidMetrics\)/, "Carrier Fit canonicalization should prioritize linked quotation evidence after Apollo enrichment");
assert.match(apiSource, /right\.sourceId - left\.sourceId[\s\S]+right\.quoteEvidence - left\.quoteEvidence[\s\S]+right\.health - left\.health/, "Carrier Fit should use the same canonical priority as Carrier CRM consolidation");
assert.match(apiSource, /bid_source_note/, "Carrier Fit API should use historical bid notes as a signal");
assert.match(apiSource, /\.neq\("rfx_event_id", eventId\)/, "Carrier Fit API should exclude activity from the current RFx");
assert.match(apiSource, /prior_rfx_lane_bid_count/, "Carrier Fit API should return a prior matching RFx bid count");
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
assert.match(outreachServiceSource, /mark_outreach_messages[\s\S]+channel: options\.channel \|\| ""/, "Outreach service should pass channel filters into manual status updates");
assert.match(apiSource, /OUTREACH_MANUAL_STATUSES = new Set\(\[[\s\S]+"manual_sent"[\s\S]+"delivery_unknown"[\s\S]+"replied"[\s\S]+\]\)/, "Backend manual outreach status updates should accept the same delivery states shown in tracking UI");
assert.match(apiSource, /sent: \["delivered", "read", "replied", "failed", "bounced", "delivery_unknown", "archived"\]/, "Backend outreach transitions should allow sent messages to become delivered, read, failed, bounced, or delivery unknown");
assert.match(apiSource, /sending: \["sent", "delivered", "read", "failed", "bounced", "delivery_unknown", "archived"\]/, "Backend outreach transitions should let stuck sending attempts be resolved without resending duplicates");
assert.match(apiSource, /if \(!status \|\| !OUTREACH_MANUAL_STATUSES\.has\(status\)\)/, "Backend manual outreach status validation should use the shared status set instead of a stale hardcoded list");
assert.match(apiSource, /selectedChannels\.size > 1[\s\S]+Provide a channel filter before changing delivery status/, "Backend should reject mixed-channel manual delivery updates unless a channel filter is provided");
assert.match(apiSource, /event_status: eventStatus/, "Outreach audience should expose delivery state for the selected RFx only");
assert.match(apiSource, /Carrier is in this RFx but has not received a message for the selected channel/, "Outreach audience should distinguish event carriers not yet invited on the chosen channel");
assert.match(apiSource, /const allRows = \[\.\.\.groups\.entries\(\)\]\.map/, "Outreach audience should retain the full event result set before applying a table filter");
assert.match(apiSource, /statusFilter === "in_delivery"/, "Outreach audience should support a compact grouped in-delivery filter");
assert.match(apiSource, /total: allRows\.length, filtered_total: rows\.length/, "Outreach audience metrics should remain event-wide while the table is filtered");
assert.match(apiSource, /delivery_status: status/, "Manual outreach status updates should keep delivery_status aligned with the selected tracking state");
assert.match(apiSource, /patch\.next_action = outreachNextAction\(\{ status, delivery_status: status, provider_response_status: status, send_result: patch\.send_result \}\)/, "Manual outreach status updates should refresh the queue next action");
assert.match(apiSource, /patch\.outcome_reason = outreachOutcomeReason\(\{ status, delivery_status: status, provider_response_status: status, send_result: patch\.send_result \}\)/, "Manual outreach status updates should refresh the visible outcome reason");
assert.match(apiSource, /next_action: patch\.next_action,[\s\S]+outcome_reason: patch\.outcome_reason/, "Manual outreach history should preserve the recalculated next action and outcome reason");
assert.match(apiSource, /status === "manual_sent"[\s\S]+patch\.manual_sent_at = now[\s\S]+patch\.manual_sent_by = user\.owner_email/, "Manual sent updates should record who marked the outreach as manually sent");
assert.match(apiSource, /status === "failed"[\s\S]+patch\.failed_at = now/, "Manual failed updates should record failed_at for delivery traceability");
assert.match(apiSource, /status === "bounced"[\s\S]+patch\.bounce_detected_at = now[\s\S]+patch\.bounce_status = "manual_bounce"/, "Manual bounced updates should record bounce metadata for cleanup workflows");
assert.match(outreachServiceSource, /delete_outreach_messages[\s\S]+channel: options\.channel \|\| ""/, "Outreach service should pass channel filters into draft deletion");
assert.match(rfxEventsSource, /outreachBulkResultSummary/, "Bid Room queue actions should summarize sent, updated, removed, failed, and skipped rows");
assert.match(rfxEventsSource, /result\.delivery_unknown/, "Bid Room queue send summaries should surface uncertain delivery attempts");
assert.match(outreachSource, /result\.delivery_unknown/, "Outreach Control Center summaries should surface uncertain delivery attempts");
assert.match(rfxEventsSource, /markOutreachMessages\(ids, "archived", \{ channel: selectedOutreachChannel\(\) \}\)/, "Bid Room archive should scope selected drafts to the active queue channel");
assert.match(rfxEventsSource, /Carrier participation and This RFx history were preserved\./, "Delivery message archive should clearly preserve the RFx carrier interaction");
assert.match(rfxEventsSource, /deleteOutreachMessages\(ids, \{ channel: selectedOutreachChannel\(\) \}\)/, "Bid Room delete should scope selected drafts to the active queue channel");
assert.match(outreachSource, /commonSelectedChannel/, "Invitation Admin should pass a channel filter when selected rows share one channel");
assert.match(outreachHtml, /data-workbench-view-button="campaigns"[\s\S]+data-workbench-view-button="drafts"[\s\S]+data-workbench-view-button="templates"/, "Outreach should lead with campaigns and draft queue instead of a redundant dashboard tab");
assert.doesNotMatch(outreachHtml, /data-workbench-view-button="dashboard"/, "Outreach should remove the redundant dashboard navigation tab");
assert.match(outreachHtml, /class="outreach-secondary-actions"[\s\S]+mark-queued-button[\s\S]+archive-messages-button/, "Outreach secondary message actions should stay available in a compact menu");
assert.match(outreachHtml, /mark-manual-sent-button/, "Outreach should allow selected manual WhatsApp/group sends to be marked from the Control Center");
assert.match(outreachHtml, /mark-failed-button/, "Outreach should allow selected delivery failures to be marked from the Control Center");
assert.match(outreachHtml, /mark-bounced-button/, "Outreach should allow selected bounces to be marked from the Control Center");
assert.match(outreachSource, /markManualSentButton\?\.addEventListener\("click", \(\) => markSelected\("manual_sent"\)\)/, "Outreach manual-sent action should use the shared backend status updater");
assert.match(outreachSource, /markFailedButton\?\.addEventListener\("click", \(\) => markSelected\("failed"\)\)/, "Outreach failed action should use the shared backend status updater");
assert.match(outreachSource, /markBouncedButton\?\.addEventListener\("click", \(\) => markSelected\("bounced"\)\)/, "Outreach bounced action should use the shared backend status updater");
assert.match(outreachSource, /function selectedChannelSummary\(rows = selectedOutreachMessageRows\(\)\)/, "Outreach selected-count copy should disclose when multiple channels are selected");
assert.match(outreachSource, /Selected messages include multiple channels\. Filter or select one channel before changing delivery status\./, "Outreach should block mixed-channel manual delivery status updates");
assert.match(outreachSource, /if \(!channel && status !== "archived"\)/, "Outreach should still allow mixed-channel archive while guarding operational delivery status changes");
assert.match(outreachHtml, /id="outreach-channel-filter"/, "Outreach draft queue should filter by delivery channel");
assert.match(outreachHtml, /data-outreach-filter="needs_action"/, "Outreach draft queue should expose a direct needs-action filter");
assert.match(outreachHtml, /data-outreach-filter="sending"/, "Outreach draft queue should expose sending attempts as a recoverable tracking filter");
assert.match(outreachHtml, /data-outreach-filter="delivery_unknown"/, "Outreach draft queue should expose delivery unknown tracking as a filter");
assert.match(outreachHtml, /data-outreach-filter="manual_sent"/, "Outreach draft queue should expose manually sent tracking as a filter");
assert.match(outreachHtml, /data-outreach-filter="bounced"/, "Outreach draft queue should expose bounced tracking as a filter");
assert.match(outreachHtml, /data-outreach-filter="suppressed"/, "Outreach draft queue should expose suppressed contacts as a filter");
assert.match(outreachHtml, /data-outreach-filter="archived"/, "Outreach draft queue should expose archived messages as a filter");
assert.match(outreachSource, /const outreachChannelFilter = document.querySelector\("#outreach-channel-filter"\)/, "Outreach should bind the channel filter");
assert.match(outreachSource, /"missing_channel"[\s\S]+\]\);/, "Outreach should restore the missing-channel filter from saved workspace context");
assert.match(outreachSource, /archivedScope \? \{ status: "archived", include_archived: true \} : \{\}/, "Outreach archived filter should explicitly load archived rows from the backend");
assert.match(outreachSource, /activeMessageFilter === "archived" \|\| priorFilter === "archived"[\s\S]+await loadMessages\(selectedCampaignId\)/, "Outreach should reload the campaign when entering or leaving the archived message scope");
assert.match(outreachSource, /activeMessageFilter = button\.dataset\.outreachFilter \|\| "all";[\s\S]+selectedMessageIds\.clear\(\);[\s\S]+persistOutreachWorkspaceContext\(\)/, "Outreach status filter changes should clear stale selected rows before mutating another scope");
assert.match(outreachSource, /messageSearch\?\.addEventListener\("input"[\s\S]+selectedMessageIds\.clear\(\);[\s\S]+renderMessages\(\);/, "Outreach search changes should clear stale selected rows");
assert.match(outreachSource, /outreachChannelFilter\?\.addEventListener\("change"[\s\S]+selectedMessageIds\.clear\(\);[\s\S]+renderMessages\(\);/, "Outreach channel changes should clear stale selected rows");
assert.match(outreachSource, /campaignList\?\.addEventListener\("click"[\s\S]+selectedCampaignId = card\.dataset\.campaignId;[\s\S]+selectedMessageIds\.clear\(\);[\s\S]+updateSelection\(\);[\s\S]+await loadMessages\(selectedCampaignId\);/, "Outreach campaign changes should immediately clear stale message selections before loading another queue");
assert.match(outreachSource, /selectedCampaignId = campaign\.id;[\s\S]+selectedMessageIds\.clear\(\);[\s\S]+resetCampaignForm\(\);/, "Creating or updating an Outreach campaign should reset message selections tied to the previous campaign");
assert.match(outreachSource, /if \(!campaignId\) \{[\s\S]+messages = \[\];[\s\S]+selectedMessageIds\.clear\(\);[\s\S]+previewMessageId = null;[\s\S]+renderMessages\(\);/, "Outreach should clear selection and preview state when no campaign is active");
assert.match(outreachSource, /"delivery_unknown"[\s\S]+"bounced"/, "Outreach should support the full delivery tracking filter set");
assert.match(outreachSource, /function messageTrackingState\(message = \{\}\)/, "Outreach should derive queue tracking state from provider delivery metadata");
assert.match(outreachSource, /message\.delivery_status,[\s\S]+message\.provider_response_status,[\s\S]+sendResult\.outcome,[\s\S]+meta\.delivery_status/, "Outreach tracking state should inspect delivery_status, provider response, send result, and metadata");
assert.match(outreachSource, /activeMessageFilter === "needs_action"[\s\S]+\["drafted", "queued", "sending", "failed", "bounced", "suppressed", "delivery_unknown"\]\.includes\(trackingState\)/, "Outreach needs-action filter should include active sends, suppressed contacts, delivery failures and unknown delivery");
assert.match(outreachSource, /statusChip\(trackingState\)/, "Outreach draft rows should render the derived delivery tracking state");
assert.match(outreachSource, /function messageOutcomeReason\(message = \{\}\)/, "Outreach should render provider outcome reasons in draft preview");
assert.match(outreachSource, /function messageNextAction\(message = \{\}\)/, "Outreach should render the backend next action in draft preview and queue rows");
assert.match(outreachSource, /<dt>Next action<\/dt><dd>\$\{escapeHtml\(messageNextAction\(message\) \|\| "-"\)\}<\/dd>/, "Outreach preview should show the next action for a selected draft");
assert.match(outreachSource, /<dt>Outcome<\/dt><dd>\$\{escapeHtml\(messageOutcomeReason\(message\) \|\| "-"\)\}<\/dd>/, "Outreach preview should show the provider or manual outcome reason");
assert.match(outreachSource, /metricDrafts\.textContent = formatCount\(messages\.filter\(\(row\) => \["drafted", "queued", "sending"\]\.includes\(messageTrackingState\(row\)\)\)\.length\)/, "Outreach metrics should keep active sending attempts in the draft operations bucket");
assert.match(outreachSource, /metricSent\.textContent = formatCount\(messages\.filter\(\(row\) => \["sent", "delivered", "read", "manual_sent"\]\.includes\(messageTrackingState\(row\)\)\)\.length\)/, "Outreach metrics should count accepted delivery states as sent activity");
assert.match(outreachSource, /activeMessageFilter === "needs_action"/, "Outreach should calculate the needs-action queue locally");
assert.match(sendGmailOutreachSource, /requestedProvider !== "gmail"/, "Gmail send should reject non-Gmail provider requests");
assert.match(sendGmailOutreachSource, /\.in\("id", ids\)/, "Gmail send should load selected message ids for the user workspace");
assert.match(sendGmailOutreachSource, /if \(cleanText\(message\.channel\) !== "email"\)[\s\S]*expected email/, "Gmail send should skip only non-email rows and continue mixed queue sends");
assert.match(sendWhatsappOutreachSource, /if \(cleanText\(message\.channel\) !== "whatsapp"\)[\s\S]*expected WhatsApp/, "WhatsApp send should skip only non-WhatsApp rows and continue mixed queue sends");
assert.match(sendWhatsappOutreachSource, /if \(!ids\.length\) return \{ sent: 0, failed: 0, rows: \[\], failures: \[\] \};/, "WhatsApp send should return a valid empty result before connection checks");
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
assert.match(rfxEventsSource, /selectedInvitationIds\.clear\(\);[\s\S]{0,700}selectedOutreachAudienceVendorIds = new Set/, "Adding carriers from Carrier Fit should clear stale scope before setting the new invitation-wave audience");
assert.match(rfxEventsSource, /Generate the draft queue to reach only new carriers; existing outreach stays unchanged/, "Manual shortlist creation should preserve existing outreach history");
assert.match(rfxEventsHtml, /rfx-outreach-carrier-wave-summary/, "Carrier Fit should expose the next invitation-wave action above the candidate lists");
assert.match(rfxEventsHtml, /1\. Select carriers\. 2\. Add them to this RFx\. 3\. Prepare their delivery queue from Message\./, "Carrier Fit should state that selected carriers are added to the current RFx before drafting outreach");
assert.match(rfxEventsHtml, /Prepare their delivery queue from Message/, "Carrier Fit should explain the transition from participant selection to the delivery queue");
assert.match(rfxEventsSource, /fetchCarrierListTemplates[\s\S]+getCarrierListTemplate[\s\S]+fetchVendors/, "Carrier Fit should import the explicit template list/get and exact vendor read services");
assert.match(rfxEventsSource, /partitionCarrierTemplateMembers[\s\S]+templateMemberIds/, "Carrier Fit should consume the shared exact-membership partition domain");
assert.match(rfxEventsSource, /fetchCarrierListTemplates\(\{[\s\S]{0,180}lifecycle_status: "active"/, "Carrier Fit should list only active carrier templates");
assert.match(rfxEventsSource, /getCarrierListTemplate\([^\n]+\{ usageContext: "carrier_fit" \}\)/, "Carrier Fit template reads should use the audited carrier_fit usage context");
assert.match(rfxEventsSource, /fetchVendors\(\{[\s\S]{0,220}ids: batch[\s\S]{0,220}lightweight: false/, "Carrier Fit should hydrate every exact template id in bounded full-profile batches");
assert.match(rfxEventsSource, /function pruneCarrierTemplateSelection\([\s\S]{0,700}visibleEligibleCarrierTemplateIds/, "Carrier Fit should prune stale selections against visible eligible template members");
assert.match(rfxEventsSource, /data-rfx-carrier-template-select[\s\S]{0,300}disabled/, "Carrier Fit template rows should disable noneligible selection controls");
assert.match(rfxEventsSource, /templateMemberRowsInOrder/, "Carrier Fit should render exact template members in source order, including unavailable placeholders");
assert.match(rfxEventsHtml, /Add \{N\} carriers to this RFx and open Message/, "Carrier Fit should document the exact materialization CTA contract");
assert.match(rfxEventsHtml, /id="rfx-outreach-launch-readiness"[\s\S]+Review this template wave before adding carriers/, "Carrier Fit should expose a visible launch-readiness review before materialization");
assert.match(rfxEventsHtml, /rfx-outreach-wave-coverage[\s\S]+rfx-outreach-wave-exceptions/, "Carrier Fit should review lane coverage and excluded template members before materialization");
assert.match(rfxEventsSource, /Ready for human confirmation:[\s\S]+Carrier Fit will not draft or send messages/, "Launch readiness should summarize the immutable template and lane scope without implying a send");
assert.match(rfxEventsSource, /carrierTemplateWaveCoverage[\s\S]+Every lane covered[\s\S]+data-rfx-review-wave-lane/, "Carrier Fit should calculate selected coverage per RFx lane and expose a safe lane-review control");
assert.match(carrierTemplatePreviewSource, /clt-launch-readiness[\s\S]+template snapshot[\s\S]+will not draft or send messages/, "The deterministic preview should expose the launch-readiness review with the same no-send boundary");
assert.match(carrierTemplatePreviewSource, /LANE COVERAGE[\s\S]+Why members stay out/, "The deterministic preview should expose the Review Wave coverage and exception composition");
assert.match(rfxEventsSource, /`Add \$\{formatNumber\(selectedIds\.length\)\} carriers to this RFx and open Message`/, "Carrier Fit should render the exact count-bearing materialization CTA");
assert.match(rfxEventsSource, /carrier_template_context:[\s\S]{0,220}template_id:[\s\S]{0,220}template_version:[\s\S]{0,220}materialization_operation_id:/, "Carrier Fit should pass validated template identity/version and one retained operation id into the idempotent participant action");
assert.match(rfxEventsSource, /requestRfxDetail\(operation\.event_id, \{ force: true \}\)[\s\S]{0,300}getCarrierListTemplate\(operation\.template_id/, "Carrier Fit should re-read RFx participants and template metadata immediately before add");
assert.match(rfxEventsSource, /createCarrierTemplateMaterializationController\(\)/, "Carrier Fit should own one immutable materialization operation generation");
assert.match(rfxEventsSource, /lane_ids: operation\.lane_ids,[\s\S]{0,120}vendor_ids: operation\.selected_vendor_ids/, "Carrier Fit retries the immutable all-lane operation audience instead of pruning newly reconciled participants");
assert.match(rfxEventsSource, /confirmCarrierTemplateMaterializationResponse\(operation, response/, "Carrier Fit should validate exact per-lane outcomes before accepting a server audience");
assert.match(rfxEventsSource, /selectedOutreachAudienceVendorIds = new Set\(materialization\.confirmation\.confirmed_vendor_ids\)/, "Message should receive only the server-confirmed operation audience");
assert.match(rfxEventsSource, /const materializationLocked = Boolean\(carrierTemplateMaterializationController\.active\)/, "Carrier Fit should derive its control lock from the retained operation");
assert.match(rfxEventsSource, /rfxOutreachCarrierScope\.disabled = materializationLocked[\s\S]{0,300}rfxOutreachCarrierSearch\.disabled = materializationLocked[\s\S]{0,300}rfxOutreachCarrierFit\.disabled = materializationLocked[\s\S]{0,300}rfxOutreachCarrierLane\.disabled = materializationLocked/, "Carrier Fit should lock scope, lane, and filters while an operation is retained");
assert.match(rfxEventsSource, /carrierTemplateMaterializationController\.markRequestStarted\(operation\)[\s\S]{0,500}callRatewareApi\("shortlist_rfx_lane_vendors"[\s\S]{0,500}markRequestSettled\(operation\)/, "Carrier Fit should explicitly distinguish a fresh first attempt from any request that may have committed");
assert.match(rfxEventsSource, /carrierTemplateMaterializationSubmissionVendorIds\([\s\S]{0,700}participantVendorIds,[\s\S]{0,300}passesFilters:/, "A fresh first attempt should apply refreshed participants and the immutable Carrier Fit filter snapshot before dispatch");
assert.match(rfxEventsSource, /function selectedManualVendorIds\([\s\S]{0,220}carrierTemplateMaterializationSelectionIds/, "Build and Carrier Fit should render the retained operation snapshot instead of mutable shared selection");
assert.match(rfxEventsSource, /Cancel pending add/, "Carrier Fit should expose one explicit accessible cancellation path for a retained operation");
assert.match(rfxEventsSource, /function activateRfxLaunchWorkspace\(workspace, options = \{\}\) \{[\s\S]{0,700}carrierTemplateMaterializationNavigationDecision[\s\S]{0,700}navigationBlocked = !navigation\.allowed[\s\S]{0,700}rfxLaunchWorkspace = normalizeRfxLaunchWorkspace/, "Every click and programmatic Message or Delivery transition must pass through the central retained-operation gate");
assert.match(rfxEventsSource, /rfxUseOutreachAudienceInMessageButton\?\.addEventListener\("click"[\s\S]{0,500}if \(!activateRfxLaunchWorkspace\("message"\)\) return;/, "The colocated This RFx Message action must stop when the central retained-operation gate blocks it");
assert.match(rfxEventsSource, /rfxEventDeliveryOverview\?\.addEventListener\("click"[\s\S]{0,500}!activateRfxLaunchWorkspace\("delivery"\)[\s\S]{0,80}return;/, "Direct Delivery transitions must stop when the central retained-operation gate blocks them");
assert.doesNotMatch(rfxEventsSource, /clear its immutable carrier selection|clear the selection to cancel/i, "Pending-add cancellation copy must say selection is retained, not cleared");
assert.match(rfxEventsSource, /Cancel pending add[^\n]{0,220}retains (?:the |this )?selection[^\n]{0,220}does not roll back invitations/i, "Cancellation copy must explain retained selection and irreversible invitations");
assert.match(rfxEventsSource, /carrierTemplateMaterializationController\.requestInFlight[\s\S]{0,400}cannot be cancelled while its request is in flight/i, "Explicit cancellation should fail closed while a participant mutation request is in flight");
assert.match(rfxEventsSource, /data-workbench-view-button[\s\S]{0,900}carrierTemplateMaterializationNavigationDecision[\s\S]{0,900}pending Add operation is retained in Carrier Fit/, "Build navigation should preserve and restore the retained Carrier Fit retry affordance");
assert.match(rfxEventsSource, /if \(carrierTemplateSelectionMutationBlocked\(manualShortlistStatus\)\) return;/, "Stale Build selection actions should fail closed while a template materialization operation is retained");
assert.match(rfxEventsSource, /incidentId[\s\S]{0,180}Correlation ID/, "Carrier Fit add failures should surface the server correlation id");
assert.match(apiSource, /carrier_template\.add_selected_to_rfx/, "The existing RFx participant action should audit carrier-template materialization");
assert.match(apiSource, /selected_count:[\s\S]{0,220}confirmed_count:[\s\S]{0,220}already_present_count:[\s\S]{0,220}inserted_count:[\s\S]{0,220}rejected_count:[\s\S]{0,220}pending_count:[\s\S]{0,220}result:/, "Carrier-template participant audits should contain final server-resolved counts and result only");
assert.match(apiSource, /async function fetchFinalCarrierTemplateInvitations[\s\S]{0,2400}for \(const laneBatch[\s\S]{0,500}for \(const vendorBatch[\s\S]{0,900}\.eq\("rfx_event_id", eventId\)[\s\S]{0,300}\.eq\("rfx_events\.organization_id", organizationId\)[\s\S]{0,300}\.in\("rfx_lane_id", laneBatch\)[\s\S]{0,300}\.in\("vendor_id", vendorBatch\)/, "Carrier-template final reconciliation should batch both dimensions under provider limits with organization and event scope");
assert.doesNotMatch(apiSource, /if \(!committedBatchCount\) throw result\.error/, "A first upsert response loss must reconcile instead of being classified as definite zero mutation");
assert.match(apiSource, /expectedEligibleKeys\.every\(\(key\) => finalByKey\.has\(key\)\)/, "Carrier-template materialization should prove every expected committed lane/vendor outcome before success");
assert.match(apiSource, /carrier_template_materialization_operations[\s\S]+carrier_template_materialization_operation_id[\s\S]+ignoreDuplicates: true/, "The server must journal immutable context before marker-preserving participant insertion");
assert.match(apiSource, /claimCarrierTemplateMaterializationMutation[\s\S]{0,2600}status: "mutation_issued"[\s\S]{0,1600}\.eq\("status", "pending"\)[\s\S]{0,500}\.select\(CARRIER_TEMPLATE_MATERIALIZATION_JOURNAL_COLUMNS\)/, "Participant mutation ownership must atomically advance a full-context pending journal to mutation_issued");
const materializationMutationClaimCall = apiSource.indexOf("const mutationClaim = await claimCarrierTemplateMaterializationMutation");
const materializationMutationFlagSet = apiSource.indexOf("mutationIssued = true", materializationMutationClaimCall);
const materializationParticipantUpsert = apiSource.indexOf('.from("rfx_lane_vendors")\n        .upsert(', materializationMutationFlagSet);
assert.ok(materializationMutationClaimCall >= 0 && materializationMutationFlagSet > materializationMutationClaimCall && materializationParticipantUpsert > materializationMutationFlagSet, "The runtime mutationIssued flag must be set and used before every participant upsert");
assert.match(apiSource, /select\("id,rfx_event_id,rfx_lane_id,vendor_id,carrier_template_materialization_operation_id,rfx_events!inner\(organization_id\)"\)/, "Final scoped reconciliation must read durable operation attribution");
assert.match(apiSource, /invitation\.carrier_template_materialization_operation_id[\s\S]{0,300}materializationOperationId[\s\S]{0,300}\? "inserted"[\s\S]{0,80}: "reconciled"/, "Final outcome attribution must come from the committed participant marker");
assert.match(apiSource, /carrier_template_reconcile_required[\s\S]{0,500}correlation_id:/, "Post-commit enrichment uncertainty should return a retryable reconcile-required result with correlation context");
const carrierTemplateRfxAuditSource = apiSource.slice(
  apiSource.indexOf("async function writeCarrierTemplateRfxMaterializationAudit"),
  apiSource.indexOf("export function carrierTemplateVendorHasUsableContact")
);
assert.doesNotMatch(carrierTemplateRfxAuditSource, /primary_email|secondary_emails|whatsapp_phone|vendor_ids/, "Carrier-template RFx audits must never persist carrier contact contents or membership payloads");
const carrierTemplateMaterializationSource = rfxEventsSource.slice(
  rfxEventsSource.indexOf("async function revalidateCarrierTemplateMaterialization"),
  rfxEventsSource.indexOf("rfxSelectVisibleOutreachCarriersButton?.addEventListener")
);
assert.doesNotMatch(carrierTemplateMaterializationSource, /generateOutreachDrafts|sendOutreachMessages|sendWhatsappOutreachMessages/, "Carrier Fit template materialization must not draft or send communication");
assert.doesNotMatch(rfxEventsSource.slice(rfxEventsSource.indexOf("function renderOutreachCarrierFitControls"), rfxEventsSource.indexOf("function renderManualShortlistControls")), /createCarrierListTemplate|updateCarrierListTemplate|archiveCarrierListTemplate|restoreCarrierListTemplate|deleteVendorSegment/, "Carrier Fit must not expose template mutations");
assert.match(stylesSource, /\.rfx-outreach-carrier-wave-actions \{[\s\S]*?position: sticky/, "Carrier Fit should keep the selected-wave action visible while reviewing a long candidate list");
assert.match(rfxEventsHtml, /rfx-message-wave-context/, "Message setup should explain the exact carrier wave that will receive drafts");
assert.match(rfxEventsHtml, /id="rfx-message-readiness"/, "Message setup should keep a compact delivery preflight visible before queue preparation");
assert.match(rfxEventsSource, /function renderMessageReadiness/, "Message setup should summarize wave readiness without requiring another workspace");
assert.match(rfxEventsSource, /rfxGmailSenderNote\.hidden = !emailChannel/, "Gmail sender guidance should only appear when Gmail is the selected delivery channel");
assert.match(rfxEventsSource, /rfxWhatsappReadiness\.hidden = !whatsappChannel/, "Meta readiness should only appear when a WhatsApp delivery channel is selected");
assert.match(rfxEventsHtml, /rfx-delivery-wave-state/, "Delivery queue should keep the currently selected carrier wave visible after queue preparation");
assert.match(rfxEventsSource, /function renderDeliveryWaveState/, "Delivery queue should render a compact event-scoped status for the active carrier wave");
assert.match(rfxEventsSource, /Only this selected wave belongs to this RFx delivery queue/, "Delivery queue should explain that selected-wave activity never mixes with other RFx history");
assert.match(rfxEventsSource, /const nextWorkspace = activeDelivery \? "delivery" : ready \? "message" : "carrier"/, "Delivery queue should return an active carrier wave to Message without creating or sending drafts automatically");
assert.match(rfxEventsHtml, /rfx-draft-more-actions/, "Delivery Queue should keep destructive actions out of the primary action row");
assert.match(rfxEventsSource, /selectedOutreachAudienceVendorIds = new Set\(vendorIds\.map\(\(vendorId\) => String\(vendorId\)\)\);/, "Carrier Fit selections should become the active next-wave audience after being added to the RFx");
assert.match(rfxEventsSource, /await loadOutreachAudience\(\{ reloadSegments: true \}\);[\s\S]{0,180}activateRfxLaunchWorkspace\("message"\)/, "Carrier Fit should take the new wave directly to Message after its RFx invitations are created");
assert.match(rfxEventsHtml, /id="rfx-use-outreach-audience-in-message"/, "This RFx should expose a visible action to move selected carriers into the invitation message workspace");
assert.match(rfxEventsSource, /rfxUseOutreachAudienceInMessageButton\?\.addEventListener\("click"[\s\S]{0,700}activateRfxLaunchWorkspace\("message"\)/, "Selected existing RFx carriers should be reusable as the active invitation wave without adding them again");
assert.match(rfxEventsSource, /This wave contains \$\{formatNumber\(selectedOutreachAudienceVendorIds\.size\)\}/, "Message setup should report the exact selected carrier wave");
assert.match(rfxEventsSource, /deliveryParticipationStatus = "in_delivery";[\s\S]{0,180}draftQueueTrackingStatus = "drafted";[\s\S]{0,180}activateRfxLaunchWorkspace\("delivery", \{ refresh: true \}\)/, "A prepared invitation wave should open Delivery queue on the new unsent draft wave");
assert.match(rfxEventsSource, /draftSendSelectedButton\.hidden = activeChannel !== "email"/, "Delivery Queue should show only the bulk send action for the active channel");
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
assert.match(rfxEventsSource, /<strong>Next: \$\{escapeHtml\(copy\.title\)\}<\/strong>/, "Bid Room command center should use one next-action label instead of a second numbered wizard");
assert.doesNotMatch(rfxEventsHtml, /<p class="eyebrow">Step [1-6]<\/p>/, "Bid Room panels should use the four-stage rail labels instead of repeating a second six-step wizard");
assert.match(rfxEventsHtml, /Build \/ Event/, "Bid Room build panels should identify the active four-stage context");
assert.match(rfxEventsHtml, /<p class="eyebrow">Launch<\/p>/, "Bid Room outreach should use the Launch stage label");
for (const view of ["outreach", "responses", "award"]) {
  assert.match(rfxEventsHtml, new RegExp(`data-workbench-view-panel="${view}" hidden`), `Bid Room ${view} panel should be hidden before the tab controller hydrates`);
}
assert.match(rfxEventsHtml, /id="rfx-event-published-summary"/, "Bid Room should render a compact published event summary");
assert.match(rfxEventsHtml, /data-workbench-view-panel="setup lanes carriers" hidden/, "Bid Room Build should expose event, book, and participant panels as one surface");
assert.match(rfxEventsSource, /function renderEventSetupState\(\)/, "Bid Room should replace the event form with a published summary after selection");
assert.match(stylesSource, /\.bid-room-page \.rfx-event-form\[hidden\][\s\S]*display: none !important/, "Bid Room should keep the new-event form hidden when a saved event is selected");
assert.match(rfxEventsSource, /function renderParticipantSummary\(\)/, "Bid Room should summarize managed participants before opening CRM controls");
assert.match(rfxEventsSource, /rfx-participant-summary-table/, "Bid Room carrier coverage should render a complete status table instead of a truncated chip list");
assert.match(rfxEventsSource, /function rfxLaneEntryMode\(event = selectedEvent\)/, "Bid Room should distinguish initial lane loading from published append-only lane additions");
assert.match(rfxEventsSource, /Add lanes to the published business book/, "Published Bid Room lane entry should clearly communicate append-only behavior");
assert.match(rfxEventsSource, /Existing lanes, invitations and bids remain unchanged/, "Published Bid Room lane entry should protect existing activity");
assert.match(rfxServiceSource, /append_only: true/, "RFx lane imports should explicitly request append-only behavior");
assert.match(rfxEventsSource, /participantManagementMovedToLaunch/, "Bid Room should move participant management to Launch after publication");
assert.match(rfxEventsSource, /data-rfx-inline-edit/, "Bid Room loaded lanes should expose inline edit before selection");
assert.match(rfxEventsSource, /editingLaneId/, "Bid Room lane editing should target one lane at a time");
assert.match(rfxEventsSource, /String\(editingLaneId\) === String\(lane\.id\)/, "Bid Room should keep non-target lanes in read-only mode");
assert.match(rfxEventsHtml, /One workflow: event setup, lane book, participants, outreach, auction, award/, "Bid Room should describe RFx, Outreach, Auction, and Award as one workflow");
assert.match(stylesSource, /bid-room-workflow-meter/, "Bid Room should render a compact workflow progress meter");
assert.match(rfxEventsHtml, /data-stage-key="build"/, "Bid Room should group event, book, and CRM setup under Build");
assert.match(rfxEventsHtml, /data-stage-key="launch"[\s\S]+data-stage-key="operate"[\s\S]+data-stage-key="close"/, "Bid Room should expose compact Launch, Operate, and Close stages");
assert.match(rfxEventsHtml, /class="bid-room-build-tabs"[\s\S]+Business book[\s\S]+Participants/, "Bid Room Build should retain direct subtabs for event, book, and participants");
assert.match(stylesSource, /\.bid-room-page \.bid-room-build-tabs \{[\s\S]*?display: none/, "Bid Room Build should avoid redundant Event, Book, and Participant subtabs");
assert.match(stylesSource, /\.bid-room-page \.bid-room-workspace \{[\s\S]*?row-gap: 0/, "Bid Room Build panels should not reserve vertical space between Event setup and Business book");
assert.match(stylesSource, /\.bid-room-page \.bid-room-action-status:empty[\s\S]*?display: none !important/, "Bid Room should remove an empty global status row from the Build layout");
assert.match(stylesSource, /\.rfx-supply-depth-compact::after[\s\S]*?content: attr\(data-supply-tooltip\)/, "Bid Room supply depth should keep detail in a tooltip");
assert.match(rfxEventsSource, /function bidRoomStageState\(\)/, "Bid Room should calculate the four operating stages independently from detailed readiness checks");
assert.match(rfxEventsSource, /function bidRoomStageProgress\(\)/, "Bid Room should show progress using the compact operating stages");
assert.match(workbenchTabsSource, /workbenchViewGroup/, "Workbench tabs should support grouped navigation without losing detailed panels");
assert.match(workbenchTabsSource, /workbenchActivate/, "Workbench tabs should allow a grouped tab to open its first detailed panel");
assert.match(workbenchTabsSource, /rateware:workbench:/, "Workbench tabs should persist the last active view per page");
assert.match(workbenchTabsSource, /localStorage\.getItem\(storageKey\)/, "Workbench tabs should restore the last active view safely");
assert.match(workbenchTabsSource, /explicitView \|\| readStoredView\(\) \|\| defaultView/, "Explicit URL views should override saved workspace context");
assert.match(workbenchTabsSource, /writeStoredView\(nextView\)/, "Workbench tab changes should persist the resolved active view");
assert.match(workbenchTabsSource, /const applyBrowserView = \(\) =>/, "Workbench tabs should resolve the active view from browser history");
assert.match(workbenchTabsSource, /window\.addEventListener\("popstate", applyBrowserView\)/, "Workbench tabs should synchronize Back and Forward navigation");
assert.match(workbenchTabsSource, /url\.searchParams\.has\(paramName\) \? url\.searchParams\.get\(paramName\) : defaultView/, "A URL without a view should return a workbench to its default tab");
assert.match(workbenchTabsSource, /if \(activateOptions\.syncUrl\)/, "Programmatic workbench activation should opt into URL synchronization");
assert.match(workbenchTabsSource, /ratewareConfirmUnsavedChanges && !window\.ratewareConfirmUnsavedChanges\(\)/, "Workbench tab changes should protect dirty forms");
assert.match(workbenchTabsSource, /let lastKnownUrl = new URL\(window\.location\.href\)/, "Workbench navigation should remember the last valid URL");
assert.match(workbenchTabsSource, /window\.history\.pushState\(window\.history\.state, "", lastKnownUrl\)/, "Canceled browser navigation should restore the last valid workbench URL");
assert.match(workbenchTabsSource, /event\.key === "ArrowRight" \|\| event\.key === "ArrowDown"/, "Workbench tabs should support directional keyboard navigation");
assert.match(workbenchTabsSource, /event\.key === "Home"/, "Workbench tabs should support Home and End navigation");
assert.match(workbenchTabsSource, /button\.tabIndex = isActive \? 0 : -1/, "Workbench tabs should keep only the active tab in the keyboard focus order");
assert.match(workbenchTabsSource, /setAttribute\("role", "tabpanel"\)/, "Workbench panels should expose the tabpanel role");
assert.match(workbenchTabsSource, /setAttribute\("aria-controls", controlledPanelIds\.join\(" "\)\)/, "Workbench tabs should point to their controlled panels");
assert.match(workbenchTabsSource, /setAttribute\("aria-labelledby", labelTabId\)/, "Workbench panels should identify their owning tab");
assert.match(workbenchTabsSource, /setAttribute\("aria-hidden", String\(!isVisible\)\)/, "Workbench panels should expose visibility to assistive technology");
assert.match(stylesSource, /\.module-workbench-nav[\s\S]+border-bottom: 1px solid var\(--line\)/, "Internal workspaces should use flat operational tab navigation");
assert.match(stylesSource, /\.vendor-workflow-tabs \.vendor-tab[\s\S]+white-space: nowrap/, "Carrier CRM tabs should remain a compact operational tab row");
assert.match(rfxEventsSource, /rfxWorkbench\?\.activate\(view, \{[\s\S]*syncUrl: true/, "Bid Room programmatic view changes should persist their URL");
assert.match(outreachSource, /outreachWorkbench\?\.activate\(view, \{[\s\S]*syncUrl: true/, "Outreach programmatic view changes should persist their URL");
assert.match(interpretationMemorySource, /memoryWorkbench\?\.activate\("simulation", \{ syncUrl: true \}\)/, "Interpretation simulation should persist its active tab");
assert.match(interpretationMemorySource, /let memoryFormSubmitting = false;/, "Interpretation Memory rule creation should have a submit guard");
assert.match(interpretationMemorySource, /memoryForm\?\.addEventListener\("submit"[\s\S]+if \(memoryFormSubmitting\) return;[\s\S]+memoryFormSubmitting = true;[\s\S]+finally \{[\s\S]+memoryFormSubmitting = false;[\s\S]+if \(submitButton\) submitButton\.disabled = false;[\s\S]+\}/, "Interpretation Memory rule creation should ignore duplicate submits and restore the form button");
assert.match(interpretationMemorySource, /const memoryRowMutationKeys = new Set\(\);/, "Interpretation Memory row actions should track per-row mutations");
assert.match(interpretationMemorySource, /const mutationKey = `simulate:\$\{id\}`;[\s\S]+if \(memoryRowMutationKeys\.has\(mutationKey\)\) return;[\s\S]+memoryRowMutationKeys\.add\(mutationKey\);[\s\S]+finally \{[\s\S]+memoryRowMutationKeys\.delete\(mutationKey\);[\s\S]+simulateButton\.disabled = false;[\s\S]+\}/, "Interpretation Memory simulation should ignore duplicate row simulations and restore the button");
assert.match(interpretationMemorySource, /const mutationKey = `\$\{actionName\}:\$\{id\}`;[\s\S]+if \(memoryRowMutationKeys\.has\(mutationKey\)\) return;[\s\S]+memoryRowMutationKeys\.delete\(mutationKey\);/, "Interpretation Memory save/archive/apply actions should serialize per row");
assert.match(interpretationMemorySource, /let memoryBulkArchiveRunning = false;/, "Interpretation Memory selected archive should have a bulk guard");
assert.match(interpretationMemorySource, /archiveSelectedButton\.disabled = memoryBulkArchiveRunning \|\| selectedVisible\.length === 0;/, "Interpretation Memory archive selected button should stay disabled while running");
assert.match(interpretationMemorySource, /archiveSelectedButton\?\.addEventListener\("click"[\s\S]+if \(memoryBulkArchiveRunning\) return;[\s\S]+memoryBulkArchiveRunning = true;[\s\S]+finally \{[\s\S]+memoryBulkArchiveRunning = false;[\s\S]+updateSelection\(\);[\s\S]+\}/, "Interpretation Memory bulk archive should reject duplicate submissions and restore selection controls");
assert.match(stylesSource, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/, "Bid Room stage rail should use four compact operating stages");
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
assert.match(bidRoomBoardSource, /callPublicBoard\(\{[\s\S]+limit: 1000,[\s\S]+since: state\.generatedAt/, "Public Bid Room board should request the full opportunity board initially and use incremental checks afterward");
assert.match(rfxEventsSource, /marketplaceUrlForEvent/, "Bid Room should build event-specific marketplace links");
assert.match(rfxEventsSource, /Public marketplace/, "Bid Room event links should open the full public opportunity board");
assert.match(rfxEventsSource, /data-rfx-marketplace-link/, "Bid Room event cards should expose a marketplace button");
assert.match(bidRoomBoardHtml, /public-board-detail-drawer/, "Public Bid Room board should render an opportunity detail drawer");
assert.match(bidRoomBoardHtml, /public-board-soft-login-drawer/, "Public Bid Room board should render soft login for already invited carriers");
assert.match(bidRoomBoardHtml, /Find my invitations/, "Public Bid Room board should expose a carrier soft login entry point");
assert.match(bidRoomBoardSource, /Request invitation/, "Public Bid Room board should require invitation requests instead of direct bidding");
assert.match(bidRoomBoardSource, /public_bid_room_request_invite/, "Public Bid Room board should call the public invitation request action");
assert.match(bidRoomBoardSource, /public_bid_room_find_invitations/, "Public Bid Room board should call the public invitation lookup action");
assert.match(bidRoomBoardSource, /let publicBoardLoading = false;/, "Public Bid Room board should avoid overlapping refresh requests");
assert.match(bidRoomBoardSource, /if \(publicBoardLoading\) return;/, "Public Bid Room board should ignore refresh while one is running");
assert.match(bidRoomBoardSource, /let publicSoftLoginSubmitting = false;/, "Public Bid Room soft login should block duplicate lookups");
assert.match(bidRoomBoardSource, /const publicInviteRequestMutationKeys = new Set\(\);/, "Public Bid Room invite requests should be keyed by opportunity and email");
assert.match(bidRoomBoardSource, /publicInviteRequestMutationKeys\.has\(requestKey\)/, "Public Bid Room should ignore duplicate invite requests");
assert.match(bidRoomBoardSource, /const publicPrivateLinkMutationKeys = new Set\(\);/, "Public Bid Room private link recovery should be keyed by opportunity and email");
assert.match(bidRoomBoardSource, /publicPrivateLinkMutationKeys\.has\(linkKey\)/, "Public Bid Room should ignore duplicate private link recovery requests");
assert.match(bidRoomBoardSource, /invitedLaneIds/, "Public Bid Room board should remember invited lanes after soft login");
assert.match(bidRoomBoardSource, /data-public-board-private-link/, "Public Bid Room board should resend private links instead of requesting access for invited lanes");
assert.match(bidRoomBoardSource, /data-public-board-open-private/, "Public Bid Room board should open verified private bids directly");
assert.match(bidRoomBoardSource, /Open private bid/, "Public Bid Room board should show direct access after a verified private invitation");
assert.match(bidRoomBoardSource, /Check access/, "Public Bid Room cards should check access before showing request invitation for unknown carriers");
assert.match(bidRoomBoardSource, /You already have an invitation for this opportunity/, "Public Bid Room card detail should explain already invited access");
assert.match(rfxBidSource, /rememberPublicBoardInvitationAccess/, "Private Bid Room should remember verified public board access after token entry");
assert.match(rfxBidSource, /rateware\.publicBidBoard\.verifiedInvitations/, "Private Bid Room should persist verified invitation tokens locally for direct marketplace access");
assert.match(rfxBidSource, /for \(const row of Array\.isArray\(carrierBook\.invited\)/, "Private Bid Room should cache every invited lane after one verified token entry");
assert.match(bidRoomBoardSource, /const emailChanged = Boolean\(state\.inviteEmail/, "Public Bid Room should clear cached private tokens when a different carrier verifies access");
assert.match(bidRoomBoardSource, /send_links: false/, "Soft login should check invitation access without automatically resending private links");
assert.match(bidRoomBoardSource, /send_links: true/, "Recover link should explicitly request a replacement private link");
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
assert.match(bidRoomBoardSource, /PUBLIC_BOARD_FULL_REFRESH_MS = 5 \* 60 \* 1000/, "Public Bid Room should periodically reconcile the full marketplace dataset");
assert.match(bidRoomBoardSource, /since: state\.generatedAt/, "Public Bid Room polling should ask only whether the marketplace changed");
assert.match(bidRoomBoardSource, /data\.not_modified === true[\s\S]+updateCountdowns\(\)/, "Unchanged public Bid Room polls should preserve rendered opportunities");
assert.match(rfxBidApiSource, /if \(since\)[\s\S]+from\("rfx_lanes"\)[\s\S]+from\("rfx_lane_vendors"\)[\s\S]+not_modified: true/, "Public Bid Room API should avoid rebuilding unchanged marketplace payloads");
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
assert.match(publicBidBoardApiSource, /\.in\("status", \["open", "closed", "awarded"\]\)/, "Public Bid Room marketplace should only load published opportunities");
assert.match(publicBidBoardApiSource, /Math\.min\(1000/, "Public Bid Room board API should support a larger full-board response");
assert.doesNotMatch(rfxBidApiSource, /if \(status === "draft"\) return "live"/, "Draft Bid Room opportunities should never appear as live marketplace opportunities");
assert.match(publicBidBoardApiSource, /carrier_identity_visible: false/, "Public Bid Room board should hide carrier identity");
assert.doesNotMatch(publicBidBoardApiSource, /vendors\(/, "Public Bid Room board should not join carrier vendor records");
assert.doesNotMatch(publicBidBoardApiSource, /invitation_token/, "Public Bid Room board should not expose invitation tokens");
assert.doesNotMatch(publicBidBoardApiSource, /target_rate/, "Public Bid Room board should not select or expose the shipper target rate");
assert.match(rfxBidApiSource, /ratesVisible = visibilityMode === "open_leaderboard"/, "Public Bid Room should only expose quote economics in open leaderboard mode");
assert.match(rfxBidApiSource, /quote_visibility: ratesVisible \? "open" : "hidden"/, "Public Bid Room should label redacted quote economics explicitly");
assert.match(rfxBidApiSource, /activity_visibility: activityVisible \? "visible" : "hidden"/, "Private Bid Rooms should redact competitor activity");
assert.match(rfxBidApiSource, /async function fetchAllPublicBoardRows[\s\S]+chunkPublicBoardIds/, "Public Bid Room should page and chunk event child reads");
assert.match(rfxBidApiSource, /fetchAllPublicBoardRows\(\s*supabase,\s*"rfx_lanes"/, "Public Bid Room should load every lane page");
assert.match(rfxBidApiSource, /fetchAllPublicBoardRows\(\s*supabase,\s*"rfx_lane_vendors"/, "Public Bid Room should load every quote page");
assert.doesNotMatch(publicBidBoardApiSource, /\.limit\(10000\)/, "Public Bid Room should not silently cap quote reads at 10,000 rows");
assert.match(bidRoomBoardSource, /function publicMetric\(value, row = \{\}, formatter = formatNumber\)/, "Public Bid Room UI should label redacted metrics instead of rendering misleading zeros");
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
assert.match(publicBidFindInviteApiSource, /const sendLinks = cleanBoolean\(input\.send_links\) === true/, "Public invitation lookup should only send replacement links when explicitly requested");
assert.match(publicBidFindInviteApiSource, /if \(!sendLinks\)[\s\S]*access_checked: true/, "Public invitation lookup should support a no-email access check for invited carriers");
assert.match(rfxBidApiSource, /async function publicSoftLoginCooldown[\s\S]+PUBLIC_SOFT_LOGIN_COOLDOWN_MS/, "Private link recovery should have a server-side cooldown");
assert.match(publicBidFindInviteApiSource, /publicSoftLoginCooldown\(supabase, email\)[\s\S]+status: 429/, "Private link recovery should reject repeated sends instead of spamming email");
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
assert.equal((rfxEventsHtml.match(/id="rfx-chat-sync-status"/g) || []).length, 1, "Bid Room communications should render one Google Chat connection status");
assert.match(rfxEventsHtml, /bid-room-comm-workspace/, "Bid Room communications should use a focused inbox and reply workspace");
assert.match(rfxEventsHtml, /bid-room-comm-compose-empty/, "Bid Room communications should explain how to start a contextual reply");
assert.match(rfxEventsHtml, /data-rfx-chat-filter="unread"/, "Bid Room communications should filter unread threads");
assert.match(rfxEventsHtml, /data-rfx-chat-filter="needs_reply"/, "Bid Room communications should filter threads that need reply");
assert.match(rfxEventsHtml, /data-rfx-chat-filter="signals"/, "Bid Room communications should filter threads with detected signals");
assert.match(rfxEventsHtml, /rfx-chat-signal-queue/, "Bid Room communications should render an intelligence signal queue");
assert.doesNotMatch(rfxEventsHtml, /data-rfx-chat-filter="carrier"|data-rfx-chat-filter="google_chat"/, "Bid Room communications should keep channel details out of the primary filter bar");
assert.match(rfxEventsSource, /<details class="bid-room-chat-thread/, "Bid Room communications should collapse conversation details into an operational inbox");
assert.match(stylesSource, /\.bid-room-comm-workspace \{[\s\S]*?grid-template-columns: minmax\(0, 1\.28fr\) minmax\(300px, 0\.72fr\)/, "Bid Room communications should prioritize the inbox while keeping reply actions visible");
assert.match(stylesSource, /\.bid-room-chat-thread-summary \{[\s\S]*?position: relative/, "Bid Room thread summaries should anchor their compact disclosure affordance");
assert.match(rfxEventsSource, /chatOpsSummary/, "Bid Room communications should summarize operational chat state");
assert.match(rfxEventsSource, /threadNeedsReply/, "Bid Room communications should prioritize carrier threads that need reply");
assert.match(rfxEventsSource, /rfxChatCopySummary/, "Bid Room communications should copy a procurement summary");
assert.match(rfxEventsSource, /detectMessageIntent/, "Bid Room communications should detect message intent locally");
assert.match(rfxEventsSource, /suggestedReplyForThread/, "Bid Room communications should draft suggested replies for review");
assert.match(rfxEventsSource, /extractedBidUpdateText/, "Bid Room communications should extract bid update candidates without applying them automatically");
assert.match(rfxEventsSource, /openChatBidUpdateDrawer/, "Bid Room communications should open bid updates for human review");
assert.match(rfxEventsSource, /review_bid_update/, "Bid Room communications should review extracted bid updates before applying");
assert.match(rfxEventsHtml, /rfx-chat-bid-update-drawer/, "Bid Room communications should render a bid update review drawer");
assert.match(rfxEventsHtml, /rfx-manual-bid-drawer/, "Operate should allow procurement to record a quote received outside the Bid Room");
assert.match(rfxEventsHtml, /rfx-manual-bid-reject/, "Manual bid capture should expose an operator reject action");
assert.match(rfxEventsHtml, /Valid through/, "Manual bid capture should collect offer validity");
assert.match(rfxEventsSource, /data-rfx-manual-bid/, "Response rows should expose a direct manual bid action");
assert.match(rfxEventsSource, /rejectRfxBid\(invitation\.id/, "Manual bid rejection should use the server-side RFx rejection action");
assert.match(rfxEventsSource, /capture_source: "manual_operator"/, "Manual bid capture should identify its source explicitly");
assert.match(rfxEventsSource, /updateRfxBid\(pendingManualBid\.invitation\.id/, "Manual bid capture should update the existing lane-carrier row");
assert.match(rfxServiceSource, /apply_bid_update_from_chat/, "RFx service should expose chat-to-bid updates");
assert.match(apiSource, /applyBidUpdateFromChat/, "API should apply reviewed chat bid updates");
assert.match(apiSource, /bid_room\.chat\.apply_bid_update/, "API should audit reviewed chat bid updates");
assert.match(apiSource, /function strictBidNumber/, "Internal API should expose strict numeric validation for user-entered bid fields");
assert.match(apiSource, /strictBidNumber\(patchInput\.bid_rate, "Bid rate"\)/, "Internal API should validate direct bid edits before updating RFx rows");
assert.match(apiSource, /strictBidNumber\(input\.bid_rate, "All-in rate", \{ required: true \}\)/, "Internal API should validate chat-to-bid rates before applying updates");
assert.match(apiSource, /strictCurrencyCode\(patchInput\.currency\)/, "Internal API should reject invalid bid currency codes");
assert.match(apiSource, /response_source: manualCapture \? "manual_operator"/, "Manual bid updates should be identifiable separately from portal and chat bids");
assert.match(apiSource, /rfx\.bid\.manual_capture/, "Manual bid updates should be auditable");
assert.match(apiSource, /strictDateOnly\(patchInput\.valid_through, "Valid through"\)/, "Manual bid validity should be validated server-side");
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
assert.match(rfxBidCostHistoryMigration, /rfx_bid_outcome text/, "Rateware staging should persist the historical outcome of a carrier bid");
assert.match(rfxBidCostHistoryMigration, /rate_staging_owner_rfx_bid_outcome_idx/, "RFx bid history should remain efficient to query by workspace and outcome");
assert.match(rfxBidCostHistoryMigration, /when invitation\.invitation_status = 'withdrawn' then 'withdrawn'/, "Existing withdrawn carrier bids should be backfilled as historical withdrawals");
assert.match(rfxBidValidityMigration, /add column if not exists valid_through date/, "RFx carrier bids and Rateware staging should persist carrier offer validity dates");
assert.match(rfxBidDeadheadMigration, /add column if not exists current_unit_location text/, "RFx carrier bids and Rateware staging should persist current unit location");
assert.match(rfxBidDeadheadMigration, /add column if not exists deadhead_distance numeric/, "RFx carrier bids and Rateware staging should persist deadhead distance");
assert.match(rfxBidDeadheadMigration, /deadhead_unit[\s\S]*in \('mi', 'km'\)/, "Deadhead unit should be constrained to miles or kilometers");
assert.match(apiSource, /async function awardRfxLaneVendor/, "API should save primary and backup RFx award decisions");
assert.match(apiSource, /async function closeoutAwardedRfxToRateware/, "API should convert primary RFx awards into Rateware rows");
assert.match(apiSource, /bid_rate_staging_id/, "RFx closeout should resolve the historical carrier bid staging row");
assert.match(apiSource, /linked_existing_bid_staging_for_review/, "RFx closeout should link existing carrier bid rows for human review");
assert.doesNotMatch(apiSource, /approved_existing_bid_staging/, "RFx closeout must not approve historical carrier bids automatically");
assert.match(apiSource, /historicalBidStagingIds/, "RFx closeout should report every historical bid staging row, not only the awarded carrier cost");
assert.match(apiSource, /existing_rate_staging_ids/, "RFx closeout should expose reused staging ids for idempotency verification");
assert.match(apiSource, /linked_existing_rows/, "RFx closeout should report linked historical staging rows");
assert.match(apiSource, /targetStatus = "pending_review"/, "RFx closeout should always route carrier costs through Review Queue");
assert.match(apiSource, /rfx_award_closeout/, "Rateware rows created from RFx awards should carry closeout source metadata");
assert.match(rfxBidApiSource, /async function ensureBidRateStagingRow/, "Carrier portal should capture submitted bids into Rateware staging");
assert.match(rfxBidApiSource, /\.from\("rate_staging"\)[\s\S]*status: "pending_review"/, "Carrier bid captures should remain pending review in Rateware staging");
assert.match(rfxBidApiSource, /bid_rate_staging_id: insert\.data\.id/, "Carrier bid captures should link the invitation to the created staging row");
assert.match(rfxBidApiSource, /bid_rate_staging_id: update\.data\.id/, "Carrier bid revisions should keep the invitation linked to the updated staging row");
assert.match(rfxBidApiSource, /owner_email: ownerEmail/, "Carrier bid staging rows should inherit the RFx workspace owner");
assert.match(rfxBidApiSource, /owner_email: cleanText\(event\.owner_email\)/, "Carrier bid source uploads should inherit the RFx workspace owner");
assert.match(rfxBidApiSource, /rfx_bid_outcome: bidOutcome/, "Carrier bid captures should mark their initial historical outcome");
assert.match(rfxBidApiSource, /revisionType === "best_final"\s*\?\s*"best_and_final"/, "Best-and-final bids should use the normalized historical outcome");
assert.match(rfxBidApiSource, /async function archiveWithdrawnBidRateStaging/, "Carrier bid withdrawals should preserve a staging history record");
assert.match(rfxBidApiSource, /rfx_bid_outcome: "withdrawn"/, "Carrier bid withdrawals should be identifiable in history");
const bidWithdrawalSource = rfxBidApiSource.slice(
  rfxBidApiSource.indexOf('if (body.action === "decline_invitation" || body.action === "withdraw_bid")'),
  rfxBidApiSource.indexOf('if (body.action === "submit_bid")')
);
assert.match(bidWithdrawalSource, /const archivedBidStaging = await archiveWithdrawnBidRateStaging/, "Carrier withdrawal should archive the linked historical cost row");
assert.doesNotMatch(bidWithdrawalSource, /bid_rate_staging_id:\s*null/, "Carrier withdrawal should retain the historical staging link");
assert.doesNotMatch(bidWithdrawalSource, /bid_rate_staged_at:\s*null/, "Carrier withdrawal should retain the historical staging timestamp");
assert.match(rfxBidApiSource, /all_in_rate: rateText\(economics\.carrier_rate \?\? updatedBid\.bid_rate\)/, "Rateware staging all-in should store the carrier cost, not the adjusted board rate");
assert.match(rfxBidApiSource, /customer_board_rate: economics\.board_rate/, "Rateware staging should retain the adjusted board rate separately");
assert.match(apiSource, /async function setRfxBidRateHistoryOutcome/, "RFx award actions should update historical carrier cost outcomes");
assert.match(apiSource, /async function archiveOperatorRejectedBidRateStaging/, "Operator bid rejection should preserve the linked staging history");
assert.match(apiSource, /async function rejectRfxBid/, "Internal API should expose a dedicated operator bid rejection action");
assert.match(apiSource, /body\.action === "reject_rfx_bid"/, "Internal API should route operator bid rejection separately from bid edits");
assert.match(apiSource, /source_bid_status: "declined"/, "Operator-rejected bid history should record its source status");
assert.match(apiSource, /rfx\.bid\.reject/, "Operator bid rejection should be auditable");
assert.match(apiSource, /rfx_bid_outcome: outcome/, "RFx award actions should persist the selected bid outcome");
assert.match(apiSource, /setRfxBidRateHistoryOutcome\(supabase, previous, "not_awarded", now\)/, "Replacing a primary award should preserve the former carrier cost as not awarded");
assert.match(apiSource, /carrier_cost_rate: cleanNumber\(invitation\.bid_rate\)/, "Award closeout should retain the carrier cost alongside the active Rateware row");
assert.match(apiSource, /rfx_bid_outcome: "awarded"/, "Award closeout should identify the awarded carrier cost history");
assert.match(apiSource, /"carrier_cost_rate"[\s\S]*"customer_board_rate"[\s\S]*"commercial_model"[\s\S]*"source_bid_status"[\s\S]*"rfx_bid_outcome"/, "Rateware list responses should expose RFx bid history fields for audit views");
assert.match(ratewareSource, /sheetViewPreset\("RFx bid history"/, "Rateware should provide an RFx bid history spreadsheet preset");
assert.match(ratewareSource, /renderRfxBidProvenance/, "Rateware drawer should explain the approved row's RFx bid provenance");
assert.match(ratewareHtml, /data-col="carrier_cost_rate"/, "Rateware spreadsheet should render read-only carrier costs");
assert.match(stagingReviewSource, /sheetViewPreset\("RFx bid history"/, "Staging should provide an RFx bid history spreadsheet preset");
assert.match(stagingReviewSource, /renderRfxBidProvenance/, "Staging drawer should explain historical carrier bid provenance");
assert.match(stagingReviewHtml, /data-col="rfx_bid_outcome"/, "Staging spreadsheet should render historical RFx bid outcomes");
assert.match(rfxBidApiSource, /valid_through: strictDateOnly\(body\.valid_through, "Valid through"\)/, "Carrier portal API should validate submitted offer validity dates");
assert.match(rfxBidApiSource, /valid_through: validThrough/, "Carrier bid captures should copy validity into Rateware staging");
assert.match(rfxBidApiSource, /strictNonNegativeBidNumber\(body\.deadhead_distance, "Deadhead distance"\)/, "Carrier portal API should reject invalid deadhead distances");
assert.match(rfxBidApiSource, /current_unit_location: cleanText\(body\.current_unit_location\)/, "Carrier portal API should persist current unit location");
assert.match(rfxBidApiSource, /deadhead_distance: deadheadDistance/, "Carrier bid captures should copy deadhead distance into Rateware staging");
assert.match(rfxBidApiSource, /eta_pickup: cleanTimestamp\(invitationResult\.data\.eta_pickup\)/, "Bid revision audit should retain the prior pickup ETA");
assert.match(rfxBidApiSource, /eta_delivery: patch\.eta_delivery/, "Bid revision audit should retain the updated delivery ETA");
assert.match(rfxBidApiSource, /equipment_available: patch\.equipment_available/, "Bid revision audit should retain equipment availability");
assert.match(rfxBidApiSource, /unit_details: patch\.unit_details/, "Bid revision audit should retain unit details");
assert.match(rfxBidApiSource, /availability_validation_status: patch\.availability_validation_status/, "Bid revision audit should retain availability validation");
assert.match(rfxBidSource, /function bidCommitmentSnapshotHtml/, "Carrier portal history should show the operational commitment snapshot");
assert.match(rfxBidSource, /Pickup ETA/, "Carrier portal revision history should surface pickup ETA changes");
assert.match(apiSource, /rfx\.award\.closeout/, "API should audit RFx award closeout");
assert.match(apiSource, /async function generateRfxAwardNotices/, "API should generate RFx award, backup, and not-awarded notice drafts");
assert.match(apiSource, /const closed = cleanText\(patch\.status\)\?\.toLowerCase\(\) === "closed"/, "Closing an RFx should trigger closeout notice generation");
assert.match(apiSource, /if \(closed\) \{[\s\S]*closeoutNotices = await generateRfxAwardNotices/, "Closing an RFx should automatically prepare closeout email drafts");
assert.match(apiSource, /notice_type: "rfx_award_closeout"/, "RFx award notices should be identifiable in outreach metadata");
assert.match(apiSource, /MARKSMAN \| PRIVATE PROCUREMENT ROOM/, "RFx award notices should use the trusted branded email header");
assert.match(apiSource, /awardNoticeTableHtml\(rows, language\)/, "RFx award notices should render a localized decision table");
assert.match(apiSource, /marksmanSignatureHtml\(language\)/, "RFx award notices should include the complete MARKSMAN signature");
assert.match(apiSource, /contextLabels = es/, "RFx award notices should include localized RFx context metadata");
assert.match(apiSource, /Schedule a call: mailto:sales@heymarksman\.com/, "Not-awarded closeout notices should invite carriers to schedule a follow-up call");
assert.match(apiSource, /rfx\.award\.notices\.generate/, "API should audit RFx award notice generation");
assert.match(rfxServiceSource, /award_rfx_lane_vendor/, "RFx service should expose award decisions");
assert.match(rfxServiceSource, /closeout_awarded_rfx_to_rateware/, "RFx service should expose Rateware closeout");
assert.match(rfxServiceSource, /generate_rfx_award_notices/, "RFx service should expose award notice draft generation");
assert.match(rfxEventsHtml, /rfx-award-board/, "Bid Room should render an operational award board");
assert.match(rfxEventsHtml, /rfx-award-needs-decision/, "Award workspace should separate lane decisions from rankings");
assert.match(rfxEventsHtml, /Carrier rankings/, "Award workspace should label the carrier ranking section");
assert.match(rfxEventsHtml, /rfx-closeout-awards-to-rateware/, "Bid Room should expose Rateware closeout from awards");
assert.match(rfxEventsHtml, /rfx-generate-award-notices/, "Bid Room Step 6 should generate award notice drafts");
assert.match(rfxEventsHtml, /rfx-send-award-notices/, "Bid Room Step 6 should send award notice emails in bulk");
assert.match(rfxEventsHtml, /rfx-apply-recommended-awards/, "Bid Room Step 6 should apply recommended awards in bulk");
assert.match(rfxEventsHtml, /rfx-award-readiness/, "Bid Room Step 6 should show closeout readiness");
assert.match(rfxEventsHtml, /rfx-award-notice-queue/, "Bid Room Step 6 should show the award notice queue");
assert.match(rfxEventsHtml, /Review and send email/, "Notices should make the email-only delivery mode explicit");
assert.match(rfxEventsHtml, /rfx-award-notice-preview/, "Notices should render an email preview workspace");
assert.match(rfxEventsSource, /data-rfx-select-award-notice/, "Notices should allow independent carrier selection");
assert.match(rfxEventsHtml, /rfx-close-workspace-tabs/, "Close should expose focused workspaces");
for (const workspace of ["award", "rateware", "notices"]) {
  assert.match(rfxEventsHtml, new RegExp(`data-rfx-close-workspace-tab=\"${workspace}\"`), `Close should expose the ${workspace} workspace tab`);
  assert.match(rfxEventsHtml, new RegExp(`data-rfx-close-workspace-panel=\"${workspace}\"`), `Close should expose the ${workspace} workspace panel`);
}
assert.match(rfxEventsSource, /activateRfxCloseWorkspace/, "Close workspace tabs should have an activation handler");
assert.match(rfxEventsSource, /function renderAwardNoticePreview/, "Notices should render email content before sending");
assert.match(rfxEventsSource, /sendAwardNoticeDrafts\(requestedIds = null\)/, "Notices should support individual and bulk email sends");
assert.match(rfxEventsSource, /data-rfx-send-award-notice/, "Notices should expose an individual send action per carrier");
assert.doesNotMatch(rfxEventsSource, /sendWhatsappOutreachMessages\(ids\)/, "Notices should not send WhatsApp messages");
assert.doesNotMatch(rfxServiceSource, /channel: options\.channel/, "RFx notice generation should not accept a WhatsApp channel override");
assert.match(apiSource, /channel: "email"[^]*notice_type: "rfx_award_closeout"/, "RFx award notices should be persisted as email-only messages");
assert.match(stylesSource, /rfx-close-workspace-tabs/, "Close workspace tabs should have focused styles");
assert.match(stylesSource, /rfx-award-notice-layout/, "Notices should use a queue and preview layout");
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
assert.match(bidRoomE2eSource, /every carrier opens the complete multi-lane portal/, "Bid Room E2E should open the complete route book for every test carrier");
assert.match(bidRoomE2eSource, /three carriers submit bids on every lane/, "Bid Room E2E should submit competing bids across the complete carrier-lane matrix");
assert.match(bidRoomE2eSource, /vendors\.length \* 3/, "Bid Room E2E should require three lanes for every test carrier");
assert.match(bidRoomE2eSource, /Nine competing carrier-lane bids captured in Review Queue/, "Bid Room E2E should retain nine independent historical costs in Review Queue");
assert.match(bidRoomE2eSource, /post_bid_room_chat_message/, "Bid Room E2E should exercise Bid Room chat");
assert.match(bidRoomE2eSource, /sync_bid_room_event_thread/, "Bid Room E2E should attempt Google Chat thread sync");
assert.match(bidRoomE2eSource, /award_rfx_lane_vendor/, "Bid Room E2E should award a primary carrier");
assert.match(bidRoomE2eSource, /award_role: "backup"/, "Bid Room E2E should assign a backup carrier");
assert.match(bidRoomE2eSource, /closeout_awarded_rfx_to_rateware/, "Bid Room E2E should close awarded bids into Rateware");
assert.match(bidRoomE2eSource, /closeoutStatus = "pending_review"/, "Bid Room E2E should keep closeout in Review Queue");
assert.doesNotMatch(bidRoomE2eSource, /approved-closeout/, "Bid Room E2E should not offer an automatic production approval bypass");
assert.match(bidRoomE2eSource, /generate_rfx_award_notices/, "Bid Room E2E should generate final carrier notices");
assert.match(bidRoomE2eSource, /not_awarded/, "Bid Room E2E should validate the no-award outcome");
assert.match(bidRoomE2eSource, /retry closeout without duplicate staging rows/, "Bid Room E2E should verify idempotent Rateware closeout");
assert.match(bidRoomE2eSource, /regenerate final notices without duplicates/, "Bid Room E2E should verify idempotent notice generation");
assert.match(bidRoomE2eSource, /update_rfx_event/, "Bid Room E2E should explicitly close the event");
assert.match(bidRoomE2eSource, /list_staging/, "Bid Room E2E should verify all finalized bids in Review Queue");
assert.match(bidRoomE2eSource, /send-closeout-email/, "Bid Room E2E should keep real closeout email sending opt-in");
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
assert.match(rfxEventsHtml, /<th>Logistics model<\/th>[\s\S]+<th>Internal notes<\/th>/, "Bid Room Step 2 should keep operational rubrics as columns after currency");
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
assert.match(rfxEventsHtml, /id="rfx-draft-tracking-filters"/, "Bid Room draft queue should expose lifecycle tracking filters");
assert.match(outreachServiceSource, /fetchOutreachTrackingSummary/, "Outreach service should fetch lifecycle counts separately from paginated rows");
assert.match(rfxEventsSource, /tracking_status: draftQueueTrackingStatus/, "Draft queue lifecycle filters should be evaluated by the backend");
assert.match(rfxEventsSource, /function outreachTrackingState/, "Draft queue should render one useful lifecycle state per outreach row");
assert.match(rfxEventsSource, /DRAFT_TRACKING_STATES = \[[\s\S]*\["queued", "Queued"\][\s\S]*\["sending", "Sending"\][\s\S]*\["manual_sent", "Manual sent"\][\s\S]*\["delivery_unknown", "Delivery unknown"\][\s\S]*\["suppressed", "Suppressed"\][\s\S]*\["archived", "Archived"\]/, "Draft queue should expose queued, sending, manual, unknown delivery, suppressed, and archived tracking filters");
assert.match(rfxEventsSource, /draftQueueTrackingStatus === "archived" \? \{ status: "archived", include_archived: true \} : \{\}/, "Bid Room archived Draft Queue filter should explicitly load archived rows from the backend");
assert.match(rfxEventsSource, /fetchOutreachTrackingSummary\(\{[\s\S]+include_archived: true/, "Bid Room lifecycle summary should include archived rows so the Archived filter can show a count");
assert.match(rfxEventsSource, /fetchOutreachTrackingSummary\(\{[\s\S]+enforce_rfx_event_scope: true/, "Draft Queue lifecycle counts should request strict active-RFx invitation scope");
assert.match(rfxEventsSource, /function draftQueuePageQuery\(eventId\)[\s\S]+enforce_rfx_event_scope: true/, "Draft Queue rows should request strict active-RFx invitation scope");
assert.match(rfxEventsSource, /Object\.entries\(carrierStates\)[\s\S]+state !== "archived"[\s\S]+reduce\(\(total, \[, value\]\)/, "Bid Room lifecycle counts should use unique carriers and exclude archived carriers from All");
assert.match(rfxEventsSource, /if \(\/archived\/\.test\(signal\)\) return "archived";[\s\S]*if \(\/suppressed\|do_not_contact\|do-not-contact\|blocked contact\/\.test\(signal\)\) return "suppressed";[\s\S]*if \(\/manual_sent\/\.test\(signal\)\) return "manual_sent";[\s\S]*if \(\/delivery_unknown\/\.test\(signal\)\) return "delivery_unknown";[\s\S]*if \(\/read\/\.test\(signal\)\) return "read";[\s\S]*if \(\/delivered\/\.test\(signal\)\) return "delivered";[\s\S]*if \(\/sending\/\.test\(signal\)\) return "sending";[\s\S]*if \(\/queued\/\.test\(signal\)\) return "queued";/, "Draft queue tracking should not collapse archived, suppressed, read, manual, unknown delivery, sending, or queued into sent");
assert.match(apiSource, /body\.action === "get_outreach_tracking_summary"/, "Rateware API should return full-event outreach lifecycle counts");
assert.match(apiSource, /function outreachMessageTrackingState/, "Rateware API should derive lifecycle states from delivery, reply, and quote signals");
assert.match(apiSource, /function hasSubmittedCarrierBid\(value: unknown\)[\s\S]+amount !== null && amount > 0/, "Only a positive bid rate can be classified as quoted");
assert.match(apiSource, /const hasBid = hasSubmittedCarrierBid\(invitation\.bid_rate\)[\s\S]+if \(hasBid\) return "quoted"/, "Outreach tracking should require a submitted carrier bid before classifying a quote");
assert.match(apiSource, /typeof value === "string" && !value\.trim\(\)/, "Whitespace-only numeric fields must not become zero-valued bids");
assert.match(apiSource, /function uniqueOutreachCarrierStates[\s\S]+carrier_states/, "Outreach lifecycle summary should expose unique carrier counts separately from delivery rows");
assert.match(apiSource, /group\.some\(\(row\) => hasSubmittedCarrierBid\(row\.bid_rate\)\)/, "Audience quote status must require a positive bid rate");
assert.match(rfxEventsSource, /const bidText = invitation\.bid_rate === null/, "Bid Room client tracking must not classify an empty bid field as quoted");
assert.match(rfxEventsSource, /carrier_states: result\?\.carrier_states/, "Bid Room lifecycle filters should render carrier-level counts from the API");
assert.match(apiSource, /OUTREACH_TRACKING_STATES = \["drafted", "queued", "sending", "sent", "delivered", "read", "manual_sent", "delivery_unknown", "failed", "replied", "quoted", "bounced", "suppressed", "archived"\]/, "Rateware API should expose the same outreach tracking states as the Bid Room UI");
assert.match(apiSource, /requestedTrackingStatus === "archived"[\s\S]+query = query\.eq\("status", "archived"\)/, "Outreach API should load archived rows when tracking_status is archived");
assert.match(apiSource, /requestedTrackingStatus !== "archived" && !body\.include_archived[\s\S]+query = query\.neq\("status", "archived"\)/, "Outreach API should not exclude archived rows after explicitly requesting archived tracking");
assert.match(apiSource, /if \(\/archived\/\.test\(signal\)\) return "archived";[\s\S]*if \(\/suppressed\|do_not_contact\|do-not-contact\|blocked contact\/\.test\(signal\)\) return "suppressed";[\s\S]*if \(\/manual_sent\/\.test\(signal\)\) return "manual_sent";[\s\S]*if \(\/delivery_unknown\/\.test\(signal\)\) return "delivery_unknown";[\s\S]*if \(\/read\/\.test\(signal\)\) return "read";[\s\S]*if \(\/delivered\/\.test\(signal\)\) return "delivered";[\s\S]*if \(\/sending\/\.test\(signal\)\) return "sending";[\s\S]*if \(\/queued\/\.test\(signal\)\) return "queued";/, "Rateware API tracking should not collapse archived, suppressed, read, manual, unknown delivery, sending, or queued into sent");
assert.match(apiSource, /tracking === "delivery_unknown"\) return "Review delivery status"/, "Rateware API should tell users to review uncertain delivery before another send");
assert.match(apiSource, /async function allScopedRfxOutreachMessages[\s\S]+fetchAllRfxLaneVendorRows[\s\S]+messageInvitationIds/, "Strict RFx outreach tracking should validate messages against current event invitations");
assert.match(apiSource, /body\.action === "get_outreach_tracking_summary"[\s\S]+p_enforce_event_scope: body\.enforce_rfx_event_scope === true/, "RFx outreach lifecycle counts should preserve active invitation scope in SQL");
assert.doesNotMatch(apiSource, /trackingStatus \|\| enforceRfxEventScope/, "Default RFx Draft Queue pages must not read the full event before applying SQL pagination");
assert.match(apiSource, /if \(trackingStatus\) \{[\s\S]+rateware_outreach_tracking_page[\s\S]+\.in\("id", ids\)/, "Derived lifecycle filters should page IDs in SQL and hydrate only the selected rows");
assert.match(apiSource, /statusFilter === "needs_queue" && \["not_invited", "ready"\]/, "Delivery Queue grouped needs-message counts should filter the same statuses they display");
assert.match(apiSource, /statusFilter === "contacted" && \["invited", "sent", "delivered", "read", "manual_sent", "delivery_unknown"\]/, "Delivery Queue contacted counts should filter the same statuses they display");
assert.doesNotMatch(rfxEventsHtml, /rfx-touchpoint-summary/, "Bid Room Step 4 should not duplicate drafts in an invitation tracking section");
assert.match(rfxEventsSource, /async function loadDraftQueuePage/, "Bid Room draft queue should load a page from the backend before rendering");
assert.doesNotMatch(rfxEventsSource, /function filteredDraftRows/, "Draft queue should not filter an already loaded browser-side message list");
assert.doesNotMatch(rfxEventsSource, /function draftSearchText/, "Draft queue search should remain server-side instead of scanning email bodies in the browser");
assert.doesNotMatch(apiSource, /metadata->>bid_link|metadata->>profile_link/, "Draft queue search should not match shared invitation links");
assert.match(rfxEventsSource, /\.normalize\("NFD"\)/, "Draft queue search should be accent-insensitive");
assert.match(rfxEventsSource, /addEventListener\("search", applyDraftQueueSearch\)/, "Draft queue search should react when the browser clears a search input");
assert.match(rfxEventsSource, /addEventListener\("input", scheduleDraftQueueSearch\)/, "Draft queue search should debounce typing before rerendering the table");
assert.match(rfxEventsSource, /function applyDraftQueueSearch\(\)[\s\S]+clearDraftQueueSelection\(\);[\s\S]+loadDraftQueuePage\(selectedEventId, \{ reset: true \}\)/, "Draft queue search changes should clear stale selected rows before loading the new scope");
assert.match(rfxEventsSource, /draftTrackingFilters\?\.addEventListener\("click"[\s\S]+draftQueueTrackingStatus = nextStatus;[\s\S]+clearDraftQueueSelection\(\);[\s\S]+loadDraftQueuePage\(selectedEventId, \{ reset: true \}\)/, "Draft queue lifecycle changes should clear stale selected rows");
assert.match(rfxEventsSource, /draftPageSize\?\.addEventListener\("change"[\s\S]+clearDraftQueueSelection\(\);[\s\S]+loadDraftQueuePage\(selectedEventId, \{ reset: true \}\)/, "Draft queue page-size changes should clear stale selected rows");
assert.match(rfxEventsSource, /draftPreviousPageButton\?\.addEventListener\("click"[\s\S]+clearDraftQueueSelection\(\);[\s\S]+loadDraftQueuePage\(selectedEventId\)/, "Draft queue previous-page navigation should clear stale selected rows");
assert.match(rfxEventsSource, /draftNextPageButton\?\.addEventListener\("click"[\s\S]+clearDraftQueueSelection\(\);[\s\S]+loadDraftQueuePage\(selectedEventId\)/, "Draft queue next-page navigation should clear stale selected rows");
assert.match(rfxEventsSource, /function selectedDraftRows\(rows = null\) \{[\s\S]+const source = rows \|\| draftQueueRows;[\s\S]+selectedDraftMessageIds\.has\(String\(message\.id\)\)/, "Draft Queue bulk actions should resolve selected rows from the active loaded page by default");
for (const functionName of ["sendSelectedDraftEmails", "sendSelectedDraftWhatsapp", "refreshSelectedOutreachDrafts", "markSelectedWhatsappGroupsManuallySent", "archiveSelectedDrafts", "deleteSelectedDrafts"]) {
  const start = rfxEventsSource.indexOf(`async function ${functionName}`);
  const nextFunction = rfxEventsSource.indexOf("\nasync function ", start + functionName.length);
  const source = rfxEventsSource.slice(start, nextFunction > start ? nextFunction : undefined);
  assert.match(source, /finally \{[\s\S]*?updateDraftSendControls\(draftQueueRows\);[\s\S]*?\}/, `${functionName} should always restore Bid Room Draft Queue controls after success or failure`);
}
assert.match(rfxEventsSource, /const selectable = channel === "whatsapp"[\s\S]+selectable\.forEach\(rememberDraftRow\)/, "Select sendable should add only drafts from the active channel queue without replacing previous selections");
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
assert.match(apiSource, /function rfxLaneAppendKey/, "Rateware API should calculate a stable lane key for append-only imports");
assert.match(apiSource, /This bid event is closed\. New lanes cannot be added\./, "Rateware API should block lane additions after event closeout");
assert.match(apiSource, /skipped_rows: skippedRows/, "Rateware API should report duplicate lanes skipped during append-only import");
assert.match(apiSource, /mode: "append"/, "Rateware API should identify lane imports as append-only");
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
assert.doesNotMatch(rfxBidSource, /bid-lane-detail-disclosure/, "Carrier portal should avoid duplicating selected-lane details in Bid tools");
assert.doesNotMatch(rfxBidSource, /<p>\$\{escapeHtml\(value\)\}<\/p>/, "Carrier portal should not show pasted lane detail HTML as escaped source");
assert.match(rfxBidSource, /function renderCarrierLaneSwitcher/, "Carrier portal should expose all invited event lanes before the selected lane bid form");
assert.match(rfxBidSource, /function laneFitProgress/, "Carrier Bid tools should summarize the selected route fit");
assert.match(rfxBidSource, /function quickFitActionLabel/, "Quick bid actions should show lane-level fit progress");
assert.match(rfxBidSource, /quickFitActionTone\(fit\)/, "Quick bid fit actions should distinguish ready and review states");
assert.match(rfxBidLaneScopeSource, /export function canonicalLaneStatus/, "Carrier lanes should resolve one canonical lifecycle status");
assert.match(rfxBidLaneScopeSource, /if \(awardRole === "primary"[\s\S]*return "awarded";[\s\S]*return "withdrawn";[\s\S]*return "quoted";[\s\S]*return "exception";[\s\S]*return "agreed";/, "Canonical lane status should preserve outcome, withdrawal, quote, and fit precedence");
assert.match(rfxBidSource, /data-lane-lifecycle-status/, "Carrier lane status pills should share the canonical lifecycle resolver");
assert.match(rfxBidSource, /commercialModelSelectedContextHtml\(selectedRow\?\.commercial_model\)/, "Bid Tools should retain selected commercial-model context without repeating the full guide");
assert.match(rfxBidSource, /function focusRouteFit/, "Carrier lane navigation should focus the selected route fit before quoting");
assert.match(rfxBidSource, /carrier-lane-book-table/, "Carrier route schedule should use one compact actionable lane table");
const masterPackageRoutesStart = rfxBidSource.indexOf("function renderMasterPackageRoutes");
const masterPackageRoutesEnd = rfxBidSource.indexOf("function renderSegmentRubricControl", masterPackageRoutesStart);
const masterPackageRoutesSource = rfxBidSource.slice(masterPackageRoutesStart, masterPackageRoutesEnd);
assert.doesNotMatch(masterPackageRoutesSource, /data-route-fit-token/, "Master package routes should not repeat a separate fit action when Bid Tools owns route editing.");
assert.match(masterPackageRoutesSource, /data-route-offer-token/, "The master route book should expose one contextual route quote action.");
assert.match(masterPackageRoutesSource, /data-route-book-filter/, "Closed lanes should expose one recorded-outcome action.");
assert.match(masterPackageRoutesSource, /One action per lane/, "The master route book should explain its reduced action hierarchy.");
assert.match(rfxBidSource, /\["declined", "rejected", "awarded", "backup", "not_awarded"\]/, "Rejected and outcome lanes should not remain quoteable after an outcome is recorded.");
assert.match(rfxBidSource, /Update quote/, "The master route book should describe the action for an existing quote.");
assert.match(rfxBidSource, /View outcome/, "The master route book should describe the action for a closed lane.");

const selectedLaneWorkspaceStart = rfxBidSource.indexOf("function renderSelectedLaneWorkspace");
const selectedLaneWorkspaceEnd = rfxBidSource.indexOf("function awardNextSteps", selectedLaneWorkspaceStart);
const selectedLaneWorkspaceSource = rfxBidSource.slice(selectedLaneWorkspaceStart, selectedLaneWorkspaceEnd);
assert.match(selectedLaneWorkspaceSource, /\["declined", "rejected", "awarded", "backup", "not_awarded"\]/, "Rejected and outcome lanes should not reopen the editable per-route fit workspace.");
assert.match(rfxBidSource, /data-decline-invitation[\s\S]*\["declined", "rejected", "awarded", "backup", "not_awarded"\]/, "Rejected and outcome lanes should not show an active reject control.");
assert.match(rfxBidSource, /data-route-participation-action/, "Each invited lane should expose reject or withdraw without leaving the route book");
assert.match(rfxBidSource, /data-master-segment-key/, "Operational fit actions should target the matching segment checklist");
assert.match(rfxBidSource, /function segmentConfirmationMap\(invitation = lastInvitation \|\| \{\}\)[\s\S]*rfx_lane_vendor_id[\s\S]*invitationId/, "Carrier fit confirmations should be scoped to the selected lane invitation");
assert.match(rfxBidSource, /function renderLaneFitChecklist/, "Carrier portal should render the route-level fit checklist in Bid tools");
assert.match(rfxBidSource, /data-decline-invitation/, "Carrier route fit should allow the carrier to reject an unworkable lane");
assert.match(rfxBidSource, /Fit answers are optional/, "Route fit answers should be advisory before quoting");
assert.match(rfxBidLaneScopeSource, /function isBidToolsEligibleRow/, "Bid tools should filter only by invitation and route status");
assert.match(rfxBidLaneScopeSource, /function eventInvitedLaneRows\(carrierBook = \{\}, invitation = \{\}\)[\s\S]*invitation_token/, "Master Package and Bid Tools should resolve every tokenized invitation for the active RFx.");
assert.match(rfxBidLaneScopeSource, /row\.event\?\.id[\s\S]*row\.rfx_events\?\.id[\s\S]*row\.rfx_event_id/, "Carrier route matching should accept nested and flattened event identifiers after refresh.");
assert.match(rfxBidLaneScopeSource, /function isBidToolsEligibleRow\(row = \{\}, statusResolver = \(\) => ""\)[\s\S]*Boolean\(String\(row\.invitation_token \|\| ""\)\.trim\(\)\)/, "Bid Tools eligibility should be based on a real invitation token, not a stale display flag.");
assert.match(rfxBidSource, /function renderMasterPackageRoutes[\s\S]*eventInvitedLaneRows\(carrierBook, invitation\)/, "The RFx Master Package should expose the same invited routes that can be quoted in Bid Tools.");
// The separate route selector is gone; the quick bid grid is the lane list now,
// so the scope guarantee moves onto the rows it renders.
assert.doesNotMatch(rfxBidSource, /renderBidToolsLaneSwitcher/, "The standalone bid tools route selector should not come back alongside the grid");
assert.match(rfxBidSource, /function quickBidRows[\s\S]*eventInvitedLaneRows\(carrierBook, invitation\)/, "The quick bid grid should use the same invited RFx scope as the Master Package.");
assert.match(rfxBidSource, /function renderBidTemplateTools[\s\S]*eventInvitedLaneRows\(carrierBook, invitation\)/, "The bid XLSX scope should match every invited lane in the active RFx.");
assert.match(rfxBidSource, /function bidTemplateRows[\s\S]*bidTemplateSourceRows\(carrierBook, invitation, bookStatus\)/, "Bid templates should include every eligible invited lane");
assert.match(rfxBidSource, /function quickBidRows[\s\S]*isBidToolsEligibleRow\(row, \(candidate\) => bookStatus\(candidate, packagePayload\)\)/, "Quick bids should include every eligible invited lane with route-level fit context");
// Deliberately reversed. Rendering one lane at a time forced a carrier with
// seven lanes through seven context switches; the grid now prices all of them.
assert.doesNotMatch(rfxBidSource, /quickBidRowsForSelectedLane/, "The quick bid grid should no longer render a single lane at a time");
assert.match(rfxBidSource, /function renderQuickLaneBidGridShell[\s\S]*const rows = quickBidRows\(carrierBook, invitation\)/, "The quick bid grid should render every eligible invited lane");
assert.match(rfxBidSource, /data-open-quick-lane-fit="\$\{escapeAttribute\(row\.invitation_token/, "Each row's Fit button must target its own lane, not whichever lane is selected");
assert.match(rfxBidSource, /Bid tools/, "Bid tools should clearly identify the quick-bid workspace");
assert.match(rfxBidSource, /quick-bid-heading-copy/, "Bid tools should keep the selected route context compact and visible in the quick bid heading");
assert.match(rfxBidSource, /data-selected-quick-bid-token/, "The quick bid grid should retain the active lane token when the carrier switches routes");
assert.match(rfxBidSource, /renderQuickLaneBidGridShell\(carrierBook, invitation, \{ invitationToken: selectedInvitation\.invitation_token \}\)/, "The selected invitation should still drive the fit checklist and commercial context above the grid");
assert.match(rfxBidSource, /const pendingQuickBidDrafts = new Map\(\)/, "Bid tools should retain unsaved carrier drafts while switching routes.");
assert.match(rfxBidSource, /let bidToolsLaneSelectionVersion = 0;/, "Bid tools should guard rapid route changes from rendering stale lane state.");
assert.match(rfxBidSource, /function capturePendingQuickBidDrafts\(scope = card\)/, "Bid tools should capture visible offer, alternative, and live-capacity inputs before a route change.");
assert.match(rfxBidSource, /function rememberQuickBidDraft\(rowElement, \{ localOnly = false \} = \{\}\)/, "Every quick-bid row should retain edits locally before a route switch or rerender.");
assert.match(rfxBidSource, /local_only: localOnly \|\| existing\?\.local_only === true/, "Local quick-bid draft state should survive route changes until the carrier publishes it.");
assert.match(rfxBidSource, /Unpublished changes/, "The carrier should see a concise state that distinguishes local edits from a published offer.");
assert.match(rfxBidSource, /setQuickBidLocalDraftStatus\(row\)/, "Quick-bid edits should immediately show their local unpublished status.");
assert.match(rfxBidSource, /const currentPanel = card\.querySelector\('\[data-private-workspace-panel="bids"\]'\);[\s\S]*capturePendingQuickBidDrafts\(currentPanel\);[\s\S]*const pendingFitSave = flushSegmentConfirmationSave\(currentPanel\?\.querySelector\("\[data-lane-fit-checklist\]"\)\);[\s\S]*pendingFitSave\?\.catch\?\.\(\(\) => \{\}\);/, "Changing a Bid Tools route should preserve local drafts and flush pending fit autosave in the background without blocking lane selection.");
assert.match(rfxBidSource, /const selectionVersion = \+\+bidToolsLaneSelectionVersion;[\s\S]*if \(selectionVersion !== bidToolsLaneSelectionVersion\) return;/, "The last lane selected should win if the carrier changes routes rapidly.");
assert.match(rfxBidSource, /\[data-quick-bid-field\], \[data-quick-bid-extra-field\][\s\S]*rememberQuickBidDraft\(row, \{ localOnly: true \}\)/, "Alternative and live-capacity edits should be retained immediately, not only when routes change.");
assert.match(rfxBidSource, /pendingQuickBidDrafts\.delete\(String\(rowToken\)\)/, "A successful quote save should clear only the saved local draft.");
assert.match(rfxBidSource, /Fit answers are optional and save automatically/, "Selected route context should clearly communicate advisory fit autosave behavior");
assert.match(rfxBidSource, /<strong>\$\{escapeHtml\(formatLane\(lane\)\)\}<\/strong>/, "The collapsed fit heading should identify the active route without a second route summary card.");
assert.match(rfxBidSource, /lane-fit-disclosure-trigger[\s\S]*Fit details/, "The selected route fit should expose a compact details control.");
assert.match(rfxBidSource, /data-lane-fit-autosave-state/, "The collapsed route fit should expose its autosave state without opening the checklist.");
assert.match(rfxBidSource, /fit\.open = !fit\.open/, "The route fit action should toggle the inline checklist without navigating or reloading.");
assert.match(rfxBidSource, /aria-expanded="false"/, "Quick bid detail actions should expose their collapsed state before opening inline detail");
assert.match(rfxBidSource, /lane-fit-disclosure-trigger/, "Route fit should show an explicit compact disclosure affordance");
assert.match(stylesSource, /\.lane-fit-disclosure\[open\] \.lane-fit-disclosure-trigger::after/, "Route fit disclosure should visually distinguish expanded state");
assert.doesNotMatch(rfxBidApiSource, /async function assertLaneFitComplete/, "Carrier bid API should not hard-block quotes on optional fit answers");
const bidSubmitSource = rfxBidApiSource.slice(
  rfxBidApiSource.indexOf('if (body.action === "submit_bid")'),
  rfxBidApiSource.indexOf('if (body.action === "submit_bid")') + 7000
);
assert.doesNotMatch(bidSubmitSource, /assertLaneFitComplete/, "Carrier bid submissions should accept quotes with optional fit answers");
assert.match(rfxBidSource, /import \* as XLSX from "https:\/\/esm\.sh\/xlsx@0\.18\.5"/, "Carrier portal should load XLSX support for bid templates");
assert.match(rfxBidSource, /import\("https:\/\/esm\.sh\/exceljs@4\.4\.0\?bundle"\)/, "Carrier portal should use ExcelJS for XLSX dropdown data validations");
assert.match(rfxBidSource, /const BID_TEMPLATE_COLUMNS = \[/, "Carrier portal should define a prefilled XLSX bid template schema");
assert.match(rfxBidSource, /function downloadBidTemplate/, "Carrier portal should download a prefilled XLSX bid template");
assert.match(rfxBidSource, /function parseBidTemplateFile/, "Carrier portal should parse uploaded bid templates");
assert.match(rfxBidSource, /function validateBidTemplateRow/, "Carrier portal should validate uploaded XLSX bid rows before submit");
assert.match(rfxBidSource, /reconcileBidTemplateUploadRows\(normalizedRows, bidTemplateRows\(carrierBook, invitation\)\)/, "Uploaded XLSX bids should reconcile against the current active RFx lane scope");
assert.match(rfxBidSource, /row\.submission_status !== "submitted"/, "Partial XLSX retries should skip rows already submitted successfully");
assert.match(rfxBidSource, /Retry sends failed rows only/, "The XLSX workflow should explain that partial retries only resend failed rows");
assert.match(rfxBidSource, /dataValidation = validation/, "Carrier portal XLSX template should write dropdown and numeric validations");
assert.match(rfxBidSource, /Instructions - Instrucciones/, "Carrier portal XLSX template should include bilingual instructions with an Excel-safe worksheet name");
assert.match(rfxBidSource, /Commercial model \/ Modelo comercial/, "Carrier portal XLSX template should use bilingual headers");
assert.match(rfxBidSource, /Carrier rate \/ Tarifa carrier/, "Carrier portal XLSX template should label the entered amount as the carrier rate");
assert.match(rfxBidSource, /aliases: \["Carrier rate", "Tarifa carrier", "All-in rate", "Tarifa all-in"\]/, "Carrier portal XLSX imports should preserve legacy all-in headers as aliases");
assert.match(rfxBidSource, /Required columns/, "Carrier portal XLSX instructions should explain only the required bid columns");
assert.match(rfxBidSource, /recommended, but not required/i, "Carrier portal XLSX template should mark non-blocking recommended columns");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.weekly_capacity, "bid-capacity", "Weekly capacity", false\)/, "Carrier portal should not require weekly capacity to submit a bid");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.transit_days, "bid-transit-days", "Transit days", false\)/, "Carrier portal should not require transit days to submit a bid");
assert.match(rfxBidSource, /data-download-bid-template/, "Carrier portal should render a bid template download action");
assert.match(rfxBidSource, /data-submit-bid-template/, "Carrier portal should require confirmation before submitting XLSX bids");
assert.match(rfxBidSource, /data-bid-template-tools/, "Carrier portal should keep XLSX batch quoting inside a compact master-package disclosure");
assert.match(rfxBidSource, /Individual route actions stay in Bid tools\./, "Carrier portal should distinguish batch XLSX quoting from single-lane Bid tools actions");
assert.match(rfxBidSource, /callBidApi\("submit_bid", \{ token: row\.invitation_token, \.\.\.row\.draft \}\)/, "Carrier portal should submit each XLSX row through the normal tokenized bid API");
assert.match(rfxBidSource, /let bidTemplateSubmitting = false;/, "Carrier portal XLSX submit should have a running guard");
assert.match(rfxBidSource, /async function submitBidTemplateRows\(\) \{[\s\S]+if \(bidTemplateSubmitting\) return;[\s\S]+bidTemplateSubmitting = true;[\s\S]+finally \{[\s\S]+bidTemplateSubmitting = false;[\s\S]+\}/, "Carrier portal XLSX submit should ignore duplicate submits and always restore its guard");
assert.match(rfxBidSource, /const BID_PORTAL_COPY = \{/, "Carrier portal should provide English and Spanish UI copy");
assert.match(rfxBidSource, /data-private-language-toggle="en"/, "Carrier portal should expose an English/Spanish language toggle");

// Four parallel workspaces named after system nouns gave a carrier no order and
// no sense of progress. They are now three phases in the order work happens.
assert.match(rfxBidSource, /PRIVATE_WORKSPACE_VALUES = new Set\(\["master", "bids", "award"\]\)/, "The carrier portal should expose exactly three phases");
assert.doesNotMatch(rfxBidSource, /data-private-workspace-tab="book"/, "The private book should not be a fourth tab");
assert.doesNotMatch(rfxBidSource, /setPrivateWorkspace\("book"\)/, "Nothing should navigate to the retired fourth tab");
// A carrier who left the old tab selected must not land on a panel that is gone.
assert.match(rfxBidSource, /RETIRED_PRIVATE_WORKSPACES = new Map\(\[\["book", "award"\]\]\)/, "A stored fourth-tab selection must migrate instead of dead-ending");
assert.match(rfxBidSource, /function resolvePrivateWorkspace/, "Workspace resolution should run through one migration-aware helper");
assert.match(rfxBidSource, /data-private-workspace-panel="award"[\s\S]{0,900}id="carrier-business-book"/, "The lane book should live inside the Result phase");

// A carrier arriving from an email needs to know who is asking, how long is left,
// and how far along they are. None of it was answered before.
assert.match(rfxBidSource, /function renderPortalStatusBar/, "Carrier portal should render a persistent status bar");
assert.match(rfxBidSource, /function carrierLaneProgress/, "Carrier portal should show how many lanes are already quoted");
assert.match(rfxBidSource, /class="bid-portal-statusbar"/, "The status bar should be rendered into the portal");
assert.match(stylesSource, /\.bid-portal-statusbar \{[^}]*position: sticky/, "The status bar should stay on screen while the carrier prices lanes");
// One toggle, in the status bar. It used to be duplicated in the hero toolbar.
assert.equal(
  (rfxBidSource.match(/data-private-language-toggle="en"/g) || []).length,
  1,
  "The language toggle should exist exactly once"
);

// A bare `new Date("YYYY-MM-DDT23:59:59")` resolves to the runtime zone: UTC on
// the edge function, the device zone in the browser. That once closed bidding at
// 17:59 Mexico City while the portal still showed "closes today".
assert.match(rfxBidSource, /BID_DEADLINE_UTC_OFFSET = "-06:00"/, "The portal should pin the deadline zone");
assert.match(rfxBidApiSource, /BID_DEADLINE_UTC_OFFSET/, "The bid API should pin the deadline zone");
assert.match(rfxBidSource, /new Date\(`\$\{event\.due_date\}T23:59:59\$\{BID_DEADLINE_UTC_OFFSET\}`\)/, "Portal countdown must use the pinned deadline zone");
assert.match(rfxBidApiSource, /new Date\(`\$\{due\}T23:59:59\$\{BID_DEADLINE_UTC_OFFSET\}`\)/, "Deadline enforcement must use the pinned deadline zone");
// Carriers in this Bid Room are mostly Mexican; landing them in English by
// default made every one of them hunt for the toggle.
assert.doesNotMatch(rfxBidSource, /language: localStorage\.getItem\("rateware\.privateBidRoom\.language"\) \|\| "en"/,
  "Carrier portal must not hard-default the portal language to English");
assert.match(rfxBidSource, /language: storedPortalLanguage\(\) \|\| browserPortalLanguage\(\)/,
  "Carrier portal should seed language from an explicit choice, then the browser");
assert.match(rfxBidSource, /function carrierPortalLanguage/,
  "Carrier portal should derive language from the invitation's own carrier and lane data");
assert.match(rfxBidSource, /function applyCarrierLanguageDefault[\s\S]*?if \(storedPortalLanguage\(\)\) return false/,
  "A carrier who picked a language must never be overridden by detection");
assert.match(rfxBidSource, /lastInvitation = data\.invitation;\s*(?:\/\/[^\n]*\n\s*)*applyCarrierLanguageDefault\(lastInvitation\)/,
  "Language detection must run before the invitation is first rendered");
assert.match(rfxBidSource, /function eventMarketplaceUrl/, "Carrier portal should build a contextual public Bid Room board URL");
assert.match(rfxBidSource, /return "\.\/bid-room-board\.html"/, "Carrier portal should link bid-specific pages to the full public live board");
assert.match(stylesSource, /\.carrier-bid-template-tools/, "Carrier portal should style the XLSX bid template workflow");
assert.match(stylesSource, /\.carrier-bid-template-tools\[open\] \.carrier-bid-template-trigger::after/, "Carrier portal should provide a compact open and close affordance for batch XLSX quoting");
assert.match(stylesSource, /\.bid-lane-detail-sections[\s\S]*grid-template-columns: minmax\(280px/, "Carrier portal lane detail sections should use a wider readable layout");
assert.match(apiSource, /routeRows\.length > 1 \? "&view=book" : ""/, "RFx outreach links with multiple event lanes should open the carrier business book view");
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
assert.match(rfxEventsSource, /const decisionChecklist = \[/, "Bid Room should summarize decision prerequisites before an award action");
assert.match(rfxEventsSource, /Production approval remains a separate human decision\./, "Bid Room award guidance must keep production approval human-controlled");
assert.match(rfxEventsSource, /can be sent to Review Queue; this does not approve them for production/, "Award guidance must distinguish Review Queue from production approval");
assert.match(rfxEventsSource, /blockIfAwardPreflightFails\("closeout"\)/, "Bid Room should guard Rateware closeout with award preflight checks");
assert.match(rfxEventsSource, /blockIfAwardPreflightFails\("generate_notices"\)/, "Bid Room should guard award notice generation with award preflight checks");
assert.match(rfxEventsSource, /blockIfAwardPreflightFails\("send_notices"\)/, "Bid Room should guard award notice sending with award preflight checks");
assert.match(rfxEventsSource, /function applyRecommendedAwardDecisions/, "Bid Room should save recommended primary awards in bulk");
assert.match(rfxEventsSource, /function renderAwardNoticeQueue/, "Bid Room should render award notice queue from generated drafts");
assert.match(rfxEventsSource, /data-rfx-mark-award-notice/, "Bid Room should update award notice draft status from Step 6");
assert.match(stylesSource, /rfx-decision-scorecards/, "Bid Room decision view should style scorecards");
assert.match(stylesSource, /rfx-decision-badge/, "Bid Room decision view should style badges");
assert.match(stylesSource, /rfx-award-readiness-grid/, "Bid Room award readiness should have compact styling");
assert.match(stylesSource, /rfx-award-preflight/, "Bid Room should style the human award decision checklist");
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
assert.match(rfxBidApiSource, /legacyModel === "direct_cost_plus"[\s\S]*: null/, "Carrier portal API should preserve legacy percentage semantics while writing canonical commercial models");
assert.match(rfxBidApiSource, /strictCurrencyCode\(body\.currency\)/, "Carrier portal API should reject invalid currency codes");
assert.match(rfxBidApiSource, /commercial_model: commercialModel/, "Carrier portal API should write normalized commercial model");
assert.match(rfxBidApiSource, /best_alternative_offered: cleanBoolean\(body\.best_alternative_offered\) === true/, "Carrier portal API should write best-alternative flag");
assert.match(rfxBidApiSource, /eta_pickup: cleanTimestamp\(body\.eta_pickup\)/, "Carrier portal API should write pickup ETA");
assert.match(apiSource, /patch\.commercial_model = normalizeCommercialModelForUpdate/, "Internal API should canonicalize commercial model updates without rewriting legacy Fee-Plus rows");
assert.match(rfxBidSource, /bid-commercial-model/, "Carrier portal should render commercial model input");
assert.match(rfxBidSource, /bid-alt-enabled/, "Carrier portal should render best-alternative input");
assert.match(rfxBidSource, /bid-equipment-available/, "Carrier portal should render equipment availability input");
assert.match(rfxBidSource, /bid-eta-pickup/, "Carrier portal should render pickup ETA input");
assert.match(rfxBidSource, /Guided bid flow/, "Carrier portal should present the bid form as a guided workflow");
// The modal these used to assert lived in a <template>, so its markup never
// rendered. Both capabilities now ship in the inline quick-bid row; assert that.
assert.match(rfxBidSource, /data-quick-bid-field="bid_rate"/, "Carrier portal should let carriers enter the primary rate inline");
assert.match(rfxBidSource, /data-toggle-quick-bid-panel="alternative"/, "Carrier portal should let carriers add alternative offers");
assert.match(rfxBidSource, /data-quick-bid-extra-field="best_alternative_offered"/, "Carrier portal should capture the alternative-offer flag");
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
assert.match(rfxBidSource, /pendingOwnOfferRevisionTokens/, "Carrier portal should mark a submitted carrier offer before refreshing rank alerts");
assert.match(rfxBidSource, /competitorActivityAdvanced[\s\S]*queuePrivateBidAlert\("displaced"/, "Carrier portal should only announce displacement after new competitor activity");
assert.match(rfxBidSource, /clearPrivateBidAlerts\(\["displaced"\]\)/, "Carrier portal should remove stale displacement alerts after an own offer revision");
assert.match(rfxBidApiSource, /current_offer_revision_at/, "Bid API should identify the current carrier offer revision separately from board refresh time");
assert.match(rfxBidApiSource, /latest_competitor_activity_at/, "Bid API should expose competitor activity separately for rank displacement detection");
assert.match(rfxBidSource, /Bid submitted\./, "Carrier portal should announce successful bid submission");
assert.match(rfxBidSource, /New message in Bid Room chat\./, "Carrier portal should announce new chat messages");
assert.match(rfxBidSource, /speechSynthesis/, "Carrier portal should use browser speech announcements");
assert.match(rfxBidSource, /detectPrivateBidRoomSignals/, "Carrier portal should compare live board snapshots before alerting");
assert.match(rfxBidSource, /snapshot\.historyCount > previous\.historyCount/, "Carrier portal rank alerts should treat own bid history changes as self-updates");
assert.match(rfxBidSource, /snapshot\.currentRate !== previous\.currentRate/, "Carrier portal rank alerts should not announce competitor displacement when the carrier changed its own rate");
assert.match(rfxBidSource, /detectPrivateChatSignals/, "Carrier portal should compare chat snapshots before alerting");
assert.match(rfxBidSource, /function bidDraftWarnings/, "Carrier portal should validate bid completeness before submit");
assert.match(rfxBidSource, /function validateBidDraft/, "Carrier portal should block invalid bid submissions before API submit");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.bid_rate, "bid-rate", rateLabel\)/, "Carrier portal should require the commercial-model-specific carrier rate");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.weekly_capacity, "bid-capacity", "Weekly capacity", false\)/, "Carrier portal should validate capacity only when provided");
assert.match(rfxBidSource, /validatePositiveNumberIssue\(draft\.transit_days, "bid-transit-days", "Transit days", false\)/, "Carrier portal should validate transit days only when provided");
assert.match(rfxBidSource, /data-quick-bid-field="valid_through"/, "Carrier portal should ask carriers for offer validity in the inline lane row");
assert.match(rfxBidSource, /valid_through: card\.querySelector\("#bid-valid-through"\)\?\.value \|\| ""/, "Carrier portal should collect offer validity from the guided bid form");
assert.match(rfxBidSource, /Valid through \/ Vigente hasta/, "Carrier XLSX bid template should include a bilingual validity column");
assert.match(rfxBidSource, /valid_through: quickBidField\(rowElement, "valid_through"\)/, "Carrier quick bid rows should save offer validity");
assert.match(rfxBidSource, /data-quick-bid-extra-field="current_unit_location"/, "Carrier portal should ask where the available unit is located");
assert.match(rfxBidSource, /data-quick-bid-extra-field="deadhead_distance"/, "Carrier portal should ask for empty miles or kilometers to pickup");
assert.match(rfxBidSource, /deadhead_distance: card\.querySelector\("#bid-deadhead-distance"\)\?\.value \|\| ""/, "Carrier portal should collect deadhead from the guided bid form");
assert.match(rfxBidSource, /validateNonNegativeNumberIssue\(draft\.deadhead_distance, "bid-deadhead-distance", "Deadhead distance", false\)/, "Carrier portal should validate deadhead as optional non-negative distance");
assert.match(rfxBidSource, /Current unit location \/ Ubicacion unidad/, "Carrier XLSX bid template should include current unit location");
assert.match(rfxBidSource, /Deadhead distance \/ Vacio mi-km/, "Carrier XLSX bid template should include deadhead distance");
assert.match(rfxBidSource, /Deadhead unit \/ Unidad deadhead/, "Carrier XLSX bid template should include deadhead unit");
assert.match(rfxBidSource, /nonNegativeNumberBlank/, "Carrier XLSX bid template should validate optional deadhead distance");
assert.match(rfxBidSource, /deadhead_distance: extra\("deadhead_distance", rowElement\.dataset\.deadheadDistance \|\| ""\)/, "Carrier quick bid rows should preserve deadhead details from the inline capacity panel");
assert.match(rfxBidSource, /function commercialStructureConfig/, "Carrier portal should explain each commercial structure");
assert.match(rfxBidSource, /rateLabel: dualText\("Direct carrier all-in"/, "Cost-plus should tell carriers to enter their direct all-in price");
assert.match(rfxBidSource, /rateLabel: dualText\("All-in you want to keep"/, "Carrier-share should tell carriers that their all-in remains theirs");
assert.match(rfxBidSource, /rateLabel: dualText\("Sell rate to XBF"/, "XBF buy-sell should tell carriers to enter their sell rate to XBF");
assert.match(rfxBidSource, /rateInput\.title = config\.rateEntryHelp/, "The inline lane row should expose the active price-entry rule on the rate input");
assert.match(rfxBidSource, /rateEntryHelp\.textContent = config\.rateEntryHelp/, "The advanced bid editor should update the price-entry rule when the commercial model changes");
assert.match(rfxBidSource, /commercialConfig\.rateLabel/, "The final bid review should identify the carrier-entered rate according to its commercial model");
assert.match(rfxBidSource, /function commercialModelGuideHtml/, "Carrier portal should show a concise commercial model guide before quick bids");
assert.match(rfxBidSource, /You enter: the all-in you want to keep/, "Carrier-share quick guidance should explain that the carrier rate is preserved");
assert.doesNotMatch(rfxBidSource.match(/function renderQuickLaneBidGridShell[\s\S]*?\n\}/)?.[0] || "", /commercialModelGuideHtml\(selectedRow\?\.commercial_model\)/, "Quick Bid Tools should not repeat the full commercial-model guide from the RFx Master Package");
assert.match(rfxBidSource, /function commercialModelSelectedContextHtml/, "Quick bids should explain the selected commercial model where the carrier enters the rate");
assert.match(rfxBidSource, /\$\{commercialModelSelectedContextHtml\(selectedRow\?\.commercial_model\)\}/, "Quick bid rows should render selected-model entry, Board, and fee context");
assert.match(rfxBidSource, /data-commercial-model-selected-context/, "Changing the quick-bid model should refresh the selected commercial explanation");
assert.match(rfxBidSource, /renderCarrierMasterPackage[\s\S]*?commercialModelGuideHtml\(\)/, "RFx Master Package should explain commercial models before a carrier enters Bid tools");
assert.match(rfxBidSource, /function commercialModelGuideHtml\(selectedModel = ""\)/, "Master Package commercial guidance should not preselect a commercial model");
assert.match(rfxBidSource, /Compare your carrier rate, Board price and fee/, "Carrier portal should explain commercial model consequences in the carrier language");
assert.match(rfxBidSource, /Your carrier rate does not change/, "Carrier-share guidance should explicitly preserve the carrier quoted price");
assert.match(rfxBidSource, /title="\$\{escapeAttribute\(commercialModelEffect\(model\)\)\}"/, "Each quick bid commercial selector should retain model guidance in a tooltip");
assert.match(rfxBidSource, /modelInput\.title = commercialModelEffect\(modelInput\.value\)/, "Changing a quick-bid model should refresh its tooltip guidance");
assert.match(rfxBidSource, /function renderQuickBidCommercialPreview/, "Commercial preview logic should remain available for detailed offer review");
assert.doesNotMatch(rfxBidSource.match(/function renderQuickLaneBidGridShell[\s\S]*?\n\}/)?.[0] || "", /data-quick-bid-commercial-preview/, "Quick Bid rows should not repeat Board-price preview text inside the compact route grid");
assert.match(rfxBidSource, /function syncQuickBidCommercialPresentation/, "Quick bid commercial guidance should update without rerendering the carrier route grid");
assert.match(rfxBidSource, /const row = quickCommercialModel\.closest\("\[data-quick-bid-row\]"\);[\s\S]*syncQuickBidCommercialPresentation\(row, \{ resetPercentage: true \}\);[\s\S]*rememberQuickBidDraft\(row, \{ localOnly: true \}\);/, "Changing the commercial model should reset only its percentage, refresh the preview, and retain the draft");
assert.match(rfxBidSource, /function commercialModelQuickEffect/, "Quick bid rows should use a concise commercial model summary while retaining detailed tooltip guidance");
assert.match(rfxBidSource, /function quickBidCommercialPercentLabel/, "Quick bid rows should label the commercial percentage according to the selected commercial model");
assert.match(rfxBidSource, /Invoice share %/, "Carrier share should make its invoice-share percentage explicit to carriers");
assert.match(rfxBidSource, /guide\.classList\.toggle\("is-selected"/, "Changing the quick bid model should visibly synchronize the active commercial guidance");
assert.match(stylesSource, /commercial-model-selected-context/, "Selected commercial model context should have compact responsive styling");
assert.doesNotMatch(rfxBidSource, /data-select-quick-bid-commercial-model/, "Quick bids should use their row selector as the only commercial-model control");
assert.match(rfxBidSource, /dualText\("Offer", "Oferta"\)/, "Quick bids should use a direct primary action instead of an abstract guided flow");
assert.match(rfxBidSource, /dualText\("Reject lane", "Rechazar ruta"\)/, "Quick bids should keep route rejection available in the compact route-actions menu");
// "Route 3 of 7" answered "where am I in the carousel". With every lane on
// screen the useful number is how many still need a price.
assert.match(rfxBidSource, /Faltan \$\{remaining\} de \$\{rows\.length\} por cotizar/, "The quick bid heading should show how many lanes still need a price");
assert.match(rfxBidSource, /All \$\{rows\.length\} lanes quoted/, "The quick bid heading should confirm when every lane is priced");
assert.match(stylesSource, /commercial-model-quick-guide article > button/, "Commercial guide tiles should be accessible interactive buttons");
assert.match(rfxBidSource, /function commercialModelEntryRule/, "Quick bids should tell carriers which price to enter for each commercial model");
assert.match(rfxBidSource, /You enter: your sell rate to XBF/, "The buy-sell option should distinguish the carrier sell rate from the board price");
assert.match(rfxBidSource, /Carrier rate", "Tarifa carrier/, "Quick bid grids should label the carrier-entered rate instead of a generic all-in price");
assert.match(rfxBidSource, /Carrier rate is required and must be greater than zero/, "The bid template instructions should explain the carrier-entered rate by commercial model");
assert.match(rfxBidSource, /rateInput\.title = config\.rateEntryHelp/, "Quick bid rate help should update with the selected commercial model");
assert.match(rfxBidSource, /const entryRule = commercialModelEntryRule\(row\.commercial_model\)/, "Empty quick bid previews should explain the expected rate by commercial model");
assert.match(rfxBidSource, /enter the all-in price you want to keep; Invoice share/, "The carrier XLSX template should explain which all-in amount belongs to carrier-share");
assert.doesNotMatch(rfxBidSource, /<details class="commercial-model-guide" open>/, "The full commercial model comparison should stay collapsed until the carrier requests it");
assert.match(stylesSource, /commercial-model-guide-grid/, "Carrier commercial model guidance should have compact responsive styling");
assert.match(stylesSource, /commercial-model-quick-guide/, "Carrier commercial model summary should have compact responsive styling");
assert.match(stylesSource, /commercial-rate-entry-help/, "Advanced bid price guidance should remain visually compact");
assert.match(stylesSource, /quick-bid-commercial-preview/, "Commercial row previews should remain compact inside the carrier quick-bid grid");
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
assert.match(rfxBidSource, /markQuickBidRowInvalid/, "Carrier portal should mark invalid fields on the inline lane row");
assert.match(rfxBidSource, /removeAttribute\("aria-invalid"\)/, "Carrier portal should clear invalid field markers as the carrier edits");
assert.match(rfxBidSource, /function updateBidReviewSummary/, "Carrier portal should update the review summary as carriers edit");
assert.match(rfxBidSource, /function renderBidHistory/, "Carrier portal should render offer revision history");
assert.match(rfxBidSource, /carrier-bid-history/, "Carrier portal should include offer history in the bid room");
assert.match(rfxBidSource, /data-edit-current-offer/, "Carrier portal should let carriers edit their submitted live offer row");
assert.match(rfxBidSource, /function hydrateBidFormFromOffer/, "Carrier portal should preload the bid form from the current submitted offer");
assert.match(rfxBidSource, /data-bid-submit-button/, "Carrier portal should relabel submit as update when a published offer exists");
// The retired editor used to ship as an inert <template>. A <template> never
// renders, so it was pure payload; it is now removed outright.
assert.doesNotMatch(rfxBidSource, /bid-editor-modal/, "The retired guided bid editor must not ship to carriers at all.");
assert.doesNotMatch(rfxBidSource, /id="bid-form"/, "The carrier portal must not render the legacy overlay bid form.");
assert.match(rfxBidSource, /function openBidEditor\(options = \{\}\)[\s\S]*?selectBidToolsLane/, "Legacy offer links should land in the selected inline lane bid.");
assert.match(rfxBidApiSource, /revisionType = bestFinal \? "best_final" : previousBidRate !== null \? "revision" : "initial"/, "Carrier portal API should classify repeated submitted bids as revisions");
assert.match(rfxBidSource, /carrier-quick-bid-grid/, "Carrier portal should render an inline editable lane bid grid");
assert.match(rfxBidSource, /data-save-quick-bid/, "Carrier portal should save or update bids directly from each lane row");
assert.match(rfxBidSource, /data-toggle-quick-bid-panel="alternative"/, "Carrier quick bid rows should expand a best-alternative panel inline");
assert.match(rfxBidSource, /data-toggle-quick-bid-panel="capacity"/, "Carrier quick bid rows should expand live-capacity details inline");
assert.match(rfxBidSource, /function toggleQuickBidPanel/, "Carrier quick bid details should expand without replacing the selected route context");
assert.match(rfxBidSource, /data-quick-bid-extra-field="unit_details"/, "Carrier quick bid rows should capture unit details with live capacity");
assert.match(rfxBidSource, /function saveQuickBidRow/, "Carrier portal should submit quick row edits through the tokenized bid API");
assert.match(rfxBidSource, /callBidApi\("submit_bid", \{ token: rowToken, \.\.\.draft \}\)/, "Carrier quick bid grid should submit the selected row token instead of forcing lane navigation");
assert.match(rfxBidSource, /const quickBidRowMutationKeys = new Set\(\);/, "Carrier quick bid rows should track row-level save mutations");
assert.match(rfxBidSource, /const mutationKey = `quick-bid:\$\{rowToken\}`;[\s\S]+if \(quickBidRowMutationKeys\.has\(mutationKey\)\) return;[\s\S]+quickBidRowMutationKeys\.add\(mutationKey\);[\s\S]+finally \{[\s\S]+quickBidRowMutationKeys\.delete\(mutationKey\);[\s\S]+\}/, "Carrier quick bid rows should ignore duplicate saves for the same invitation token");
assert.match(rfxBidApiSource, /notes: cleanText\(row\.notes\)/, "Carrier business book API should expose notes so quick row edits can preserve existing bid notes");
assert.match(rfxBidApiSource, /function carrierBusinessBook[\s\S]*rfx_event_id: cleanText\(row\.rfx_event_id\)[\s\S]*rfx_lane_id: cleanText\(row\.rfx_lane_id\)/, "Carrier business book rows should preserve flattened event and lane identifiers for reliable workspace routing.");
assert.match(rfxBidApiSource, /invitation_token_encrypted,[\s\S]*const hydratedInvitedRows = await hydrateInvitationTokens[\s\S]*carrier_book: carrierBusinessBook\(result\.data, hydratedInvitedRows/, "Private carrier books must hydrate every lane invitation token before rendering the active RFx book.");
assert.match(rfxBidSource, /data-decline-invitation/, "Carrier portal should let carriers reject an invited lane before bidding");
assert.match(rfxBidSource, /data-withdraw-offer/, "Carrier portal should let carriers withdraw an active published offer");
assert.match(rfxBidSource, /data-decline-quick-invitation/, "Carrier quick bid grid should expose lane-level rejection");
assert.match(rfxBidSource, /data-withdraw-quick-bid/, "Carrier quick bid grid should expose lane-level offer withdrawal");
assert.match(rfxBidSource, /data-open-quick-lane-fit/, "Carrier quick bid actions should open the selected lane fit without leaving Bid tools");
assert.match(rfxBidSource, /function closeQuickBidPanel\(rowElement\)/, "Carrier quick bid detail panels should close in place without resetting the route form");
assert.match(rfxBidSource, /data-close-quick-bid-panel/, "Alternative and live-capacity panels should expose a direct close action");
assert.match(rfxBidSource, /callBidApi\(action, \{ token: actionToken \}\)/, "Carrier reject and withdraw actions should use the selected invitation token");
assert.match(rfxBidSource, /const bidParticipationMutationKeys = new Set\(\);/, "Carrier reject and withdraw actions should track token-level mutations");
assert.match(rfxBidSource, /const mutationKey = `\$\{action\}:\$\{actionToken\}`;[\s\S]+if \(bidParticipationMutationKeys\.has\(mutationKey\)\) return;[\s\S]+bidParticipationMutationKeys\.add\(mutationKey\);[\s\S]+finally \{[\s\S]+bidParticipationMutationKeys\.delete\(mutationKey\);[\s\S]+\}/, "Carrier reject and withdraw actions should ignore duplicate clicks for the same token and action");
assert.match(rfxBidSource, /const segmentConfirmationSaveTimers = new Map\(\);/, "Carrier fit checklist should debounce autosaves independently by invited route");
assert.match(rfxBidSource, /const segmentConfirmationSavingTokens = new Set\(\);/, "Carrier fit checklist should guard duplicate saves per invited route");
assert.match(rfxBidSource, /if \(segmentConfirmationSavingTokens\.has\(saveKey\)\) \{[\s\S]+section\.dataset\.savePending = "true";[\s\S]+return;/, "Carrier fit checklist should queue a follow-up save when the same route is still saving");
assert.match(rfxBidSource, /segmentConfirmationSaveTimers\.set\(saveKey, timer\);/, "Carrier fit checklist should retain a debounce timer per invited route");
assert.match(rfxBidSource, /segmentConfirmationSavingTokens\.delete\(saveKey\);[\s\S]+delete section\.dataset\.saving;[\s\S]+if \(section\.dataset\.savePending === "true"\)/, "Carrier fit checklist should release each route save guard and persist edits made during a request");
assert.match(rfxBidSource, /function queueSegmentConfirmationSave\(section\) \{[\s\S]+window\.setTimeout\(\(\) => \{[\s\S]+saveSegmentConfirmations\(section\);[\s\S]+\}, 550\)/, "Carrier fit checklist should save after the carrier stops editing");
assert.match(rfxBidSource, /laneFitAnswer\.closest\("\[data-lane-fit-checklist\]"\)[\s\S]+queueSegmentConfirmationSave\(section\)/, "Carrier fit selections should trigger autosave without a Save button");
assert.match(rfxBidSource, /function selectBidToolsLane\(invitationToken, options = \{\}\)/, "Bid Tools should select a route locally");
assert.doesNotMatch(rfxBidSource.match(/function selectBidToolsLane[\s\S]*?\n\}/)?.[0] || "", /loadInvitation\(/, "Changing the Bid Tools route should not reload the private bid page");
assert.match(rfxBidSource, /ArrowLeft.*ArrowRight.*Home.*End/s, "Bid Tools route tabs must support direct keyboard navigation.");
assert.match(rfxBidSource, /function openBidEditor\(options = \{\}\) \{[\s\S]*?selectBidToolsLane\(invitationToken, \{[\s\S]*?focusQuickBid/, "Legacy offer entry points should redirect to the selected inline lane bid instead of opening a separate workflow.");
assert.doesNotMatch(rfxBidSource.match(/function openBidEditor[\s\S]*?\n\}/)?.[0] || "", /modal\.hidden\s*=\s*false/, "Legacy offer entry points must not reopen the modal editor.");
const quickBidGridShell = rfxBidSource.match(/function renderQuickLaneBidGridShell[\s\S]*?\n\}/)?.[0] || "";
assert.match(quickBidGridShell, /commercialModelSelectedContextHtml\(selectedRow\?\.commercial_model\)/, "Quick bids should keep the selected commercial-model context without repeating the full guide.");
assert.doesNotMatch(quickBidGridShell, /commercialModelQuickGuideHtml\(/, "Quick bids should use the row selector as the only commercial-model control.");
assert.match(quickBidGridShell, /quick-bid-more-actions/, "Bid Tools should group secondary route actions under one compact menu.");
assert.match(quickBidGridShell, /data-toggle-quick-bid-panel="alternative"/, "The compact route menu should preserve alternative offers.");
assert.match(quickBidGridShell, /data-toggle-quick-bid-panel="capacity"/, "The compact route menu should preserve live-capacity commitment.");
assert.match(quickBidGridShell, /data-withdraw-quick-bid[\s\S]*data-decline-quick-invitation/, "The compact route menu should preserve withdraw and reject states.");
assert.match(rfxBidApiSource, /body\.action === "decline_invitation" \|\| body\.action === "withdraw_bid"/, "Carrier portal API should expose separate reject and withdraw actions");
assert.match(rfxBidApiSource, /invitation_status: "declined"/, "Rejecting an invitation should persist a declined status");
assert.match(rfxBidApiSource, /invitation_status: "withdrawn"[\s\S]*bid_rate: null/, "Withdrawing an offer should remove the active bid rate while preserving history");
assert.match(rfxBidApiSource, /status: "withdrawn"/, "Withdrawing an offer should audit a withdrawn contact history event");
assert.match(rfxBidWithdrawnStatusMigration, /'withdrawn'/, "Bid Room status constraint should allow withdrawn offers");
assert.match(stylesSource, /quick-bid-actions/, "Carrier portal should keep direct route actions compact and discoverable.");
assert.match(stylesSource, /\.quick-bid-actions \{[\s\S]*flex-wrap: nowrap/, "Quick bid route actions should stay on one compact row and use the table scroll when needed");
assert.match(stylesSource, /lane-fit-disclosure/, "Carrier fit should stay inline and collapsible rather than open a separate workflow.");
// Renamed from bid-room-alert-feed when the hero was replaced by the carrier
// brief; the alert feed now lives inside that block.
assert.match(stylesSource, /bid-room-brief-feed/, "Carrier portal multimedia alerts should have compact styling inside the brief");
assert.match(stylesSource, /quick-bid-expand-panel/, "Carrier quick bid extras should use compact inline panels");
assert.match(stylesSource, /quick-bid-panel-close/, "Quick bid extras should expose a compact close control");
assert.match(stylesSource, /lane-fit-disclosure/, "Carrier route fit should render as a collapsible compact section");
assert.match(stylesSource, /bid-form \[aria-invalid="true"\]/, "Carrier portal should highlight invalid bid fields inline");
assert.match(stylesSource, /carrier-bid-history-list/, "Carrier portal offer history should have compact timeline styling");
assert.match(rfxBidApiSource, /function liveBoardRowScore/, "Carrier portal API should score bids for the live capacity marketplace");
assert.match(rfxBidApiSource, /marketplace_score/, "Carrier portal API should expose marketplace score");
assert.match(rfxBidApiSource, /score_bucket/, "Carrier portal API should expose marketplace score buckets");
assert.match(rfxBidApiSource, /price_signal/, "Carrier portal API should explain marketplace price signals");
assert.match(rfxBidApiSource, /bid_history: bidHistory/, "Carrier portal API should return lane-specific bid revision history");
assert.match(rfxBidApiSource, /if \(body\.refresh_only === true\)[\s\S]*current_book_row/, "Private Bid Room polling should expose a lightweight current-lane refresh response");
assert.ok(
  rfxBidApiSource.indexOf("if (body.refresh_only === true)") < rfxBidApiSource.indexOf("const invitedResult = ownerEmail"),
  "Private Bid Room polling must return before loading the full carrier business book"
);
assert.match(rfxBidSource, /refresh_only: true/, "Private Bid Room automatic refresh should request the lightweight API response");
assert.match(rfxBidSource, /data\.current_book_row && lastCarrierBook/, "Private Bid Room should merge the refreshed lane into its cached business book");
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
assert.match(apiSource, /incident_state: "active" \| "historical"/, "Observability events should distinguish active incidents from immutable history");
assert.match(apiSource, /const activeEvents = events\.filter\(\(event\) => event\.incident_state === "active"\)/, "Observability summary cards should count active incidents only");
assert.match(apiSource, /severity: auditSeverity\(row\),[\s\S]{0,120}incident_state: "historical"/, "Past API audit failures should remain visible as history instead of active incidents");
assert.match(apiSource, /const isResolved = communicationStatus === "resolved";[\s\S]{0,180}const needsReply = !isResolved/, "Resolved Bid Room threads should not remain active incidents only because they are unread");
assert.match(settingsHtml, /id="observability-state-filter"[\s\S]+value="active"/, "Observability should default to an active-incident view with history available on demand");
assert.match(settingsSource, /event\.incident_state === stateFilter/, "Observability state filtering should separate active incidents from history");
for (const tableName of ["saas_audit_log", "outreach_messages", "gmail_mailbox_connections", "google_chat_connections", "bid_room_chat_messages", "bid_room_chat_threads"]) {
  assert.match(apiSource, new RegExp(`\\.from\\("${tableName}"\\)`), `Observability should read ${tableName}`);
}
assert.match(apiSource, /"api\.error"/, "Rateware API should audit unhandled endpoint failures");
assert.match(apiSource, /sync_bid_room_event_thread/, "Bid Room should create an explicit Google Chat event thread");
assert.match(rfxEventsHtml, /rfx-chat-start-event-thread/, "Bid Room chat should expose a start event thread action");
assert.match(rfxEventsSource, /syncBidRoomEventThread/, "Bid Room UI should call the event thread sync action");
assert.match(rfxEventsSource, /function bidRoomHasEventGroupThread[\s\S]+thread_type === "event_group"/, "Bid Room should detect an existing event thread from its loaded snapshot");
assert.match(rfxEventsSource, /if \(!bidRoomHasEventGroupThread\(bidRoomChatThreads\)\)[\s\S]+ensureSelectedEventChatThread\(eventId, \{ silent: true \}\)/, "Bid Room should create an event thread only when the loaded snapshot does not already contain one");
assert.match(apiSource, /const \[eventLanes, loadedInvitationRows, benchmarkLoad, comparisonFx\] = await Promise\.all\(\[[\s\S]+fetchAllRfxLaneRows[\s\S]+fetchAllRfxLaneVendorRows[\s\S]+fetchRfxDetailBenchmarkRates[\s\S]+loadBidComparisonFxRate/, "Bid Room detail should load lanes, invitations, Rateware benchmarks, and the comparison FX rate concurrently");

// The Google Sheet import used to delete every vendor from the sheet tab before
// re-inserting. vendors has eleven ON DELETE CASCADE children, so each re-sync
// silently destroyed those carriers' invitations, bids and quotes.
assert.doesNotMatch(apiSource, /from\("vendors"\)\s*\n\s*\.delete\(\)/, "Vendor import must never delete carriers before re-inserting them");
assert.match(apiSource, /function vendorNaturalKey/, "Vendor imports should resolve carriers by a stable natural key");
assert.match(apiSource, /function resolveVendorImportRows/, "Vendor imports should match existing carriers before writing");
// Name alone would merge distinct divisions that quote separately.
assert.match(apiSource, /\$\{name\}\|\$\{domain \|\| email\}/, "The carrier key must include domain (or email) so same-named divisions stay separate");
assert.match(apiSource, /VENDOR_IMPORT_PRESERVED_FIELDS/, "A re-import must not reset CRM workflow fields the spreadsheet does not carry");
assert.doesNotMatch(apiSource, /const result = await supabase\.from\("vendors"\)\.insert\(rows\)\.select\(\)/, "import_vendors must upsert, not blind-insert");

// Offers quoted in different currencies were once ranked by their bare number,
// so 3,000 USD beat 53,000 MXN as "lowest". Every cross-row comparison must go
// through the converted amount.
assert.match(rfxEventsSource, /function comparableBidAmount/, "Bid Room should convert offers before comparing them");
assert.match(rfxEventsSource, /function compareBidRows/, "Bid Room should have one currency-aware comparator");
assert.doesNotMatch(rfxEventsSource, /a\.amount - b\.amount/, "Bid Room must not sort offers by their raw, unconverted amount");
assert.doesNotMatch(rfxEventsSource, /a\.numeric_bid - b\.numeric_bid/, "Bid Room must not sort lane bids by their raw, unconverted amount");
assert.match(rfxEventsSource, /const amount = decisionNumber\(row\.comparable_amount\)/, "Bid scoring should price offers from the converted amount");
assert.match(rfxEventsSource, /comparable !== null && comparable === context\.lowestAmount/, "The Lowest badge should be decided on converted amounts");
assert.match(rfxEventsSource, /riskFlags\.push\("Currency not comparable"\)/, "An offer that cannot be converted should be flagged, not silently unscored");
assert.match(apiSource, /\.eq\("currency_pair", "USD\/MXN"\)[\s\S]*?\.lte\("rate_date", today\)[\s\S]*?\.order\("rate_date", \{ ascending: false \}\)/, "Comparison FX should resolve the newest rate at or before today");
assert.match(apiSource, /rfx_benchmark_candidate_rate_ids/, "Bid Room detail should request lane-scoped Rateware benchmark candidates");
assert.match(apiSource, /fetchRateRowsForIds\(supabase, ids, RFX_DETAIL_BENCHMARK_COLUMNS/, "Bid Room detail should load only the selected candidate rows");
assert.doesNotMatch(apiSource, /RFX_DETAIL_BENCHMARK_RATE_LIMIT = 5000/, "Bid Room detail should not transfer a fixed 5,000-row benchmark sample");
assert.match(bidRoomBenchmarkCandidateMigration, /function public\.rfx_benchmark_candidate_rate_ids/, "Bid Room benchmark candidate RPC should exist");
assert.match(bidRoomBenchmarkTuningMigration, /rateware_bi_rate_facts/, "Bid Room benchmark candidates should use the compact BI fact projection");
assert.match(bidRoomBenchmarkTuningMigration, /drop function if exists public\.rateware_rfx_lane_rate_score/, "The expensive row-by-row benchmark scorer should be removed");
assert.match(apiSource, /body\.action === "list_rfx_event_context"[\s\S]+listRfxEventContext\(supabase, user, event\)/, "Bid Room should expose one workspace-scoped secondary context action");
assert.match(apiSource, /const RFX_EVENT_CONTEXT_OUTREACH_LIMIT = 2000;[\s\S]+async function listRfxEventOutreachSnapshot[\s\S]+\.range\(0, RFX_EVENT_CONTEXT_OUTREACH_LIMIT\)/, "Bid Room initial outreach context should have a fixed payload ceiling");
assert.match(apiSource, /async function listRfxEventContext[\s\S]+Promise\.allSettled\(\[[\s\S]+listRfxResponseVendorIds[\s\S]+listRfxEventOutreachSnapshot[\s\S]+listBidRoomChat/, "Bid Room secondary context should load responses, bounded outreach, and chat concurrently");
assert.match(apiSource, /outreach_messages_limited[\s\S]+outreach_message_limit/, "Bid Room should report when its initial outreach snapshot is limited");
assert.match(rfxEventsSource, /requestRfxEventResource\([\s\S]+rfxEventContextRequests[\s\S]+fetchRfxEventContext\(eventId\)/, "Bid Room should fetch secondary event context with one deduplicated request");
assert.doesNotMatch(rfxEventsSource.match(/async function loadDetail[\s\S]+?\n}\n\nfunction activateWorkbenchView/)?.[0] || "", /await loadDraftQueuePage/, "Bid Room core detail should not wait for Draft Queue pagination");
assert.match(rfxEventsSource, /if \(rfxLaunchWorkspace === "delivery"\)[\s\S]+void loadDraftQueuePage/, "Bid Room should defer Draft Queue loading until Delivery is active");
assert.match(apiSource, /already_synced: true/, "Google Chat event thread sync should be idempotent once synced");
assert.match(apiSource, /sendOutreachMessages/, "API should send selected outreach messages through Gmail");
assert.match(apiSource, /delete_outreach_messages/, "API should delete selected outreach draft rows");
assert.match(apiSource, /mark_outreach_messages/, "API should allow manual status updates for outreach rows");
assert.match(apiSource, /normalizeOutreachChannel/, "Outreach channel filters should be validated when performing mixed-channel bulk actions");
assert.match(apiSource, /skipped_rows/, "Outreach bulk actions should return skipped-row telemetry with reasons");
assert.match(apiSource, /OUTREACH_MARK_TRANSITIONS/, "Outreach status transitions should be constrained by allowed state graph");
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
assert.match(emailBounceResolutionMigration, /resolved_at timestamptz/, "Email bounce corrections should preserve a resolved timestamp");
assert.match(apiSource, /body\.action === "replace_bounced_vendor_email"/, "Rateware API should safely replace bounced vendor emails");
assert.match(apiSource, /\.is\("resolved_at", null\)/, "Suppressed email lookups should ignore resolved delivery failures");
assert.match(apiSource, /const candidates = normalizeEmailList\(directLines\)/, "Bounce parsing should only use explicit failed recipients");
assert.match(apiSource, /replacementEmail !== rawReplacementEmail/, "Bounce resolution should reject email text that contains anything beyond the replacement address");
assert.doesNotMatch(apiSource, /normalizeEmailList\(directLines \|\| bodyText\)/, "Bounce parsing should not suppress addresses merely mentioned in a delivery notice body");
assert.match(vendorServiceSource, /replaceBouncedVendorEmail/, "Vendor service should expose bounce email replacement");
assert.match(vendorsSource, /data-replace-bounced-email/, "Vendor drawer should let users replace an undeliverable email");
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
assert.match(uploadCenterSource, /let uploadCenterSubmitting = false;/, "Upload Center should block duplicate source-file submissions");
assert.match(uploadCenterSource, /if \(uploadCenterSubmitting\) return;/, "Upload Center should ignore duplicate in-flight uploads");
assert.match(uploadCenterSource, /uploadCenterSubmitting = false;[\s\S]+uploadButton\.disabled = false;/, "Upload Center should restore upload controls after upload completion");
assert.match(uploadCenterSource, /let uploadTemplateDownloading = false;/, "Upload Center should block duplicate template downloads");
assert.match(uploadCenterSource, /if \(uploadTemplateDownloading\) return;/, "Upload Center should ignore duplicate template download clicks");
assert.match(uploadCenterSource, /let vendorOptionsLoadVersion = 0;/, "Upload Center vendor options should ignore stale loads");
assert.match(uploadCenterSource, /loadVersion !== vendorOptionsLoadVersion/, "Upload Center should suppress stale vendor dropdown responses");
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
assert.match(apiSource, /fetchSqlRateFilterValues\(supabase, filterPayload, field, valueSearch, limit, user\.owner_email\)/, "SQL filter value menus should stay inside the active workspace");
assert.match(apiSource, /p_owner_email: scopedOwnerEmail/, "RPC filter value menus should stay inside the active workspace");
assert.match(workspaceRateFilterValuesMigration, /p_owner_email text default null/, "workspace filter value RPC should require an owner scope parameter");
assert.match(workspaceRateFilterValuesMigration, /lower\(trim\(rs\.owner_email\)\) = lower\(trim\(p_owner_email\)\)/, "workspace filter value RPC should only enumerate the active workspace rows");
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
assert.match(rfxBidHtml, /id="bid-support-agent"/, "Private Bid Room should render a contextual support agent in the header");
assert.match(rfxBidSource, /function askBidSupport/, "Private Bid Room should call the support agent");
assert.match(rfxBidSource, /let bidSupportSubmitting = false;/, "Private Bid Room support should block duplicate assistant and ticket submits");
assert.match(rfxBidSource, /if \(bidSupportSubmitting\) return;/, "Private Bid Room support should ignore duplicate in-flight submits");
assert.match(rfxBidSource, /finally \{[\s\S]+bidSupportSubmitting = false;[\s\S]+#bid-support-form button/, "Private Bid Room support should restore controls after submit");
assert.match(rfxBidSource, /function setBidSupportOpen/, "Private Bid Room support should open as a chat pop-up");
assert.match(rfxBidSource, /data-bid-support-toggle/, "Private Bid Room support should have a floating chat launcher");
assert.match(rfxBidSource, /supportAnswer/, "Private Bid Room support should trigger multimedia support replies");
assert.match(rfxBidSource, /Ask about this opportunity/, "Private support should describe opportunity-level help, not only one bid");
assert.match(rfxBidSource, /Opportunity summary/, "Private support should include an opportunity summary prompt");
assert.match(rfxBidSource, /function setCarrierChatOpen/, "Private Bid Room chat should open as a pop-up");
assert.match(rfxBidSource, /let carrierChatSubmitting = false;/, "Private Bid Room chat should block duplicate message sends");
assert.match(rfxBidSource, /if \(carrierChatSubmitting\) return;/, "Private Bid Room chat should ignore duplicate in-flight sends");
assert.match(rfxBidSource, /finally \{[\s\S]+carrierChatSubmitting = false;[\s\S]+message\.disabled = false/, "Private Bid Room chat should restore the composer after send");
assert.match(rfxBidSource, /data-carrier-chat-toggle/, "Private Bid Room chat should have a floating chat launcher");
assert.match(rfxBidSource, /const laneAccessRequestMutationKeys = new Set\(\);/, "Private Bid Room marketplace access requests should be keyed per lane");
assert.match(rfxBidSource, /laneAccessRequestMutationKeys\.has\(laneId\)/, "Private Bid Room should ignore duplicate lane access requests");
assert.match(rfxBidSource, /finally \{[\s\S]+laneAccessRequestMutationKeys\.delete\(laneId\)/, "Private Bid Room should release lane access request locks");
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
assert.match(bidRoomBoardSource, /let publicSupportSubmitting = false;/, "Public Bid Room support should block duplicate assistant and ticket submits");
assert.match(bidRoomBoardSource, /if \(publicSupportSubmitting\) return;/, "Public Bid Room support should ignore duplicate in-flight submits");
assert.match(bidRoomBoardSource, /finally \{[\s\S]+publicSupportSubmitting = false;[\s\S]+#public-board-support-form button/, "Public Bid Room support should restore controls after submit");
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
assert.match(vendorSupportSource, /refreshButton\) refreshButton\.disabled = true;/, "Vendor Support should disable refresh while loading tickets");
assert.match(vendorSupportSource, /supportBody\?\.setAttribute\("aria-busy", "true"\)/, "Vendor Support should expose loading state to assistive technology");
assert.match(vendorSupportSource, /finally \{[\s\S]+if \(loadVersion !== supportLoadVersion\) return;[\s\S]+refreshButton\) refreshButton\.disabled = false;[\s\S]+supportBody\?\.removeAttribute\("aria-busy"\)/, "Vendor Support should restore refresh and busy state after the current load finishes");
assert.match(vendorSupportSource, /const supportTicketMutationQueues = new Map\(\)/, "Vendor Support should serialize updates per ticket");
assert.match(vendorSupportSource, /supportTicketMutationVersions\.get\(id\) === mutationVersion/, "Vendor Support should suppress stale mutation status updates");
assert.match(vendorSupportSource, /function setTicketRowBusy\(id, busy = false\)/, "Vendor Support should mark a ticket row busy while updating it");
assert.match(vendorSupportSource, /row\.querySelectorAll\("\[data-support-action\], \[data-support-field\]"\)[\s\S]+control\.disabled = busy/, "Vendor Support should disable per-ticket controls during a mutation");
assert.match(vendorSupportSource, /setTicketRowBusy\(id, true\)[\s\S]+finally \{[\s\S]+setTicketRowBusy\(id, false\)/, "Vendor Support should restore per-ticket controls after mutation queues finish");
assert.match(vendorSupportServiceSource, /list_vendor_support_tickets/, "Vendor Support service should call the ticket listing action");
assert.match(vendorSupportServiceSource, /update_vendor_support_ticket/, "Vendor Support service should call the ticket update action");
assert.match(vendorsHtml, /drawer-vendor-support/, "Vendor profile drawer should include a Vendor Support section");
assert.match(vendorsSource, /loadDrawerVendorSupport/, "Vendor drawer should load carrier-specific support tickets");
assert.match(vendorsSource, /updateVendorSupportTicket/, "Vendor drawer should update support ticket statuses without reloading the CRM");
assert.match(vendorsHtml, /drawer-vendor-relationship/, "Vendor profile drawer should include the linked carrier relationship activity");
assert.match(vendorsSource, /loadDrawerVendorRelationship/, "Vendor drawer should load linked support, CI, and Bid Room activity");
assert.match(vendorServiceSource, /get_vendor_relationship_activity/, "Vendor service should request the unified carrier activity endpoint");
assert.match(apiSource, /async function getVendorRelationshipActivity/, "Rateware API should aggregate carrier relationship activity");
assert.match(apiSource, /\.eq\("vendor_id", vendorId\)/, "Carrier relationship activity should be scoped to one vendor");
assert.match(apiSource, /\.eq\("owner_email", user\.owner_email\)/, "Carrier relationship activity should stay isolated by workspace owner");
assert.match(apiSource, /bid_room_chat_threads/, "Carrier relationship activity should include Bid Room conversations");
assert.match(apiSource, /vendor_improvement_cases/, "Carrier relationship activity should include Vendor CI cases");
assert.match(platform55ShellModelSource, /path: "\.\/vendor-support\.html"/, "Dashboard navigation should include Vendor Support");
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
assert.match(apiSource, /async function refreshVendorValueCurve/, "Vendor CI should recalculate the Value Curve for the full CRM");
assert.match(apiSource, /body\.action === "refresh_vendor_value_curve"/, "Rateware API should expose a Value Curve refresh action");
assert.match(apiSource, /vendor_ci\.value_curve_refreshed/, "Value Curve refresh should be auditable");
assert.match(apiSource, /chunkValues\(rows, 250\)/, "Value Curve refresh should persist all carrier scorecards in bounded batches");
assert.match(apiSource, /const manualWeight = manualOverride \? 0\.35 : 0/, "Automatic scorecards should not blend stale cached scores");
assert.match(apiSource, /auto_seeded: !manualOverride/, "Value Curve refresh should distinguish live scores from manual overrides");
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
assert.match(vendorImprovementSource, /refreshVendorValueCurve/, "Vendor CI UI should request a full Value Curve recalculation");
assert.match(vendorImprovementHtml, /Recalculate Value Curve/, "Vendor CI should make the full Value Curve refresh explicit");
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
assert.match(vendorImprovementSource, /const matchingRows = rows;/, "Vendor CI should preserve valid server-side CRM matches when rendering");
assert.match(vendorImprovementSource, /sequence !== vendorSearchSequence/, "Vendor CI vendor search should not render older searches over newer input");
assert.match(vendorImprovementSource, /let improvementLoadVersion = 0;/, "Vendor CI case filters should version concurrent loads");
assert.match(vendorImprovementSource, /loadVersion !== improvementLoadVersion/, "Vendor CI should ignore stale case responses");
assert.match(vendorImprovementSource, /if \(createCaseRunning\) return;/, "Vendor CI should prevent duplicate case creation");
assert.match(vendorImprovementSource, /let valueCurveRefreshRunning = false;/, "Vendor CI Value Curve refresh should have a running guard");
assert.match(vendorImprovementSource, /if \(valueCurveRefreshRunning\) return;/, "Vendor CI Value Curve refresh should ignore duplicate refresh requests");
assert.match(vendorImprovementSource, /finally \{[\s\S]+valueCurveRefreshRunning = false;[\s\S]+if \(refreshButton\) refreshButton\.disabled = false;/, "Vendor CI Value Curve refresh should restore its guard and button state");
assert.match(vendorImprovementSource, /let ciReminderRunRunning = false;/, "Vendor CI due reminders should have a running guard");
assert.match(vendorImprovementSource, /if \(ciReminderRunRunning\) return;/, "Vendor CI due reminders should ignore duplicate reminder runs");
assert.match(vendorImprovementSource, /finally \{[\s\S]+ciReminderRunRunning = false;[\s\S]+if \(runRemindersButton\) runRemindersButton\.disabled = false;/, "Vendor CI reminders should restore their guard and button state");
assert.match(vendorImprovementSource, /const improvementCaseMutationQueues = new Map\(\)/, "Vendor CI should serialize updates per case");
assert.match(vendorImprovementSource, /improvementCaseSubmissionIds\.has\(id\)/, "Vendor CI should prevent duplicate carrier submissions");
assert.match(vendorImprovementSource, /function setCaseRowBusy\(id, busy = false\)/, "Vendor CI should mark a case row busy while mutating it");
assert.match(vendorImprovementSource, /row\.querySelectorAll\("\[data-ci-case-action\], \[data-ci-case-field\],[\s\S]+control\.disabled = busy/, "Vendor CI should disable case row controls during mutations");
assert.match(vendorImprovementSource, /setCaseRowBusy\(id, true\)[\s\S]+finally \{[\s\S]+setCaseRowBusy\(id, false\)/, "Vendor CI update mutations should restore case row controls");
assert.match(vendorImprovementSource, /async function recordCaseResponse\(rowElement, caseId\) \{[\s\S]+improvementCaseSubmissionIds\.has\(caseId\)[\s\S]+setCaseRowBusy\(caseId, true\)[\s\S]+finally \{[\s\S]+setCaseRowBusy\(caseId, false\)/, "Vendor CI response recording should reject duplicates and restore case row controls");
assert.match(vendorImprovementSource, /async function closeCase\(rowElement, caseId\) \{[\s\S]+improvementCaseSubmissionIds\.has\(caseId\)[\s\S]+setCaseRowBusy\(caseId, true\)[\s\S]+finally \{[\s\S]+setCaseRowBusy\(caseId, false\)/, "Vendor CI closure should reject duplicates and restore case row controls");
assert.match(vendorImprovementSource, /scorecardMutationIds\.has\(vendorId\)/, "Vendor CI should prevent duplicate scorecard saves");
assert.doesNotMatch(vendorImprovementSource, /fetchVendors\(\{ base_stage: "procurement"/, "Vendor CI create-case picker should not be limited to Procurement vendors");
assert.match(apiSource, /async function buildVendorValueCurve/, "Vendor CI API should compute the carrier value curve from all CRM vendors");
assert.match(apiSource, /async function fetchVendorCiSignalRows[\s\S]+for \(let offset = 0; offset < VENDOR_CI_SIGNAL_MAX_ROWS; offset \+= VENDOR_CI_SIGNAL_PAGE_SIZE\)[\s\S]+fetchPage\(offset, VENDOR_CI_SIGNAL_PAGE_SIZE\)/, "Vendor CI signals should page through the full workspace instead of stopping at a fixed sample");
const vendorValueCurveSource = apiSource.slice(apiSource.indexOf("async function buildVendorValueCurve"), apiSource.indexOf("async function refreshVendorValueCurve"));
assert.doesNotMatch(vendorValueCurveSource, /\.limit\(10000\)/, "Vendor CI value scoring must not silently cap Bid Room, contact, chat, or CI signals");
assert.match(vendorValueCurveSource, /fetchVendorRateMetricsSafe\(supabase, user, \{[\s\S]+vendorIds: vendors\.map/, "Vendor CI value curve should include page-scoped Rateware quote signals");
assert.match(apiSource, /\.from\("rfx_lane_vendors"\)/, "Vendor CI value curve should include Bid Room participation and award signals");
assert.match(apiSource, /\.from\("contact_history"\)/, "Vendor CI value curve should include support and outreach signals");
assert.match(apiSource, /\.from\("bid_room_chat_messages"\)/, "Vendor CI value curve should include carrier chat participation signals");
assert.match(vendorImprovementServiceSource, /list_vendor_improvement_cases/, "Vendor CI service should call the listing action");
assert.match(vendorImprovementServiceSource, /create_vendor_improvement_case/, "Vendor CI service should call the create action");
assert.match(vendorImprovementServiceSource, /submit_vendor_improvement_case/, "Vendor CI service should call the email submit action");
assert.match(vendorImprovementServiceSource, /process_vendor_ci_reminders/, "Vendor CI service should call the reminder processor action");
assert.match(vendorImprovementServiceSource, /refresh_vendor_value_curve/, "Vendor CI service should call the Value Curve refresh action");
assert.match(platform55ShellModelSource, /path: "\.\/vendor-improvement\.html"/, "Dashboard navigation should include Vendor CI");
assert.match(apiSource, /const invitationIdChunks = invitationIds\.length \? chunkValues\(invitationIds, 100\) : \[\[\]\]/, "Outreach draft generation should read selected invitations in small id batches");
assert.match(apiSource, /label: "RFx invitation ids", limit: 5000/, "Outreach draft generation should support large carrier waves without unbounded requests");
assert.match(apiSource, /mapWithConcurrency\(invitationIdChunks, 4/, "Outreach draft generation should load invitation batches with bounded concurrency");
assert.match(apiSource, /mapWithConcurrency\(chunkValues\(dailyLimitedRows, 100\), 4/, "Outreach draft generation should upsert daily-capped draft messages in bounded batches");
assert.match(apiSource, /generated: generatedMessages\.length,[\s\S]+rows: \[\]/, "Outreach draft generation should avoid returning large HTML draft payloads");
assert.match(apiSource, /function outreachLaneTableSignature/, "Outreach draft generation should fingerprint the current Business Book route table");
assert.match(apiSource, /lane_table_signature: context\.lane_table_signature/, "Outreach drafts should persist the Business Book route-table signature in metadata");
assert.match(apiSource, /const completeInvitationGroups = new Map/, "Outreach draft generation should hydrate complete event/vendor lane groups before rendering templates");
assert.match(apiSource, /const invitations = await requireHydratedRfxInvitationTokens\([\s\S]+invitationBatches\.flat\(\)[\s\S]+"Outreach queue"/, "Outreach draft generation should decrypt selected invitation tokens before grouping carriers");
assert.match(apiSource, /const completeInvitations = await requireHydratedRfxInvitationTokens\([\s\S]+completeBatches\.flat\(\)[\s\S]+"Outreach lane hydration"/, "Outreach draft generation should decrypt every expanded route-book invitation before rendering the email");
assert.match(apiSource, /async function ensureRfxEventVendorCoverage/, "Outreach draft generation should complete selected carrier coverage across the event business book");
assert.match(apiSource, /body\.action === "list_rfx_detail"[\s\S]+ensureRfxEventVendorCoverage/, "Opening an active RFx should repair incomplete carrier lane coverage before rendering the business book");
assert.match(apiSource, /async function fetchAllRfxLaneRows[\s\S]+fetchAllRfxEventRows\(supabase, "rfx_lanes"/, "RFx lane reads should paginate beyond the Supabase response limit");
assert.match(apiSource, /async function fetchApprovedRateRows[\s\S]+\.eq\("owner_email", user\.owner_email\)[\s\S]+\.range\(offset, offset \+ pageSize - 1\)/, "Bid Room benchmarks must stay tenant-isolated and paginate every approved rate");
assert.match(apiSource, /function vendorSearchClauses[\s\S]+legal_name\.ilike[\s\S]+secondary_emails\.cs/, "Carrier CRM search should cover legal names and exact secondary email addresses server-side");
assert.match(apiSource, /async function fetchBusinessIntelligenceRows[\s\S]+\.eq\("owner_email", user\.owner_email\)/, "Analyze must scope Rateware signals to the authenticated workspace");
const dashboardSummarySource = apiSource.slice(apiSource.indexOf('if (body.action === "dashboard_summary")'), apiSource.indexOf('if (body.action === "book_audit")'));
assert.match(dashboardSummarySource, /raw_uploads[\s\S]+\.eq\("owner_email", user\.owner_email\)/, "Dashboard upload counts must remain workspace-scoped");
assert.match(dashboardSummarySource, /rate_staging[\s\S]+\.eq\("owner_email", user\.owner_email\)/, "Dashboard rate counts must remain workspace-scoped");
const bookAuditSource = apiSource.slice(apiSource.indexOf('if (body.action === "book_audit")'), apiSource.indexOf('if (body.action === "list_vendor_unmatched_ids")'));
assert.match(bookAuditSource, /const approvedHead = \(\) =>[\s\S]+\.eq\("owner_email", user\.owner_email\)/, "Ratebook audit counts must remain workspace-scoped");
assert.match(apiSource, /async function fetchAllOwnedRfxEvents[\s\S]+\.range\(offset, offset \+ RFX_EVENT_CHILD_PAGE_SIZE - 1\)/, "RFx event reads should paginate beyond the Supabase response limit");
assert.match(apiSource, /async function fetchAllOwnedRfxPackages[\s\S]+\.range\(offset, offset \+ RFX_EVENT_CHILD_PAGE_SIZE - 1\)/, "Ratebook package reads should paginate beyond the Supabase response limit");
assert.match(apiSource, /async function fetchAllOwnedRfxRatebooks[\s\S]+\.range\(offset, offset \+ RFX_EVENT_CHILD_PAGE_SIZE - 1\)/, "Persisted Ratebook reads should paginate instead of using oversized package filters");
assert.match(apiSource, /async function fetchAllRatebookPackageRows[\s\S]+chunkValues\(ids, RATEBOOK_PACKAGE_QUERY_CHUNK_SIZE\)/, "Ratebook lanes and segments should load in bounded package batches");
assert.match(apiSource, /async function fetchAllRatebookShares[\s\S]+chunkValues\(ids, RATEBOOK_PACKAGE_QUERY_CHUNK_SIZE\)/, "Ratebook share counts should load in bounded Ratebook batches");
assert.match(apiSource, /async function getOwnedRatebookPackage[\s\S]+fetchAllRatebookPackageRows\(supabase, "rfx_package_lanes"[\s\S]+fetchAllRatebookPackageRows\(supabase, "rfx_package_segments"/, "A Ratebook detail should hydrate every package lane and segment instead of trusting the first PostgREST page");
assert.match(apiSource, /async function fetchAllBidRoomDemandLanes[\s\S]+\.range\(offset, offset \+ RFX_EVENT_CHILD_PAGE_SIZE - 1\)/, "Bid Room Ratebook synchronization should page through all previously materialized demand lanes");
assert.match(apiSource, /async function ensureRatebookForBidRoomEvent[\s\S]+fetchAllRfxLaneRows\(supabase, cleanText\(event\.id\) \|\| "", "\*"\)/, "Bid Room Ratebook materialization should include every event lane beyond the default response limit");
const getRatebookSource = apiSource.slice(apiSource.indexOf("async function getRatebook("), apiSource.indexOf("async function getRatebookRouteQuotes"));
assert.match(getRatebookSource, /fetchAllRfxLaneRows/, "Ratebook detail should hydrate every source event lane");
assert.match(getRatebookSource, /fetchAllRfxLaneVendorRows/, "Ratebook detail should hydrate every carrier-lane response");
assert.match(getRatebookSource, /fetchAllRatebookShares/, "Ratebook detail should hydrate every carrier share");
assert.match(getRatebookSource, /fetchAllRatebookRowsByRatebookIds[\s\S]+rfx_ratebook_carrier_quotes/, "Ratebook detail should hydrate every submitted carrier quote");
assert.match(getRatebookSource, /fetchAllOutreachMessagesByCampaignIds/, "Ratebook distribution history should paginate every campaign message");
assert.match(apiSource, /body\.action === "list_rfx_events"[\s\S]+fetchAllOwnedRfxEvents\(supabase, user\.owner_email\)[\s\S]+fetchAllRfxEventRows\(supabase, "rfx_lanes"/, "RFx event counts should use all events and lanes, not only the first response page");
assert.match(apiSource, /findBidRoomEventsForShipper[\s\S]+fetchAllOwnedRfxEvents\(supabase, user\.owner_email, selectColumns, \{ includeArchived: true \}\)/, "Shipper CRM should associate every matching Bid Room event, including historical events, instead of capped term searches");
assert.match(apiSource, /async function syncBidRoomEventsForRatebookScope[\s\S]+fetchAllOwnedRfxEvents/, "Ratebook consolidation should inspect all eligible Bid Room events, not a fixed first page");
assert.match(apiSource, /async function syncBidRoomEventsForRatebookScope[\s\S]+mapWithConcurrency\(eligibleEvents, RATEBOOK_SYNC_CONCURRENCY/, "Ratebook event sync should use bounded concurrency instead of serializing a full workspace");
assert.match(apiSource, /async function syncBidRoomEventsForRatebookScope[\s\S]+failed,[\s\S]+rows:/, "A failed Bid Room source should be isolated instead of blocking every Ratebook");
assert.match(apiSource, /async function listRatebooks[\s\S]+fetchAllOwnedRfxPackages/, "Ratebook listing should not truncate consolidated packages at a fixed UI limit");
assert.match(apiSource, /async function listRatebooks[\s\S]+fetchAllRatebookPackageRows[\s\S]+fetchAllOwnedRfxRatebooks[\s\S]+fetchAllRatebookShares/, "Ratebook consolidation should avoid oversized filters for routes, books, and share counts");
const getShipperAccountSource = apiSource.slice(apiSource.indexOf('if (body.action === "get_shipper")'), apiSource.indexOf('if (body.action === "create_shipper_profile_request")'));
assert.match(getShipperAccountSource, /listRatebooks\(supabase, user, \{[\s\S]+shipper_id: shipperId/, "Shipper CRM should reuse the bounded canonical Ratebook synchronization path");
assert.match(getShipperAccountSource, /skip_bid_room_sync: true[\s\S]+skip_materialization: true/, "Shipper CRM account reads should not rematerialize Ratebooks on every drawer open");
assert.doesNotMatch(getShipperAccountSource, /mapWithConcurrency\(bidRoomEvents/, "Shipper CRM should not repeat a separate workspace-wide Bid Room synchronization pass");
assert.match(apiSource, /const eventKeys = \[[\s\S]+catalogKey\(event\.customer\),[\s\S]+catalogKey\(event\.name\)/, "Shipper CRM event matching should inspect both customer and event name");
assert.match(apiSource, /coverage_sync: \{ inserted: coverageInserted \}/, "RFx detail should report whether lane coverage was repaired");
assert.match(apiSource, /async function fetchAllRfxLaneVendorRows[\s\S]+\.range\(offset, offset \+ RFX_LANE_VENDOR_PAGE_SIZE - 1\)/, "RFx participant reads should paginate beyond the Supabase 1000-row response limit");
assert.match(apiSource, /body\.action === "list_rfx_detail"[\s\S]+fetchAllRfxLaneVendorRows\(supabase, event\.id, invitationColumns\)/, "RFx detail should hydrate every carrier-lane row before grouping bids by lane");
assert.match(apiSource, /async function ensureRfxEventVendorCoverage[\s\S]+fetchAllRfxLaneVendorRows/, "RFx coverage repair should compare against every existing carrier-lane row");
assert.match(apiSource, /Query by event instead of sending hundreds of vendor ids/, "RFx detail coverage repair should avoid oversized vendor-id filters");
assert.doesNotMatch(apiSource, /async function ensureRfxEventVendorCoverage[\s\S]+?\.in\("vendor_id", uniqueVendorIds\)/, "RFx detail coverage repair must not send the full audience as a PostgREST in-filter");
assert.match(apiSource, /outreachEventLaneRows\(eventLaneRows, invitationGroup\)/, "Outreach drafts should render every active event lane in the carrier business book");
assert.match(apiSource, /fetchAllRfxLaneRows\(supabase, cleanText\(event\.id\) \|\| "", "\*"\)[\s\S]+const routeBookRows = outreachEventLaneRows/, "Targeted Bid Room follow-up emails should load the complete paginated Business Book");
assert.match(apiSource, /const eventLaneCount = eventLaneRows\.length/, "Outreach audience should know the total event lane count");
assert.match(apiSource, /requestedGroupKeys\.has\(key\)/, "Outreach draft generation should only expand lane groups for requested event/vendor participants");
assert.match(apiSource, /\.in\("vendor_id", vendorChunk\)[\s\S]+\.range\(offset, offset \+ 999\)/, "Outreach lane hydration should paginate only the requested carriers instead of scanning the full event");
assert.match(apiSource, /sortRfxInvitationGroup\(completeInvitationGroups\.get\(groupKey\) \|\| requestedInvitationGroup\)/, "Outreach drafts should render stable complete route tables per carrier");
assert.match(apiSource, /const protectedStatuses = new Set\(\["queued", "sending", "sent", "delivered", "read", "replied", "delivery_unknown", "failed", "bounced", "manual_sent", "archived"\]\)/, "Outreach regeneration must preserve messages that already moved beyond draft state, including failed rows awaiting correction");
assert.match(apiSource, /function outreachEventDedupeKey/, "Outreach queue generation should dedupe historical messages by RFx, channel, and carrier contact");
assert.match(apiSource, /OUTREACH_DO_NOT_AUTO_REQUEUE_STATUSES/, "Outreach queue generation should not automatically requeue sent, pending, or bounced carrier outreach");
assert.match(generateOutreachDraftsSource, /\.eq\("rfx_event_id", campaign\.rfx_event_id\)[\s\S]+Outreach history load failed/, "Outreach draft generation should inspect prior RFx outreach history across campaigns");
assert.match(generateOutreachDraftsSource, /preserved_from_history/, "Outreach draft generation should report carrier drafts preserved from previous waves");
assert.match(rfxEventsSource, /function outreachDraftQueueSummary[\s\S]+already contacted[\s\S]+bounced contact/, "Bid Room should explain already-contacted and bounced carriers after queue generation");
assert.match(rfxEventsSource, /withdrawn: "Withdrawn"/, "Bid Room should label withdrawn offers explicitly");
assert.match(rfxEventsSource, /lane bids \/ .*carriers \/ .*active lane rows/, "Bid Room response totals should distinguish lane bids, carriers, and active lane rows");
assert.match(outreachControlCenterMigration, /contact_key text/, "Outreach Control Center should persist a contact-level ledger key");
assert.match(outreachControlCenterMigration, /outreach_messages_campaign_lane_contact_channel_unique/, "Outreach Control Center should de-duplicate a carrier contact per lane and channel");
assert.match(outreachControlCenterMigration, /create table if not exists public\.outreach_audience_segments/, "Outreach Control Center should persist workspace audience segments");
assert.match(outreachControlCenterMigration, /create table if not exists public\.outreach_contact_suppressions/, "Outreach Control Center should persist contact suppressions independently from carriers");
assert.match(apiSource, /body\.action === "preview_outreach_audience"/, "Outreach API should preview the eligible carrier audience before queue generation");
assert.match(apiSource, /body\.action === "save_outreach_audience_segment"/, "Outreach API should save reusable carrier audience segments");
assert.match(apiSource, /body\.action === "archive_outreach_audience_segment"/, "Outreach API should archive unused audience segments");
assert.match(apiSource, /const existingForVendor = vendorId[\s\S]+existing\.eq\("vendor_id", vendorId\)[\s\S]+existing\.is\("vendor_id", null\)/, "Contact suppression should distinguish a carrier-specific contact from a workspace-wide suppression");
assert.match(generateOutreachDraftsSource, /const contactPolicy = normalizeOutreachContactPolicy/, "Draft generation should apply the campaign contact policy");
assert.match(generateOutreachDraftsSource, /const dailyLimitedRows = rowsToUpsert\.filter/, "Draft generation should enforce the rolling daily queue cap");
assert.match(generateOutreachDraftsSource, /outreachHistoryByContact/, "Draft generation should use per-contact outreach history before creating a duplicate");
assert.match(generateOutreachDraftsSource, /next_action: "Send revision"/, "Sent drafts with a changed Business Book should require an explicit revision");
assert.match(rfxEventsSource, /function currentOutreachAudiencePolicy/, "Bid Room should expose an audience policy to the campaign generator");
assert.match(rfxEventsSource, /selectedOutreachAudienceVendorIds/, "Bid Room should retain manual audience selections before creating a wave");
assert.match(rfxEventsHtml, /rfx-outreach-audience-builder|rfx-outreach-audience-mode/, "Bid Room should render the audience builder controls");
assert.match(rfxEventsHtml, /rfx-outreach-audience-ready-count/, "Outreach controls should show compact audience state counts");
assert.match(rfxEventsHtml, /rfx-select-ready-outreach-audience/, "Outreach controls should support compact ready-carrier selection");
assert.match(rfxEventsHtml, /bid-room-side-checklist/, "Operating checklist should live in the Bid Room right-side command panel");
assert.match(rfxEventsSource, /Outreach service is behind this app version/, "Outreach controls should explain an undeployed API action without exposing a raw backend error");
assert.match(outreachServiceSource, /previewOutreachAudience/, "Outreach service should load the audience ledger");
assert.match(outreachServiceSource, /saveOutreachAudienceSegment/, "Outreach service should save reusable audience segments");
assert.match(apiSource, /const createdMessages = generatedMessages\.filter/, "Outreach history should distinguish newly created drafts from refreshed drafts");
assert.match(apiSource, /const historyRows = createdMessages\.map/, "Outreach regeneration should not duplicate contact history for refreshed drafts");
assert.match(outreachDeliveryIdempotencyMigration, /add column if not exists idempotency_key text/, "Outreach campaigns should persist a retry idempotency key");
assert.match(outreachDeliveryIdempotencyMigration, /outreach_campaigns_owner_idempotency_unique[\s\S]+owner_email, idempotency_key/, "Outreach campaign retry keys should be unique per workspace owner");
assert.match(outreachDeliveryIdempotencyMigration, /add column if not exists send_attempt_id uuid/, "Outreach messages should persist an atomic provider-send claim");
assert.match(outreachDeliveryIdempotencyMigration, /'sending'[\s\S]+'delivery_unknown'/, "Outreach delivery states should distinguish active and uncertain provider attempts");
assert.match(outreachDeliveryStateGuardMigration, /new\.status = 'drafted'[\s\S]+old\.status in \([\s\S]+'sending'[\s\S]+'sent'[\s\S]+'bounced'[\s\S]+return old/, "Stale draft generation should not overwrite claimed or completed outreach delivery states");
assert.match(outreachDeliveryStateGuardMigration, /provider = 'gmail'[\s\S]+provider_message_id is not null[\s\S]+send_completed_at is not null[\s\S]+delivery_status = 'sent'/, "Accepted Gmail messages that regressed to draft should be repaired only when durable provider evidence exists");
assert.match(outreachDeliveryStateGuardMigration, /revoke all on function public\.protect_outreach_delivery_state\(\) from public, anon, authenticated/, "The outreach state guard should not expose direct function execution");
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
assert.match(apiSource, /async function writeOutreachDeliveryIssueHistory/, "Outreach delivery issues should be written to contact history for carrier traceability");
assert.match(apiSource, /status: uncertain \? "delivery_unknown" : "failed"[\s\S]*provider: "gmail"/, "Gmail delivery issues should record failed or unknown outcomes in carrier history");
assert.match(apiSource, /status: uncertain \? "delivery_unknown" : "failed"[\s\S]*provider: "meta"/, "WhatsApp delivery issues should record failed or unknown outcomes in carrier history");
assert.match(apiSource, /response\.status === 408 \|\| response\.status >= 500/, "Timeout and provider server responses should remain blocked as uncertain delivery");
assert.match(apiSource, /body\.action === "create_outreach_campaign"[\s\S]+normalized\.idempotency_key[\s\S]+reused: true/, "Campaign creation retries should reuse the original outreach wave");
assert.match(rfxEventsSource, /window\.sessionStorage\.getItem\(storageKey\)/, "Bid Room should retain the current draft request key across a lost response");
assert.match(rfxEventsSource, /idempotency_key: idempotencyKey/, "Bid Room should send the retry key when creating an outreach wave");
assert.match(rfxEventsSource, /function laneTableSignatureForTargets/, "Bid Room UI should fingerprint current carrier lane groups");
assert.match(rfxEventsSource, /function allOutreachTargetInvitations/, "Bid Room preview should be able to render every active event lane for the selected carrier");
assert.match(rfxEventsSource, /function outreachPreviewLaneRows/, "Bid Room live preview should resolve the complete active event route book");
assert.match(rfxEventsSource, /function outreachPreviewLaneRows[\s\S]+const scopedLanes = currentLanes;/, "Bid Room live preview should ignore lane action checkbox state and show every event lane");
assert.match(rfxEventsSource, /const targetRows = outreachPreviewLaneRows\(target\)/, "Bid Room live preview should render all event lanes instead of only the first carrier invitation");
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
  apiSource,
  /async function fetchBulkRateRowsByFilter/,
  "legacy unscoped Edge Function bulk row scans must not be available for future bulk actions"
);
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
assert.match(filteredUpdateSource, /remaining: Math\.max\(0, \(filtered\.database_count \|\| ids\.length\) - ids\.length\)/, "filtered updates should explicitly report rows that remain outside the completed batch");
assert.match(bulkActionSource, /completed: ids\.length >= \(filtered\.database_count \|\| ids\.length\)/, "filtered archive/remove should distinguish a completed filtered set from a partial batch");
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
  /selected rate\(s\) retained across pages/,
  "Rateware should retain explicit selections while navigating pages"
);
assert.match(
  stagingReviewSource,
  /selected row\(s\) retained across pages/,
  "Staging should retain explicit selections while navigating pages"
);
assert.match(ratewareSource, /Database matches:/, "Rateware should label global matches separately from the loaded page");
assert.match(stagingReviewSource, /Database matches:/, "Staging should label global matches separately from the loaded page");
assert.match(ratewareSource, /const DEFAULT_RATEWARE_PAGE_SIZE = 100/, "Rateware should default to a lighter first page for faster spreadsheet startup");
assert.match(stagingReviewSource, /const DEFAULT_STAGING_PAGE_SIZE = 100/, "Staging should default to a lighter first page for faster spreadsheet startup");
assert.match(stagingReviewSource, /optionsRequest\s*\.then\(async \(\) =>/, "Staging catalog hydration should not block the first row page");
assert.match(ratewareSource, /The row query is the critical path/, "Rateware should keep row loading ahead of catalog hydration");
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
const scopedTemplateLocationsSource = apiSource.slice(apiSource.indexOf("async function fetchScopedTemplateLocations"), apiSource.indexOf("function templateMileageKeys"));
assert.match(scopedTemplateLocationsSource, /const fetchPaged = async/, "scoped location lookups should paginate every matching catalog chunk");
assert.match(scopedTemplateLocationsSource, /const key = cleanText\(row\.id\) \|\| \[row\.source, row\.country, row\.location_key, row\.raw_value\]/, "scoped location lookups should preserve MX, US, and CA candidates with colliding location keys");
assert.doesNotMatch(scopedTemplateLocationsSource, /\.limit\(5000\)|\.limit\(8000\)|\.limit\(3000\)/, "scoped location lookups must not truncate high-density states or fallback catalogs");
assert.match(apiSource, /async function fetchScopedTemplateMileage/, "structured upload import should avoid loading the full mileage catalog");
const templateMileageKeysSource = apiSource.slice(apiSource.indexOf("function templateMileageKeys"), apiSource.indexOf("async function fetchScopedTemplateMileage"));
const scopedTemplateMileageSource = apiSource.slice(apiSource.indexOf("async function fetchScopedTemplateMileage"), apiSource.indexOf("function rowHasRateSignal"));
assert.doesNotMatch(templateMileageKeysSource, /\.slice\(0, 1000\)/, "mileage lookup keys must not drop lanes after 1,000 candidates");
assert.match(scopedTemplateMileageSource, /\.range\(offset, offset \+ pageSize - 1\)/, "mileage lookups should paginate all matching route keys");
assert.doesNotMatch(scopedTemplateMileageSource, /\.limit\(1000\)/, "mileage lookups must not truncate a route-key batch after 1,000 rows");
const bulkImportSource = apiSource.slice(apiSource.indexOf("async function bulkImportStructuredUpload"), apiSource.indexOf("function normalizeOutreachTemplate"));
assert.ok(bulkImportSource.length > 100, "bulk structured import helper should be present");
assert.match(bulkImportSource, /const vendorsPromise = inheritedVendorId[\s\S]*Promise\.resolve/, "bulk import should skip full vendor lookup when upload already has a vendor");
assert.match(bulkImportSource, /fetchAllManagedCatalogRows\(supabase, null\)/, "bulk import should normalize against the complete operational catalog");
assert.doesNotMatch(bulkImportSource, /rateware_catalog_items"\)[\s\S]*\.limit\(10000\)/, "bulk import must not truncate operational catalog values after 10,000 rows");
assert.doesNotMatch(bulkImportSource, /rateware_locations"\)[\s\S]*limit\(20000\)/, "bulk import should not load all location rows");
assert.doesNotMatch(bulkImportSource, /rateware_lane_mileage"\)[\s\S]*limit\(20000\)/, "bulk import should not load all mileage rows");
assert.match(uploadBulkImportIndexesMigration, /rateware_locations_state_active_idx/, "bulk import should have state lookup index support");
assert.match(uploadBulkImportIndexesMigration, /rateware_locations_location_key_active_idx/, "bulk import should have location key lookup index support");
const apiLocationMatchSource = apiSource.slice(apiSource.indexOf("function locationMatch"), apiSource.indexOf("function applyLocation"));
const interpretLocationMatchSource = interpretUploadSource.slice(interpretUploadSource.indexOf("function locationMatch"), interpretUploadSource.indexOf("function applyLocation"));
const templateLocationScopeSource = apiSource.slice(apiSource.indexOf("function templateLocationScope"), apiSource.indexOf("async function fetchScopedTemplateLocations"));
assert.match(apiSource, /const index = new Map<string, Record<string, unknown>\[\]>\(\);/, "API location index must retain colliding MX, US, and CA catalog candidates");
assert.match(interpretUploadSource, /const index = new Map<string, Record<string, unknown>\[\]>\(\);/, "Interpretation location index must retain colliding MX, US, and CA catalog candidates");
assert.match(apiLocationMatchSource, /\(index\.get\(lookup\) \|\| \[\]\)\.find\(\(location\) => locationMatchesProfile\(location, profile\)\)/, "API exact matches must choose a country-compatible candidate from a shared key");
assert.match(interpretLocationMatchSource, /\(index\.get\(lookup\) \|\| \[\]\)\.find\(\(location\) => locationMatchesProfile\(location, profile\)\)/, "Interpretation exact matches must choose a country-compatible candidate from a shared key");
assert.match(apiLocationMatchSource, /for \(const bucket of index\.values\(\)\) \{\s*for \(const location of bucket\)/, "API matching must score every country candidate in a colliding catalog bucket");
assert.match(interpretLocationMatchSource, /for \(const bucket of index\.values\(\)\) \{\s*for \(const location of bucket\)/, "Interpretation matching must score every country candidate in a colliding catalog bucket");
assert.match(interpretUploadSource, /const originCountryHint = cleanBoolean\(row\.origin_match_manual\) \? row\.origin_country : null;/, "interpretation re-normalization must not preserve an automatic wrong origin country");
assert.match(interpretUploadSource, /const destinationCountryHint = cleanBoolean\(row\.destination_match_manual\) \? row\.destination_country : null;/, "interpretation re-normalization must not preserve an automatic wrong destination country");
assert.match(interpretUploadSource, /async function fetchAllActiveReferenceRows/, "Interpretation should page reference catalogs instead of relying on a fixed sample");
assert.match(interpretUploadSource, /fetchAllActiveReferenceRows\(supabase, "rateware_locations"/, "Interpretation should load the full location catalog for matching");
for (const table of ["rateware_fuel_regions", "border_crossing_pairs", "rateware_assumptions", "rateware_factor_items"]) {
  assert.match(
    interpretUploadSource,
    new RegExp(`fetchAllActiveReferenceRows\\(supabase, "${table}"`),
    `Interpretation should page the complete ${table} reference catalog`
  );
}
assert.doesNotMatch(interpretUploadSource, /rateware_fuel_regions"\)\.select\([^\n]+\)\.eq\("active", true\)\.limit\(200\)/, "Interpretation must not truncate fuel regions after 200 rows");
assert.doesNotMatch(interpretUploadSource, /border_crossing_pairs"\)\.select\([^\n]+\)\.eq\("active", true\)\.limit\(200\)/, "Interpretation must not truncate border crossings after 200 rows");
assert.doesNotMatch(interpretUploadSource, /rateware_locations"\)\.select\([^\n]+\)\.eq\("active", true\)\.limit\(20000\)/, "Interpretation must not truncate locations after 20,000 rows");
assert.doesNotMatch(interpretUploadSource, /rateware_catalog_items"\)\.select\([^\n]+\)\.eq\("active", true\)\.limit\(20000\)/, "Interpretation must not truncate operational catalog values after 20,000 rows");
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
assert.match(locationMatchDrawerSource, /if \(\["MX", "US", "CA"\]\.includes\(explicit\)\) return explicit;/, "location drawer must preserve a confirmed MX, US, or CA country before inferring overlapping state codes");
assert.match(locationMatchDrawerSource, /optionCountry && optionCountry !== country\) return null;/, "location drawer should hide wrong-country candidates when text is explicit");
assert.doesNotMatch(locationMatchDrawerSource, /lookup\.includes\(lookupKey\(option\.zip_prefix\)\)/, "location drawer should not score ZIP prefixes by substring");
assert.match(locationMatchDrawerSource, /const aliasSaveMutationKeys = new Set\(\);/, "location drawer should key alias saves to avoid duplicate catalog aliases");
assert.match(locationMatchDrawerSource, /aliasSaveMutationKeys\.has\(aliasKey\)/, "location drawer should ignore duplicate alias-save clicks");
assert.match(locationMatchDrawerSource, /let drawerActionRunning = false;/, "location drawer should serialize find-ZIP and renormalize actions");
assert.match(locationMatchDrawerSource, /if \(drawerActionRunning\) return;/, "location drawer should ignore duplicate drawer actions while running");
assert.match(locationMatchDrawerSource, /finally \{[\s\S]+drawerActionRunning = false;/, "location drawer should release drawer action locks after async work");
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
const listLocationCatalogValuesSource = apiSource.slice(apiSource.indexOf('if (body.action === "list_location_catalog_values")'), apiSource.indexOf('if (body.action === "save_location_catalog_value")'));
assert.match(apiSource, /async function fetchAllLocationCatalogRows/, "Catalog workbench should page the full location catalog before filtering");
assert.match(listLocationCatalogValuesSource, /fetchAllLocationCatalogRows\(supabase, \{ country: resolvedCountry, activeOnly \}\)/, "Catalog workbench should filter the complete country-scoped catalog");
assert.doesNotMatch(listLocationCatalogValuesSource, /\.limit\(10000\)/, "Catalog workbench must not silently omit locations after 10,000 rows");
const listCatalogValuesSource = apiSource.slice(apiSource.indexOf('if (body.action === "list_catalog_values")'), apiSource.indexOf('if (body.action === "save_catalog_value")'));
assert.match(apiSource, /async function fetchAllManagedCatalogRows/, "Operational catalog values should page all available values");
assert.match(listCatalogValuesSource, /fetchAllManagedCatalogRows\(supabase, resolvedCategory\)/, "Operational dropdowns should use the complete requested catalog category");
assert.doesNotMatch(listCatalogValuesSource, /\.limit\(5000\)/, "Operational dropdowns must not silently omit values after 5,000 rows");
const renormalizeRowsSource = apiSource.slice(apiSource.indexOf("async function renormalizeRateRows"), apiSource.indexOf("async function saveRatewareLocationAlias"));
assert.match(renormalizeRowsSource, /fetchScopedTemplateLocations/, "rate row re-normalization should use scoped location lookup");
assert.match(renormalizeRowsSource, /fetchScopedTemplateMileage/, "rate row re-normalization should use scoped mileage lookup");
assert.match(renormalizeRowsSource, /fetchAllManagedCatalogRows\(supabase, null\)/, "rate row re-normalization should use the complete operational catalog");
assert.doesNotMatch(renormalizeRowsSource, /rateware_locations"\)[\s\S]*limit\(20000\)/, "rate row re-normalization should not load all location rows");
assert.doesNotMatch(renormalizeRowsSource, /rateware_lane_mileage"\)[\s\S]*limit\(20000\)/, "rate row re-normalization should not load all mileage rows");
const enrichMissingLocationZipsSource = apiSource.slice(apiSource.indexOf("async function enrichMissingLocationZips"), apiSource.indexOf("async function fetchVendorRowsForRateMatching"));
assert.match(enrichMissingLocationZipsSource, /fetchAllLocationCatalogRows\(supabase, \{ activeOnly: true \}\)/, "missing ZIP enrichment should use the complete active location catalog");
assert.doesNotMatch(enrichMissingLocationZipsSource, /\.limit\(20000\)/, "missing ZIP enrichment must not truncate locations after 20,000 rows");
const rfxAwardCloseoutSource = apiSource.slice(apiSource.indexOf("async function closeoutAwardedRfxToRateware"), apiSource.indexOf("function awardNoticeOutcome"));
const rfxCloseoutDecisionSource = apiSource.slice(apiSource.indexOf("async function rfxCloseoutDecisionSnapshot"), apiSource.indexOf("async function requireCompleteRfxAwardDecisions"));
const rfxAwardNoticeSource = apiSource.slice(apiSource.indexOf("async function generateRfxAwardNotices"), apiSource.indexOf("const BID_ROOM_CHAT_THREAD_TYPES"));
assert.match(rfxCloseoutDecisionSource, /fetchAllRfxLaneRows/, "RFx closeout decisions should paginate every event lane");
assert.match(rfxCloseoutDecisionSource, /fetchAllRfxLaneVendorRows/, "RFx closeout decisions should paginate every carrier response");
assert.match(rfxAwardCloseoutSource, /fetchAllRfxLaneVendorRows/, "RFx Rateware closeout should paginate every primary award");
assert.match(rfxAwardNoticeSource, /fetchAllRfxLaneVendorRows/, "RFx award notices should include every carrier response beyond the PostgREST page limit");
assert.match(rfxAwardNoticeSource, /fetchAllOutreachMessagesByCampaignIds/, "RFx award notice retries should inspect every existing campaign message");
assert.match(rfxAwardCloseoutSource, /fetchAllManagedCatalogRows\(supabase, null\)/, "Bid Room closeout should normalize awards against the complete operational catalog");
assert.doesNotMatch(rfxAwardCloseoutSource, /rateware_catalog_items"\)[\s\S]*\.limit\(10000\)/, "Bid Room closeout must not truncate operational catalog values after 10,000 rows");
const stagingOptionsSource = apiSource.slice(apiSource.indexOf('if (body.action === "list_staging_options")'), apiSource.indexOf('if (body.action === "update_staging")'));
assert.match(apiSource, /body\.action === "search_staging_locations"/, "Spreadsheet location autocomplete should support a server-side search action");
assert.match(apiSource, /raw_value\.ilike/, "Server-side location search should query catalog location text directly");
assert.match(stagingOptionsSource, /\.limit\(250\)/, "Initial spreadsheet metadata should stay lightweight while typing uses server-side search");
assert.match(stagingOptionsSource, /fetchAllManagedCatalogRows\(supabase, null\)/, "Spreadsheet operational dropdowns should load the complete managed catalog");
assert.doesNotMatch(stagingOptionsSource, /rateware_catalog_items"\)[\s\S]*\.limit\(5000\)/, "Spreadsheet operational dropdowns must not truncate catalog values after 5,000 rows");
assert.match(sheetUiSource, /searchOptions/, "Spreadsheet autocomplete should support asynchronous server-side location results");
assert.match(stagingReviewSource, /searchOptions: \(search\) => searchStagingLocations\(search\)/, "Staging should query locations server-side while typing");
assert.match(ratewareSource, /searchOptions: \(search\) => searchRatewareLocations\(search\)/, "Rateware should query locations server-side while typing");
assert.match(interpretUploadSource, /expected_rate_rows/, "AI interpretation summary should report expected source rows");
assert.match(interpretUploadSource, /source_table_count/, "AI interpretation summary should report source table count");
assert.match(interpretUploadSource, /carrier_response_scope/, "AI interpretation audit should document carrier response scope");
assert.match(interpretUploadSource, /completeness_notes/, "AI interpretation audit should carry row-count reasoning");
assert.match(interpretUploadSource, /source_service_marker/, "AI interpretation rows should preserve visible OW/RT service markers");
assert.match(interpretUploadSource, /summary_expected_rate_rows/, "Upload audit should compare summary expected rows with staged rows");
assert.match(interpretUploadSource, /internal_vendor_domain/, "Upload audit should flag internal Marksman domains as carrier errors");
assert.match(interpretUploadSource, /Document summary expected/, "Missing-row warnings should explain summary-vs-staged gaps");
assert.match(createRawUploadSource, /function uploadErrorStatus/, "Raw upload creation should classify authentication failures separately from storage or database failures");
assert.match(createRawUploadSource, /uploadErrorStatus\(error\)/, "Raw upload creation should not return 401 for every caught failure");
assert.doesNotMatch(createRawUploadSource, /jsonResponse\(\{ error: error\.message \}, 401\)/, "Raw upload creation should not expose raw errors or mislabel all failures as auth errors");
assert.match(interpretUploadSource, /function interpretationErrorMessage/, "Interpret upload should sanitize nested provider, storage, and database errors consistently");
assert.doesNotMatch(interpretUploadSource, /return jsonResponse\(\{ error: error\.message \}/, "Interpret upload should not return raw caught errors to Upload History");
assert.doesNotMatch(interpretUploadSource, /error_message: error\.message|String\(error\.message/, "Interpret upload should persist sanitized failure reasons in job and raw upload audit fields");
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

assert.match(workspaceIdentitySource, /export async function resolveWorkspaceUser/, "Workspace identity should be resolved by one shared backend helper");
assert.match(workspaceIdentitySource, /canonicalOwnerKey = `org:\$\{organizationId\.toLowerCase\(\)\}`/, "Organization workspaces should use a stable canonical owner key");
assert.match(workspaceIdentitySource, /from\("workspace_registry"\)[\s\S]+onConflict: "organization_id"/, "Workspace resolution should persist one canonical key per Kinde organization");
assert.match(workspaceIdentitySource, /WORKSPACE_IDENTITY_CACHE_TTL_MS = 5 \* 60 \* 1000/, "Workspace resolution should cache stable organization identities between polling requests");
assert.match(workspaceIdentitySource, /identityKeys\.every\(\(identityKey\) => cachedWorkspace\.identity_keys\.has\(identityKey\)\)/, "Workspace cache hits should avoid database work only when every authenticated identity is registered");
assert.match(workspaceIdentitySource, /from\("workspace_registry"\)[\s\S]+\.select\("organization_id,canonical_owner_key"\)[\s\S]+if \(registryRow\)/, "Cold workspace resolution should read the registry before attempting a write");
assert.match(workspaceIdentitySource, /const missingIdentityKeys = uncachedIdentityKeys\.filter/, "Workspace resolution should write only aliases that do not already exist");
assert.match(apiSource, /const resolveUser = dependencies\.resolveUser \?\? resolveRuntimeWorkspaceUser/, "Rateware API handler factory should default to the reviewed runtime tenant resolver");
assert.match(workspaceIdentitySource, /if \(options\.persistIdentity === false\)[\s\S]+owner_email: canonicalOwnerKey/, "Read-heavy APIs should derive the canonical organization owner without database identity writes");
assert.match(apiSource, /const claims = await authenticate\(request\)[\s\S]+resolveRatewareApiPrincipal\(supabase, claims, \{ resolveUser \}\)/, "Rateware API must preserve raw claims before the staged runtime tenant resolver scopes actions");
assert.match(apiSource, /supabase\.rpc\("rateware_bid_room_chat_snapshot"/, "Bid Room polling should load its database snapshot through one backend RPC");
assert.match(apiSource, /if \(input\.sync_google_chat === true\) return listBidRoomChatLegacy/, "Explicit Google Chat inbound sync should retain its external synchronization path");
assert.match(apiSource, /isMissingBidRoomChatSnapshotRpc/, "Bid Room polling should fall back safely during a staged database deployment");
assert.match(apiSource, /event: "rateware_api\.performance"[\s\S]+authentication_ms[\s\S]+action_ms[\s\S]+handler_total_ms/, "Bid Room polling should emit structured latency diagnostics without token data");
assert.match(bidRoomChatSnapshotMigration, /function public\.rateware_bid_room_chat_snapshot/, "Bid Room snapshot RPC should be defined by migration");
assert.match(bidRoomChatSnapshotMigration, /thread_row\.owner_email = p_owner_email/, "Bid Room snapshot threads should remain workspace scoped");
assert.match(bidRoomChatSnapshotMigration, /message_row\.owner_email = p_owner_email/, "Bid Room snapshot messages should remain workspace scoped");
assert.match(bidRoomChatSnapshotMigration, /vendor_row\.owner_email = p_owner_email/, "Bid Room snapshot vendor relations should not cross workspace boundaries");
assert.match(bidRoomChatSnapshotMigration, /security invoker[\s\S]+set search_path = pg_catalog, public, pg_temp/, "Bid Room snapshot should use caller privileges and pin its search path");
assert.match(bidRoomChatSnapshotMigration, /revoke all on function public\.rateware_bid_room_chat_snapshot[\s\S]+from public, anon, authenticated/, "Bid Room snapshot RPC should remain backend-only");
assert.match(createRawUploadSource, /resolveRuntimeWorkspaceUser\(supabase, identity\)/, "Upload creation should enforce the reviewed tenant identity");
assert.match(interpretUploadSource, /resolveRuntimeWorkspaceUser\(supabase, await requireKindeUser/, "Interpretation should enforce the reviewed tenant identity");
assert.match(canonicalWorkspaceMigration, /create table if not exists public\.workspace_registry/, "Canonical workspace ownership should be persisted");
assert.match(canonicalWorkspaceMigration, /with recursive owner_edges as/, "Legacy owners should be discovered through existing vendor-rate relationships");
assert.match(canonicalWorkspaceMigration, /rate_staging_vendor_workspace_guard/, "Staged rates should reject cross-workspace vendor links");
assert.match(canonicalWorkspaceMigration, /raw_uploads_vendor_workspace_guard/, "Raw uploads should reject cross-workspace vendor links");
assert.match(canonicalWorkspaceMigration, /revoke all on table public\.workspace_registry from public, anon, authenticated/, "Workspace registry must remain backend-only");
assert.doesNotMatch(canonicalWorkspaceMigration, /sales@heymarksman\.com|kp_[a-z0-9]+|org_[a-z0-9]+/, "Workspace backfill must derive identities instead of hardcoding tenant identifiers");

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
assert.match(operationalPageIndexMigration, /vendors_owner_created_id_idx/, "Carrier CRM pagination should use a workspace-scoped stable index");
assert.match(operationalPageIndexMigration, /shippers_owner_updated_id_idx/, "Shipper CRM pagination should use a workspace-scoped stable index");
assert.match(operationalPageIndexMigration, /rate_staging_owner_approved_rateware_page_idx/, "Rateware pagination should lead with workspace ownership");

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
assert.match(apiSource, /vendor_rate_metrics_for_owner_ids/, "API should call the page-scoped vendor rate metrics RPC");
assert.match(apiSource, /async function fetchVendorRateMetricsSafe/, "Vendor metric enrichment should have a safe fallback");
const vendorBidMetricsSource = apiSource.slice(apiSource.indexOf("async function fetchVendorBidMetrics"), apiSource.indexOf("async function fetchVendorBidMetricsSafe"));
assert.match(vendorBidMetricsSource, /vendor_bid_metrics_for_owner_ids/, "Bid Room metrics should aggregate only requested vendors in PostgreSQL");
assert.match(vendorBidMetricsSource, /if \(!vendorIds\.length\) return metrics/, "Bid Room metrics should skip database work when no vendor rows are visible");
assert.doesNotMatch(vendorBidMetricsSource, /\.limit\(10000\)/, "Bid Room CRM metrics should not silently truncate after 10,000 invitations");
assert.match(apiSource, /Quote metrics are temporarily unavailable/, "Vendor metric fallback should explain partial CRM loading");
const listVendorsSource = apiSource.slice(apiSource.indexOf('if (body.action === "list_vendors")'), apiSource.indexOf('if (body.action === "vendor_intelligence")'));
assert.ok(listVendorsSource.length > 100, "list vendors block should be present");
assert.match(listVendorsSource, /fetchVendorRateMetricsSafe/, "Carrier CRM directory should enrich vendors with quote metrics");
assert.match(listVendorsSource, /buildVendorIntelligenceRows\(rows, metricsResult\.metrics, bidMetricsResult\.metrics\)/, "Carrier CRM directory should share the unified quote and Bid Room scoring model");
assert.match(listVendorsSource, /const lightweight =/, "Carrier CRM vendor list should support lightweight selector loading");
assert.match(listVendorsSource, /contact_name/, "Lightweight Carrier CRM loading should include contact names for Bid Room search");
assert.match(listVendorsSource, /search_workspace_vendors_keyset/, "Carrier CRM search should use the fixed-snapshot workspace vendor keyset RPC");
assert.match(listVendorsSource, /while \(seenSearchIds\.size < searchSafetyLimit\)/, "Carrier CRM search should scan every bounded keyset RPC page");
assert.match(listVendorsSource, /p_snapshot_at: searchSnapshotAt[\s\S]+p_after_id: searchAfterId \|\| null/, "Carrier CRM search should keep one snapshot cutoff and advance a unique UUID keyset");
assert.doesNotMatch(listVendorsSource, /p_offset: searchOffset/, "Carrier CRM search must not traverse mutable matches by offset");
assert.match(listVendorsSource, /rankById/, "Carrier CRM search should sort returned vendors by search match rank");
assert.match(listVendorsSource, /\.slice\(offset, offset \+ limit\)/, "Carrier CRM search should page after relevance sorting");
assert.match(listVendorsSource, /total: filteredTotal/, "Carrier CRM search should report the complete post-filter total to CRM and Bid Room");
assert.match(listVendorsSource, /search_capped: false/, "Carrier CRM search should not claim a complete result is capped");
assert.match(listVendorsSource, /const viewBaseStage = \["sourcing", "procurement", "archived"\]\.includes\(view\) \? view : ""/, "Vendor API should treat sourcing, procurement, and archived as first-class CRM views");
assert.match(listVendorsSource, /filteredQuery = filteredQuery\.eq\("base_stage", effectiveBaseStage\)/, "Vendor API should resolve CRM base-stage filters consistently across modules");
assert.match(vendorWorkspaceSearchMigration, /secondary_emails/, "Workspace vendor search should include secondary emails");
assert.match(vendorWorkspaceSearchMigration, /contact_name/, "Workspace vendor search should include contact names");
assert.match(vendorWorkspaceSearchMigration, /rateware_vendor_search_key/, "Workspace vendor search should normalize accents and punctuation");
assert.match(vendorWorkspaceSearchHardeningMigration, /add column if not exists name text/, "Vendor search hardening should guarantee commercial name support");
assert.match(vendorWorkspaceSearchHardeningMigration, /v\.name/, "Workspace vendor search should include commercial name aliases");
assert.match(vendorWorkspaceSearchHardeningMigration, /profile_data::text/, "Workspace vendor search should include structured profile data");
assert.match(vendorWorkspaceSearchHardeningMigration, /coalesce\(v\.tags/, "Workspace vendor search should include tags");
assert.match(vendorWorkspaceSearchHardeningMigration, /secondary_email_keys/, "Workspace vendor search should rank exact secondary email matches");
assert.match(vendorPagePerformanceMigration, /search_document extensions\.gin_trgm_ops/, "Workspace vendor search should use a persisted trigram search document");
assert.equal((ratewareOriginDestinationIndexMigration.match(/extensions\.gin_trgm_ops/g) || []).length, 2, "Clean replay should resolve both trigram operator classes from the extensions schema");
assert.match(vendorPagePerformanceMigration, /vendors_refresh_search_document/, "Vendor mutations should keep the search document synchronized");
assert.match(vendorPagePerformanceMigration, /vendor_rate_metrics_for_owner_ids/, "Vendor rate enrichment should be scoped to requested CRM rows");
assert.match(vendorPagePerformanceMigration, /vendor_bid_metrics_for_owner_ids/, "Bid Room enrichment should aggregate requested CRM rows server-side");
assert.match(listVendorsSource, /const vendorIds = rows\.map\(\(row\) => row\.id\)/, "Carrier CRM should request metrics only for the current page");
assert.match(rfxEventsSource, /rawTerm\.length >= 2\s*\? scopeRows/, "Bid Room should trust server-side vendor search matches");
assert.match(vendorImprovementSource, /const matchingRows = rows;/, "Vendor CI should trust server-side vendor search matches");
assert.match(listVendorsSource, /if \(!lightweight && rows\.length\)/, "Bid Room carrier selector should be able to skip heavy CRM metric enrichment");
assert.match(listVendorsSource, /rows: enrichedRows,[\s\S]*warnings,/, "Carrier CRM directory should surface partial metric warnings");
assert.match(listVendorsSource, /const maxLimit = lightweight \? 1000 : 250;/, "Lightweight CRM selectors should support up to 1,000 vendors without enabling heavy CRM payloads");
assert.match(apiSource, /logo_url: cleanText\(vendor\.logo_url\)/, "Vendor intelligence rows should keep uploaded logo URLs");
assert.match(apiSource, /profile_data: typeof vendor\.profile_data/, "Vendor intelligence rows should keep structured profile data");
assert.match(vendorsSource, /key: "health"/, "Carrier CRM spreadsheet should include a health column");
assert.match(vendorsSource, /key: "quotes"/, "Carrier CRM spreadsheet should include a quotes column");
assert.match(vendorsSource, /key: "coverage_delta"/, "Carrier CRM spreadsheet should include a coverage fit column");
assert.match(vendorsSource, /const VENDOR_WORKSPACE_CONTEXT_STORAGE_KEY = "rateware:vendors:workspace-context:v1"/, "Carrier CRM should persist a separate workspace context");
assert.match(vendorsSource, /function persistVendorWorkspaceContext\(\)/, "Carrier CRM should persist directory and funnel context");
assert.match(vendorsSource, /storedVendorWorkspaceContext/, "Carrier CRM should restore its last workspace context");
assert.match(vendorsSource, /vendorPageOffset = Math\.max\(0, Math\.floor\(\(vendorTotalCount - 1\) \/ vendorPageSize\) \* vendorPageSize\)/, "Carrier CRM should recover from a stale saved page when the dataset shrinks");
assert.match(vendorsSource, /funnelHideEmpty: vendorFunnelHideEmptyStages/, "Carrier CRM should remember funnel visibility filters");
assert.match(vendorsSource, /activateVendorTab\(activeVendorTab\)/, "Carrier CRM should reopen the last active workspace instead of forcing Funnel");
assert.doesNotMatch(vendorsHtml, /id="(?:wizard-primary-email|primary-email|drawer-edit-email)"[^>]*type="email"/, "Carrier CRM email fields should accept multiple email addresses without native single-email blocking");
assert.match(vendorsSource, /function splitVendorEmails/, "Carrier CRM should split pasted email lists into primary and secondary emails");
assert.match(vendorsSource, /secondary_emails: emails\.slice\(1\)/, "Carrier CRM should preserve extra emails as secondary contacts");
assert.match(apiSource, /function normalizeEmailList/, "Rateware API should accept multiple vendor emails");
assert.match(apiSource, /function normalizeVendorEmails\(primaryValue: unknown, secondaryValue: unknown = \[\]\)/, "Rateware API should strictly normalize pasted vendor email lists");
assert.match(apiSource, /secondary_emails: emails\.slice\(1\)/, "Rateware API should persist additional vendor emails");
assert.match(vendorsSource, /function renderDrawerRatewareEvidence/, "Vendor drawer should explain Rateware evidence");
assert.match(vendorsHtml, /drawer-rateware-evidence/, "Vendor drawer should have a Rateware evidence section");
assert.match(vendorSegmentsCoverageMigration, /coverage_filter text/, "Vendor saved lists should persist a coverage filter");
const vendorWorkflowTabsHtml = vendorsHtml.match(/<section class="vendor-tabs vendor-workflow-tabs[\s\S]*?<\/section>/)?.[0] || "";
const dynamicSegmentsPanelHtml = vendorsHtml.match(/<section[^>]*data-tab-panel="segments"[\s\S]*?<\/section>/)?.[0] || "";
const carrierTemplateWorkspaceHtml = vendorsHtml.match(/<section[^>]*data-vendor-workspace="list-templates"[\s\S]*?<\/section>/)?.[0] || "";
assert.match(
  vendorWorkflowTabsHtml,
  /data-vendor-tab="intelligence"[\s\S]*data-vendor-tab="list-templates"/,
  "Carrier CRM should expose List Templates as a top-level workflow tab immediately after Intelligence"
);
assert.doesNotMatch(dynamicSegmentsPanelHtml, /data-vendor-tab="list-templates"|data-vendor-workspace="list-templates"/, "Carrier templates must not be nested in the dynamic Saved vendor lists panel");
assert.match(carrierTemplateWorkspaceHtml, /data-template-action="new"/, "Carrier template library should expose New template");
assert.match(carrierTemplateWorkspaceHtml, /data-template-search[^>]+aria-label="Search templates"/, "Carrier template library search should have an accessible name");
assert.match(carrierTemplateWorkspaceHtml, /data-template-status[^>]+aria-label="Template status"/, "Carrier template lifecycle filter should have an accessible name");
assert.match(vendorsHtml, /data-template-capability-error[^>]+role="alert"[\s\S]+data-template-capability-retry/, "Carrier CRM should surface retryable capability failures outside the inaccessible template workspace");
for (const action of ["open", "duplicate", "archive", "restore"]) {
  assert.match(carrierListTemplatesSource, new RegExp(`data-template-action="${action}"`), `Carrier template library should render ${action} controls`);
  assert.ok(carrierListTemplatesSource.includes(`aria-label="${action.charAt(0).toUpperCase() + action.slice(1)} \${name}"`), `Carrier template ${action} controls should identify their template`);
}
assert.doesNotMatch(
  `${carrierTemplateWorkspaceHtml}\n${carrierListTemplatesSource}`,
  /data-template-action="(?:delete|remove)"|>\s*(?:Delete|Remove)(?:\s+template)?\s*</i,
  "Carrier template library must use reversible archive and restore controls, never hard delete"
);
assert.match(vendorsSource, /initCarrierListTemplateLibrary/, "Carrier CRM should initialize the shared template library controller");
assert.match(carrierListTemplatesSource, /fetchCarrierListTemplates/, "Carrier template list action should provide capability discovery");
assert.match(carrierListTemplatesSource, /getAccessContext/, "Carrier template write affordances should use the current Kinde access context");
assert.doesNotMatch(carrierListTemplatesSource, /\bcanUse\s*\(/, "Carrier template UI must not change or depend on global canUse semantics");
assert.match(carrierListTemplatesSource, /template_version/, "Carrier template rows should display and retain their optimistic-lock version");
assert.match(carrierListTemplatesSource, /const displayedVersion = Number\(button\.dataset\.templateVersion\)[\s\S]+duplicateCarrierListTemplate\(id, duplicateName, displayedVersion\)[\s\S]+archiveCarrierListTemplate\(id, displayedVersion\)[\s\S]+restoreCarrierListTemplate\(id, displayedVersion\)/, "Duplicate, archive, and restore should send the exact version displayed on the clicked control");
assert.match(carrierListTemplatesSource, /template_version_conflict/, "Carrier template version conflicts should use the stable API conflict code");
assert.match(carrierListTemplatesSource, /template_name_conflict/, "Carrier template duplicate-name conflicts should present separate rename guidance");
const carrierTemplateLibraryMutationSource = carrierListTemplatesSource.slice(
  carrierListTemplatesSource.indexOf("async function mutateTemplate"),
  carrierListTemplatesSource.indexOf('workspace?.addEventListener("click"')
);
assert.doesNotMatch(carrierTemplateLibraryMutationSource, /error\?\.status === 409[\s\S]+getCarrierListTemplate/, "Carrier template library must not refresh every generic 409 as if it were a version conflict");
assert.match(carrierListTemplatesSource, /createCarrierListTemplateController/, "Carrier template UI should use the executable request-order controller");
for (const state of ["pending", "enabled", "error", "disabled"]) {
  assert.match(carrierTemplateCapabilitySource, new RegExp(`"${state}"`), `Carrier template capability should preserve the explicit ${state} state`);
}
assert.match(carrierTemplateCapabilitySource, /const changed = previousCapability !== nextCapability[\s\S]+if \(changed\) onTransition\(capability/, "Carrier template capability callbacks should fire only on semantic transitions and avoid navigation recursion");
assert.match(carrierListTemplatesSource, /capabilityView\.transition\("pending"\)/, "Carrier template loads should enter an inaccessible pending capability state");
assert.match(vendorsSource, /onCapabilityChange: \(capability\) => \{[\s\S]+vendorTemplateNavigationGuard\.transitionCapability\(capability\)/, "Carrier CRM navigation should receive every explicit library capability transition");
assert.doesNotMatch(vendorsSource, /resolveCapability/, "Carrier CRM navigation should not collapse semantic capability states back to a boolean");
assert.match(carrierListTemplatesSource, /const lifecycleFilter = [^;]+[\s\S]+templateLifecycle\(row\) !== lifecycleFilter/, "Carrier template client rendering should keep deep-linked or newly mutated rows out of the wrong lifecycle filter");
assert.match(carrierListTemplatesSource, /activate:[\s\S]+selectedTemplateId = "";[\s\S]+render\(\)/, "Carrier template history navigation without a template id should clear stale detail selection");
assert.match(carrierListTemplatesSource, /const retryAction = action === "duplicate"[\s\S]+templateLifecycle\(current\.row\)[\s\S]+: action;[\s\S]+focusSelectedAction\(retryAction\)/, "Carrier template version-conflict recovery should return keyboard focus to the refreshed action or the original action when refresh fails");
const carrierTemplateWizardHtml = vendorsHtml.match(/<form[^>]*data-template-wizard-form[\s\S]*?<\/form>/)?.[0] || "";
assert.deepEqual(
  [...carrierTemplateWizardHtml.matchAll(/<button[^>]*data-template-wizard-step="\d"[^>]*>\s*([^<]+?)\s*<\/button>/g)].map((match) => match[1]),
  ["Details", "Add carriers", "Review", "Save"],
  "Carrier template builder should expose exactly the four approved labelled steps"
);
assert.match(carrierTemplateWizardHtml, /data-template-wizard-form[^>]+data-unsaved-guard/, "Carrier template builder should participate in the existing unsaved-changes guard");
assert.match(vendorsHtml, /data-template-wizard-close[^>]+aria-label="Close template builder"/, "Carrier template builder close control should have an accessible name");
assert.match(carrierTemplateWizardHtml, /data-template-import-file[^>]+accept="\.csv,\.xlsx,text\/csv,application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet"/, "Carrier template import should advertise only supported CSV and XLSX types");
assert.match(carrierTemplateWizardHtml, /data-template-save="draft"[^>]*>Save draft<\/button>[\s\S]+data-template-save="active"[^>]*>Activate template<\/button>/, "Carrier template Save step should keep draft and activation decisions separate");
assert.match(carrierListTemplatesSource, /createCarrierTemplateCandidatePoolController\(\{[\s\S]+maxCandidates: CRM_MATERIALIZATION_LIMIT/, "Template membership search should create one bounded candidate pool");
assert.match(carrierListTemplatesSource, /crmCandidates\.page\(crmPageOffset, CRM_PAGE_SIZE\)/, "Template membership pagination should use local candidate slices");
assert.match(carrierListTemplatesSource, /await crmCandidates\.materialize\(filters, fetchVendors\)/, "Template membership search should materialize through one bounded server request per signature");
assert.match(carrierListTemplatesSource, /crmRequiresRefinement[\s\S]+Refine the search or filters[\s\S]+incomplete candidate traversal is blocked/, "Template membership search must block traversal when more than 1,000 candidates match");
assert.match(carrierListTemplatesSource, /carrierTemplateImportValidation\(file\)[\s\S]+sheet_to_json\(firstSheet, \{ header: 1, defval: "" \}\)[\s\S]+carrierTemplateImportValidation\(file, \{ row_count: normalizedRows\.length \}\)[\s\S]+resolveCarrierListTemplateRows\(normalizedRows\)/, "Template import should validate file bounds, parse only a matrix, bound rows, then call only the resolver");
assert.match(carrierListTemplatesSource, /status === "matched"[\s\S]+apply_resolution_preview/, "Only matched reconciliation rows should flow into automatic membership");
assert.match(carrierListTemplatesSource, /confirm_manual_match/, "Ambiguous rows should require an explicit manual existing-carrier choice");
assert.match(carrierListTemplatesSource, /carrierTemplateExceptionCsv\(exceptionRows\)/, "Template exception downloads should use the shared audited serializer");
assert.match(carrierListTemplatesSource, /function downloadTextFile[\s\S]+try \{[\s\S]+link\.click\(\);[\s\S]+finally \{[\s\S]+link\?\.remove\(\);[\s\S]+setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 0\)/, "Template downloads should always remove the anchor and defer Blob URL revocation until after click consumption");
assert.match(carrierListTemplatesSource, /updateCarrierListTemplate\(savedTemplateId, payload, savedExpectedVersion\)/, "Template edits should send the exact immutable loaded expected version");
assert.match(carrierListTemplatesSource, /template_version_conflict[\s\S]+getCarrierListTemplate\(savedTemplateId\)[\s\S]+Reload current/, "Template update conflicts should preserve local state and fetch current state for explicit reload");
assert.match(carrierListTemplatesSource, /ratewareConfirmUnsavedChanges/, "Template close/navigation should invoke the existing unsaved-changes confirmation");
assert.match(carrierListTemplatesSource, /beforeLeave: \(\{ restoreFocus = false \} = \{\}\) => closeTemplateWizard\(\{ restoreFocus \}\)/, "Template library should expose one guarded beforeLeave contract that suppresses stale opener focus during navigation");
assert.match(carrierListTemplatesSource, /wizardAsync\.begin\("file-import"\)[\s\S]+wizardAsync\.begin\(`ambiguity-search:\$\{generation\}:\$\{rowIdentity\}`\)[\s\S]+wizardAsync\.begin\("save"\)[\s\S]+wizardAsync\.begin\("current-fetch"\)/, "Wizard async operations should be session, reconciliation-generation, and operation gated");
assert.match(carrierListTemplatesSource, /renderWizard\(\);\s*modalFocus\.open\(/, "Template modal should move focus inside synchronously before hydration");
assert.match(carrierListTemplatesSource, /modalFocus\.trapTab\(event\)/, "Template modal should trap Tab and Shift+Tab");
assert.match(carrierListTemplatesSource, /modalFocus\.close\(\{ restoreFocus \}\)/, "Template modal should restore its re-resolved opener only on ordinary close");
assert.match(carrierTemplateWizardHtml, /maximum 5 MB and 1,000 data rows/, "Template import copy should disclose the shared 1,000-row limit");
assert.doesNotMatch(carrierListTemplatesSource, /\b(?:createVendor|updateVendor|importVendors|importVendorOnboardingCorrections|applyVendorTemplateUpdates)\b/, "Template builder must not import or call Carrier CRM master-data mutations");
assert.match(stylesSource, /\.carrier-template-workspace\.hidden\s*\{\s*display:\s*none;/, "Inactive Carrier CRM template workspace should remain hidden after capability discovery");
assert.match(vendorsSource, /URLSearchParams[\s\S]+template[\s\S]+popstate/, "Carrier CRM should preserve template deep links and browser history navigation");
assert.match(vendorsSource, /createCarrierTemplateNavigationCoordinator\([\s\S]+carrierListTemplateLibraryController\?\.beforeLeave\?\.\(\{[\s\S]+restoreFocus: false/, "Carrier CRM tab and deep-link navigation should pass through the wizard beforeLeave contract without stale opener restoration");
assert.match(vendorsSource, /vendorPopRestoreInFlight[\s\S]+window\.history\.go\(acceptedVendorHistoryPosition - route\.targetPosition\)/, "Declined Back or Forward navigation should restore the accepted history entry without a popstate loop");
assert.match(vendorsSource, /createVendorTemplateNavigationGuard/, "Carrier CRM should route List Templates history through the capability-aware navigation guard");
assert.match(vendorsSource, /tabName === "list-templates" && vendorTemplateNavigationGuard\.capability !== "enabled"[\s\S]+activateVendorTab\("funnel"/, "Every List Templates activation should fail back to Funnel until capability is enabled");
assert.doesNotMatch(vendorsSource, /requestedVendorTemplateId/, "Carrier CRM must re-read the current template route after asynchronous capability discovery");
for (const field of ['lifecycle_status', 'template_version', 'created_by_user_id', 'updated_by_user_id', 'archived_at']) {
  assert.match(carrierTemplateMigration, new RegExp(field), `carrier template migration must define ${field}`);
}
assert.match(carrierTemplateMigration, /segment_type\s*=\s*'participant_template'/);
assert.match(carrierTemplateMigration, /workspace_identity_aliases/);
assert.match(carrierTemplateMigration, /search_workspace_vendors_keyset\([\s\S]+security invoker/, "Carrier template migration should add the fixed-snapshot vendor search keyset RPC as security invoker");
assert.match(carrierTemplateMigration, /revoke execute on function public\.search_workspace_vendors_keyset[\s\S]+from public, anon, authenticated;[\s\S]+grant execute[\s\S]+to service_role;/, "Vendor search keyset RPC should be callable only by the service role");
assert.match(carrierTemplateMigration, /create table if not exists public\.carrier_template_materialization_operations[\s\S]+id uuid primary key[\s\S]+organization_id text not null[\s\S]+rfx_event_id uuid not null[\s\S]+template_id uuid not null[\s\S]+template_version bigint not null[\s\S]+lane_ids uuid\[\] not null[\s\S]+selected_vendor_ids uuid\[\] not null[\s\S]+actor_user_id text not null[\s\S]+actor_email text not null[\s\S]+status text not null/i, "Carrier template materialization must journal immutable server-resolved operation context");
assert.match(carrierTemplateMigration, /check \(status in \('pending', 'mutation_issued', 'reconciled', 'reconcile_required', 'rejected'\)\)/i, "Materialization lifecycle must persist mutation_issued between pending and final reconciliation");
assert.match(carrierTemplateMigration, /alter table public\.carrier_template_materialization_operations enable row level security/i, "Materialization journal must enable RLS in the exposed public schema");
assert.match(carrierTemplateMigration, /revoke all on table public\.carrier_template_materialization_operations from public, anon, authenticated;[\s\S]+grant select, insert, update on table public\.carrier_template_materialization_operations to service_role;/i, "Materialization journal must be service-role only");
assert.match(carrierTemplateMigration, /alter table public\.rfx_lane_vendors[\s\S]+add column if not exists carrier_template_materialization_operation_id uuid[\s\S]+references public\.carrier_template_materialization_operations\(id\)/i, "RFx participants must retain durable materialization attribution");
assert.match(carrierTemplateMigration, /create index if not exists rfx_lane_vendors_carrier_template_materialization_operation_idx[\s\S]+carrier_template_materialization_operation_id/i, "Participant operation attribution needs a lookup index");
assert.match(carrierTemplateMigration, /create index if not exists carrier_template_materialization_operations_rfx_event_idx\s+on public\.carrier_template_materialization_operations\s*\(rfx_event_id(?:\s*,|\s*\))/i, "Materialization journal RFx foreign-key lookups need an index beginning with rfx_event_id");
assert.match(carrierTemplateMigration, /raise exception/i);
assert.match(carrierTemplateMigration, /select organization_id, public\.rateware_vendor_search_key\(segment_name\) as normalized_segment_name[\s\S]+group by organization_id, public\.rateware_vendor_search_key\(segment_name\)/i, "Carrier template legacy duplicate preflight must use the canonical SQL search key");
assert.match(carrierTemplateMigration, /create unique index vendor_segments_participant_template_org_name_uidx[\s\S]+\(organization_id, public\.rateware_vendor_search_key\(segment_name\)\)[\s\S]+where segment_type = 'participant_template'/i, "Carrier template uniqueness must use the same canonical SQL search key as the API");
assert.doesNotMatch(carrierTemplateMigration, /organization_id, lower\(btrim\(segment_name\)\)/i, "Carrier template uniqueness must not retain the narrower legacy lower-trim key");
const legacyVendorSegmentPolicyDrop = carrierTemplateMigration.indexOf('drop policy if exists "authenticated users can read vendor segments" on public.vendor_segments');
assert.ok(legacyVendorSegmentPolicyDrop >= 0, "Carrier template migration must drop the legacy permissive vendor_segments read policy");
assert.doesNotMatch(carrierTemplateMigration, /create policy[\s\S]+on public\.vendor_segments[\s\S]+to authenticated/i, "Carrier template migration must not recreate authenticated browser access to vendor_segments");
assert.match(carrierTemplateMigration, /revoke all on table public\.vendor_segments from public, anon, authenticated;[\s\S]+revoke all on table public\.vendor_segments from service_role;[\s\S]+grant select, insert, update, delete on table public\.vendor_segments to service_role;/i, "Vendor segments must remain service-role only after removing the legacy browser policy");
assert.match(carrierTemplateMigration, /create or replace function public\.rateware_duplicate_carrier_list_template[\s\S]+security invoker[\s\S]+set search_path = ''/i, "Carrier template duplication should use a narrow SECURITY INVOKER RPC");
assert.match(carrierTemplateMigration, /from public\.vendor_segments[\s\S]+segment\.organization_id = p_organization_id[\s\S]+segment\.segment_type = 'participant_template'[\s\S]+for update/i, "Carrier template duplication should lock the organization-scoped participant source row");
const carrierTemplateDuplicateRpc = carrierTemplateMigration.slice(carrierTemplateMigration.indexOf("create or replace function public.rateware_duplicate_carrier_list_template"));
for (const outcome of ["success", "not_found", "version_conflict", "name_conflict"]) {
  assert.match(carrierTemplateDuplicateRpc, new RegExp(`outcome := '${outcome}'`), `Carrier template duplicate RPC should expose the stable ${outcome} outcome`);
}
assert.match(carrierTemplateDuplicateRpc, /if source_template\.template_version <> p_expected_version[\s\S]+outcome := 'version_conflict'[\s\S]+insert into public\.vendor_segments/i, "Carrier template duplication must return before insert when the locked source version is stale");
assert.match(carrierTemplateDuplicateRpc, /insert into public\.vendor_segments[\s\S]+lifecycle_status[\s\S]+vendor_ids[\s\S]+template_version[\s\S]+values[\s\S]+'draft'[\s\S]+source_template\.vendor_ids[\s\S]+1/i, "Carrier template duplication should preserve ordered membership in a new draft at version 1");
assert.match(carrierTemplateDuplicateRpc, /exception[\s\S]+when unique_violation[\s\S]+outcome := 'name_conflict'/i, "Concurrent duplicate names should map to a stable RPC outcome");
assert.match(carrierTemplateDuplicateRpc, /revoke execute[\s\S]+from public, anon, authenticated[\s\S]+grant execute[\s\S]+to service_role/i, "Only the server service role should execute the duplicate RPC");
assert.match(apiSource, /supabase\.rpc\("rateware_duplicate_carrier_list_template"/, "The duplicate API must delegate the locked version-and-copy transaction to the RPC");
const carrierTemplateDuplicateApi = apiSource.slice(apiSource.indexOf('if (action === "duplicate_carrier_list_template")'), apiSource.indexOf('if (action === "archive_carrier_list_template"'));
assert.doesNotMatch(carrierTemplateDuplicateApi, /loadCarrierTemplate|\.from\("vendor_segments"\).*insert/s, "The duplicate API must not recreate an unlocked read-then-insert flow");
const carrierTemplateNameConflictMatcher = apiSource.slice(apiSource.indexOf("function carrierTemplateNameDatabaseConflict"), apiSource.indexOf("function carrierTemplateDuplicateNameResult"));
assert.match(carrierTemplateNameConflictMatcher, /databaseError\.message[\s\S]+databaseError\.details/, "Expected template-name conflicts should recognize production-shaped PostgREST message or details fields");
assert.match(carrierTemplateNameConflictMatcher, /message === expectedMessage[\s\S]+unique constraint/, "Template-name conflict matching should require the exact quoted PostgREST message and reject other named constraints before details fallback");
assert.ok(carrierTemplateNameConflictMatcher.includes("/^Key \\(organization_id, rateware_vendor_search_key"), "Template-name conflict fallback should require the exact PostgREST details key label");
assert.doesNotMatch(carrierTemplateNameConflictMatcher, /databaseError\.constraint|constraint_name/, "Template-name conflict matching should not depend on synthetic constraint fields omitted by PostgREST");
assert.match(carrierTemplateMigration, /cardinality\(new\.vendor_ids\)/i);
assert.match(carrierTemplateMigration, /from public\.vendor_segments segment[\s\S]+?unnest\(segment\.vendor_ids\)[\s\S]+?carrier template migration blocked: % participant templates contain duplicate vendor_ids/i, "Carrier template migration must fail closed when a legacy template has duplicate member UUIDs");
assert.match(carrierTemplateMigration, /from public\.vendor_segments segment[\s\S]+?public\.vendors v[\s\S]+?v\.id = any\(segment\.vendor_ids\)[\s\S]+?v\.organization_id is distinct from segment\.organization_id[\s\S]+?carrier template migration blocked: % participant templates include members from another organization/i, "Carrier template migration must fail closed when an existing member belongs to another organization");
assert.match(apiSource, /coverage_filter: coverageFilter/, "Vendor segment API should persist coverage filters");
assert.match(vendorsSource, /segment\.coverage_filter/, "Vendor saved lists should apply coverage filters in the UI");
assert.match(vendorProfileRequestsMigration, /create table if not exists public\.vendor_profile_requests/, "Carrier profile requests should have a token table");
assert.match(vendorProfileRequestsMigration, /request_token text not null/, "Carrier profile requests should store a secure request token");
assert.match(vendorProfileTokenMigration, /add column if not exists request_token_hash text/, "Carrier profile requests should add a hashed token column");
assert.match(vendorProfileTokenMigration, /alter column request_token drop not null/, "Legacy carrier profile tokens should be nullable during migration");
assert.match(vendorProfileTokenMigration, /vendor_profile_requests_token_hash_unique_idx/, "Carrier profile token hashes should be unique");
assert.match(carrierProfileApiSource, /async function hashRequestToken/, "Carrier profile API should hash incoming tokens before lookup");
assert.match(carrierProfileApiSource, /eq\("request_token_hash", tokenHash\)/, "Carrier profile API should resolve new links by token hash");
assert.match(carrierProfileApiSource, /eq\("request_token", token\)[\s\S]+request_token_hash: tokenHash/, "Carrier profile API should lazily migrate legacy plaintext links");
assert.doesNotMatch(apiSource.slice(apiSource.indexOf("body.action === \"create_vendor_profile_request\""), apiSource.indexOf("body.action === \"revoke_vendor_profile_request\"")), /request_token: requestToken/, "New carrier profile requests must not persist plaintext tokens");
assert.match(apiSource, /hashVendorProfileRequestToken\(requestToken\)/, "Rateware API should hash generated carrier profile tokens");
assert.match(apiSource, /body\.action === "create_vendor_profile_request"/, "Carrier CRM should create carrier profile request tokens");
assert.match(vendorServiceSource, /createVendorProfileRequest/, "Vendor service should expose profile request creation");
assert.match(vendorServiceSource, /lightweight = false/, "Vendor service should expose lightweight CRM loading for Bid Room selectors");
assert.match(vendorsSource, /fetchVendors\(\{[\s\S]*lightweight: true,[\s\S]*limit: vendorPageSize/, "Carrier CRM directory should load vendors through the lightweight path");
const vendorFunnelMoveSource = vendorsSource.slice(vendorsSource.indexOf("async function moveVendorFunnelStage"), vendorsSource.indexOf("function setVendorFunnelBulkBusy"));
assert.match(vendorFunnelMoveSource, /applyVendorUpdateToFunnel/, "Vendor Pipeline stage moves should update the kanban locally");
assert.doesNotMatch(vendorFunnelMoveSource, /loadVendorFunnel\(/, "Vendor Pipeline stage moves should not reload the whole funnel");
const vendorDrawerSaveSource = vendorsSource.slice(vendorsSource.indexOf("async function saveDrawerChanges"), vendorsSource.indexOf("drawerArchiveButton.addEventListener"));
assert.match(vendorDrawerSaveSource, /applyVendorUpdateToFunnel/, "Vendor drawer saves should refresh funnel cards from local state");
assert.doesNotMatch(vendorDrawerSaveSource, /loadVendors\(/, "Vendor drawer saves should not reload the whole Carrier CRM directory");
const vendorDrawerLogoSource = vendorsSource.slice(vendorsSource.indexOf("async function handleDrawerLogoUpload"), vendorsSource.indexOf("async function copyVendorProfileLink"));
assert.match(vendorDrawerLogoSource, /const vendorId = activeDrawerVendorId;[\s\S]+const contextVersion = vendorDrawerContextVersion;/, "Vendor drawer logo upload should capture the open vendor context");
assert.match(vendorDrawerLogoSource, /activeDrawerVendorId !== vendorId \|\| vendorDrawerContextVersion !== contextVersion/, "Vendor drawer logo upload should ignore stale completions after the drawer changes");
assert.match(vendorDrawerLogoSource, /uploadVendorLogo\(vendorId,/, "Vendor drawer logo upload should use the captured vendor id");
const vendorDrawerClickSource = vendorsSource.slice(vendorsSource.indexOf("drawer.addEventListener(\"click\""), vendorsSource.indexOf("function refreshDrawerIdentity"));
assert.match(vendorDrawerClickSource, /const vendorId = activeDrawerVendorId;[\s\S]+const contextVersion = vendorDrawerContextVersion;[\s\S]+loadDrawerVendorSupport\(vendorId\);[\s\S]+loadDrawerVendorRelationship\(vendorId\);/, "Vendor drawer support ticket updates should stay scoped to the open vendor context");
assert.match(vendorDrawerClickSource, /replaceBouncedVendorEmail\(vendorId, \{ bouncedEmail, replacementEmail \}\)/, "Vendor bounced email replacement should use the captured vendor id");
assert.match(vendorDrawerClickSource, /activeDrawerVendorId !== vendorId \|\| vendorDrawerContextVersion !== contextVersion/, "Vendor drawer async click actions should ignore stale completions after the drawer changes");
assert.match(vendorsSource, /const vendorCellSaveQueues = new Map\(\)/, "Carrier CRM should serialize overlapping saves for the same cell");
assert.match(vendorsSource, /vendorCellSaveVersions\.get\(saveKey\) !== saveVersion/, "Carrier CRM should ignore stale cell-save completions");
assert.match(vendorsSource, /loadVersion !== vendorDrawerSupportLoadVersion \|\| activeDrawerVendorId !== vendorId/, "Carrier CRM support should stay scoped to the open vendor drawer");
assert.match(vendorsSource, /if \(vendorFunnelMutationIds\.has\(vendorId\)\) return false/, "Carrier CRM should reject duplicate per-vendor funnel moves");
assert.match(rfxEventsSource, /fetchVendors\(\{ limit: CRM_VENDOR_INITIAL_PAGE_SIZE, offset: 0, view: "all", lightweight: true \}\)/, "Bid Room should load a responsive initial Carrier CRM page through the lightweight vendor path");
assert.match(rfxEventsSource, /function loadVendorSearchOptions/, "Bid Room should search the full CRM on participant search input");
assert.match(rfxEventsSource, /const CRM_VENDOR_PAGE_SIZE = 1000;/, "Bid Room should load CRM candidates in larger lightweight pages");
assert.match(rfxEventsSource, /const CRM_VENDOR_SEARCH_LIMIT = 1000;/, "Bid Room participant search should request enough CRM matches for large carrier bases");
assert.match(rfxEventsSource, /fetchVendors\(\{ limit: CRM_VENDOR_SEARCH_LIMIT, offset: 0, view: "all", lightweight: true, search: term \}\)/, "Bid Room participant search should call the CRM search endpoint with the large lightweight limit");
assert.match(rfxEventsSource, /const vendorOptionCache = new Map\(\)/, "Bid Room should preserve selected CRM carriers outside the current search result");
assert.doesNotMatch(rfxEventsSource, /selectedManualVendorIdsState = new Set\(\[\.\.\.selectedManualVendorIdsState\]\.filter\(/, "Changing the CRM search must not discard selected bid participants");
assert.match(rfxEventsSource, /vendorSearchRows = sortedVendorOptions\(rows\)/, "Bid Room should render server-side CRM search results instead of waiting for the complete CRM preload");
assert.match(rfxEventsSource, /async function hydrateRemainingVendorOptions[\s\S]+limit: CRM_VENDOR_PAGE_SIZE/, "Bid Room should hydrate further Carrier CRM pages in the background after the initial page is usable");
assert.match(vendorServiceSource, /ids = \[\]/, "Vendor service should support resolving retained participant and Carrier Fit template IDs without relying on the visible list");
assert.match(listVendorsSource, /const requestedIds = normalizeUuidList\(body\.ids \|\| body\.vendor_ids\)/, "Vendor API should support owner-scoped vendor resolution by ID");
assert.match(rfxEventsSource, /async function hydrateVendorOptionIds\(ids = \[\], \{ guard = null \} = \{\}\)/, "Bid Room should hydrate retained manual participant IDs from Carrier CRM with an optional stale-operation guard");
assert.match(rfxEventsSource, /ids: requestedIds\.slice\(offset, offset \+ CRM_VENDOR_SEARCH_LIMIT\)/, "Retained participant hydration should use bounded CRM requests");
assert.match(rfxEventsSource, /async function loadManualScopeCandidateRows\(scopeId = selectedManualScopeId\(\), \{ guard = null \} = \{\}\)/, "Bid Room should resolve the manual all-active or procurement scope before selecting carriers with an optional legacy guard");
assert.match(rfxEventsSource, /base_stage: "procurement"[\s\S]*lightweight: true/, "Procurement participant loading should use the server-side CRM procurement filter");
assert.match(rfxEventsSource, /loadManualScopeCandidateRows\(scopeId, \{ guard: legacyGuard \}\)[\s\S]*selectManualVendorIds\(rows\.map\(\(vendor\) => vendor\.id\)\)/, "Selecting a manual Carrier CRM scope should hydrate guarded rows before selecting carrier ids");
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
assert.match(rfxEventsHtml, /rfx-event-filter-search/, "Bid Room should expose a compact event search control");
assert.match(rfxEventsHtml, /rfx-event-status-filter/, "Bid Room should expose event status filtering");
assert.match(rfxEventsHtml, /rfx-event-view-select/, "Bid Room should expose saved event views");
assert.match(rfxEventsSource, /function filteredRfxEvents/, "Bid Room should filter the loaded event list before rendering");
assert.match(rfxEventsSource, /function saveCurrentRfxEventView/, "Bid Room should persist named event filter views");
assert.match(rfxEventsSource, /RFX_EVENT_VIEWS_STORAGE_KEY/, "Bid Room saved event views should use isolated browser storage");
assert.match(rfxEventsSource, /event\.rfx_id \|\| "RFx"/, "Bid Room event tabs should display only the compact RFx ID");
assert.match(rfxEventsSource, /<dt>Customer<\/dt>[\s\S]*?<dt>Type<\/dt>[\s\S]*?<dt>Due date<\/dt>[\s\S]*?<dt>Lanes<\/dt>[\s\S]*?<dt>Bids<\/dt>[\s\S]*?<dt>Bid visibility<\/dt>/, "Bid Room event tab popovers should expose the full event summary");
assert.match(rfxEventsSource, /showFloatingEventTooltip/, "Bid Room event tabs should show their summary in an overflow-safe floating tooltip");
assert.match(stylesSource, /\.rfx-event-floating-tooltip \{[\s\S]*?position: fixed/, "Bid Room event summaries should not be clipped by the horizontal tab scroller");
assert.match(stylesSource, /\.bid-room-page \.rfx-event-list > \.rfx-event-card \{[\s\S]*?flex-basis: 128px/, "Bid Room event tabs should stay compact");
assert.match(bidRoomBoardSource, /function publicBiddingAvailable\(row = \{\}\)/, "Public Bid Room should distinguish bid availability from summary visibility");
assert.match(bidRoomBoardSource, /if \(!publicBiddingAvailable\(row\)\)/, "Public Bid Room should remove bid actions from closed or awarded opportunities");
assert.match(rfxBidApiSource, /\.in\("status", \["open", "closed", "awarded"\]\)/, "Public Bid Room should exclude draft events from carrier-facing opportunities");
assert.match(rfxBidApiSource, /is_bid_available: boardStatus === "live"/, "Public Bid Room API should expose live bidding separately from opportunity status");
assert.match(rfxBidApiSource, /if \(eventStatus !== "open" \|\| publicBidBoardState\(event\) !== "live"\)/, "Public invitation requests should require an open live event");
// Deliberately reversed: the fourth workspace is gone. Four parallel tabs named
// after system nouns gave the carrier no order and no sense of progress.
assert.match(rfxBidSource, /data-private-workspace-tab="master"/, "Phase 1 (the business) should exist");
assert.match(rfxBidSource, /data-private-workspace-tab="bids"/, "Phase 2 (your lanes) should exist");
assert.match(rfxBidSource, /data-private-workspace-tab="award"/, "Phase 3 (result) should exist");
assert.match(rfxBidSource, /data-private-workspace-panel="award"[\s\S]*id="carrier-bid-history"/, "Offer history should live in the Result phase");
assert.match(rfxBidSource, /renderBidSupportAgent\(\);[\s\S]+setPrivateWorkspace\(activePrivateWorkspace\)/, "Private Bid Room should initialize workspace visibility after rendering support");
// The column count is now derived from however many phases render — pinning it
// left an empty column the moment the fourth tab was folded in.
// [^}]* keeps the match inside this rule; [\s\S]*? would run past the closing
// brace and hit an unrelated repeat(4) elsewhere in the stylesheet.
assert.match(stylesSource, /\.bid-portal-shell \.bid-private-workspace-tabs \{[^}]*grid-auto-flow: column/, "Phase tabs should size themselves to the number of phases");
assert.doesNotMatch(stylesSource, /\.bid-portal-shell \.bid-private-workspace-tabs \{[^}]*grid-template-columns: repeat\(4/, "Phase tabs must not pin a four-column layout");
const privateWorkspaceTabsStart = rfxBidSource.indexOf('<nav class="bid-private-workspace-tabs"');
const privateWorkspaceTabsEnd = rfxBidSource.indexOf("</nav>", privateWorkspaceTabsStart);
const privateWorkspaceTabsSource = rfxBidSource.slice(privateWorkspaceTabsStart, privateWorkspaceTabsEnd);
assert.doesNotMatch(privateWorkspaceTabsSource, /<small>/, "Private Bid Room tabs should use concise labels and move explanations to accessible tooltips.");
assert.match(stylesSource, /Carrier portal Fleet Rocket-inspired polish/, "Carrier portal should retain the scoped dense visual pass.");
assert.match(stylesSource, /\.bid-portal-shell \.quick-bid-more-actions-menu/, "Secondary Bid Tools actions should use a compact scoped menu.");
assert.match(stylesSource, /\.bid-portal-header #bid-support-agent\.bid-support-widget \{[\s\S]*position: relative/, "Private Bid Room bid assistant should sit in the upper header flow");
assert.match(rfxEventsSource, /function rfxCarrierFitTerms/, "Carrier fit should normalize operational and equipment language before filtering CRM candidates");
assert.match(rfxEventsSource, /data-rfx-outreach-show-all-active/, "Carrier fit empty states should provide a direct active CRM fallback");
assert.match(apiSource, /fetchBiVendorMetricsSafe/, "Carrier recommendations should remain available from CRM when Rateware metric RPCs are unavailable");
assert.match(rfxEventsSource, /rfx_carrier_fit: true/, "Carrier fit should use the bounded RFx evidence path instead of the full recommendation workload");
assert.match(apiSource, /fetchBiVendorMetricsForRfxCarrierFit/, "Carrier fit should enforce a bounded Rateware evidence lookup");
assert.match(apiSource, /rfxCarrierFitMode[\s\S]*Promise\.resolve\(\{ summary: \{\}/, "Carrier fit should skip the unused BI summary workload");
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
assert.match(carrierProfileSource, /let carrierProfileSubmitting = false;/, "Carrier profile should block duplicate profile saves");
assert.match(carrierProfileSource, /if \(carrierProfileSubmitting\) return;/, "Carrier profile should ignore duplicate in-flight submits");
assert.match(carrierProfileSource, /const carrierProfileTicketFollowupKeys = new Set\(\);/, "Carrier profile should key ticket follow-up mutations per ticket");
assert.match(carrierProfileSource, /carrierProfileTicketFollowupKeys\.has\(ticketId\)/, "Carrier profile should ignore duplicate ticket follow-ups");
assert.match(carrierProfileSource, /if \(input\) input\.disabled = true;/, "Carrier profile should disable ticket follow-up text while saving");
assert.match(carrierProfileSource, /response_language: currentLanguage/, "Carrier profile submissions should record the response language");
assert.match(carrierProfileApiSource, /patch\.vendor_name = patch\.domain \|\| patch\.primary_email \|\| "Carrier profile"/, "Carrier profile API should allow partial profile saves without requiring a vendor name from the carrier");
assert.match(stylesSource, /carrier-profile-stepper/, "Carrier profile stepper should have dedicated UI styling");
assert.match(stylesSource, /profile-progress-track/, "Carrier profile should show a completion progress bar");
assert.match(carrierProfileApiSource, /Deno\.serve/, "Carrier profile API should be an Edge Function");
assert.match(carrierProfileApiSource, /get_profile/, "Carrier profile API should expose token-scoped profile loading");
assert.match(carrierProfileApiSource, /submit_profile/, "Carrier profile API should expose token-scoped profile submission");
assert.doesNotMatch(carrierProfileApiSource, /requireKindeUser/, "Carrier profile API should not require Kinde for token-scoped access");
assert.match(carrierProfileApiSource, /function publicErrorMessage/, "Carrier profile API should sanitize nested public portal errors");
assert.doesNotMatch(carrierProfileApiSource, /error instanceof Error \? error\.message/, "Carrier profile API should not expose raw caught errors");
assert.match(rfxBidApiSource, /function publicErrorMessage/, "Public Bid Room API should sanitize nested carrier-facing errors");
assert.doesNotMatch(rfxBidApiSource, /return jsonResponse\(\{ error: error\.message \}/, "Public Bid Room API should not expose raw caught errors");

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
assert.match(biRpcIsolationMigration, /btrim\(rate_row\.owner_email\)[\s\S]+is distinct from scoped_owner/, "BI filtering must reject rates outside the requested workspace");
assert.match(biRpcIsolationMigration, /if scoped_owner is null then[\s\S]+return false/, "BI filtering must reject an empty workspace owner");
assert.match(biFilterPerformanceMigration, /if filters = '\{\}'::jsonb then[\s\S]+return true/, "BI filtering should return immediately when no dimensions are filtered");
assert.match(biFilterPerformanceMigration, /from jsonb_object_keys\(filters\) as active\(key\)/, "BI filtering should iterate only over active request filters");
assert.doesNotMatch(biFilterPerformanceMigration, /foreach filter_key in array/, "BI filtering must not evaluate every supported dimension for each rate");
assert.match(biFilterPerformanceMigration, /btrim\(rate_row\.owner_email\)[\s\S]+is distinct from scoped_owner/, "Optimized BI filtering must preserve canonical workspace isolation");
assert.match(biSummaryPerformanceMigration, /rs\.owner_email = params\.owner_key/, "BI summary should expose an indexable canonical owner predicate");
assert.match(biSummaryPerformanceMigration, /rs\.status in \('pending_review', 'approved'\)/, "BI summary should prefilter supported rate states before computing metrics");
assert.match(biSummaryPerformanceMigration, /when params\.filters = '\{\}'::jsonb then true/, "BI summary should bypass the row matcher for an unfiltered request");
assert.match(biSummaryPerformanceMigration, /filtered as materialized[\s\S]+text_prepared as materialized[\s\S]+prepared as materialized/, "BI summary should materialize reusable row calculations once");
assert.doesNotMatch(biSummaryPerformanceMigration, /rateware_bi_metric_value\(/, "BI summary should not repeatedly parse the same rate through the generic metric helper");
assert.match(biFactsMigration, /create table if not exists public\.rateware_bi_rate_facts/, "BI should persist precomputed rate facts for interactive queries");
assert.match(biFactsMigration, /rateware_bi_facts_owner_status_idx/, "BI facts should be indexed by canonical workspace and rate state");
assert.match(biFactsMigration, /create trigger rateware_bi_rate_fact_sync/, "BI facts should synchronize when staging rates change");
assert.match(biFactsMigration, /create trigger rateware_bi_vendor_fact_sync/, "BI vendor labels should synchronize when the Carrier CRM changes");
assert.match(biFactsMigration, /from public\.rateware_bi_rate_facts facts/, "BI summary and vendor metrics should read precomputed facts");
assert.match(biFactsMigration, /revoke all on table public\.rateware_bi_rate_facts from public, anon, authenticated/, "BI facts must remain backend-only");
assert.doesNotMatch(biFactsMigration, /sales@heymarksman\.com|kp_[a-z0-9]+|org_[a-z0-9]+/, "BI fact backfill must not hardcode tenant identities");
assert.match(biFactSemanticsMigration, /has_vendor_reference boolean not null default false/, "BI facts should preserve whether the source supplied a vendor reference");
assert.match(biFactSemanticsMigration, /missing_vendor'[\s\S]+vendor_id is null and has_vendor_reference/, "Cached BI summary should preserve the previous missing-vendor definition");
assert.match(biFactSemanticsMigration, /create trigger rateware_bi_fact_vendor_reference_sync/, "Vendor-reference semantics should stay synchronized after rate edits");
for (const functionName of ["rateware_bi_pivot_for_owner", "rateware_bi_drilldown_for_owner", "rateware_bi_geo_density_for_owner"]) {
  assert.match(biInteractivePerformanceMigration, new RegExp(`create or replace function public\\.${functionName}`), `${functionName} should be replaced by the cached implementation`);
  assert.match(biInteractivePerformanceMigration, new RegExp(`revoke all on function public\\.${functionName}[\\s\\S]+?from public, anon, authenticated`), `${functionName} must remain backend-only`);
}
assert.match(biInteractivePerformanceMigration, /from public\.rateware_bi_rate_facts facts/g, "Pivot, drilldown, and geo density should read cached facts");
assert.doesNotMatch(biInteractivePerformanceMigration, /rateware_bi_rate_matches_filters\(/, "Interactive BI RPCs should not call the wide staging-row matcher");
assert.match(biProjectionPerformanceMigration, /and metric in \('mx_linehaul', 'us_linehaul', 'fsc', 'border_crossing_fee'\)/, "Pivot should join the source rate only for uncached component metrics");
assert.match(biProjectionPerformanceMigration, /array_remove\(array\[[\s\S]+row_dimensions\[1\]/, "Pivot and drilldown should project requested dimensions without per-row lateral aggregates");
assert.match(biProjectionPerformanceMigration, /selected_row_values text\[\]/, "Drilldown variables should not collide with projected column names");
assert.doesNotMatch(biProjectionPerformanceMigration, /cross join lateral/, "Tuned pivot and drilldown should avoid per-row lateral aggregates");
assert.match(biComponentMetricMigration, /add column if not exists mx_linehaul_amount numeric/, "BI facts should cache split-rate component metrics");
assert.match(biComponentMetricMigration, /when 'border_crossing_fee' then filtered\.border_crossing_fee_amount/, "Pivot should read every supported component metric from the cache");
assert.doesNotMatch(biComponentMetricMigration, /join public\.rate_staging source/, "Cached pivot should not join the wide staging table");
assert.match(biPivotCellMigration, /row_cells as materialized/, "Pivot should aggregate all row cells in one pass");
assert.match(biPivotCellMigration, /cross join ordered_columns[\s\S]+left join cell_groups/, "Pivot cell construction should avoid a correlated subquery per row");
assert.doesNotMatch(biPivotCellMigration, /select jsonb_object_agg[\s\S]+cell_groups\.row_key = row_totals\.row_key/, "Pivot output should not rebuild cells through a per-row correlated select");
assert.match(biSummaryVendorPerformanceMigration, /vendor_label text generated always as/, "BI facts should expose a compact carrier label outside the wide dimensions JSON");
assert.match(biSummaryVendorPerformanceMigration, /missing_origin boolean generated always as/, "BI facts should cache origin completeness for summary reads");
assert.match(biSummaryVendorPerformanceMigration, /rateware_bi_facts_summary_cover_idx[\s\S]+include/, "BI summary should use a narrow covering index");
assert.match(biSummaryVendorPerformanceMigration, /rateware_bi_facts_vendor_metrics_cover_idx[\s\S]+include/, "Carrier metrics should use a narrow covering index");
assert.match(biSummaryVendorPerformanceMigration, /if filters = '\{\}'::jsonb then[\s\S]+count\(distinct facts\.vendor_label\)/, "Unfiltered BI summary should avoid reading the dimensions JSON");
assert.match(biSummaryVendorPerformanceMigration, /if filters = '\{\}'::jsonb then[\s\S]+facts\.origin_market_label[\s\S]+group by matched\.resolved_vendor_id/, "Unfiltered carrier metrics should aggregate compact projection columns");
assert.doesNotMatch(biSummaryVendorPerformanceMigration, /select[\s\S]+facts\.\*[\s\S]+if filters = '\{\}'::jsonb/, "Unfiltered BI fast paths should not materialize the full fact row");
assert.match(biSummaryVendorPerformanceMigration, /revoke all on function public\.rateware_bi_summary_for_owner[\s\S]+from public, anon, authenticated/, "Optimized BI summary must remain backend-only");
assert.match(biSummaryVendorPerformanceMigration, /grant execute on function public\.rateware_bi_vendor_metrics_for_owner[\s\S]+to service_role/, "Optimized carrier metrics must remain available to the trusted API");
assert.match(biRuntimeFilterMigration, /rateware_bi_summary_for_owner[\s\S]+rateware_bi_geo_density_for_owner/, "Every BI fact-scanning RPC should receive the runtime filter optimization");
assert.match(biRuntimeFilterMigration, /filters - array\['search', 'crossborder', 'd2d'\]::text\[\] = '\{\}'::jsonb/, "Reserved-only BI filters should bypass dynamic dimension iteration");
assert.match(biRuntimeFilterMigration, /not coalesce\(\(filters ->> 'crossborder'\)::boolean, false\)[\s\S]+facts\.is_crossborder/, "Crossborder filtering should remain a direct fact-column predicate");
assert.match(biRuntimeFilterMigration, /if rewritten = definition then[\s\S]+raise exception/, "BI runtime migration should fail closed if an expected RPC predicate changes");
assert.doesNotMatch(biRuntimeFilterMigration, /sales@heymarksman\.com|org_[a-z0-9]+/, "BI runtime optimization must not hardcode a tenant identity");
assert.match(businessIntelligenceSource, /async function loadBiView\(view\)/, "Analyze should have a lazy view loader");
assert.match(businessIntelligenceSource, /await loadBiView\(initialBiView\)/, "Analyze should load only its initial visible workspace");
assert.doesNotMatch(businessIntelligenceSource, /Promise\.all\(\[runPivot\(\), runGeoDensity\(\)\]\)/, "Analyze must not run pivot and geo aggregation concurrently on startup");
assert.match(biGeoProjectionMigration, /with filtered as materialized[\s\S]+facts\.rate_id[\s\S]+origin_location[\s\S]+destination_location/, "Geo density should materialize only its geographic projection");
assert.doesNotMatch(biGeoProjectionMigration, /select facts\.\*/, "Geo density must not spill the complete BI fact row to temporary storage");
assert.match(biGeoProjectionMigration, /filtered_summary as materialized/, "Geo density should calculate reusable summary totals once");
assert.match(biGeoProjectionMigration, /revoke all on function public\.rateware_bi_geo_density_for_owner[\s\S]+from public, anon, authenticated/, "Optimized geo density must remain backend-only");
assert.match(biGeoMemoryMigration, /alter function public\.rateware_bi_geo_density_for_owner[\s\S]+set work_mem to '32MB'/, "The geo work_mem trial should remain auditable in migration history");
assert.match(biGeoMemoryRevertMigration, /alter function public\.rateware_bi_geo_density_for_owner[\s\S]+reset work_mem/, "Geo aggregation should restore the database work_mem after production plan regression");
for (const functionName of [
  "rateware_bi_rate_matches_filters",
  "rateware_bi_pivot_for_owner",
  "rateware_bi_drilldown_for_owner",
  "rateware_bi_geo_density_for_owner",
  "rateware_bi_summary_for_owner",
  "rateware_bi_vendor_metrics_for_owner"
]) {
  assert.match(
    biRpcIsolationMigration,
    new RegExp(`revoke all on function public\\.${functionName}[\\s\\S]+?from public, anon, authenticated`),
    `${functionName} must not be callable by browser roles`
  );
  assert.match(
    biRpcIsolationMigration,
    new RegExp(`grant execute on function public\\.${functionName}[\\s\\S]+?to service_role`),
    `${functionName} must remain callable by the trusted API`
  );
}

const vendorIntelligenceSource = apiSource.slice(apiSource.indexOf("async function buildVendorIntelligence"), apiSource.indexOf("function vendorEffectiveFunnelStage"));
assert.ok(vendorIntelligenceSource.length > 100, "vendor intelligence helper should be present");
assert.match(vendorIntelligenceSource, /fetchVendorRateMetricsSafe/, "Vendor Intelligence should not fail the full view when quote metrics are unavailable");
assert.match(vendorIntelligenceSource, /warnings: \[\.\.\.metricsResult\.warnings, \.\.\.bidMetricsResult\.warnings\]/, "Vendor Intelligence should return partial-load warnings from rates and Bid Room activity");
assert.match(apiSource, /async function fetchVendorIntelligenceVendors/, "Vendor Intelligence should page vendor loading separately from scoring");
assert.match(apiSource, /async function fetchVendorIntelligenceVendors[\s\S]+\.order\("created_at", \{ ascending: false \}\)[\s\S]+\.order\("id", \{ ascending: false \}\)/, "Vendor Intelligence pagination should use a stable secondary ID order");
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
assert.match(vendorFunnelSource, /fetchAllCarrierIntelligenceVendors\(supabase, user, \{ base_stage: "procurement" \}\)/, "Procurement Funnel should page the complete Procurement Base instead of using a fixed vendor sample");
assert.doesNotMatch(vendorFunnelSource, /\.limit\(5000\)/, "Procurement Funnel should not truncate carriers after 5,000 records");
assert.match(vendorFunnelSource, /warnings: \[\.\.\.metricsResult\.warnings, \.\.\.bidMetricsResult\.warnings\]/, "Procurement Pipeline should return partial-load warnings from rates and Bid Room activity");
assert.doesNotMatch(
  vendorFunnelSource,
  /fetchBusinessIntelligenceRows/,
  "Procurement Pipeline should not load raw BI rate rows in the Edge Function"
);
assert.match(vendorLifecycleUnificationMigration, /function public\.rateware_promote_vendor_lifecycle/, "Vendor lifecycle unification should promote a vendor from linked activity");
assert.match(vendorLifecycleUnificationMigration, /when current_rank >= required_rank then coalesce\(current_stage, 'targeted'\)/, "Lifecycle promotion must never demote a vendor already in a later funnel stage");
assert.match(vendorLifecycleUnificationMigration, /base_stage <> 'archived'/, "Archived vendors must not be reintroduced into Procurement from rate or RFx activity");
assert.match(vendorLifecycleUnificationMigration, /rateware_sync_vendor_lifecycle_from_rfx_lane_vendor/, "Bid Room shortlist, invitation, and bid activity should synchronize the vendor lifecycle");
assert.match(vendorLifecycleUnificationMigration, /after insert or update of vendor_id, invitation_status, bid_rate on public\.rfx_lane_vendors/, "RFx lifecycle synchronization should run for shortlist and bid changes");
assert.match(vendorLifecycleUnificationMigration, /rateware_sync_vendor_lifecycle_from_rate_staging/, "Matched staged rates should synchronize the vendor lifecycle");
assert.match(vendorLifecycleUnificationMigration, /after insert or update of vendor_id, status on public\.rate_staging/, "Rate lifecycle synchronization should react to linked rate changes");
assert.match(vendorLifecycleUnificationMigration, /for signal_row in[\s\S]*from public\.rfx_lane_vendors/, "Existing Bid Room activity should be reconciled into the CRM lifecycle");
assert.match(vendorLifecycleUnificationMigration, /for signal_row in[\s\S]*from public\.rate_staging/, "Existing staged-rate links should be reconciled into the CRM lifecycle");
assert.match(apiSource, /async function fetchVendorBidMetrics/, "CRM services should load Bid Room activity by vendor");
assert.match(vendorPagePerformanceMigration, /join public\.rfx_events events[\s\S]+events\.owner_email/, "Bid Room metrics should be scoped through owned RFx events");
assert.match(apiSource, /bid_metrics: bidMetrics/, "Vendor Intelligence should expose linked Bid Room activity without replacing rate metrics");
assert.match(vendorFunnelSource, /fetchVendorBidMetricsSafe/, "Procurement Pipeline should include Bid Room activity when calculating its funnel");
assert.match(apiSource, /Number\(bidMetrics\.quoted \|\| 0\) > 0/, "A carrier quote in Bid Room should count as nested procurement activity");
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
const vendorOnboardingCorrectionsSource = apiSource.slice(apiSource.indexOf("async function findVendorForOnboardingCorrection"), apiSource.indexOf("function normalizeImportedVendor"));
assert.ok(vendorOnboardingCorrectionsSource.length > 100, "vendor onboarding correction helper should be present");
assert.match(vendorOnboardingCorrectionsSource, /findVendorForOnboardingCorrection/, "gap correction imports should match existing vendors first");
assert.match(vendorOnboardingCorrectionsSource, /vendorReferenceValues/, "gap correction imports should resolve vendors by domain, email, legal name, or commercial name");
assert.match(vendorOnboardingCorrectionsSource, /resolveVendorReferencesFromRows/, "gap correction imports should use the shared deterministic vendor matcher");
assert.match(vendorOnboardingCorrectionsSource, /seenCorrectionVendorIds/, "gap correction imports should reject duplicate corrections for the same carrier");
assert.match(vendorOnboardingCorrectionsSource, /Duplicate vendor correction row in this file/, "gap correction imports should return a clear duplicate-carrier error");
assert.match(vendorOnboardingCorrectionsSource, /correctionErrorRow/, "gap correction imports should return structured row-level error diagnostics");
assert.match(vendorOnboardingCorrectionsSource, /source_row_number/, "gap correction errors should preserve the source row number");
assert.match(vendorOnboardingCorrectionsSource, /errors_truncated/, "gap correction imports should disclose truncated error exports");
assert.match(vendorOnboardingCorrectionsSource, /error_count/, "gap correction imports should return the full error count");
assert.match(vendorOnboardingCorrectionsSource, /\.update\(patch\)/, "gap correction imports should update existing vendors instead of inserting duplicates");
assert.doesNotMatch(vendorOnboardingCorrectionsSource, /\.insert\(/, "gap correction imports should not insert new vendor records");
assert.match(vendorsSource, /function downloadVendorOnboardingCorrectionErrors/, "Carrier CRM should export onboarding correction errors after failed gap-fix imports");
assert.match(vendorsSource, /vendor-onboarding-correction-errors/, "Carrier CRM should name onboarding correction error downloads clearly");
assert.match(vendorsSource, /\["source_row_number", "vendor_id", "vendor_name", "legal_name", "domain", "primary_email", "error_reason"\]/, "Carrier CRM onboarding correction error CSV should include row and identity columns");
assert.match(vendorsSource, /Only the first \$\{Number\(result\.error_limit/, "Carrier CRM should warn when onboarding correction error CSV is truncated");
assert.match(vendorsSource, /row\?\.legal_name/, "Carrier CRM gap-fix import should accept legal_name as a vendor identifier");
assert.match(vendorsSource, /Keep vendor_id, domain, email, legal_name, or vendor_name/, "Carrier CRM gap-fix import copy should match the supported vendor identifiers");
assert.match(vendorsHtml, /Match by vendor_id, domain, email, legal name, or carrier name/, "Carrier CRM update copy should not claim vendor_id is the only supported match key");
const vendorPatchSource = apiSource.slice(apiSource.indexOf("function normalizeVendorPatch"), apiSource.indexOf("function normalizeSegment"));
assert.ok(vendorPatchSource.length > 100, "vendor patch normalizer should be present");
assert.match(apiSource, /function normalizeVendorProfileData/, "vendors should support structured onboarding profile data");
assert.match(vendorPatchSource, /patch\.profile_data = profileData/, "vendor updates should persist structured onboarding profile data");
assert.match(apiSource, /function mergeVendorProfilePatch/, "partial vendor profile saves should merge only the edited onboarding fields");
assert.match(vendorPatchSource, /input\.profile_data_patch !== undefined/, "vendor updates should accept a partial onboarding profile patch");
assert.match(vendorPatchSource, /vendorProfileDerivedTags\(profileData\)/, "vendor updates should derive CRM tags from onboarding profile data");
assert.match(vendorsHtml, /id="drawer-save-profile-button"/, "the Carrier CRM drawer should provide a dedicated carrier-profile save action");
assert.match(vendorsSource, /function buildDrawerPartialPatch/, "the Carrier CRM drawer should only send fields that changed");
assert.match(vendorsSource, /profile_data_patch = profilePatch/, "the Carrier CRM drawer should submit onboarding edits as a partial profile patch");
assert.doesNotMatch(
  vendorsSource.slice(vendorsSource.indexOf("async function saveDrawerChanges"), vendorsSource.indexOf("drawerArchiveButton.addEventListener")),
  /openVendorDrawer\(nextVendor\.id, \{ mode: "edit" \}\)/,
  "saving a carrier drawer should not reload the drawer or interrupt an in-progress edit"
);
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
const businessIntelligenceRowsSource = apiSource.slice(apiSource.indexOf("async function fetchBusinessIntelligenceRows"), apiSource.indexOf("async function buildBusinessIntelligencePivotFromDb"));
assert.match(businessIntelligenceRowsSource, /\.range\(offset, offset \+ pageSize - 1\)/, "Business Intelligence fallback rows should page the complete workspace dataset");
assert.match(businessIntelligenceRowsSource, /\.order\("id", \{ ascending: false \}\)/, "Business Intelligence fallback rows should use a stable secondary ID order");
assert.doesNotMatch(businessIntelligenceRowsSource, /\.limit\(12000\)/, "Business Intelligence fallback rows must not truncate after 12,000 rates");
assert.match(apiSource, /async function fetchAllCarrierIntelligenceVendors[\s\S]+fetchVendorIntelligenceVendors\(supabase, user, \{ \.\.\.options, limit: pageSize, offset \}\)/, "Carrier Intelligence should paginate the complete vendor CRM while preserving scoped filters");
assert.match(carrierIntelligenceSource, /fetchAllCarrierIntelligenceVendors\(supabase, user\)/, "Carrier Intelligence should use the complete paginated vendor CRM");
assert.doesNotMatch(carrierIntelligenceSource, /\.from\("rate_staging"\)/, "AI Analyst should not query rate_staging directly");
assert.doesNotMatch(carrierIntelligenceSource, /\.limit\(1500\)/, "AI Analyst should not rely on a 1500-row rate sample");
assert.match(stylesSource, /\.bulk-action-bar \{[\s\S]*?overflow-x: auto/, "Spreadsheet bulk actions should scroll inside their own toolbar on narrow laptop layouts");
assert.match(stylesSource, /\.bulk-action-bar\.is-empty \{[\s\S]*?visibility: hidden[\s\S]*?pointer-events: none/, "Spreadsheet bulk actions should reserve layout space while empty to avoid load-state shifts");
assert.match(stylesSource, /\.rateware-workspace \.workbench-header \{[\s\S]*?min-height: 139px/, "Rateware should reserve its final summary height before metrics load");
assert.match(stylesSource, /\.rateware-command-bar \{[\s\S]*?min-height: 111px/, "Rateware should reserve its loaded command bar height before rows arrive");
assert.match(stylesSource, /\.staging-approval-brief \{[\s\S]*?min-height: 197px/, "Staging review should reserve its loaded approval brief height before rows arrive");
assert.match(stylesSource, /\.review-queue-command-bar \{[\s\S]*?min-height: 111px/, "Staging review should reserve its loaded command bar height before rows arrive");
assert.match(stylesSource, /\.bulk-action-bar:has\(\.sheet-more-actions\[open\]\)[\s\S]*?overflow: visible/, "The More actions menu should not be clipped by the compact toolbar");
assert.match(stylesSource, /Mobile Rateware actions:[\s\S]*?\.rateware-command-bar \.bulk-action-bar \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)[\s\S]*?overflow: visible/, "Mobile Rateware actions should remain inside a two-column first-viewport grid");
assert.match(stylesSource, /\.rateware-command-bar \.bulk-scope-strip \{[\s\S]*?width: 100%[\s\S]*?overflow-x: auto/, "Mobile Rateware scope controls should scroll within their own full-width row");
assert.match(stylesSource, /\.rateware-command-bar \.sheet-more-actions > div \{[\s\S]*?width: min\(260px, calc\(100vw - 32px\)\)[\s\S]*?overflow-y: auto/, "Mobile Rateware More actions should fit within the viewport and scroll vertically when needed");
assert.match(stylesSource, /\.bi-layout > \.workspace-panel[\s\S]*?\.bi-drilldown-panel > \.table-wrap[\s\S]*?min-width: 0/, "Analyze tables should stay inside their panel on narrow laptop layouts");
assert.match(stylesSource, /\.bi-drilldown-panel > \.table-wrap[\s\S]*?overflow-x: auto/, "Analyze drilldown should scroll internally instead of expanding the page");
assert.match(stylesSource, /Mobile shell: keep navigation and primary actions in the first viewport/, "The mobile shell should have one compact navigation treatment");
assert.match(platform55ShellCssSource, /\.rw-sidebar[\s\S]*?transform: translateX\(-105%\)/, "Mobile navigation should become an off-canvas Platform55 drawer");
assert.match(stylesSource, /\.page-header \{[\s\S]*?flex-direction: row[\s\S]*?align-items: center/, "Mobile page headers should keep title and actions on one compact row");
assert.match(platform55ShellCssSource, /\.rw-main \{ min-width: 0;/, "Platform55 main content should not widen the document");
assert.match(stylesSource, /\.dashboard-workflow-panel--progress \.section-heading \{[\s\S]*?flex-wrap: wrap/, "Mobile workflow headers should wrap supporting copy instead of overflowing");
assert.match(stylesSource, /\.bi-workbench-nav,[\s\S]*?\.module-workbench-nav \{[\s\S]*?grid-template-columns: repeat\(2/, "Narrow Analyze and workbench navigation should avoid four full-width rows");
assert.match(stylesSource, /\.dashboard-priority-panel \.priority-queue > \.ui-state[\s\S]*?grid-column: 1 \/ -1/, "Dashboard loading and error states should span the full priority queue");
assert.match(appHtml, /id="my-work-list"/, "Command Center should expose a dedicated My Work queue");
assert.match(dashboardSource, /function renderMyWork\(summary\)/, "Command Center should render My Work from the workspace-scoped dashboard summary");
assert.match(dashboardSource, /buildActionList\(summary\)\.slice\(0, 6\)/, "My Work should present a bounded ordered operator queue");
assert.match(dashboardSource, /Could not load your work/, "My Work should expose a retryable error state instead of stale work");
assert.match(stylesSource, /\.my-work-item \{[\s\S]*?grid-template-columns: 24px minmax\(0, 1fr\) auto/, "My Work rows should preserve a flexible central copy column");
assert.match(spreadsheetGridSource, /navigator\.clipboard\?\.writeText/, "Spreadsheet copy should use the modern clipboard API when available");
assert.match(spreadsheetGridSource, /document\.execCommand\?\.\("copy"\)/, "Spreadsheet copy should keep a browser fallback when clipboard permissions are unavailable");
assert.match(spreadsheetGridSource, /fallback\.remove\(\)/, "Spreadsheet copy fallback should clean up its temporary textarea");
assert.match(ratewareSource, /showStarterViews: false/, "Rateware should not surface starter column presets by default");
assert.match(stagingReviewSource, /showStarterViews: false/, "Staging should not surface starter column presets by default");
assert.match(stagingReviewHtml, /id="staging-approval-brief-title"/, "Staging should expose the human approval gate before row actions");
assert.match(readFileSync(new URL("../output/qa-staging-approval-preview.html", import.meta.url), "utf8"), /staging-approval-brief/, "Staging approval QA fixture should exercise the responsive approval gate");
assert.match(stagingReviewHtml, /id="staging-brief-source"/, "Staging should make preserved source evidence visible in the approval gate");
assert.match(stagingReviewSource, /function updateApprovalBrief\(scopedRows = scopedStagingRows\(loadedRows\)\)/, "Staging should derive approval guidance from the current review scope");
assert.match(stagingReviewSource, /Approval remains an explicit human action/, "Staging approval guidance must not imply automatic publication");
assert.match(stagingReviewSource, /selected row\(s\) are retained on other pages/, "Staging approval guidance should disclose selected rows retained across pages before approval");
assert.match(stagingReviewSource, /const selectedElsewhere = Math\.max\(0, selectedCount - selectedRowsInScope\.length\)/, "Staging approval guidance should distinguish visible selections from selections retained on other pages");
assert.match(stagingReviewSource, /data-staging-filter="ready".*?\.click\(\)/, "The approval brief should reuse the existing Ready filter instead of creating a new backend path");
assert.match(stylesSource, /\.staging-approval-brief \{[\s\S]*?grid-template-columns: minmax\(220px, 0\.9fr\) minmax\(0, 1\.35fr\)/, "The approval brief should keep its copy and metrics readable on wide screens");
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
assert.match(ratewareSource, /async function openRatewareDrawer\(id\) \{[\s\S]+loadedRows\.find\(\(item\) => item\.id === id\) \|\| \{ id \};[\s\S]+await fetchApprovedRatewareDetail\(id\)/, "Rateware selected detail should hydrate by id even when the selected row is on another page");
assert.match(ratewareSource, /async function applySelectedBulkEdit\(\) \{[\s\S]+if \(rows\.length !== ids\.length\) \{[\s\S]+not visible on this page[\s\S]+Inline validation can only be checked for loaded rows/, "Rateware selected bulk edits should explicitly confirm when selected rows include hidden pages");
assert.match(ratewareSource, /let ratewareBulkMutationRunning = false;/, "Rateware bulk actions should share a mutation guard");
assert.match(ratewareSource, /const mutationRunning = ratewareBulkMutationRunning;/, "Rateware bulk controls should read the shared mutation guard");
assert.match(ratewareSource, /applyBulkEditButton\.disabled = mutationRunning \|\| selectedCount === 0/, "Rateware selected bulk edit should disable while a bulk mutation is running");
assert.match(ratewareSource, /applyBulkEditFilteredButton\.disabled = mutationRunning \|\| !bulkFieldSelect\?\.value \|\| !hasFilteredRows/, "Rateware filtered bulk edit should disable while a bulk mutation is running");
assert.match(ratewareSource, /archiveFilteredButton\.disabled = mutationRunning \|\| !hasFilteredRows/, "Rateware filtered archive should disable while a bulk mutation is running");
assert.match(ratewareSource, /async function applySelectedBulkEdit\(\) \{[\s\S]+if \(ratewareBulkMutationRunning\) return;[\s\S]+ratewareBulkMutationRunning = true;[\s\S]+finally \{[\s\S]+ratewareBulkMutationRunning = false;[\s\S]+updateBulkControls\(\);[\s\S]+\}/, "Rateware selected bulk edits should reject duplicate submissions and restore controls");
assert.match(ratewareSource, /async function applyFilteredBulkEdit\(\) \{[\s\S]+if \(ratewareBulkMutationRunning\) return;[\s\S]+ratewareBulkMutationRunning = true;[\s\S]+finally \{[\s\S]+ratewareBulkMutationRunning = false;[\s\S]+updateBulkControls\(\);[\s\S]+\}/, "Rateware filtered bulk edits should reject duplicate submissions and restore controls");
assert.match(ratewareSource, /async function runFilteredRatewareAction\(targetAction\) \{[\s\S]+if \(ratewareBulkMutationRunning\) return;[\s\S]+ratewareBulkMutationRunning = true;[\s\S]+finally \{[\s\S]+ratewareBulkMutationRunning = false;[\s\S]+updateBulkControls\(\);[\s\S]+\}/, "Rateware filtered archive/remove should reject duplicate submissions and restore controls");
for (const functionName of ["saveSelectedRatewareRows", "returnSelectedToStaging", "renormalizeSelectedRateware", "matchSelectedRatewareVendors", "enrichSelectedRatewareZips"]) {
  const source = ratewareSource.slice(ratewareSource.indexOf(`async function ${functionName}`), ratewareSource.indexOf("function debounce"));
  assert.match(source, /if \(ratewareBulkMutationRunning\) return;/, `${functionName} should reject duplicate Rateware bulk mutations`);
  assert.match(source, /ratewareBulkMutationRunning = true;[\s\S]+updateBulkControls\(\);/, `${functionName} should disable shared Rateware bulk controls before mutating`);
  assert.match(source, /finally \{[\s\S]*?ratewareBulkMutationRunning = false;[\s\S]*?updateBulkControls\(\);[\s\S]*?\}/, `${functionName} should release the shared Rateware bulk mutation guard`);
  assert.match(source, /finally \{[\s\S]*?updateBulkControls\(\);[\s\S]*?\}/, `${functionName} should always restore Rateware bulk controls after success or failure`);
}
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
assert.match(spreadsheetColumnFiltersSource, /storageKey = ""/, "Spreadsheet column filters should accept an optional persistent storage key");
assert.match(spreadsheetColumnFiltersSource, /function\s*\(\)\s*=>|const readStoredState = \(\) =>/, "Spreadsheet column filters should read persisted state without failing when storage is unavailable");
assert.match(spreadsheetColumnFiltersSource, /data-sheet-filter-apply-search[\s\S]{0,500}persistState\(\)/, "Spreadsheet text filters should persist after applying a search");
assert.match(spreadsheetColumnFiltersSource, /aria-haspopup="dialog" aria-expanded="false"/, "Spreadsheet filter triggers should expose dialog state");
assert.match(spreadsheetColumnFiltersSource, /button\.setAttribute\("aria-controls", popover\.id\)/, "Spreadsheet filter triggers should point to the shared filter dialog");
assert.match(spreadsheetColumnFiltersSource, /function closeMenu\(\{ restoreFocus = false \} = \{\}\)/, "Spreadsheet filter menus should centralize close and focus restoration");
assert.match(spreadsheetColumnFiltersSource, /closeMenu\(\{ restoreFocus: true \}\)/, "Spreadsheet filter menus should return focus after keyboard or explicit close");
assert.match(ratewareSource, /const RATEWARE_WORKSPACE_CONTEXT_STORAGE_KEY = "rateware:approved:workspace-context:v1"/, "Rateware should persist page and primary filter context under its own storage key");
assert.match(ratewareSource, /function persistRatewareWorkspaceContext\(\)/, "Rateware should persist search, operation, service, quick filter, and page context");
assert.match(ratewareSource, /storageKey: "rateware:approved:column-filters:v1"/, "Rateware column filters should persist independently from primary workspace context");
assert.match(ratewareSource, /loadRateware\(\{ preservePage: true \}\);\s*loadRatewareVersions\(\)/, "Rateware should restore the saved page before its initial data load");
assert.match(stagingReviewSource, /const STAGING_WORKSPACE_CONTEXT_STORAGE_KEY = "rateware:staging:workspace-context:v1"/, "Staging should persist page and primary filter context under its own storage key");
assert.match(stagingReviewSource, /function persistStagingWorkspaceContext\(\)/, "Staging should persist search, status, review filter, and page context");
assert.match(stagingReviewSource, /storageKey: "rateware:staging:column-filters:v1"/, "Staging column filters should persist independently from primary workspace context");
assert.match(stagingReviewSource, /loadRows\(\{ preservePage: true \}\);\s*$/, "Staging should restore the saved page before its initial data load");
const ratewarePageNavigationSource = ratewareSource.slice(ratewareSource.indexOf("async function goToRatewarePage"), ratewareSource.indexOf("async function setRatewarePageSize"));
assert.ok(ratewarePageNavigationSource.length > 100, "Rateware page navigation block should be present");
assert.doesNotMatch(ratewarePageNavigationSource, /selectedRowIds\.clear\(\)/, "Rateware should retain selected ids when changing pages");
assert.match(ratewarePageNavigationSource, /retained across pages/, "Rateware page navigation should disclose persistent selection");
const ratewarePageSizeSource = ratewareSource.slice(ratewareSource.indexOf("async function setRatewarePageSize"), ratewareSource.indexOf("async function performRatewareTableRowSave"));
assert.ok(ratewarePageSizeSource.length > 100, "Rateware page-size block should be present");
assert.doesNotMatch(ratewarePageSizeSource, /selectedRowIds\.clear\(\)/, "Rateware should retain selected ids when page size changes");
assert.match(ratewarePageSizeSource, /retained after page-size change/, "Rateware page-size changes should disclose persistent selection");
const ratewareSavedViewSource = ratewareSource.slice(ratewareSource.indexOf("columnVisibilityController = initColumnVisibility"), ratewareSource.indexOf("columnFilterController = initSpreadsheetColumnFilters"));
assert.ok(ratewareSavedViewSource.length > 100, "Rateware saved-view controller block should be present");
assert.match(ratewareSavedViewSource, /selectedRowIds\.clear\(\)/, "Rateware saved views should clear stale page selections before reloading");
assert.match(stagingReviewSource, /const optionsRequest = loadStagingOptions/, "Staging should begin option hydration without blocking its page query");
assert.match(stagingReviewSource, /let page = await fetchStagingPage/, "Staging should render its page before waiting on option hydration");
assert.match(stagingReviewSource, /Staging rows loaded\. Dropdown catalogs are temporarily unavailable/, "Staging should retain rendered rows when secondary dropdown hydration fails");
assert.match(stagingReviewSource, /const hasRenderedRows = currentRows\.length > 0 \|\| loadedRows\.length > 0/, "Staging should preserve visible rows while loading another page or filter result");
assert.match(stagingReviewSource, /async function openEditDrawer\(id\) \{[\s\S]+const row = rowById\(id\) \|\| \{ id \};[\s\S]+await fetchStagingDetail\(id\)/, "Staging selected detail should hydrate by id even when the selected row is on another page");
assert.match(stagingReviewSource, /if \(status === "approved"\) \{[\s\S]+if \(rows\.length !== ids\.length\) \{[\s\S]+Approval only runs on loaded selected rows/, "Staging selected approval should not approve off-page rows without visible validation blockers");
assert.match(stagingReviewSource, /async function applySelectedBulkEdit\(\) \{[\s\S]+if \(rows\.length !== ids\.length\) \{[\s\S]+not visible on this page[\s\S]+Inline validation can only be checked for loaded rows/, "Staging selected bulk edits should explicitly confirm when selected rows include hidden pages");
assert.match(stagingReviewSource, /let stagingBulkMutationRunning = false;/, "Staging bulk actions should share a mutation guard");
assert.match(stagingReviewSource, /let stagingDrawerSaveRunning = false;/, "Staging drawer save should have a running guard");
assert.match(stagingReviewSource, /async function saveActiveRow\(status = null\) \{[\s\S]+if \(!activeRowId \|\| stagingDrawerSaveRunning\) return;[\s\S]+stagingDrawerSaveRunning = true;[\s\S]+finally \{[\s\S]+stagingDrawerSaveRunning = false;[\s\S]+\}/, "Staging drawer save should reject duplicate submits and restore its guard");
assert.match(stagingReviewSource, /const stagingRowActionIds = new Set\(\);/, "Staging row approve/reject actions should have per-row guards");
assert.match(stagingReviewSource, /const actionKey = `staging-row-action:\$\{id\}`;[\s\S]+if \(stagingRowActionIds\.has\(actionKey\)\) return;[\s\S]+stagingRowActionIds\.add\(actionKey\);[\s\S]+finally \{[\s\S]+stagingRowActionIds\.delete\(actionKey\);/, "Staging row approve/reject should ignore duplicate clicks and release locks");
assert.match(stagingReviewSource, /const mutationRunning = stagingBulkMutationRunning;/, "Staging bulk controls should read the shared mutation guard");
assert.match(stagingReviewSource, /applyBulkEditButton\.disabled = mutationRunning \|\| selectedCount === 0/, "Staging selected bulk edit should disable while a bulk mutation is running");
assert.match(stagingReviewSource, /bulkApproveFilteredButton\.disabled = mutationRunning \|\| !hasFilteredRows/, "Staging filtered approve should disable while a bulk mutation is running");
assert.match(stagingReviewSource, /bulkArchiveFilteredButton\.disabled = mutationRunning \|\| !hasFilteredRows/, "Staging filtered archive should disable while a bulk mutation is running");
for (const functionName of ["runBulkAction", "applySelectedBulkEdit", "runBulkArchive", "runBulkRemove", "runBulkRenormalize", "runBulkMatchVendors", "runBulkEnrichZips"]) {
  const source = stagingReviewSource.slice(stagingReviewSource.indexOf(`async function ${functionName}`), stagingReviewSource.indexOf("function readPatch"));
  assert.match(source, /if \(stagingBulkMutationRunning\) return;/, `${functionName} should reject duplicate submissions while a staging bulk mutation is running`);
  assert.match(source, /stagingBulkMutationRunning = true;[\s\S]+updateBulkControls\(\);/, `${functionName} should disable staging bulk controls before mutating`);
  assert.match(source, /stagingBulkMutationRunning = false;/, `${functionName} should release the staging bulk mutation guard`);
  assert.match(source, /finally \{[\s\S]*?updateBulkControls\(\);[\s\S]*?\}/, `${functionName} should always restore Staging bulk controls after success or failure`);
}
for (const functionName of ["runFilteredStagingAction", "runFilteredStagingUpdate"]) {
  const source = stagingReviewSource.slice(stagingReviewSource.indexOf(`async function ${functionName}`), stagingReviewSource.indexOf(`async function runBulkRenormalize`));
  assert.match(source, /if \(stagingBulkMutationRunning\) return;/, `${functionName} should reject duplicate filtered submissions while a staging bulk mutation is running`);
  assert.match(source, /stagingBulkMutationRunning = true;[\s\S]+updateBulkControls\(\);/, `${functionName} should disable staging filtered controls before mutating`);
  assert.match(source, /finally \{[\s\S]+stagingBulkMutationRunning = false;[\s\S]+updateBulkControls\(\);[\s\S]+\}/, `${functionName} should release the staging bulk mutation guard and restore controls`);
}
assert.match(stagingReviewSource, /if \(hasRenderedRows\) \{\s+setBulkStatus\("Updating staging rows\.\.\."\);/, "Staging should show inline loading instead of blanking rendered rows");
assert.match(stagingReviewSource, /if \(hasRenderedRows\) setBulkStatus\(""\);/, "Staging should clear temporary inline loading after the row page is rendered");
assert.match(stagingReviewSource, /optionsRequest\s*\.then\(async \(\) => \{\s+if \(token !== stagingLoadToken\) return;\s+if \(optionsError\)/, "Staging should ignore stale option responses before updating status");
assert.match(stagingReviewSource, /stagingTotalCount = Number\(page\.total \?\? rows\.length \?\? 0\)/, "Staging should treat a zero database count as a real zero");
assert.match(stagingReviewSource, /stagingTable\?\.setAttribute\("aria-busy", "true"\)/, "Staging should expose loading state to assistive technology");
assert.match(stagingReviewSource, /stagingTable\?\.removeAttribute\("aria-busy"\)/, "Staging should clear its loading state after requests finish");
assert.match(stagingReviewSource, /if \(refreshOptions\) \{\s+selectedRowIds\.clear\(\);\s+setBulkStatus\(""\);/, "Staging refresh should clear stale selection before reloading data");
const stagingPageNavigationSource = stagingReviewSource.slice(stagingReviewSource.indexOf("async function goToStagingPage"), stagingReviewSource.indexOf("async function setStagingPageSize"));
assert.ok(stagingPageNavigationSource.length > 100, "Staging page navigation block should be present");
assert.doesNotMatch(stagingPageNavigationSource, /selectedRowIds\.clear\(\)/, "Staging should retain selected ids when changing pages");
assert.match(stagingPageNavigationSource, /retained across pages/, "Staging page navigation should disclose persistent selection");
const stagingPageSizeSource = stagingReviewSource.slice(stagingReviewSource.indexOf("async function setStagingPageSize"), stagingReviewSource.indexOf("function detailLine"));
assert.ok(stagingPageSizeSource.length > 100, "Staging page-size block should be present");
assert.doesNotMatch(stagingPageSizeSource, /selectedRowIds\.clear\(\)/, "Staging should retain selected ids when page size changes");
assert.match(stagingPageSizeSource, /retained after page-size change/, "Staging page-size changes should disclose persistent selection");
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
assert.match(shippersSource, /let shipperCreateRunning = false;/, "Shipper account creation should have a running guard");
assert.match(shippersSource, /if \(shipperCreateRunning\) return;/, "Shipper account creation should ignore duplicate submits");
assert.match(shippersSource, /let shipperBulkArchiveRunning = false;/, "Shipper bulk archive should have a running guard");
assert.match(shippersSource, /if \(shipperBulkArchiveRunning \|\| !ids\.length/, "Shipper bulk archive should reject duplicate submissions before confirming");
assert.match(shippersSource, /const shipperMergeMutationKeys = new Set\(\);/, "Shipper duplicate merges should be protected by mutation keys");
assert.match(shippersSource, /if \(shipperMergeMutationKeys\.has\(mutationKey\)\) return;/, "Shipper duplicate merge should ignore duplicate clicks");
assert.match(shippersSource, /const shipperPipelineMutationKeys = new Set\(\);/, "Shipper pipeline moves should be protected by per-account mutation keys");
assert.match(shippersSource, /if \(shipperPipelineMutationKeys\.has\(shipperId\)\) return;/, "Shipper pipeline moves should ignore duplicate move requests");
assert.match(shippersSource, /const shipperCommercialMutationKeys = new Set\(\);/, "Shipper commercial actions should be protected by mutation keys");
assert.match(shippersSource, /shipperCommercialMutationKeys\.delete\(mutationKey\);/, "Shipper commercial action locks should be released in finally blocks");
assert.match(shippersSource, /const TERMINAL_COMMERCIAL_STAGES = new Set\(\["won", "lost"\]\);/, "Terminal commercial stages should be identified explicitly");
assert.match(shippersSource, /function requestCommercialOpportunityStage\(control\)/, "Commercial terminal stages should require an explicit human decision");
assert.match(shippersSource, /It does not approve rates, send communications, create an RFx workspace, or make a customer commitment\./, "Commercial stage confirmation should disclose what it does not do");
assert.match(shippersSource, /control\.value = row\.stage \|\| "identified";/, "Cancelling a terminal commercial change should restore the original stage");
assert.match(shipperCrmHtml, /shipper-commercial-governance/, "Shipper commercial workspace should disclose its governed stage boundary");
assert.match(shippersSource, /let shipperDrawerSaveRunning = false;/, "Shipper profile drawer save should have a running guard");
assert.match(shippersSource, /if \(shipperDrawerSaveRunning\) return;/, "Shipper profile drawer save should ignore duplicate submits");
assert.match(shippersSource, /const shipperDrawerRecordMutationKeys = new Set\(\);/, "Shipper drawer child record mutations should be protected by keys");
assert.match(shippersSource, /delete-record:\$\{state\.activeTab\}:\$\{state\.activeShipperId\}/, "Shipper drawer deletes should be guarded before backend mutation");
assert.match(shippersSource, /const shipperProfileLinkMutationKeys = new Set\(\);/, "Shipper profile link actions should be protected by mutation keys");
assert.match(shippersSource, /create-profile-link:\$\{state\.activeShipperId\}/, "Shipper profile link creation should ignore duplicate clicks");
assert.match(businessIntelligenceSource, /let analystLoadVersion = 0;/, "AI Analyst should version concurrent prompts");
assert.match(businessIntelligenceSource, /loadVersion !== recommendationLoadVersion/, "Carrier recommendations should ignore stale results");
assert.match(businessIntelligenceSource, /loadVersion !== pivotLoadVersion/, "BI pivots should ignore stale results");
assert.match(businessIntelligenceSource, /loadVersion !== drilldownLoadVersion/, "BI drilldowns should ignore stale results");
assert.match(businessIntelligenceSource, /loadVersion !== geoLoadVersion/, "BI geo density should ignore stale results");
assert.match(businessIntelligenceSource, /let analystPromptRunning = false;/, "AI Analyst prompt submissions should have a running guard");
assert.match(businessIntelligenceSource, /if \(analystPromptRunning\) return;/, "AI Analyst should ignore duplicate prompt submissions while running");
assert.match(businessIntelligenceSource, /let recommendationRunning = false;/, "Carrier recommendation refresh should have a running guard");
assert.match(businessIntelligenceSource, /if \(recommendationRunning\) return;/, "Carrier recommendation refresh should ignore duplicate clicks while running");
assert.match(businessIntelligenceSource, /let pivotRunning = false;/, "BI pivot refresh should have a running guard");
assert.match(businessIntelligenceSource, /if \(pivotRunning\) return;/, "BI pivot refresh should ignore duplicate clicks while running");
assert.match(businessIntelligenceSource, /let geoRunning = false;/, "BI geo density refresh should have a running guard");
assert.match(businessIntelligenceSource, /if \(geoRunning\) return;/, "BI geo density refresh should ignore duplicate clicks while running");
assert.match(businessIntelligenceSource, /let recommendationPromoteRunning = false;/, "BI recommendation promotion should have a running guard");
assert.match(businessIntelligenceSource, /promoteSelectedButton\.disabled = recommendationPromoteRunning \|\| selected\.length === 0;/, "BI recommendation promotion should keep the button disabled during mutation");
assert.match(businessIntelligenceSource, /async function promoteSelected\(\) \{[\s\S]+if \(recommendationPromoteRunning\) return;[\s\S]+const ids = selectedRecommendations\(\)\.map\(\(row\) => row\.vendor_id\);[\s\S]+recommendationPromoteRunning = true;[\s\S]+finally \{[\s\S]+recommendationPromoteRunning = false;[\s\S]+updateSelectionState\(\);[\s\S]+\}/, "BI recommendation promotion should block duplicates and always restore selection controls");
assert.doesNotMatch(businessIntelligenceSource, /set[A-Za-z]*Status\(error\.message|setStatus\(error\.message/, "Analyze should humanize user-facing backend errors");
assert.match(uploadHistorySource, /let uploadHistoryLoadVersion = 0;/, "Upload History should version concurrent list loads");
assert.match(uploadHistorySource, /loadVersion !== uploadHistoryLoadVersion/, "Upload History should ignore stale list responses");
assert.match(uploadHistorySource, /activeUploadDetailId !== row\.id/, "Upload source comparison should stay scoped to the open drawer row");
assert.match(uploadHistorySource, /pendingReprocessIds\[0\] !== rawUploadId/, "Upload interpretation memory should stay scoped to the active reprocess selection");
assert.match(uploadHistorySource, /if \(uploadBulkActionRunning\) return;/, "Upload bulk actions should reject duplicate submissions while running");
assert.match(uploadHistorySource, /async function runBulkTemplateImport\(ids = selectedVisibleIds\(\), sourceButton = null\) \{[\s\S]+if \(uploadBulkActionRunning\) return;[\s\S]+uploadBulkActionRunning = true;[\s\S]+finally \{[\s\S]+uploadBulkActionRunning = false;[\s\S]+updateBulkControls\(\);[\s\S]+\}/, "Upload structured bulk import should share the bulk action guard and always restore controls");
assert.match(uploadHistorySource, /let uploadReprocessRunning = false;/, "Upload reprocess confirmation should have a running guard");
assert.match(uploadHistorySource, /async function runReprocessWithNote\(event\) \{[\s\S]+if \(uploadReprocessRunning\) return;[\s\S]+uploadReprocessRunning = true;[\s\S]+finally \{[\s\S]+uploadReprocessRunning = false;[\s\S]+updateBulkControls\(\);[\s\S]+\}/, "Upload reprocess confirmation should reject duplicate submits and restore controls");
assert.match(uploadHistorySource, /const uploadRowMutationIds = new Set\(\);/, "Upload History row actions should have per-upload mutation guards");
assert.match(uploadHistorySource, /const mutationKey = `row-action:\$\{rowId\}`;[\s\S]+if \(uploadRowMutationIds\.has\(mutationKey\)\) return;[\s\S]+finally \{[\s\S]+uploadRowMutationIds\.delete\(mutationKey\);/, "Upload History row actions should ignore duplicate clicks and release locks");
assert.match(uploadHistorySource, /const uploadSourceRequestIds = new Set\(\);/, "Upload source link requests should have per-upload guards");
assert.match(uploadHistorySource, /if \(uploadSourceRequestIds\.has\(rowId\)\) return;[\s\S]+uploadSourceRequestIds\.add\(rowId\);[\s\S]+finally \{[\s\S]+uploadSourceRequestIds\.delete\(rowId\);/, "Upload source link requests should ignore duplicate opens and release locks");
assert.match(outreachSource, /let outreachLoadVersion = 0;/, "Outreach should version full workspace loads");
assert.match(outreachSource, /loadVersion !== outreachMessagesLoadVersion \|\| selectedCampaignId !== campaignId/, "Outreach should not render messages from a previously selected campaign");
assert.match(outreachSource, /if \(outreachMessageMutationRunning\) return;/, "Outreach bulk message updates should reject duplicate submissions while running");
assert.match(outreachSource, /let outreachCampaignMutationRunning = false;/, "Outreach campaign lifecycle actions should share a mutation guard");
assert.match(outreachSource, /let outreachTemplateMutationRunning = false;/, "Outreach template lifecycle actions should share a mutation guard");
assert.doesNotMatch(outreachSource, /error\.message/, "Outreach should not pass raw caught error messages to campaign, template, or draft queue status UI");
assert.match(outreachSource, /button\.disabled = !hasCampaign \|\| outreachCampaignMutationRunning/, "Outreach campaign buttons should disable while a campaign mutation is running");
assert.match(outreachSource, /generateDraftsButton\.disabled = !hasCampaign \|\| outreachCampaignMutationRunning/, "Outreach draft generation should disable while a campaign mutation is running");
assert.match(outreachSource, /templateForm\?\.addEventListener\("submit", async \(event\) => \{[\s\S]+if \(outreachTemplateMutationRunning\) return;[\s\S]+outreachTemplateMutationRunning = true;[\s\S]+finally \{[\s\S]+outreachTemplateMutationRunning = false;[\s\S]+\}/, "Outreach template save should reject duplicate submissions and restore controls");
assert.match(outreachSource, /outreachPublishWhatsappTemplateButton\?\.addEventListener\("click"[\s\S]+if \(outreachTemplateMutationRunning\) return;[\s\S]+outreachTemplateMutationRunning = true;[\s\S]+finally \{[\s\S]+outreachTemplateMutationRunning = false;[\s\S]+renderOutreachWhatsappTemplateStatus\(templates\.find\(\(template\) => template\.id === editingTemplateId\)\);[\s\S]+\}/, "Outreach WhatsApp template publishing should restore button state through the shared status renderer");
assert.match(outreachSource, /outreachSyncWhatsappTemplatesButton\?\.addEventListener\("click"[\s\S]+if \(outreachTemplateMutationRunning\) return;[\s\S]+outreachTemplateMutationRunning = true;[\s\S]+finally \{[\s\S]+outreachTemplateMutationRunning = false;[\s\S]+outreachSyncWhatsappTemplatesButton\.disabled = false;[\s\S]+\}/, "Outreach WhatsApp template sync should reject duplicate clicks and restore controls");
assert.match(outreachSource, /templateList\?\.addEventListener\("click", async \(event\) => \{[\s\S]+if \(outreachTemplateMutationRunning\) return;[\s\S]+const actionButton = duplicateButton \|\| archiveButton \|\| deleteButton;[\s\S]+finally \{[\s\S]+outreachTemplateMutationRunning = false;[\s\S]+if \(actionButton\) actionButton\.disabled = false;[\s\S]+\}/, "Outreach template list actions should guard duplicate mutations and restore the clicked button");
assert.match(outreachSource, /campaignForm\?\.addEventListener\("submit", async \(event\) => \{[\s\S]+if \(outreachCampaignMutationRunning\) return;[\s\S]+outreachCampaignMutationRunning = true;[\s\S]+updateCampaignActionState\(\);[\s\S]+finally \{[\s\S]+outreachCampaignMutationRunning = false;[\s\S]+updateCampaignActionState\(\);[\s\S]+\}/, "Outreach campaign form should share the campaign mutation guard");
for (const campaignButton of ["duplicateCampaignButton", "archiveCampaignButton", "deleteCampaignButton", "generateDraftsButton"]) {
  const start = outreachSource.indexOf(`${campaignButton}?.addEventListener`);
  const end = outreachSource.indexOf("\n\n", start + 1);
  const handlerSource = outreachSource.slice(start, end > start ? end : undefined);
  assert.ok(start >= 0, `${campaignButton} handler should exist`);
  assert.match(handlerSource, /if \(outreachCampaignMutationRunning\) return;/, `${campaignButton} should ignore duplicate clicks while a campaign mutation is running`);
  assert.match(handlerSource, /const campaignId = selectedCampaignId;/, `${campaignButton} should capture its initiating campaign`);
  assert.match(handlerSource, /outreachCampaignMutationRunning = true;[\s\S]+updateCampaignActionState\(\);/, `${campaignButton} should disable campaign actions before mutating`);
  assert.match(handlerSource, /selectedCampaignId !== campaignId|selectedCampaignId === campaignId/, `${campaignButton} should not overwrite a different campaign after navigation`);
  assert.match(handlerSource, /finally \{[\s\S]+outreachCampaignMutationRunning = false;[\s\S]+updateCampaignActionState\(\);[\s\S]+\}/, `${campaignButton} should restore campaign controls after finishing`);
}
assert.match(outreachSource, /const OUTREACH_WORKSPACE_CONTEXT_STORAGE_KEY = "rateware:outreach:workspace-context:v1"/, "Outreach should persist a separate workspace context");
assert.match(outreachSource, /function persistOutreachWorkspaceContext\(\)/, "Outreach should persist campaign, draft filter, search, channel, and preview context");
assert.match(outreachSource, /storedOutreachWorkspaceContext/, "Outreach should restore the last campaign and queue filters");
assert.match(outreachSource, /data-outreach-filter[\s\S]{0,300}activeMessageFilter/, "Outreach should restore the active draft status filter");
assert.match(outreachSource, /persistOutreachWorkspaceContext\(\);\s*renderMessages\(\);/, "Outreach filter changes should persist before rerendering the queue");
assert.doesNotMatch(rfxEventsSource, /error\.message/, "Bid Room should not pass raw caught error messages to RFx, Outreach, Award, Lane, or Chat status UI");
assert.match(rfxEventsSource, /let awardMutationRunning = false;/, "RFx award actions should share a mutation guard");
assert.match(rfxEventsSource, /rfxApplyRecommendedAwardsButton\.disabled = awardMutationRunning \|\| !snapshot\.recommendations\.length/, "RFx recommended awards should disable while award mutations are running");
assert.match(rfxEventsSource, /rfxCloseoutAwardsButton\.disabled = awardMutationRunning \|\| !pendingCloseout/, "RFx Rateware closeout should disable while award mutations are running");
assert.match(rfxEventsSource, /rfxGenerateAwardNoticesButton\.disabled = awardMutationRunning \|\| !selectedEventId/, "RFx award notice generation should disable while award mutations are running");
assert.match(rfxEventsSource, /rfxSendAwardNoticesButton\.disabled = awardMutationRunning \|\| !selectedSendableIds\.length/, "RFx award notice sending should disable while award mutations are running");
for (const functionName of [
  "applyRecommendedAwardDecisions",
  "closeoutSelectedAwardsToRateware",
  "generateAwardNoticeDrafts",
  "sendAwardNoticeDrafts"
]) {
  const start = rfxEventsSource.indexOf(`async function ${functionName}`);
  const end = rfxEventsSource.indexOf("\n\nasync function", start + 1);
  const functionSource = rfxEventsSource.slice(start, end > start ? end : undefined);
  assert.ok(start >= 0, `${functionName} should exist`);
  assert.match(functionSource, /if \(awardMutationRunning\) return;/, `${functionName} should ignore duplicate award mutations`);
  assert.match(functionSource, /awardMutationRunning = true;/, `${functionName} should lock award actions before mutating`);
  assert.match(functionSource, /finally \{[\s\S]+awardMutationRunning = false;[\s\S]+updateAwardNoticeControls\(\);[\s\S]+\}/, `${functionName} should restore award controls after finishing`);
}
assert.match(rfxEventsSource, /let draftQueueMutationRunning = false;/, "RFx draft queue actions should share a mutation guard");
assert.match(rfxEventsSource, /draftSendSelectedButton\.disabled = draftQueueMutationRunning \|\| !sendableSelectedIds\.length/, "RFx email draft send should disable while draft queue mutations are running");
assert.match(rfxEventsSource, /draftSendSelectedWhatsappButton\.disabled = draftQueueMutationRunning \|\| !sendableWhatsappIds\.length/, "RFx WhatsApp direct send should disable while draft queue mutations are running");
assert.match(rfxEventsSource, /draftArchiveSelectedButton\) draftArchiveSelectedButton\.disabled = draftQueueMutationRunning \|\| !selectedRows\.length/, "RFx draft archive should disable while draft queue mutations are running");
assert.match(rfxEventsSource, /draftDeleteSelectedButton\) draftDeleteSelectedButton\.disabled = draftQueueMutationRunning \|\| !selectedRows\.length/, "RFx draft delete should disable while draft queue mutations are running");
for (const functionName of [
  "sendSelectedDraftEmails",
  "sendSingleDraftEmail",
  "sendSelectedDraftWhatsapp",
  "sendSingleDraftWhatsapp",
  "refreshSingleOutreachDraft",
  "refreshSelectedOutreachDrafts",
  "markSelectedWhatsappGroupsManuallySent",
  "markSingleWhatsappGroupManuallySent",
  "archiveSelectedDrafts",
  "deleteSelectedDrafts"
]) {
  const start = rfxEventsSource.indexOf(`async function ${functionName}`);
  const end = rfxEventsSource.indexOf("\n\nasync function", start + 1);
  const functionSource = rfxEventsSource.slice(start, end > start ? end : undefined);
  assert.ok(start >= 0, `${functionName} should exist`);
  assert.match(functionSource, /if \(draftQueueMutationRunning\) return;/, `${functionName} should ignore duplicate draft queue mutations`);
  assert.match(functionSource, /draftQueueMutationRunning = true;/, `${functionName} should lock the draft queue before mutating`);
  assert.match(functionSource, /finally \{[\s\S]+draftQueueMutationRunning = false;[\s\S]+updateDraftSendControls\(draftQueueRows\);[\s\S]+\}/, `${functionName} should restore draft queue controls after finishing`);
}
assert.match(apiSource, /mapWithConcurrency\(chunkValues\(cleanEmails, 75\), 4/, "Outreach suppression checks should batch large recipient lists with bounded concurrency");
assert.match(apiSource, /\.in\("email", emailBatch\)/, "Outreach suppression checks should query each bounded recipient batch");

assert.match(apiSource, /const BULK_SELECTED_ID_LIMIT = 1000;/, "Selected-row mutations should have a bounded request limit");
assert.match(apiSource, /body\.action === "list_rateware_rows_by_ids"/, "Rateware should hydrate selected rows across pages by id");
assert.match(apiSource, /body\.action === "bulk_update_staging"/, "Staging selected bulk edits should be handled server-side");
assert.match(ratewareServiceSource, /fetchRatewareRowsByIds/, "Rateware should request selected rows by id instead of relying on visible rows");
assert.match(stagingServiceSource, /bulkUpdateStagingRows/, "Staging should send selected bulk edits to the server");
assert.match(apiSource, /const BULK_SEND_LIMIT = 100;/, "Provider sends should use a smaller bounded request limit");
assert.match(apiSource, /const BULK_FILTER_CONFIRM_THRESHOLD = 250;/, "Large filtered mutations should require reviewed preview confirmation");
assert.match(apiSource, /return explicitlyConfirmed && Boolean\(actionKey\) && actionText === actionKey\.toLowerCase\(\);/, "Bulk confirmations should be bound to the exact requested action");
assert.match(apiSource, /requires a fresh dry-run preview count before applying changes/, "Large full-dataset actions should require a fresh database preview");
assert.match(apiSource, /A completed destructive\/provider action must not look failed and become unsafe to retry/, "Audit failures should not make completed destructive or provider actions retryable");
assert.match(apiSource, /outreach\.gmail\.bulk_send/, "Gmail bulk sends should be audited separately");
assert.doesNotMatch(apiSource, /Bulk send must target one outreach campaign at a time\./, "Gmail bulk send should process selected drafts across multiple waves instead of rejecting the entire queue");
assert.match(apiSource, /campaign_ids: campaignIds,[\s\S]{0,120}campaign_count: campaignIds\.length/, "Gmail bulk-send audit should record every campaign included in a multi-wave request");
assert.match(apiSource, /outreach\.whatsapp\.bulk_send/, "WhatsApp bulk sends should be audited separately");
assert.match(apiSource, /outreach\.whatsapp_group\.bulk_send/, "Manual WhatsApp group sends should be audited separately");
assert.match(apiSource, /body\.action === "consolidate_exact_vendor_duplicates"/, "Vendor API should expose the exact duplicate consolidation action");
assert.match(apiSource, /const EXACT_VENDOR_CONSOLIDATION_BATCH_LIMIT = 1;/, "Vendor consolidation should process one exact duplicate record per confirmed request");
assert.match(apiSource, /Number\(body\.preview_limit\)[\s\S]+EXACT_VENDOR_CONSOLIDATION_BATCH_LIMIT\), 1\), EXACT_VENDOR_CONSOLIDATION_BATCH_LIMIT\)/, "Vendor consolidation should enforce its batch limit server-side");
assert.match(apiSource, /p_dry_run: true/, "Vendor consolidation should always run a fresh database preview first");
assert.match(apiSource, /requireBulkConfirmation\(body,[\s\S]+action: "consolidate_exact_vendor_duplicates"/, "Vendor consolidation should require an action-bound confirmation");
assert.match(apiSource, /duplicate set changed[\s\S]+Run a fresh preview before consolidating/, "Vendor consolidation should reject a stale preview before deleting records");
assert.match(apiSource, /vendor\.exact_duplicates\.consolidate/, "Vendor consolidation should write an explicit audit event");
const exactVendorConsolidationActionSource = apiSource.slice(
  apiSource.indexOf('if (body.action === "consolidate_exact_vendor_duplicates")'),
  apiSource.indexOf('if (body.action === "remove_vendors")')
);
assert.doesNotMatch(exactVendorConsolidationActionSource, /count_exact_workspace_vendor_duplicates/, "Vendor consolidation should not rescan the full duplicate set after every record");
assert.match(exactVendorConsolidationActionSource, /remaining_count_source: "confirmed_preview_minus_applied"/, "Vendor consolidation should identify its bounded remaining-count source");
assert.match(apiSource, /complete: remainingDuplicates === 0/, "Vendor consolidation should only report complete after the database count reaches zero");
assert.match(vendorServiceSource, /callRatewareApi\("consolidate_exact_vendor_duplicates"/, "Carrier CRM should call the trusted API for duplicate consolidation");
assert.match(vendorServiceSource, /confirmed: !dryRun[\s\S]+confirmation_action: "consolidate_exact_vendor_duplicates"/, "Carrier CRM should confirm only the apply pass");
assert.match(vendorsHtml, /id="preview-exact-duplicates-button"/, "Carrier CRM duplicate review should expose a safe full-workspace preview");
assert.match(vendorsHtml, /id="consolidate-exact-duplicates-button"[^>]+disabled/, "Carrier CRM duplicate consolidation should remain disabled until previewed");
assert.match(vendorsSource, /previewExactVendorDuplicates\(\)/, "Carrier CRM should preview exact duplicate consolidation before enabling apply");
assert.match(vendorsSource, /const EXACT_VENDOR_CONSOLIDATION_BATCH_SIZE = 1;/, "Carrier CRM should request one exact duplicate record per confirmation");
assert.doesNotMatch(vendorsSource, /while \(remainingDuplicates > 0/, "Carrier CRM should never auto-loop exact duplicate consolidation");
assert.match(vendorsSource, /This run processes one validated duplicate record only/, "Carrier CRM should disclose the one-record safety boundary");
assert.match(vendorsSource, /run a fresh preview before the next record/, "Carrier CRM should require a fresh preview before another consolidation");
assert.match(vendorsSource, /Duplicate consolidation made no progress/, "Carrier CRM should stop a stalled consolidation instead of looping or reporting success");
assert.match(exactVendorConsolidationMigration, /create table if not exists public\.vendor_merge_audit/, "Vendor consolidation should preserve a durable merge audit");
assert.match(exactVendorConsolidationMigration, /Exact normalized company name \+ exact non-generic corporate domain \+ workspace/, "Vendor consolidation should document its exact safe match boundary");
assert.match(exactVendorConsolidationMigration, /gmail\.com[\s\S]+hotmail\.com[\s\S]+outlook\.com/, "Vendor consolidation should exclude generic email domains");
assert.match(exactVendorConsolidationMigration, /order by[\s\S]+source\\s\*id\\s\*:[\s\S]+desc,[\s\S]+coalesce\(q\.quote_count, 0\) desc,[\s\S]+case when nullif\(btrim\(s\.primary_email\)/, "Vendor consolidation should retain Apollo Source ID, then linked quotes, then health");
assert.match(exactVendorConsolidationMigration, /if p_dry_run then[\s\S]+return jsonb_build_object/, "Vendor consolidation should support a non-destructive dry run");
assert.match(exactVendorConsolidationMigration, /update public\.rates/, "Vendor consolidation should preserve Rateware links");
assert.match(exactVendorConsolidationMigration, /update public\.rate_staging/, "Vendor consolidation should preserve staging links");
assert.match(exactVendorConsolidationMigration, /update public\.rfx_lane_vendors/, "Vendor consolidation should preserve RFx lane links");
assert.match(exactVendorConsolidationBooleanFixMigration, /equipment_available\s*=\s*case[\s\S]+keeper\.equipment_available is true[\s\S]+v_lane_vendor\.equipment_available is false[\s\S]+else null[\s\S]+end/, "The dedicated vendor consolidation fix should merge nullable equipment availability without coercing empty text to boolean");
assert.match(exactVendorConsolidationBooleanFixMigration, /pg_get_functiondef[\s\S]+position\(v_old in v_definition\)[\s\S]+execute replace\(v_definition, v_old, v_new\)/, "Deployed vendor consolidation functions should receive the nullable equipment availability hotfix");
assert.match(exactVendorConsolidationBatchMigration, /when p_dry_run then 2147483647[\s\S]+else greatest\(1, least\(coalesce\(p_preview_limit, 50\), 100\)\)/, "Vendor consolidation should preserve a complete preview while batching destructive work");
assert.match(exactVendorConsolidationBatchMigration, /regexp_matches[\s\S]+duplicate_key_cte_matches <> 1 or candidate_boundary_matches <> 1[\s\S]+regexp_replace/, "Vendor consolidation batching should tolerate PostgreSQL function formatting while failing closed on ambiguous rewrite points");
assert.doesNotMatch(exactVendorConsolidationBatchMigration, /updated_definition\s*:=\s*replace\([\s\S]*E'  duplicate_keys as \(\\n'/, "Vendor consolidation batching must not depend on exact indentation emitted by pg_get_functiondef");
assert.match(exactVendorConsolidationWalLimitMigration, /coalesce\(p_preview_limit, 50\), 100/, "Vendor consolidation WAL guard should recognize the previously deployed batch expression");
assert.match(exactVendorConsolidationWalLimitMigration, /coalesce\(p_preview_limit, 10\), 10/, "Vendor consolidation WAL guard should cap destructive transactions at ten exact groups");
assert.match(exactVendorConsolidationWalLimitMigration, /pg_get_functiondef[\s\S]+execute replace\(v_definition, v_old, v_new\)/, "Vendor consolidation WAL guard should patch the deployed function definition safely");
assert.match(vendorRelationshipMergeMigration, /v_definition\s*:=\s*replace\(v_definition, E'\\r\\n', E'\\n'\)[\s\S]+v_conflict_start\s*:=\s*strpos/, "Vendor collision patch should normalize CRLF before matching function-body anchors during clean replay");
assert.match(exactVendorSingleGroupMigration, /v_limit_1 text := \$new\$else 1\$new\$/, "Database hotfix should cap destructive consolidation at one exact group");
assert.match(exactVendorSingleGroupMigration, /position\(v_limit_10 in v_definition\)[\s\S]+execute replace\(v_definition, v_limit_10, v_limit_1\)/, "Single-group hotfix should patch the prior ten-group definition");
assert.match(exactVendorSingleLoserMigration, /where r\.priority_rank > 1[\s\S]+p_dry_run[\s\S]+or r\.id = \([\s\S]+select r2\.id[\s\S]+limit 1/, "Single-loser hotfix should preserve complete previews while selecting one loser for destructive work");
assert.match(exactVendorSingleLoserMigration, /pg_get_functiondef[\s\S]+execute replace\(v_definition, v_old, v_new\)/, "Single-loser hotfix should patch the deployed function definition safely");
assert.match(exactVendorConsolidationBatchMigration, /create or replace function public\.count_exact_workspace_vendor_duplicates/, "Vendor consolidation should expose a trusted remaining-work counter");
assert.match(exactVendorConsolidationBatchMigration, /revoke all on function public\.count_exact_workspace_vendor_duplicates[\s\S]+from public;[\s\S]+from anon;[\s\S]+from authenticated;[\s\S]+grant execute[\s\S]+to service_role;/, "The exact duplicate counter should only be callable by the trusted API");
assert.match(exactVendorConsolidationMigration, /update public\.outreach_messages/, "Vendor consolidation should preserve outreach links");
assert.match(exactVendorConsolidationMigration, /update public\.vendor_improvement_cases[\s\S]+update public\.vendor_profile_requests[\s\S]+update public\.vendor_value_scorecards/, "Vendor consolidation should preserve CI, profile, and scorecard links");
assert.match(exactVendorConsolidationMigration, /grant execute on function public\.consolidate_exact_workspace_vendor_duplicates[\s\S]+to service_role/, "Vendor consolidation RPC should be restricted to the trusted service role");
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

assert.match(vendorsSource, /function parseVendorEmailList\(value\)/, "Carrier CRM should parse every pasted email token instead of silently extracting matches");
assert.match(vendorsSource, /\.split\(\/\[,;\\r\\n\]\+\/\)/, "Carrier CRM should accept comma, semicolon, and line-break separated emails");
assert.match(vendorsSource, /trimmed\.split\(\/\\s\+\/\)/, "Carrier CRM should accept space-separated email lists");
assert.match(vendorsSource, /Correct invalid email/, "Carrier CRM should explain which pasted emails need correction");
assert.match(vendorsSource, /field === "primary_email"/, "Spreadsheet email edits should be validated before saving");
assert.match(vendorsSource, /#drawer-edit-email/, "Vendor drawer email edits should be validated before saving");
assert.match(vendorsSource, /#wizard-primary-email/, "Vendor wizard email lists should be validated before creating a vendor");
assert.match(apiSource, /function normalizeVendorEmails\(primaryValue: unknown, secondaryValue: unknown = \[\]\)/, "Vendor API should validate primary and secondary email lists together");
assert.match(apiSource, /function parseVendorEmailList\(value: unknown\)/, "Vendor API should parse pasted email lists server-side");
assert.match(apiSource, /Correct invalid email/, "Vendor API should reject invalid contacts rather than silently dropping them");
assert.match(apiSource, /const emails = normalizeVendorEmails\(input\.primary_email \|\| input\.email, input\.secondary_emails\)/, "Vendor creation should preserve validated extra contact emails");
assert.match(apiSource, /Object\.assign\(patch, normalizeVendorEmails\(input\.primary_email \?\? input\.email, input\.secondary_emails\)\)/, "Vendor updates should use the same email validation path as creation");

assert.match(apiSource, /async function recordVendorImprovementResponse/, "Vendor CI should record a carrier response as a first-class action");
assert.match(apiSource, /vendor_ci\.response_recorded/, "Carrier responses should be written to the Vendor CI audit trail");
assert.match(apiSource, /reminders_enabled: false,[\s\S]{0,120}next_reminder_at: null/, "Carrier responses should stop outstanding Vendor CI reminders");
assert.match(apiSource, /async function resolveVendorImprovementCase/, "Vendor CI should provide a dedicated closure action");
assert.match(apiSource, /closure_note/, "Vendor CI closure should require an auditable resolution note");
assert.match(apiSource, /Add a closure note before resolving a Vendor CI case\./, "Generic Vendor CI updates must not silently resolve a case without an auditable closure note");
assert.match(apiSource, /body\.action === "record_vendor_improvement_response"/, "Rateware API should expose the Vendor CI response action");
assert.match(apiSource, /body\.action === "resolve_vendor_improvement_case"/, "Rateware API should expose the Vendor CI closure action");
assert.match(vendorImprovementServiceSource, /record_vendor_improvement_response/, "Vendor CI frontend service should call the response action");
assert.match(vendorImprovementServiceSource, /resolve_vendor_improvement_case/, "Vendor CI frontend service should call the closure action");
assert.match(vendorImprovementSource, /data-ci-case-action="record-response"/, "Vendor CI should let operators record carrier replies from the case row");
assert.match(vendorImprovementSource, /data-ci-case-action="close"/, "Vendor CI should expose a deliberate closure action rather than silently resolving cases");

assert.doesNotMatch(rfxEventsHtml, /id="rfx-chat-delivery-channel"/, "Carrier Ask should not offer WhatsApp or Google Chat delivery choices");
assert.match(rfxEventsSource, /Reply by email/, "Bid Room Ask should be presented as a Gmail reply action");
assert.match(rfxEventsSource, /initSpreadsheetColumnFilters/, "Carrier bids should reuse the spreadsheet column-filter control");
assert.match(rfxEventsSource, /function initResponseColumnFilters/, "Carrier bids should initialize dedicated column filters");
assert.match(rfxEventsSource, /storageKey: "rateware:bid-room:carrier-bids:column-filters:v3"/, "Carrier bid column filters should persist per user workspace");
assert.match(rfxEventsSource, /mode: "inline"/, "Carrier bid filters should use simple inline text controls");
assert.match(rfxEventsSource, /carrier: \[vendorLabel\(invitation\)\]/, "Carrier filter should use the primary vendor name, not email or domain subtext");
assert.match(rfxEventsSource, /lane: \[`#\$\{lane\.lane_number \|\| \"\"\} \$\{laneRoute\(lane\)\}`\.trim\(\)\]/, "Lane filter should use the complete primary lane label");
assert.match(rfxEventsSource, /responseColumnFilters\?\.apply\(allRows\)/, "Carrier bid filters should apply before the response table renders");
assert.match(rfxEventsSource, /sort\(\(left, right\) => Number\(hasBid\(right\.invitation\)\) - Number\(hasBid\(left\.invitation\)\)\)/, "Carrier responses with bids should sort before pending invitations");
assert.match(rfxEventsSource, /data-rfx-open-private-bid/, "Bid Operations should let admins open a carrier-specific Private Bid Room from each response row");
assert.match(rfxEventsSource, /function carrierPrivateBidLaneCount/, "Private Bid Room row links should open the carrier's full invited lane book when available");
assert.match(rfxEventsSource, /function carrierPrivateBidLaneCount[\s\S]+Math\.max\(1, currentLanes/, "Private Bid Room row links should use the currently loaded event lanes");
assert.doesNotMatch(rfxEventsSource, /selectedEventLanes/, "Bid Room should not reference an undefined event-lane collection");
assert.match(rfxEventsSource, /function outreachWaveTargets\(\)[\s\S]+selectedOutreachAudienceVendorIds\.has/, "Message previews should use only the carrier wave selected from Carrier fit");
assert.match(rfxEventsSource, /Prepare \$\{formatNumber\(ready\)\} \$\{deliveryLabel\} draft/, "Message should identify the exact sendable carrier wave before preparing drafts");
assert.match(rfxEventsHtml, /id="rfx-open-delivery-queue"/, "Message should provide a direct action to open the event-specific delivery queue");
assert.match(rfxEventsSource, /Select one or more carriers in Carrier fit or This RFx before preparing a delivery queue\./, "Draft preparation should require an explicit RFx carrier wave");
assert.match(rfxEventsSource, /deliveryParticipationStatus = "in_delivery";[\s\S]+draftQueueTrackingStatus = "drafted";[\s\S]+activateRfxLaunchWorkspace\("delivery", \{ refresh: true \}\)/, "Draft preparation should open Delivery queue filtered to the new draft wave");
assert.match(rfxEventsSource, /if \(rfxLaunchWorkspace === "message"\) renderOutreachPreview\(\);/, "Changing a selected carrier wave should immediately refresh the Message preview");
const outreachPreviewStart = rfxEventsSource.indexOf("function renderOutreachPreview");
const outreachPreviewEnd = rfxEventsSource.indexOf("\n\nfunction", outreachPreviewStart + 1);
const outreachPreviewSource = rfxEventsSource.slice(outreachPreviewStart, outreachPreviewEnd > outreachPreviewStart ? outreachPreviewEnd : undefined);
assert.match(outreachPreviewSource, /const targets = outreachWaveTargets\(\);/, "Message should preview the selected carrier wave rather than all RFx invitations");
assert.match(rfxEventsHtml, /src="\.\/src\/rfx-events\.js\?v=[^"]+"/, "Bid Room should bust the client cache after compact outreach read fixes");
assert.match(stylesSource, /rfx-response-open-room/, "Bid Operations should visually separate the private room action from bid editing and email reply");
assert.match(rfxEventsSource, /sendBidRoomCarrierMessage/, "Bid Room reply should use the targeted carrier email action");
assert.match(rfxEventsSource, /idempotency_key: bidRoomCarrierMessageRequestKey/, "Bid Room email reply should preserve one request key across an in-flight send");
assert.match(rfxServiceSource, /send_bid_room_carrier_message/, "RFx service should expose the targeted carrier email action");
assert.match(apiSource, /async function sendBidRoomCarrierMessage/, "Rateware API should handle targeted Bid Room carrier email replies");
assert.match(apiSource, /async function resolveBidRoomGmailReplyContext/, "Targeted carrier email should resolve the latest relevant Gmail thread");
assert.match(apiSource, /function marksmanSignatureHtml/, "Targeted carrier email should include the trusted MARKSMAN signature");
assert.match(apiSource, /function bidRoomFollowUpLaneSummaryHtml/, "Targeted carrier email should include a specific lane summary");
assert.match(apiSource, /requireBulkConfirmation\(input, \{[\s\S]{0,180}action: "send_bid_room_carrier_message"/, "Targeted carrier email should require an action-bound confirmation");
assert.match(apiSource, /contains\("metadata", \{ bid_room_request_key: requestKey \}\)/, "Targeted carrier email should be idempotent");
assert.match(apiSource, /const routeBookRows = outreachEventLaneRows\(/, "Targeted carrier email should reuse the complete RFx route book");
assert.match(apiSource, /const \[invitation\] = await requireHydratedRfxInvitationTokens\(supabase, \[invitationRow\], "Carrier follow-up"\)/, "Targeted carrier email should decrypt its private invitation token before building the Bid Room link");
assert.match(apiSource, /const eventLaneRows = await fetchAllRfxLaneRows\(supabase, cleanText\(event\.id\) \|\| "", "\*"\)/, "Targeted carrier email should load all lanes for the selected RFx");
assert.match(apiSource, /route_book_lane_count: routeBookRows\.length/, "Targeted carrier email should record the route book scope");
assert.match(apiSource, /profile_link: profileLink/, "Targeted carrier email should include the carrier profile link");
assert.match(apiSource, /original_source_subject: emailContext\.source_subject/, "Targeted carrier email should preserve the original outreach subject");
assert.match(apiSource, /routeBookRows\.length > 1 \? "&view=book"/, "Targeted carrier email should open the full bid book when the RFx has multiple lanes");
assert.match(apiSource, /threadId: gmailThreadId/, "Gmail replies should pass the matching Gmail thread id to the provider");
assert.match(apiSource, /In-Reply-To:/, "Gmail replies should preserve email reply headers");
const bidRoomCarrierEmailAction = apiSource.slice(apiSource.indexOf("async function sendBidRoomCarrierMessage"), apiSource.indexOf("async function sendWhatsappGroupOutreachMessages"));
assert.match(bidRoomCarrierEmailAction, /sendOutreachMessages\(supabase, user, sendInput\)/, "Targeted carrier reply should use the normal Gmail delivery path");
assert.doesNotMatch(bidRoomCarrierEmailAction, /sendWhatsappOutreachMessages/, "Targeted carrier reply must not send WhatsApp");
assert.doesNotMatch(bidRoomCarrierEmailAction, /mirrorBidRoomCarrierDelivery/, "Targeted carrier reply must not mirror into Google Chat");

assert.match(apiSource, /body\.action === "list_upload_staged_rows"[\s\S]+count: "exact"[\s\S]+has_more/, "Upload staged-row reads should expose pagination metadata instead of silently truncating at 500 rows");
assert.match(apiSource, /body\.action === "list_uploads"[\s\S]+count: "exact"[\s\S]+has_more/, "Upload History reads should expose pagination metadata instead of silently truncating at 100 rows");
assert.match(uploadServiceSource, /fetchUploadHistory[\s\S]+page\.has_more[\s\S]+return rows/, "Upload History should consume every paginated source-file page");
assert.match(uploadServiceSource, /fetchUploadStagedRows[\s\S]+page\.has_more[\s\S]+return rows/, "Upload History should load every staged row page for source comparison");
assert.match(apiSource, /body\.action === "list_vendor_segments"[\s\S]+count: "exact"[\s\S]+has_more/, "Vendor segment reads should expose pagination metadata instead of silently truncating at 100 rows");
assert.match(vendorServiceSource, /fetchVendorSegments[\s\S]+page\.has_more[\s\S]+return rows/, "Vendor segment consumers should load every paginated segment page");
assert.match(interpretUploadSource, /import \{ corsHeaders, jsonResponse as baseJsonResponse, requireKindeUser \} from "\.\.\/_shared\/kinde\.ts"/, "Interpretation should use the shared response hardening contract");
assert.doesNotMatch(interpretUploadSource, /const corsHeaders = \{/, "Interpretation should not maintain a divergent wildcard CORS response helper");
assert.match(shipperProfileApiSource, /organization_id[\s\S]+contactsQuery\.eq\("organization_id"/, "Shipper profile links should scope public contacts to their workspace");
assert.match(shipperProfileApiSource, /organization_id[\s\S]+locationsQuery\.eq\("organization_id"/, "Shipper profile links should scope public locations to their workspace");
assert.match(shipperProfileApiSource, /shipperOrganization[\s\S]+not valid for the requested workspace/, "Shipper profile links should reject a cross-workspace shipper relation");
assert.match(publicApiHardeningMigration, /revoke all on all tables in schema public from anon, authenticated/i, "Public Data API roles should not read or write Rateware tables directly");
assert.match(publicApiHardeningMigration, /alter default privileges in schema public[\s\S]+revoke all on tables from anon, authenticated/i, "New public tables should not become exposed by default");
assert.match(publicApiHardeningMigration, /alter table %I\.%I enable row level security/i, "Public tables should keep RLS enabled as defense in depth");
assert.match(rlsInitplanMigration, /replace\(policy_record\.qual, 'auth\.jwt\(\)', '\(select auth\.jwt\(\)\)'\)/, "RLS policies should evaluate request claims once per statement");
assert.match(rlsInitplanMigration, /updated_policy_count <> 25/, "RLS optimization should fail when an expected workspace policy is missing");
assert.doesNotMatch(rlsInitplanMigration, /create policy[\s\S]+using \(true\)/i, "RLS optimization must not widen workspace access");
for (const functionName of ["rateware_inherit_rate_owner", "rls_auto_enable"]) {
  assert.match(
    internalTriggerPermissionsMigration,
    new RegExp(`to_regprocedure\\('public\\.${functionName}\\(\\)'\\) is not null`),
    `${functionName} permission hardening should tolerate clean histories where the helper is absent`
  );
  assert.match(
    internalTriggerPermissionsMigration,
    new RegExp(`revoke all on function public\\.${functionName}\\(\\)[\\s\\S]+?from public, anon, authenticated, service_role`),
    `${functionName} must not be callable as a Data API RPC`
  );
}
assert.match(internalTriggerPermissionsMigration, /alter default privileges in schema public[\s\S]+revoke execute on functions from public, anon, authenticated/, "New public functions should start without browser execution privileges");
assert.match(functionSearchPathMigration, /set search_path to pg_catalog, public, pg_temp/, "Legacy functions should resolve objects only through pinned trusted schemas");
assert.match(functionSearchPathMigration, /revoke all on function %I\.%I\(%s\) from public, anon, authenticated/, "Legacy helpers should not remain public Data API RPCs");
assert.match(functionSearchPathMigration, /grant execute on function %I\.%I\(%s\) to service_role/, "The trusted API should retain helper execution");
assert.match(functionSearchPathMigration, /updated_count <> 30/, "Search-path hardening should fail if any expected versioned function is missing");
assert.doesNotMatch(functionSearchPathMigration, /'approve_rate_staging'/, "Search-path hardening should not require the unversioned legacy approval helper during clean replay");
assert.match(permissiveRlsRemovalMigration, /matched_count <> 34/, "RLS hardening should fail if the expected permissive browser policy set drifts");
assert.match(permissiveRlsRemovalMigration, /drop policy %I on public\.%I/, "RLS hardening should remove unrestricted browser write policies from public tables");
assert.match(permissiveRlsRemovalMigration, /cmd <> 'SELECT'/, "RLS hardening should preserve intentionally public read-only policies");
assert.match(permissiveRlsRemovalMigration, /revoke all on all tables in schema public from anon, authenticated/, "RLS hardening should preserve the browser Data API default-deny boundary");
assert.match(permissiveRlsRemovalMigration, /raise exception 'A permissive browser write policy remains in the public schema'/, "RLS hardening should fail closed if an unrestricted write policy remains");
assert.doesNotMatch(permissiveRlsRemovalMigration, /create policy/i, "RLS hardening must not replace unrestricted policies with another browser policy");
assert.match(vendorLogoListingMigration, /where id = 'vendor-logos'[\s\S]+public is true/, "Vendor logo hardening should preserve the public bucket needed by stored logo URLs");
assert.match(vendorLogoListingMigration, /drop policy "public can read vendor logos" on storage\.objects/, "Vendor logo hardening should remove broad object listing access");
assert.match(vendorLogoListingMigration, /matching_policy_count <> 1/, "Vendor logo hardening should fail if the expected listing policy drifts");
assert.match(vendorLogoListingMigration, /raise exception 'A public vendor-logo listing policy remains'/, "Vendor logo hardening should fail closed if listing remains exposed");
assert.doesNotMatch(vendorLogoListingMigration, /update\s+storage\.buckets|public\s*=\s*false/i, "Vendor logo hardening must not make saved public logo URLs private");
const vendorLogoUploadSource = apiSource.slice(apiSource.indexOf('if (body.action === "upload_vendor_logo")'), apiSource.indexOf('if (body.action === "list_vendor_segments")'));
assert.match(vendorLogoUploadSource, /getPublicUrl\(path\)/, "Vendor logo uploads should continue storing a public object URL");
assert.doesNotMatch(vendorLogoUploadSource, /\.list\(/, "Vendor logo uploads must not depend on public bucket listing");
assert.match(duplicateIndexMigration, /keeper\.indkey = duplicate\.indkey/, "Duplicate-index cleanup should compare indexed columns before dropping anything");
assert.match(duplicateIndexMigration, /conindid = to_regclass\('public\.whatsapp_business_connections_owner_email_provider_connecti_key'\)/, "Duplicate-index cleanup should preserve the index backing the WhatsApp UNIQUE constraint");
assert.match(duplicateIndexMigration, /drop index public\.idx_rate_staging_vendor/, "Duplicate-index cleanup should remove the unversioned rate staging duplicate");
assert.match(duplicateIndexMigration, /drop index public\.whatsapp_business_connections_unique_idx/, "Duplicate-index cleanup should remove the redundant explicit WhatsApp index");
assert.match(duplicateIndexMigration, /if to_regclass\('public\.idx_rate_staging_vendor'\) is not null/, "Duplicate-index cleanup should tolerate a clean history without the unversioned rate index");
assert.match(duplicateIndexMigration, /if to_regclass\('public\.whatsapp_business_connections_unique_idx'\) is not null/, "Duplicate-index cleanup should be replay-safe after the redundant WhatsApp index is absent");
assert.match(duplicateIndexMigration, /Canonical rate staging vendor index is missing/, "Duplicate-index cleanup should still fail when the canonical rate index is absent");
assert.doesNotMatch(duplicateIndexMigration, /drop index public\.rate_staging_vendor_domain_idx/, "Duplicate-index cleanup must preserve the migration-owned rate index");
assert.doesNotMatch(duplicateIndexMigration, /drop index public\.whatsapp_business_connections_owner_email_provider_connecti_key/, "Duplicate-index cleanup must preserve the constraint-owned WhatsApp index");
assert.match(duplicateIndexMigration, /raise exception 'A duplicate index remains after cleanup'/, "Duplicate-index cleanup should fail closed if either redundant index remains");
assert.doesNotMatch(missingForeignKeyIndexMigration, /public\.(?:rate_accessorials|rates)\b/, "Clean replay FK indexing must not reference unversioned legacy rate tables");
assert.match(missingForeignKeyIndexMigration, /public\.growth_campaign_members \(contact_id\)/, "Clean replay should retain indexes for versioned foreign-key tables");
assert.match(criticalForeignKeyIndexMigration, /matched_constraint_count <> 5/, "Critical FK indexing should fail if the expected constraint set drifts");
assert.match(criticalForeignKeyIndexMigration, /create index rate_staging_interpretation_job_idx[\s\S]+rate_staging \(interpretation_job_id\)/, "Rate staging should index its populated interpretation-job foreign key");
for (const [indexName, columnName] of [
  ["outreach_messages_template_fk_idx", "template_id"],
  ["outreach_messages_rfx_event_fk_idx", "rfx_event_id"],
  ["outreach_messages_rfx_lane_fk_idx", "rfx_lane_id"],
  ["outreach_messages_rfx_lane_vendor_fk_idx", "rfx_lane_vendor_id"]
]) {
  assert.match(
    criticalForeignKeyIndexMigration,
    new RegExp(`create index ${indexName}[\\s\\S]+outreach_messages \\(${columnName}\\)`),
    `${indexName} should cover its active Outreach foreign key`
  );
}
assert.match(criticalForeignKeyIndexMigration, /valid_index_count <> 5/, "Critical FK indexing should verify that every new index is valid and ready");
assert.match(operationalForeignKeyIndexMigration, /matched_constraint_count <> 12/, "Operational FK indexing should fail if its expected constraint set drifts");
for (const [indexName, tableName, columnName] of [
  ["rateware_lane_legs_border_pair_fk_idx", "rateware_lane_legs", "border_pair_id"],
  ["shipper_contacts_shipper_fk_idx", "shipper_contacts", "shipper_id"],
  ["outreach_campaigns_template_fk_idx", "outreach_campaigns", "template_id"],
  ["bid_room_chat_messages_lane_fk_idx", "bid_room_chat_messages", "rfx_lane_id"],
  ["bid_room_chat_messages_vendor_fk_idx", "bid_room_chat_messages", "vendor_id"],
  ["bid_room_chat_threads_lane_fk_idx", "bid_room_chat_threads", "rfx_lane_id"],
  ["bid_room_chat_threads_vendor_fk_idx", "bid_room_chat_threads", "vendor_id"],
  ["rfx_demand_lanes_project_fk_idx", "rfx_demand_lanes", "project_id"],
  ["rfx_demand_lanes_source_rfi_lane_fk_idx", "rfx_demand_lanes", "source_rfi_lane_id"],
  ["shipper_opportunities_shipper_fk_idx", "shipper_opportunities", "shipper_id"],
  ["email_suppression_message_fk_idx", "email_suppression_list", "outreach_message_id"],
  ["email_suppression_vendor_fk_idx", "email_suppression_list", "vendor_id"]
]) {
  assert.match(
    operationalForeignKeyIndexMigration,
    new RegExp(`create index ${indexName}[\\s\\S]+on public\\.${tableName} \\(${columnName}\\)`),
    `${indexName} should cover ${tableName}.${columnName}`
  );
}
assert.match(operationalForeignKeyIndexMigration, /valid_index_count <> 12/, "Operational FK indexing should verify every new index is valid and ready");
assert.match(rfxRatebookForeignKeyIndexMigration, /matched_constraint_count <> 12/, "RFx and Ratebook FK indexing should fail if its expected constraint set drifts");
for (const [indexName, tableName, columnName] of [
  ["rfx_package_lanes_demand_lane_fk_idx", "rfx_package_lanes", "demand_lane_id"],
  ["rfx_packages_demand_snapshot_fk_idx", "rfx_packages", "demand_snapshot_id"],
  ["rfx_packages_linked_event_fk_idx", "rfx_packages", "linked_rfx_event_id"],
  ["rfx_ratebook_segments_source_segment_fk_idx", "rfx_ratebook_segments", "source_package_segment_id"],
  ["rfx_ratebooks_package_fk_idx", "rfx_ratebooks", "rfx_package_id"],
  ["rfx_ratebooks_shipper_fk_idx", "rfx_ratebooks", "shipper_id"],
  ["rfx_projects_linked_event_fk_idx", "rfx_projects", "linked_rfx_event_id"],
  ["rfx_events_source_process_fk_idx", "rfx_events", "source_rfx_process_project_id"],
  ["rfx_events_customer_fk_idx", "rfx_events", "customer_id"],
  ["rfx_rfi_lanes_submission_fk_idx", "rfx_rfi_lanes", "submission_id"],
  ["rfx_rfi_origins_submission_fk_idx", "rfx_rfi_origins", "submission_id"],
  ["rfx_rfi_destinations_submission_fk_idx", "rfx_rfi_destinations", "submission_id"]
]) {
  assert.match(
    rfxRatebookForeignKeyIndexMigration,
    new RegExp(`create index ${indexName}[\\s\\S]+on public\\.${tableName} \\(${columnName}\\)`),
    `${indexName} should cover ${tableName}.${columnName}`
  );
}
assert.match(rfxRatebookForeignKeyIndexMigration, /valid_index_count <> 12/, "RFx and Ratebook FK indexing should verify every new index is valid and ready");
assert.match(rfiOpportunityForeignKeyIndexMigration, /matched_constraint_count <> 9/, "RFI and opportunity FK indexing should fail if its expected constraint set drifts");
for (const [indexName, tableName, columnName] of [
  ["rfx_rfi_destinations_project_fk_idx", "rfx_rfi_destinations", "project_id"],
  ["rfx_rfi_origins_project_fk_idx", "rfx_rfi_origins", "project_id"],
  ["rfx_rfi_exception_notes_project_fk_idx", "rfx_rfi_exception_notes", "project_id"],
  ["rfx_rfi_submissions_magic_link_fk_idx", "rfx_rfi_submissions", "magic_link_id"],
  ["rfx_demand_snapshots_submission_fk_idx", "rfx_demand_snapshots", "rfi_submission_id"],
  ["rfx_rfi_business_rules_project_fk_idx", "rfx_rfi_business_rules", "project_id"],
  ["rfx_rfi_carrier_requirements_project_fk_idx", "rfx_rfi_carrier_requirements", "project_id"],
  ["rfx_rfi_service_requirements_project_fk_idx", "rfx_rfi_service_requirements", "project_id"],
  ["shipper_opportunities_rfx_project_fk_idx", "shipper_opportunities", "rfx_project_id"]
]) {
  assert.match(
    rfiOpportunityForeignKeyIndexMigration,
    new RegExp(`create index ${indexName}[\\s\\S]+on public\\.${tableName} \\(${columnName}\\)`),
    `${indexName} should cover ${tableName}.${columnName}`
  );
}
assert.match(rfiOpportunityForeignKeyIndexMigration, /valid_index_count <> 9/, "RFI and opportunity FK indexing should verify every new index is valid and ready");
assert.match(whatsappTemplateMappingForeignKeyIndexMigration, /matched_constraint_count <> 1/, "WhatsApp template mapping indexing should fail if its foreign-key contract drifts");
assert.match(
  whatsappTemplateMappingForeignKeyIndexMigration,
  /create index whatsapp_template_mappings_outreach_template_fk_idx[\s\S]+on public\.whatsapp_outreach_template_mappings \(outreach_template_id\)/,
  "WhatsApp template mappings should index their populated outreach-template foreign key"
);
assert.match(whatsappTemplateMappingForeignKeyIndexMigration, /index_is_valid is distinct from true/, "WhatsApp template mapping indexing should verify the new index is valid and ready");
assert.match(kindeSharedSource, /RATEWARE_CORS_ORIGIN/, "CORS origin should be configurable per deployment");
assert.match(kindeSharedSource, /DEFAULT_CORS_ORIGINS = \[[\s\S]+https:\/\/rateware\.vercel\.app[\s\S]+127\.0\.0\.1:3000/, "Production and local CORS should have stable safe defaults");
assert.doesNotMatch(kindeSharedSource, /Access-Control-Allow-Origin": "\*"/, "Shared API responses should not allow every browser origin");
assert.match(kindeSharedSource, /"Vary": "Origin"/, "CORS responses should be cache-safe by origin");
assert.match(kindeSharedSource, /"Access-Control-Max-Age": "86400"/, "Browser clients should reuse the trusted Edge Function preflight result");

console.log("Rateware stability guards passed.");
