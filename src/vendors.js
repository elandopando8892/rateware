import { applyPermissionState, initAuthControls, requirePrivatePage } from "./auth.js";
import { humanizeError } from "./error-copy.js";
import {
  applyVendorTemplateUpdates,
  applyVendorIntelligenceTags,
  bulkUpdateVendors,
  createVendor,
  createVendorSegment,
  createVendorProfileRequest,
  deleteVendorSegment,
  consolidateExactVendorDuplicates,
  fetchVendorFunnel,
  fetchVendorIntelligence,
  fetchVendorOnboardingGaps,
  fetchVendorRelationshipActivity,
  fetchVendorSegments,
  fetchVendorSupportTickets,
  fetchVendors,
  importVendorOnboardingCorrections,
  importVendorsFromGoogleSheet,
  importVendors,
  matchVendorRateRowsByScope,
  removeVendors,
  replaceBouncedVendorEmail,
  updateVendor,
  updateVendorSupportTicket,
  uploadVendorLogo
} from "./vendor-service.js";
import { errorState, loadingState, stateBlock, tableErrorState, tableLoadingState, tableState } from "./ui-state.js";
import { installSpreadsheetGrid } from "./spreadsheet-grid.js";

const form = document.querySelector("#vendor-form");
const vendorTabs = document.querySelectorAll("[data-vendor-tab]");
const tabPanels = document.querySelectorAll("[data-tab-panel]");
const directoryBaseButtons = document.querySelectorAll("[data-base-tab]");
const crmViewButtons = document.querySelectorAll("[data-crm-view]");
const vendorMetricTotal = document.querySelector("#vendor-metric-total");
const vendorMetricReady = document.querySelector("#vendor-metric-ready");
const vendorMetricMissingContact = document.querySelector("#vendor-metric-missing-contact");
const vendorMetricDuplicates = document.querySelector("#vendor-metric-duplicates");
const vendorMetricWhatsapp = document.querySelector("#vendor-metric-whatsapp");
const wizardForm = document.querySelector("#vendor-wizard-form");
const wizardStepButtons = document.querySelectorAll(".wizard-step");
const wizardPanels = document.querySelectorAll("[data-step-panel]");
const wizardBackButton = document.querySelector("#wizard-back-button");
const wizardNextButton = document.querySelector("#wizard-next-button");
const wizardSaveButton = document.querySelector("#wizard-save-button");
const wizardStatus = document.querySelector("#wizard-status");
const wizardReview = document.querySelector("#wizard-review");
const statusMessage = document.querySelector("#vendor-status");
const importInput = document.querySelector("#vendor-import");
const importStatus = document.querySelector("#import-status");
const googleSheetUrlInput = document.querySelector("#google-sheet-url");
const googleImportButton = document.querySelector("#import-google-sheet-button");
const googleImportStatus = document.querySelector("#google-import-status");
const templateButton = document.querySelector("#download-template-button");
const importPreviewPanel = document.querySelector("#import-preview-panel");
const importPreviewSummary = document.querySelector("#import-preview-summary");
const importPreviewBody = document.querySelector("#import-preview-body");
const confirmImportButton = document.querySelector("#confirm-import-button");
const cancelImportButton = document.querySelector("#cancel-import-button");
const confirmImportStatus = document.querySelector("#confirm-import-status");
const updateTemplateButton = document.querySelector("#download-vendor-update-template-button");
const vendorUpdateInput = document.querySelector("#vendor-update-import");
const vendorUpdateStatus = document.querySelector("#vendor-update-status");
const vendorUpdatePreviewPanel = document.querySelector("#vendor-update-preview-panel");
const vendorUpdatePreviewSummary = document.querySelector("#vendor-update-preview-summary");
const vendorUpdatePreviewBody = document.querySelector("#vendor-update-preview-body");
const applyVendorUpdateButton = document.querySelector("#apply-vendor-update-button");
const cancelVendorUpdateButton = document.querySelector("#cancel-vendor-update-button");
const downloadVendorUpdateErrorsButton = document.querySelector("#download-vendor-update-errors-button");
const applyVendorUpdateStatus = document.querySelector("#apply-vendor-update-status");
const vendorsBody = document.querySelector("#vendors-body");
const vendorsHeadRow = document.querySelector("#vendors-head-row");
const vendorsFilterRow = document.querySelector("#vendors-filter-row");
const vendorsTableWrap = document.querySelector("#vendors-table-wrap");
const vendorGridSelection = document.querySelector("#vendor-grid-selection");
const vendorGridStatus = document.querySelector("#vendor-grid-status");
const vendorCardGrid = document.querySelector("#vendor-card-grid");
const vendorColumnOptions = document.querySelector("#vendor-column-options");
const resetVendorColumnsButton = document.querySelector("#reset-vendor-columns");
const vendorSavedViewSelect = document.querySelector("#vendor-saved-view-select");
const saveVendorViewButton = document.querySelector("#save-vendor-view-button");
const deleteVendorViewButton = document.querySelector("#delete-vendor-view-button");
const vendorBaseContext = document.querySelector("#vendor-base-context");
const searchInput = document.querySelector("#vendor-search");
const statusFilter = document.querySelector("#vendor-status-filter");
const channelFilter = document.querySelector("#vendor-channel-filter");
const tagFilter = document.querySelector("#vendor-tag-filter");
const coverageFilter = document.querySelector("#vendor-coverage-filter");
const clearVendorFiltersButton = document.querySelector("#clear-vendor-filters");
const refreshButton = document.querySelector("#refresh-vendors-button");
const downloadOnboardingGapsButton = document.querySelector("#download-onboarding-gaps-button");
const importOnboardingGapsButton = document.querySelector("#import-onboarding-gaps-button");
const vendorGapsImportInput = document.querySelector("#vendor-gaps-import");
const vendorOnboardingGapsStatus = document.querySelector("#vendor-onboarding-gaps-status");
const vendorPageStatus = document.querySelector("#vendor-page-status");
const vendorPageSizeSelect = document.querySelector("#vendor-page-size");
const vendorPrevPageButton = document.querySelector("#vendor-prev-page");
const vendorNextPageButton = document.querySelector("#vendor-next-page");
const quickFilterButtons = document.querySelectorAll(".quick-filter");
const bulkToolbar = document.querySelector("#bulk-toolbar");
const bulkSelectionCount = document.querySelector("#bulk-selection-count");
const selectVisibleVendorsButton = document.querySelector("#select-visible-vendors-button");
const clearVendorSelectionButton = document.querySelector("#clear-vendor-selection-button");
const bulkStatus = document.querySelector("#bulk-status");
const bulkBaseStage = document.querySelector("#bulk-base-stage");
const bulkTags = document.querySelector("#bulk-tags");
const bulkButton = document.querySelector("#bulk-update-button");
const bulkProcurementButton = document.querySelector("#bulk-procurement-button");
const bulkArchiveVendorsButton = document.querySelector("#bulk-archive-vendors-button");
const bulkRemoveVendorsButton = document.querySelector("#bulk-remove-vendors-button");
const bulkStatusMessage = document.querySelector("#bulk-status-message");
const refreshVendorIntelligenceButton = document.querySelector("#refresh-vendor-intelligence");
const loadMoreVendorIntelligenceButton = document.querySelector("#load-more-vendor-intelligence");
const applyIntelligenceTagsButton = document.querySelector("#apply-intelligence-tags");
const promoteIntelligenceSelectedButton = document.querySelector("#promote-intelligence-selected");
const vendorIntelligenceFilter = document.querySelector("#vendor-intelligence-filter");
const vendorIntelligenceSearch = document.querySelector("#vendor-intelligence-search");
const vendorIntelligenceStatus = document.querySelector("#vendor-intelligence-status");
const vendorIntelligenceBody = document.querySelector("#vendor-intelligence-body");
const viTotal = document.querySelector("#vi-total");
const viReady = document.querySelector("#vi-ready");
const viQuoted = document.querySelector("#vi-quoted");
const viDuplicates = document.querySelector("#vi-duplicates");
const viGaps = document.querySelector("#vi-gaps");
const refreshVendorFunnelButton = document.querySelector("#refresh-vendor-funnel");
const vendorFunnelStatus = document.querySelector("#vendor-funnel-status");
const vendorFunnelStrip = document.querySelector("#vendor-funnel-strip");
const vendorFunnelBoard = document.querySelector("#vendor-funnel-board");
const vendorFunnelSearch = document.querySelector("#vendor-funnel-search");
const vendorFunnelHealthFilter = document.querySelector("#vendor-funnel-health-filter");
const vendorFunnelQuoteFilter = document.querySelector("#vendor-funnel-quote-filter");
const vendorFunnelHideEmpty = document.querySelector("#vendor-funnel-hide-empty");
const clearVendorFunnelFiltersButton = document.querySelector("#clear-vendor-funnel-filters");
const vendorFunnelBulkStage = document.querySelector("#vendor-funnel-bulk-stage");
const vendorFunnelMoveStageButton = document.querySelector("#vendor-funnel-move-stage");
const vendorFunnelAdvanceStageButton = document.querySelector("#vendor-funnel-advance-stage");
const vendorFunnelRegressStageButton = document.querySelector("#vendor-funnel-regress-stage");
const vfTotal = document.querySelector("#vf-total");
const vfActivationRate = document.querySelector("#vf-activation-rate");
const vfNested = document.querySelector("#vf-nested");
const vfStuck = document.querySelector("#vf-stuck");
const refreshVendorMatchButton = document.querySelector("#refresh-vendor-match");
const matchStagingVendorsButton = document.querySelector("#match-staging-vendors");
const matchRatewareVendorsButton = document.querySelector("#match-rateware-vendors");
const downloadVendorMatchErrorsButton = document.querySelector("#download-vendor-match-errors");
const vendorMatchStatus = document.querySelector("#vendor-match-status");
const vendorMatchBody = document.querySelector("#vendor-match-body");
const vmStagingTotal = document.querySelector("#vm-staging-total");
const vmStagingMatchable = document.querySelector("#vm-staging-matchable");
const vmRatewareTotal = document.querySelector("#vm-rateware-total");
const vmRatewareMatchable = document.querySelector("#vm-rateware-matchable");
const vmUploadMatchable = document.querySelector("#vm-upload-matchable");
const vmErrorTotal = document.querySelector("#vm-error-total");
const segmentForm = document.querySelector("#segment-form");
const segmentStatusMessage = document.querySelector("#segment-status-message");
const segmentsList = document.querySelector("#segments-list");
const duplicateReviewList = document.querySelector("#duplicate-review-list");
const previewExactDuplicatesButton = document.querySelector("#preview-exact-duplicates-button");
const consolidateExactDuplicatesButton = document.querySelector("#consolidate-exact-duplicates-button");
const exactDuplicateStatus = document.querySelector("#exact-duplicate-status");
const exactDuplicatePreview = document.querySelector("#exact-duplicate-preview");
const drawer = document.querySelector("#vendor-drawer");
const closeDrawerButton = document.querySelector("#close-vendor-drawer");
const drawerEditToggle = document.querySelector("#drawer-edit-toggle");
const drawerEditForm = document.querySelector("#drawer-edit-form");
const drawerArchiveButton = document.querySelector("#drawer-archive-button");
const drawerEditStatus = document.querySelector("#drawer-edit-status-message");
const drawerSaveProfileButton = document.querySelector("#drawer-save-profile-button");
const drawerProfileDirtyMessage = document.querySelector("#drawer-profile-dirty-message");
const drawerEditDirtyMessage = document.querySelector("#drawer-edit-dirty-message");
const drawerLogoPreview = document.querySelector("#drawer-logo-preview");
const drawerLogoFile = document.querySelector("#drawer-logo-file");
const drawerOnboardingProfile = document.querySelector("#drawer-onboarding-profile");
const drawerProfileFields = document.querySelector("#drawer-profile-fields");
const drawerVendorSupport = document.querySelector("#drawer-vendor-support");
const drawerVendorRelationship = document.querySelector("#drawer-vendor-relationship");
const drawerEmailDelivery = document.querySelector("#drawer-email-delivery");
const drawerEmailDeliveryCard = document.querySelector("#drawer-email-delivery-card");
const XLSX_MODULE_URL = "https://esm.sh/xlsx@0.18.5";
let xlsxModulePromise = null;
let allVendors = [];
let currentVendors = [];
let selectedVendorIds = new Set();
let pendingImportRows = [];
let pendingVendorUpdateRows = [];
let vendorUpdatePreview = null;
let exactDuplicateMergePreview = null;
let exactDuplicateMergeRunning = false;
const EXACT_VENDOR_CONSOLIDATION_BATCH_SIZE = 1;
let savedSegments = [];
let vendorSegmentsLoaded = false;
let vendorSegmentsLoadPromise = null;
let wizardStep = 0;
const VENDOR_WORKSPACE_CONTEXT_STORAGE_KEY = "rateware:vendors:workspace-context:v1";
const VENDOR_WORKSPACE_BASE_STAGES = ["sourcing", "procurement", "archived"];
const VENDOR_WORKSPACE_TABS = new Set(["funnel", "sourcing", "procurement", "archived", "intelligence", "matching", "import", "wizard", "create", "segments", "duplicates"]);
const VENDOR_QUICK_FILTER_KEYS = new Set(["all", "missing-contact", "cross-border", "high-confidence", "onboarding-gaps", "procurement-ready", "duplicates"]);
const VENDOR_PAGE_SIZES = [75, 150, 250];
const storedVendorWorkspaceContext = readVendorWorkspaceContext(VENDOR_WORKSPACE_CONTEXT_STORAGE_KEY);
const requestedVendorTab = new URLSearchParams(window.location.search).get("tab");
let activeQuickFilter = VENDOR_QUICK_FILTER_KEYS.has(storedVendorWorkspaceContext.quickFilter) ? storedVendorWorkspaceContext.quickFilter : "all";
let activeBaseStage = VENDOR_WORKSPACE_BASE_STAGES.includes(storedVendorWorkspaceContext.baseStage) ? storedVendorWorkspaceContext.baseStage : "sourcing";
let activeVendorTab = VENDOR_WORKSPACE_TABS.has(requestedVendorTab)
  ? requestedVendorTab
  : VENDOR_WORKSPACE_TABS.has(storedVendorWorkspaceContext.activeTab)
    ? storedVendorWorkspaceContext.activeTab
    : "funnel";
let activeDirectoryView = storedVendorWorkspaceContext.directoryView === "cards" || storedVendorWorkspaceContext.directoryView === "spreadsheet"
  ? storedVendorWorkspaceContext.directoryView
  : window.localStorage.getItem("rateware.vendorDirectoryView") || "spreadsheet";
let activeDrawerVendorId = null;
let vendorPageSize = VENDOR_PAGE_SIZES.includes(Number(storedVendorWorkspaceContext.pageSize)) ? Number(storedVendorWorkspaceContext.pageSize) : 75;
let vendorPageOffset = Math.max(0, Number(storedVendorWorkspaceContext.pageOffset) || 0);
let vendorTotalCount = 0;
let vendorIntelligenceRows = [];
let currentVendorIntelligenceRows = [];
let vendorIntelligenceStale = false;
let selectedVendorIntelligenceIds = new Set();
let vendorIntelligenceTotal = 0;
let vendorIntelligenceHasMore = false;
let vendorDirectoryLoadVersion = 0;
let vendorDirectoryLoadRequest = null;
let vendorIntelligenceLoadVersion = 0;
let vendorIntelligenceLoadRequest = null;
let vendorFunnelLoadVersion = 0;
let vendorFunnelLoadRequest = null;
let vendorDrawerContextVersion = 0;
let vendorDrawerSupportLoadVersion = 0;
let vendorDrawerRelationshipLoadVersion = 0;
const vendorDrawerSupportRequests = new Map();
const vendorDrawerRelationshipRequests = new Map();
let vendorBulkActionRunning = false;
let vendorImportActionRunning = false;
let drawerEditBaseline = null;
let drawerSaveInFlight = false;
const vendorCellSaveQueues = new Map();
const vendorCellSaveVersions = new Map();
const vendorFunnelMutationIds = new Set();
const vendorIntelligencePageSize = 500;
let vendorFunnelStages = [];
let vendorFunnelRows = [];
let activeFunnelStage = String(storedVendorWorkspaceContext.funnelStage || "targeted");
let vendorFunnelSearchTerm = String(storedVendorWorkspaceContext.funnelSearch || "");
let vendorFunnelHealthValue = String(storedVendorWorkspaceContext.funnelHealth || "");
let vendorFunnelQuoteValue = String(storedVendorWorkspaceContext.funnelQuotes || "");
let vendorFunnelHideEmptyStages = Boolean(storedVendorWorkspaceContext.funnelHideEmpty);
let vendorFunnelStageLimits = {};
let vendorMatchRows = [];
let vendorMatchLoaded = false;
let vendorMatchLoadRequest = null;
let vendorMatchSummary = {
  staging: null,
  rateware: null
};
const VENDOR_BASE_TABS = VENDOR_WORKSPACE_BASE_STAGES;
const VENDOR_IMPORT_TOOLS = ["wizard", "create", "segments"];
const VENDOR_COLUMN_STORAGE_KEY = "rateware.vendorSheetColumns.v1";
const VENDOR_SAVED_VIEWS_STORAGE_KEY = "rateware.vendorSavedViews.v1";
const FUNNEL_STAGE_BATCH_SIZE = 40;
const DEFAULT_FUNNEL_STAGES = [
  { key: "targeted", label: "Targeted", description: "Moved from sourcing into procurement." },
  { key: "nested", label: "Nested", description: "Has linked carrier quotes." },
  { key: "drafted", label: "Drafted", description: "Selected for onboarding preparation." },
  { key: "invited", label: "Invited", description: "Onboarding invite sent." },
  { key: "onboarded", label: "Onboarded", description: "Supplier registration complete." },
  { key: "trained", label: "Trained", description: "TMS setup or training complete." },
  { key: "activated", label: "Activated", description: "Ready for immediate use." },
  { key: "completed", label: "Completed", description: "Legal package fully signed." }
];

function readVendorWorkspaceContext(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeVendorWorkspaceContext(value) {
  try {
    window.localStorage.setItem(VENDOR_WORKSPACE_CONTEXT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The CRM remains usable for the current session when storage is blocked.
  }
}

function persistVendorWorkspaceContext() {
  writeVendorWorkspaceContext({
    activeTab: activeVendorTab,
    baseStage: activeBaseStage,
    directoryView: activeDirectoryView,
    quickFilter: activeQuickFilter,
    pageSize: vendorPageSize,
    pageOffset: vendorPageOffset,
    search: String(searchInput?.value || ""),
    status: String(statusFilter?.value || ""),
    channel: String(channelFilter?.value || ""),
    tag: String(tagFilter?.value || ""),
    coverage: String(coverageFilter?.value || ""),
    funnelStage: activeFunnelStage,
    funnelSearch: vendorFunnelSearchTerm,
    funnelHealth: vendorFunnelHealthValue,
    funnelQuotes: vendorFunnelQuoteValue,
    funnelHideEmpty: vendorFunnelHideEmptyStages
  });
}

const VENDOR_ONBOARDING_SECTIONS = [
  {
    key: "general",
    label: "General contact",
    fields: [
      { key: "full_name", label: "Nombre completo", type: "text", required: true },
      { key: "mobile_number", label: "Numero movil", type: "text", required: true },
      { key: "company_type", label: "Tipo de empresa", type: "select", required: true, options: ["Persona Fisica", "Persona Moral"] },
      { key: "operating_country", label: "Pais donde opera la empresa", type: "select", required: true, options: ["Estados Unidos de America", "Mexico", "Canada"] }
    ]
  },
  {
    key: "international",
    label: "International identity and payments",
    fields: [
      { key: "dba_name", label: "DBA / nombre comercial", type: "text" },
      { key: "legal_name", label: "Nombre legal", type: "text", required: true },
      { key: "fiscal_address", label: "Domicilio fiscal", type: "textarea", required: true },
      { key: "usdot_number", label: "USDOT number", type: "text", required: true },
      { key: "mc_number", label: "MC number", type: "text", required: true },
      { key: "scac_code", label: "SCAC code", type: "text" },
      { key: "tax_id", label: "TAX ID", type: "text", required: true },
      { key: "bank_name", label: "Bank name", type: "text", required: true },
      { key: "account_number", label: "Account number", type: "text", required: true },
      { key: "routing_number", label: "Routing number", type: "text", required: true },
      { key: "beneficiary_company", label: "Compania beneficiaria", type: "text", required: true },
      { key: "factoring_company", label: "Tiene compania de factoraje", type: "select", required: true, options: ["Si", "No"] },
      { key: "payment_terms", label: "Politica de pagos y terminos de credito", type: "textarea", required: true }
    ]
  },
  {
    key: "mexico",
    label: "Mexico identity and payments",
    fields: [
      { key: "commercial_name", label: "Nombre comercial", type: "text" },
      { key: "legal_name", label: "Razon social", type: "text", required: true },
      { key: "fiscal_address", label: "Domicilio fiscal", type: "textarea", required: true },
      { key: "caat_code", label: "CAAT code", type: "text" },
      { key: "rfc", label: "RFC", type: "text", required: true },
      { key: "bank_name", label: "Nombre de banco", type: "text", required: true },
      { key: "account_number", label: "Numero de cuenta", type: "text", required: true },
      { key: "clabe_number", label: "Numero CLABE", type: "text", required: true },
      { key: "beneficiary_company", label: "Compania beneficiaria", type: "text", required: true },
      { key: "factoring_company", label: "Tiene compania de factoraje", type: "select", required: true, options: ["Si", "No"] },
      { key: "payment_terms", label: "Politica de pagos y terminos de credito", type: "textarea" }
    ]
  },
  {
    key: "carrier_profile",
    label: "Carrier service profile",
    fields: [
      { key: "geographic_scope", label: "Alcance geografico", type: "checks", required: true, tagGroup: "country", options: ["Canada", "Mexico", "Estados Unidos"] },
      {
        key: "service_scope",
        label: "Alcance de servicios",
        type: "checks",
        required: true,
        tagGroup: "service",
        options: [
          "Fletes Locales MEX",
          "Fletes Locales (en Frontera USA)",
          "Fletes Regionales MEX",
          "Fletes Domesticos MEX",
          "Fletes Fronterizos (Desde/Hacia Frontera con Caja Mexicana sin Operadores B1)",
          "Fletes Fronterizos (Desde/Hacia Frontera con Caja Americana con Operadores CDL)",
          "Fletes Transfronterizos (Door 2 Door con Operadores B1 + Acuerdo de Intercambio)",
          "Fletes Transfronterizos (Door 2 Door con Doble Placa sin Acuerdo de Intercambio)"
        ]
      },
      {
        key: "regional_coverage",
        label: "Cobertura regional",
        type: "checks",
        required: true,
        tagGroup: "region",
        options: [
          "Noreste - MX (Coahuila, Nuevo Leon, Tamaulipas)",
          "Noroeste - MX (Chihuahua, Durango)",
          "Pacifico - MX (Baja California, Baja California Sur, Sonora, Sinaloa, Nayarit, Colima)",
          "Occidente - MX (Zacatecas, Aguascalientes, Jalisco, Michoacan)",
          "Bajio - MX (San Luis Potosi, Guanajuato, Queretaro)",
          "Golfo - MX (Veracruz)",
          "Centro - MX (Hidalgo, Tlaxcala, Puebla, Estado de Mexico, CDMX, Morelos)",
          "Sur - MX (Guerrero, Oaxaca)",
          "Sureste - MX (Tabasco, Chiapas, Campeche, Yucatan, Quintana Roo)",
          "Northeast - New England - US (CT, ME, MA, NH, RI, VT)",
          "Northeast - Mid Atlantic - US (NJ, NY, PA)",
          "Midwest - Northeast - US (IL, IN, MI, OH, WI)",
          "Midwest - Northwest - US (ND, SD, IA, KS, MN, MO, NE)",
          "South - South Atlantic - US (NC, SC, DE, DC, FL, GA, MD, VA, WV)",
          "South - Southeast - US (AL, KY, MS, TN)",
          "South - Southwest - US (AR, LA, OK, TX)",
          "West - Rocky Mountains - US (AZ, CO, ID, MT, NV, NM, UT, WY)",
          "West - Pacific - US (CA, OR, WA)",
          "Atlantic - CA (NB, NS, PE, NL)",
          "Central - CA (QC, ON)",
          "Prairie - CA (AL, SK, MB)",
          "West - CA (BC)",
          "Northern Territories - CA (YU, NT, NU)"
        ]
      },
      { key: "border_crossings", label: "Cruces fronterizos", type: "checks", tagGroup: "border", options: ["San Diego", "Calexico", "Nogales", "El Paso", "Del Rio", "Eagle Pass", "Laredo", "Pharr", "Brownsville"] },
      { key: "mexican_ports", label: "Puertos mexicanos", type: "checks", tagGroup: "port", options: ["Altamira", "Ensenada", "Lazaro Cardenas", "Manzanillo", "Mazatlan", "Progreso", "Veracruz"] },
      {
        key: "value_added_services",
        label: "Servicios logisticos de valor agregado",
        type: "checks",
        tagGroup: "value_add",
        options: [
          "Transfer (Cruces Internacionales)",
          "Power Only (Arrastre de Semi-Remolques)",
          "Team Driver (Doble Operador)",
          "Hot Shots (Expeditados)",
          "Fumigation (Fumigacion)",
          "Cross Dock (Transbordo)",
          "Warehousing (Almacenaje)",
          "Packing, Picking, Shipping (Distribucion)",
          "Rigging (Grua)",
          "Trailer Rent (Renta de Semi-Remolques)",
          "Custody (Custodia)",
          "Pilot Units (Unidades Piloto)",
          "Cargo Insurance (Seguro de Carga)",
          "Drop & Hook (Logistica Carrusel | Quitapon de Semirremolques)",
          "Driver Assistance (Maniobras de carga/descarga de Operador)",
          "Last Mile (Ultima Milla)",
          "Alcohol Permits (Permisos de Alcohol)",
          "Over-Heavy Haul (Sobredimension / Sobrepeso)"
        ]
      },
      {
        key: "additional_capabilities",
        label: "Capacidades adicionales",
        type: "checks",
        tagGroup: "capability",
        options: [
          "Experiencia automotriz y aeroespacial",
          "Monitoreo 24/7 dedicado",
          "Cuenta espejo GPS",
          "Integracion GPS API/EDI",
          "Sistema de gestion de flotillas / transporte",
          "Portales de subasta online (DAT, TruckStop, Fr8App, Cargado, RXO)",
          "Acuerdos de intercambio con lineas americanas / mexicanas"
        ]
      },
      { key: "interchange_agreements", label: "Acuerdos de intercambio", type: "textarea" },
      { key: "certifications", label: "Certificaciones", type: "checks", tagGroup: "certification", options: ["US Bonded Carrier", "TWIC Card", "Smartway", "Transporte Limpio", "Hazmat", "ACE", "FAST", "CTPAT", "OEA", "ISO90001", "R-Control"] }
    ]
  },
  {
    key: "insurance_infrastructure",
    label: "Insurance and infrastructure",
    fields: [
      { key: "coverage_amounts", label: "Montos de cobertura", type: "textarea" },
      { key: "mexico_terminal_zips", label: "Terminales Mexico ZIPs", type: "textarea" },
      { key: "us_ca_terminal_zips", label: "Terminales USA/Canada ZIPs", type: "textarea" },
      { key: "equipment_types", label: "Tipos de unidad disponibles", type: "checks", tagGroup: "equipment", options: ["Power Only (5a Rueda)", "Chassis (Portacontenedor)", "Conestoga (Encortinado)", "Lowboys", "Semi-lowboys", "Stepdecks", "Double Drops", "Multi-Axles (Modulares)", "Flatbed", "Dry Van", "Reefer", "Thortons", "Rabones", "3.5 tons", "1.5 tons"] },
      { key: "equipment_notes", label: "Observaciones sobre equipos", type: "textarea" }
    ]
  },
  {
    key: "key_contacts",
    label: "Key contacts",
    fields: [
      { key: "general_manager", label: "Gerente general", type: "textarea" },
      { key: "operations_manager", label: "Gerente de operaciones", type: "textarea" },
      { key: "safety_manager", label: "Gerente de seguridad", type: "textarea" },
      { key: "finance_manager", label: "Gerente de finanzas", type: "textarea" },
      { key: "commercial_manager", label: "Gerente comercial", type: "textarea" },
      { key: "key_account_manager", label: "Gerente de cuenta clave", type: "textarea" },
      { key: "other_contacts", label: "Otros contactos clave", type: "textarea" }
    ]
  }
];
const VENDOR_PROFILE_IMPORT_FIELDS = [
  ["general", "full_name", ["onboarding_full_name", "full_name", "nombre completo"]],
  ["general", "mobile_number", ["onboarding_mobile_number", "mobile_number", "numero movil", "número móvil", "phone", "telefono"]],
  ["general", "company_type", ["company_type", "tipo de empresa"]],
  ["general", "operating_country", ["operating_country", "pais donde opera", "país donde opera", "country"]],
  ["international", "dba_name", ["dba_name", "dba", "nombre comercial internacional"]],
  ["international", "legal_name", ["international_legal_name", "legal_name_international", "nombre legal"]],
  ["international", "fiscal_address", ["international_fiscal_address", "domicilio fiscal internacional"]],
  ["international", "usdot_number", ["usdot_number", "usdot"]],
  ["international", "mc_number", ["mc_number", "mc"]],
  ["international", "scac_code", ["scac_code", "scac"]],
  ["international", "tax_id", ["tax_id"]],
  ["international", "bank_name", ["international_bank_name", "bank_name"]],
  ["international", "account_number", ["international_account_number", "account_number"]],
  ["international", "routing_number", ["routing_number"]],
  ["international", "beneficiary_company", ["international_beneficiary_company", "beneficiary_company"]],
  ["international", "factoring_company", ["international_factoring_company", "factoring_company"]],
  ["international", "payment_terms", ["international_payment_terms", "payment_terms"]],
  ["mexico", "commercial_name", ["mexico_commercial_name", "nombre comercial"]],
  ["mexico", "legal_name", ["mexico_legal_name", "razon social", "razón social"]],
  ["mexico", "fiscal_address", ["mexico_fiscal_address", "domicilio fiscal mexico", "domicilio fiscal méxico"]],
  ["mexico", "caat_code", ["caat_code", "caat"]],
  ["mexico", "rfc", ["rfc"]],
  ["mexico", "bank_name", ["mexico_bank_name", "nombre de banco"]],
  ["mexico", "account_number", ["mexico_account_number", "numero de cuenta", "número de cuenta"]],
  ["mexico", "clabe_number", ["clabe_number", "numero clabe", "número clabe", "clabe"]],
  ["mexico", "beneficiary_company", ["mexico_beneficiary_company", "compania beneficiaria", "compañía beneficiaria"]],
  ["mexico", "factoring_company", ["mexico_factoring_company"]],
  ["mexico", "payment_terms", ["mexico_payment_terms"]],
  ["carrier_profile", "geographic_scope", ["geographic_scope", "alcance geografico", "alcance geográfico"]],
  ["carrier_profile", "service_scope", ["service_scope", "alcance de servicios", "services"]],
  ["carrier_profile", "regional_coverage", ["regional_coverage", "cobertura regional", "regions"]],
  ["carrier_profile", "border_crossings", ["border_crossings", "cruces fronterizos", "border crossings"]],
  ["carrier_profile", "mexican_ports", ["mexican_ports", "puertos mexicanos"]],
  ["carrier_profile", "value_added_services", ["value_added_services", "servicios logisticos", "servicios logísticos"]],
  ["carrier_profile", "additional_capabilities", ["additional_capabilities", "capacidades adicionales"]],
  ["carrier_profile", "interchange_agreements", ["interchange_agreements", "acuerdos de intercambio"]],
  ["carrier_profile", "certifications", ["certifications", "certificaciones"]],
  ["insurance_infrastructure", "coverage_amounts", ["coverage_amounts", "insurance_coverage", "montos de cobertura"]],
  ["insurance_infrastructure", "mexico_terminal_zips", ["mexico_terminal_zips", "terminales mexico", "terminales méxico"]],
  ["insurance_infrastructure", "us_ca_terminal_zips", ["us_ca_terminal_zips", "terminales usa canada", "terminales estados unidos canada"]],
  ["insurance_infrastructure", "equipment_types", ["equipment_types", "tipos de unidad", "equipment"]],
  ["insurance_infrastructure", "equipment_notes", ["equipment_notes", "observaciones equipo"]],
  ["key_contacts", "general_manager", ["general_manager", "gerente general"]],
  ["key_contacts", "operations_manager", ["operations_manager", "gerente de operaciones"]],
  ["key_contacts", "safety_manager", ["safety_manager", "gerente de seguridad"]],
  ["key_contacts", "finance_manager", ["finance_manager", "gerente de finanzas"]],
  ["key_contacts", "commercial_manager", ["commercial_manager", "gerente comercial"]],
  ["key_contacts", "key_account_manager", ["key_account_manager", "gerente de cuenta clave"]],
  ["key_contacts", "other_contacts", ["other_contacts", "otros contactos"]]
];
const VENDOR_SHEET_COLUMNS = [
  { key: "select", label: "Select", locked: true },
  { key: "vendor", label: "Vendor", locked: true },
  { key: "domain", label: "Domain" },
  // defaultHidden: sparse profile columns stay available in the Columns menu
  // but do not clutter the default grid until the data exists.
  { key: "contact", label: "Contact", defaultHidden: true },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "health", label: "Health" },
  { key: "quotes", label: "Quotes" },
  { key: "coverage_delta", label: "Coverage fit" },
  { key: "tags", label: "Tags" },
  { key: "onboarding", label: "Onboarding" },
  { key: "operating_country", label: "Country", defaultHidden: true },
  { key: "service_scope", label: "Services", defaultHidden: true },
  { key: "regional_coverage", label: "Regions", defaultHidden: true },
  { key: "equipment_types", label: "Equipment", defaultHidden: true },
  { key: "certifications", label: "Certs", defaultHidden: true },
  { key: "channel", label: "Channel" },
  { key: "base", label: "Base" },
  { key: "status", label: "Status" },
  { key: "coverage", label: "Coverage" },
  { key: "notes", label: "Notes", defaultHidden: true },
  { key: "source", label: "Source", defaultHidden: true }
];

function isVendorBaseTab(tabName) {
  return VENDOR_BASE_TABS.includes(tabName);
}

function visibleVendorTab(tabName) {
  if (isVendorBaseTab(tabName)) return "sourcing";
  if (VENDOR_IMPORT_TOOLS.includes(tabName)) return "import";
  return tabName || "sourcing";
}

function baseStageLabel(stage = activeBaseStage) {
  if (stage === "procurement") return "Procurement Base";
  if (stage === "archived") return "Archived";
  return "Sourcing Base";
}

function activeCrmView() {
  return activeVendorTab === "funnel" ? "pipeline" : activeDirectoryView;
}

function syncCrmViewButtons() {
  const view = activeCrmView();
  crmViewButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.crmView === view);
  });
}

function defaultVendorColumnKeys() {
  return VENDOR_SHEET_COLUMNS.filter((column) => !column.defaultHidden).map((column) => column.key);
}

function lockedVendorColumnKeys() {
  return VENDOR_SHEET_COLUMNS.filter((column) => column.locked).map((column) => column.key);
}

function readVendorColumnKeys() {
  const validKeys = new Set(VENDOR_SHEET_COLUMNS.map((column) => column.key));
  const lockedKeys = lockedVendorColumnKeys();
  try {
    const saved = JSON.parse(window.localStorage.getItem(VENDOR_COLUMN_STORAGE_KEY) || "[]");
    if (Array.isArray(saved) && saved.length) {
      const keys = saved.filter((key) => validKeys.has(key));
      lockedKeys.forEach((key) => {
        if (!keys.includes(key)) keys.unshift(key);
      });
      return keys.length ? keys : defaultVendorColumnKeys();
    }
  } catch (error) {
    window.localStorage.removeItem(VENDOR_COLUMN_STORAGE_KEY);
  }
  return defaultVendorColumnKeys();
}

function saveVendorColumnKeys(keys) {
  const validKeys = new Set(VENDOR_SHEET_COLUMNS.map((column) => column.key));
  const nextKeys = keys.filter((key) => validKeys.has(key));
  lockedVendorColumnKeys().forEach((key) => {
    if (!nextKeys.includes(key)) nextKeys.unshift(key);
  });
  window.localStorage.setItem(VENDOR_COLUMN_STORAGE_KEY, JSON.stringify(nextKeys));
}

function visibleVendorColumns() {
  const visibleKeys = new Set(readVendorColumnKeys());
  return VENDOR_SHEET_COLUMNS.filter((column) => column.locked || visibleKeys.has(column.key));
}

function vendorTableColumnCount() {
  return visibleVendorColumns().length;
}

function readVendorSavedViews() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(VENDOR_SAVED_VIEWS_STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((view) => view?.id && view?.name)
      .map((view) => ({
        id: String(view.id),
        name: String(view.name),
        baseStage: VENDOR_BASE_TABS.includes(view.baseStage) ? view.baseStage : "sourcing",
        crmView: view.crmView === "cards" ? "cards" : "spreadsheet",
        quickFilter: view.quickFilter || "all",
        pageSize: Number(view.pageSize) || 75,
        columnKeys: Array.isArray(view.columnKeys) ? view.columnKeys : defaultVendorColumnKeys(),
        filters: {
          search: view.filters?.search || "",
          status: view.filters?.status || "",
          channel: view.filters?.channel || "",
          tag: view.filters?.tag || "",
          coverage: view.filters?.coverage || ""
        },
        updatedAt: view.updatedAt || new Date().toISOString()
      }));
  } catch (error) {
    window.localStorage.removeItem(VENDOR_SAVED_VIEWS_STORAGE_KEY);
    return [];
  }
}

function writeVendorSavedViews(views) {
  window.localStorage.setItem(VENDOR_SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views));
}

function vendorViewIdFromName(name) {
  const slug = String(name || "vendor-view")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${slug || "vendor-view"}-${Date.now()}`;
}

function currentVendorViewSnapshot(name, existingId = "") {
  return {
    id: existingId || vendorViewIdFromName(name),
    name,
    baseStage: activeBaseStage,
    crmView: activeDirectoryView === "cards" ? "cards" : "spreadsheet",
    quickFilter: activeQuickFilter,
    pageSize: vendorPageSize,
    columnKeys: readVendorColumnKeys(),
    filters: {
      search: searchInput.value || "",
      status: statusFilter.value || "",
      channel: channelFilter.value || "",
      tag: tagFilter.value || "",
      coverage: coverageFilter.value || ""
    },
    updatedAt: new Date().toISOString()
  };
}

function renderVendorSavedViews(activeId = "") {
  if (!vendorSavedViewSelect) return;
  const views = readVendorSavedViews().sort((a, b) => a.name.localeCompare(b.name));
  vendorSavedViewSelect.innerHTML = [
    '<option value="">Custom view</option>',
    ...views.map((view) => `<option value="${escapeHtml(view.id)}">${escapeHtml(view.name)}</option>`)
  ].join("");
  vendorSavedViewSelect.value = activeId;
  if (deleteVendorViewButton) deleteVendorViewButton.disabled = !activeId;
}

function saveCurrentVendorView() {
  const existingViews = readVendorSavedViews();
  const selectedView = existingViews.find((view) => view.id === vendorSavedViewSelect?.value);
  const defaultName = selectedView?.name || `${baseStageLabel()} view`;
  const name = window.prompt("Name this vendor view", defaultName);
  if (!name?.trim()) return;

  const normalizedName = name.trim();
  const sameNameView = existingViews.find((view) => view.name.toLowerCase() === normalizedName.toLowerCase());
  const existingId = selectedView?.id || sameNameView?.id || "";
  const snapshot = currentVendorViewSnapshot(normalizedName, existingId);
  const nextViews = [
    ...existingViews.filter((view) => view.id !== snapshot.id),
    snapshot
  ].sort((a, b) => a.name.localeCompare(b.name));

  writeVendorSavedViews(nextViews);
  renderVendorSavedViews(snapshot.id);
  setStatus(bulkStatusMessage, `Saved vendor view "${snapshot.name}".`, "success");
}

function applyVendorSavedView(viewId) {
  const view = readVendorSavedViews().find((item) => item.id === viewId);
  if (!view) {
    renderVendorSavedViews("");
    return;
  }

  saveVendorColumnKeys(view.columnKeys);
  renderVendorColumnMenu();
  activeDirectoryView = view.crmView;
  window.localStorage.setItem("rateware.vendorDirectoryView", activeDirectoryView);
  activeQuickFilter = view.quickFilter || "all";
  quickFilterButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.quickFilter === activeQuickFilter));
  searchInput.value = view.filters.search;
  statusFilter.value = view.filters.status;
  channelFilter.value = view.filters.channel;
  tagFilter.value = view.filters.tag;
  coverageFilter.value = view.filters.coverage;
  vendorPageSize = VENDOR_PAGE_SIZES.includes(Number(view.pageSize)) ? Number(view.pageSize) : 75;
  vendorPageSizeSelect.value = String(vendorPageSize);
  vendorPageOffset = 0;
  clearVendorSelection();
  renderVendorSavedViews(view.id);
  activateVendorTab(view.baseStage);
  setStatus(bulkStatusMessage, `Loaded vendor view "${view.name}".`, "success");
}

function deleteCurrentVendorView() {
  const viewId = vendorSavedViewSelect?.value;
  if (!viewId) {
    setStatus(bulkStatusMessage, "Select a saved view to delete.", "warning");
    return;
  }
  const views = readVendorSavedViews();
  const view = views.find((item) => item.id === viewId);
  if (!view) return;
  if (!window.confirm(`Delete saved view "${view.name}"?`)) return;
  writeVendorSavedViews(views.filter((item) => item.id !== viewId));
  renderVendorSavedViews("");
  setStatus(bulkStatusMessage, `Deleted vendor view "${view.name}".`, "success");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function numberLabel(value) {
  return Number(value || 0).toLocaleString();
}

function downloadVendorMatchErrors(rows = [], truncated = false) {
  if (!Array.isArray(rows) || !rows.length) return false;
  const headers = [
    "source_scope",
    "rate_row_id",
    "shipment_id",
    "raw_upload_id",
    "source_file",
    "rfx_id",
    "quote_date",
    "origin",
    "destination",
    "current_vendor_domain",
    "detected_vendor_reference",
    "error_reason",
    "corrected_vendor_domain",
    "corrected_vendor_name",
    "corrected_legal_name"
  ];
  const payload = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
    ...(truncated ? [headers.map((header) => escapeCsv(header === "error_reason" ? "Report truncated. Re-run the queue after corrections to continue." : "")).join(",")] : [])
  ].join("\n");
  const blob = new Blob([payload], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vendor-match-errors-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

function downloadVendorOnboardingGapsCsv(rows = [], summary = {}) {
  const headers = [
    "vendor_id",
    "vendor_name",
    "domain",
    "primary_email",
    "whatsapp_phone",
    "base_stage",
    "funnel_stage",
    "readiness_score",
    "missing_count",
    "missing_required_fields",
    "suggested_action",
    "operating_country",
    "legal_name",
    "rfc",
    "usdot_number",
    "mc_number",
    "geographic_scope",
    "service_scope",
    "regional_coverage",
    "equipment_types",
    "certifications",
    "coverage_amounts",
    "general_manager",
    "operations_manager",
    "commercial_manager"
  ];
  const payloadRows = rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(","));
  if (summary.truncated) {
    payloadRows.push(headers.map((header) => escapeCsv(header === "suggested_action" ? "Report truncated. Narrow the vendor base or export in batches." : "")).join(","));
  }
  const payload = [headers.join(","), ...payloadRows].join("\n");
  const blob = new Blob([payload], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vendor-onboarding-gaps-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

async function downloadVendorOnboardingGaps() {
  if (!downloadOnboardingGapsButton) return;
  downloadOnboardingGapsButton.disabled = true;
  setStatus(vendorOnboardingGapsStatus, "Building onboarding gaps file...");
  try {
    await requirePrivatePage();
    const result = await fetchVendorOnboardingGaps();
    const rows = result.rows || [];
    if (!rows.length) {
      setStatus(vendorOnboardingGapsStatus, "No onboarding gaps found across the vendor base.", "success");
      return;
    }
    downloadVendorOnboardingGapsCsv(rows, result.summary || {});
    const total = result.summary?.total_vendors ?? rows.length;
    const gapCount = result.summary?.vendors_with_gaps ?? rows.length;
    setStatus(vendorOnboardingGapsStatus, `Downloaded ${gapCount} vendor gap row(s) from ${total} vendor(s).`, result.summary?.truncated ? "warning" : "success");
  } catch (error) {
    setStatus(vendorOnboardingGapsStatus, humanizeError(error), "error");
  } finally {
    downloadOnboardingGapsButton.disabled = false;
  }
}

function cleanExternalUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function vendorInitials(row) {
  const source = row?.vendor_name || row?.domain || row?.primary_email || "RW";
  return String(source)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "RW";
}

function vendorLogoUrl(row) {
  return cleanExternalUrl(row?.logo_url);
}

function renderVendorAvatar(row, size = "small") {
  const url = vendorLogoUrl(row);
  const initials = escapeHtml(vendorInitials(row));
  return `
    <span class="vendor-logo ${escapeHtml(size)}" aria-hidden="true">
      ${url ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />` : ""}
      <span>${initials}</span>
    </span>
  `;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read logo file."));
    reader.readAsDataURL(file);
  });
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

function setVendorGridStatus(message, tone = "neutral") {
  setStatus(vendorGridStatus, message, tone);
  setStatus(bulkStatusMessage, message, tone);
}

function setVendorImportStep(step) {
  document.querySelectorAll("[data-import-step]").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.importStep === step);
  });
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitTags(value) {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
  return String(value || "")
    .split(/[;,]/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function splitProfileList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  const text = String(value || "").trim();
  if (!text) return [];
  const separator = text.includes(";") ? /;/ : /,/;
  return text.split(separator).map((item) => item.trim()).filter(Boolean);
}

function firstImportedValue(row, names) {
  const lookup = new Map(Object.keys(row || {}).map((name) => [normalizeKey(name), row[name]]));
  for (const name of names) {
    const value = String(lookup.get(normalizeKey(name)) ?? "").trim();
    if (value) return value;
  }
  return "";
}

function profileFieldDefinition(sectionKey, fieldKey) {
  const section = VENDOR_ONBOARDING_SECTIONS.find((item) => item.key === sectionKey);
  return section?.fields.find((field) => field.key === fieldKey) || null;
}

function readImportedProfileData(row) {
  const profile = {};
  VENDOR_PROFILE_IMPORT_FIELDS.forEach(([sectionKey, fieldKey, names]) => {
    const value = firstImportedValue(row, names);
    if (!value) return;
    const field = profileFieldDefinition(sectionKey, fieldKey);
    if (!profile[sectionKey]) profile[sectionKey] = {};
    profile[sectionKey][fieldKey] = field?.type === "checks" ? splitProfileList(value) : value;
  });
  return profile;
}

const VENDOR_EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

function vendorEmailTokens(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item || "")
    .split(/[,;\r\n]+/)
    .flatMap((part) => {
      const trimmed = part.trim();
      if (!trimmed) return [];
      const bracketed = trimmed.match(/^.*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
      return bracketed ? [bracketed[1]] : trimmed.split(/\s+/);
    })
    .map((token) => token.trim())
    .filter(Boolean));
}

function parseVendorEmailList(value) {
  const emails = [];
  const invalid = [];
  vendorEmailTokens(value).forEach((token) => {
    const email = token.replace(/^mailto:/i, "").toLowerCase();
    if (VENDOR_EMAIL_PATTERN.test(email)) emails.push(email);
    else invalid.push(token);
  });
  return {
    emails: Array.from(new Set(emails)),
    invalid: Array.from(new Set(invalid))
  };
}

function emailValidationMessage(value) {
  const { invalid } = parseVendorEmailList(value);
  if (!invalid.length) return "";
  return `Correct invalid email ${invalid.length === 1 ? "address" : "addresses"}: ${invalid.join(", ")}`;
}

function emailList(value) {
  return parseVendorEmailList(value).emails;
}

function splitVendorEmails(value) {
  const emails = emailList(value);
  return {
    primary_email: emails[0] || "",
    secondary_emails: emails.slice(1)
  };
}

function vendorEmailInputValue(row = {}) {
  return [row.primary_email, ...(Array.isArray(row.secondary_emails) ? row.secondary_emails : [])]
    .filter(Boolean)
    .join("; ");
}

function isValidEmailList(value) {
  return !emailValidationMessage(value);
}

function isValidDomain(value) {
  if (!value) return true;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(value).trim().replace(/^https?:\/\//, "").replace(/^www\./, ""));
}

function importIssues(row) {
  const issues = [];
  if (!row.vendor_name) issues.push("Missing vendor name");
  if (!row.primary_email && !row.whatsapp_phone) issues.push("Missing contact channel");
  if (!isValidEmailList(vendorEmailInputValue(row) || row.primary_email)) issues.push("Invalid email");
  if (!isValidDomain(row.domain)) issues.push("Invalid domain");
  if (duplicateSignals(row).length) issues.push("Possible duplicate");
  return issues;
}

function validImportRows() {
  return pendingImportRows.filter((row) => !importIssues(row).some((issue) => !issue.includes("duplicate")));
}

function downloadVendorTemplate() {
  const headers = [
    "vendor_name",
    "legal_name",
    "domain",
    "contact_name",
    "primary_email",
    "whatsapp_phone",
    "preferred_channel",
    "whatsapp_permission_basis",
    "whatsapp_do_not_contact",
    "whatsapp_opt_in_status",
    "whatsapp_group_name",
    "whatsapp_group_url",
    "whatsapp_meta_group_id",
    "whatsapp_group_status",
    "whatsapp_notes",
    "logo_url",
    "tags",
    "coverage_notes",
    "notes",
    "onboarding_full_name",
    "onboarding_mobile_number",
    "company_type",
    "operating_country",
    "usdot_number",
    "mc_number",
    "scac_code",
    "tax_id",
    "rfc",
    "caat_code",
    "geographic_scope",
    "service_scope",
    "regional_coverage",
    "border_crossings",
    "mexican_ports",
    "value_added_services",
    "additional_capabilities",
    "certifications",
    "coverage_amounts",
    "mexico_terminal_zips",
    "us_ca_terminal_zips",
    "equipment_types",
    "equipment_notes",
    "general_manager",
    "operations_manager",
    "safety_manager",
    "finance_manager",
    "commercial_manager",
    "key_account_manager"
  ];
  const examples = [
    [
      "ABC Logistics",
      "ABC Logistics LLC",
      "abclogistics.com",
      "Jane Doe",
      "pricing@abclogistics.com",
      "+5215550000000",
      "multi",
      "contractual",
      "false",
      "contractual",
      "ABC Logistics RFx",
      "https://chat.whatsapp.com/example",
      "",
      "manual_only",
      "Use group only after manual verification",
      "https://abclogistics.com/logo.png",
      "mx, cross-border, ftl",
      "MX-US lanes, Laredo, dry van",
      "Preferred for border freight",
      "Jane Doe",
      "+5215550000000",
      "Persona Moral",
      "Mexico",
      "1234567",
      "MC123456",
      "ABCD",
      "12-3456789",
      "ABC010101XX1",
      "CAAT1234",
      "Mexico;Estados Unidos",
      "Fletes Transfronterizos (Door 2 Door con Operadores B1 + Acuerdo de Intercambio)",
      "Noreste - MX (Coahuila, Nuevo Leon, Tamaulipas);South - Southwest - US (AR, LA, OK, TX)",
      "Laredo;Pharr",
      "Altamira;Veracruz",
      "Transfer (Cruces Internacionales);Cargo Insurance (Seguro de Carga)",
      "Monitoreo 24/7 dedicado;Sistema de gestion de flotillas / transporte",
      "CTPAT;FAST;Hazmat",
      "Crossborder USD 250,000 / Cargo USD 100,000",
      "64000;66600",
      "78045;75001",
      "Dry Van;Flatbed;Reefer",
      "DV53 and flatbed capacity available",
      "Jane Doe | jane@abclogistics.com | +5215550000000",
      "Ops Team | ops@abclogistics.com",
      "Safety Team | safety@abclogistics.com",
      "Finance Team | ar@abclogistics.com",
      "Commercial Team | sales@abclogistics.com",
      "Key Account | kam@abclogistics.com"
    ]
  ];
  const csv = [headers, ...examples]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "rateware-vendor-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

const VENDOR_UPDATE_TEMPLATE_HEADERS = [
  "vendor_id",
  "vendor_name",
  "legal_name",
  "domain",
  "contact_name",
  "primary_email",
  "secondary_emails",
  "whatsapp_phone",
  "preferred_channel",
  "status",
  "base_stage",
  "funnel_stage",
  "tags",
  "add_tags",
  "coverage_notes",
  "notes",
  "logo_url",
  "whatsapp_permission_basis",
  "whatsapp_do_not_contact",
  "whatsapp_opt_in_status",
  "whatsapp_group_name",
  "whatsapp_group_url",
  "whatsapp_group_status",
  "whatsapp_notes",
  "clear_fields",
  "update_note"
];

const VENDOR_UPDATE_FIELD_ALIASES = {
  vendor_id: ["vendor_id", "vendor id", "id", "vendorid"],
  vendor_name: ["vendor_name", "vendor name", "vendor", "carrier", "carrier name", "carrier_name", "name", "company", "company name", "nombre", "nombre comercial", "transportista"],
  legal_name: ["legal_name", "legal name", "legal", "razon social", "razon_social", "razón social", "nombre legal"],
  domain: ["domain", "vendor_domain", "vendor domain", "carrier domain", "dominio", "dominio vendor", "dominio carrier"],
  contact_name: ["contact_name", "contact name", "contact", "contacto", "nombre contacto"],
  primary_email: ["primary_email", "primary email", "email", "emails", "main email", "correo", "correos", "correo principal", "email principal"],
  secondary_emails: ["secondary_emails", "secondary emails", "additional emails", "extra emails", "correos secundarios", "emails secundarios", "correos adicionales"],
  whatsapp_phone: ["whatsapp_phone", "whatsapp phone", "whatsapp", "phone", "telefono", "teléfono", "celular", "numero whatsapp", "número whatsapp"],
  preferred_channel: ["preferred_channel", "preferred channel", "channel", "canal", "canal preferido"],
  status: ["status", "estado"],
  base_stage: ["base_stage", "base stage", "base", "etapa base", "base crm"],
  funnel_stage: ["funnel_stage", "funnel stage", "pipeline stage", "pipeline", "funnel", "embudo", "etapa funnel", "etapa pipeline"],
  tags: ["tags", "tag", "etiquetas"],
  add_tags: ["add_tags", "add tags", "append tags", "agregar tags", "agregar etiquetas"],
  coverage_notes: ["coverage_notes", "coverage notes", "coverage", "cobertura", "notas cobertura"],
  notes: ["notes", "notas"],
  logo_url: ["logo_url", "logo url", "logo"],
  whatsapp_permission_basis: ["whatsapp_permission_basis", "whatsapp permission basis", "whatsapp permission", "permiso whatsapp", "base permiso whatsapp"],
  whatsapp_do_not_contact: ["whatsapp_do_not_contact", "whatsapp do not contact", "do_not_contact_whatsapp", "no contactar whatsapp"],
  whatsapp_opt_in_status: ["whatsapp_opt_in_status", "whatsapp opt in status", "whatsapp opt in", "estatus opt in whatsapp"],
  whatsapp_group_name: ["whatsapp_group_name", "whatsapp group name", "group name", "grupo whatsapp"],
  whatsapp_group_url: ["whatsapp_group_url", "whatsapp group url", "group url", "link grupo whatsapp", "url grupo whatsapp"],
  whatsapp_group_status: ["whatsapp_group_status", "whatsapp group status", "group status", "estatus grupo whatsapp"],
  whatsapp_notes: ["whatsapp_notes", "whatsapp notes", "notas whatsapp"],
  clear_fields: ["clear_fields", "clear fields", "fields to clear", "limpiar campos", "campos a limpiar"],
  update_note: ["update_note", "update note", "comment", "comments", "comentario", "comentarios", "nota actualizacion", "nota actualización"]
};

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function pickTemplateValue(row, field) {
  const aliases = VENDOR_UPDATE_FIELD_ALIASES[field] || [field];
  const normalized = new Map(Object.entries(row || {}).map(([key, value]) => [normalizeHeaderKey(key), value]));
  for (const alias of aliases) {
    if (normalized.has(normalizeHeaderKey(alias))) return normalized.get(normalizeHeaderKey(alias));
  }
  return "";
}

function normalizeVendorUpdateRow(row, index = 0) {
  const normalized = { row_number: index + 2 };
  for (const field of VENDOR_UPDATE_TEMPLATE_HEADERS) {
    normalized[field] = pickTemplateValue(row, field);
  }
  normalized.vendor_id = String(normalized.vendor_id || "").trim();
  return normalized;
}

async function fetchAllVendorsForUpdateTemplate() {
  const rows = [];
  const seenVendorIds = new Set();
  const limit = 1000;
  let offset = 0;
  for (let guard = 0; guard < 60; guard += 1) {
    const result = await fetchVendors({ view: "all", lightweight: true, limit, offset });
    const batch = Array.isArray(result.rows) ? result.rows : [];
    for (const row of batch) {
      const id = String(row.id || row.vendor_id || "").trim();
      if (id && seenVendorIds.has(id)) continue;
      if (id) seenVendorIds.add(id);
      rows.push(row);
    }
    if (!batch.length || rows.length >= Number(result.total || 0)) break;
    offset += limit;
  }
  return rows;
}

async function downloadVendorUpdateTemplate() {
  if (!updateTemplateButton) return;
  updateTemplateButton.disabled = true;
  setStatus(vendorUpdateStatus, "Preparing CRM update template...");
  try {
    await requirePrivatePage();
    const rows = await fetchAllVendorsForUpdateTemplate();
    const csvRows = rows.map((row) => [
      row.id || "",
      row.vendor_name || "",
      row.legal_name || "",
      row.domain || "",
      row.contact_name || "",
      row.primary_email || "",
      Array.isArray(row.secondary_emails) ? row.secondary_emails.join("; ") : "",
      row.whatsapp_phone || "",
      row.preferred_channel || "",
      row.status || "",
      row.base_stage || "",
      row.funnel_stage || "",
      Array.isArray(row.tags) ? row.tags.join("; ") : "",
      "",
      row.coverage_notes || "",
      row.notes || "",
      row.logo_url || "",
      row.whatsapp_permission_basis || "",
      row.whatsapp_do_not_contact === true ? "true" : row.whatsapp_do_not_contact === false ? "false" : "",
      row.whatsapp_opt_in_status || "",
      row.whatsapp_group_name || "",
      row.whatsapp_group_url || "",
      row.whatsapp_group_status || "",
      row.whatsapp_notes || "",
      "",
      ""
    ]);
    downloadCsv(`rateware-carrier-crm-update-${new Date().toISOString().slice(0, 10)}.csv`, VENDOR_UPDATE_TEMPLATE_HEADERS, csvRows);
    setStatus(vendorUpdateStatus, `Template downloaded with ${rows.length} vendor(s). Edit only the fields you need to change.`, "success");
  } catch (error) {
    setStatus(vendorUpdateStatus, humanizeError(error), "error");
  } finally {
    updateTemplateButton.disabled = false;
  }
}

async function parseVendorUpdateFile(file) {
  const XLSX = await loadXlsxModule();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { defval: "" })
    .map(normalizeVendorUpdateRow)
    .filter((row) => row.vendor_id || VENDOR_UPDATE_TEMPLATE_HEADERS.some((field) => String(row[field] || "").trim()));
}

function renderVendorUpdatePreview(result = {}) {
  vendorUpdatePreview = result;
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const valid = Number(result.valid || 0);
  const invalid = Number(result.invalid || 0);
  const applied = Number(result.updated || result.applied || 0);
  const visibleRows = rows.slice(0, 100);
  const hiddenRows = Math.max(rows.length - visibleRows.length, 0);
  vendorUpdatePreviewSummary.innerHTML = `
    <article><strong>${Number(result.received || rows.length)}</strong><span>Rows reviewed</span></article>
    <article><strong>${valid}</strong><span>Ready to update</span></article>
    <article><strong>${invalid}</strong><span>Need correction</span></article>
    <article><strong>${rows.reduce((sum, row) => sum + Number(row.change_count || 0), 0)}</strong><span>Field changes</span></article>
    ${applied ? `<article><strong>${applied}</strong><span>Applied</span></article>` : ""}
    ${hiddenRows ? `<article><strong>${hiddenRows}</strong><span>More rows not shown</span></article>` : ""}
  `;
  vendorUpdatePreviewBody.innerHTML = visibleRows.map((row) => {
    const errors = Array.isArray(row.errors) ? row.errors : [];
    const warnings = Array.isArray(row.warnings) ? row.warnings : [];
    return `
      <tr>
        <td>${escapeHtml(row.row_number || "")}</td>
        <td>${escapeHtml(row.vendor_name || row.vendor_id || "")}</td>
        <td>${escapeHtml(row.matched_by || (row.vendor_id ? "vendor_id" : "unmatched"))}</td>
        <td>${escapeHtml((row.changed_fields || []).join(", ") || "No changes")}</td>
        <td>${errors.length ? errors.map((item) => `<span class="warning-pill">${escapeHtml(item)}</span>`).join(" ") : '<span class="score-pill strong">Ready</span>'}</td>
        <td>${warnings.map((item) => `<span class="status-pill">${escapeHtml(item)}</span>`).join(" ")}</td>
      </tr>
    `;
  }).join("");
  if (hiddenRows) {
    vendorUpdatePreviewBody.innerHTML += `
      <tr>
        <td colspan="6">Showing first ${visibleRows.length.toLocaleString()} of ${rows.length.toLocaleString()} preview rows. Error CSV and apply action still use the full reviewed file.</td>
      </tr>
    `;
  }
  if (!rows.length) vendorUpdatePreviewBody.innerHTML = applied
    ? `<tr><td colspan="6">${applied.toLocaleString()} vendor(s) updated. No preview rows were returned by the API.</td></tr>`
    : '<tr><td colspan="6">No rows found.</td></tr>';
  applyVendorUpdateButton.disabled = !valid || Boolean(applied);
  downloadVendorUpdateErrorsButton.disabled = !invalid;
  vendorUpdatePreviewPanel.classList.remove("hidden");
  activateVendorTab("import");
}

function downloadVendorUpdateErrors() {
  const rows = Array.isArray(vendorUpdatePreview?.rows) ? vendorUpdatePreview.rows : [];
  const errorRows = rows.filter((row) => Array.isArray(row.errors) && row.errors.length);
  downloadCsv(
    `rateware-carrier-crm-update-errors-${new Date().toISOString().slice(0, 10)}.csv`,
    ["row_number", "vendor_id", "vendor_name", "legal_name", "domain", "primary_email", "matched_by", "errors", "changed_fields"],
    errorRows.map((row) => [
      row.row_number || "",
      row.vendor_id || "",
      row.vendor_name || "",
      row.legal_name || "",
      row.domain || "",
      row.primary_email || "",
      row.matched_by || "",
      row.errors.join("; "),
      (row.changed_fields || []).join("; ")
    ])
  );
}

function vendorReadiness(row) {
  const profile = vendorProfileData(row);
  const tags = Array.from(new Set([...splitTags(row.tags), ...profileDerivedTags(row)]));
  const hasProfileIdentity = Boolean(
    profileFieldValue(profile, "mexico", "rfc")
    || profileFieldValue(profile, "mexico", "legal_name")
    || profileFieldValue(profile, "international", "usdot_number")
    || profileFieldValue(profile, "international", "mc_number")
    || profileFieldValue(profile, "international", "legal_name")
  );
  const hasProfileCoverage = [
    profileFieldValue(profile, "carrier_profile", "geographic_scope"),
    profileFieldValue(profile, "carrier_profile", "service_scope"),
    profileFieldValue(profile, "carrier_profile", "regional_coverage"),
    profileFieldValue(profile, "carrier_profile", "border_crossings")
  ].some((value) => profileHasValue(value, { type: "checks" }));
  const hasProfileEquipment = profileHasValue(profileFieldValue(profile, "insurance_infrastructure", "equipment_types"), { type: "checks" });
  const hasProfileCompliance = [
    profileFieldValue(profile, "carrier_profile", "certifications"),
    profileFieldValue(profile, "insurance_infrastructure", "coverage_amounts"),
    profileFieldValue(profile, "international", "tax_id"),
    profileFieldValue(profile, "mexico", "rfc")
  ].some((value) => Array.isArray(value) ? value.length : Boolean(value));
  const hasProfileContacts = [
    profileFieldValue(profile, "key_contacts", "general_manager"),
    profileFieldValue(profile, "key_contacts", "operations_manager"),
    profileFieldValue(profile, "key_contacts", "commercial_manager"),
    profileFieldValue(profile, "general", "full_name"),
    profileFieldValue(profile, "general", "mobile_number")
  ].some(Boolean);
  const checks = [
    { key: "identity", label: "Identity", done: Boolean(row.vendor_name && (row.domain || hasProfileIdentity)), weight: 18 },
    { key: "contact", label: "Contact", done: Boolean(row.primary_email || row.whatsapp_phone || hasProfileContacts), weight: 18 },
    { key: "channel", label: "Channel", done: Boolean(row.preferred_channel), weight: 8 },
    { key: "coverage", label: "Coverage", done: Boolean(row.coverage_notes || hasProfileCoverage), weight: 22 },
    { key: "equipment", label: "Equipment", done: Boolean(tags.length || hasProfileEquipment), weight: 16 },
    { key: "compliance", label: "Compliance", done: hasProfileCompliance, weight: 13 },
    { key: "notes", label: "Notes", done: Boolean(row.notes), weight: 5 }
  ];
  const score = checks.reduce((total, check) => total + (check.done ? check.weight : 0), 0);
  const missing = checks.filter((check) => !check.done).map((check) => check.label);
  const label = score >= 85 ? "Procurement ready" : score >= 65 ? "Needs cleanup" : "Incomplete";
  // Color bands are deliberately looser than the business labels: red is
  // reserved for truly incomplete profiles so mid scores read as in-progress.
  const tone = score >= 70 ? "strong" : score >= 35 ? "medium" : "weak";
  return { score, checks, missing, label, tone };
}

function scoreVendor(row) {
  return vendorReadiness(row).score;
}

function isRfxReady(row) {
  const readiness = vendorReadiness(row);
  return readiness.score >= 85 && (row.primary_email || row.whatsapp_phone) && splitTags(row.tags).length;
}

function hasMissingContact(row) {
  return !row.primary_email && !row.whatsapp_phone;
}

function activateVendorTab(tabName) {
  const previousTab = activeVendorTab;
  activeVendorTab = tabName;
  if (isVendorBaseTab(tabName)) {
    activeBaseStage = tabName;
    vendorPageOffset = 0;
  }
  persistVendorWorkspaceContext();
  const activeVisibleTab = visibleVendorTab(tabName);
  vendorTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.vendorTab === activeVisibleTab));
  directoryBaseButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.baseTab === activeBaseStage));
  tabPanels.forEach((panel) => {
    const shouldShow = panel.dataset.tabPanel === tabName || (isVendorBaseTab(tabName) && panel.dataset.tabPanel === "sourcing");
    const isEmptyImportPreview = panel.id === "import-preview-panel" && !pendingImportRows.length;
    panel.classList.toggle("hidden", !shouldShow || isEmptyImportPreview);
  });
  if (tabName === "duplicates") renderDuplicateReview();
  if (tabName === "intelligence" && (!vendorIntelligenceRows.length || vendorIntelligenceStale)) loadVendorIntelligence();
  if (tabName === "funnel" && !vendorFunnelRows.length) loadVendorFunnel();
  if (tabName === "matching" && !vendorMatchLoaded) analyzeVendorMatchQueue();
  if (tabName === "import" && !pendingImportRows.length) setVendorImportStep("source");
  if (tabName === "segments") {
    ensureVendorSegmentsLoaded();
    if (!allVendors.length) loadVendors().then(() => renderSegments());
  }
  if (tabName === "duplicates" && !allVendors.length) {
    loadVendors().then(() => renderDuplicateReview());
  }
  if (isVendorBaseTab(tabName) && (previousTab !== tabName || !allVendors.length)) loadVendors();
  syncCrmViewButtons();
}

function setCrmView(view) {
  if (view === "pipeline") {
    renderVendorSavedViews("");
    activateVendorTab("funnel");
    return;
  }
  renderVendorSavedViews("");
  activeDirectoryView = view === "cards" ? "cards" : "spreadsheet";
  window.localStorage.setItem("rateware.vendorDirectoryView", activeDirectoryView);
  persistVendorWorkspaceContext();
  if (!isVendorBaseTab(activeVendorTab)) {
    activateVendorTab(activeBaseStage);
    return;
  }
  renderVendors(currentVendors);
  syncCrmViewButtons();
}

function updateBulkState() {
  const visibleSelectedCount = selectedVisibleVendorIds().length;
  const hiddenSelectedCount = Math.max(0, selectedVendorIds.size - visibleSelectedCount);
  const mutationRunning = vendorBulkActionRunning;
  bulkToolbar.classList.toggle("hidden", visibleSelectedCount === 0);
  bulkSelectionCount.textContent = `${visibleSelectedCount} selected${hiddenSelectedCount ? ` (${hiddenSelectedCount} hidden ignored)` : ""}`;
  if (bulkProcurementButton) {
    bulkProcurementButton.textContent =
      activeBaseStage === "archived"
        ? "Restore to Sourcing"
        : activeBaseStage === "procurement"
          ? "Return to Sourcing"
          : "Send to Procurement";
    bulkProcurementButton.disabled = mutationRunning || visibleSelectedCount === 0;
  }
  if (bulkArchiveVendorsButton) {
    bulkArchiveVendorsButton.disabled = mutationRunning || visibleSelectedCount === 0 || activeBaseStage === "archived";
  }
  if (bulkRemoveVendorsButton) {
    bulkRemoveVendorsButton.disabled = mutationRunning || visibleSelectedCount === 0;
  }
  if (bulkButton) {
    bulkButton.disabled = mutationRunning || visibleSelectedCount === 0;
  }
}

function selectedVisibleVendorRows() {
  return currentVendors.filter((vendor) => selectedVendorIds.has(vendor.id));
}

function selectedVisibleVendorIds() {
  return selectedVisibleVendorRows().map((vendor) => vendor.id).filter(Boolean);
}

function clearVendorSelection() {
  selectedVendorIds = new Set();
  document.querySelectorAll(".vendor-select").forEach((checkbox) => {
    checkbox.checked = false;
  });
  updateBulkState();
}

function selectVisibleVendors() {
  currentVendors.forEach((vendor) => selectedVendorIds.add(vendor.id));
  document.querySelectorAll(".vendor-select").forEach((checkbox) => {
    checkbox.checked = true;
  });
  updateBulkState();
}

function updateVendorMetrics() {
  const rows = allVendors;
  vendorMetricTotal.textContent = vendorTotalCount || rows.length;
  vendorMetricReady.textContent = rows.filter(isRfxReady).length;
  vendorMetricMissingContact.textContent = rows.filter(hasMissingContact).length;
  vendorMetricDuplicates.textContent = rows.filter((row) => duplicateSignals(row, rows).length).length;
  vendorMetricWhatsapp.textContent = rows.filter((row) => row.whatsapp_phone || row.preferred_channel === "whatsapp").length;
}

function duplicateGroups(rows = allVendors) {
  const rowsById = new Map(rows.filter((vendor) => vendor.id).map((vendor) => [vendor.id, vendor]));
  const neighbors = new Map([...rowsById.keys()].map((id) => [id, new Set()]));

  [...rowsById.values()].forEach((vendor, index, source) => {
    source.slice(index + 1).forEach((candidate) => {
      const reasons = duplicateReasons(vendor, candidate);
      if (!reasons.length) return;
      neighbors.get(vendor.id)?.add(candidate.id);
      neighbors.get(candidate.id)?.add(vendor.id);
    });
  });

  const visited = new Set();
  return [...rowsById.keys()]
    .map((startId) => {
      if (visited.has(startId) || !(neighbors.get(startId)?.size)) return null;
      const queue = [startId];
      const memberIds = [];
      visited.add(startId);
      while (queue.length) {
        const id = queue.shift();
        if (!id) continue;
        memberIds.push(id);
        neighbors.get(id)?.forEach((neighborId) => {
          if (visited.has(neighborId)) return;
          visited.add(neighborId);
          queue.push(neighborId);
        });
      }

      const members = memberIds
        .map((id) => rowsById.get(id))
        .filter(Boolean)
        .sort((left, right) =>
          Number(vendorHasApolloSourceId(right)) - Number(vendorHasApolloSourceId(left))
          || duplicateQuoteEvidence(right) - duplicateQuoteEvidence(left)
          || duplicateHealthScore(right) - duplicateHealthScore(left)
          || String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || ""))
        );
      const primary = members[0];
      if (!primary) return null;
      const matches = members.slice(1).map((candidate) => ({
        vendor: candidate,
        reasons: duplicateReasons(primary, candidate)
      }));
      return {
        primary,
        matches,
        confidence: Math.min(100, Math.max(...matches.map((match) => duplicateConfidence(match.reasons.length ? match.reasons : ["Connected duplicate"]))))
      };
    })
    .filter(Boolean);
}

function vendorHasApolloSourceId(vendor) {
  return /(^|[^a-z0-9])source\s*id\s*:/i.test(String(vendor?.notes || ""));
}

function duplicateQuoteEvidence(vendor) {
  const metrics = rateMetrics(vendor);
  const bidMetrics = vendor?.bid_metrics && typeof vendor.bid_metrics === "object" ? vendor.bid_metrics : {};
  return numberValue(metrics.approved_rates) + numberValue(metrics.linked_rates) + numberValue(bidMetrics.quoted);
}

function duplicateWinnerReason(vendor) {
  if (vendorHasApolloSourceId(vendor)) return "Keep: Apollo Source ID";
  const quoteEvidence = duplicateQuoteEvidence(vendor);
  if (quoteEvidence > 0) return `Keep: ${quoteEvidence} linked quote signal${quoteEvidence === 1 ? "" : "s"}`;
  return `Keep: highest health ${Math.round(duplicateHealthScore(vendor))}/100`;
}

function duplicateHealthScore(vendor) {
  const actual = Number(vendor.health_score);
  if (Number.isFinite(actual)) return actual;
  let score = 0;
  if (vendor.vendor_name) score += 15;
  if (vendor.domain) score += 15;
  if (vendor.primary_email || vendor.whatsapp_phone) score += 25;
  if (vendor.preferred_channel) score += 8;
  if (vendor.coverage_notes) score += 18;
  if (Array.isArray(vendor.tags) && vendor.tags.length) score += 14;
  if (vendor.notes) score += 5;
  if (vendor.base_stage === "procurement") score += 4;
  if (["blocked", "inactive", "archived"].includes(String(vendor.status || "").toLowerCase())) score -= 18;
  return Math.max(0, Math.min(100, score));
}

function duplicateReasons(row, candidate) {
  const reasons = [];
  const domain = String(row.domain || "").toLowerCase();
  const emails = [row.primary_email, ...(Array.isArray(row.secondary_emails) ? row.secondary_emails : String(row.secondary_emails || "").split(/[;,|]/))]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  const candidateEmails = new Set([candidate.primary_email, ...(Array.isArray(candidate.secondary_emails) ? candidate.secondary_emails : String(candidate.secondary_emails || "").split(/[;,|]/))]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean));
  const nameKeys = [normalizeKey(row.vendor_name), normalizeKey(row.legal_name)].filter(Boolean);
  const candidateNameKeys = [normalizeKey(candidate.vendor_name), normalizeKey(candidate.legal_name)].filter(Boolean);

  if (domain && String(candidate.domain || "").toLowerCase() === domain) reasons.push("Same domain");
  if (emails.some((email) => candidateEmails.has(email))) reasons.push("Same email");
  if (nameKeys.some((nameKey) => candidateNameKeys.includes(nameKey))) reasons.push("Same name");
  else if (nameKeys.some((nameKey) => candidateNameKeys.some((candidateNameKey) => nameKey.includes(candidateNameKey) || candidateNameKey.includes(nameKey)))) reasons.push("Similar name");
  return reasons;
}

function duplicateConfidence(reasons) {
  if (reasons.includes("Same domain") && reasons.includes("Same email")) return 98;
  if (reasons.includes("Same domain")) return 92;
  if (reasons.includes("Same email")) return 90;
  if (reasons.includes("Similar name")) return 70;
  return 50;
}

function renderDuplicateReview() {
  const groups = duplicateGroups();

  if (!groups.length) {
    duplicateReviewList.innerHTML =
      '<div class="empty-state"><strong>No obvious duplicates</strong><span>Duplicate signals will appear here when names, domains, or emails overlap.</span></div>';
    return;
  }

  duplicateReviewList.innerHTML = groups
    .map(
      (group, groupIndex) => `
        <article class="duplicate-card">
          <div class="duplicate-heading">
            <strong>Duplicate set ${groupIndex + 1}</strong>
            <span>${group.matches.length + 1} vendors | ${group.confidence}% confidence</span>
          </div>
          ${[group.primary, ...group.matches.map((match) => match.vendor)]
            .map(
              (vendor, vendorIndex) => {
                const reasons = vendorIndex === 0 ? ["Reference record"] : group.matches.find((match) => match.vendor.id === vendor.id)?.reasons || [];
                return `
                <div class="duplicate-row">
                  <div>
                    <strong>${escapeHtml(vendor.vendor_name)}</strong>
                    <span>${escapeHtml([vendor.domain, vendor.primary_email, vendor.status].filter(Boolean).join(" | "))}</span>
                    <div class="duplicate-reasons">${vendorIndex === 0 ? `<span>${escapeHtml(duplicateWinnerReason(vendor))}</span>` : `<span>Duplicate profile: ${Math.round(duplicateHealthScore(vendor))}/100</span>`}${reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</div>
                  </div>
                  <div class="action-row">
                    <button class="small-button" type="button" data-duplicate-open="${escapeHtml(vendor.id)}">Open</button>
                    <button class="small-button secondary" type="button" data-duplicate-inactive="${escapeHtml(vendor.id)}">Mark inactive</button>
                  </div>
                </div>
              `;
              }
            )
            .join("")}
        </article>
      `
    )
    .join("");
}

function renderExactDuplicatePreview(result = exactDuplicateMergePreview) {
  if (!exactDuplicatePreview) return;
  if (!result) {
    exactDuplicatePreview.innerHTML = '<span class="muted-text">Run preview to calculate exact duplicate groups across the complete workspace.</span>';
    return;
  }
  const groups = numberValue(result.duplicate_groups);
  const duplicates = numberValue(result.duplicates_to_remove ?? result.duplicates_removed);
  const previewRows = Array.isArray(result.preview) ? result.preview.slice(0, 10) : [];
  exactDuplicatePreview.innerHTML = `
    <div class="duplicate-safe-summary">
      <strong>${escapeHtml(groups)} exact group${groups === 1 ? "" : "s"}</strong>
      <span>${escapeHtml(duplicates)} duplicate record${duplicates === 1 ? "" : "s"} will be merged and removed.</span>
      <span>Winner priority: Apollo Source ID, linked quotation evidence, then health.</span>
    </div>
    ${previewRows.length ? `<div class="duplicate-safe-samples">${previewRows.map((row) => `
      <span title="${escapeHtml(`${row.normalized_name || ""} | ${row.normalized_domain || ""}`)}">
        ${escapeHtml(row.canonical_vendor_name || row.normalized_name || "Vendor")} keeps ${escapeHtml(row.duplicates_removed || 0)} duplicate${numberValue(row.duplicates_removed) === 1 ? "" : "s"}
      </span>
    `).join("")}</div>` : ""}
  `;
}

async function previewExactVendorDuplicates() {
  if (exactDuplicateMergeRunning) return;
  exactDuplicateMergeRunning = true;
  exactDuplicateMergePreview = null;
  previewExactDuplicatesButton.disabled = true;
  consolidateExactDuplicatesButton.disabled = true;
  exactDuplicateStatus.textContent = "Checking exact duplicates and linked records...";
  try {
    await requirePrivatePage();
    exactDuplicateMergePreview = await consolidateExactVendorDuplicates({ dryRun: true, previewLimit: EXACT_VENDOR_CONSOLIDATION_BATCH_SIZE });
    renderExactDuplicatePreview();
    const duplicates = numberValue(exactDuplicateMergePreview.duplicates_to_remove);
    exactDuplicateStatus.textContent = duplicates
      ? "Preview ready. No records have been changed."
      : "No exact duplicates are eligible for automatic consolidation.";
    consolidateExactDuplicatesButton.disabled = duplicates === 0;
  } catch (error) {
    exactDuplicateStatus.textContent = humanizeError(error);
    renderExactDuplicatePreview(null);
  } finally {
    exactDuplicateMergeRunning = false;
    previewExactDuplicatesButton.disabled = false;
  }
}

async function applyExactVendorConsolidation() {
  const duplicateCount = numberValue(exactDuplicateMergePreview?.duplicates_to_remove);
  if (exactDuplicateMergeRunning || !duplicateCount) return;
  const confirmation = `Consolidate the next exact duplicate vendor record? ${duplicateCount} duplicate record${duplicateCount === 1 ? "" : "s"} remain in the workspace. This run processes one validated duplicate record only, preserves linked history, and is audited.`;
  if (!window.confirm(confirmation)) return;
  exactDuplicateMergeRunning = true;
  previewExactDuplicatesButton.disabled = true;
  consolidateExactDuplicatesButton.disabled = true;
  exactDuplicateStatus.textContent = "Consolidating exact duplicates and preserving linked history...";
  try {
    await requirePrivatePage();
    const result = await consolidateExactVendorDuplicates({
      dryRun: false,
      previewCount: duplicateCount,
      previewLimit: EXACT_VENDOR_CONSOLIDATION_BATCH_SIZE
    });
    const removed = numberValue(result.duplicates_removed);
    const groups = numberValue(result.duplicate_groups);
    const remainingDuplicates = numberValue(result.remaining_duplicates);
    if (removed === 0 || remainingDuplicates >= duplicateCount) {
      throw new Error("Duplicate consolidation made no progress. Run a fresh preview before retrying.");
    }
    exactDuplicateMergePreview = null;
    renderExactDuplicatePreview(null);
    exactDuplicateStatus.textContent = `${removed} duplicate vendor record${removed === 1 ? "" : "s"} consolidated from ${groups} exact group${groups === 1 ? "" : "s"}. ${remainingDuplicates} remain; run a fresh preview before the next record.`;
    await loadVendors({ force: true });
    if (activeVendorTab === "funnel") await loadVendorFunnel({ force: true });
    if (activeVendorTab === "intelligence") await loadVendorIntelligence({ force: true });
    renderDuplicateReview();
  } catch (error) {
    exactDuplicateStatus.textContent = humanizeError(error);
    consolidateExactDuplicatesButton.disabled = false;
  } finally {
    exactDuplicateMergeRunning = false;
    previewExactDuplicatesButton.disabled = false;
  }
}

function applyQuickFilter(filter) {
  renderVendorSavedViews("");
  activeQuickFilter = filter;
  vendorPageOffset = 0;
  persistVendorWorkspaceContext();
  quickFilterButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.quickFilter === filter));

  if (!["duplicates", "onboarding-gaps"].includes(filter)) {
    loadVendors();
    return;
  }

  const rows = allVendors.filter((row) => {
    if (filter === "duplicates") return duplicateSignals(row, allVendors).length > 0;
    if (filter === "onboarding-gaps") return vendorOnboardingGapLabels(row).length > 0;
    return true;
  });

  renderVendors(rows);
}

function resetQuickFilter() {
  activeQuickFilter = "all";
  vendorPageOffset = 0;
  persistVendorWorkspaceContext();
  quickFilterButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.quickFilter === "all"));
}

function readWizard() {
  const profile_data = {};
  const tags = splitTags(document.querySelector("#wizard-tags").value);
  const emails = splitVendorEmails(document.querySelector("#wizard-primary-email").value);
  return {
    vendor_name: document.querySelector("#wizard-vendor-name").value,
    legal_name: document.querySelector("#wizard-legal-name").value,
    domain: document.querySelector("#wizard-domain").value,
    logo_url: document.querySelector("#wizard-logo-url").value,
    contact_name: document.querySelector("#wizard-contact-name").value,
    ...emails,
    whatsapp_phone: document.querySelector("#wizard-whatsapp-phone").value,
    preferred_channel: document.querySelector("#wizard-preferred-channel").value,
    tags: Array.from(new Set([...tags, ...profileDerivedTags(profile_data)])),
    coverage_notes: document.querySelector("#wizard-coverage-notes").value,
    notes: document.querySelector("#wizard-notes").value,
    profile_data
  };
}

function renderWizard() {
  wizardStepButtons.forEach((button) => button.classList.toggle("is-active", Number(button.dataset.wizardStep) === wizardStep));
  wizardPanels.forEach((panel) => panel.classList.toggle("hidden", Number(panel.dataset.stepPanel) !== wizardStep));
  wizardBackButton.disabled = wizardStep === 0;
  wizardNextButton.classList.toggle("hidden", wizardStep === wizardPanels.length - 1);
  wizardSaveButton.classList.toggle("hidden", wizardStep !== wizardPanels.length - 1);

  if (wizardStep === wizardPanels.length - 1) {
    const vendor = readWizard();
    wizardReview.innerHTML = `
      <div><strong>${escapeHtml(vendor.vendor_name || "Unnamed vendor")}</strong><span>${escapeHtml(vendor.domain || "No domain")}</span></div>
      <div><strong>Contact</strong><span>${escapeHtml([vendor.contact_name, vendor.primary_email, vendor.whatsapp_phone].filter(Boolean).join(" | ") || "Missing contact")}</span></div>
      <div><strong>Coverage</strong><span>${escapeHtml(vendor.coverage_notes || "No coverage captured")}</span></div>
      <div><strong>Tags</strong><span>${renderTags(vendor.tags)}</span></div>
      <div><strong>Readiness</strong><span>${scoreVendor(vendor)}% complete</span></div>
    `;
  }
}

function resetWizard() {
  wizardForm.reset();
  wizardStep = 0;
  renderWizard();
}

function duplicateSignals(row, rows = currentVendors) {
  return rows
    .filter((candidate) => candidate.id !== row.id)
    .filter((candidate) => duplicateReasons(row, candidate).length)
    .map((candidate) => candidate.vendor_name);
}

function renderTags(tags) {
  const values = splitTags(tags);
  if (!values.length) return '<span class="muted-text">No tags</span>';
  const visible = values.slice(0, 6);
  const hidden = values.length - visible.length;
  return `${visible.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}${hidden > 0 ? `<span class="tag-chip muted">+${hidden}</span>` : ""}`;
}

function renderCompleteness(row) {
  return renderHealthSummary(row);
}

function renderVendorIdentity(row) {
  const duplicateCount = duplicateSignals(row, allVendors).length;
  const meta = [
    row.domain || "No domain",
    row.primary_email || row.whatsapp_phone || "Missing contact",
    row.coverage_notes ? "Coverage captured" : "No coverage"
  ];
  return `
    <div class="vendor-identity-cell">
      <div class="vendor-identity-main">
        ${renderVendorAvatar(row)}
        <div>
          <button class="link-button vendor-profile-button" type="button" data-vendor-id="${escapeHtml(row.id)}">
            ${escapeHtml(row.vendor_name || "Unnamed vendor")}
          </button>
          <div class="vendor-subline">${escapeHtml(meta.join(" | "))}</div>
        </div>
      </div>
      <div class="vendor-row-flags">
        ${duplicateCount ? `<span class="warning-pill">${escapeHtml(duplicateCount)} duplicate signal${duplicateCount === 1 ? "" : "s"}</span>` : ""}
        ${hasMissingContact(row) ? '<span class="warning-pill">Missing contact</span>' : ""}
        ${!row.coverage_notes ? '<span class="review-chip muted">No coverage</span>' : ""}
      </div>
    </div>
  `;
}

function renderVendorContact(row) {
  const parts = [
    row.contact_name,
    vendorEmailInputValue(row),
    row.whatsapp_phone
  ].filter(Boolean);
  return `
    <div class="vendor-contact-stack">
      <strong>${escapeHtml(parts[0] || "Missing contact")}</strong>
      <span>${escapeHtml(parts.slice(1).join(" | ") || row.primary_email || row.whatsapp_phone || "Add email or WhatsApp")}</span>
    </div>
  `;
}

function renderVendorCoverage(row) {
  return `
    <div class="vendor-coverage-cell">
      <span>${escapeHtml(row.coverage_notes || "No coverage captured")}</span>
      ${row.notes ? `<small>${escapeHtml(row.notes)}</small>` : ""}
    </div>
  `;
}

function renderVendorSourceCell(row) {
  return `
    <div class="vendor-source-cell">
      <span class="status-pill">${escapeHtml(row.source ? String(row.source).replace(/_/g, " ") : "manual")}</span>
      ${row.source_row_number ? `<small>row ${escapeHtml(row.source_row_number)}</small>` : ""}
    </div>
  `;
}

function renderBaseStagePill(row) {
  const stage = row.base_stage || "sourcing";
  return `<span class="status-pill ${stage === "archived" ? "muted" : ""}">${escapeHtml(baseStageLabel(stage))}</span>`;
}

function renderSignalChips(values, emptyLabel = "No signal") {
  const items = Array.isArray(values) ? values.filter(Boolean) : splitTags(values);
  if (!items.length) return `<span class="muted-text">${escapeHtml(emptyLabel)}</span>`;
  return items.map((item) => `<span class="tag-chip">${escapeHtml(String(item).replace(/-/g, " "))}</span>`).join("");
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function currencyValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(number);
}

function rateMetrics(row) {
  return row.rate_metrics || {};
}

function coverageAlignment(row) {
  return row.coverage_alignment || {};
}

function combinedVendorHealth(row) {
  const readiness = vendorReadiness(row);
  const hasServerScore = row.health_score !== undefined && row.health_score !== null && row.health_score !== "";
  const score = Math.max(0, Math.min(100, Math.round(hasServerScore ? numberValue(row.health_score) : readiness.score)));
  const label = row.health_label || readiness.label;
  // A missing profile is incomplete data, not an active incident. Keep red for
  // actionable failures and use a neutral tone for a not-started profile.
  const tone = score === 0 ? "neutral" : score >= 70 ? "strong" : score >= 35 ? "medium" : "weak";
  return { ...readiness, score, label, tone };
}

function compactList(values, limit = 3) {
  const items = Array.isArray(values) ? values.filter(Boolean) : splitTags(values);
  if (!items.length) return "";
  const visible = items.slice(0, limit);
  const hidden = items.length - visible.length;
  return `${visible.join(", ")}${hidden > 0 ? ` +${hidden}` : ""}`;
}

function healthFactors(row) {
  const readiness = vendorReadiness(row);
  const metrics = rateMetrics(row);
  const alignment = coverageAlignment(row);
  const factors = [`${readiness.score}% profile completeness`];
  const linked = numberValue(metrics.linked_rates);
  const approved = numberValue(metrics.approved_rates);
  const matched = alignment.matched || [];
  const quotedOnly = alignment.quoted_only || [];
  const declaredOnly = alignment.declared_only || [];
  if (linked) factors.push(`${linked} linked quote${linked === 1 ? "" : "s"}`);
  if (approved) factors.push(`${approved} approved Rateware row${approved === 1 ? "" : "s"}`);
  if (matched.length) factors.push(`${matched.length} matched coverage signal${matched.length === 1 ? "" : "s"}`);
  if (quotedOnly.length) factors.push(`${quotedOnly.length} quoted-only market signal${quotedOnly.length === 1 ? "" : "s"}`);
  if (declaredOnly.length) factors.push(`${declaredOnly.length} declared-only coverage signal${declaredOnly.length === 1 ? "" : "s"}`);
  if (numberValue(row.duplicate_count)) factors.push(`${numberValue(row.duplicate_count)} duplicate signal${numberValue(row.duplicate_count) === 1 ? "" : "s"}`);
  if (row.recommended_action) factors.push(row.recommended_action);
  return factors;
}

function renderHealthSummary(row, { compact = false } = {}) {
  const health = combinedVendorHealth(row);
  const detail = healthFactors(row).join(" | ");
  return `
    <div class="vendor-health-stack ${compact ? "compact" : ""}" title="${escapeHtml(detail)}">
      <div class="fit-stack">
        <span class="score-pill ${escapeHtml(health.tone)}">${escapeHtml(health.score)}%</span>
        <span class="fit-label">${escapeHtml(health.label)}</span>
      </div>
      <div class="health-meter ${escapeHtml(health.tone)}" aria-hidden="true"><span style="width:${escapeHtml(health.score)}%"></span></div>
    </div>
  `;
}

function renderQuoteSignals(row) {
  const metrics = rateMetrics(row);
  const linked = numberValue(metrics.linked_rates);
  const approved = numberValue(metrics.approved_rates);
  const avgAllIn = currencyValue(metrics.avg_all_in_rate);
  const markets = compactList(metrics.markets, 2);
  return `
    <div class="vendor-quote-cell" title="${escapeHtml([markets, compactList(metrics.equipment, 2), compactList(metrics.border_pairs, 2)].filter(Boolean).join(" | "))}">
      <strong>${escapeHtml(linked)} quoted</strong>
      <span>${escapeHtml(approved)} approved${avgAllIn !== "-" ? ` | avg ${escapeHtml(avgAllIn)}` : ""}</span>
    </div>
  `;
}

function renderCoverageFit(row) {
  const alignment = coverageAlignment(row);
  const matched = alignment.matched || [];
  const quotedOnly = alignment.quoted_only || [];
  const declaredOnly = alignment.declared_only || [];
  if (!matched.length && !quotedOnly.length && !declaredOnly.length) {
    return `<span class="muted-text">${escapeHtml(alignment.summary || "No coverage signal")}</span>`;
  }
  return `
    <div class="coverage-fit-cell" title="${escapeHtml(renderCoverageFitText(row))}">
      ${matched.length ? `<span class="score-pill strong">${escapeHtml(matched.length)} match</span>` : ""}
      ${quotedOnly.length ? `<span class="warning-pill">${escapeHtml(quotedOnly.length)} quoted only</span>` : ""}
      ${declaredOnly.length ? `<span class="status-pill">${escapeHtml(declaredOnly.length)} declared only</span>` : ""}
    </div>
  `;
}

function renderCoverageFitText(row) {
  const alignment = coverageAlignment(row);
  return [
    (alignment.matched || []).length ? `Matched: ${compactList(alignment.matched, 8)}` : "",
    (alignment.quoted_only || []).length ? `Quoted only: ${compactList(alignment.quoted_only, 8)}` : "",
    (alignment.declared_only || []).length ? `Declared only: ${compactList(alignment.declared_only, 8)}` : ""
  ].filter(Boolean).join(" | ") || alignment.summary || "No coverage signal";
}

function renderDrawerRatewareEvidence(vendor) {
  const metrics = rateMetrics(vendor);
  const health = combinedVendorHealth(vendor);
  const factors = healthFactors(vendor);
  return `
    <div class="drawer-rateware-evidence">
      <div class="drawer-evidence-grid">
        <article>
          <span>Linked quotes</span>
          <strong>${escapeHtml(numberValue(metrics.linked_rates))}</strong>
        </article>
        <article>
          <span>Approved rates</span>
          <strong>${escapeHtml(numberValue(metrics.approved_rates))}</strong>
        </article>
        <article>
          <span>Avg all-in</span>
          <strong>${escapeHtml(currencyValue(metrics.avg_all_in_rate))}</strong>
        </article>
        <article>
          <span>Health</span>
          <strong>${escapeHtml(health.score)}%</strong>
        </article>
      </div>
      <div class="health-explainer">
        ${factors.map((factor) => `<span>${escapeHtml(factor)}</span>`).join("")}
      </div>
      <div class="drawer-coverage-fit">
        <strong>Coverage fit</strong>
        ${renderCoverageDelta(vendor)}
      </div>
    </div>
  `;
}

function updateVendorIntelligenceSelectionState() {
  const count = selectedVisibleVendorIntelligenceIds().length;
  if (applyIntelligenceTagsButton) applyIntelligenceTagsButton.disabled = count === 0;
  if (promoteIntelligenceSelectedButton) promoteIntelligenceSelectedButton.disabled = count === 0;
}

function selectedVisibleVendorIntelligenceIds() {
  return currentVendorIntelligenceRows
    .filter((row) => selectedVendorIntelligenceIds.has(row.vendor_id))
    .map((row) => row.vendor_id)
    .filter(Boolean);
}

function vendorIntelligenceSearchText(row) {
  const metrics = rateMetrics(row);
  const alignment = coverageAlignment(row);
  return [
    row.vendor_name,
    row.domain,
    row.primary_email,
    row.base_stage,
    row.status,
    row.health_label,
    row.recommended_action,
    ...(row.tags || []),
    ...(row.declared_signals || []),
    ...(row.quoted_signals || []),
    ...(row.suggested_tags || []),
    ...(metrics.markets || []),
    ...(metrics.equipment || []),
    ...(metrics.border_pairs || []),
    ...(alignment.matched || []),
    ...(alignment.declared_only || []),
    ...(alignment.quoted_only || [])
  ].filter(Boolean).join(" ").toLowerCase();
}

function filteredVendorIntelligenceRows() {
  const filter = vendorIntelligenceFilter?.value || "all";
  const search = String(vendorIntelligenceSearch?.value || "").trim().toLowerCase();
  return vendorIntelligenceRows.filter((row) => {
    const metrics = rateMetrics(row);
    const alignment = coverageAlignment(row);
    const hasGap = (alignment.declared_only || []).length || (alignment.quoted_only || []).length;
    if (filter === "ready" && numberValue(row.health_score) < 85) return false;
    if (filter === "coverage-gap" && !hasGap) return false;
    if (filter === "duplicates" && !numberValue(row.duplicate_count)) return false;
    if (filter === "quoted" && !numberValue(metrics.linked_rates)) return false;
    if (filter === "needs-cleanup" && numberValue(row.health_score) >= 70) return false;
    if (search && !vendorIntelligenceSearchText(row).includes(search)) return false;
    return true;
  });
}

function renderCoverageDelta(row) {
  const alignment = coverageAlignment(row);
  const sections = [];
  if ((alignment.matched || []).length) sections.push(`<div><strong>Matched</strong><span>${renderSignalChips(alignment.matched)}</span></div>`);
  if ((alignment.quoted_only || []).length) sections.push(`<div><strong>Quoted only</strong><span>${renderSignalChips(alignment.quoted_only)}</span></div>`);
  if ((alignment.declared_only || []).length) sections.push(`<div><strong>Declared only</strong><span>${renderSignalChips(alignment.declared_only)}</span></div>`);
  return sections.length ? `<div class="coverage-delta">${sections.join("")}</div>` : `<span class="muted-text">${escapeHtml(alignment.summary || "No coverage signal")}</span>`;
}

function renderVendorIntelligenceSummary(summary = {}) {
  const loaded = summary.visible_vendors || summary.vendors || vendorIntelligenceRows.length || 0;
  const total = summary.total_vendors || vendorIntelligenceTotal || loaded;
  viTotal.textContent = total > loaded ? `${loaded}/${total}` : String(total || loaded);
  viReady.textContent = String(summary.procurement_ready || 0);
  viQuoted.textContent = String(summary.quoted || 0);
  viDuplicates.textContent = String(summary.duplicates || 0);
  viGaps.textContent = String(summary.coverage_gaps || 0);
}

function renderVendorIntelligence() {
  currentVendorIntelligenceRows = filteredVendorIntelligenceRows();
  updateVendorIntelligenceSelectionState();

  if (!currentVendorIntelligenceRows.length) {
    vendorIntelligenceBody.innerHTML =
      tableState(9, {
        tone: "neutral",
        eyebrow: "Vendor intelligence",
        title: "No carriers match this intelligence view",
        detail: "Adjust filters, refresh the analysis, or move more vendors into the active base before scoring.",
        actionButton: '<button class="secondary small-button" type="button" data-retry-action="refresh-vendor-intelligence">Refresh intelligence</button>'
      });
    return;
  }

  vendorIntelligenceBody.innerHTML = currentVendorIntelligenceRows
    .map((row) => {
      const metrics = rateMetrics(row);
      const health = combinedVendorHealth(row);
      return `
        <tr>
          <td><input class="vendor-intelligence-select" type="checkbox" data-vendor-intelligence-id="${escapeHtml(row.vendor_id)}" ${selectedVendorIntelligenceIds.has(row.vendor_id) ? "checked" : ""} /></td>
          <td>
            <button class="link-button vendor-intelligence-open" type="button" data-vendor-intelligence-open="${escapeHtml(row.vendor_name || "")}">
              ${escapeHtml(row.vendor_name || "Unnamed vendor")}
            </button>
            <div class="vendor-subline">${escapeHtml([row.domain, row.base_stage, row.status].filter(Boolean).join(" | "))}</div>
          </td>
          <td>
            <div class="fit-stack">
              <span class="score-pill ${escapeHtml(health.tone)}">${escapeHtml(health.score)}%</span>
              <span class="fit-label">${escapeHtml(health.label)}</span>
            </div>
          </td>
          <td><div class="tag-list">${renderSignalChips(row.declared_signals)}</div></td>
          <td><div class="tag-list">${renderSignalChips(row.quoted_signals)}</div></td>
          <td>${renderCoverageDelta(row)}</td>
          <td>
            <div class="vendor-signal-stack">
              <span>${escapeHtml(metrics.linked_rates || 0)} quoted / ${escapeHtml(metrics.approved_rates || 0)} approved</span>
              <span>${escapeHtml(metrics.d2d_import_export_rates || 0)} D2D | ${escapeHtml(metrics.crossborder_rates || 0)} cross-border</span>
              <span>Avg all-in ${escapeHtml(currencyValue(metrics.avg_all_in_rate))}</span>
            </div>
          </td>
          <td><div class="tag-list">${renderSignalChips(row.suggested_tags, "No new tags")}</div></td>
          <td>
            <div class="vendor-signal-stack">
              <strong>${escapeHtml(row.recommended_action || "Review")}</strong>
              ${numberValue(row.duplicate_count) ? `<span class="warning-pill">${escapeHtml(row.duplicate_count)} duplicate signal(s)</span>` : ""}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function loadedVendorIntelligenceSummary(sourceSummary = {}) {
  const rows = vendorIntelligenceRows;
  return {
    ...sourceSummary,
    vendors: rows.length,
    visible_vendors: rows.length,
    total_vendors: vendorIntelligenceTotal || sourceSummary.total_vendors || rows.length,
    procurement_ready: rows.filter((row) => numberValue(row.health_score) >= 85).length,
    duplicates: rows.filter((row) => numberValue(row.duplicate_count) > 0).length,
    quoted: rows.filter((row) => numberValue(rateMetrics(row).linked_rates) > 0).length,
    coverage_gaps: rows.filter((row) => {
      const alignment = coverageAlignment(row);
      return (alignment.declared_only || []).length || (alignment.quoted_only || []).length;
    }).length
  };
}

async function loadVendorIntelligence(options = {}) {
  const append = options?.append === true;
  const force = options?.force === true;
  const search = vendorIntelligenceSearch?.value || "";
  const offset = append ? vendorIntelligenceRows.length : 0;
  const requestKey = JSON.stringify({ append, offset, search });
  if (!force && vendorIntelligenceLoadRequest?.key === requestKey) {
    return vendorIntelligenceLoadRequest.promise;
  }

  const promise = loadVendorIntelligenceRequest({ append, search, offset });
  vendorIntelligenceLoadRequest = { key: requestKey, promise };
  try {
    return await promise;
  } finally {
    if (vendorIntelligenceLoadRequest?.promise === promise) vendorIntelligenceLoadRequest = null;
  }
}

async function loadVendorIntelligenceRequest({ append, search, offset }) {
  if (!vendorIntelligenceBody) return;
  const loadVersion = ++vendorIntelligenceLoadVersion;
  if (!append) {
    vendorIntelligenceBody.innerHTML = tableLoadingState(9, {
      title: "Analyzing carriers",
      detail: "Calculating health, quoted coverage, duplicate signals, and suggested tags."
    });
    vendorIntelligenceRows = [];
    vendorIntelligenceTotal = 0;
    vendorIntelligenceHasMore = false;
  }
  if (refreshVendorIntelligenceButton) refreshVendorIntelligenceButton.disabled = true;
  if (loadMoreVendorIntelligenceButton) loadMoreVendorIntelligenceButton.disabled = true;
  setStatus(vendorIntelligenceStatus, append ? "Loading more vendor intelligence..." : "Calculating vendor intelligence...");

  try {
    await requirePrivatePage();
    const result = await fetchVendorIntelligence({
      limit: vendorIntelligencePageSize,
      offset,
      search
    });
    if (loadVersion !== vendorIntelligenceLoadVersion) return;
    const nextRows = result.rows || [];
    vendorIntelligenceRows = append ? [...vendorIntelligenceRows, ...nextRows] : nextRows;
    vendorIntelligenceTotal = result.total || result.summary?.total_vendors || vendorIntelligenceRows.length;
    vendorIntelligenceHasMore = Boolean(result.has_more);
    vendorIntelligenceStale = false;
    if (!append) selectedVendorIntelligenceIds = new Set();
    renderVendorIntelligenceSummary(loadedVendorIntelligenceSummary(result.summary || {}));
    renderVendorIntelligence();
    const warning = Array.isArray(result.warnings) ? result.warnings.find(Boolean) : "";
    setStatus(
      vendorIntelligenceStatus,
      warning || `${vendorIntelligenceRows.length} of ${vendorIntelligenceTotal || vendorIntelligenceRows.length} vendor(s) analyzed.`,
      warning ? "warning" : "success"
    );
  } catch (error) {
    if (loadVersion !== vendorIntelligenceLoadVersion) return;
    vendorIntelligenceBody.innerHTML = tableErrorState(9, error, {
      title: "Vendor intelligence could not load",
      retryAction: "refresh-vendor-intelligence",
      meta: "The vendor directory is unchanged. This only affects the intelligence view."
    });
    setStatus(vendorIntelligenceStatus, humanizeError(error), "error");
  } finally {
    if (loadVersion !== vendorIntelligenceLoadVersion) return;
    if (refreshVendorIntelligenceButton) refreshVendorIntelligenceButton.disabled = false;
    if (loadMoreVendorIntelligenceButton) loadMoreVendorIntelligenceButton.disabled = !vendorIntelligenceHasMore;
  }
}

async function applySelectedIntelligenceTags() {
  const ids = selectedVisibleVendorIntelligenceIds();
  if (!ids.length) return;
  applyIntelligenceTagsButton.disabled = true;
  setStatus(vendorIntelligenceStatus, `Applying suggested tags to ${ids.length} vendor(s)...`);

  try {
    await requirePrivatePage();
    const result = await applyVendorIntelligenceTags(ids);
    const updatedById = new Map((result.rows || []).map((row) => [String(row.id), row]));
    (result.rows || []).forEach((row) => replaceVendorInState(row));
    vendorIntelligenceRows = vendorIntelligenceRows.map((row) => {
      const updated = updatedById.get(String(row.vendor_id || row.id));
      return updated ? { ...row, ...updated, vendor_id: row.vendor_id || updated.id, suggested_tags: [] } : row;
    });
    selectedVendorIntelligenceIds = new Set();
    renderVendorIntelligenceSummary(loadedVendorIntelligenceSummary());
    renderVendorIntelligence();
    setStatus(vendorIntelligenceStatus, `${result.updated || 0} vendor(s) enriched with suggested tags.`, "success");
  } catch (error) {
    setStatus(vendorIntelligenceStatus, humanizeError(error), "error");
  } finally {
    updateVendorIntelligenceSelectionState();
  }
}

async function promoteSelectedIntelligenceVendors() {
  const ids = selectedVisibleVendorIntelligenceIds();
  if (!ids.length) return;
  promoteIntelligenceSelectedButton.disabled = true;
  setStatus(vendorIntelligenceStatus, `Moving ${ids.length} vendor(s) to Procurement Base...`);

  try {
    await requirePrivatePage();
    const result = await bulkUpdateVendors(ids, { base_stage: "procurement", status: "active" });
    (result.rows || []).forEach((row) => {
      replaceVendorInState(row);
      applyVendorUpdateToFunnel(row, { render: false });
    });
    selectedVendorIntelligenceIds = new Set();
    setStatus(vendorIntelligenceStatus, `${result.updated || 0} vendor(s) moved to Procurement Base.`, "success");
    refreshVendorFunnelLocal({ resetLimits: true });
    resetQuickFilter();
    activateVendorTab("procurement");
  } catch (error) {
    setStatus(vendorIntelligenceStatus, humanizeError(error), "error");
  } finally {
    updateVendorIntelligenceSelectionState();
  }
}

function funnelSearchText(row) {
  return [
    row.vendor_name,
    row.legal_name,
    row.domain,
    row.primary_email,
    row.whatsapp_phone,
    row.coverage_notes,
    row.notes,
    splitTags(row.tags).join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function funnelRowMatchesHealth(row) {
  if (!vendorFunnelHealthValue) return true;
  const score = Number(row.health_score || vendorReadiness(row).score || 0);
  if (vendorFunnelHealthValue === "ready") return score >= 85;
  if (vendorFunnelHealthValue === "cleanup") return score >= 65 && score < 85;
  if (vendorFunnelHealthValue === "incomplete") return score < 65;
  return true;
}

function funnelRowMatchesQuotes(row) {
  if (!vendorFunnelQuoteValue) return true;
  const metrics = rateMetrics(row);
  const bidMetrics = row?.bid_metrics && typeof row.bid_metrics === "object" ? row.bid_metrics : {};
  const linked = numberValue(metrics.linked_rates) + numberValue(bidMetrics.quoted);
  const approved = numberValue(metrics.approved_rates);
  if (vendorFunnelQuoteValue === "linked") return linked > 0;
  if (vendorFunnelQuoteValue === "approved") return approved > 0;
  if (vendorFunnelQuoteValue === "missing") return linked === 0;
  return true;
}

function funnelRowKey(row, index = 0) {
  return String(row?.id || row?.vendor_id || row?.domain || row?.primary_email || `pipeline-row-${index}`);
}

function uniqueVendorFunnelRows(rows = []) {
  const uniqueRows = new Map();
  rows.forEach((row, index) => {
    const key = funnelRowKey(row, index);
    const existing = uniqueRows.get(key);
    if (!existing || funnelStageIndex(row?.effective_funnel_stage || row?.funnel_stage || "targeted") >= funnelStageIndex(existing?.effective_funnel_stage || existing?.funnel_stage || "targeted")) {
      uniqueRows.set(key, row);
    }
  });
  return Array.from(uniqueRows.values());
}

function filteredVendorFunnelRows() {
  const term = vendorFunnelSearchTerm.trim().toLowerCase();
  return uniqueVendorFunnelRows(vendorFunnelRows).filter((row) => {
    const matchesSearch = !term || funnelSearchText(row).includes(term);
    return matchesSearch && funnelRowMatchesHealth(row) && funnelRowMatchesQuotes(row);
  });
}

function funnelStageRows(stageKey, rows = filteredVendorFunnelRows()) {
  return rows.filter((row) => (row.effective_funnel_stage || row.funnel_stage || "targeted") === stageKey);
}

function resetVendorFunnelStageLimits() {
  vendorFunnelStageLimits = {};
}

function funnelStageLimit(stageKey) {
  return Number(vendorFunnelStageLimits[stageKey] || FUNNEL_STAGE_BATCH_SIZE);
}

function showMoreVendorFunnelStage(stageKey) {
  if (!stageKey) return;
  vendorFunnelStageLimits[stageKey] = funnelStageLimit(stageKey) + FUNNEL_STAGE_BATCH_SIZE;
  renderVendorFunnelStrip();
  renderVendorFunnelBoard();
  const visible = Math.min(funnelStageLimit(stageKey), funnelStageRows(stageKey).length);
  setStatus(vendorFunnelStatus, `${visible} ${stageLabel(stageKey)} vendor card(s) visible.`, "neutral");
}

function stageLabel(stageKey) {
  return (vendorFunnelStages.find((stage) => stage.key === stageKey) || DEFAULT_FUNNEL_STAGES.find((stage) => stage.key === stageKey))?.label || stageKey;
}

function funnelStages() {
  return vendorFunnelStages.length ? vendorFunnelStages : DEFAULT_FUNNEL_STAGES;
}

function funnelStageIndex(stageKey) {
  return Math.max(0, funnelStages().findIndex((stage) => stage.key === stageKey));
}

function relativeFunnelStage(stageKey, offset) {
  const stages = funnelStages();
  const index = stages.findIndex((stage) => stage.key === stageKey);
  const next = stages[index + offset];
  return next?.key || null;
}

function funnelStageSelectOptions(currentStage) {
  return funnelStages()
    .map((stage) => `<option value="${escapeHtml(stage.key)}" ${stage.key === currentStage ? "selected" : ""}>${escapeHtml(stage.label)}</option>`)
    .join("");
}

function renderVendorFunnelBulkOptions() {
  if (!vendorFunnelBulkStage) return;
  const current = vendorFunnelBulkStage.value;
  vendorFunnelBulkStage.innerHTML = [
    '<option value="">Choose stage</option>',
    ...funnelStages().map((stage) => `<option value="${escapeHtml(stage.key)}">${escapeHtml(stage.label)}</option>`)
  ].join("");
  if (current && funnelStages().some((stage) => stage.key === current)) {
    vendorFunnelBulkStage.value = current;
  }
}

function funnelStageAge(row) {
  const days = Number(row.stage_days);
  if (!Number.isFinite(days)) return "-";
  if (days === 0) return "today";
  return `${days}d`;
}

function funnelQuoteSignal(row) {
  const metrics = rateMetrics(row);
  const bidMetrics = row?.bid_metrics && typeof row.bid_metrics === "object" ? row.bid_metrics : {};
  const rateLinked = numberValue(metrics.linked_rates);
  const bidLinked = numberValue(bidMetrics.quoted);
  const linked = rateLinked + bidLinked;
  const approved = numberValue(metrics.approved_rates);
  const markets = Array.isArray(metrics.markets) ? metrics.markets.slice(0, 2).join(", ") : "";
  if (!linked) return "No linked quotes";
  const quoteSource = bidLinked ? ` | ${rateLinked} rateware + ${bidLinked} Bid Room` : "";
  return `${linked} linked / ${approved} approved${quoteSource}${markets ? ` | ${markets}` : ""}`;
}

function funnelStageRecommendation(row) {
  const stage = row.effective_funnel_stage || row.funnel_stage || "targeted";
  const metrics = rateMetrics(row);
  const bidMetrics = row?.bid_metrics && typeof row.bid_metrics === "object" ? row.bid_metrics : {};
  if (stage === "targeted" && (numberValue(metrics.linked_rates) > 0 || numberValue(bidMetrics.quoted) > 0)) return "Review quotes";
  if (stage === "targeted") return "Link first quote";
  if (stage === "nested") return "Draft onboarding";
  if (stage === "drafted") return row.primary_email ? "Send invite" : "Add contact";
  if (stage === "invited") return "Confirm registration";
  if (stage === "onboarded") return "Schedule TMS setup";
  if (stage === "trained") return "Activate carrier";
  if (stage === "activated") return "Complete legal pack";
  return "Maintain vendor";
}

function renderVendorFunnelMetrics(summary = {}) {
  if (vfTotal) vfTotal.textContent = String(summary.total || vendorFunnelRows.length || 0);
  if (vfActivationRate) vfActivationRate.textContent = `${summary.activation_rate || 0}%`;
  if (vfNested) vfNested.textContent = String(summary.quoted || summary.nested || 0);
  if (vfStuck) vfStuck.textContent = String(summary.stuck || 0);
}

function vendorFunnelSummaryFromRows(rows = vendorFunnelRows) {
  const canonicalRows = uniqueVendorFunnelRows(rows);
  const total = canonicalRows.length;
  const activeStages = new Set(["activated", "completed"]);
  const activated = canonicalRows.filter((row) => activeStages.has(row.effective_funnel_stage || row.funnel_stage)).length;
  const quoted = canonicalRows.filter((row) => {
    const bidMetrics = row?.bid_metrics && typeof row.bid_metrics === "object" ? row.bid_metrics : {};
    return numberValue(rateMetrics(row).linked_rates) > 0 || numberValue(bidMetrics.quoted) > 0;
  }).length;
  const stuck = canonicalRows.filter((row) => numberValue(row.stage_days) >= 14).length;
  return {
    total,
    activation_rate: total ? Math.round((activated / total) * 100) : 0,
    quoted,
    nested: funnelStageRows("nested", canonicalRows).length,
    stuck
  };
}

function refreshVendorFunnelLocal({ resetLimits = false } = {}) {
  if (resetLimits) resetVendorFunnelStageLimits();
  renderVendorFunnelMetrics(vendorFunnelSummaryFromRows());
  renderVendorFunnelStrip();
  renderVendorFunnelBoard();
}

function renderVendorFunnelStrip() {
  if (!vendorFunnelStrip) return;
  const filteredRows = filteredVendorFunnelRows();
  const stages = visibleFunnelStages(filteredRows);
  vendorFunnelStrip.style.setProperty("--funnel-stage-count", String(Math.max(1, stages.length)));
  vendorFunnelStrip.innerHTML = stages
    .map((stage) => {
      const rows = funnelStageRows(stage.key, filteredRows);
      const denominator = filteredRows.length || 1;
      const stageNumber = funnelStages().findIndex((item) => item.key === stage.key) + 1;
      return `
        <button class="funnel-stage-step ${stage.key === activeFunnelStage ? "is-active" : ""}" type="button" data-funnel-stage-filter="${escapeHtml(stage.key)}">
          <span>${escapeHtml(stageNumber)}</span>
          <strong>${escapeHtml(stage.label)}</strong>
          <small>${escapeHtml(rows.length)} vendors | ${escapeHtml(Math.round((rows.length / denominator) * 100))}%</small>
        </button>
      `;
    })
    .join("");
}

function visibleFunnelStages(filteredRows = filteredVendorFunnelRows()) {
  const stages = funnelStages();
  return vendorFunnelHideEmptyStages
    ? stages.filter((stage) => stage.key === activeFunnelStage || funnelStageRows(stage.key, filteredRows).length)
    : stages;
}

function renderVendorFunnelCard(row) {
  const readiness = combinedVendorHealth(row);
  const metrics = rateMetrics(row);
  const linked = numberValue(metrics.linked_rates);
  const approved = numberValue(metrics.approved_rates);
  const contact = row.domain || row.primary_email || row.whatsapp_phone || "No contact";
  const currentStage = row.effective_funnel_stage || row.funnel_stage || "targeted";
  const nextStep = funnelStageRecommendation(row);
  return `
    <article class="funnel-card" draggable="true" data-funnel-vendor-id="${escapeHtml(row.id || row.vendor_id)}">
      <div class="funnel-card-topline">
        <div class="funnel-card-vendor">
          ${renderVendorAvatar(row, "small")}
          <div>
            <strong>${escapeHtml(row.vendor_name || "Unnamed vendor")}</strong>
            <small>${escapeHtml(contact)}</small>
          </div>
        </div>
        <span class="score-pill ${escapeHtml(readiness.tone)}">${escapeHtml(readiness.score)}%</span>
      </div>
      <div class="funnel-card-signals">
        <span title="Linked quotes">${escapeHtml(linked)}Q</span>
        <span title="Approved rates">${escapeHtml(approved)}A</span>
        <span title="Time in stage">${escapeHtml(funnelStageAge(row))}</span>
      </div>
      <div class="funnel-card-recommendation" title="${escapeHtml(healthFactors(row).join(" | "))}">
        <strong>${escapeHtml(nextStep)}</strong>
        ${renderCoverageFit(row)}
      </div>
      <div class="funnel-card-actions">
        <button class="small-button secondary" type="button" data-funnel-open="${escapeHtml(row.id || row.vendor_id)}">Open</button>
        <select
          class="funnel-stage-select"
          data-funnel-stage-select
          data-funnel-vendor-id="${escapeHtml(row.id || row.vendor_id)}"
          data-funnel-current-stage="${escapeHtml(currentStage)}"
          aria-label="Move vendor to stage"
        >
          ${funnelStageSelectOptions(currentStage)}
        </select>
      </div>
    </article>
  `;
}

function renderVendorFunnelBoard() {
  if (!vendorFunnelBoard) return;
  const filteredRows = filteredVendorFunnelRows();
  if (!vendorFunnelRows.length) {
    vendorFunnelBoard.style.setProperty("--funnel-stage-count", "1");
    vendorFunnelBoard.innerHTML = '<div class="empty-state"><strong>No procurement funnel yet</strong><span>Move vendors from Sourcing Base into Procurement Base to start the funnel.</span></div>';
    return;
  }
  if (!filteredRows.length) {
    vendorFunnelBoard.style.setProperty("--funnel-stage-count", "1");
    vendorFunnelBoard.innerHTML = '<div class="empty-state"><strong>No vendors match these filters</strong><span>Clear pipeline filters or adjust the search.</span></div>';
    return;
  }
  const visibleStages = visibleFunnelStages(filteredRows);
  vendorFunnelBoard.style.setProperty("--funnel-stage-count", String(Math.max(1, visibleStages.length)));
  vendorFunnelBoard.innerHTML = visibleStages
    .map((stage) => {
      const rows = funnelStageRows(stage.key, filteredRows);
      const visibleRows = rows.slice(0, funnelStageLimit(stage.key));
      const hiddenRows = rows.length - visibleRows.length;
      return `
        <section class="funnel-column ${stage.key === activeFunnelStage ? "is-active-stage" : ""}" data-funnel-drop-stage="${escapeHtml(stage.key)}">
          <header>
            <div>
              <strong>${escapeHtml(stage.label)}</strong>
              <small>${escapeHtml(visibleRows.length)} visible of ${escapeHtml(rows.length)}</small>
            </div>
            <span title="Total vendors in ${escapeHtml(stage.label)}">${escapeHtml(rows.length)}</span>
          </header>
          <div class="funnel-card-stack">
            ${visibleRows.length ? visibleRows.map(renderVendorFunnelCard).join("") : '<div class="funnel-empty-column">Drop vendor here</div>'}
            ${hiddenRows > 0 ? `
              <button class="funnel-show-more" type="button" data-funnel-show-more="${escapeHtml(stage.key)}">
                Show ${escapeHtml(Math.min(FUNNEL_STAGE_BATCH_SIZE, hiddenRows))} more
                <span>${escapeHtml(hiddenRows)} remaining</span>
              </button>
            ` : ""}
          </div>
        </section>
      `;
    })
    .join("");
}

function focusVendorFunnelStage(stageKey = activeFunnelStage) {
  if (!vendorFunnelBoard || !stageKey) return false;
  const column = Array.from(vendorFunnelBoard.querySelectorAll("[data-funnel-drop-stage]"))
    .find((item) => item.dataset.funnelDropStage === stageKey);
  if (!column) return false;
  column.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  return true;
}

function setActiveFunnelStage(stageKey, { scroll = false } = {}) {
  if (!stageKey) return;
  activeFunnelStage = stageKey;
  persistVendorWorkspaceContext();
  renderVendorFunnelStrip();
  renderVendorFunnelBoard();
  if (scroll) {
    window.requestAnimationFrame(() => {
      const focused = focusVendorFunnelStage(stageKey);
      setStatus(
        vendorFunnelStatus,
        focused ? `Focused ${stageLabel(stageKey)} stage.` : `${stageLabel(stageKey)} stage has no visible column.`,
        focused ? "neutral" : "warning"
      );
    });
  }
}

function renderVendorFunnel(result = {}) {
  vendorFunnelStages = result.stages?.length ? result.stages : DEFAULT_FUNNEL_STAGES;
  vendorFunnelRows = (result.rows || []).map((row) => ({ ...row, id: row.id || row.vendor_id }));
  resetVendorFunnelStageLimits();
  if (!vendorFunnelStages.some((stage) => stage.key === activeFunnelStage)) activeFunnelStage = vendorFunnelStages[0]?.key || "targeted";
  persistVendorWorkspaceContext();
  renderVendorFunnelBulkOptions();
  renderVendorFunnelMetrics(result.summary || {});
  renderVendorFunnelStrip();
  renderVendorFunnelBoard();
}

function renderVendorFunnelFilters() {
  if (vendorFunnelSearch) vendorFunnelSearch.value = vendorFunnelSearchTerm;
  if (vendorFunnelHealthFilter) vendorFunnelHealthFilter.value = vendorFunnelHealthValue;
  if (vendorFunnelQuoteFilter) vendorFunnelQuoteFilter.value = vendorFunnelQuoteValue;
  if (vendorFunnelHideEmpty) vendorFunnelHideEmpty.checked = vendorFunnelHideEmptyStages;
  renderVendorFunnelBulkOptions();
}

function applyVendorFunnelFilters({ announce = true, resetLimits = true } = {}) {
  if (resetLimits) resetVendorFunnelStageLimits();
  renderVendorFunnelFilters();
  renderVendorFunnelStrip();
  renderVendorFunnelBoard();
  persistVendorWorkspaceContext();
  if (announce) {
    const visible = filteredVendorFunnelRows().length;
    setStatus(vendorFunnelStatus, `${visible} of ${vendorFunnelRows.length} procurement vendor(s) visible.`, "neutral");
  }
}

function clearVendorFunnelFilters() {
  vendorFunnelSearchTerm = "";
  vendorFunnelHealthValue = "";
  vendorFunnelQuoteValue = "";
  vendorFunnelHideEmptyStages = false;
  persistVendorWorkspaceContext();
  applyVendorFunnelFilters();
}

async function loadVendorFunnel({ force = false } = {}) {
  if (!force && vendorFunnelLoadRequest) return vendorFunnelLoadRequest;
  const promise = loadVendorFunnelRequest();
  vendorFunnelLoadRequest = promise;
  try {
    return await promise;
  } finally {
    if (vendorFunnelLoadRequest === promise) vendorFunnelLoadRequest = null;
  }
}

async function loadVendorFunnelRequest() {
  if (!vendorFunnelBoard) return;
  const loadVersion = ++vendorFunnelLoadVersion;
  if (refreshVendorFunnelButton) refreshVendorFunnelButton.disabled = true;
  vendorFunnelBoard.innerHTML = loadingState({
    title: "Loading procurement funnel",
    detail: "Reading Procurement Base, linked quotes, onboarding stages, and contact signals."
  });
  setStatus(vendorFunnelStatus, "Loading funnel...");

  try {
    await requirePrivatePage();
    const result = await fetchVendorFunnel();
    if (loadVersion !== vendorFunnelLoadVersion) return;
    renderVendorFunnel(result);
    renderVendorFunnelFilters();
    const warning = Array.isArray(result.warnings) ? result.warnings.find(Boolean) : "";
    setStatus(
      vendorFunnelStatus,
      warning || `${result.summary?.total || 0} procurement vendor(s) in funnel.`,
      warning ? "warning" : "success"
    );
  } catch (error) {
    if (loadVersion !== vendorFunnelLoadVersion) return;
    vendorFunnelBoard.innerHTML = errorState(error, {
      title: "Procurement funnel could not load",
      retryAction: "refresh-vendor-funnel",
      meta: "No vendor stages were changed."
    });
    setStatus(vendorFunnelStatus, humanizeError(error), "error");
  } finally {
    if (loadVersion !== vendorFunnelLoadVersion) return;
    if (refreshVendorFunnelButton) refreshVendorFunnelButton.disabled = false;
  }
}

function mergeVendorMatchErrors(stagingResult = {}, ratewareResult = {}) {
  const stagingErrors = (stagingResult.unmatched_errors || []).map((row) => ({ ...row, source_scope: "staging" }));
  const ratewareErrors = (ratewareResult.unmatched_errors || []).map((row) => ({ ...row, source_scope: "rateware" }));
  return [...stagingErrors, ...ratewareErrors];
}

function updateVendorMatchSummary(stagingResult = {}, ratewareResult = {}) {
  const errors = mergeVendorMatchErrors(stagingResult, ratewareResult);
  vendorMatchRows = errors;
  vendorMatchSummary = { staging: stagingResult, rateware: ratewareResult };

  if (vmStagingTotal) vmStagingTotal.textContent = numberLabel(stagingResult.matched);
  if (vmStagingMatchable) vmStagingMatchable.textContent = `${numberLabel(stagingResult.matchable)} matchable`;
  if (vmRatewareTotal) vmRatewareTotal.textContent = numberLabel(ratewareResult.matched);
  if (vmRatewareMatchable) vmRatewareMatchable.textContent = `${numberLabel(ratewareResult.matchable)} matchable`;
  if (vmUploadMatchable) vmUploadMatchable.textContent = numberLabel(Number(stagingResult.upload_matchable || 0) + Number(ratewareResult.upload_matchable || 0));
  if (vmErrorTotal) vmErrorTotal.textContent = numberLabel(errors.length);
  if (downloadVendorMatchErrorsButton) downloadVendorMatchErrorsButton.disabled = !errors.length;
}

function renderVendorMatchRows() {
  if (!vendorMatchBody) return;
  if (!vendorMatchRows.length) {
    vendorMatchBody.innerHTML = `
      <tr>
        <td colspan="6">No manual vendor corrections in the current queue.</td>
      </tr>
    `;
    return;
  }

  vendorMatchBody.innerHTML = vendorMatchRows
    .slice(0, 80)
    .map((row) => {
      const lane = [row.origin, row.destination].filter(Boolean).join(" -> ") || "-";
      return `
        <tr>
          <td><span class="status-pill">${escapeHtml(row.source_scope)}</span></td>
          <td>${escapeHtml(row.shipment_id || row.rate_row_id || "-")}</td>
          <td>${escapeHtml(row.rfx_id || "-")}</td>
          <td>${escapeHtml(lane)}</td>
          <td>${escapeHtml(row.detected_vendor_reference || row.current_vendor_domain || "-")}</td>
          <td>${escapeHtml(row.error_reason || "Needs manual correction")}</td>
        </tr>
      `;
    })
    .join("");
}

function setVendorMatchBusy(isBusy) {
  if (refreshVendorMatchButton) refreshVendorMatchButton.disabled = isBusy;
  if (matchStagingVendorsButton) matchStagingVendorsButton.disabled = isBusy;
  if (matchRatewareVendorsButton) matchRatewareVendorsButton.disabled = isBusy;
}

async function analyzeVendorMatchQueue({ force = false } = {}) {
  if (!force && vendorMatchLoadRequest) return vendorMatchLoadRequest;
  const promise = analyzeVendorMatchQueueRequest();
  vendorMatchLoadRequest = promise;
  try {
    return await promise;
  } finally {
    if (vendorMatchLoadRequest === promise) vendorMatchLoadRequest = null;
  }
}

async function analyzeVendorMatchQueueRequest() {
  if (!vendorMatchBody) return;
  setVendorMatchBusy(true);
  vendorMatchBody.innerHTML = tableLoadingState(6, {
    title: "Analyzing vendor match queue",
    detail: "Scanning staging and approved Rateware rows without vendor links."
  });
  setStatus(vendorMatchStatus, "Analyzing unmatched rates...");

  try {
    await requirePrivatePage();
    const [stagingResult, ratewareResult] = await Promise.all([
      matchVendorRateRowsByScope("staging", { dryRun: true }),
      matchVendorRateRowsByScope("rateware", { dryRun: true })
    ]);
    updateVendorMatchSummary(stagingResult, ratewareResult);
    renderVendorMatchRows();
    vendorMatchLoaded = true;
    setStatus(
      vendorMatchStatus,
      `${numberLabel(Number(stagingResult.matchable || 0) + Number(ratewareResult.matchable || 0))} rate row(s) can be auto-linked. ${numberLabel(vendorMatchRows.length)} need manual correction.`,
      "success"
    );
  } catch (error) {
    vendorMatchBody.innerHTML = tableErrorState(6, error, {
      title: "Vendor match queue could not load",
      retryAction: "refresh-vendor-match",
      meta: "No rate rows were changed."
    });
    setStatus(vendorMatchStatus, humanizeError(error), "error");
  } finally {
    setVendorMatchBusy(false);
  }
}

async function runVendorMatchScope(scope) {
  try {
    const current = vendorMatchSummary[scope] || {};
    let matched = Number(current.matched || 0);
    let matchable = Number(current.matchable || 0) + Number(current.upload_matchable || 0);
    if (!matched || !vendorMatchLoaded) {
      setStatus(vendorMatchStatus, `Counting ${scope} rows without vendor links...`);
      const preview = await matchVendorRateRowsByScope(scope, { dryRun: true });
      vendorMatchSummary[scope] = preview;
      matched = Number(preview.matched || 0);
      matchable = Number(preview.matchable || 0) + Number(preview.upload_matchable || 0);
    }

    if (!matched) {
      setStatus(vendorMatchStatus, `No ${scope} rows are missing vendor links.`, "warning");
      return;
    }
    if (!matchable) {
      setStatus(vendorMatchStatus, `No automatic ${scope} matches found. Download errors and correct vendor names/domains.`, "warning");
      return;
    }
    if (!window.confirm(`Match vendors for ${matched.toLocaleString()} ${scope} row(s)? Type corrections are not needed for rows with confident domain/name matches.`)) {
      setStatus(vendorMatchStatus, `${scope} vendor match cancelled.`, "warning");
      return;
    }

    setVendorMatchBusy(true);
    setStatus(vendorMatchStatus, `Matching ${scope} vendor links across the database...`);
    const result = await matchVendorRateRowsByScope(scope, { dryRun: false, maxRows: matched });
    const downloaded = downloadVendorMatchErrors(
      (result.unmatched_errors || []).map((row) => ({ ...row, source_scope: scope })),
      result.unmatched_errors_truncated
    );
    setStatus(
      vendorMatchStatus,
      `${numberLabel(result.updated)} ${scope} row(s) linked. ${numberLabel(result.upload_updated)} source upload(s) repaired.${downloaded ? " Error CSV downloaded." : ""}`,
      "success"
    );
    vendorMatchLoaded = false;
    await analyzeVendorMatchQueue();
  } catch (error) {
    setStatus(vendorMatchStatus, humanizeError(error), "error");
  } finally {
    setVendorMatchBusy(false);
  }
}

async function moveVendorFunnelStage(vendorId, stageKey) {
  if (!vendorId || !stageKey) return false;
  if (vendorFunnelMutationIds.has(vendorId)) return false;
  const stage = DEFAULT_FUNNEL_STAGES.find((item) => item.key === stageKey) || vendorFunnelStages.find((item) => item.key === stageKey);
  if (!stage) return false;
  vendorFunnelMutationIds.add(vendorId);
  setStatus(vendorFunnelStatus, `Moving vendor to ${stage.label}...`);
  try {
    await requirePrivatePage();
    const existing = findVendorById(vendorId) || {};
    const updated = await updateVendor(vendorId, { base_stage: "procurement", funnel_stage: stageKey });
    const nextRow = {
      ...existing,
      ...updated,
      base_stage: "procurement",
      funnel_stage: stageKey,
      effective_funnel_stage: stageKey,
      stage_days: 0
    };
    replaceVendorInState(nextRow);
    applyVendorUpdateToFunnel(nextRow);
    renderVendors(currentVendors);
    setStatus(vendorFunnelStatus, `Vendor moved to ${stage.label}.`, "success");
    return true;
  } catch (error) {
    setStatus(vendorFunnelStatus, humanizeError(error), "error");
    return false;
  } finally {
    vendorFunnelMutationIds.delete(vendorId);
  }
}

function setVendorFunnelBulkBusy(isBusy) {
  [vendorFunnelMoveStageButton, vendorFunnelAdvanceStageButton, vendorFunnelRegressStageButton, vendorFunnelBulkStage]
    .filter(Boolean)
    .forEach((control) => {
      control.disabled = isBusy;
    });
}

async function bulkMoveActiveFunnelStage(targetStage, actionLabel = "Move") {
  const sourceStage = activeFunnelStage || "targeted";
  const sourceRows = funnelStageRows(sourceStage);
  const ids = Array.from(new Set(sourceRows.map((row) => row.id || row.vendor_id).filter(Boolean)));
  if (!targetStage) {
    setStatus(vendorFunnelStatus, "Choose a target pipeline stage.", "error");
    return;
  }
  if (targetStage === sourceStage) {
    setStatus(vendorFunnelStatus, "Target stage is already active.", "warning");
    return;
  }
  if (!ids.length) {
    setStatus(vendorFunnelStatus, `No filtered vendors in ${stageLabel(sourceStage)}.`, "warning");
    return;
  }
  const message = `${actionLabel} ${ids.length} vendor(s) from ${stageLabel(sourceStage)} to ${stageLabel(targetStage)}? This applies to the active pipeline filters, including cards not currently visible.`;
  if (!window.confirm(message)) {
    setStatus(vendorFunnelStatus, "Pipeline bulk move cancelled.", "warning");
    return;
  }

  setVendorFunnelBulkBusy(true);
  setStatus(vendorFunnelStatus, `${actionLabel} ${ids.length} vendor(s) to ${stageLabel(targetStage)}...`);
  try {
    await requirePrivatePage();
    const result = await bulkUpdateVendors(ids, { base_stage: "procurement", funnel_stage: targetStage });
    applyBulkVendorPatchToState(ids, {
      base_stage: "procurement",
      funnel_stage: targetStage,
      effective_funnel_stage: targetStage,
      stage_days: 0
    });
    setStatus(vendorFunnelStatus, `${result.updated || 0} vendor(s) moved to ${stageLabel(targetStage)}.`, "success");
    activeFunnelStage = targetStage;
    refreshVendorFunnelLocal({ resetLimits: true });
    renderVendors(currentVendors);
    window.requestAnimationFrame(() => focusVendorFunnelStage(targetStage));
  } catch (error) {
    setStatus(vendorFunnelStatus, humanizeError(error), "error");
  } finally {
    setVendorFunnelBulkBusy(false);
  }
}

function renderVendorTableHeader() {
  const columns = visibleVendorColumns();
  vendorsHeadRow.closest("table")?.style.setProperty("--vendor-visible-columns", String(columns.length));
  vendorsHeadRow.innerHTML = columns.map((column) => `<th data-col="${escapeHtml(column.key)}" data-vendor-column="${escapeHtml(column.key)}">${escapeHtml(column.label)}</th>`).join("");
  renderVendorFilterRow(columns);
  vendorBaseContext.textContent = baseStageLabel();
}

function renderVendorColumnMenu() {
  if (!vendorColumnOptions) return;
  const visibleKeys = new Set(readVendorColumnKeys());
  vendorColumnOptions.innerHTML = VENDOR_SHEET_COLUMNS.map((column) => {
    const checked = column.locked || visibleKeys.has(column.key);
    return `
      <label class="vendor-column-option ${column.locked ? "is-locked" : ""}">
        <input
          type="checkbox"
          data-vendor-column-toggle="${escapeHtml(column.key)}"
          ${checked ? "checked" : ""}
          ${column.locked ? "disabled" : ""}
        />
        <span>${escapeHtml(column.label)}</span>
      </label>
    `;
  }).join("");
}

function setVendorColumnVisibility(key, shouldShow) {
  const column = VENDOR_SHEET_COLUMNS.find((item) => item.key === key);
  if (!column || column.locked) return;
  const keys = new Set(readVendorColumnKeys());
  if (shouldShow) keys.add(key);
  else keys.delete(key);
  saveVendorColumnKeys(Array.from(keys));
  renderVendorColumnMenu();
  renderVendorSavedViews("");
  renderVendors(currentVendors);
}

function filterCell(control) {
  return `<th>${control || ""}</th>`;
}

function renderVendorFilterRow(columns) {
  if (!vendorsFilterRow) return;
  const search = escapeHtml(searchInput.value || "");
  const coverage = escapeHtml(coverageFilter.value || "");
  const tag = escapeHtml(tagFilter.value || "");
  const status = escapeHtml(statusFilter.value || "");
  const channel = escapeHtml(channelFilter.value || "");
  const cells = columns.map((column) => {
    const key = column.key;
    if (key === "select") {
      return filterCell('<button class="sheet-filter-clear vendor-inline-clear" type="button" data-vendor-filter-clear>Clear</button>');
    }
    if (["vendor", "domain", "contact", "email", "whatsapp"].includes(key)) {
      return filterCell(`<input class="vendor-inline-filter" data-vendor-filter="search" value="${search}" placeholder="Search" />`);
    }
    if (key === "coverage") {
      return filterCell(`<input class="vendor-inline-filter" data-vendor-filter="coverage" value="${coverage}" placeholder="Market" />`);
    }
    if (key === "tags") {
      return filterCell(`<input class="vendor-inline-filter" data-vendor-filter="tag" value="${tag}" placeholder="Tag" />`);
    }
    if (["service_scope", "regional_coverage", "equipment_types", "certifications"].includes(key)) {
      return filterCell(`<input class="vendor-inline-filter" data-vendor-filter="tag" value="${tag}" placeholder="Signal" />`);
    }
    if (key === "channel") {
      return filterCell(`
        <select class="vendor-inline-filter" data-vendor-filter="channel">
          <option value="" ${channel ? "" : "selected"}>All</option>
          <option value="email" ${channel === "email" ? "selected" : ""}>Email</option>
          <option value="whatsapp" ${channel === "whatsapp" ? "selected" : ""}>WhatsApp</option>
          <option value="whatsapp_group" ${channel === "whatsapp_group" ? "selected" : ""}>WhatsApp group</option>
          <option value="multi" ${channel === "multi" ? "selected" : ""}>Email + WhatsApp</option>
          <option value="portal" ${channel === "portal" ? "selected" : ""}>Portal</option>
        </select>
      `);
    }
    if (key === "status") {
      return filterCell(`
        <select class="vendor-inline-filter" data-vendor-filter="status">
          <option value="" ${status ? "" : "selected"}>All</option>
          <option value="active" ${status === "active" ? "selected" : ""}>Active</option>
          <option value="invited" ${status === "invited" ? "selected" : ""}>Invited</option>
          <option value="blocked" ${status === "blocked" ? "selected" : ""}>Blocked</option>
          <option value="inactive" ${status === "inactive" ? "selected" : ""}>Inactive</option>
        </select>
      `);
    }
    return filterCell("");
  });
  vendorsFilterRow.innerHTML = cells.join("");
}

function editableVendorInput(row, field, { type = "text", wide = false, value: explicitValue = undefined, title = "" } = {}) {
  const value = explicitValue ?? (field === "tags" ? splitTags(row.tags).join(", ") : row[field] || "");
  return `
    <input
      class="vendor-cell-input ${wide ? "wide-input" : ""}"
      type="${escapeHtml(type)}"
      value="${escapeHtml(value)}"
      data-vendor-cell
      data-vendor-id="${escapeHtml(row.id)}"
      data-vendor-field="${escapeHtml(field)}"
      data-original-value="${escapeHtml(value)}"
      ${title ? `title="${escapeHtml(title)}"` : ""}
    />
  `;
}

function editableVendorSelect(row, field, options) {
  const current = row[field] || "";
  return `
    <select
      class="vendor-cell-input"
      data-vendor-cell
      data-vendor-id="${escapeHtml(row.id)}"
      data-vendor-field="${escapeHtml(field)}"
      data-original-value="${escapeHtml(current)}"
    >
      ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === current ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
    </select>
  `;
}

function profileColumnValue(row, sectionKey, fieldKey) {
  return profileScalarValue(profileFieldValue(vendorProfileData(row), sectionKey, fieldKey));
}

function editableVendorProfileInput(row, sectionKey, fieldKey, { wide = false } = {}) {
  const value = profileColumnValue(row, sectionKey, fieldKey);
  return `
    <input
      class="vendor-cell-input ${wide ? "wide-input" : ""}"
      type="text"
      value="${escapeHtml(value)}"
      data-vendor-cell
      data-vendor-id="${escapeHtml(row.id)}"
      data-vendor-field="profile_data.${escapeHtml(sectionKey)}.${escapeHtml(fieldKey)}"
      data-original-value="${escapeHtml(value)}"
      title="Use semicolons for multiple values"
    />
  `;
}

function editableVendorProfileSelect(row, sectionKey, fieldKey, options) {
  const current = profileColumnValue(row, sectionKey, fieldKey);
  const values = Array.from(new Set([...options, current].filter(Boolean)));
  return `
    <select
      class="vendor-cell-input"
      data-vendor-cell
      data-vendor-id="${escapeHtml(row.id)}"
      data-vendor-field="profile_data.${escapeHtml(sectionKey)}.${escapeHtml(fieldKey)}"
      data-original-value="${escapeHtml(current)}"
    >
      <option value=""></option>
      ${values.map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`).join("")}
    </select>
  `;
}

function vendorGridCell(columnKey, content, className = "") {
  const classAttribute = className ? ` class="${escapeHtml(className)}"` : "";
  return `<td data-col="${escapeHtml(columnKey)}"${classAttribute}>${content}</td>`;
}

function renderVendorSheetCell(row, columnKey) {
  if (columnKey === "select") {
    return vendorGridCell("select", `<input class="vendor-select" type="checkbox" data-vendor-id="${escapeHtml(row.id)}" ${selectedVendorIds.has(row.id) ? "checked" : ""} />`, "select-column");
  }
  if (columnKey === "vendor") {
    return vendorGridCell("vendor", `
        <div class="vendor-sheet-name-cell">
          <button class="vendor-logo-button" type="button" data-vendor-id="${escapeHtml(row.id)}" title="Open carrier profile">${renderVendorAvatar(row, "tiny")}</button>
          ${editableVendorInput(row, "vendor_name", { wide: true })}
        </div>
      `);
  }
  if (columnKey === "domain") return vendorGridCell("domain", editableVendorInput(row, "domain"));
  if (columnKey === "contact") return vendorGridCell("contact", editableVendorInput(row, "contact_name"));
  if (columnKey === "email") {
    return vendorGridCell("email", editableVendorInput(row, "primary_email", {
      value: vendorEmailInputValue(row),
      title: "Use comma, semicolon, or space for multiple emails. First email is primary."
    }));
  }
  if (columnKey === "whatsapp") return vendorGridCell("whatsapp", editableVendorInput(row, "whatsapp_phone"));
  if (columnKey === "health") return vendorGridCell("health", renderHealthSummary(row, { compact: true }));
  if (columnKey === "quotes") return vendorGridCell("quotes", renderQuoteSignals(row));
  if (columnKey === "coverage_delta") return vendorGridCell("coverage_delta", renderCoverageFit(row));
  if (columnKey === "tags") return vendorGridCell("tags", editableVendorInput(row, "tags", { wide: true }));
  if (columnKey === "onboarding") {
    const completion = onboardingCompletion(vendorProfileData(row));
    return vendorGridCell("onboarding", `<span class="score-pill ${completion.requiredFilled === completion.required ? "strong" : completion.filled ? "medium" : ""}">${completion.filled}/${completion.total}</span>`);
  }
  if (columnKey === "operating_country") {
    return vendorGridCell("operating_country", editableVendorProfileSelect(row, "general", "operating_country", ["Estados Unidos de America", "Mexico", "Canada"]));
  }
  if (columnKey === "service_scope") return vendorGridCell("service_scope", editableVendorProfileInput(row, "carrier_profile", "service_scope", { wide: true }));
  if (columnKey === "regional_coverage") return vendorGridCell("regional_coverage", editableVendorProfileInput(row, "carrier_profile", "regional_coverage", { wide: true }));
  if (columnKey === "equipment_types") return vendorGridCell("equipment_types", editableVendorProfileInput(row, "insurance_infrastructure", "equipment_types", { wide: true }));
  if (columnKey === "certifications") return vendorGridCell("certifications", editableVendorProfileInput(row, "carrier_profile", "certifications", { wide: true }));
  if (columnKey === "channel") {
    return vendorGridCell("channel", editableVendorSelect(row, "preferred_channel", [
      { value: "email", label: "Email" },
      { value: "whatsapp", label: "WhatsApp" },
      { value: "whatsapp_group", label: "WhatsApp group" },
      { value: "multi", label: "Email + WhatsApp" },
      { value: "portal", label: "Portal" }
    ]));
  }
  if (columnKey === "base") {
    return vendorGridCell("base", editableVendorSelect(row, "base_stage", [
      { value: "sourcing", label: "Sourcing" },
      { value: "procurement", label: "Procurement" },
      { value: "archived", label: "Archived" }
    ]));
  }
  if (columnKey === "status") {
    return vendorGridCell("status", editableVendorSelect(row, "status", [
      { value: "active", label: "Active" },
      { value: "invited", label: "Invited" },
      { value: "blocked", label: "Blocked" },
      { value: "inactive", label: "Inactive" }
    ]));
  }
  if (columnKey === "coverage") return vendorGridCell("coverage", editableVendorInput(row, "coverage_notes", { wide: true }));
  if (columnKey === "notes") return vendorGridCell("notes", editableVendorInput(row, "notes", { wide: true }));
  if (columnKey === "source") return vendorGridCell("source", renderVendorSourceCell(row));
  return vendorGridCell(columnKey, "");
}

function renderVendorSheetRow(row, columns = visibleVendorColumns()) {
  return `
    <tr class="${row.base_stage === "archived" ? "archived-vendor-row" : ""}" data-vendor-row-id="${escapeHtml(row.id)}">
      ${columns.map((column) => renderVendorSheetCell(row, column.key)).join("")}
    </tr>
  `;
}

function renderVendorCard(row) {
  const readiness = combinedVendorHealth(row);
  const duplicateCount = duplicateSignals(row, allVendors).length;
  const selected = selectedVendorIds.has(row.id);
  return `
    <article class="vendor-crm-card ${selected ? "is-selected" : ""}" data-vendor-card-id="${escapeHtml(row.id)}">
      <div class="vendor-card-top">
        ${renderVendorAvatar(row, "card")}
        <div>
          <button class="link-button vendor-profile-button" type="button" data-vendor-id="${escapeHtml(row.id)}">${escapeHtml(row.vendor_name || "Unnamed vendor")}</button>
          <span>${escapeHtml(row.domain || row.primary_email || row.whatsapp_phone || "Missing contact")}</span>
        </div>
        <input class="vendor-select" type="checkbox" data-vendor-id="${escapeHtml(row.id)}" ${selected ? "checked" : ""} />
      </div>
      <div class="vendor-card-meta">
        <span class="score-pill ${readiness.tone}">${readiness.score}%</span>
        <span class="status-pill">${escapeHtml(row.status || "active")}</span>
        <span class="status-pill ${row.base_stage === "archived" ? "muted" : ""}">${escapeHtml(baseStageLabel(row.base_stage))}</span>
      </div>
      <div class="vendor-card-meta">
        ${renderCoverageFit(row)}
      </div>
      ${renderQuoteSignals(row)}
      <p>${escapeHtml(row.coverage_notes || "No coverage captured")}</p>
      <div class="tag-list">${renderTags(row.tags)}</div>
      <div class="vendor-card-footer">
        <span>${escapeHtml([row.contact_name, vendorEmailInputValue(row), row.whatsapp_phone].filter(Boolean).join(" | ") || "Add contact")}</span>
        ${duplicateCount ? `<span class="warning-pill">${escapeHtml(duplicateCount)} duplicate</span>` : ""}
      </div>
    </article>
  `;
}

function renderVendorCards(rows) {
  if (!vendorCardGrid) return;
  vendorCardGrid.innerHTML = rows.length
    ? rows.map(renderVendorCard).join("")
    : '<div class="empty-state"><strong>No vendors in this view</strong><span>Adjust filters or import carrier records.</span></div>';
}

function readForm() {
  const profile_data = {};
  const tags = splitTags(document.querySelector("#vendor-tags").value);
  const emails = splitVendorEmails(document.querySelector("#primary-email").value);
  return {
    vendor_name: document.querySelector("#vendor-name").value,
    domain: document.querySelector("#vendor-domain").value,
    logo_url: document.querySelector("#vendor-logo-url").value,
    contact_name: document.querySelector("#contact-name").value,
    ...emails,
    whatsapp_phone: document.querySelector("#whatsapp-phone").value,
    preferred_channel: document.querySelector("#preferred-channel").value,
    tags: Array.from(new Set([...tags, ...profileDerivedTags(profile_data)])),
    coverage_notes: document.querySelector("#coverage-notes").value,
    notes: document.querySelector("#vendor-notes").value,
    profile_data
  };
}

function renderVendors(rows) {
  currentVendors = rows;
  renderVendorTableHeader();
  updateVendorMetrics();
  updateBulkState();
  renderSegments();
  const cardView = activeDirectoryView === "cards";
  vendorsTableWrap?.classList.toggle("hidden", cardView);
  vendorCardGrid?.classList.toggle("hidden", !cardView);
  if (activeVendorTab === "duplicates" || activeQuickFilter === "duplicates") renderDuplicateReview();

  if (!rows.length) {
    const emptyCopy =
      activeBaseStage === "procurement"
        ? ["No procurement targets yet", "Select carriers in Sourcing Base and send them to Procurement."]
        : activeBaseStage === "archived"
          ? ["No archived vendors", "Archived carriers will appear here when you remove them from active sourcing."]
          : ["No vendors yet", "Add a vendor manually or import your carrier list."];
    vendorsBody.innerHTML =
      tableState(vendorTableColumnCount(), {
        tone: "neutral",
        eyebrow: baseStageLabel(),
        title: emptyCopy[0],
        detail: emptyCopy[1],
        actionButton: activeBaseStage === "sourcing"
          ? '<button class="secondary small-button" type="button" data-vendor-tab-target="import">Import vendors</button>'
          : '<button class="secondary small-button" type="button" data-vendor-tab-target="sourcing">Open Sourcing Base</button>'
      });
    renderVendorCards(rows);
    syncCrmViewButtons();
    return;
  }

  renderVendorCards(rows);
  const columns = visibleVendorColumns();
  vendorsBody.innerHTML = rows
    .map((row) => renderVendorSheetRow(row, columns))
    .join("");
  syncCrmViewButtons();
}

function updatePaginationState() {
  const visibleCount = currentVendors.length;
  const start = vendorTotalCount && visibleCount ? vendorPageOffset + 1 : 0;
  const end = vendorTotalCount ? Math.min(vendorPageOffset + visibleCount, vendorTotalCount) : 0;
  vendorPageStatus.textContent = `Showing ${start}-${end} of ${vendorTotalCount}`;
  vendorPrevPageButton.disabled = vendorPageOffset <= 0;
  vendorNextPageButton.disabled = vendorPageOffset + vendorPageSize >= vendorTotalCount;
}

function resetVendorPageAndLoad() {
  vendorPageOffset = 0;
  persistVendorWorkspaceContext();
  clearVendorSelection();
  renderVendorSavedViews("");
  loadVendors();
}

function resetVendorWorkspace({ preserveBase = true } = {}) {
  const targetBaseStage = preserveBase ? activeBaseStage : "sourcing";
  searchInput.value = "";
  statusFilter.value = "";
  channelFilter.value = "";
  tagFilter.value = "";
  coverageFilter.value = "";
  bulkStatus.value = "";
  bulkBaseStage.value = "";
  bulkTags.value = "";
  activeQuickFilter = "all";
  vendorPageOffset = 0;
  selectedVendorIds = new Set();
  quickFilterButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.quickFilter === "all"));
  persistVendorWorkspaceContext();
  renderVendorSavedViews("");
  setStatus(bulkStatusMessage, "");
  drawer.classList.add("hidden");
  activateVendorTab(targetBaseStage);
}

function applyVendorInlineFilter(field, value) {
  if (field === "search") searchInput.value = value;
  if (field === "coverage") coverageFilter.value = value;
  if (field === "tag") tagFilter.value = value;
  if (field === "channel") channelFilter.value = value;
  if (field === "status") statusFilter.value = value;
  resetVendorPageAndLoad();
}

function vendorCellPatchValue(field, value) {
  if (field === "tags") return splitTags(value);
  return value;
}

function vendorCellPatch(field, value) {
  if (field === "primary_email") return splitVendorEmails(value);
  return { [field]: vendorCellPatchValue(field, value) };
}

function vendorProfileCellPatch(row, field, value) {
  const [, sectionKey, fieldKey] = field.split(".");
  if (!sectionKey || !fieldKey) return null;
  const profile = vendorProfileData(row);
  const nextProfile = { ...profile, [sectionKey]: { ...(profile[sectionKey] || {}) } };
  const fieldDefinition = profileFieldDefinition(sectionKey, fieldKey);
  const normalizedValue = fieldDefinition?.type === "checks" ? splitProfileList(value) : String(value || "").trim();
  if (Array.isArray(normalizedValue) ? normalizedValue.length : normalizedValue) {
    nextProfile[sectionKey][fieldKey] = normalizedValue;
  } else {
    delete nextProfile[sectionKey][fieldKey];
  }
  if (!Object.keys(nextProfile[sectionKey]).length) delete nextProfile[sectionKey];
  return {
    profile_data: nextProfile,
    tags: Array.from(new Set([...splitTags(row.tags), ...profileDerivedTags(nextProfile)]))
  };
}

async function saveVendorCell(control) {
  if (!control?.dataset?.vendorCell) return;
  const vendorId = control.dataset.vendorId;
  const field = control.dataset.vendorField;
  const rawValue = control.value;
  const original = control.dataset.originalValue || "";
  if (!vendorId || !field || rawValue === original) return;

  if (field === "primary_email") {
    const validationMessage = emailValidationMessage(rawValue);
    if (validationMessage) {
      control.classList.remove("is-saving", "is-saved");
      control.classList.add("is-error");
      setVendorGridStatus(validationMessage, "error");
      return;
    }
  }

  const saveKey = `${vendorId}:${field}`;
  const saveVersion = (vendorCellSaveVersions.get(saveKey) || 0) + 1;
  vendorCellSaveVersions.set(saveKey, saveVersion);

  control.classList.remove("is-saved", "is-error");
  control.classList.add("is-saving");
  const previousSave = vendorCellSaveQueues.get(saveKey) || Promise.resolve();
  const saveTask = previousSave.catch(() => {}).then(async () => {
    await requirePrivatePage();
    const current = findVendorById(vendorId) || {};
    const patch = field.startsWith("profile_data.")
      ? vendorProfileCellPatch(current, field, rawValue)
      : vendorCellPatch(field, rawValue);
    if (!patch) throw new Error("Unsupported vendor field.");
    const updated = await updateVendor(vendorId, patch);
    replaceVendorInState(updated);
    if (["base_stage", "status", "funnel_stage"].includes(field)) {
      applyVendorUpdateToFunnel(updated);
    }
    return updated;
  });
  vendorCellSaveQueues.set(saveKey, saveTask);

  try {
    const updated = await saveTask;
    if (vendorCellSaveVersions.get(saveKey) !== saveVersion) return;
    const storedValue = field === "primary_email"
      ? vendorEmailInputValue(updated)
      : field === "tags"
        ? splitTags(updated.tags).join(", ")
        : field.startsWith("profile_data.")
          ? profileColumnValue(updated, field.split(".")[1], field.split(".")[2])
          : updated[field] || "";
    if (control.isConnected) {
      control.value = storedValue;
      control.dataset.originalValue = storedValue;
      control.classList.remove("is-saving");
      control.classList.add("is-saved");
    }
    setVendorGridStatus("Cell saved.", "success");
    if (["base_stage", "status", "funnel_stage"].includes(field)) {
      renderVendors(currentVendors);
    }
  } catch (error) {
    if (vendorCellSaveVersions.get(saveKey) === saveVersion) {
      if (control.isConnected) {
        control.classList.remove("is-saving");
        control.classList.add("is-error");
      }
      setVendorGridStatus(humanizeError(error), "error");
    }
  } finally {
    if (vendorCellSaveQueues.get(saveKey) === saveTask) vendorCellSaveQueues.delete(saveKey);
  }
}

async function saveVendorGridRow(row) {
  if (!row) return;
  // Select controls already save from the delegated change handler. Text inputs
  // need an explicit save after paste, fill-down, or range editing.
  const controls = [...row.querySelectorAll("[data-vendor-cell]")].filter((control) => control.tagName !== "SELECT");
  for (const control of controls) await saveVendorCell(control);
}

function segmentMatches(segment, vendor) {
  const vendorTags = splitTags(vendor.tags);
  const requiredTags = splitTags(segment.tags);
  const hasTags = requiredTags.every((tag) => vendorTags.includes(tag));
  const hasStatus = !segment.status || vendor.status === segment.status;
  const hasChannel = !segment.preferred_channel || vendor.preferred_channel === segment.preferred_channel;
  const coverage = String(segment.coverage_filter || "").trim().toLowerCase();
  const coverageText = [
    vendor.coverage_notes,
    vendor.notes,
    ...(splitTags(vendor.tags)),
    ...Object.values(coverageAlignment(vendor)).flat().filter(Boolean),
    ...Object.values(rateMetrics(vendor)).flat().filter(Boolean)
  ].join(" ").toLowerCase();
  const hasCoverage = !coverage || coverageText.includes(coverage);
  return hasTags && hasStatus && hasChannel && hasCoverage;
}

function renderSegments() {
  if (!segmentsList) return;

  if (!savedSegments.length) {
    segmentsList.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Segments",
      title: "No saved segments yet",
      detail: "Create a reusable list from tags, status, channel, or coverage so outreach can move faster.",
      actionButton: '<button class="secondary small-button" type="button" data-vendor-tab-target="segments">Create segment</button>'
    });
    return;
  }

  segmentsList.innerHTML = savedSegments
    .map((segment) => {
      const matches = currentVendors.filter((vendor) => segmentMatches(segment, vendor));
      return `
        <article class="segment-card">
          <div>
            <strong>${escapeHtml(segment.segment_name)}</strong>
            <span>${matches.length} vendor(s)</span>
          </div>
          <div class="tag-list">${renderTags(segment.tags)}</div>
          <small>${escapeHtml([segment.status, segment.preferred_channel, segment.coverage_filter].filter(Boolean).join(" | ") || "Any active filter")}</small>
          <div class="action-row">
            <button class="small-button" type="button" data-segment-filter="${escapeHtml(segment.id)}">Apply</button>
            <button class="small-button danger" type="button" data-segment-delete="${escapeHtml(segment.id)}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadSegments() {
  try {
    savedSegments = await fetchVendorSegments();
    vendorSegmentsLoaded = true;
    renderSegments();
  } catch (error) {
    vendorSegmentsLoaded = false;
    segmentsList.innerHTML = errorState(error, {
      title: "Segments could not load",
      retryAction: "load-vendor-segments"
    });
  }
}

function ensureVendorSegmentsLoaded() {
  if (vendorSegmentsLoaded) {
    renderSegments();
    return Promise.resolve(savedSegments);
  }
  if (!vendorSegmentsLoadPromise) {
    vendorSegmentsLoadPromise = loadSegments().finally(() => {
      vendorSegmentsLoadPromise = null;
    });
  }
  return vendorSegmentsLoadPromise;
}

function vendorDirectoryQuery() {
  return {
    search: searchInput.value,
    status: statusFilter.value,
    base_stage: activeBaseStage,
    view: activeQuickFilter,
    channel: channelFilter.value,
    tag: tagFilter.value,
    coverage: coverageFilter.value,
    lightweight: true,
    limit: vendorPageSize,
    offset: vendorPageOffset
  };
}

async function loadVendors({ force = false } = {}) {
  const query = vendorDirectoryQuery();
  const requestKey = JSON.stringify(query);
  if (!force && vendorDirectoryLoadRequest?.key === requestKey) {
    return vendorDirectoryLoadRequest.promise;
  }

  const promise = loadVendorsRequest(query);
  vendorDirectoryLoadRequest = { key: requestKey, promise };
  try {
    return await promise;
  } finally {
    if (vendorDirectoryLoadRequest?.promise === promise) vendorDirectoryLoadRequest = null;
  }
}

async function loadVendorsRequest(query) {
  const loadVersion = ++vendorDirectoryLoadVersion;
  renderVendorTableHeader();
  vendorsBody.innerHTML = tableLoadingState(vendorTableColumnCount(), {
    title: `Loading ${baseStageLabel()}`,
    detail: "Reading carrier records, contact fields, tags, and coverage signals."
  });
  refreshButton.disabled = true;
  vendorPrevPageButton.disabled = true;
  vendorNextPageButton.disabled = true;

  try {
    await requirePrivatePage();
    const result = await fetchVendors(query);
    if (loadVersion !== vendorDirectoryLoadVersion) return;
    const rows = result.rows || [];
    vendorTotalCount = result.total ?? rows.length;
    if (!rows.length && vendorTotalCount > 0 && vendorPageOffset >= vendorTotalCount) {
      vendorPageOffset = Math.max(0, Math.floor((vendorTotalCount - 1) / vendorPageSize) * vendorPageSize);
      persistVendorWorkspaceContext();
      return loadVendors({ force: true });
    }
    allVendors = rows;
    if (["duplicates", "onboarding-gaps"].includes(activeQuickFilter)) {
      applyQuickFilter(activeQuickFilter);
    } else {
      renderVendors(rows);
    }
  } catch (error) {
    if (loadVersion !== vendorDirectoryLoadVersion) return;
    vendorsBody.innerHTML = tableErrorState(vendorTableColumnCount(), error, {
      title: `${baseStageLabel()} could not load`,
      retryAction: "load-vendors",
      meta: "Vendor records were not changed."
    });
    vendorTotalCount = 0;
  } finally {
    if (loadVersion !== vendorDirectoryLoadVersion) return;
    refreshButton.disabled = false;
    updatePaginationState();
  }
}

function readSegmentForm() {
  return {
    segment_name: document.querySelector("#segment-name").value,
    tags: splitTags(document.querySelector("#segment-tags").value),
    status: document.querySelector("#segment-status").value,
    preferred_channel: document.querySelector("#segment-channel").value,
    coverage_filter: document.querySelector("#segment-coverage").value
  };
}

function normalizeImportedRow(row, index = 0) {
  const profile_data = readImportedProfileData(row);
  const emails = splitVendorEmails([
    row.primary_email,
    row.email,
    row["Email"],
    row["Primary Email"],
    row.secondary_emails,
    row["Secondary Emails"]
  ].filter(Boolean).join("; "));
  return {
    source_row_number: row.source_row_number || row.row_number || row.Row || row.row || index + 2,
    id: row.id || row.vendor_id || row["Vendor ID"],
    vendor_id: row.vendor_id || row.id || row["Vendor ID"],
    vendor_name: row.vendor_name || row.vendor || row.carrier || row.name || row["Vendor"] || row["Carrier"],
    legal_name: row.legal_name || row["Legal Name"],
    domain: row.domain || row.vendor_domain || row["Domain"],
    contact_name: row.contact_name || row.contact || row["Contact"],
    ...emails,
    whatsapp_phone: row.whatsapp_phone || row.whatsapp || row.phone || row["WhatsApp"] || row["Phone"],
    preferred_channel: row.preferred_channel || row.channel || row["Channel"],
    whatsapp_permission_basis: row.whatsapp_permission_basis || row["WhatsApp Permission"] || row["Whatsapp Permission"],
    whatsapp_do_not_contact: row.whatsapp_do_not_contact || row.do_not_contact_whatsapp || row["WhatsApp Do Not Contact"] || row["Whatsapp Do Not Contact"],
    whatsapp_opt_in_status: row.whatsapp_opt_in_status || row["WhatsApp Opt In"] || row["Whatsapp Opt In"],
    whatsapp_group_name: row.whatsapp_group_name || row.group_name || row["WhatsApp Group Name"] || row["Whatsapp Group Name"],
    whatsapp_group_url: row.whatsapp_group_url || row.group_url || row["WhatsApp Group URL"] || row["Whatsapp Group URL"],
    whatsapp_meta_group_id: row.whatsapp_meta_group_id || row.meta_group_id || row["WhatsApp Meta Group ID"] || row["Whatsapp Meta Group ID"],
    whatsapp_group_status: row.whatsapp_group_status || row.group_status || row["WhatsApp Group Status"] || row["Whatsapp Group Status"],
    whatsapp_notes: row.whatsapp_notes || row["WhatsApp Notes"] || row["Whatsapp Notes"],
    logo_url: row.logo_url || row.logo || row.image_url || row["Logo URL"] || row["Logo"] || row["Image URL"],
    tags: Array.from(new Set([...splitTags(row.tags || row.tag || row.services || row.equipment || row.coverage || row["Tags"] || row["Equipment"]), ...profileDerivedTags(profile_data)])),
    coverage_notes: row.coverage_notes || row.coverage || row.lanes || row["Coverage"] || row["Lanes"],
    notes: row.notes || row["Notes"],
    base_stage: row.base_stage || row.base || row["Base"] || row["Stage"],
    profile_data
  };
}

function renderImportPreview() {
  const total = pendingImportRows.length;
  const validRows = validImportRows();
  const duplicateCount = pendingImportRows.filter((row) => duplicateSignals(row).length).length;
  const incompleteCount = pendingImportRows.filter((row) => importIssues(row).some((issue) => !issue.includes("duplicate"))).length;
  setVendorImportStep("review");

  importPreviewSummary.innerHTML = `
    <article><strong>${total}</strong><span>Total rows</span></article>
    <article><strong>${validRows.length}</strong><span>Ready to import</span></article>
    <article><strong>${duplicateCount}</strong><span>Duplicate signals</span></article>
    <article><strong>${incompleteCount}</strong><span>Needs cleanup</span></article>
  `;

  importPreviewBody.innerHTML = pendingImportRows
    .slice(0, 50)
    .map((row, index) => {
      const issues = importIssues(row);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(row.vendor_name)}</td>
          <td>${escapeHtml(row.primary_email)}</td>
          <td>${escapeHtml(row.domain)}</td>
          <td><div class="tag-list">${renderTags(row.tags)}</div></td>
          <td>${issues.length ? issues.map((issue) => `<span class="warning-pill">${escapeHtml(issue)}</span>`).join(" ") : '<span class="score-pill strong">Ready</span>'}</td>
        </tr>
      `;
    })
    .join("");

  if (!pendingImportRows.length) {
    importPreviewBody.innerHTML = '<tr><td colspan="6">No rows found.</td></tr>';
  }

  confirmImportButton.disabled = !validRows.length;
  importPreviewPanel.classList.remove("hidden");
  activateVendorTab("import");
}

function setDrawerValue(selector, value) {
  document.querySelector(selector).innerHTML = value || '<span class="muted-text">Not captured</span>';
}

function vendorProfileData(vendor = {}) {
  const value = vendor.profile_data;
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function profileFieldValue(profile, sectionKey, fieldKey) {
  const section = profile?.[sectionKey];
  return section && typeof section === "object" && !Array.isArray(section) ? section[fieldKey] : undefined;
}

function profileArrayValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function profileScalarValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value ?? "").trim();
}

function profileHasValue(value, field) {
  return field.type === "checks" ? profileArrayValue(value).length > 0 : Boolean(profileScalarValue(value));
}

function onboardingCompletion(profile) {
  const fields = VENDOR_ONBOARDING_SECTIONS.flatMap((section) => section.fields.map((field) => ({ ...field, section: section.key })));
  const filled = fields.filter((field) => profileHasValue(profileFieldValue(profile, field.section, field.key), field)).length;
  const required = fields.filter((field) => field.required);
  const requiredFilled = required.filter((field) => profileHasValue(profileFieldValue(profile, field.section, field.key), field)).length;
  return { total: fields.length, filled, required: required.length, requiredFilled };
}

function vendorOnboardingGapLabels(vendor = {}) {
  const profile = vendorProfileData(vendor);
  const gaps = [];
  if (!vendor.vendor_name) gaps.push("Vendor name");
  if (!vendor.domain) gaps.push("Domain");
  if (!vendor.primary_email && !vendor.whatsapp_phone && !profileFieldValue(profile, "general", "mobile_number")) gaps.push("Contact channel");
  if (!profileFieldValue(profile, "general", "operating_country")) gaps.push("Operating country");
  const hasLegalIdentity = Boolean(
    vendor.legal_name
    || profileFieldValue(profile, "mexico", "legal_name")
    || profileFieldValue(profile, "mexico", "rfc")
    || profileFieldValue(profile, "international", "legal_name")
    || profileFieldValue(profile, "international", "usdot_number")
    || profileFieldValue(profile, "international", "mc_number")
  );
  if (!hasLegalIdentity) gaps.push("Legal identity");
  if (!profileHasValue(profileFieldValue(profile, "carrier_profile", "geographic_scope"), { type: "checks" })) gaps.push("Geographic scope");
  if (!profileHasValue(profileFieldValue(profile, "carrier_profile", "service_scope"), { type: "checks" })) gaps.push("Service scope");
  if (!profileHasValue(profileFieldValue(profile, "carrier_profile", "regional_coverage"), { type: "checks" })) gaps.push("Regional coverage");
  if (!profileHasValue(profileFieldValue(profile, "insurance_infrastructure", "equipment_types"), { type: "checks" })) gaps.push("Equipment");
  if (!profileHasValue(profileFieldValue(profile, "insurance_infrastructure", "coverage_amounts"), { type: "textarea" })) gaps.push("Insurance coverage");
  return gaps;
}

function renderProfileValue(value, field) {
  if (field.type === "checks") {
    const values = profileArrayValue(value);
    if (!values.length) return "";
    const visible = values.slice(0, 5).map((item) => `<span class="tag-chip" title="${escapeHtml(item)}">${escapeHtml(item)}</span>`).join("");
    const extra = values.length > 5 ? `<span class="status-pill">+${values.length - 5}</span>` : "";
    return `<div class="tag-list compact-tags">${visible}${extra}</div>`;
  }
  return escapeHtml(profileScalarValue(value));
}

function renderOnboardingProfile(vendor) {
  const profile = vendorProfileData(vendor);
  const completion = onboardingCompletion(profile);
  if (!completion.filled) {
    return `
      <div class="empty-state compact-empty">
        <strong>No onboarding profile captured</strong>
        <span>Use Edit profile to capture identity, coverage, equipment, insurance, and key contacts.</span>
      </div>
    `;
  }

  const sections = VENDOR_ONBOARDING_SECTIONS.map((section) => {
    const rows = section.fields
      .map((field) => {
        const value = profileFieldValue(profile, section.key, field.key);
        if (!profileHasValue(value, field)) return "";
        return `
          <div>
            <dt>${escapeHtml(field.label)}</dt>
            <dd>${renderProfileValue(value, field)}</dd>
          </div>
        `;
      })
      .filter(Boolean)
      .join("");
    if (!rows) return "";
    return `
      <details class="vendor-profile-section" ${section.key === "carrier_profile" || section.key === "general" ? "open" : ""}>
        <summary>${escapeHtml(section.label)}</summary>
        <dl class="vendor-profile-list">${rows}</dl>
      </details>
    `;
  }).join("");

  return `
    <div class="onboarding-progress">
      <span class="score-pill strong">${completion.filled}/${completion.total} fields</span>
      <span>${completion.requiredFilled}/${completion.required} required fields</span>
    </div>
    ${sections}
  `;
}

function renderProfileInput(section, field, value) {
  const common = `data-profile-input data-profile-section="${escapeHtml(section.key)}" data-profile-field="${escapeHtml(field.key)}"`;
  const required = field.required ? ' <span aria-hidden="true">*</span>' : "";
  if (field.type === "textarea") {
    return `
      <label class="profile-field profile-field-wide">
        ${escapeHtml(field.label)}${required}
        <textarea ${common} rows="2">${escapeHtml(profileScalarValue(value))}</textarea>
      </label>
    `;
  }
  if (field.type === "select") {
    const current = profileScalarValue(value);
    const options = Array.from(new Set([...(field.options || []), current].filter(Boolean)));
    return `
      <label class="profile-field">
        ${escapeHtml(field.label)}${required}
        <select ${common}>
          <option value=""></option>
          ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === current ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
      </label>
    `;
  }
  if (field.type === "checks") {
    const selected = new Set(profileArrayValue(value));
    return `
      <details class="profile-checklist">
        <summary>
          <span>${escapeHtml(field.label)}${required}</span>
          <strong>${selected.size} selected</strong>
        </summary>
        <div class="profile-check-options">
          ${(field.options || []).map((option) => `
            <label class="profile-check-option">
              <input type="checkbox" data-profile-check data-profile-section="${escapeHtml(section.key)}" data-profile-field="${escapeHtml(field.key)}" value="${escapeHtml(option)}" ${selected.has(option) ? "checked" : ""} />
              <span>${escapeHtml(option)}</span>
            </label>
          `).join("")}
        </div>
      </details>
    `;
  }
  return `
    <label class="profile-field">
      ${escapeHtml(field.label)}${required}
      <input ${common} value="${escapeHtml(profileScalarValue(value))}" />
    </label>
  `;
}

function renderOnboardingEditor(vendor) {
  if (!drawerProfileFields) return;
  const profile = vendorProfileData(vendor);
  drawerProfileFields.innerHTML = VENDOR_ONBOARDING_SECTIONS.map((section) => `
    <details class="drawer-profile-section" ${["general", "carrier_profile"].includes(section.key) ? "open" : ""}>
      <summary>${escapeHtml(section.label)}</summary>
      <div class="drawer-profile-grid">
        ${section.fields.map((field) => renderProfileInput(section, field, profileFieldValue(profile, section.key, field.key))).join("")}
      </div>
    </details>
  `).join("");
}

function readDrawerProfileData() {
  const base = vendorProfileData(findVendorById(activeDrawerVendorId) || {});
  const known = {};
  VENDOR_ONBOARDING_SECTIONS.forEach((section) => {
    const sectionValues = {};
    section.fields.forEach((field) => {
      if (field.type === "checks") {
        const values = Array.from(drawerProfileFields?.querySelectorAll(`[data-profile-check][data-profile-section="${section.key}"][data-profile-field="${field.key}"]:checked`) || [])
          .map((input) => input.value)
          .filter(Boolean);
        if (values.length) sectionValues[field.key] = values;
        return;
      }
      const input = drawerProfileFields?.querySelector(`[data-profile-input][data-profile-section="${section.key}"][data-profile-field="${field.key}"]`);
      const value = input ? String(input.value || "").trim() : "";
      if (value) sectionValues[field.key] = value;
    });
    known[section.key] = sectionValues;
  });

  const next = { ...base };
  VENDOR_ONBOARDING_SECTIONS.forEach((section) => {
    if (Object.keys(known[section.key]).length) {
      next[section.key] = known[section.key];
    } else {
      delete next[section.key];
    }
  });
  return next;
}

function profileText(profile) {
  const values = [];
  VENDOR_ONBOARDING_SECTIONS.forEach((section) => {
    section.fields.forEach((field) => {
      const value = profileFieldValue(profile, section.key, field.key);
      if (Array.isArray(value)) values.push(...value);
      else if (value) values.push(value);
    });
  });
  return values.join(" ").toLowerCase();
}

function profileDerivedTags(vendorOrProfile = {}) {
  const profile = vendorOrProfile.profile_data ? vendorProfileData(vendorOrProfile) : vendorOrProfile;
  const text = profileText(profile);
  const rules = [
    ["mx", /mexico|mex\b/],
    ["us", /estados unidos|united states|\bus\b|\busa\b/],
    ["canada", /canada|\bca\b/],
    ["cross-border", /transfronteriz|cross.?border|door 2 door|d2d|b1|doble placa/],
    ["d2d", /door 2 door|d2d|b1|doble placa/],
    ["border", /fronteriz|frontera|laredo|pharr|nogales|eagle pass|brownsville|el paso|calexico/],
    ["domestic-mx", /domesticos mex|domestico mex|domestic mex/],
    ["regional-mx", /regionales mex|regional mex/],
    ["local-mx", /locales mex|local mex/],
    ["transfer", /transfer|cruces internacionales/],
    ["power-only", /power only|arrastre/],
    ["team-driver", /team driver|doble operador/],
    ["hot-shot", /hot shots|expeditad/],
    ["cross-dock", /cross dock|transbordo/],
    ["warehousing", /warehousing|almacenaje/],
    ["cargo-insurance", /cargo insurance|seguro de carga/],
    ["drop-hook", /drop\s*&\s*hook|quitapon|carrusel/],
    ["heavy-haul", /over-heavy|sobredimension|sobrepeso|lowboys|stepdecks|multi-axles/],
    ["dry-van", /dry van|caja seca/],
    ["reefer", /reefer|refrigerad/],
    ["flatbed", /flatbed|plana|plataforma/],
    ["hazmat", /hazmat|hazardous/],
    ["ctpat", /ctpat/],
    ["fast", /\bfast\b/],
    ["bonded", /bonded/],
    ["smartway", /smartway/],
    ["oea", /\boea\b/],
    ["gps", /gps|cuenta espejo/],
    ["tms", /tms|gestion de flotillas|gesti[oó]n de flotillas|sistema de gestion/],
    ["auction-platforms", /dat|truckstop|fr8app|cargado|rxo/],
    ["automotive", /automotriz|aeroespacial/],
    ["24-7-monitoring", /24\/7|monitoreo/]
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

function renderDrawerBadges(vendor) {
  const badges = [
    vendor.base_stage || "sourcing",
    vendor.effective_funnel_stage ? `funnel: ${stageLabel(vendor.effective_funnel_stage)}` : null,
    vendor.status || "active",
    vendor.source || "manual"
  ].filter(Boolean);
  return badges.map((badge) => `<span class="status-pill">${escapeHtml(String(badge).replace(/_/g, " "))}</span>`).join("");
}

function renderDrawerQuickActions(vendor) {
  const actions = [];
  if (vendor.primary_email) {
    actions.push(`<a class="small-button" href="mailto:${escapeHtml(vendor.primary_email)}">Email</a>`);
  }
  if (vendor.domain) {
    actions.push(`<a class="small-button secondary" href="https://${escapeHtml(vendor.domain)}" target="_blank" rel="noreferrer">Website</a>`);
  }
  if (vendor.whatsapp_phone) {
    const phone = String(vendor.whatsapp_phone).replace(/\D/g, "");
    if (phone) actions.push(`<a class="small-button secondary" href="https://wa.me/${escapeHtml(phone)}" target="_blank" rel="noreferrer">WhatsApp</a>`);
  }
  if (vendor.whatsapp_group_url) {
    actions.push(`<a class="small-button secondary" href="${escapeHtml(vendor.whatsapp_group_url)}" target="_blank" rel="noreferrer">WA group</a>`);
  }
  actions.push(`<button class="small-button secondary" type="button" data-copy-profile-link="${escapeHtml(vendor.id || vendor.vendor_id)}">Copy profile link</button>`);
  return actions.length ? actions.join("") : '<span class="muted-text">No quick actions available</span>';
}

function unresolvedDeliveryFailures(vendor) {
  const profileData = vendor?.profile_data && typeof vendor.profile_data === "object" ? vendor.profile_data : {};
  const bouncedEmails = Array.isArray(profileData.bounced_emails) ? profileData.bounced_emails : [];
  return bouncedEmails
    .filter((item) => item && typeof item === "object" && item.email && !item.resolved_at)
    .slice(0, 5);
}

function renderDrawerEmailDelivery(vendor) {
  const failures = unresolvedDeliveryFailures(vendor);
  if (drawerEmailDeliveryCard) drawerEmailDeliveryCard.classList.toggle("hidden", !failures.length);
  if (!drawerEmailDelivery) return;
  drawerEmailDelivery.innerHTML = failures.map((failure) => `
    <article class="email-delivery-issue" data-email-delivery-issue>
      <div>
        <strong>${escapeHtml(failure.email)}</strong>
        <span>${escapeHtml(failure.reason || "Gmail reported this address could not receive delivery.")}</span>
      </div>
      <div class="email-delivery-replace">
        <input data-replacement-email type="email" autocomplete="email" placeholder="Replacement email" aria-label="Replacement email for ${escapeHtml(failure.email)}" />
        <button class="small-button" type="button" data-replace-bounced-email="${escapeHtml(failure.email)}">Replace</button>
      </div>
    </article>
  `).join("");
}

function renderVendorSource(vendor) {
  const parts = [
    vendor.source ? String(vendor.source).replace(/_/g, " ") : null,
    vendor.source_row_number ? `row ${vendor.source_row_number}` : null,
    vendor.last_synced_at ? `synced ${new Date(vendor.last_synced_at).toLocaleDateString()}` : null
  ].filter(Boolean);
  const label = parts.join(" | ") || "manual";
  if (!vendor.source_spreadsheet_url) return escapeHtml(label);
  return `<a href="${escapeHtml(vendor.source_spreadsheet_url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function renderReadinessBreakdown(vendor) {
  const readiness = combinedVendorHealth(vendor);
  const localReadiness = vendorReadiness(vendor);
  return `
    <div class="readiness-breakdown">
      <div class="readiness-score-row">
        <span class="score-pill ${readiness.tone}">${readiness.score}%</span>
        <strong>${escapeHtml(readiness.label)}</strong>
      </div>
      <div class="health-meter ${readiness.tone}" aria-hidden="true"><span style="width:${readiness.score}%"></span></div>
      <div class="health-explainer">
        ${healthFactors(vendor).map((factor) => `<span>${escapeHtml(factor)}</span>`).join("")}
      </div>
      <div class="readiness-checks" aria-label="Readiness checks">
        ${localReadiness.checks
          .map((check) => `
            <span class="readiness-check ${check.done ? "is-done" : "is-missing"}">
              <span aria-hidden="true">${check.done ? "OK" : "!"}</span>
              ${escapeHtml(check.label)}
            </span>
          `)
          .join("")}
      </div>
    </div>
  `;
}

function renderDuplicateSignals(vendor) {
  const matches = currentVendors
    .filter((candidate) => candidate.id !== vendor.id)
    .map((candidate) => ({ vendor: candidate, reasons: duplicateReasons(vendor, candidate) }))
    .filter((match) => match.reasons.length);
  if (!matches.length) return "No obvious duplicates";
  return matches
    .map(
      (match) => `
        <div class="duplicate-inline">
          <strong>${escapeHtml(match.vendor.vendor_name)}</strong>
          <span>${match.reasons.map(escapeHtml).join(" | ")}</span>
        </div>
      `
    )
    .join("");
}

function vendorEnrichmentSuggestions(vendor) {
  const text = [vendor.vendor_name, vendor.coverage_notes, vendor.notes, splitTags(vendor.tags).join(" ")].join(" ").toLowerCase();
  const currentTags = new Set(splitTags(vendor.tags));
  const suggestions = [];

  const tagRules = [
    ["cross-border", /cross[-\s]?border|mx.?usa|usa.?mx|laredo|nuevo laredo|frontera/],
    ["ftl", /\bftl\b|truckload|carga completa/],
    ["ltl", /\bltl\b|consolidado/],
    ["reefer", /reefer|refrigerad|temperature|temperatura/],
    ["flatbed", /flatbed|plataforma/],
    ["hazmat", /hazmat|hazardous|peligros/],
    ["drayage", /drayage|puerto|intermodal|contenedor/]
  ];

  tagRules.forEach(([tag, pattern]) => {
    if (!currentTags.has(tag) && pattern.test(text)) {
      suggestions.push({ type: "tag", value: tag, label: `Add tag: ${tag}` });
    }
  });

  if (!vendor.coverage_notes && /monterrey|laredo|mexico|usa|canada|bajio|norte/.test(text)) {
    suggestions.push({ type: "coverage", value: "Review notes and add structured coverage markets.", label: "Add coverage from notes" });
  }
  if (!vendor.primary_email && !vendor.whatsapp_phone) {
    suggestions.push({ type: "note", value: "Missing contact channel. Validate email or WhatsApp before RFx invitation.", label: "Flag missing contact" });
  }
  if (!vendor.domain && vendor.primary_email?.includes("@")) {
    suggestions.push({ type: "domain", value: vendor.primary_email.split("@").pop(), label: "Infer domain from email" });
  }

  return suggestions.slice(0, 6);
}

function renderEnrichmentSuggestions(vendor) {
  const suggestions = vendorEnrichmentSuggestions(vendor);
  if (!suggestions.length) return '<div class="empty-state compact-empty"><strong>No suggestions</strong><span>This vendor has enough structured CRM data for now.</span></div>';
  return suggestions
    .map(
      (suggestion) => `
        <article class="ai-suggestion-card">
          <div>
            <strong>${escapeHtml(suggestion.label)}</strong>
            <span>${escapeHtml(suggestion.value)}</span>
          </div>
          <button class="small-button secondary" type="button" data-ai-suggestion-type="${escapeHtml(suggestion.type)}" data-ai-suggestion-value="${escapeHtml(suggestion.value)}">Apply</button>
        </article>
      `
    )
    .join("");
}

function findVendorById(vendorId) {
  const key = String(vendorId || "").trim().toLowerCase();
  if (!key) return null;
  const matchesIdentity = (row) => {
    const values = [row.id, row.vendor_id, row.vendor_name, row.domain, row.primary_email].filter(Boolean).map((value) => String(value).trim().toLowerCase());
    return values.includes(key);
  };
  const row = allVendors.find(matchesIdentity)
    || currentVendors.find(matchesIdentity)
    || vendorFunnelRows.find(matchesIdentity)
    || vendorIntelligenceRows.find(matchesIdentity);
  if (!row) return null;
  const id = row.id || row.vendor_id;
  const merged = [
    allVendors.find((item) => item.id === id),
    currentVendors.find((item) => item.id === id),
    vendorFunnelRows.find((item) => item.id === id || item.vendor_id === id),
    vendorIntelligenceRows.find((item) => item.id === id || item.vendor_id === id)
  ].filter(Boolean).reduce((acc, item) => ({ ...acc, ...item }), {});
  return { ...merged, id: merged.id || merged.vendor_id };
}

function setDrawerMode(mode = "view", { focus = false } = {}) {
  const nextMode = mode === "edit" ? "edit" : "view";
  drawer.dataset.mode = nextMode;
  if (drawerEditToggle) {
    drawerEditToggle.textContent = nextMode === "edit" ? "View profile" : "Edit profile";
    drawerEditToggle.classList.toggle("is-active", nextMode === "edit");
  }
  if (nextMode === "edit" && focus) {
    window.setTimeout(() => document.querySelector("#drawer-edit-name")?.focus(), 0);
  }
}

function supportStatusLabel(value) {
  const labels = {
    open: "Open",
    in_progress: "In progress",
    resolved: "Resolved",
    archived: "Archived"
  };
  return labels[value] || "Open";
}

function renderDrawerSupportTickets(rows = []) {
  if (!drawerVendorSupport) return;
  if (!rows.length) {
    drawerVendorSupport.innerHTML = `
      <div class="empty-state compact-empty">
        <strong>No support tickets</strong>
        <span>Carrier support tickets from Bid Room will appear here.</span>
      </div>
    `;
    return;
  }
  drawerVendorSupport.innerHTML = rows.slice(0, 5).map((row) => `
    <article class="vendor-support-mini-card" data-drawer-support-ticket="${escapeHtml(row.id)}">
      <div>
        <strong>${escapeHtml(row.question || row.subject || "Support question")}</strong>
        <span>${escapeHtml([row.rfx_id, row.route, row.contact_email].filter(Boolean).join(" | ") || "No RFx context")}</span>
      </div>
      <div>
        <span class="status-pill ${row.priority === "urgent" || row.priority === "high" ? "warning" : "neutral"}">${escapeHtml(row.priority || "normal")}</span>
        <span class="status-pill ${row.support_status === "resolved" ? "success" : "warning"}">${escapeHtml(supportStatusLabel(row.support_status))}</span>
      </div>
      <div class="action-row">
        <button class="secondary small-button" type="button" data-drawer-support-status="in_progress">Take</button>
        <button class="small-button" type="button" data-drawer-support-status="resolved">Resolve</button>
      </div>
    </article>
  `).join("");
}

function relationshipTypeLabel(type) {
  return {
    support: "Support",
    improvement: "Vendor CI",
    chat: "Bid Room chat"
  }[type] || "Activity";
}

function relationshipStatusLabel(status) {
  return String(status || "open").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function relationshipDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderDrawerVendorRelationship(result = {}) {
  if (!drawerVendorRelationship) return;
  const summary = result.summary || {};
  const timeline = result.timeline || [];
  drawerVendorRelationship.innerHTML = `
    <div class="vendor-relationship-summary" aria-label="Carrier relationship summary">
      <span><strong>${Number(summary.open_support_tickets || 0)}</strong> support</span>
      <span><strong>${Number(summary.active_improvement_cases || 0)}</strong> CI cases</span>
      <span><strong>${Number(summary.bid_room_threads || 0)}</strong> chats</span>
    </div>
    ${timeline.length ? `
      <div class="vendor-relationship-list">
        ${timeline.slice(0, 6).map((item) => `
          <article class="vendor-relationship-mini-card">
            <div>
              <span class="relationship-type">${escapeHtml(relationshipTypeLabel(item.type))}</span>
              <strong title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong>
              <small title="${escapeHtml(item.detail || "")}">${escapeHtml(item.detail || "No additional context")}</small>
            </div>
            <div class="relationship-meta">
              <span class="status-pill ${item.severity === "critical" || item.severity === "urgent" || item.severity === "high" ? "warning" : "neutral"}">${escapeHtml(relationshipStatusLabel(item.status))}</span>
              <small>${escapeHtml(relationshipDate(item.activity_at))}</small>
            </div>
          </article>
        `).join("")}
      </div>
    ` : `
      <div class="empty-state compact-empty">
        <strong>No linked activity</strong>
        <span>Tickets, CI cases, and Bid Room chats will stay connected to this carrier here.</span>
      </div>
    `}
  `;
}

function requestDrawerVendorSupport(vendorId) {
  if (!vendorDrawerSupportRequests.has(vendorId)) {
    const promise = fetchVendorSupportTickets({ vendor_id: vendorId, limit: 25 }).finally(() => {
      vendorDrawerSupportRequests.delete(vendorId);
    });
    vendorDrawerSupportRequests.set(vendorId, promise);
  }
  return vendorDrawerSupportRequests.get(vendorId);
}

async function loadDrawerVendorSupport(vendorId) {
  if (!drawerVendorSupport || !vendorId) return;
  const loadVersion = ++vendorDrawerSupportLoadVersion;
  drawerVendorSupport.innerHTML = '<p class="status-message">Loading support tickets...</p>';
  try {
    const result = await requestDrawerVendorSupport(vendorId);
    if (loadVersion !== vendorDrawerSupportLoadVersion || activeDrawerVendorId !== vendorId) return;
    renderDrawerSupportTickets(result.rows || []);
  } catch (error) {
    if (loadVersion !== vendorDrawerSupportLoadVersion || activeDrawerVendorId !== vendorId) return;
    drawerVendorSupport.innerHTML = `
      <div class="empty-state error-state compact-empty">
        <strong>Support could not load</strong>
        <span>${escapeHtml(humanizeError(error))}</span>
      </div>
    `;
  }
}

function requestDrawerVendorRelationship(vendorId) {
  if (!vendorDrawerRelationshipRequests.has(vendorId)) {
    const promise = fetchVendorRelationshipActivity(vendorId, { limit: 20 }).finally(() => {
      vendorDrawerRelationshipRequests.delete(vendorId);
    });
    vendorDrawerRelationshipRequests.set(vendorId, promise);
  }
  return vendorDrawerRelationshipRequests.get(vendorId);
}

async function loadDrawerVendorRelationship(vendorId) {
  if (!drawerVendorRelationship || !vendorId) return;
  const loadVersion = ++vendorDrawerRelationshipLoadVersion;
  drawerVendorRelationship.innerHTML = '<p class="status-message">Loading carrier activity...</p>';
  try {
    const result = await requestDrawerVendorRelationship(vendorId);
    if (loadVersion !== vendorDrawerRelationshipLoadVersion || activeDrawerVendorId !== vendorId) return;
    renderDrawerVendorRelationship(result);
  } catch (error) {
    if (loadVersion !== vendorDrawerRelationshipLoadVersion || activeDrawerVendorId !== vendorId) return;
    drawerVendorRelationship.innerHTML = `
      <div class="empty-state error-state compact-empty">
        <strong>Carrier activity could not load</strong>
        <span>${escapeHtml(humanizeError(error))}</span>
      </div>
    `;
  }
}

function openVendorDrawer(vendorId, options = {}) {
  const vendor = findVendorById(vendorId);
  if (!vendor) return;
  const health = combinedVendorHealth(vendor);

  activeDrawerVendorId = vendor.id;
  vendorDrawerContextVersion += 1;
  document.querySelector("#drawer-vendor-name").textContent = vendor.vendor_name || "Vendor";
  if (drawerLogoPreview) drawerLogoPreview.innerHTML = renderVendorAvatar(vendor, "drawer");
  document.querySelector("#drawer-badges").innerHTML = renderDrawerBadges(vendor);
  document.querySelector("#drawer-quick-actions").innerHTML = renderDrawerQuickActions(vendor);
  setDrawerValue("#drawer-source", renderVendorSource(vendor));
  setDrawerValue("#drawer-completeness", `${health.score}% ${health.label}`);
  setDrawerValue("#drawer-readiness", renderReadinessBreakdown(vendor));
  setDrawerValue("#drawer-rateware-evidence", renderDrawerRatewareEvidence(vendor));
  renderDrawerEmailDelivery(vendor);
  setDrawerValue(
    "#drawer-contact",
    [
      vendor.contact_name,
      vendorEmailInputValue(vendor),
      vendor.whatsapp_phone,
      vendor.whatsapp_group_name || vendor.whatsapp_group_url
    ].filter(Boolean).map(escapeHtml).join("<br>")
  );
  setDrawerValue("#drawer-channel", escapeHtml(vendor.preferred_channel));
  setDrawerValue("#drawer-tags", `<div class="tag-list">${renderTags(vendor.tags)}</div>`);
  setDrawerValue("#drawer-coverage", escapeHtml(vendor.coverage_notes));
  setDrawerValue("#drawer-duplicates", renderDuplicateSignals(vendor));
  setDrawerValue("#drawer-notes", escapeHtml(vendor.notes));
  if (drawerOnboardingProfile) drawerOnboardingProfile.innerHTML = renderOnboardingProfile(vendor);
  document.querySelector("#drawer-ai-suggestions").innerHTML = renderEnrichmentSuggestions(vendor);
  document.querySelector("#drawer-edit-name").value = vendor.vendor_name || "";
  document.querySelector("#drawer-edit-domain").value = vendor.domain || "";
  document.querySelector("#drawer-edit-logo-url").value = vendor.logo_url || "";
  document.querySelector("#drawer-edit-contact").value = vendor.contact_name || "";
  document.querySelector("#drawer-edit-email").value = vendorEmailInputValue(vendor);
  document.querySelector("#drawer-edit-whatsapp").value = vendor.whatsapp_phone || "";
  document.querySelector("#drawer-edit-channel").value = vendor.preferred_channel || "email";
  document.querySelector("#drawer-edit-whatsapp-permission").value = vendor.whatsapp_permission_basis || "contractual";
  document.querySelector("#drawer-edit-whatsapp-opt-in").value = vendor.whatsapp_opt_in_status || "contractual";
  document.querySelector("#drawer-edit-whatsapp-do-not-contact").checked = Boolean(vendor.whatsapp_do_not_contact);
  document.querySelector("#drawer-edit-whatsapp-group-name").value = vendor.whatsapp_group_name || "";
  document.querySelector("#drawer-edit-whatsapp-group-url").value = vendor.whatsapp_group_url || "";
  document.querySelector("#drawer-edit-whatsapp-meta-group-id").value = vendor.whatsapp_meta_group_id || "";
  document.querySelector("#drawer-edit-whatsapp-group-status").value = vendor.whatsapp_group_status || "manual_only";
  document.querySelector("#drawer-edit-status").value = vendor.status || "active";
  document.querySelector("#drawer-edit-tags").value = splitTags(vendor.tags).join(", ");
  document.querySelector("#drawer-edit-coverage").value = vendor.coverage_notes || "";
  document.querySelector("#drawer-edit-notes").value = vendor.notes || "";
  document.querySelector("#drawer-edit-whatsapp-notes").value = vendor.whatsapp_notes || "";
  renderOnboardingEditor(vendor);
  if (drawerLogoFile) drawerLogoFile.value = "";
  drawerSaveInFlight = false;
  drawerArchiveButton.disabled = false;
  drawerArchiveButton.textContent = vendor.base_stage === "archived" ? "Restore to Sourcing" : "Archive vendor";
  setStatus(drawerEditStatus, "");
  drawer.classList.remove("hidden");
  setDrawerMode(options.mode || "view");
  setDrawerBaseline();
  loadDrawerVendorSupport(vendor.id);
  loadDrawerVendorRelationship(vendor.id);
}

const DRAWER_BASE_PATCH_FIELDS = [
  "vendor_name",
  "domain",
  "logo_url",
  "contact_name",
  "primary_email",
  "secondary_emails",
  "whatsapp_phone",
  "preferred_channel",
  "whatsapp_permission_basis",
  "whatsapp_opt_in_status",
  "whatsapp_do_not_contact",
  "whatsapp_group_name",
  "whatsapp_group_url",
  "whatsapp_meta_group_id",
  "whatsapp_group_status",
  "whatsapp_notes",
  "status",
  "tags",
  "coverage_notes",
  "notes"
];

function normalizeDrawerComparableValue(value) {
  if (Array.isArray(value)) return [...value].map((item) => normalizeDrawerComparableValue(item)).filter((item) => item !== "").sort();
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((next, key) => {
      next[key] = normalizeDrawerComparableValue(value[key]);
      return next;
    }, {});
  }
  return String(value ?? "").trim();
}

function drawerComparableValue(value) {
  return JSON.stringify(normalizeDrawerComparableValue(value));
}

function drawerValuesMatch(left, right) {
  return drawerComparableValue(left) === drawerComparableValue(right);
}

function readDrawerSnapshot() {
  const profileData = readDrawerProfileData();
  const tags = Array.from(new Set([...splitTags(document.querySelector("#drawer-edit-tags").value), ...profileDerivedTags(profileData)]));
  const emails = splitVendorEmails(document.querySelector("#drawer-edit-email").value);
  return {
    vendor_name: document.querySelector("#drawer-edit-name").value.trim(),
    domain: document.querySelector("#drawer-edit-domain").value.trim(),
    logo_url: document.querySelector("#drawer-edit-logo-url").value.trim(),
    contact_name: document.querySelector("#drawer-edit-contact").value.trim(),
    ...emails,
    whatsapp_phone: document.querySelector("#drawer-edit-whatsapp").value.trim(),
    preferred_channel: document.querySelector("#drawer-edit-channel").value,
    whatsapp_permission_basis: document.querySelector("#drawer-edit-whatsapp-permission").value,
    whatsapp_opt_in_status: document.querySelector("#drawer-edit-whatsapp-opt-in").value,
    whatsapp_do_not_contact: document.querySelector("#drawer-edit-whatsapp-do-not-contact").checked,
    whatsapp_group_name: document.querySelector("#drawer-edit-whatsapp-group-name").value,
    whatsapp_group_url: document.querySelector("#drawer-edit-whatsapp-group-url").value,
    whatsapp_meta_group_id: document.querySelector("#drawer-edit-whatsapp-meta-group-id").value,
    whatsapp_group_status: document.querySelector("#drawer-edit-whatsapp-group-status").value,
    whatsapp_notes: document.querySelector("#drawer-edit-whatsapp-notes").value,
    status: document.querySelector("#drawer-edit-status").value,
    tags,
    coverage_notes: document.querySelector("#drawer-edit-coverage").value,
    notes: document.querySelector("#drawer-edit-notes").value,
    profile_data: profileData
  };
}

function buildDrawerProfilePatch(baselineProfile = {}, nextProfile = {}) {
  const patch = {};
  VENDOR_ONBOARDING_SECTIONS.forEach((section) => {
    const sectionPatch = {};
    section.fields.forEach((field) => {
      const before = profileFieldValue(baselineProfile, section.key, field.key);
      const after = profileFieldValue(nextProfile, section.key, field.key);
      if (!drawerValuesMatch(before, after)) {
        sectionPatch[field.key] = field.type === "checks" ? profileArrayValue(after) : profileScalarValue(after);
      }
    });
    if (Object.keys(sectionPatch).length) patch[section.key] = sectionPatch;
  });
  return patch;
}

function buildDrawerPartialPatch(scope = "all") {
  const baseline = drawerEditBaseline || {};
  const snapshot = readDrawerSnapshot();
  const patch = {};
  if (scope !== "profile") {
    DRAWER_BASE_PATCH_FIELDS.forEach((field) => {
      if (!drawerValuesMatch(baseline[field], snapshot[field])) patch[field] = snapshot[field];
    });
  }
  if (scope !== "base") {
    const profilePatch = buildDrawerProfilePatch(baseline.profile_data || {}, snapshot.profile_data || {});
    if (Object.keys(profilePatch).length) patch.profile_data_patch = profilePatch;
  }
  return patch;
}

function setDrawerBaseline() {
  drawerEditBaseline = readDrawerSnapshot();
  renderDrawerDirtyState();
}

function renderDrawerDirtyState() {
  if (!drawerEditForm || !activeDrawerVendorId) return;
  const patch = buildDrawerPartialPatch();
  const profilePatch = buildDrawerPartialPatch("profile");
  const changeCount = Object.keys(patch).length;
  const profileChangeCount = Object.keys(profilePatch.profile_data_patch || {}).length;
  const saveButton = document.querySelector("#drawer-save-button");
  if (saveButton) saveButton.disabled = drawerSaveInFlight || changeCount === 0;
  if (drawerSaveProfileButton) drawerSaveProfileButton.disabled = drawerSaveInFlight || profileChangeCount === 0;
  if (drawerEditDirtyMessage) {
    drawerEditDirtyMessage.textContent = changeCount ? `${changeCount} unsaved ${changeCount === 1 ? "change" : "changes"}` : "No unsaved changes";
  }
  if (drawerProfileDirtyMessage) {
    drawerProfileDirtyMessage.textContent = profileChangeCount ? `${profileChangeCount} profile section${profileChangeCount === 1 ? "" : "s"} changed` : "No profile changes";
  }
}

function replaceVendorInState(updated) {
  if (!updated?.id) return;
  allVendors = allVendors.map((row) => (row.id === updated.id ? { ...row, ...updated } : row));
  currentVendors = currentVendors.map((row) => (row.id === updated.id ? { ...row, ...updated } : row));
  vendorFunnelRows = vendorFunnelRows.map((row) => ((row.id || row.vendor_id) === updated.id ? { ...row, ...updated } : row));
  vendorIntelligenceRows = vendorIntelligenceRows.map((row) => ((row.vendor_id || row.id) === updated.id ? { ...row, ...updated, vendor_id: row.vendor_id || updated.id } : row));
  vendorIntelligenceStale = true;
  vendorMatchLoaded = false;
}

function applyVendorUpdateToFunnel(updated, { render = true, resetLimits = false } = {}) {
  if (!updated?.id) return;
  const id = updated.id || updated.vendor_id;
  const existingIndex = vendorFunnelRows.findIndex((row) => (row.id || row.vendor_id) === id);
  const existing = existingIndex >= 0 ? vendorFunnelRows[existingIndex] : {};
  const baseStage = updated.base_stage || existing.base_stage || "sourcing";

  if (baseStage !== "procurement") {
    if (existingIndex >= 0) vendorFunnelRows.splice(existingIndex, 1);
    if (render) refreshVendorFunnelLocal({ resetLimits });
    return;
  }

  const nextStage = updated.funnel_stage || updated.effective_funnel_stage || existing.funnel_stage || existing.effective_funnel_stage || "targeted";
  const nextRow = {
    ...existing,
    ...updated,
    id,
    vendor_id: updated.vendor_id || existing.vendor_id || id,
    base_stage: "procurement",
    funnel_stage: nextStage,
    effective_funnel_stage: nextStage
  };

  if (existingIndex >= 0) vendorFunnelRows.splice(existingIndex, 1, nextRow);
  else vendorFunnelRows.unshift(nextRow);
  if (render) refreshVendorFunnelLocal({ resetLimits });
}

function applyBulkVendorPatchToState(ids, patch) {
  const idSet = new Set(ids.map((id) => String(id)));
  const applyPatch = (row) => {
    const rowId = String(row.id || row.vendor_id || "");
    if (!idSet.has(rowId)) return row;
    return { ...row, ...patch };
  };
  allVendors = allVendors.map(applyPatch);
  currentVendors = currentVendors.map(applyPatch);
  vendorIntelligenceRows = vendorIntelligenceRows.map(applyPatch);
  vendorFunnelRows = vendorFunnelRows
    .map(applyPatch)
    .filter((row) => (row.base_stage || "sourcing") === "procurement");
}

async function handleDrawerLogoUpload() {
  if (!activeDrawerVendorId || !drawerLogoFile?.files?.length) return;
  const vendorId = activeDrawerVendorId;
  const contextVersion = vendorDrawerContextVersion;
  const [file] = drawerLogoFile.files;
  const allowed = new Set(["image/png", "image/jpeg", "image/gif"]);
  if (!allowed.has(file.type)) {
    setStatus(drawerEditStatus, "Logo must be PNG, JPEG, or GIF.", "error");
    drawerLogoFile.value = "";
    return;
  }
  if (file.size > 1_500_000) {
    setStatus(drawerEditStatus, "Logo must be 1.5 MB or smaller.", "error");
    drawerLogoFile.value = "";
    return;
  }

  setStatus(drawerEditStatus, "Uploading logo...");
  try {
    await requirePrivatePage();
    const dataUrl = await fileToDataUrl(file);
    if (activeDrawerVendorId !== vendorId || vendorDrawerContextVersion !== contextVersion) return;
    const result = await uploadVendorLogo(vendorId, {
      filename: file.name,
      mime_type: file.type,
      data_url: dataUrl
    });
    const updated = result.row;
    replaceVendorInState(updated);
    if (activeDrawerVendorId !== vendorId || vendorDrawerContextVersion !== contextVersion) return;
    document.querySelector("#drawer-edit-logo-url").value = updated.logo_url || "";
    if (drawerLogoPreview) drawerLogoPreview.innerHTML = renderVendorAvatar(updated, "drawer");
    renderVendors(currentVendors);
    renderVendorFunnelBoard();
    setStatus(drawerEditStatus, "Logo uploaded.", "success");
  } catch (error) {
    if (activeDrawerVendorId === vendorId && vendorDrawerContextVersion === contextVersion) {
      setStatus(drawerEditStatus, humanizeError(error), "error");
    }
  } finally {
    if (activeDrawerVendorId === vendorId && vendorDrawerContextVersion === contextVersion) drawerLogoFile.value = "";
  }
}

async function copyVendorProfileLink(vendorId) {
  if (!vendorId) return;
  setStatus(drawerEditStatus, "Creating carrier profile link...");
  try {
    await requirePrivatePage();
    const result = await createVendorProfileRequest(vendorId, { expiresInDays: 30 });
    const url = result.url || `${window.location.origin}/carrier-profile.html?token=${encodeURIComponent(result.token || "")}`;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      setStatus(drawerEditStatus, `Profile link copied. Expires ${new Date(result.expires_at).toLocaleDateString()}.`, "success");
    } else {
      setStatus(drawerEditStatus, `Profile link: ${url}`, "success");
    }
  } catch (error) {
    setStatus(drawerEditStatus, humanizeError(error), "error");
  }
}

function applyDrawerSuggestion(type, value) {
  if (type === "tag") {
    const tagInput = document.querySelector("#drawer-edit-tags");
    const tags = new Set(splitTags(tagInput.value));
    tags.add(value);
    tagInput.value = Array.from(tags).join(", ");
  }
  if (type === "coverage") {
    const coverageInput = document.querySelector("#drawer-edit-coverage");
    coverageInput.value = coverageInput.value ? `${coverageInput.value}\n${value}` : value;
  }
  if (type === "note") {
    const notesInput = document.querySelector("#drawer-edit-notes");
    notesInput.value = notesInput.value ? `${notesInput.value}\n${value}` : value;
  }
  if (type === "domain") {
    document.querySelector("#drawer-edit-domain").value ||= value;
  }
  setDrawerMode("edit", { focus: false });
  setStatus(drawerEditStatus, "Suggestion applied. Review and save changes.", "success");
}

async function loadXlsxModule() {
  if (!xlsxModulePromise) xlsxModulePromise = import(XLSX_MODULE_URL);
  return await xlsxModulePromise;
}

async function parseVendorFile(file) {
  const XLSX = await loadXlsxModule();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { defval: "" }).map(normalizeImportedRow);
}

function hasVendorCorrectionIdentifier(row) {
  return Boolean(row?.vendor_id || row?.id || row?.domain || row?.vendor_domain || row?.vendor_name || row?.legal_name || row?.primary_email || row?.email);
}

function downloadVendorOnboardingCorrectionErrors(rows = []) {
  const errorRows = rows.filter((row) => row && (row.error_reason || row.error || row.errors));
  if (!errorRows.length) return false;
  downloadCsv(
    `vendor-onboarding-correction-errors-${new Date().toISOString().slice(0, 10)}.csv`,
    ["source_row_number", "vendor_id", "vendor_name", "legal_name", "domain", "primary_email", "error_reason"],
    errorRows.map((row) => [
      row.source_row_number || row.row_number || "",
      row.vendor_id || "",
      row.vendor_name || "",
      row.legal_name || "",
      row.domain || "",
      row.primary_email || row.email || "",
      row.error_reason || row.error || (Array.isArray(row.errors) ? row.errors.join("; ") : "")
    ])
  );
  return true;
}

async function importOnboardingGapCorrections(file) {
  if (!file || !importOnboardingGapsButton) return;
  importOnboardingGapsButton.disabled = true;
  setStatus(vendorOnboardingGapsStatus, "Applying onboarding corrections...");

  try {
    await requirePrivatePage();
    const vendors = (await parseVendorFile(file))
      .filter(hasVendorCorrectionIdentifier)
      .map((vendor) => ({
        ...vendor,
        tags: splitTags(vendor.tags)
    }));
    if (!vendors.length) {
      setStatus(vendorOnboardingGapsStatus, "No usable correction rows found. Keep vendor_id, domain, email, legal_name, or vendor_name in the file.", "error");
      return;
    }
    const result = await importVendorOnboardingCorrections(vendors);
    const updated = Number(result.updated || 0);
    const skipped = Number(result.skipped || 0);
    const downloadedErrors = downloadVendorOnboardingCorrectionErrors(result.errors || []);
    const truncatedMessage = result.errors_truncated
      ? ` Only the first ${Number(result.error_limit || (result.errors || []).length).toLocaleString()} of ${Number(result.error_count || skipped).toLocaleString()} error(s) were exported.`
      : "";
    const message = `Applied ${updated} onboarding correction(s).${skipped ? ` ${skipped} row(s) could not be matched.${downloadedErrors ? ` Correction errors CSV downloaded.${truncatedMessage}` : ""}` : ""}`;
    setStatus(vendorOnboardingGapsStatus, message, skipped ? "warning" : "success");
    await loadVendors();
  } catch (error) {
    setStatus(vendorOnboardingGapsStatus, humanizeError(error), "error");
  } finally {
    importOnboardingGapsButton.disabled = false;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#save-vendor-button");
  const validationMessage = emailValidationMessage(document.querySelector("#primary-email")?.value);
  if (validationMessage) {
    setStatus(statusMessage, validationMessage, "error");
    return;
  }
  button.disabled = true;
  setStatus(statusMessage, "Saving vendor...");

  try {
    await requirePrivatePage();
    await createVendor(readForm());
    form.reset();
    setStatus(statusMessage, "Vendor saved.", "success");
    await loadVendors();
  } catch (error) {
    setStatus(statusMessage, humanizeError(error), "error");
  } finally {
    button.disabled = false;
  }
});

wizardStepButtons.forEach((button) => {
  button.addEventListener("click", () => {
    wizardStep = Number(button.dataset.wizardStep);
    renderWizard();
  });
});

wizardBackButton.addEventListener("click", () => {
  wizardStep = Math.max(0, wizardStep - 1);
  renderWizard();
});

wizardNextButton.addEventListener("click", () => {
  if (wizardStep === 0 && !document.querySelector("#wizard-vendor-name").value.trim()) {
    setStatus(wizardStatus, "Vendor name is required.", "error");
    return;
  }
  setStatus(wizardStatus, "");
  wizardStep = Math.min(wizardPanels.length - 1, wizardStep + 1);
  renderWizard();
});

wizardForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const validationMessage = emailValidationMessage(document.querySelector("#wizard-primary-email")?.value);
  if (validationMessage) {
    setStatus(wizardStatus, validationMessage, "error");
    return;
  }
  wizardSaveButton.disabled = true;
  setStatus(wizardStatus, "Saving vendor...");

  try {
    await requirePrivatePage();
    await createVendor(readWizard());
    resetWizard();
    setStatus(wizardStatus, "Vendor saved.", "success");
    await loadVendors();
  } catch (error) {
    setStatus(wizardStatus, humanizeError(error), "error");
  } finally {
    wizardSaveButton.disabled = false;
  }
});

importInput.addEventListener("change", async () => {
  const [file] = importInput.files;
  if (!file) return;

  setStatus(importStatus, "Reading vendor file...");
  setVendorImportStep("columns");

  try {
    await requirePrivatePage();
    pendingImportRows = (await parseVendorFile(file)).map((vendor) => ({
      ...vendor,
      tags: splitTags(vendor.tags)
    }));
    renderImportPreview();
    setStatus(importStatus, "Review the file before importing.", "success");
  } catch (error) {
    setStatus(importStatus, humanizeError(error), "error");
    setVendorImportStep("source");
  } finally {
    importInput.value = "";
  }
});

templateButton.addEventListener("click", downloadVendorTemplate);
updateTemplateButton?.addEventListener("click", downloadVendorUpdateTemplate);

vendorUpdateInput?.addEventListener("change", async () => {
  const [file] = vendorUpdateInput.files || [];
  if (!file) return;

  setStatus(vendorUpdateStatus, "Reading CRM update file...");
  try {
    await requirePrivatePage();
    pendingVendorUpdateRows = await parseVendorUpdateFile(file);
    const result = await applyVendorTemplateUpdates(pendingVendorUpdateRows, { dryRun: true });
    renderVendorUpdatePreview(result);
    setStatus(vendorUpdateStatus, "Review the update preview before applying changes.", "success");
  } catch (error) {
    pendingVendorUpdateRows = [];
    vendorUpdatePreview = null;
    vendorUpdatePreviewPanel?.classList.add("hidden");
    setStatus(vendorUpdateStatus, humanizeError(error), "error");
  } finally {
    vendorUpdateInput.value = "";
  }
});

applyVendorUpdateButton?.addEventListener("click", async () => {
  if (vendorImportActionRunning) return;
  if (!pendingVendorUpdateRows.length) {
    setStatus(applyVendorUpdateStatus, "Upload a CRM update template first.", "error");
    return;
  }
  vendorImportActionRunning = true;
  applyVendorUpdateButton.disabled = true;
  if (confirmImportButton) confirmImportButton.disabled = true;
  if (googleImportButton) googleImportButton.disabled = true;
  setStatus(applyVendorUpdateStatus, "Applying vendor updates...");
  try {
    await requirePrivatePage();
    const reviewedUpdatePreview = vendorUpdatePreview;
    const result = await applyVendorTemplateUpdates(pendingVendorUpdateRows, { dryRun: false });
    pendingVendorUpdateRows = [];
    renderVendorUpdatePreview({
      ...(reviewedUpdatePreview || {}),
      ...result,
      rows: Array.isArray(result.rows) && result.rows.length
        ? result.rows
        : (Array.isArray(reviewedUpdatePreview?.rows) ? reviewedUpdatePreview.rows : []),
      received: result.received || reviewedUpdatePreview?.received,
      valid: result.valid || reviewedUpdatePreview?.valid,
      invalid: result.invalid ?? reviewedUpdatePreview?.invalid
    });
    setStatus(applyVendorUpdateStatus, `${result.updated || 0} vendor(s) updated. ${result.skipped || 0} row(s) skipped.`, "success");
    await loadVendors();
  } catch (error) {
    setStatus(applyVendorUpdateStatus, humanizeError(error), "error");
  } finally {
    vendorImportActionRunning = false;
    applyVendorUpdateButton.disabled = false;
    if (confirmImportButton) confirmImportButton.disabled = !validImportRows().length;
    if (googleImportButton) googleImportButton.disabled = false;
  }
});

cancelVendorUpdateButton?.addEventListener("click", () => {
  pendingVendorUpdateRows = [];
  vendorUpdatePreview = null;
  vendorUpdatePreviewPanel?.classList.add("hidden");
  setStatus(vendorUpdateStatus, "CRM update canceled.");
  setStatus(applyVendorUpdateStatus, "");
});

downloadVendorUpdateErrorsButton?.addEventListener("click", downloadVendorUpdateErrors);

importOnboardingGapsButton?.addEventListener("click", () => {
  vendorGapsImportInput?.click();
});

vendorGapsImportInput?.addEventListener("change", async () => {
  const [file] = vendorGapsImportInput.files || [];
  await importOnboardingGapCorrections(file);
  vendorGapsImportInput.value = "";
});

googleImportButton?.addEventListener("click", async () => {
  if (vendorImportActionRunning) return;
  const url = googleSheetUrlInput.value.trim();
  if (!url) {
    setStatus(googleImportStatus, "Paste a Google Sheet URL.", "error");
    setVendorImportStep("source");
    return;
  }

  vendorImportActionRunning = true;
  googleImportButton.disabled = true;
  if (confirmImportButton) confirmImportButton.disabled = true;
  if (applyVendorUpdateButton) applyVendorUpdateButton.disabled = true;
  setStatus(googleImportStatus, "Importing Google Sheet...");
  setVendorImportStep("columns");

  try {
    await requirePrivatePage();
    const result = await importVendorsFromGoogleSheet(url);
    setStatus(googleImportStatus, `${result.inserted} vendor(s) imported from ${result.total_rows} sheet row(s).`, "success");
    setVendorImportStep("sourcing");
    await loadVendors();
  } catch (error) {
    setStatus(googleImportStatus, humanizeError(error), "error");
    setVendorImportStep("source");
  } finally {
    vendorImportActionRunning = false;
    googleImportButton.disabled = false;
    if (confirmImportButton) confirmImportButton.disabled = !validImportRows().length;
    if (applyVendorUpdateButton) applyVendorUpdateButton.disabled = !pendingVendorUpdateRows.length;
  }
});

confirmImportButton.addEventListener("click", async () => {
  if (vendorImportActionRunning) return;
  const vendors = validImportRows();
  if (!vendors.length) {
    setStatus(confirmImportStatus, "No valid vendor rows are ready to import.", "error");
    return;
  }
  vendorImportActionRunning = true;
  confirmImportButton.disabled = true;
  if (googleImportButton) googleImportButton.disabled = true;
  if (applyVendorUpdateButton) applyVendorUpdateButton.disabled = true;
  setStatus(confirmImportStatus, "Importing valid rows...");

  try {
    await requirePrivatePage();
    const result = await importVendors(vendors);
    pendingImportRows = [];
    importPreviewPanel.classList.add("hidden");
    setStatus(importStatus, `${result.inserted} vendor(s) imported.`, "success");
    setStatus(confirmImportStatus, "");
    setVendorImportStep("sourcing");
    await loadVendors();
  } catch (error) {
    setStatus(confirmImportStatus, humanizeError(error), "error");
  } finally {
    vendorImportActionRunning = false;
    confirmImportButton.disabled = !validImportRows().length;
    if (googleImportButton) googleImportButton.disabled = false;
    if (applyVendorUpdateButton) applyVendorUpdateButton.disabled = !pendingVendorUpdateRows.length;
  }
});

cancelImportButton.addEventListener("click", () => {
  pendingImportRows = [];
  importPreviewPanel.classList.add("hidden");
  setStatus(importStatus, "Import canceled.");
  setStatus(confirmImportStatus, "");
  setVendorImportStep("source");
});

bulkButton.addEventListener("click", async () => {
  if (vendorBulkActionRunning) return;
  const ids = selectedVisibleVendorIds();
  const patch = {};
  if (bulkStatus.value) patch.status = bulkStatus.value;
  if (bulkBaseStage.value) patch.base_stage = bulkBaseStage.value;
  if (bulkTags.value.trim()) {
    patch.add_tags = splitTags(bulkTags.value);
  }

  if (!ids.length) {
    setStatus(bulkStatusMessage, "Select at least one vendor.", "error");
    return;
  }

  if (!Object.keys(patch).length) {
    setStatus(bulkStatusMessage, "Choose a status, base, or tags to apply.", "error");
    return;
  }

  vendorBulkActionRunning = true;
  updateBulkState();
  bulkButton.disabled = true;
  setStatus(bulkStatusMessage, "Updating vendors...");

  try {
    await requirePrivatePage();
    const result = await bulkUpdateVendors(ids, patch);
    selectedVendorIds = new Set();
    bulkStatus.value = "";
    bulkBaseStage.value = "";
    bulkTags.value = "";
    setStatus(bulkStatusMessage, `${result.updated} vendor(s) updated.`, "success");
    await loadVendors();
  } catch (error) {
    setStatus(bulkStatusMessage, humanizeError(error), "error");
  } finally {
    vendorBulkActionRunning = false;
    updateBulkState();
  }
});

async function runBulkBaseAction(baseStage, label) {
  if (vendorBulkActionRunning) return;
  const ids = selectedVisibleVendorIds();
  if (!ids.length) {
    setStatus(bulkStatusMessage, "Select at least one vendor.", "error");
    return;
  }
  vendorBulkActionRunning = true;
  updateBulkState();
  setStatus(bulkStatusMessage, `${label}...`);
  try {
    await requirePrivatePage();
    const result = await bulkUpdateVendors(ids, { base_stage: baseStage });
    selectedVendorIds = new Set();
    vendorFunnelRows = [];
    resetQuickFilter();
    setStatus(bulkStatusMessage, `${result.updated} vendor(s) updated.`, "success");
    activateVendorTab(baseStage === "archived" ? "archived" : baseStage);
  } catch (error) {
    setStatus(bulkStatusMessage, humanizeError(error), "error");
  } finally {
    vendorBulkActionRunning = false;
    updateBulkState();
  }
}

bulkProcurementButton?.addEventListener("click", () => {
  const targetBase = activeBaseStage === "sourcing" ? "procurement" : "sourcing";
  const label =
    activeBaseStage === "archived"
      ? "Restoring to Sourcing Base"
      : activeBaseStage === "procurement"
        ? "Returning to Sourcing Base"
        : "Sending to Procurement Base";
  runBulkBaseAction(targetBase, label);
});
bulkArchiveVendorsButton?.addEventListener("click", () => runBulkBaseAction("archived", "Archiving vendors"));
bulkRemoveVendorsButton?.addEventListener("click", async () => {
  if (vendorBulkActionRunning) return;
  const ids = selectedVisibleVendorIds();
  if (!ids.length) {
    setStatus(bulkStatusMessage, "Select at least one vendor.", "error");
    return;
  }
  // Deleting a vendor cascades to eleven child tables — invitations, submitted
  // bids, ratebook quotes, chat threads, WhatsApp groups and scorecards all go
  // with it. The old wording ("deletes them from Rateware") did not say so, and
  // most carriers in the CRM have bid history attached.
  if (!window.confirm(
    `Remove ${ids.length} carrier(s)?\n\n`
    + "This also permanently deletes everything attached to them: bid room invitations, "
    + "submitted bids, ratebook quotes, message history and scorecards.\n\n"
    + "This cannot be undone."
  )) return;
  vendorBulkActionRunning = true;
  updateBulkState();
  setStatus(bulkStatusMessage, "Removing vendors...");
  try {
    await requirePrivatePage();
    const result = await removeVendors(ids);
    selectedVendorIds = new Set();
    setStatus(bulkStatusMessage, `${result.removed} vendor(s) removed.`, "success");
    await loadVendors();
  } catch (error) {
    setStatus(bulkStatusMessage, humanizeError(error), "error");
  } finally {
    vendorBulkActionRunning = false;
    updateBulkState();
  }
});

segmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#save-segment-button");
  button.disabled = true;
  setStatus(segmentStatusMessage, "Saving segment...");

  try {
    await requirePrivatePage();
    await createVendorSegment(readSegmentForm());
    segmentForm.reset();
    setStatus(segmentStatusMessage, "Segment saved.", "success");
    await loadSegments();
  } catch (error) {
    setStatus(segmentStatusMessage, humanizeError(error), "error");
  } finally {
    button.disabled = false;
  }
});

segmentsList.addEventListener("click", async (event) => {
  const filterButton = event.target.closest("[data-segment-filter]");
  const deleteButton = event.target.closest("[data-segment-delete]");

  if (filterButton) {
    const segment = savedSegments.find((item) => item.id === filterButton.dataset.segmentFilter);
    if (!segment) return;
    searchInput.value = "";
    tagFilter.value = splitTags(segment.tags).join(", ");
    statusFilter.value = segment.status || "";
    channelFilter.value = segment.preferred_channel || "";
    coverageFilter.value = segment.coverage_filter || "";
    clearVendorSelection();
    renderVendors(allVendors.filter((vendor) => segmentMatches(segment, vendor)));
  }

  if (deleteButton) {
    const segment = savedSegments.find((item) => item.id === deleteButton.dataset.segmentDelete);
    const segmentLabel = segment?.name || segment?.segment_name || "this saved list";
    if (!window.confirm(`Delete ${segmentLabel}? Vendors will not be removed from Carrier CRM.`)) return;
    deleteButton.disabled = true;
    try {
      await requirePrivatePage();
      await deleteVendorSegment(deleteButton.dataset.segmentDelete);
      await loadSegments();
    } catch (error) {
      deleteButton.title = humanizeError(error);
      deleteButton.disabled = false;
    }
  }
});

duplicateReviewList.addEventListener("click", async (event) => {
  const openButton = event.target.closest("[data-duplicate-open]");
  const inactiveButton = event.target.closest("[data-duplicate-inactive]");

  if (openButton) {
    openVendorDrawer(openButton.dataset.duplicateOpen);
    return;
  }

  if (inactiveButton) {
    inactiveButton.disabled = true;
    try {
      await requirePrivatePage();
      await updateVendor(inactiveButton.dataset.duplicateInactive, { status: "inactive" });
      await loadVendors();
    } catch (error) {
      inactiveButton.title = humanizeError(error);
      inactiveButton.disabled = false;
    }
  }
});

previewExactDuplicatesButton?.addEventListener("click", previewExactVendorDuplicates);
consolidateExactDuplicatesButton?.addEventListener("click", applyExactVendorConsolidation);

refreshVendorIntelligenceButton?.addEventListener("click", () => loadVendorIntelligence({ force: true }));
loadMoreVendorIntelligenceButton?.addEventListener("click", () => loadVendorIntelligence({ append: true }));
vendorIntelligenceFilter?.addEventListener("change", () => {
  selectedVendorIntelligenceIds = new Set();
  renderVendorIntelligence();
});
vendorIntelligenceSearch?.addEventListener("input", () => {
  window.clearTimeout(vendorIntelligenceSearch._timer);
  vendorIntelligenceSearch._timer = window.setTimeout(() => {
    selectedVendorIntelligenceIds = new Set();
    loadVendorIntelligence();
  }, 250);
});
applyIntelligenceTagsButton?.addEventListener("click", applySelectedIntelligenceTags);
promoteIntelligenceSelectedButton?.addEventListener("click", promoteSelectedIntelligenceVendors);
refreshVendorFunnelButton?.addEventListener("click", () => loadVendorFunnel({ force: true }));
vendorFunnelSearch?.addEventListener("input", () => {
  window.clearTimeout(vendorFunnelSearch._timer);
  vendorFunnelSearch._timer = window.setTimeout(() => {
    vendorFunnelSearchTerm = vendorFunnelSearch.value || "";
    applyVendorFunnelFilters();
  }, 200);
});
vendorFunnelHealthFilter?.addEventListener("change", () => {
  vendorFunnelHealthValue = vendorFunnelHealthFilter.value || "";
  applyVendorFunnelFilters();
});
vendorFunnelQuoteFilter?.addEventListener("change", () => {
  vendorFunnelQuoteValue = vendorFunnelQuoteFilter.value || "";
  applyVendorFunnelFilters();
});
vendorFunnelHideEmpty?.addEventListener("change", () => {
  vendorFunnelHideEmptyStages = Boolean(vendorFunnelHideEmpty.checked);
  applyVendorFunnelFilters();
});
clearVendorFunnelFiltersButton?.addEventListener("click", clearVendorFunnelFilters);
vendorFunnelMoveStageButton?.addEventListener("click", () => {
  bulkMoveActiveFunnelStage(vendorFunnelBulkStage?.value, "Move");
});
vendorFunnelAdvanceStageButton?.addEventListener("click", () => {
  const nextStage = relativeFunnelStage(activeFunnelStage, 1);
  if (!nextStage) {
    setStatus(vendorFunnelStatus, `${stageLabel(activeFunnelStage)} is already the final stage.`, "warning");
    return;
  }
  bulkMoveActiveFunnelStage(nextStage, "Advance");
});
vendorFunnelRegressStageButton?.addEventListener("click", () => {
  const previousStage = relativeFunnelStage(activeFunnelStage, -1);
  if (!previousStage) {
    setStatus(vendorFunnelStatus, `${stageLabel(activeFunnelStage)} is already the first stage.`, "warning");
    return;
  }
  bulkMoveActiveFunnelStage(previousStage, "Move back");
});
refreshVendorMatchButton?.addEventListener("click", () => analyzeVendorMatchQueue({ force: true }));
matchStagingVendorsButton?.addEventListener("click", () => runVendorMatchScope("staging"));
matchRatewareVendorsButton?.addEventListener("click", () => runVendorMatchScope("rateware"));
downloadVendorMatchErrorsButton?.addEventListener("click", () => {
  const downloaded = downloadVendorMatchErrors(
    vendorMatchRows,
    Boolean(vendorMatchSummary.staging?.unmatched_errors_truncated || vendorMatchSummary.rateware?.unmatched_errors_truncated)
  );
  setStatus(vendorMatchStatus, downloaded ? "Vendor match errors CSV downloaded." : "No vendor match errors to download.", downloaded ? "success" : "warning");
});
vendorFunnelStrip?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-funnel-stage-filter]");
  if (!button) return;
  setActiveFunnelStage(button.dataset.funnelStageFilter, { scroll: true });
});
vendorFunnelBoard?.addEventListener("dragstart", (event) => {
  if (event.target.closest("button, select, input, a")) {
    event.preventDefault();
    return;
  }
  const card = event.target.closest("[data-funnel-vendor-id]");
  if (!card) return;
  event.dataTransfer.setData("text/plain", card.dataset.funnelVendorId);
  event.dataTransfer.effectAllowed = "move";
  card.classList.add("is-dragging");
});
vendorFunnelBoard?.addEventListener("dragend", (event) => {
  event.target.closest("[data-funnel-vendor-id]")?.classList.remove("is-dragging");
});
vendorFunnelBoard?.addEventListener("dragover", (event) => {
  const column = event.target.closest("[data-funnel-drop-stage]");
  if (!column) return;
  event.preventDefault();
  column.classList.add("is-drop-target");
});
vendorFunnelBoard?.addEventListener("dragleave", (event) => {
  const column = event.target.closest("[data-funnel-drop-stage]");
  if (!column || column.contains(event.relatedTarget)) return;
  column.classList.remove("is-drop-target");
});
vendorFunnelBoard?.addEventListener("drop", (event) => {
  const column = event.target.closest("[data-funnel-drop-stage]");
  if (!column) return;
  event.preventDefault();
  column.classList.remove("is-drop-target");
  moveVendorFunnelStage(event.dataTransfer.getData("text/plain"), column.dataset.funnelDropStage);
});
vendorFunnelBoard?.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-funnel-stage-select]");
  if (!select) return;
  const vendorId = select.dataset.funnelVendorId;
  const targetStage = select.value;
  const currentStage = select.dataset.funnelCurrentStage;
  if (!vendorId || !targetStage || targetStage === currentStage) return;
  select.disabled = true;
  const moved = await moveVendorFunnelStage(vendorId, targetStage);
  if (!moved) {
    select.value = currentStage;
    select.disabled = false;
  }
});
document.addEventListener("click", (event) => {
  const retryButton = event.target.closest("[data-retry-action]");
  if (retryButton) {
    const action = retryButton.dataset.retryAction;
    if (action === "load-vendors") loadVendors();
    if (action === "load-vendor-segments") loadSegments();
    if (action === "refresh-vendor-intelligence") loadVendorIntelligence();
    if (action === "refresh-vendor-funnel") loadVendorFunnel();
    return;
  }

  const tabTargetButton = event.target.closest("[data-vendor-tab-target]");
  if (tabTargetButton) {
    activateVendorTab(tabTargetButton.dataset.vendorTabTarget || "sourcing");
    return;
  }

  const vendorOpenButton = event.target.closest("[data-vendor-open]");
  if (vendorOpenButton) {
    activateVendorTab(vendorOpenButton.dataset.vendorOpen || "sourcing");
    return;
  }

  const showMoreFunnelButton = event.target.closest("[data-funnel-show-more]");
  if (showMoreFunnelButton) {
    showMoreVendorFunnelStage(showMoreFunnelButton.dataset.funnelShowMore);
    return;
  }

  const openButton = event.target.closest("[data-funnel-open]");
  if (openButton) {
    openVendorDrawer(openButton.dataset.funnelOpen);
    return;
  }
});
vendorIntelligenceBody?.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".vendor-intelligence-select");
  if (!checkbox) return;
  if (checkbox.checked) selectedVendorIntelligenceIds.add(checkbox.dataset.vendorIntelligenceId);
  else selectedVendorIntelligenceIds.delete(checkbox.dataset.vendorIntelligenceId);
  updateVendorIntelligenceSelectionState();
});
vendorIntelligenceBody?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-vendor-intelligence-open]");
  if (!button) return;
  searchInput.value = button.dataset.vendorIntelligenceOpen || "";
  activateVendorTab("sourcing");
});

refreshButton.addEventListener("click", () => loadVendors({ force: true }));
downloadOnboardingGapsButton?.addEventListener("click", downloadVendorOnboardingGaps);
statusFilter.addEventListener("change", () => {
  resetVendorPageAndLoad();
});
searchInput.addEventListener("change", () => {
  resetVendorPageAndLoad();
});
channelFilter.addEventListener("change", resetVendorPageAndLoad);
tagFilter.addEventListener("change", resetVendorPageAndLoad);
coverageFilter.addEventListener("change", resetVendorPageAndLoad);
clearVendorFiltersButton.addEventListener("click", () => {
  resetVendorWorkspace();
});
vendorPageSizeSelect.addEventListener("change", () => {
  vendorPageSize = VENDOR_PAGE_SIZES.includes(Number(vendorPageSizeSelect.value)) ? Number(vendorPageSizeSelect.value) : 75;
  resetVendorPageAndLoad();
});
vendorPrevPageButton.addEventListener("click", () => {
  vendorPageOffset = Math.max(0, vendorPageOffset - vendorPageSize);
  persistVendorWorkspaceContext();
  clearVendorSelection();
  loadVendors();
});
vendorNextPageButton.addEventListener("click", () => {
  if (vendorPageOffset + vendorPageSize >= vendorTotalCount) return;
  vendorPageOffset += vendorPageSize;
  persistVendorWorkspaceContext();
  clearVendorSelection();
  loadVendors();
});
selectVisibleVendorsButton.addEventListener("click", selectVisibleVendors);
clearVendorSelectionButton.addEventListener("click", clearVendorSelection);
vendorTabs.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.vendorTab === "sourcing") {
      setCrmView("spreadsheet");
      return;
    }
    activateVendorTab(button.dataset.vendorTab);
  });
});
crmViewButtons.forEach((button) => {
  button.addEventListener("click", () => setCrmView(button.dataset.crmView));
});
directoryBaseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    renderVendorSavedViews("");
    activateVendorTab(button.dataset.baseTab);
  });
});
vendorColumnOptions?.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-vendor-column-toggle]");
  if (!checkbox) return;
  setVendorColumnVisibility(checkbox.dataset.vendorColumnToggle, checkbox.checked);
});
resetVendorColumnsButton?.addEventListener("click", () => {
  window.localStorage.removeItem(VENDOR_COLUMN_STORAGE_KEY);
  renderVendorColumnMenu();
  renderVendorSavedViews("");
  renderVendors(currentVendors);
});
vendorSavedViewSelect?.addEventListener("change", () => {
  const viewId = vendorSavedViewSelect.value;
  if (!viewId) {
    renderVendorSavedViews("");
    return;
  }
  applyVendorSavedView(viewId);
});
saveVendorViewButton?.addEventListener("click", saveCurrentVendorView);
deleteVendorViewButton?.addEventListener("click", deleteCurrentVendorView);
quickFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyQuickFilter(button.dataset.quickFilter);
  });
});
searchInput.addEventListener("input", () => {
  window.clearTimeout(searchInput._timer);
  searchInput._timer = window.setTimeout(resetVendorPageAndLoad, 300);
});
vendorsBody.addEventListener("click", (event) => {
  const button = event.target.closest(".vendor-profile-button, .vendor-logo-button");
  if (!button) return;
  openVendorDrawer(button.dataset.vendorId);
});
vendorCardGrid?.addEventListener("click", (event) => {
  const button = event.target.closest(".vendor-profile-button");
  if (button) {
    openVendorDrawer(button.dataset.vendorId);
    return;
  }
  if (event.target.closest("input, select, textarea, button, a")) return;
  const card = event.target.closest("[data-vendor-card-id]");
  if (card) openVendorDrawer(card.dataset.vendorCardId);
});
vendorsBody.addEventListener("change", (event) => {
  const cell = event.target.closest(".vendor-cell-input");
  if (cell?.tagName === "SELECT") {
    saveVendorCell(cell);
    return;
  }
  const checkbox = event.target.closest(".vendor-select");
  if (!checkbox) return;
  if (checkbox.checked) selectedVendorIds.add(checkbox.dataset.vendorId);
  else selectedVendorIds.delete(checkbox.dataset.vendorId);
  updateBulkState();
  renderVendorCards(currentVendors);
});
vendorsBody.addEventListener("focusout", (event) => {
  const cell = event.target.closest(".vendor-cell-input");
  if (!cell || cell.tagName === "SELECT") return;
  saveVendorCell(cell);
});
vendorsBody.addEventListener("keydown", (event) => {
  const cell = event.target.closest(".vendor-cell-input");
  if (!cell || cell.tagName === "SELECT") return;
  if (event.key === "Enter") {
    event.preventDefault();
    cell.blur();
  }
  if (event.key === "Escape") {
    cell.value = cell.dataset.originalValue || "";
    cell.blur();
  }
});
vendorCardGrid?.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".vendor-select");
  if (!checkbox) return;
  if (checkbox.checked) selectedVendorIds.add(checkbox.dataset.vendorId);
  else selectedVendorIds.delete(checkbox.dataset.vendorId);
  updateBulkState();
  renderVendorCards(currentVendors);
});
vendorsFilterRow?.addEventListener("input", (event) => {
  const control = event.target.closest("[data-vendor-filter]");
  if (!control || control.tagName === "SELECT") return;
  window.clearTimeout(control._timer);
  control._timer = window.setTimeout(() => applyVendorInlineFilter(control.dataset.vendorFilter, control.value), 300);
});
vendorsFilterRow?.addEventListener("change", (event) => {
  const control = event.target.closest("[data-vendor-filter]");
  if (!control) return;
  applyVendorInlineFilter(control.dataset.vendorFilter, control.value);
});
vendorsFilterRow?.addEventListener("click", (event) => {
  const clear = event.target.closest("[data-vendor-filter-clear]");
  if (!clear) return;
  resetVendorWorkspace();
});
closeDrawerButton.addEventListener("click", () => {
  activeDrawerVendorId = null;
  vendorDrawerContextVersion += 1;
  vendorDrawerSupportLoadVersion += 1;
  vendorDrawerRelationshipLoadVersion += 1;
  drawer.classList.add("hidden");
});
drawerEditToggle?.addEventListener("click", () => {
  const isEditing = drawer.dataset.mode === "edit";
  setDrawerMode(isEditing ? "view" : "edit", { focus: !isEditing });
});
drawerLogoFile?.addEventListener("change", handleDrawerLogoUpload);
drawer.addEventListener("click", (event) => {
  const profileLinkButton = event.target.closest("[data-copy-profile-link]");
  if (profileLinkButton) {
    copyVendorProfileLink(profileLinkButton.dataset.copyProfileLink);
    return;
  }
  const supportButton = event.target.closest("[data-drawer-support-status]");
  if (supportButton) {
    const ticketCard = supportButton.closest("[data-drawer-support-ticket]");
    const ticketId = ticketCard?.dataset.drawerSupportTicket;
    const status = supportButton.dataset.drawerSupportStatus;
    const vendorId = activeDrawerVendorId;
    const contextVersion = vendorDrawerContextVersion;
    if (ticketId && status && vendorId) {
      supportButton.disabled = true;
      updateVendorSupportTicket(ticketId, { status })
        .then(() => {
          if (activeDrawerVendorId !== vendorId || vendorDrawerContextVersion !== contextVersion) return;
          loadDrawerVendorSupport(vendorId);
          loadDrawerVendorRelationship(vendorId);
        })
        .catch((error) => {
          if (activeDrawerVendorId === vendorId && vendorDrawerContextVersion === contextVersion) {
            setStatus(drawerEditStatus, humanizeError(error), "error");
          }
        })
        .finally(() => {
          if (activeDrawerVendorId === vendorId && vendorDrawerContextVersion === contextVersion) supportButton.disabled = false;
        });
    }
    return;
  }
  const replaceEmailButton = event.target.closest("[data-replace-bounced-email]");
  if (replaceEmailButton) {
    const issue = replaceEmailButton.closest("[data-email-delivery-issue]");
    const replacementEmail = issue?.querySelector("[data-replacement-email]")?.value?.trim();
    const bouncedEmail = replaceEmailButton.dataset.replaceBouncedEmail;
    if (!bouncedEmail || !replacementEmail) {
      setStatus(drawerEditStatus, "Enter a replacement email before resolving this delivery failure.", "error");
      return;
    }
    const vendorId = activeDrawerVendorId;
    const contextVersion = vendorDrawerContextVersion;
    if (!vendorId) return;
    replaceEmailButton.disabled = true;
    setStatus(drawerEditStatus, "Replacing bounced email...");
    requirePrivatePage()
      .then(() => replaceBouncedVendorEmail(vendorId, { bouncedEmail, replacementEmail }))
      .then((updated) => {
        if (activeDrawerVendorId !== vendorId || vendorDrawerContextVersion !== contextVersion) return;
        replaceVendorInState(updated);
        applyVendorUpdateToFunnel(updated);
        renderVendors(currentVendors);
        openVendorDrawer(updated.id, { mode: "edit" });
        setStatus(drawerEditStatus, "Replacement email saved and re-enabled for future outreach.", "success");
      })
      .catch((error) => {
        if (activeDrawerVendorId === vendorId && vendorDrawerContextVersion === contextVersion) {
          setStatus(drawerEditStatus, humanizeError(error), "error");
        }
      })
      .finally(() => {
        if (activeDrawerVendorId === vendorId && vendorDrawerContextVersion === contextVersion) replaceEmailButton.disabled = false;
      });
    return;
  }
  const button = event.target.closest("[data-ai-suggestion-type]");
  if (!button) return;
  applyDrawerSuggestion(button.dataset.aiSuggestionType, button.dataset.aiSuggestionValue);
});
function refreshDrawerIdentity(vendor) {
  if (!vendor || activeDrawerVendorId !== vendor.id) return;
  document.querySelector("#drawer-vendor-name").textContent = vendor.vendor_name || "Vendor";
  if (drawerLogoPreview) drawerLogoPreview.innerHTML = renderVendorAvatar(vendor, "drawer");
  document.querySelector("#drawer-badges").innerHTML = renderDrawerBadges(vendor);
  document.querySelector("#drawer-quick-actions").innerHTML = renderDrawerQuickActions(vendor);
}

async function saveDrawerChanges(scope = "all") {
  if (!activeDrawerVendorId) return;
  const vendorId = activeDrawerVendorId;
  const contextVersion = vendorDrawerContextVersion;
  const patch = buildDrawerPartialPatch(scope);
  if (!Object.keys(patch).length) {
    setStatus(drawerEditStatus, "No changes to save.", "success");
    renderDrawerDirtyState();
    return;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "primary_email") || Object.prototype.hasOwnProperty.call(patch, "secondary_emails")) {
    const validationMessage = emailValidationMessage(document.querySelector("#drawer-edit-email")?.value);
    if (validationMessage) {
      setStatus(drawerEditStatus, validationMessage, "error");
      return;
    }
  }
  drawerSaveInFlight = true;
  renderDrawerDirtyState();
  setStatus(drawerEditStatus, scope === "profile" ? "Saving carrier profile..." : "Saving vendor changes...");

  try {
    await requirePrivatePage();
    const current = findVendorById(vendorId) || {};
    const updated = await updateVendor(vendorId, patch);
    const nextVendor = { ...current, ...updated };
    replaceVendorInState(nextVendor);
    applyVendorUpdateToFunnel(nextVendor);
    renderVendors(currentVendors);
    if (activeDrawerVendorId !== vendorId || vendorDrawerContextVersion !== contextVersion) return;
    refreshDrawerIdentity(nextVendor);
    setDrawerBaseline();
    setStatus(drawerEditStatus, scope === "profile" ? "Carrier profile saved." : "Vendor changes saved.", "success");
  } catch (error) {
    if (activeDrawerVendorId === vendorId && vendorDrawerContextVersion === contextVersion) {
      setStatus(drawerEditStatus, humanizeError(error), "error");
    }
  } finally {
    if (activeDrawerVendorId === vendorId && vendorDrawerContextVersion === contextVersion) {
      drawerSaveInFlight = false;
      renderDrawerDirtyState();
    }
  }
}

drawerEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveDrawerChanges("all");
});
drawerSaveProfileButton?.addEventListener("click", () => saveDrawerChanges("profile"));
drawerEditForm?.addEventListener("input", renderDrawerDirtyState);
drawerEditForm?.addEventListener("change", renderDrawerDirtyState);
drawerArchiveButton.addEventListener("click", async () => {
  if (!activeDrawerVendorId) return;
  const vendorId = activeDrawerVendorId;
  const contextVersion = vendorDrawerContextVersion;
  const vendor = findVendorById(vendorId);
  const restoring = vendor?.base_stage === "archived";
  const patch = restoring ? { base_stage: "sourcing", status: "active" } : { base_stage: "archived" };
  drawerArchiveButton.disabled = true;
  setStatus(drawerEditStatus, restoring ? "Restoring vendor..." : "Archiving vendor...");

  try {
    await requirePrivatePage();
    const current = findVendorById(vendorId) || {};
    const updated = await updateVendor(vendorId, patch);
    const nextVendor = { ...current, ...updated };
    replaceVendorInState(nextVendor);
    applyVendorUpdateToFunnel(nextVendor);
    renderVendors(currentVendors);
    if (activeDrawerVendorId !== vendorId || vendorDrawerContextVersion !== contextVersion) return;
    setStatus(drawerEditStatus, restoring ? "Vendor restored to Sourcing Base." : "Vendor archived.", "success");
    openVendorDrawer(nextVendor.id);
  } catch (error) {
    if (activeDrawerVendorId === vendorId && vendorDrawerContextVersion === contextVersion) {
      setStatus(drawerEditStatus, humanizeError(error), "error");
    }
  } finally {
    if (activeDrawerVendorId === vendorId && vendorDrawerContextVersion === contextVersion) drawerArchiveButton.disabled = false;
  }
});

initAuthControls();
requirePrivatePage()
  .then(() =>
    applyPermissionState(
      "#save-vendor-button, #wizard-save-button, #vendor-import, #vendor-gaps-import, #import-google-sheet-button, #download-onboarding-gaps-button, #import-onboarding-gaps-button, #select-visible-vendors-button, #clear-vendor-selection-button, #bulk-update-button, #bulk-procurement-button, #bulk-archive-vendors-button, #bulk-remove-vendors-button, #confirm-import-button, #save-segment-button, #drawer-save-button, #drawer-save-profile-button, #drawer-archive-button, #apply-intelligence-tags, #promote-intelligence-selected, #vendor-funnel-bulk-stage, #vendor-funnel-move-stage, #vendor-funnel-advance-stage, #vendor-funnel-regress-stage, #match-staging-vendors, #match-rateware-vendors, [data-duplicate-inactive], [data-funnel-stage-select]",
      "vendors:manage"
    )
  )
  .catch(() => {});
renderWizard();
renderVendorColumnMenu();
if (searchInput) searchInput.value = String(storedVendorWorkspaceContext.search || "");
if (statusFilter) statusFilter.value = String(storedVendorWorkspaceContext.status || "");
if (channelFilter) channelFilter.value = String(storedVendorWorkspaceContext.channel || "");
if (tagFilter) tagFilter.value = String(storedVendorWorkspaceContext.tag || "");
if (coverageFilter) coverageFilter.value = String(storedVendorWorkspaceContext.coverage || "");
if (vendorPageSizeSelect) vendorPageSizeSelect.value = String(vendorPageSize);
quickFilterButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.quickFilter === activeQuickFilter));
if (vendorFunnelSearch) vendorFunnelSearch.value = vendorFunnelSearchTerm;
if (vendorFunnelHealthFilter) vendorFunnelHealthFilter.value = vendorFunnelHealthValue;
if (vendorFunnelQuoteFilter) vendorFunnelQuoteFilter.value = vendorFunnelQuoteValue;
if (vendorFunnelHideEmpty) vendorFunnelHideEmpty.checked = vendorFunnelHideEmptyStages;
renderVendorSavedViews("");
activateVendorTab(activeVendorTab);
updateBulkState();
installSpreadsheetGrid({
  container: vendorsTableWrap || vendorsBody,
  rowSelector: "[data-vendor-row-id]",
  cellSelector: "[data-vendor-cell]",
  saveRow: saveVendorGridRow,
  onRowsChanged: (rows) => {
    if (!rows.length) return;
    setStatus(vendorGridStatus, `Saving ${rows.length} vendor row(s)...`);
    rows.forEach((row) => saveVendorGridRow(row));
  },
  onGridMessage: (message) => setStatus(vendorGridStatus, message, "success"),
  onSelectionChange: (info) => {
    if (!vendorGridSelection) return;
    if (!info?.cells) {
      vendorGridSelection.textContent = "Ready";
      return;
    }
    const cellLabel = info.cells === 1 ? "cell" : "cells";
    const numericLabel = info.numeric?.count ? ` · ${info.numeric.count} numeric` : "";
    vendorGridSelection.textContent = `${info.cells} ${cellLabel} selected${numericLabel}`;
  }
});
