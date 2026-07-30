import { initAuthControls, requirePrivatePage } from "./auth.js";
import {
  applyBidUpdateFromChat,
  archiveRfxEvent,
  archiveRfxLaneVendors,
  awardRfxLaneVendor,
  clearRfxAward,
  closeoutAwardedRfxToRateware,
  generateRfxAwardNotices,
  autoShortlistRfxLane,
  createRfxEvent,
  deleteRfxEvent,
  duplicateRfxEvent,
  fetchRfxDetail,
  fetchRfxEvents,
  importRfxLanes,
  inviteRfxLaneVendors,
  fetchBidRoomChat,
  postBidRoomChatMessage,
  sendBidRoomCarrierMessage,
  shortlistRfxLaneVendors,
  syncBidRoomEventThread,
  updateBidRoomChatThread,
  updateRfxEvent,
  updateRfxLane,
  updateRfxBid
} from "./rfx-service.js";
import {
  createOutreachCampaign,
  createOutreachTemplate,
  archiveOutreachAudienceSegment,
  deleteOutreachTemplate,
  fetchContactHistory,
  fetchOutreachAudienceSegments,
  fetchOutreachMessages,
  fetchOutreachMessagesPage,
  fetchOutreachTrackingSummary,
  fetchOutreachTemplates,
  generateOutreachDrafts,
  previewOutreachAudience,
  saveOutreachAudienceSegment,
  deleteOutreachMessages,
  markWhatsappGroupMessageManuallySent,
  markOutreachMessages,
  publishOutreachTemplateToWhatsapp,
  sendOutreachMessages,
  sendWhatsappOutreachMessages,
  sendWhatsappGroupOutreachMessages,
  syncOutreachWhatsappTemplates,
  updateOutreachTemplate
} from "./outreach-service.js?v=20260724-outreach-control-v1";
import { fetchCarrierRecommendations } from "./business-intelligence-service.js";
import { createVendorSegment, deleteVendorSegment, fetchVendorSegments, fetchVendors, updateVendorSegment } from "./vendor-service.js";
import { fetchShippers } from "./shipper-service.js";
import { fetchWhatsappConnections } from "./settings-service.js";
import { initSpreadsheetColumnFilters } from "./spreadsheet-column-filters.js";
import { humanizeError } from "./error-copy.js";
import { errorState, stateBlock, tableErrorState, tableState } from "./ui-state.js";
import { initWorkbenchTabs } from "./workbench-tabs.js";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const DEFAULT_COMMERCIAL_SHARE_PCT = 3;
const XBF_BUY_SELL_DEFAULT_MARKUP_PCT = 12;
const XBF_BUY_SELL_MIN_MARKUP_PCT = 7.5;
const XBF_BUY_SELL_MAX_MARKUP_PCT = 15;
const CRM_VENDOR_INITIAL_PAGE_SIZE = 200;
const CRM_VENDOR_PAGE_SIZE = 1000;
const CRM_VENDOR_SEARCH_LIMIT = 1000;
const RFX_CUSTOMER_SEARCH_LIMIT = 50;
const RFX_CUSTOMER_SEARCH_DEBOUNCE_MS = 180;

function metaNotifierStatus(value = "NOT_PUBLISHED") {
  const normalized = String(value || "NOT_PUBLISHED").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (["PENDING_REVIEW", "UNDER_REVIEW"].includes(normalized)) return "IN_REVIEW";
  return normalized || "NOT_PUBLISHED";
}

function metaNotifierStatusLabel(value = "NOT_PUBLISHED") {
  return metaNotifierStatus(value).toLowerCase().replace(/_/g, " ");
}

function metaNotifierPendingReview(value = "NOT_PUBLISHED") {
  return ["PENDING", "IN_REVIEW", "IN_APPEAL"].includes(metaNotifierStatus(value));
}

function metaNotifierNeedsSync(value = "NOT_PUBLISHED") {
  return ["NOT_SYNCED", "NOT_FOUND", "LANGUAGE_MISMATCH"].includes(metaNotifierStatus(value));
}

const eventForm = document.querySelector("#rfx-event-form");
const rfxIdInput = document.querySelector("#rfx-id");
const rfxNameInput = document.querySelector("#rfx-name");
const rfxCustomerInput = document.querySelector("#rfx-customer");
const rfxCustomerOptions = document.querySelector("#rfx-customer-options");
const rfxCustomerStatus = document.querySelector("#rfx-customer-status");
const rfxTypeInput = document.querySelector("#rfx-type");
const rfxBidVisibilityInput = document.querySelector("#rfx-bid-visibility");
const rfxDueDateInput = document.querySelector("#rfx-due-date");
const eventStatus = document.querySelector("#rfx-event-status");
const eventSetupStatus = document.querySelector("#rfx-event-setup-status");
const publishedEventSummary = document.querySelector("#rfx-event-published-summary");
const publishedEventName = document.querySelector("#rfx-published-event-name");
const publishedEventStatus = document.querySelector("#rfx-published-event-status");
const publishedEventId = document.querySelector("#rfx-published-event-id");
const publishedEventCustomer = document.querySelector("#rfx-published-event-customer");
const publishedEventType = document.querySelector("#rfx-published-event-type");
const publishedEventDue = document.querySelector("#rfx-published-event-due");
const publishedEventVisibility = document.querySelector("#rfx-published-event-visibility");
const eventList = document.querySelector("#rfx-event-list");
const detailTitle = document.querySelector("#rfx-detail-title");
const createRfxEventButton = document.querySelector("#create-rfx-event-button");
const editRfxButton = document.querySelector("#edit-rfx-button");
const duplicateRfxButton = document.querySelector("#duplicate-rfx-button");
const openRfxButton = document.querySelector("#open-rfx-button");
const closeRfxButton = document.querySelector("#close-rfx-button");
const archiveRfxButton = document.querySelector("#archive-rfx-button");
const deleteRfxButton = document.querySelector("#delete-rfx-button");
const laneTemplateFileInput = document.querySelector("#rfx-lane-template-file");
const downloadLaneTemplateButton = document.querySelector("#download-rfx-lane-template");
const importLanesButton = document.querySelector("#import-rfx-lanes-button");
const clearLanesInputButton = document.querySelector("#clear-rfx-lanes-input");
const laneImportStatus = document.querySelector("#rfx-lane-import-status");
const laneEntryTitle = document.querySelector("#rfx-lane-entry-title");
const laneTemplateLabel = document.querySelector("#rfx-lane-template-label");
const laneEntryGuidance = document.querySelector("#rfx-lane-entry-guidance");
const laneTemplatePreview = document.querySelector("#rfx-lane-template-preview");
const laneTemplatePreviewBody = document.querySelector("#rfx-lane-template-preview-body");
const manualLanesBody = document.querySelector("#rfx-manual-lanes-body");
const addManualLaneButton = document.querySelector("#add-manual-rfx-lane");
const clearManualLanesButton = document.querySelector("#clear-manual-rfx-lanes");
const importManualLanesButton = document.querySelector("#import-manual-rfx-lanes-button");
const manualLaneStatus = document.querySelector("#rfx-manual-lane-status");
const lanesBody = document.querySelector("#rfx-lanes-body");
const refreshButton = document.querySelector("#refresh-rfx-events");
const rfxEventFilterSearch = document.querySelector("#rfx-event-filter-search");
const rfxEventStatusFilter = document.querySelector("#rfx-event-status-filter");
const rfxEventTypeFilter = document.querySelector("#rfx-event-type-filter");
const rfxEventVisibilityFilter = document.querySelector("#rfx-event-visibility-filter");
const rfxEventViewSelect = document.querySelector("#rfx-event-view-select");
const rfxEventViewName = document.querySelector("#rfx-event-view-name");
const saveRfxEventViewButton = document.querySelector("#save-rfx-event-view");
const deleteRfxEventViewButton = document.querySelector("#delete-rfx-event-view");
const rfxEventFilterCount = document.querySelector("#rfx-event-filter-count");
const selectionCount = document.querySelector("#rfx-selection-count");
const autoShortlistButton = document.querySelector("#auto-shortlist-selected");
const inviteSelectedButton = document.querySelector("#invite-selected-rfx");
const archiveSelectedButton = document.querySelector("#archive-selected-rfx");
const actionStatus = document.querySelector("#rfx-action-status");
const toggleLaneEditButton = document.querySelector("#toggle-rfx-lane-edit");
const saveLaneEditsButton = document.querySelector("#save-rfx-lane-edits");
const cancelLaneEditsButton = document.querySelector("#cancel-rfx-lane-edits");
const laneEditStatus = document.querySelector("#rfx-lane-edit-status");
const metricEvents = document.querySelector("#rfx-metric-events");
const metricLanes = document.querySelector("#rfx-metric-lanes");
const metricInvites = document.querySelector("#rfx-metric-invites");
const metricBids = document.querySelector("#rfx-metric-bids");
const dashboardTitle = document.querySelector("#rfx-dashboard-title");
const eventDashboard = document.querySelector("#rfx-event-dashboard");
const inviteStatusMix = document.querySelector("#rfx-invite-status");
const dashboardOutreachLink = document.querySelector("#rfx-dashboard-outreach-link");
const copyRfxSummaryButton = document.querySelector("#copy-rfx-summary");
const eventFlow = document.querySelector("#rfx-event-flow");
const laneCoverage = document.querySelector("#rfx-lane-coverage");
const coverageSummary = document.querySelector("#rfx-coverage-summary");
const laneSearch = document.querySelector("#rfx-lane-search");
const laneDecisionTitle = document.querySelector("#rfx-lane-decision-title");
const laneDecisionStatusPill = document.querySelector("#rfx-lane-decision-status");
const laneDecisionBody = document.querySelector("#rfx-lane-decision-body");
const responseSummary = document.querySelector("#rfx-response-summary");
const responseBody = document.querySelector("#rfx-response-body");
const rfxManualBidDrawer = document.querySelector("#rfx-manual-bid-drawer");
const rfxManualBidForm = document.querySelector("#rfx-manual-bid-form");
const rfxManualBidTitle = document.querySelector("#rfx-manual-bid-title");
const rfxManualBidContext = document.querySelector("#rfx-manual-bid-context");
const rfxManualBidRate = document.querySelector("#rfx-manual-bid-rate");
const rfxManualBidCurrency = document.querySelector("#rfx-manual-bid-currency");
const rfxManualBidCommercialModel = document.querySelector("#rfx-manual-bid-commercial-model");
const rfxManualBidCommercialPct = document.querySelector("#rfx-manual-bid-commercial-pct");
const rfxManualBidCommercialLabel = document.querySelector("#rfx-manual-bid-commercial-label");
const rfxManualBidCapacity = document.querySelector("#rfx-manual-bid-capacity");
const rfxManualBidTransit = document.querySelector("#rfx-manual-bid-transit");
const rfxManualBidAvailability = document.querySelector("#rfx-manual-bid-availability");
const rfxManualBidValidThrough = document.querySelector("#rfx-manual-bid-valid-through");
const rfxManualBidPickupEta = document.querySelector("#rfx-manual-bid-pickup-eta");
const rfxManualBidDeliveryEta = document.querySelector("#rfx-manual-bid-delivery-eta");
const rfxManualBidUnitLocation = document.querySelector("#rfx-manual-bid-unit-location");
const rfxManualBidDeadhead = document.querySelector("#rfx-manual-bid-deadhead");
const rfxManualBidDeadheadUnit = document.querySelector("#rfx-manual-bid-deadhead-unit");
const rfxManualBidSource = document.querySelector("#rfx-manual-bid-source");
const rfxManualBidNotes = document.querySelector("#rfx-manual-bid-notes");
const rfxManualBidClose = document.querySelector("#rfx-manual-bid-close");
const rfxManualBidCancel = document.querySelector("#rfx-manual-bid-cancel");
const rfxManualBidSave = document.querySelector("#rfx-manual-bid-save");
const rfxManualBidStatus = document.querySelector("#rfx-manual-bid-status");
const manualShortlistLane = document.querySelector("#manual-shortlist-lane");
const manualShortlistSearch = document.querySelector("#manual-shortlist-search");
const manualShortlistVendors = document.querySelector("#manual-shortlist-vendors");
const manualShortlistVendorList = document.querySelector("#manual-shortlist-vendor-list");
const manualShortlistSourceSummary = document.querySelector("#manual-shortlist-source-summary");
const manualShortlistSegment = document.querySelector("#manual-shortlist-segment");
const manualShortlistSelectedCount = document.querySelector("#manual-shortlist-selected-count");
const manualShortlistSelectedList = document.querySelector("#manual-shortlist-selected-list");
const participantSummaryContent = document.querySelector("#rfx-participant-summary-content");
const participantManager = document.querySelector("#rfx-participant-manager");
const selectVisibleCarriersButton = document.querySelector("#select-visible-carriers");
const selectSegmentCarriersButton = document.querySelector("#select-segment-carriers");
const clearCarrierSelectionButton = document.querySelector("#clear-carrier-selection");
const manualShortlistTemplateName = document.querySelector("#manual-shortlist-template-name");
const saveManualShortlistTemplateButton = document.querySelector("#save-manual-shortlist-template");
const loadManualShortlistTemplateButton = document.querySelector("#load-manual-shortlist-template");
const updateManualShortlistTemplateButton = document.querySelector("#update-manual-shortlist-template");
const deleteManualShortlistTemplateButton = document.querySelector("#delete-manual-shortlist-template");
const manualShortlistButton = document.querySelector("#manual-shortlist-button");
const manualShortlistStatus = document.querySelector("#manual-shortlist-status");
const carrierTemplateFileInput = document.querySelector("#rfx-carrier-template-file");
const downloadCarrierTemplateButton = document.querySelector("#download-rfx-carrier-template");
const importCarrierTemplateButton = document.querySelector("#import-rfx-carrier-template");
const carrierTemplatePreview = document.querySelector("#rfx-carrier-template-preview");
const carrierTemplatePreviewBody = document.querySelector("#rfx-carrier-template-preview-body");
const carrierTemplateStatus = document.querySelector("#rfx-carrier-template-status");
const rfxLaunchWorkspaceTabs = document.querySelector("#rfx-launch-workspace-tabs");
const rfxLaunchWorkspacePanels = [...document.querySelectorAll("[data-rfx-launch-workspace-panel]")];
const rfxOutreachForm = document.querySelector("#rfx-outreach-form");
const rfxOutreachCampaignName = document.querySelector("#rfx-outreach-campaign-name");
const rfxOutreachTemplate = document.querySelector("#rfx-outreach-template");
const rfxOutreachChannel = document.querySelector("#rfx-outreach-channel");
const rfxWhatsappTargetMode = document.querySelector("#rfx-whatsapp-target-mode");
const rfxWhatsappTargetModeField = document.querySelector("#rfx-whatsapp-target-mode-field");
const rfxOutreachSender = document.querySelector("#rfx-outreach-sender");
const createRfxOutreachCampaignButton = document.querySelector("#create-rfx-outreach-campaign");
const rfxOutreachStatus = document.querySelector("#rfx-outreach-status");
const rfxOutreachCarrierAdder = document.querySelector("#rfx-outreach-carrier-adder");
const rfxOutreachCarrierSearch = document.querySelector("#rfx-outreach-carrier-search");
const rfxOutreachCarrierCandidates = document.querySelector("#rfx-outreach-carrier-candidates");
const rfxOutreachCarrierSelected = document.querySelector("#rfx-outreach-carrier-selected");
const rfxOutreachCarrierMatchCount = document.querySelector("#rfx-outreach-carrier-match-count");
const rfxOutreachCarrierSelectedCount = document.querySelector("#rfx-outreach-carrier-selected-count");
const rfxOutreachCarrierScope = document.querySelector("#rfx-outreach-carrier-scope");
const rfxOutreachCarrierSegment = document.querySelector("#rfx-outreach-carrier-segment");
const rfxOutreachCarrierSegmentField = document.querySelector("#rfx-outreach-carrier-segment-field");
const rfxOutreachCarrierFit = document.querySelector("#rfx-outreach-carrier-fit");
const rfxOutreachCarrierLane = document.querySelector("#rfx-outreach-carrier-lane");
const rfxOutreachCarrierFitSummary = document.querySelector("#rfx-outreach-carrier-fit-summary");
const rfxRefreshOutreachCarrierFitButton = document.querySelector("#rfx-refresh-outreach-carrier-fit");
const rfxAddOutreachCarriersButton = document.querySelector("#rfx-add-outreach-carriers");
const rfxClearOutreachCarrierSelectionButton = document.querySelector("#rfx-clear-outreach-carrier-selection");
const rfxOutreachCarrierStatus = document.querySelector("#rfx-outreach-carrier-status");
const rfxOutreachAudienceMode = document.querySelector("#rfx-outreach-audience-mode");
const rfxOutreachAudienceSegment = document.querySelector("#rfx-outreach-audience-segment");
const rfxOutreachAudienceSegmentField = document.querySelector("#rfx-outreach-audience-segment-field");
const rfxOutreachAudienceSearch = document.querySelector("#rfx-outreach-audience-search");
const rfxOutreachAudienceStatusFilter = document.querySelector("#rfx-outreach-audience-status-filter");
const rfxOutreachAudienceSegmentName = document.querySelector("#rfx-outreach-audience-segment-name");
const rfxRefreshOutreachAudienceButton = document.querySelector("#rfx-refresh-outreach-audience");
const rfxSelectReadyOutreachAudienceButton = document.querySelector("#rfx-select-ready-outreach-audience");
const rfxClearOutreachAudienceSelectionButton = document.querySelector("#rfx-clear-outreach-audience-selection");
const rfxSaveOutreachAudienceSegmentButton = document.querySelector("#rfx-save-outreach-audience-segment");
const rfxArchiveOutreachAudienceSegmentButton = document.querySelector("#rfx-archive-outreach-audience-segment");
const rfxOutreachAudienceSummary = document.querySelector("#rfx-outreach-audience-summary");
const rfxOutreachAudienceReadyCount = document.querySelector("#rfx-outreach-audience-ready-count");
const rfxOutreachAudienceContactedCount = document.querySelector("#rfx-outreach-audience-contacted-count");
const rfxOutreachAudienceResponseCount = document.querySelector("#rfx-outreach-audience-response-count");
const rfxOutreachAudienceAttentionCount = document.querySelector("#rfx-outreach-audience-attention-count");
const rfxOutreachAudienceList = document.querySelector("#rfx-outreach-audience-list");
const rfxOutreachAudienceStatus = document.querySelector("#rfx-outreach-audience-status");
const rfxMessageSetupState = document.querySelector("#rfx-message-setup-state");
const rfxEventDeliveryContext = document.querySelector("#rfx-event-delivery-context");
const rfxEventDeliveryOverview = document.querySelector("#rfx-event-delivery-overview");
const rfxOutreachPreview = document.querySelector("#rfx-outreach-preview");
const rfxOutreachPreviewChannel = document.querySelector("#rfx-outreach-preview-channel");
const rfxWhatsappReadiness = document.querySelector("#rfx-whatsapp-readiness");
const rfxWhatsappTemplateReadinessCopy = document.querySelector("#rfx-whatsapp-template-readiness-copy");
const publishWhatsappTemplateButton = document.querySelector("#rfx-publish-whatsapp-template");
const syncWhatsappTemplateButton = document.querySelector("#rfx-sync-whatsapp-template");
const rfxTemplateEditor = document.querySelector("#rfx-template-editor");
const rfxTemplateSubject = document.querySelector("#rfx-template-subject");
const rfxTemplateHtml = document.querySelector("#rfx-template-html");
const rfxTemplateWhatsapp = document.querySelector("#rfx-template-whatsapp");
const saveRfxTemplateHtmlButton = document.querySelector("#save-rfx-template-html");
const resetRfxTemplateHtmlButton = document.querySelector("#reset-rfx-template-html");
const restoreRfxTemplateOriginalButton = document.querySelector("#restore-rfx-template-original");
const rfxTemplateEditorStatus = document.querySelector("#rfx-template-editor-status");
const touchpointSummary = document.querySelector("#rfx-touchpoint-summary");
const touchpointList = document.querySelector("#rfx-touchpoint-list");
const draftSummary = document.querySelector("#rfx-draft-summary");
const draftList = document.querySelector("#rfx-draft-list");
const draftSearchInput = document.querySelector("#rfx-draft-search");
const draftClearSearchButton = document.querySelector("#rfx-clear-draft-search");
const draftTrackingFilters = document.querySelector("#rfx-draft-tracking-filters");
const draftPageSummary = document.querySelector("#rfx-draft-page-summary");
const draftPageSize = document.querySelector("#rfx-draft-page-size");
const draftPreviousPageButton = document.querySelector("#rfx-draft-page-previous");
const draftNextPageButton = document.querySelector("#rfx-draft-page-next");
const draftSelectionLabel = document.querySelector("#rfx-draft-selection-label");
const draftToggleVisible = document.querySelector("#rfx-toggle-visible-drafts");
const draftSelectAllEmailsButton = document.querySelector("#rfx-select-all-email-drafts");
const draftClearSelectionButton = document.querySelector("#rfx-clear-draft-selection");
const draftRefreshSelectedButton = document.querySelector("#rfx-refresh-selected-drafts");
const draftSendSelectedButton = document.querySelector("#rfx-send-selected-email-drafts");
const draftSendSelectedWhatsappButton = document.querySelector("#rfx-send-selected-whatsapp-drafts");
const draftMarkSelectedWhatsappGroupsButton = document.querySelector("#rfx-mark-selected-whatsapp-groups");
const draftArchiveSelectedButton = document.querySelector("#rfx-archive-selected-drafts");
const draftDeleteSelectedButton = document.querySelector("#rfx-delete-selected-drafts");
const wizardRefreshButton = document.querySelector("#rfx-wizard-refresh");
const wizardLiveOffersButton = document.querySelector("#rfx-wizard-live-offers");
const wizardSteps = document.querySelector("#rfx-wizard-steps");
const wizardPrimary = document.querySelector("#rfx-wizard-primary");
const wizardPreview = document.querySelector("#rfx-wizard-preview");
const liveOfferManager = document.querySelector("#rfx-live-offer-manager");
const rfxOperateWorkspaceTabs = document.querySelector("#rfx-operate-workspace-tabs");
const rfxOperateWorkspacePanels = [...document.querySelectorAll("[data-rfx-operate-workspace-panel]")];
const rfxChatThreadType = document.querySelector("#rfx-chat-thread-type");
const rfxChatRecipientContext = document.querySelector("#rfx-chat-recipient-context");
const rfxChatRecipientName = document.querySelector("#rfx-chat-recipient-name");
const rfxChatRecipientLane = document.querySelector("#rfx-chat-recipient-lane");
const rfxChatRecipientClear = document.querySelector("#rfx-chat-recipient-clear");
const rfxChatLane = document.querySelector("#rfx-chat-lane");
const rfxChatVendor = document.querySelector("#rfx-chat-vendor");
const rfxChatRefresh = document.querySelector("#rfx-chat-refresh");
const rfxChatStartEventThread = document.querySelector("#rfx-chat-start-event-thread");
const rfxChatThreadList = document.querySelector("#rfx-chat-thread-list");
const rfxChatForm = document.querySelector("#rfx-chat-form");
const rfxChatMessage = document.querySelector("#rfx-chat-message");
const rfxChatDeliveryHelp = document.querySelector("#rfx-chat-delivery-help");
const rfxChatComposeEmpty = document.querySelector("#rfx-chat-compose-empty");
const rfxChatSend = document.querySelector("#rfx-chat-send");
const rfxChatStatus = document.querySelector("#rfx-chat-status");
const rfxChatSyncStatus = document.querySelector("#rfx-chat-sync-status");
const rfxChatMetricThreads = document.querySelector("#rfx-chat-metric-threads");
const rfxChatMetricNeedsReply = document.querySelector("#rfx-chat-metric-needs-reply");
const rfxChatMetricCarrier = document.querySelector("#rfx-chat-metric-carrier");
const rfxChatMetricGoogle = document.querySelector("#rfx-chat-metric-google");
const rfxChatInboxFilters = document.querySelector("#rfx-chat-inbox-filters");
const rfxChatCopySummary = document.querySelector("#rfx-chat-copy-summary");
const rfxChatAiSummary = document.querySelector("#rfx-chat-ai-summary");
const rfxChatSignalQueue = document.querySelector("#rfx-chat-signal-queue");
const rfxChatBidUpdateDrawer = document.querySelector("#rfx-chat-bid-update-drawer");
const rfxChatBidUpdateForm = document.querySelector("#rfx-chat-bid-update-form");
const rfxChatBidUpdateTitle = document.querySelector("#rfx-chat-bid-update-title");
const rfxChatBidUpdateInvitation = document.querySelector("#rfx-chat-bid-update-invitation");
const rfxChatBidUpdateRate = document.querySelector("#rfx-chat-bid-update-rate");
const rfxChatBidUpdateCurrency = document.querySelector("#rfx-chat-bid-update-currency");
const rfxChatBidUpdateCapacity = document.querySelector("#rfx-chat-bid-update-capacity");
const rfxChatBidUpdateTransit = document.querySelector("#rfx-chat-bid-update-transit");
const rfxChatBidUpdateNotes = document.querySelector("#rfx-chat-bid-update-notes");
const rfxChatBidUpdateSource = document.querySelector("#rfx-chat-bid-update-source");
const rfxChatBidUpdateClose = document.querySelector("#rfx-chat-bid-update-close");
const rfxChatBidUpdateCloseSecondary = document.querySelector("#rfx-chat-bid-update-close-secondary");
const rfxChatBidUpdateApply = document.querySelector("#rfx-chat-bid-update-apply");
const rfxChatBidUpdateStatus = document.querySelector("#rfx-chat-bid-update-status");
const rfxOpsTitle = document.querySelector("#rfx-ops-title");
const rfxOpsSubtitle = document.querySelector("#rfx-ops-subtitle");
const rfxOpsHealth = document.querySelector("#rfx-ops-health");
const rfxOpsOutreachLink = document.querySelector("#rfx-ops-outreach-link");
const rfxOpsStageRail = document.querySelector("#rfx-ops-stage-rail");
const rfxOpsNextAction = document.querySelector("#rfx-ops-next-action");
const rfxLaunchReadiness = document.querySelector("#rfx-launch-readiness");
const rfxManagerFlow = document.querySelector("#rfx-manager-flow");
const rfxManagerFocus = document.querySelector("#rfx-manager-focus");
const rfxManagerQueue = document.querySelector("#rfx-manager-queue");
const rfxAwardNeedsDecision = document.querySelector("#rfx-award-needs-decision");
const rfxAwardBoard = document.querySelector("#rfx-award-board");
const rfxAwardStatus = document.querySelector("#rfx-award-status");
const rfxAwardStatusPill = document.querySelector("#rfx-award-status-pill");
const rfxAwardLanes = document.querySelector("#rfx-award-lanes");
const rfxAwardPrimary = document.querySelector("#rfx-award-primary");
const rfxAwardBackup = document.querySelector("#rfx-award-backup");
const rfxAwardRateware = document.querySelector("#rfx-award-rateware");
const rfxAwardReadiness = document.querySelector("#rfx-award-readiness");
const rfxApplyRecommendedAwardsButton = document.querySelector("#rfx-apply-recommended-awards");
const rfxCloseoutAwardsButton = document.querySelector("#rfx-closeout-awards-to-rateware");
const rfxRefreshAwardsButton = document.querySelector("#rfx-refresh-awards");
const rfxGenerateAwardNoticesButton = document.querySelector("#rfx-generate-award-notices");
const rfxSendAwardNoticesButton = document.querySelector("#rfx-send-award-notices");
const rfxAwardNoticeSummary = document.querySelector("#rfx-award-notice-summary");
const rfxAwardNoticeQueue = document.querySelector("#rfx-award-notice-queue");
const rfxAwardNoticePreview = document.querySelector("#rfx-award-notice-preview");
const rfxCloseWorkspaceTabs = document.querySelector("#rfx-close-workspace-tabs");
const rfxCloseWorkspacePanels = [...document.querySelectorAll("[data-rfx-close-workspace-panel]")];

const RFX_WORKSPACE_CONTEXT_STORAGE_KEY = "rateware:bid-room:workspace-context:v1";
const RFX_EVENT_VIEWS_STORAGE_KEY = "rateware:bid-room:event-views:v1";
const RFX_LANE_FILTER_KEYS = new Set(["all", "needs_shortlist", "needs_invite", "needs_response", "has_bids", "above_benchmark"]);
const RFX_CHAT_FILTER_KEYS = new Set(["all", "unread", "needs_reply", "carrier", "google", "signals"]);
const RFX_LAUNCH_WORKSPACE_KEYS = new Set(["carrier", "message", "delivery"]);
const RFX_OPERATE_WORKSPACE_KEYS = new Set(["auction", "communications", "carrier-bids"]);
const RFX_CLOSE_WORKSPACE_KEYS = new Set(["award", "rateware", "notices"]);
const RFX_DRAFT_PAGE_SIZES = [50, 100, 250];
const rfxPageParams = new URLSearchParams(window.location.search);
const requestedRfxEventId = rfxPageParams.get("rfx_event_id");
const requestedRfxLaneFilter = rfxPageParams.get("lane_filter");
const requestedRfxChatFilter = rfxPageParams.get("chat_filter");
const requestedRfxDraftPageSize = Number(rfxPageParams.get("draft_page_size"));
const storedRfxWorkspaceContext = readRfxWorkspaceContext(RFX_WORKSPACE_CONTEXT_STORAGE_KEY);
let events = [];
let eventFilterSearch = String(storedRfxWorkspaceContext.eventFilterSearch || "");
let eventStatusFilter = String(storedRfxWorkspaceContext.eventStatusFilter || "all");
let eventTypeFilter = String(storedRfxWorkspaceContext.eventTypeFilter || "all");
let eventVisibilityFilter = String(storedRfxWorkspaceContext.eventVisibilityFilter || "all");
let savedRfxEventViews = readStoredRfxEventViews();
let selectedRfxEventViewId = "";
let selectedEventId = requestedRfxEventId || String(storedRfxWorkspaceContext.eventId || "") || null;
let selectedEvent = null;
let rfxLaunchWorkspace = RFX_LAUNCH_WORKSPACE_KEYS.has(storedRfxWorkspaceContext.launchWorkspace)
  ? storedRfxWorkspaceContext.launchWorkspace
  : "carrier";
let rfxOperateWorkspace = RFX_OPERATE_WORKSPACE_KEYS.has(storedRfxWorkspaceContext.operateWorkspace)
  ? storedRfxWorkspaceContext.operateWorkspace
  : "auction";
let rfxCloseWorkspace = RFX_CLOSE_WORKSPACE_KEYS.has(storedRfxWorkspaceContext.closeWorkspace)
  ? storedRfxWorkspaceContext.closeWorkspace
  : "award";
let editingEventId = null;
let currentLanes = [];
let vendorOptions = [];
const vendorOptionCache = new Map();
let vendorSearchRows = [];
let vendorSearchTotal = 0;
let vendorInitialTotal = 0;
let outreachTemplates = [];
let rfxTemplateEditorTemplateId = null;
let rfxTemplateEditorDirty = false;
let rfxTemplateVisualEditing = false;
let contactHistoryRows = [];
let outreachMessages = [];
let bidRoomChatThreads = { rows: [], google_chat_configured: false };
let bidRoomChatFilter = RFX_CHAT_FILTER_KEYS.has(requestedRfxChatFilter)
  ? requestedRfxChatFilter
  : RFX_CHAT_FILTER_KEYS.has(storedRfxWorkspaceContext.chatFilter)
    ? storedRfxWorkspaceContext.chatFilter
    : "all";
let bidRoomChatRefreshTimer = null;
let bidRoomChatLoadVersion = 0;
let rfxEventsLoadVersion = 0;
let rfxEventsLoadRequest = null;
let rfxDetailLoadVersion = 0;
const rfxDetailRequests = new Map();
const rfxContactHistoryRequests = new Map();
const rfxOutreachMessageRequests = new Map();
const rfxChatRequests = new Map();
let participantBulkMutationRunning = false;
let eventLifecycleMutationRunning = false;
let awardMutationRunning = false;
let awardNoticePreviewId = "";
const awardNoticeSelectedIds = new Set();
let draftQueueMutationRunning = false;
let pendingChatBidUpdate = null;
let pendingManualBid = null;
let selectedChatRecipient = null;
let bidRoomCarrierMessageRequestKey = "";
let responseColumnFilters = null;
let responseBoardRowsCache = [];
let selectedLaneIds = new Set();
let selectedInvitationIds = new Set();
let selectedDraftMessageIds = new Set();
const selectedDraftMessageRows = new Map();
let draftQueueSearch = rfxPageParams.has("draft_search")
  ? String(rfxPageParams.get("draft_search") || "")
  : String(storedRfxWorkspaceContext.draftSearch || "");
let draftSearchRenderTimer = null;
let draftQueueRows = [];
let draftQueueTotal = 0;
let draftQueueOffset = rfxPageParams.has("draft_offset")
  ? Math.max(0, Number(rfxPageParams.get("draft_offset")) || 0)
  : Math.max(0, Number(storedRfxWorkspaceContext.draftOffset) || 0);
let draftQueuePageSize = RFX_DRAFT_PAGE_SIZES.includes(requestedRfxDraftPageSize)
  ? requestedRfxDraftPageSize
  : RFX_DRAFT_PAGE_SIZES.includes(Number(storedRfxWorkspaceContext.draftPageSize))
    ? Number(storedRfxWorkspaceContext.draftPageSize)
    : 100;
let draftQueueLoading = false;
let draftQueueLoadVersion = 0;
let draftQueueLoadRequest = null;
let draftQueueTrackingStatus = rfxPageParams.get("draft_tracking") || String(storedRfxWorkspaceContext.draftTracking || "all");
let draftQueueTrackingSummary = { total: 0, states: {} };
let draftQueueTrackingScopeKey = "";
let draftQueueTrackingLoading = false;
let draftQueueTrackingRequest = null;
let draftQueueTrackingLoadVersion = 0;
let outreachAudienceRows = [];
let outreachAudienceCounts = {};
let outreachAudienceTotal = 0;
let outreachAudienceSegments = [];
let selectedOutreachAudienceVendorIds = new Set();
let outreachAudienceLoading = false;
let outreachAudienceLoadVersion = 0;
let outreachAudienceSearchTimer = null;
let focusedLaneId = null;
let activeLaneFilter = RFX_LANE_FILTER_KEYS.has(requestedRfxLaneFilter)
  ? requestedRfxLaneFilter
  : RFX_LANE_FILTER_KEYS.has(storedRfxWorkspaceContext.laneFilter)
    ? storedRfxWorkspaceContext.laneFilter
    : "all";
let laneEditMode = false;
let editingLaneId = null;
let pendingLaneEdits = new Map();
let pendingLaneTemplateRows = [];
let pendingLaneTemplateIssues = [];
let manualLaneRows = [];
let pendingCarrierTemplateRows = [];
let pendingCarrierTemplateMatches = [];
let vendorOptionsLoading = true;
let vendorOptionsHydrating = false;
let vendorOptionsError = "";
let vendorOptionsLoadVersion = 0;
let vendorSearchLoading = false;
let vendorSearchTimer = null;
let vendorSearchSequence = 0;
let carrierWorkspaceLoadPromise = null;
let rfxCustomerRows = [];
let rfxCustomerSearchTimer = null;
let vendorSegmentsLoading = true;
let savedVendorSegments = [];
let vendorSegmentsLoadVersion = 0;
let participantTemplateMutationRunning = false;
let participantAddRunning = false;
let selectedManualVendorIdsState = new Set();
let rfxCarrierFitEvidenceByVendorId = new Map();
let rfxCarrierFitEvidenceLoading = false;
let rfxCarrierFitEvidenceError = "";
let rfxCarrierFitEvidenceLoadVersion = 0;
let whatsappConnectionReadiness = {
  loaded: false,
  ready: false,
  message: "Validate WhatsApp Business in Settings before sending."
};
const rfxWorkbench = initWorkbenchTabs({ defaultView: "setup" });
const APPROVED_GMAIL_SENDER = "sales@heymarksman.com";
const OUTREACH_SEND_BATCH_SIZE = 100;
const DRAFT_TRACKING_STATES = [
  ["all", "All"],
  ["drafted", "Drafted"],
  ["queued", "Queued"],
  ["sending", "Sending"],
  ["sent", "Sent"],
  ["delivered", "Delivered"],
  ["read", "Read"],
  ["manual_sent", "Manual sent"],
  ["delivery_unknown", "Delivery unknown"],
  ["failed", "Failed"],
  ["replied", "Replied"],
  ["quoted", "Quoted"],
  ["bounced", "Bounced"],
  ["suppressed", "Suppressed"],
  ["archived", "Archived"]
];
if (!DRAFT_TRACKING_STATES.some(([status]) => status === draftQueueTrackingStatus)) draftQueueTrackingStatus = "all";
const BID_ROOM_PARTICIPANT_BATCH_SIZE = 1000;
const BID_ROOM_PARTICIPANT_SELECTION_STORAGE_PREFIX = "rateware:bid-room:participant-selection:";
const DRAFT_QUEUE_SEARCH_DEBOUNCE_MS = 120;

function readRfxWorkspaceContext(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function readStoredRfxEventViews() {
  try {
    const value = JSON.parse(window.localStorage.getItem(RFX_EVENT_VIEWS_STORAGE_KEY) || "[]");
    return Array.isArray(value)
      ? value.filter((view) => view && typeof view === "object" && view.name && view.id).slice(0, 30)
      : [];
  } catch {
    return [];
  }
}

function writeStoredRfxEventViews() {
  try {
    window.localStorage.setItem(RFX_EVENT_VIEWS_STORAGE_KEY, JSON.stringify(savedRfxEventViews));
  } catch {
    // Saved filters remain available in the current session when storage is blocked.
  }
}

function writeRfxWorkspaceContext(value) {
  try {
    window.localStorage.setItem(RFX_WORKSPACE_CONTEXT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The Bid Room remains usable for the current session when storage is blocked.
  }
}

function syncRfxWorkspaceUrl() {
  try {
    const url = new URL(window.location.href);
    const setOrRemove = (key, value, defaultValue = "") => {
      if (value === undefined || value === null || value === "" || value === defaultValue) url.searchParams.delete(key);
      else if (key === "rfx_event_id") url.searchParams.set("rfx_event_id", String(value));
      else url.searchParams.set(key, String(value));
    };
    setOrRemove("rfx_event_id", selectedEventId);
    setOrRemove("lane_filter", activeLaneFilter, "all");
    setOrRemove("lane_search", laneSearch?.value || "");
    setOrRemove("draft_search", draftQueueSearch);
    setOrRemove("draft_tracking", draftQueueTrackingStatus, "all");
    setOrRemove("draft_offset", draftQueueOffset, 0);
    setOrRemove("draft_page_size", draftQueuePageSize === 100 ? "" : draftQueuePageSize);
    setOrRemove("chat_filter", bidRoomChatFilter, "all");
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // The Bid Room remains usable when URL history is unavailable.
  }
}

function applyRfxUrlStateFromBrowser() {
  const params = new URLSearchParams(window.location.search);
  const nextEventId = params.get("rfx_event_id");
  const eventChanged = nextEventId !== selectedEventId;
  selectedEventId = nextEventId || null;
  activeLaneFilter = RFX_LANE_FILTER_KEYS.has(params.get("lane_filter")) ? params.get("lane_filter") : "all";
  bidRoomChatFilter = RFX_CHAT_FILTER_KEYS.has(params.get("chat_filter")) ? params.get("chat_filter") : "all";
  draftQueueSearch = params.has("draft_search") ? String(params.get("draft_search") || "") : "";
  draftQueueOffset = params.has("draft_offset") ? Math.max(0, Number(params.get("draft_offset")) || 0) : 0;
  const nextPageSize = Number(params.get("draft_page_size"));
  draftQueuePageSize = RFX_DRAFT_PAGE_SIZES.includes(nextPageSize) ? nextPageSize : 100;
  draftQueueTrackingStatus = params.get("draft_tracking") || "all";
  if (!DRAFT_TRACKING_STATES.some(([status]) => status === draftQueueTrackingStatus)) draftQueueTrackingStatus = "all";
  if (laneSearch) laneSearch.value = params.has("lane_search") ? String(params.get("lane_search") || "") : "";
  if (draftSearchInput) draftSearchInput.value = draftQueueSearch;
  if (draftPageSize) draftPageSize.value = String(draftQueuePageSize);
  document.querySelectorAll("[data-rfx-lane-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.rfxLaneFilter === activeLaneFilter);
  });
  document.querySelectorAll("[data-rfx-chat-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.rfxChatFilter === bidRoomChatFilter);
  });
  const requestedView = params.get("view");
  if (requestedView) rfxWorkbench?.activate(requestedView);
  if (eventChanged) {
    resetDraftQueue({ clearSelection: true });
    void loadEvents();
    return;
  }
  renderLanes();
  renderBidRoomChat();
  renderDraftQueue();
  void loadDraftQueuePage(selectedEventId, { refreshTracking: true });
}

function normalizeRfxLaunchWorkspace(value) {
  return RFX_LAUNCH_WORKSPACE_KEYS.has(value) ? value : "carrier";
}

function activateRfxLaunchWorkspace(workspace, options = {}) {
  const { persist = true, refresh = false } = options;
  rfxLaunchWorkspace = normalizeRfxLaunchWorkspace(workspace);
  rfxLaunchWorkspaceTabs?.querySelectorAll("[data-rfx-launch-workspace]").forEach((button) => {
    const active = button.dataset.rfxLaunchWorkspace === rfxLaunchWorkspace;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  rfxLaunchWorkspacePanels.forEach((panel) => {
    panel.hidden = panel.dataset.rfxLaunchWorkspacePanel !== rfxLaunchWorkspace;
  });
  if (rfxLaunchWorkspace === "message") renderOutreachPreview();
  if (rfxLaunchWorkspace === "delivery") {
    renderDraftQueue();
    if (selectedEventId && (refresh || !draftQueueRows.length)) {
      void loadDraftQueuePage(selectedEventId, { refreshTracking: true });
    }
  }
  if (persist) persistRfxWorkspaceContext();
}

function normalizeRfxOperateWorkspace(value) {
  return RFX_OPERATE_WORKSPACE_KEYS.has(value) ? value : "auction";
}

function activateRfxOperateWorkspace(workspace, options = {}) {
  const { persist = true, focus = false } = options;
  rfxOperateWorkspace = normalizeRfxOperateWorkspace(workspace);
  rfxOperateWorkspaceTabs?.querySelectorAll("[data-rfx-operate-workspace-tab]").forEach((button) => {
    const active = button.dataset.rfxOperateWorkspaceTab === rfxOperateWorkspace;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  rfxOperateWorkspacePanels.forEach((panel) => {
    panel.hidden = panel.dataset.rfxOperateWorkspacePanel !== rfxOperateWorkspace;
  });
  if (rfxOperateWorkspace === "communications") renderBidRoomChat();
  if (rfxOperateWorkspace === "auction") renderLiveOfferManager();
  if (rfxOperateWorkspace === "carrier-bids") renderResponseBoard();
  if (persist) persistRfxWorkspaceContext();
  if (focus) {
    const focusTarget = rfxOperateWorkspace === "communications"
      ? rfxChatMessage
      : rfxOperateWorkspace === "carrier-bids"
        ? responseBody
        : liveOfferManager;
    window.requestAnimationFrame(() => focusTarget?.focus?.());
  }
}

function normalizeRfxCloseWorkspace(value) {
  return RFX_CLOSE_WORKSPACE_KEYS.has(value) ? value : "award";
}

function activateRfxCloseWorkspace(workspace, options = {}) {
  const { persist = true, focus = false } = options;
  rfxCloseWorkspace = normalizeRfxCloseWorkspace(workspace);
  rfxCloseWorkspaceTabs?.querySelectorAll("[data-rfx-close-workspace-tab]").forEach((button) => {
    const active = button.dataset.rfxCloseWorkspaceTab === rfxCloseWorkspace;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  rfxCloseWorkspacePanels.forEach((panel) => {
    panel.hidden = panel.dataset.rfxCloseWorkspacePanel !== rfxCloseWorkspace;
  });
  if (focus) {
    const focusTarget = rfxCloseWorkspace === "award"
      ? rfxAwardBoard
      : rfxCloseWorkspace === "rateware"
        ? rfxCloseoutAwardsButton
        : rfxGenerateAwardNoticesButton;
    window.requestAnimationFrame(() => focusTarget?.focus?.());
  }
  if (persist) persistRfxWorkspaceContext();
}

function persistRfxWorkspaceContext() {
  writeRfxWorkspaceContext({
    eventId: selectedEventId,
    eventFilterSearch,
    eventStatusFilter,
    eventTypeFilter,
    eventVisibilityFilter,
    laneFilter: activeLaneFilter,
    laneSearch: String(laneSearch?.value || ""),
    draftSearch: draftQueueSearch,
    draftOffset: draftQueueOffset,
    draftPageSize: draftQueuePageSize,
    draftTracking: draftQueueTrackingStatus,
    chatFilter: bidRoomChatFilter,
    launchWorkspace: rfxLaunchWorkspace,
    operateWorkspace: rfxOperateWorkspace,
    closeWorkspace: rfxCloseWorkspace
  });
  syncRfxWorkspaceUrl();
}

if (laneSearch) laneSearch.value = rfxPageParams.has("lane_search")
  ? String(rfxPageParams.get("lane_search") || "")
  : String(storedRfxWorkspaceContext.laneSearch || "");
if (draftSearchInput) draftSearchInput.value = draftQueueSearch;
if (draftPageSize) draftPageSize.value = String(draftQueuePageSize);
document.querySelectorAll("[data-rfx-lane-filter]").forEach((button) => {
  button.classList.toggle("is-active", button.dataset.rfxLaneFilter === activeLaneFilter);
});
document.querySelectorAll("[data-rfx-chat-filter]").forEach((button) => {
  button.classList.toggle("is-active", button.dataset.rfxChatFilter === bidRoomChatFilter);
});

const RFX_LANE_TEMPLATE_COLUMNS = [
  { key: "lane_number", label: "Lane #", example: "1" },
  { key: "origin", label: "Origin", required: true, example: "Apodaca, NL" },
  { key: "origin_city", label: "Origin City", example: "Apodaca" },
  { key: "origin_state", label: "Origin ST", example: "NL" },
  { key: "origin_country", label: "Origin Country", example: "MX" },
  { key: "origin_market", label: "Origin Market", example: "Monterrey Market" },
  { key: "origin_region", label: "Origin Region", example: "Northeast Mexico" },
  { key: "destination", label: "Destination", required: true, example: "Dallas, TX" },
  { key: "destination_city", label: "Destination City", example: "Dallas" },
  { key: "destination_state", label: "Destination ST", example: "TX" },
  { key: "destination_country", label: "Destination Country", example: "US" },
  { key: "destination_market", label: "Destination Market", example: "Dallas Mkt (TX)" },
  { key: "destination_region", label: "Destination Region", example: "Texas" },
  { key: "equipment", label: "Equipment", example: "Truck Trailer" },
  { key: "trailer", label: "Trailer", example: "Dry Van" },
  { key: "config", label: "Config", example: "Single" },
  { key: "operation", label: "Operation", example: "D2D Export" },
  { key: "service", label: "Service", example: "One Way" },
  { key: "weekly_volume", label: "Weekly Volume", example: "10" },
  { key: "annual_volume", label: "Annual Volume", example: "520" },
  { key: "target_rate", label: "Target Rate", example: "2900" },
  { key: "currency", label: "Currency", example: "USD" },
  { key: "incumbent_vendor", label: "Incumbent Vendor", example: "carrier.com" },
  { key: "logistics_model", label: "Logistics Model", example: "Direct service; cross-border D2D" },
  { key: "operation_criteria", label: "Operation Criteria", example: "Pickup Mon-Sat 07:00-18:00; 48h pickup notice" },
  { key: "business_rules", label: "Business Rules", example: "Border crossing included; no transload" },
  { key: "service_specifications", label: "Service Specifications", example: "53 ft dry van; standard jacks included" },
  { key: "carrier_requirements", label: "Required Carrier Profile", example: "Authority, insurance, fleet, tracking and escalation contact" },
  { key: "other_notes", label: "Other Notes", example: "Carrier must quote direct service only" },
  { key: "notes", label: "Notes", example: "Hazmat allowed" }
];

const MANUAL_LANE_DEFAULTS = {
  equipment: "Truck Trailer",
  trailer: "Dry Van",
  config: "Single",
  operation: "D2D Export",
  service: "One Way",
  currency: "USD"
};

const MANUAL_LANE_OPERATIONS = ["D2D Export", "D2D Import", "Intra-Mex", "US Northbound", "US Southbound", "Domestic US", "Domestic MX"];
const MANUAL_LANE_SERVICES = ["One Way", "Roundtrip", "Spot", "Dedicated"];
const MANUAL_LANE_CURRENCIES = ["USD", "MXN", "CAD"];
const EDITABLE_RFX_LANE_FIELDS = [
  "lane_number",
  "origin",
  "destination",
  "equipment",
  "trailer",
  "config",
  "operation",
  "service",
  "weekly_volume",
  "annual_volume",
  "target_rate",
  "currency",
  "logistics_model",
  "operation_criteria",
  "business_rules",
  "service_specifications",
  "carrier_requirements",
  "other_notes",
  "notes"
];

const RFX_CARRIER_TEMPLATE_COLUMNS = [
  { key: "participate", label: "Participate", example: "TRUE" },
  { key: "vendor_id", label: "CRM Vendor ID", example: "" },
  { key: "vendor_name", label: "Vendor Name", example: "Carrier Logistics" },
  { key: "vendor_domain", label: "Vendor Domain", example: "carrier.com" },
  { key: "vendor_email", label: "Vendor Email", example: "pricing@carrier.com" },
  { key: "base_stage", label: "Base Stage", example: "procurement" },
  { key: "status", label: "Status", example: "active" },
  { key: "preferred_channel", label: "Preferred Channel", example: "email" },
  { key: "coverage_notes", label: "Coverage Notes", example: "Cross-border MX-US" },
  { key: "tags", label: "Tags", example: "flatbed; cross-border" },
  { key: "notes", label: "Notes", example: "Target invite wave 1" }
];
const BID_ROOM_EVENT_THREAD_TYPE = "event_group";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(element, message, tone = "neutral") {
  if (!element) return;
  const normalized = tone === "error" ? humanizeError(message) : message;
  element.textContent = normalized;
  element.dataset.tone = tone;
  if (["success", "error", "danger"].includes(tone)) {
    window.ratewareNotify?.({ tone: tone === "error" ? "danger" : tone, message: normalized });
  }
}

function shipperCustomerName(row = {}) {
  return String(row.shipper_name || row.legal_name || row.domain || "").trim();
}

function shipperCustomerLabel(row = {}) {
  const location = [row.headquarters_city, row.headquarters_state, row.headquarters_country].filter(Boolean).join(", ");
  return [
    row.legal_name && row.legal_name !== row.shipper_name ? row.legal_name : "",
    row.domain,
    row.relationship_stage,
    row.segment,
    location
  ].filter(Boolean).join(" | ");
}

function renderRfxCustomerOptions(rows = []) {
  if (!rfxCustomerOptions) return;
  rfxCustomerOptions.innerHTML = rows.map((row) => {
    const name = shipperCustomerName(row);
    if (!name) return "";
    const label = shipperCustomerLabel(row);
    return `<option value="${escapeHtml(name)}"${label ? ` label="${escapeHtml(label)}"` : ""}></option>`;
  }).join("");

  if (rfxCustomerStatus) {
    rfxCustomerStatus.textContent = rows.length
      ? `${formatNumber(rows.length)} Shipper CRM customer(s) available.`
      : "No Shipper CRM customers found. You can still type a customer name.";
    rfxCustomerStatus.dataset.tone = rows.length ? "neutral" : "warning";
  }
}

async function loadRfxCustomerOptions(search = "") {
  if (!rfxCustomerOptions) return;
  const term = String(search || "").trim();
  if (rfxCustomerStatus) {
    rfxCustomerStatus.textContent = term ? "Searching Shipper CRM customers..." : "Loading Shipper CRM customers...";
    rfxCustomerStatus.dataset.tone = "neutral";
  }
  try {
    const result = await fetchShippers({
      search: term,
      status: "all",
      limit: RFX_CUSTOMER_SEARCH_LIMIT,
      offset: 0
    });
    rfxCustomerRows = Array.isArray(result?.rows) ? result.rows : [];
    renderRfxCustomerOptions(rfxCustomerRows);
  } catch (error) {
    if (rfxCustomerStatus) {
      rfxCustomerStatus.textContent = `Shipper CRM customer lookup failed: ${humanizeError(error)}`;
      rfxCustomerStatus.dataset.tone = "error";
    }
  }
}

function queueRfxCustomerSearch() {
  if (!rfxCustomerInput) return;
  window.clearTimeout(rfxCustomerSearchTimer);
  rfxCustomerSearchTimer = window.setTimeout(() => {
    loadRfxCustomerOptions(rfxCustomerInput.value);
  }, RFX_CUSTOMER_SEARCH_DEBOUNCE_MS);
}

function selectedRfxCustomerName() {
  const value = String(rfxCustomerInput?.value || "").trim();
  if (!value) return "";
  const normalized = normalizeLookupText(value);
  const matched = rfxCustomerRows.find((row) => {
    return [row.shipper_name, row.legal_name, row.domain]
      .filter(Boolean)
      .some((candidate) => normalizeLookupText(candidate) === normalized);
  });
  return shipperCustomerName(matched) || value;
}

function selectedRfxCustomerId() {
  const value = String(rfxCustomerInput?.value || "").trim();
  if (!value) return "";
  const normalized = normalizeLookupText(value);
  const matched = rfxCustomerRows.find((row) => {
    return [row.shipper_name, row.legal_name, row.domain]
      .filter(Boolean)
      .some((candidate) => normalizeLookupText(candidate) === normalized);
  });
  return matched?.id || "";
}

function normalizeSelectedRfxCustomer() {
  if (!rfxCustomerInput) return;
  const selectedName = selectedRfxCustomerName();
  if (selectedName) rfxCustomerInput.value = selectedName;
}

function rfxEventPayload() {
  return {
    rfx_id: rfxIdInput.value,
    name: rfxNameInput.value,
    customer: selectedRfxCustomerName(),
    customer_id: selectedRfxCustomerId(),
    event_type: rfxTypeInput.value,
    bid_visibility_mode: rfxBidVisibilityInput?.value || "anonymous_rank",
    due_date: rfxDueDateInput.value
  };
}

function updateEventActionState() {
  const hasSelection = Boolean(selectedEventId);
  [editRfxButton, duplicateRfxButton, openRfxButton, closeRfxButton, archiveRfxButton, deleteRfxButton]
    .forEach((button) => {
      if (button) button.disabled = !hasSelection || eventLifecycleMutationRunning;
    });
}

function eventLifecycleRiskSummary() {
  const invitations = currentLanes.flatMap((lane) => lane.invitations || []);
  const activeInviteRows = invitations.filter((item) => item.invitation_status !== "archived");
  const messageRows = selectedEventId
    ? outreachMessages.filter((message) => message.rfx_event_id === selectedEventId && String(message.status || "").toLowerCase() !== "archived")
    : [];
  return {
    lanes: currentLanes.length,
    participants: activeInviteRows.length,
    bids: invitations.filter(hasBid).length,
    awards: activeInviteRows.filter((item) => item.award_role).length,
    ratewareRows: activeInviteRows.filter((item) => item.rate_staging_id).length,
    messages: messageRows.length,
    sentMessages: messageRows.filter((message) => String(message.status || "").toLowerCase() === "sent").length
  };
}

function eventLifecycleRiskLines(summary = eventLifecycleRiskSummary()) {
  return [
    `${formatNumber(summary.lanes)} lane(s)`,
    `${formatNumber(summary.participants)} participant row(s)`,
    `${formatNumber(summary.bids)} bid(s)`,
    `${formatNumber(summary.awards)} award decision(s)`,
    `${formatNumber(summary.ratewareRows)} Rateware closeout row(s)`,
    `${formatNumber(summary.sentMessages)} sent email(s)`
  ];
}

function confirmEventLifecycleAction(action) {
  const label = selectedEvent?.rfx_id || selectedEvent?.name || "this bid event";
  const summaryText = eventLifecycleRiskLines().join(" | ");
  if (action === "open") {
    return window.confirm(`Open ${label}? Current scope: ${summaryText}.`);
  }
  if (action === "close") {
    return window.confirm(`Close ${label}? Current scope: ${summaryText}.`);
  }
  if (action === "duplicate") {
    return window.confirm(`Duplicate ${label}? Lanes and active shortlisted vendors will be copied. This does not send invitations. Current scope: ${summaryText}.`);
  }
  if (action === "archive") {
    return window.confirm(`Archive ${label}? It will be hidden from active Bid Room lists. Current scope: ${summaryText}.`);
  }
  if (action === "delete") {
    const typed = window.prompt(`Type "${label}" to delete this bid event and related RFx rows. Current scope: ${summaryText}.`);
    return typed === label;
  }
  return true;
}

function resetRfxEventForm() {
  editingEventId = null;
  eventForm?.reset();
  if (createRfxEventButton) createRfxEventButton.textContent = "Create event";
  renderEventSetupState();
}

function fillRfxEventForm(event) {
  if (!event) return;
  editingEventId = event.id;
  rfxIdInput.value = event.rfx_id || "";
  rfxNameInput.value = event.name || "";
  rfxCustomerInput.value = event.customer || "";
  rfxTypeInput.value = event.event_type || "spot";
  if (rfxBidVisibilityInput) rfxBidVisibilityInput.value = event.bid_visibility_mode || "anonymous_rank";
  rfxDueDateInput.value = event.due_date || "";
  if (createRfxEventButton) createRfxEventButton.textContent = "Save changes";
  renderEventSetupState();
  activateWorkbenchView("setup", "#rfx-id");
  eventForm?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function publishedEventTypeLabel(value = "") {
  return {
    spot: "Spot",
    rfx: "RFx",
    bid: "Bid"
  }[String(value || "").toLowerCase()] || value || "-";
}

function publishedEventVisibilityLabel(value = "") {
  return {
    anonymous_rank: "Anonymous rank",
    open_leaderboard: "Open leaderboard",
    private: "Private blind"
  }[String(value || "").toLowerCase()] || value || "-";
}

function renderEventSetupState() {
  const showPublishedSummary = Boolean(selectedEvent && !editingEventId);
  if (publishedEventSummary) publishedEventSummary.hidden = !showPublishedSummary;
  if (eventForm) eventForm.hidden = showPublishedSummary;
  if (participantManager) {
    const participantManagementMovedToLaunch = Boolean(selectedEvent && String(selectedEvent.status || "").toLowerCase() !== "draft");
    participantManager.hidden = participantManagementMovedToLaunch;
    if (participantManagementMovedToLaunch) participantManager.open = false;
  }
  if (eventSetupStatus) {
    eventSetupStatus.textContent = showPublishedSummary ? "Saved event" : selectedEvent ? "Editing event" : "Required before lanes";
    eventSetupStatus.className = `status-pill ${showPublishedSummary && String(selectedEvent?.status || "").toLowerCase() === "open" ? "success" : "muted"}`;
  }
  if (!showPublishedSummary || !selectedEvent) return;
  if (publishedEventName) publishedEventName.textContent = selectedEvent.name || selectedEvent.rfx_id || "Bid event";
  if (publishedEventStatus) {
    publishedEventStatus.textContent = selectedEvent.status || "draft";
    publishedEventStatus.className = `status-pill ${String(selectedEvent.status || "").toLowerCase() === "open" ? "success" : "muted"}`;
  }
  if (publishedEventId) publishedEventId.textContent = selectedEvent.rfx_id || "-";
  if (publishedEventCustomer) publishedEventCustomer.textContent = selectedEvent.customer || "-";
  if (publishedEventType) publishedEventType.textContent = publishedEventTypeLabel(selectedEvent.event_type);
  if (publishedEventDue) publishedEventDue.textContent = selectedEvent.due_date || "No due date";
  if (publishedEventVisibility) publishedEventVisibility.textContent = publishedEventVisibilityLabel(selectedEvent.bid_visibility_mode);
}

function formatNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(number);
}

function chunkRows(rows = [], size = OUTREACH_SEND_BATCH_SIZE) {
  const chunkSize = Math.max(1, Number(size) || OUTREACH_SEND_BATCH_SIZE);
  const chunks = [];
  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }
  return chunks;
}

function formatMoney(value, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number)} ${currency || "USD"}`;
}

function supplyDepthTone(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "muted";
  if (value >= 75) return "success";
  if (value >= 50) return "warning";
  if (value > 0) return "danger";
  return "muted";
}

function supplyDepthLabel(score, reason = "") {
  if (reason === "currency_mismatch") return "No matching currency";
  if (reason === "target_not_set") return "Set target";
  const value = Number(score);
  if (!Number.isFinite(value)) return "No signal";
  if (value >= 75) return "High likelihood";
  if (value >= 50) return "Moderate likelihood";
  if (value > 0) return "Low likelihood";
  return "No signal";
}

function renderSupplyDepthCell(lane, options = {}) {
  const depth = lane?.supply_depth || {};
  const carrierCount = Number(depth.carrier_count || 0);
  const quoteCount = Number(depth.quote_count || 0);
  if (!quoteCount) {
    return `
      <div class="rfx-supply-depth-cell rfx-supply-depth-compact" data-tone="muted" data-supply-tooltip="No approved carrier quotes matched this lane yet." tabindex="0" aria-label="No supply depth history">
        <strong>-</strong>
        <span>No history</span>
      </div>
    `;
  }
  const score = Math.max(0, Math.min(100, Number(depth.likelihood_score || 0)));
  const rawProbability = depth.target_probability;
  const probability = rawProbability === null || rawProbability === undefined || rawProbability === "" ? null : Number(rawProbability);
  const reason = String(depth.target_probability_reason || "");
  const sameCurrencyQuoteCount = Number(depth.comparable_quote_count || 0);
  const hasSameCurrencyHistory = sameCurrencyQuoteCount > 0;
  const historyCurrencies = Array.isArray(depth.historical_currencies) ? depth.historical_currencies.filter(Boolean).join(", ") : depth.currency || "";
  const probabilityLabel = Number.isFinite(probability)
    ? `${formatNumber(probability)}% likely at buy target`
    : reason === "currency_mismatch"
      ? `History ${historyCurrencies || "-"} | target ${depth.target_currency || lane.currency || "-"}`
      : "Add target buy rate";
  const quoteLabel = reason === "currency_mismatch"
    ? `${formatNumber(quoteCount)} route quote${quoteCount === 1 ? "" : "s"} | 0 ${depth.target_currency || lane.currency || ""} price quote${quoteCount === 1 ? "" : "s"}`
    : `${formatNumber(quoteCount)} route quote${quoteCount === 1 ? "" : "s"} | ${formatNumber(sameCurrencyQuoteCount)} price quote${sameCurrencyQuoteCount === 1 ? "" : "s"}`;
  const typicalRange = hasSameCurrencyHistory && depth.p50_rate && depth.p75_rate
    ? `Typical range ${formatMoney(depth.p50_rate, depth.currency)} - ${formatMoney(depth.p75_rate, depth.currency)}`
    : "";
  const tone = Number.isFinite(probability) ? supplyDepthTone(score) : "muted";
  const tooltip = [quoteLabel, probabilityLabel, typicalRange, options.bestBidLabel].filter(Boolean).join(" | ");
  return `
    <div class="rfx-supply-depth-cell rfx-supply-depth-compact" data-tone="${escapeHtml(tone)}" data-supply-tooltip="${escapeHtml(tooltip)}" tabindex="0" aria-label="${escapeHtml(`${formatNumber(carrierCount)} carriers, ${supplyDepthLabel(score, reason)}`)}">
      <strong>${formatNumber(carrierCount)}</strong>
      <span>${escapeHtml(supplyDepthLabel(score, reason))}</span>
      <div class="rfx-supply-meter" aria-label="${escapeHtml(`${formatNumber(score)} percent supply likelihood`)}">
        <i style="width: ${escapeHtml(String(Number.isFinite(probability) ? score : 0))}%"></i>
      </div>
    </div>
  `;
}

function bidVisibilityLabel(mode = "anonymous_rank") {
  const labels = {
    private: "Private blind",
    anonymous_rank: "Anonymous rank",
    open_leaderboard: "Open leaderboard"
  };
  return labels[mode] || labels.anonymous_rank;
}

function marketplaceUrlForEvent(eventId) {
  return "./bid-room-board.html";
}

function cleanHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseDelimitedRows(text) {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function slugify(value) {
  return String(value || "list")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "list";
}

function mapHeader(header) {
  const aliases = {
    from: "origin",
    orig: "origin",
    o_city: "origin_city",
    o_state: "origin_state",
    o_st: "origin_state",
    o_market: "origin_market",
    o_region: "origin_region",
    to: "destination",
    dest: "destination",
    d_city: "destination_city",
    d_state: "destination_state",
    d_st: "destination_state",
    d_market: "destination_market",
    d_region: "destination_region",
    equip: "equipment",
    trailer_type: "trailer",
    loads_per_week: "weekly_volume",
    weekly_loads: "weekly_volume",
    volume: "weekly_volume",
    target: "target_rate",
    budget: "target_rate",
    logistics_model: "logistics_model",
    logistic_model: "logistics_model",
    modelo_logistico: "logistics_model",
    modelo_logistica: "logistics_model",
    modelo_de_logistica: "logistics_model",
    modelo_operativo: "logistics_model",
    embarque_spot_o_programado: "logistics_model",
    spot_o_programado: "logistics_model",
    operation_criteria: "operation_criteria",
    operational_criteria: "operation_criteria",
    criterios_de_operacion: "operation_criteria",
    criterio_de_operacion: "operation_criteria",
    criterios_operativos: "operation_criteria",
    pickup_criteria: "operation_criteria",
    delivery_criteria: "operation_criteria",
    business_rules: "business_rules",
    reglas_de_negocio: "business_rules",
    regla_de_negocio: "business_rules",
    reglas_comerciales: "business_rules",
    plazo_para_recoger: "business_rules",
    asistencia_del_conductor: "business_rules",
    doble_chofer: "business_rules",
    service_specifications: "service_specifications",
    service_specs: "service_specifications",
    especificaciones_de_servicio: "service_specifications",
    especificacion_de_servicio: "service_specifications",
    especificaciones_del_servicio: "service_specifications",
    elementos_adicionales_en_el_remolque_camion_almacenamiento_de_carga_etc: "service_specifications",
    additional_service_elements: "service_specifications",
    carrier_requirements: "carrier_requirements",
    required_carrier_profile: "carrier_requirements",
    carrier_profile: "carrier_requirements",
    perfil_requerido: "carrier_requirements",
    perfil_requerido_del_carrier: "carrier_requirements",
    requisitos_del_carrier: "carrier_requirements",
    other_notes: "other_notes",
    otras_notas: "other_notes",
    notas_adicionales: "other_notes",
    additional_notes: "other_notes"
  };
  const key = cleanHeader(header);
  return aliases[key] || key;
}

function rowsFromTemplateMatrix(matrix = []) {
  const headerIndex = matrix.findIndex((row) => {
    const headers = row.map(mapHeader);
    return headers.includes("origin") && headers.includes("destination");
  });
  if (headerIndex < 0) {
    throw new Error("Template headers not found. Keep the RFx lane template header row intact.");
  }
  const headers = matrix[headerIndex].map(mapHeader);
  return matrix.slice(headerIndex + 1)
    .map((row, index) => {
      const item = { lane_number: index + 1 };
      headers.forEach((header, cellIndex) => {
        if (!header) return;
        item[header] = row[cellIndex] ?? "";
      });
      return item;
    })
    .filter((row) => Object.entries(row).some(([key, value]) => key !== "lane_number" && String(value ?? "").trim()));
}

function normalizeTemplateRows(rows = []) {
  return rows.map((row, index) => {
    const normalized = { lane_number: Number(row.lane_number || row.lane || row.seq || index + 1) || index + 1 };
    RFX_LANE_TEMPLATE_COLUMNS.forEach((column) => {
      if (column.key === "lane_number") return;
      const value = row[column.key] ?? row[mapHeader(column.label)] ?? "";
      normalized[column.key] = typeof value === "string" ? value.trim() : value;
    });
    normalized.currency = String(normalized.currency || "USD").trim().toUpperCase();
    return normalized;
  });
}

function validateLaneTemplateRows(rows = []) {
  return rows.map((row, index) => {
    const issues = [];
    if (!String(row.origin || "").trim()) issues.push("origin required");
    if (!String(row.destination || "").trim()) issues.push("destination required");
    if (!String(row.equipment || "").trim()) issues.push("equipment recommended");
    if (!String(row.trailer || "").trim()) issues.push("trailer recommended");
    if (!String(row.operation || "").trim()) issues.push("operation recommended");
    if (!String(row.service || "").trim()) issues.push("service recommended");
    return { index, row, issues };
  });
}

function newManualLaneRow() {
  return {
    lane_number: manualLaneRows.length + 1,
    origin: "",
    destination: "",
    equipment: MANUAL_LANE_DEFAULTS.equipment,
    trailer: MANUAL_LANE_DEFAULTS.trailer,
    config: MANUAL_LANE_DEFAULTS.config,
    operation: MANUAL_LANE_DEFAULTS.operation,
    service: MANUAL_LANE_DEFAULTS.service,
    weekly_volume: "",
    target_rate: "",
    currency: MANUAL_LANE_DEFAULTS.currency,
    logistics_model: "",
    operation_criteria: "",
    business_rules: "",
    service_specifications: "",
    carrier_requirements: "",
    other_notes: "",
    notes: ""
  };
}

function hasManualLaneUserInput(row = {}) {
  return Boolean(
    String(row.origin || "").trim()
    || String(row.destination || "").trim()
    || String(row.weekly_volume || "").trim()
    || String(row.target_rate || "").trim()
    || String(row.logistics_model || "").trim()
    || String(row.operation_criteria || "").trim()
    || String(row.business_rules || "").trim()
    || String(row.service_specifications || "").trim()
    || String(row.carrier_requirements || "").trim()
    || String(row.other_notes || "").trim()
    || String(row.notes || "").trim()
  );
}

function manualLaneIssues(row = {}) {
  const issues = [];
  if (!String(row.origin || "").trim()) issues.push("origin required");
  if (!String(row.destination || "").trim()) issues.push("destination required");
  return issues;
}

function manualLaneImportRows() {
  return manualLaneRows
    .filter(hasManualLaneUserInput)
    .map((row, index) => normalizeTemplateRows([{ ...row, lane_number: index + 1 }])[0]);
}

function manualLaneSelectOptions(values, selected) {
  const selectedValue = String(selected || "");
  const allValues = values.includes(selectedValue) || !selectedValue ? values : [selectedValue, ...values];
  return allValues.map((value) => `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function laneEditPatch(laneId) {
  return pendingLaneEdits.get(String(laneId)) || {};
}

function laneEditValue(lane, field) {
  const patch = laneEditPatch(lane.id);
  return Object.prototype.hasOwnProperty.call(patch, field) ? patch[field] : (lane[field] ?? "");
}

function laneHasPendingEdits(laneId) {
  return Object.keys(laneEditPatch(laneId)).length > 0;
}

function updateLaneEditControls() {
  const dirtyCount = pendingLaneEdits.size;
  if (toggleLaneEditButton) {
    toggleLaneEditButton.textContent = laneEditMode ? "Done editing" : "Edit lane";
    toggleLaneEditButton.disabled = !selectedEventId || !currentLanes.length;
  }
  if (saveLaneEditsButton) saveLaneEditsButton.disabled = !laneEditMode || !dirtyCount;
  if (cancelLaneEditsButton) cancelLaneEditsButton.disabled = !laneEditMode || !dirtyCount;
  if (laneEditStatus) {
    laneEditStatus.textContent = laneEditMode
      ? dirtyCount
        ? `${dirtyCount} modified lane${dirtyCount === 1 ? "" : "s"} not saved.`
        : `Editing lane ${editingLaneId ? `#${currentLanes.find((lane) => String(lane.id) === String(editingLaneId))?.lane_number || ""}` : ""}. Changes are saved only when you click Save.`
      : "";
    laneEditStatus.dataset.tone = dirtyCount ? "warning" : "neutral";
  }
}

function markLaneEdited(laneId, field, value) {
  if (!EDITABLE_RFX_LANE_FIELDS.includes(field)) return;
  const id = String(laneId || "");
  if (!id) return;
  const lane = currentLanes.find((item) => String(item.id) === id);
  if (!lane) return;
  const nextValue = String(value ?? "");
  const originalValue = String(lane[field] ?? "");
  const patch = { ...laneEditPatch(id) };
  if (nextValue === originalValue) delete patch[field];
  else patch[field] = nextValue;
  if (Object.keys(patch).length) pendingLaneEdits.set(id, patch);
  else pendingLaneEdits.delete(id);
  updateLaneEditControls();
  const row = lanesBody?.querySelector(`[data-rfx-lane-id="${CSS.escape(id)}"]`);
  row?.classList.toggle("is-dirty-row", laneHasPendingEdits(id));
}

function laneEditInput(lane, field, options = {}) {
  const value = laneEditValue(lane, field);
  const attrs = `data-rfx-lane-field="${escapeHtml(field)}"`;
  if (options.type === "select") {
    return `<select ${attrs}>${manualLaneSelectOptions(options.values || [], value)}</select>`;
  }
  const inputType = options.type || "text";
  return `<input ${attrs} type="${escapeHtml(inputType)}" value="${escapeHtml(value)}" ${options.inputmode ? `inputmode="${escapeHtml(options.inputmode)}"` : ""} placeholder="${escapeHtml(options.placeholder || "")}" />`;
}

function laneEditTextarea(lane, field, label, placeholder = "") {
  return `
    <label>
      ${escapeHtml(label)}
      <textarea data-rfx-lane-field="${escapeHtml(field)}" rows="2" placeholder="${escapeHtml(placeholder)}">${escapeHtml(laneEditValue(lane, field))}</textarea>
    </label>
  `;
}

function laneRubricCell(lane, field, emptyLabel = "-") {
  const value = String(lane?.[field] ?? "").trim();
  return `<span class="rfx-lane-cell-text" title="${escapeHtml(value || emptyLabel)}">${escapeHtml(value || emptyLabel)}</span>`;
}

function laneEditRubricCell(lane, field, placeholder = "") {
  return `<textarea class="rfx-inline-rubric-input" data-rfx-lane-field="${escapeHtml(field)}" rows="2" placeholder="${escapeHtml(placeholder)}">${escapeHtml(laneEditValue(lane, field))}</textarea>`;
}

function insertClipboardHtmlIntoTextarea(event, selector, statusElement) {
  const field = event.target.closest(selector);
  if (!field || field.tagName !== "TEXTAREA") return false;
  const html = event.clipboardData?.getData("text/html") || "";
  if (!html.trim()) return false;
  event.preventDefault();
  const start = Number.isInteger(field.selectionStart) ? field.selectionStart : field.value.length;
  const end = Number.isInteger(field.selectionEnd) ? field.selectionEnd : start;
  const before = field.value.slice(0, start);
  const after = field.value.slice(end);
  field.value = `${before}${html}${after}`;
  const cursor = start + html.length;
  field.selectionStart = cursor;
  field.selectionEnd = cursor;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  setStatus(statusElement, "HTML pasted as source text. Save changes to keep it.", "warning");
  return true;
}

function renderEditableLaneRow(lane, context = {}) {
  const dirty = laneHasPendingEdits(lane.id);
  return `
    <tr data-rfx-lane-id="${escapeHtml(lane.id)}" class="rfx-lane-edit-row${lane.id === focusedLaneId ? " is-selected-lane" : ""}${dirty ? " is-dirty-row" : ""}">
      <td>
        <div class="compact-actions rfx-inline-lane-actions">
          <button class="small-button" type="button" data-rfx-save-lane="${escapeHtml(lane.id)}" ${dirty ? "" : "disabled"}>Save</button>
          <button class="secondary small-button" type="button" data-rfx-cancel-lane="${escapeHtml(lane.id)}" ${dirty ? "" : "disabled"}>Revert</button>
        </div>
      </td>
      <td>
        <label class="table-checkbox">
          <input type="checkbox" data-rfx-lane-select="${escapeHtml(lane.id)}" ${selectedLaneIds.has(lane.id) ? "checked" : ""} />
        </label>
      </td>
      <td>
        ${laneEditInput(lane, "lane_number", { inputmode: "numeric" })}
      </td>
      <td>${laneEditInput(lane, "origin", { placeholder: "Origin" })}</td>
      <td>${laneEditInput(lane, "destination", { placeholder: "Destination" })}</td>
      <td>
        ${laneEditInput(lane, "equipment", { placeholder: "Equipment" })}
      </td>
      <td>${laneEditInput(lane, "trailer", { placeholder: "Trailer" })}</td>
      <td>${laneEditInput(lane, "config", { placeholder: "Config" })}</td>
      <td>
        ${laneEditInput(lane, "operation", { type: "select", values: MANUAL_LANE_OPERATIONS })}
      </td>
      <td>
        ${laneEditInput(lane, "service", { type: "select", values: MANUAL_LANE_SERVICES })}
      </td>
      <td>${laneEditInput(lane, "weekly_volume", { inputmode: "decimal", placeholder: "Weekly" })}</td>
      <td>${laneEditInput(lane, "target_rate", { inputmode: "decimal", placeholder: "Target" })}</td>
      <td>${laneEditInput(lane, "currency", { type: "select", values: MANUAL_LANE_CURRENCIES })}</td>
      <td>${laneEditRubricCell(lane, "logistics_model", "Direct service, D2D...")}</td>
      <td>${laneEditRubricCell(lane, "operation_criteria", "Windows, appointments...")}</td>
      <td>${laneEditRubricCell(lane, "business_rules", "Fuel, detention, border...")}</td>
      <td>${laneEditRubricCell(lane, "service_specifications", "Equipment, tracking...")}</td>
      <td>${laneEditRubricCell(lane, "carrier_requirements", "Authority, insurance...")}</td>
      <td>${laneEditRubricCell(lane, "other_notes", "RFI or customer notes...")}</td>
      <td>${laneEditRubricCell(lane, "notes", "Internal context...")}</td>
      <td>
        ${renderSupplyDepthCell(lane, { bestBidLabel: context.bestBid ? `Best bid ${formatMoney(context.bestBid.board_rate ?? context.bestBid.numeric_bid ?? context.bestBid.bid_rate, context.bestBid.currency || lane.currency)}` : "" })}
      </td>
      <td>
        <div class="rfx-lane-progress-cell">
          ${statusChip(dirty ? "Unsaved" : laneDecisionLabel(context.decision))}
        </div>
      </td>
    </tr>
  `;
}

function updateManualLaneImportButton() {
  if (!importManualLanesButton) return;
  const rows = manualLaneRows.filter(hasManualLaneUserInput);
  const invalidRows = rows.filter((row) => manualLaneIssues(row).length);
  importManualLanesButton.disabled = !selectedEventId || rfxLaneEntryMode() === "locked" || !rows.length || invalidRows.length > 0;
  if (!rows.length) {
    setStatus(manualLaneStatus, "Add origin and destination for each manual lane.");
  } else if (invalidRows.length) {
    setStatus(manualLaneStatus, `${invalidRows.length} manual row(s) need origin and destination before import.`, "error");
  } else if (!selectedEventId) {
    setStatus(manualLaneStatus, `${rows.length} manual lane(s) ready. Select or create a bid event before import.`, "warning");
  } else {
    setStatus(manualLaneStatus, `${rows.length} manual lane(s) ready to import.`, "success");
  }
}

function renderManualLaneRows() {
  if (!manualLanesBody) return;
  if (!manualLaneRows.length) manualLaneRows = [newManualLaneRow()];
  manualLanesBody.innerHTML = manualLaneRows.map((row, index) => {
    const active = hasManualLaneUserInput(row);
    const issues = active ? manualLaneIssues(row) : [];
    const rowClass = issues.length ? "is-muted-row" : "";
    return `
      <tr class="${rowClass}" data-manual-lane-index="${index}">
        <td class="rfx-manual-lane-actions">
          <button class="secondary small-button" type="button" data-remove-manual-lane="${index}" ${manualLaneRows.length === 1 ? "disabled" : ""}>Remove</button>
        </td>
        <td><input data-manual-lane-field="origin" value="${escapeHtml(row.origin || "")}" placeholder="Apodaca, NL" /></td>
        <td><input data-manual-lane-field="destination" value="${escapeHtml(row.destination || "")}" placeholder="Dallas, TX" /></td>
        <td><input data-manual-lane-field="equipment" value="${escapeHtml(row.equipment || "")}" placeholder="Truck Trailer" /></td>
        <td><input data-manual-lane-field="trailer" value="${escapeHtml(row.trailer || "")}" placeholder="Dry Van" /></td>
        <td>
          <select data-manual-lane-field="operation">
            ${manualLaneSelectOptions(MANUAL_LANE_OPERATIONS, row.operation || MANUAL_LANE_DEFAULTS.operation)}
          </select>
        </td>
        <td>
          <select data-manual-lane-field="service">
            ${manualLaneSelectOptions(MANUAL_LANE_SERVICES, row.service || MANUAL_LANE_DEFAULTS.service)}
          </select>
        </td>
        <td><input data-manual-lane-field="weekly_volume" value="${escapeHtml(row.weekly_volume || "")}" inputmode="decimal" placeholder="10" /></td>
        <td><input data-manual-lane-field="target_rate" value="${escapeHtml(row.target_rate || "")}" inputmode="decimal" placeholder="2900" /></td>
        <td>
          <select data-manual-lane-field="currency">
            ${manualLaneSelectOptions(MANUAL_LANE_CURRENCIES, row.currency || MANUAL_LANE_DEFAULTS.currency)}
          </select>
        </td>
        <td><textarea class="rfx-manual-rubric-input" data-manual-lane-field="logistics_model" rows="1" placeholder="Direct service, D2D...">${escapeHtml(row.logistics_model || "")}</textarea></td>
        <td><textarea class="rfx-manual-rubric-input" data-manual-lane-field="operation_criteria" rows="1" placeholder="Windows, appointments...">${escapeHtml(row.operation_criteria || "")}</textarea></td>
        <td><textarea class="rfx-manual-rubric-input" data-manual-lane-field="business_rules" rows="1" placeholder="Fuel, detention, border...">${escapeHtml(row.business_rules || "")}</textarea></td>
        <td><textarea class="rfx-manual-rubric-input" data-manual-lane-field="service_specifications" rows="1" placeholder="Equipment, tracking...">${escapeHtml(row.service_specifications || "")}</textarea></td>
        <td><textarea class="rfx-manual-rubric-input" data-manual-lane-field="carrier_requirements" rows="1" placeholder="Authority, insurance...">${escapeHtml(row.carrier_requirements || "")}</textarea></td>
        <td><textarea class="rfx-manual-rubric-input" data-manual-lane-field="other_notes" rows="1" placeholder="RFI or customer notes...">${escapeHtml(row.other_notes || "")}</textarea></td>
        <td><textarea class="rfx-manual-rubric-input" data-manual-lane-field="notes" rows="1" placeholder="Internal context...">${escapeHtml(row.notes || "")}</textarea></td>
      </tr>
    `;
  }).join("");
  updateManualLaneImportButton();
}

function readyLaneTemplateRows() {
  return pendingLaneTemplateIssues
    .filter((item) => !item.issues.some((issue) => issue.includes("required")))
    .map((item) => item.row);
}

function rfxLaneEntryMode(event = selectedEvent) {
  const status = String(event?.status || "").toLowerCase();
  if (status === "open") return "append";
  if (["closed", "awarded", "archived"].includes(status)) return "locked";
  return "initial";
}

function updateLaneEntryControls() {
  const mode = rfxLaneEntryMode();
  const isAppend = mode === "append";
  const isLocked = mode === "locked";
  if (laneEntryTitle) {
    laneEntryTitle.textContent = isAppend
      ? "Add lanes to the published business book"
      : isLocked
        ? "Business book is closed"
        : "Load lanes by template or quick manual entry";
  }
  if (downloadLaneTemplateButton) {
    downloadLaneTemplateButton.textContent = isAppend ? "Download add-lanes template" : "Download template";
    downloadLaneTemplateButton.disabled = isLocked;
  }
  if (laneTemplateLabel) {
    laneTemplateLabel.textContent = isAppend
      ? "Upload new lanes only (existing lanes and bids are preserved)"
      : isLocked
        ? "Lane imports are disabled after closeout"
        : "Filled template for large RFx books";
  }
  if (laneEntryGuidance) {
    laneEntryGuidance.textContent = isAppend
      ? "Append-only mode: new lanes are added after validation. Existing lanes, invitations and bids remain unchanged."
      : isLocked
        ? "This event is closed. New lanes cannot be added."
        : "Upload a completed lane template to preview rows before import.";
  }
  if (laneTemplateFileInput) laneTemplateFileInput.disabled = isLocked;
  if (addManualLaneButton) addManualLaneButton.disabled = isLocked;
  if (clearManualLanesButton) clearManualLanesButton.disabled = isLocked;
}

function updateLaneImportButton() {
  if (!importLanesButton) return;
  const hasTemplateRows = readyLaneTemplateRows().length > 0;
  const mode = rfxLaneEntryMode();
  importLanesButton.textContent = mode === "append" ? "Add lanes" : "Import template";
  importLanesButton.disabled = !selectedEventId || !hasTemplateRows || mode === "locked";
  updateLaneEntryControls();
  updateManualLaneImportButton();
}

function renderLaneTemplatePreview() {
  if (!laneTemplatePreview || !laneTemplatePreviewBody) return;
  const issues = pendingLaneTemplateIssues;
  const readyRows = readyLaneTemplateRows();
  laneTemplatePreview.hidden = !issues.length;
  if (!issues.length) {
    laneTemplatePreviewBody.innerHTML = "";
    return;
  }
  laneTemplatePreviewBody.innerHTML = issues.slice(0, 8).map((item) => `
    <tr class="${item.issues.some((issue) => issue.includes("required")) ? "is-muted-row" : ""}">
      <td>${escapeHtml(item.row.lane_number || item.index + 1)}</td>
      <td>${escapeHtml(item.row.origin || "-")}</td>
      <td>${escapeHtml(item.row.destination || "-")}</td>
      <td>${escapeHtml(item.row.equipment || "-")} / ${escapeHtml(item.row.trailer || "-")}</td>
      <td>${escapeHtml(item.row.operation || "-")} / ${escapeHtml(item.row.service || "-")}</td>
      <td>${escapeHtml(item.issues.join(", ") || "ready")}</td>
    </tr>
  `).join("");
  updateLaneImportButton();
  const blocked = issues.length - readyRows.length;
  const suffix = selectedEventId ? "" : " Select or create a bid event before import.";
  const message = `${readyRows.length} ready lane(s). ${blocked} row(s) need required origin/destination cleanup.${suffix}`;
  setStatus(laneImportStatus, message, readyRows.length ? "success" : "error");
}

function clearLaneTemplateImport({ preserveStatus = false } = {}) {
  pendingLaneTemplateRows = [];
  pendingLaneTemplateIssues = [];
  if (laneTemplateFileInput) laneTemplateFileInput.value = "";
  if (laneTemplatePreview) laneTemplatePreview.hidden = true;
  if (laneTemplatePreviewBody) laneTemplatePreviewBody.innerHTML = "";
  if (!preserveStatus) setStatus(laneImportStatus, "Upload the RFx lane book template to preview lanes.");
  updateLaneImportButton();
}

function resetManualLaneRows({ preserveStatus = false } = {}) {
  manualLaneRows = [newManualLaneRow()];
  renderManualLaneRows();
  if (!preserveStatus) setStatus(manualLaneStatus, "Add origin and destination for each manual lane.");
}

function emptyBidRoomChatThreads() {
  return {
    rows: [],
    google_chat_configured: false,
    google_chat_inbound: null,
    google_chat_space_name: "",
    google_chat_space_display_name: ""
  };
}

function getSettledValue(result, fallback) {
  return result && result.status === "fulfilled" ? result.value : fallback;
}

function getSettledWarning(result, label) {
  if (!result || result.status !== "rejected") return "";
  const message = humanizeError(result.reason?.message || result.reason || "");
  return `${label} could not load${message ? ` (${message})` : ""}.`;
}

async function parseLaneTemplateFile(file) {
  if (!file) return [];
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (extension === "csv" || file.type === "text/csv") {
    return normalizeTemplateRows(rowsFromTemplateMatrix(parseDelimitedRows(await file.text())));
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => /rfx|lane|book/i.test(name)) || workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheets were found in this template.");
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false
  });
  return normalizeTemplateRows(rowsFromTemplateMatrix(matrix));
}

function downloadRfxLaneTemplate() {
  const headers = RFX_LANE_TEMPLATE_COLUMNS.map((column) => column.key);
  const example = Object.fromEntries(RFX_LANE_TEMPLATE_COLUMNS.map((column) => [column.key, column.example || ""]));
  const blank = Object.fromEntries(RFX_LANE_TEMPLATE_COLUMNS.map((column) => [column.key, ""]));
  const workbook = XLSX.utils.book_new();
  const templateSheet = XLSX.utils.json_to_sheet([example, blank], { header: headers });
  templateSheet["!cols"] = RFX_LANE_TEMPLATE_COLUMNS.map((column) => ({ wch: Math.max(column.key.length + 2, 14) }));
  templateSheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
  XLSX.utils.book_append_sheet(workbook, templateSheet, "RFx Lane Template");
  const referenceRows = [
    ["Column", "Required", "How to use"],
    ...RFX_LANE_TEMPLATE_COLUMNS.map((column) => [
      column.key,
      column.required ? "Yes" : "No",
      column.required ? "Required for import." : "Optional but improves matching, shortlist and bidding."
    ])
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(referenceRows), "Field Reference");
  const suffix = rfxLaneEntryMode() === "append" ? "add-lanes" : "lane";
  XLSX.writeFile(workbook, `rateware-rfx-${suffix}-template-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function mapCarrierHeader(header) {
  const aliases = {
    participate: "participate",
    participates: "participate",
    participant: "participate",
    include: "participate",
    included: "participate",
    invite: "participate",
    invited: "participate",
    selected: "participate",
    select: "participate",
    true_false: "participate",
    y_n: "participate",
    yes_no: "participate",
    vendor_id: "vendor_id",
    crm_vendor_id: "vendor_id",
    id: "vendor_id",
    carrier: "vendor_name",
    carrier_name: "vendor_name",
    vendor: "vendor_name",
    vendor_name: "vendor_name",
    name: "vendor_name",
    company: "vendor_name",
    company_name: "vendor_name",
    domain: "vendor_domain",
    vendor_domain: "vendor_domain",
    carrier_domain: "vendor_domain",
    website: "vendor_domain",
    email: "vendor_email",
    vendor_email: "vendor_email",
    carrier_email: "vendor_email",
    primary_email: "vendor_email",
    contact_email: "vendor_email",
    stage: "base_stage",
    crm_stage: "base_stage",
    base: "base_stage",
    channel: "preferred_channel",
    coverage: "coverage_notes",
    coverage_note: "coverage_notes",
    tag: "tags"
  };
  const key = cleanHeader(header);
  return aliases[key] || key;
}

function parseBooleanFlag(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return ["true", "yes", "y", "1", "x", "si", "sí", "selected", "include", "included", "invite"].includes(text);
}

function normalizeDomain(value) {
  const text = String(value || "").trim().toLowerCase();
  const fromEmail = text.includes("@") ? text.split("@").pop() : text;
  return fromEmail
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^\.+|\.+$/g, "");
}

function normalizeLookupText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|llc|ltd|sa|de|cv|sapi|corp|corporation|company|co)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function rowsFromCarrierTemplateMatrix(matrix = []) {
  const headerIndex = matrix.findIndex((row) => {
    const headers = row.map(mapCarrierHeader);
    return headers.includes("participate")
      && headers.some((header) => ["vendor_id", "vendor_domain", "vendor_email", "vendor_name"].includes(header));
  });
  if (headerIndex < 0) {
    throw new Error("Carrier catalog template headers not found. Use participate plus vendor_id, vendor_domain, vendor_email or vendor_name.");
  }
  const headers = matrix[headerIndex].map(mapCarrierHeader);
  return matrix.slice(headerIndex + 1)
    .map((row) => {
      const item = {};
      headers.forEach((header, cellIndex) => {
        if (!header) return;
        item[header] = row[cellIndex] ?? "";
      });
      return item;
    })
    .filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));
}

function normalizeCarrierTemplateRows(rows = []) {
  return rows.map((row) => {
    const normalized = {};
    RFX_CARRIER_TEMPLATE_COLUMNS.forEach((column) => {
      const value = row[column.key] ?? row[mapCarrierHeader(column.label)] ?? "";
      normalized[column.key] = typeof value === "string" ? value.trim() : value;
    });
    normalized.participate = parseBooleanFlag(normalized.participate);
    normalized.vendor_id = String(normalized.vendor_id || "").trim();
    normalized.vendor_domain = normalizeDomain(normalized.vendor_domain || normalized.vendor_email);
    normalized.vendor_email = String(normalized.vendor_email || "").trim().toLowerCase();
    normalized.vendor_name = String(normalized.vendor_name || "").trim();
    normalized.base_stage = String(normalized.base_stage || "").trim();
    normalized.status = String(normalized.status || "").trim();
    normalized.preferred_channel = String(normalized.preferred_channel || "").trim();
    normalized.coverage_notes = String(normalized.coverage_notes || "").trim();
    normalized.tags = String(Array.isArray(normalized.tags) ? normalized.tags.join("; ") : normalized.tags || "").trim();
    normalized.notes = String(normalized.notes || "").trim();
    return normalized;
  });
}

async function parseCarrierTemplateFile(file) {
  if (!file) return [];
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (extension === "csv" || extension === "tsv" || file.type === "text/csv") {
    return normalizeCarrierTemplateRows(rowsFromCarrierTemplateMatrix(parseDelimitedRows(await file.text())));
  }
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => /carrier|vendor|participant|shortlist|target/i.test(name)) || workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheets were found in this CRM participant catalog.");
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false
  });
  return normalizeCarrierTemplateRows(rowsFromCarrierTemplateMatrix(matrix));
}

function downloadRfxCarrierTemplate() {
  if (!vendorOptions.length) {
    setStatus(carrierTemplateStatus, "Carrier CRM is still loading. Wait a moment and download the catalog again.", "error");
    return;
  }
  const headers = RFX_CARRIER_TEMPLATE_COLUMNS.map((column) => column.key);
  const segmentId = selectedSegmentId();
  const selectedIds = selectedManualVendorIds();
  const presetList = segmentId !== "all";
  const sourceRows = shortlistCandidateRows();
  if (!sourceRows.length) {
    setStatus(carrierTemplateStatus, "No carriers match the current CRM list or search.", "error");
    return;
  }
  const rows = sourceRows.map((vendor) => ({
    participate: selectedIds.includes(vendor.id) || (presetList && !selectedIds.length) ? "TRUE" : "FALSE",
    vendor_id: vendor.id || "",
    vendor_name: vendor.vendor_name || "",
    vendor_domain: vendor.domain || normalizeDomain(vendor.primary_email || ""),
    vendor_email: vendor.primary_email || "",
    base_stage: vendor.base_stage || "",
    status: vendor.status || "",
    preferred_channel: vendor.preferred_channel || "",
    coverage_notes: vendor.coverage_notes || "",
    tags: Array.isArray(vendor.tags) ? vendor.tags.join("; ") : vendor.tags || "",
    notes: vendor.notes || ""
  }));
  const workbook = XLSX.utils.book_new();
  const templateSheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  templateSheet["!cols"] = RFX_CARRIER_TEMPLATE_COLUMNS.map((column) => ({ wch: Math.max(column.key.length + 2, 18) }));
  templateSheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}1` };
  XLSX.utils.book_append_sheet(workbook, templateSheet, "Carrier CRM Catalog");
  const referenceRows = [
    ["Column", "How to use"],
    ["participate", "Set TRUE for carriers that should receive this bid invitation. FALSE rows stay as catalog reference."],
    ["vendor_id", "Best match key exported from Carrier CRM. Do not edit if possible."],
    ["vendor_domain", "Fallback match key if vendor_id is missing."],
    ["vendor_email", "Fallback match key if vendor_id/domain are missing."],
    ["vendor_name", "Fallback exact-name match when id/domain/email are not available."],
    ["base_stage/status/channel/coverage/tags", "Read-only CRM context to help decide who participates."],
    ["notes", "Optional operator notes; not required for import."]
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(referenceRows), "Field Reference");
  const segment = savedVendorSegments.find((item) => item.id === segmentId);
  const listName = segment?.segment_name || (segmentId === "procurement" ? "procurement" : "all-crm");
  XLSX.writeFile(workbook, `rateware-bid-carrier-catalog-${slugify(listName)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  setStatus(carrierTemplateStatus, `${formatNumber(rows.length)} carrier(s) exported from ${listName}.`, "success");
}

function portalUrl(token, laneCount = 1) {
  return `${window.location.origin}/rfx-bid.html?token=${encodeURIComponent(token)}${Number(laneCount) > 1 ? "&view=book" : ""}`;
}

function vendorLabel(invitation) {
  const vendor = invitation.vendors || {};
  return vendor.vendor_name || vendor.domain || vendor.primary_email || "Vendor";
}

function commercialStatus(status) {
  const value = String(status || "drafted").toLowerCase();
  if (value === "shortlisted") return "drafted";
  if (value === "bid_submitted") return "quoted";
  if (value === "replied") return "responded";
  return value || "drafted";
}

function statusLabel(status) {
  const labels = {
    drafted: "Drafted",
    invited: "Invited",
    viewed: "Viewed",
    responded: "Responded",
    quoted: "Quoted",
    declined: "Declined",
    awarded: "Awarded",
    archived: "Archived",
    open: "Open",
    closed: "Closed"
  };
  const value = commercialStatus(status);
  return labels[value] || value;
}

function statusTone(status) {
  const value = commercialStatus(status);
  if (["quoted", "awarded", "sent", "open"].includes(value)) return "success";
  if (["invited", "viewed", "responded", "queued"].includes(value)) return "neutral";
  if (["declined", "archived", "closed"].includes(value)) return "danger";
  return "muted";
}

function statusChip(status) {
  const value = commercialStatus(status);
  return `<span class="status-pill" data-tone="${statusTone(value)}">${escapeHtml(statusLabel(value))}</span>`;
}

function commercialModelLabel(value) {
  const labels = {
    direct_cost_plus: "Direct / cost-plus",
    carrier_share: "Carrier share",
    xbf_buy_sell: "XBF buy-sell"
  };
  return labels[String(value || "").toLowerCase()] || "Not declared";
}

function bidCommercialEconomics(invitation = {}) {
  const carrierRate = decisionNumber(invitation.bid_rate);
  const model = String(invitation.commercial_model || "direct_cost_plus").toLowerCase();
  const marginPct = decisionNumber(invitation.marksman_margin_pct) ?? (model === "xbf_buy_sell" ? XBF_BUY_SELL_DEFAULT_MARKUP_PCT : DEFAULT_COMMERCIAL_SHARE_PCT);
  const sharePct = decisionNumber(invitation.carrier_share_pct) ?? DEFAULT_COMMERCIAL_SHARE_PCT;
  const currency = invitation.currency || "USD";
  if (carrierRate === null) {
    return {
      model,
      currency,
      carrier_rate: null,
      board_rate: null,
      commission_fee: null,
      markup_fee: null,
      commission_pct: model === "carrier_share" ? sharePct : marginPct,
      markup_pct: model === "xbf_buy_sell" ? marginPct : null
    };
  }
  if (model === "carrier_share") {
    return {
      model,
      currency,
      carrier_rate: carrierRate,
      board_rate: carrierRate,
      commission_fee: sharePct === null ? null : carrierRate * sharePct / 100,
      markup_fee: null,
      commission_pct: sharePct,
      markup_pct: null
    };
  }
  if (model === "xbf_buy_sell") {
    const boardRate = carrierRate * (1 + marginPct / 100);
    return {
      model,
      currency,
      carrier_rate: carrierRate,
      board_rate: boardRate,
      commission_fee: null,
      markup_fee: boardRate - carrierRate,
      commission_pct: null,
      markup_pct: marginPct
    };
  }
  const boardRate = marginPct === null ? carrierRate : carrierRate * (1 + marginPct / 100);
  return {
    model: "direct_cost_plus",
    currency,
    carrier_rate: carrierRate,
    board_rate: boardRate,
    commission_fee: boardRate - carrierRate,
    markup_fee: null,
    commission_pct: marginPct,
    markup_pct: null
  };
}

function formatCompactDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function offerCommercialSummary(invitation = {}) {
  const economics = bidCommercialEconomics(invitation);
  const parts = [commercialModelLabel(invitation.commercial_model)];
  if (invitation.marksman_margin_pct !== null && invitation.marksman_margin_pct !== undefined) {
    parts.push(String(invitation.commercial_model).toLowerCase() === "xbf_buy_sell" ? `${invitation.marksman_margin_pct}% XBF margin` : `${invitation.marksman_margin_pct}% MARKSMAN`);
  }
  if (invitation.carrier_share_pct !== null && invitation.carrier_share_pct !== undefined) parts.push(`${invitation.carrier_share_pct}% share`);
  if (economics.board_rate !== null && economics.carrier_rate !== null && economics.board_rate !== economics.carrier_rate) parts.push(`Board ${formatMoney(economics.board_rate, economics.currency)}`);
  if (economics.commission_fee !== null) parts.push(`Fee ${formatMoney(economics.commission_fee, economics.currency)}`);
  if (economics.markup_fee !== null) parts.push(`Markup ${formatMoney(economics.markup_fee, economics.currency)}`);
  if (invitation.best_alternative_offered) parts.push(invitation.alternative_equipment ? `Alt: ${invitation.alternative_equipment}` : "Best alternative");
  return parts.filter(Boolean).join(" | ");
}

function offerAvailabilitySummary(invitation = {}) {
  if (invitation.equipment_available === true) {
    return ["Available", invitation.eta_pickup ? `PU ${formatCompactDateTime(invitation.eta_pickup)}` : null, invitation.eta_delivery ? `DEL ${formatCompactDateTime(invitation.eta_delivery)}` : null].filter(Boolean).join(" | ");
  }
  if (invitation.equipment_available === false) return "Not available";
  return "Pending";
}

function validThroughLabel(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "-";
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function localDateTimeInputValue(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function manualBidSourceLabel(value) {
  const labels = {
    manual_operator: "Manual",
    bid_room_chat: "Chat",
    carrier_portal: "Portal",
    rfx_bid_portal: "Portal",
    rateware_admin: "Admin"
  };
  return labels[String(value || "").toLowerCase()] || (value ? "Other" : "-");
}

function manualBidTarget(invitationId, laneId) {
  const lane = currentLanes.find((item) => String(item.id) === String(laneId));
  const invitation = lane && activeInvitations(lane).find((item) => String(item.id) === String(invitationId));
  return lane && invitation ? { lane, invitation } : null;
}

function updateManualBidCommercialLabel() {
  if (!rfxManualBidCommercialLabel || !rfxManualBidCommercialModel) return;
  rfxManualBidCommercialLabel.textContent = rfxManualBidCommercialModel.value === "xbf_buy_sell"
    ? "XBF margin %"
    : rfxManualBidCommercialModel.value === "carrier_share"
      ? "Carrier share %"
      : "MARKSMAN margin %";
}

function closeManualBidDrawer() {
  pendingManualBid = null;
  if (rfxManualBidDrawer) rfxManualBidDrawer.hidden = true;
  if (rfxManualBidStatus) rfxManualBidStatus.textContent = "";
}

function openManualBidDrawer(invitationId, laneId) {
  if (!rfxManualBidDrawer || !rfxManualBidForm) return;
  const target = manualBidTarget(invitationId, laneId);
  if (!target) return;
  const { lane, invitation } = target;
  pendingManualBid = target;
  const vendor = invitation.vendors || {};
  const laneLabel = `#${lane.lane_number || ""} ${laneRoute(lane)}`.trim();
  if (rfxManualBidTitle) rfxManualBidTitle.textContent = `${vendorLabel(invitation)} | ${laneLabel}`;
  if (rfxManualBidContext) rfxManualBidContext.textContent = `${vendorLabel(invitation)} | ${laneLabel}. Captured by the procurement operator from an outside-system quote.`;
  if (rfxManualBidRate) rfxManualBidRate.value = invitation.bid_rate ?? "";
  if (rfxManualBidCurrency) rfxManualBidCurrency.value = invitation.currency || lane.currency || "USD";
  if (rfxManualBidCommercialModel) rfxManualBidCommercialModel.value = invitation.commercial_model || "direct_cost_plus";
  if (rfxManualBidCommercialPct) rfxManualBidCommercialPct.value = invitation.commercial_model === "carrier_share"
    ? invitation.carrier_share_pct ?? ""
    : invitation.marksman_margin_pct ?? "";
  if (rfxManualBidCapacity) rfxManualBidCapacity.value = invitation.weekly_capacity ?? "";
  if (rfxManualBidTransit) rfxManualBidTransit.value = invitation.transit_days ?? "";
  if (rfxManualBidAvailability) rfxManualBidAvailability.value = invitation.equipment_available === true ? "true" : invitation.equipment_available === false ? "false" : "";
  if (rfxManualBidValidThrough) rfxManualBidValidThrough.value = invitation.valid_through || "";
  if (rfxManualBidPickupEta) rfxManualBidPickupEta.value = localDateTimeInputValue(invitation.eta_pickup);
  if (rfxManualBidDeliveryEta) rfxManualBidDeliveryEta.value = localDateTimeInputValue(invitation.eta_delivery);
  if (rfxManualBidUnitLocation) rfxManualBidUnitLocation.value = invitation.current_unit_location || "";
  if (rfxManualBidDeadhead) rfxManualBidDeadhead.value = invitation.deadhead_distance ?? "";
  if (rfxManualBidDeadheadUnit) rfxManualBidDeadheadUnit.value = invitation.deadhead_unit || "mi";
  if (rfxManualBidSource) rfxManualBidSource.value = invitation.response_source === "manual_operator" ? "other" : invitation.response_source === "bid_room_chat" ? "whatsapp" : "email";
  if (rfxManualBidNotes) rfxManualBidNotes.value = invitation.notes || "";
  updateManualBidCommercialLabel();
  rfxManualBidDrawer.hidden = false;
  setStatus(rfxManualBidStatus, "Enter only the values confirmed by the carrier. Blank optional fields stay blank.", "neutral");
  rfxManualBidRate?.focus();
}

function decisionNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampScore(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function scoreFromRange(value, bestValue, worstValue, maxScore, lowerIsBetter = true) {
  if (value === null || bestValue === null || worstValue === null) return 0;
  if (bestValue === worstValue) return maxScore;
  const progress = lowerIsBetter
    ? (worstValue - value) / (worstValue - bestValue)
    : (value - worstValue) / (bestValue - worstValue);
  return clampScore(progress * maxScore, 0, maxScore);
}

function laneDecisionContext(rows = []) {
  const amounts = rows.map((row) => decisionNumber(row.amount)).filter((value) => value !== null);
  const capacities = rows.map((row) => decisionNumber(row.invitation.weekly_capacity)).filter((value) => value !== null);
  const transits = rows.map((row) => decisionNumber(row.invitation.transit_days)).filter((value) => value !== null);
  const pickupEtas = rows
    .map((row) => {
      const date = new Date(row.invitation.eta_pickup || "");
      return Number.isNaN(date.getTime()) ? null : date.getTime();
    })
    .filter((value) => value !== null);
  return {
    lowestAmount: amounts.length ? Math.min(...amounts) : null,
    highestAmount: amounts.length ? Math.max(...amounts) : null,
    bestCapacity: capacities.length ? Math.max(...capacities) : null,
    weakestCapacity: capacities.length ? Math.min(...capacities) : null,
    fastestTransit: transits.length ? Math.min(...transits) : null,
    slowestTransit: transits.length ? Math.max(...transits) : null,
    earliestPickupEta: pickupEtas.length ? Math.min(...pickupEtas) : null,
    latestPickupEta: pickupEtas.length ? Math.max(...pickupEtas) : null
  };
}

function commercialDecisionScore(invitation = {}) {
  const model = String(invitation.commercial_model || "").toLowerCase();
  const marksmanMargin = decisionNumber(invitation.marksman_margin_pct) ?? DEFAULT_COMMERCIAL_SHARE_PCT;
  const carrierShare = decisionNumber(invitation.carrier_share_pct) ?? DEFAULT_COMMERCIAL_SHARE_PCT;
  let score = 0;
  if (model === "direct_cost_plus") score += 6;
  if (model === "carrier_share") score += 5;
  if (model === "xbf_buy_sell") score += 4;
  if (marksmanMargin !== null && marksmanMargin >= 2 && marksmanMargin <= 5) score += 3;
  if (model === "xbf_buy_sell" && marksmanMargin >= XBF_BUY_SELL_MIN_MARKUP_PCT && marksmanMargin <= XBF_BUY_SELL_MAX_MARKUP_PCT) score += 3;
  if (carrierShare !== null && carrierShare >= 2 && carrierShare <= 5) score += 3;
  if (model !== "xbf_buy_sell" && marksmanMargin !== null && marksmanMargin > 5) score -= 2;
  if (model === "xbf_buy_sell" && (marksmanMargin < XBF_BUY_SELL_MIN_MARKUP_PCT || marksmanMargin > XBF_BUY_SELL_MAX_MARKUP_PCT)) score -= 2;
  if (carrierShare !== null && carrierShare > 5) score -= 2;
  return clampScore(score, 0, 10);
}

function procurementDecisionForBid(row, laneRows = []) {
  const invitation = row.invitation || {};
  const context = laneDecisionContext(laneRows);
  const amount = decisionNumber(row.amount);
  const capacity = decisionNumber(invitation.weekly_capacity);
  const transit = decisionNumber(invitation.transit_days);
  const pickupDate = new Date(invitation.eta_pickup || "");
  const pickupEta = Number.isNaN(pickupDate.getTime()) ? null : pickupDate.getTime();
  const priceScore = scoreFromRange(amount, context.lowestAmount, context.highestAmount, 35, true);
  const capacityScore = scoreFromRange(capacity, context.bestCapacity, context.weakestCapacity, 15, false);
  const transitScore = scoreFromRange(transit, context.fastestTransit, context.slowestTransit, 10, true);
  const etaScore = pickupEta !== null
    ? scoreFromRange(pickupEta, context.earliestPickupEta, context.latestPickupEta, 5, true)
    : 0;
  const availabilityScore = invitation.equipment_available === true
    ? 12
    : invitation.equipment_available === false
      ? -6
      : 0;
  const validationScore = [
    invitation.mirror_account_enabled ? 4 : 0,
    invitation.unit_details ? 3 : 0,
    invitation.availability_validation_status === "validated" ? 3 : 0
  ].reduce((sum, value) => sum + value, 0);
  const commercialScore = commercialDecisionScore(invitation);
  const alternativeScore = invitation.best_alternative_offered ? 5 : 0;
  const riskFlags = [];
  if (capacity === null) riskFlags.push("No capacity");
  if (invitation.equipment_available !== true) riskFlags.push("Availability not validated");
  if (invitation.equipment_available === true && pickupEta === null) riskFlags.push("Missing pickup ETA");
  if (invitation.equipment_available === true && !invitation.unit_details) riskFlags.push("Missing unit details");
  if (Number.isFinite(Number(invitation.bid_delta)) && Number(invitation.bid_delta) > 0) riskFlags.push("Above Rateware");
  if (!invitation.commercial_model) riskFlags.push("No commercial model");
  const score = clampScore(priceScore + capacityScore + transitScore + etaScore + availabilityScore + validationScore + commercialScore + alternativeScore - Math.min(12, riskFlags.length * 3));
  return {
    score,
    price_score: priceScore,
    capacity_score: capacityScore,
    speed_score: transitScore + etaScore,
    availability_score: availabilityScore,
    validation_score: validationScore,
    commercial_score: commercialScore,
    alternative_score: alternativeScore,
    risk_flags: riskFlags,
    badges: []
  };
}

function decisionBadgesForBid(row, laneRows = []) {
  const context = laneDecisionContext(laneRows);
  const decisionRows = laneRows.map((candidate) => ({ row: candidate, decision: procurementDecisionForBid(candidate, laneRows) }));
  const bestScore = decisionRows.length ? Math.max(...decisionRows.map((item) => item.decision.score)) : null;
  const badges = [];
  if (bestScore !== null && procurementDecisionForBid(row, laneRows).score === bestScore) badges.push({ label: "Best overall", tone: "success" });
  if (decisionNumber(row.amount) === context.lowestAmount) badges.push({ label: "Lowest", tone: "success" });
  if (row.invitation.equipment_available === true) badges.push({ label: "Available", tone: "success" });
  if (decisionNumber(row.invitation.weekly_capacity) === context.bestCapacity && context.bestCapacity !== null) badges.push({ label: "Best capacity", tone: "neutral" });
  if (decisionNumber(row.invitation.transit_days) === context.fastestTransit && context.fastestTransit !== null) badges.push({ label: "Fastest transit", tone: "neutral" });
  if (row.invitation.best_alternative_offered) badges.push({ label: "Alternative offered", tone: "warning" });
  const decision = procurementDecisionForBid(row, laneRows);
  if (decision.risk_flags.length) badges.push({ label: "Needs validation", tone: "danger" });
  return badges.slice(0, 6);
}

function decisionBadgeHtml(badge) {
  const descriptions = {
    "Best overall": "Highest combined procurement score for this lane.",
    Lowest: "Lowest submitted all-in amount among the bids shown.",
    Available: "Carrier declared the requested equipment available.",
    "Best capacity": "Highest declared weekly capacity for this lane.",
    "Fastest transit": "Shortest declared transit time for this lane.",
    "Alternative offered": "Carrier proposed an alternative operating option.",
    "Needs validation": "One or more operational or commercial fields need review."
  };
  const title = badge.title || descriptions[badge.label] || badge.label;
  return `<span class="rfx-decision-badge" title="${escapeHtml(title)}" data-tone="${escapeHtml(badge.tone || "neutral")}">${escapeHtml(badge.label)}</span>`;
}

function decisionRecommendation(row, rank, laneRows = []) {
  const decision = procurementDecisionForBid(row, laneRows);
  const badges = decisionBadgesForBid(row, laneRows).map((badge) => badge.label);
  const parts = [];
  if (rank === 1) parts.push(`Best overall score ${decision.score}/100`);
  if (badges.includes("Lowest")) parts.push("lowest all-in");
  if (badges.includes("Available")) parts.push("equipment available");
  if (badges.includes("Best capacity")) parts.push("strongest capacity");
  if (badges.includes("Fastest transit")) parts.push("fastest transit");
  if (row.invitation.commercial_model) parts.push(commercialModelLabel(row.invitation.commercial_model));
  if (row.invitation.best_alternative_offered) parts.push("alternative option available");
  if (decision.risk_flags.length) parts.push(`validate: ${decision.risk_flags.slice(0, 2).join(", ")}`);
  return parts.join("; ") || "Procurement decision";
}

function hasBid(invitation) {
  return (invitation.bid_rate !== null
    && invitation.bid_rate !== undefined
    && invitation.bid_rate !== "")
    || ["quoted", "bid_submitted"].includes(String(invitation.invitation_status || "").toLowerCase());
}

function hasInvitationStarted(invitation) {
  return ["invited", "viewed", "responded", "quoted", "bid_submitted", "declined", "awarded"].includes(String(invitation.invitation_status || "").toLowerCase());
}

function selectedOutreachTemplate() {
  const visibleTemplates = visibleOutreachTemplates();
  return visibleTemplates.find((template) => template.id === rfxOutreachTemplate?.value)
    || outreachTemplates.find((template) => template.id === rfxOutreachTemplate?.value)
    || visibleTemplates[0]
    || null;
}

function selectedOutreachTemplateDraft() {
  const template = selectedOutreachTemplate();
  if (!template) return null;
  if (rfxTemplateEditorTemplateId === template.id && rfxTemplateHtml) {
    return {
      ...template,
      subject: rfxTemplateSubject?.value || "",
      html_body: rfxTemplateHtml.value || "",
      whatsapp_body: rfxTemplateWhatsapp?.value || ""
    };
  }
  return template;
}

function templateSavePayload(template) {
  return {
    name: canonicalRfxInvitationTemplateName(template) || template?.name || "RFx invitation template",
    channel: template?.channel || rfxOutreachChannel?.value || "email",
    template_scope: "canonical",
    canonical_language: canonicalRfxInvitationTemplateLanguage(template),
    subject: rfxTemplateSubject?.value || "",
    html_body: rfxTemplateHtml?.value || "",
    whatsapp_body: rfxTemplateWhatsapp?.value || "",
    meta_template_name: template?.meta_template_name || "",
    meta_template_language: template?.meta_template_language || "",
    meta_template_namespace: template?.meta_template_namespace || "",
    meta_template_status: template?.meta_template_status || "",
    meta_template_category: template?.meta_template_category || "",
    meta_template_components: Array.isArray(template?.meta_template_components) ? template.meta_template_components : [],
    placeholders: templatePlaceholders({
      ...template,
      subject: rfxTemplateSubject?.value || "",
      html_body: rfxTemplateHtml?.value || "",
      whatsapp_body: rfxTemplateWhatsapp?.value || ""
    })
  };
}

function canonicalRfxInvitationTemplateName(template) {
  const name = String(template?.name || "").trim();
  const match = name.match(/^RFx carrier invitation - (English|Spanish)(?:\s+-\s+custom.*)?$/i);
  if (!match) return name;
  const language = match[1].toLowerCase() === "spanish" ? "Spanish" : "English";
  return `RFx carrier invitation - ${language}`;
}

function canonicalRfxInvitationTemplateLanguage(template) {
  const requested = String(template?.canonical_language || template?.language || "").trim().toLowerCase();
  if (requested === "en" || requested === "es") return requested;
  return /spanish/i.test(canonicalRfxInvitationTemplateName(template)) ? "es" : "en";
}

function originalRfxInvitationTemplate(template) {
  const canonicalName = canonicalRfxInvitationTemplateName(template).toLowerCase();
  if (!canonicalName) return null;
  return outreachTemplates.find((row) => !row.owner_email
    && canonicalRfxInvitationTemplateName(row).toLowerCase() === canonicalName) || null;
}

function visibleOutreachTemplates() {
  const templates = [];
  const seenCanonicalNames = new Set();
  for (const template of outreachTemplates) {
    const canonicalName = canonicalRfxInvitationTemplateName(template);
    const key = canonicalName.toLowerCase();
    const isCanonicalRfxTemplate = /^rfx carrier invitation - (english|spanish)$/i.test(canonicalName);
    if (isCanonicalRfxTemplate && seenCanonicalNames.has(key)) continue;
    if (isCanonicalRfxTemplate) seenCanonicalNames.add(key);
    templates.push({ ...template, name: canonicalName });
  }
  return templates;
}

function renderRfxTemplateEditor({ force = false } = {}) {
  if (!rfxTemplateEditor || !rfxTemplateHtml) return;
  const template = selectedOutreachTemplate();
  const hasTemplate = Boolean(template);
  rfxTemplateEditor.toggleAttribute("data-empty", !hasTemplate);
  [rfxTemplateSubject, rfxTemplateHtml, rfxTemplateWhatsapp, saveRfxTemplateHtmlButton, resetRfxTemplateHtmlButton, restoreRfxTemplateOriginalButton].forEach((field) => {
    if (field) field.disabled = !hasTemplate;
  });
  if (!template) {
    rfxTemplateEditorTemplateId = null;
    rfxTemplateEditorDirty = false;
    if (rfxTemplateSubject) rfxTemplateSubject.value = "";
    rfxTemplateHtml.value = "";
    if (rfxTemplateWhatsapp) rfxTemplateWhatsapp.value = "";
    setStatus(rfxTemplateEditorStatus, "Select a template to edit the HTML.", "neutral");
    return;
  }
  if (force || rfxTemplateEditorTemplateId !== template.id || !rfxTemplateEditorDirty) {
    rfxTemplateEditorTemplateId = template.id;
    rfxTemplateEditorDirty = false;
    if (rfxTemplateSubject) rfxTemplateSubject.value = template.subject || "";
    rfxTemplateHtml.value = template.html_body || "";
    if (rfxTemplateWhatsapp) rfxTemplateWhatsapp.value = template.whatsapp_body || "";
    const scope = template.owner_email ? "Editable workspace template." : "Default template: saving keeps one workspace copy for this language.";
    setStatus(rfxTemplateEditorStatus, scope, "neutral");
  }
}

function sanitizeEditableTemplate(root) {
  root.querySelectorAll("script, object, embed, iframe").forEach((item) => item.remove());
  root.querySelectorAll("*").forEach((item) => {
    [...item.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = String(attribute.value || "").trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) item.removeAttribute(attribute.name);
      if (name === "contenteditable") item.removeAttribute(attribute.name);
    });
  });
}

function tokenChip(token) {
  const span = document.createElement("span");
  span.className = token === "lane_table" ? "template-token-chip is-block-token" : "template-token-chip";
  span.dataset.templateToken = token;
  span.contentEditable = "false";
  const labels = {
    lane_table: "Dynamic lane table {{lane_table}}",
    bid_link: "Private Bid Room link {{bid_link}}",
    profile_link: "Carrier profile link {{profile_link}}"
  };
  span.textContent = labels[token] || `{{${token}}}`;
  return span;
}

function tokenizedHtmlForVisualEditor(html) {
  const template = document.createElement("template");
  template.innerHTML = html || "";
  sanitizeEditableTemplate(template.content);
  const textNodes = [];
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => {
    const source = node.nodeValue || "";
    if (!/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/.test(source)) return;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, token, index) => {
      if (index > lastIndex) fragment.appendChild(document.createTextNode(source.slice(lastIndex, index)));
      fragment.appendChild(tokenChip(token));
      lastIndex = index + match.length;
      return match;
    });
    if (lastIndex < source.length) fragment.appendChild(document.createTextNode(source.slice(lastIndex)));
    node.replaceWith(fragment);
  });
  const container = document.createElement("div");
  container.appendChild(template.content.cloneNode(true));
  return container.innerHTML;
}

function htmlFromVisualEditor(element) {
  const template = document.createElement("template");
  template.innerHTML = element?.innerHTML || "";
  template.content.querySelectorAll("[data-template-token]").forEach((item) => {
    const token = item.dataset.templateToken || "";
    item.replaceWith(document.createTextNode(token ? `{{${token}}}` : ""));
  });
  sanitizeEditableTemplate(template.content);
  const container = document.createElement("div");
  container.appendChild(template.content.cloneNode(true));
  return container.innerHTML.trim();
}

function templatePlaceholders(template) {
  if (Array.isArray(template?.placeholders) && template.placeholders.length) return template.placeholders;
  const source = [template?.subject, template?.html_body, template?.whatsapp_body].filter(Boolean).join(" ");
  return [...new Set([...source.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]))];
}

function renderTemplateText(value, context = {}) {
  return String(value || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => String(context[key] ?? ""));
}

function outreachTemplateLanguage(template) {
  const source = [
    template?.name,
    template?.subject,
    template?.html_body,
    template?.whatsapp_body
  ].filter(Boolean).join(" ").toLowerCase();
  return /spanish|espanol|español|por favor|gracias|modelo logistico|modelo logístico/.test(source) ? "es" : "en";
}

function laneTableLabels(language = "en") {
  if (language === "es") {
    return {
      lane: "Ruta",
      origin: "Origen",
      destination: "Destino",
      equipment: "Equipo / Remolque / Config",
      operation: "Operacion",
      service: "Servicio",
      weeklyVolume: "Volumen<br>semanal",
      target: "Objetivo"
    };
  }
  return {
    lane: "Lane",
    origin: "Origin",
    destination: "Destination",
    equipment: "Equipment / Trailer / Config",
    operation: "Operation",
    service: "Service",
    weeklyVolume: "Weekly<br>volume",
    target: "Target"
  };
}

function sameVendorInvitation(left = {}, right = {}) {
  const leftVendor = left.vendors || {};
  const rightVendor = right.vendors || {};
  const leftKey = left.vendor_id || leftVendor.id || leftVendor.domain || leftVendor.primary_email;
  const rightKey = right.vendor_id || rightVendor.id || rightVendor.domain || rightVendor.primary_email;
  return Boolean(leftKey && rightKey && String(leftKey).toLowerCase() === String(rightKey).toLowerCase());
}

function allOutreachTargetInvitations() {
  return currentLanes
    .flatMap((lane) => activeInvitations(lane).map((invitation) => ({ lane, invitation })));
}

function outreachTargetsForCarrier(target, { selectedOnly = false } = {}) {
  if (!target?.invitation) return [];
  const sourceTargets = selectedOnly ? outreachTargetInvitations() : allOutreachTargetInvitations();
  return sourceTargets.filter((item) => sameVendorInvitation(item.invitation, target.invitation));
}

function outreachPreviewLaneRows(target) {
  const scopedLanes = selectedLaneIds.size
    ? currentLanes.filter((lane) => selectedLaneIds.has(String(lane.id)))
    : currentLanes;
  if (!scopedLanes.length) return outreachTargetsForCarrier(target);
  const carrierTargets = outreachTargetsForCarrier(target);
  const invitationsByLane = new Map(carrierTargets.map((item) => [String(item.lane?.id || item.invitation?.rfx_lane_id || ""), item.invitation]));
  const fallbackInvitation = target?.invitation || carrierTargets[0]?.invitation || {};
  return scopedLanes.map((lane) => ({
    lane,
    // A carrier may be shortlisted on only one lane while the RFx book has
    // several lanes. The invitation queue expands that carrier to the full
    // event book, so the live preview must show the same route scope.
    invitation: invitationsByLane.get(String(lane.id)) || fallbackInvitation
  }));
}

function laneRowsText(targets = [], language = "en") {
  return targets.map(({ lane }, index) => [
    `${language === "es" ? "Ruta" : "Lane"} ${index + 1}: ${lane.origin || "-"} -> ${lane.destination || "-"}`,
    `${language === "es" ? "Equipo" : "Equipment"}: ${[lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "-"}`,
    `${language === "es" ? "Operacion/Servicio" : "Operation/Service"}: ${[lane.operation, lane.service].filter(Boolean).join(" / ") || "-"}`,
    `${language === "es" ? "Volumen" : "Volume"}: ${lane.weekly_volume || "-"} ${language === "es" ? "por semana" : "per week"}`,
    `${language === "es" ? "Objetivo" : "Target"}: ${lane.target_rate ? formatMoney(lane.target_rate, lane.currency) : "-"}`
  ].join(" | ")).join("\n");
}

function laneTableHtml(targets = [], language = "en") {
  if (!targets.length) return "";
  const labels = laneTableLabels(language);
  const headerStyle = "background:rgb(31,78,121);color:rgb(255,255,255);border:1px solid rgb(183,201,217);padding:6px 8px;text-align:left;vertical-align:top;line-height:1.15;white-space:nowrap";
  const headerCenterStyle = `${headerStyle};text-align:center`;
  const cellStyle = "border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22";
  const centerCellStyle = `${cellStyle};white-space:nowrap;text-align:center`;
  const targetCellStyle = `${centerCellStyle};background:rgb(234,243,248);font-weight:700`;
  const hazmatTempLabel = (lane) => [
    lane.hazmat ? "Hazmat" : null,
    lane.temperature_controlled ? "Temp Ctrl" : null
  ].filter(Boolean).join(" / ") || "-";
  const equipmentLabel = (lane) => [
    lane.equipment,
    lane.trailer,
    lane.config,
    hazmatTempLabel(lane) === "-" ? null : hazmatTempLabel(lane)
  ].filter(Boolean).join(" / ") || "-";
  const rows = targets.map(({ lane }, index) => `
    <tr>
      <td style="${centerCellStyle}">${escapeHtml(index + 1)}</td>
      <td style="${cellStyle};white-space:nowrap">${escapeHtml(lane.origin || "-")}<br>${escapeHtml(lane.origin_notes || lane.origin_site || "")}</td>
      <td style="${cellStyle}">${escapeHtml(lane.destination || "-")}<br>${escapeHtml(lane.destination_notes || lane.destination_site || "")}</td>
      <td style="${cellStyle}">${escapeHtml(equipmentLabel(lane))}</td>
      <td style="${centerCellStyle}">${escapeHtml(lane.operation || "-")}</td>
      <td style="${centerCellStyle}">${escapeHtml(lane.service || "-")}</td>
      <td style="${centerCellStyle}">${escapeHtml(lane.weekly_volume || "-")}</td>
      <td style="${targetCellStyle}">${escapeHtml(lane.target_rate ? formatMoney(lane.target_rate, lane.currency) : "-")}</td>
    </tr>
  `).join("");
  return `
    <table style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;border-collapse:collapse;width:auto;max-width:100%;table-layout:auto;font-size:12px;margin-bottom:14px">
      <thead>
        <tr>
          <th style="${headerCenterStyle}">${labels.lane}</th>
          <th style="${headerStyle}">${labels.origin}</th>
          <th style="${headerStyle}">${labels.destination}</th>
          <th style="${headerStyle}">${labels.equipment}</th>
          <th style="${headerCenterStyle}">${labels.operation}</th>
          <th style="${headerCenterStyle}">${labels.service}</th>
          <th style="${headerCenterStyle}">${labels.weeklyVolume}</th>
          <th style="${headerCenterStyle}">${labels.target}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function laneSignatureValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value).trim();
}

function laneTableSignatureForTargets(targets = []) {
  const rows = targets.map(({ lane = {}, invitation = {} }) => ({
    invitation_id: laneSignatureValue(invitation.id),
    lane_id: laneSignatureValue(lane.id || invitation.rfx_lane_id),
    origin: laneSignatureValue(lane.origin || lane.origin_city),
    destination: laneSignatureValue(lane.destination || lane.destination_city),
    origin_site: laneSignatureValue(lane.origin_notes || lane.origin_site),
    destination_site: laneSignatureValue(lane.destination_notes || lane.destination_site),
    equipment: laneSignatureValue(lane.equipment),
    trailer: laneSignatureValue(lane.trailer),
    config: laneSignatureValue(lane.config),
    hazmat: laneSignatureValue(parseBooleanFlag(lane.hazmat)),
    temperature_controlled: laneSignatureValue(parseBooleanFlag(lane.temperature_controlled)),
    operation: laneSignatureValue(lane.operation),
    service: laneSignatureValue(lane.service),
    weekly_volume: laneSignatureValue(lane.weekly_volume),
    target_rate: laneSignatureValue(lane.target_rate),
    currency: laneSignatureValue(lane.currency)
  })).sort((left, right) => `${left.invitation_id}:${left.lane_id}`.localeCompare(`${right.invitation_id}:${right.lane_id}`));
  return JSON.stringify(rows);
}

function targetLaneTableSignature(target) {
  const targetRows = outreachPreviewLaneRows(target);
  return laneTableSignatureForTargets(targetRows);
}

function firstOutreachTarget() {
  return outreachTargetInvitations().find((target) => targetHasChannel(target, selectedOutreachChannel()))
    || outreachTargetInvitations()[0]
    || null;
}

function sampleOutreachContext(target, template = selectedOutreachTemplateDraft()) {
  const invitation = target?.invitation || {};
  const lane = target?.lane || {};
  const vendor = invitation.vendors || {};
  const carrierTargets = outreachTargetsForCarrier(target);
  const language = outreachTemplateLanguage(template);
  const targetRows = outreachPreviewLaneRows(target);
  return {
    vendor_name: vendor.vendor_name || vendor.domain || "Carrier",
    contact_name: vendor.contact_name || vendor.vendor_name || "team",
    vendor_domain: vendor.domain || "",
    vendor_email: vendor.primary_email || "",
    rfx_id: selectedEvent?.rfx_id || "",
    event_name: selectedEvent?.name || selectedEvent?.rfx_id || "",
    rfx_type: selectedEvent?.event_type || "",
    customer: selectedEvent?.customer || "",
    due_date: selectedEvent?.due_date || "",
    lane_origin: lane.origin || lane.origin_city || "",
    lane_destination: lane.destination || lane.destination_city || "",
    origin_market: lane.origin_market || "",
    destination_market: lane.destination_market || "",
    equipment: lane.equipment || "",
    trailer: lane.trailer || "",
    config: lane.config || "",
    operation: lane.operation || "",
    service: lane.service || "",
    weekly_volume: lane.weekly_volume || "",
    target_rate: lane.target_rate || "",
    currency: lane.currency || "USD",
    lane_count: targetRows.length || carrierTargets.length || (target ? 1 : 0),
    lane_table: laneTableHtml(targetRows, language),
    lane_rows_text: laneRowsText(targetRows, language),
    lane_table_signature: laneTableSignatureForTargets(targetRows),
    bid_link: invitation.invitation_token ? portalUrl(invitation.invitation_token, targetRows.length) : `${window.location.origin}/rfx-bid.html?token=preview`,
    profile_link: `${window.location.origin}/carrier-profile.html?token=profile-preview`
  };
}

function outreachTargetInvitations() {
  const selectedIds = selectedInvitationIds.size ? selectedInvitationIds : null;
  const selectedLaneSet = !selectedIds && selectedLaneIds.size ? selectedLaneIds : null;
  return allOutreachTargetInvitations()
    .filter(({ lane, invitation }) => {
      if (selectedIds) return selectedIds.has(invitation.id);
      if (selectedLaneSet) return selectedLaneSet.has(lane.id);
      return true;
    });
}

function targetHasChannel(target, channel) {
  const vendor = target.invitation?.vendors || {};
  const normalized = String(channel || "email").toLowerCase();
  const hasEmail = Boolean(vendor.primary_email);
  const hasWhatsapp = Boolean(vendor.whatsapp_phone);
  const hasGroup = Boolean(vendor.whatsapp_group_url || vendor.whatsapp_group_name || vendor.whatsapp_meta_group_id);
  if (normalized === "email" || normalized === "gmail" || normalized === "gmail_only") return hasEmail;
  if (normalized === "whatsapp") return hasWhatsapp;
  if (normalized === "whatsapp_group") return hasGroup;
  if (normalized === "multi" || normalized === "email_whatsapp" || normalized === "email+whatsapp") return hasEmail && hasWhatsapp;
  if (normalized === "whatsapp_direct_group" || normalized === "whatsapp+group") return hasWhatsapp && hasGroup;
  if (normalized === "email_whatsapp_group" || normalized === "all") return hasEmail && hasWhatsapp && hasGroup;
  return hasEmail;
}

function outreachChannelLabel(channel = "") {
  const value = String(channel || "email");
  if (value === "email") return "Gmail only";
  if (value === "whatsapp") return "WhatsApp Business direct only";
  if (value === "whatsapp_group") return "WhatsApp group manual";
  if (value === "multi" || value === "email_whatsapp") return "Email + WhatsApp direct";
  if (value === "email_whatsapp_group") return "Email + WhatsApp direct + group";
  return "Gmail only";
}

function whatsappTargetModeLabel(value = "") {
  if (value === "vendor_group") return "vendor group only";
  if (value === "direct_and_group") return "direct + vendor group";
  return "direct vendor contact";
}

function renderOutreachTemplateSelect() {
  if (!rfxOutreachTemplate) return;
  const currentValue = rfxOutreachTemplate.value;
  const templates = visibleOutreachTemplates();
  rfxOutreachTemplate.innerHTML = templates.length
    ? templates.map((template) => `
      <option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}${template.owner_email ? "" : " (default)"}</option>
    `).join("")
    : "<option value=\"\">No templates available</option>";
  if (currentValue && templates.some((template) => template.id === currentValue)) {
    rfxOutreachTemplate.value = currentValue;
  }
}

function renderOutreachPreview() {
  if (!rfxOutreachPreview) return;
  renderRfxTemplateEditor();
  const template = selectedOutreachTemplateDraft();
  const channel = selectedOutreachChannel();
  const targetMode = channel === "whatsapp_group" ? "vendor_group" : "direct_vendor";
  const senderEmail = rfxOutreachSender?.value || APPROVED_GMAIL_SENDER;
  const targets = outreachTargetInvitations();
  const ready = targets.filter((target) => targetHasChannel(target, channel)).length;
  const whatsappDirectReady = targets.filter((target) => targetHasChannel(target, "whatsapp")).length;
  const whatsappGroupReady = targets.filter((target) => targetHasChannel(target, "whatsapp_group")).length;
  const targetScope = selectedInvitationIds.size
    ? `${formatNumber(selectedInvitationIds.size)} selected vendor rows`
    : selectedLaneIds.size
      ? `${formatNumber(selectedLaneIds.size)} selected lanes`
      : "All active shortlist";
  const placeholders = templatePlaceholders(template);
  const previewTarget = firstOutreachTarget();
  const previewContext = sampleOutreachContext(previewTarget, template);
  const emailChannel = channel === "email";
  const previewChannelLabel = emailChannel
    ? "Gmail recipient view"
    : channel === "whatsapp_group"
      ? "WhatsApp group handoff"
      : "WhatsApp Business recipient view";
  if (rfxOutreachPreviewChannel) rfxOutreachPreviewChannel.textContent = previewChannelLabel;
  if (!template) {
    rfxOutreachPreview.innerHTML = `
      <strong>No template selected.</strong>
      <span>Create an invitation template before launching carrier invitations.</span>
    `;
  } else {
    const renderedSubject = renderTemplateText(template.subject || `${previewContext.rfx_id} invitation`, previewContext);
    const renderedHtml = renderTemplateText(template.html_body || template.whatsapp_body || "", previewContext);
    const renderedWhatsapp = renderTemplateText(template.whatsapp_body || renderedHtml.replace(/<[^>]*>/g, " "), previewContext);
    const visualEditorHtml = tokenizedHtmlForVisualEditor(template.html_body || template.whatsapp_body || "");
    const channelPreview = emailChannel
      ? `
        <article class="outreach-html-preview">
          <div>
            <span>Gmail recipient view</span>
            <strong>${rfxTemplateVisualEditing ? "Editing email preview" : `${escapeHtml(previewContext.vendor_name || "Carrier")} | ${formatNumber(previewContext.lane_count || 0)} lane(s)`}</strong>
            <div class="outreach-preview-actions">
              ${rfxTemplateVisualEditing
                ? `<button class="small-button" type="button" data-rfx-template-save-visual>Save changes</button>
                   <button class="secondary small-button" type="button" data-rfx-template-cancel-visual>Cancel</button>`
                : `<button class="secondary small-button" type="button" data-rfx-template-edit-visual>Edit email</button>`}
            </div>
          </div>
          ${rfxTemplateVisualEditing
            ? `<div id="rfx-email-visual-editor" class="outreach-html-editor-surface" contenteditable="true" spellcheck="true">${visualEditorHtml || "<p>Edit your template here.</p>"}</div>`
            : renderedHtml ? `<iframe sandbox="" srcdoc="${escapeHtml(renderedHtml)}"></iframe>` : `<p>No HTML body configured for this template.</p>`}
        </article>
      `
      : `
        <article class="outreach-text-preview outreach-channel-text-preview">
          <span>${escapeHtml(previewChannelLabel)}</span>
          <strong>${escapeHtml(previewContext.vendor_name || "Carrier")} | ${formatNumber(previewContext.lane_count || 0)} lane(s)</strong>
          <p>${escapeHtml(renderedWhatsapp || "No WhatsApp body configured.")}</p>
          <small>${channel === "whatsapp_group"
            ? "This queue creates a manual group handoff. Rateware does not send through a group API."
            : "For a new WhatsApp conversation, Meta sends the approved notifier with the private Bid Room link."}</small>
        </article>
      `;
    rfxOutreachPreview.innerHTML = `
      <div>
        <span class="status-pill">${escapeHtml(previewChannelLabel)}</span>
        <strong>${escapeHtml(template.name || "Template")}</strong>
        <small>${escapeHtml(emailChannel ? (renderedSubject || "No email subject") : "Channel-specific message preview")}</small>
      </div>
      <div class="outreach-template-preview-grid">
        <article>
          <span>Draft target</span>
          <strong>${formatNumber(ready)} / ${formatNumber(targets.length)}</strong>
          <small>${escapeHtml(targetScope)}</small>
        </article>
        <article>
          <span>Channel</span>
          <strong>${escapeHtml(outreachChannelLabel(channel))}</strong>
          ${channel.includes("whatsapp") || channel === "multi" ? `<small>${escapeHtml(whatsappTargetModeLabel(targetMode))}</small>` : ""}
        </article>
        <article>
          <span>Send from</span>
          <strong>${escapeHtml(emailChannel ? senderEmail : channel === "whatsapp_group" ? "Manual group handoff" : "WhatsApp Business sender")}</strong>
          <small>${emailChannel ? "Draft-only until Gmail is connected" : "Uses the selected WhatsApp delivery mode"}</small>
        </article>
      </div>
      ${channelPreview}
      <div class="template-token-row">
        ${placeholders.length ? placeholders.slice(0, 12).map((item) => `<span>{{${escapeHtml(item)}}}</span>`).join("") : "<span>No placeholders detected</span>"}
      </div>
    `;
  }
  if (createRfxOutreachCampaignButton) {
    createRfxOutreachCampaignButton.disabled = !selectedEventId || !template || !targets.length || Boolean(launchPreflightIssues().length) || rfxTemplateEditorDirty || rfxTemplateVisualEditing;
  }
  if (rfxWhatsappReadiness) {
    const groupMode = channel === "whatsapp_group" || channel === "email_whatsapp_group" || targetMode !== "direct_vendor";
    const mapping = template?.whatsapp_meta || null;
    const metaStatus = metaNotifierStatus(mapping?.meta_template_status || "NOT_PUBLISHED");
    const whatsappChannel = channel === "multi" || channel.includes("whatsapp");
    const directWhatsappChannel = outreachDraftChannels(channel).includes("whatsapp");
    const targetSummary = `${formatNumber(whatsappDirectReady)} direct phone target(s), ${formatNumber(whatsappGroupReady)} group target(s).`;
    let readinessCopy = `${targetSummary} Outreach copy is the source for the WhatsApp message.`;
    let readinessTone = "neutral";
    if (!template?.whatsapp_body) {
      readinessCopy = `${targetSummary} Add the full Outreach copy. Meta will send a compact notifier linked to the Bid Room.`;
      readinessTone = "warning";
    } else if (metaStatus === "APPROVED") {
      readinessCopy = `${targetSummary} Meta notifier ${mapping.meta_template_name} is approved. The full content remains in Outreach and the Bid Room.`;
      readinessTone = "success";
    } else if (metaNotifierPendingReview(metaStatus)) {
      readinessCopy = `${targetSummary} Compact notifier is ${metaNotifierStatusLabel(metaStatus)} at Meta. Direct WhatsApp sends unlock after approval; Rateware refreshes it when you generate or send again.`;
      readinessTone = "warning";
    } else if (["REJECTED", "PAUSED", "DISABLED"].includes(metaStatus)) {
      readinessCopy = `${targetSummary} Meta notifier status is ${metaStatus.toLowerCase()}. Review the integration before direct sending.`;
      readinessTone = "error";
    } else if (metaStatus === "LANGUAGE_MISMATCH") {
      readinessCopy = `${targetSummary} No approved Meta translation matches this Outreach language. Add or approve that language in Meta, then sync templates.`;
      readinessTone = "warning";
    } else if (metaNotifierNeedsSync(metaStatus)) {
      readinessCopy = `${targetSummary} Rateware has not verified this notifier in the current sender's Meta catalog. Sync templates or generate the queue again.`;
      readinessTone = "warning";
    } else if (groupMode && !whatsappDirectReady) {
      readinessCopy = `${targetSummary} Group delivery remains manual; publish only if direct WhatsApp sends are also required.`;
    }
    if (directWhatsappChannel && whatsappConnectionReadiness.ready !== true) {
      readinessCopy = `${targetSummary} ${whatsappConnectionReadiness.message}`;
      readinessTone = "warning";
    }
    if (rfxWhatsappTemplateReadinessCopy) rfxWhatsappTemplateReadinessCopy.textContent = readinessCopy;
    rfxWhatsappReadiness.dataset.tone = readinessTone;
    if (publishWhatsappTemplateButton) {
      publishWhatsappTemplateButton.disabled = !template?.id || !template?.whatsapp_body || rfxTemplateEditorDirty || !whatsappChannel || metaStatus === "APPROVED";
      publishWhatsappTemplateButton.textContent = metaStatus === "APPROVED"
        ? "Meta notifier ready"
        : metaNotifierPendingReview(metaStatus)
          ? "Submitted to Meta"
          : "Create Meta notifier";
      if (metaNotifierPendingReview(metaStatus)) publishWhatsappTemplateButton.disabled = true;
    }
    if (syncWhatsappTemplateButton) syncWhatsappTemplateButton.disabled = !template?.id || !whatsappChannel;
  }
  renderWizard();
}

function rfxWizardStats() {
  const invitations = currentLanes.flatMap((lane) => activeInvitations(lane));
  const targets = outreachTargetInvitations();
  const channel = selectedOutreachChannel();
  const readyTargets = targets.filter((target) => targetHasChannel(target, channel));
  const bids = currentLanes.flatMap((lane) => bidInvitations(lane));
  return {
    lanes: currentLanes.length,
    invitations,
    targets,
    readyTargets,
    bids,
    lanesWithShortlist: currentLanes.filter((lane) => activeInvitations(lane).length).length,
    lanesWithBids: currentLanes.filter((lane) => bidInvitations(lane).length).length
  };
}

function rfxWizardStepState() {
  const stats = rfxWizardStats();
  return [
    { key: "event", label: "Event", complete: Boolean(selectedEvent) },
    { key: "lanes", label: "Book", complete: stats.lanes > 0 },
    { key: "carriers", label: "Participants", complete: stats.invitations.length > 0 },
    { key: "launch", label: "Outreach", complete: stats.invitations.some(hasInvitationStarted) },
    { key: "offers", label: "Auction", complete: stats.bids.length > 0 },
    { key: "award", label: "Award", complete: selectedEvent?.status === "awarded" }
  ];
}

function currentWizardStage() {
  return rfxWizardStepState().find((step) => !step.complete)?.key || "award";
}

function bidRoomWorkflowProgress() {
  const steps = rfxWizardStepState();
  const completeCount = steps.filter((step) => step.complete).length;
  const activeStage = currentWizardStage();
  const activeIndex = Math.max(0, steps.findIndex((step) => step.key === activeStage));
  const percent = steps.length ? Math.round((completeCount / steps.length) * 100) : 0;
  const stats = processStats();
  return {
    steps,
    completeCount,
    activeStage,
    activeIndex,
    percent,
    statusLine: `${formatNumber(completeCount)} / ${formatNumber(steps.length)} workflow step(s) ready`,
    commercialLine: `${formatNumber(stats.lanes)} lane(s) | ${formatNumber(stats.invitations.length)} participant row(s) | ${formatNumber(stats.bids.length)} live bid(s)`
  };
}

function wizardStageView(stage) {
  return {
    event: "setup",
    lanes: "lanes",
    carriers: "carriers",
    preview: "outreach",
    launch: "outreach",
    offers: "responses",
    award: "award"
  }[stage] || "setup";
}

function wizardStageCopy(stage) {
  return {
    event: {
      title: "Create or select the bid room",
      detail: "Define the commercial room once: RFx ID, customer, due date, and visibility. Every lane, invite, chat, bid, and award stays attached here.",
      cta: "Create bid event",
      note: "Room"
    },
    lanes: {
      title: "Import the business book",
      detail: "Upload the lane template so Rateware can build the book, benchmarks, participant coverage, and auction context.",
      cta: "Import book",
      note: "Lanes"
    },
    carriers: {
      title: "Choose the carriers that will participate",
      detail: "Select carriers directly from Carrier CRM or upload the TRUE/FALSE participant catalog. This is the only source for the bid invitation list.",
      cta: "Select participants",
      note: "CRM"
    },
    preview: {
      title: "Review the invitation experience",
      detail: "Preview the carrier email, placeholders, sender, and channel before generating individualized drafts.",
      cta: "Review invites",
      note: "Preview"
    },
    launch: {
      title: "Generate the outreach queue",
      detail: "Create one personalized invitation per selected carrier, then send Gmail messages from the draft queue.",
      cta: "Generate draft queue",
      note: "Invites"
    },
    offers: {
      title: "Run the live auction room",
      detail: "Monitor bids, alternatives, capacity, ETA, chat signals, and leaderboard position in one operating view.",
      cta: "Open auction room",
      note: "Live"
    },
    award: {
      title: "Award and close out",
      detail: "Compare price, capacity, ETA, validation, margin, and risk before moving approved awards back to Rateware.",
      cta: "Open award board",
      note: "Closeout"
    }
  }[stage] || {
    title: "Open Bid Room",
    detail: "Continue the procurement workflow.",
    cta: "Open",
    note: "Bid Room"
  };
}

function wizardActionButton(stage) {
  const actions = {
    build: '<button type="button" data-rfx-wizard-go="setup">Open build workspace</button>',
    event: '<button type="button" data-rfx-focus-create>Create bid room</button>',
    lanes: '<button type="button" data-rfx-wizard-go="lanes">Import business book</button>',
    carriers: '<button type="button" data-rfx-wizard-go="carriers">Select participants</button>',
    preview: '<button type="button" data-rfx-wizard-go="outreach">Review invitations</button>',
    launch: '<button type="button" data-rfx-wizard-create-drafts>Generate draft queue</button>',
    offers: '<button type="button" data-rfx-wizard-go="responses">Open auction room</button>',
    operate: '<button type="button" data-rfx-wizard-go="responses">Open auction room</button>',
    award: '<button type="button" data-rfx-wizard-go="award">Open award board</button>',
    close: '<button type="button" data-rfx-wizard-go="award">Open award board</button>'
  };
  return actions[stage] || actions.event;
}

function renderOpsStageRail() {
  if (!rfxOpsStageRail) return;
  const stage = currentBidRoomStage();
  const buttons = [...rfxOpsStageRail.querySelectorAll("[data-stage-key]")];
  if (buttons.length) {
    bidRoomStageState().forEach((step, index) => {
      const button = rfxOpsStageRail.querySelector(`[data-stage-key="${step.key}"]`);
      if (!button) return;
      const copy = bidRoomStageCopy(step.key);
      const view = step.view;
      const stateLabel = step.complete ? "Ready" : step.key === stage ? "Next" : "Pending";
      button.classList.toggle("is-complete", step.complete);
      button.classList.toggle("is-next", step.key === stage);
      button.classList.toggle("is-pending", !step.complete && step.key !== stage);
      button.setAttribute("aria-current", step.key === stage ? "step" : "false");
      button.setAttribute("aria-label", `${step.label}: ${stateLabel}. ${copy.title}`);
      button.setAttribute("title", `${copy.title}. ${copy.detail}`);
      button.dataset.rfxWizardGo = view;
      button.querySelector(".stage-index").textContent = String(index + 1);
      button.querySelector(".stage-copy strong").textContent = step.label;
      button.querySelector(".stage-copy small").textContent = `${copy.note} | ${stateLabel}`;
    });
    return;
  }
  rfxOpsStageRail.innerHTML = bidRoomStageState().map((step, index) => {
    const copy = bidRoomStageCopy(step.key);
    return `
      <button
        type="button"
        class="${step.complete ? "is-complete" : ""} ${step.key === stage ? "is-next" : ""}"
        data-rfx-wizard-go="${escapeHtml(wizardStageView(step.key))}"
        aria-current="${step.key === stage ? "step" : "false"}"
      >
        <span class="stage-index">${index + 1}</span>
        <span class="stage-copy"><strong>${escapeHtml(step.label)}</strong><small>${escapeHtml(copy.note)}</small></span>
      </button>
    `;
  }).join("");
}

function bidRoomStageState() {
  const stats = rfxWizardStats();
  return [
    {
      key: "build",
      label: "Build",
      complete: Boolean(selectedEvent && stats.lanes > 0 && stats.invitations.length > 0),
      view: "setup"
    },
    {
      key: "launch",
      label: "Launch",
      complete: stats.invitations.some(hasInvitationStarted),
      view: "outreach"
    },
    {
      key: "operate",
      label: "Operate",
      complete: stats.bids.length > 0,
      view: "responses"
    },
    {
      key: "close",
      label: "Close",
      complete: selectedEvent?.status === "awarded",
      view: "award"
    }
  ];
}

function currentBidRoomStage() {
  return bidRoomStageState().find((step) => !step.complete)?.key || "close";
}

function bidRoomStageProgress() {
  const steps = bidRoomStageState();
  const completeCount = steps.filter((step) => step.complete).length;
  const activeStage = currentBidRoomStage();
  const activeIndex = Math.max(0, steps.findIndex((step) => step.key === activeStage));
  const percent = steps.length ? Math.round((completeCount / steps.length) * 100) : 0;
  const stats = processStats();
  return {
    steps,
    completeCount,
    activeStage,
    activeIndex,
    percent,
    statusLine: `${formatNumber(completeCount)} / ${formatNumber(steps.length)} operating stage(s) ready`,
    commercialLine: `${formatNumber(stats.lanes)} lane(s) | ${formatNumber(stats.invitations.length)} participant row(s) | ${formatNumber(stats.bids.length)} live bid(s)`
  };
}

function bidRoomStageCopy(stage) {
  return {
    build: {
      title: "Build the bid room",
      detail: "Set the event, load the business book, and choose participants from Carrier CRM.",
      note: "Event | Book | CRM"
    },
    launch: {
      title: "Launch carrier outreach",
      detail: "Review one invitation experience, generate the queue, and send the selected channel.",
      note: "Invites | Queue"
    },
    operate: {
      title: "Operate the live room",
      detail: "Monitor bids, capacity, ETAs, chat signals, and ranking from the event context.",
      note: "Auction | Live"
    },
    close: {
      title: "Close out the award",
      detail: "Compare bids, award lanes, and move approved costs back to Rateware.",
      note: "Award | Rateware"
    }
  }[stage] || {
    title: "Open Bid Room",
    detail: "Continue the procurement workflow.",
    note: "Bid Room"
  };
}

function renderOpsNextAction() {
  if (!rfxOpsNextAction) return;
  const stage = currentBidRoomStage();
  const copy = bidRoomStageCopy(stage);
  const progress = bidRoomStageProgress();
  const nextStepNumber = progress.activeIndex + 1;
  rfxOpsNextAction.dataset.stage = stage;
  rfxOpsNextAction.dataset.ready = progress.percent >= 100 ? "true" : "false";
  rfxOpsNextAction.innerHTML = `
    <div class="bid-room-next-head">
      <span>Command center</span>
      <b>${formatNumber(progress.percent)}%</b>
    </div>
    <div class="bid-room-workflow-meter" aria-label="${escapeHtml(progress.statusLine)}">
      <i style="width: ${progress.percent}%"></i>
    </div>
    <strong>Next: ${escapeHtml(copy.title)}</strong>
    <small>${escapeHtml(copy.detail)}</small>
    <div class="bid-room-next-meta">
      <span>${escapeHtml(progress.statusLine)}</span>
      <span>${escapeHtml(progress.commercialLine)}</span>
    </div>
    <div class="bid-room-next-actions">
      ${wizardActionButton(stage)}
    </div>
  `;
}

function processStats() {
  const stats = rfxWizardStats();
  const startedInvitations = stats.invitations.filter(hasInvitationStarted);
  const lanesWithInvites = currentLanes.filter((lane) => activeInvitations(lane).some(hasInvitationStarted)).length;
  return {
    ...stats,
    startedInvitations,
    lanesWithInvites,
    shortlistCoverage: currentLanes.length ? Math.round((stats.lanesWithShortlist / currentLanes.length) * 100) : 0,
    inviteCoverage: currentLanes.length ? Math.round((lanesWithInvites / currentLanes.length) * 100) : 0,
    bidCoverage: currentLanes.length ? Math.round((stats.lanesWithBids / currentLanes.length) * 100) : 0,
    responseRate: stats.invitations.length ? Math.round((stats.bids.length / stats.invitations.length) * 100) : 0
  };
}

function renderParticipantSummary() {
  if (!participantSummaryContent) return;
  if (!selectedEvent) {
    participantSummaryContent.innerHTML = "<span>Create or select an event to manage participants.</span>";
    return;
  }
  const invitations = currentLanes.flatMap((lane) => activeInvitations(lane));
  const carrierRows = new Map();
  currentLanes.forEach((lane) => {
    activeInvitations(lane).forEach((invitation) => {
      const vendor = invitation.vendors || {};
      const key = String(vendor.id || vendor.vendor_id || invitation.vendor_id || vendor.domain || vendor.primary_email || invitation.vendor_email || vendor.vendor_name || invitation.id || "");
      if (!key) return;
      const row = carrierRows.get(key) || {
        key,
        name: vendor.vendor_name || vendor.name || invitation.vendor_name || vendor.domain || vendor.primary_email || invitation.vendor_email || "Vendor",
        domain: vendor.domain || invitation.vendor_domain || "",
        email: vendor.primary_email || vendor.email || invitation.vendor_email || invitation.email || "",
        stage: vendor.base_stage || vendor.stage || "",
        channel: vendor.preferred_channel || invitation.preferred_channel || "",
        lanes: new Set(),
        invitations: [],
        lastActivity: ""
      };
      row.lanes.add(String(lane.id));
      row.invitations.push(invitation);
      const activity = invitation.updated_at || invitation.last_activity_at || invitation.created_at || "";
      if (activity && (!row.lastActivity || new Date(activity) > new Date(row.lastActivity))) row.lastActivity = activity;
      carrierRows.set(key, row);
    });
  });
  const started = invitations.filter(hasInvitationStarted).length;
  const bids = invitations.filter(hasBid).length;
  const coveredLanes = currentLanes.filter((lane) => activeInvitations(lane).length).length;
  if (!invitations.length) {
    participantSummaryContent.innerHTML = `
      <div class="rfx-participant-summary-empty">
        <strong>No carrier participants selected</strong>
        <span>${String(selectedEvent.status || "").toLowerCase() === "draft" ? "Open the manager below to select carriers from CRM or load a saved participant list." : "Use Launch > Invites to add or resend participants for this published event."}</span>
      </div>
    `;
    return;
  }
  const rows = [...carrierRows.values()].sort((a, b) => a.name.localeCompare(b.name));
  participantSummaryContent.innerHTML = `
    <div class="rfx-participant-summary-stats">
      <span><strong>${formatNumber(rows.length)}</strong> carriers</span>
      <span><strong>${formatNumber(coveredLanes)} / ${formatNumber(currentLanes.length)}</strong> lanes covered</span>
      <span><strong>${formatNumber(started)}</strong> invited</span>
      <span><strong>${formatNumber(bids)}</strong> bids</span>
    </div>
    <div class="rfx-participant-summary-table-wrap">
      <table class="rfx-participant-summary-table">
        <thead>
          <tr><th>Carrier</th><th>Domain / email</th><th>CRM stage</th><th>Coverage</th><th>Bid room status</th><th>Invited</th><th>Bids</th><th>Channel</th><th>Last activity</th></tr>
        </thead>
        <tbody>
          ${rows.map((row) => {
            const rowInvitations = row.invitations;
            const rowBids = rowInvitations.filter(hasBid).length;
            const rowInvited = rowInvitations.filter(hasInvitationStarted).length;
            const rowStatus = rowInvitations.some((item) => String(item.invitation_status || "").toLowerCase() === "awarded")
              ? "awarded"
              : rowBids
                ? "quoted"
                : rowInvited
                  ? "invited"
                  : rowInvitations.every((item) => String(item.invitation_status || "").toLowerCase() === "declined") ? "declined" : "drafted";
            return `
              <tr>
                <td><strong title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</strong></td>
                <td><span title="${escapeHtml([row.domain, row.email].filter(Boolean).join(" | "))}">${escapeHtml([row.domain, row.email].filter(Boolean).join(" | ") || "-")}</span></td>
                <td>${escapeHtml(row.stage || "-")}</td>
                <td>${formatNumber(row.lanes.size)} / ${formatNumber(currentLanes.length)}</td>
                <td>${statusChip(rowStatus)}</td>
                <td>${formatNumber(rowInvited)}</td>
                <td>${formatNumber(rowBids)}</td>
                <td>${escapeHtml(row.channel || "-")}</td>
                <td>${escapeHtml(formatCompactDateTime(row.lastActivity) || "-")}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function readinessLabel(status) {
  return {
    ready: "Ready",
    attention: "Needs review",
    blocker: "Blocked"
  }[status] || "Needs review";
}

function readinessActionButton(action, label = "Open") {
  if (!action) return "";
  return `<button class="secondary small-button" type="button" data-rfx-wizard-go="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
}

function bidRoomReadinessSnapshot() {
  const stats = processStats();
  const channel = rfxOutreachChannel?.value || "email";
  const template = selectedOutreachTemplateDraft();
  const drafts = draftRowsForEvent();
  const sendableDrafts = [
    ...selectableEmailDrafts(drafts),
    ...selectableWhatsappDrafts(drafts),
    ...selectableWhatsappGroupDrafts(drafts)
  ];
  const lanesMissingShortlist = currentLanes.filter((lane) => !activeInvitations(lane).length).length;
  const lanesMissingInvite = currentLanes.filter((lane) => activeInvitations(lane).length && !activeInvitations(lane).some(hasInvitationStarted)).length;
  const targetsMissingChannel = Math.max(0, stats.targets.length - stats.readyTargets.length);
  const awardSnapshot = awardReadinessSnapshot();
  const primaryAwards = awardSnapshot.lanes.reduce((sum, { bids }) => sum + bids.filter((row) => row.invitation.award_role === "primary").length, 0);
  const checks = [
    {
      key: "event",
      label: "Event",
      status: selectedEvent ? "ready" : "blocker",
      metric: selectedEvent?.rfx_id || "-",
      detail: selectedEvent ? `${selectedEvent.status || "draft"} | ${selectedEvent.due_date || "No due date"}` : "Create or select a bid event.",
      action: "setup"
    },
    {
      key: "lanes",
      label: "Business book",
      status: stats.lanes > 0 ? "ready" : "blocker",
      metric: formatNumber(stats.lanes),
      detail: stats.lanes ? `${formatNumber(stats.lanes)} lane(s) loaded.` : "Upload the RFx lane template.",
      action: "lanes"
    },
    {
      key: "participants",
      label: "Participants",
      status: stats.invitations.length ? lanesMissingShortlist ? "attention" : "ready" : "blocker",
      metric: formatNumber(stats.invitations.length),
      detail: stats.invitations.length
        ? lanesMissingShortlist ? `${formatNumber(lanesMissingShortlist)} lane(s) still need carriers.` : "All lanes have at least one carrier."
        : "Select carriers from CRM or participant template.",
      action: "carriers"
    },
    {
      key: "contacts",
      label: "Contactability",
      status: stats.targets.length ? targetsMissingChannel === stats.targets.length ? "blocker" : targetsMissingChannel ? "attention" : "ready" : "blocker",
      metric: `${formatNumber(stats.readyTargets.length)} / ${formatNumber(stats.targets.length)}`,
      detail: stats.targets.length
        ? targetsMissingChannel === stats.targets.length
          ? `No targets have usable ${channel} contact data.`
          : targetsMissingChannel ? `${formatNumber(targetsMissingChannel)} target(s) missing ${channel} contact data.` : "Targets have usable contact channel."
        : "Add participants before invite QA.",
      action: "carriers"
    },
    {
      key: "template",
      label: "Invite template",
      status: template ? "ready" : "blocker",
      metric: template ? "Selected" : "-",
      detail: template ? template.name || "Template ready." : "Select an invitation template.",
      action: "outreach"
    },
    {
      key: "drafts",
      label: "Draft queue",
      status: drafts.length ? sendableDrafts.length ? "ready" : "attention" : "attention",
      metric: formatNumber(drafts.length),
      detail: drafts.length
        ? `${formatNumber(sendableDrafts.length)} outreach draft(s) actionable.`
        : "Generate individualized invitation drafts.",
      action: "outreach"
    },
    {
      key: "launch",
      label: "Invite launch",
      status: stats.startedInvitations.length ? lanesMissingInvite ? "attention" : "ready" : "attention",
      metric: formatNumber(stats.startedInvitations.length),
      detail: stats.startedInvitations.length
        ? lanesMissingInvite ? `${formatNumber(lanesMissingInvite)} shortlisted lane(s) still need invite launch.` : "Invitations have started."
        : "Send or mark invitations before waiting for bids.",
      action: "outreach"
    },
    {
      key: "bids",
      label: "Live bids",
      status: stats.bids.length ? "ready" : "attention",
      metric: formatNumber(stats.bids.length),
      detail: stats.bids.length ? `${formatNumber(stats.lanesWithBids)} lane(s) have bids.` : "No carrier bids received yet.",
      action: "responses"
    },
    {
      key: "award",
      label: "Award closeout",
      status: primaryAwards ? awardSnapshot.missingPrimary.length ? "attention" : "ready" : "attention",
      metric: `${formatNumber(primaryAwards)} / ${formatNumber(awardSnapshot.lanes.length)}`,
      detail: awardSnapshot.lanes.length
        ? primaryAwards ? `${formatNumber(awardSnapshot.missingPrimary.length)} lane(s) still missing primary award.` : "Review live bids before award."
        : "Awards unlock after bids are received.",
      action: "award"
    }
  ];
  return {
    checks,
    blockers: checks.filter((check) => check.status === "blocker"),
    warnings: checks.filter((check) => check.status === "attention"),
    ready: checks.filter((check) => check.status === "ready")
  };
}

function readinessReportLines(snapshot = bidRoomReadinessSnapshot()) {
  const header = selectedEvent
    ? `${selectedEvent.rfx_id || "RFx"} | ${selectedEvent.name || "Bid Room"}`
    : "Bid Room | No event selected";
  const stats = processStats();
  return [
    header,
    `Status: ${selectedEvent?.status || "-"} | Customer: ${selectedEvent?.customer || "-"} | Due: ${selectedEvent?.due_date || "-"}`,
    `Lanes: ${formatNumber(stats.lanes)} | Participants: ${formatNumber(stats.invitations.length)} | Invite targets: ${formatNumber(stats.readyTargets.length)} / ${formatNumber(stats.targets.length)} | Bids: ${formatNumber(stats.bids.length)}`,
    `QA: ${formatNumber(snapshot.ready.length)} ready | ${formatNumber(snapshot.warnings.length)} warning(s) | ${formatNumber(snapshot.blockers.length)} blocker(s)`,
    "",
    ...snapshot.checks.map((check) => `${readinessLabel(check.status)} | ${check.label}: ${check.metric} | ${check.detail}`)
  ];
}

async function copyReadinessReport() {
  const lines = readinessReportLines();
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    setStatus(actionStatus, "Bid Room QA report copied.", "success");
  } catch (_error) {
    setStatus(actionStatus, lines.join(" | "), "neutral");
  }
}

function launchPreflightIssues() {
  const launchRequiredKeys = new Set(["event", "lanes", "participants", "contacts", "template"]);
  const snapshot = bidRoomReadinessSnapshot();
  return snapshot.checks.filter((check) => launchRequiredKeys.has(check.key) && check.status === "blocker");
}

function blockIfLaunchPreflightFails(statusElement = rfxOutreachStatus) {
  const issues = launchPreflightIssues();
  if (!issues.length) return false;
  const firstIssue = issues[0];
  activateWorkbenchView(firstIssue.action || "setup", {
    setup: "#rfx-id",
    lanes: "#rfx-lane-template-file",
    carriers: "#manual-shortlist-search",
    outreach: "#rfx-outreach-template"
  }[firstIssue.action] || null);
  setStatus(statusElement, `Launch blocked: ${firstIssue.label}. ${firstIssue.detail}`, "error");
  renderBidRoomLaunchReadiness();
  return true;
}

function openFirstReadinessIssue() {
  const snapshot = bidRoomReadinessSnapshot();
  const issue = snapshot.blockers[0] || snapshot.warnings[0];
  if (!issue) {
    setStatus(actionStatus, "No launch blockers detected.", "success");
    return;
  }
  activateWorkbenchView(issue.action || "setup", {
    setup: "#rfx-id",
    lanes: "#rfx-lane-template-file",
    carriers: "#manual-shortlist-search",
    outreach: "#rfx-outreach-template",
    responses: "#rfx-response-body",
    award: "#rfx-award-board"
  }[issue.action] || null);
  setStatus(actionStatus, `${issue.label}: ${issue.detail}`, issue.status === "blocker" ? "error" : "neutral");
}

function renderBidRoomLaunchReadiness() {
  if (!rfxLaunchReadiness) return;
  const snapshot = bidRoomReadinessSnapshot();
  const launchReady = Boolean(selectedEvent) && !snapshot.blockers.length;
  const nextIssue = snapshot.blockers[0] || snapshot.warnings[0];
  rfxLaunchReadiness.innerHTML = `
    <div class="bid-room-readiness-header">
      <div>
        <p class="eyebrow">Operating checklist</p>
        <h3>${launchReady ? "Bid Room can operate" : "Bid Room needs setup"}</h3>
        <small>${launchReady
          ? `${formatNumber(snapshot.warnings.length)} item(s) need monitoring, but no launch blockers remain.`
          : nextIssue ? nextIssue.detail : "Select a bid event to inspect readiness."}</small>
      </div>
      <div class="bid-room-readiness-actions">
        <span class="status-pill" data-tone="${launchReady ? "success" : snapshot.blockers.length ? "danger" : "warning"}">
          ${launchReady ? "Operational" : snapshot.blockers.length ? `${formatNumber(snapshot.blockers.length)} blocker(s)` : `${formatNumber(snapshot.warnings.length)} warning(s)`}
        </span>
        <button class="secondary small-button" type="button" data-rfx-readiness-first-issue ${nextIssue ? "" : "disabled"}>Open first issue</button>
        <button class="secondary small-button" type="button" data-rfx-copy-readiness>Copy QA report</button>
      </div>
    </div>
    <div class="bid-room-readiness-grid">
      ${snapshot.checks.map((check) => `
        <article data-readiness="${escapeHtml(check.status)}">
          <span>${escapeHtml(check.label)}</span>
          <strong>${escapeHtml(check.metric)}</strong>
          <small>${escapeHtml(check.detail)}</small>
          <div>
            <b>${escapeHtml(readinessLabel(check.status))}</b>
            ${readinessActionButton(check.action)}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function managerStageAction(stepKey) {
  if (stepKey === "carriers") {
    return `<button class="secondary small-button" type="button" data-rfx-wizard-go="carriers" ${selectedEventId ? "" : "disabled"}>Select participants</button>`;
  }
  if (stepKey === "launch") {
    return `<button class="small-button" type="button" data-rfx-wizard-create-drafts ${selectedEventId ? "" : "disabled"}>Generate invitations</button>`;
  }
  return `<button class="secondary small-button" type="button" data-rfx-wizard-go="${escapeHtml(wizardStageView(stepKey))}">${escapeHtml(wizardStageCopy(stepKey).cta)}</button>`;
}

function renderProcessFlow() {
  if (!rfxManagerFlow) return;
  const stage = currentWizardStage();
  const stats = processStats();
  const stageMeta = {
    event: selectedEvent ? `${selectedEvent.status || "draft"} | ${selectedEvent.due_date || "No due date"}` : "No event selected",
    lanes: `${formatNumber(stats.lanes)} lane(s)`,
    carriers: `${formatNumber(stats.lanesWithShortlist)} / ${formatNumber(stats.lanes)} lane(s) covered`,
    preview: `${formatNumber(stats.readyTargets.length)} / ${formatNumber(stats.targets.length)} contact-ready`,
    launch: `${formatNumber(stats.startedInvitations.length)} sent/started`,
    offers: `${formatNumber(stats.bids.length)} bid(s)`
  };
  rfxManagerFlow.innerHTML = rfxWizardStepState().map((step, index) => {
    const copy = wizardStageCopy(step.key);
    return `
      <article class="${step.complete ? "is-complete" : ""} ${step.key === stage ? "is-active" : ""}">
        <div>
          <span>${index + 1}</span>
          <strong>${escapeHtml(step.label)}</strong>
        </div>
        <p>${escapeHtml(copy.title)}</p>
        <small>${escapeHtml(stageMeta[step.key] || copy.note)}</small>
        ${managerStageAction(step.key)}
      </article>
    `;
  }).join("");
}

function renderProcessFocus() {
  if (!rfxManagerFocus) return;
  const stats = processStats();
  const stage = currentWizardStage();
  const copy = wizardStageCopy(stage);
  if (!selectedEvent) {
    rfxManagerFocus.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Bid Room process",
      title: "Select or create a bid event",
      detail: "The event list stays on the left. Once an event is selected, this board shows the process, next action, lane coverage, invitations, and bids.",
      actionButton: '<button type="button" data-rfx-focus-create>Create bid event</button>'
    });
    return;
  }
  rfxManagerFocus.innerHTML = `
    <article class="rfx-manager-next">
      <div>
        <p class="eyebrow">Current priority</p>
        <h3>${escapeHtml(copy.title)}</h3>
        <p>${escapeHtml(copy.detail)}</p>
      </div>
      <div class="action-row">
        ${wizardActionButton(stage)}
        <button class="secondary small-button" type="button" data-rfx-wizard-go="lanes">Book</button>
        <button class="secondary small-button" type="button" data-rfx-wizard-go="outreach">Invites</button>
        <button class="secondary small-button" type="button" data-rfx-wizard-go="responses">Bids</button>
      </div>
    </article>
    <div class="rfx-manager-kpis">
      <article><span>Shortlist</span><strong>${formatNumber(stats.shortlistCoverage)}%</strong><small>${formatNumber(stats.lanesWithShortlist)} of ${formatNumber(stats.lanes)} lanes</small></article>
      <article><span>Invite ready</span><strong>${formatNumber(stats.readyTargets.length)}</strong><small>${formatNumber(stats.targets.length)} active targets</small></article>
      <article><span>Invited</span><strong>${formatNumber(stats.startedInvitations.length)}</strong><small>${formatNumber(stats.inviteCoverage)}% lane invite coverage</small></article>
      <article><span>Bids</span><strong>${formatNumber(stats.bids.length)}</strong><small>${formatNumber(stats.responseRate)}% response rate</small></article>
    </div>
  `;
}

function processQueueItems() {
  const stats = processStats();
  return [
    {
      done: Boolean(selectedEvent),
      title: "Event setup",
      detail: selectedEvent ? `${selectedEvent.rfx_id || "RFx"} is selected.` : "Create or select the bid event.",
      action: "manager"
    },
    {
      done: stats.lanes > 0,
      title: "Business book",
      detail: stats.lanes ? `${formatNumber(stats.lanes)} lane(s) loaded.` : "Load lanes before selecting carriers.",
      action: "lanes"
    },
    {
      done: stats.invitations.length > 0,
      title: "Bid participants",
      detail: stats.invitations.length ? `${formatNumber(stats.invitations.length)} carrier participant row(s) selected.` : "Select carriers from CRM or upload the participant catalog.",
      action: "carriers"
    },
    {
      done: stats.readyTargets.length > 0,
      title: "Invitation readiness",
      detail: `${formatNumber(stats.readyTargets.length)} of ${formatNumber(stats.targets.length)} target(s) have a usable channel.`,
      action: "outreach"
    },
    {
      done: stats.startedInvitations.length > 0,
      title: "Invitation launch",
      detail: stats.startedInvitations.length ? `${formatNumber(stats.startedInvitations.length)} invite(s) started.` : "Generate drafts and mark invites as sent.",
      action: "outreach",
      special: "drafts"
    },
    {
      done: stats.bids.length > 0,
      title: "Live bid monitoring",
      detail: stats.bids.length ? `${formatNumber(stats.bids.length)} live bid(s) received.` : "Monitor responses and compare bids against Rateware.",
      action: "responses"
    }
  ];
}

function renderProcessQueue() {
  if (!rfxManagerQueue) return;
  const items = processQueueItems();
  const openItems = items.filter((item) => !item.done);
  rfxManagerQueue.innerHTML = `
    <div class="section-heading compact">
      <p class="eyebrow">Work queue</p>
      <h3>${openItems.length ? `${formatNumber(openItems.length)} action(s) pending` : "Process ready for bids"}</h3>
    </div>
    <div class="rfx-manager-task-list">
      ${items.map((item) => `
        <article class="${item.done ? "is-done" : ""}">
          <span>${item.done ? "Done" : "Next"}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.detail)}</small>
          ${item.special === "shortlist"
            ? `<button class="secondary small-button" type="button" data-rfx-wizard-auto-shortlist ${currentLanes.length ? "" : "disabled"}>Build shortlist</button>`
            : item.special === "drafts"
              ? `<button class="small-button" type="button" data-rfx-wizard-create-drafts ${selectedEventId ? "" : "disabled"}>Generate invitations</button>`
              : `<button class="secondary small-button" type="button" data-rfx-wizard-go="${escapeHtml(item.action)}">Open</button>`}
        </article>
      `).join("")}
    </div>
  `;
}

function renderProcessManager() {
  renderProcessFlow();
  renderProcessFocus();
  renderProcessQueue();
}

function renderWizardSteps() {
  if (!wizardSteps) return;
  const stage = currentWizardStage();
  wizardSteps.innerHTML = rfxWizardStepState().map((step, index) => `
    <article class="${step.complete ? "is-complete" : ""} ${step.key === stage ? "is-active" : ""}">
      <span>${index + 1}</span>
      <strong>${escapeHtml(step.label)}</strong>
    </article>
  `).join("");
}

function renderWizardPreview() {
  if (!wizardPreview) return;
  const template = selectedOutreachTemplateDraft();
  const target = firstOutreachTarget();
  const context = sampleOutreachContext(target, template);
  const subject = template ? renderTemplateText(template.subject || `${context.rfx_id} invitation`, context) : "No template selected";
  const htmlBody = template ? renderTemplateText(template.html_body || template.whatsapp_body || "", context) : "";
  const whatsappText = template ? renderTemplateText(template.whatsapp_body || htmlBody.replace(/<[^>]*>/g, " "), context) : "";
  const channel = rfxOutreachChannel?.value || "email";
  wizardPreview.innerHTML = `
    <div class="split-heading compact">
      <div>
        <p class="eyebrow">Invite preview</p>
        <h3>${escapeHtml(template?.name || "No template selected")}</h3>
      </div>
      <span class="status-pill neutral">${escapeHtml(channel)}</span>
    </div>
    <div class="rfx-preview-meta">
      <span>To: ${escapeHtml(context.vendor_name)}</span>
      <span>Lane: ${escapeHtml(context.lane_origin || "-")} -> ${escapeHtml(context.lane_destination || "-")}</span>
      <span>Link: ${escapeHtml(context.bid_link)}</span>
    </div>
    <article class="rfx-email-preview-card">
      <span>Subject</span>
      <strong>${escapeHtml(subject)}</strong>
      ${htmlBody ? `<iframe sandbox="" srcdoc="${escapeHtml(htmlBody)}"></iframe>` : `<p>${escapeHtml(whatsappText || "Select a template and shortlist at least one vendor to preview the invitation.")}</p>`}
    </article>
    <article class="rfx-email-preview-card">
      <span>WhatsApp</span>
      <p>${escapeHtml(whatsappText || "No WhatsApp draft configured.")}</p>
    </article>
  `;
}

function renderWizard() {
  renderWizardSteps();
  renderWizardPreview();
  renderOpsStageRail();
  renderOpsNextAction();
  renderProcessManager();
  if (!wizardPrimary) return;
  const stats = rfxWizardStats();
  const stage = currentWizardStage();
  const nextCopy = wizardStageCopy(stage);
  wizardPrimary.innerHTML = `
    <article class="rfx-wizard-next">
      <p class="eyebrow">Next best action</p>
      <h3>${escapeHtml(nextCopy.title)}</h3>
      <p>${escapeHtml(nextCopy.detail)}</p>
      <div class="action-row">
        ${wizardActionButton(stage)}
        <button class="secondary" type="button" data-rfx-wizard-go="manager">Open process</button>
      </div>
    </article>
    <div class="rfx-wizard-scoreboard">
      <article><span>Selected event</span><strong>${escapeHtml(selectedEvent?.rfx_id || "-")}</strong><small>${escapeHtml(selectedEvent?.name || "No event selected")}</small></article>
      <article><span>Lanes</span><strong>${formatNumber(stats.lanes)}</strong><small>${formatNumber(stats.lanesWithShortlist)} with shortlist</small></article>
      <article><span>Invite targets</span><strong>${formatNumber(stats.readyTargets.length)} / ${formatNumber(stats.targets.length)}</strong><small>ready by selected channel</small></article>
      <article><span>Live bids</span><strong>${formatNumber(stats.bids.length)}</strong><small>${formatNumber(stats.lanesWithBids)} lane(s) with bids</small></article>
    </div>
    <section class="rfx-wizard-offer-strip">
      ${liveOfferCards(5) || "<article>No bids yet. Once carriers submit through the Private Bid Room, offers appear here.</article>"}
    </section>
  `;
}

function liveOfferRows() {
  return currentLanes.flatMap((lane) => bidInvitations(lane)
    .map((invitation) => {
      const economics = bidCommercialEconomics(invitation);
      return {
        lane,
        invitation,
        amount: Number(economics.board_rate),
        carrier_amount: Number(economics.carrier_rate),
        currency: invitation.currency || lane.currency || "USD"
      };
    })
    .filter((row) => Number.isFinite(row.amount)));
}

function liveOfferCards(limit = 12) {
  return liveOfferRows()
    .sort((a, b) => a.amount - b.amount)
    .slice(0, limit)
    .map((row, index) => `
      <article>
        <span>#${index + 1} ${escapeHtml(row.lane.lane_number || "")}</span>
        <strong>${formatMoney(row.amount, row.currency)}</strong>
        <small>${escapeHtml(vendorLabel(row.invitation))} | ${escapeHtml(laneRoute(row.lane))}</small>
      </article>
    `).join("");
}

function renderLiveOfferManager() {
  if (!liveOfferManager) return;
  const rows = liveOfferRows();
  if (!rows.length) {
    liveOfferManager.innerHTML = "<article>No live bids yet. Carrier portal submissions will appear here as ranked offers.</article>";
    return;
  }
  const byLane = new Map();
  rows.forEach((row) => {
    const bucket = byLane.get(row.lane.id) || [];
    bucket.push(row);
    byLane.set(row.lane.id, bucket);
  });
  liveOfferManager.innerHTML = [...byLane.values()].map((laneRows) => {
    const scoredRows = laneRows.map((row) => ({
      ...row,
      decision: procurementDecisionForBid(row, laneRows),
      decision_badges: decisionBadgesForBid(row, laneRows)
    }));
    const sorted = scoredRows.sort((a, b) => b.decision.score - a.decision.score || a.amount - b.amount);
    const best = sorted[0];
    const cheapest = [...scoredRows].sort((a, b) => a.amount - b.amount)[0];
    const amounts = scoredRows.map((row) => row.amount);
    const spread = amounts.length > 1 ? Math.max(...amounts) - Math.min(...amounts) : 0;
    return `
      <section class="live-offer-lane">
        <div>
          <span class="status-pill success">${formatNumber(sorted.length)} bid(s)</span>
          <strong>${escapeHtml(laneRoute(best.lane))}</strong>
          <small>Best overall ${escapeHtml(vendorLabel(best.invitation))} (${best.decision.score}/100) | Lowest ${formatMoney(cheapest.amount, cheapest.currency)} | Spread ${formatMoney(spread, best.currency)}</small>
        </div>
        <table>
          <thead><tr><th>Rank</th><th>Carrier</th><th>Score</th><th>Bid</th><th>Commercial</th><th>Availability</th><th>Capacity</th><th>Transit</th><th>Status</th><th>Email</th></tr></thead>
          <tbody>
            ${sorted.map((row, index) => `
              <tr>
                <td>#${index + 1}</td>
                <td>${escapeHtml(vendorLabel(row.invitation))}</td>
                <td><span class="rfx-decision-score">${escapeHtml(row.decision.score)}</span></td>
                <td>${formatMoney(row.amount, row.currency)}</td>
                <td>${escapeHtml(offerCommercialSummary(row.invitation))}</td>
                <td>${escapeHtml(offerAvailabilitySummary(row.invitation))}</td>
                <td>${escapeHtml(row.invitation.weekly_capacity ?? "-")}</td>
                <td>${escapeHtml(row.invitation.transit_days ?? "-")}</td>
                <td>${statusChip(row.invitation.invitation_status || "quoted")}</td>
                <td><button type="button" class="secondary small-button" data-rfx-ask-carrier="${escapeHtml(row.invitation.id)}" data-rfx-ask-carrier-lane="${escapeHtml(row.lane.id)}" title="Reply in this carrier's latest Gmail thread for this RFx">Reply by email</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    `;
  }).join("");
}

function awardRoleLabel(role) {
  return {
    primary: "Primary",
    backup: "Backup"
  }[String(role || "").toLowerCase()] || "";
}

function awardRoleChip(invitation) {
  const role = String(invitation.award_role || "").toLowerCase();
  if (!role) return '<span class="status-pill muted">Open</span>';
  return `<span class="status-pill ${role === "primary" ? "success" : "neutral"}">${escapeHtml(awardRoleLabel(role))}</span>`;
}

function awardReasonDefault(row, rank) {
  const parts = [];
  if (rank === 1) parts.push("Best all-in");
  if (Number.isFinite(Number(row.invitation.bid_delta))) {
    const delta = Number(row.invitation.bid_delta);
    parts.push(delta <= 0 ? "Below Rateware benchmark" : "Accepted vs benchmark");
  }
  if (row.invitation.commercial_model) parts.push(commercialModelLabel(row.invitation.commercial_model));
  if (row.invitation.equipment_available === true) parts.push("Equipment available");
  if (row.invitation.best_alternative_offered) parts.push("Best alternative available");
  if (row.invitation.weekly_capacity) parts.push(`Capacity ${row.invitation.weekly_capacity}/wk`);
  if (row.invitation.transit_days) parts.push(`Transit ${row.invitation.transit_days} day(s)`);
  return parts.join("; ") || "Procurement decision";
}

function awardLaneRows() {
  return currentLanes
    .map((lane) => {
      const rawBids = bidInvitations(lane)
        .map((invitation) => {
          const economics = bidCommercialEconomics(invitation);
          return {
            lane,
            invitation,
            amount: Number(economics.board_rate),
            carrier_amount: Number(economics.carrier_rate),
            currency: invitation.currency || lane.currency || "USD"
          };
        })
        .filter((row) => Number.isFinite(row.amount));
      const bids = rawBids
        .map((row) => ({
          ...row,
          decision: procurementDecisionForBid(row, rawBids),
          decision_badges: decisionBadgesForBid(row, rawBids)
        }))
        .sort((a, b) => b.decision.score - a.decision.score || a.amount - b.amount);
      return { lane, bids };
    })
    .filter((row) => row.bids.length);
}

function awardNoticeDraftRows() {
  if (!selectedEventId) return [];
  return outreachMessages.filter((message) => {
    const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
    return message.rfx_event_id === selectedEventId && metadata.notice_type === "rfx_award_closeout";
  });
}

function visibleAwardNoticeRows(rows = awardNoticeDraftRows()) {
  return rows.filter((message) => String(message.channel || "email").toLowerCase() === "email");
}

function sendableAwardNoticeIds(rows = awardNoticeDraftRows()) {
  return rows
    .filter((message) => {
      const status = String(message.status || "").toLowerCase();
      return String(message.channel || "email").toLowerCase() === "email"
        && Boolean(message.recipient_email)
        && ["drafted", "queued", "failed"].includes(status);
    })
    .map((message) => String(message.id));
}

function selectedAwardNoticeIds(rows = visibleAwardNoticeRows()) {
  const sendable = new Set(sendableAwardNoticeIds(rows));
  for (const id of [...awardNoticeSelectedIds]) {
    if (!sendable.has(String(id))) awardNoticeSelectedIds.delete(String(id));
  }
  return [...awardNoticeSelectedIds].filter((id) => sendable.has(String(id)));
}

function awardNoticeOutcome(message) {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const summary = metadata.award_summary && typeof metadata.award_summary === "object" ? metadata.award_summary : {};
  if (Number(summary.awarded || 0) > 0) return "Award";
  if (Number(summary.backup || 0) > 0) return "Backup";
  if (Number(summary.not_awarded || 0) > 0) return "Not awarded";
  return "Closeout";
}

function awardNoticeOutcomeTone(outcome, status) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "failed") return "danger";
  if (normalizedStatus === "sent") return "success";
  if (outcome === "Award") return "success";
  if (outcome === "Backup") return "neutral";
  if (outcome === "Not awarded") return "muted";
  return "neutral";
}

function renderAwardNoticeQueue(rows = awardNoticeDraftRows()) {
  if (!rfxAwardNoticeQueue) return;
  if (!selectedEventId) {
    rfxAwardNoticeQueue.innerHTML = "Select a bid event to review closeout notices.";
    renderAwardNoticePreview([]);
    return;
  }
  const channelRows = visibleAwardNoticeRows(rows);
  if (!channelRows.length) {
    rfxAwardNoticeQueue.innerHTML = "No email notices generated for this event.";
    renderAwardNoticePreview([]);
    return;
  }
  const visibleRows = channelRows;
  const selectableIds = selectedAwardNoticeIds(channelRows);
  if (!visibleRows.some((message) => String(message.id) === awardNoticePreviewId)) {
    awardNoticePreviewId = String(visibleRows[0]?.id || "");
  }
  rfxAwardNoticeQueue.innerHTML = `
    <div class="rfx-award-notice-selection-bar">
      <label><input type="checkbox" data-rfx-select-all-award-notices ${selectableIds.length === sendableAwardNoticeIds(channelRows).length && selectableIds.length ? "checked" : ""}> Select all ready</label>
      <span>${formatNumber(selectableIds.length)} selected of ${formatNumber(sendableAwardNoticeIds(channelRows).length)} ready</span>
      <button class="secondary small-button" type="button" data-rfx-clear-award-notice-selection ${selectableIds.length ? "" : "disabled"}>Clear</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>Select</th>
          <th>Carrier</th>
          <th>Outcome</th>
          <th>Status</th>
          <th>Recipient</th>
          <th>Review</th>
        </tr>
      </thead>
      <tbody>
        ${visibleRows.map((message) => {
          const outcome = awardNoticeOutcome(message);
          const status = String(message.status || "drafted").toLowerCase();
          const openUrl = message.gmail_compose_url;
          const selected = String(message.id) === awardNoticePreviewId;
          const sendable = sendableAwardNoticeIds([message]).length > 0;
          const checked = awardNoticeSelectedIds.has(String(message.id));
          return `
            <tr class="${selected ? "is-selected" : ""}" data-rfx-award-notice-row="${escapeHtml(message.id)}">
              <td><input type="checkbox" aria-label="Select email notice for ${escapeHtml(message.vendors?.vendor_name || "carrier")}" data-rfx-select-award-notice="${escapeHtml(message.id)}" ${checked ? "checked" : ""} ${sendable ? "" : "disabled"}></td>
              <td>
                <strong>${escapeHtml(message.vendors?.vendor_name || message.vendors?.domain || "Vendor")}</strong>
                <small>${escapeHtml(message.subject || message.outreach_campaigns?.name || "Award notice")}</small>
              </td>
              <td><span class="status-pill ${awardNoticeOutcomeTone(outcome, status)}">${escapeHtml(outcome)}</span></td>
              <td><span class="status-pill ${status === "sent" ? "success" : status === "failed" ? "danger" : status === "archived" ? "muted" : "neutral"}">${escapeHtml(status)}</span></td>
              <td>${escapeHtml(messageRecipient(message) || "-")}</td>
              <td>
                <div class="compact-actions">
                  <button class="secondary small-button" type="button" data-rfx-preview-award-notice="${escapeHtml(message.id)}">Preview</button>
                  <button class="secondary small-button" type="button" data-rfx-open-award-notice="${escapeHtml(openUrl || "")}" ${openUrl ? "" : "disabled"}>Open</button>
                  <button class="small-button" type="button" data-rfx-send-award-notice="${escapeHtml(message.id)}" ${sendable ? "" : "disabled"}>Send</button>
                  <button class="secondary small-button" type="button" data-rfx-mark-award-notice="${escapeHtml(message.id)}" data-rfx-award-notice-status="queued" ${status === "queued" || status === "sent" || status === "archived" ? "disabled" : ""}>Queue</button>
                  <button class="secondary small-button" type="button" data-rfx-mark-award-notice="${escapeHtml(message.id)}" data-rfx-award-notice-status="archived" ${status === "archived" ? "disabled" : ""}>Archive</button>
                </div>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
  renderAwardNoticePreview(channelRows);
}

function renderAwardNoticePreview(rows = visibleAwardNoticeRows()) {
  if (!rfxAwardNoticePreview) return;
  const message = rows.find((row) => String(row.id) === awardNoticePreviewId) || rows[0];
  if (!message) {
    rfxAwardNoticePreview.innerHTML = `
      <p class="eyebrow">Preview</p>
      <p>Select a carrier notice to inspect its rendered email.</p>
    `;
    return;
  }
  awardNoticePreviewId = String(message.id || "");
  const outcome = awardNoticeOutcome(message);
  const status = String(message.status || "drafted").toLowerCase();
  const recipient = messageRecipient(message) || "-";
  rfxAwardNoticePreview.innerHTML = `
    <div class="rfx-award-notice-preview-heading">
      <div>
        <p class="eyebrow">Email preview</p>
        <strong>${escapeHtml(message.vendors?.vendor_name || message.vendors?.domain || "Vendor")}</strong>
      </div>
      <span class="status-pill ${awardNoticeOutcomeTone(outcome, status)}">${escapeHtml(status)}</span>
    </div>
    <p class="rfx-award-notice-preview-meta">${escapeHtml(recipient)} · ${escapeHtml(outcome)}</p>
    <div class="rfx-award-notice-preview-body" data-rfx-award-notice-preview-body></div>
  `;
  const meta = rfxAwardNoticePreview.querySelector(".rfx-award-notice-preview-meta");
  if (meta) meta.textContent = recipient + " - " + outcome;
  const body = rfxAwardNoticePreview.querySelector("[data-rfx-award-notice-preview-body]");
  if (!body) return;
  const frame = document.createElement("iframe");
  frame.className = "rfx-award-notice-email-frame";
  frame.title = "Award email preview";
  frame.setAttribute("sandbox", "");
  frame.srcdoc = String(message.html_body || `<p>${escapeHtml(message.text_body || "No email body")}</p>`);
  body.appendChild(frame);
}

function recommendedAwardCandidates() {
  return awardLaneRows()
    .map(({ lane, bids }) => {
      const hasPrimary = bids.some((row) => row.invitation.award_role === "primary");
      return {
        lane,
        bids,
        recommended: bids[0],
        hasPrimary
      };
    })
    .filter((row) => !row.hasPrimary && row.recommended?.invitation?.id);
}

function awardReadinessSnapshot() {
  const lanes = awardLaneRows();
  const invitations = currentLanes.flatMap((lane) => activeInvitations(lane));
  const primary = invitations.filter((item) => item.award_role === "primary");
  const pendingCloseout = primary.filter((item) => !item.rate_staging_id);
  const noticeRows = awardNoticeDraftRows();
  const sendable = sendableAwardNoticeIds(noticeRows);
  const missingPrimary = lanes.filter(({ bids }) => !bids.some((row) => row.invitation.award_role === "primary"));
  const riskFlags = lanes.reduce((sum, { bids }) => sum + (bids[0]?.decision?.risk_flags?.length || 0), 0);
  const weakRecommended = lanes.filter(({ bids }) => Number(bids[0]?.decision?.score || 0) < 55);
  return {
    lanes,
    primary,
    pendingCloseout,
    noticeRows,
    sendable,
    missingPrimary,
    riskFlags,
    weakRecommended,
    recommendations: recommendedAwardCandidates()
  };
}

function awardPreflightIssues(action = "closeout") {
  const snapshot = awardReadinessSnapshot();
  const issues = [];
  if (!selectedEventId) {
    issues.push({ key: "event", label: "No bid event selected", detail: "Select a bid event before award closeout." });
    return issues;
  }
  if ((action === "closeout" || action === "generate_notices") && !snapshot.lanes.length) {
    issues.push({ key: "bids", label: "No carrier bids", detail: "Capture carrier bids before making award decisions." });
  }
  if ((action === "closeout" || action === "generate_notices") && !snapshot.primary.length) {
    issues.push({ key: "primary", label: "No primary awards", detail: "Award at least one carrier as primary before closeout." });
  }
  if ((action === "closeout" || action === "generate_notices") && snapshot.missingPrimary.length) {
    issues.push({
      key: "incomplete_awards",
      label: "Incomplete lane awards",
      detail: `${formatNumber(snapshot.missingPrimary.length)} lane(s) with bids still need a primary award.`
    });
  }
  if (action === "closeout" && !snapshot.pendingCloseout.length) {
    issues.push({ key: "closeout", label: "No Rateware closeout pending", detail: "Primary awards already have Rateware rows or no primary awards are available." });
  }
  if (action === "send_notices" && !snapshot.sendable.length) {
    issues.push({
      key: "notices",
      label: "No sendable notices",
      detail: "Generate email notice drafts with a valid recipient before sending."
    });
  }
  return issues;
}

function blockIfAwardPreflightFails(action = "closeout", statusElement = rfxAwardStatus) {
  const issues = awardPreflightIssues(action);
  if (!issues.length) return false;
  const firstIssue = issues[0];
  activateWorkbenchView("award");
  activateRfxCloseWorkspace(action === "closeout" ? "rateware" : action.includes("notices") ? "notices" : "award");
  setStatus(statusElement, `Award action blocked: ${firstIssue.label}. ${firstIssue.detail}`, "error");
  renderAwardReadiness();
  updateAwardNoticeControls();
  return true;
}

function renderAwardReadiness() {
  if (!rfxAwardReadiness) return;
  if (!selectedEventId) {
    rfxAwardReadiness.innerHTML = "Select a bid event to inspect closeout readiness.";
    if (rfxApplyRecommendedAwardsButton) rfxApplyRecommendedAwardsButton.disabled = true;
    return;
  }
  const snapshot = awardReadinessSnapshot();
  const lanesCount = snapshot.lanes.length;
  const awardedCount = snapshot.primary.length;
  const decisionTone = lanesCount && !snapshot.missingPrimary.length ? "success" : lanesCount ? "warning" : "neutral";
  const riskTone = snapshot.weakRecommended.length || snapshot.riskFlags ? "warning" : "success";
  const closeoutTone = snapshot.pendingCloseout.length ? "warning" : snapshot.primary.length ? "success" : "neutral";
  const noticesTone = snapshot.sendable.length ? "warning" : snapshot.noticeRows.length ? "success" : "neutral";
  if (rfxApplyRecommendedAwardsButton) {
    rfxApplyRecommendedAwardsButton.disabled = awardMutationRunning || !snapshot.recommendations.length;
    rfxApplyRecommendedAwardsButton.textContent = snapshot.recommendations.length
      ? `Award ${formatNumber(snapshot.recommendations.length)} recommended`
      : "Award recommended";
  }
  rfxAwardReadiness.innerHTML = `
    <div class="rfx-award-readiness-grid">
      <span data-tone="${decisionTone}"><b>${formatNumber(awardedCount)} / ${formatNumber(lanesCount)}</b> lanes awarded</span>
      <span data-tone="${riskTone}"><b>${formatNumber(snapshot.riskFlags)}</b> top-choice risk flag(s)</span>
      <span data-tone="${closeoutTone}"><b>${formatNumber(snapshot.pendingCloseout.length)}</b> Rateware closeout pending</span>
      <span data-tone="${noticesTone}"><b>${formatNumber(snapshot.sendable.length)}</b> email notice(s) ready</span>
    </div>
    ${snapshot.weakRecommended.length ? `<p>${formatNumber(snapshot.weakRecommended.length)} lane(s) have weak recommended scores. Review before applying awards in bulk.</p>` : ""}
  `;
}

function updateAwardNoticeControls() {
  const rows = awardNoticeDraftRows();
  const channelRows = visibleAwardNoticeRows(rows);
  const sendableIds = sendableAwardNoticeIds(rows);
  const selectedIds = selectedAwardNoticeIds(channelRows);
  const selectedSendableIds = selectedIds.filter((id) => sendableIds.includes(String(id)));
  const sent = channelRows.filter((message) => String(message.status || "").toLowerCase() === "sent").length;
  const failed = channelRows.filter((message) => String(message.status || "").toLowerCase() === "failed").length;
  const primary = currentLanes.flatMap((lane) => activeInvitations(lane)).filter((item) => item.award_role === "primary").length;
  const bidRows = awardLaneRows().reduce((sum, row) => sum + row.bids.length, 0);
  if (rfxGenerateAwardNoticesButton) {
    rfxGenerateAwardNoticesButton.textContent = "Generate email notices";
  }
  if (rfxGenerateAwardNoticesButton) {
    rfxGenerateAwardNoticesButton.disabled = awardMutationRunning || !selectedEventId || !bidRows || Boolean(awardPreflightIssues("generate_notices").length);
  }
  if (rfxSendAwardNoticesButton) {
    rfxSendAwardNoticesButton.disabled = awardMutationRunning || !selectedSendableIds.length || Boolean(awardPreflightIssues("send_notices").length);
    rfxSendAwardNoticesButton.textContent = selectedSendableIds.length
      ? `Send ${formatNumber(selectedSendableIds.length)} selected email${selectedSendableIds.length === 1 ? "" : "s"}`
      : "Send selected emails";
  }
  if (rfxAwardNoticeSummary) {
    rfxAwardNoticeSummary.textContent = channelRows.length
      ? `${formatNumber(channelRows.length)} email draft(s). ${formatNumber(selectedSendableIds.length)} selected, ${formatNumber(sendableIds.length)} ready, ${formatNumber(sent)} sent${failed ? `, ${formatNumber(failed)} failed` : ""}.`
      : primary
        ? "Generate email notices when award decisions are ready."
        : "Award at least one lane before sending closeout notices.";
    rfxAwardNoticeSummary.dataset.tone = failed ? "warning" : channelRows.length ? "success" : "neutral";
  }
  renderAwardNoticeQueue(rows);
}

function updateAwardMetrics() {
  const invitations = currentLanes.flatMap((lane) => activeInvitations(lane));
  const awardable = awardLaneRows();
  const primary = invitations.filter((item) => item.award_role === "primary");
  const backup = invitations.filter((item) => item.award_role === "backup");
  const ratewareRows = invitations.filter((item) => item.rate_staging_id);
  if (rfxAwardLanes) rfxAwardLanes.textContent = formatNumber(awardable.length);
  if (rfxAwardPrimary) rfxAwardPrimary.textContent = formatNumber(primary.length);
  if (rfxAwardBackup) rfxAwardBackup.textContent = formatNumber(backup.length);
  if (rfxAwardRateware) rfxAwardRateware.textContent = formatNumber(ratewareRows.length);
  if (rfxAwardStatusPill) {
    rfxAwardStatusPill.textContent = primary.length ? `${formatNumber(primary.length)} primary` : "Decision room";
    rfxAwardStatusPill.className = `status-pill ${primary.length ? "success" : "muted"}`;
  }
  if (rfxCloseoutAwardsButton) {
    const pendingCloseout = primary.filter((item) => !item.rate_staging_id).length;
    rfxCloseoutAwardsButton.disabled = awardMutationRunning || !pendingCloseout || Boolean(awardPreflightIssues("closeout").length);
    rfxCloseoutAwardsButton.textContent = pendingCloseout
      ? `Approve ${formatNumber(pendingCloseout)} Rateware rate${pendingCloseout === 1 ? "" : "s"}`
      : "Approve Rateware rates";
  }
  renderAwardReadiness();
  updateAwardNoticeControls();
}

function renderDecisionScorecard(row, index, laneRows = []) {
  const decision = row.decision || procurementDecisionForBid(row, laneRows);
  const badges = row.decision_badges || decisionBadgesForBid(row, laneRows);
  const riskCopy = decision.risk_flags.length
    ? decision.risk_flags.slice(0, 3).join(" | ")
    : "No major validation gaps";
  const recommendation = decisionRecommendation(row, index + 1, laneRows);
  return `
    <article class="rfx-decision-card" data-score-tone="${decision.score >= 75 ? "strong" : decision.score >= 55 ? "medium" : "weak"}">
      <header>
        <span>${index === 0 ? "Recommended" : `Option #${index + 1}`}</span>
        <strong>${escapeHtml(decision.score)}/100</strong>
      </header>
      <h4>${escapeHtml(vendorLabel(row.invitation))}</h4>
      <p>${formatMoney(row.amount, row.currency)}${Number.isFinite(row.carrier_amount) && row.carrier_amount !== row.amount ? ` | carrier ${formatMoney(row.carrier_amount, row.currency)}` : ""} | ${escapeHtml(offerAvailabilitySummary(row.invitation))}</p>
      <div class="rfx-decision-badges">
        ${badges.map(decisionBadgeHtml).join("") || '<span class="rfx-decision-badge" data-tone="neutral">Needs review</span>'}
      </div>
      <div class="rfx-decision-breakdown">
        <span>Price <b>${escapeHtml(decision.price_score)}</b></span>
        <span>Capacity <b>${escapeHtml(decision.capacity_score)}</b></span>
        <span>Speed <b>${escapeHtml(decision.speed_score)}</b></span>
        <span>Validation <b>${escapeHtml(decision.validation_score)}</b></span>
      </div>
      <small>${escapeHtml(recommendation)}</small>
      <em>${escapeHtml(riskCopy)}</em>
    </article>
  `;
}

function renderAwardBoard() {
  updateAwardMetrics();
  if (!rfxAwardBoard && !rfxAwardNeedsDecision) return;
  const renderEmpty = (state) => {
    if (rfxAwardNeedsDecision) rfxAwardNeedsDecision.innerHTML = state;
    if (rfxAwardBoard) rfxAwardBoard.innerHTML = state;
  };
  if (!selectedEventId) {
    renderEmpty(stateBlock({
      tone: "neutral",
      eyebrow: "Award",
      title: "Select a bid event",
      detail: "Create or select a Bid Room event before awarding carrier bids."
    }));
    return;
  }
  const lanes = awardLaneRows();
  if (!lanes.length) {
    renderEmpty(stateBlock({
      tone: "neutral",
      eyebrow: "Award",
      title: "No live bids to award",
      detail: "Carrier bids submitted through the Private Bid Room will appear here by lane."
    }));
    return;
  }

  if (rfxAwardNeedsDecision) {
    rfxAwardNeedsDecision.innerHTML = lanes.map(({ lane, bids }) => {
      const primary = bids.find((row) => row.invitation.award_role === "primary");
      const backups = bids.filter((row) => row.invitation.award_role === "backup");
      const cheapest = [...bids].sort((a, b) => a.amount - b.amount)[0];
      const recommended = bids[0];
      return `
        <section class="rfx-award-lane rfx-award-lane-decision" data-rfx-award-lane-id="${escapeHtml(lane.id)}">
          <header>
            <div>
              <span class="status-pill ${primary ? "success" : "warning"}">${primary ? "Awarded" : "Needs decision"}</span>
              <strong>#${escapeHtml(lane.lane_number || "")} ${escapeHtml(laneRoute(lane))}</strong>
              <small title="${escapeHtml([lane.equipment, lane.trailer, lane.operation, lane.service].filter(Boolean).join(" / ") || "Lane")}">${escapeHtml([lane.equipment, lane.trailer, lane.operation, lane.service].filter(Boolean).join(" / ") || "Lane")}</small>
            </div>
            <div class="rfx-award-lane-summary">
              <span title="Highest procurement score">Recommended ${escapeHtml(vendorLabel(recommended.invitation))} (${recommended.decision.score}/100)</span>
              <span title="Lowest submitted all-in amount">Lowest ${formatMoney(cheapest.amount, cheapest.currency)}</span>
              <span title="Number of bids for this lane">${formatNumber(bids.length)} bid(s)</span>
              <span title="Backup decisions assigned">${formatNumber(backups.length)} backup(s)</span>
            </div>
          </header>
          <div class="rfx-decision-scorecards">
            ${bids.slice(0, 3).map((row, index) => renderDecisionScorecard(row, index, bids)).join("")}
          </div>
        </section>
      `;
    }).join("");
  }

  if (!rfxAwardBoard) return;
  rfxAwardBoard.innerHTML = lanes.map(({ lane, bids }) => {
    const primary = bids.find((row) => row.invitation.award_role === "primary");
    const backups = bids.filter((row) => row.invitation.award_role === "backup");
    const cheapest = [...bids].sort((a, b) => a.amount - b.amount)[0];
    return `
      <section class="rfx-award-lane rfx-award-lane-ranking" data-rfx-award-lane-id="${escapeHtml(lane.id)}">
        <header>
          <div>
            <span class="status-pill ${primary ? "success" : "warning"}">${primary ? "Awarded" : "Needs decision"}</span>
            <strong>#${escapeHtml(lane.lane_number || "")} ${escapeHtml(laneRoute(lane))}</strong>
            <small title="${escapeHtml([lane.equipment, lane.trailer, lane.operation, lane.service].filter(Boolean).join(" / ") || "Lane")}">${escapeHtml([lane.equipment, lane.trailer, lane.operation, lane.service].filter(Boolean).join(" / ") || "Lane")}</small>
          </div>
          <div class="rfx-award-lane-summary">
            <span title="Highest procurement score">Recommended ${escapeHtml(vendorLabel(bids[0].invitation))} (${bids[0].decision.score}/100)</span>
            <span title="Lowest submitted all-in amount">Lowest ${formatMoney(cheapest.amount, cheapest.currency)}</span>
            <span title="Number of carrier bids for this lane">${formatNumber(bids.length)} bid(s)</span>
            <span title="Backup decisions assigned">${formatNumber(backups.length)} backup(s)</span>
          </div>
        </header>
        <div class="table-wrap">
          <table class="rfx-award-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Carrier</th>
                <th>Score</th>
                <th>Badges</th>
                <th>All-in</th>
                <th>Commercial</th>
                <th>Availability</th>
                <th>Capacity</th>
                <th>Transit</th>
                <th>Role</th>
                <th>Reason</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${bids.map((row, index) => {
                const recommendedReason = decisionRecommendation(row, index + 1, bids);
                return `
                  <tr data-rfx-award-invitation-id="${escapeHtml(row.invitation.id)}">
                    <td>#${index + 1}</td>
                    <td><strong>${escapeHtml(vendorLabel(row.invitation))}</strong><small>${escapeHtml(row.invitation.vendors?.domain || row.invitation.vendors?.primary_email || "")}</small></td>
                    <td>
                      <span class="rfx-decision-score" data-score-tone="${row.decision.score >= 75 ? "strong" : row.decision.score >= 55 ? "medium" : "weak"}">${escapeHtml(row.decision.score)}</span>
                      <small title="${escapeHtml(row.decision.risk_flags.join(" | ") || "No major validation gaps")}">${escapeHtml(row.decision.risk_flags.length ? `${row.decision.risk_flags.length} risk flag(s)` : "clean")}</small>
                    </td>
                    <td><div class="rfx-decision-badges">${row.decision_badges.map(decisionBadgeHtml).join("")}</div></td>
                    <td>${formatMoney(row.amount, row.currency)}</td>
                    <td><small title="${escapeHtml(offerCommercialSummary(row.invitation))}">${escapeHtml(offerCommercialSummary(row.invitation))}</small></td>
                    <td><small title="${escapeHtml(offerAvailabilitySummary(row.invitation))}">${escapeHtml(offerAvailabilitySummary(row.invitation))}</small></td>
                    <td>${escapeHtml(row.invitation.weekly_capacity ?? "-")}</td>
                    <td>${escapeHtml(row.invitation.transit_days ?? "-")}</td>
                    <td>${awardRoleChip(row.invitation)}</td>
                    <td><small title="${escapeHtml(row.invitation.award_reason || recommendedReason || row.invitation.notes || awardReasonDefault(row, index + 1))}">${escapeHtml(row.invitation.award_reason || recommendedReason || row.invitation.notes || awardReasonDefault(row, index + 1))}</small></td>
                    <td>
                      <div class="compact-actions">
                        <button type="button" class="small-button" data-rfx-award-primary="${escapeHtml(row.invitation.id)}" data-award-default="${escapeHtml(recommendedReason)}" ${row.invitation.award_role === "primary" ? "disabled" : ""}>Award</button>
                        <button type="button" class="secondary small-button" data-rfx-award-backup="${escapeHtml(row.invitation.id)}" data-award-default="${escapeHtml(recommendedReason)}" ${row.invitation.award_role === "backup" ? "disabled" : ""}>Backup</button>
                        <button type="button" class="secondary small-button" data-rfx-clear-award="${escapeHtml(row.invitation.id)}" ${row.invitation.award_role ? "" : "disabled"}>Clear</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }).join("");
}

function laneRoute(lane) {
  return `${lane.origin || "-"} -> ${lane.destination || "-"}`;
}

function invitationStatusCounts(lanes = currentLanes) {
  const counts = {};
  lanes.forEach((lane) => {
    (lane.invitations || []).forEach((invitation) => {
      const status = commercialStatus(invitation.invitation_status);
      counts[status] = (counts[status] || 0) + 1;
    });
  });
  return counts;
}

function coverageRatio(lane) {
  const invitations = lane.invitations || [];
  const activeInvitations = invitations.filter((item) => item.invitation_status !== "archived");
  return Math.min(100, Math.round((activeInvitations.length / 3) * 100));
}

function responseRatio(lane) {
  const invitations = (lane.invitations || []).filter((item) => item.invitation_status !== "archived");
  if (!invitations.length) return 0;
  const bids = invitations.filter(hasBid).length;
  return Math.round((bids / invitations.length) * 100);
}

function activeInvitations(lane) {
  return (lane.invitations || []).filter((item) => item.invitation_status !== "archived");
}

function bidInvitations(lane) {
  return activeInvitations(lane).filter(hasBid);
}

function findInvitationTarget(invitationId, laneId = "") {
  const expectedInvitationId = String(invitationId || "");
  const expectedLaneId = String(laneId || "");
  for (const lane of currentLanes) {
    if (expectedLaneId && String(lane.id) !== expectedLaneId) continue;
    const invitation = activeInvitations(lane).find((row) => String(row.id) === expectedInvitationId);
    if (invitation) return { lane, invitation };
  }
  return null;
}

function newBidRoomCarrierMessageRequestKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `bid-room-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clearCarrierCommunicationTarget({ focus = false } = {}) {
  selectedChatRecipient = null;
  bidRoomCarrierMessageRequestKey = "";
  if (rfxChatThreadType) rfxChatThreadType.value = BID_ROOM_EVENT_THREAD_TYPE;
  renderBidRoomChatControls();
  if (focus) window.requestAnimationFrame(() => rfxChatMessage?.focus());
}

function openCarrierCommunication(invitationId, laneId = "") {
  const target = findInvitationTarget(invitationId, laneId);
  if (!target) {
    setStatus(rfxChatStatus, "Carrier context could not be found. Refresh this Bid Room and try again.", "error");
    return;
  }
  selectedChatRecipient = {
    invitationId: String(target.invitation.id),
    vendorId: String(target.invitation.vendor_id || ""),
    laneId: String(target.lane.id),
    carrier: vendorLabel(target.invitation),
    lane: laneRoute(target.lane)
  };
  if (!selectedChatRecipient.vendorId) {
    selectedChatRecipient = null;
    setStatus(rfxChatStatus, "This carrier has no CRM vendor record. Link the participant before opening a private thread.", "error");
    return;
  }
  if (rfxChatThreadType) rfxChatThreadType.value = "carrier_private";
  bidRoomCarrierMessageRequestKey = newBidRoomCarrierMessageRequestKey();
  activateRfxOperateWorkspace("communications", { focus: true });
  renderBidRoomChatControls();
  setStatus(rfxChatStatus, `Reply by email selected for ${selectedChatRecipient.carrier}. Rateware will continue the latest Gmail thread for this RFx when one exists; otherwise it will create a new email.`, "neutral");
}

function bestBidForLane(lane) {
  return bidInvitations(lane)
    .map((item) => {
      const economics = bidCommercialEconomics(item);
      return { ...item, numeric_bid: Number(economics.board_rate), carrier_bid_rate: economics.carrier_rate, board_rate: economics.board_rate };
    })
    .filter((item) => Number.isFinite(item.numeric_bid))
    .sort((a, b) => a.numeric_bid - b.numeric_bid)[0] || null;
}

function laneDecisionStatus(lane) {
  const invitations = activeInvitations(lane);
  const bids = bidInvitations(lane);
  if (!invitations.length) return "needs_shortlist";
  if (!invitations.some(hasInvitationStarted)) return "needs_invite";
  if (!bids.length) return "needs_response";
  return "has_bids";
}

function laneDecisionLabel(status) {
  const labels = {
    needs_shortlist: "Needs participants",
    needs_invite: "Needs invite",
    needs_response: "Needs response",
    has_bids: "Has bids",
    above_benchmark: "Above Rateware"
  };
  return labels[status] || "All";
}

function laneSearchText(lane) {
  return [
    lane.lane_number,
    lane.origin,
    lane.origin_city,
    lane.origin_state,
    lane.origin_market,
    lane.origin_region,
    lane.destination,
    lane.destination_city,
    lane.destination_state,
    lane.destination_market,
    lane.destination_region,
    lane.equipment,
    lane.trailer,
    lane.config,
    lane.operation,
    lane.service,
    lane.incumbent_vendor,
    ...(lane.invitations || []).map((invitation) => vendorLabel(invitation))
  ].filter(Boolean).join(" ").toLowerCase();
}

function laneMatchesFilter(lane) {
  const term = String(laneSearch?.value || "").trim().toLowerCase();
  if (term && !laneSearchText(lane).includes(term)) return false;
  const decision = laneDecisionStatus(lane);
  if (activeLaneFilter === "all") return true;
  if (activeLaneFilter === "above_benchmark") {
    const bid = bestBidForLane(lane);
    return Number.isFinite(Number(bid?.bid_delta)) && Number(bid.bid_delta) > 0;
  }
  return decision === activeLaneFilter;
}

function visibleLanes() {
  return currentLanes.filter(laneMatchesFilter);
}

function selectedVisibleLaneIds() {
  return visibleLanes()
    .filter((lane) => selectedLaneIds.has(lane.id))
    .map((lane) => lane.id)
    .filter(Boolean);
}

function selectedVisibleInvitationIds() {
  return visibleLanes()
    .flatMap((lane) => lane.invitations || [])
    .filter((invite) => selectedInvitationIds.has(invite.id))
    .map((invite) => invite.id)
    .filter(Boolean);
}

function eventStepState() {
  const activeLanes = currentLanes;
  const invitations = activeLanes.flatMap((lane) => activeInvitations(lane));
  const bids = activeLanes.flatMap((lane) => bidInvitations(lane));
  return {
    setup: Boolean(selectedEvent),
    lanes: activeLanes.length > 0,
    shortlist: activeLanes.some((lane) => activeInvitations(lane).length > 0),
    invite: invitations.some(hasInvitationStarted),
    responses: bids.length > 0,
    award: invitations.some((item) => item.invitation_status === "awarded") || selectedEvent?.status === "awarded"
  };
}

function renderEventFlow() {
  if (!eventFlow) return;
  const state = eventStepState();
  const steps = [
    ["setup", "Setup"],
    ["lanes", "Book"],
    ["shortlist", "Shortlist"],
    ["invite", "Invitations"],
    ["responses", "Live bids"],
    ["award", "Award"]
  ];
  eventFlow.innerHTML = steps.map(([key, label], index) => `
    <article class="${state[key] ? "is-complete" : ""}">
      <span>${index + 1}</span>
      <strong>${escapeHtml(label)}</strong>
    </article>
  `).join("");
}

function renderRfxOpsStrip() {
  if (!rfxOpsSubtitle || !rfxOpsHealth) return;
  renderOpsStageRail();
  renderOpsNextAction();
  renderBidRoomLaunchReadiness();
  if (!selectedEvent) {
    if (rfxOpsTitle) rfxOpsTitle.textContent = "Select or create a bid event";
    rfxOpsSubtitle.textContent = "One workflow: event setup, lane book, participants, outreach, auction, award.";
    rfxOpsHealth.innerHTML = `
      <article><span>Event</span><strong>-</strong><small>No bid event selected.</small></article>
      <article><span>Lanes</span><strong>0</strong><small>Paste or import the spot book.</small></article>
      <article><span>Invitations</span><strong>0</strong><small>No carrier targets yet.</small></article>
      <article><span>Live bids</span><strong>0</strong><small>No live bids yet.</small></article>
    `;
    return;
  }

  const activeInviteRows = currentLanes.flatMap((lane) => activeInvitations(lane));
  const bids = currentLanes.flatMap((lane) => bidInvitations(lane));
  const targets = outreachTargetInvitations();
  const readyTargets = targets.filter((target) => targetHasChannel(target, selectedOutreachChannel()));
  const lanesWithShortlist = currentLanes.filter((lane) => activeInvitations(lane).length).length;
  const lanesWithBids = currentLanes.filter((lane) => bidInvitations(lane).length).length;
  const due = selectedEvent.due_date ? `Due ${selectedEvent.due_date}` : "No due date";

  if (rfxOpsTitle) rfxOpsTitle.textContent = `${selectedEvent.rfx_id || "RFx"} procurement flow`;
  rfxOpsSubtitle.textContent = `${selectedEvent.name || "Selected event"} | ${selectedEvent.customer || "No customer"} | ${due}`;
  rfxOpsHealth.innerHTML = `
    <article data-tone="${selectedEvent.status === "open" ? "success" : "neutral"}">
      <span>Event</span>
      <strong>${escapeHtml(selectedEvent.status || "draft")}</strong>
      <small>${escapeHtml(due)}</small>
    </article>
    <article data-tone="${currentLanes.length ? "success" : "warning"}">
      <span>Lanes</span>
      <strong>${formatNumber(currentLanes.length)}</strong>
      <small>${formatNumber(lanesWithShortlist)} lane(s) with shortlist.</small>
    </article>
    <article data-tone="${readyTargets.length ? "success" : activeInviteRows.length ? "warning" : "neutral"}">
      <span>Invitations ready</span>
      <strong>${formatNumber(readyTargets.length)} / ${formatNumber(targets.length)}</strong>
      <small>${formatNumber(activeInviteRows.length)} active carrier target(s).</small>
    </article>
    <article data-tone="${bids.length ? "success" : "neutral"}">
      <span>Live bids</span>
      <strong>${formatNumber(bids.length)}</strong>
      <small>${formatNumber(lanesWithBids)} lane(s) with live bids.</small>
    </article>
  `;
}

function focusLane(laneId) {
  focusedLaneId = laneId || currentLanes[0]?.id || null;
  renderLanes();
}

function renderEventDashboard() {
  renderEventFlow();
  renderEventSetupState();
  renderParticipantSummary();
  renderRfxOpsStrip();
  renderProcessManager();
  if (!dashboardTitle && !eventDashboard && !inviteStatusMix) return;
  if (!selectedEvent) {
    if (dashboardTitle) dashboardTitle.textContent = "No event selected";
    if (copyRfxSummaryButton) copyRfxSummaryButton.disabled = true;
    if (eventDashboard) {
      eventDashboard.innerHTML = `
        <article>
          <span>Status</span>
          <strong>-</strong>
          <small>Select a bid event to see lane coverage, invitation status, and bid progress.</small>
        </article>
      `;
    }
    if (inviteStatusMix) inviteStatusMix.innerHTML = "";
    return;
  }

  const invitations = currentLanes.flatMap((lane) => lane.invitations || []);
  const activeInvitations = invitations.filter((item) => item.invitation_status !== "archived");
  const bids = activeInvitations.filter(hasBid);
  const lanesWithShortlist = currentLanes.filter((lane) => (lane.invitations || []).some((item) => item.invitation_status !== "archived")).length;
  const lanesWithBids = currentLanes.filter((lane) => (lane.invitations || []).some(hasBid)).length;
  const shortlistCoverage = currentLanes.length ? Math.round((lanesWithShortlist / currentLanes.length) * 100) : 0;
  const bidCoverage = currentLanes.length ? Math.round((lanesWithBids / currentLanes.length) * 100) : 0;
  const responseRate = activeInvitations.length ? Math.round((bids.length / activeInvitations.length) * 100) : 0;

  if (dashboardTitle) dashboardTitle.textContent = `${selectedEvent.rfx_id || "RFx"} | ${selectedEvent.name || "Selected event"}`;
  if (copyRfxSummaryButton) copyRfxSummaryButton.disabled = false;
  if (eventDashboard) {
    eventDashboard.innerHTML = `
      <article>
        <span>Status</span>
        <strong>${escapeHtml(selectedEvent.status || "draft")}</strong>
        <small>${escapeHtml([selectedEvent.customer, selectedEvent.due_date ? `Due ${selectedEvent.due_date}` : ""].filter(Boolean).join(" | ") || "No customer or due date")}</small>
        <a class="secondary-link small-button" href="${escapeHtml(marketplaceUrlForEvent(selectedEvent.id))}" target="_blank" rel="noreferrer">Public marketplace</a>
      </article>
      <article>
        <span>Lane coverage</span>
        <strong>${formatNumber(shortlistCoverage)}%</strong>
        <small>${formatNumber(lanesWithShortlist)} of ${formatNumber(currentLanes.length)} lanes have vendors shortlisted.</small>
      </article>
      <article>
        <span>Bid coverage</span>
        <strong>${formatNumber(bidCoverage)}%</strong>
        <small>${formatNumber(lanesWithBids)} lane(s) have at least one bid.</small>
      </article>
      <article>
        <span>Response rate</span>
        <strong>${formatNumber(responseRate)}%</strong>
        <small>${formatNumber(bids.length)} bid(s) from ${formatNumber(activeInvitations.length)} active invitation(s).</small>
      </article>
      <article>
        <span>Bid visibility</span>
        <strong>${escapeHtml(bidVisibilityLabel(selectedEvent.bid_visibility_mode))}</strong>
        <small>${selectedEvent.bid_visibility_mode === "open_leaderboard"
          ? "Carriers see named competitors and submitted rates."
          : selectedEvent.bid_visibility_mode === "private"
            ? "Carriers only see their own submitted offer."
            : "Carriers see anonymous rank and pricing signals."}</small>
      </article>
    `;
  }

  const counts = invitationStatusCounts();
  if (inviteStatusMix) {
    inviteStatusMix.innerHTML = Object.keys(counts).length
      ? Object.entries(counts).map(([status, count]) => `
        <span data-tone="${statusTone(status)}">${escapeHtml(statusLabel(status))} <strong>${formatNumber(count)}</strong></span>
      `).join("")
      : "<span>No vendors shortlisted yet.</span>";
  }
}

function chatVendorOptions() {
  const map = new Map();
  currentLanes.forEach((lane) => {
    (lane.invitations || []).forEach((invitation) => {
      const vendor = invitation.vendors || {};
      if (!invitation.vendor_id || map.has(invitation.vendor_id)) return;
      map.set(invitation.vendor_id, {
        id: invitation.vendor_id,
        label: vendor.vendor_name || vendor.domain || invitation.vendor_id
      });
    });
  });
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function chatMessages(thread = {}) {
  return Array.isArray(thread.messages) ? thread.messages : [];
}

function chatMessageTime(message = {}) {
  const time = new Date(String(message.created_at || ""));
  return Number.isNaN(time.getTime()) ? 0 : time.getTime();
}

function latestChatMessage(thread = {}) {
  const messages = chatMessages(thread);
  return messages.length ? messages[messages.length - 1] : null;
}

function messageFromGoogleChat(message = {}) {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  return metadata.source === "google_chat_inbound" || Boolean(message.google_chat_sender_name);
}

function messageText(message = {}) {
  return String(message.body || "").trim();
}

function threadText(thread = {}) {
  return chatMessages(thread).map(messageText).filter(Boolean).join("\n");
}

function extractFirstNumber(text = "") {
  const match = String(text).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function extractRateSignal(text = "") {
  const value = String(text || "");
  const match = value.match(/(?:\$|usd|mxn|cad|us\$|mx\$)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:usd|mxn|cad|dlls?|dollars?)/i);
  if (!match) return null;
  const raw = match[0];
  const amount = extractFirstNumber(raw);
  const currency = /mxn|mx\$|pesos?/i.test(raw) ? "MXN" : /cad|can\$/i.test(raw) ? "CAD" : "USD";
  return amount ? { amount, currency, raw } : null;
}

function extractCapacitySignal(text = "") {
  const value = String(text || "");
  const match = value.match(/(?:capacidad|capacity|available|disponible|tengo|puedo)\D{0,24}(\d{1,3})\s*(?:unidades|units|trucks|camiones|cajas|trailers|loads|viajes)?|(\d{1,3})\s*(?:unidades|units|trucks|camiones|cajas|trailers|loads|viajes)/i);
  const amount = match ? Number(match[1] || match[2]) : null;
  return Number.isFinite(amount) ? amount : null;
}

function extractTransitSignal(text = "") {
  const value = String(text || "");
  const match = value.match(/(?:transit|transito|tr[aá]nsito|delivery|entrega)\D{0,24}(\d{1,2})\s*(?:days|d[ií]as)|(\d{1,2})\s*(?:days|d[ií]as)\s*(?:transit|transito|tr[aá]nsito)?/i);
  const days = match ? Number(match[1] || match[2]) : null;
  return Number.isFinite(days) ? days : null;
}

function detectMessageIntent(message = {}) {
  const text = messageText(message);
  const lower = text.toLowerCase();
  const signals = [];
  const rate = extractRateSignal(text);
  const capacity = extractCapacitySignal(text);
  const transitDays = extractTransitSignal(text);
  if (/[?¿]/.test(text) || /\b(can you|could you|puedes|podrias|podr[ií]as|favor|confirm|confirma|duda|pregunta|question)\b/i.test(text)) {
    signals.push({ code: "question", label: "Question", tone: "warning", detail: "Carrier is asking for clarification." });
  }
  if (rate) {
    signals.push({ code: "price", label: "Price mentioned", tone: "success", detail: `${formatMoney(rate.amount, rate.currency)} detected.` });
  }
  if (capacity !== null) {
    signals.push({ code: "capacity", label: "Capacity", tone: "success", detail: `${capacity} unit(s) mentioned.` });
  }
  if (transitDays !== null || /\b(eta|pickup|pick up|recolecci[oó]n|delivery|entrega|disponible|available)\b/i.test(text)) {
    signals.push({ code: "eta", label: "ETA / availability", tone: "neutral", detail: transitDays !== null ? `${transitDays} transit day(s) detected.` : "ETA or availability language detected." });
  }
  if (/\b(no puedo|no contamos|not available|no availability|delay|retraso|problema|target|too low|insurance|seguro|cannot|can't|decline|declinar)\b/i.test(lower)) {
    signals.push({ code: "risk", label: "Risk", tone: "danger", detail: "Potential exception, rejection, or escalation language." });
  }
  return { signals, rate, capacity, transit_days: transitDays };
}

function analyzeCommunicationThread(thread = {}) {
  const messages = chatMessages(thread);
  const signalMap = new Map();
  let latestActionableMessage = null;
  let extracted = { rate: null, capacity: null, transit_days: null };
  for (const message of messages) {
    const analysis = detectMessageIntent(message);
    if (analysis.signals.length) latestActionableMessage = message;
    analysis.signals.forEach((signal) => {
      if (!signalMap.has(signal.code)) signalMap.set(signal.code, signal);
    });
    if (analysis.rate) extracted.rate = analysis.rate;
    if (analysis.capacity !== null) extracted.capacity = analysis.capacity;
    if (analysis.transit_days !== null) extracted.transit_days = analysis.transit_days;
  }
  const signals = [...signalMap.values()];
  return {
    signals,
    latest_actionable_message: latestActionableMessage,
    extracted,
    has_signals: signals.length > 0
  };
}

function signalToneClass(signal = {}) {
  if (signal.tone === "danger") return "danger";
  if (signal.tone === "warning") return "warning";
  if (signal.tone === "success") return "success";
  return "neutral";
}

function suggestedReplyForThread(thread = {}) {
  const analysis = analyzeCommunicationThread(thread);
  const vendor = thread.vendors?.vendor_name || thread.vendors?.domain || "team";
  const latest = latestChatMessage(thread);
  const body = latest?.body || "";
  const hasPrice = analysis.signals.some((signal) => signal.code === "price");
  const hasCapacity = analysis.signals.some((signal) => signal.code === "capacity");
  const hasRisk = analysis.signals.some((signal) => signal.code === "risk");
  if (hasRisk) {
    return `Hi ${vendor}, thanks for the update. Can you confirm the main constraint and whether there is any alternative option we should consider for this lane?`;
  }
  if (hasPrice || hasCapacity) {
    const parts = [];
    if (analysis.extracted.rate) parts.push(`rate ${formatMoney(analysis.extracted.rate.amount, analysis.extracted.rate.currency)}`);
    if (analysis.extracted.capacity !== null) parts.push(`capacity ${analysis.extracted.capacity}`);
    if (analysis.extracted.transit_days !== null) parts.push(`transit ${analysis.extracted.transit_days} day(s)`);
    return `Hi ${vendor}, thanks. We captured ${parts.join(", ") || "your update"}. Please confirm if this is all-in, the equipment is available, and the pickup/delivery ETA.`;
  }
  if (body.includes("?") || body.includes("¿")) {
    return `Hi ${vendor}, thanks for the question. We are reviewing it now and will confirm the lane requirement, service expectation, and next step shortly.`;
  }
  return `Hi ${vendor}, thanks for the update. We will review it against the bid room requirements and follow up with next steps.`;
}

function extractedBidUpdateText(thread = {}) {
  const analysis = analyzeCommunicationThread(thread);
  const lines = [`Bid update candidate - ${thread.title || thread.thread_type || "Bid Room thread"}`];
  if (analysis.extracted.rate) lines.push(`All-in candidate: ${formatMoney(analysis.extracted.rate.amount, analysis.extracted.rate.currency)}`);
  if (analysis.extracted.capacity !== null) lines.push(`Capacity candidate: ${analysis.extracted.capacity}`);
  if (analysis.extracted.transit_days !== null) lines.push(`Transit candidate: ${analysis.extracted.transit_days} day(s)`);
  lines.push(`Source message: ${messageText(analysis.latest_actionable_message || latestChatMessage(thread) || {}) || "-"}`);
  lines.push("Review before updating the bid. AI proposes, user confirms.");
  return lines.join("\n");
}

function hasBidUpdateSignal(analysis = {}) {
  const extracted = analysis.extracted || {};
  return Boolean(extracted.rate || extracted.capacity !== null || extracted.transit_days !== null);
}

function chatBidUpdateSourceMessage(thread = {}) {
  const analysis = analyzeCommunicationThread(thread);
  return analysis.latest_actionable_message || latestChatMessage(thread) || null;
}

function chatBidUpdateCandidates(thread = {}) {
  const laneId = String(thread.rfx_lane_id || "");
  const vendorId = String(thread.vendor_id || "");
  const rows = currentLanes.flatMap((lane) => activeInvitations(lane).map((invitation) => ({ lane, invitation })));
  const scoped = rows.filter(({ lane, invitation }) => {
    const laneMatches = !laneId || String(lane.id) === laneId;
    const vendorMatches = !vendorId || String(invitation.vendor_id) === vendorId;
    return laneMatches && vendorMatches;
  });
  return scoped.length ? scoped : rows;
}

function chatBidUpdateCandidateLabel(candidate) {
  if (!candidate) return "Select lane-carrier";
  const laneLabel = `#${candidate.lane.lane_number || ""} ${laneRoute(candidate.lane)}`.trim();
  return `${vendorLabel(candidate.invitation)} | ${laneLabel}`;
}

function selectedChatBidUpdateCandidate() {
  if (!pendingChatBidUpdate || !rfxChatBidUpdateInvitation) return null;
  return pendingChatBidUpdate.candidates.find((candidate) => String(candidate.invitation.id) === String(rfxChatBidUpdateInvitation.value)) || null;
}

function closeChatBidUpdateDrawer() {
  pendingChatBidUpdate = null;
  if (rfxChatBidUpdateDrawer) rfxChatBidUpdateDrawer.hidden = true;
  if (rfxChatBidUpdateStatus) rfxChatBidUpdateStatus.textContent = "";
}

function openChatBidUpdateDrawer(thread = {}) {
  if (!rfxChatBidUpdateDrawer || !rfxChatBidUpdateForm) return;
  const analysis = analyzeCommunicationThread(thread);
  const sourceMessage = chatBidUpdateSourceMessage(thread);
  const candidates = chatBidUpdateCandidates(thread);
  pendingChatBidUpdate = {
    thread,
    sourceMessage,
    candidates
  };
  if (rfxChatBidUpdateTitle) rfxChatBidUpdateTitle.textContent = thread.title || "Review bid update";
  if (rfxChatBidUpdateInvitation) {
    rfxChatBidUpdateInvitation.innerHTML = candidates.length
      ? candidates.map((candidate) => `
          <option value="${escapeHtml(candidate.invitation.id)}">${escapeHtml(chatBidUpdateCandidateLabel(candidate))}</option>
        `).join("")
      : '<option value="">No lane-carrier rows available</option>';
    const exactCandidate = candidates.find((candidate) => (
      (!thread.rfx_lane_id || String(candidate.lane.id) === String(thread.rfx_lane_id))
      && (!thread.vendor_id || String(candidate.invitation.vendor_id) === String(thread.vendor_id))
    )) || candidates[0];
    rfxChatBidUpdateInvitation.value = exactCandidate?.invitation?.id || "";
  }
  const selectedCandidate = selectedChatBidUpdateCandidate() || candidates[0];
  if (rfxChatBidUpdateRate) rfxChatBidUpdateRate.value = analysis.extracted.rate?.amount ?? "";
  if (rfxChatBidUpdateCurrency) rfxChatBidUpdateCurrency.value = analysis.extracted.rate?.currency || selectedCandidate?.invitation?.currency || selectedCandidate?.lane?.currency || "USD";
  if (rfxChatBidUpdateCapacity) rfxChatBidUpdateCapacity.value = analysis.extracted.capacity ?? "";
  if (rfxChatBidUpdateTransit) rfxChatBidUpdateTransit.value = analysis.extracted.transit_days ?? "";
  if (rfxChatBidUpdateNotes) {
    const currentNotes = selectedCandidate?.invitation?.notes || "";
    rfxChatBidUpdateNotes.value = currentNotes
      ? `${currentNotes}\nChat update: ${messageText(sourceMessage || {})}`.slice(0, 1200)
      : messageText(sourceMessage || "");
  }
  if (rfxChatBidUpdateSource) {
    rfxChatBidUpdateSource.textContent = messageText(sourceMessage || {}) || "No source message found.";
  }
  if (rfxChatBidUpdateApply) rfxChatBidUpdateApply.disabled = !candidates.length;
  rfxChatBidUpdateDrawer.hidden = false;
  setStatus(rfxChatBidUpdateStatus, "Review extracted values before applying. AI proposes, user confirms.", "neutral");
  rfxChatBidUpdateRate?.focus();
}

function communicationActionQueue(rows = []) {
  return sortedChatThreads(rows)
    .map((thread) => ({ thread, analysis: analyzeCommunicationThread(thread) }))
    .filter((item) => item.analysis.has_signals || threadNeedsReply(item.thread) || threadIsUnread(item.thread))
    .slice(0, 8);
}

function threadHasGoogleChatActivity(thread = {}) {
  return chatMessages(thread).some((message) => messageFromGoogleChat(message) || message.google_chat_sync_status === "synced");
}

function threadNeedsReply(thread = {}) {
  if (thread.needs_reply === true || thread.communication_status === "needs_reply") return true;
  if (thread.communication_status === "resolved") return false;
  const latest = latestChatMessage(thread);
  return latest?.sender_role === "carrier";
}

function threadIsUnread(thread = {}) {
  return thread.read_status === "unread";
}

function threadIsResolved(thread = {}) {
  return thread.communication_status === "resolved";
}

function threadHasCarrierMessage(thread = {}) {
  return chatMessages(thread).some((message) => message.sender_role === "carrier");
}

function threadLastActivityLabel(thread = {}) {
  const latest = latestChatMessage(thread);
  if (!latest?.created_at) return "No activity";
  return new Date(latest.created_at).toLocaleString();
}

function chatThreadPriority(thread = {}) {
  if (threadIsUnread(thread)) return 0;
  if (threadNeedsReply(thread)) return 0;
  if (threadIsResolved(thread)) return 5;
  return 3;
}

function eventGroupChatThreads(rows = []) {
  // Communications owns both the shared event conversation and private
  // carrier threads. Filtering happens in the inbox controls, not by scope.
  return rows.filter(Boolean);
}

function sortedChatThreads(rows = []) {
  return [...rows].sort((a, b) => {
    const priorityDelta = chatThreadPriority(a) - chatThreadPriority(b);
    if (priorityDelta) return priorityDelta;
    return chatMessageTime(latestChatMessage(b) || {}) - chatMessageTime(latestChatMessage(a) || {});
  });
}

function chatThreadMatchesFilter(thread = {}) {
  if (bidRoomChatFilter === "needs_reply") return threadNeedsReply(thread);
  if (bidRoomChatFilter === "carrier") return threadHasCarrierMessage(thread);
  if (bidRoomChatFilter === "google") return threadHasGoogleChatActivity(thread);
  if (bidRoomChatFilter === "unread") return threadIsUnread(thread);
  if (bidRoomChatFilter === "signals") return analyzeCommunicationThread(thread).has_signals;
  return true;
}

function chatStats(rows = []) {
  const messages = rows.flatMap((thread) => chatMessages(thread));
  const signalThreads = rows.filter((thread) => analyzeCommunicationThread(thread).has_signals).length;
  const priceSignals = rows.filter((thread) => analyzeCommunicationThread(thread).signals.some((signal) => signal.code === "price")).length;
  const riskSignals = rows.filter((thread) => analyzeCommunicationThread(thread).signals.some((signal) => signal.code === "risk")).length;
  const needsReply = rows.filter(threadNeedsReply).length;
  const unread = rows.filter(threadIsUnread).length;
  const resolved = rows.filter(threadIsResolved).length;
  const carrierMessages = messages.filter((message) => message.sender_role === "carrier").length;
  const googleMessages = messages.filter(messageFromGoogleChat).length;
  const syncErrors = messages.filter((message) => message.google_chat_sync_status === "error").length;
  return {
    threads: rows.length,
    needsReply,
    unread,
    resolved,
    signalThreads,
    priceSignals,
    riskSignals,
    carrierMessages,
    googleMessages,
    syncErrors,
    messages: messages.length
  };
}

function chatOpsSummary(rows = []) {
  const stats = chatStats(rows);
  const inbound = bidRoomChatThreads.google_chat_inbound || {};
  if (!selectedEventId) return "Select a bid event to load the communication queue.";
  if (!rows.length) return "No event group messages yet. Start the event thread so all Bid Room communication stays in one shared place.";
  if (inbound.status === "needs_reconnect") return "Google Chat is linked for outbound messages, but inbound replies require reconnecting Google Chat in Settings.";
  if (stats.syncErrors) return `${stats.syncErrors} Google Chat message(s) need retry. Refresh or use Settings > Retry Chat sync.`;
  if (stats.unread) return `${stats.unread} unread thread(s). Review new activity before awarding or sending follow-up invitations.`;
  if (stats.needsReply) return `${stats.needsReply} event thread(s) need a procurement reply.`;
  if (stats.signalThreads) return `${stats.signalThreads} thread(s) have detected commercial signals. Review price, capacity, ETA, and risk before awarding.`;
  if (stats.carrierMessages) return `${stats.carrierMessages} carrier message(s) captured. No open reply blocker detected.`;
  return "Communication queue is clean. Keep the event thread synced and monitor new carrier replies.";
}

function chatSummaryText(rows = []) {
  const stats = chatStats(rows);
  const urgent = sortedChatThreads(rows).filter(threadNeedsReply).slice(0, 5);
  return [
    `Bid Room communication summary${selectedEvent?.name ? ` - ${selectedEvent.name}` : ""}`,
    `Threads: ${stats.threads}`,
    `Unread: ${stats.unread}`,
    `Needs reply: ${stats.needsReply}`,
    `Resolved: ${stats.resolved}`,
    `Signal threads: ${stats.signalThreads}`,
    `Price signals: ${stats.priceSignals}`,
    `Risk signals: ${stats.riskSignals}`,
    `Carrier messages: ${stats.carrierMessages}`,
    `Google Chat inbound: ${stats.googleMessages}`,
    urgent.length ? "Priority threads:" : "Priority threads: none",
    ...urgent.map((thread) => `- ${thread.title || thread.thread_type}: ${latestChatMessage(thread)?.body || ""}`)
  ].join("\n");
}

function renderBidRoomChatControls() {
  const privateTarget = selectedChatRecipient?.vendorId ? selectedChatRecipient : null;
  if (rfxChatThreadType) {
    const privateOption = rfxChatThreadType.querySelector('option[value="carrier_private"]');
    if (privateOption) privateOption.disabled = !privateTarget;
    rfxChatThreadType.value = privateTarget ? "carrier_private" : BID_ROOM_EVENT_THREAD_TYPE;
  }
  if (rfxChatRecipientContext) rfxChatRecipientContext.hidden = !privateTarget;
  if (rfxChatComposeEmpty) rfxChatComposeEmpty.hidden = Boolean(privateTarget || selectedEventId);
  if (privateTarget) {
    if (rfxChatRecipientName) rfxChatRecipientName.textContent = privateTarget.carrier;
    if (rfxChatRecipientLane) rfxChatRecipientLane.textContent = privateTarget.lane;
    if (rfxChatMessage) rfxChatMessage.placeholder = `Write an email question to ${privateTarget.carrier}...`;
  } else if (rfxChatMessage) {
    rfxChatMessage.placeholder = "Write a message to the event group...";
  }
  if (rfxChatDeliveryHelp) {
    const details = privateTarget
      ? "This sends a Gmail reply for this carrier and RFx. Rateware uses the latest related thread when available; Google Chat and WhatsApp are not used."
      : "Internal notes stay in Rateware and mirror to the selected Google Chat thread when connected.";
    rfxChatDeliveryHelp.textContent = details;
    rfxChatDeliveryHelp.hidden = !privateTarget;
  }
  if (rfxChatSend) {
    rfxChatSend.textContent = privateTarget ? "Reply by email" : "Post internally";
  }
  if (rfxChatSend) rfxChatSend.disabled = !selectedEventId;
  if (rfxChatStartEventThread) rfxChatStartEventThread.disabled = !selectedEventId;
}

function renderBidRoomChat() {
  renderBidRoomChatControls();
  const rows = eventGroupChatThreads(Array.isArray(bidRoomChatThreads.rows) ? bidRoomChatThreads.rows : []);
  const stats = chatStats(rows);
  if (rfxChatSyncStatus) {
    const inboundStatus = bidRoomChatThreads.google_chat_inbound?.status || "";
    rfxChatSyncStatus.textContent = inboundStatus === "needs_reconnect"
      ? "Reconnect Google Chat"
      : bidRoomChatThreads.google_chat_configured
        ? "Google Chat linked"
        : "Google Chat not linked";
    rfxChatSyncStatus.className = `status-pill ${inboundStatus === "needs_reconnect" ? "warning" : bidRoomChatThreads.google_chat_configured ? "success" : "muted"}`;
  }
  if (rfxChatMetricThreads) rfxChatMetricThreads.textContent = formatNumber(stats.threads);
  if (rfxChatMetricNeedsReply) rfxChatMetricNeedsReply.textContent = formatNumber(stats.needsReply);
  if (rfxChatMetricCarrier) rfxChatMetricCarrier.textContent = formatNumber(stats.carrierMessages);
  if (rfxChatMetricGoogle) rfxChatMetricGoogle.textContent = formatNumber(stats.googleMessages);
  if (rfxChatAiSummary) {
    rfxChatAiSummary.textContent = chatOpsSummary(rows);
    rfxChatAiSummary.dataset.tone = stats.riskSignals ? "danger" : stats.needsReply || stats.signalThreads ? "warning" : bidRoomChatThreads.google_chat_inbound?.status === "needs_reconnect" ? "warning" : "neutral";
  }
  if (rfxChatSignalQueue) {
    const actionQueue = communicationActionQueue(rows);
    rfxChatSignalQueue.innerHTML = actionQueue.length ? actionQueue.map(({ thread, analysis }) => `
      <article>
        <div>
          <strong>${escapeHtml(thread.title || thread.thread_type || "Communication thread")}</strong>
          <span>${escapeHtml(analysis.signals.map((signal) => signal.label).join(" | ") || (threadNeedsReply(thread) ? "Needs reply" : "Unread"))}</span>
        </div>
        <div class="action-row compact-actions">
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="suggest_reply" data-thread-id="${escapeHtml(thread.id)}">Suggest reply</button>
          <button type="button" class="small-button" data-rfx-chat-thread-action="review_bid_update" data-thread-id="${escapeHtml(thread.id)}" ${hasBidUpdateSignal(analysis) ? "" : "disabled"}>Review update</button>
        </div>
      </article>
    `).join("") : "No communication signals detected yet.";
  }
  if (rfxChatInboxFilters) {
    rfxChatInboxFilters.querySelectorAll("[data-rfx-chat-filter]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.rfxChatFilter === bidRoomChatFilter);
    });
  }
  if (rfxChatCopySummary) rfxChatCopySummary.disabled = !selectedEventId || !rows.length;
  if (!rfxChatThreadList) return;
  if (!selectedEventId) {
    rfxChatThreadList.innerHTML = "Select a bid event to load chat threads.";
    return;
  }
  const visibleRows = sortedChatThreads(rows).filter(chatThreadMatchesFilter);
  if (!visibleRows.length) {
    rfxChatThreadList.innerHTML = `
      <div class="bid-room-empty">
        <strong>${rows.length ? "No threads match this filter." : "No chat messages yet."}</strong>
        <span>${rows.length ? "Change the inbox filter or refresh Google Chat sync." : "Start the event group thread to keep communication in one place."}</span>
      </div>
    `;
    return;
  }
  rfxChatThreadList.innerHTML = visibleRows.map((thread) => {
    const messages = Array.isArray(thread.messages) ? thread.messages : [];
    const latest = latestChatMessage(thread);
    const needsReply = threadNeedsReply(thread);
    const hasGoogleActivity = threadHasGoogleChatActivity(thread);
    const unread = threadIsUnread(thread);
    const resolved = threadIsResolved(thread);
    const intelligence = analyzeCommunicationThread(thread);
    return `
      <details class="bid-room-chat-thread${needsReply ? " needs-reply" : ""}${unread ? " is-unread" : ""}${resolved ? " is-resolved" : ""}" data-rfx-chat-thread-id="${escapeHtml(thread.id)}"${needsReply || unread ? " open" : ""}>
        <summary class="bid-room-chat-thread-summary">
        <div class="bid-room-chat-thread-summary-head">
          <div>
            <strong>${escapeHtml(thread.title || thread.thread_type)}</strong>
            <span>${escapeHtml(thread.thread_type || "thread")} | ${escapeHtml(threadLastActivityLabel(thread))}</span>
          </div>
          <div class="bid-room-chat-thread-badges">
            ${unread ? '<span class="status-pill neutral">Unread</span>' : ""}
            ${needsReply ? '<span class="status-pill warning">Needs reply</span>' : ""}
            ${resolved ? '<span class="status-pill success">Resolved</span>' : ""}
            ${hasGoogleActivity ? '<span class="status-pill success">Google</span>' : ""}
            <small>${messages.length} message(s)</small>
          </div>
        </div>
        ${latest ? `<p class="bid-room-chat-latest">${escapeHtml(latest.body || "")}</p>` : ""}
        </summary>
        <div class="bid-room-chat-thread-body">
        ${intelligence.signals.length ? `
          <div class="bid-room-chat-signals">
            ${intelligence.signals.map((signal) => `
              <span class="status-pill ${signalToneClass(signal)}" title="${escapeHtml(signal.detail)}">${escapeHtml(signal.label)}</span>
            `).join("")}
          </div>
        ` : ""}
        ${(thread.assigned_to || thread.internal_note) ? `
          <div class="bid-room-chat-meta">
            ${thread.assigned_to ? `<span>Owner: ${escapeHtml(thread.assigned_to)}</span>` : ""}
            ${thread.internal_note ? `<span title="${escapeHtml(thread.internal_note)}">Note: ${escapeHtml(thread.internal_note)}</span>` : ""}
          </div>
        ` : ""}
        <div class="bid-room-chat-thread-actions">
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="${unread ? "mark_read" : "mark_unread"}" data-thread-id="${escapeHtml(thread.id)}">${unread ? "Mark read" : "Mark unread"}</button>
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="mark_needs_reply" data-thread-id="${escapeHtml(thread.id)}">Needs reply</button>
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="${resolved ? "reopen" : "resolve"}" data-thread-id="${escapeHtml(thread.id)}">${resolved ? "Reopen" : "Resolve"}</button>
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="assign" data-thread-id="${escapeHtml(thread.id)}">Assign</button>
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="note" data-thread-id="${escapeHtml(thread.id)}">Note</button>
          <button type="button" class="secondary small-button" data-rfx-chat-thread-action="suggest_reply" data-thread-id="${escapeHtml(thread.id)}">Suggest reply</button>
          <button type="button" class="small-button" data-rfx-chat-thread-action="review_bid_update" data-thread-id="${escapeHtml(thread.id)}" ${hasBidUpdateSignal(intelligence) ? "" : "disabled"}>Review bid update</button>
        </div>
        <div class="bid-room-chat-messages">
          ${messages.slice(-8).map((message) => `
            <div class="bid-room-chat-message" data-role="${escapeHtml(message.sender_role || "procurement")}">
              <b>${escapeHtml(message.sender_name || message.sender_email || message.sender_role || "User")}</b>
              <p>${escapeHtml(message.body)}</p>
              <span>${escapeHtml(message.created_at ? new Date(message.created_at).toLocaleString() : "")}</span>
            </div>
          `).join("")}
        </div>
        </div>
      </details>
    `;
  }).join("");
}

function requestRfxEventResource(requestMap, eventId, loader, { force = false } = {}) {
  const key = String(eventId || "");
  if (!force && requestMap.has(key)) return requestMap.get(key);
  const promise = loader().finally(() => {
    if (requestMap.get(key) === promise) requestMap.delete(key);
  });
  requestMap.set(key, promise);
  return promise;
}

async function loadBidRoomChat({ force = false } = {}) {
  const loadVersion = ++bidRoomChatLoadVersion;
  const eventId = selectedEventId;
  if (!eventId) {
    bidRoomChatThreads = emptyBidRoomChatThreads();
    renderBidRoomChat();
    return;
  }
  try {
    const threads = await requestRfxEventResource(rfxChatRequests, eventId, () => fetchBidRoomChat(eventId), { force });
    if (loadVersion !== bidRoomChatLoadVersion || selectedEventId !== eventId) return;
    bidRoomChatThreads = threads || emptyBidRoomChatThreads();
    renderBidRoomChat();
  } catch (error) {
    if (loadVersion !== bidRoomChatLoadVersion || selectedEventId !== eventId) return;
    bidRoomChatThreads = emptyBidRoomChatThreads();
    renderBidRoomChat();
    setStatus(rfxChatStatus, humanizeError(error), "error");
  }
}

async function ensureSelectedEventChatThread(eventId, options = {}) {
  if (!eventId) return null;
  try {
    const result = await syncBidRoomEventThread(eventId, { force: options.force === true });
    if (selectedEventId === eventId) {
      await loadBidRoomChat({ force: true });
      if (!options.silent) {
        setStatus(
          rfxChatStatus,
          result.google_chat_configured
            ? "Event thread is ready in Google Chat."
            : "Event thread is ready in Rateware. Connect Google Chat and save a Space to mirror it.",
          result.google_chat_configured ? "success" : "warning"
        );
      }
    }
    return result;
  } catch (error) {
    if (!options.silent) setStatus(rfxChatStatus, humanizeError(error), "error");
    return null;
  }
}

function renderEventMasterPackageSummary() {
  const payload = selectedEvent?.rfx_master_package && typeof selectedEvent.rfx_master_package === "object"
    ? selectedEvent.rfx_master_package
    : {};
  const segments = Array.isArray(payload.segments) ? payload.segments : [];
  if (!segments.length) return "";
  return `
    <section class="rfx-event-master-package">
      <div class="bid-room-section-heading">
        <div>
          <p class="eyebrow">Master RFx package</p>
          <h3>${escapeHtml(payload.package_name || selectedEvent?.name || "Golden Bid Room card")}</h3>
        </div>
        <span class="status-pill warning">${escapeHtml(`${segments.length} segment(s)`)}</span>
      </div>
      <p>Carriers see this as one RFx package with route schedule and segment checklists. Use lane rows below only for shortlist, bids and award decisions.</p>
      <div class="rfx-event-segment-strip">
        ${segments.map((segment) => `
          <article>
            <strong>${escapeHtml(segment.segment_name || "General segment")}</strong>
            <span>${escapeHtml(`${segment.lane_count || 0} lane(s)`)}</span>
            <small>${escapeHtml([segment.operation, segment.service, segment.equipment, segment.trailer].filter(Boolean).join(" | ") || "Segment")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderLaneCoverage() {
  if (!laneCoverage && !coverageSummary) return;
  if (!selectedEventId) {
    if (coverageSummary) coverageSummary.textContent = "No event selected";
    if (laneCoverage) {
      laneCoverage.innerHTML = stateBlock({
        tone: "neutral",
        eyebrow: "Lane coverage",
        title: "Select a bid event",
        detail: "Choose or create an event to inspect lane coverage, shortlist depth, and bid response progress."
      });
    }
    return;
  }
  if (!currentLanes.length) {
    if (coverageSummary) coverageSummary.textContent = "No lanes";
    if (laneCoverage) {
      laneCoverage.innerHTML = stateBlock({
        tone: "neutral",
        eyebrow: "Lane coverage",
        title: "No lanes in this RFx yet",
        detail: "Paste the spot/RFx book above to create lanes, then shortlist carriers by lane."
      });
    }
    return;
  }

  const lanes = visibleLanes();
  const covered = currentLanes.filter((lane) => activeInvitations(lane).length).length;
  if (coverageSummary) coverageSummary.textContent = `${formatNumber(covered)} / ${formatNumber(currentLanes.length)} lanes covered`;
  if (!laneCoverage) return;
  if (!lanes.length) {
    laneCoverage.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Filtered coverage",
      title: "No lanes match this filter",
      detail: `No lanes currently match ${laneDecisionLabel(activeLaneFilter).toLowerCase()}. Change the lane filter to continue.`
    });
    return;
  }
  laneCoverage.innerHTML = `${renderEventMasterPackageSummary()}${lanes.map((lane) => {
    const invitations = activeInvitations(lane);
    const bids = bidInvitations(lane);
    const bestBid = bestBidForLane(lane);
    const coverage = coverageRatio(lane);
    const responses = responseRatio(lane);
    const tone = bids.length ? "success" : invitations.length ? "neutral" : "danger";
    return `
      <article class="rfx-coverage-card ${lane.id === focusedLaneId ? "is-active" : ""}" data-tone="${tone}">
        <button type="button" data-rfx-focus-lane="${escapeHtml(lane.id)}">
          <strong>#${escapeHtml(lane.lane_number || "")} ${escapeHtml(laneRoute(lane))}</strong>
          <span>${escapeHtml([lane.equipment, lane.trailer, lane.operation, lane.service].filter(Boolean).join(" / ") || "Lane")}</span>
        </button>
        <div class="coverage-meter" aria-label="Shortlist coverage">
          <span style="width: ${coverage}%"></span>
        </div>
        <small>${formatNumber(invitations.length)} vendors | ${formatNumber(bids.length)} bids | ${formatNumber(responses)}% response${bestBid ? ` | best ${formatMoney(bestBid.board_rate ?? bestBid.numeric_bid ?? bestBid.bid_rate, bestBid.currency || lane.currency)}` : ""}</small>
      </article>
    `;
  }).join("")}`;
}

function laneDetailSections(lane = {}) {
  return [
    ["Modelo logistico", lane.logistics_model],
    ["Criterios de operacion", lane.operation_criteria],
    ["Reglas de negocio", lane.business_rules],
    ["Especificaciones de servicio", lane.service_specifications],
    ["Perfil requerido del carrier", lane.carrier_requirements],
    ["Otras notas", lane.other_notes],
    ["Notas internas", lane.notes]
  ].filter(([, value]) => String(value || "").trim());
}

function renderLaneDecision() {
  if (!laneDecisionBody || !laneDecisionTitle || !laneDecisionStatusPill) return;
  const lane = currentLanes.find((item) => item.id === focusedLaneId) || visibleLanes()[0] || currentLanes[0];
  focusedLaneId = lane?.id || null;
  if (!lane) {
    laneDecisionTitle.textContent = "Select a lane";
    laneDecisionStatusPill.textContent = "No lane";
    laneDecisionStatusPill.className = "status-pill muted";
    laneDecisionBody.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Lane decision",
      title: "Select a lane",
      detail: "Pick a lane card or table row to compare Rateware benchmark, bids, spread, and shortlist status."
    });
    return;
  }

  const invitations = activeInvitations(lane);
  const bids = bidInvitations(lane);
  const bestBid = bestBidForLane(lane);
  const benchmark = lane.benchmark;
  const benchmarkAmount = Number(benchmark?.all_in_rate);
  const bestBidAmount = Number(bestBid?.board_rate ?? bestBid?.numeric_bid ?? bestBid?.bid_rate);
  const spread = bids.length
    ? Math.max(...bids.map((item) => Number(bidCommercialEconomics(item).board_rate)).filter(Number.isFinite)) - Math.min(...bids.map((item) => Number(bidCommercialEconomics(item).board_rate)).filter(Number.isFinite))
    : null;
  const decision = laneDecisionStatus(lane);
  laneDecisionTitle.textContent = `#${lane.lane_number || ""} ${laneRoute(lane)}`;
  laneDecisionStatusPill.textContent = laneDecisionLabel(decision);
  laneDecisionStatusPill.className = `status-pill ${decision === "has_bids" ? "success" : decision === "needs_shortlist" ? "danger" : "neutral"}`;
  laneDecisionBody.innerHTML = `
    <div class="rfx-decision-metrics">
      <article>
        <span>Rateware</span>
        <strong>${benchmark ? formatMoney(benchmark.all_in_rate, benchmark.currency) : "-"}</strong>
        <small>${escapeHtml(benchmark ? `${benchmark.vendor || "Benchmark"} | ${benchmark.score}% match` : "No benchmark")}</small>
      </article>
      <article>
        <span>Best bid</span>
        <strong>${bestBid ? formatMoney(bestBid.board_rate ?? bestBid.numeric_bid ?? bestBid.bid_rate, bestBid.currency || lane.currency) : "-"}</strong>
        <small>${escapeHtml(bestBid ? vendorLabel(bestBid) : "No response")}</small>
      </article>
      <article>
        <span>Bid vs Rateware</span>
        <strong>${Number.isFinite(bestBidAmount) && Number.isFinite(benchmarkAmount) ? formatMoney(bestBidAmount - benchmarkAmount, bestBid.currency || lane.currency) : "-"}</strong>
        <small>${Number.isFinite(bestBidAmount) && Number.isFinite(benchmarkAmount) && benchmarkAmount ? `${formatNumber(((bestBidAmount - benchmarkAmount) / benchmarkAmount) * 100, 1)}%` : "Pending"}</small>
      </article>
      <article>
        <span>Spread</span>
        <strong>${Number.isFinite(spread) ? formatMoney(spread, lane.currency) : "-"}</strong>
        <small>${formatNumber(bids.length)} bid(s)</small>
      </article>
    </div>
    <div class="rfx-lane-context">
      <span>${escapeHtml([lane.equipment, lane.trailer, lane.config].filter(Boolean).join(" / ") || "Equipment pending")}</span>
      <span>${escapeHtml([lane.operation, lane.service].filter(Boolean).join(" / ") || "Service pending")}</span>
      <span>${escapeHtml([lane.origin_market, lane.destination_market].filter(Boolean).join(" -> ") || "Market pending")}</span>
      <span>${escapeHtml([lane.weekly_volume ? `${lane.weekly_volume} / wk` : "", lane.target_rate ? `Target ${formatMoney(lane.target_rate, lane.currency)}` : ""].filter(Boolean).join(" | ") || "Volume pending")}</span>
    </div>
    <div class="rfx-lane-detail-sections">
      ${laneDetailSections(lane).length ? laneDetailSections(lane).map(([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <p>${escapeHtml(value)}</p>
        </article>
      `).join("") : `
        <article>
          <span>Lane details</span>
          <p>No detail notes captured yet. Use Step 2 manual entry or the RFx lane template to capture model, criteria, rules and service specs.</p>
        </article>
      `}
    </div>
    <div class="rfx-lane-shortlist">
      ${invitations.length ? invitations.map((invitation) => `
        <article>
          <strong>${escapeHtml(vendorLabel(invitation))}</strong>
          ${statusChip(invitation.invitation_status || "drafted")}
          <span>${escapeHtml([invitation.vendors?.base_stage, invitation.vendors?.primary_email || invitation.vendors?.whatsapp_phone].filter(Boolean).join(" | ") || "No contact")}</span>
          <small>${escapeHtml(invitation.notes || "No fit note")}</small>
        </article>
      `).join("") : "<article>No vendors shortlisted.</article>"}
    </div>
  `;
}

function responseBoardRows() {
  return visibleLanes()
    .flatMap((lane) => activeInvitations(lane).map((invitation) => ({ lane, invitation })))
    .filter(({ invitation }) => commercialStatus(invitation.invitation_status) !== "drafted" || hasBid(invitation))
    .map(({ lane, invitation }) => {
      const laneRows = bidInvitations(lane)
        .map((bidInvitation) => {
          const economics = bidCommercialEconomics(bidInvitation);
          return {
            lane,
            invitation: bidInvitation,
            amount: Number(economics.board_rate),
            carrier_amount: Number(economics.carrier_rate),
            currency: bidInvitation.currency || lane.currency || "USD"
          };
        })
        .filter((row) => Number.isFinite(row.amount));
      const currentRow = laneRows.find((row) => row.invitation.id === invitation.id);
      const decision = currentRow ? procurementDecisionForBid(currentRow, laneRows) : null;
      const badges = currentRow ? decisionBadgesForBid(currentRow, laneRows) : [];
      const eta = [
        invitation.eta_pickup ? `PU ${formatCompactDateTime(invitation.eta_pickup)}` : null,
        invitation.eta_delivery ? `DEL ${formatCompactDateTime(invitation.eta_delivery)}` : null
      ].filter(Boolean).join(" | ");
      const availability = invitation.equipment_available === true
        ? "Available"
        : invitation.equipment_available === false
          ? "Not available"
          : "Pending";
      return {
        lane,
        invitation,
        currentRow,
        decision,
        badges,
        eta,
        availability,
        bidSource: manualBidSourceLabel(invitation.response_source),
        actionLabel: hasBid(invitation) ? "Edit bid" : "Manual bid"
      };
    })
    .sort((left, right) => Number(hasBid(right.invitation)) - Number(hasBid(left.invitation)));
}

function responseColumnValues(row, field) {
  const { lane, invitation, currentRow, decision, eta, availability, bidSource } = row;
  const bid = currentRow
    ? formatMoney(currentRow.carrier_amount, currentRow.currency)
    : invitation.bid_rate !== null
      ? formatMoney(invitation.bid_rate, invitation.currency || lane.currency)
      : "No bid";
  const values = {
    carrier: [vendorLabel(invitation)],
    lane: [`#${lane.lane_number || ""} ${laneRoute(lane)}`.trim()],
    status: [invitation.invitation_status || "drafted"],
    score: [decision ? String(decision.score) : "Unscored"],
    bid: [bid],
    commercial: [offerCommercialSummary(invitation)],
    availability: [availability],
    capacity: [invitation.weekly_capacity ?? "Unspecified"],
    eta: [eta || "Not confirmed"],
    valid_through: [validThroughLabel(invitation.valid_through)],
    transit: [invitation.transit_days ?? "Unspecified"],
    source: [bidSource]
  };
  return (values[field] || []).filter((value) => value !== null && value !== undefined && String(value).trim() !== "");
}

function initResponseColumnFilters() {
  if (responseColumnFilters || !responseBody) return;
  const responseTable = responseBody.closest("table");
  responseColumnFilters = initSpreadsheetColumnFilters({
    table: responseTable,
    columns: [
      { key: "action", label: "Action", filterable: false },
      { key: "carrier", label: "Carrier" },
      { key: "lane", label: "Lane" },
      { key: "status", label: "Status" },
      { key: "score", label: "Score" },
      { key: "bid", label: "Bid" },
      { key: "commercial", label: "Commercial" },
      { key: "availability", label: "Availability" },
      { key: "capacity", label: "Capacity" },
      { key: "eta", label: "ETA" },
      { key: "valid_through", label: "Valid through" },
      { key: "transit", label: "Transit" },
      { key: "source", label: "Source" }
    ],
    getRows: () => responseBoardRowsCache,
    getValues: responseColumnValues,
    scope: "rfxresponse",
    storageKey: "rateware:bid-room:carrier-bids:column-filters:v3",
    mode: "inline",
    onChange: renderResponseBoard
  });
}

function renderResponseBoard() {
  if (!responseBody || !responseSummary) return;
  const allRows = responseBoardRows();
  responseBoardRowsCache = allRows;
  const rows = responseColumnFilters?.apply(allRows) || allRows;
  const bidRows = rows.filter(({ invitation }) => hasBid(invitation));
  responseSummary.textContent = rows.length === allRows.length
    ? `${formatNumber(bidRows.length)} bids / ${formatNumber(rows.length)} active rows`
    : `${formatNumber(bidRows.length)} bids / ${formatNumber(rows.length)} shown of ${formatNumber(allRows.length)} active rows`;
  if (!rows.length) {
    responseBody.innerHTML = `<tr><td colspan="13">No carrier responses match these column filters.</td></tr>`;
    return;
  }
  responseBody.innerHTML = rows.map(({ lane, invitation, currentRow, decision, badges, eta, availability, bidSource, actionLabel }) => {
    return `
      <tr data-rfx-lane-id="${escapeHtml(lane.id)}">
        <td class="rfx-response-actions">
          <div class="rfx-response-action-stack">
            <button type="button" class="secondary small-button" data-rfx-manual-bid="${escapeHtml(invitation.id)}" data-rfx-manual-bid-lane="${escapeHtml(lane.id)}" title="Record or correct a quote received outside the Bid Room">${actionLabel}</button>
            <button type="button" class="secondary small-button" data-rfx-ask-carrier="${escapeHtml(invitation.id)}" data-rfx-ask-carrier-lane="${escapeHtml(lane.id)}" title="Reply in this carrier's latest Gmail thread for this RFx">Reply by email</button>
          </div>
        </td>
        <td><strong>${escapeHtml(vendorLabel(invitation))}</strong><small>${escapeHtml(invitation.vendors?.primary_email || invitation.vendors?.domain || "")}</small></td>
        <td>#${escapeHtml(lane.lane_number || "")} ${escapeHtml(laneRoute(lane))}</td>
        <td>${statusChip(invitation.invitation_status || "drafted")}</td>
        <td>
          ${decision ? `<span class="rfx-decision-score" data-score-tone="${decision.score >= 75 ? "strong" : decision.score >= 55 ? "medium" : "weak"}">${escapeHtml(decision.score)}</span>` : "-"}
          <small>${badges.slice(0, 2).map((badge) => badge.label).join(" | ")}</small>
        </td>
        <td>${currentRow ? formatMoney(currentRow.carrier_amount, currentRow.currency) : invitation.bid_rate !== null ? formatMoney(invitation.bid_rate, invitation.currency || lane.currency) : "-"}</td>
        <td><small>${escapeHtml(offerCommercialSummary(invitation))}</small></td>
        <td><small>${escapeHtml(availability)}</small></td>
        <td>${escapeHtml(invitation.weekly_capacity ?? "-")}</td>
        <td><small>${escapeHtml(eta || "-")}</small></td>
        <td>${escapeHtml(validThroughLabel(invitation.valid_through))}</td>
        <td>${escapeHtml(invitation.transit_days ?? "-")}</td>
        <td><span class="rfx-response-source" title="${escapeHtml(invitation.response_source || "Not submitted")}">${escapeHtml(bidSource)}</span></td>
      </tr>
    `;
  }).join("");
}

function renderTouchpoints() {
  // Invitation tracking was removed from Step 4. Draft Queue is the source of truth
  // for searching, selecting, resending, archiving, and deleting outreach drafts.
}

function messageRecipient(message) {
  if (message.channel === "email") return message.recipient_email || message.vendors?.primary_email || "";
  if (message.channel === "whatsapp_group") {
    return message.vendor_whatsapp_groups?.group_name
      || message.vendors?.whatsapp_group_name
      || message.vendor_whatsapp_groups?.group_url
      || message.vendors?.whatsapp_group_url
      || "Vendor WhatsApp group";
  }
  return message.normalized_recipient_phone || message.recipient_phone || message.vendors?.whatsapp_phone || "";
}

function draftPrimaryTarget(message = {}) {
  const invitationIds = outreachMessageInvitationIds(message);
  if (!invitationIds.size) return null;
  return outreachTargetInvitations().find((target) => invitationIds.has(String(target.invitation?.id || ""))) || null;
}

function draftMatchesCurrentLaneTable(message = {}, target = draftPrimaryTarget(message)) {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const storedSignature = String(metadata.lane_table_signature || "").trim();
  if (!storedSignature) return false;
  const currentSignature = targetLaneTableSignature(target);
  return Boolean(currentSignature && storedSignature === currentSignature);
}

function isStaleOutreachDraft(message = {}) {
  const status = String(message.status || "").toLowerCase();
  if (status === "archived" || status === "sent" || status === "replied") return false;
  const target = draftPrimaryTarget(message);
  return Boolean(target && !draftMatchesCurrentLaneTable(message, target));
}

function selectableEmailDrafts(rows = []) {
  return rows.filter((message) => {
    const status = String(message.status || "").toLowerCase();
    return message.channel === "email" && Boolean(message.recipient_email) && ["drafted", "queued", "failed"].includes(status) && !isStaleOutreachDraft(message);
  });
}

function selectableWhatsappDrafts(rows = []) {
  return rows.filter((message) => {
    const status = String(message.status || "").toLowerCase();
    return message.channel === "whatsapp"
      && Boolean(message.normalized_recipient_phone || message.recipient_phone || message.vendors?.whatsapp_phone)
      && ["drafted", "queued", "failed"].includes(status)
      && !isStaleOutreachDraft(message);
  });
}

function whatsappDraftStatusDetail(message = {}, templateStatus = "") {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const raw = String(
    metadata.whatsapp_template_error
      || metadata.whatsapp_last_error
      || message.delivery_error
      || ""
  ).trim();
  if (/message_templates|Tried accessing nonexistent field|WABA ID belongs|Business Management|Unsupported get request|OAuthException|permission/i.test(raw)) {
    return "Meta cannot read the WhatsApp template catalog for this sender. Confirm the WABA ID, token permissions, and WhatsApp Business Management access, then regenerate or send again.";
  }
  if (/not approved|pending Meta approval|template is pending|template is in review|in review|pending review|under review|Sync Meta templates/i.test(raw)) {
    return "Meta notifier is still under Meta review. Direct WhatsApp sends unlock after approval; Rateware will refresh it automatically when you generate or send the queue.";
  }
  if (/compatible Meta translation|compatible language|translation.*available|language mismatch/i.test(raw)) {
    return "No approved Meta translation matches this Outreach language. Add or approve that language in Meta, then sync templates.";
  }
  if (/not been verified|not found in this sender|not synced/i.test(raw)) {
    return "Rateware has not verified this notifier in the current sender's Meta catalog. Sync templates or regenerate the queue before sending.";
  }
  if (/template mapping|Meta template|message template/i.test(raw)) {
    return "This draft needs the compact Meta notifier. Generate the draft queue or send again so Rateware can create or refresh it automatically.";
  }
  if (raw) return humanizeError(raw);
  const status = String(templateStatus || "").toUpperCase();
  if (status === "ERROR") return "Meta notifier needs attention. Regenerate the draft queue or open Settings > WhatsApp Business to test the line.";
  if (metaNotifierPendingReview(status)) return `Meta notifier is ${metaNotifierStatusLabel(status)} at Meta. Direct WhatsApp sends unlock after approval.`;
  if (status === "LANGUAGE_MISMATCH") return "No approved Meta translation matches this Outreach language. Add or approve it in Meta, then sync templates.";
  if (["NOT_SYNCED", "NOT_FOUND"].includes(status)) return "Rateware has not verified this notifier in the current sender's Meta catalog.";
  if (status === "NOT_PUBLISHED") return "Meta notifier has not been published yet. Generate the draft queue or send again to create it automatically.";
  return "";
}

function selectableWhatsappGroupDrafts(rows = []) {
  return rows.filter((message) => {
    const status = String(message.status || "").toLowerCase();
    return message.channel === "whatsapp_group" && ["drafted", "queued", "failed"].includes(status) && !isStaleOutreachDraft(message);
  });
}

function draftRowsForEvent() {
  return selectedEventId
    ? outreachMessages.filter((message) => message.rfx_event_id === selectedEventId)
    : [];
}

function normalizeOutreachQueueChannel(channel) {
  const normalized = String(channel || "email").trim().toLowerCase();
  if (normalized === "whatsapp") return "whatsapp";
  if (normalized === "whatsapp_group") return "whatsapp_group";
  return "email";
}

function selectedOutreachChannel() {
  return normalizeOutreachQueueChannel(rfxOutreachChannel?.value);
}

function syncOutreachChannelUi() {
  const channel = selectedOutreachChannel();
  if (rfxWhatsappTargetMode) {
    rfxWhatsappTargetMode.value = channel === "whatsapp_group" ? "vendor_group" : "direct_vendor";
    rfxWhatsappTargetMode.disabled = true;
  }
  if (rfxWhatsappTargetModeField) rfxWhatsappTargetModeField.hidden = true;
  document.querySelectorAll("[data-rfx-draft-action-channel]").forEach((button) => {
    button.hidden = button.dataset.rfxDraftActionChannel !== channel;
  });
}

function selectedChannelUsesDirectWhatsapp() {
  return outreachDraftChannels(selectedOutreachChannel()).includes("whatsapp");
}

async function loadWhatsappConnectionReadiness({ render = true } = {}) {
  try {
    const data = await fetchWhatsappConnections();
    const row = data?.rows?.[0] || {};
    const ready = row.status === "connected" && row.connection_validated === true;
    whatsappConnectionReadiness = {
      loaded: true,
      ready,
      message: ready
        ? `WhatsApp Business verified${row.display_phone_number ? ` for ${row.display_phone_number}` : ""}.`
        : row.credentials_configured
          ? "Run Test line in Settings to verify the token, Phone Number ID and WABA before sending."
          : "Connect WhatsApp Business in Settings before sending."
    };
  } catch (error) {
    whatsappConnectionReadiness = {
      loaded: true,
      ready: false,
      message: `WhatsApp Business readiness could not be verified. ${humanizeError(error)}`
    };
  }
  if (render) renderOutreachLaunchpad();
  return whatsappConnectionReadiness;
}

function clearDraftQueueSelection() {
  selectedDraftMessageIds.clear();
  selectedDraftMessageRows.clear();
}

function resetDraftQueue({ clearSelection = false } = {}) {
  draftQueueRows = [];
  draftQueueTotal = 0;
  draftQueueOffset = 0;
  draftQueueLoading = false;
  draftQueueTrackingSummary = { total: 0, states: {} };
  draftQueueTrackingScopeKey = "";
  if (clearSelection) clearDraftQueueSelection();
}

function rememberDraftRow(message) {
  const id = String(message?.id || "");
  if (!id) return;
  selectedDraftMessageIds.add(id);
  selectedDraftMessageRows.set(id, message);
}

function forgetDraftRow(id) {
  const normalizedId = String(id || "");
  selectedDraftMessageIds.delete(normalizedId);
  selectedDraftMessageRows.delete(normalizedId);
}

function findDraftRow(id) {
  const normalizedId = String(id || "");
  if (!normalizedId) return null;
  return selectedDraftMessageRows.get(normalizedId)
    || draftQueueRows.find((message) => String(message.id) === normalizedId)
    || outreachMessages.find((message) => String(message.id) === normalizedId)
    || null;
}

function draftTrackingScopeKey(eventId = selectedEventId) {
  return `${eventId || ""}|${outreachDraftChannels(selectedOutreachChannel()).join(",")}`;
}

function normalizeDraftTrackingStatus(value = "all") {
  const normalized = String(value || "all").toLowerCase();
  return DRAFT_TRACKING_STATES.some(([status]) => status === normalized) ? normalized : "all";
}

function draftTrackingCount(status) {
  if (status === "all") {
    return DRAFT_TRACKING_STATES
      .filter(([state]) => !["all", "archived"].includes(state))
      .reduce((total, [state]) => total + Number(draftQueueTrackingSummary.states?.[state] || 0), 0);
  }
  return Number(draftQueueTrackingSummary.states?.[status] || 0);
}

function renderDraftTrackingFilters() {
  if (!draftTrackingFilters) return;
  draftTrackingFilters.innerHTML = `
    <span class="rfx-draft-tracking-label">Lifecycle</span>
    ${DRAFT_TRACKING_STATES.map(([status, label]) => `
      <button type="button" data-rfx-draft-tracking="${status}" class="${draftQueueTrackingStatus === status ? "is-active" : ""}" aria-pressed="${draftQueueTrackingStatus === status}">
        ${escapeHtml(label)} <span>${formatNumber(draftTrackingCount(status))}</span>
      </button>
    `).join("")}
  `;
}

async function loadDraftQueueTrackingSummary(eventId = selectedEventId, { force = false } = {}) {
  if (!eventId) {
    draftQueueTrackingSummary = { total: 0, states: {} };
    draftQueueTrackingScopeKey = "";
    renderDraftTrackingFilters();
    return;
  }
  const scopeKey = draftTrackingScopeKey(eventId);
  if (draftQueueTrackingRequest?.key === scopeKey) return draftQueueTrackingRequest.promise;
  if (!force && draftQueueTrackingScopeKey === scopeKey && !draftQueueTrackingLoading) return;

  const promise = loadDraftQueueTrackingSummaryRequest(eventId, scopeKey);
  draftQueueTrackingRequest = { key: scopeKey, promise };
  try {
    return await promise;
  } finally {
    if (draftQueueTrackingRequest?.promise === promise) draftQueueTrackingRequest = null;
  }
}

async function loadDraftQueueTrackingSummaryRequest(eventId, scopeKey) {
  const loadVersion = ++draftQueueTrackingLoadVersion;
  if (draftQueueTrackingScopeKey !== scopeKey) {
    draftQueueTrackingSummary = { total: 0, states: {} };
  }
  draftQueueTrackingLoading = true;
  renderDraftTrackingFilters();
  try {
    const result = await fetchOutreachTrackingSummary({
      rfx_event_id: eventId,
      channels: outreachDraftChannels(selectedOutreachChannel()),
      include_archived: true
    });
    if (loadVersion !== draftQueueTrackingLoadVersion || selectedEventId !== eventId || draftTrackingScopeKey(eventId) !== scopeKey) return;
    draftQueueTrackingSummary = {
      total: Number(result?.total || 0),
      states: result?.states || {}
    };
    draftQueueTrackingScopeKey = scopeKey;
  } catch (error) {
    if (loadVersion === draftQueueTrackingLoadVersion && selectedEventId === eventId && draftTrackingScopeKey(eventId) === scopeKey) {
      setStatus(rfxOutreachStatus, `Lifecycle counts could not load. ${humanizeError(error)}`, "warning");
    }
  } finally {
    if (loadVersion === draftQueueTrackingLoadVersion) {
      draftQueueTrackingLoading = false;
      renderDraftTrackingFilters();
    }
  }
}

function draftQueuePageQuery(eventId) {
  return {
    rfx_event_id: eventId,
    channels: outreachDraftChannels(selectedOutreachChannel()),
    search: draftQueueSearch,
    tracking_status: draftQueueTrackingStatus,
    ...(draftQueueTrackingStatus === "archived" ? { status: "archived", include_archived: true } : {}),
    offset: draftQueueOffset,
    limit: draftQueuePageSize
  };
}

async function loadDraftQueuePage(eventId = selectedEventId, options = {}) {
  const { reset = false, render = true, refreshTracking = false, force = false } = options;
  if (!eventId) {
    resetDraftQueue();
    if (render) renderDraftQueue();
    return;
  }
  if (reset) draftQueueOffset = 0;
  const query = draftQueuePageQuery(eventId);
  const requestKey = JSON.stringify(query);
  if (!force && !refreshTracking && draftQueueLoadRequest?.key === requestKey) {
    return draftQueueLoadRequest.promise;
  }

  const promise = loadDraftQueuePageRequest(eventId, { render, refreshTracking, query });
  draftQueueLoadRequest = { key: requestKey, promise };
  try {
    return await promise;
  } finally {
    if (draftQueueLoadRequest?.promise === promise) draftQueueLoadRequest = null;
  }
}

async function loadDraftQueuePageRequest(eventId, { render, refreshTracking, query }) {
  if (refreshTracking) void loadDraftQueueTrackingSummary(eventId, { force: true });
  const loadVersion = ++draftQueueLoadVersion;
  draftQueueLoading = true;
  if (render) renderDraftQueue();
  try {
    const result = await fetchOutreachMessagesPage(query);
    if (loadVersion !== draftQueueLoadVersion || selectedEventId !== eventId) return;
    draftQueueRows = result.rows || [];
    draftQueueTotal = Number(result.total || 0);
    draftQueueOffset = Number(result.offset || 0);
    if (!draftQueueRows.length && draftQueueTotal && draftQueueOffset >= draftQueueTotal) {
      draftQueueOffset = Math.max(0, Math.floor((draftQueueTotal - 1) / draftQueuePageSize) * draftQueuePageSize);
      persistRfxWorkspaceContext();
      return await loadDraftQueuePage(eventId, { render, force: true });
    }
  } catch (error) {
    if (loadVersion !== draftQueueLoadVersion || selectedEventId !== eventId) return;
    draftQueueRows = [];
    draftQueueTotal = 0;
    setStatus(rfxOutreachStatus, `Draft queue could not load. ${humanizeError(error)}`, "error");
  } finally {
    if (loadVersion === draftQueueLoadVersion) {
      draftQueueLoading = false;
      if (render) renderDraftQueue();
    }
  }
}

function normalizeDraftSearch(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function outreachTrackingState(message = {}) {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const invitation = Array.isArray(message.rfx_lane_vendors) ? message.rfx_lane_vendors[0] || {} : message.rfx_lane_vendors || {};
  const invitationStatus = String(invitation.invitation_status || "").toLowerCase();
  const bidRate = Number(invitation.bid_rate);
  if (["quoted", "bid_submitted", "awarded", "award_pending"].includes(invitationStatus) || Number.isFinite(bidRate)) return "quoted";
  const signal = [
    message.status,
    message.provider_response_status,
    message.delivery_error,
    metadata.delivery_status,
    metadata.provider_response_status,
    metadata.last_event
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  if (/archived/.test(signal)) return "archived";
  if (/suppressed|do_not_contact|do-not-contact|blocked contact/.test(signal)) return "suppressed";
  if (/bounc|mailer-daemon|undeliverable/.test(signal)) return "bounced";
  if (/failed|error|rejected/.test(signal)) return "failed";
  if (["replied", "responded"].includes(invitationStatus) || invitation.responded_at || /replied|responded/.test(signal)) return "replied";
  if (/manual_sent/.test(signal)) return "manual_sent";
  if (/delivery_unknown/.test(signal)) return "delivery_unknown";
  if (/read/.test(signal)) return "read";
  if (/delivered/.test(signal)) return "delivered";
  if (/sending/.test(signal)) return "sending";
  if (/queued/.test(signal)) return "queued";
  if (/sent|accepted/.test(signal)) return "sent";
  return "drafted";
}

function trackingStatusTone(status) {
  if (["quoted", "read", "delivered", "sent", "manual_sent"].includes(status)) return "success";
  if (["sending", "delivery_unknown", "suppressed"].includes(status)) return "warning";
  if (["failed", "bounced"].includes(status)) return "danger";
  if (status === "archived") return "muted";
  if (status === "replied") return "warning";
  return "neutral";
}

function selectedDraftRows(rows = null) {
  const source = rows || draftQueueRows;
  return source.filter((message) => selectedDraftMessageIds.has(String(message.id)));
}

function selectedSendableDraftIds(rows = null) {
  return selectableEmailDrafts(selectedDraftRows(rows)).map((message) => String(message.id));
}

function selectedWhatsappDraftIds(rows = null) {
  return selectableWhatsappDrafts(selectedDraftRows(rows)).map((message) => String(message.id));
}

function selectedWhatsappGroupDraftIds(rows = null) {
  return selectableWhatsappGroupDrafts(selectedDraftRows(rows)).map((message) => String(message.id));
}

function refreshableOutreachDrafts(rows = []) {
  return rows.filter((message) => {
    const status = String(message.status || "").toLowerCase();
    return status !== "archived"
      && Boolean(String(message.campaign_id || "").trim())
      && outreachMessageInvitationIds(message).size > 0;
  });
}

function selectedRefreshableDraftRows(rows = null) {
  return refreshableOutreachDrafts(selectedDraftRows(rows));
}

function outreachMessageInvitationIds(message = {}) {
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
  const ids = Array.isArray(metadata.rfx_lane_vendor_ids)
    ? metadata.rfx_lane_vendor_ids.map(String).filter(Boolean)
    : [];
  if (message.rfx_lane_vendor_id) ids.push(String(message.rfx_lane_vendor_id));
  return new Set(ids);
}

function outreachDraftChannels(channel) {
  const normalized = String(channel || "email").trim().toLowerCase();
  if (normalized === "email" || normalized === "gmail" || normalized === "gmail_only") return ["email"];
  if (normalized === "whatsapp") return ["whatsapp"];
  if (normalized === "whatsapp_group") return ["whatsapp_group"];
  if (normalized === "multi" || normalized === "email_whatsapp" || normalized === "email+whatsapp") return ["email", "whatsapp"];
  if (normalized === "whatsapp_direct_group" || normalized === "whatsapp+group") return ["whatsapp", "whatsapp_group"];
  if (normalized === "email_whatsapp_group" || normalized === "all") return ["email", "whatsapp", "whatsapp_group"];
  return ["email"];
}

function targetHasActiveOutreachDraft(target, requestedChannels = ["email"]) {
  const invitationId = String(target?.invitation?.id || "");
  if (!invitationId) return false;
  const activeChannels = new Set(
    draftRowsForEvent()
      .filter((message) => {
        const status = String(message.status || "").toLowerCase();
        return status !== "archived"
          && outreachMessageInvitationIds(message).has(invitationId)
          && draftMatchesCurrentLaneTable(message, target);
      })
      .map((message) => String(message.channel || "").toLowerCase())
      .filter(Boolean)
  );
  return requestedChannels.every((channel) => activeChannels.has(String(channel).toLowerCase()));
}

function confirmBidRoomBulkAction(action, ids = []) {
  const count = formatNumber(ids.length);
  if (action === "auto_shortlist") {
    return window.confirm(`Auto-shortlist carriers for ${count} selected lane(s)? Rateware will add recommended CRM carriers to the Bid Room shortlist.`);
  }
  if (action === "mark_invited") {
    return window.confirm(`Mark ${count} selected participant row(s) as invited? Use this only after the invitation touchpoint is ready or already sent.`);
  }
  if (action === "archive_participants") {
    return window.confirm(`Archive ${count} selected participant row(s)? This removes them from the active Bid Room shortlist but keeps CRM vendors and lane history.`);
  }
  return true;
}

function confirmDraftQueueAction(action, ids = []) {
  const count = formatNumber(ids.length);
  if (action === "send") {
    const batches = Math.ceil(ids.length / OUTREACH_SEND_BATCH_SIZE);
    return window.confirm(`Send ${count} individual email(s) from ${APPROVED_GMAIL_SENDER}? Each selected carrier will receive its own message${batches > 1 ? ` in ${batches} batches` : ""}.`);
  }
  if (action === "send_whatsapp") {
    const batches = Math.ceil(ids.length / OUTREACH_SEND_BATCH_SIZE);
    return window.confirm(`Send ${count} WhatsApp Business message(s) using the mapped Meta template${batches > 1 ? ` in ${batches} batches` : ""}?`);
  }
  if (action === "mark_group_sent") {
    return window.confirm(`Mark ${count} WhatsApp group draft(s) as manually sent? Use this after posting them in the carrier group.`);
  }
  if (action === "refresh") {
    return window.confirm(`Refresh ${count} selected draft row(s) from the current Business Book? Existing send history stays intact and the selected carriers will be ready to send again.`);
  }
  if (action === "archive") {
    return window.confirm(`Archive ${count} delivery message(s)? They will be hidden from the active queue only. Carrier participation, bids, replies, and the This RFx history stay intact.`);
  }
  return true;
}

function outreachBulkResultSummary(result = {}, noun = "row") {
  const parts = [];
  if (Number(result.sent || 0)) parts.push(`${formatNumber(result.sent)} sent`);
  if (Number(result.updated || 0)) parts.push(`${formatNumber(result.updated)} updated`);
  if (Number(result.removed || 0)) parts.push(`${formatNumber(result.removed)} removed`);
  if (Number(result.failed || 0)) parts.push(`${formatNumber(result.failed)} failed`);
  if (Number(result.delivery_unknown || 0)) parts.push(`${formatNumber(result.delivery_unknown)} delivery unknown`);
  if (Number(result.skipped || 0)) parts.push(`${formatNumber(result.skipped)} skipped`);
  if (!parts.length) parts.push(`0 ${noun}${noun.endsWith("s") ? "" : "s"} processed`);
  return parts.join(" | ");
}

function updateDraftSendControls(rows = []) {
  const activeChannel = selectedOutreachChannel();
  const selectable = selectableEmailDrafts(rows);
  const whatsappSelectable = selectableWhatsappDrafts(rows);
  const whatsappGroupSelectable = selectableWhatsappGroupDrafts(rows);
  const selectedVisibleRows = selectedDraftRows(rows);
  const selectedRows = selectedDraftRows();
  const sendableSelectedIds = selectedSendableDraftIds();
  const sendableWhatsappIds = selectedWhatsappDraftIds();
  const whatsappSendingReady = whatsappConnectionReadiness.ready === true;
  const markableGroupIds = selectedWhatsappGroupDraftIds();
  const refreshableSelectedRows = selectedRefreshableDraftRows();
  const hasSearch = Boolean(normalizeDraftSearch(draftQueueSearch));
  if (draftSelectionLabel) {
    draftSelectionLabel.textContent = selectedRows.length
      ? `${formatNumber(selectedRows.length)} selected${hasSearch ? ` | ${formatNumber(selectedVisibleRows.length)} on page` : ""}`
      : "0 selected";
    draftSelectionLabel.className = `status-pill ${selectedRows.length ? "success" : "muted"}`;
  }
  if (draftToggleVisible) {
    draftToggleVisible.checked = rows.length > 0 && rows.every((message) => selectedDraftMessageIds.has(String(message.id)));
    draftToggleVisible.indeterminate = selectedVisibleRows.length > 0 && selectedVisibleRows.length < rows.length;
    draftToggleVisible.disabled = !rows.length;
  }
  const activeSelectable = activeChannel === "whatsapp"
    ? whatsappSelectable
    : activeChannel === "whatsapp_group"
      ? whatsappGroupSelectable
      : selectable;
  if (draftSelectAllEmailsButton) draftSelectAllEmailsButton.disabled = !activeSelectable.length;
  if (draftClearSelectionButton) draftClearSelectionButton.disabled = !selectedDraftMessageIds.size;
  if (draftRefreshSelectedButton) {
    draftRefreshSelectedButton.disabled = draftQueueMutationRunning || !refreshableSelectedRows.length;
    draftRefreshSelectedButton.textContent = refreshableSelectedRows.length
      ? `Refresh ${formatNumber(refreshableSelectedRows.length)} selected`
      : "Refresh selected";
  }
  if (draftSendSelectedButton) {
    draftSendSelectedButton.disabled = draftQueueMutationRunning || !sendableSelectedIds.length;
    draftSendSelectedButton.textContent = sendableSelectedIds.length
      ? `Send ${formatNumber(sendableSelectedIds.length)} email${sendableSelectedIds.length === 1 ? "" : "s"}`
      : "Send selected emails";
  }
  if (draftSendSelectedWhatsappButton) {
    draftSendSelectedWhatsappButton.disabled = draftQueueMutationRunning || !sendableWhatsappIds.length || !whatsappSendingReady;
    draftSendSelectedWhatsappButton.textContent = sendableWhatsappIds.length
      ? `Send ${formatNumber(sendableWhatsappIds.length)} WhatsApp`
      : "Send WhatsApp direct";
    draftSendSelectedWhatsappButton.title = whatsappSendingReady ? "" : whatsappConnectionReadiness.message;
  }
  if (draftMarkSelectedWhatsappGroupsButton) {
    draftMarkSelectedWhatsappGroupsButton.disabled = draftQueueMutationRunning || !markableGroupIds.length;
    draftMarkSelectedWhatsappGroupsButton.textContent = markableGroupIds.length
      ? `Mark ${formatNumber(markableGroupIds.length)} group${markableGroupIds.length === 1 ? "" : "s"} sent`
      : "Mark groups sent";
  }
  if (draftSelectAllEmailsButton) {
    const label = activeChannel === "whatsapp_group"
      ? "manual group drafts"
      : activeChannel === "whatsapp"
        ? "WhatsApp drafts"
        : "sendable emails";
    draftSelectAllEmailsButton.textContent = activeSelectable.length
      ? `Select ${label} (${formatNumber(activeSelectable.length)})`
      : `Select ${label}`;
  }
  if (draftArchiveSelectedButton) draftArchiveSelectedButton.disabled = draftQueueMutationRunning || !selectedRows.length;
  if (draftDeleteSelectedButton) draftDeleteSelectedButton.disabled = draftQueueMutationRunning || !selectedRows.length;
}

function eventInvitationStatus(row = {}) {
  const explicit = String(row.event_status || row.last_message_status || "").trim().toLowerCase();
  if (explicit) return explicit;
  const audience = String(row.audience_status || "").trim().toLowerCase();
  if (["bounced", "suppressed", "no_contact", "failed", "replied", "quoted"].includes(audience)) return audience;
  return "not_invited";
}

function eventInvitationStatusLabel(status = "") {
  return ({
    not_invited: "Not invited",
    ready: "Ready to queue",
    drafted: "Drafted",
    queued: "Queued",
    invited: "Invited",
    sending: "Sending",
    sent: "Sent",
    delivered: "Delivered",
    read: "Read",
    manual_sent: "Manual sent",
    delivery_unknown: "Delivery unknown",
    bounced: "Bounced",
    failed: "Failed",
    suppressed: "Suppressed",
    no_contact: "No contact",
    replied: "Replied",
    quoted: "Quoted"
  })[String(status || "").toLowerCase()] || "Needs review";
}

function eventInvitationStatusTone(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (["invited", "sent", "delivered", "read", "manual_sent", "replied", "quoted"].includes(normalized)) return "success";
  if (["bounced", "failed"].includes(normalized)) return "danger";
  if (["suppressed", "no_contact", "delivery_unknown", "sending"].includes(normalized)) return "warning";
  return "muted";
}

function eventInvitationNextAction(row = {}, status = eventInvitationStatus(row)) {
  if (row.next_action) return String(row.next_action);
  return ({
    not_invited: "Add to queue",
    ready: "Prepare this channel",
    drafted: "Review and send",
    queued: "Wait for delivery",
    sending: "Wait for provider result",
    invited: "Await response",
    sent: "Await response",
    delivered: "Await response",
    read: "Await response",
    manual_sent: "Confirm delivery manually",
    delivery_unknown: "Review provider status",
    bounced: "Replace contact",
    failed: "Review and retry",
    suppressed: "Keep suppressed or replace contact",
    no_contact: "Add a valid contact",
    replied: "Review reply",
    quoted: "Review quote"
  })[status] || "Review";
}

function renderEventDeliveryOverview() {
  const eventLabel = selectedEvent?.rfx_id || selectedEvent?.name || "this RFx";
  const counts = outreachAudienceCounts && typeof outreachAudienceCounts === "object" ? outreachAudienceCounts : {};
  const count = (values) => values.reduce((total, status) => total + Number(counts[status] || 0), 0);
  const pending = count(["not_invited", "ready"]);
  const queued = count(["drafted", "queued", "sending"]);
  const delivered = count(["invited", "sent", "delivered", "read", "manual_sent", "delivery_unknown"]);
  const response = count(["replied", "quoted"]);
  const attention = count(["bounced", "failed", "suppressed", "no_contact"]);
  if (rfxEventDeliveryContext) {
    rfxEventDeliveryContext.textContent = selectedEventId
      ? `${eventLabel}: every row is one carrier, one channel, and this RFx only. Other event history never changes this queue.`
      : "Select an RFx to review its carrier invitation history.";
  }
  if (rfxMessageSetupState) {
    rfxMessageSetupState.textContent = !selectedEventId
      ? "Select an RFx"
      : pending
        ? `${formatNumber(pending)} ready to queue`
        : queued
          ? `${formatNumber(queued)} in delivery`
          : response
            ? `${formatNumber(response)} response${response === 1 ? "" : "s"}`
            : "Queue up to date";
    rfxMessageSetupState.className = `status-pill ${attention ? "warning" : pending || queued || response ? "success" : "muted"}`;
  }
  if (!rfxEventDeliveryOverview) return;
  if (!selectedEventId) {
    rfxEventDeliveryOverview.innerHTML = '<article><span>Event delivery</span><strong>-</strong><small>Select an RFx first</small></article>';
    return;
  }
  const cards = [
    ["Not invited", pending, "Add or prepare carriers", "not_invited", pending ? "warning" : "neutral"],
    ["In queue", queued, "Drafted, queued, or sending", "in_delivery", queued ? "warning" : "neutral"],
    ["Delivered", delivered, "Awaiting carrier response", "delivered", delivered ? "success" : "neutral"],
    ["Response", response, "Reply or quote received", "response", response ? "success" : "neutral"],
    ["Attention", attention, "Bounce, failure, or contact issue", "attention", attention ? "danger" : "neutral"]
  ];
  rfxEventDeliveryOverview.innerHTML = cards.map(([label, value, detail, filter, tone]) => `
    <article data-tone="${escapeHtml(tone)}" data-rfx-event-status-filter="${escapeHtml(filter)}" title="Filter this RFx by ${escapeHtml(label.toLowerCase())}">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `).join("");
}

function currentOutreachAudiencePolicy() {
  const mode = String(rfxOutreachAudienceMode?.value || "all_eligible");
  const savedSegmentId = mode === "saved_segment" ? String(rfxOutreachAudienceSegment?.value || "") : "";
  return {
    mode,
    saved_segment_id: savedSegmentId || undefined,
    vendor_ids: [...selectedOutreachAudienceVendorIds],
    require_contact: true,
    exclude_previously_contacted: true,
    exclude_bounced: true
  };
}

function currentOutreachContactPolicy() {
  return {
    max_touches_per_event: 1,
    cooldown_hours: 72,
    daily_limit: 100
  };
}

function currentOutreachSequencePolicy() {
  return {
    mode: "manual",
    follow_up_delay_hours: 48,
    follow_up_channel: "whatsapp"
  };
}

function renderOutreachAudienceSegments() {
  if (!rfxOutreachAudienceSegment) return;
  const savedListMode = String(rfxOutreachAudienceMode?.value || "all_eligible") === "saved_segment";
  const currentValue = rfxOutreachAudienceSegment.value;
  rfxOutreachAudienceSegment.innerHTML = [
    '<option value="">Choose a saved segment</option>',
    ...outreachAudienceSegments.map((segment) => `<option value="${escapeHtml(segment.id)}">${escapeHtml(segment.name || "Saved segment")} (${formatNumber(Array.isArray(segment.vendor_ids) ? segment.vendor_ids.length : 0)})</option>`)
  ].join("");
  if (currentValue && outreachAudienceSegments.some((segment) => String(segment.id) === String(currentValue))) {
    rfxOutreachAudienceSegment.value = currentValue;
  }
  rfxOutreachAudienceSegment.disabled = !savedListMode;
  if (rfxOutreachAudienceSegmentField) rfxOutreachAudienceSegmentField.hidden = !savedListMode;
  if (rfxArchiveOutreachAudienceSegmentButton) {
    rfxArchiveOutreachAudienceSegmentButton.disabled = !savedListMode || !rfxOutreachAudienceSegment.value;
  }
}

function renderOutreachAudience() {
  if (!rfxOutreachAudienceList || !rfxOutreachAudienceSummary) return;
  renderOutreachAudienceSegments();
  const selectedCount = selectedOutreachAudienceVendorIds.size;
  const count = (statuses) => statuses.reduce((total, status) => total + Number(outreachAudienceCounts?.[status] || 0), 0);
  const eligibleCount = count(["not_invited", "ready"]);
  const contactedCount = count(["invited", "sent", "delivered", "read", "manual_sent", "delivery_unknown"]);
  const responseCount = count(["replied", "quoted"]);
  const attentionCount = count(["bounced", "suppressed", "no_contact", "failed"]);
  const readyVendorIds = outreachAudienceRows
    .filter((row) => ["not_invited", "ready"].includes(eventInvitationStatus(row)))
    .map((row) => String(row.vendor_id || ""))
    .filter(Boolean);
  if (rfxOutreachAudienceReadyCount) rfxOutreachAudienceReadyCount.textContent = outreachAudienceLoading ? "-" : formatNumber(eligibleCount);
  if (rfxOutreachAudienceContactedCount) rfxOutreachAudienceContactedCount.textContent = outreachAudienceLoading ? "-" : formatNumber(contactedCount);
  if (rfxOutreachAudienceResponseCount) rfxOutreachAudienceResponseCount.textContent = outreachAudienceLoading ? "-" : formatNumber(responseCount);
  if (rfxOutreachAudienceAttentionCount) rfxOutreachAudienceAttentionCount.textContent = outreachAudienceLoading ? "-" : formatNumber(attentionCount);
  rfxOutreachAudienceSummary.textContent = outreachAudienceLoading
    ? "Loading this RFx invitation history..."
    : `${formatNumber(selectedCount)} selected for the next queue | ${formatNumber(outreachAudienceTotal)} carrier${outreachAudienceTotal === 1 ? "" : "s"} in this RFx`;
  rfxOutreachAudienceSummary.className = `status-pill ${selectedCount ? "success" : "muted"}`;
  if (rfxSaveOutreachAudienceSegmentButton) {
    rfxSaveOutreachAudienceSegmentButton.disabled = !selectedCount || !String(rfxOutreachAudienceSegmentName?.value || "").trim();
  }
  if (rfxSelectReadyOutreachAudienceButton) rfxSelectReadyOutreachAudienceButton.disabled = outreachAudienceLoading || !readyVendorIds.length;
  if (rfxClearOutreachAudienceSelectionButton) rfxClearOutreachAudienceSelectionButton.disabled = !selectedCount;
  if (!selectedEventId) {
    rfxOutreachAudienceList.innerHTML = '<tr><td colspan="5">Select a Bid Room to review this event\'s carrier invitation status.</td></tr>';
    renderEventDeliveryOverview();
    return;
  }
  if (outreachAudienceLoading) {
    rfxOutreachAudienceList.innerHTML = '<tr><td colspan="5">Loading this RFx invitation and delivery history...</td></tr>';
    renderEventDeliveryOverview();
    return;
  }
  if (!outreachAudienceRows.length) {
    rfxOutreachAudienceList.innerHTML = '<tr><td colspan="5">No carriers have been added to this RFx yet. Use Carrier fit on the left, then add selected carriers to this Bid Room.</td></tr>';
    renderEventDeliveryOverview();
    return;
  }
  rfxOutreachAudienceList.innerHTML = outreachAudienceRows.map((row) => {
    const vendorId = String(row.vendor_id || "");
    const selected = selectedOutreachAudienceVendorIds.has(vendorId);
    const status = eventInvitationStatus(row);
    const lanes = Number(row.lane_count || 0);
    const shortlistedLanes = Number(row.shortlisted_lane_count || lanes);
    const eventLanes = Number(row.event_lane_count || 0);
    const contact = row.email || row.phone || "No verified contact";
    const reason = String(row.event_status_reason || row.reason || row.last_message_status || "Not invited in this RFx yet");
    const laneLabel = eventLanes > shortlistedLanes
      ? `${formatNumber(shortlistedLanes)} shortlisted / ${formatNumber(eventLanes)} event lanes`
      : `${formatNumber(lanes)} lane${lanes === 1 ? "" : "s"}`;
    return `
      <tr class="${selected ? "is-selected-row" : ""}">
        <td><input type="checkbox" data-rfx-audience-select="${escapeHtml(vendorId)}" ${selected ? "checked" : ""} ${vendorId ? "" : "disabled"} /></td>
        <td><strong>${escapeHtml(row.vendor_name || row.vendor_domain || "Carrier")}</strong><small title="${escapeHtml((row.lane_preview || []).join(" | "))}">${escapeHtml(laneLabel)}${row.vendor_domain ? ` | ${escapeHtml(row.vendor_domain)}` : ""}</small></td>
        <td>${escapeHtml(contact)}</td>
        <td><span class="status-pill ${eventInvitationStatusTone(status)}" title="${escapeHtml(reason)}">${escapeHtml(eventInvitationStatusLabel(status))}</span></td>
        <td><small class="rfx-draft-next-action">${escapeHtml(eventInvitationNextAction(row, status))}</small></td>
      </tr>
    `;
  }).join("");
  renderEventDeliveryOverview();
}

async function loadOutreachAudience({ reloadSegments = false } = {}) {
  const eventId = selectedEventId;
  if (!eventId) {
    outreachAudienceRows = [];
    outreachAudienceCounts = {};
    outreachAudienceTotal = 0;
    outreachAudienceSegments = [];
    selectedOutreachAudienceVendorIds.clear();
    renderOutreachAudience();
    return;
  }
  const loadVersion = ++outreachAudienceLoadVersion;
  outreachAudienceLoading = true;
  renderOutreachAudience();
  try {
    const policy = currentOutreachAudiencePolicy();
    const [audience, segments] = await Promise.all([
      previewOutreachAudience({
        rfx_event_id: eventId,
        channel: selectedOutreachChannel(),
        search: String(rfxOutreachAudienceSearch?.value || ""),
        status_filter: String(rfxOutreachAudienceStatusFilter?.value || "all"),
        audience_policy: policy
      }),
      reloadSegments || !outreachAudienceSegments.length
        ? fetchOutreachAudienceSegments(eventId)
        : Promise.resolve(outreachAudienceSegments)
    ]);
    if (loadVersion !== outreachAudienceLoadVersion || eventId !== selectedEventId) return;
    outreachAudienceRows = Array.isArray(audience?.rows) ? audience.rows : [];
    outreachAudienceCounts = audience?.counts && typeof audience.counts === "object" ? audience.counts : {};
    outreachAudienceTotal = Number(audience?.total || outreachAudienceRows.length);
    outreachAudienceSegments = Array.isArray(segments) ? segments : [];
    setStatus(rfxOutreachAudienceStatus, `This RFx is loaded: ${formatNumber(outreachAudienceRows.length)} carrier(s). Select only carriers that are ready for the next queue; sent, bounced, and quoted history stays event-specific.`, "success");
  } catch (error) {
    if (loadVersion !== outreachAudienceLoadVersion || eventId !== selectedEventId) return;
    outreachAudienceRows = [];
    const raw = String(error?.message || error || "");
    const message = /unknown action/i.test(raw)
      ? "The Outreach service is behind this app version. Deploy the latest Rateware API, then refresh this audience."
      : `Audience could not load. ${humanizeError(error)}`;
    setStatus(rfxOutreachAudienceStatus, message, "error");
  } finally {
    if (loadVersion === outreachAudienceLoadVersion) {
      outreachAudienceLoading = false;
      renderOutreachAudience();
    }
  }
}

async function saveCurrentOutreachAudienceSegment() {
  const name = String(rfxOutreachAudienceSegmentName?.value || "").trim();
  const vendorIds = [...selectedOutreachAudienceVendorIds];
  if (!selectedEventId || !name || !vendorIds.length) {
    setStatus(rfxOutreachAudienceStatus, "Select one or more carriers and provide a segment name before saving.", "error");
    return;
  }
  if (rfxSaveOutreachAudienceSegmentButton) rfxSaveOutreachAudienceSegmentButton.disabled = true;
  try {
    const row = await saveOutreachAudienceSegment({
      name,
      vendor_ids: vendorIds,
      rfx_event_id: selectedEventId,
      filters: currentOutreachAudiencePolicy(),
      source: "rfx_outreach_control_center"
    });
    if (rfxOutreachAudienceSegmentName) rfxOutreachAudienceSegmentName.value = "";
    await loadOutreachAudience({ reloadSegments: true });
    if (rfxOutreachAudienceSegment) rfxOutreachAudienceSegment.value = String(row?.id || "");
    setStatus(rfxOutreachAudienceStatus, `Saved ${formatNumber(vendorIds.length)} carriers as ${name}.`, "success");
  } catch (error) {
    setStatus(rfxOutreachAudienceStatus, humanizeError(error), "error");
  } finally {
    renderOutreachAudience();
  }
}

async function archiveCurrentOutreachAudienceSegment() {
  const id = String(rfxOutreachAudienceSegment?.value || "");
  if (!id) {
    setStatus(rfxOutreachAudienceStatus, "Choose a saved segment before archiving.", "error");
    return;
  }
  const segment = outreachAudienceSegments.find((item) => String(item.id) === id);
  if (!window.confirm(`Archive saved segment ${segment?.name || "this segment"}?`)) return;
  try {
    await archiveOutreachAudienceSegment(id);
    selectedOutreachAudienceVendorIds.clear();
    if (rfxOutreachAudienceSegment) rfxOutreachAudienceSegment.value = "";
    await loadOutreachAudience({ reloadSegments: true });
    setStatus(rfxOutreachAudienceStatus, "Saved audience segment archived.", "success");
  } catch (error) {
    setStatus(rfxOutreachAudienceStatus, humanizeError(error), "error");
  }
}

function renderDraftQueue() {
  if (!draftSummary || !draftList) return;
  renderEventDeliveryOverview();
  renderDraftTrackingFilters();
  const rows = draftQueueRows;
  const actionable = rows.filter((message) => ["drafted", "queued", "failed"].includes(String(message.status || "").toLowerCase()));
  const staleRows = rows.filter(isStaleOutreachDraft);
  const emailSelectable = selectableEmailDrafts(rows);
  const whatsappSelectable = selectableWhatsappDrafts(rows);
  const whatsappGroupSelectable = selectableWhatsappGroupDrafts(rows);
  const hasSearch = Boolean(normalizeDraftSearch(draftQueueSearch));
  updateDraftSendControls(rows);
  const channelLabel = outreachChannelLabel(selectedOutreachChannel());
  const trackingLabel = DRAFT_TRACKING_STATES.find(([status]) => status === draftQueueTrackingStatus)?.[1] || "All";
  const first = draftQueueTotal ? draftQueueOffset + 1 : 0;
  const last = draftQueueOffset + rows.length;
  draftSummary.textContent = draftQueueLoading
    ? `Loading ${channelLabel} draft queue...`
    : draftQueueTotal
      ? `${formatNumber(draftQueueTotal)} ${trackingLabel.toLowerCase()} ${channelLabel} draft rows | showing ${formatNumber(first)}-${formatNumber(last)} | ${formatNumber(actionable.length)} need action on this page${staleRows.length ? ` | ${formatNumber(staleRows.length)} stale` : ""}`
      : selectedEventId
        ? `No ${trackingLabel.toLowerCase()} ${channelLabel} drafts match this queue filter. Generate this channel or clear the filters.`
        : "No drafts generated for this bid event.";
  if (draftSearchInput && draftSearchInput.value !== draftQueueSearch) draftSearchInput.value = draftQueueSearch;
  if (draftClearSearchButton) draftClearSearchButton.disabled = !hasSearch;
  if (draftPageSummary) {
    draftPageSummary.textContent = draftQueueLoading
      ? "Loading page..."
      : draftQueueTotal
        ? `Rows ${formatNumber(first)}-${formatNumber(last)} of ${formatNumber(draftQueueTotal)}`
        : "No matching draft rows";
  }
  if (draftPageSize && String(draftPageSize.value) !== String(draftQueuePageSize)) draftPageSize.value = String(draftQueuePageSize);
  if (draftPreviousPageButton) draftPreviousPageButton.disabled = draftQueueLoading || draftQueueOffset <= 0;
  if (draftNextPageButton) draftNextPageButton.disabled = draftQueueLoading || last >= draftQueueTotal;
  if (draftToggleVisible) {
    const selectedOnPage = rows.filter((message) => selectedDraftMessageIds.has(String(message.id))).length;
    draftToggleVisible.checked = Boolean(rows.length) && selectedOnPage === rows.length;
    draftToggleVisible.indeterminate = selectedOnPage > 0 && selectedOnPage < rows.length;
    draftToggleVisible.disabled = draftQueueLoading || !rows.length;
  }
  if (!selectedEventId) {
    updateDraftSendControls([]);
    draftList.innerHTML = `<tr><td colspan="9">Select a bid event to review invitation drafts.</td></tr>`;
    return;
  }
  if (draftQueueLoading) {
    draftList.innerHTML = `<tr><td colspan="9">Loading draft queue...</td></tr>`;
    return;
  }
  if (!rows.length) {
    updateDraftSendControls([]);
    draftList.innerHTML = `<tr><td colspan="9">No ${escapeHtml(trackingLabel.toLowerCase())} ${escapeHtml(channelLabel)} draft rows match these filters. Clear search or select All.</td></tr>`;
    return;
  }
  if (!emailSelectable.length && !whatsappSelectable.length && !whatsappGroupSelectable.length && rows.length) {
    updateDraftSendControls(rows);
  }
  draftList.innerHTML = rows.map((message) => {
    const isEmail = message.channel === "email";
    const isWhatsapp = message.channel === "whatsapp";
    const isWhatsappGroup = message.channel === "whatsapp_group";
    const openUrl = isEmail
      ? message.gmail_compose_url
      : isWhatsappGroup
        ? (message.vendor_whatsapp_groups?.group_url || message.vendors?.whatsapp_group_url || message.whatsapp_url)
        : message.whatsapp_url;
    const checked = selectedDraftMessageIds.has(String(message.id));
    const preview = String(message.text_body || message.whatsapp_text || message.subject || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const status = String(message.status || "-").toLowerCase();
    const trackingStatus = outreachTrackingState(message);
    const recipient = messageRecipient(message) || "-";
    const updated = message.updated_at || message.sent_at || message.created_at;
    const canSendEmail = isEmail && selectableEmailDrafts([message]).length;
    const canSendWhatsapp = isWhatsapp && whatsappConnectionReadiness.ready === true && selectableWhatsappDrafts([message]).length;
    const canMarkGroup = isWhatsappGroup && selectableWhatsappGroupDrafts([message]).length;
    const openLabel = isEmail ? "Open Gmail" : isWhatsappGroup ? "Open group" : "Open WhatsApp";
    const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
    const templateStatus = String(metadata.whatsapp_template_status || (message.whatsapp_template_name ? "NOT_SYNCED" : "NOT_PUBLISHED")).toUpperCase();
    const draftTitle = message.subject || (isWhatsapp ? "WhatsApp RFx invitation" : isWhatsappGroup ? "WhatsApp group invitation" : "No subject");
    const staleDraft = isStaleOutreachDraft(message);
    const nextAction = String(
      metadata.next_action
      || message.next_action
      || (staleDraft
        ? "Refresh affected draft"
        : trackingStatus === "bounced"
          ? "Replace contact"
          : trackingStatus === "suppressed"
            ? "Keep suppressed"
            : ["sent", "delivered", "read"].includes(trackingStatus)
              ? "Await response"
              : trackingStatus === "sending"
                ? "Wait for delivery result"
                : trackingStatus === "queued"
                  ? "Ready to send"
              : trackingStatus === "replied"
                ? "Review reply"
                : trackingStatus === "quoted"
                  ? "Review quote"
                  : "Review and send")
    ).trim();
    const readinessDetail = staleDraft
      ? "Business book changed. Refresh this draft to update its route table."
      : isWhatsapp && whatsappConnectionReadiness.ready !== true
        ? whatsappConnectionReadiness.message
      : isWhatsapp && templateStatus !== "APPROVED"
        ? whatsappDraftStatusDetail(message, templateStatus)
        : "";
    return `
      <tr class="${checked ? "is-selected-row" : ""}${staleDraft ? " is-stale-row" : ""}" data-rfx-draft-id="${escapeHtml(message.id)}">
        <td><input type="checkbox" data-rfx-draft-select="${escapeHtml(message.id)}" ${checked ? "checked" : ""} /></td>
        <td>
          <strong>${escapeHtml(message.vendors?.vendor_name || message.vendors?.domain || "Vendor")}</strong>
          <small>${escapeHtml(message.rfx_lanes ? `${message.rfx_lanes.origin || "-"} -> ${message.rfx_lanes.destination || "-"}` : message.rfx_events?.rfx_id || "")}</small>
        </td>
        <td>${escapeHtml(recipient)}</td>
        <td>${escapeHtml(message.channel || "-")}</td>
        <td><span class="status-pill ${staleDraft ? "warning" : trackingStatusTone(trackingStatus)}" title="Queue state: ${escapeHtml(status)}">${escapeHtml(staleDraft ? "stale" : trackingStatus)}</span></td>
        <td><small class="rfx-draft-next-action">${escapeHtml(nextAction)}</small></td>
        <td>
          <strong>${escapeHtml(draftTitle)}</strong>
          <small>${escapeHtml(readinessDetail || message.delivery_error || preview || "No preview")}</small>
        </td>
        <td>${escapeHtml(updated ? new Date(updated).toLocaleString() : "-")}</td>
        <td>
          <div class="rfx-draft-row-actions">
            ${staleDraft || ["sent", "replied"].includes(status) ? `<button class="small-button" type="button" data-rfx-refresh-draft="${escapeHtml(message.id)}">${staleDraft ? "Refresh draft" : "Create resend"}</button>` : ""}
            ${isEmail ? `<button class="small-button" type="button" data-rfx-send-draft-now="${escapeHtml(message.id)}" ${canSendEmail ? "" : "disabled"}>Send email</button>` : ""}
            ${isWhatsapp ? `<button class="small-button" type="button" data-rfx-send-whatsapp-now="${escapeHtml(message.id)}" ${canSendWhatsapp ? "" : "disabled"}>Send WhatsApp</button>` : ""}
            ${isWhatsappGroup ? `<button class="small-button" type="button" data-rfx-mark-whatsapp-group-sent="${escapeHtml(message.id)}" ${canMarkGroup ? "" : "disabled"}>Manual sent</button>` : ""}
            <button class="secondary small-button" type="button" data-rfx-open-draft="${escapeHtml(openUrl || "")}" ${openUrl ? "" : "disabled"}>${escapeHtml(openLabel)}</button>
            <button class="secondary small-button" type="button" data-rfx-mark-draft="${escapeHtml(message.id)}" data-rfx-draft-status="queued" ${status === "queued" || status === "sending" || status === "sent" || status === "archived" ? "disabled" : ""}>Queue</button>
            <button class="secondary small-button" type="button" title="Hide this delivery message from the active queue. Carrier participation and RFx history remain." data-rfx-mark-draft="${escapeHtml(message.id)}" data-rfx-draft-status="archived" ${status === "archived" ? "disabled" : ""}>Archive message</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderOutreachLaunchpad() {
  syncOutreachChannelUi();
  if (rfxOutreachCampaignName && selectedEvent) {
    const defaultName = `${selectedEvent.rfx_id || "RFx"} invitation wave`;
    if (!rfxOutreachCampaignName.value || rfxOutreachCampaignName.dataset.autoName === "true") {
      rfxOutreachCampaignName.value = defaultName;
      rfxOutreachCampaignName.dataset.autoName = "true";
    }
  }
  renderOutreachTemplateSelect();
  renderOutreachCarrierAdder();
  renderOutreachAudience();
  renderOutreachPreview();
  renderTouchpoints();
  renderDraftQueue();
}

function updateMetrics() {
  const laneCount = events.reduce((sum, event) => sum + Number(event.lane_count || 0), 0);
  const inviteCount = events.reduce((sum, event) => sum + Number(event.invitation_count || 0), 0);
  const bidCount = events.reduce((sum, event) => sum + Number(event.bid_count || 0), 0);
  if (metricEvents) metricEvents.textContent = formatNumber(events.length);
  if (metricLanes) metricLanes.textContent = formatNumber(laneCount);
  if (metricInvites) metricInvites.textContent = formatNumber(inviteCount);
  if (metricBids) metricBids.textContent = formatNumber(bidCount);
}

function normalizeRfxEventFilterValue(value) {
  return String(value || "all").trim().toLowerCase() || "all";
}

function eventFilterText(event) {
  return [event.rfx_id, event.name, event.customer, event.event_type, event.bid_visibility_mode]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function filteredRfxEvents() {
  const query = String(eventFilterSearch || "").trim().toLowerCase();
  return events.filter((event) => {
    if (query && !eventFilterText(event).includes(query)) return false;
    if (eventStatusFilter !== "all" && String(event.status || "").toLowerCase() !== eventStatusFilter) return false;
    if (eventTypeFilter !== "all" && String(event.event_type || "").toLowerCase() !== eventTypeFilter) return false;
    if (eventVisibilityFilter !== "all" && String(event.bid_visibility_mode || "").toLowerCase() !== eventVisibilityFilter) return false;
    return true;
  });
}

function eventFilterOptionLabel(value) {
  return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderRfxEventFilterOptions() {
  const typeValues = [...new Set(events.map((event) => String(event.event_type || "").trim().toLowerCase()).filter(Boolean))].sort();
  const visibilityValues = [...new Set(events.map((event) => String(event.bid_visibility_mode || "").trim().toLowerCase()).filter(Boolean))].sort();
  if (rfxEventTypeFilter) {
    rfxEventTypeFilter.innerHTML = `<option value="all">All types</option>${typeValues.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(eventFilterOptionLabel(value))}</option>`).join("")}`;
    rfxEventTypeFilter.value = typeValues.includes(eventTypeFilter) ? eventTypeFilter : "all";
    eventTypeFilter = rfxEventTypeFilter.value;
  }
  if (rfxEventVisibilityFilter) {
    rfxEventVisibilityFilter.innerHTML = `<option value="all">All visibility</option>${visibilityValues.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(bidVisibilityLabel(value))}</option>`).join("")}`;
    rfxEventVisibilityFilter.value = visibilityValues.includes(eventVisibilityFilter) ? eventVisibilityFilter : "all";
    eventVisibilityFilter = rfxEventVisibilityFilter.value;
  }
}

function renderRfxEventViewOptions() {
  if (!rfxEventViewSelect) return;
  rfxEventViewSelect.innerHTML = `<option value="">Saved views</option>${savedRfxEventViews.map((view) => `<option value="${escapeHtml(view.id)}">${escapeHtml(view.name)}</option>`).join("")}`;
  rfxEventViewSelect.value = selectedRfxEventViewId;
  if (deleteRfxEventViewButton) deleteRfxEventViewButton.disabled = !selectedRfxEventViewId;
}

function syncRfxEventFilterControls() {
  if (rfxEventFilterSearch) rfxEventFilterSearch.value = eventFilterSearch;
  if (rfxEventStatusFilter) rfxEventStatusFilter.value = eventStatusFilter;
  if (rfxEventTypeFilter) rfxEventTypeFilter.value = eventTypeFilter;
  if (rfxEventVisibilityFilter) rfxEventVisibilityFilter.value = eventVisibilityFilter;
  renderRfxEventViewOptions();
}

function renderRfxEventFilters() {
  eventStatusFilter = ["all", "open", "draft", "closed", "archived"].includes(eventStatusFilter) ? eventStatusFilter : "all";
  eventTypeFilter = normalizeRfxEventFilterValue(eventTypeFilter);
  eventVisibilityFilter = normalizeRfxEventFilterValue(eventVisibilityFilter);
  renderRfxEventFilterOptions();
  syncRfxEventFilterControls();
  const visibleCount = filteredRfxEvents().length;
  if (rfxEventFilterCount) rfxEventFilterCount.textContent = events.length ? `${visibleCount} / ${events.length}` : "";
}

function clearRfxEventFilters() {
  eventFilterSearch = "";
  eventStatusFilter = "all";
  eventTypeFilter = "all";
  eventVisibilityFilter = "all";
  selectedRfxEventViewId = "";
  persistRfxWorkspaceContext();
  renderEvents();
}

function applyRfxEventView(view) {
  if (!view) return;
  eventFilterSearch = String(view.search || "");
  eventStatusFilter = normalizeRfxEventFilterValue(view.status);
  eventTypeFilter = normalizeRfxEventFilterValue(view.type);
  eventVisibilityFilter = normalizeRfxEventFilterValue(view.visibility);
  selectedRfxEventViewId = String(view.id || "");
  persistRfxWorkspaceContext();
  renderEvents();
}

function saveCurrentRfxEventView() {
  const name = String(rfxEventViewName?.value || "").trim();
  if (!name) {
    rfxEventViewName?.focus();
    rfxEventViewName?.setAttribute("aria-invalid", "true");
    return;
  }
  const existingIndex = savedRfxEventViews.findIndex((view) => view.name.toLowerCase() === name.toLowerCase());
  const existing = existingIndex >= 0 ? savedRfxEventViews[existingIndex] : null;
  const view = {
    id: existing?.id || `event-view-${Date.now()}`,
    name,
    search: eventFilterSearch,
    status: eventStatusFilter,
    type: eventTypeFilter,
    visibility: eventVisibilityFilter
  };
  if (existingIndex >= 0) savedRfxEventViews[existingIndex] = view;
  else savedRfxEventViews = [view, ...savedRfxEventViews].slice(0, 30);
  selectedRfxEventViewId = view.id;
  writeStoredRfxEventViews();
  if (rfxEventViewName) {
    rfxEventViewName.value = "";
    rfxEventViewName.removeAttribute("aria-invalid");
  }
  renderRfxEventViewOptions();
}

function deleteSelectedRfxEventView() {
  if (!selectedRfxEventViewId) return;
  savedRfxEventViews = savedRfxEventViews.filter((view) => view.id !== selectedRfxEventViewId);
  selectedRfxEventViewId = "";
  writeStoredRfxEventViews();
  renderRfxEventViewOptions();
}

function renderEvents() {
  updateMetrics();
  renderRfxEventFilters();
  if (!events.length) {
    eventList.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Bid events",
      title: "No bid events yet",
      detail: "Create a bid event, upload or paste lanes, then shortlist target carriers.",
      actionButton: '<button class="secondary small-button" type="button" data-rfx-focus-create>Create bid event</button>'
    });
    return;
  }
  const visibleEvents = filteredRfxEvents();
  if (!visibleEvents.length) {
    eventList.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Filtered bid rooms",
      title: "No events match these filters",
      detail: "Clear the event filters or choose another saved view.",
      actionButton: '<button class="secondary small-button" type="button" data-rfx-clear-event-filters>Clear filters</button>'
    });
    return;
  }
  eventList.innerHTML = visibleEvents.map((event) => `
    <article class="rfx-event-card ${event.id === selectedEventId ? "is-active" : ""}" data-rfx-event-id="${escapeHtml(event.id)}">
      <button class="rfx-event-select" type="button" data-rfx-event-select="${escapeHtml(event.id)}">
        <strong>${escapeHtml(event.rfx_id || "RFx")}</strong>
      </button>
      <div class="rfx-event-tooltip" role="tooltip">
        <strong>${escapeHtml(event.name || event.rfx_id || "RFx event")}</strong>
        <dl>
          <div><dt>RFx ID</dt><dd>${escapeHtml(event.rfx_id || "-")}</dd></div>
          <div><dt>Customer</dt><dd>${escapeHtml(event.customer || "-")}</dd></div>
          <div><dt>Type</dt><dd>${escapeHtml(event.event_type || "-")}</dd></div>
          <div><dt>Due date</dt><dd>${escapeHtml(event.due_date || "-")}</dd></div>
          <div><dt>Lanes</dt><dd>${formatNumber(event.lane_count)}</dd></div>
          <div><dt>Bids</dt><dd>${formatNumber(event.bid_count)}</dd></div>
          <div><dt>Bid visibility</dt><dd>${escapeHtml(bidVisibilityLabel(event.bid_visibility_mode))}</dd></div>
        </dl>
      </div>
    </article>
  `).join("");
}

let floatingEventTooltip = null;

function hideFloatingEventTooltip() {
  if (!floatingEventTooltip) return;
  floatingEventTooltip.hidden = true;
}

function showFloatingEventTooltip(card) {
  const source = card?.querySelector(".rfx-event-tooltip");
  if (!source) return;
  if (!floatingEventTooltip) {
    floatingEventTooltip = document.createElement("div");
    floatingEventTooltip.className = "rfx-event-floating-tooltip";
    floatingEventTooltip.setAttribute("role", "tooltip");
    document.body.appendChild(floatingEventTooltip);
  }
  floatingEventTooltip.innerHTML = source.innerHTML;
  floatingEventTooltip.hidden = false;

  const cardRect = card.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const popupRect = floatingEventTooltip.getBoundingClientRect();
  const left = Math.min(Math.max(8, cardRect.left), Math.max(8, viewportWidth - popupRect.width - 8));
  const belowTop = cardRect.bottom + 7;
  const top = belowTop + popupRect.height <= viewportHeight - 8
    ? belowTop
    : Math.max(8, cardRect.top - popupRect.height - 7);
  floatingEventTooltip.style.left = `${left}px`;
  floatingEventTooltip.style.top = `${top}px`;
}

function updateSelectionControls() {
  const laneCount = selectedVisibleLaneIds().length;
  const inviteCount = selectedVisibleInvitationIds().length;
  if (selectionCount) selectionCount.textContent = `${laneCount} lanes / ${inviteCount} vendors selected`;
  if (autoShortlistButton) autoShortlistButton.disabled = !laneCount;
  if (inviteSelectedButton) inviteSelectedButton.disabled = participantBulkMutationRunning || !inviteCount;
  if (archiveSelectedButton) archiveSelectedButton.disabled = participantBulkMutationRunning || !inviteCount;
}

function splitTags(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  return String(value || "")
    .split(/[;,|]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function selectedSegmentId() {
  return manualShortlistSegment?.value || "all";
}

function selectedSavedVendorSegment() {
  const segmentId = selectedSegmentId();
  if (!segmentId || segmentId === "all" || segmentId === "procurement") return null;
  return participantTemplates().find((item) => item.id === segmentId) || null;
}

function participantTemplates() {
  return savedVendorSegments.filter((segment) => String(segment?.segment_type || "").toLowerCase() === "participant_template");
}

function participantTemplateNameKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function participantTemplateByName(name, exceptId = "") {
  const key = participantTemplateNameKey(name);
  if (!key) return null;
  return participantTemplates().find((segment) => segment.id !== exceptId && participantTemplateNameKey(segment.segment_name) === key) || null;
}

function segmentVendorIds(segment) {
  if (!segment) return [];
  if (Array.isArray(segment.vendor_ids)) return segment.vendor_ids.map((id) => String(id)).filter(Boolean);
  return String(segment.vendor_ids || "")
    .split(/[,\s;|]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

function segmentMatchesVendor(segment, vendor) {
  const vendorIds = segmentVendorIds(segment);
  if (vendorIds.length) return vendorIds.includes(String(vendor.id || ""));
  const vendorTags = splitTags(vendor.tags);
  const requiredTags = splitTags(segment.tags);
  const hasTags = requiredTags.every((tag) => vendorTags.includes(tag));
  const hasStatus = !segment.status || vendor.status === segment.status;
  const hasChannel = !segment.preferred_channel || vendor.preferred_channel === segment.preferred_channel;
  return hasTags && hasStatus && hasChannel;
}

function vendorSearchText(row) {
  return [
    row.vendor_name,
    row.name,
    row.legal_name,
    row.contact_name,
    row.domain,
    row.primary_email,
    row.whatsapp_phone,
    row.preferred_channel,
    row.base_stage,
    row.funnel_stage,
    row.status,
    row.coverage_notes,
    row.notes,
    ...(Array.isArray(row.secondary_emails) ? row.secondary_emails : []),
    ...(Array.isArray(row.tags) ? row.tags : [])
  ]
    .filter(Boolean)
    .map(normalizeLookupText)
    .join(" ");
}

function vendorDisplayName(row) {
  return row.vendor_name || row.domain || row.primary_email || "Unnamed carrier";
}

function vendorStageRank(row) {
  const stage = String(row.base_stage || "").toLowerCase();
  const funnel = String(row.funnel_stage || "").toLowerCase();
  const status = String(row.status || "").toLowerCase();
  if (stage === "procurement") return 0;
  if (["targeted", "nested", "drafted", "invited", "onboarded", "trained", "activated", "completed"].includes(funnel)) return 1;
  if (status === "active") return 2;
  if (stage === "sourcing") return 3;
  if (stage === "archived" || status === "archived") return 9;
  return 4;
}

function isProcurementCarrier(row) {
  return vendorStageRank(row) <= 1;
}

function sortedVendorOptions(rows) {
  return [...rows].sort((a, b) => {
    const stageDelta = vendorStageRank(a) - vendorStageRank(b);
    if (stageDelta) return stageDelta;
    return vendorDisplayName(a).localeCompare(vendorDisplayName(b));
  });
}

function mergeVendorOptionRows(rows = []) {
  const byId = new Map(vendorOptions.map((vendor) => [String(vendor.id || ""), vendor]));
  rows.forEach((row) => {
    const id = String(row.id || "");
    if (!id) return;
    const merged = { ...(vendorOptionCache.get(id) || {}), ...(byId.get(id) || {}), ...row };
    vendorOptionCache.set(id, merged);
    byId.set(id, merged);
  });
  vendorOptions = sortedVendorOptions([...byId.values()]);
}

function activeVendorSearchTerm() {
  return String(manualShortlistSearch?.value || "").trim().replace(/\s+/g, " ");
}

function participantSelectionStorageKey(eventId = selectedEventId) {
  return `${BID_ROOM_PARTICIPANT_SELECTION_STORAGE_PREFIX}${eventId || "unassigned"}`;
}

function readStoredManualParticipantIds(eventId = selectedEventId) {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(participantSelectionStorageKey(eventId)) || "[]");
    return Array.isArray(parsed)
      ? [...new Set(parsed.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
  } catch {
    return [];
  }
}

function persistManualParticipantSelection(eventId = selectedEventId) {
  try {
    const ids = [...selectedManualVendorIdsState].map((id) => String(id || "").trim()).filter(Boolean);
    if (ids.length) {
      window.sessionStorage.setItem(participantSelectionStorageKey(eventId), JSON.stringify(ids));
    } else {
      window.sessionStorage.removeItem(participantSelectionStorageKey(eventId));
    }
  } catch {
    // The current in-memory selection remains usable if browser storage is unavailable.
  }
}

function restoreManualParticipantSelection(eventId = selectedEventId) {
  const ids = readStoredManualParticipantIds(eventId);
  selectedManualVendorIdsState = new Set(ids);
  if (!ids.length) return;

  const missingIds = ids.filter((id) => !vendorOptionCache.has(id) && !vendorOptions.some((vendor) => String(vendor.id) === id));
  if (!missingIds.length) return;
  hydrateVendorOptionIds(missingIds)
    .then((rows) => {
      if (selectedEventId !== eventId) return;
      rememberSelectedVendorRows(rows);
      const loadedIds = new Set(rows.map((vendor) => String(vendor.id || "")).filter(Boolean));
      const retainedIds = [...selectedManualVendorIdsState].filter((id) => loadedIds.has(String(id)) || vendorOptionCache.has(String(id)));
      selectedManualVendorIdsState = new Set(retainedIds);
      persistManualParticipantSelection(eventId);
      renderManualShortlistControls();
    })
    .catch(() => {
      // Keep the stored selection intact; Carrier CRM can be retried without losing the bid draft.
    });
}

function rememberSelectedVendorRows(rows = []) {
  rows.forEach((row) => {
    const id = String(row?.id || "");
    if (id) vendorOptionCache.set(id, { ...(vendorOptionCache.get(id) || {}), ...row });
  });
}

async function hydrateVendorOptionIds(ids = []) {
  const requestedIds = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  const rows = [];
  for (let offset = 0; offset < requestedIds.length; offset += CRM_VENDOR_SEARCH_LIMIT) {
    const result = await fetchVendors({
      ids: requestedIds.slice(offset, offset + CRM_VENDOR_SEARCH_LIMIT),
      limit: CRM_VENDOR_SEARCH_LIMIT,
      offset: 0,
      view: "all",
      lightweight: true
    });
    const pageRows = result.rows || [];
    rows.push(...pageRows);
    mergeVendorOptionRows(pageRows);
  }
  return sortedVendorOptions(rows);
}

async function loadVendorSearchOptions() {
  const term = activeVendorSearchTerm();
  vendorSearchSequence += 1;
  const sequence = vendorSearchSequence;
  if (term.length < 2) {
    vendorSearchRows = [];
    vendorSearchTotal = 0;
    vendorSearchLoading = false;
    renderManualShortlistControls();
    return;
  }
  vendorSearchLoading = true;
  renderManualShortlistControls();
  try {
    const result = await fetchVendors({ limit: CRM_VENDOR_SEARCH_LIMIT, offset: 0, view: "all", lightweight: true, search: term });
    if (sequence !== vendorSearchSequence) return;
    const rows = result.rows || [];
    mergeVendorOptionRows(rows);
    vendorSearchRows = sortedVendorOptions(rows);
    vendorSearchTotal = Number(result.total || rows.length);
    vendorSearchLoading = false;
    renderManualShortlistControls();
    setStatus(
      manualShortlistStatus,
      rows.length
        ? `${formatNumber(vendorSearchTotal)} CRM match(es) found for "${term}". Showing the first ${formatNumber(rows.length)}.`
        : `No CRM carriers match "${term}".`,
      rows.length ? "success" : "neutral"
    );
  } catch (error) {
    if (sequence !== vendorSearchSequence) return;
    vendorSearchLoading = false;
    renderManualShortlistControls();
    setStatus(manualShortlistStatus, `CRM search failed: ${humanizeError(error)}`, "error");
  }
}

function queueVendorSearchLoad() {
  if (vendorSearchTimer) window.clearTimeout(vendorSearchTimer);
  vendorSearchTimer = window.setTimeout(loadVendorSearchOptions, 280);
}

function renderManualSegmentOptions() {
  if (!manualShortlistSegment) return;
  const currentValue = manualShortlistSegment.value || "all";
  const segmentOptions = participantTemplates().map((segment) => {
    const savedCount = segmentVendorIds(segment).length;
    const suffix = savedCount ? ` (${formatNumber(savedCount)})` : "";
    return `<option value="${escapeHtml(segment.id)}">${escapeHtml(segment.segment_name || "Saved participant template")}${suffix}</option>`;
  }).join("");
  manualShortlistSegment.innerHTML = `
    <option value="all">All active CRM carriers</option>
    <option value="procurement">Procurement / Pipeline (${formatNumber(vendorOptions.filter(isProcurementCarrier).length)})</option>
    ${segmentOptions}
  `;
  if ([...manualShortlistSegment.options].some((option) => option.value === currentValue)) {
    manualShortlistSegment.value = currentValue;
  }
}

function segmentCandidateRows(segmentId = selectedSegmentId()) {
  const activeRows = vendorOptions.filter((vendor) => vendorStageRank(vendor) < 9);
  const segment = participantTemplates().find((item) => item.id === segmentId);
  return segmentId === "procurement"
    ? activeRows.filter(isProcurementCarrier)
    : segment
      ? activeRows.filter((vendor) => segmentMatchesVendor(segment, vendor))
      : activeRows;
}

async function loadSegmentCandidateRows(segmentId = selectedSegmentId()) {
  const segment = participantTemplates().find((item) => item.id === segmentId);
  const savedIds = segmentVendorIds(segment);
  if (savedIds.length) return await hydrateVendorOptionIds(savedIds);
  if (segmentId === "procurement") {
    const result = await fetchVendors({
      limit: CRM_VENDOR_SEARCH_LIMIT,
      offset: 0,
      view: "all",
      base_stage: "procurement",
      lightweight: true
    });
    const rows = result.rows || [];
    mergeVendorOptionRows(rows);
    return sortedVendorOptions(rows.filter(isProcurementCarrier));
  }
  if (segmentId === "all") {
    const result = await fetchVendors({ limit: CRM_VENDOR_SEARCH_LIMIT, offset: 0, view: "all", lightweight: true });
    const rows = result.rows || [];
    mergeVendorOptionRows(rows);
    return sortedVendorOptions(rows.filter((vendor) => vendorStageRank(vendor) < 9));
  }
  return sortedVendorOptions(segmentCandidateRows(segmentId));
}

function shortlistCandidateRows() {
  const rawTerm = activeVendorSearchTerm();
  const term = normalizeLookupText(rawTerm);
  const segmentRows = rawTerm.length >= 2 ? vendorSearchRows : segmentCandidateRows();
  // The server owns filtered search. Re-filtering here caused valid matches such
  // as accented legal names, secondary emails, and multi-word carrier names to vanish.
  const filtered = rawTerm.length >= 2
    ? segmentRows
    : segmentRows.filter((vendor) => !term || vendorSearchText(vendor).includes(term));
  return sortedVendorOptions(filtered);
}

function vendorLookupMaps() {
  const byId = new Map();
  const byDomain = new Map();
  const byEmail = new Map();
  const byName = new Map();
  vendorOptions.forEach((vendor) => {
    if (vendor.id && !byId.has(String(vendor.id))) byId.set(String(vendor.id), vendor);
    const domain = normalizeDomain(vendor.domain || vendor.primary_email);
    const email = String(vendor.primary_email || "").trim().toLowerCase();
    const name = normalizeLookupText(vendor.vendor_name);
    if (domain && !byDomain.has(domain)) byDomain.set(domain, vendor);
    if (email && !byEmail.has(email)) byEmail.set(email, vendor);
    if (name && !byName.has(name)) byName.set(name, vendor);
  });
  return { byId, byDomain, byEmail, byName };
}

function matchCarrierTemplateVendor(row, maps = vendorLookupMaps()) {
  const id = String(row.vendor_id || "").trim();
  if (id && maps.byId.has(id)) {
    return { vendor: maps.byId.get(id), method: "crm id" };
  }
  const domain = normalizeDomain(row.vendor_domain || row.vendor_email);
  if (domain && maps.byDomain.has(domain)) {
    return { vendor: maps.byDomain.get(domain), method: "domain" };
  }
  const email = String(row.vendor_email || "").trim().toLowerCase();
  if (email && maps.byEmail.has(email)) {
    return { vendor: maps.byEmail.get(email), method: "email" };
  }
  const name = normalizeLookupText(row.vendor_name);
  if (name && maps.byName.has(name)) {
    return { vendor: maps.byName.get(name), method: "name" };
  }
  return { vendor: null, method: "" };
}

function evaluateCarrierTemplateRows(rows = pendingCarrierTemplateRows) {
  const maps = vendorLookupMaps();
  return rows.map((row, index) => {
    const issues = [];
    const vendorMatch = matchCarrierTemplateVendor(row, maps);
    if (row.participate && !currentLanes.length) issues.push("no lanes in bid event");
    if (row.participate && !vendorMatch.vendor) issues.push("carrier not found in CRM");
    if (row.participate && !row.vendor_id && !row.vendor_domain && !row.vendor_email && !row.vendor_name) issues.push("carrier identifier missing");
    return {
      index,
      row,
      lanes: row.participate ? currentLanes : [],
      laneLabel: row.participate ? "All event lanes" : "Not selected",
      laneMethod: row.participate ? "event" : "not_selected",
      vendor: vendorMatch.vendor,
      vendorMethod: vendorMatch.method,
      issues
    };
  });
}

function readyCarrierTemplateMatches() {
  return pendingCarrierTemplateMatches.filter((item) => item.row.participate && !item.issues.length);
}

function updateCarrierTemplateButton() {
  if (!importCarrierTemplateButton) return;
  importCarrierTemplateButton.disabled = !selectedEventId || !readyCarrierTemplateMatches().length;
}

function renderCarrierTemplatePreview() {
  if (!carrierTemplatePreview || !carrierTemplatePreviewBody) return;
  pendingCarrierTemplateMatches = evaluateCarrierTemplateRows();
  const readyRows = readyCarrierTemplateMatches();
  const selectedRows = pendingCarrierTemplateMatches.filter((item) => item.row.participate);
  const skippedRows = pendingCarrierTemplateMatches.length - selectedRows.length;
  carrierTemplatePreview.hidden = !pendingCarrierTemplateMatches.length;
  const previewRows = [
    ...selectedRows,
    ...pendingCarrierTemplateMatches.filter((item) => !item.row.participate)
  ].slice(0, 18);
  carrierTemplatePreviewBody.innerHTML = previewRows.map((item) => {
    const input = item.row.vendor_domain || item.row.vendor_email || item.row.vendor_name || "-";
    const match = item.vendor ? `${vendorDisplayName(item.vendor)} (${item.vendorMethod})` : "-";
    const status = !item.row.participate ? "not selected" : item.issues.length ? item.issues.join(", ") : "ready";
    return `
      <tr class="${item.issues.length ? "is-muted-row" : ""}">
        <td>${item.row.participate ? "TRUE" : "FALSE"}</td>
        <td>${escapeHtml(input)}</td>
        <td>${escapeHtml(match)}</td>
        <td>${escapeHtml(status)}</td>
      </tr>
    `;
  }).join("");
  const blocked = selectedRows.length - readyRows.length;
  const suffix = selectedEventId ? "" : " Select or create a bid event before import.";
  const message = `${readyRows.length} selected carrier(s) ready. ${blocked} selected row(s) need CRM cleanup. ${skippedRows} catalog row(s) not selected.${suffix}`;
  setStatus(carrierTemplateStatus, message, readyRows.length ? "success" : "error");
  updateCarrierTemplateButton();
}

function clearCarrierTemplateImport({ preserveStatus = false } = {}) {
  pendingCarrierTemplateRows = [];
  pendingCarrierTemplateMatches = [];
  if (carrierTemplateFileInput) carrierTemplateFileInput.value = "";
  if (carrierTemplatePreview) carrierTemplatePreview.hidden = true;
  if (carrierTemplatePreviewBody) carrierTemplatePreviewBody.innerHTML = "";
  if (!preserveStatus) setStatus(carrierTemplateStatus, "Upload the edited CRM catalog to import TRUE participant carriers.");
  updateCarrierTemplateButton();
}

function renderCrmVendorCandidate(row) {
  const isSelected = selectedManualVendorIdsState.has(row.id);
  return `
    <article class="bid-room-crm-vendor-option ${isSelected ? "is-selected" : ""}">
      <span class="crm-vendor-main">
        <strong>${escapeHtml(vendorDisplayName(row))}</strong>
      </span>
      <button class="secondary small-button" type="button" data-add-manual-vendor="${escapeHtml(row.id)}" ${isSelected ? "disabled" : ""}>
        ${isSelected ? "Selected" : "Add"}
      </button>
    </article>
  `;
}

function selectedManualVendorIds() {
  return [...selectedManualVendorIdsState];
}

function activeEventParticipantVendorIds() {
  const ids = new Set();
  currentLanes.forEach((lane) => {
    activeInvitations(lane).forEach((invitation) => {
      const vendorId = String(invitation?.vendor_id || "").trim();
      if (vendorId) ids.add(vendorId);
    });
  });
  return ids;
}

function isCurrentRfxCarrierResponse(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const direction = String(row.direction || "").trim().toLowerCase();
  const signal = [
    row.status,
    row.event_status,
    row.provider_response_status,
    row.delivery_status,
    row.outcome,
    metadata.status,
    metadata.event_status,
    metadata.provider_response_status,
    metadata.delivery_status,
    metadata.outcome,
    metadata.last_event
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join(" ");
  return direction === "inbound" || /\b(replied|responded|quoted|quote|bid_submitted|declined|rejected|withdrawn)\b/.test(signal);
}

function currentRfxManagedVendorIds() {
  const ids = activeEventParticipantVendorIds();
  // A queued, sent, or archived event message means this carrier has already
  // been handled for this RFx. Never recycle it into Carrier fit by accident.
  outreachMessages.forEach((row) => {
    if (String(row?.rfx_event_id || "") !== String(selectedEventId || "")) return;
    const vendorId = String(row?.vendor_id || "").trim();
    if (vendorId) ids.add(vendorId);
  });
  contactHistoryRows.forEach((row) => {
    if (String(row?.rfx_event_id || "") !== String(selectedEventId || "")) return;
    if (!isCurrentRfxCarrierResponse(row)) return;
    const vendorId = String(row?.vendor_id || "").trim();
    if (vendorId) ids.add(vendorId);
  });
  return ids;
}

function removeExistingEventParticipantsFromSelection() {
  if (!selectedEventId || !selectedManualVendorIdsState.size) return 0;
  const participantIds = currentRfxManagedVendorIds();
  if (!participantIds.size) return 0;
  const before = selectedManualVendorIdsState.size;
  selectedManualVendorIdsState = new Set(
    [...selectedManualVendorIdsState].filter((vendorId) => !participantIds.has(String(vendorId)))
  );
  const removed = before - selectedManualVendorIdsState.size;
  if (removed) persistManualParticipantSelection();
  return removed;
}

function visibleManualVendorIds() {
  return shortlistCandidateRows().slice(0, 80).map((vendor) => vendor.id).filter(Boolean);
}

function selectManualVendorIds(ids = []) {
  const candidates = shortlistCandidateRows();
  rememberSelectedVendorRows(candidates.filter((vendor) => ids.includes(vendor.id)));
  ids.forEach((id) => {
    if (id) selectedManualVendorIdsState.add(id);
  });
  persistManualParticipantSelection();
  renderManualShortlistControls();
}

function participantTemplatePayload(segment, vendorIds, name) {
  return {
    segment_name: name || segment?.segment_name || "Bid participant template",
    segment_type: "participant_template",
    vendor_ids: vendorIds,
    tags: Array.isArray(segment?.tags) && segment.tags.length ? segment.tags : ["bid-room-template"],
    description: segment?.description || `Bid Room participant template with ${vendorIds.length} carrier(s).`,
    notes: segment?.notes || "Saved from Bid Room selected participants.",
    status: segment?.status || null,
    preferred_channel: segment?.preferred_channel || null
  };
}

function selectedManualVendorRows() {
  const selectedIds = selectedManualVendorIds();
  const rows = selectedIds
    .map((id) => vendorOptionCache.get(String(id)) || vendorOptions.find((vendor) => String(vendor.id) === String(id)))
    .filter(Boolean);
  return sortedVendorOptions(rows);
}

function renderSelectedManualVendors() {
  if (!manualShortlistSelectedList || !manualShortlistSelectedCount) return;
  const selectedIds = selectedManualVendorIds();
  const rows = selectedManualVendorRows();
  manualShortlistSelectedCount.textContent = `${formatNumber(selectedIds.length)} selected`;
  if (!selectedIds.length) {
    manualShortlistSelectedList.innerHTML = `
      <article class="bid-room-selected-empty">
        <strong>No carriers selected</strong>
        <span>Use the CRM list or load a saved carrier list.</span>
      </article>
    `;
    return;
  }
  const loadedIds = new Set(rows.map((vendor) => String(vendor.id)));
  const pendingRows = selectedIds.filter((id) => !loadedIds.has(String(id))).map((id) => `
    <article class="bid-room-selected-row is-loading">
      <strong>Loading selected carrier...</strong>
      <button class="secondary small-button" type="button" data-remove-manual-vendor="${escapeHtml(id)}">Move back</button>
    </article>
  `).join("");
  manualShortlistSelectedList.innerHTML = `${rows.map((vendor) => `
    <article class="bid-room-selected-row">
      <strong>${escapeHtml(vendorDisplayName(vendor))}</strong>
      <button class="secondary small-button" type="button" data-remove-manual-vendor="${escapeHtml(vendor.id)}">Move back</button>
    </article>
  `).join("")}${pendingRows}`;
}

function updateManualShortlistButtonState() {
  if (!manualShortlistButton) return;
  const selectedCount = selectedManualVendorIds().length;
  manualShortlistButton.disabled = participantAddRunning || !selectedEventId || !currentLanes.length || !selectedCount;
  if (!selectedEventId) {
    manualShortlistButton.textContent = selectedCount ? "Create event to add selected" : "Add selected to bid";
    return;
  }
  if (!currentLanes.length) {
    manualShortlistButton.textContent = selectedCount ? "Import lane book to add selected" : "Add selected to bid";
    return;
  }
  manualShortlistButton.textContent = selectedCount ? `Add ${formatNumber(selectedCount)} selected to bid` : "Add selected to bid";
}

function activeOutreachCarrierLanes() {
  const laneId = String(rfxOutreachCarrierLane?.value || "all");
  const lane = laneId !== "all" ? currentLanes.find((item) => String(item.id) === laneId) : null;
  return lane ? [lane] : currentLanes;
}

function rfxCarrierRecommendationConfig() {
  const lanes = currentLanes || [];
  const text = lanes.map((lane) => [lane.origin, lane.destination, lane.equipment, lane.operation, lane.service].filter(Boolean).join(" ")).join(" ").toLowerCase();
  const operationText = lanes.map((lane) => String(lane.operation || "")).join(" ").toLowerCase();
  return {
    limit: 100,
    ranking_mode: "fit",
    filters: {
      crossborder: /crossborder|border|d2d/.test(text),
      d2d: /d2d|door.?to.?door/.test(operationText),
      equipment: lanes.map((lane) => lane.equipment).filter(Boolean).join(" | "),
      operation: lanes.map((lane) => lane.operation).filter(Boolean).join(" | "),
      service: lanes.map((lane) => lane.service).filter(Boolean).join(" | "),
      origin: lanes.map((lane) => lane.origin).filter(Boolean).slice(0, 4).join(" | "),
      destination: lanes.map((lane) => lane.destination).filter(Boolean).slice(0, 4).join(" | ")
    }
  };
}

async function loadRfxCarrierFitEvidence({ force = false } = {}) {
  const eventId = selectedEventId;
  if (!eventId || !currentLanes.length) {
    rfxCarrierFitEvidenceByVendorId = new Map();
    rfxCarrierFitEvidenceLoading = false;
    rfxCarrierFitEvidenceError = "";
    renderOutreachCarrierAdder();
    return;
  }
  const loadVersion = ++rfxCarrierFitEvidenceLoadVersion;
  rfxCarrierFitEvidenceLoading = true;
  rfxCarrierFitEvidenceError = "";
  renderOutreachCarrierAdder();
  try {
    const result = await fetchCarrierRecommendations(rfxCarrierRecommendationConfig());
    if (loadVersion !== rfxCarrierFitEvidenceLoadVersion || eventId !== selectedEventId) return;
    rfxCarrierFitEvidenceByVendorId = new Map(
      (Array.isArray(result?.recommendations) ? result.recommendations : [])
        .filter((row) => row?.vendor_id)
        .map((row) => [String(row.vendor_id), row])
    );
  } catch (error) {
    if (loadVersion !== rfxCarrierFitEvidenceLoadVersion || eventId !== selectedEventId) return;
    rfxCarrierFitEvidenceError = "Rateware quote evidence is temporarily unavailable. CRM profile matching is still active.";
  } finally {
    if (loadVersion === rfxCarrierFitEvidenceLoadVersion && eventId === selectedEventId) {
      rfxCarrierFitEvidenceLoading = false;
      renderOutreachCarrierAdder();
    }
  }
}

function carrierFitEvidence(vendor) {
  const recommendation = rfxCarrierFitEvidenceByVendorId.get(String(vendor.id || "")) || {};
  const metrics = recommendation.metrics && typeof recommendation.metrics === "object" ? recommendation.metrics : {};
  const linkedRates = Number(metrics.linked_rates || 0);
  const approvedRates = Number(metrics.approved_rates || 0);
  const bidSignals = Number(metrics.d2d_import_export_rates || metrics.crossborder_rates || 0);
  const profileSignals = [
    vendor.coverage_notes ? "declared coverage" : "",
    Array.isArray(vendor.tags) && vendor.tags.length ? `tags: ${vendor.tags.slice(0, 2).join(", ")}` : "",
    vendor.primary_email || vendor.whatsapp_phone ? "contact ready" : ""
  ].filter(Boolean);
  const rateSignals = [
    approvedRates ? `${approvedRates} approved rate${approvedRates === 1 ? "" : "s"}` : "",
    linkedRates ? `${linkedRates} linked quote${linkedRates === 1 ? "" : "s"}` : "",
    bidSignals ? `${bidSignals} crossborder signal${bidSignals === 1 ? "" : "s"}` : ""
  ].filter(Boolean);
  return {
    recommendation,
    profileSignals,
    rateSignals,
    hasRatewareEvidence: rateSignals.length > 0,
    score: Number(recommendation.fit_score || 0)
  };
}

function rfxCarrierFitTerms(value, type) {
  const normalized = normalizeLookupText(value);
  if (!normalized) return [];
  const terms = [normalized];
  if (type === "equipment" && /truck trailer|tractor trailer|trailer/.test(normalized)) {
    terms.push("dry van", "reefer", "flatbed", "step deck", "tractor trailer", "truckload", "ftl");
  }
  if (type === "equipment" && /dry van|reefer|flatbed|step deck/.test(normalized)) {
    terms.push("truck trailer", "tractor trailer", "truckload", "ftl");
  }
  if (type === "operation") {
    if (/d2d|door to door|crossborder|cross border/.test(normalized)) {
      terms.push("d2d", "door to door", "crossborder", "cross border", "mx us", "us mx", "mexico usa");
    }
    if (/export/.test(normalized)) terms.push("export", "northbound", "mexico usa", "mx us");
    if (/import/.test(normalized)) terms.push("import", "southbound", "usa mexico", "us mx");
  }
  if (type === "service" && /one way|roundtrip|round trip/.test(normalized)) {
    terms.push("one way", "roundtrip", "round trip", "dedicated", "spot");
  }
  return [...new Set(terms.map(normalizeLookupText).filter(Boolean))];
}

function rfxCarrierFieldMatches(haystack, value, type) {
  return rfxCarrierFitTerms(value, type).some((term) => haystack.includes(term));
}

function fitCarrierToOutreachLanes(vendor) {
  const haystack = vendorSearchText(vendor);
  const lanes = activeOutreachCarrierLanes();
  const evidence = carrierFitEvidence(vendor);
  const stageBonus = isProcurementCarrier(vendor) ? 12 : vendorStageRank(vendor) < 9 ? 4 : 0;
  const laneFits = lanes.map((lane) => {
    const matches = {
      equipment: [lane.equipment, lane.trailer, lane.configuration].some((value) => rfxCarrierFieldMatches(haystack, value, "equipment")),
      operation: rfxCarrierFieldMatches(haystack, lane.operation, "operation"),
      service: rfxCarrierFieldMatches(haystack, lane.service, "service")
    };
    const matchCount = Object.values(matches).filter(Boolean).length;
    return {
      lane,
      matches,
      matchCount,
      score: (matches.equipment ? 38 : 0) + (matches.operation ? 30 : 0) + (matches.service ? 16 : 0)
    };
  });
  const bestLaneFit = laneFits.reduce((best, item) => item.score > best.score ? item : best, {
    lane: null,
    matches: { equipment: false, operation: false, service: false },
    matchCount: 0,
    score: 0
  });
  const coverageCount = laneFits.filter((item) => item.matchCount > 0).length;
  const contactable = Boolean(vendor.primary_email || vendor.whatsapp_phone || (Array.isArray(vendor.secondary_emails) && vendor.secondary_emails.length));
  const score = Math.min(100, bestLaneFit.score + stageBonus + (contactable ? 4 : 0) + Math.round(evidence.score / 12));
  const reasons = [
    bestLaneFit.matches.equipment ? `equipment: ${bestLaneFit.lane?.equipment || ""}` : "",
    bestLaneFit.matches.operation ? `operation: ${bestLaneFit.lane?.operation || ""}` : "",
    bestLaneFit.matches.service ? `service: ${bestLaneFit.lane?.service || ""}` : "",
    isProcurementCarrier(vendor) ? "procurement/pipeline" : "",
    contactable ? "contact available" : "",
    ...evidence.rateSignals.slice(0, 2)
  ].filter(Boolean);
  return {
    score,
    hasAnyLaneFit: coverageCount > 0,
    hasRatewareEvidence: evidence.hasRatewareEvidence,
    evidence,
    coverageCount,
    laneCount: lanes.length,
    contactable,
    matches: bestLaneFit.matches,
    reasons,
    label: coverageCount
      ? `${coverageCount}/${lanes.length || 1} lane${lanes.length === 1 ? "" : "s"} matched`
      : evidence.hasRatewareEvidence
        ? "Rateware evidence found"
        : "No declared lane fit"
  };
}

function renderOutreachCarrierFitControls() {
  const scope = String(rfxOutreachCarrierScope?.value || "recommended");
  const selectedLane = String(rfxOutreachCarrierLane?.value || "all");
  if (rfxOutreachCarrierLane) {
    rfxOutreachCarrierLane.innerHTML = [
      '<option value="all">All event lanes</option>',
      ...currentLanes.map((lane) => `<option value="${escapeHtml(lane.id)}">#${escapeHtml(lane.lane_number || lane.lane_id || "")} ${escapeHtml(lane.origin || "-")} -> ${escapeHtml(lane.destination || "-")}</option>`)
    ].join("");
    if ([...rfxOutreachCarrierLane.options].some((option) => option.value === selectedLane)) {
      rfxOutreachCarrierLane.value = selectedLane;
    }
  }
  if (rfxOutreachCarrierSegment) {
    const selectedSegment = String(rfxOutreachCarrierSegment.value || "");
    rfxOutreachCarrierSegment.innerHTML = [
      '<option value="">Choose a saved carrier list</option>',
      ...participantTemplates().map((segment) => `<option value="${escapeHtml(segment.id)}">${escapeHtml(segment.segment_name || "Saved carrier list")} (${formatNumber(segmentVendorIds(segment).length)})</option>`)
    ].join("");
    if (selectedSegment && [...rfxOutreachCarrierSegment.options].some((option) => option.value === selectedSegment)) {
      rfxOutreachCarrierSegment.value = selectedSegment;
    }
  }
  if (rfxOutreachCarrierSegmentField) rfxOutreachCarrierSegmentField.hidden = scope !== "saved_segment";
}

function outreachCarrierCandidateRows() {
  const scope = String(rfxOutreachCarrierScope?.value || "recommended");
  const fitFilter = String(rfxOutreachCarrierFit?.value || "any");
  const search = String(rfxOutreachCarrierSearch?.value || "").trim().replace(/\s+/g, " ");
  const selectedSegmentId = String(rfxOutreachCarrierSegment?.value || "");
  const searchRows = search.length >= 2 ? vendorSearchRows : [];
  let rows = searchRows.length ? searchRows : vendorOptions.filter((vendor) => vendorStageRank(vendor) < 9);
  if (scope === "procurement") rows = rows.filter(isProcurementCarrier);
  if (scope === "saved_segment") {
    const segment = participantTemplates().find((item) => String(item.id) === selectedSegmentId);
    rows = segment ? rows.filter((vendor) => segmentMatchesVendor(segment, vendor)) : [];
  }
  const existingParticipantIds = currentRfxManagedVendorIds();
  const candidates = rows
    .filter((vendor) => !existingParticipantIds.has(String(vendor.id || "")))
    .map((vendor) => ({ vendor, fit: fitCarrierToOutreachLanes(vendor) }))
    .filter(({ fit }) => {
    if (scope === "recommended" && !fit.hasAnyLaneFit && !fit.hasRatewareEvidence) return false;
    if (fitFilter === "equipment") return fit.matches.equipment;
    if (fitFilter === "operation") return fit.matches.operation;
    if (fitFilter === "service") return fit.matches.service;
    if (fitFilter === "contactable") return fit.contactable;
    return true;
    });
  return candidates.sort((left, right) => {
    const scoreDelta = right.fit.score - left.fit.score;
    return scoreDelta || vendorDisplayName(left.vendor).localeCompare(vendorDisplayName(right.vendor));
  });
}

function renderOutreachCarrierAdder() {
  if (!rfxOutreachCarrierAdder || !rfxOutreachCarrierCandidates || !rfxOutreachCarrierSelected) return;
  renderOutreachCarrierFitControls();
  const removedExistingSelectionCount = removeExistingEventParticipantsFromSelection();
  const scope = String(rfxOutreachCarrierScope?.value || "recommended");
  const search = String(rfxOutreachCarrierSearch?.value || "").trim().replace(/\s+/g, " ");
  const selectedIds = selectedManualVendorIds();
  const selectedRows = selectedManualVendorRows();
  const candidates = outreachCarrierCandidateRows();
  const visibleRows = candidates.slice(0, 50);
  const scopeLabel = {
    recommended: "recommended",
    procurement: "procurement/pipeline",
    all_active: "active CRM",
    saved_segment: "saved list"
  }[scope] || "CRM";

  if (rfxOutreachCarrierMatchCount) {
    rfxOutreachCarrierMatchCount.textContent = vendorSearchLoading
      ? "Searching Carrier CRM..."
      : `${formatNumber(candidates.length)} ${scopeLabel} carrier${candidates.length === 1 ? "" : "s"}`;
  }
  if (rfxOutreachCarrierFitSummary) {
    rfxOutreachCarrierFitSummary.textContent = vendorOptionsLoading
      ? "Loading first CRM profiles"
      : search.length >= 2
        ? `${formatNumber(vendorSearchTotal)} CRM search result${vendorSearchTotal === 1 ? "" : "s"}`
        : vendorOptionsHydrating
          ? `${formatNumber(vendorOptions.length)} / ${formatNumber(vendorInitialTotal || vendorOptions.length)} profiles scanned`
          : rfxCarrierFitEvidenceLoading
            ? `${formatNumber(candidates.length)} fit | checking Rateware evidence`
            : rfxCarrierFitEvidenceError
              ? "CRM fit ready | Rateware evidence unavailable"
            : vendorOptionsError
              ? "Carrier CRM needs refresh"
              : `${formatNumber(candidates.length)} carriers fit this RFx`;
    rfxOutreachCarrierFitSummary.className = `status-pill ${vendorOptionsError || rfxCarrierFitEvidenceError ? "warning" : candidates.length ? "success" : "muted"}`;
  }
  if (removedExistingSelectionCount) {
    setStatus(
      rfxOutreachCarrierStatus,
      `${formatNumber(removedExistingSelectionCount)} carrier${removedExistingSelectionCount === 1 ? " was" : "s were"} removed from the temporary selection because ${removedExistingSelectionCount === 1 ? "it is" : "they are"} already managed in this RFx. Use Delivery queue to follow up or re-invite.`,
      "neutral"
    );
  }
  if (rfxOutreachCarrierSelectedCount) {
    rfxOutreachCarrierSelectedCount.textContent = `${formatNumber(selectedIds.length)} selected`;
  }
  if (rfxRefreshOutreachCarrierFitButton) {
    rfxRefreshOutreachCarrierFitButton.disabled = vendorOptionsLoading || rfxCarrierFitEvidenceLoading;
  }
  rfxOutreachCarrierAdder.classList.toggle("is-empty", !vendorOptionsLoading && !visibleRows.length);

  rfxOutreachCarrierCandidates.innerHTML = vendorOptionsLoading
    ? '<p class="rfx-outreach-carrier-empty">Loading the first Carrier CRM profiles. Search remains available as soon as the first page arrives.</p>'
    : visibleRows.length
      ? visibleRows.map(({ vendor, fit }) => {
        const selected = selectedManualVendorIdsState.has(vendor.id);
        const fitCopy = fit.reasons.length ? fit.reasons.join(" | ") : "No equipment, operation, or service coverage declared in Carrier CRM";
        const profileCopy = fit.evidence.profileSignals.length
          ? `Profile: ${fit.evidence.profileSignals.join(" | ")}`
          : "Profile: no coverage, tags, or contact detail declared";
        const evidenceCopy = fit.evidence.rateSignals.length
          ? `Rateware: ${fit.evidence.rateSignals.join(" | ")}`
          : rfxCarrierFitEvidenceLoading
            ? "Rateware evidence is loading"
            : rfxCarrierFitEvidenceError
              ? "Rateware evidence temporarily unavailable"
            : "Rateware: no linked quote evidence yet";
        return `
          <article class="rfx-outreach-carrier-row ${selected ? "is-selected" : ""}">
            <div class="rfx-outreach-carrier-row-main">
              <strong>${escapeHtml(vendorDisplayName(vendor))}</strong>
              <small title="${escapeHtml(`${fitCopy} | ${profileCopy} | ${evidenceCopy}`)}">${escapeHtml(fit.label)} | ${escapeHtml(fitCopy)}</small>
              <small class="rfx-outreach-fit-detail" title="${escapeHtml(`${profileCopy} | ${evidenceCopy}`)}">${escapeHtml(profileCopy)} | ${escapeHtml(evidenceCopy)}</small>
            </div>
            <button class="secondary small-button" type="button" data-rfx-outreach-add-carrier="${escapeHtml(vendor.id)}" ${selected ? "disabled" : ""}>${selected ? "Added" : "Add"}</button>
          </article>
        `;
      }).join("")
      : `<div class="rfx-outreach-carrier-empty">${vendorOptionsError
        ? `${escapeHtml(vendorOptionsError)} Use Refresh fit to try again, or search Carrier CRM by name, domain, or contact.`
        : scope === "recommended"
          ? "No direct CRM or Rateware evidence matched this lane book yet. Review active CRM carriers or complete carrier coverage before inviting."
          : "No Carrier CRM records match these filters. Adjust route, fit signal, search, or saved list."}${scope === "recommended" && !vendorOptionsError ? '<button type="button" class="secondary small-button" data-rfx-outreach-show-all-active>Review active CRM</button>' : ""}</div>`;

  const loadedIds = new Set(selectedRows.map((vendor) => String(vendor.id)));
  const pendingRows = selectedIds.filter((id) => !loadedIds.has(String(id))).map((id) => `
    <article class="rfx-outreach-carrier-row is-loading">
      <strong>Loading selected carrier...</strong>
      <button class="secondary small-button" type="button" data-rfx-outreach-remove-carrier="${escapeHtml(id)}">Remove</button>
    </article>
  `).join("");
  rfxOutreachCarrierSelected.innerHTML = selectedIds.length
    ? `${selectedRows.map((vendor) => `
      <article class="rfx-outreach-carrier-row is-selected">
        <div class="rfx-outreach-carrier-row-main">
          <strong>${escapeHtml(vendorDisplayName(vendor))}</strong>
          <small>${escapeHtml(fitCarrierToOutreachLanes(vendor).label)}</small>
        </div>
        <button class="secondary small-button" type="button" data-rfx-outreach-remove-carrier="${escapeHtml(vendor.id)}">Remove</button>
      </article>
    `).join("")}${pendingRows}`
    : '<p class="rfx-outreach-carrier-empty">Select new carriers here, then add them to the Bid Room. Carriers already in this RFx stay in Delivery queue for follow-up.</p>';

  if (rfxAddOutreachCarriersButton) {
    rfxAddOutreachCarriersButton.disabled = participantAddRunning || !selectedEventId || !currentLanes.length || !selectedIds.length;
    rfxAddOutreachCarriersButton.textContent = selectedIds.length ? `Add ${formatNumber(selectedIds.length)} to Bid Room` : "Add to this Bid Room";
  }
  if (rfxClearOutreachCarrierSelectionButton) {
    rfxClearOutreachCarrierSelectionButton.disabled = participantAddRunning || !selectedIds.length;
  }
}

function updateParticipantTemplateControls() {
  const selectedCount = selectedManualVendorIds().length;
  const selectedSegment = selectedSavedVendorSegment();
  if (saveManualShortlistTemplateButton) {
    saveManualShortlistTemplateButton.disabled = !selectedCount || vendorSegmentsLoading || participantTemplateMutationRunning;
  }
  if (loadManualShortlistTemplateButton) {
    const segmentId = selectedSegmentId();
    const rows = segmentId === "all" ? [] : segmentCandidateRows(segmentId);
    const savedIds = segmentVendorIds(selectedSegment);
    const availableCount = savedIds.length || rows.length || (segmentId === "procurement" ? vendorInitialTotal : 0);
    loadManualShortlistTemplateButton.disabled = vendorSegmentsLoading || participantTemplateMutationRunning || !availableCount;
    loadManualShortlistTemplateButton.textContent = availableCount
      ? `Load ${formatNumber(availableCount)} from saved list`
      : "Load saved list";
  }
  if (updateManualShortlistTemplateButton) {
    updateManualShortlistTemplateButton.disabled = !selectedSegment || !selectedCount || vendorSegmentsLoading || participantTemplateMutationRunning;
  }
  if (deleteManualShortlistTemplateButton) {
    deleteManualShortlistTemplateButton.disabled = !selectedSegment || vendorSegmentsLoading || participantTemplateMutationRunning;
  }
}

function renderManualShortlistControls() {
  if (!manualShortlistLane || !manualShortlistVendors) return;
  renderSelectedManualVendors();
  renderManualSegmentOptions();
  manualShortlistLane.innerHTML = currentLanes.map((lane) => `
    <option value="${escapeHtml(lane.id)}">#${escapeHtml(lane.lane_number || "")} ${escapeHtml(lane.origin || "-")} -> ${escapeHtml(lane.destination || "-")}</option>
  `).join("");
  const procurementCount = vendorOptions.filter(isProcurementCarrier).length;
  const activeSearch = activeVendorSearchTerm();
  if (manualShortlistSourceSummary) {
    manualShortlistSourceSummary.textContent = vendorOptionsLoading
      ? `Loading Carrier CRM${vendorOptions.length ? `... ${formatNumber(vendorOptions.length)} carrier(s) ready so far` : "..."}`
      : vendorSearchLoading
        ? "Searching the full Carrier CRM..."
        : activeSearch.length >= 2
          ? `${formatNumber(vendorSearchTotal)} CRM match(es) for "${activeSearch}" | ${vendorSegmentsLoading ? "loading segments" : `${savedVendorSegments.length} saved segment(s)`}`
          : `${formatNumber(vendorOptions.length)} of ${formatNumber(vendorInitialTotal || vendorOptions.length)} CRM carrier(s) ready | ${procurementCount} in Procurement/Pipeline | ${vendorSegmentsLoading ? "loading segments" : `${savedVendorSegments.length} saved segment(s)}`}`;
  }
  if (vendorOptionsLoading && !vendorOptions.length) {
    if (selectVisibleCarriersButton) selectVisibleCarriersButton.disabled = true;
    if (selectSegmentCarriersButton) selectSegmentCarriersButton.disabled = true;
    if (clearCarrierSelectionButton) clearCarrierSelectionButton.disabled = true;
    updateParticipantTemplateControls();
    manualShortlistVendors.innerHTML = "";
    if (manualShortlistVendorList) {
      manualShortlistVendorList.innerHTML = `
        <article class="bid-room-crm-vendor-empty">
          <strong>Loading Carrier CRM...</strong>
          <span>Fetching carriers, procurement vendors, and saved segments.</span>
        </article>
      `;
    }
    updateManualShortlistButtonState();
    renderOutreachCarrierAdder();
    return;
  }
  if (!vendorOptions.length) {
    if (selectVisibleCarriersButton) selectVisibleCarriersButton.disabled = true;
    if (selectSegmentCarriersButton) selectSegmentCarriersButton.disabled = true;
    if (clearCarrierSelectionButton) clearCarrierSelectionButton.disabled = true;
    updateParticipantTemplateControls();
    manualShortlistVendors.innerHTML = "";
    if (manualShortlistVendorList) {
      manualShortlistVendorList.innerHTML = `
        <article class="bid-room-crm-vendor-empty">
          <strong>No CRM carriers loaded.</strong>
          <span>Refresh the page or check Carrier CRM. You can still upload a participant catalog after CRM is available.</span>
        </article>
      `;
    }
    updateManualShortlistButtonState();
    renderOutreachCarrierAdder();
    return;
  }
  const rows = shortlistCandidateRows();
  if (selectVisibleCarriersButton) selectVisibleCarriersButton.disabled = !rows.length;
  if (selectSegmentCarriersButton) selectSegmentCarriersButton.disabled = !rows.length;
  if (clearCarrierSelectionButton) clearCarrierSelectionButton.disabled = !selectedManualVendorIdsState.size;
  manualShortlistVendors.innerHTML = rows.map((vendor) => `
    <option value="${escapeHtml(vendor.id)}">${escapeHtml(vendorDisplayName(vendor))} | ${escapeHtml(vendor.base_stage || "crm")} | ${escapeHtml(vendor.primary_email || vendor.domain || "")}</option>
  `).join("");
  if (manualShortlistVendorList) {
    const visibleRows = rows.slice(0, 80);
    const totalMatches = activeSearch.length >= 2 ? vendorSearchTotal : rows.length;
    const listSummary = `
      <div class="bid-room-crm-list-summary">
        <strong>Carrier CRM candidates</strong>
        <span>${vendorSearchLoading ? "Searching CRM..." : `Showing ${Math.min(visibleRows.length, rows.length)} of ${formatNumber(totalMatches)} matching carriers.`}</span>
      </div>
    `;
    manualShortlistVendorList.innerHTML = visibleRows.length ? `${listSummary}${visibleRows.map(renderCrmVendorCandidate).join("")}` : vendorSearchLoading ? `
      ${listSummary}
      <article class="bid-room-crm-vendor-empty">
        <strong>Searching Carrier CRM...</strong>
        <span>Looking across vendor name, domain, contact, email, tags, notes and coverage.</span>
      </article>
    ` : `
      <article class="bid-room-crm-vendor-empty">
        <strong>No CRM carriers match this search.</strong>
        <span>Clear the search or add/update carriers in Carrier CRM.</span>
      </article>
    `;
    manualShortlistVendorList.dataset.totalMatches = String(totalMatches);
  }
  updateManualShortlistButtonState();
  updateParticipantTemplateControls();
  renderOutreachCarrierAdder();
}

function renderLanes() {
  selectedLaneIds = new Set([...selectedLaneIds].filter((id) => currentLanes.some((lane) => lane.id === id)));
  selectedInvitationIds = new Set([...selectedInvitationIds].filter((id) => currentLanes.some((lane) => (lane.invitations || []).some((invite) => invite.id === id))));
  updateSelectionControls();
  updateLaneEditControls();
  renderManualShortlistControls();
  if (pendingCarrierTemplateRows.length) renderCarrierTemplatePreview();
  renderEventDashboard();
  renderLaneCoverage();
  renderLaneDecision();
  renderResponseBoard();
  renderOutreachLaunchpad();
  renderLiveOfferManager();
  renderAwardBoard();
  renderWizard();

  if (!selectedEventId) {
    updateLaneEditControls();
    lanesBody.innerHTML = tableState(22, {
      tone: "neutral",
      eyebrow: "Business book",
      title: "Select an event to load lanes",
      detail: "Choose a bid event from the left panel or create a new event."
    });
    return;
  }
  if (!currentLanes.length) {
    updateLaneEditControls();
    lanesBody.innerHTML = tableState(22, {
      tone: "neutral",
      eyebrow: "Business book",
      title: "No lanes in this RFx yet",
      detail: "Paste lane rows above to build this spot/RFx book before inviting vendors."
    });
    return;
  }
  const lanes = visibleLanes();
  if (!lanes.length) {
    lanesBody.innerHTML = tableState(22, {
      tone: "neutral",
      eyebrow: "Filtered lanes",
      title: "No lanes match current filters",
      detail: "Change the decision filter or search criteria to review more lanes."
    });
    return;
  }
  lanesBody.innerHTML = lanes.map((lane) => {
    const benchmark = lane.benchmark;
    const invitations = lane.invitations || [];
    const bestBid = bestBidForLane(lane);
    const decision = laneDecisionStatus(lane);
    if (laneEditMode && (!editingLaneId || String(editingLaneId) === String(lane.id))) {
      return renderEditableLaneRow(lane, { benchmark, bestBid, decision });
    }
    return `
      <tr data-rfx-lane-id="${escapeHtml(lane.id)}" class="${lane.id === focusedLaneId ? "is-selected-lane" : ""}">
        <td>
          <button class="secondary small-button rfx-inline-lane-action" type="button" data-rfx-inline-edit="${escapeHtml(lane.id)}" title="Edit this lane">Edit</button>
        </td>
        <td>
          <label class="table-checkbox">
            <input type="checkbox" data-rfx-lane-select="${escapeHtml(lane.id)}" ${selectedLaneIds.has(lane.id) ? "checked" : ""} />
          </label>
        </td>
        <td title="${escapeHtml(laneDecisionLabel(decision))}">
          <strong>#${escapeHtml(lane.lane_number || "")}</strong>
      </td>
        <td>${escapeHtml(lane.origin || "-")}</td>
        <td>${escapeHtml(lane.destination || "-")}</td>
        <td>${escapeHtml(lane.equipment || "-")}</td>
        <td>${escapeHtml(lane.trailer || "-")}</td>
        <td>${escapeHtml(lane.config || "-")}</td>
        <td>${escapeHtml(lane.operation || "-")}</td>
        <td>${escapeHtml(lane.service || "-")}</td>
        <td>${formatNumber(lane.weekly_volume)} / wk</td>
        <td>${formatMoney(lane.target_rate, lane.currency)}</td>
        <td>${escapeHtml(lane.currency || "-")}</td>
        <td>${laneRubricCell(lane, "logistics_model")}</td>
        <td>${laneRubricCell(lane, "operation_criteria")}</td>
        <td>${laneRubricCell(lane, "business_rules")}</td>
        <td>${laneRubricCell(lane, "service_specifications")}</td>
        <td>${laneRubricCell(lane, "carrier_requirements")}</td>
        <td>${laneRubricCell(lane, "other_notes")}</td>
        <td>${laneRubricCell(lane, "notes")}</td>
        <td>
          ${renderSupplyDepthCell(lane, { bestBidLabel: bestBid ? `Best bid ${formatMoney(bestBid.board_rate ?? bestBid.numeric_bid ?? bestBid.bid_rate, bestBid.currency || lane.currency)}` : "" })}
        </td>
        <td>
          <div class="rfx-lane-progress-cell" title="${escapeHtml(`${invitations.length} participant${invitations.length === 1 ? "" : "s"} | ${invitations.filter(hasInvitationStarted).length} invited | ${bidInvitations(lane).length} bid${bidInvitations(lane).length === 1 ? "" : "s"}`)}">
            ${statusChip(laneDecisionLabel(decision))}
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

async function loadEvents({ force = false } = {}) {
  if (!force && rfxEventsLoadRequest) return rfxEventsLoadRequest;
  const promise = loadEventsRequest();
  rfxEventsLoadRequest = promise;
  try {
    return await promise;
  } finally {
    if (rfxEventsLoadRequest === promise) rfxEventsLoadRequest = null;
  }
}

async function loadEventsRequest() {
  const loadVersion = ++rfxEventsLoadVersion;
  try {
    const loadedEvents = await fetchRfxEvents();
    if (loadVersion !== rfxEventsLoadVersion) return;
    events = loadedEvents;
    const urlEventId = new URLSearchParams(window.location.search).get("rfx_event_id");
    if (!selectedEventId && urlEventId && events.some((event) => event.id === urlEventId)) {
      selectedEventId = urlEventId;
    }
    if (selectedEventId && !events.some((event) => event.id === selectedEventId)) {
      selectedEventId = null;
    }
    if (!selectedEventId && events[0]) selectedEventId = events[0].id;
    persistRfxWorkspaceContext();
    renderEvents();
    if (selectedEventId) await loadDetail(selectedEventId);
    else {
      selectedEvent = null;
      currentLanes = [];
      contactHistoryRows = [];
      outreachMessages = [];
      focusedLaneId = null;
      updateEventActionState();
      renderEventDashboard();
      renderLaneCoverage();
      renderLaneDecision();
      renderResponseBoard();
      renderOutreachLaunchpad();
      renderLiveOfferManager();
      renderAwardBoard();
      renderWizard();
    }
  } catch (error) {
    if (loadVersion !== rfxEventsLoadVersion) return;
    eventList.innerHTML = errorState(error, {
      title: "Bid events could not load",
      retryAction: "load-rfx-events",
      meta: "No Bid Room data was changed."
    });
    lanesBody.innerHTML = tableErrorState(8, error, {
      title: "Business book lanes could not load",
      retryAction: "load-rfx-events"
    });
    renderWizard();
  }
}

async function hydrateRemainingVendorOptions(loadVersion, total, nextOffset) {
  vendorOptionsHydrating = nextOffset < total;
  while (nextOffset < total && loadVersion === vendorOptionsLoadVersion) {
    try {
      const result = await fetchVendors({
        limit: CRM_VENDOR_PAGE_SIZE,
        offset: nextOffset,
        view: "all",
        lightweight: true
      });
      if (loadVersion !== vendorOptionsLoadVersion) return;
      const rows = result.rows || [];
      mergeVendorOptionRows(rows);
      nextOffset += rows.length;
      if (!rows.length) break;
      vendorOptionsHydrating = nextOffset < Number(result.total || total);
      renderManualShortlistControls();
    } catch (error) {
      if (loadVersion !== vendorOptionsLoadVersion) return;
      vendorOptionsHydrating = false;
      vendorOptionsError = `Carrier CRM is partially loaded (${formatNumber(vendorOptions.length)} profiles ready).`;
      renderManualShortlistControls();
      return;
    }
  }
  if (loadVersion === vendorOptionsLoadVersion) {
    vendorOptionsHydrating = false;
    renderManualShortlistControls();
  }
}

async function loadVendorOptions({ force = false } = {}) {
  const loadVersion = ++vendorOptionsLoadVersion;
  vendorOptionsLoading = true;
  vendorOptionsHydrating = false;
  vendorOptionsError = "";
  if (force) vendorOptions = [];
  vendorSearchRows = [];
  vendorSearchTotal = 0;
  vendorInitialTotal = 0;
  renderManualShortlistControls();
  try {
    const result = await fetchVendors({ limit: CRM_VENDOR_INITIAL_PAGE_SIZE, offset: 0, view: "all", lightweight: true });
    if (loadVersion !== vendorOptionsLoadVersion) return;
    const rows = result.rows || [];
    vendorInitialTotal = Number(result.total || rows.length);
    mergeVendorOptionRows(rows);
    vendorOptionsLoading = false;
    renderManualShortlistControls();
    if (pendingCarrierTemplateRows.length) renderCarrierTemplatePreview();
    if (rows.length < vendorInitialTotal) {
      void hydrateRemainingVendorOptions(loadVersion, vendorInitialTotal, rows.length);
    }
  } catch (error) {
    if (loadVersion !== vendorOptionsLoadVersion) return;
    vendorOptionsLoading = false;
    vendorOptionsError = vendorOptions.length
      ? `Carrier CRM partially loaded (${formatNumber(vendorOptions.length)} profiles ready).`
      : "Carrier CRM could not load.";
    renderManualShortlistControls();
    if (pendingCarrierTemplateRows.length) renderCarrierTemplatePreview();
    setStatus(
      manualShortlistStatus,
      vendorOptions.length
        ? `Carrier CRM partially loaded with ${formatNumber(vendorOptions.length)} carrier(s). ${humanizeError(error)}`
        : `Carrier CRM could not load. ${humanizeError(error)}`,
      vendorOptions.length ? "warning" : "error"
    );
  }
}

async function loadVendorSegments() {
  const loadVersion = ++vendorSegmentsLoadVersion;
  const previousSelection = selectedSegmentId();
  vendorSegmentsLoading = true;
  renderManualShortlistControls();
  try {
    const rows = await fetchVendorSegments({ segmentType: "participant_template" });
    if (loadVersion !== vendorSegmentsLoadVersion) return;
    savedVendorSegments = rows;
    if (manualShortlistSegment && previousSelection !== "all" && previousSelection !== "procurement") {
      manualShortlistSegment.value = participantTemplates().some((segment) => segment.id === previousSelection)
        ? previousSelection
        : "all";
    }
  } catch (error) {
    if (loadVersion !== vendorSegmentsLoadVersion) return;
    setStatus(manualShortlistStatus, `Carrier segments could not load: ${humanizeError(error)}`, "error");
  } finally {
    if (loadVersion !== vendorSegmentsLoadVersion) return;
    vendorSegmentsLoading = false;
    renderManualShortlistControls();
  }
}

function loadCarrierWorkspaceData({ force = false } = {}) {
  if (force) carrierWorkspaceLoadPromise = null;
  if (!carrierWorkspaceLoadPromise) {
    carrierWorkspaceLoadPromise = Promise.all([
      loadVendorOptions({ force }),
      loadVendorSegments()
    ]).catch((error) => {
      carrierWorkspaceLoadPromise = null;
      throw error;
    });
  }
  return carrierWorkspaceLoadPromise;
}

async function loadOutreachAssets() {
  try {
    outreachTemplates = await fetchOutreachTemplates();
    renderOutreachLaunchpad();
  } catch (error) {
    outreachTemplates = [];
    renderOutreachLaunchpad();
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
  }
}

function validateLaneEditPatch(laneId, patch = {}) {
  const lane = currentLanes.find((item) => String(item.id) === String(laneId));
  if (!lane) return "Lane no longer exists in this bid room.";
  const origin = Object.prototype.hasOwnProperty.call(patch, "origin") ? patch.origin : lane.origin;
  const destination = Object.prototype.hasOwnProperty.call(patch, "destination") ? patch.destination : lane.destination;
  if (!String(origin || "").trim()) return "Origin is required before saving this lane.";
  if (!String(destination || "").trim()) return "Destination is required before saving this lane.";
  return "";
}

async function saveRfxLaneEdits(laneIds = []) {
  const eventId = selectedEventId;
  const ids = laneIds.filter((id) => laneHasPendingEdits(id));
  if (!ids.length) {
    updateLaneEditControls();
    return;
  }
  const invalid = ids.map((id) => validateLaneEditPatch(id, laneEditPatch(id))).find(Boolean);
  if (invalid) {
    setStatus(laneEditStatus, invalid, "error");
    return;
  }
  if (saveLaneEditsButton) saveLaneEditsButton.disabled = true;
  setStatus(laneEditStatus, `Saving ${ids.length} lane${ids.length === 1 ? "" : "s"}...`);
  try {
    await Promise.all(ids.map((id) => updateRfxLane(id, laneEditPatch(id))));
    if (!eventId || selectedEventId !== eventId) return;
    ids.forEach((id) => pendingLaneEdits.delete(String(id)));
    await loadDetail(eventId, { force: true });
    setStatus(laneEditStatus, `${ids.length} loaded lane${ids.length === 1 ? "" : "s"} updated.`, "success");
  } catch (error) {
    if (selectedEventId === eventId) {
      setStatus(laneEditStatus, humanizeError(error), "error");
      updateLaneEditControls();
    }
  }
}

function requestRfxDetail(eventId, { force = false } = {}) {
  const key = String(eventId || "");
  if (!force && rfxDetailRequests.has(key)) return rfxDetailRequests.get(key);
  const promise = fetchRfxDetail(eventId).finally(() => {
    if (rfxDetailRequests.get(key) === promise) rfxDetailRequests.delete(key);
  });
  rfxDetailRequests.set(key, promise);
  return promise;
}

async function loadDetail(eventId, options = {}) {
  const loadVersion = ++rfxDetailLoadVersion;
  const previousEventId = selectedEventId;
  const eventChanged = selectedEventId !== eventId;
  const unassignedSelection = !previousEventId
    ? (selectedManualVendorIds().length ? selectedManualVendorIds() : readStoredManualParticipantIds())
    : [];
  if (eventChanged) {
    resetDraftQueue({ clearSelection: true });
    selectedChatRecipient = null;
    pendingLaneEdits.clear();
    laneEditMode = false;
    editingLaneId = null;
    selectedManualVendorIdsState = new Set();
    selectedOutreachAudienceVendorIds.clear();
    outreachAudienceRows = [];
    outreachAudienceCounts = {};
    outreachAudienceTotal = 0;
    rfxCarrierFitEvidenceByVendorId = new Map();
    rfxCarrierFitEvidenceError = "";
    rfxCarrierFitEvidenceLoading = false;
  }
  selectedEventId = eventId;
  persistRfxWorkspaceContext();
  if (unassignedSelection.length) {
    selectedManualVendorIdsState = new Set(unassignedSelection);
    persistManualParticipantSelection(eventId);
    try {
      window.sessionStorage.removeItem(participantSelectionStorageKey(null));
    } catch {
      // The selection was already persisted under the RFx; retaining the temporary entry is harmless.
    }
  } else if (eventChanged || !selectedManualVendorIdsState.size) {
    restoreManualParticipantSelection(eventId);
  }
  if (bidRoomChatRefreshTimer) window.clearInterval(bidRoomChatRefreshTimer);
  setStatus(actionStatus, "Loading RFx detail...");
  try {
    const detail = await requestRfxDetail(eventId, { force: options?.force === true });
    if (loadVersion !== rfxDetailLoadVersion || selectedEventId !== eventId) return;
    selectedEvent = detail.event;
    currentLanes = detail.lanes || [];
    contactHistoryRows = [];
    outreachMessages = [];
    bidRoomChatThreads = emptyBidRoomChatThreads();
    if (!currentLanes.some((lane) => lane.id === focusedLaneId)) focusedLaneId = currentLanes[0]?.id || null;
    detailTitle.textContent = `${selectedEvent.name || selectedEvent.rfx_id} (${selectedEvent.status})`;
    updateLaneImportButton();
    updateEventActionState();
    renderEvents();
    renderLanes();
    renderEventDashboard();
    renderLaneCoverage();
    renderBidRoomChat();
    renderOutreachLaunchpad();
    void loadRfxCarrierFitEvidence({ force: eventChanged || options?.force === true });
    void loadOutreachAudience({ reloadSegments: eventChanged });
    setStatus(actionStatus, "Bid Room core loaded. Loading outreach and chat context...");

    const forceResources = options?.force === true;
    const [historyResult, messagesResult, chatResult] = await Promise.allSettled([
      requestRfxEventResource(rfxContactHistoryRequests, eventId, () => fetchContactHistory({ rfx_event_id: eventId, limit: 1000 }), { force: forceResources }),
      requestRfxEventResource(rfxOutreachMessageRequests, eventId, () => fetchOutreachMessages({ rfx_event_id: eventId, limit: 1000 }), { force: forceResources }),
      requestRfxEventResource(rfxChatRequests, eventId, () => fetchBidRoomChat(eventId), { force: forceResources })
    ]);
    if (loadVersion !== rfxDetailLoadVersion || selectedEventId !== eventId) return;
    contactHistoryRows = getSettledValue(historyResult, []) || [];
    outreachMessages = getSettledValue(messagesResult, []) || [];
    bidRoomChatThreads = getSettledValue(chatResult, emptyBidRoomChatThreads()) || emptyBidRoomChatThreads();
    await loadDraftQueuePage(eventId, { reset: true, render: false, refreshTracking: true });
    if (loadVersion !== rfxDetailLoadVersion || selectedEventId !== eventId) return;
    renderEventDashboard();
    renderLanes();
    renderBidRoomChat();
    renderOutreachLaunchpad();

    bidRoomChatRefreshTimer = window.setInterval(() => {
      if (selectedEventId === eventId && loadVersion === rfxDetailLoadVersion) loadBidRoomChat();
    }, 15000);
    const warnings = [
      getSettledWarning(historyResult, "Contact history"),
      getSettledWarning(messagesResult, "Outreach queue"),
      getSettledWarning(chatResult, "Bid Room chat")
    ].filter(Boolean);
    setStatus(
      actionStatus,
      warnings.length
        ? `Bid Room loaded. ${warnings.join(" ")} Core event, lanes and participants are still available.`
        : "Bid Room loaded.",
      warnings.length ? "warning" : "success"
    );
    ensureSelectedEventChatThread(eventId, { silent: true });
  } catch (error) {
    if (loadVersion !== rfxDetailLoadVersion || selectedEventId !== eventId) return;
    setStatus(actionStatus, humanizeError(error), "error");
    updateEventActionState();
  }
}

function activateWorkbenchView(view, focusTarget = null) {
  rfxWorkbench?.activate(view, { ...(focusTarget ? { focusTarget } : {}), syncUrl: true });
}

async function refreshOutreachStateForEvent(eventId) {
  if (!eventId) return false;
  const [historyRows, messageRows] = await Promise.all([
    requestRfxEventResource(rfxContactHistoryRequests, eventId, () => fetchContactHistory({ rfx_event_id: eventId, limit: 1000 }), { force: true }),
    requestRfxEventResource(rfxOutreachMessageRequests, eventId, () => fetchOutreachMessages({ rfx_event_id: eventId, limit: 1000 }), { force: true })
  ]);
  if (selectedEventId !== eventId) return false;
  contactHistoryRows = historyRows || [];
  outreachMessages = messageRows || [];
  await loadDraftQueuePage(eventId, { render: false, refreshTracking: true });
  if (selectedEventId !== eventId) return false;
  return true;
}

async function autoShortlistLane(laneId) {
  const eventId = selectedEventId;
  setStatus(actionStatus, "Building shortlist...");
  const result = await autoShortlistRfxLane(laneId, 10);
  if (selectedEventId === eventId) setStatus(actionStatus, `${result.inserted || 0} vendor(s) shortlisted.`, "success");
}

async function autoShortlistLaneIds(ids, statusElement = actionStatus) {
  const eventId = selectedEventId;
  const laneIds = ids.filter(Boolean);
  if (!laneIds.length) return 0;
  setStatus(statusElement, "Building shortlists...");
  let inserted = 0;
  for (const id of laneIds) {
    const result = await autoShortlistRfxLane(id, 10);
    inserted += Number(result.inserted || 0);
    if (selectedEventId !== eventId) return inserted;
  }
  if (!eventId || selectedEventId !== eventId) return inserted;
  setStatus(statusElement, `${inserted} vendor shortlist row(s) created.`, "success");
  selectedLaneIds.clear();
  await loadDetail(eventId);
  return inserted;
}

async function shortlistVendorsByLane(laneId, vendorIds = [], statusElement = manualShortlistStatus, context = {}) {
  const batches = chunkRows(vendorIds, BID_ROOM_PARTICIPANT_BATCH_SIZE);
  let inserted = 0;
  for (let index = 0; index < batches.length; index += 1) {
    if (context.eventId && selectedEventId !== context.eventId) return inserted;
    const batch = batches[index];
    if (batches.length > 1) {
      setStatus(
        statusElement,
        `Adding carrier batch ${formatNumber(index + 1)} of ${formatNumber(batches.length)} (${formatNumber(batch.length)} carriers)${context.laneLabel ? ` to ${context.laneLabel}` : ""}...`
      );
    }
    const result = await shortlistRfxLaneVendors(laneId, batch);
    inserted += Number(result.inserted || 0);
  }
  return inserted;
}

async function mutateRfxParticipantsInBatches(ids = [], action, statusElement = actionStatus) {
  const batches = chunkRows(ids, BID_ROOM_PARTICIPANT_BATCH_SIZE);
  const operation = action === "archive" ? archiveRfxLaneVendors : inviteRfxLaneVendors;
  const verb = action === "archive" ? "Archiving" : "Marking";
  let updated = 0;
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    setStatus(
      statusElement,
      `${verb} participant batch ${formatNumber(index + 1)} of ${formatNumber(batches.length)} (${formatNumber(batch.length)} rows)...`
    );
    const result = await operation(batch);
    updated += Number(result.updated || 0);
  }
  return updated;
}

function outreachDraftRequestStorageKey(eventId, templateId, channel, invitationIds) {
  const source = [eventId, templateId, channel, ...invitationIds.map(String).sort()].join("|");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `rateware:outreach-draft:${(hash >>> 0).toString(16)}`;
}

function outreachDraftIdempotencyKey(storageKey) {
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const key = window.crypto?.randomUUID?.() || `outreach-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.sessionStorage.setItem(storageKey, key);
    return key;
  } catch (_) {
    return window.crypto?.randomUUID?.() || `outreach-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function clearOutreachDraftIdempotencyKey(storageKey) {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch (_) {
    // Storage is optional; backend idempotency still protects the active request.
  }
}

function outreachDraftQueueSummary(result = {}) {
  const skippedRows = Array.isArray(result.skipped) ? result.skipped : [];
  const metrics = result.metrics && typeof result.metrics === "object" ? result.metrics : {};
  const historyPreserved = Number(metrics.preserved_from_history || 0);
  const bounceCount = skippedRows.filter((row) => row?.reason_code === "previous_bounce").length;
  const explicitPreviousOutreachCount = skippedRows.filter((row) => row?.reason_code === "previous_outreach").length;
  const previousOutreachCount = explicitPreviousOutreachCount || Math.max(0, historyPreserved - bounceCount);
  const generatedCount = Number(result.generated || 0);
  const parts = [`${formatNumber(generatedCount)} draft(s) created`];
  if (previousOutreachCount) parts.push(`${formatNumber(previousOutreachCount)} already contacted`);
  if (bounceCount) parts.push(`${formatNumber(bounceCount)} bounced contact(s) need cleanup`);
  const otherSkipped = Math.max(0, skippedRows.length - previousOutreachCount - bounceCount);
  if (otherSkipped) parts.push(`${formatNumber(otherSkipped)} other skipped`);
  if (!generatedCount && (previousOutreachCount || bounceCount)) {
    return `No new drafts created. ${parts.slice(1).join(". ")}.`;
  }
  return `${parts.join(". ")}.`;
}

async function createCurrentOutreachDrafts(statusElement = rfxOutreachStatus) {
  if (!selectedEventId) {
    blockIfLaunchPreflightFails(statusElement);
    return null;
  }
  const eventId = selectedEventId;
  const eventSnapshot = selectedEvent;
  if (blockIfLaunchPreflightFails(statusElement)) return null;
  const template = selectedOutreachTemplate();
  const targets = outreachTargetInvitations();
  if (!template) {
    setStatus(statusElement, "Select an outreach template before creating drafts.", "error");
    return null;
  }
  if (!targets.length) {
    setStatus(statusElement, "Shortlist at least one vendor before creating campaign drafts.", "error");
    return null;
  }
  if (rfxTemplateEditorDirty || rfxTemplateVisualEditing) {
    setStatus(statusElement, "Save the edited email preview before generating draft queue.", "error");
    return null;
  }
  const outreachChannel = selectedOutreachChannel();
  const requestedDraftChannels = outreachDraftChannels(outreachChannel);
  const includesWhatsappChannel = requestedDraftChannels.some((channel) => channel === "whatsapp" || channel === "whatsapp_group");
  const audiencePolicy = currentOutreachAudiencePolicy();
  const contactPolicy = currentOutreachContactPolicy();
  const sequencePolicy = currentOutreachSequencePolicy();
  const savedAudienceVendorIds = audiencePolicy.mode === "saved_segment"
    ? outreachAudienceRows.map((row) => String(row.vendor_id || "")).filter(Boolean)
    : [];
  const audienceVendorIds = audiencePolicy.vendor_ids.length
    ? audiencePolicy.vendor_ids
    : savedAudienceVendorIds;
  const audienceSet = audienceVendorIds.length ? new Set(audienceVendorIds) : null;
  const scopedTargets = audienceSet
    ? targets.filter(({ invitation }) => audienceSet.has(String(invitation.vendor_id || "")))
    : targets;
  if (!scopedTargets.length) {
    setStatus(statusElement, audiencePolicy.mode === "saved_segment"
      ? "The saved segment has no shortlisted carriers in this Bid Room. Refresh the audience or adjust the segment."
      : "The selected audience has no shortlisted carriers in this Bid Room.", "warning");
    return null;
  }
  const draftTargets = selectedInvitationIds.size
    ? scopedTargets.filter(({ invitation }) => selectedInvitationIds.has(String(invitation.id)))
    : scopedTargets.filter((target) => !targetHasActiveOutreachDraft(target, requestedDraftChannels));
  if (!draftTargets.length) {
    setStatus(statusElement, selectedInvitationIds.size
      ? "No selected participant belongs to the active audience. Adjust the audience or selection."
      : `All eligible carriers already have active ${requestedDraftChannels.join(" + ")} invitation drafts. Select a specific participant if you need to regenerate one.`, "neutral");
    renderOutreachLaunchpad();
    return { generated: 0, skipped: [] };
  }
  const invitationIds = draftTargets.map(({ invitation }) => invitation.id);
  const idempotencyStorageKey = outreachDraftRequestStorageKey(eventId, template.id, outreachChannel, invitationIds);
  const idempotencyKey = outreachDraftIdempotencyKey(idempotencyStorageKey);
  if (createRfxOutreachCampaignButton) createRfxOutreachCampaignButton.disabled = true;
  setStatus(statusElement, "Creating campaign and generating drafts...");
  const whatsappTargetMode = includesWhatsappChannel
    ? outreachChannel === "whatsapp_group" ? "vendor_group" : "direct_vendor"
    : "";
  const groupDeliveryPolicy = includesWhatsappChannel
    ? whatsappTargetMode === "direct_vendor" ? "api_only" : "manual_or_api"
    : "";
  const campaign = await createOutreachCampaign({
    name: rfxOutreachCampaignName?.value || `${eventSnapshot?.rfx_id || "RFx"} invitation wave`,
    rfx_event_id: eventId,
    template_id: template.id,
    channel: outreachChannel,
    ...(includesWhatsappChannel ? {
      whatsapp_target_mode: whatsappTargetMode,
      group_delivery_policy: groupDeliveryPolicy
    } : {}),
    idempotency_key: idempotencyKey,
    sender_email: rfxOutreachSender?.value || APPROVED_GMAIL_SENDER,
    sender_label: rfxOutreachSender?.selectedOptions?.[0]?.textContent || rfxOutreachSender?.value || APPROVED_GMAIL_SENDER,
    sender_connection_status: "draft_only",
    audience_policy: audiencePolicy,
    contact_policy: contactPolicy,
    sequence_policy: sequencePolicy,
    audience_snapshot: {
      selected_vendor_count: audienceVendorIds.length,
      selected_invitation_count: invitationIds.length,
      generated_from: "rfx_outreach_control_center"
    }
  });
  const result = await generateOutreachDrafts(campaign.id, {
    channel: outreachChannel,
    invitationIds,
    senderEmail: campaign.sender_email,
    senderLabel: campaign.sender_label,
    senderConnectionStatus: campaign.sender_connection_status,
    audiencePolicy,
    contactPolicy,
    sequencePolicy,
    ...(includesWhatsappChannel ? {
      whatsappTargetMode: campaign.whatsapp_target_mode || whatsappTargetMode,
      groupDeliveryPolicy: campaign.group_delivery_policy || groupDeliveryPolicy
    } : {})
  });
  clearOutreachDraftIdempotencyKey(idempotencyStorageKey);
  if (selectedEventId !== eventId) return result;
  await loadDetail(eventId);
  if (selectedEventId !== eventId) return result;
  activateRfxLaunchWorkspace("delivery", { refresh: true });
  const notifier = result.whatsapp_notifier || {};
  const notifierStatus = metaNotifierStatus(notifier.status || "not_requested");
  const isWhatsappQueue = requestedDraftChannels.includes("whatsapp");
  const channelError = requestedDraftChannels
    .map((channel) => result.channel_results?.[channel]?.preparation_error || result.channel_errors?.[channel] || "")
    .find(Boolean) || "";
  const notifierCopy = !isWhatsappQueue
    ? ""
    : notifier.ready
      ? ` Meta notifier ${notifier.template_name || ""} is approved and attached.`
      : metaNotifierPendingReview(notifierStatus)
        ? ` Drafts are ready; Meta notifier is ${metaNotifierStatusLabel(notifierStatus)} and sending unlocks after approval.`
        : notifierStatus === "ERROR"
          ? ` Drafts are ready; WhatsApp sending needs attention: ${humanizeError(notifier.error || "Meta connection unavailable")}`
          : "";
  const hasQueueWarnings = (result.skipped?.length || 0) > 0
    || (isWhatsappQueue && (notifierStatus === "ERROR" || metaNotifierPendingReview(notifierStatus)));
  setStatus(
    statusElement,
    channelError
      ? `This channel could not prepare its draft queue. ${humanizeError(channelError)}`
      : `${outreachDraftQueueSummary(result)}${notifierCopy}`,
    channelError ? "error" : hasQueueWarnings ? "warning" : "success"
  );
  return result;
}

async function applyRfxAwardDecision(invitationId, role, defaultReason = "") {
  if (!selectedEventId || !invitationId) return;
  const label = role === "primary" ? "primary award" : "backup";
  const reason = window.prompt(`Reason for ${label}:`, defaultReason || "Procurement decision");
  if (reason === null) return;
  const eventId = selectedEventId;
  setStatus(rfxAwardStatus, role === "primary" ? "Saving primary award..." : "Saving backup carrier...");
  try {
    await awardRfxLaneVendor(invitationId, {
      award_role: role,
      award_reason: reason || defaultReason || "Procurement decision"
    });
    if (selectedEventId !== eventId) return;
    setStatus(rfxAwardStatus, role === "primary" ? "Primary award saved." : "Backup carrier saved.", "success");
    await loadDetail(eventId);
    if (selectedEventId !== eventId) return;
    activateWorkbenchView("award");
  } catch (error) {
    if (selectedEventId === eventId) setStatus(rfxAwardStatus, humanizeError(error), "error");
  }
}

async function clearRfxAwardDecision(invitationId) {
  if (!selectedEventId || !invitationId) return;
  if (!window.confirm("Clear this award or backup role? The carrier bid stays in the Bid Room.")) return;
  const eventId = selectedEventId;
  setStatus(rfxAwardStatus, "Clearing award role...");
  try {
    await clearRfxAward(invitationId);
    if (selectedEventId !== eventId) return;
    setStatus(rfxAwardStatus, "Award role cleared.", "success");
    await loadDetail(eventId);
    if (selectedEventId !== eventId) return;
    activateWorkbenchView("award");
  } catch (error) {
    if (selectedEventId === eventId) setStatus(rfxAwardStatus, humanizeError(error), "error");
  }
}

async function applyRecommendedAwardDecisions() {
  if (awardMutationRunning) return;
  if (!selectedEventId) return;
  const candidates = recommendedAwardCandidates();
  if (!candidates.length) {
    setStatus(rfxAwardStatus, "Every lane with bids already has a primary award.", "neutral");
    return;
  }
  const weak = candidates.filter((row) => Number(row.recommended?.decision?.score || 0) < 55).length;
  const copy = weak
    ? `Award ${candidates.length} recommended carrier(s)? ${weak} have weak scores and should be reviewed.`
    : `Award ${candidates.length} recommended carrier(s) as primary awards?`;
  if (!window.confirm(copy)) return;
  const eventId = selectedEventId;
  awardMutationRunning = true;
  if (rfxApplyRecommendedAwardsButton) rfxApplyRecommendedAwardsButton.disabled = true;
  setStatus(rfxAwardStatus, `Applying ${formatNumber(candidates.length)} recommended award(s)...`);
  try {
    let saved = 0;
    const failed = [];
    for (const candidate of candidates) {
      if (selectedEventId !== eventId) return;
      const row = candidate.recommended;
      const reason = decisionRecommendation(row, 1, candidate.bids) || awardReasonDefault(row, 1);
      try {
        await awardRfxLaneVendor(row.invitation.id, {
          award_role: "primary",
          award_reason: reason || "Recommended procurement award"
        });
        saved += 1;
      } catch (error) {
        failed.push(`${laneRoute(candidate.lane)}: ${humanizeError(error)}`);
      }
    }
    if (selectedEventId !== eventId) return;
    await loadDetail(eventId);
    if (selectedEventId !== eventId) return;
    activateWorkbenchView("award");
    setStatus(
      rfxAwardStatus,
      failed.length
        ? `${formatNumber(saved)} award(s) saved. ${formatNumber(failed.length)} failed: ${failed.slice(0, 2).join(" | ")}`
        : `${formatNumber(saved)} recommended award(s) saved.`,
      failed.length ? "warning" : "success"
    );
  } finally {
    awardMutationRunning = false;
    updateAwardNoticeControls();
  }
}

async function closeoutSelectedAwardsToRateware() {
  if (awardMutationRunning) return;
  if (!selectedEventId) return;
  if (blockIfAwardPreflightFails("closeout")) return;
  const pending = currentLanes
    .flatMap((lane) => activeInvitations(lane))
    .filter((invitation) => invitation.award_role === "primary" && !invitation.rate_staging_id);
  if (!pending.length) {
    setStatus(rfxAwardStatus, "There are no primary awards pending Rateware approval.", "neutral");
    return;
  }
  if (!window.confirm(`Approve ${pending.length} awarded rate(s) in Rateware? Existing bid staging rows will be approved; only missing rows will be created.`)) return;
  const eventId = selectedEventId;
  awardMutationRunning = true;
  if (rfxCloseoutAwardsButton) rfxCloseoutAwardsButton.disabled = true;
  setStatus(rfxAwardStatus, "Approving awarded rates in Rateware...");
  try {
    const result = await closeoutAwardedRfxToRateware(eventId, { target_status: "approved" });
    if (selectedEventId !== eventId) return;
    await loadEvents();
    if (selectedEventId !== eventId) return;
    activateWorkbenchView("award");
    setStatus(
      rfxAwardStatus,
      `${formatNumber(result.linked || result.approved_existing || 0)} existing bid row(s) approved, ${formatNumber(result.inserted || 0)} new row(s) created. ${formatNumber(result.skipped || 0)} skipped.`,
      result.inserted || result.linked || result.approved_existing ? "success" : "neutral"
    );
  } catch (error) {
    if (selectedEventId === eventId) {
      setStatus(rfxAwardStatus, humanizeError(error), "error");
      renderAwardBoard();
    }
  } finally {
    awardMutationRunning = false;
    updateAwardNoticeControls();
  }
}

async function generateAwardNoticeDrafts() {
  if (awardMutationRunning) return;
  if (!selectedEventId) {
    setStatus(rfxAwardStatus, "Select a bid event before generating award notices.", "error");
    return;
  }
  if (blockIfAwardPreflightFails("generate_notices")) return;
  const bids = awardLaneRows().reduce((sum, row) => sum + row.bids.length, 0);
  if (!bids) {
    setStatus(rfxAwardStatus, "There are no carrier bids to close out yet.", "error");
    return;
  }
  const eventId = selectedEventId;
  awardMutationRunning = true;
  if (rfxGenerateAwardNoticesButton) rfxGenerateAwardNoticesButton.disabled = true;
  setStatus(rfxAwardStatus, "Generating award, backup, and not-awarded email drafts...");
  try {
    const result = await generateRfxAwardNotices(eventId, {
      senderEmail: APPROVED_GMAIL_SENDER,
      senderLabel: APPROVED_GMAIL_SENDER
    });
    if (!(await refreshOutreachStateForEvent(eventId))) return;
    renderOutreachLaunchpad();
    renderAwardBoard();
    setStatus(
      rfxAwardStatus,
      `${formatNumber(result.generated || 0)} email notice draft(s) ready. ${formatNumber(result.skipped?.length || 0)} skipped.`,
      "success"
    );
  } catch (error) {
    setStatus(rfxAwardStatus, humanizeError(error), "error");
    updateAwardNoticeControls();
  } finally {
    awardMutationRunning = false;
    updateAwardNoticeControls();
  }
}

async function sendAwardNoticeDrafts(requestedIds = null) {
  if (awardMutationRunning) return;
  if (!selectedEventId) return;
  if (blockIfAwardPreflightFails("send_notices")) return;
  const sendableIds = new Set(sendableAwardNoticeIds(awardNoticeDraftRows()));
  const ids = (Array.isArray(requestedIds) ? requestedIds : selectedAwardNoticeIds())
    .map((id) => String(id))
    .filter((id) => sendableIds.has(id));
  if (!ids.length) {
    setStatus(rfxAwardStatus, "Select one or more ready email notices before sending.", "error");
    return;
  }
  if (!window.confirm(`Send ${ids.length} individual award notice email(s)?`)) return;
  const eventId = selectedEventId;
  awardMutationRunning = true;
  if (rfxSendAwardNoticesButton) rfxSendAwardNoticesButton.disabled = true;
  setStatus(rfxAwardStatus, `Sending ${formatNumber(ids.length)} award notice email(s)...`);
  try {
    const result = await sendOutreachMessages(ids, { senderEmail: APPROVED_GMAIL_SENDER });
    ids.forEach((id) => awardNoticeSelectedIds.delete(id));
    if (!(await refreshOutreachStateForEvent(eventId))) return;
    renderOutreachLaunchpad();
    renderAwardBoard();
    setStatus(
      rfxAwardStatus,
      `${formatNumber(result.sent || 0)} award notice email(s) sent. ${formatNumber(result.failed || 0)} failed.`,
      result.failed ? "warning" : "success"
    );
  } catch (error) {
    setStatus(rfxAwardStatus, humanizeError(error), "error");
    updateAwardNoticeControls();
  } finally {
    awardMutationRunning = false;
    updateAwardNoticeControls();
  }
}

async function sendDraftEmailIds(ids = [], statusElement = rfxOutreachStatus) {
  const batches = chunkRows(ids, OUTREACH_SEND_BATCH_SIZE);
  const totals = { sent: 0, failed: 0, skipped: 0, failures: [], skipped_rows: [] };
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    setStatus(
      statusElement,
      `Sending batch ${formatNumber(index + 1)} of ${formatNumber(batches.length)} (${formatNumber(batch.length)} email${batch.length === 1 ? "" : "s"}) from ${APPROVED_GMAIL_SENDER}...`
    );
    const result = await sendOutreachMessages(batch, { senderEmail: APPROVED_GMAIL_SENDER });
    totals.sent += Number(result.sent || 0);
    totals.failed += Number(result.failed || 0);
    totals.skipped += Number(result.skipped || 0);
    if (Array.isArray(result.failures)) totals.failures.push(...result.failures);
    if (Array.isArray(result.skipped_rows)) totals.skipped_rows.push(...result.skipped_rows);
  }
  return totals;
}

async function sendSelectedDraftEmails() {
  if (draftQueueMutationRunning) return;
  const ids = selectedSendableDraftIds();
  if (!ids.length) {
    setStatus(rfxOutreachStatus, "Select one or more email drafts before sending.", "error");
    return;
  }
  if (!confirmDraftQueueAction("send", ids)) return;
  const eventId = selectedEventId;
  draftQueueMutationRunning = true;
  if (draftSendSelectedButton) draftSendSelectedButton.disabled = true;
  try {
    const result = await sendDraftEmailIds(ids, rfxOutreachStatus);
    clearDraftQueueSelection();
    if (!(await refreshOutreachStateForEvent(eventId))) return;
    renderOutreachLaunchpad();
    setStatus(
      rfxOutreachStatus,
      `Email send finished: ${outreachBulkResultSummary(result, "message")}.`,
      result.failed || result.skipped || result.delivery_unknown ? "warning" : "success"
    );
  } catch (error) {
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
    renderDraftQueue();
  } finally {
    draftQueueMutationRunning = false;
    updateDraftSendControls(draftQueueRows);
  }
}

async function sendSingleDraftEmail(id) {
  if (draftQueueMutationRunning) return;
  if (!id) return;
  const row = findDraftRow(id);
  if (!row) {
    setStatus(rfxOutreachStatus, "Draft row could not be found. Refresh the Bid Room and try again.", "error");
    return;
  }
  const sendable = selectableEmailDrafts([row]).length > 0;
  if (!sendable) {
    setStatus(rfxOutreachStatus, "This draft cannot be sent directly. It needs an email recipient and drafted/queued/failed status.", "error");
    return;
  }
  const eventId = selectedEventId;
  const carrier = row.vendors?.vendor_name || row.vendors?.domain || row.recipient_email || "this carrier";
  if (!window.confirm(`Send this invitation now to ${carrier} from ${APPROVED_GMAIL_SENDER}?`)) return;
  draftQueueMutationRunning = true;
  updateDraftSendControls(draftQueueRows);
  setStatus(rfxOutreachStatus, `Sending invitation to ${carrier}...`);
  try {
    const result = await sendDraftEmailIds([String(id)], rfxOutreachStatus);
    forgetDraftRow(id);
    if (!(await refreshOutreachStateForEvent(eventId))) return;
    renderOutreachLaunchpad();
    setStatus(
      rfxOutreachStatus,
      result.sent ? `Invitation sent to ${carrier}.` : `Invitation could not be sent to ${carrier}. ${formatNumber(result.failed || 0)} failed.`,
      result.sent ? "success" : "warning"
    );
  } catch (error) {
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
    renderDraftQueue();
  } finally {
    draftQueueMutationRunning = false;
    updateDraftSendControls(draftQueueRows);
  }
}

async function sendDraftWhatsappIds(ids = [], statusElement = rfxOutreachStatus) {
  const batches = chunkRows(ids, OUTREACH_SEND_BATCH_SIZE);
  const totals = { sent: 0, failed: 0, skipped: 0, failures: [], skipped_rows: [] };
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    setStatus(
      statusElement,
      `Sending WhatsApp batch ${formatNumber(index + 1)} of ${formatNumber(batches.length)} (${formatNumber(batch.length)} message${batch.length === 1 ? "" : "s"})...`
    );
    const result = await sendWhatsappOutreachMessages(batch);
    totals.sent += Number(result.sent || 0);
    totals.failed += Number(result.failed || 0);
    totals.skipped += Number(result.skipped || 0);
    if (Array.isArray(result.failures)) totals.failures.push(...result.failures);
    if (Array.isArray(result.skipped_rows)) totals.skipped_rows.push(...result.skipped_rows);
  }
  return totals;
}

async function sendSelectedDraftWhatsapp() {
  if (draftQueueMutationRunning) return;
  const ids = selectedWhatsappDraftIds();
  if (!ids.length) {
    setStatus(rfxOutreachStatus, "Select one or more WhatsApp direct drafts before sending.", "error");
    return;
  }
  const readiness = await loadWhatsappConnectionReadiness({ render: false });
  if (!readiness.ready) {
    setStatus(rfxOutreachStatus, readiness.message, "error");
    renderOutreachLaunchpad();
    return;
  }
  if (!confirmDraftQueueAction("send_whatsapp", ids)) return;
  const eventId = selectedEventId;
  draftQueueMutationRunning = true;
  if (draftSendSelectedWhatsappButton) draftSendSelectedWhatsappButton.disabled = true;
  try {
    const result = await sendDraftWhatsappIds(ids, rfxOutreachStatus);
    clearDraftQueueSelection();
    if (!(await refreshOutreachStateForEvent(eventId))) return;
    renderOutreachLaunchpad();
    setStatus(
      rfxOutreachStatus,
      `WhatsApp send finished: ${outreachBulkResultSummary(result, "message")}.`,
      result.failed || result.skipped || result.delivery_unknown ? "warning" : "success"
    );
  } catch (error) {
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
    renderDraftQueue();
  } finally {
    draftQueueMutationRunning = false;
    updateDraftSendControls(draftQueueRows);
  }
}

async function sendSingleDraftWhatsapp(id) {
  if (draftQueueMutationRunning) return;
  if (!id) return;
  const readiness = await loadWhatsappConnectionReadiness({ render: false });
  if (!readiness.ready) {
    setStatus(rfxOutreachStatus, readiness.message, "error");
    renderOutreachLaunchpad();
    return;
  }
  const row = findDraftRow(id);
  if (!row) {
    setStatus(rfxOutreachStatus, "WhatsApp draft row could not be found. Refresh the Bid Room and try again.", "error");
    return;
  }
  if (!selectableWhatsappDrafts([row]).length) {
    setStatus(rfxOutreachStatus, "This WhatsApp draft needs a valid phone and drafted, queued, or failed status. Rateware checks the Meta notifier automatically when you send.", "error");
    return;
  }
  const eventId = selectedEventId;
  const carrier = row.vendors?.vendor_name || row.vendors?.domain || messageRecipient(row) || "this carrier";
  if (!window.confirm(`Send this WhatsApp Business invitation to ${carrier}?`)) return;
  draftQueueMutationRunning = true;
  updateDraftSendControls(draftQueueRows);
  setStatus(rfxOutreachStatus, `Sending WhatsApp invitation to ${carrier}...`);
  try {
    const result = await sendDraftWhatsappIds([String(id)], rfxOutreachStatus);
    forgetDraftRow(id);
    if (!(await refreshOutreachStateForEvent(eventId))) return;
    renderOutreachLaunchpad();
    setStatus(
      rfxOutreachStatus,
      result.sent ? `WhatsApp invitation sent to ${carrier}.` : `WhatsApp invitation could not be sent to ${carrier}. ${formatNumber(result.failed || 0)} failed.`,
      result.sent ? "success" : "warning"
    );
  } catch (error) {
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
    renderDraftQueue();
  } finally {
    draftQueueMutationRunning = false;
    updateDraftSendControls(draftQueueRows);
  }
}

async function refreshSingleOutreachDraft(id) {
  if (draftQueueMutationRunning) return;
  const message = findDraftRow(id);
  if (!message) {
    setStatus(rfxOutreachStatus, "This draft is no longer available. Refresh the Bid Room and try again.", "error");
    return;
  }
  if (!refreshableOutreachDrafts([message]).length) {
    setStatus(rfxOutreachStatus, "This draft cannot be refreshed because its campaign or invited lanes are missing. Generate a new draft for this carrier.", "error");
    return;
  }
  const carrier = message.vendors?.vendor_name || message.vendors?.domain || messageRecipient(message) || "this carrier";
  if (!window.confirm(`Refresh the invitation draft for ${carrier} with the current Business Book?`)) return;
  draftQueueMutationRunning = true;
  updateDraftSendControls(draftQueueRows);
  try {
    await refreshOutreachDraftRows([message], { statusLabel: `Refreshing invitation draft for ${carrier}...` });
  } finally {
    draftQueueMutationRunning = false;
    updateDraftSendControls(draftQueueRows);
  }
}

function groupedOutreachDraftRefreshes(rows = []) {
  const grouped = new Map();
  refreshableOutreachDrafts(rows).forEach((message) => {
    const campaignId = String(message.campaign_id || "").trim();
    const invitationIds = [...outreachMessageInvitationIds(message)].sort();
    const channel = String(message.channel || "email").toLowerCase();
    const key = `${campaignId}:${channel}:${invitationIds.join(",")}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        campaignId,
        channel: message.channel || "email",
        invitationIds,
        senderEmail: message.sender_email || "",
        senderLabel: message.sender_label || "",
        senderConnectionStatus: message.sender_connection_status || "draft_only",
        whatsappTargetMode: message.whatsapp_target_mode || message.metadata?.whatsapp_target_mode || "",
        groupDeliveryPolicy: message.group_delivery_policy || message.metadata?.group_delivery_policy || ""
      });
    }
  });
  return [...grouped.values()];
}

async function refreshOutreachDraftRows(rows = [], { statusLabel = "Refreshing selected invitation drafts..." } = {}) {
  const refreshes = groupedOutreachDraftRefreshes(rows);
  if (!refreshes.length) {
    setStatus(rfxOutreachStatus, "Select draft rows with a campaign and invited lanes before refreshing.", "error");
    return 0;
  }
  const eventId = selectedEventId;
  setStatus(rfxOutreachStatus, statusLabel);
  try {
    for (let index = 0; index < refreshes.length; index += 1) {
      const refresh = refreshes[index];
      setStatus(rfxOutreachStatus, `${statusLabel} ${formatNumber(index + 1)} of ${formatNumber(refreshes.length)}...`);
      await generateOutreachDrafts(refresh.campaignId, refresh);
    }
    clearDraftQueueSelection();
    if (!(await refreshOutreachStateForEvent(eventId))) return refreshes.length;
    renderOutreachLaunchpad();
    setStatus(rfxOutreachStatus, `${formatNumber(refreshes.length)} selected carrier draft${refreshes.length === 1 ? "" : "s"} refreshed. Their send history is preserved and the queue is ready to send.`, "success");
    return refreshes.length;
  } catch (error) {
    setStatus(rfxOutreachStatus, `Draft could not be refreshed. ${humanizeError(error)}`, "error");
    renderDraftQueue();
    return 0;
  }
}

async function refreshSelectedOutreachDrafts() {
  if (draftQueueMutationRunning) return;
  const rows = selectedRefreshableDraftRows();
  if (!rows.length) {
    setStatus(rfxOutreachStatus, "Select one or more active draft rows before refreshing.", "error");
    return;
  }
  if (!confirmDraftQueueAction("refresh", rows.map((message) => String(message.id)))) return;
  draftQueueMutationRunning = true;
  if (draftRefreshSelectedButton) draftRefreshSelectedButton.disabled = true;
  try {
    await refreshOutreachDraftRows(rows);
  } finally {
    draftQueueMutationRunning = false;
    updateDraftSendControls(draftQueueRows);
  }
}

async function markWhatsappGroupDraftIds(ids = [], statusElement = rfxOutreachStatus) {
  const batches = chunkRows(ids, OUTREACH_SEND_BATCH_SIZE);
  const totals = { updated: 0 };
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    setStatus(
      statusElement,
      `Marking WhatsApp group batch ${formatNumber(index + 1)} of ${formatNumber(batches.length)} (${formatNumber(batch.length)} group draft${batch.length === 1 ? "" : "s"})...`
    );
    const result = await markWhatsappGroupMessageManuallySent(batch);
    totals.updated += Number(result.updated || 0);
  }
  return totals;
}

async function markSelectedWhatsappGroupsManuallySent() {
  if (draftQueueMutationRunning) return;
  const ids = selectedWhatsappGroupDraftIds();
  if (!ids.length) {
    setStatus(rfxOutreachStatus, "Select one or more WhatsApp group drafts before marking them sent.", "error");
    return;
  }
  if (!confirmDraftQueueAction("mark_group_sent", ids)) return;
  const eventId = selectedEventId;
  draftQueueMutationRunning = true;
  if (draftMarkSelectedWhatsappGroupsButton) draftMarkSelectedWhatsappGroupsButton.disabled = true;
  try {
    const result = await markWhatsappGroupDraftIds(ids, rfxOutreachStatus);
    clearDraftQueueSelection();
    if (!(await refreshOutreachStateForEvent(eventId))) return;
    renderOutreachLaunchpad();
    setStatus(rfxOutreachStatus, `${formatNumber(result.updated || 0)} WhatsApp group draft(s) marked as manually sent.`, "success");
  } catch (error) {
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
    renderDraftQueue();
  } finally {
    draftQueueMutationRunning = false;
    updateDraftSendControls(draftQueueRows);
  }
}

async function markSingleWhatsappGroupManuallySent(id) {
  if (draftQueueMutationRunning) return;
  if (!id) return;
  const row = findDraftRow(id);
  if (!row) {
    setStatus(rfxOutreachStatus, "WhatsApp group draft row could not be found. Refresh the Bid Room and try again.", "error");
    return;
  }
  if (!selectableWhatsappGroupDrafts([row]).length) {
    setStatus(rfxOutreachStatus, "This WhatsApp group draft cannot be marked sent in its current status.", "error");
    return;
  }
  const eventId = selectedEventId;
  const group = messageRecipient(row);
  if (!window.confirm(`Mark the WhatsApp group invitation for ${group} as manually sent?`)) return;
  draftQueueMutationRunning = true;
  updateDraftSendControls(draftQueueRows);
  setStatus(rfxOutreachStatus, `Marking ${group} as manually sent...`);
  try {
    const result = await markWhatsappGroupDraftIds([String(id)], rfxOutreachStatus);
    forgetDraftRow(id);
    if (!(await refreshOutreachStateForEvent(eventId))) return;
    renderOutreachLaunchpad();
    setStatus(rfxOutreachStatus, `${formatNumber(result.updated || 0)} WhatsApp group draft marked as manually sent.`, "success");
  } catch (error) {
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
    renderDraftQueue();
  } finally {
    draftQueueMutationRunning = false;
    updateDraftSendControls(draftQueueRows);
  }
}

async function archiveSelectedDrafts() {
  if (draftQueueMutationRunning) return;
  const ids = [...selectedDraftMessageIds];
  if (!ids.length) {
    setStatus(rfxOutreachStatus, "Select one or more draft rows before archiving.", "error");
    return;
  }
  if (!confirmDraftQueueAction("archive", ids)) return;
  const eventId = selectedEventId;
  draftQueueMutationRunning = true;
  if (draftArchiveSelectedButton) draftArchiveSelectedButton.disabled = true;
  setStatus(rfxOutreachStatus, `Archiving ${formatNumber(ids.length)} delivery message(s)...`);
  try {
    const result = await markOutreachMessages(ids, "archived", { channel: selectedOutreachChannel() });
    clearDraftQueueSelection();
    if (!(await refreshOutreachStateForEvent(eventId))) return;
    renderOutreachLaunchpad();
    setStatus(
      rfxOutreachStatus,
      `Archive finished: ${outreachBulkResultSummary(result, "message")}. Carrier participation and This RFx history were preserved.`,
      result.failures?.length || result.skipped ? "warning" : "success"
    );
  } catch (error) {
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
    renderDraftQueue();
  } finally {
    draftQueueMutationRunning = false;
    updateDraftSendControls(draftQueueRows);
  }
}

async function deleteSelectedDrafts() {
  if (draftQueueMutationRunning) return;
  const ids = [...selectedDraftMessageIds];
  if (!ids.length) {
    setStatus(rfxOutreachStatus, "Select one or more draft rows before deleting.", "error");
    return;
  }
  const confirmed = window.confirm(`Delete ${ids.length} selected draft row(s)? This only removes the queue rows, not vendors or RFx lanes.`);
  if (!confirmed) return;
  const eventId = selectedEventId;
  draftQueueMutationRunning = true;
  if (draftDeleteSelectedButton) draftDeleteSelectedButton.disabled = true;
  setStatus(rfxOutreachStatus, `Deleting ${formatNumber(ids.length)} draft row(s)...`);
  try {
    const result = await deleteOutreachMessages(ids, { channel: selectedOutreachChannel() });
    clearDraftQueueSelection();
    if (!(await refreshOutreachStateForEvent(eventId))) return;
    renderOutreachLaunchpad();
    setStatus(
      rfxOutreachStatus,
      `Delete finished: ${outreachBulkResultSummary(result, "draft")}.`,
      result.failures?.length || result.skipped ? "warning" : "success"
    );
  } catch (error) {
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
    renderDraftQueue();
  } finally {
    draftQueueMutationRunning = false;
    updateDraftSendControls(draftQueueRows);
  }
}

async function saveSelectedRfxTemplate() {
  const template = selectedOutreachTemplate();
  if (!template || !rfxTemplateHtml) {
    setStatus(rfxTemplateEditorStatus, "Select a template before saving HTML.", "error");
    return;
  }
  const canonicalName = canonicalRfxInvitationTemplateName(template);
  const ownedCanonicalTemplate = outreachTemplates.find((row) =>
    row.owner_email
    && row.id !== template.id
    && canonicalRfxInvitationTemplateName(row).toLowerCase() === canonicalName.toLowerCase()
  );
  const targetTemplate = template.owner_email ? template : ownedCanonicalTemplate;
  const payload = templateSavePayload({ ...template, name: canonicalName });
  if (saveRfxTemplateHtmlButton) saveRfxTemplateHtmlButton.disabled = true;
  setStatus(rfxTemplateEditorStatus, "Saving template...");
  try {
    const row = targetTemplate
      ? await updateOutreachTemplate(targetTemplate.id, payload)
      : await createOutreachTemplate(payload);
    outreachTemplates = await fetchOutreachTemplates();
    if (rfxOutreachTemplate && row?.id) rfxOutreachTemplate.value = row.id;
    rfxTemplateEditorTemplateId = row?.id || template.id;
    rfxTemplateEditorDirty = false;
    renderOutreachTemplateSelect();
    if (rfxOutreachTemplate && row?.id) rfxOutreachTemplate.value = row.id;
    renderRfxTemplateEditor({ force: true });
    renderOutreachPreview();
    setStatus(rfxTemplateEditorStatus, "Template saved.", "success");
    setStatus(rfxOutreachStatus, "Email template changes saved. Draft queue is ready to generate.", "success");
  } catch (error) {
    setStatus(rfxTemplateEditorStatus, humanizeError(error), "error");
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
  } finally {
    if (saveRfxTemplateHtmlButton) saveRfxTemplateHtmlButton.disabled = false;
  }
}

async function restoreSelectedRfxTemplateOriginal() {
  const template = selectedOutreachTemplate();
  const original = originalRfxInvitationTemplate(template);
  if (!template || !original) {
    setStatus(rfxTemplateEditorStatus, "The original system template is not available for this language.", "error");
    return;
  }
  const hasWorkspaceOverride = Boolean(template.owner_email);
  const confirmation = hasWorkspaceOverride
    ? "Restore the original system template? This removes the saved workspace version for this language and discards unsaved changes."
    : "Discard unsaved changes and restore the original system template?";
  if ((hasWorkspaceOverride || rfxTemplateEditorDirty) && !window.confirm(confirmation)) return;
  if (restoreRfxTemplateOriginalButton) restoreRfxTemplateOriginalButton.disabled = true;
  if (saveRfxTemplateHtmlButton) saveRfxTemplateHtmlButton.disabled = true;
  setStatus(rfxTemplateEditorStatus, hasWorkspaceOverride ? "Removing workspace override..." : "Restoring original template...");
  try {
    if (hasWorkspaceOverride) await deleteOutreachTemplate(template.id);
    outreachTemplates = await fetchOutreachTemplates();
    const restored = originalRfxInvitationTemplate(original) || original;
    renderOutreachTemplateSelect();
    if (rfxOutreachTemplate) rfxOutreachTemplate.value = restored.id;
    rfxTemplateEditorTemplateId = restored.id;
    rfxTemplateEditorDirty = false;
    rfxTemplateVisualEditing = false;
    renderRfxTemplateEditor({ force: true });
    renderOutreachPreview();
    setStatus(rfxTemplateEditorStatus, "Original template restored. You can edit it again and save a new workspace version.", "success");
    setStatus(rfxOutreachStatus, "Original English/Spanish invitation template is active.", "success");
  } catch (error) {
    setStatus(rfxTemplateEditorStatus, humanizeError(error), "error");
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
  } finally {
    if (restoreRfxTemplateOriginalButton) restoreRfxTemplateOriginalButton.disabled = false;
    if (saveRfxTemplateHtmlButton) saveRfxTemplateHtmlButton.disabled = false;
  }
}

async function publishSelectedWhatsappTemplate() {
  const template = selectedOutreachTemplate();
  if (!template?.id) {
    setStatus(rfxOutreachStatus, "Select an Outreach template first.", "error");
    return;
  }
  if (rfxTemplateEditorDirty) {
    setStatus(rfxOutreachStatus, "Save the Outreach template before publishing its WhatsApp version to Meta.", "error");
    return;
  }
  if (publishWhatsappTemplateButton) publishWhatsappTemplateButton.disabled = true;
  setStatus(rfxOutreachStatus, "Creating the compact Meta notifier from this Outreach template...");
  try {
    const result = await publishOutreachTemplateToWhatsapp(template.id);
    await loadOutreachAssets();
    setStatus(rfxOutreachStatus, result.message || "WhatsApp template submitted to Meta.", result.ready ? "success" : "warning");
  } catch (error) {
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
    if (publishWhatsappTemplateButton) publishWhatsappTemplateButton.disabled = false;
  }
}

async function syncSelectedWhatsappTemplate() {
  if (syncWhatsappTemplateButton) syncWhatsappTemplateButton.disabled = true;
  setStatus(rfxOutreachStatus, "Syncing WhatsApp template approval status from Meta...");
  try {
    const result = await syncOutreachWhatsappTemplates();
    await loadOutreachAssets();
    setStatus(
      rfxOutreachStatus,
      `${formatNumber(result.approved || 0)} approved of ${formatNumber(result.synced || 0)} Meta template(s).`,
      result.approved ? "success" : "warning"
    );
  } catch (error) {
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
  } finally {
    if (syncWhatsappTemplateButton) syncWhatsappTemplateButton.disabled = false;
  }
}

initAuthControls();
initResponseColumnFilters();
renderManualLaneRows();
activateRfxLaunchWorkspace(rfxLaunchWorkspace, { persist: false });
activateRfxOperateWorkspace(rfxOperateWorkspace, { persist: false });
activateRfxCloseWorkspace(rfxCloseWorkspace, { persist: false });
window.addEventListener("popstate", applyRfxUrlStateFromBrowser);
requirePrivatePage().then((session) => {
  if (session?.token) {
    loadRfxCustomerOptions();
    const initialView = rfxWorkbench?.current() || "setup";
    if (initialView === "carriers") loadCarrierWorkspaceData();
    if (initialView === "outreach") {
      loadOutreachAssets();
      loadWhatsappConnectionReadiness();
      loadCarrierWorkspaceData();
    }
    loadEvents();
  }
}).catch(() => {});

document.querySelector("[data-workbench-view-button='carriers']")?.addEventListener("click", () => {
  loadCarrierWorkspaceData();
});
document.querySelector("[data-workbench-view-button='outreach']")?.addEventListener("click", () => {
  loadOutreachAssets();
  loadWhatsappConnectionReadiness();
  loadCarrierWorkspaceData();
  void loadRfxCarrierFitEvidence();
  activateRfxLaunchWorkspace(rfxLaunchWorkspace, { persist: false });
});
rfxLaunchWorkspaceTabs?.addEventListener("click", (event) => {
  const button = event.target instanceof Element
    ? event.target.closest("[data-rfx-launch-workspace]")
    : null;
  if (!(button instanceof HTMLButtonElement)) return;
  activateRfxLaunchWorkspace(button.dataset.rfxLaunchWorkspace);
});

rfxCustomerInput?.addEventListener("focus", () => {
  if (!rfxCustomerRows.length) loadRfxCustomerOptions(rfxCustomerInput.value);
});
rfxCustomerInput?.addEventListener("input", queueRfxCustomerSearch);
rfxCustomerInput?.addEventListener("change", normalizeSelectedRfxCustomer);

eventForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  normalizeSelectedRfxCustomer();
  const isEditing = Boolean(editingEventId);
  setStatus(eventStatus, isEditing ? "Saving bid event..." : "Creating bid event...");
  try {
    const row = isEditing
      ? await updateRfxEvent(editingEventId, rfxEventPayload())
      : await createRfxEvent(rfxEventPayload());
    selectedEventId = row.id;
    resetRfxEventForm();
    setStatus(eventStatus, isEditing ? "Bid event updated." : "Bid event created.", "success");
    await loadEvents();
  } catch (error) {
    setStatus(eventStatus, humanizeError(error), "error");
  }
});

refreshButton?.addEventListener("click", () => loadEvents({ force: true }));
wizardRefreshButton?.addEventListener("click", () => loadEvents({ force: true }));
wizardLiveOffersButton?.addEventListener("click", () => activateWorkbenchView("responses", "#rfx-response-body"));

rfxEventFilterSearch?.addEventListener("input", () => {
  eventFilterSearch = rfxEventFilterSearch.value;
  selectedRfxEventViewId = "";
  persistRfxWorkspaceContext();
  renderEvents();
});

rfxEventStatusFilter?.addEventListener("change", () => {
  eventStatusFilter = normalizeRfxEventFilterValue(rfxEventStatusFilter.value);
  selectedRfxEventViewId = "";
  persistRfxWorkspaceContext();
  renderEvents();
});

rfxEventTypeFilter?.addEventListener("change", () => {
  eventTypeFilter = normalizeRfxEventFilterValue(rfxEventTypeFilter.value);
  selectedRfxEventViewId = "";
  persistRfxWorkspaceContext();
  renderEvents();
});

rfxEventVisibilityFilter?.addEventListener("change", () => {
  eventVisibilityFilter = normalizeRfxEventFilterValue(rfxEventVisibilityFilter.value);
  selectedRfxEventViewId = "";
  persistRfxWorkspaceContext();
  renderEvents();
});

rfxEventViewSelect?.addEventListener("change", () => {
  const view = savedRfxEventViews.find((item) => item.id === rfxEventViewSelect.value);
  if (view) applyRfxEventView(view);
  else {
    selectedRfxEventViewId = "";
    renderRfxEventViewOptions();
  }
});

saveRfxEventViewButton?.addEventListener("click", saveCurrentRfxEventView);
deleteRfxEventViewButton?.addEventListener("click", deleteSelectedRfxEventView);
rfxEventViewName?.addEventListener("input", () => rfxEventViewName.removeAttribute("aria-invalid"));

document.addEventListener("click", (event) => {
  const retryButton = event.target.closest("[data-retry-action]");
  if (retryButton?.dataset.retryAction === "load-rfx-events") {
    loadEvents({ force: true });
    return;
  }

  const publishWhatsappButton = event.target.closest("#rfx-publish-whatsapp-template");
  if (publishWhatsappButton) {
    event.preventDefault();
    publishSelectedWhatsappTemplate();
    return;
  }

  const syncWhatsappButton = event.target.closest("#rfx-sync-whatsapp-template");
  if (syncWhatsappButton) {
    event.preventDefault();
    syncSelectedWhatsappTemplate();
    return;
  }

  const editVisualTemplateButton = event.target.closest("[data-rfx-template-edit-visual]");
  if (editVisualTemplateButton) {
    event.preventDefault();
    rfxTemplateVisualEditing = true;
    renderOutreachPreview();
    document.querySelector("#rfx-email-visual-editor")?.focus();
    return;
  }

  const cancelVisualTemplateButton = event.target.closest("[data-rfx-template-cancel-visual]");
  if (cancelVisualTemplateButton) {
    event.preventDefault();
    rfxTemplateVisualEditing = false;
    renderOutreachPreview();
    return;
  }

  const saveVisualTemplateButton = event.target.closest("[data-rfx-template-save-visual]");
  if (saveVisualTemplateButton) {
    event.preventDefault();
    const surface = document.querySelector("#rfx-email-visual-editor");
    if (!surface || !rfxTemplateHtml) return;
    rfxTemplateHtml.value = htmlFromVisualEditor(surface);
    rfxTemplateEditorDirty = true;
    rfxTemplateVisualEditing = false;
    saveSelectedRfxTemplate().catch((error) => setStatus(rfxTemplateEditorStatus, humanizeError(error), "error"));
    return;
  }

  const copyReadinessButton = event.target.closest("[data-rfx-copy-readiness]");
  if (copyReadinessButton) {
    event.preventDefault();
    copyReadinessReport();
    return;
  }

  const firstReadinessIssueButton = event.target.closest("[data-rfx-readiness-first-issue]");
  if (firstReadinessIssueButton) {
    event.preventDefault();
    openFirstReadinessIssue();
    return;
  }

  const wizardGoButton = event.target.closest("[data-rfx-wizard-go]");
  if (wizardGoButton) {
    event.preventDefault();
    const requestedView = wizardGoButton.dataset.rfxWizardGo || "manager";
    const view = requestedView === "wizard" || requestedView === "manager" ? "setup" : requestedView;
    const focusTargets = {
      setup: "#rfx-id",
      lanes: "#rfx-lane-template-file",
      carriers: "#manual-shortlist-search",
      outreach: "#rfx-outreach-template",
      responses: "#rfx-response-body",
      award: null
    };
    activateWorkbenchView(view, focusTargets[view] || null);
    return;
  }

  const wizardAutoShortlistButton = event.target.closest("[data-rfx-wizard-auto-shortlist]");
  if (wizardAutoShortlistButton) {
    if (!selectedEventId || !currentLanes.length) return;
    wizardAutoShortlistButton.disabled = true;
    autoShortlistLaneIds(currentLanes.map((lane) => lane.id), actionStatus)
      .catch((error) => setStatus(actionStatus, humanizeError(error), "error"))
      .finally(() => {
        wizardAutoShortlistButton.disabled = false;
        renderWizard();
      });
    return;
  }

  const wizardDraftButton = event.target.closest("[data-rfx-wizard-create-drafts]");
  if (wizardDraftButton) {
    wizardDraftButton.disabled = true;
    createCurrentOutreachDrafts(actionStatus)
      .catch((error) => setStatus(actionStatus, humanizeError(error), "error"))
      .finally(() => {
        wizardDraftButton.disabled = false;
        renderWizard();
      });
    return;
  }

  const createButton = event.target.closest("[data-rfx-focus-create]");
  if (createButton) {
    selectedEventId = null;
    selectedEvent = null;
    currentLanes = [];
    focusedLaneId = null;
    persistRfxWorkspaceContext();
    resetRfxEventForm();
    renderEventDashboard();
    renderLanes();
    activateWorkbenchView("setup", "#rfx-id");
    rfxIdInput?.focus();
    eventForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

draftList?.addEventListener("click", async (event) => {
  const refreshDraftButton = event.target.closest("[data-rfx-refresh-draft]");
  if (refreshDraftButton) {
    refreshDraftButton.disabled = true;
    try {
      await refreshSingleOutreachDraft(refreshDraftButton.dataset.rfxRefreshDraft);
    } finally {
      refreshDraftButton.disabled = false;
    }
    return;
  }
  const sendNowButton = event.target.closest("[data-rfx-send-draft-now]");
  if (sendNowButton) {
    sendNowButton.disabled = true;
    try {
      await sendSingleDraftEmail(sendNowButton.dataset.rfxSendDraftNow);
    } finally {
      sendNowButton.disabled = false;
    }
    return;
  }
  const sendWhatsappNowButton = event.target.closest("[data-rfx-send-whatsapp-now]");
  if (sendWhatsappNowButton) {
    sendWhatsappNowButton.disabled = true;
    try {
      await sendSingleDraftWhatsapp(sendWhatsappNowButton.dataset.rfxSendWhatsappNow);
    } finally {
      sendWhatsappNowButton.disabled = false;
    }
    return;
  }
  const markWhatsappGroupSentButton = event.target.closest("[data-rfx-mark-whatsapp-group-sent]");
  if (markWhatsappGroupSentButton) {
    markWhatsappGroupSentButton.disabled = true;
    try {
      await markSingleWhatsappGroupManuallySent(markWhatsappGroupSentButton.dataset.rfxMarkWhatsappGroupSent);
    } finally {
      markWhatsappGroupSentButton.disabled = false;
    }
    return;
  }
  const openButton = event.target.closest("[data-rfx-open-draft]");
  if (openButton) {
    const url = openButton.dataset.rfxOpenDraft;
    if (url) window.open(url, "_blank", "noopener");
    return;
  }
  const statusButton = event.target.closest("[data-rfx-mark-draft]");
  if (!statusButton) return;
  const id = statusButton.dataset.rfxMarkDraft;
  const status = statusButton.dataset.rfxDraftStatus;
  if (!id || !status) return;
  const eventId = selectedEventId;
  const row = findDraftRow(id);
  const channel = row?.channel || selectedOutreachChannel();
  statusButton.disabled = true;
  setStatus(rfxOutreachStatus, status === "archived" ? "Archiving delivery message..." : `Marking draft ${status}...`);
  try {
    const result = await markOutreachMessages([id], status, { channel });
    forgetDraftRow(id);
    if (!(await refreshOutreachStateForEvent(eventId))) return;
    renderOutreachLaunchpad();
    setStatus(
      rfxOutreachStatus,
      status === "archived"
        ? `Delivery message archived: ${outreachBulkResultSummary(result, "message")}. Carrier participation and This RFx history were preserved.`
        : `Draft update finished: ${outreachBulkResultSummary(result, "draft")}.`,
      result.failures?.length || result.skipped ? "warning" : "success"
    );
  } catch (error) {
    setStatus(rfxOutreachStatus, humanizeError(error), "error");
  } finally {
    statusButton.disabled = false;
  }
});

draftList?.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-rfx-draft-select]");
  if (!checkbox) return;
  const id = checkbox.dataset.rfxDraftSelect;
  if (!id) return;
  if (checkbox.checked) {
    rememberDraftRow(draftQueueRows.find((message) => String(message.id) === String(id)));
  } else {
    forgetDraftRow(id);
  }
  renderDraftQueue();
});

function applyDraftQueueSearch() {
  if (!draftSearchInput) return;
  if (draftSearchRenderTimer) {
    window.clearTimeout(draftSearchRenderTimer);
    draftSearchRenderTimer = null;
  }
  draftQueueSearch = draftSearchInput.value || "";
  clearDraftQueueSelection();
  persistRfxWorkspaceContext();
  loadDraftQueuePage(selectedEventId, { reset: true });
}

function scheduleDraftQueueSearch() {
  if (!draftSearchInput) return;
  if (draftSearchRenderTimer) window.clearTimeout(draftSearchRenderTimer);
  draftSearchRenderTimer = window.setTimeout(applyDraftQueueSearch, DRAFT_QUEUE_SEARCH_DEBOUNCE_MS);
}

draftSearchInput?.addEventListener("input", scheduleDraftQueueSearch);
draftSearchInput?.addEventListener("change", applyDraftQueueSearch);
draftSearchInput?.addEventListener("search", applyDraftQueueSearch);

draftClearSearchButton?.addEventListener("click", () => {
  if (draftSearchRenderTimer) {
    window.clearTimeout(draftSearchRenderTimer);
    draftSearchRenderTimer = null;
  }
  draftQueueSearch = "";
  if (draftSearchInput) draftSearchInput.value = "";
  clearDraftQueueSelection();
  persistRfxWorkspaceContext();
  loadDraftQueuePage(selectedEventId, { reset: true });
});

draftTrackingFilters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-rfx-draft-tracking]");
  if (!button || draftQueueLoading) return;
  const nextStatus = normalizeDraftTrackingStatus(button.dataset.rfxDraftTracking);
  if (nextStatus === draftQueueTrackingStatus) return;
  draftQueueTrackingStatus = nextStatus;
  clearDraftQueueSelection();
  persistRfxWorkspaceContext();
  loadDraftQueuePage(selectedEventId, { reset: true });
});

draftToggleVisible?.addEventListener("change", () => {
  const rows = draftQueueRows;
  if (draftToggleVisible.checked) {
    rows.forEach(rememberDraftRow);
  } else {
    rows.forEach((message) => forgetDraftRow(message.id));
  }
  renderDraftQueue();
});

draftSelectAllEmailsButton?.addEventListener("click", () => {
  const rows = draftQueueRows;
  const channel = selectedOutreachChannel();
  const selectable = channel === "whatsapp"
    ? selectableWhatsappDrafts(rows)
    : channel === "whatsapp_group"
      ? selectableWhatsappGroupDrafts(rows)
      : selectableEmailDrafts(rows);
  selectable.forEach(rememberDraftRow);
  renderDraftQueue();
});

draftClearSelectionButton?.addEventListener("click", () => {
  clearDraftQueueSelection();
  renderDraftQueue();
});

draftPageSize?.addEventListener("change", () => {
  draftQueuePageSize = RFX_DRAFT_PAGE_SIZES.includes(Number(draftPageSize.value)) ? Number(draftPageSize.value) : 100;
  clearDraftQueueSelection();
  persistRfxWorkspaceContext();
  loadDraftQueuePage(selectedEventId, { reset: true });
});

draftPreviousPageButton?.addEventListener("click", () => {
  if (draftQueueOffset <= 0 || draftQueueLoading) return;
  draftQueueOffset = Math.max(0, draftQueueOffset - draftQueuePageSize);
  clearDraftQueueSelection();
  persistRfxWorkspaceContext();
  loadDraftQueuePage(selectedEventId);
});

draftNextPageButton?.addEventListener("click", () => {
  if (draftQueueLoading || draftQueueOffset + draftQueueRows.length >= draftQueueTotal) return;
  draftQueueOffset += draftQueuePageSize;
  clearDraftQueueSelection();
  persistRfxWorkspaceContext();
  loadDraftQueuePage(selectedEventId);
});

draftRefreshSelectedButton?.addEventListener("click", () => {
  refreshSelectedOutreachDrafts();
});

draftSendSelectedButton?.addEventListener("click", () => {
  sendSelectedDraftEmails();
});

draftSendSelectedWhatsappButton?.addEventListener("click", () => {
  sendSelectedDraftWhatsapp();
});

draftMarkSelectedWhatsappGroupsButton?.addEventListener("click", () => {
  markSelectedWhatsappGroupsManuallySent();
});

draftArchiveSelectedButton?.addEventListener("click", () => {
  archiveSelectedDrafts();
});

draftDeleteSelectedButton?.addEventListener("click", () => {
  deleteSelectedDrafts();
});

eventList?.addEventListener("click", async (event) => {
  if (event.target.closest("[data-rfx-clear-event-filters]")) {
    clearRfxEventFilters();
    return;
  }
  if (event.target.closest("[data-rfx-marketplace-link]")) return;
  const card = event.target.closest("[data-rfx-event-id]");
  if (!card) return;
  await loadDetail(card.dataset.rfxEventId);
});

eventList?.addEventListener("pointerover", (event) => {
  const card = event.target.closest("[data-rfx-event-id]");
  if (card) showFloatingEventTooltip(card);
});

eventList?.addEventListener("pointerout", (event) => {
  const card = event.target.closest("[data-rfx-event-id]");
  if (!card || card.contains(event.relatedTarget)) return;
  hideFloatingEventTooltip();
});

eventList?.addEventListener("focusin", (event) => {
  const card = event.target.closest("[data-rfx-event-id]");
  if (card) showFloatingEventTooltip(card);
});

eventList?.addEventListener("focusout", (event) => {
  const card = event.target.closest("[data-rfx-event-id]");
  if (!card || card.contains(event.relatedTarget)) return;
  hideFloatingEventTooltip();
});

window.addEventListener("resize", hideFloatingEventTooltip);
window.addEventListener("scroll", hideFloatingEventTooltip, true);

laneCoverage?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-rfx-focus-lane]");
  if (!button) return;
  focusLane(button.dataset.rfxFocusLane);
  const row = [...(lanesBody?.querySelectorAll("[data-rfx-lane-id]") || [])]
    .find((item) => item.dataset.rfxLaneId === button.dataset.rfxFocusLane);
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("is-focused-row");
  window.setTimeout(() => row.classList.remove("is-focused-row"), 1400);
});

document.querySelectorAll("[data-rfx-lane-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeLaneFilter = button.dataset.rfxLaneFilter || "all";
    persistRfxWorkspaceContext();
    document.querySelectorAll("[data-rfx-lane-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    if (!visibleLanes().some((lane) => lane.id === focusedLaneId)) focusedLaneId = visibleLanes()[0]?.id || null;
    renderLanes();
  });
});

laneSearch?.addEventListener("input", () => {
  persistRfxWorkspaceContext();
  if (!visibleLanes().some((lane) => lane.id === focusedLaneId)) focusedLaneId = visibleLanes()[0]?.id || null;
  renderLanes();
});

toggleLaneEditButton?.addEventListener("click", () => {
  if (laneEditMode && pendingLaneEdits.size && !window.confirm("Discard unsaved lane changes?")) return;
  if (laneEditMode) {
    laneEditMode = false;
    editingLaneId = null;
    pendingLaneEdits.clear();
  } else {
    const targetLane = currentLanes.find((lane) => String(lane.id) === String(focusedLaneId))
      || currentLanes.find((lane) => selectedLaneIds.has(lane.id))
      || visibleLanes()[0];
    if (!targetLane) return;
    laneEditMode = true;
    editingLaneId = targetLane.id;
    focusedLaneId = targetLane.id;
  }
  renderLanes();
});

saveLaneEditsButton?.addEventListener("click", () => {
  saveRfxLaneEdits([...pendingLaneEdits.keys()]);
});

cancelLaneEditsButton?.addEventListener("click", () => {
  pendingLaneEdits.clear();
  renderLanes();
  setStatus(laneEditStatus, "Lane edits reverted.", "neutral");
});

downloadLaneTemplateButton?.addEventListener("click", downloadRfxLaneTemplate);

laneTemplateFileInput?.addEventListener("change", async () => {
  const file = laneTemplateFileInput.files?.[0];
  if (!file) {
    clearLaneTemplateImport();
    return;
  }
  setStatus(laneImportStatus, `Reading ${file.name}...`);
  importLanesButton.disabled = true;
  try {
    pendingLaneTemplateRows = await parseLaneTemplateFile(file);
    pendingLaneTemplateIssues = validateLaneTemplateRows(pendingLaneTemplateRows);
    if (!pendingLaneTemplateRows.length) {
      setStatus(laneImportStatus, "No lane rows found. Use the template and keep origin/destination populated.", "error");
    }
    renderLaneTemplatePreview();
  } catch (error) {
    pendingLaneTemplateRows = [];
    pendingLaneTemplateIssues = [];
    renderLaneTemplatePreview();
    setStatus(laneImportStatus, humanizeError(error), "error");
  } finally {
    updateLaneImportButton();
  }
});

importLanesButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  const eventId = selectedEventId;
  const rows = readyLaneTemplateRows();
  if (!rows.length) {
    setStatus(laneImportStatus, "Upload a completed RFx lane template before importing, or use quick manual entry below.", "error");
    return;
  }
  importLanesButton.disabled = true;
  setStatus(laneImportStatus, `Importing ${rows.length} lane(s)...`);
  try {
    const result = await importRfxLanes(eventId, rows);
    if (selectedEventId !== eventId) return;
    const inserted = Number(result.inserted || 0);
    const skipped = Number(result.skipped || 0);
    const duplicateNote = skipped ? ` ${skipped} duplicate lane(s) skipped; existing activity was preserved.` : "";
    setStatus(laneImportStatus, `${inserted} lane(s) added.${duplicateNote}`, "success");
    clearLaneTemplateImport({ preserveStatus: true });
    await loadDetail(eventId);
    if (selectedEventId !== eventId) return;
    await loadEvents();
  } catch (error) {
    if (selectedEventId === eventId) setStatus(laneImportStatus, humanizeError(error), "error");
  } finally {
    updateLaneImportButton();
  }
});

clearLanesInputButton?.addEventListener("click", () => {
  clearLaneTemplateImport();
});

addManualLaneButton?.addEventListener("click", () => {
  manualLaneRows.push(newManualLaneRow());
  renderManualLaneRows();
  manualLanesBody?.querySelector(`[data-manual-lane-index="${manualLaneRows.length - 1}"] input`)?.focus();
});

clearManualLanesButton?.addEventListener("click", () => {
  resetManualLaneRows();
});

manualLanesBody?.addEventListener("paste", (event) => {
  insertClipboardHtmlIntoTextarea(event, "[data-manual-lane-field]", manualLaneStatus);
});

manualLanesBody?.addEventListener("input", (event) => {
  const field = event.target.closest("[data-manual-lane-field]");
  if (!field) return;
  const row = field.closest("[data-manual-lane-index]");
  const index = Number(row?.dataset.manualLaneIndex);
  if (!Number.isInteger(index) || !manualLaneRows[index]) return;
  manualLaneRows[index][field.dataset.manualLaneField] = field.value;
  updateManualLaneImportButton();
});

manualLanesBody?.addEventListener("change", (event) => {
  const field = event.target.closest("[data-manual-lane-field]");
  if (!field) return;
  const row = field.closest("[data-manual-lane-index]");
  const index = Number(row?.dataset.manualLaneIndex);
  if (!Number.isInteger(index) || !manualLaneRows[index]) return;
  manualLaneRows[index][field.dataset.manualLaneField] = field.value;
  updateManualLaneImportButton();
});

manualLanesBody?.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-manual-lane]");
  if (!removeButton) return;
  const index = Number(removeButton.dataset.removeManualLane);
  if (!Number.isInteger(index) || manualLaneRows.length <= 1) return;
  manualLaneRows.splice(index, 1);
  renderManualLaneRows();
});

importManualLanesButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  const eventId = selectedEventId;
  const rows = manualLaneImportRows();
  const invalidRows = manualLaneRows.filter(hasManualLaneUserInput).filter((row) => manualLaneIssues(row).length);
  if (!rows.length) {
    setStatus(manualLaneStatus, "Add at least one manual lane before importing.", "error");
    return;
  }
  if (invalidRows.length) {
    setStatus(manualLaneStatus, `${invalidRows.length} manual row(s) need origin and destination before import.`, "error");
    return;
  }
  importManualLanesButton.disabled = true;
  setStatus(manualLaneStatus, `Importing ${rows.length} manual lane(s)...`);
  try {
    const result = await importRfxLanes(eventId, rows);
    if (selectedEventId !== eventId) return;
    const inserted = Number(result.inserted || 0);
    const skipped = Number(result.skipped || 0);
    const duplicateNote = skipped ? ` ${skipped} duplicate lane(s) skipped; existing activity was preserved.` : "";
    const importedMessage = `${inserted} manual lane(s) added.${duplicateNote}`;
    resetManualLaneRows({ preserveStatus: true });
    setStatus(manualLaneStatus, importedMessage, "success");
    await loadDetail(eventId);
    if (selectedEventId !== eventId) return;
    await loadEvents();
  } catch (error) {
    if (selectedEventId === eventId) setStatus(manualLaneStatus, humanizeError(error), "error");
  } finally {
    importManualLanesButton.disabled = false;
    updateManualLaneImportButton();
  }
});

openRfxButton?.addEventListener("click", async () => {
  if (eventLifecycleMutationRunning) return;
  if (!selectedEventId) return;
  const eventId = selectedEventId;
  if (!confirmEventLifecycleAction("open")) return;
  eventLifecycleMutationRunning = true;
  updateEventActionState();
  setStatus(actionStatus, "Opening bid event...");
  try {
    await updateRfxEvent(eventId, { status: "open" });
    if (selectedEventId === eventId) {
      setStatus(actionStatus, "Bid event opened.", "success");
      await loadEvents();
    }
  } catch (error) {
    if (selectedEventId === eventId) setStatus(actionStatus, humanizeError(error), "error");
  } finally {
    eventLifecycleMutationRunning = false;
    updateEventActionState();
  }
});

closeRfxButton?.addEventListener("click", async () => {
  if (eventLifecycleMutationRunning) return;
  if (!selectedEventId) return;
  const eventId = selectedEventId;
  if (!confirmEventLifecycleAction("close")) return;
  eventLifecycleMutationRunning = true;
  updateEventActionState();
  setStatus(actionStatus, "Closing bid event...");
  try {
    await updateRfxEvent(eventId, { status: "closed" });
    if (selectedEventId === eventId) {
      setStatus(actionStatus, "Bid event closed.", "success");
      await loadEvents();
    }
  } catch (error) {
    if (selectedEventId === eventId) setStatus(actionStatus, humanizeError(error), "error");
  } finally {
    eventLifecycleMutationRunning = false;
    updateEventActionState();
  }
});

editRfxButton?.addEventListener("click", () => {
  if (!selectedEvent) return;
  fillRfxEventForm(selectedEvent);
});

duplicateRfxButton?.addEventListener("click", async () => {
  if (eventLifecycleMutationRunning) return;
  if (!selectedEventId) return;
  const eventId = selectedEventId;
  if (!confirmEventLifecycleAction("duplicate")) return;
  eventLifecycleMutationRunning = true;
  updateEventActionState();
  setStatus(actionStatus, "Duplicating bid event...");
  try {
    const result = await duplicateRfxEvent(eventId);
    if (selectedEventId !== eventId) return;
    selectedEventId = result.row?.id || eventId;
    resetRfxEventForm();
    setStatus(actionStatus, `RFx duplicated with ${result.lanes || 0} lane(s).`, "success");
    await loadEvents();
  } catch (error) {
    if (selectedEventId === eventId) setStatus(actionStatus, humanizeError(error), "error");
  } finally {
    eventLifecycleMutationRunning = false;
    updateEventActionState();
  }
});

archiveRfxButton?.addEventListener("click", async () => {
  if (eventLifecycleMutationRunning) return;
  if (!selectedEventId) return;
  const eventId = selectedEventId;
  if (!confirmEventLifecycleAction("archive")) return;
  eventLifecycleMutationRunning = true;
  updateEventActionState();
  setStatus(actionStatus, "Archiving bid event...");
  try {
    await archiveRfxEvent(eventId);
    if (selectedEventId !== eventId) return;
    selectedEventId = null;
    selectedEvent = null;
    resetRfxEventForm();
    setStatus(actionStatus, "Bid event archived.", "success");
    await loadEvents();
  } catch (error) {
    if (selectedEventId === eventId) setStatus(actionStatus, humanizeError(error), "error");
  } finally {
    eventLifecycleMutationRunning = false;
    updateEventActionState();
  }
});

deleteRfxButton?.addEventListener("click", async () => {
  if (eventLifecycleMutationRunning) return;
  if (!selectedEventId) return;
  const eventId = selectedEventId;
  if (!confirmEventLifecycleAction("delete")) return;
  eventLifecycleMutationRunning = true;
  updateEventActionState();
  setStatus(actionStatus, "Deleting bid event...");
  try {
    await deleteRfxEvent(eventId);
    if (selectedEventId !== eventId) return;
    selectedEventId = null;
    selectedEvent = null;
    resetRfxEventForm();
    setStatus(actionStatus, "Bid event deleted.", "success");
    await loadEvents();
  } catch (error) {
    if (selectedEventId === eventId) setStatus(actionStatus, humanizeError(error), "error");
  } finally {
    eventLifecycleMutationRunning = false;
    updateEventActionState();
  }
});

lanesBody?.addEventListener("change", (event) => {
  const laneInput = event.target.closest("[data-rfx-lane-select]");
  if (laneInput) {
    if (laneInput.checked) selectedLaneIds.add(laneInput.dataset.rfxLaneSelect);
    else selectedLaneIds.delete(laneInput.dataset.rfxLaneSelect);
  }
  const editField = event.target.closest("[data-rfx-lane-field]");
  if (editField) {
    const laneRow = editField.closest("[data-rfx-lane-id]");
    markLaneEdited(laneRow?.dataset.rfxLaneId, editField.dataset.rfxLaneField, editField.value);
  }
  updateSelectionControls();
  renderOutreachPreview();
});

lanesBody?.addEventListener("paste", (event) => {
  insertClipboardHtmlIntoTextarea(event, "[data-rfx-lane-field]", laneEditStatus);
});

lanesBody?.addEventListener("input", (event) => {
  const editField = event.target.closest("[data-rfx-lane-field]");
  if (!editField) return;
  const laneRow = editField.closest("[data-rfx-lane-id]");
  markLaneEdited(laneRow?.dataset.rfxLaneId, editField.dataset.rfxLaneField, editField.value);
});

lanesBody?.addEventListener("click", async (event) => {
  const inlineEditButton = event.target.closest("[data-rfx-inline-edit]");
  if (inlineEditButton) {
    const nextLaneId = inlineEditButton.dataset.rfxInlineEdit || focusedLaneId;
    if (editingLaneId && String(editingLaneId) !== String(nextLaneId) && pendingLaneEdits.size && !window.confirm("Discard unsaved changes for the current lane?")) return;
    if (editingLaneId && String(editingLaneId) !== String(nextLaneId)) pendingLaneEdits.clear();
    laneEditMode = true;
    editingLaneId = nextLaneId;
    focusedLaneId = nextLaneId;
    renderLanes();
    window.requestAnimationFrame(() => lanesBody?.querySelector(`[data-rfx-lane-id="${CSS.escape(focusedLaneId || "")}"] [data-rfx-lane-field="origin"]`)?.focus());
    return;
  }
  const saveButton = event.target.closest("[data-rfx-save-lane]");
  if (saveButton) {
    saveButton.disabled = true;
    await saveRfxLaneEdits([saveButton.dataset.rfxSaveLane]);
    return;
  }
  const cancelButton = event.target.closest("[data-rfx-cancel-lane]");
  if (cancelButton) {
    pendingLaneEdits.delete(String(cancelButton.dataset.rfxCancelLane || ""));
    renderLanes();
    return;
  }
  const laneRow = event.target.closest("[data-rfx-lane-id]");
  if (laneRow && !event.target.closest("button") && !event.target.closest("input") && !event.target.closest("select") && !event.target.closest("textarea")) {
    focusLane(laneRow.dataset.rfxLaneId);
  }
});

rfxOperateWorkspaceTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-rfx-operate-workspace-tab]");
  if (!button) return;
  activateRfxOperateWorkspace(button.dataset.rfxOperateWorkspaceTab || "auction");
});

rfxCloseWorkspaceTabs?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-rfx-close-workspace-tab]");
  if (!button) return;
  activateRfxCloseWorkspace(button.dataset.rfxCloseWorkspaceTab || "award", { focus: true });
});

liveOfferManager?.addEventListener("click", (event) => {
  const askCarrierButton = event.target.closest("[data-rfx-ask-carrier]");
  if (!askCarrierButton) return;
  openCarrierCommunication(askCarrierButton.dataset.rfxAskCarrier, askCarrierButton.dataset.rfxAskCarrierLane);
});

responseBody?.addEventListener("click", (event) => {
  const manualBidButton = event.target.closest("[data-rfx-manual-bid]");
  if (manualBidButton) {
    openManualBidDrawer(manualBidButton.dataset.rfxManualBid, manualBidButton.dataset.rfxManualBidLane);
    return;
  }
  const askCarrierButton = event.target.closest("[data-rfx-ask-carrier]");
  if (askCarrierButton) {
    openCarrierCommunication(askCarrierButton.dataset.rfxAskCarrier, askCarrierButton.dataset.rfxAskCarrierLane);
    return;
  }
  if (event.target.closest("button")) return;
  const row = event.target.closest("[data-rfx-lane-id]");
  if (!row) return;
  focusLane(row.dataset.rfxLaneId);
});

rfxAwardBoard?.addEventListener("click", async (event) => {
  const primaryButton = event.target.closest("[data-rfx-award-primary]");
  if (primaryButton) {
    primaryButton.disabled = true;
    try {
      await applyRfxAwardDecision(primaryButton.dataset.rfxAwardPrimary, "primary", primaryButton.dataset.awardDefault || "");
    } finally {
      renderAwardBoard();
    }
    return;
  }

  const backupButton = event.target.closest("[data-rfx-award-backup]");
  if (backupButton) {
    backupButton.disabled = true;
    try {
      await applyRfxAwardDecision(backupButton.dataset.rfxAwardBackup, "backup", backupButton.dataset.awardDefault || "");
    } finally {
      renderAwardBoard();
    }
    return;
  }

  const clearButton = event.target.closest("[data-rfx-clear-award]");
  if (clearButton) {
    clearButton.disabled = true;
    try {
      await clearRfxAwardDecision(clearButton.dataset.rfxClearAward);
    } finally {
      renderAwardBoard();
    }
  }
});

rfxRefreshAwardsButton?.addEventListener("click", async () => {
  if (!selectedEventId) return;
  await loadDetail(selectedEventId);
  activateWorkbenchView("award");
});

rfxCloseoutAwardsButton?.addEventListener("click", closeoutSelectedAwardsToRateware);
rfxApplyRecommendedAwardsButton?.addEventListener("click", applyRecommendedAwardDecisions);
rfxGenerateAwardNoticesButton?.addEventListener("click", generateAwardNoticeDrafts);
rfxSendAwardNoticesButton?.addEventListener("click", sendAwardNoticeDrafts);

rfxAwardNoticeQueue?.addEventListener("click", async (event) => {
  const clearSelectionButton = event.target.closest("[data-rfx-clear-award-notice-selection]");
  if (clearSelectionButton) {
    awardNoticeSelectedIds.clear();
    updateAwardNoticeControls();
    return;
  }
  const sendButton = event.target.closest("[data-rfx-send-award-notice]");
  if (sendButton) {
    await sendAwardNoticeDrafts([sendButton.dataset.rfxSendAwardNotice]);
    return;
  }
  const previewButton = event.target.closest("[data-rfx-preview-award-notice]");
  if (previewButton) {
    awardNoticePreviewId = previewButton.dataset.rfxPreviewAwardNotice || "";
    renderAwardNoticeQueue(awardNoticeDraftRows());
    return;
  }
  const openButton = event.target.closest("[data-rfx-open-award-notice]");
  if (openButton) {
    const url = openButton.dataset.rfxOpenAwardNotice;
    if (url) window.open(url, "_blank", "noopener");
    return;
  }
  const clickedRow = event.target.closest("[data-rfx-award-notice-row]");
  if (clickedRow && !event.target.closest("button, input")) {
    awardNoticePreviewId = clickedRow.dataset.rfxAwardNoticeRow || "";
    renderAwardNoticeQueue(awardNoticeDraftRows());
    return;
  }
  const statusButton = event.target.closest("[data-rfx-mark-award-notice]");
  if (!statusButton) return;
  const id = statusButton.dataset.rfxMarkAwardNotice;
  const status = statusButton.dataset.rfxAwardNoticeStatus;
  if (!id || !status) return;
  const eventId = selectedEventId;
  const row = awardNoticeDraftRows().find((message) => String(message.id) === String(id));
  const channel = row?.channel || "email";
  statusButton.disabled = true;
  setStatus(rfxAwardStatus, `Marking award notice ${status}...`);
  try {
    const result = await markOutreachMessages([id], status, { channel });
    if (!(await refreshOutreachStateForEvent(eventId))) return;
    renderOutreachLaunchpad();
    renderAwardBoard();
    setStatus(
      rfxAwardStatus,
      `Award notice update finished: ${outreachBulkResultSummary(result, "notice")}.`,
      result.failures?.length || result.skipped ? "warning" : "success"
    );
  } catch (error) {
    setStatus(rfxAwardStatus, humanizeError(error), "error");
  } finally {
    statusButton.disabled = false;
  }
});

rfxAwardNoticeQueue?.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-rfx-select-award-notice]");
  if (checkbox) {
    const id = String(checkbox.dataset.rfxSelectAwardNotice || "");
    if (id) {
      if (checkbox.checked) awardNoticeSelectedIds.add(id);
      else awardNoticeSelectedIds.delete(id);
    }
    updateAwardNoticeControls();
    return;
  }
  const selectAll = event.target.closest("[data-rfx-select-all-award-notices]");
  if (!selectAll) return;
  const ids = sendableAwardNoticeIds(visibleAwardNoticeRows());
  ids.forEach((id) => {
    if (selectAll.checked) awardNoticeSelectedIds.add(String(id));
    else awardNoticeSelectedIds.delete(String(id));
  });
  updateAwardNoticeControls();
});

copyRfxSummaryButton?.addEventListener("click", async () => {
  if (!selectedEvent) return;
  const invitations = currentLanes.flatMap((lane) => activeInvitations(lane));
  const bids = currentLanes.flatMap((lane) => bidInvitations(lane));
  const lines = [
    `${selectedEvent.rfx_id || "RFx"} | ${selectedEvent.name || ""}`,
    `Status: ${selectedEvent.status || "draft"} | Customer: ${selectedEvent.customer || "-"} | Due: ${selectedEvent.due_date || "-"}`,
    `Lanes: ${currentLanes.length} | Invitations: ${invitations.length} | Bids: ${bids.length}`,
    `Lane gaps: ${currentLanes.filter((lane) => laneDecisionStatus(lane) !== "has_bids").length}`,
    "",
    ...currentLanes.slice(0, 30).map((lane) => {
      const bestBid = bestBidForLane(lane);
      return `#${lane.lane_number || ""} ${laneRoute(lane)} | ${laneDecisionLabel(laneDecisionStatus(lane))} | Rateware ${lane.benchmark ? formatMoney(lane.benchmark.all_in_rate, lane.benchmark.currency) : "-"} | Best ${bestBid ? formatMoney(bestBid.board_rate ?? bestBid.numeric_bid ?? bestBid.bid_rate, bestBid.currency || lane.currency) : "-"}`;
    })
  ];
  await navigator.clipboard.writeText(lines.join("\n"));
  setStatus(actionStatus, "Bid Room summary copied.", "success");
});

autoShortlistButton?.addEventListener("click", async () => {
  const ids = selectedVisibleLaneIds();
  if (!ids.length) return;
  if (!confirmBidRoomBulkAction("auto_shortlist", ids)) return;
  autoShortlistButton.disabled = true;
  try {
    await autoShortlistLaneIds(ids, actionStatus);
  } catch (error) {
    setStatus(actionStatus, humanizeError(error), "error");
  } finally {
    updateSelectionControls();
  }
});

inviteSelectedButton?.addEventListener("click", async () => {
  if (participantBulkMutationRunning) return;
  const ids = selectedVisibleInvitationIds();
  if (!ids.length) return;
  if (!confirmBidRoomBulkAction("mark_invited", ids)) return;
  const eventId = selectedEventId;
  participantBulkMutationRunning = true;
  updateSelectionControls();
  setStatus(actionStatus, "Marking invitations as sent...");
  try {
    const updated = await mutateRfxParticipantsInBatches(ids, "invite", actionStatus);
    if (selectedEventId === eventId) {
      setStatus(actionStatus, `${updated} invitation(s) marked invited.`, "success");
      selectedInvitationIds.clear();
      await loadDetail(eventId);
    }
  } catch (error) {
    if (selectedEventId === eventId) setStatus(actionStatus, humanizeError(error), "error");
  } finally {
    participantBulkMutationRunning = false;
    updateSelectionControls();
  }
});

archiveSelectedButton?.addEventListener("click", async () => {
  if (participantBulkMutationRunning) return;
  const ids = selectedVisibleInvitationIds();
  if (!ids.length) return;
  if (!confirmBidRoomBulkAction("archive_participants", ids)) return;
  const eventId = selectedEventId;
  participantBulkMutationRunning = true;
  updateSelectionControls();
  setStatus(actionStatus, "Archiving invitation rows...");
  try {
    const updated = await mutateRfxParticipantsInBatches(ids, "archive", actionStatus);
    if (selectedEventId === eventId) {
      setStatus(actionStatus, `${updated} invitation row(s) archived.`, "success");
      selectedInvitationIds.clear();
      await loadDetail(eventId);
    }
  } catch (error) {
    if (selectedEventId === eventId) setStatus(actionStatus, humanizeError(error), "error");
  } finally {
    participantBulkMutationRunning = false;
    updateSelectionControls();
  }
});

manualShortlistSearch?.addEventListener("input", () => {
  renderManualShortlistControls();
  queueVendorSearchLoad();
});
rfxOutreachCarrierSearch?.addEventListener("input", () => {
  if (manualShortlistSearch) manualShortlistSearch.value = rfxOutreachCarrierSearch.value;
  renderOutreachCarrierAdder();
  renderManualShortlistControls();
  queueVendorSearchLoad();
});
rfxRefreshOutreachCarrierFitButton?.addEventListener("click", () => {
  setStatus(rfxOutreachCarrierStatus, "Refreshing Carrier CRM, coverage, and Rateware evidence...");
  void Promise.all([
    loadCarrierWorkspaceData({ force: true }),
    loadRfxCarrierFitEvidence({ force: true })
  ]).then(() => {
    setStatus(rfxOutreachCarrierStatus, "Carrier fit refreshed. Review profile, coverage, and Rateware evidence before adding carriers.", "success");
  }).catch((error) => {
    setStatus(rfxOutreachCarrierStatus, humanizeError(error), "error");
  });
});
rfxOutreachCarrierScope?.addEventListener("change", () => {
  renderOutreachCarrierAdder();
});
rfxOutreachCarrierFit?.addEventListener("change", renderOutreachCarrierAdder);
rfxOutreachCarrierLane?.addEventListener("change", renderOutreachCarrierAdder);
rfxOutreachCarrierSegment?.addEventListener("change", async () => {
  const segmentId = String(rfxOutreachCarrierSegment.value || "");
  if (segmentId) {
    try {
      const rows = await loadSegmentCandidateRows(segmentId);
      rememberSelectedVendorRows(rows);
    } catch {
      // Keep the existing CRM cache usable; the status below tells the user to retry if needed.
      setStatus(rfxOutreachCarrierStatus, "Saved carrier list could not load. Try Refresh in Carrier CRM, then choose it again.", "error");
    }
  }
  renderOutreachCarrierAdder();
});
rfxOutreachCarrierCandidates?.addEventListener("click", (event) => {
  const showAllButton = event.target.closest("[data-rfx-outreach-show-all-active]");
  if (showAllButton) {
    if (rfxOutreachCarrierScope) rfxOutreachCarrierScope.value = "all_active";
    if (rfxOutreachCarrierFit) rfxOutreachCarrierFit.value = "any";
    renderOutreachCarrierAdder();
    return;
  }
  const addButton = event.target.closest("[data-rfx-outreach-add-carrier]");
  if (!addButton) return;
  const vendorId = addButton.dataset.rfxOutreachAddCarrier;
  if (!vendorId) return;
  if (currentRfxManagedVendorIds().has(String(vendorId))) {
    selectedManualVendorIdsState.delete(vendorId);
    persistManualParticipantSelection();
    renderManualShortlistControls();
    setStatus(rfxOutreachCarrierStatus, "This carrier already has activity in this RFx. Use Delivery queue to review its bid, rejection, reply, or re-invitation.", "neutral");
    return;
  }
  selectedManualVendorIdsState.add(vendorId);
  persistManualParticipantSelection();
  renderManualShortlistControls();
  setStatus(rfxOutreachCarrierStatus, "Carrier added to this temporary selection.", "success");
});
rfxOutreachCarrierSelected?.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-rfx-outreach-remove-carrier]");
  if (!removeButton) return;
  selectedManualVendorIdsState.delete(removeButton.dataset.rfxOutreachRemoveCarrier);
  persistManualParticipantSelection();
  renderManualShortlistControls();
  setStatus(rfxOutreachCarrierStatus, "Carrier removed from this temporary selection.", "neutral");
});
rfxClearOutreachCarrierSelectionButton?.addEventListener("click", () => {
  selectedManualVendorIdsState.clear();
  persistManualParticipantSelection();
  renderManualShortlistControls();
  setStatus(rfxOutreachCarrierStatus, "Temporary carrier selection cleared. Existing invitations and outreach were not changed.", "neutral");
});
manualShortlistSegment?.addEventListener("change", () => {
  renderManualShortlistControls();
});
selectVisibleCarriersButton?.addEventListener("click", () => {
  const ids = visibleManualVendorIds();
  selectManualVendorIds(ids);
  setStatus(manualShortlistStatus, ids.length ? `${formatNumber(ids.length)} visible carrier(s) selected.` : "No visible carriers to select.", ids.length ? "success" : "neutral");
});
selectSegmentCarriersButton?.addEventListener("click", () => {
  const segmentId = selectedSegmentId();
  if (participantTemplateMutationRunning) return;
  participantTemplateMutationRunning = true;
  renderManualShortlistControls();
  setStatus(manualShortlistStatus, "Loading matching carriers from Carrier CRM...");
  loadSegmentCandidateRows(segmentId)
    .then((rows) => {
      rememberSelectedVendorRows(rows);
      selectManualVendorIds(rows.map((vendor) => vendor.id));
      setStatus(manualShortlistStatus, rows.length ? `${formatNumber(rows.length)} carrier(s) selected from Carrier CRM.` : "No carriers match this list.", rows.length ? "success" : "neutral");
    })
    .catch((error) => {
      setStatus(manualShortlistStatus, `Carrier CRM selection failed: ${humanizeError(error)}`, "error");
    })
    .finally(() => {
      participantTemplateMutationRunning = false;
      renderManualShortlistControls();
    });
});
clearCarrierSelectionButton?.addEventListener("click", () => {
  selectedManualVendorIdsState.clear();
  persistManualParticipantSelection();
  renderManualShortlistControls();
  setStatus(manualShortlistStatus, "Carrier selection cleared.", "neutral");
});
saveManualShortlistTemplateButton?.addEventListener("click", async () => {
  const vendorIds = selectedManualVendorIds();
  const name = String(manualShortlistTemplateName?.value || "").trim();
  if (!vendorIds.length) {
    setStatus(manualShortlistStatus, "Select at least one carrier before saving a participant template.", "error");
    return;
  }
  if (!name) {
    setStatus(manualShortlistStatus, "Add a template name before saving this participant list.", "error");
    manualShortlistTemplateName?.focus();
    return;
  }
  if (participantTemplateMutationRunning) return;
  const existingTemplate = participantTemplateByName(name);
  participantTemplateMutationRunning = true;
  saveManualShortlistTemplateButton.disabled = true;
  setStatus(manualShortlistStatus, `${existingTemplate ? "Updating" : "Saving"} participant template "${name}"...`);
  try {
    const row = existingTemplate
      ? await updateVendorSegment(existingTemplate.id, participantTemplatePayload(existingTemplate, vendorIds, name))
      : await createVendorSegment(participantTemplatePayload(null, vendorIds, name));
    if (manualShortlistSegment) manualShortlistSegment.value = row.id;
    await loadVendorSegments();
    if (manualShortlistSegment) manualShortlistSegment.value = row.id;
    if (manualShortlistTemplateName) manualShortlistTemplateName.value = "";
    renderManualShortlistControls();
    setStatus(manualShortlistStatus, `Template "${row.segment_name || name}" ${existingTemplate ? "updated" : "saved"} with ${formatNumber(vendorIds.length)} carrier(s).`, "success");
  } catch (error) {
    setStatus(manualShortlistStatus, humanizeError(error), "error");
  } finally {
    participantTemplateMutationRunning = false;
    renderManualShortlistControls();
  }
});
loadManualShortlistTemplateButton?.addEventListener("click", async () => {
  const segmentId = selectedSegmentId();
  if (segmentId === "all") {
    setStatus(manualShortlistStatus, "Choose a saved list or procurement segment before loading participants.", "error");
    return;
  }
  const segment = participantTemplates().find((item) => item.id === segmentId);
  const label = segment?.segment_name || (segmentId === "procurement" ? "Procurement / Pipeline" : "saved list");
  const savedIds = segmentVendorIds(segment);
  loadManualShortlistTemplateButton.disabled = true;
  setStatus(manualShortlistStatus, savedIds.length ? `Loading ${formatNumber(savedIds.length)} saved carrier(s) from Carrier CRM...` : "Loading carriers from Carrier CRM...");
  try {
    const rows = await loadSegmentCandidateRows(segmentId);
    if (!rows.length) {
      setStatus(manualShortlistStatus, "No active carriers were found for the selected saved list.", "error");
      return;
    }
    rememberSelectedVendorRows(rows);
    selectedManualVendorIdsState = new Set(rows.map((vendor) => vendor.id).filter(Boolean));
    persistManualParticipantSelection();
    if (manualShortlistTemplateName && segment?.segment_name) manualShortlistTemplateName.value = segment.segment_name;
    const missingCount = Math.max(savedIds.length - rows.length, 0);
    renderManualShortlistControls();
    setStatus(
      manualShortlistStatus,
      `${formatNumber(rows.length)} carrier(s) loaded from ${label}.${missingCount ? ` ${formatNumber(missingCount)} saved carrier(s) are no longer available in this workspace.` : ""}`,
      missingCount ? "warning" : "success"
    );
  } catch (error) {
    setStatus(manualShortlistStatus, `Saved list could not load from Carrier CRM. ${humanizeError(error)}`, "error");
  } finally {
    renderManualShortlistControls();
  }
});
updateManualShortlistTemplateButton?.addEventListener("click", async () => {
  const segment = selectedSavedVendorSegment();
  const vendorIds = selectedManualVendorIds();
  if (!segment) {
    setStatus(manualShortlistStatus, "Choose a saved participant template before updating.", "error");
    return;
  }
  if (!vendorIds.length) {
    setStatus(manualShortlistStatus, "Keep at least one carrier selected before updating this template.", "error");
    return;
  }
  const name = String(manualShortlistTemplateName?.value || segment.segment_name || "").trim();
  if (!name) {
    setStatus(manualShortlistStatus, "Template name is required before updating.", "error");
    manualShortlistTemplateName?.focus();
    return;
  }
  if (participantTemplateMutationRunning) return;
  const duplicateTemplate = participantTemplateByName(name, segment.id);
  if (duplicateTemplate) {
    setStatus(manualShortlistStatus, `A participant template named "${duplicateTemplate.segment_name}" already exists. Select it or choose a different name.`, "error");
    return;
  }
  participantTemplateMutationRunning = true;
  updateManualShortlistTemplateButton.disabled = true;
  setStatus(manualShortlistStatus, `Updating participant template "${name}"...`);
  try {
    const row = await updateVendorSegment(segment.id, participantTemplatePayload(segment, vendorIds, name));
    if (manualShortlistSegment) manualShortlistSegment.value = row.id;
    await loadVendorSegments();
    if (manualShortlistSegment) manualShortlistSegment.value = row.id;
    renderManualShortlistControls();
    setStatus(manualShortlistStatus, `Template "${row.segment_name || name}" updated with ${formatNumber(vendorIds.length)} carrier(s).`, "success");
  } catch (error) {
    setStatus(manualShortlistStatus, humanizeError(error), "error");
  } finally {
    participantTemplateMutationRunning = false;
    renderManualShortlistControls();
  }
});
deleteManualShortlistTemplateButton?.addEventListener("click", async () => {
  const segment = selectedSavedVendorSegment();
  if (!segment) {
    setStatus(manualShortlistStatus, "Choose a saved participant template before deleting.", "error");
    return;
  }
  const label = segment.segment_name || "this participant template";
  if (!window.confirm(`Delete "${label}"? This will not remove carriers from CRM or existing bid invitations.`)) return;
  if (participantTemplateMutationRunning) return;
  participantTemplateMutationRunning = true;
  deleteManualShortlistTemplateButton.disabled = true;
  setStatus(manualShortlistStatus, `Deleting participant template "${label}"...`);
  try {
    await deleteVendorSegment(segment.id, { segmentType: "participant_template" });
    if (manualShortlistSegment) manualShortlistSegment.value = "all";
    await loadVendorSegments();
    if (manualShortlistSegment) manualShortlistSegment.value = "all";
    if (manualShortlistTemplateName) manualShortlistTemplateName.value = "";
    renderManualShortlistControls();
    setStatus(manualShortlistStatus, `Template "${label}" deleted. Carriers and bid history were not changed.`, "success");
  } catch (error) {
    setStatus(manualShortlistStatus, humanizeError(error), "error");
  } finally {
    participantTemplateMutationRunning = false;
    renderManualShortlistControls();
  }
});
manualShortlistLane?.addEventListener("change", () => {
  updateManualShortlistButtonState();
  if (pendingCarrierTemplateRows.length) renderCarrierTemplatePreview();
});
manualShortlistVendorList?.addEventListener("change", (event) => {
  const input = event.target.closest("[data-manual-vendor-select]");
  if (input) {
    if (input.checked) selectedManualVendorIdsState.add(input.value);
    else selectedManualVendorIdsState.delete(input.value);
    persistManualParticipantSelection();
  }
  renderManualShortlistControls();
});
manualShortlistVendorList?.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-manual-vendor]");
  if (!addButton) return;
  const vendorId = addButton.dataset.addManualVendor;
  if (!vendorId) return;
  selectedManualVendorIdsState.add(vendorId);
  persistManualParticipantSelection();
  renderManualShortlistControls();
  setStatus(manualShortlistStatus, "Carrier moved to selected participants.", "success");
});
manualShortlistSelectedList?.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-manual-vendor]");
  if (!removeButton) return;
  selectedManualVendorIdsState.delete(removeButton.dataset.removeManualVendor);
  persistManualParticipantSelection();
  renderManualShortlistControls();
  setStatus(manualShortlistStatus, "Carrier moved back to CRM candidates.", "neutral");
});

async function addSelectedManualCarriersToBid(statusElement = manualShortlistStatus) {
  const existingParticipantIds = currentRfxManagedVendorIds();
  const vendorIds = selectedManualVendorIds().filter((vendorId) => !existingParticipantIds.has(String(vendorId)));
  if (vendorIds.length !== selectedManualVendorIdsState.size) {
    selectedManualVendorIdsState = new Set(vendorIds);
    persistManualParticipantSelection();
  }
  if (!vendorIds.length) {
    setStatus(statusElement, "Select a carrier that is not already managed in this RFx. Existing participants belong in Delivery queue.", "error");
    return 0;
  }
  if (!selectedEventId) {
    setStatus(statusElement, "Create or select a bid event before adding participants. You can still save this carrier selection as a template.", "error");
    return 0;
  }
  if (!currentLanes.length) {
    setStatus(statusElement, "Import the lane book before creating bid invitations. Your selected carriers stay selected and can be saved as a template.", "error");
    return 0;
  }
  if (participantAddRunning) return 0;
  const eventId = selectedEventId;
  const lanes = [...currentLanes];
  participantAddRunning = true;
  renderManualShortlistControls();
  setStatus(statusElement, `Adding ${vendorIds.length} participant carrier(s) to this bid...`);
  try {
    let inserted = 0;
    for (const lane of lanes) {
      if (selectedEventId !== eventId) return inserted;
      inserted += await shortlistVendorsByLane(lane.id, vendorIds, statusElement, {
        eventId,
        laneLabel: lane.lane_id || "lane"
      });
    }
    if (selectedEventId !== eventId) return inserted;
    selectedManualVendorIdsState.clear();
    persistManualParticipantSelection(eventId);
    selectedInvitationIds.clear();
    setStatus(statusElement, `${inserted} invitation row(s) created. Generate the draft queue to reach only new carriers; existing outreach stays unchanged.`, "success");
    await loadDetail(eventId);
    return inserted;
  } catch (error) {
    if (selectedEventId === eventId) setStatus(statusElement, humanizeError(error), "error");
    return 0;
  } finally {
    participantAddRunning = false;
    renderManualShortlistControls();
  }
}

manualShortlistButton?.addEventListener("click", async () => {
  await addSelectedManualCarriersToBid(manualShortlistStatus);
});

rfxAddOutreachCarriersButton?.addEventListener("click", async () => {
  await addSelectedManualCarriersToBid(rfxOutreachCarrierStatus);
});

downloadCarrierTemplateButton?.addEventListener("click", downloadRfxCarrierTemplate);

carrierTemplateFileInput?.addEventListener("change", async () => {
  const file = carrierTemplateFileInput.files?.[0];
  if (!file) {
    clearCarrierTemplateImport();
    return;
  }
  if (!vendorOptions.length) {
    setStatus(carrierTemplateStatus, "Carrier CRM is still loading. Try again in a moment.", "error");
    return;
  }
  setStatus(carrierTemplateStatus, `Reading ${file.name}...`);
  if (importCarrierTemplateButton) importCarrierTemplateButton.disabled = true;
  try {
    pendingCarrierTemplateRows = await parseCarrierTemplateFile(file);
    if (!pendingCarrierTemplateRows.length) {
      setStatus(carrierTemplateStatus, "No CRM catalog rows found. Download the catalog, mark participate TRUE, then upload it.", "error");
    }
    renderCarrierTemplatePreview();
  } catch (error) {
    pendingCarrierTemplateRows = [];
    pendingCarrierTemplateMatches = [];
    renderCarrierTemplatePreview();
    setStatus(carrierTemplateStatus, humanizeError(error), "error");
  } finally {
    updateCarrierTemplateButton();
  }
});

importCarrierTemplateButton?.addEventListener("click", async () => {
  const readyRows = readyCarrierTemplateMatches();
  if (!selectedEventId || !readyRows.length) {
    setStatus(carrierTemplateStatus, "Upload the edited CRM catalog with at least one TRUE carrier before importing.", "error");
    return;
  }
  const eventId = selectedEventId;
  const laneGroups = new Map();
  readyRows.forEach((item) => {
    item.lanes.forEach((lane) => {
      if (!laneGroups.has(lane.id)) laneGroups.set(lane.id, new Set());
      laneGroups.get(lane.id).add(item.vendor.id);
    });
  });
  importCarrierTemplateButton.disabled = true;
  setStatus(carrierTemplateStatus, `Adding ${readyRows.length} selected CRM carrier(s) to this bid...`);
  try {
    let inserted = 0;
    for (const [laneId, vendorIds] of laneGroups.entries()) {
      if (selectedEventId !== eventId) return;
      const lane = currentLanes.find((item) => String(item.id) === String(laneId));
      inserted += await shortlistVendorsByLane(laneId, [...vendorIds], carrierTemplateStatus, {
        eventId,
        laneLabel: lane?.lane_id || "lane"
      });
    }
    if (selectedEventId !== eventId) return;
    setStatus(carrierTemplateStatus, `${inserted} invitation row(s) created from the CRM participant catalog.`, "success");
    clearCarrierTemplateImport({ preserveStatus: true });
    await loadDetail(eventId);
    if (selectedEventId !== eventId) return;
    await loadEvents();
  } catch (error) {
    if (selectedEventId === eventId) setStatus(carrierTemplateStatus, humanizeError(error), "error");
  } finally {
    updateCarrierTemplateButton();
  }
});

rfxOutreachTemplate?.addEventListener("change", () => {
  rfxTemplateEditorDirty = false;
  rfxTemplateVisualEditing = false;
  renderRfxTemplateEditor({ force: true });
  renderOutreachPreview();
});
rfxOutreachChannel?.addEventListener("change", () => {
  clearDraftQueueSelection();
  draftQueueTrackingScopeKey = "";
  rfxTemplateVisualEditing = false;
  syncOutreachChannelUi();
  renderOutreachLaunchpad();
  loadDraftQueuePage(selectedEventId, { reset: true, refreshTracking: true });
  void loadOutreachAudience();
  if (selectedChannelUsesDirectWhatsapp()) loadWhatsappConnectionReadiness();
});
rfxRefreshOutreachAudienceButton?.addEventListener("click", () => {
  void loadOutreachAudience({ reloadSegments: true });
});
rfxSelectReadyOutreachAudienceButton?.addEventListener("click", () => {
  outreachAudienceRows
    .filter((row) => ["not_invited", "ready"].includes(eventInvitationStatus(row)))
    .map((row) => String(row.vendor_id || ""))
    .filter(Boolean)
    .forEach((vendorId) => selectedOutreachAudienceVendorIds.add(vendorId));
  renderOutreachAudience();
});
rfxClearOutreachAudienceSelectionButton?.addEventListener("click", () => {
  selectedOutreachAudienceVendorIds.clear();
  renderOutreachAudience();
});
rfxOutreachAudienceMode?.addEventListener("change", () => {
  selectedOutreachAudienceVendorIds.clear();
  renderOutreachAudience();
  void loadOutreachAudience();
});
rfxOutreachAudienceSegment?.addEventListener("change", () => {
  selectedOutreachAudienceVendorIds.clear();
  void loadOutreachAudience();
});
rfxOutreachAudienceStatusFilter?.addEventListener("change", () => {
  void loadOutreachAudience();
});
rfxOutreachAudienceSearch?.addEventListener("input", () => {
  window.clearTimeout(outreachAudienceSearchTimer);
  outreachAudienceSearchTimer = window.setTimeout(() => void loadOutreachAudience(), 280);
});
rfxOutreachAudienceSegmentName?.addEventListener("input", renderOutreachAudience);
rfxOutreachAudienceList?.addEventListener("change", (event) => {
  const input = event.target instanceof Element
    ? event.target.closest("input[data-rfx-audience-select]")
    : null;
  if (!(input instanceof HTMLInputElement)) return;
  const vendorId = String(input.dataset.rfxAudienceSelect || "");
  if (!vendorId) return;
  if (input.checked) selectedOutreachAudienceVendorIds.add(vendorId);
  else selectedOutreachAudienceVendorIds.delete(vendorId);
  renderOutreachAudience();
});
rfxEventDeliveryOverview?.addEventListener("click", (event) => {
  const card = event.target instanceof Element
    ? event.target.closest("[data-rfx-event-status-filter]")
    : null;
  const filter = String(card?.dataset.rfxEventStatusFilter || "");
  if (!filter || !rfxOutreachAudienceStatusFilter) return;
  rfxOutreachAudienceStatusFilter.value = filter;
  void loadOutreachAudience();
});
rfxSaveOutreachAudienceSegmentButton?.addEventListener("click", () => {
  void saveCurrentOutreachAudienceSegment();
});
rfxArchiveOutreachAudienceSegmentButton?.addEventListener("click", () => {
  void archiveCurrentOutreachAudienceSegment();
});
rfxWhatsappTargetMode?.addEventListener("change", renderOutreachPreview);
rfxOutreachSender && (rfxOutreachSender.value = APPROVED_GMAIL_SENDER);
rfxOutreachSender?.addEventListener("change", renderOutreachPreview);
rfxOutreachCampaignName?.addEventListener("input", () => {
  rfxOutreachCampaignName.dataset.autoName = "false";
});

rfxChatThreadType?.addEventListener("change", () => {
  if (rfxChatThreadType.value === BID_ROOM_EVENT_THREAD_TYPE) clearCarrierCommunicationTarget();
  else renderBidRoomChatControls();
});
rfxChatMessage?.addEventListener("input", () => {
  if (selectedChatRecipient?.vendorId) bidRoomCarrierMessageRequestKey = newBidRoomCarrierMessageRequestKey();
});
rfxChatRecipientClear?.addEventListener("click", () => clearCarrierCommunicationTarget({ focus: true }));
rfxChatRefresh?.addEventListener("click", loadBidRoomChat);
rfxChatInboxFilters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-rfx-chat-filter]");
  if (!button) return;
  bidRoomChatFilter = button.dataset.rfxChatFilter || "all";
  persistRfxWorkspaceContext();
  renderBidRoomChat();
});
async function handleBidRoomChatThreadAction(event) {
  const button = event.target.closest("[data-rfx-chat-thread-action]");
  if (!button) return;
  const threadId = button.dataset.threadId;
  const action = button.dataset.rfxChatThreadAction;
  if (!threadId || !action) return;
  const currentThread = (bidRoomChatThreads.rows || []).find((thread) => String(thread.id) === String(threadId));
  if (!currentThread) return;
  if (action === "suggest_reply") {
    if (rfxChatThreadType) rfxChatThreadType.value = BID_ROOM_EVENT_THREAD_TYPE;
    renderBidRoomChatControls();
    if (rfxChatMessage) {
      rfxChatMessage.value = suggestedReplyForThread(currentThread);
      rfxChatMessage.focus();
    }
    setStatus(rfxChatStatus, "Suggested reply drafted. Review before sending.", "success");
    return;
  }
  if (action === "review_bid_update") {
    openChatBidUpdateDrawer(currentThread);
    setStatus(rfxChatStatus, "Bid update opened for review. Confirm before applying.", "success");
    return;
  }
  const payload = { thread_action: action };
  if (action === "assign") {
    const assignedTo = window.prompt("Assign this communication thread to:", "sales@heymarksman.com");
    if (assignedTo === null) return;
    payload.assigned_to = assignedTo;
  }
  if (action === "note") {
    const note = window.prompt("Internal note for this thread:", currentThread?.internal_note || "");
    if (note === null) return;
    payload.internal_note = note;
  }
  button.disabled = true;
  setStatus(rfxChatStatus, "Updating communication thread...");
  try {
    await updateBidRoomChatThread(threadId, payload);
    await loadBidRoomChat({ force: true });
    setStatus(rfxChatStatus, "Communication thread updated.", "success");
  } catch (error) {
    setStatus(rfxChatStatus, humanizeError(error), "error");
    button.disabled = false;
  }
}
rfxChatThreadList?.addEventListener("click", handleBidRoomChatThreadAction);
rfxChatSignalQueue?.addEventListener("click", handleBidRoomChatThreadAction);
rfxChatCopySummary?.addEventListener("click", async () => {
  const rows = eventGroupChatThreads(Array.isArray(bidRoomChatThreads.rows) ? bidRoomChatThreads.rows : []);
  try {
    await navigator.clipboard.writeText(chatSummaryText(rows));
    setStatus(rfxChatStatus, "Communication summary copied.", "success");
  } catch (_error) {
    setStatus(rfxChatStatus, chatSummaryText(rows), "neutral");
  }
});
rfxChatBidUpdateClose?.addEventListener("click", closeChatBidUpdateDrawer);
rfxChatBidUpdateCloseSecondary?.addEventListener("click", closeChatBidUpdateDrawer);
rfxChatBidUpdateInvitation?.addEventListener("change", () => {
  const candidate = selectedChatBidUpdateCandidate();
  if (!candidate) return;
  if (rfxChatBidUpdateCurrency && !rfxChatBidUpdateCurrency.value) {
    rfxChatBidUpdateCurrency.value = candidate.invitation.currency || candidate.lane.currency || "USD";
  }
  if (rfxChatBidUpdateNotes && !rfxChatBidUpdateNotes.value) {
    rfxChatBidUpdateNotes.value = candidate.invitation.notes || "";
  }
});
rfxChatBidUpdateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const candidate = selectedChatBidUpdateCandidate();
  if (!pendingChatBidUpdate || !candidate) {
    setStatus(rfxChatBidUpdateStatus, "Choose a lane-carrier row before applying the update.", "error");
    return;
  }
  const amount = Number(String(rfxChatBidUpdateRate?.value || "").replace(/,/g, ""));
  if (!Number.isFinite(amount)) {
    setStatus(rfxChatBidUpdateStatus, "All-in rate must be numeric before applying.", "error");
    rfxChatBidUpdateRate?.focus();
    return;
  }
  if (rfxChatBidUpdateApply) rfxChatBidUpdateApply.disabled = true;
  setStatus(rfxChatBidUpdateStatus, "Applying chat update to bid...");
  try {
    await applyBidUpdateFromChat({
      thread_id: pendingChatBidUpdate.thread.id,
      message_id: pendingChatBidUpdate.sourceMessage?.id || null,
      rfx_lane_vendor_id: candidate.invitation.id,
      rfx_lane_id: candidate.lane.id,
      vendor_id: candidate.invitation.vendor_id,
      bid_rate: amount,
      currency: rfxChatBidUpdateCurrency?.value || candidate.invitation.currency || candidate.lane.currency || "USD",
      weekly_capacity: rfxChatBidUpdateCapacity?.value || null,
      transit_days: rfxChatBidUpdateTransit?.value || null,
      notes: rfxChatBidUpdateNotes?.value || "",
      source_note: rfxChatBidUpdateSource?.textContent || "",
      resolve_thread: true
    });
    closeChatBidUpdateDrawer();
    await loadDetail(selectedEventId);
    activateWorkbenchView("responses", "#rfx-response-body");
    setStatus(rfxChatStatus, "Bid updated from chat and communication thread resolved.", "success");
  } catch (error) {
    setStatus(rfxChatBidUpdateStatus, humanizeError(error), "error");
  } finally {
    if (rfxChatBidUpdateApply) rfxChatBidUpdateApply.disabled = false;
  }
});
rfxManualBidCommercialModel?.addEventListener("change", updateManualBidCommercialLabel);
rfxManualBidClose?.addEventListener("click", closeManualBidDrawer);
rfxManualBidCancel?.addEventListener("click", closeManualBidDrawer);
rfxManualBidForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingManualBid) {
    setStatus(rfxManualBidStatus, "Choose a response row before recording a manual bid.", "error");
    return;
  }
  const amount = Number(String(rfxManualBidRate?.value || "").replace(/[$,]/g, "").trim());
  if (!Number.isFinite(amount) || amount <= 0) {
    setStatus(rfxManualBidStatus, "All-in rate must be a number greater than zero.", "error");
    rfxManualBidRate?.focus();
    return;
  }
  const currency = String(rfxManualBidCurrency?.value || "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    setStatus(rfxManualBidStatus, "Currency must use three letters, such as USD or MXN.", "error");
    rfxManualBidCurrency?.focus();
    return;
  }
  const optionalNumber = (value, label) => {
    const text = String(value ?? "").trim();
    if (!text) return null;
    const numberValue = Number(text.replace(/[$,]/g, ""));
    if (!Number.isFinite(numberValue) || numberValue <= 0) throw new Error(`${label} must be greater than zero.`);
    return numberValue;
  };
  const optionalPercent = (value) => {
    const text = String(value ?? "").trim();
    if (!text) return null;
    const numberValue = Number(text);
    if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 100) throw new Error("Margin or share must be between 0 and 100.");
    return numberValue;
  };
  const optionalIsoDateTime = (value) => {
    const text = String(value || "").trim();
    if (!text) return null;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) throw new Error("ETA must be a valid date and time.");
    return date.toISOString();
  };
  const validThrough = String(rfxManualBidValidThrough?.value || "").trim();
  if (validThrough && !/^\d{4}-\d{2}-\d{2}$/.test(validThrough)) {
    setStatus(rfxManualBidStatus, "Valid through must be a valid date.", "error");
    return;
  }
  let capacity;
  let transit;
  let deadhead;
  let percentage;
  let pickupEta;
  let deliveryEta;
  try {
    capacity = optionalNumber(rfxManualBidCapacity?.value, "Capacity");
    transit = optionalNumber(rfxManualBidTransit?.value, "Transit days");
    deadhead = optionalNumber(rfxManualBidDeadhead?.value, "Deadhead");
    percentage = optionalPercent(rfxManualBidCommercialPct?.value);
    pickupEta = optionalIsoDateTime(rfxManualBidPickupEta?.value);
    deliveryEta = optionalIsoDateTime(rfxManualBidDeliveryEta?.value);
  } catch (error) {
    setStatus(rfxManualBidStatus, humanizeError(error), "error");
    return;
  }
  const commercialModel = rfxManualBidCommercialModel?.value || "direct_cost_plus";
  const sourceChannel = rfxManualBidSource?.value || "email";
  const sourceLabel = { email: "Email", phone: "Phone", whatsapp: "WhatsApp", other: "Other" }[sourceChannel] || "Other";
  const notes = String(rfxManualBidNotes?.value || "").trim();
  if (rfxManualBidSave) rfxManualBidSave.disabled = true;
  setStatus(rfxManualBidStatus, "Saving manual bid...");
  try {
    await updateRfxBid(pendingManualBid.invitation.id, {
      bid_rate: amount,
      currency,
      weekly_capacity: capacity,
      transit_days: transit,
      valid_through: validThrough || null,
      commercial_model: commercialModel,
      marksman_margin_pct: commercialModel === "carrier_share" ? null : percentage,
      carrier_share_pct: commercialModel === "carrier_share" ? percentage : null,
      equipment_available: rfxManualBidAvailability?.value === "" ? null : rfxManualBidAvailability?.value === "true",
      eta_pickup: pickupEta,
      eta_delivery: deliveryEta,
      current_unit_location: String(rfxManualBidUnitLocation?.value || "").trim() || null,
      deadhead_distance: deadhead,
      deadhead_unit: deadhead === null ? null : (rfxManualBidDeadheadUnit?.value || "mi"),
      notes,
      capture_source: "manual_operator",
      manual_source_channel: sourceChannel,
      source_note: `Captured from ${sourceLabel}${notes ? `: ${notes}` : "."}`
    });
    closeManualBidDrawer();
    await loadDetail(selectedEventId);
    activateWorkbenchView("responses", "#rfx-response-body");
    setStatus(rfxChatStatus, `Manual bid saved from ${sourceLabel}. Carrier and lane history preserved.`, "success");
  } catch (error) {
    setStatus(rfxManualBidStatus, humanizeError(error), "error");
  } finally {
    if (rfxManualBidSave) rfxManualBidSave.disabled = false;
  }
});
rfxChatStartEventThread?.addEventListener("click", async () => {
  if (!selectedEventId) {
    setStatus(rfxChatStatus, "Select a bid event before creating the Google Chat thread.", "error");
    return;
  }
  rfxChatStartEventThread.disabled = true;
  setStatus(rfxChatStatus, "Creating event thread in Google Chat...");
  try {
    const result = await ensureSelectedEventChatThread(selectedEventId, { force: true, silent: true });
    setStatus(
      rfxChatStatus,
      result?.google_chat_configured
        ? "Event thread created and mirrored to Google Chat."
        : "Event thread created in Rateware. Connect Google Chat and save a Space to mirror it.",
      result?.google_chat_configured ? "success" : "warning"
    );
  } catch (error) {
    setStatus(rfxChatStatus, humanizeError(error), "error");
  } finally {
    renderBidRoomChatControls();
  }
});
rfxChatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedEventId) {
    setStatus(rfxChatStatus, "Select a bid event before sending a chat message.", "error");
    return;
  }
  const body = String(rfxChatMessage?.value || "").trim();
  if (!body) {
    setStatus(rfxChatStatus, "Write a message first.", "error");
    rfxChatMessage?.focus();
    return;
  }
  const replyByEmail = Boolean(selectedChatRecipient?.vendorId);
  const payload = {
    thread_type: selectedChatRecipient?.vendorId ? "carrier_private" : BID_ROOM_EVENT_THREAD_TYPE,
    body
  };
  if (selectedChatRecipient?.vendorId) {
    payload.vendor_id = selectedChatRecipient.vendorId;
    payload.rfx_lane_id = selectedChatRecipient.laneId;
    payload.title = `${selectedEvent?.rfx_id || "RFx"} | Private: ${selectedChatRecipient.carrier}`;
  }
  if (rfxChatSend) rfxChatSend.disabled = true;
  setStatus(rfxChatStatus, replyByEmail ? "Preparing Gmail reply..." : "Posting internal message...");
  try {
    const result = replyByEmail
      ? await sendBidRoomCarrierMessage(selectedEventId, {
          rfx_lane_vendor_id: selectedChatRecipient.invitationId,
          rfx_lane_id: selectedChatRecipient.laneId,
          vendor_id: selectedChatRecipient.vendorId,
          body,
          app_origin: window.location.origin,
          idempotency_key: bidRoomCarrierMessageRequestKey || newBidRoomCarrierMessageRequestKey()
        })
      : await postBidRoomChatMessage(selectedEventId, payload);
    if (rfxChatMessage) rfxChatMessage.value = "";
    bidRoomCarrierMessageRequestKey = "";
    const deliveryResult = result?.result || {};
    const accepted = !replyByEmail || Number(deliveryResult.sent || 0) > 0;
    const deliveryUnknown = Number(deliveryResult.delivery_unknown || 0) > 0;
    const failure = Array.isArray(deliveryResult.failures) ? String(deliveryResult.failures[0]?.reason || "") : "";
    const replyMode = result?.email_context?.reply_mode === "thread_reply" ? "in the latest Gmail thread" : "as a new email because no related Gmail thread was found";
    const message = !replyByEmail
      ? (result.google_chat_configured ? "Message posted and mirrored to Google Chat." : "Message posted. Google Chat mirror is not configured yet.")
      : accepted
        ? `Email sent ${replyMode} and recorded in this RFx Delivery Queue.`
        : deliveryUnknown
          ? "Email acceptance is unknown. Review Delivery Queue before retrying."
          : `Email was not sent${failure ? `: ${failure}` : "."} The attempt is recorded in Delivery Queue.`;
    setStatus(rfxChatStatus, message, accepted ? "success" : deliveryUnknown ? "warning" : "error");
    if (!replyByEmail) await loadBidRoomChat({ force: true });
    if (replyByEmail) {
      await loadDraftQueuePage(selectedEventId, { force: true, refreshTracking: true });
    }
  } catch (error) {
    setStatus(rfxChatStatus, humanizeError(error), "error");
  } finally {
    renderBidRoomChatControls();
  }
});

[rfxTemplateSubject, rfxTemplateHtml, rfxTemplateWhatsapp].forEach((field) => {
  field?.addEventListener("input", () => {
    rfxTemplateEditorDirty = true;
    setStatus(rfxTemplateEditorStatus, "Unsaved template changes. Save before generating invitations.", "neutral");
    renderOutreachPreview();
  });
});

saveRfxTemplateHtmlButton?.addEventListener("click", saveSelectedRfxTemplate);

resetRfxTemplateHtmlButton?.addEventListener("click", () => {
  rfxTemplateEditorDirty = false;
  rfxTemplateVisualEditing = false;
  renderRfxTemplateEditor({ force: true });
  renderOutreachPreview();
});

restoreRfxTemplateOriginalButton?.addEventListener("click", () => {
  restoreSelectedRfxTemplateOriginal().catch((error) => setStatus(rfxTemplateEditorStatus, humanizeError(error), "error"));
});

rfxOutreachForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await createCurrentOutreachDrafts(rfxOutreachStatus);
  } catch (error) {
    setStatus(rfxOutreachStatus, `Draft queue could not be generated. ${humanizeError(error)}`, "error");
  } finally {
    renderOutreachPreview();
  }
});
