import { humanizeError } from "./error-copy.js";
import { fetchCustomerRfi, saveCustomerRfi, submitCustomerRfi } from "./customer-rfi-service.js";

const XLSX_MODULE_URL = "https://esm.sh/xlsx@0.18.5";
const EXCELJS_MODULE_URL = "https://esm.sh/exceljs@4.4.0?bundle";
let xlsxModulePromise = null;
let excelJsModulePromise = null;

const params = new URLSearchParams(window.location.search);
const token = params.get("token") || "";

const state = {
  project: null,
  link: null,
  submission: null,
  origins: [],
  destinations: [],
  lanes: [],
  segmentChecklists: [],
  activeSegmentKey: "crossborder",
  activeWorkspaceView: "lanes",
  activeHelpKey: "",
  locale: window.localStorage.getItem("rateware_customer_rfi_locale") === "es" ? "es" : "en",
  submitted: false,
  loading: false
};

const els = {
  title: document.getElementById("customer-rfi-title"),
  subtitle: document.getElementById("customer-rfi-subtitle"),
  statusPill: document.getElementById("customer-rfi-status-pill"),
  completeness: document.getElementById("customer-rfi-completeness"),
  message: document.getElementById("customer-rfi-message"),
  company: document.getElementById("rfi-account-company"),
  contact: document.getElementById("rfi-account-contact"),
  scope: document.getElementById("rfi-account-scope"),
  crossborder: document.getElementById("rfi-crossborder"),
  laneHead: document.getElementById("rfi-lanes-head"),
  lanes: document.getElementById("rfi-lanes"),
  segmentChecklists: document.getElementById("rfi-segment-checklists"),
  segmentTabs: document.getElementById("rfi-segment-tabs"),
  segmentFiles: document.getElementById("rfi-segment-files"),
  activeSegmentTitle: document.getElementById("rfi-active-segment-title"),
  catalogs: document.getElementById("rfi-catalogs"),
  helpDialog: document.getElementById("rfi-help-dialog"),
  helpTitle: document.getElementById("rfi-help-title"),
  helpContent: document.getElementById("rfi-help-content"),
  downloadSegmentTemplate: document.getElementById("download-rfi-segment-template"),
  playHelp: document.getElementById("play-rfi-help"),
  stopHelp: document.getElementById("stop-rfi-help"),
  closeHelp: document.getElementById("close-rfi-help"),
  addLane: document.getElementById("add-lane-row"),
  importSegmentTemplate: document.getElementById("import-rfi-segment-template"),
  importSegmentTemplateFile: document.getElementById("import-rfi-segment-template-file"),
  segmentTemplateName: document.getElementById("rfi-segment-template-name"),
  importAsNewSegment: document.getElementById("rfi-import-as-new-segment"),
  segmentTemplateState: document.getElementById("rfi-segment-template-state"),
  save: document.getElementById("save-customer-rfi"),
  submit: document.getElementById("submit-customer-rfi")
};

const UI_COPY = {
  en: {
    customerRfi: "Customer RFI", completeness: "Completeness", accountOverview: "Account overview", accountOverviewDetail: "Project account details", companyUnit: "Company / business unit", primaryContact: "Primary contact", scopeSummary: "Scope summary", operatingSegments: "Operating segments", segmentSelection: "Select the operating scope", crossborderDetails: "Crossborder details", rfiWizard: "RFI Wizard", smartSetup: "Build the intake by operating segment", wizardHelp: "Pick the operating models that apply. The route matrix and carrier checklist will follow the selected segment tabs.", wizardCrossborder: "Crossborder D2D", wizardLocal: "Local FTL", wizardRegional: "Regional FTL", wizardNational: "National FTL", wizardExpedited: "Expedited", wizardTimeCritical: "Time critical", wizardPort: "Port drayage", operatingWorkspace: "Operating workspace", segmentScopeHelp: "Tabs are created from the operating scope selected above.", workspaceRoutes: "Routes", workspaceRequirements: "Requirements", workspaceFiles: "Files", workspaceFilesDetail: "Instructions and supporting files", routeSchedule: "Route schedule", routeScheduleDetail: "Lane schedule", routeHelp: "Type a catalog suggestion or enter a new value. Required: origin, destination, truck type, weekly volume.", importWorkbook: "Import XLSX", downloadTemplate: "Download template", downloadSegmentTemplate: "Download segment template", importSegmentTemplate: "Import segment template", segmentTemplateName: "Segment name", importAsNewSegment: "Create as new segment", segmentTemplateHelp: "This workbook contains only the active segment: routes, rubrics, instructions, and catalog.", addLane: "Add lane", addRubric: "Add rubric", removeRubric: "Remove", customRubric: "Custom rubric", listen: "Listen", stopReading: "Stop", audioUnavailable: "Audio is not available in this browser.", segmentLocal: "Local FTL", segmentRegional: "Regional FTL", segmentNational: "National FTL", segmentCrossborder: "Crossborder FTL", segmentExpedited: "Expedited Ground", segmentTimeCritical: "Time Critical Ground", segmentPortUs: "Port Drayage US", segmentPortMx: "Port Drayage MX", segmentRubrics: "Segment rubrics", checklistDetail: "Carrier confirmation checklist", rubricHelp: "Select what must be confirmed and document the operational answer or exception.", addSegment: "Add segment", saveDraft: "Save draft", submitFinal: "Submit final RFI", close: "Close", fieldGuide: "Field guide", remove: "Remove", segment: "Segment", name: "Name", operationModel: "Operation model", suggestions: "Suggestions", validate: "Required", topic: "Topic", whatToAsk: "What to ask", expectedAnswer: "Expected answer", observations: "Notes", actions: "Actions", rubricObservationPlaceholder: "Response, criterion, exception or note...", fileVault: "File vault", vaultHelp: "Drop files here to keep their names with this segment, or paste a Drive / SharePoint link below.", browse: "Browse", attachmentLinks: "Files and links", segmentDetails: "Segment details", noLanes: "No lanes in this segment yet.", workbookHelp: "This guide explains the requested data. It does not replace customer-specific instructions.", language: "Language", markAllRequired: "Require all", clearRequired: "Clear group"
  },
  es: {
    customerRfi: "RFI del cliente", completeness: "Completitud", accountOverview: "Resumen de cuenta", accountOverviewDetail: "Datos del proyecto", companyUnit: "Empresa / unidad de negocio", primaryContact: "Contacto principal", scopeSummary: "Resumen de alcance", operatingSegments: "Segmentos operativos", segmentSelection: "Selecciona el alcance operativo", crossborderDetails: "Detalles transfronterizos", rfiWizard: "RFI Wizard", smartSetup: "Arma la captura por segmento operativo", wizardHelp: "Elige los modelos operativos que aplican. La matriz de rutas y el checklist seguiran los tabs seleccionados.", wizardCrossborder: "Crossborder D2D", wizardLocal: "Local FTL", wizardRegional: "Regional FTL", wizardNational: "Nacional FTL", wizardExpedited: "Expeditado", wizardTimeCritical: "Time critical", wizardPort: "Port drayage", operatingWorkspace: "Espacio de trabajo operativo", segmentScopeHelp: "Los tabs se crean desde el alcance operativo seleccionado arriba.", workspaceRoutes: "Rutas", workspaceRequirements: "Requisitos", workspaceFiles: "Archivos", workspaceFilesDetail: "Instructivos y archivos de soporte", routeSchedule: "Cedula de rutas", routeScheduleDetail: "Matriz de rutas", routeHelp: "Elige una sugerencia del catalogo o escribe un valor nuevo. Obligatorio: origen, destino, tipo de camion y volumen semanal.", importWorkbook: "Importar XLSX", downloadTemplate: "Descargar template", downloadSegmentTemplate: "Descargar template del segmento", importSegmentTemplate: "Importar template del segmento", segmentTemplateName: "Nombre del segmento", importAsNewSegment: "Crear como segmento nuevo", segmentTemplateHelp: "Este libro contiene solo el segmento activo: rutas, rubros, instructivo y catalogo.", addLane: "Agregar ruta", addRubric: "Agregar rubro", removeRubric: "Eliminar", customRubric: "Rubro personalizado", listen: "Escuchar", stopReading: "Detener", audioUnavailable: "El audio no esta disponible en este navegador.", segmentLocal: "Local FTL", segmentRegional: "Regional FTL", segmentNational: "Nacional FTL", segmentCrossborder: "Crossborder FTL", segmentExpedited: "Expedited Ground", segmentTimeCritical: "Time Critical Ground", segmentPortUs: "Port Drayage US", segmentPortMx: "Port Drayage MX", segmentRubrics: "Rubros por segmento", checklistDetail: "Checklist de confirmacion del carrier", rubricHelp: "Marca lo que el carrier debe confirmar y documenta la respuesta o excepcion operativa.", addSegment: "Agregar segmento", saveDraft: "Guardar borrador", submitFinal: "Enviar RFI final", close: "Cerrar", fieldGuide: "Guia de campos", remove: "Eliminar", segment: "Segmento", name: "Nombre", operationModel: "Modelo operativo", suggestions: "Sugerencias", validate: "Validar", topic: "Rubro", whatToAsk: "Que preguntar", expectedAnswer: "Respuesta esperada", observations: "Observaciones", actions: "Acciones", rubricObservationPlaceholder: "Respuesta, criterio, excepcion o nota...", fileVault: "Boveda de archivos", vaultHelp: "Arrastra archivos para conservar sus nombres dentro del segmento o pega un enlace de Drive / SharePoint abajo.", browse: "Explorar", attachmentLinks: "Archivos y enlaces", segmentDetails: "Detalles del segmento", noLanes: "Aun no hay rutas en este segmento.", workbookHelp: "Esta guia explica la informacion solicitada. No reemplaza instrucciones especificas del cliente.", language: "Idioma", markAllRequired: "Requerir todos", clearRequired: "Limpiar grupo"
  }
};

Object.assign(UI_COPY.en, {
  segmentTemplateReady: "Segment loaded. You can download its template or import an updated workbook.",
  segmentTemplateNeedsSegment: "Select an operating segment to enable its template.",
  segmentTemplateNeedsToken: "Open a signed RFI link to load a segment template."
});
Object.assign(UI_COPY.es, {
  segmentTemplateReady: "Segmento cargado. Puedes descargar su template o importar un libro actualizado.",
  segmentTemplateNeedsSegment: "Selecciona un segmento operativo para habilitar su template.",
  segmentTemplateNeedsToken: "Abre un enlace RFI firmado para cargar un template de segmento."
});

const RFI_HELP = {
  account: { en: ["Account overview", "Identifies the customer, accountable contact, and the procurement scope. Keep this brief and operational."], es: ["Resumen de cuenta", "Identifica al cliente, contacto responsable y alcance de procurement. Mantenlo breve y operativo."] },
  segments: { en: ["Operating segments", "Choose every operating model in scope. Each selected segment has its own route schedule, checklist, notes, and file references."], es: ["Segmentos operativos", "Selecciona cada modelo operativo incluido. Cada segmento tiene su propia cedula, checklist, notas y referencias de archivos."] },
  segment: { en: ["Segment tabs", "Use one tab per operating segment. Route rows and carrier requirements remain isolated so a crossborder project does not mix with domestic or expedited rules."], es: ["Tabs de segmento", "Usa un tab por segmento operativo. Las rutas y requisitos quedan aislados para no mezclar reglas crossborder, domesticas o expeditadas."] },
  routes: { en: ["Route schedule", "Capture one route per row. Catalog fields suggest standardized values, but you can type a value not yet in the catalog. The RFI preserves your exact input."], es: ["Cedula de rutas", "Captura una ruta por renglon. Los campos de catalogo sugieren valores estandarizados, pero puedes escribir uno nuevo. El RFI conserva tu entrada exacta."] },
  rubrics: { en: ["Segment rubrics", "Mark only requirements that apply to this segment. Add a concise note beside each requirement so carriers know how to confirm compliance or declare an exception."], es: ["Rubros por segmento", "Marca solo los requisitos que aplican al segmento. Agrega una observacion breve para que el carrier confirme cumplimiento o declare una excepcion."] },
  logistics_model: { en: ["Logistics model", "Defines how the freight should move: direct, transfer, border model, live or drop, dedicated, and urgency."], es: ["Modelo logistico", "Define como debe moverse la carga: directo, transfer, modelo de frontera, live o drop, dedicado y urgencia."] },
  operation_criteria: { en: ["Operation criteria", "Documents the execution standard: appointment, pickup and delivery windows, handling, contacts, tracking, and escalation."], es: ["Criterios de operacion", "Documenta el estandar de ejecucion: citas, ventanas, manejo, contactos, tracking y escalamiento."] },
  business_rules: { en: ["Business rules", "Captures commercial and risk conditions that can materially change the real cost of a lane."], es: ["Reglas de negocio", "Captura condiciones comerciales y de riesgo que pueden cambiar materialmente el costo real de una ruta."] },
  service_specifications: { en: ["Service specifications", "Defines the physical and documentation standard for the unit, cargo, security, tracking, and POD."], es: ["Especificaciones de servicio", "Define el estandar fisico y documental de unidad, carga, seguridad, tracking y POD."] },
  carrier_requirements: { en: ["Required carrier profile", "States the carrier eligibility criteria that later become RFx qualification filters."], es: ["Perfil requerido del carrier", "Establece criterios de elegibilidad que despues se convierten en filtros de calificacion RFx."] },
  other_notes: { en: ["Notes and exceptions", "Use structured notes for site, carrier, financial, security, seasonal, and crossborder exceptions."], es: ["Notas y excepciones", "Usa notas estructuradas para excepciones de sitio, carrier, finanzas, seguridad, temporada y frontera."] },
  vault: { en: ["File vault", "Add customer instructions, SOPs, maps, site guides, or supporting files by dropping a file name or pasting a durable file link. Files are not uploaded until a storage link is supplied."], es: ["Boveda de archivos", "Agrega instructivos, SOPs, mapas, guias de sitio o soportes dejando el nombre del archivo o pegando un enlace durable. Los archivos no se cargan hasta que exista un enlace de almacenamiento."] }
};

function ui(key) {
  return UI_COPY[state.locale]?.[key] || UI_COPY.en[key] || key;
}

const SEGMENT_OPTIONS = [
  { value: "local_ftl", label: "Local FTL", i18n: "segmentLocal" },
  { value: "regional_ftl", label: "Regional FTL", i18n: "segmentRegional" },
  { value: "national_ftl", label: "National FTL", i18n: "segmentNational" },
  { value: "crossborder", label: "Crossborder FTL", i18n: "segmentCrossborder" },
  { value: "expedited", label: "Expedited Ground", i18n: "segmentExpedited" },
  { value: "time_critical", label: "Time Critical Ground", i18n: "segmentTimeCritical" },
  { value: "port_drayage_us", label: "Port Drayage US", i18n: "segmentPortUs" },
  { value: "port_drayage_mx", label: "Port Drayage MX", i18n: "segmentPortMx" }
];

const SEGMENT_KEY_ALIASES = { mx_domestic: "national_ftl", us_domestic: "national_ftl", dedicated: "national_ftl" };

function canonicalSegmentKey(value) {
  const text = cleanText(value);
  if (!text) return "crossborder";
  const aliased = SEGMENT_KEY_ALIASES[text] || text;
  const normalized = normalizeRfiImportHeader(aliased);
  return SEGMENT_OPTIONS.find((option) => (
    normalizeRfiImportHeader(option.value) === normalized
    || normalizeRfiImportHeader(option.label) === normalized
  ))?.value || aliased;
}

function segmentOptionLabel(value) {
  const text = cleanText(value);
  const key = canonicalSegmentKey(text);
  return SEGMENT_OPTIONS.find((option) => option.value === key)?.label
    || ({ mx_domestic: "Mexico domestic", us_domestic: "US domestic", dedicated: "Dedicated" }[text] || text);
}

const OPERATION_OPTIONS = [
  { value: "d2d_export", label: "D2D Export" },
  { value: "d2d_import", label: "D2D Import" },
  { value: "intra_mex", label: "Intra-Mex" },
  { value: "mx_domestic", label: "MX domestic" },
  { value: "us_domestic", label: "US domestic" },
  { value: "crossborder", label: "Crossborder" },
  { value: "local", label: "Local" },
  { value: "regional", label: "Regional" },
  { value: "national", label: "National" }
];

const SERVICE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "expedited", label: "Expedited" },
  { value: "time_critical", label: "Time critical" },
  { value: "dedicated", label: "Dedicated" },
  { value: "spot", label: "Spot" },
  { value: "recurring", label: "Recurring" }
];

const HANDLING_OPTIONS = [
  { value: "", label: "Select" },
  { value: "live", label: "Live" },
  { value: "drop", label: "Drop" },
  { value: "preload", label: "Preload" },
  { value: "drop_and_hook", label: "Drop and hook" },
  { value: "other", label: "Other" }
];

const FACILITY_TYPE_OPTIONS = [
  { value: "", label: "Select" },
  { value: "plant", label: "Plant" },
  { value: "dc", label: "DC" },
  { value: "warehouse", label: "Warehouse" },
  { value: "crossdock", label: "Crossdock" },
  { value: "yard", label: "Yard" },
  { value: "port", label: "Port" },
  { value: "rail_ramp", label: "Rail ramp" },
  { value: "customer_site", label: "Customer site" },
  { value: "supplier_site", label: "Supplier site" },
  { value: "other", label: "Other" }
];

const SCHEDULE_TYPE_OPTIONS = [
  { value: "", label: "Select" },
  { value: "appointment", label: "Appointment" },
  { value: "window", label: "Window" },
  { value: "fcfs", label: "FCFS" },
  { value: "open", label: "Open hours" },
  { value: "scheduled", label: "Scheduled" },
  { value: "tbd", label: "TBD" }
];

const TRUCK_TYPE_OPTIONS = [
  { value: "", label: "Select" },
  { value: "Truck Trailer", label: "Truck Trailer" },
  { value: "Straight Truck", label: "Straight Truck" },
  { value: "Sprinter Van", label: "Sprinter Van" },
  { value: "Cargo Van", label: "Cargo Van" },
  { value: "Box Truck", label: "Box Truck" },
  { value: "Flatbed", label: "Flatbed" },
  { value: "Other", label: "Other" }
];

const EQUIPMENT_TYPE_OPTIONS = [
  { value: "", label: "Select" },
  { value: "Dry Van", label: "Dry Van" },
  { value: "Flatbed", label: "Flatbed" },
  { value: "Reefer", label: "Reefer" },
  { value: "Step Deck", label: "Step Deck" },
  { value: "Tanker", label: "Tanker" },
  { value: "Lowboy", label: "Lowboy" },
  { value: "Other", label: "Other" }
];

const CONFIG_OPTIONS = [
  { value: "", label: "Select" },
  { value: "Single", label: "Single" },
  { value: "Team", label: "Team" },
  { value: "Dedicated", label: "Dedicated" },
  { value: "Drop Trailer", label: "Drop Trailer" },
  { value: "Through Trailer", label: "Through Trailer" },
  { value: "Transfer", label: "Transfer" }
];

const YES_NO_OPTIONS = [
  { value: "", label: "Select" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" }
];

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD" },
  { value: "MXN", label: "MXN" }
];

const PACKAGING_OPTIONS = [
  { value: "palletized", label: "Palletized" },
  { value: "loose", label: "Loose" },
  { value: "crated", label: "Crated" },
  { value: "drums", label: "Drums" },
  { value: "totes", label: "Totes" },
  { value: "other", label: "Other" }
];

const SOURCING_PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" }
];

const SEASONALITY_OPTIONS = [
  { value: "steady", label: "Steady" },
  { value: "seasonal", label: "Seasonal" },
  { value: "peak", label: "Peak" },
  { value: "launch_ramp", label: "Launch / ramp-up" },
  { value: "unknown", label: "Unknown" }
];

const SCHEDULING_TYPE_OPTIONS = [
  { value: "recurring", label: "Recurring" },
  { value: "spot", label: "Spot" },
  { value: "appointment", label: "Appointment" },
  { value: "same_day", label: "Same day" },
  { value: "as_required", label: "As required" }
];

const POSITIONING_LEAD_TIME_OPTIONS = [
  { value: "same_day", label: "Same day" },
  { value: "24_hours", label: "24 hours" },
  { value: "48_hours", label: "48 hours" },
  { value: "72_hours", label: "72 hours" },
  { value: "one_week", label: "One week" },
  { value: "other", label: "Other" }
];

const RFI_LANE_COLUMNS = [
  { key: "lane_id", label: "ID Lane", placeholder: "ID #" },
  { key: "origin_location", label: "Ubicacion de salida", placeholder: "City, State", width: 150, required: true },
  { key: "origin_postal_code", label: "Codigo postal de salida", placeholder: "5-digit", width: 96 },
  { key: "origin_shipper", label: "Remitente de salida", placeholder: "Company Name", width: 150 },
  { key: "origin_facility_type", label: "Tipo de instalacion de salida", type: "select", options: FACILITY_TYPE_OPTIONS, width: 128 },
  { key: "origin_load_type", label: "Tipo de carga", type: "select", options: HANDLING_OPTIONS, width: 110 },
  { key: "origin_average_time_hours", label: "Tiempo prom. carga", type: "number", placeholder: "X hrs", width: 88 },
  { key: "origin_schedule_type", label: "Horario recogida", type: "select", options: SCHEDULE_TYPE_OPTIONS, width: 118 },
  { key: "origin_service_window", label: "Ventana recogida", placeholder: "00 AM - 00 PM", width: 132 },
  { key: "destination_location", label: "Ubicacion de llegada", placeholder: "City, State", width: 150, required: true },
  { key: "destination_postal_code", label: "Codigo postal llegada", placeholder: "5-digit", width: 96 },
  { key: "destination_consignee", label: "Consignatario llegada", placeholder: "Company Name", width: 150 },
  { key: "destination_facility_type", label: "Tipo instalacion llegada", type: "select", options: FACILITY_TYPE_OPTIONS, width: 128 },
  { key: "destination_unload_type", label: "Tipo descarga", type: "select", options: HANDLING_OPTIONS, width: 110 },
  { key: "destination_average_time_hours", label: "Tiempo prom. descarga", type: "number", placeholder: "X hrs", width: 88 },
  { key: "destination_schedule_type", label: "Horario entrega", type: "select", options: SCHEDULE_TYPE_OPTIONS, width: 118 },
  { key: "destination_service_window", label: "Ventana entrega", placeholder: "00 AM - 00 PM", width: 132 },
  { key: "truck_type", label: "Tipo de camion", type: "select", options: TRUCK_TYPE_OPTIONS, width: 125, required: true },
  { key: "trailer_requirements", label: "Tipo de equipo", type: "select", options: EQUIPMENT_TYPE_OPTIONS, width: 118 },
  { key: "config", label: "Tipo configuracion", type: "select", options: CONFIG_OPTIONS, width: 118 },
  { key: "operation_type", label: "Tipo operacion", type: "select", options: OPERATION_OPTIONS, width: 120 },
  { key: "service_type", label: "Tipo servicio", type: "select", options: SERVICE_OPTIONS, width: 115 },
  { key: "border_crossing", label: "Punto cruce fronterizo", placeholder: "Laredo / Nuevo Laredo", width: 150 },
  { key: "average_border_days", label: "Prom. dias frontera", type: "number", placeholder: "X days", width: 88 },
  { key: "customs_broker", label: "Agente Aduanal", placeholder: "Company Name", width: 140 },
  { key: "transfer", label: "Transfer", placeholder: "Company Name", width: 130 },
  { key: "product", label: "Producto", placeholder: "Description / HS Code", width: 150 },
  { key: "hazmat", label: "Hazmat?", type: "checkbox", width: 54 },
  { key: "hazmat_un_number", label: "UN number", placeholder: "UN ####", width: 90 },
  { key: "cargo_value", label: "Valor carga/factura", type: "number", placeholder: "Cargo value", width: 105 },
  { key: "packaging", label: "Embalaje", type: "select", options: PACKAGING_OPTIONS, width: 105 },
  { key: "pieces", label: "Piezas", type: "number", width: 72 },
  { key: "stackable_beds", label: "Camas apilables", type: "checkbox", width: 72 },
  { key: "average_weight", label: "Peso promedio", type: "number", placeholder: "Net lbs", width: 95 },
  { key: "average_cubic_meters", label: "M3 prom.", type: "number", width: 78 },
  { key: "mon_volume", label: "Lun", type: "number", width: 64 },
  { key: "tue_volume", label: "Mar", type: "number", width: 64 },
  { key: "wed_volume", label: "Mie", type: "number", width: 64 },
  { key: "thu_volume", label: "Jue", type: "number", width: 64 },
  { key: "fri_volume", label: "Vie", type: "number", width: 64 },
  { key: "sat_volume", label: "Sab", type: "number", width: 64 },
  { key: "sun_volume", label: "Dom", type: "number", width: 64 },
  { key: "sourcing_priority", label: "Prioridad abastecimiento", type: "select", options: SOURCING_PRIORITY_OPTIONS, width: 126 },
  { key: "last_annual_volume", label: "Ultimo volumen anual", type: "number", width: 112 },
  { key: "weekly_volume", label: "Volumen semanal esperado", type: "number", width: 118, required: true },
  { key: "seasonality", label: "Estacionalidad", type: "select", options: SEASONALITY_OPTIONS, width: 112 },
  { key: "scheduling_type", label: "Tipo programacion", type: "select", options: SCHEDULING_TYPE_OPTIONS, width: 120 },
  { key: "positioning_lead_time", label: "Lead time posicionar", type: "select", options: POSITIONING_LEAD_TIME_OPTIONS, width: 120 },
  { key: "driver_assistance", label: "Asistencia conductor", type: "checkbox", width: 74 },
  { key: "double_driver", label: "Doble chofer", type: "checkbox", width: 70 },
  { key: "transit_days", label: "Transito estimado", type: "number", width: 88 },
  { key: "average_distance", label: "Distancia promedio", type: "number", placeholder: "mi/km", width: 100 },
  { key: "target_rate", label: "Tarifa objetivo compra", type: "number", width: 112 },
  { key: "currency", label: "Moneda", type: "select", options: CURRENCY_OPTIONS, width: 82 },
  { key: "service_specifications", label: "Especificaciones unidad", type: "textarea", placeholder: "Condiciones y caracteristicas de la unidad", width: 230 },
  { key: "notes", label: "Notas operacion", type: "textarea", placeholder: "Informacion relevante", width: 230 }
];

const RFI_IMPORT_ALIASES = {
  lane_id: ["id lane", "lane id", "id #", "id"],
  origin_location: ["ubicacion de salida", "origin location", "origin city", "origen"],
  origin_postal_code: ["codigo postal de salida", "origin postal code", "origin zip", "zip de salida"],
  origin_shipper: ["remitente de salida", "origin shipper", "shipper"],
  origin_facility_type: ["tipo de instalacion de salida", "origin facility type"],
  origin_load_type: ["tipo de carga", "origin load type", "tipo de carga live drop etc"],
  origin_average_time_hours: ["tiempo promedio de carga", "tiempo prom carga", "average loading time"],
  origin_schedule_type: ["tipo de horario de recogida", "horario recogida", "pickup schedule type"],
  origin_service_window: ["ventana de servicio de recogida", "ventana recogida", "pickup service window"],
  destination_location: ["ubicacion de llegada", "destination location", "destination city", "destino"],
  destination_postal_code: ["codigo postal de llegada", "destination postal code", "destination zip", "zip de llegada"],
  destination_consignee: ["consignatario de llegada", "destination consignee", "consignee"],
  destination_facility_type: ["tipo de instalacion de llegada", "destination facility type"],
  destination_unload_type: ["tipo de descarga", "destination unload type"],
  destination_average_time_hours: ["tiempo promedio de descarga", "tiempo prom descarga", "average unloading time"],
  destination_schedule_type: ["tipo de horario de entrega", "horario entrega", "delivery schedule type"],
  destination_service_window: ["ventana de servicio de entrega", "ventana entrega", "delivery service window"],
  truck_type: ["tipo de camion", "truck type"],
  trailer_requirements: ["tipo de equipo", "equipment type", "trailer"],
  config: ["tipo de configuracion", "configuration"],
  operation_type: ["tipo de operacion", "operation type"],
  service_type: ["tipo de servicio", "service type"],
  border_crossing: ["punto de cruce fronterizo", "border crossing"],
  average_border_days: ["promedio de dias en la frontera", "prom dias frontera", "average border days"],
  customs_broker: ["agente aduanal", "customs broker"],
  transfer: ["transfer"],
  product: ["producto", "product"],
  hazmat: ["hazmat", "hazmat?"],
  cargo_value: ["valor de carga factura", "cargo value"],
  packaging: ["embalaje", "packaging"],
  pieces: ["piezas", "pieces"],
  stackable_beds: ["camas apilables", "stackable beds"],
  average_weight: ["peso promedio", "average weight"],
  average_cubic_meters: ["metros cubicos promedio", "m3", "average cubic meters"],
  mon_volume: ["lun", "monday"], tue_volume: ["mar", "tuesday"], wed_volume: ["mie", "wednesday"], thu_volume: ["jue", "thursday"], fri_volume: ["vie", "friday"], sat_volume: ["sab", "saturday"], sun_volume: ["dom", "sunday"],
  sourcing_priority: ["prioridad de abastecimiento", "sourcing priority"],
  last_annual_volume: ["ultimo volumen anual", "last annual volume"],
  weekly_volume: ["volumen semanal esperado", "expected weekly volume", "weekly volume"],
  seasonality: ["estacionalidad", "seasonality"],
  scheduling_type: ["tipo de programacion", "scheduling type"],
  positioning_lead_time: ["lead time para posicionar", "lead time posicionar", "positioning lead time"],
  driver_assistance: ["asistencia del conductor", "driver assistance"],
  double_driver: ["doble chofer", "double driver"],
  transit_days: ["tiempo estimado de transito", "transit time", "transit days"],
  average_distance: ["distancia promedio", "average distance"],
  target_rate: ["tarifa objetivo de compra", "target purchase rate", "target rate"],
  currency: ["moneda", "currency"],
  service_specifications: ["especificaciones de servicio sobre condiciones y caracteristicas de la unidad", "especificaciones de servicio", "service specifications"],
  notes: ["notas adicionales sobre la operacion en general", "notas adicionales", "operational notes"]
};

const RFI_LANE_GROUPS = [
  { key: "route", label: { en: "Route", es: "Ruta" }, from: "lane_id", to: "lane_id" },
  { key: "origin", label: { en: "Origin", es: "Salida" }, from: "origin_location", to: "origin_service_window" },
  { key: "destination", label: { en: "Destination", es: "Llegada" }, from: "destination_location", to: "destination_service_window" },
  { key: "operation", label: { en: "Operation", es: "Operacion" }, from: "truck_type", to: "transfer" },
  { key: "cargo", label: { en: "Cargo", es: "Carga" }, from: "product", to: "average_cubic_meters" },
  { key: "demand", label: { en: "Demand and schedule", es: "Demanda y programa" }, from: "mon_volume", to: "double_driver" },
  { key: "commercial", label: { en: "Service and commercial", es: "Servicio y comercial" }, from: "transit_days", to: "notes" }
];

function laneColumnGroup(columnIndex) {
  return RFI_LANE_GROUPS.find((group) => {
    const start = RFI_LANE_COLUMNS.findIndex((column) => column.key === group.from);
    const end = RFI_LANE_COLUMNS.findIndex((column) => column.key === group.to);
    return columnIndex >= start && columnIndex <= end;
  }) || RFI_LANE_GROUPS[0];
}

function groupedLaneColumns() {
  const groups = [];
  RFI_LANE_COLUMNS.forEach((column, index) => {
    const group = laneColumnGroup(index);
    const current = groups[groups.length - 1];
    if (current?.key === group.key) current.count += 1;
    else groups.push({ ...group, count: 1 });
  });
  return groups;
}

const WRAP_LANE_FIELDS = new Set([
  "origin_location",
  "origin_shipper",
  "origin_service_window",
  "destination_location",
  "destination_consignee",
  "destination_service_window",
  "border_crossing",
  "customs_broker",
  "transfer",
  "product",
  "packaging",
  "sourcing_priority",
  "seasonality",
  "scheduling_type",
  "positioning_lead_time",
  "service_specifications",
  "notes"
]);

const CHECKLIST_FIELDS = [
  "logistics_model",
  "operation_criteria",
  "business_rules",
  "service_specifications",
  "carrier_requirements",
  "other_notes",
  "attachment_links"
];

const LOGISTICS_MODEL_ITEMS = {
  expedited: [
    { key: "b_expedited", category: "logistics_model", label: "Expeditados", question: "Que tan urgente es? Pickup same day? Team driver? Disponibilidad 24/7?", expected: "Horas maximas de respuesta, ventana pickup, transit time, nivel de escalamiento" }
  ],
  time_critical: [
    { key: "b_time_critical", category: "logistics_model", label: "Time Critical", question: "Cual es el SLA? Hay penalidad? Ventanas fijas?", expected: "OTIF requerido, cut-off, citas, penalizacion" }
  ],
  crossborder: [
    { key: "b_crossborder", category: "logistics_model", label: "Crossborder", question: "Cruce? Broker? Transfer? B1? Carta Porte?", expected: "Cruce, broker MX/US, documentos, modelo de cruce" }
  ],
  local: [
    { key: "b_local", category: "logistics_model", label: "Locales", question: "Shuttle? Milk run? Drop? Horas por vuelta?", expected: "Frecuencia diaria, stops, tiempo ciclo" }
  ],
  regional: [
    { key: "b_regional", category: "logistics_model", label: "Regionales", question: "Radio de cobertura? Retorno? Layover?", expected: "Distancia, dias transito, ventanas" }
  ],
  national: [
    { key: "b_national", category: "logistics_model", label: "Nacionales", question: "Largo recorrido? Requiere seguridad? Team?", expected: "Transit time, tracking, paradas, seguro" }
  ]
};

LOGISTICS_MODEL_ITEMS.local_ftl = LOGISTICS_MODEL_ITEMS.local;
LOGISTICS_MODEL_ITEMS.regional_ftl = LOGISTICS_MODEL_ITEMS.regional;
LOGISTICS_MODEL_ITEMS.national_ftl = LOGISTICS_MODEL_ITEMS.national;
LOGISTICS_MODEL_ITEMS.port_drayage_us = [
  { key: "b_port_drayage_us", category: "logistics_model", label: "Port Drayage US", question: "Que terminal, chassis, cita y modelo de drayage aplican?", expected: "Terminal, gate, chassis, free time y entrega" }
];
LOGISTICS_MODEL_ITEMS.port_drayage_mx = [
  { key: "b_port_drayage_mx", category: "logistics_model", label: "Port Drayage MX", question: "Que terminal, aduana, transfer y modelo de drayage aplican?", expected: "Terminal, gate, aduana, documentos y entrega" }
];

const CHECKLIST_GROUPS = [
  {
    key: "logistics_model",
    title: "B. Modelo Logistico por Segmento Operativo",
    help: "Define como se opera cada tipo de carga.",
    rows: []
  },
  {
    key: "operation_criteria",
    title: "C. Criterios de Operacion",
    help: "Documenta como debe ejecutarse el servicio.",
    rows: [
      { key: "c_pickup_window", label: "Ventana de pickup", question: "Cual es la ventana de recogida?", expected: "Hora inicio / fin" },
      { key: "c_delivery_window", label: "Ventana de delivery", question: "Cual es la ventana de entrega?", expected: "Hora inicio / fin" },
      { key: "c_appointment_required", label: "Cita requerida", question: "Se requiere cita? Quien agenda?", expected: "Si / No / quien agenda" },
      { key: "c_loading_type", label: "Tipo de carga", question: "Como se carga?", expected: "Live / Drop / Preload" },
      { key: "c_unloading_type", label: "Tipo de descarga", question: "Como se descarga?", expected: "Live / Drop / Drop & hook" },
      { key: "c_loading_time", label: "Tiempo de carga", question: "Cuanto tarda la carga?", expected: "Horas" },
      { key: "c_unloading_time", label: "Tiempo de descarga", question: "Cuanto tarda la descarga?", expected: "Horas" },
      { key: "c_operational_contact", label: "Contacto operativo", question: "Quien coordina la operacion?", expected: "Nombre / telefono / email" },
      { key: "c_site_instructions", label: "Instrucciones de sitio", question: "Que instrucciones debe seguir el carrier?", expected: "Texto" },
      { key: "c_access_rules", label: "Reglas de acceso", question: "Que reglas de acceso aplican?", expected: "Texto / checklist" },
      { key: "c_tracking_requirement", label: "Requerimiento de tracking", question: "Que tracking exige el cliente?", expected: "GPS / check calls / ambos" },
      { key: "c_update_frequency", label: "Frecuencia de updates", question: "Cada cuanto se debe actualizar?", expected: "Cada 1h / 2h / 4h / por hito" },
      { key: "c_escalation", label: "Escalamiento", question: "Como se escala una excepcion?", expected: "Contacto / SLA / canal" }
    ]
  },
  {
    key: "business_rules",
    title: "D. Reglas de Negocio",
    help: "Documenta condiciones que afectan margen, riesgo y ejecucion.",
    rows: [
      { key: "d_payment_terms", label: "Payment terms", question: "Que terminos de pago aplican?", expected: "Net 15 / 30 / 45 / otro" },
      { key: "d_currency", label: "Moneda", question: "En que moneda debe cotizarse?", expected: "MXN / USD" },
      { key: "d_fuel_surcharge", label: "Fuel surcharge", question: "Como se maneja fuel?", expected: "Incluido / indexado / separado" },
      { key: "d_detention", label: "Detention", question: "Cual es el free time y tarifa?", expected: "Tiempo libre + tarifa" },
      { key: "d_layover", label: "Layover", question: "Cuando aplica y cuanto cuesta?", expected: "Condicion + tarifa" },
      { key: "d_tonu", label: "TONU", question: "Cuando aplica y cuanto cuesta?", expected: "Condicion + tarifa" },
      { key: "d_redelivery", label: "Redelivery", question: "Aplica redelivery?", expected: "Aplica / no aplica" },
      { key: "d_border_wait", label: "Border wait", question: "Quien paga espera en frontera y desde cuando?", expected: "Responsable, gatillo y tarifa" },
      { key: "d_cancellation", label: "Cancelacion", question: "Cual es el plazo y cargo?", expected: "Plazo y cargo" },
      { key: "d_claims", label: "Claims", question: "Como se procesan claims?", expected: "Proceso, tiempos, documentacion" },
      { key: "d_insurance", label: "Seguro", question: "Que seguro se requiere?", expected: "Cargo value, liability, requerimientos especiales" },
      { key: "d_penalties", label: "Penalizaciones", question: "Que penalizaciones aplican?", expected: "Late pickup, late delivery, no show" }
    ]
  },
  {
    key: "service_specifications",
    title: "E. Especificaciones de Servicio",
    help: "Define el estandar operativo requerido.",
    rows: [
      { key: "e_equipment", label: "Equipo", question: "Que tipo de unidad se requiere?", expected: "Tipo, largo, edad, configuracion" },
      { key: "e_driver", label: "Driver", question: "Que tipo de driver aplica?", expected: "Single / team / B1 / hazmat" },
      { key: "e_trailer", label: "Trailer", question: "Que trailer se requiere?", expected: "Dry van, reefer, flatbed, specialized" },
      { key: "e_temperature", label: "Temperatura", question: "Requiere temperatura controlada?", expected: "Rango y tolerancia" },
      { key: "e_seals", label: "Sellos", question: "Se requieren sellos?", expected: "Requeridos / tipo" },
      { key: "e_security", label: "Seguridad", question: "Que protocolo de seguridad aplica?", expected: "GPS, rutas, paradas autorizadas" },
      { key: "e_documents", label: "Documentos", question: "Que documentos son obligatorios?", expected: "BOL, POD, packing list, invoice, pedimento, Carta Porte" },
      { key: "e_pod", label: "POD", question: "Cuando debe entregarse el POD?", expected: "Tiempo maximo de entrega" },
      { key: "e_tracking", label: "Tracking", question: "Como se debe compartir tracking?", expected: "GPS link / ELD / app / check call" },
      { key: "e_communication", label: "Comunicacion", question: "Que canal se usara?", expected: "TMS / email / WhatsApp / phone" },
      { key: "e_reports", label: "Reportes", question: "Que reportes requiere el cliente?", expected: "Diario / por evento / dashboard" }
    ]
  },
  {
    key: "carrier_requirements",
    title: "F. Perfil Requerido del Carrier",
    help: "Define que tipo de carrier acepta el cliente.",
    rows: [
      { key: "f_carrier_type", label: "Tipo de carrier", question: "Que tipo de carrier acepta el cliente?", expected: "Asset-based / broker / 3PL / mixto" },
      { key: "f_mc_dot", label: "MC/DOT", question: "Debe usar autoridad propia?", expected: "Propio / partner / no requerido" },
      { key: "f_mx_permits", label: "Permisos MX", question: "Requiere permisos mexicanos?", expected: "Requeridos / no requeridos" },
      { key: "f_mx_us_experience", label: "Experiencia MX-US", question: "Que experiencia crossborder se requiere?", expected: "Basica / comprobable / obligatoria" },
      { key: "f_owned_fleet", label: "Flota propia", question: "Debe tener flota propia?", expected: "Si / no / preferente" },
      { key: "f_cargo_insurance", label: "Seguro cargo", question: "Cual es el monto minimo?", expected: "Monto minimo" },
      { key: "f_liability_insurance", label: "Seguro liability", question: "Cual es el monto minimo?", expected: "Monto minimo" },
      { key: "f_gps", label: "GPS", question: "GPS es obligatorio?", expected: "Obligatorio / preferente" },
      { key: "f_certifications", label: "Certificaciones", question: "Que certificaciones aplican?", expected: "CTPAT / FAST / OEA / Hazmat" },
      { key: "f_prior_approval", label: "Aprobacion previa", question: "Requiere aprobacion previa?", expected: "Si / no" },
      { key: "f_blocked_carriers", label: "Carrier vetado", question: "Hay carriers vetados?", expected: "Lista" },
      { key: "f_preferred_carriers", label: "Carrier preferido", question: "Hay carriers preferidos?", expected: "Lista" }
    ]
  },
  {
    key: "other_notes",
    title: "G. Notas y Excepciones Operativas",
    help: "Estructura restricciones, excepciones y riesgos conocidos.",
    rows: [
      { key: "g_site_restriction", label: "Restriccion de sitio", question: "Hay restricciones de sitio?", expected: "No entrada antes de las 7:00" },
      { key: "g_carrier_restriction", label: "Restriccion de carrier", question: "Hay restricciones por tipo de carrier?", expected: "No brokers, solo asset-based" },
      { key: "g_document_restriction", label: "Restriccion documental", question: "Hay documentos obligatorios?", expected: "POD sellado obligatorio" },
      { key: "g_security_restriction", label: "Restriccion de seguridad", question: "Hay reglas de seguridad?", expected: "No paradas en ruta" },
      { key: "g_crossborder_restriction", label: "Restriccion crossborder", question: "Hay frontera obligatoria?", expected: "Solo cruce por Laredo" },
      { key: "g_financial_restriction", label: "Restriccion financiera", question: "Hay reglas de aprobacion financiera?", expected: "No accessorial sin aprobacion" },
      { key: "g_season_exception", label: "Excepcion por temporada", question: "Hay estacionalidad?", expected: "Volumen sube en Q4" },
      { key: "g_known_risk", label: "Riesgo conocido", question: "Que riesgo debe conocer procurement?", expected: "Congestion en destino" }
    ]
  }
];

const RFI_SEGMENT_SUGGESTIONS = {
  crossborder: {
    segment_name: "Crossborder direct / D2D",
    operation_type: "d2d_export",
    logistics_model: "Direct crossborder service. Confirm whether service is door-to-door, through-trailer, transfer, B1, drayage, or another border model. State if import/export direction changes by lane.",
    operation_criteria: "Confirm pickup and delivery windows, loading/unloading model, border city assumptions, customs coordination owner, appointment requirements, expected transit, and capacity commitment.",
    business_rules: "Confirm all-in or split pricing, currency, fuel/border/accessorial treatment, free time, detention, TONU, payment terms, validity, exclusions, and whether quote is binding after award.",
    service_specifications: "Confirm equipment, trailer, hazmat, temperature control, straps/tarps, insurance, tracking, POD/BOL documents, CTPAT/FAST or other crossborder requirements.",
    carrier_requirements: "Carrier must confirm legal authority, MX/US coverage, insurance, crossborder experience, fleet availability, dispatch contact, tracking capability, and escalation contact.",
    other_notes: "List any exceptions, assumptions, phased rollout needs, customer constraints, risks, or documents that carriers must review before bidding."
  },
  mx_domestic: {
    segment_name: "Mexico domestic",
    operation_type: "intra_mex",
    logistics_model: "Domestic Mexico movement. Confirm if operation is spot, scheduled, dedicated, live load, drop, direct, multi-stop, or regional distribution.",
    operation_criteria: "Confirm pickup/delivery windows, appointment rules, loading/unloading time, route constraints, transit target, recurring capacity, and detention assumptions.",
    business_rules: "Confirm MXN pricing, fuel or diesel treatment, accessorials, payment terms, validity, tax/compliance requirements, penalties, and invoicing assumptions.",
    service_specifications: "Confirm equipment, trailer, hazmat, temperature control, GPS/check calls, POD requirements, cargo care, security protocol, and special handling.",
    carrier_requirements: "Carrier must confirm Mexico coverage, operating permits, insurance, fleet type, dispatch contact, documentation capability, and escalation process.",
    other_notes: "Capture exclusions, geography limitations, security risks, seasonal constraints, or customer-specific requirements."
  },
  us_domestic: {
    segment_name: "US domestic",
    operation_type: "us_domestic",
    logistics_model: "US domestic movement. Confirm if service is spot, dedicated, scheduled, live/drop, one-way, roundtrip, expedited, or regular truckload.",
    operation_criteria: "Confirm pickup/delivery windows, facility rules, transit target, recurring capacity, appointment requirements, and accessorial assumptions.",
    business_rules: "Confirm USD pricing, FSC treatment, accessorials, payment terms, validity, detention, TONU, and whether rate is binding after award.",
    service_specifications: "Confirm equipment, trailer, hazmat, temperature control, straps/tarps, insurance, tracking cadence, POD/BOL requirements, and special handling.",
    carrier_requirements: "Carrier must confirm authority, insurance, fleet, coverage, dispatch contact, tracking capability, and escalation process.",
    other_notes: "Capture any exceptions, state restrictions, customer rules, peak season constraints, or documents required."
  },
  expedited: {
    segment_name: "Expedited / time sensitive",
    operation_type: "regional",
    logistics_model: "Expedited service. Confirm hot shot, sprinter, straight truck, team driver, direct drive, hand-carry, or other time-sensitive model.",
    operation_criteria: "Confirm ready time, pickup ETA, delivery ETA, team requirements, tracking cadence, detention rules, and exception escalation.",
    business_rules: "Confirm all-in price, currency, validity window, accessorials, cancellation/TONU, delay responsibility, and payment terms.",
    service_specifications: "Confirm equipment, dimensions, weight, cargo care, tracking, insurance, documents, driver requirements, and delivery proof.",
    carrier_requirements: "Carrier must confirm available unit, driver details, GPS/live tracking, dispatch coverage, and escalation contact.",
    other_notes: "Capture urgency, risk, shipper/customer constraints, and any alternate equipment allowed."
  },
  time_critical: {
    segment_name: "Time critical",
    operation_type: "regional",
    logistics_model: "Time-critical movement with strict service expectation. Confirm direct service, team, backup unit, and real-time tracking model.",
    operation_criteria: "Confirm pickup ETA, delivery ETA, recovery plan, check-call frequency, appointment windows, and escalation SLA.",
    business_rules: "Confirm rate validity, cancellation rules, delay penalties, accessorials, payment terms, and service failure assumptions.",
    service_specifications: "Confirm unit type, cargo care, tracking, insurance, required documents, and emergency contact coverage.",
    carrier_requirements: "Carrier must confirm unit availability, driver readiness, dispatch coverage, and documented escalation path.",
    other_notes: "Capture criticality, operational risk, contingency plan, and any customer-specific constraints."
  },
  dedicated: {
    segment_name: "Dedicated capacity",
    operation_type: "national",
    logistics_model: "Dedicated or committed capacity model. Confirm if capacity is exclusive, shared, scheduled, seasonal, or project-based.",
    operation_criteria: "Confirm weekly volume, fleet commitment, schedule, origin/destination cadence, backup capacity, lead time, and implementation timeline.",
    business_rules: "Confirm pricing structure, minimum commitment, cancellation terms, fuel/accessorials, payment terms, validity, and renewal/escalation rules.",
    service_specifications: "Confirm equipment specs, dedicated unit rules, tracking, documents, insurance, driver requirements, and service KPIs.",
    carrier_requirements: "Carrier must confirm fleet allocation, operating authority, insurance, implementation contact, dispatch contact, and reporting cadence.",
    other_notes: "Capture ramp-up assumptions, phased launch, customer dependencies, risks, and exceptions."
  }
};

const RFI_SEGMENT_SUGGESTION_ALIASES = {
  local_ftl: { ...RFI_SEGMENT_SUGGESTIONS.mx_domestic, segment_name: "Local FTL", operation_type: "local" },
  regional_ftl: { ...RFI_SEGMENT_SUGGESTIONS.mx_domestic, segment_name: "Regional FTL", operation_type: "regional" },
  national_ftl: { ...RFI_SEGMENT_SUGGESTIONS.mx_domestic, segment_name: "National FTL", operation_type: "national" },
  port_drayage_us: { ...RFI_SEGMENT_SUGGESTIONS.us_domestic, segment_name: "Port Drayage US", operation_type: "us_domestic" },
  port_drayage_mx: { ...RFI_SEGMENT_SUGGESTIONS.mx_domestic, segment_name: "Port Drayage MX", operation_type: "intra_mex" }
};

const SEGMENT_RUBRIC_MINIMUMS = {
  local_ftl: [
    { key: "c_local_frequency", category: "operation_criteria", label: "Frecuencia y ciclo", question: "Cuantas vueltas, paradas y horas por ciclo se requieren?", expected: "Frecuencia diaria, stops y tiempo de ciclo" },
    { key: "d_local_accessorials", category: "business_rules", label: "Accessorials locales", question: "Como se manejan detention, layover, TONU y redelivery?", expected: "Condicion, tiempo libre y tarifa" },
    { key: "e_local_equipment", category: "service_specifications", label: "Equipo local", question: "Que tipo, edad y configuracion de unidad aplican?", expected: "Tipo, trailer, configuracion y condiciones" },
    { key: "f_local_coverage", category: "carrier_requirements", label: "Cobertura local", question: "Que cobertura y flota propia puede comprometer el carrier?", expected: "Mercados, flota, autoridad y capacidad" },
    { key: "g_local_constraints", category: "other_notes", label: "Restricciones locales", question: "Que restricciones de sitio, seguridad o temporada existen?", expected: "Sitio, seguridad, estacionalidad y excepciones" }
  ],
  regional_ftl: [
    { key: "c_regional_coverage", category: "operation_criteria", label: "Cobertura regional", question: "Cual es el radio, retorno, layover y ventana de servicio?", expected: "Distancia, dias de transito y ventanas" },
    { key: "d_regional_accessorials", category: "business_rules", label: "Costos regionales", question: "Como se manejan detention, layover, TONU y redelivery?", expected: "Condicion, tiempo libre y tarifa" },
    { key: "e_regional_equipment", category: "service_specifications", label: "Equipo regional", question: "Que equipo, trailer y configuracion se requieren?", expected: "Tipo, largo, edad y configuracion" },
    { key: "f_regional_carrier_coverage", category: "carrier_requirements", label: "Capacidad regional", question: "Que mercados y capacidad recurrente puede cubrir el carrier?", expected: "Mercados, flota, autoridad y capacidad" },
    { key: "g_regional_seasonality", category: "other_notes", label: "Riesgo regional", question: "Que restricciones, temporadas o riesgos deben considerarse?", expected: "Restricciones, temporada y excepciones" }
  ],
  national_ftl: [
    { key: "c_national_transit", category: "operation_criteria", label: "Transito nacional", question: "Cual es el tiempo de transito, tracking y reglas de parada?", expected: "Transit time, tracking, paradas y seguro" },
    { key: "d_national_rules", category: "business_rules", label: "Reglas nacionales", question: "Que moneda, fuel, accessorials, claims y penalizaciones aplican?", expected: "Condiciones comerciales y de riesgo" },
    { key: "e_national_equipment", category: "service_specifications", label: "Equipo nacional", question: "Que equipo, seguridad, documentos y POD se requieren?", expected: "Tipo, trailer, tracking y documentos" },
    { key: "f_national_authority", category: "carrier_requirements", label: "Elegibilidad nacional", question: "Que autoridad, seguros, flota y cobertura son obligatorios?", expected: "Autoridad, seguros, flota y cobertura" },
    { key: "g_national_risk", category: "other_notes", label: "Riesgo nacional", question: "Que restricciones de ruta, seguridad o temporada existen?", expected: "Ruta, seguridad, temporada y excepciones" }
  ],
  crossborder: [
    { key: "c_crossborder_execution", category: "operation_criteria", label: "Ejecucion crossborder", question: "Como son el cruce, broker, transfer, B1, Carta Porte y las citas?", expected: "Cruce, broker, documentos y ventanas" },
    { key: "d_crossborder_commercial", category: "business_rules", label: "Reglas crossborder", question: "Quien absorbe fuel, border wait, detention, claims y penalizaciones?", expected: "Responsable, gatillo y tarifa" },
    { key: "e_crossborder_documents", category: "service_specifications", label: "Documentos crossborder", question: "Que unidad, trailer, tracking, POD y documentos se exigen?", expected: "Equipo, documentos, tracking y evidencia" },
    { key: "f_crossborder_eligibility", category: "carrier_requirements", label: "Elegibilidad crossborder", question: "Que autoridad, seguros, permisos, experiencia y certificaciones requiere el carrier?", expected: "Autoridad, seguros, permisos y experiencia" },
    { key: "g_crossborder_restrictions", category: "other_notes", label: "Restricciones crossborder", question: "Que ciudad fronteriza, seguridad, documentos o excepciones aplican?", expected: "Frontera, seguridad, temporada y excepciones" }
  ],
  expedited: [
    { key: "c_expedited_sla", category: "operation_criteria", label: "SLA expeditado", question: "Cual es la respuesta maxima, pickup same day y ETA requerido?", expected: "Horas de respuesta, pickup y transit time" },
    { key: "d_expedited_penalties", category: "business_rules", label: "Penalizacion expeditada", question: "Hay penalidad, cancelacion, TONU o accessorial por demora?", expected: "Condicion, penalidad y tarifa" },
    { key: "e_expedited_equipment", category: "service_specifications", label: "Equipo expeditado", question: "Que equipo, driver, tracking y evidencia se requieren?", expected: "Unidad, driver, tracking y POD" },
    { key: "f_expedited_availability", category: "carrier_requirements", label: "Disponibilidad inmediata", question: "Puede el carrier comprometer unidad, driver y cobertura 24/7?", expected: "Unidad, driver, dispatch y escalamiento" },
    { key: "g_expedited_escalation", category: "other_notes", label: "Riesgo expeditado", question: "Que contingencias, restricciones o contactos de escalamiento existen?", expected: "Riesgo, contingencia y contacto" }
  ],
  time_critical: [
    { key: "c_time_critical_sla", category: "operation_criteria", label: "SLA time critical", question: "Cual es el OTIF, cut-off, cita y escalamiento requerido?", expected: "OTIF, cut-off, citas y SLA" },
    { key: "d_time_critical_penalties", category: "business_rules", label: "Penalizaciones time critical", question: "Que penalidades, cancelaciones y responsabilidades por demora aplican?", expected: "Regla, gatillo y tarifa" },
    { key: "e_time_critical_tracking", category: "service_specifications", label: "Tracking time critical", question: "Que unidad, respaldo, tracking y documentos son obligatorios?", expected: "Equipo, backup, tracking y evidencia" },
    { key: "f_time_critical_backup", category: "carrier_requirements", label: "Backup operativo", question: "Que disponibilidad, equipo de respaldo y escalamiento puede ofrecer el carrier?", expected: "Capacidad primaria, backup y contacto" },
    { key: "g_time_critical_risk", category: "other_notes", label: "Riesgo time critical", question: "Que riesgos, excepciones y contingencias deben quedar documentados?", expected: "Riesgo, contingencia y excepción" }
  ],
  port_drayage_us: [
    { key: "c_port_us_appointments", category: "operation_criteria", label: "Terminal y citas US", question: "Que terminal, cita, free time, gate y procedimiento aplican?", expected: "Terminal, cita, gate y ventanas" },
    { key: "d_port_us_demurrage", category: "business_rules", label: "Demurrage US", question: "Quien paga demurrage, detention, per diem y otros accessorials?", expected: "Responsable, condicion y tarifa" },
    { key: "e_port_us_equipment", category: "service_specifications", label: "Equipo portuario US", question: "Que chassis, trailer, sello, tracking y documentos se necesitan?", expected: "Equipo, chassis, tracking y documentos" },
    { key: "f_port_us_coverage", category: "carrier_requirements", label: "Cobertura portuaria US", question: "Que puertos, autoridad, seguros y capacidad puede cubrir el carrier?", expected: "Puertos, autoridad, seguros y capacidad" },
    { key: "g_port_us_constraints", category: "other_notes", label: "Restricciones portuarias US", question: "Que restricciones de terminal, seguridad o temporada existen?", expected: "Terminal, seguridad, temporada y excepciones" }
  ],
  port_drayage_mx: [
    { key: "c_port_mx_terminal", category: "operation_criteria", label: "Terminal y citas MX", question: "Que terminal, cita, gate, transfer y ventana aplican?", expected: "Terminal, cita, gate y ventanas" },
    { key: "d_port_mx_customs", category: "business_rules", label: "Aduana y accessorials MX", question: "Como se manejan aduana, demoras, maniobras y accessorials?", expected: "Responsable, condicion y tarifa" },
    { key: "e_port_mx_documents", category: "service_specifications", label: "Documentos portuarios MX", question: "Que equipo, pedimento, Carta Porte, POD y tracking se requieren?", expected: "Equipo, documentos y evidencia" },
    { key: "f_port_mx_permits", category: "carrier_requirements", label: "Permisos portuarios MX", question: "Que permisos, seguros, experiencia y capacidad son obligatorios?", expected: "Permisos, seguros, experiencia y capacidad" },
    { key: "g_port_mx_constraints", category: "other_notes", label: "Restricciones portuarias MX", question: "Que restricciones de terminal, seguridad o temporada deben documentarse?", expected: "Terminal, seguridad, temporada y excepciones" }
  ]
};

// Segment-specific minimums from the RFI rubric guide. The shared checklist
// supplies the common contract fields; these rows capture the operating detail
// that changes by segment without forcing the user to start from a blank form.
const SEGMENT_RUBRIC_DETAIL_LIBRARY = {
  local_ftl: [
    ["logistics_model", "Tipo de operacion local", "Es shuttle, plant-to-plant, milk run, yard transfer o same-day?", "Modelo de servicio y numero de paradas"],
    ["logistics_model", "Patron de ruta", "La ruta es fija, dinamica, circuito o viaje sencillo?", "Secuencia, vueltas y cargas por turno"],
    ["logistics_model", "Dedicacion y respaldo", "Se requiere tractor, remolque o capacidad de respaldo dedicada?", "Dedicado, compartido, pool y backup"],
    ["operation_criteria", "Primer posicionamiento", "A que hora debe estar posicionada la primera unidad?", "Hora de primer posicionamiento"],
    ["operation_criteria", "Ciclo objetivo", "Cual es el tiempo objetivo y maximo por ciclo?", "Horas objetivo y limite"],
    ["operation_criteria", "Acceso y staging", "Que proceso de caseta, staging y cambio de turno aplica?", "Proceso, credenciales y contactos"],
    ["business_rules", "Esquema tarifario", "Se paga por viaje, hora, turno, dia o mensual dedicado?", "Unidad de cobro y tarifa minima"],
    ["business_rules", "Millas incluidas", "Cuantas millas estan incluidas y como se cobra el excedente?", "Millas incluidas y tarifa adicional"],
    ["business_rules", "Compromiso minimo", "Existe compromiso minimo de volumen o capacidad?", "Volumen comprometido y recotizacion"],
    ["service_specifications", "Requisitos de planta", "Que equipo de seguridad, EPP, capacitacion y credenciales exige la planta?", "Acceso, EPP y capacitacion"],
    ["service_specifications", "Control de ciclos", "Se requiere GPS, geocerca, evidencia de entrada/salida o reporte por turno?", "Fuente de evidencia y frecuencia"],
    ["carrier_requirements", "Flota y patio local", "El carrier tiene flota y patio cercanos para cubrir todos los turnos?", "Mercado, patio y capacidad"],
    ["carrier_requirements", "Experiencia repetitiva", "Tiene experiencia en shuttle, milk run u operaciones repetitivas?", "Experiencia comprobable y referencias"],
    ["carrier_requirements", "Dispatcher dedicado", "Puede asignar dispatcher y unidades de respaldo?", "Contacto, respaldo y tiempo de respuesta"],
    ["other_notes", "Restricciones de acceso", "Hay congestion, restricciones de caseta, anden o estacionamiento?", "Restriccion, horario y mitigacion"],
    ["other_notes", "Cambios de produccion", "Hay cambios de turno, picos, obras, cierres o permisos locales?", "Evento, fecha y excepcion"],
  ],
  regional_ftl: [
    ["logistics_model", "Tipo de servicio regional", "Es same-day, next-day, multi-day, spot, recurrente o contractual?", "Horizonte de servicio y frecuencia"],
    ["logistics_model", "Retorno y backhaul", "Se requiere roundtrip, backhaul o retorno esperado del operador?", "Tipo de viaje y retorno"],
    ["logistics_model", "Capacidad primaria y backup", "Como se cubren las semanas pico y el respaldo?", "Carrier primario, backup y capacidad"],
    ["operation_criteria", "Transito y variacion", "Cual es el transito esperado y la variacion maxima permitida?", "Dias u horas y tolerancia"],
    ["operation_criteria", "Booking y citas", "Con cuanto lead time se agenda y quien es responsable de la cita?", "Lead time, responsable y contacto"],
    ["operation_criteria", "Fin de semana y HOS", "Aplica fin de semana, restricciones de ruta o reglas de paradas?", "Calendario, ruta y paradas permitidas"],
    ["business_rules", "Precio y fuel", "Como se cotizan linehaul, fuel y cargos de fin de semana o festivo?", "Base, fuel, moneda y recargos"],
    ["business_rules", "Accessorials regionales", "Que reglas aplican para detention, layover, TONU, redelivery y paradas?", "Condicion, free time y tarifa"],
    ["business_rules", "Vigencia y claims", "Cual es la vigencia, recotizacion, claims y termino de pago?", "Vigencia, proceso y terminos"],
    ["service_specifications", "Equipo y driver", "Que equipo, trailer y modalidad single o team se requiere?", "Equipo, configuracion y driver"],
    ["service_specifications", "Evidencia y tracking", "Que GPS, check calls, evidencia de pickup/delivery y POD se requieren?", "Tracking, hitos y POD"],
    ["carrier_requirements", "Cobertura por corredor", "Que mercados y corredores regionales puede cubrir el carrier?", "Cobertura, experiencia y referencias"],
    ["carrier_requirements", "Escalabilidad pico", "Que capacidad adicional puede aportar en semanas pico?", "Capacidad comprometida y backup"],
    ["carrier_requirements", "Solidez operativa", "Cuenta con seguros, seguridad, GPS y estabilidad financiera suficientes?", "Evidencia, limites y estado"],
    ["other_notes", "Dependencia de backhaul", "La tarifa o cobertura depende de backhaul, clima o temporada?", "Dependencia, riesgo y mitigacion"],
    ["other_notes", "Destinos alternos", "Hay cuellos de botella, destinos alternos o cambios temporales de ruta?", "Alternativa, gatillo y fecha"],
  ],
  national_ftl: [
    ["logistics_model", "Pais y corredor", "La operacion es en Mexico, Estados Unidos o ambos? Cuales son los corredores?", "Pais, corredor y ruta aprobada"],
    ["logistics_model", "Viaje y frecuencia", "Es one-way, roundtrip, backhaul, relay, spot o recurrente?", "Tipo de viaje y calendario"],
    ["logistics_model", "Seguridad y capacidad", "Se requiere capacidad dedicada, pico, backup o modelo especial de seguridad?", "Capacidad, respaldo y protocolo"],
    ["operation_criteria", "Reglas de ruta", "Hay rutas obligatorias, prohibidas, zonas sin parada o reglas de pernocta?", "Ruta, paradas y pernocta"],
    ["operation_criteria", "Transito y recuperacion", "Cual es el transito objetivo, variacion y proceso de recuperacion?", "Dias, tolerancia y escalamiento"],
    ["operation_criteria", "Seguridad en ruta", "Que check-ins, geocercas, frecuencia GPS y carga de combustible aplican?", "Frecuencia, geocerca y contacto"],
    ["business_rules", "Linehaul y fuel", "Como se separan moneda, linehaul, fuel y accesoriales?", "Estructura de tarifa y moneda"],
    ["business_rules", "Riesgo y seguridad", "Como se manejan custodia, cargo value, seguro y cargos de seguridad?", "Responsable, limite y evidencia"],
    ["business_rules", "Claims y vigencia", "Cual es la vigencia, recotizacion, claims, pago y autorizacion de accesoriales?", "Proceso, fecha y autoridad"],
    ["service_specifications", "Equipo y condicion", "Que tipo, antiguedad, condicion, sujecion y sellos requiere la carga?", "Equipo, edad, condicion y sellos"],
    ["service_specifications", "Alto valor o hazmat", "Aplica alto valor, hazmat, temperatura, documentos o evidencia fotografica?", "Requisito, limite y documentos"],
    ["carrier_requirements", "Cobertura nacional", "Que flota, corredores, autoridad y capacidad de respaldo puede cubrir?", "Cobertura, flota y backup"],
    ["carrier_requirements", "Seguridad y GPS", "Tiene protocolo de seguridad, GPS y experiencia en carga de alto valor?", "Protocolo, experiencia y evidencia"],
    ["carrier_requirements", "Perfil preferido", "Se prefiere asset-based? Cual es el indice maximo de claims?", "Elegibilidad y umbral"],
    ["other_notes", "Riesgo de ruta", "Hay zonas de alto riesgo, montana, cierres, restricciones nocturnas o documentos especiales?", "Riesgo, zona y mitigacion"],
    ["other_notes", "Ruta alterna", "Que rutas alternas o excepciones estatales/regionales deben documentarse?", "Alternativa, gatillo y aprobador"],
  ],
  crossborder: [
    ["logistics_model", "Direccion y modelo de cruce", "La ruta es MX-US o US-MX? Es D2D, door-to-border, border-to-door o segmentada?", "Direccion y tramo operativo"],
    ["logistics_model", "Cruce y transferencia", "El modelo es directo, transfer, swap, drayage, B1 o hibrido?", "Modelo de cruce y responsables"],
    ["logistics_model", "Frontera y aduana", "Cual es el cruce principal, alterno, broker y responsable documental?", "Ciudades frontera, broker y documentos"],
    ["operation_criteria", "Cut-offs y frontera", "Cuales son los cut-offs documentales, llegada a frontera y aduana?", "Horarios, dwell y liberacion"],
    ["operation_criteria", "Transfer e interchange", "Como funcionan cita de transfer, patio, interchange y actualizacion de unidad?", "Cita, patio, evidencia y hito"],
    ["operation_criteria", "Escalamiento aduanal", "Como se escala demora, inspeccion, retencion o activacion de cruce alterno?", "SLA, contacto y gatillo"],
    ["business_rules", "Cruce y moneda", "Que incluye fuel, puente, transfer, drayage, patio, FX y border wait?", "Incluido, separado y moneda"],
    ["business_rules", "Demoras y documentacion", "Quien absorbe detention, border wait, error documental, claims y redelivery?", "Responsable, gatillo y tarifa"],
    ["business_rules", "Vigencia crossborder", "Cual es la vigencia, recotizacion, aprobacion de accesoriales y regla contra doble brokerage?", "Vigencia, autoridad y restriccion"],
    ["service_specifications", "Documentos de cruce", "Se requieren Carta Porte, pedimento, invoice, packing list, BOL, DODA o entry documents?", "Lista, formato y cut-off"],
    ["service_specifications", "Hitos y seguridad", "Que GPS, cuenta espejo, sellos, hitos, POD, alto valor o hazmat se requieren?", "Hito, evidencia y retencion"],
    ["carrier_requirements", "Autoridad y permisos", "Tiene MC/DOT, permisos MX, autoridad activa y seguros suficientes?", "Autoridad, permisos y limites"],
    ["carrier_requirements", "Experiencia de cruce", "Puede operar el cruce especifico con directo, B1, transfer, swap o drayage?", "Experiencia, socios y referencias"],
    ["carrier_requirements", "Certificaciones", "Aplica CTPAT, FAST, OEA, hazmat, GPS o prohibicion de doble brokerage?", "Certificacion y evidencia"],
    ["other_notes", "Cruce permitido", "Que cruce es preferido, prohibido o alterno?", "Ciudad fronteriza, horario y excepcion"],
    ["other_notes", "Restricciones de patio", "Hay restricciones de patio, subcontratacion, congestion o festivos fronterizos?", "Restriccion, fecha y mitigacion"],
  ],
  expedited: [
    ["logistics_model", "Tipo de urgencia", "Es emergencia, planeado, recovery, premium scheduled o line-down?", "Tipo y nivel de criticidad"],
    ["logistics_model", "Modelo dedicado", "Se requiere servicio directo, sin consolidacion, team driver o equipo dedicado?", "Equipo, driver y no-stop"],
    ["logistics_model", "Cobertura y backup", "La cobertura es laboral, after-hours, 24/7, on-call o reservada?", "Horario, frecuencia y backup"],
    ["operation_criteria", "SLA de respuesta", "Cual es el tiempo maximo de respuesta, unidad, pickup y delivery?", "Horas, deadlines y ETA"],
    ["operation_criteria", "Recovery y escalamiento", "Cual es el RTO y cuando se activa el backup?", "Gatillo, contacto y SLA"],
    ["operation_criteria", "Confirmaciones", "Con que frecuencia se confirma unidad, operador, GPS y avance?", "Cadencia y canal"],
    ["business_rules", "Premium y autorizacion", "Quien autoriza premium, after-hours, weekend, holiday y recovery pricing?", "Aprobador, umbral y tarifa"],
    ["business_rules", "Falla de servicio", "Que penalidad aplica por late pickup, late delivery, no-show o cancelacion?", "Gatillo y cargo"],
    ["business_rules", "Vigencia urgente", "Cual es la vigencia, recotizacion y tolerancia maxima del premium?", "Ventana y regla"],
    ["service_specifications", "Unidad y conductor", "Que equipo, remolque, single/team, sujecion y alto valor se requieren?", "Unidad, driver y cargo"],
    ["service_specifications", "Control 24/7", "Se requiere GPS continuo, control tower, alertas y evidencia con timestamp?", "Herramienta, alerta y evidencia"],
    ["carrier_requirements", "Capacidad inmediata", "Tiene experiencia expedited, same-day, team, recovery y dispatch dedicado?", "Experiencia y respuesta historica"],
    ["carrier_requirements", "Operacion continua", "Cuenta con GPS en vivo, cobertura 24/7, unidad de respaldo y seguros?", "Cobertura, backup y limites"],
    ["carrier_requirements", "Referencias y aprobacion", "El cliente exige aprobacion previa o referencias especificas?", "Criterio y evidencia"],
    ["other_notes", "Restricciones urgentes", "Hay limites de premium, pickup, delivery, ruta o fuera de horario?", "Restriccion y excepcion"],
    ["other_notes", "Plan de emergencia", "Que corredores no tienen recovery y que contactos aplican?", "Corredor, contingencia y contacto"],
  ],
  time_critical: [
    ["logistics_model", "Tipo de criticidad", "Es linea de produccion, retail appointment, instalacion, evento o riesgo de paro?", "Impacto, SLA y prioridad"],
    ["logistics_model", "Rigidez del servicio", "Pickup y delivery son rigidos o flexibles? Se permite parcial?", "Ventana, parcial y contingencia"],
    ["logistics_model", "Capacidad de contingencia", "Cual es la capacidad primaria, backup y modelo de recovery?", "Capacidad, backup y responsable"],
    ["operation_criteria", "OTIF y tolerancia", "Cual es el OTIF, tolerancia de pickup/delivery y retraso maximo?", "Meta, tolerancia y gatillo"],
    ["operation_criteria", "Cita y zona horaria", "Quien agenda, en que zona horaria y como se confirma el check-in?", "Cita, timezone y evidencia"],
    ["operation_criteria", "Reasignacion", "Cuando se escala y cuando se reasigna la carga?", "Tiempo, contacto y umbral"],
    ["business_rules", "Penalizacion SLA", "Aplican late pickup, late delivery, no-show, chargeback o penalizacion por paro?", "Gatillo, monto y aprobador"],
    ["business_rules", "Reprogramacion y claims", "Como se manejan reprogramacion, cancelacion, claims y creditos/debitos?", "Proceso y responsabilidad"],
    ["business_rules", "Vigencia del compromiso", "Cual es la vigencia de tarifa y del compromiso de servicio?", "Fecha, renovacion y recotizacion"],
    ["service_specifications", "Monitoreo y hitos", "Que GPS, hitos, alertas, monitoreo 24/7 y notificaciones se requieren?", "Cadencia y canal"],
    ["service_specifications", "Evidencia de cumplimiento", "Que evidencia con timestamp, check-in, carga, salida y POD es obligatoria?", "Evidencia y tiempo maximo"],
    ["carrier_requirements", "Experiencia critica", "Cual es el cumplimiento historico de citas, pickup, delivery y claims?", "KPIs y referencias"],
    ["carrier_requirements", "Operacion 24/7", "Cuenta con dispatcher, GPS, backup, seguros y procedimiento de recovery?", "Cobertura y procedimiento"],
    ["carrier_requirements", "Aprobacion de cliente", "Hay requisitos de aprobacion, certificacion o historial de incidencias?", "Criterio y evidencia"],
    ["other_notes", "Blackout y recepcion", "Hay blackout dates, no-early, no-late o reglas de recepcion?", "Fecha, regla y excepcion"],
    ["other_notes", "Contingencia de planta", "Hay destino alterno, ubicacion de contingencia o excepcion de penalizacion?", "Alternativa, gatillo y aprobador"],
  ],
  port_drayage_us: [
    ["logistics_model", "Flujo portuario US", "Es import, export, empty, repositioning, port-to-warehouse, rail o CFS?", "Flujo, terminal y destino"],
    ["logistics_model", "Contenedor y chassis", "Que tamano, tipo, chassis, steamship line y proveedor aplican?", "Contenedor, chassis y naviera"],
    ["logistics_model", "Modelo de patio", "Aplica street turn, live unload, drop, pre-pull, transload o empty return?", "Movimiento y patio"],
    ["operation_criteria", "Disponibilidad y free time", "Cual es container availability, last free day, port cut-off y cita?", "Fecha, cita y ventana"],
    ["operation_criteria", "Chassis y TWIC", "Como se valida chassis, peso, overweight, permiso y TWIC?", "Requisito y responsable"],
    ["operation_criteria", "Holds y turn time", "Hay customs/exam hold, riesgo de demurrage o tiempo objetivo de puerto?", "Hold, riesgo y escalamiento"],
    ["business_rules", "Base y recargos portuarios", "Como se cobran base drayage, fuel, chassis, pre-pull, yard y congestion?", "Componente, moneda y tarifa"],
    ["business_rules", "Demurrage y detention", "Quien responde por demurrage, per diem, detention, empty return y after-hours?", "Responsable, free time y cargo"],
    ["business_rules", "Vigencia portuaria", "Cual es la vigencia y responsabilidad por free time o cambio de terminal?", "Fecha, regla y aprobador"],
    ["service_specifications", "Equipo de contenedor", "Se requieren 20, 40, 40HC, 45, tri-axle, genset o reefer monitoring?", "Equipo y condicion"],
    ["service_specifications", "Recibos y tracking", "Que TWIC, tracking, interchange receipt, pickup, POD y empty receipt se requieren?", "Documento, hito y evidencia"],
    ["carrier_requirements", "Acceso portuario", "Tiene USDOT/MC, UIIA, TWIC y acceso a los puertos/terminales requeridos?", "Autoridad y cobertura"],
    ["carrier_requirements", "Chassis y reefer", "Tiene chassis, tri-axle, genset, reefer y operadores cercanos de respaldo?", "Equipo y capacidad"],
    ["carrier_requirements", "Experiencia terminal", "Que experiencia en citas, overweight, interchange y seguros puede demostrar?", "Experiencia y evidencia"],
    ["other_notes", "Riesgo de terminal", "Hay congestion, terminal cerrada, customs hold, exam hold o falta de chassis?", "Evento, fecha y mitigacion"],
    ["other_notes", "Reglas de naviera", "Hay restriccion de street turn, night gate, empty return o naviera?", "Regla, terminal y excepcion"],
  ],
  port_drayage_mx: [
    ["logistics_model", "Flujo portuario MX", "Es import, export, empty, repositioning, port-to-plant, CEDIS, rail o yard transfer?", "Flujo, terminal y destino"],
    ["logistics_model", "Contenedor y liberacion", "Que naviera, recinto, contenedor, plataforma, genset y agente aduanal aplican?", "Equipo, recinto y responsables"],
    ["logistics_model", "Modelo de patio", "Aplica pre-pull, transload, live unload, drop, empty return o port-to-rail?", "Movimiento, patio y vacio"],
    ["operation_criteria", "Liberacion y citas", "Cual es la disponibilidad, liberacion aduanal/terminal, last free day y cita?", "Fecha, gate y ventana"],
    ["operation_criteria", "Plataforma y seguridad", "Como se valida plataforma, peso, sobrepeso, custodia, Carta Porte y evidencia?", "Requisito, responsable y hito"],
    ["operation_criteria", "Tiempo portuario", "Cual es el tiempo objetivo de carga/descarga, vacio y escalamiento?", "Horas, deadline y contacto"],
    ["business_rules", "Flete y maniobras", "Como se cobran flete, maniobra, pre-pull, patio, almacenaje y demoras?", "Componente, moneda y tarifa"],
    ["business_rules", "Accessorials MX", "Quien paga per diem, estadia, pernocta, falso flete, casetas, sobrepeso y reentrega?", "Responsable, gatillo y cargo"],
    ["business_rules", "Carta Porte e IVA", "Como se trata moneda, IVA, Carta Porte, vigencia y aprobacion de accesoriales?", "Regla fiscal y comercial"],
    ["service_specifications", "Unidad portacontenedor", "Se requiere plataforma, sencillo/full, genset, GPS, geocerca o boton de panico?", "Equipo y tecnologia"],
    ["service_specifications", "Documentos y evidencia", "Que EIR, POD, vacio, Carta Porte, pedimento y documentos de naviera aplican?", "Lista, formato y tiempo"],
    ["carrier_requirements", "Permisos y acceso", "Tiene permisos federales, acceso a puerto, operadores acreditados y experiencia con naviera?", "Permiso, puerto y experiencia"],
    ["carrier_requirements", "Plataformas y respaldo", "Cuenta con plataformas, capacidad full, sobrepeso, patio, pre-pull y unidades de respaldo?", "Equipo, patio y capacidad"],
    ["carrier_requirements", "Seguridad y seguros", "Tiene GPS, seguridad, seguro de carga, responsabilidad civil y Carta Porte?", "Protocolo, limite y evidencia"],
    ["other_notes", "Riesgo portuario MX", "Hay bloqueos, saturacion, liberacion tardia, cambio de patio o demora de naviera?", "Evento, fecha y mitigacion"],
    ["other_notes", "Restricciones temporales", "Hay terminal cerrada, horario restringido, riesgo carretero o excepcion documental?", "Regla, periodo y aprobador"],
  ]
};

for (const [segmentKey, definitions] of Object.entries(SEGMENT_RUBRIC_DETAIL_LIBRARY)) {
  const existingKeys = new Set((SEGMENT_RUBRIC_MINIMUMS[segmentKey] || []).map((item) => item.key));
  for (const [index, [category, label, question, expected]] of definitions.entries()) {
    const base = normalizeRfiImportHeader(`${segmentKey}_${category}_${label}`).replace(/\s+/g, "_") || `${segmentKey}_${index}`;
    const key = `detail_${base}`;
    if (existingKeys.has(key)) continue;
    SEGMENT_RUBRIC_MINIMUMS[segmentKey] ||= [];
    SEGMENT_RUBRIC_MINIMUMS[segmentKey].push({ key, category, label, question, expected });
    existingKeys.add(key);
  }
}

const LANE_FIELDS = [
  ...RFI_LANE_COLUMNS.map((column) => column.key),
  "operating_segment",
  "origin_name",
  "origin_city",
  "origin_state",
  "origin_country",
  "origin_address",
  "origin_contact_name",
  "origin_contact_phone",
  "origin_contact_email",
  "origin_hours",
  "origin_handling_type",
  "origin_appointment_required",
  "destination_name",
  "destination_city",
  "destination_state",
  "destination_country",
  "destination_address",
  "destination_contact_name",
  "destination_contact_phone",
  "destination_contact_email",
  "destination_hours",
  "destination_handling_type",
  "destination_appointment_required",
  "equipment_type",
  "temperature_controlled",
  "monthly_volume",
  "annual_volume",
  "frequency",
  "current_rate",
  "pickup_lead_time_hours",
  "expected_transit_time_hours",
  "cargo_value_currency",
  "weight",
  "pallets",
  "dimensions",
  "seasonality_notes",
  "special_requirements",
  ...CHECKLIST_FIELDS
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || "";
}

function firstCleanText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return "";
}

function splitCityState(value) {
  const text = cleanText(value);
  if (!text.includes(",")) return { city: text, state: "" };
  const [city, ...rest] = text.split(",");
  return { city: cleanText(city), state: cleanText(rest.join(",")) };
}

function numberOrBlank(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(number) ? String(number) : "";
}

function checkedBoolean(value) {
  const normalized = cleanText(value).toLowerCase();
  return value === true || ["true", "on", "yes", "si", "sÃ­", "1", "x", "checked"].includes(normalized);
}

function normalizeRfiImportHeader(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function canonicalImportedSelectValue(column, value) {
  const text = cleanText(value);
  if (!text || column.type !== "select") return text;
  const normalized = normalizeRfiImportHeader(text);
  const option = (column.options || []).find((candidate) => {
    const candidateValue = typeof candidate === "string" ? candidate : candidate.value;
    const candidateLabel = typeof candidate === "string" ? candidate : candidate.label || candidate.value;
    return normalizeRfiImportHeader(candidateValue) === normalized || normalizeRfiImportHeader(candidateLabel) === normalized;
  });
  return option ? (typeof option === "string" ? option : option.value) : text;
}

function mapRfiImportHeaders(values) {
  const headers = values.map(normalizeRfiImportHeader);
  const mapping = {};
  for (const column of RFI_LANE_COLUMNS) {
    const candidates = [column.key, column.label, ...(RFI_IMPORT_ALIASES[column.key] || [])]
      .map(normalizeRfiImportHeader)
      .filter(Boolean);
    const index = headers.findIndex((header) => candidates.some((candidate) => (
      header === candidate || (candidate.length >= 5 && (header.includes(candidate) || candidate.includes(header)))
    )));
    if (index >= 0) mapping[column.key] = index;
  }
  return mapping;
}

const RFI_RUBRIC_IMPORT_ALIASES = {
  segment_key: ["segment key", "segment", "operating segment", "segmento", "segmento operativo"],
  segment_name: ["segment name", "nombre segmento", "nombre del segmento"],
  rubric_key: ["rubric key", "rubro key", "item key", "key", "clave"],
  category: ["category", "categoria", "rubric category", "tipo de rubro"],
  label: ["label", "topic", "rubro", "nombre", "rubric"],
  question: ["question", "what to ask", "que preguntar"],
  expected: ["expected", "expected answer", "respuesta esperada"],
  required: ["required", "obligatorio", "validar", "required?"],
  observation: ["observation", "observaciones", "notes", "respuesta", "answer"]
};

function mapRfiRubricHeaders(values) {
  const headers = values.map(normalizeRfiImportHeader);
  const mapping = {};
  for (const key of Object.keys(RFI_RUBRIC_IMPORT_ALIASES)) {
    const candidates = [key, ...(RFI_RUBRIC_IMPORT_ALIASES[key])]
      .map(normalizeRfiImportHeader)
      .filter(Boolean);
    const index = headers.findIndex((header) => candidates.some((candidate) => (
      header === candidate || (candidate.length >= 5 && (header.includes(candidate) || candidate.includes(header)))
    )));
    if (index >= 0) mapping[key] = index;
  }
  return mapping;
}

function findRfiRubricSheet(workbook, XLSX, excludedSheet = "") {
  let best = null;
  for (const sheetName of workbook.SheetNames || []) {
    if (sheetName === excludedSheet) continue;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: false });
    for (let headerIndex = 0; headerIndex < Math.min(rows.length, 20); headerIndex += 1) {
      const mapping = mapRfiRubricHeaders(rows[headerIndex] || []);
      const score = Object.keys(mapping).length;
      if (!best || score > best.score) best = { sheetName, rows, headerIndex, mapping, score };
    }
  }
  return best && best.score >= 4 ? best : null;
}

function importedRfiRubric(cells, mapping, index) {
  const get = (key) => cleanText(cells[mapping[key]]);
  const segmentKey = canonicalSegmentKey(get("segment_key") || get("segment_name"));
  const label = get("label") || `Custom rubric ${index + 1}`;
  const rubricKey = get("rubric_key") || newRubricKey(get("category") || "other_notes", label, index);
  return {
    segment_key: segmentKey,
    segment_name: get("segment_name"),
    rubric_key: rubricKey,
    category: canonicalRubricCategory(get("category")),
    label,
    question: get("question"),
    expected: get("expected"),
    required: get("required") === "" ? true : checkedBoolean(get("required")),
    observation: get("observation")
  };
}

function findRfiSegmentDetails(workbook, XLSX) {
  const sheetName = (workbook.SheetNames || []).find((name) => normalizeRfiImportHeader(name) === "segment details");
  if (!sheetName) return {};
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false, blankrows: false });
  const headers = rows[0] || [];
  const normalized = headers.map(normalizeRfiImportHeader);
  const valueAt = (aliases) => {
    const index = normalized.findIndex((header) => aliases.some((alias) => header === normalizeRfiImportHeader(alias)));
    return index >= 0 ? cleanText(rows[1]?.[index]) : "";
  };
  return {
    segment_key: valueAt(["segment_key", "segment key", "segment"]),
    segment_name: valueAt(["segment_name", "segment name", "name", "nombre"]),
    operation_type: valueAt(["operation_type", "operation type", "operation model"]),
    source_template_version: valueAt(["source_template_version", "template version"])
  };
}

function findRfiImportSheet(workbook, XLSX) {
  let best = null;
  for (const sheetName of workbook.SheetNames || []) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: false });
    for (let headerIndex = 0; headerIndex < Math.min(rows.length, 20); headerIndex += 1) {
      const mapping = mapRfiImportHeaders(rows[headerIndex] || []);
      const score = Object.keys(mapping).length;
      if (!best || score > best.score) best = { sheetName, rows, headerIndex, mapping, score };
    }
  }
  return best;
}

function isRfiImportGuideRow(lane) {
  const laneId = normalizeRfiImportHeader(lane.lane_id);
  const origin = normalizeRfiImportHeader(lane.origin_location);
  const destination = normalizeRfiImportHeader(lane.destination_location);
  return laneId === "id" || laneId === "id lane" || (origin === "city state" && destination === "city state");
}

function laneHasMeaningfulData(lane) {
  const defaultOnly = new Set(["lane_id", "truck_type", "operation_type", "service_type", "currency"]);
  return RFI_LANE_COLUMNS.some((column) => {
    if (defaultOnly.has(column.key)) return false;
    const value = lane[column.key];
    return value === true || cleanText(value);
  });
}

function rfiImportDiagnostics(lanes, rubrics) {
  const warnings = [];
  const requiredLaneFields = ["origin_location", "destination_location", "truck_type", "weekly_volume"];
  const incompleteLanes = lanes.filter((lane) => requiredLaneFields.some((field) => !cleanText(lane[field])));
  if (incompleteLanes.length) {
    warnings.push(`${incompleteLanes.length} route(s) are missing an origin, destination, truck type, or weekly volume.`);
  }
  const duplicateLaneIds = lanes
    .map((lane) => cleanText(lane.lane_id).toLowerCase())
    .filter(Boolean)
    .filter((laneId, index, ids) => ids.indexOf(laneId) !== index);
  if (duplicateLaneIds.length) warnings.push(`${new Set(duplicateLaneIds).size} duplicate lane ID(s) need review.`);
  const incompleteRubrics = rubrics.filter((rubric) => !cleanText(rubric.segment_key) || !cleanText(rubric.category) || !cleanText(rubric.label));
  if (incompleteRubrics.length) warnings.push(`${incompleteRubrics.length} rubric line(s) are missing a segment, category, or label.`);
  return warnings;
}

function importedRfiLane(cells, mapping, index) {
  const lane = { ...makeLane(index), operating_segment: "" };
  for (const column of RFI_LANE_COLUMNS) {
    const sourceIndex = mapping[column.key];
    if (!Number.isInteger(sourceIndex)) continue;
    const value = cells[sourceIndex];
    if (column.type === "checkbox") lane[column.key] = checkedBoolean(value);
    else if (column.type === "number") lane[column.key] = numberOrBlank(value);
    else lane[column.key] = canonicalImportedSelectValue(column, value);
  }
  lane.lane_id = cleanText(lane.lane_id) || `L${index + 1}`;
  const origin = splitCityState(lane.origin_location);
  const destination = splitCityState(lane.destination_location);
  lane.origin_name = lane.origin_location;
  lane.origin_city = origin.city;
  lane.origin_state = origin.state;
  lane.origin_contact_name = lane.origin_shipper;
  lane.origin_hours = lane.origin_service_window;
  lane.origin_handling_type = lane.origin_load_type;
  lane.destination_name = lane.destination_location;
  lane.destination_city = destination.city;
  lane.destination_state = destination.state;
  lane.destination_contact_name = lane.destination_consignee;
  lane.destination_hours = lane.destination_service_window;
  lane.destination_handling_type = lane.destination_unload_type;
  lane.equipment_type = lane.truck_type;
  lane.commodity = lane.product;
  lane.weight = lane.average_weight;
  lane.pallets = lane.pieces;
  lane.annual_volume = lane.last_annual_volume;
  lane.seasonality_notes = lane.seasonality;
  lane.pickup_lead_time_hours = lane.positioning_lead_time;
  lane.origin_text = routeLabel(lane, "origin");
  lane.destination_text = routeLabel(lane, "destination");
  lane.operating_segment = segmentFromLane(lane);
  return lane;
}

async function importRfiWorkbook(file) {
  if (!file) return;
  if (!/\.(xlsx|xls|csv)$/i.test(file.name || "")) {
    throw new Error("Choose an XLSX, XLS, or CSV route schedule workbook.");
  }
  if (!xlsxModulePromise) xlsxModulePromise = import(XLSX_MODULE_URL);
  const XLSX = await xlsxModulePromise;
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const selected = findRfiImportSheet(workbook, XLSX);
  if (!selected || selected.score < 5) {
    throw new Error("The workbook does not contain a recognizable RFI route schedule header.");
  }
  const rubricSheet = findRfiRubricSheet(workbook, XLSX, selected.sheetName);
  collectRfi();
  const existingLanes = state.lanes.filter(laneHasMeaningfulData);
  const imported = selected.rows
    .slice(selected.headerIndex + 1)
    .map((cells, index) => importedRfiLane(cells, selected.mapping, existingLanes.length + index))
    .filter(laneHasMeaningfulData)
    .filter((lane) => !isRfiImportGuideRow(lane));
  if (!imported.length) {
    throw new Error("No route rows were found below the workbook header. The guide row was ignored.");
  }
  const importedRubrics = (rubricSheet?.rows || [])
    .slice((rubricSheet?.headerIndex || 0) + 1)
    .map((cells, index) => importedRfiRubric(cells, rubricSheet.mapping, index))
    .filter((rubric) => cleanText(rubric.label) && !["label", "topic", "rubro"].includes(normalizeRfiImportHeader(rubric.label)));
  state.lanes = [...existingLanes, ...imported].map((lane, index) => ({ ...lane, lane_id: cleanText(lane.lane_id) || `L${index + 1}` }));
  const segments = [...state.segmentChecklists];
  for (const key of new Set([...imported.map(segmentFromLane), ...importedRubrics.map((rubric) => rubric.segment_key)])) {
    if (!segments.some((segment) => segment.segment_key === key)) segments.push(makeSegmentChecklist(segments.length, key));
    setSegmentCheckbox(key, true);
  }
  for (const rubric of importedRubrics) {
    const segmentKey = canonicalSegmentKey(rubric.segment_key);
    const segmentIndex = segments.findIndex((segment) => segment.segment_key === segmentKey);
    if (segmentIndex < 0) continue;
    const segment = segments[segmentIndex];
    const rubricItems = objectValue(segment.rubric_items);
    rubricItems[rubric.rubric_key] = {
      category: rubric.category,
      label: rubric.label,
      question: rubric.question,
      expected: rubric.expected,
      required: rubric.required,
      observation: rubric.observation
    };
    segment.rubric_items = rubricItems;
    segment.removed_rubric_keys = (segment.removed_rubric_keys || []).filter((key) => key !== rubric.rubric_key);
    segments[segmentIndex] = normalizeSegmentChecklist(segment);
  }
  state.segmentChecklists = segments;
  state.activeSegmentKey = segmentFromLane(imported[0]);
  state.activeWorkspaceView = "lanes";
  render();
  const rubricMessage = importedRubrics.length ? ` ${importedRubrics.length} rubric line(s) imported from ${rubricSheet.sheetName}.` : "";
  const warnings = rfiImportDiagnostics(imported, importedRubrics);
  const warningMessage = warnings.length ? ` Review before saving: ${warnings.join(" ")}` : " Review them, then save the draft.";
  setStatus(`${imported.length} route(s) imported from ${selected.sheetName}.${rubricMessage}${warningMessage}`);
}

function segmentTemplateIdentity(value, fallback = "custom_segment") {
  const normalized = normalizeRfiImportHeader(value)
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function uniqueSegmentKey(value, existing = []) {
  const used = new Set(existing.map((segment) => cleanText(segment.segment_key)));
  const base = segmentTemplateIdentity(value);
  let key = base;
  let suffix = 2;
  while (used.has(key)) key = `${base}_${suffix++}`;
  return key;
}

function activeRfiSegment() {
  return state.segmentChecklists.find((segment) => segment.segment_key === state.activeSegmentKey)
    || makeSegmentChecklist(0, state.activeSegmentKey);
}

function hasLoadedActiveRfiSegment() {
  return Boolean(
    token
      && !state.loading
      && state.segmentChecklists.some((segment) => segment.segment_key === state.activeSegmentKey)
  );
}

function syncSegmentTemplateName() {
  const name = cleanText(els.segmentTemplateName?.value);
  if (!name) return;
  const segment = state.segmentChecklists.find((item) => item.segment_key === state.activeSegmentKey);
  if (segment) segment.segment_name = name;
}

async function importRfiSegmentWorkbook(file) {
  if (!file) return;
  if (!/\.(xlsx|xls|csv)$/i.test(file.name || "")) {
    throw new Error("Choose an XLSX, XLS, or CSV segment template.");
  }
  if (!xlsxModulePromise) xlsxModulePromise = import(XLSX_MODULE_URL);
  const XLSX = await xlsxModulePromise;
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const selected = findRfiImportSheet(workbook, XLSX);
  if (!selected || selected.score < 5) throw new Error("The segment template does not contain a recognizable route schedule header.");
  const rubricSheet = findRfiRubricSheet(workbook, XLSX, selected.sheetName);
  const details = findRfiSegmentDetails(workbook, XLSX);
  syncSegmentTemplateName();
  collectRfi();
  const existingLanes = state.lanes.filter(laneHasMeaningfulData);
  const imported = selected.rows
    .slice(selected.headerIndex + 1)
    .map((cells, index) => importedRfiLane(cells, selected.mapping, index))
    .filter(laneHasMeaningfulData)
    .filter((lane) => !isRfiImportGuideRow(lane));
  const importedRubrics = (rubricSheet?.rows || [])
    .slice((rubricSheet?.headerIndex || 0) + 1)
    .map((cells, index) => importedRfiRubric(cells, rubricSheet.mapping, index))
    .filter((rubric) => cleanText(rubric.label) && !["label", "topic", "rubro"].includes(normalizeRfiImportHeader(rubric.label)));
  if (!imported.length && !importedRubrics.length) throw new Error("No route or rubric rows were found in the segment template.");

  const currentSegments = [...state.segmentChecklists];
  const sourceKey = canonicalSegmentKey(details.segment_key || importedRubrics[0]?.segment_key || imported[0]?.operating_segment || state.activeSegmentKey);
  const requestedName = cleanText(els.segmentTemplateName?.value) || cleanText(details.segment_name) || activeRfiSegment().segment_name || optionLabel(SEGMENT_OPTIONS, sourceKey) || sourceKey;
  const createNew = Boolean(els.importAsNewSegment?.checked);
  const targetKey = createNew ? uniqueSegmentKey(requestedName, currentSegments) : state.activeSegmentKey;
  const existingIndex = currentSegments.findIndex((segment) => segment.segment_key === targetKey);
  const target = existingIndex >= 0
    ? { ...currentSegments[existingIndex] }
    : makeSegmentChecklist(currentSegments.length, sourceKey);
  target.segment_key = targetKey;
  target.segment_name = requestedName;
  target.operation_type = details.operation_type || target.operation_type || "";
  target.rubric_template_key = sourceKey;

  if (imported.length) {
    const targetLanes = imported.map((lane, index) => ({
      ...lane,
      operating_segment: targetKey,
      lane_id: cleanText(lane.lane_id) || `L${index + 1}`
    }));
    state.lanes = [
      ...existingLanes.filter((lane) => segmentFromLane(lane) !== targetKey),
      ...targetLanes
    ];
  }
  const rubricItems = objectValue(target.rubric_items);
  for (const rubric of importedRubrics) {
    const rubricKey = cleanText(rubric.rubric_key) || newRubricKey(rubric.category || "other_notes", rubric.label, Object.keys(rubricItems).length);
    rubricItems[rubricKey] = {
      category: rubric.category,
      label: rubric.label,
      question: rubric.question,
      expected: rubric.expected,
      required: rubric.required,
      observation: rubric.observation
    };
  }
  target.rubric_items = rubricItems;
  target.removed_rubric_keys = (target.removed_rubric_keys || []).filter((key) => rubricItems[key]);
  if (existingIndex >= 0) currentSegments[existingIndex] = normalizeSegmentChecklist(target);
  else currentSegments.push(normalizeSegmentChecklist(target));
  state.segmentChecklists = currentSegments;
  state.activeSegmentKey = targetKey;
  state.activeWorkspaceView = "lanes";
  if (!createNew) setSegmentCheckbox(targetKey, true);
  render();
  const warnings = rfiImportDiagnostics(imported, importedRubrics);
  const warningMessage = warnings.length ? ` Review before saving: ${warnings.join(" ")}` : " Review the segment, then save the draft.";
  setStatus(`${createNew ? "New segment" : "Segment"} \"${requestedName}\" imported: ${imported.length} route(s), ${importedRubrics.length} rubric line(s).${warningMessage}`);
}

function excelColumnName(index) {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function rfiExcelOptions(column) {
  if (column.type === "checkbox") return ["TRUE", "FALSE"];
  return (column.options || [])
    .map((option) => cleanText(typeof option === "string" ? option : option.value))
    .filter(Boolean);
}

// Rubrics are intentionally suggestive: a customer can always type a value that
// is not in this catalog. The lists make the common operational answers quick
// to select without turning the RFI into a rigid form.
const RFI_RUBRIC_RESPONSE_CATALOGS = {
  response_default: ["Required", "Preferred", "Not required", "Not applicable", "Other / specify"],
  response_yes_no: ["Yes", "No", "Customer decides", "Carrier decides", "Other / specify"],
  response_load_model: ["Live", "Drop", "Preload", "Drop & hook", "Other / specify"],
  response_tracking: ["GPS", "Check calls", "GPS + check calls", "TMS / ELD feed", "Other / specify"],
  response_update_frequency: ["Every 1 hour", "Every 2 hours", "Every 4 hours", "At milestones", "Exception only", "Other / specify"],
  response_payment_terms: ["Net 15", "Net 30", "Net 45", "Net 60", "Other / specify"],
  response_currency: ["MXN", "USD", "CAD", "Other / specify"],
  response_fuel: ["Included", "Indexed", "Separate", "Not applicable", "Other / specify"],
  response_driver: ["Single", "Team", "B1", "Hazmat", "Single + B1", "Team + B1", "Other / specify"],
  response_trailer: ["Dry van", "Reefer", "Flatbed", "Specialized", "Other / specify"],
  response_temperature: ["Ambient", "Temperature controlled", "Reefer", "Not applicable", "Other / specify"],
  response_carrier_type: ["Asset-based", "Broker", "3PL", "Mixed", "Other / specify"],
  response_compliance: ["Required", "Preferred", "Not required", "Not applicable", "Other / specify"]
};

function rfiRubricResponseCatalog(item = {}) {
  const searchable = `${item.key || ""} ${item.label || ""} ${item.question || ""} ${item.expected || ""}`.toLowerCase();
  if (/currency|moneda|\bmxn\b|\busd\b|\bcad\b/.test(searchable)) return "response_currency";
  if (/payment|pago|credito|net\s?\d+/.test(searchable)) return "response_payment_terms";
  if (/fuel|fsc|surcharge/.test(searchable)) return "response_fuel";
  if (/loading|unloading|tipo de carga|tipo de descarga|live|drop|preload|drop.?hook/.test(searchable)) return "response_load_model";
  if (/tracking|gps|check.?call|eld|updates|actualiza/.test(searchable)) return /update|actualiza/.test(searchable) ? "response_update_frequency" : "response_tracking";
  if (/driver|chofer|team|\bb1\b/.test(searchable)) return "response_driver";
  if (/trailer|equipo|reefer|flatbed|temperatura|temperature/.test(searchable)) return /temperatura|temperature|reefer/.test(searchable) ? "response_temperature" : "response_trailer";
  if (/carrier type|tipo de carrier|asset.?based|broker|3pl/.test(searchable)) return "response_carrier_type";
  if (/appointment|cita|required|obligatorio|apply|aplica|permiso|insurance|seguro|certif|ctpat|fast|oea|hazmat/.test(searchable)) return "response_yes_no";
  if (/compliance|cumplimiento|profile|perfil/.test(searchable)) return "response_compliance";
  return "response_default";
}

function rfiValidationName(key) {
  const normalized = cleanText(key).replace(/[^A-Za-z0-9_]/g, "_");
  return `RFI_${normalized || "LIST"}`;
}

function addRfiValidationList(workbook, sheet, key, values, columnIndex) {
  const cleanValues = [...new Set(values.map(cleanText).filter(Boolean))];
  if (!cleanValues.length) return "";
  const column = excelColumnName(columnIndex);
  const range = `'${sheet.name}'!$${column}$2:$${column}$${cleanValues.length + 1}`;
  const name = rfiValidationName(key);
  // ExcelJS expects the address first and the defined-name second.
  workbook.definedNames.add(range, name);
  sheet.getCell(1, columnIndex).value = key;
  cleanValues.forEach((value, rowIndex) => {
    sheet.getCell(rowIndex + 2, columnIndex).value = value;
  });
  return name;
}

function rfiListValidation(validationName, { allowBlank = true, prompt = "Choose a listed value or type a new value." } = {}) {
  return {
    type: "list",
    allowBlank,
    // Excel expects an equals-prefixed named range. Error validation stays off
    // so a user can enter a customer-specific value that is not suggested.
    formulae: [`=${validationName}`],
    showInputMessage: true,
    promptTitle: "Rateware catalog suggestion",
    prompt,
    showErrorMessage: false,
    showDropDown: false
  };
}

function addRfiRubricResponseValidations(sheet, startRow, items, validationNames, responseColumnIndex) {
  items.forEach((item, index) => {
    const listName = validationNames.get(rfiRubricResponseCatalog(item)) || validationNames.get("response_default");
    if (!listName) return;
    const cell = `${excelColumnName(responseColumnIndex - 1)}${startRow + index}`;
    sheet.dataValidations.add(cell, rfiListValidation(listName, {
      prompt: "Choose a suggested response or type a customer-specific value."
    }));
  });
}

function saveWorkbookBuffer(buffer, filename) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function styleRfiWorkbookSheet(sheet, columnWidths, { headerRows = 1, filterToColumn } = {}) {
  const darkBlue = "1F4E78";
  const paleBlue = "DDEBF7";
  const border = { style: "thin", color: { argb: "D7E0E8" } };
  sheet.views = [{ state: "frozen", ySplit: headerRows }];
  sheet.getRow(1).height = 30;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: darkBlue } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: border, bottom: border, left: border, right: border };
  });
  if (headerRows > 1) {
    sheet.getRow(2).height = 28;
    sheet.getRow(2).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8E8" } };
      cell.font = { italic: true, color: { argb: "6A4C00" }, size: 9 };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { top: border, bottom: border, left: border, right: border };
    });
  }
  sheet.columns.forEach((column, index) => {
    column.width = columnWidths[index] || 14;
    column.alignment = { vertical: "top", wrapText: true };
  });
  if (filterToColumn) sheet.autoFilter = `A1:${excelColumnName(filterToColumn - 1)}1`;
}

async function getExcelJs() {
  if (!excelJsModulePromise) excelJsModulePromise = import(EXCELJS_MODULE_URL);
  const module = await excelJsModulePromise;
  return module.default || module;
}

async function downloadRfiTemplate() {
  const ExcelJS = await getExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rateware";
  workbook.created = new Date();
  const validationSheet = workbook.addWorksheet("Validation Lists");
  const validationNames = new Map();
  const validationColumns = [
    ...RFI_LANE_COLUMNS.filter((column) => column.type === "select" || column.type === "checkbox")
      .map((column) => ({ key: column.key, values: rfiExcelOptions(column) })),
    { key: "segment_key", values: SEGMENT_OPTIONS.map((option) => option.value) },
    { key: "rubric_category", values: CHECKLIST_GROUPS.map((group) => group.key) },
    { key: "required", values: ["TRUE", "FALSE"] },
    ...Object.entries(RFI_RUBRIC_RESPONSE_CATALOGS).map(([key, values]) => ({ key, values }))
  ];
  validationColumns.forEach((list, index) => {
    const name = addRfiValidationList(workbook, validationSheet, list.key, list.values, index + 1);
    if (name) validationNames.set(list.key, name);
  });
  styleRfiWorkbookSheet(validationSheet, validationColumns.map(() => 22), { filterToColumn: validationColumns.length });
  validationSheet.state = "hidden";

  const routeHeaders = RFI_LANE_COLUMNS.map((column) => column.label);
  const routeGuide = RFI_LANE_COLUMNS.map((column) => column.type === "checkbox" ? "FALSE" : column.placeholder || "");
  const routeSheet = workbook.addWorksheet("Route Schedule");
  routeSheet.addRow(routeHeaders);
  routeSheet.addRow(routeGuide);
  styleRfiWorkbookSheet(routeSheet, RFI_LANE_COLUMNS.map((column) => Math.min(30, Math.max(11, Math.round((column.width || 110) / 6)))), { headerRows: 1, filterToColumn: routeHeaders.length });
  RFI_LANE_COLUMNS.forEach((column, index) => {
    const validationName = validationNames.get(column.key);
    if (!validationName) return;
    const range = `${excelColumnName(index)}3:${excelColumnName(index)}502`;
    routeSheet.dataValidations.add(range, rfiListValidation(validationName));
  });

  const rubricHeaders = ["segment_key", "segment_name", "rubric_key", "category", "label", "question", "expected", "required", "response / notes"];
  const rubricItems = SEGMENT_OPTIONS.flatMap((option) => flattenChecklistItems(option.value).map((item) => ({
    ...item,
    segment_key: option.value,
    segment_name: option.label
  })));
  const rubricRows = rubricItems.map((item) => [
    item.segment_key,
    item.segment_name,
    item.key,
    item.category,
    item.label,
    item.question,
    item.expected,
    "TRUE",
    item.observation || ""
  ]);
  const rubricSheet = workbook.addWorksheet("Rubric Checklist");
  rubricSheet.addRow(rubricHeaders);
  rubricRows.forEach((row) => rubricSheet.addRow(row));
  styleRfiWorkbookSheet(rubricSheet, [16, 22, 30, 24, 28, 52, 42, 12, 44], { filterToColumn: rubricHeaders.length });
  rubricSheet.dataValidations.add("A2:A502", rfiListValidation(validationNames.get("segment_key"), { allowBlank: false, prompt: "Choose an operating segment or type a new segment key." }));
  rubricSheet.dataValidations.add("D2:D502", rfiListValidation(validationNames.get("rubric_category"), { allowBlank: false, prompt: "Choose a rubric category or type a custom category." }));
  rubricSheet.dataValidations.add("H2:H502", rfiListValidation(validationNames.get("required"), { allowBlank: false, prompt: "Choose TRUE or FALSE." }));
  addRfiRubricResponseValidations(rubricSheet, 2, rubricItems, validationNames, 9);

  const catalogRows = [["catalog_type", "value", "label", "notes"]];
  for (const option of SEGMENT_OPTIONS) catalogRows.push(["segment", option.value, option.label, "You can type a new value in the RFI."]);
  for (const column of RFI_LANE_COLUMNS.filter((item) => item.type === "select")) {
    for (const option of column.options || []) {
      const value = typeof option === "string" ? option : option.value;
      const label = typeof option === "string" ? option : option.label || option.value;
      if (cleanText(value)) catalogRows.push([column.key, value, label, "Suggested value; free text is allowed."]);
    }
  }
  for (const group of CHECKLIST_GROUPS) catalogRows.push(["rubric_category", group.key, group.title, group.help]);
  for (const [key, values] of Object.entries(RFI_RUBRIC_RESPONSE_CATALOGS)) {
    for (const value of values) catalogRows.push([key, value, value, "Rubric response suggestion; free text is allowed."]);
  }
  const catalogSheet = workbook.addWorksheet("Catalog");
  catalogRows.forEach((row) => catalogSheet.addRow(row));
  styleRfiWorkbookSheet(catalogSheet, [24, 30, 34, 56], { filterToColumn: 4 });

  const instructions = [
    ["RATEWARE CUSTOMER RFI TEMPLATE / PLANTILLA RFI RATEWARE"],
    ["Instructions / Instructivo"],
    ["1", "Complete Route Schedule with one lane per row. Delete the guide row before importing if you do not need it."],
    ["2", "Complete Rubric Checklist. Each response / notes cell has contextual suggestions, while keeping customer-specific free text available."],
    ["3", "You may edit any rubric line, add a new line, or set required to TRUE/FALSE. Free text is accepted even when a catalog suggestion exists."],
    ["4", "Use Catalog as a reference for suggested values. Dropdowns use a hidden named-list sheet and do not block a new value."],
    ["5", "Save this workbook as XLSX and upload it from the RFI. The app preserves route and rubric data for review before final submission."],
    ["6", "Las rubricas se pueden modificar, agregar o dejar como no obligatorias. Las respuestas y observaciones se revisan antes de enviar el RFI."],
    ["Required route fields / Campos esenciales", "Origin, destination, truck type and weekly volume / Origen, destino, tipo de camion y volumen semanal"],
    ["Required rubric fields / Campos de rubrica", "segment_key, category, label and required. Question, expected and response / notes may be edited."],
    ["Do not enter carrier rates in this template. This is a customer RFI requirements workbook."],
    ["No incluyas tarifas de carriers en esta plantilla. Es un libro de requisitos del cliente."]
  ];
  const instructionSheet = workbook.addWorksheet("Instructions");
  instructions.forEach((row) => instructionSheet.addRow(row));
  instructionSheet.mergeCells("A1:B1");
  styleRfiWorkbookSheet(instructionSheet, [28, 120], { filterToColumn: 2 });
  instructionSheet.getRow(1).height = 36;
  instructionSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 13 };
  instructionSheet.eachRow((row, index) => {
    if (index <= 1) return;
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 32;
  });
  saveWorkbookBuffer(await workbook.xlsx.writeBuffer(), "rateware-customer-rfi-template.xlsx");
}

async function downloadRfiSegmentTemplate() {
  const ExcelJS = await getExcelJs();
  const segment = hasLoadedActiveRfiSegment() ? activeRfiSegment() : null;
  if (!segment) throw new Error("Open a signed RFI link and select an operating segment before downloading its template.");
  const segmentKey = cleanText(segment.segment_key) || "crossborder";
  const segmentName = cleanText(els.segmentTemplateName?.value) || segment.segment_name || optionLabel(SEGMENT_OPTIONS, segmentKey) || segmentKey;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rateware";
  workbook.created = new Date();

  const validationSheet = workbook.addWorksheet("Validation Lists");
  const validationNames = new Map();
  const validationColumns = [
    ...RFI_LANE_COLUMNS.filter((column) => column.type === "select" || column.type === "checkbox")
      .map((column) => ({ key: column.key, values: rfiExcelOptions(column) })),
    { key: "rubric_category", values: CHECKLIST_GROUPS.map((group) => group.key) },
    { key: "required", values: ["TRUE", "FALSE"] },
    ...Object.entries(RFI_RUBRIC_RESPONSE_CATALOGS).map(([key, values]) => ({ key, values }))
  ];
  validationColumns.forEach((list, index) => {
    const name = addRfiValidationList(workbook, validationSheet, list.key, list.values, index + 1);
    if (name) validationNames.set(list.key, name);
  });
  styleRfiWorkbookSheet(validationSheet, validationColumns.map(() => 22), { filterToColumn: validationColumns.length });
  validationSheet.state = "hidden";

  const detailsSheet = workbook.addWorksheet("Segment Details");
  detailsSheet.addRow(["segment_key", "segment_name", "operation_type", "rubric_template_key", "source_template_version"]);
  detailsSheet.addRow([segmentKey, segmentName, cleanText(segment.operation_type), cleanText(segment.rubric_template_key || segmentKey), "segment-v1"]);
  styleRfiWorkbookSheet(detailsSheet, [24, 42, 28, 30, 28], { filterToColumn: 5 });
  detailsSheet.getRow(2).alignment = { vertical: "top", wrapText: true };

  const routeHeaders = RFI_LANE_COLUMNS.map((column) => column.label);
  const routeSheet = workbook.addWorksheet("Route Schedule");
  routeSheet.addRow(routeHeaders);
  const segmentLanes = state.lanes.filter((lane) => segmentFromLane(lane) === segmentKey);
  const routeRows = segmentLanes.length
    ? segmentLanes.map((lane) => RFI_LANE_COLUMNS.map((column) => lane[column.key] ?? ""))
    : [RFI_LANE_COLUMNS.map((column) => column.type === "checkbox" ? "FALSE" : column.placeholder || "")];
  routeRows.forEach((row) => routeSheet.addRow(row));
  styleRfiWorkbookSheet(routeSheet, RFI_LANE_COLUMNS.map((column) => Math.min(30, Math.max(11, Math.round((column.width || 110) / 6)))), { filterToColumn: routeHeaders.length });
  RFI_LANE_COLUMNS.forEach((column, index) => {
    const validationName = validationNames.get(column.key);
    if (!validationName) return;
    const range = `${excelColumnName(index)}2:${excelColumnName(index)}502`;
    routeSheet.dataValidations.add(range, rfiListValidation(validationName));
  });

  const rubricHeaders = ["segment_key", "segment_name", "rubric_key", "category", "label", "question", "expected", "required", "response / notes"];
  const rubricItems = flattenChecklistItems(segmentKey, segment.rubric_items, segment.removed_rubric_keys);
  const rubricRows = rubricItems.map((item) => [
    segmentKey,
    segmentName,
    item.key,
    item.category,
    item.label,
    item.question,
    item.expected,
    item.required === false ? "FALSE" : "TRUE",
    item.observation || ""
  ]);
  const rubricSheet = workbook.addWorksheet("Rubric Checklist");
  rubricSheet.addRow(rubricHeaders);
  (rubricRows.length ? rubricRows : [[segmentKey, segmentName, "custom_rubric", "other_notes", "Custom rubric", "", "", "TRUE", ""]]).forEach((row) => rubricSheet.addRow(row));
  styleRfiWorkbookSheet(rubricSheet, [20, 30, 30, 24, 30, 56, 44, 12, 48], { filterToColumn: rubricHeaders.length });
  rubricSheet.dataValidations.add("D2:D502", rfiListValidation(validationNames.get("rubric_category"), { allowBlank: false, prompt: "Choose a rubric category or type a custom category." }));
  rubricSheet.dataValidations.add("H2:H502", rfiListValidation(validationNames.get("required"), { allowBlank: false, prompt: "Choose TRUE or FALSE." }));
  addRfiRubricResponseValidations(rubricSheet, 2, rubricItems.length ? rubricItems : [{ key: "custom_rubric" }], validationNames, 9);

  const catalogRows = [["catalog_type", "value", "label", "notes"]];
  for (const column of RFI_LANE_COLUMNS.filter((item) => item.type === "select")) {
    for (const option of column.options || []) {
      const value = typeof option === "string" ? option : option.value;
      const label = typeof option === "string" ? option : option.label || option.value;
      if (cleanText(value)) catalogRows.push([column.key, value, label, "Suggested value; free text is allowed."]);
    }
  }
  for (const group of CHECKLIST_GROUPS) catalogRows.push(["rubric_category", group.key, group.title, group.help]);
  for (const [key, values] of Object.entries(RFI_RUBRIC_RESPONSE_CATALOGS)) {
    for (const value of values) catalogRows.push([key, value, value, "Rubric response suggestion; free text is allowed."]);
  }
  const catalogSheet = workbook.addWorksheet("Catalog");
  catalogRows.forEach((row) => catalogSheet.addRow(row));
  styleRfiWorkbookSheet(catalogSheet, [24, 30, 38, 56], { filterToColumn: 4 });

  const instructions = [
    ["RATEWARE SEGMENT TEMPLATE / PLANTILLA DE SEGMENTO"],
    ["Segment", segmentName],
    ["1", "Complete only the routes and requirements for this operating segment. / Completa solo las rutas y requisitos de este segmento operativo."],
    ["2", "Use Segment Details to edit the segment name and operation model. / Usa Segment Details para editar el nombre y modelo operativo."],
    ["3", "Add or remove rubric rows as needed. Required TRUE/FALSE controls carrier confirmation. Use response / notes to record the operating requirement. / Agrega o elimina rubros. Required TRUE/FALSE controla la confirmacion del carrier. Usa respuesta / notas para registrar el requisito operativo."],
    ["4", "Every route category and rubric response has contextual dropdown suggestions. You can type a custom value when the catalog does not fit. / Cada categoria de ruta y respuesta de rubrica tiene sugerencias. Puedes escribir valores personalizados."],
    ["5", "Upload this workbook with Import segment template. Choose Create as new segment to keep similar operations separate. / Sube el libro con Importar template del segmento y marca Crear como segmento nuevo para separar operaciones similares."],
    ["6", "Review the imported routes and checklist in the app before saving the RFI draft. / Revisa rutas y checklist en la app antes de guardar el borrador."],
    ["Required route fields / Campos esenciales", "Origin, destination, truck type and weekly volume / Origen, destino, tipo de camion y volumen semanal"]
  ];
  const instructionSheet = workbook.addWorksheet("Instructions");
  instructions.forEach((row) => instructionSheet.addRow(row));
  instructionSheet.mergeCells("A1:B1");
  styleRfiWorkbookSheet(instructionSheet, [30, 125], { filterToColumn: 2 });
  instructionSheet.getRow(1).height = 36;
  instructionSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 13 };
  instructionSheet.eachRow((row, index) => {
    if (index <= 1) return;
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 34;
  });
  saveWorkbookBuffer(await workbook.xlsx.writeBuffer(), `rateware-segment-${segmentTemplateIdentity(segmentName)}.xlsx`);
}

function setStatus(message, tone = "info") {
  if (!els.message) return;
  els.message.textContent = tone === "error" ? humanizeError(message) : message || "";
  els.message.dataset.tone = tone;
}

function responseObject() {
  const response = state.submission?.response;
  return response && typeof response === "object" && !Array.isArray(response) ? response : {};
}

function selectOptions(options, selected) {
  const selectedText = cleanText(selected);
  return options
    .map((option) => {
      const value = typeof option === "string" ? option : option.value;
      const label = typeof option === "string" ? option : option.label;
      return `<option value="${escapeHtml(value)}"${value === selectedText ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function catalogId(column) {
  return `rfi-catalog-${column.key}`;
}

function renderAutofillCatalogs() {
  if (!els.catalogs) return;
  const selectableColumns = RFI_LANE_COLUMNS.filter((column) => column.type === "select");
  els.catalogs.innerHTML = `
    <datalist id="rfi-catalog-segment-key">${SEGMENT_OPTIONS.map((option) => `<option value="${escapeHtml(option.value)}" label="${escapeHtml(option.label)}"></option>`).join("")}</datalist>
    ${selectableColumns.map((column) => `
    <datalist id="${catalogId(column)}">
      ${(column.options || []).filter((option) => cleanText(typeof option === "string" ? option : option.value)).map((option) => {
        const value = typeof option === "string" ? option : option.value;
        const label = typeof option === "string" ? option : option.label || option.value;
        return `<option value="${escapeHtml(value)}" label="${escapeHtml(label)}"></option>`;
      }).join("")}
    </datalist>
  `).join("")}`;
}

function optionLabel(options, value) {
  const text = cleanText(value);
  const found = options.find((option) => option.value === text);
  return found?.label || text;
}

function objectValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function canonicalRubricCategory(value) {
  const normalized = normalizeRfiImportHeader(value).replace(/\s+/g, "_");
  const aliases = {
    modelo_logistico: "logistics_model",
    logistics_model: "logistics_model",
    criterios_de_operacion: "operation_criteria",
    operation_criteria: "operation_criteria",
    reglas_de_negocio: "business_rules",
    business_rules: "business_rules",
    especificaciones_de_servicio: "service_specifications",
    service_specifications: "service_specifications",
    perfil_requerido_del_carrier: "carrier_requirements",
    carrier_requirements: "carrier_requirements",
    notas_y_excepciones_operativas: "other_notes",
    other_notes: "other_notes"
  };
  const category = aliases[normalized] || normalized;
  return CHECKLIST_GROUPS.some((group) => group.key === category) ? category : "other_notes";
}

function newRubricKey(category = "other_notes", label = "custom", index = 0) {
  const base = normalizeRfiImportHeader(`${category}_${label}`).replace(/\s+/g, "_").slice(0, 44) || "custom";
  return `custom_${base}_${index}_${Date.now().toString(36)}`;
}

function logisticsRowsForSegment(segmentKey) {
  const key = canonicalSegmentKey(segmentKey);
  return LOGISTICS_MODEL_ITEMS[key] || LOGISTICS_MODEL_ITEMS.crossborder;
}

function suggestionForSegment(segmentKey) {
  const key = canonicalSegmentKey(segmentKey);
  return RFI_SEGMENT_SUGGESTIONS[key] || RFI_SEGMENT_SUGGESTION_ALIASES[key] || RFI_SEGMENT_SUGGESTIONS.crossborder;
}

function checklistGroupsForSegment(segmentKey, source = {}, removed = []) {
  const key = canonicalSegmentKey(segmentKey);
  const saved = objectValue(source);
  const removedSet = new Set((Array.isArray(removed) ? removed : []).map(cleanText).filter(Boolean));
  return CHECKLIST_GROUPS.map((group) => {
    const baseRows = group.key === "logistics_model" ? logisticsRowsForSegment(key) : group.rows;
    const minimumRows = (SEGMENT_RUBRIC_MINIMUMS[key] || []).filter((item) => item.category === group.key);
    const customRows = Object.entries(saved)
      .filter(([itemKey, item]) => item && canonicalRubricCategory(item.category || group.key) === group.key)
      .map(([itemKey, item]) => ({ ...item, key: itemKey, category: group.key }));
    const byKey = new Map([...baseRows, ...minimumRows, ...customRows].map((item) => [item.key, item]));
    return { ...group, rows: [...byKey.values()].filter((item) => !removedSet.has(item.key)) };
  });
}

function flattenChecklistItems(segmentKey, source = {}, removed = []) {
  return checklistGroupsForSegment(segmentKey, source, removed).flatMap((group) =>
    group.rows.map((item) => ({
      ...item,
      category: item.category || group.key
    }))
  );
}

function defaultRubricItems(segmentKey, source = {}, removed = []) {
  const existing = objectValue(source);
  const items = {};
  for (const item of flattenChecklistItems(segmentKey, source, removed)) {
    const prior = objectValue(existing[item.key]);
    items[item.key] = {
      category: item.category,
      label: cleanText(prior.label) || item.label,
      question: cleanText(prior.question) || item.question,
      expected: cleanText(prior.expected) || item.expected,
      required: prior.required === undefined ? true : checkedBoolean(prior.required),
      observation: cleanText(prior.observation || prior.answer || prior.notes)
    };
  }
  for (const [key, priorRaw] of Object.entries(existing)) {
    const prior = objectValue(priorRaw);
    if (items[key] || !prior) continue;
    items[key] = {
      category: canonicalRubricCategory(prior.category),
      label: cleanText(prior.label) || key,
      question: cleanText(prior.question),
      expected: cleanText(prior.expected),
      required: prior.required === undefined ? true : checkedBoolean(prior.required),
      observation: cleanText(prior.observation || prior.answer || prior.notes)
    };
  }
  return items;
}

function mergeRubricItemsForSegment(segmentKey, source = {}, defaults = {}) {
  const sourceItems = defaultRubricItems(segmentKey, source, []);
  const defaultItems = objectValue(defaults);
  for (const [key, item] of Object.entries(sourceItems)) {
    if (!cleanText(item.observation)) {
      item.observation = cleanText(defaultItems[key]?.observation);
    }
  }
  return sourceItems;
}

function seedRubricObservations(rubricItems, values = {}) {
  const items = objectValue(rubricItems);
  for (const field of CHECKLIST_FIELDS) {
    if (field === "attachment_links") continue;
    const text = cleanText(values[field]);
    if (!text) continue;
    const firstItem = Object.values(items).find((item) => item.category === field);
    if (firstItem && !cleanText(firstItem.observation)) firstItem.observation = text;
  }
  return items;
}

function categorySummary(rubricItems, category) {
  return Object.values(objectValue(rubricItems))
    .filter((item) => item && item.category === category && (checkedBoolean(item.required) || cleanText(item.observation)))
    .map((item) => `${cleanText(item.label)}: ${cleanText(item.observation) || cleanText(item.expected)}`)
    .filter(Boolean)
    .join("\n");
}

function categoryRequired(rubricItems, category) {
  return Object.values(objectValue(rubricItems))
    .some((item) => item && item.category === category && checkedBoolean(item.required));
}

function rubricSummaryFields(segment) {
  const rubricItems = objectValue(segment.rubric_items);
  return {
    logistics_model_required: categoryRequired(rubricItems, "logistics_model"),
    logistics_model: categorySummary(rubricItems, "logistics_model") || cleanText(segment.logistics_model),
    operation_criteria_required: categoryRequired(rubricItems, "operation_criteria"),
    operation_criteria: categorySummary(rubricItems, "operation_criteria") || cleanText(segment.operation_criteria),
    business_rules_required: categoryRequired(rubricItems, "business_rules"),
    business_rules: categorySummary(rubricItems, "business_rules") || cleanText(segment.business_rules),
    service_specifications_required: categoryRequired(rubricItems, "service_specifications"),
    service_specifications: categorySummary(rubricItems, "service_specifications") || cleanText(segment.service_specifications),
    carrier_requirements_required: categoryRequired(rubricItems, "carrier_requirements"),
    carrier_requirements: categorySummary(rubricItems, "carrier_requirements") || cleanText(segment.carrier_requirements),
    other_notes_required: categoryRequired(rubricItems, "other_notes"),
    other_notes: categorySummary(rubricItems, "other_notes") || cleanText(segment.other_notes)
  };
}

function normalizeSegmentChecklist(segment) {
  const segmentKey = canonicalSegmentKey(segment.segment_key);
  const removedRubricKeys = Array.isArray(segment.removed_rubric_keys)
    ? segment.removed_rubric_keys.map(cleanText).filter(Boolean)
    : [];
  const rubricTemplateKey = canonicalSegmentKey(segment.rubric_template_key || segmentKey);
  const rubricItems = defaultRubricItems(rubricTemplateKey, segment.rubric_items, removedRubricKeys);
  const normalized = {
    ...segment,
    segment_key: segmentKey,
    removed_rubric_keys: removedRubricKeys,
    rubric_items: rubricItems
  };
  return {
    ...normalized,
    ...rubricSummaryFields(normalized)
  };
}

function routeLabel(row, prefix) {
  const location = cleanText(row[`${prefix}_location`]);
  if (location) {
    return [
      location,
      row[`${prefix}_postal_code`]
    ].map(cleanText).filter(Boolean).join(" | ");
  }
  return [
    row[`${prefix}_name`],
    [row[`${prefix}_city`], row[`${prefix}_state`]].map(cleanText).filter(Boolean).join(", "),
    row[`${prefix}_postal_code`]
  ].map(cleanText).filter(Boolean).join(" | ");
}

function routeLabelFallback(row, prefix) {
  return cleanText(row[`${prefix}_text`] || row[prefix]) || routeLabel(row, prefix);
}

function makeLane(index = 0) {
  return {
    lane_id: `L${index + 1}`,
    operating_segment: "crossborder",
    origin_location: "",
    origin_shipper: "",
    origin_facility_type: "",
    origin_load_type: "",
    origin_schedule_type: "",
    origin_service_window: "",
    origin_name: "",
    origin_city: "",
    origin_state: "",
    origin_country: "",
    origin_postal_code: "",
    origin_address: "",
    origin_contact_name: "",
    origin_contact_phone: "",
    origin_contact_email: "",
    origin_hours: "",
    origin_handling_type: "",
    origin_appointment_required: false,
    origin_average_time_hours: "",
    origin_site_restrictions: "",
    destination_location: "",
    destination_consignee: "",
    destination_facility_type: "",
    destination_unload_type: "",
    destination_schedule_type: "",
    destination_service_window: "",
    destination_name: "",
    destination_city: "",
    destination_state: "",
    destination_country: "",
    destination_postal_code: "",
    destination_address: "",
    destination_contact_name: "",
    destination_contact_phone: "",
    destination_contact_email: "",
    destination_hours: "",
    destination_handling_type: "",
    destination_appointment_required: false,
    destination_average_time_hours: "",
    destination_site_restrictions: "",
    origin_key: "",
    origin_text: "",
    destination_key: "",
    destination_text: "",
    operation_type: "d2d_export",
    service_type: "standard",
    truck_type: "Truck Trailer",
    equipment_type: "",
    trailer_requirements: "",
    config: "",
    border_crossing: "",
    average_border_days: "",
    customs_broker: "",
    transfer: "",
    product: "",
    commodity: "",
    hazmat: false,
    hazmat_un_number: "",
    temperature_controlled: false,
    cargo_value: "",
    cargo_value_currency: "",
    packaging: "",
    pieces: "",
    stackable_beds: false,
    average_weight: "",
    average_cubic_meters: "",
    weight: "",
    pallets: "",
    dimensions: "",
    mon_volume: "",
    tue_volume: "",
    wed_volume: "",
    thu_volume: "",
    fri_volume: "",
    sat_volume: "",
    sun_volume: "",
    sourcing_priority: "",
    weekly_volume: "",
    last_annual_volume: "",
    monthly_volume: "",
    annual_volume: "",
    frequency: "",
    seasonality: "",
    scheduling_type: "",
    positioning_lead_time: "",
    driver_assistance: false,
    double_driver: false,
    pickup_lead_time_hours: "",
    expected_transit_time_hours: "",
    transit_days: "",
    average_distance: "",
    target_rate: "",
    current_rate: "",
    currency: "USD",
    seasonality_notes: "",
    special_requirements: "",
    notes: "",
    logistics_model: "",
    operation_criteria: "",
    business_rules: "",
    service_specifications: "",
    carrier_requirements: "",
    other_notes: "",
    attachment_links: ""
  };
}

function rowOrigin(row) {
  return {
    key: cleanText(row.origin_key || row.key || row.id),
    name: cleanText(row.name),
    address: cleanText(row.address),
    city: cleanText(row.city),
    state: cleanText(row.state),
    country: cleanText(row.country),
    postal_code: cleanText(row.postal_code),
    contact_name: cleanText(row.contact_name),
    contact_phone: cleanText(row.contact_phone),
    contact_email: cleanText(row.contact_email),
    hours: cleanText(row.loading_hours || row.hours),
    appointment_required: Boolean(row.appointment_required),
    handling_type: cleanText(row.loading_type || row.handling_type),
    average_time_hours: numberOrBlank(row.average_loading_time_hours || row.average_time_hours),
    site_restrictions: cleanText(row.site_restrictions),
    notes: cleanText(row.notes)
  };
}

function rowDestination(row) {
  return {
    key: cleanText(row.destination_key || row.key || row.id),
    name: cleanText(row.name),
    address: cleanText(row.address),
    city: cleanText(row.city),
    state: cleanText(row.state),
    country: cleanText(row.country),
    postal_code: cleanText(row.postal_code),
    contact_name: cleanText(row.contact_name),
    contact_phone: cleanText(row.contact_phone),
    contact_email: cleanText(row.contact_email),
    hours: cleanText(row.receiving_hours || row.hours),
    appointment_required: Boolean(row.appointment_required),
    handling_type: cleanText(row.unloading_type || row.handling_type),
    average_time_hours: numberOrBlank(row.average_unloading_time_hours || row.average_time_hours),
    site_restrictions: cleanText(row.site_restrictions),
    late_delivery_penalties: cleanText(row.late_delivery_penalties),
    notes: cleanText(row.notes)
  };
}

function applyLocationFallback(lane, data, prefix) {
  const key = cleanText(lane[`${prefix}_key`] || data[`${prefix}_id`]);
  const rows = prefix === "origin" ? state.origins : state.destinations;
  const match = rows.find((row) => cleanText(row.key || row.id) === key);
  if (!match) return lane;
  return {
    ...lane,
    [`${prefix}_name`]: cleanText(lane[`${prefix}_name`] || match.name),
    [`${prefix}_address`]: cleanText(lane[`${prefix}_address`] || match.address),
    [`${prefix}_city`]: cleanText(lane[`${prefix}_city`] || match.city),
    [`${prefix}_state`]: cleanText(lane[`${prefix}_state`] || match.state),
    [`${prefix}_country`]: cleanText(lane[`${prefix}_country`] || match.country),
    [`${prefix}_postal_code`]: cleanText(lane[`${prefix}_postal_code`] || match.postal_code),
    [`${prefix}_contact_name`]: cleanText(lane[`${prefix}_contact_name`] || match.contact_name),
    [`${prefix}_contact_phone`]: cleanText(lane[`${prefix}_contact_phone`] || match.contact_phone),
    [`${prefix}_contact_email`]: cleanText(lane[`${prefix}_contact_email`] || match.contact_email),
    [`${prefix}_hours`]: cleanText(lane[`${prefix}_hours`] || match.hours),
    [`${prefix}_handling_type`]: cleanText(lane[`${prefix}_handling_type`] || match.handling_type),
    [`${prefix}_appointment_required`]: checkedBoolean(lane[`${prefix}_appointment_required`] || match.appointment_required),
    [`${prefix}_site_restrictions`]: cleanText(lane[`${prefix}_site_restrictions`] || match.site_restrictions || match.notes)
  };
}

function rowLane(row, index) {
  const payload = row.raw_payload && typeof row.raw_payload === "object" ? row.raw_payload : {};
  const originLocation = firstCleanText(payload.origin_location, row.origin_location, payload.origin_text, row.origin_text, row.origin, [payload.origin_city || row.origin_city, payload.origin_state || row.origin_state].filter(Boolean).join(", "));
  const destinationLocation = firstCleanText(payload.destination_location, row.destination_location, payload.destination_text, row.destination_text, row.destination, [payload.destination_city || row.destination_city, payload.destination_state || row.destination_state].filter(Boolean).join(", "));
  const originParts = splitCityState(originLocation);
  const destinationParts = splitCityState(destinationLocation);
  let lane = {
    ...makeLane(index),
    ...payload,
    ...row,
    lane_id: cleanText(payload.lane_id || row.lane_id || row.id) || `L${index + 1}`,
    origin_key: cleanText(payload.origin_key || row.origin_key || row.origin_id),
    origin_location: originLocation,
    origin_text: originLocation,
    origin_shipper: firstCleanText(payload.origin_shipper, row.origin_shipper, payload.origin_contact_name, row.origin_contact_name),
    origin_facility_type: firstCleanText(payload.origin_facility_type, row.origin_facility_type),
    origin_load_type: firstCleanText(payload.origin_load_type, row.origin_load_type, payload.origin_handling_type, row.origin_handling_type, payload.loading_type),
    origin_schedule_type: firstCleanText(payload.origin_schedule_type, row.origin_schedule_type),
    origin_service_window: firstCleanText(payload.origin_service_window, row.origin_service_window, payload.origin_hours, row.origin_hours),
    destination_key: cleanText(payload.destination_key || row.destination_key || row.destination_id),
    destination_location: destinationLocation,
    destination_text: destinationLocation,
    destination_consignee: firstCleanText(payload.destination_consignee, row.destination_consignee, payload.destination_contact_name, row.destination_contact_name),
    destination_facility_type: firstCleanText(payload.destination_facility_type, row.destination_facility_type),
    destination_unload_type: firstCleanText(payload.destination_unload_type, row.destination_unload_type, payload.destination_handling_type, row.destination_handling_type, payload.unloading_type),
    destination_schedule_type: firstCleanText(payload.destination_schedule_type, row.destination_schedule_type),
    destination_service_window: firstCleanText(payload.destination_service_window, row.destination_service_window, payload.destination_hours, row.destination_hours),
    operating_segment: cleanText(payload.operating_segment || row.operating_segment || row.segment) || "crossborder",
    operation_type: cleanText(payload.operation_type || row.operation_type || row.operation) || "d2d_export",
    service_type: cleanText(payload.service_type || row.service_type || row.service) || "standard",
    truck_type: firstCleanText(payload.truck_type, row.truck_type, payload.equipment, row.equipment, payload.equipment_type, row.equipment_type, "Truck Trailer"),
    equipment_type: firstCleanText(payload.truck_type, row.truck_type, payload.equipment, row.equipment, payload.equipment_type, row.equipment_type),
    trailer_requirements: firstCleanText(payload.trailer_requirements, row.trailer_requirements, payload.trailer, row.trailer, payload.tipo_equipo),
    config: cleanText(payload.config || row.config),
    border_crossing: firstCleanText(payload.border_crossing, row.border_crossing, payload.crossing),
    average_border_days: numberOrBlank(payload.average_border_days ?? row.average_border_days ?? payload.border_days),
    customs_broker: firstCleanText(payload.customs_broker, row.customs_broker),
    transfer: firstCleanText(payload.transfer, row.transfer),
    product: firstCleanText(payload.product, row.product, payload.commodity, row.commodity),
    commodity: firstCleanText(payload.product, row.product, payload.commodity, row.commodity),
    hazmat: checkedBoolean(payload.hazmat ?? row.hazmat),
    hazmat_un_number: firstCleanText(payload.hazmat_un_number, row.hazmat_un_number, payload.un_number),
    temperature_controlled: checkedBoolean(payload.temperature_controlled ?? row.temperature_controlled),
    cargo_value: numberOrBlank(payload.cargo_value ?? row.cargo_value),
    cargo_value_currency: cleanText(payload.cargo_value_currency || row.cargo_value_currency),
    packaging: firstCleanText(payload.packaging, row.packaging),
    pieces: numberOrBlank(payload.pieces ?? row.pieces),
    stackable_beds: checkedBoolean(payload.stackable_beds ?? row.stackable_beds),
    average_weight: numberOrBlank(payload.average_weight ?? row.average_weight ?? payload.weight ?? row.weight),
    average_cubic_meters: numberOrBlank(payload.average_cubic_meters ?? row.average_cubic_meters),
    weight: numberOrBlank(payload.average_weight ?? row.average_weight ?? payload.weight ?? row.weight),
    pallets: numberOrBlank(payload.pallets ?? row.pallets ?? payload.pieces ?? row.pieces),
    dimensions: cleanText(payload.dimensions || row.dimensions || payload.average_cubic_meters || row.average_cubic_meters),
    mon_volume: numberOrBlank(payload.mon_volume ?? row.mon_volume),
    tue_volume: numberOrBlank(payload.tue_volume ?? row.tue_volume),
    wed_volume: numberOrBlank(payload.wed_volume ?? row.wed_volume),
    thu_volume: numberOrBlank(payload.thu_volume ?? row.thu_volume),
    fri_volume: numberOrBlank(payload.fri_volume ?? row.fri_volume),
    sat_volume: numberOrBlank(payload.sat_volume ?? row.sat_volume),
    sun_volume: numberOrBlank(payload.sun_volume ?? row.sun_volume),
    sourcing_priority: firstCleanText(payload.sourcing_priority, row.sourcing_priority),
    last_annual_volume: numberOrBlank(payload.last_annual_volume ?? row.last_annual_volume ?? payload.annual_volume ?? row.annual_volume),
    weekly_volume: numberOrBlank(payload.weekly_volume ?? row.weekly_volume),
    monthly_volume: numberOrBlank(payload.monthly_volume ?? row.monthly_volume),
    annual_volume: numberOrBlank(payload.annual_volume ?? row.annual_volume),
    frequency: cleanText(payload.frequency || row.frequency),
    seasonality: firstCleanText(payload.seasonality, row.seasonality, payload.seasonality_notes, row.seasonality_notes),
    scheduling_type: firstCleanText(payload.scheduling_type, row.scheduling_type),
    positioning_lead_time: firstCleanText(payload.positioning_lead_time, row.positioning_lead_time, payload.pickup_lead_time_hours, row.pickup_lead_time_hours),
    driver_assistance: checkedBoolean(payload.driver_assistance ?? row.driver_assistance),
    double_driver: checkedBoolean(payload.double_driver ?? row.double_driver),
    pickup_lead_time_hours: numberOrBlank(payload.pickup_lead_time_hours ?? row.pickup_lead_time_hours),
    expected_transit_time_hours: numberOrBlank(payload.expected_transit_time_hours ?? row.expected_transit_time_hours),
    transit_days: numberOrBlank(payload.transit_days ?? row.transit_days),
    average_distance: numberOrBlank(payload.average_distance ?? row.average_distance),
    target_rate: numberOrBlank(payload.target_rate ?? row.target_rate),
    current_rate: numberOrBlank(payload.current_rate ?? row.current_rate),
    currency: cleanText(payload.currency || row.currency) || "USD",
    seasonality_notes: cleanText(payload.seasonality_notes || row.seasonality_notes || payload.seasonality || row.seasonality),
    special_requirements: cleanText(payload.special_requirements || row.special_requirements),
    notes: cleanText(payload.notes || row.notes)
  };
  lane.origin_name = firstCleanText(payload.origin_name, row.origin_name, lane.origin_location);
  lane.origin_city = firstCleanText(payload.origin_city, row.origin_city, originParts.city);
  lane.origin_state = firstCleanText(payload.origin_state, row.origin_state, originParts.state);
  lane.origin_country = firstCleanText(payload.origin_country, row.origin_country);
  lane.origin_contact_name = firstCleanText(payload.origin_contact_name, row.origin_contact_name, lane.origin_shipper);
  lane.origin_hours = firstCleanText(payload.origin_hours, row.origin_hours, lane.origin_service_window);
  lane.origin_handling_type = firstCleanText(payload.origin_handling_type, row.origin_handling_type, lane.origin_load_type);
  lane.destination_name = firstCleanText(payload.destination_name, row.destination_name, lane.destination_location);
  lane.destination_city = firstCleanText(payload.destination_city, row.destination_city, destinationParts.city);
  lane.destination_state = firstCleanText(payload.destination_state, row.destination_state, destinationParts.state);
  lane.destination_country = firstCleanText(payload.destination_country, row.destination_country);
  lane.destination_contact_name = firstCleanText(payload.destination_contact_name, row.destination_contact_name, lane.destination_consignee);
  lane.destination_hours = firstCleanText(payload.destination_hours, row.destination_hours, lane.destination_service_window);
  lane.destination_handling_type = firstCleanText(payload.destination_handling_type, row.destination_handling_type, lane.destination_unload_type);
  for (const prefix of ["origin", "destination"]) {
    lane = applyLocationFallback(lane, row, prefix);
    lane[`${prefix}_text`] = routeLabelFallback(lane, prefix);
  }
  for (const field of CHECKLIST_FIELDS) lane[field] = cleanText(payload[field] || row[field] || lane[field]);
  return lane;
}

function makeSegmentChecklist(index = 0, segment = "crossborder") {
  const segmentKey = canonicalSegmentKey(segment);
  const suggestion = suggestionForSegment(segmentKey);
  return normalizeSegmentChecklist({
    segment_key: segmentKey,
    segment_name: suggestion.segment_name || `Segment ${index + 1}`,
    operation_type: suggestion.operation_type || "d2d_export",
    rubric_items: defaultRubricItems(segmentKey),
    removed_rubric_keys: [],
    attachment_links: ""
  });
}

function rowSegmentChecklist(row, index) {
  const segment = canonicalSegmentKey(row.segment_key || row.operating_segment || row.segment || "crossborder");
  const base = makeSegmentChecklist(index, segment);
  const legacyValues = {
    logistics_model: cleanText(row.logistics_model || row.logistic_model),
    operation_criteria: cleanText(row.operation_criteria || row.operational_criteria),
    business_rules: cleanText(row.business_rules),
    service_specifications: cleanText(row.service_specifications || row.service_requirements || row.service_specs),
    carrier_requirements: cleanText(row.carrier_requirements || row.required_carrier_profile),
    other_notes: cleanText(row.other_notes || row.notes)
  };
  const next = {
    ...base,
    segment_key: segment,
    segment_name: cleanText(row.segment_name || row.name) || base.segment_name,
    operation_type: cleanText(row.operation_type || row.operation) || base.operation_type,
    ...legacyValues,
    rubric_items: seedRubricObservations(
      mergeRubricItemsForSegment(segment, row.rubric_items || row.rubricItems, base.rubric_items),
      legacyValues
    ),
    attachment_links: cleanText(row.attachment_links || row.attachments)
  };
  return normalizeSegmentChecklist(next);
}

function checkedSegments() {
  return Array.from(document.querySelectorAll('input[name="rfi-segment"]:checked')).map((input) => canonicalSegmentKey(input.value));
}

function segmentFromLane(lane) {
  const segment = cleanText(lane.operating_segment);
  if (segment) return canonicalSegmentKey(segment);
  const operation = cleanText(lane.operation_type);
  if (operation === "intra_mex" || operation === "mx_domestic") return "national_ftl";
  if (operation === "us_domestic") return "national_ftl";
  if (operation === "d2d_export" || operation === "d2d_import" || operation === "crossborder") return "crossborder";
  if (operation === "local") return "local_ftl";
  if (operation === "regional") return "regional_ftl";
  if (operation === "national" || operation === "dedicated") return "national_ftl";
  return "crossborder";
}

function segmentChecklistForLane(lane, segments) {
  const key = segmentFromLane(lane);
  return segments.find((segment) => cleanText(segment.segment_key) === key)
    || segments.find((segment) => cleanText(segment.operation_type) === cleanText(lane.operation_type))
    || null;
}

function enrichLaneWithSegment(lane, segments) {
  const segment = segmentChecklistForLane(lane, segments);
  if (!segment) return lane;
  const enriched = { ...lane };
  for (const field of CHECKLIST_FIELDS) {
    if (!cleanText(enriched[field])) enriched[field] = cleanText(segment[field]);
  }
  return enriched;
}

function deriveSegmentChecklists(lanes) {
  const current = Array.isArray(state.submission?.segment_checklists) ? state.submission.segment_checklists : [];
  const response = responseObject();
  const responseSegments = Array.isArray(response.segment_checklists) ? response.segment_checklists : [];
  const source = responseSegments.length ? responseSegments : current;
  if (source.length) return source.map(rowSegmentChecklist);
  const keys = new Set([...checkedSegments(), ...lanes.map(segmentFromLane)]);
  if (!keys.size) keys.add("crossborder");
  return [...keys].map((segment, index) => makeSegmentChecklist(index, segment));
}

function renderLaneHead() {
  if (!els.laneHead) return;
  els.laneHead.innerHTML = `
    <tr class="rfi-route-group-head">
      ${groupedLaneColumns().map((group) => `<th colspan="${group.count}" data-column-group="${escapeHtml(group.key)}">${escapeHtml(group.label[state.locale] || group.label.en)}</th>`).join("")}
      <th class="rfi-action-column" rowspan="2"></th>
    </tr>
    <tr class="rfi-route-column-head">
      ${RFI_LANE_COLUMNS.map((column) => {
        const width = laneColumnWidth(column);
        return `<th ${laneCellStyle(width)} title="${escapeHtml(column.label)}"><span class="rfi-route-head-label">${escapeHtml(column.label)}${column.required ? " *" : ""}</span></th>`;
      }).join("")}
    </tr>
  `;
}

function laneColumnWidth(column) {
  if (column.type === "checkbox") return Math.max(40, Math.min(column.width || 46, 56));
  if (column.type === "number") return Math.max(52, Math.min(column.width || 68, 80));
  if (column.type === "select") return Math.max(72, Math.min(column.width || 90, 106));
  if (column.type === "textarea") return Math.max(128, Math.min(column.width || 150, 172));
  if (WRAP_LANE_FIELDS.has(column.key)) return Math.max(86, Math.min(column.width || 108, 124));
  return Math.max(58, Math.min(column.width || 82, 102));
}

function laneCellStyle(width) {
  return `style="width:${width}px;min-width:${width}px;max-width:${width}px"`;
}

function renderLaneCell(column, row) {
  const value = row[column.key];
  const width = laneColumnWidth(column);
  const wrapClass = WRAP_LANE_FIELDS.has(column.key) ? " rfi-wrap-cell" : "";
  if (column.type === "checkbox") {
    return `<td class="rfi-check-cell" ${laneCellStyle(width)}><input type="checkbox" data-field="${column.key}" ${checkedBoolean(value) ? "checked" : ""} /></td>`;
  }
  if (column.type === "select") {
    return `<td ${laneCellStyle(width)}><input type="text" list="${catalogId(column)}" data-field="${column.key}" value="${escapeHtml(value)}" placeholder="${escapeHtml(column.options?.find((option) => cleanText(option.value || option))?.label || "Select or type")}" /></td>`;
  }
  if (column.type === "textarea" || WRAP_LANE_FIELDS.has(column.key)) {
    return `<td class="${wrapClass.trim()}" ${laneCellStyle(width)}><textarea data-field="${column.key}" rows="1" placeholder="${escapeHtml(column.placeholder || "")}">${escapeHtml(value)}</textarea></td>`;
  }
  const type = column.type === "number" ? "number" : "text";
  const step = type === "number" ? ' step="0.01"' : "";
  return `<td ${laneCellStyle(width)}><input type="${type}"${step} data-field="${column.key}" value="${escapeHtml(value)}" placeholder="${escapeHtml(column.placeholder || "")}" /></td>`;
}

function renderLaneRows() {
  if (!els.lanes) return;
  renderLaneHead();
  els.lanes.innerHTML = state.lanes.map((row, index) => `
    <tr data-index="${index}" data-segment="${escapeHtml(segmentFromLane(row))}" class="rfi-route-row${segmentFromLane(row) === state.activeSegmentKey ? "" : " is-hidden"}">
      ${RFI_LANE_COLUMNS.map((column) => renderLaneCell(column, row)).join("")}
      <td class="rfi-action-column"><button type="button" class="secondary small-button" data-remove-lane="${index}">Remove</button></td>
    </tr>
  `).join("");
}

function segmentDisplayName(segment) {
  return cleanText(segment.segment_name) || optionLabel(SEGMENT_OPTIONS, segment.segment_key) || ui("segment");
}

function setSegmentCheckbox(segmentKey, checked) {
  const key = canonicalSegmentKey(segmentKey);
  const input = Array.from(document.querySelectorAll('input[name="rfi-segment"]')).find((row) => canonicalSegmentKey(row.value) === key);
  if (input) input.checked = checked;
}

function ensureSegmentWorkspace(segmentKey) {
  const key = canonicalSegmentKey(segmentKey);
  let current = collectSegmentChecklists();
  if (!current.some((segment) => segment.segment_key === key)) {
    current.push(makeSegmentChecklist(current.length, key));
  }
  state.segmentChecklists = current;
  state.activeSegmentKey = key;
  setSegmentCheckbox(key, true);
}

function syncSegmentWorkspaceFromScope() {
  const current = collectSegmentChecklists();
  const selected = new Set(checkedSegments());
  const laneCounts = new Map();
  for (const lane of state.lanes) {
    const key = segmentFromLane(lane);
    laneCounts.set(key, (laneCounts.get(key) || 0) + 1);
  }
  let next = current.filter((segment) => selected.has(segment.segment_key) || laneCounts.has(segment.segment_key));
  for (const key of selected) {
    if (!next.some((segment) => segment.segment_key === key)) next.push(makeSegmentChecklist(next.length, key));
  }
  if (!next.length) {
    const fallback = selected.values().next().value || "crossborder";
    next = [makeSegmentChecklist(0, fallback)];
    setSegmentCheckbox(fallback, true);
  }
  state.segmentChecklists = next;
  if (!next.some((segment) => segment.segment_key === state.activeSegmentKey)) {
    state.activeSegmentKey = next[0]?.segment_key || "crossborder";
  }
}

function renderSegmentTabs() {
  if (!els.segmentTabs) return;
  const segments = state.segmentChecklists;
  if (!segments.some((segment) => segment.segment_key === state.activeSegmentKey)) {
    state.activeSegmentKey = segments[0]?.segment_key || "crossborder";
  }
  els.segmentTabs.innerHTML = segments.map((segment, index) => {
    const laneCount = state.lanes.filter((lane) => segmentFromLane(lane) === segment.segment_key).length;
    const active = segment.segment_key === state.activeSegmentKey;
    return `<button type="button" role="tab" aria-selected="${active}" class="${active ? "is-active" : ""}" data-rfi-segment-tab="${escapeHtml(segment.segment_key)}"><span>${index + 1}</span><strong>${escapeHtml(segmentDisplayName(segment))}</strong><small>${laneCount} ${laneCount === 1 ? "lane" : "lanes"}</small></button>`;
  }).join("");
  const active = segments.find((segment) => segment.segment_key === state.activeSegmentKey);
  if (els.activeSegmentTitle) els.activeSegmentTitle.textContent = active ? segmentDisplayName(active) : ui("segmentDetails");
  if (els.segmentTemplateName && document.activeElement !== els.segmentTemplateName) {
    els.segmentTemplateName.value = active ? segmentDisplayName(active) : "";
  }
}

function renderSegmentChecklists() {
  if (!els.segmentChecklists) return;
  els.segmentChecklists.innerHTML = state.segmentChecklists.map((segment, index) => `
    <article class="rfi-segment-checklist${segment.segment_key === state.activeSegmentKey ? "" : " is-hidden"}" data-segment-index="${index}" data-segment-key="${escapeHtml(segment.segment_key)}">
      <div class="customer-rfi-row-head">
        <div>
          <p class="eyebrow">${ui("segment")} ${index + 1}</p>
          <strong>${escapeHtml(segment.segment_name || optionLabel(SEGMENT_OPTIONS, segment.segment_key))}</strong>
        </div>
        <div class="rfi-heading-actions"><button type="button" class="rfi-help-trigger" data-rfi-help="segment" title="${escapeHtml(ui("fieldGuide"))}">&#128214;</button><button type="button" class="secondary small-button" data-remove-segment-checklist="${index}">${ui("remove")}</button></div>
      </div>
      <div class="rfi-segment-meta">
        <label>${ui("segment")}
          <input type="text" list="rfi-catalog-segment-key" data-field="segment_key" value="${escapeHtml(segment.segment_key)}" />
        </label>
        <label>${ui("name")}<input data-field="segment_name" value="${escapeHtml(segment.segment_name)}" placeholder="Crossborder direct / Dedicated / Intra-Mex" /></label>
        <label>${ui("operationModel")}
          <input type="text" list="rfi-catalog-operation_type" data-field="operation_type" value="${escapeHtml(segment.operation_type)}" />
        </label>
      </div>
      <div class="rfi-suggestion-row">
        <span>${ui("suggestions")}</span>
        ${SEGMENT_OPTIONS.map((option) => `<button type="button" class="secondary small-button" data-suggest-rubrics="${option.value}" data-index="${index}">${escapeHtml(option.label)}</button>`).join("")}
      </div>
      <div class="rfi-rubric-groups">
        ${checklistGroupsForSegment(segment.segment_key, segment.rubric_items, segment.removed_rubric_keys).map((group, groupIndex) => {
          const requiredCount = group.rows.filter((item) => objectValue(segment.rubric_items)[item.key]?.required !== false).length;
          return `
            <details class="rfi-rubric-group" data-rubric-group="${escapeHtml(group.key)}" ${groupIndex === 0 ? "open" : ""}>
              <summary>
                <span class="rfi-rubric-group-copy"><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml(group.help)}</small></span>
                <span class="rfi-rubric-group-progress">${requiredCount}/${group.rows.length}</span>
              </summary>
              <div class="rfi-rubric-group-toolbar">
                <button type="button" class="rfi-inline-help" data-rfi-help="${escapeHtml(group.key)}" title="${escapeHtml(ui("fieldGuide"))}">&#128214;</button>
                <button type="button" class="secondary small-button" data-rfi-group-required="all" data-segment-index="${index}" data-category="${escapeHtml(group.key)}">${ui("markAllRequired")}</button>
                <button type="button" class="secondary small-button" data-rfi-group-required="none" data-segment-index="${index}" data-category="${escapeHtml(group.key)}">${ui("clearRequired")}</button>
                <button type="button" class="secondary small-button" data-add-rubric-to-segment data-segment-index="${index}" data-category="${escapeHtml(group.key)}">${ui("addRubric")}</button>
              </div>
              <div class="rfi-checklist-table-wrap">
                <table class="rfi-checklist-table">
                  <thead><tr><th>${ui("validate")}</th><th>${ui("topic")}</th><th>${ui("whatToAsk")}</th><th>${ui("expectedAnswer")}</th><th>${ui("observations")}</th><th>${ui("actions")}</th></tr></thead>
                  <tbody>
                    ${group.rows.map((item) => {
                      const saved = objectValue(segment.rubric_items)[item.key] || {};
                      const label = cleanText(saved.label) || item.label;
                      const question = cleanText(saved.question) || item.question;
                      const expected = cleanText(saved.expected) || item.expected;
                      return `
                        <tr class="rfi-checklist-row" data-item-key="${escapeHtml(item.key)}" data-category="${escapeHtml(group.key)}">
                          <td class="rfi-check-cell"><input type="checkbox" data-field="required" ${saved.required === false ? "" : "checked"} /></td>
                          <td><input type="text" data-field="label" value="${escapeHtml(label)}" /></td>
                          <td><textarea data-field="question" rows="1">${escapeHtml(question)}</textarea></td>
                          <td><textarea data-field="expected" rows="1">${escapeHtml(expected)}</textarea></td>
                          <td><textarea data-field="observation" rows="1" placeholder="Respuesta, criterio, excepcion o nota...">${escapeHtml(saved.observation)}</textarea></td>
                          <td class="rfi-action-cell"><button type="button" class="secondary small-button" data-remove-rubric data-segment-index="${index}" data-item-key="${escapeHtml(item.key)}">${ui("removeRubric")}</button></td>
                        </tr>
                      `;
                    }).join("")}
                  </tbody>
                </table>
              </div>
            </details>
          `;
        }).join("")}
      </div>
    </article>
  `).join("");
}

function renderSegmentFiles() {
  if (!els.segmentFiles) return;
  const index = state.segmentChecklists.findIndex((segment) => segment.segment_key === state.activeSegmentKey);
  const segment = state.segmentChecklists[index];
  if (!segment) {
    els.segmentFiles.innerHTML = "";
    return;
  }
  els.segmentFiles.innerHTML = `
    <section class="rfi-file-vault" data-segment-index="${index}">
      <div class="rfi-vault-context"><strong>${escapeHtml(segmentDisplayName(segment))}</strong><span>${ui("vaultHelp")}</span></div>
      <div class="rfi-drop-zone" data-rfi-drop-zone="${index}"><strong>${ui("fileVault")}</strong><span>${ui("vaultHelp")}</span><button type="button" class="secondary small-button" data-rfi-browse="${index}">${ui("browse")}</button><input type="file" data-rfi-file-input="${index}" multiple hidden /></div>
      <label>${ui("attachmentLinks")}<textarea data-field="attachment_links" rows="3" placeholder="https://drive.google.com/...">${escapeHtml(segment.attachment_links)}</textarea></label>
    </section>
  `;
}

function renderWorkspaceState() {
  document.querySelectorAll("[data-rfi-workspace-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.rfiWorkspacePanel !== state.activeWorkspaceView;
  });
  document.querySelectorAll("[data-rfi-workspace-view]").forEach((button) => {
    const active = button.dataset.rfiWorkspaceView === state.activeWorkspaceView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function clientCompleteness(rfi = null) {
  const domRows = Array.from(els.lanes?.querySelectorAll("tr[data-index]") || []);
  const lanes = rfi?.lanes || (domRows.length ? collectLaneRows() : state.lanes);
  if (!lanes.length) return 0;
  let checks = 0;
  let passed = 0;
  for (const lane of lanes) {
    const values = [
      routeLabelFallback(lane, "origin"),
      routeLabelFallback(lane, "destination"),
      lane.equipment_type,
      lane.weekly_volume
    ];
    for (const value of values) {
      checks += 1;
      if (cleanText(value)) passed += 1;
    }
  }
  return Math.round((passed / Math.max(checks, 1)) * 100);
}

function setReadonlyMode() {
  const readonly = state.submitted;
  const segmentTemplateReady = hasLoadedActiveRfiSegment();
  document.querySelectorAll(".customer-rfi-shell input, .customer-rfi-shell select, .customer-rfi-shell textarea").forEach((element) => {
    element.disabled = readonly;
  });
  document.querySelectorAll("#add-lane-row, #download-rfi-segment-template, #import-rfi-segment-template, #rfi-segment-template-name, #rfi-import-as-new-segment, [data-remove-lane], [data-remove-segment-checklist], [data-suggest-rubrics], [data-rfi-wizard-segment], [data-rfi-group-required], [data-add-rubric-to-segment], [data-remove-rubric]").forEach((element) => {
    element.disabled = readonly;
  });
  if (els.save) els.save.disabled = readonly;
  if (els.submit) {
    els.submit.disabled = readonly;
    els.submit.textContent = readonly ? "Submitted" : "Submit final RFI";
  }
  if (els.downloadSegmentTemplate) els.downloadSegmentTemplate.disabled = readonly || !segmentTemplateReady;
  if (els.importSegmentTemplate) els.importSegmentTemplate.disabled = readonly || !Boolean(token);
  if (els.segmentTemplateName) els.segmentTemplateName.disabled = readonly || !segmentTemplateReady;
  if (els.importAsNewSegment) els.importAsNewSegment.disabled = readonly || !Boolean(token);
  if (els.segmentTemplateState) {
    const copyKey = segmentTemplateReady
      ? "segmentTemplateReady"
      : token ? "segmentTemplateNeedsSegment" : "segmentTemplateNeedsToken";
    els.segmentTemplateState.textContent = ui(copyKey);
    els.segmentTemplateState.dataset.tone = segmentTemplateReady ? "ready" : token ? "muted" : "error";
  }
}

function renderSummary() {
  const project = state.project;
  if (els.title) els.title.textContent = project?.title || "Transportation requirements intake";
  if (els.subtitle) {
    els.subtitle.textContent = [
      project?.customer_name,
      project?.opportunity_type,
      project?.due_date ? `Due ${project.due_date}` : null
    ].filter(Boolean).join(" | ") || "Customer RFI";
  }
  if (els.statusPill) els.statusPill.textContent = state.submitted ? "submitted" : state.submission?.status || "draft";
  if (els.completeness) els.completeness.textContent = `${clientCompleteness()}%`;
}

function render() {
  applyLocale();
  renderAutofillCatalogs();
  renderSummary();
  renderSegmentTabs();
  renderLaneRows();
  renderSegmentChecklists();
  renderSegmentFiles();
  renderWorkspaceState();
  setReadonlyMode();
}

function collectLaneRows() {
  return Array.from(els.lanes?.querySelectorAll("tr[data-index]") || [])
    .map((row, index) => {
      const lane = makeLane(index);
      for (const field of LANE_FIELDS) {
        const input = row.querySelector(`[data-field="${field}"]`);
        if (!input) continue;
        lane[field] = input.type === "checkbox" ? input.checked : cleanText(input.value);
      }
      lane.operating_segment = cleanText(row.dataset.segment) || lane.operating_segment || state.activeSegmentKey;
      lane.lane_id = cleanText(lane.lane_id) || `L${index + 1}`;
      const originParts = splitCityState(lane.origin_location);
      const destinationParts = splitCityState(lane.destination_location);
      lane.origin_name = firstCleanText(lane.origin_name, lane.origin_location);
      lane.origin_city = firstCleanText(lane.origin_city, originParts.city);
      lane.origin_state = firstCleanText(lane.origin_state, originParts.state);
      lane.origin_contact_name = firstCleanText(lane.origin_contact_name, lane.origin_shipper);
      lane.origin_hours = firstCleanText(lane.origin_hours, lane.origin_service_window);
      lane.origin_handling_type = firstCleanText(lane.origin_handling_type, lane.origin_load_type);
      lane.destination_name = firstCleanText(lane.destination_name, lane.destination_location);
      lane.destination_city = firstCleanText(lane.destination_city, destinationParts.city);
      lane.destination_state = firstCleanText(lane.destination_state, destinationParts.state);
      lane.destination_contact_name = firstCleanText(lane.destination_contact_name, lane.destination_consignee);
      lane.destination_hours = firstCleanText(lane.destination_hours, lane.destination_service_window);
      lane.destination_handling_type = firstCleanText(lane.destination_handling_type, lane.destination_unload_type);
      lane.equipment_type = firstCleanText(lane.truck_type, lane.equipment_type);
      lane.commodity = firstCleanText(lane.product, lane.commodity);
      lane.weight = firstCleanText(lane.average_weight, lane.weight);
      lane.pallets = firstCleanText(lane.pieces, lane.pallets);
      lane.annual_volume = firstCleanText(lane.last_annual_volume, lane.annual_volume);
      lane.seasonality_notes = firstCleanText(lane.seasonality, lane.seasonality_notes);
      lane.pickup_lead_time_hours = firstCleanText(lane.positioning_lead_time, lane.pickup_lead_time_hours);
      lane.origin_text = routeLabelFallback(lane, "origin");
      lane.destination_text = routeLabelFallback(lane, "destination");
      lane.operating_segment = cleanText(lane.operating_segment) || segmentFromLane(lane);
      lane.currency = cleanText(lane.currency) || "USD";
      return lane;
    })
    .filter(laneHasMeaningfulData);
}

function collectSegmentChecklists() {
  return Array.from(els.segmentChecklists?.querySelectorAll(".rfi-segment-checklist") || [])
    .map((row, index) => {
      const get = (field) => cleanText(row.querySelector(`[data-field="${field}"]`)?.value);
      const previous = state.segmentChecklists[index] || {};
      const segmentKey = canonicalSegmentKey(get("segment_key") || previous.segment_key || "crossborder");
      const removedRubricKeys = Array.isArray(previous.removed_rubric_keys) ? [...previous.removed_rubric_keys] : [];
      const rubricDefinitions = Object.fromEntries(flattenChecklistItems(segmentKey, previous.rubric_items, removedRubricKeys).map((item) => [item.key, item]));
      const rubricItems = {};
      for (const itemRow of row.querySelectorAll(".rfi-checklist-row[data-item-key]")) {
        const itemKey = cleanText(itemRow.dataset.itemKey);
        const definition = rubricDefinitions[itemKey] || {};
        rubricItems[itemKey] = {
          category: cleanText(itemRow.dataset.category || definition.category),
          label: cleanText(itemRow.querySelector('[data-field="label"]')?.value) || cleanText(definition.label) || itemKey,
          question: cleanText(itemRow.querySelector('[data-field="question"]')?.value) || cleanText(definition.question),
          expected: cleanText(itemRow.querySelector('[data-field="expected"]')?.value) || cleanText(definition.expected),
          required: itemRow.querySelector('[data-field="required"]')?.checked === true,
          observation: cleanText(itemRow.querySelector('[data-field="observation"]')?.value)
        };
      }
      for (const [itemKey, previousItem] of Object.entries(objectValue(previous.rubric_items))) {
        if (rubricItems[itemKey] || removedRubricKeys.includes(itemKey)) continue;
        const item = objectValue(previousItem);
        rubricItems[itemKey] = {
          category: canonicalRubricCategory(item.category),
          label: cleanText(item.label) || itemKey,
          question: cleanText(item.question),
          expected: cleanText(item.expected),
          required: item.required === false ? false : true,
          observation: cleanText(item.observation || item.answer || item.notes)
        };
      }
      return normalizeSegmentChecklist({
        segment_key: segmentKey,
        segment_name: get("segment_name") || optionLabel(SEGMENT_OPTIONS, segmentKey) || `Segment ${index + 1}`,
        operation_type: get("operation_type"),
        rubric_items: rubricItems,
        removed_rubric_keys: removedRubricKeys,
        attachment_links: cleanText(
          els.segmentFiles?.querySelector(`[data-segment-index="${index}"] [data-field="attachment_links"]`)?.value
          || state.segmentChecklists[index]?.attachment_links
        )
      });
    })
    .filter((row) => Object.values(row).some((value) => cleanText(value)));
}

function routeToLegacyLocation(row, prefix, index) {
  const keyPrefix = prefix === "origin" ? "O" : "D";
  const location = {
    key: `${keyPrefix}${index + 1}`,
    name: cleanText(row[`${prefix}_name`] || routeLabelFallback(row, prefix)),
    address: cleanText(row[`${prefix}_address`]),
    city: cleanText(row[`${prefix}_city`]),
    state: cleanText(row[`${prefix}_state`]),
    country: cleanText(row[`${prefix}_country`]),
    postal_code: cleanText(row[`${prefix}_postal_code`]),
    contact_name: cleanText(row[`${prefix}_contact_name`]),
    contact_phone: cleanText(row[`${prefix}_contact_phone`]),
    contact_email: cleanText(row[`${prefix}_contact_email`]),
    hours: cleanText(row[`${prefix}_hours`]),
    appointment_required: Boolean(row[`${prefix}_appointment_required`]),
    handling_type: cleanText(row[`${prefix}_handling_type`]),
    average_time_hours: cleanText(row[`${prefix}_average_time_hours`]),
    site_restrictions: cleanText(row[`${prefix}_site_restrictions`]),
    notes: cleanText(row[`${prefix}_site_restrictions`])
  };
  return Object.values(location).some((value) => value === true || cleanText(value)) ? location : null;
}

function collectRfi(updateState = true) {
  const baseLanes = collectLaneRows();
  const segments = collectSegmentChecklists();
  const lanes = baseLanes.map((lane) => enrichLaneWithSegment(lane, segments));
  const origins = lanes.map((lane, index) => routeToLegacyLocation(lane, "origin", index)).filter(Boolean);
  const destinations = lanes.map((lane, index) => routeToLegacyLocation(lane, "destination", index)).filter(Boolean);
  if (updateState) {
    state.origins = origins;
    state.destinations = destinations;
    state.lanes = lanes;
    state.segmentChecklists = segments;
  }
  const mergedText = (field, fallback = "") => segments.map((segment) => cleanText(segment[field])).filter(Boolean).join("\n\n") || fallback;
  return {
    account_overview: {
      company: cleanText(els.company?.value),
      contact: cleanText(els.contact?.value),
      scope: cleanText(els.scope?.value)
    },
    operating_segments: checkedSegments().map((value) => ({ value })),
    segment_checklists: segments,
    origins: origins.map((row) => ({
      origin_key: row.key,
      ...row,
      loading_hours: row.hours,
      loading_type: row.handling_type,
      average_loading_time_hours: row.average_time_hours
    })),
    destinations: destinations.map((row) => ({
      destination_key: row.key,
      ...row,
      receiving_hours: row.hours,
      unloading_type: row.handling_type,
      average_unloading_time_hours: row.average_time_hours
    })),
    lanes,
    logistics_models: { notes: mergedText("logistics_model", cleanText(els.scope?.value)) },
    operational_criteria: { notes: mergedText("operation_criteria") },
    business_rules: { notes: mergedText("business_rules") },
    service_requirements: { notes: mergedText("service_specifications") },
    carrier_requirements: { notes: mergedText("carrier_requirements") },
    crossborder_details: { notes: cleanText(els.crossborder?.value) },
    notes_exceptions: { notes: mergedText("other_notes") },
    attachments: [
      ...segments.map((segment) => cleanText(segment.attachment_links))
    ]
      .map((line) => cleanText(line))
      .filter(Boolean)
      .map((line) => ({ reference: line }))
  };
}

function fillStaticFields(response) {
  const account = response.account_overview || state.submission?.account_overview || {};
  if (els.company) els.company.value = cleanText(account.company || account.customer || state.project?.customer_name);
  if (els.contact) els.contact.value = cleanText(account.contact || state.project?.customer_contact_name);
  if (els.scope) els.scope.value = cleanText(account.scope || account.summary);
  if (els.crossborder) els.crossborder.value = cleanText((response.crossborder_details || state.submission?.crossborder_details || {}).notes);
  const segmentValues = new Set(
    (response.operating_segments || state.submission?.operating_segments || state.project?.operating_segments || [])
      .map((row) => canonicalSegmentKey(row.value || row.segment || row))
  );
  document.querySelectorAll('input[name="rfi-segment"]').forEach((input) => {
    input.checked = segmentValues.has(canonicalSegmentKey(input.value));
  });
}

function normalizeInitialRows(data) {
  const response = responseObject();
  state.origins = Array.isArray(response.origins) && response.origins.length
    ? response.origins.map(rowOrigin)
    : (data.origins || []).map(rowOrigin);
  state.destinations = Array.isArray(response.destinations) && response.destinations.length
    ? response.destinations.map(rowDestination)
    : (data.destinations || []).map(rowDestination);
  state.lanes = Array.isArray(response.lanes) && response.lanes.length
    ? response.lanes.map(rowLane)
    : (data.lanes || []).map(rowLane);
  if (!state.lanes.length) state.lanes = [makeLane(0)];
  state.segmentChecklists = deriveSegmentChecklists(state.lanes);
}

async function load() {
  if (!token) {
    render();
    setStatus("Customer RFI token is missing.", "error");
    return;
  }
  state.loading = true;
  setStatus("Loading Customer RFI...");
  try {
    const data = await fetchCustomerRfi(token);
    state.project = data.project;
    state.link = data.link;
    state.submission = data.submission;
    state.submitted = data.submission?.status === "submitted";
    fillStaticFields(responseObject());
    normalizeInitialRows(data);
    render();
    setStatus(state.submitted ? "This Customer RFI has been submitted. Procurement must reopen it before edits." : "Ready.");
  } catch (error) {
    setStatus(error, "error");
  } finally {
    state.loading = false;
  }
}

async function saveDraft() {
  setStatus("Saving draft...");
  try {
    const result = await saveCustomerRfi(token, collectRfi());
    setStatus(`Draft saved. ${result.lanes} lane(s), ${result.completeness_score}% complete.`);
    await load();
  } catch (error) {
    setStatus(error, "error");
  }
}

function validateFinalRfi(rfi) {
  const lanes = rfi.lanes.filter(laneHasMeaningfulData);
  const laneErrors = lanes.map((lane, index) => {
    const missing = [];
    if (!cleanText(routeLabelFallback(lane, "origin"))) missing.push(state.locale === "es" ? "salida" : "origin");
    if (!cleanText(routeLabelFallback(lane, "destination"))) missing.push(state.locale === "es" ? "llegada" : "destination");
    if (!cleanText(lane.truck_type)) missing.push(state.locale === "es" ? "tipo de camion" : "truck type");
    if (!cleanText(lane.weekly_volume)) missing.push(state.locale === "es" ? "volumen semanal" : "weekly volume");
    return missing.length ? { lane: cleanText(lane.lane_id) || `#${index + 1}`, missing } : null;
  }).filter(Boolean);
  const warnings = [];
  if (!cleanText(rfi.account_overview.company)) warnings.push(state.locale === "es" ? "empresa o unidad de negocio" : "company or business unit");
  if (!cleanText(rfi.account_overview.scope)) warnings.push(state.locale === "es" ? "resumen de alcance" : "scope summary");
  if (!rfi.operating_segments.length) warnings.push(state.locale === "es" ? "segmento operativo" : "operating segment");
  return { lanes, laneErrors, warnings };
}

async function submitFinal() {
  const rfi = collectRfi();
  const validation = validateFinalRfi(rfi);
  if (!validation.lanes.length) {
    setStatus(state.locale === "es" ? "Agrega al menos una ruta antes de enviar el RFI final." : "Add at least one route before submitting the final RFI.", "error");
    return;
  }
  if (validation.laneErrors.length) {
    const details = validation.laneErrors
      .map((row) => `${row.lane}: ${row.missing.join(", ")}`)
      .join(" | ");
    const spanishBase = "Completa salida, llegada, tipo de camion y volumen semanal para cada ruta antes de enviar.";
    setStatus(`${state.locale === "es" ? spanishBase : "Complete the essential fields for each route"} ${details}`, "error");
    return;
  }
  rfi.lanes = validation.lanes;
  const warning = validation.warnings.length
    ? `\n\n${state.locale === "es" ? "Se enviara aun con estas advertencias" : "It will still submit with these warnings"}: ${validation.warnings.join(", ")}.`
    : "";
  const confirmation = state.locale === "es"
    ? `Enviar este RFI como final? Procurement tendra que reabrirlo antes de permitir nuevas ediciones.${warning}`
    : `Submit this RFI as final? Procurement must reopen it before any edits.${warning}`;
  if (!window.confirm(confirmation)) return;
  setStatus("Submitting final RFI...");
  try {
    const result = await submitCustomerRfi(token, rfi);
    setStatus(`Customer RFI submitted with ${result.lanes} lane(s).`);
    await load();
  } catch (error) {
    setStatus(error, "error");
  }
}

function applyRubricSuggestion(index, key) {
  const current = collectSegmentChecklists();
  const segmentKey = canonicalSegmentKey(key);
  const suggestion = suggestionForSegment(segmentKey);
  const segment = current[index] || makeSegmentChecklist(index, segmentKey);
  const rubricItems = seedRubricObservations(defaultRubricItems(segmentKey, segment.rubric_items, segment.removed_rubric_keys), suggestion);
  const next = normalizeSegmentChecklist({
    ...segment,
    segment_key: segmentKey,
    segment_name: suggestion.segment_name,
    operation_type: suggestion.operation_type,
    rubric_items: rubricItems
  });
  current[index] = next;
  state.segmentChecklists = current;
  render();
}

function applyLocale() {
  document.documentElement.lang = state.locale;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = ui(element.dataset.i18n);
    if (value) element.textContent = value;
  });
  document.querySelectorAll("[data-rfi-locale]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.rfiLocale === state.locale);
    button.setAttribute("aria-pressed", button.dataset.rfiLocale === state.locale ? "true" : "false");
  });
  if (state.activeHelpKey && els.helpDialog?.open) renderRfiHelp();
}

function renderRfiHelp() {
  const content = RFI_HELP[state.activeHelpKey]?.[state.locale] || RFI_HELP[state.activeHelpKey]?.en;
  if (!content || !els.helpTitle || !els.helpContent) return;
  els.helpTitle.textContent = content[0];
  els.helpContent.innerHTML = `
    <div class="rfi-help-body">
      <p>${escapeHtml(content[1])}</p>
      <p class="rfi-help-note">${escapeHtml(ui("workbookHelp"))}</p>
      <div class="rfi-help-audio-actions">
        <button type="button" class="secondary small-button" data-rfi-read-help>${ui("listen")}</button>
        <button type="button" class="secondary small-button" data-rfi-stop-help>${ui("stopReading")}</button>
      </div>
    </div>
  `;
}

function speakRfiHelp() {
  const content = RFI_HELP[state.activeHelpKey]?.[state.locale] || RFI_HELP[state.activeHelpKey]?.en;
  if (!content || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    setStatus(ui("audioUnavailable"), "error");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(`${content[0]}. ${content[1]}`);
  utterance.lang = state.locale === "es" ? "es-MX" : "en-US";
  utterance.rate = 0.94;
  window.speechSynthesis.speak(utterance);
}

function stopRfiHelp() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function showRfiHelp(key) {
  state.activeHelpKey = key;
  renderRfiHelp();
  if (typeof els.helpDialog?.showModal === "function" && !els.helpDialog.open) els.helpDialog.showModal();
}

function appendVaultFiles(index, files) {
  const checklist = collectSegmentChecklists();
  const segment = checklist[index];
  if (!segment || !files?.length) return;
  const names = Array.from(files).map((file) => cleanText(file.name)).filter(Boolean);
  const existing = cleanText(segment.attachment_links).split(/\n+/).filter(Boolean);
  segment.attachment_links = [...new Set([...existing, ...names])].join("\n");
  state.segmentChecklists = checklist;
  render();
  setStatus(`${names.length} file reference(s) added. Add a shared link before final submission.`);
}

function initEvents() {
  els.importSegmentTemplate?.addEventListener("click", () => els.importSegmentTemplateFile?.click());
  els.downloadSegmentTemplate?.addEventListener("click", async () => {
    try {
      if (!hasLoadedActiveRfiSegment()) throw new Error("Open a signed RFI link and select an operating segment before downloading its template.");
      syncSegmentTemplateName();
      collectRfi();
      setStatus(state.locale === "es" ? "Generando template del segmento..." : "Generating segment template...");
      await downloadRfiSegmentTemplate();
      setStatus(state.locale === "es" ? "Template del segmento descargado con instructivo, catalogo y checklist." : "Segment template downloaded with instructions, catalog, and checklist.");
    } catch (error) {
      setStatus(error, "error");
    }
  });
  els.importSegmentTemplateFile?.addEventListener("change", async (event) => {
    const [file] = Array.from(event.target.files || []);
    if (!file) return;
    setStatus(state.locale === "es" ? "Importando template del segmento..." : "Importing segment template...");
    try {
      await importRfiSegmentWorkbook(file);
    } catch (error) {
      setStatus(error, "error");
    } finally {
      event.target.value = "";
    }
  });
  els.addLane?.addEventListener("click", () => {
    collectRfi();
    state.lanes.push({ ...makeLane(state.lanes.length), operating_segment: state.activeSegmentKey });
    render();
  });
  document.addEventListener("click", (event) => {
    const localeButton = event.target.closest("[data-rfi-locale]");
    if (localeButton) {
      collectRfi();
      state.locale = localeButton.dataset.rfiLocale === "es" ? "es" : "en";
      window.localStorage.setItem("rateware_customer_rfi_locale", state.locale);
      render();
      return;
    }
    const helpButton = event.target.closest("[data-rfi-help]");
    if (helpButton) {
      showRfiHelp(helpButton.dataset.rfiHelp);
      return;
    }
    const wizardButton = event.target.closest("[data-rfi-wizard-segment]");
    if (wizardButton) {
      collectRfi();
      ensureSegmentWorkspace(wizardButton.dataset.rfiWizardSegment);
      render();
      return;
    }
    const segmentTab = event.target.closest("[data-rfi-segment-tab]");
    if (segmentTab) {
      collectRfi();
      state.activeSegmentKey = segmentTab.dataset.rfiSegmentTab || "crossborder";
      render();
      return;
    }
    const workspaceButton = event.target.closest("[data-rfi-workspace-view]");
    if (workspaceButton) {
      collectRfi();
      state.activeWorkspaceView = workspaceButton.dataset.rfiWorkspaceView || "lanes";
      render();
      return;
    }
    const groupRequiredButton = event.target.closest("[data-rfi-group-required]");
    if (groupRequiredButton) {
      const segmentIndex = Number(groupRequiredButton.dataset.segmentIndex);
      const category = cleanText(groupRequiredButton.dataset.category);
      const checked = groupRequiredButton.dataset.rfiGroupRequired === "all";
      const group = els.segmentChecklists?.querySelector(`.rfi-segment-checklist[data-segment-index="${segmentIndex}"] [data-rubric-group="${category}"]`);
      group?.querySelectorAll('.rfi-checklist-row [data-field="required"]').forEach((input) => {
        input.checked = checked;
      });
      state.segmentChecklists = collectSegmentChecklists();
      render();
      return;
    }
    const addRubricButton = event.target.closest("[data-add-rubric-to-segment]");
    if (addRubricButton) {
      const segmentIndex = Number(addRubricButton.dataset.segmentIndex);
      const category = canonicalRubricCategory(addRubricButton.dataset.category);
      const current = collectSegmentChecklists();
      const segment = current[segmentIndex];
      if (!segment) return;
      const rubricItems = objectValue(segment.rubric_items);
      const label = ui("customRubric");
      const key = newRubricKey(category, label, Object.keys(rubricItems).length);
      rubricItems[key] = {
        category,
        label,
        question: "",
        expected: "",
        required: true,
        observation: ""
      };
      segment.rubric_items = rubricItems;
      segment.removed_rubric_keys = (segment.removed_rubric_keys || []).filter((itemKey) => itemKey !== key);
      current[segmentIndex] = normalizeSegmentChecklist(segment);
      state.segmentChecklists = current;
      render();
      setStatus(state.locale === "es" ? "Rubro agregado. Edita la linea y guarda el borrador." : "Rubric added. Edit the line and save the draft.");
      return;
    }
    const removeRubricButton = event.target.closest("[data-remove-rubric]");
    if (removeRubricButton) {
      const segmentIndex = Number(removeRubricButton.dataset.segmentIndex);
      const itemKey = cleanText(removeRubricButton.dataset.itemKey);
      const current = collectSegmentChecklists();
      const segment = current[segmentIndex];
      if (!segment || !itemKey) return;
      segment.removed_rubric_keys = Array.from(new Set([...(segment.removed_rubric_keys || []), itemKey]));
      const rubricItems = objectValue(segment.rubric_items);
      delete rubricItems[itemKey];
      segment.rubric_items = rubricItems;
      current[segmentIndex] = normalizeSegmentChecklist(segment);
      state.segmentChecklists = current;
      render();
      setStatus(state.locale === "es" ? "Rubro eliminado de este segmento. Guarda el borrador para conservar el cambio." : "Rubric removed from this segment. Save the draft to keep the change.");
      return;
    }
    const readHelpButton = event.target.closest("[data-rfi-read-help]");
    if (readHelpButton) {
      speakRfiHelp();
      return;
    }
    const stopHelpButton = event.target.closest("[data-rfi-stop-help]");
    if (stopHelpButton) {
      stopRfiHelp();
      return;
    }
    const browseButton = event.target.closest("[data-rfi-browse]");
    if (browseButton) {
      document.querySelector(`[data-rfi-file-input="${browseButton.dataset.rfiBrowse}"]`)?.click();
      return;
    }
    const laneButton = event.target.closest("[data-remove-lane]");
    if (laneButton) {
      const index = Number(laneButton.dataset.removeLane);
      state.lanes = collectLaneRows().filter((_, rowIndex) => rowIndex !== index);
      if (!state.lanes.length) state.lanes = [makeLane(0)];
      render();
      return;
    }
    const segmentButton = event.target.closest("[data-remove-segment-checklist]");
    if (segmentButton) {
      const index = Number(segmentButton.dataset.removeSegmentChecklist);
      const currentSegments = collectSegmentChecklists();
      const removedSegment = currentSegments[index];
      if (!removedSegment) return;
      const currentLanes = collectLaneRows();
      const laneCount = currentLanes.filter((lane) => segmentFromLane(lane) === removedSegment.segment_key).length;
      if (laneCount) {
        const prompt = state.locale === "es"
          ? `Este segmento contiene ${laneCount} ruta(s). ¿Eliminar el segmento y sus rutas?`
          : `This segment contains ${laneCount} route(s). Remove the segment and its routes?`;
        if (!window.confirm(prompt)) return;
      }
      state.lanes = currentLanes.filter((lane) => segmentFromLane(lane) !== removedSegment.segment_key);
      state.segmentChecklists = currentSegments.filter((_, rowIndex) => rowIndex !== index);
      setSegmentCheckbox(removedSegment.segment_key, false);
      if (!state.segmentChecklists.length) state.segmentChecklists = [makeSegmentChecklist(0, "crossborder")];
      state.activeSegmentKey = state.segmentChecklists[0].segment_key;
      render();
      return;
    }
    const suggestButton = event.target.closest("[data-suggest-rubrics]");
    if (suggestButton) {
      applyRubricSuggestion(Number(suggestButton.dataset.index), suggestButton.dataset.suggestRubrics);
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target?.matches?.("[data-rfi-file-input]")) {
      appendVaultFiles(Number(event.target.dataset.rfiFileInput), event.target.files);
      return;
    }
    if (event.target?.matches?.('input[name="rfi-segment"]')) {
      const segmentKey = canonicalSegmentKey(event.target.value);
      const currentLanes = collectLaneRows();
      if (!event.target.checked) {
        const laneCount = currentLanes.filter((lane) => segmentFromLane(lane) === segmentKey).length;
        if (laneCount) {
          const prompt = state.locale === "es"
            ? `Este segmento contiene ${laneCount} ruta(s). ¿Quitar el segmento y sus rutas?`
            : `This segment contains ${laneCount} route(s). Remove the segment and its routes?`;
          if (!window.confirm(prompt)) {
            event.target.checked = true;
            return;
          }
        }
        state.lanes = currentLanes.filter((lane) => segmentFromLane(lane) !== segmentKey);
      } else {
        state.lanes = currentLanes;
      }
      state.segmentChecklists = collectSegmentChecklists();
      syncSegmentWorkspaceFromScope();
      render();
      return;
    }
    if (event.target?.matches?.('.rfi-segment-checklist [data-field="segment_key"]')) {
      state.segmentChecklists = collectSegmentChecklists();
      render();
    }
  });
  document.addEventListener("input", () => {
    if (els.completeness) els.completeness.textContent = `${clientCompleteness()}%`;
  });
  els.segmentTemplateName?.addEventListener("input", () => {
    const segment = state.segmentChecklists.find((item) => item.segment_key === state.activeSegmentKey);
    if (segment) {
      segment.segment_name = cleanText(els.segmentTemplateName.value) || segment.segment_name;
      if (els.activeSegmentTitle) els.activeSegmentTitle.textContent = segmentDisplayName(segment);
    }
  });
  document.addEventListener("dragover", (event) => {
    if (event.target.closest?.("[data-rfi-drop-zone]")) event.preventDefault();
  });
  document.addEventListener("drop", (event) => {
    const zone = event.target.closest?.("[data-rfi-drop-zone]");
    if (!zone) return;
    event.preventDefault();
    appendVaultFiles(Number(zone.dataset.rfiDropZone), event.dataTransfer?.files);
  });
  els.closeHelp?.addEventListener("click", () => {
    stopRfiHelp();
    state.activeHelpKey = "";
    els.helpDialog?.close();
  });
  els.save?.addEventListener("click", saveDraft);
  els.submit?.addEventListener("click", submitFinal);
}

initEvents();
load();
