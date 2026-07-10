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

const CHECKLIST_FIELDS = [
  "logistics_model",
  "operation_criteria",
  "business_rules",
  "service_specifications",
  "carrier_requirements",
  "other_notes",
  "attachment_links"
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
  "lane_id",
  "operating_segment",
  "origin_name",
  "origin_city",
  "origin_state",
  "origin_country",
  "origin_postal_code",
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
  "destination_postal_code",
  "destination_address",
  "destination_contact_name",
  "destination_contact_phone",
  "destination_contact_email",
  "destination_hours",
  "destination_handling_type",
  "destination_appointment_required",
  "operation_type",
  "service_type",
  "equipment_type",
  "trailer_requirements",
  "config",
  "commodity",
  "hazmat",
  "temperature_controlled",
  "weekly_volume",
  "monthly_volume",
  "annual_volume",
  "frequency",
  "target_rate",
  "current_rate",
  "currency",
  "pickup_lead_time_hours",
  "expected_transit_time_hours",
  "transit_days",
  "cargo_value",
  "cargo_value_currency",
  "weight",
  "pallets",
  "dimensions",
  "seasonality_notes",
  "special_requirements",
  "notes",
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

function routeLabel(row, prefix) {
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
    equipment_type: "",
    trailer_requirements: "",
    config: "",
    commodity: "",
    hazmat: false,
    temperature_controlled: false,
    cargo_value: "",
    cargo_value_currency: "",
    weight: "",
    pallets: "",
    dimensions: "",
    weekly_volume: "",
    monthly_volume: "",
    annual_volume: "",
    frequency: "",
    pickup_lead_time_hours: "",
    expected_transit_time_hours: "",
    transit_days: "",
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
  let lane = {
    ...makeLane(index),
    ...payload,
    ...row,
    lane_id: cleanText(payload.lane_id || row.lane_id || row.id) || `L${index + 1}`,
    origin_key: cleanText(payload.origin_key || row.origin_key || row.origin_id),
    origin_text: cleanText(payload.origin_text || row.origin_text || row.origin),
    destination_key: cleanText(payload.destination_key || row.destination_key || row.destination_id),
    destination_text: cleanText(payload.destination_text || row.destination_text || row.destination),
    operating_segment: cleanText(payload.operating_segment || row.operating_segment || row.segment) || "crossborder",
    operation_type: cleanText(payload.operation_type || row.operation_type || row.operation) || "d2d_export",
    service_type: cleanText(payload.service_type || row.service_type || row.service) || "standard",
    equipment_type: cleanText(payload.equipment_type || row.equipment_type || row.equipment),
    trailer_requirements: cleanText(payload.trailer_requirements || row.trailer_requirements || row.trailer),
    config: cleanText(payload.config || row.config),
    commodity: cleanText(payload.commodity || row.commodity),
    hazmat: checkedBoolean(payload.hazmat ?? row.hazmat),
    temperature_controlled: checkedBoolean(payload.temperature_controlled ?? row.temperature_controlled),
    cargo_value: numberOrBlank(payload.cargo_value ?? row.cargo_value),
    cargo_value_currency: cleanText(payload.cargo_value_currency || row.cargo_value_currency),
    weight: numberOrBlank(payload.weight ?? row.weight),
    pallets: numberOrBlank(payload.pallets ?? row.pallets),
    dimensions: cleanText(payload.dimensions || row.dimensions),
    weekly_volume: numberOrBlank(payload.weekly_volume ?? row.weekly_volume),
    monthly_volume: numberOrBlank(payload.monthly_volume ?? row.monthly_volume),
    annual_volume: numberOrBlank(payload.annual_volume ?? row.annual_volume),
    frequency: cleanText(payload.frequency || row.frequency),
    pickup_lead_time_hours: numberOrBlank(payload.pickup_lead_time_hours ?? row.pickup_lead_time_hours),
    expected_transit_time_hours: numberOrBlank(payload.expected_transit_time_hours ?? row.expected_transit_time_hours),
    transit_days: numberOrBlank(payload.transit_days ?? row.transit_days),
    target_rate: numberOrBlank(payload.target_rate ?? row.target_rate),
    current_rate: numberOrBlank(payload.current_rate ?? row.current_rate),
    currency: cleanText(payload.currency || row.currency) || "USD",
    seasonality_notes: cleanText(payload.seasonality_notes || row.seasonality_notes),
    special_requirements: cleanText(payload.special_requirements || row.special_requirements),
    notes: cleanText(payload.notes || row.notes)
  };
  for (const prefix of ["origin", "destination"]) {
    lane = applyLocationFallback(lane, row, prefix);
    lane[`${prefix}_text`] = routeLabelFallback(lane, prefix);
  }
  for (const field of CHECKLIST_FIELDS) lane[field] = cleanText(payload[field] || row[field] || lane[field]);
  return lane;
}

function makeSegmentChecklist(index = 0, segment = "crossborder") {
  const suggestion = RFI_SEGMENT_SUGGESTIONS[segment] || RFI_SEGMENT_SUGGESTIONS.crossborder;
  return {
    segment_key: segment,
    segment_name: suggestion.segment_name || `Segment ${index + 1}`,
    operation_type: suggestion.operation_type || "d2d_export",
    logistics_model: "",
    operation_criteria: "",
    business_rules: "",
    service_specifications: "",
    carrier_requirements: "",
    other_notes: "",
    attachment_links: ""
  };
}

function rowSegmentChecklist(row, index) {
  const segment = cleanText(row.segment_key || row.operating_segment || row.segment || "crossborder");
  const base = makeSegmentChecklist(index, segment);
  return {
    ...base,
    segment_key: segment,
    segment_name: cleanText(row.segment_name || row.name) || base.segment_name,
    operation_type: cleanText(row.operation_type || row.operation) || base.operation_type,
    logistics_model: cleanText(row.logistics_model || row.logistic_model),
    operation_criteria: cleanText(row.operation_criteria || row.operational_criteria),
    business_rules: cleanText(row.business_rules),
    service_specifications: cleanText(row.service_specifications || row.service_requirements || row.service_specs),
    carrier_requirements: cleanText(row.carrier_requirements || row.required_carrier_profile),
    other_notes: cleanText(row.other_notes || row.notes),
    attachment_links: cleanText(row.attachment_links || row.attachments)
  };
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

function renderLaneRows() {
  if (!els.lanes) return;
  els.lanes.innerHTML = state.lanes.map((row, index) => `
    <tr data-index="${index}" class="rfi-route-row">
      <td><input data-field="lane_id" value="${escapeHtml(row.lane_id)}" /></td>
      <td><select data-field="operating_segment">${selectOptions(SEGMENT_OPTIONS, row.operating_segment)}</select></td>
      <td><input data-field="origin_name" value="${escapeHtml(row.origin_name)}" placeholder="Plant / DC / site" /></td>
      <td><input data-field="origin_city" value="${escapeHtml(row.origin_city)}" /></td>
      <td><input data-field="origin_state" value="${escapeHtml(row.origin_state)}" /></td>
      <td><input data-field="origin_country" value="${escapeHtml(row.origin_country)}" placeholder="MX / US / CA" /></td>
      <td><input data-field="origin_postal_code" value="${escapeHtml(row.origin_postal_code)}" /></td>
      <td><input data-field="origin_address" value="${escapeHtml(row.origin_address)}" placeholder="Street / park / site" /></td>
      <td>
        <input data-field="origin_contact_name" value="${escapeHtml(row.origin_contact_name)}" placeholder="Name" />
        <input data-field="origin_contact_phone" value="${escapeHtml(row.origin_contact_phone)}" placeholder="Phone" />
        <input data-field="origin_contact_email" value="${escapeHtml(row.origin_contact_email)}" placeholder="Email" />
      </td>
      <td><input data-field="origin_hours" value="${escapeHtml(row.origin_hours)}" placeholder="Loading hours" /></td>
      <td><select data-field="origin_handling_type">${selectOptions(HANDLING_OPTIONS, row.origin_handling_type)}</select></td>
      <td class="rfi-check-cell"><input type="checkbox" data-field="origin_appointment_required" ${row.origin_appointment_required ? "checked" : ""} /></td>
      <td><input data-field="destination_name" value="${escapeHtml(row.destination_name)}" placeholder="Plant / DC / site" /></td>
      <td><input data-field="destination_city" value="${escapeHtml(row.destination_city)}" /></td>
      <td><input data-field="destination_state" value="${escapeHtml(row.destination_state)}" /></td>
      <td><input data-field="destination_country" value="${escapeHtml(row.destination_country)}" placeholder="MX / US / CA" /></td>
      <td><input data-field="destination_postal_code" value="${escapeHtml(row.destination_postal_code)}" /></td>
      <td><input data-field="destination_address" value="${escapeHtml(row.destination_address)}" placeholder="Street / park / site" /></td>
      <td>
        <input data-field="destination_contact_name" value="${escapeHtml(row.destination_contact_name)}" placeholder="Name" />
        <input data-field="destination_contact_phone" value="${escapeHtml(row.destination_contact_phone)}" placeholder="Phone" />
        <input data-field="destination_contact_email" value="${escapeHtml(row.destination_contact_email)}" placeholder="Email" />
      </td>
      <td><input data-field="destination_hours" value="${escapeHtml(row.destination_hours)}" placeholder="Receiving hours" /></td>
      <td><select data-field="destination_handling_type">${selectOptions(HANDLING_OPTIONS, row.destination_handling_type)}</select></td>
      <td class="rfi-check-cell"><input type="checkbox" data-field="destination_appointment_required" ${row.destination_appointment_required ? "checked" : ""} /></td>
      <td><select data-field="operation_type">${selectOptions(OPERATION_OPTIONS, row.operation_type)}</select></td>
      <td><select data-field="service_type">${selectOptions(SERVICE_OPTIONS, row.service_type)}</select></td>
      <td><input data-field="equipment_type" value="${escapeHtml(row.equipment_type)}" placeholder="Truck Trailer" /></td>
      <td><input data-field="trailer_requirements" value="${escapeHtml(row.trailer_requirements)}" placeholder="Dry Van / Flatbed" /></td>
      <td><input data-field="config" value="${escapeHtml(row.config)}" placeholder="Single / team" /></td>
      <td><input data-field="commodity" value="${escapeHtml(row.commodity)}" /></td>
      <td class="rfi-check-cell"><input type="checkbox" data-field="hazmat" ${row.hazmat ? "checked" : ""} /></td>
      <td class="rfi-check-cell"><input type="checkbox" data-field="temperature_controlled" ${row.temperature_controlled ? "checked" : ""} /></td>
      <td><input type="number" step="1" data-field="weekly_volume" value="${escapeHtml(row.weekly_volume)}" /></td>
      <td><input data-field="frequency" value="${escapeHtml(row.frequency)}" placeholder="Daily / weekly / seasonal" /></td>
      <td><input type="number" step="0.01" data-field="target_rate" value="${escapeHtml(row.target_rate)}" /></td>
      <td><input data-field="currency" value="${escapeHtml(row.currency)}" /></td>
      <td><input type="number" step="0.01" data-field="current_rate" value="${escapeHtml(row.current_rate)}" /></td>
      <td><input type="number" step="0.1" data-field="transit_days" value="${escapeHtml(row.transit_days)}" /></td>
      <td><textarea data-field="notes" rows="1" placeholder="Lane notes">${escapeHtml(row.notes)}</textarea></td>
      <td><button type="button" class="secondary small-button" data-remove-lane="${index}">Remove</button></td>
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
      <label>Modelo logistico / Logistics model<textarea data-field="logistics_model" rows="4" placeholder="Direct, transfer, dedicated, drop, live load, border model by segment">${escapeHtml(segment.logistics_model)}</textarea></label>
      <label>Criterios de operacion / Operation criteria<textarea data-field="operation_criteria" rows="4" placeholder="Pickup/delivery windows, loading model, schedule, appointment rules">${escapeHtml(segment.operation_criteria)}</textarea></label>
      <label>Reglas de negocio / Business rules<textarea data-field="business_rules" rows="4" placeholder="Payment terms, tender rules, penalties, escalation expectations">${escapeHtml(segment.business_rules)}</textarea></label>
      <label>Especificaciones de servicio / Service specifications<textarea data-field="service_specifications" rows="4" placeholder="Equipment specs, hazmat, temperature control, insurance, documents">${escapeHtml(segment.service_specifications)}</textarea></label>
      <label>Required carrier profile<textarea data-field="carrier_requirements" rows="3" placeholder="Authority, insurance, fleet, GPS, crossborder experience, certifications">${escapeHtml(segment.carrier_requirements)}</textarea></label>
      <label>Otras notas / Other notes<textarea data-field="other_notes" rows="3" placeholder="Known constraints, phased rollout, exclusions">${escapeHtml(segment.other_notes)}</textarea></label>
      <label>Attachment links<textarea data-field="attachment_links" rows="2" placeholder="Drive links or file references">${escapeHtml(segment.attachment_links)}</textarea></label>
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
      return {
        segment_key: segmentKey,
        segment_name: get("segment_name") || optionLabel(SEGMENT_OPTIONS, segmentKey) || `Segment ${index + 1}`,
        operation_type: get("operation_type"),
        logistics_model: get("logistics_model"),
        operation_criteria: get("operation_criteria"),
        business_rules: get("business_rules"),
        service_specifications: get("service_specifications"),
        carrier_requirements: get("carrier_requirements"),
        other_notes: get("other_notes"),
        attachment_links: get("attachment_links")
      };
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
    setStatus("Complete origin, destination, equipment and weekly volume for every lane before submitting.", "error");
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
  const next = {
    ...segment,
    segment_key: key,
    segment_name: suggestion.segment_name,
    operation_type: suggestion.operation_type
  };
  for (const field of CHECKLIST_FIELDS) {
    if (field === "attachment_links") continue;
    next[field] = cleanText(segment[field]) || cleanText(suggestion[field]);
  }
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
  });
  document.addEventListener("input", () => {
    if (els.completeness) els.completeness.textContent = `${clientCompleteness()}%`;
  });
  els.save?.addEventListener("click", saveDraft);
  els.submit?.addEventListener("click", submitFinal);
}

initEvents();
load();
