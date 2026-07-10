import { humanizeError } from "./error-copy.js";
import { fetchCustomerRfi, saveCustomerRfi, submitCustomerRfi } from "./customer-rfi-service.js";

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
  logisticsModels: document.getElementById("rfi-logistics-models"),
  businessRules: document.getElementById("rfi-business-rules"),
  operationalCriteria: document.getElementById("rfi-operational-criteria"),
  serviceRequirements: document.getElementById("rfi-service-requirements"),
  carrierRequirements: document.getElementById("rfi-carrier-requirements"),
  notes: document.getElementById("rfi-notes"),
  attachments: document.getElementById("rfi-attachments"),
  addLane: document.getElementById("add-lane-row"),
  addSegmentChecklist: document.getElementById("add-segment-checklist"),
  save: document.getElementById("save-customer-rfi"),
  submit: document.getElementById("submit-customer-rfi")
};

const SEGMENT_OPTIONS = [
  { value: "crossborder", label: "Crossborder" },
  { value: "mx_domestic", label: "Mexico domestic" },
  { value: "us_domestic", label: "US domestic" },
  { value: "expedited", label: "Expedited" },
  { value: "time_critical", label: "Time critical" },
  { value: "dedicated", label: "Dedicated" }
];

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
  { key: "packaging", label: "Embalaje", placeholder: "Dropdown", width: 105 },
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
  { key: "sourcing_priority", label: "Prioridad abastecimiento", placeholder: "Dropdown", width: 126 },
  { key: "last_annual_volume", label: "Ultimo volumen anual", type: "number", width: 112 },
  { key: "weekly_volume", label: "Volumen semanal esperado", type: "number", width: 118, required: true },
  { key: "seasonality", label: "Estacionalidad", placeholder: "Dropdown", width: 112 },
  { key: "scheduling_type", label: "Tipo programacion", placeholder: "Dropdown", width: 120 },
  { key: "positioning_lead_time", label: "Lead time posicionar", placeholder: "Dropdown", width: 120 },
  { key: "driver_assistance", label: "Asistencia conductor", type: "checkbox", width: 74 },
  { key: "double_driver", label: "Doble chofer", type: "checkbox", width: 70 },
  { key: "transit_days", label: "Transito estimado", type: "number", width: 88 },
  { key: "average_distance", label: "Distancia promedio", type: "number", placeholder: "mi/km", width: 100 },
  { key: "target_rate", label: "Tarifa objetivo compra", type: "number", width: 112 },
  { key: "currency", label: "Moneda", type: "select", options: CURRENCY_OPTIONS, width: 82 },
  { key: "service_specifications", label: "Especificaciones unidad", type: "textarea", placeholder: "Condiciones y caracteristicas de la unidad", width: 230 },
  { key: "notes", label: "Notas operacion", type: "textarea", placeholder: "Informacion relevante", width: 230 }
];

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
  return value === true || value === "true" || value === "on" || value === "yes" || value === "1";
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

function logisticsRowsForSegment(segmentKey) {
  const key = cleanText(segmentKey) || "crossborder";
  if (key === "expedited") return LOGISTICS_MODEL_ITEMS.expedited;
  if (key === "time_critical") return LOGISTICS_MODEL_ITEMS.time_critical;
  if (key === "crossborder") return LOGISTICS_MODEL_ITEMS.crossborder;
  if (key === "mx_domestic" || key === "us_domestic") {
    return [
      ...LOGISTICS_MODEL_ITEMS.local,
      ...LOGISTICS_MODEL_ITEMS.regional,
      ...LOGISTICS_MODEL_ITEMS.national
    ];
  }
  if (key === "dedicated") return LOGISTICS_MODEL_ITEMS.national;
  return LOGISTICS_MODEL_ITEMS.crossborder;
}

function checklistGroupsForSegment(segmentKey) {
  return CHECKLIST_GROUPS.map((group) => {
    if (group.key !== "logistics_model") return group;
    return { ...group, rows: logisticsRowsForSegment(segmentKey) };
  });
}

function flattenChecklistItems(segmentKey) {
  return checklistGroupsForSegment(segmentKey).flatMap((group) =>
    group.rows.map((item) => ({
      ...item,
      category: item.category || group.key
    }))
  );
}

function defaultRubricItems(segmentKey, source = {}) {
  const existing = objectValue(source);
  const items = {};
  for (const item of flattenChecklistItems(segmentKey)) {
    const prior = objectValue(existing[item.key]);
    items[item.key] = {
      category: item.category,
      label: item.label,
      question: item.question,
      expected: item.expected,
      required: prior.required === undefined ? true : checkedBoolean(prior.required),
      observation: cleanText(prior.observation || prior.answer || prior.notes)
    };
  }
  return items;
}

function mergeRubricItemsForSegment(segmentKey, source = {}, defaults = {}) {
  const sourceItems = defaultRubricItems(segmentKey, source);
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
  const segmentKey = cleanText(segment.segment_key) || "crossborder";
  const rubricItems = defaultRubricItems(segmentKey, segment.rubric_items);
  const normalized = {
    ...segment,
    segment_key: segmentKey,
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
  const suggestion = RFI_SEGMENT_SUGGESTIONS[segment] || RFI_SEGMENT_SUGGESTIONS.crossborder;
  return normalizeSegmentChecklist({
    segment_key: segment,
    segment_name: suggestion.segment_name || `Segment ${index + 1}`,
    operation_type: suggestion.operation_type || "d2d_export",
    rubric_items: defaultRubricItems(segment),
    attachment_links: ""
  });
}

function rowSegmentChecklist(row, index) {
  const segment = cleanText(row.segment_key || row.operating_segment || row.segment || "crossborder");
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
  return Array.from(document.querySelectorAll('input[name="rfi-segment"]:checked')).map((input) => input.value);
}

function segmentFromLane(lane) {
  const segment = cleanText(lane.operating_segment);
  if (segment) return segment;
  const operation = cleanText(lane.operation_type);
  if (operation === "intra_mex" || operation === "mx_domestic") return "mx_domestic";
  if (operation === "us_domestic") return "us_domestic";
  if (operation === "d2d_export" || operation === "d2d_import" || operation === "crossborder") return "crossborder";
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
    <tr>
      ${RFI_LANE_COLUMNS.map((column) => `<th style="min-width:${column.width || 110}px">${escapeHtml(column.label)}${column.required ? " *" : ""}</th>`).join("")}
      <th class="rfi-action-column"></th>
    </tr>
  `;
}

function renderLaneCell(column, row) {
  const value = row[column.key];
  const width = column.width || 110;
  if (column.type === "checkbox") {
    return `<td class="rfi-check-cell" style="min-width:${width}px"><input type="checkbox" data-field="${column.key}" ${checkedBoolean(value) ? "checked" : ""} /></td>`;
  }
  if (column.type === "select") {
    return `<td style="min-width:${width}px"><select data-field="${column.key}">${selectOptions(column.options || [], value)}</select></td>`;
  }
  if (column.type === "textarea") {
    return `<td style="min-width:${width}px"><textarea data-field="${column.key}" rows="1" placeholder="${escapeHtml(column.placeholder || "")}">${escapeHtml(value)}</textarea></td>`;
  }
  const type = column.type === "number" ? "number" : "text";
  const step = type === "number" ? ' step="0.01"' : "";
  return `<td style="min-width:${width}px"><input type="${type}"${step} data-field="${column.key}" value="${escapeHtml(value)}" placeholder="${escapeHtml(column.placeholder || "")}" /></td>`;
}

function renderLaneRows() {
  if (!els.lanes) return;
  renderLaneHead();
  els.lanes.innerHTML = state.lanes.map((row, index) => `
    <tr data-index="${index}" class="rfi-route-row">
      ${RFI_LANE_COLUMNS.map((column) => renderLaneCell(column, row)).join("")}
      <td class="rfi-action-column"><button type="button" class="secondary small-button" data-remove-lane="${index}">Remove</button></td>
    </tr>
  `).join("");
}

function renderSegmentChecklists() {
  if (!els.segmentChecklists) return;
  els.segmentChecklists.innerHTML = state.segmentChecklists.map((segment, index) => `
    <article class="rfi-segment-checklist" data-segment-index="${index}">
      <div class="customer-rfi-row-head">
        <div>
          <p class="eyebrow">Segment ${index + 1}</p>
          <strong>${escapeHtml(segment.segment_name || optionLabel(SEGMENT_OPTIONS, segment.segment_key))}</strong>
        </div>
        <button type="button" class="secondary small-button" data-remove-segment-checklist="${index}">Remove</button>
      </div>
      <div class="rfi-segment-meta">
        <label>Segment
          <select data-field="segment_key">${selectOptions(SEGMENT_OPTIONS, segment.segment_key)}</select>
        </label>
        <label>Name<input data-field="segment_name" value="${escapeHtml(segment.segment_name)}" placeholder="Crossborder direct / Dedicated / Intra-Mex" /></label>
        <label>Operation model
          <select data-field="operation_type">${selectOptions(OPERATION_OPTIONS, segment.operation_type)}</select>
        </label>
      </div>
      <div class="rfi-suggestion-row">
        <span>Suggestions</span>
        ${SEGMENT_OPTIONS.map((option) => `<button type="button" class="secondary small-button" data-suggest-rubrics="${option.value}" data-index="${index}">${escapeHtml(option.label)}</button>`).join("")}
      </div>
      <div class="rfi-checklist-table-wrap">
        <table class="rfi-checklist-table">
          <thead>
            <tr>
              <th>Validar</th>
              <th>Rubro</th>
              <th>Que preguntar</th>
              <th>Respuesta esperada</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            ${checklistGroupsForSegment(segment.segment_key).map((group) => `
              <tr class="rfi-checklist-group-row">
                <th colspan="5">
                  <span>${escapeHtml(group.title)}</span>
                  <small>${escapeHtml(group.help)}</small>
                </th>
              </tr>
              ${group.rows.map((item) => {
                const saved = objectValue(segment.rubric_items)[item.key] || {};
                return `
                  <tr class="rfi-checklist-row" data-item-key="${escapeHtml(item.key)}" data-category="${escapeHtml(group.key)}">
                    <td class="rfi-check-cell"><input type="checkbox" data-field="required" ${saved.required === false ? "" : "checked"} /></td>
                    <td><strong>${escapeHtml(item.label)}</strong></td>
                    <td><small>${escapeHtml(item.question)}</small></td>
                    <td><small>${escapeHtml(item.expected)}</small></td>
                    <td><textarea data-field="observation" rows="1" placeholder="Respuesta, criterio, excepcion o nota...">${escapeHtml(saved.observation)}</textarea></td>
                  </tr>
                `;
              }).join("")}
            `).join("")}
          </tbody>
        </table>
      </div>
      <label>Attachment links<textarea data-field="attachment_links" rows="1" placeholder="Drive links or file references">${escapeHtml(segment.attachment_links)}</textarea></label>
    </article>
  `).join("");
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
  document.querySelectorAll(".customer-rfi-shell input, .customer-rfi-shell select, .customer-rfi-shell textarea").forEach((element) => {
    element.disabled = readonly;
  });
  document.querySelectorAll("#add-lane-row, #add-segment-checklist, [data-remove-lane], [data-remove-segment-checklist], [data-suggest-rubrics]").forEach((element) => {
    element.disabled = readonly;
  });
  if (els.save) els.save.disabled = readonly;
  if (els.submit) {
    els.submit.disabled = readonly;
    els.submit.textContent = readonly ? "Submitted" : "Submit final RFI";
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
  renderSummary();
  renderLaneRows();
  renderSegmentChecklists();
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
    .filter((row) => LANE_FIELDS.some((field) => row[field] === true || cleanText(row[field])));
}

function collectSegmentChecklists() {
  return Array.from(els.segmentChecklists?.querySelectorAll(".rfi-segment-checklist") || [])
    .map((row, index) => {
      const get = (field) => cleanText(row.querySelector(`[data-field="${field}"]`)?.value);
      const segmentKey = get("segment_key") || "crossborder";
      const rubricDefinitions = Object.fromEntries(flattenChecklistItems(segmentKey).map((item) => [item.key, item]));
      const rubricItems = {};
      for (const itemRow of row.querySelectorAll(".rfi-checklist-row[data-item-key]")) {
        const itemKey = cleanText(itemRow.dataset.itemKey);
        const definition = rubricDefinitions[itemKey] || {};
        rubricItems[itemKey] = {
          category: cleanText(itemRow.dataset.category || definition.category),
          label: cleanText(definition.label || itemRow.querySelector("strong")?.textContent),
          question: cleanText(definition.question || itemRow.children[2]?.textContent),
          expected: cleanText(definition.expected || itemRow.children[3]?.textContent),
          required: itemRow.querySelector('[data-field="required"]')?.checked === true,
          observation: cleanText(itemRow.querySelector('[data-field="observation"]')?.value)
        };
      }
      return normalizeSegmentChecklist({
        segment_key: segmentKey,
        segment_name: get("segment_name") || optionLabel(SEGMENT_OPTIONS, segmentKey) || `Segment ${index + 1}`,
        operation_type: get("operation_type"),
        rubric_items: rubricItems,
        attachment_links: get("attachment_links")
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
    logistics_models: { notes: cleanText(els.logisticsModels?.value) || mergedText("logistics_model", cleanText(els.scope?.value)) },
    operational_criteria: { notes: cleanText(els.operationalCriteria?.value) || mergedText("operation_criteria") },
    business_rules: { notes: cleanText(els.businessRules?.value) || mergedText("business_rules") },
    service_requirements: { notes: cleanText(els.serviceRequirements?.value) || mergedText("service_specifications") },
    carrier_requirements: { notes: cleanText(els.carrierRequirements?.value) || mergedText("carrier_requirements") },
    crossborder_details: { notes: cleanText(els.crossborder?.value) },
    notes_exceptions: { notes: cleanText(els.notes?.value) || mergedText("other_notes") },
    attachments: [
      ...cleanText(els.attachments?.value).split(/\n+/),
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
  if (els.logisticsModels) els.logisticsModels.value = cleanText((response.logistics_models || state.submission?.logistics_models || {}).notes);
  if (els.crossborder) els.crossborder.value = cleanText((response.crossborder_details || state.submission?.crossborder_details || {}).notes);
  if (els.businessRules) els.businessRules.value = cleanText((response.business_rules || state.submission?.business_rules || {}).notes);
  if (els.operationalCriteria) els.operationalCriteria.value = cleanText((response.operational_criteria || state.submission?.operational_criteria || {}).notes);
  if (els.serviceRequirements) els.serviceRequirements.value = cleanText((response.service_requirements || state.submission?.service_requirements || {}).notes);
  if (els.carrierRequirements) els.carrierRequirements.value = cleanText((response.carrier_requirements || state.submission?.carrier_requirements || {}).notes);
  if (els.notes) els.notes.value = cleanText((response.notes_exceptions || state.submission?.notes_exceptions || {}).notes);
  if (els.attachments) {
    const attachments = response.attachments || state.submission?.attachments || [];
    els.attachments.value = Array.isArray(attachments) ? attachments.map((row) => cleanText(row.reference || row.name || row.url || row)).filter(Boolean).join("\n") : "";
  }

  const segmentValues = new Set(
    (response.operating_segments || state.submission?.operating_segments || state.project?.operating_segments || [])
      .map((row) => cleanText(row.value || row.segment || row))
  );
  document.querySelectorAll('input[name="rfi-segment"]').forEach((input) => {
    input.checked = segmentValues.has(input.value);
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

async function submitFinal() {
  const rfi = collectRfi();
  const missing = rfi.lanes.filter((lane) => !cleanText(routeLabelFallback(lane, "origin")) || !cleanText(routeLabelFallback(lane, "destination")) || !cleanText(lane.equipment_type) || !cleanText(lane.weekly_volume));
  if (missing.length) {
    setStatus("Complete salida, llegada, tipo de camion y volumen semanal for every lane before submitting.", "error");
    return;
  }
  if (!window.confirm("Submit this RFI as final? Procurement must reopen it before any edits.")) return;
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
  const suggestion = RFI_SEGMENT_SUGGESTIONS[key] || RFI_SEGMENT_SUGGESTIONS.crossborder;
  const segment = current[index] || makeSegmentChecklist(index, key);
  const rubricItems = seedRubricObservations(defaultRubricItems(key, segment.rubric_items), suggestion);
  const next = normalizeSegmentChecklist({
    ...segment,
    segment_key: key,
    segment_name: suggestion.segment_name,
    operation_type: suggestion.operation_type,
    rubric_items: rubricItems
  });
  current[index] = next;
  state.segmentChecklists = current;
  render();
}

function initEvents() {
  els.addLane?.addEventListener("click", () => {
    collectRfi();
    state.lanes.push(makeLane(state.lanes.length));
    render();
  });
  els.addSegmentChecklist?.addEventListener("click", () => {
    collectRfi();
    const nextSegment = checkedSegments().find((segment) => !state.segmentChecklists.some((row) => row.segment_key === segment)) || "crossborder";
    state.segmentChecklists.push(makeSegmentChecklist(state.segmentChecklists.length, nextSegment));
    render();
  });
  document.addEventListener("click", (event) => {
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
      state.segmentChecklists = collectSegmentChecklists().filter((_, rowIndex) => rowIndex !== index);
      if (!state.segmentChecklists.length) state.segmentChecklists = [makeSegmentChecklist(0, "crossborder")];
      render();
      return;
    }
    const suggestButton = event.target.closest("[data-suggest-rubrics]");
    if (suggestButton) {
      applyRubricSuggestion(Number(suggestButton.dataset.index), suggestButton.dataset.suggestRubrics);
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target?.matches?.('input[name="rfi-segment"]')) {
      const current = collectSegmentChecklists();
      for (const value of checkedSegments()) {
        if (!current.some((segment) => segment.segment_key === value)) current.push(makeSegmentChecklist(current.length, value));
      }
      state.segmentChecklists = current;
      render();
    }
    if (event.target?.matches?.('.rfi-segment-checklist select[data-field="segment_key"]')) {
      state.segmentChecklists = collectSegmentChecklists();
      render();
    }
  });
  document.addEventListener("input", () => {
    if (els.completeness) els.completeness.textContent = `${clientCompleteness()}%`;
  });
  els.save?.addEventListener("click", saveDraft);
  els.submit?.addEventListener("click", submitFinal);
}

initEvents();
load();
