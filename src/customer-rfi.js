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
  origins: document.getElementById("rfi-origins"),
  destinations: document.getElementById("rfi-destinations"),
  lanes: document.getElementById("rfi-lanes"),
  logisticsModels: document.getElementById("rfi-logistics-models"),
  businessRules: document.getElementById("rfi-business-rules"),
  operationalCriteria: document.getElementById("rfi-operational-criteria"),
  serviceRequirements: document.getElementById("rfi-service-requirements"),
  carrierRequirements: document.getElementById("rfi-carrier-requirements"),
  notes: document.getElementById("rfi-notes"),
  attachments: document.getElementById("rfi-attachments"),
  addOrigin: document.getElementById("add-origin-row"),
  addDestination: document.getElementById("add-destination-row"),
  addLane: document.getElementById("add-lane-row"),
  save: document.getElementById("save-customer-rfi"),
  submit: document.getElementById("submit-customer-rfi")
};

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
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "";
}

function checkedBoolean(value) {
  return value === true || value === "true" || value === "on";
}

function setStatus(message, tone = "info") {
  if (!els.message) return;
  els.message.textContent = tone === "error" ? humanizeError(message) : message || "";
  els.message.dataset.tone = tone;
}

function locationLabel(row, fallback = "Location") {
  return [row.name, row.city, row.state, row.country].map(cleanText).filter(Boolean).join(", ") || fallback;
}

function laneLocationLabel(row, kind) {
  const collection = kind === "origin" ? state.origins : state.destinations;
  const key = cleanText(row[`${kind}_key`] || row[`${kind}_id`]);
  const match = collection.find((item) => cleanText(item.key || item.origin_key || item.destination_key || item.id) === key);
  return cleanText(row[`${kind}_text`] || row[kind]) || (match ? locationLabel(match, key) : key);
}

function makeLocation(kind, index = 0) {
  const prefix = kind === "origin" ? "O" : "D";
  return {
    key: `${prefix}${index + 1}`,
    name: "",
    address: "",
    city: "",
    state: "",
    country: "",
    postal_code: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    hours: "",
    appointment_required: false,
    handling_type: "",
    average_time_hours: "",
    site_restrictions: "",
    notes: ""
  };
}

function makeLane(index = 0) {
  return {
    lane_id: `L${index + 1}`,
    origin_key: "",
    origin_text: "",
    destination_key: "",
    destination_text: "",
    operating_segment: "crossborder",
    operation_type: "crossborder",
    service_type: "standard",
    equipment_type: "",
    trailer_requirements: "",
    commodity: "",
    hazmat: false,
    cargo_value: "",
    cargo_value_currency: "",
    weight: "",
    pallets: "",
    dimensions: "",
    weekly_volume: "",
    monthly_volume: "",
    frequency: "",
    pickup_lead_time_hours: "",
    expected_transit_time_hours: "",
    target_rate: "",
    current_rate: "",
    currency: "USD",
    seasonality_notes: "",
    special_requirements: "",
    notes: ""
  };
}

function responseObject() {
  const response = state.submission?.response;
  return response && typeof response === "object" && !Array.isArray(response) ? response : {};
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

function rowLane(row, index) {
  return {
    ...makeLane(index),
    lane_id: cleanText(row.lane_id || row.id) || `L${index + 1}`,
    origin_key: cleanText(row.origin_key || row.origin_id),
    origin_text: cleanText(row.origin_text || row.origin),
    destination_key: cleanText(row.destination_key || row.destination_id),
    destination_text: cleanText(row.destination_text || row.destination),
    operating_segment: cleanText(row.operating_segment || row.segment) || "crossborder",
    operation_type: cleanText(row.operation_type || row.operation) || "crossborder",
    service_type: cleanText(row.service_type || row.service) || "standard",
    equipment_type: cleanText(row.equipment_type || row.equipment),
    trailer_requirements: cleanText(row.trailer_requirements || row.trailer),
    commodity: cleanText(row.commodity),
    hazmat: Boolean(row.hazmat),
    cargo_value: numberOrBlank(row.cargo_value),
    cargo_value_currency: cleanText(row.cargo_value_currency),
    weight: numberOrBlank(row.weight),
    pallets: numberOrBlank(row.pallets),
    dimensions: cleanText(row.dimensions),
    weekly_volume: numberOrBlank(row.weekly_volume),
    monthly_volume: numberOrBlank(row.monthly_volume),
    frequency: cleanText(row.frequency),
    pickup_lead_time_hours: numberOrBlank(row.pickup_lead_time_hours),
    expected_transit_time_hours: numberOrBlank(row.expected_transit_time_hours),
    target_rate: numberOrBlank(row.target_rate),
    current_rate: numberOrBlank(row.current_rate),
    currency: cleanText(row.currency) || "USD",
    seasonality_notes: cleanText(row.seasonality_notes),
    special_requirements: cleanText(row.special_requirements),
    notes: cleanText(row.notes)
  };
}

function selectOptions(options, selected) {
  return options
    .map((option) => {
      const value = typeof option === "string" ? option : option.value;
      const label = typeof option === "string" ? option : option.label;
      return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function locationOptions(kind, selected) {
  const rows = kind === "origin" ? state.origins : state.destinations;
  return `<option value="">Select ${kind}</option>${rows
    .map((row, index) => {
      const value = cleanText(row.key || row.origin_key || row.destination_key || row.id) || `${kind === "origin" ? "O" : "D"}${index + 1}`;
      return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(locationLabel(row, value))}</option>`;
    })
    .join("")}<option value="manual"${selected === "manual" ? " selected" : ""}>Manual text</option>`;
}

function renderLocationRows(kind) {
  const container = kind === "origin" ? els.origins : els.destinations;
  const rows = kind === "origin" ? state.origins : state.destinations;
  if (!container) return;
  container.innerHTML = rows.map((row, index) => `
    <article class="customer-rfi-location-row" data-kind="${kind}" data-index="${index}">
      <div class="customer-rfi-row-head">
        <strong>${escapeHtml(kind === "origin" ? "Origin" : "Destination")} ${index + 1}</strong>
        <button type="button" class="secondary small-button" data-remove-location="${kind}" data-index="${index}">Remove</button>
      </div>
      <label>Key<input data-field="key" value="${escapeHtml(row.key)}" placeholder="${kind === "origin" ? "O1" : "D1"}" /></label>
      <label>Name<input data-field="name" value="${escapeHtml(row.name)}" placeholder="Plant, DC, customer site" /></label>
      <label>Address<input data-field="address" value="${escapeHtml(row.address)}" placeholder="Street / park / site" /></label>
      <label>City<input data-field="city" value="${escapeHtml(row.city)}" /></label>
      <label>State<input data-field="state" value="${escapeHtml(row.state)}" /></label>
      <label>Country<input data-field="country" value="${escapeHtml(row.country)}" placeholder="MX / US / CA" /></label>
      <label>ZIP / postal<input data-field="postal_code" value="${escapeHtml(row.postal_code)}" /></label>
      <label>Contact<input data-field="contact_name" value="${escapeHtml(row.contact_name)}" /></label>
      <label>Phone<input data-field="contact_phone" value="${escapeHtml(row.contact_phone)}" /></label>
      <label>Email<input data-field="contact_email" value="${escapeHtml(row.contact_email)}" /></label>
      <label>Hours<input data-field="hours" value="${escapeHtml(row.hours)}" placeholder="${kind === "origin" ? "Loading hours" : "Receiving hours"}" /></label>
      <label>Handling
        <select data-field="handling_type">
          ${selectOptions(kind === "origin" ? [
            { value: "", label: "Select" },
            { value: "live", label: "Live" },
            { value: "drop", label: "Drop" },
            { value: "preload", label: "Preload" },
            { value: "other", label: "Other" }
          ] : [
            { value: "", label: "Select" },
            { value: "live", label: "Live" },
            { value: "drop", label: "Drop" },
            { value: "drop_and_hook", label: "Drop and hook" },
            { value: "other", label: "Other" }
          ], row.handling_type)}
        </select>
      </label>
      <label>Avg hours<input type="number" step="0.1" data-field="average_time_hours" value="${escapeHtml(row.average_time_hours)}" /></label>
      <label class="inline-check"><input type="checkbox" data-field="appointment_required" ${row.appointment_required ? "checked" : ""} /> Appointment required</label>
      <label class="wide">Site restrictions / notes<textarea data-field="notes" rows="2">${escapeHtml(row.notes || row.site_restrictions)}</textarea></label>
    </article>
  `).join("");
}

function renderLaneRows() {
  if (!els.lanes) return;
  els.lanes.innerHTML = state.lanes.map((row, index) => `
    <tr data-index="${index}">
      <td><input data-field="lane_id" value="${escapeHtml(row.lane_id)}" /></td>
      <td>
        <select data-field="origin_key">${locationOptions("origin", row.origin_key)}</select>
        <input data-field="origin_text" value="${escapeHtml(laneLocationLabel(row, "origin"))}" placeholder="Origin text" />
      </td>
      <td>
        <select data-field="destination_key">${locationOptions("destination", row.destination_key)}</select>
        <input data-field="destination_text" value="${escapeHtml(laneLocationLabel(row, "destination"))}" placeholder="Destination text" />
      </td>
      <td>
        <select data-field="operation_type">${selectOptions([
          { value: "crossborder", label: "Crossborder" },
          { value: "mx_domestic", label: "MX domestic" },
          { value: "us_domestic", label: "US domestic" },
          { value: "local", label: "Local" },
          { value: "regional", label: "Regional" },
          { value: "national", label: "National" }
        ], row.operation_type)}</select>
      </td>
      <td>
        <select data-field="service_type">${selectOptions([
          { value: "standard", label: "Standard" },
          { value: "expedited", label: "Expedited" },
          { value: "time_critical", label: "Time critical" },
          { value: "dedicated", label: "Dedicated" },
          { value: "spot", label: "Spot" },
          { value: "recurring", label: "Recurring" }
        ], row.service_type)}</select>
      </td>
      <td><input data-field="equipment_type" value="${escapeHtml(row.equipment_type)}" placeholder="Truck Trailer" /></td>
      <td><input data-field="trailer_requirements" value="${escapeHtml(row.trailer_requirements)}" placeholder="Dry Van / Flatbed" /></td>
      <td><input type="number" step="1" data-field="weekly_volume" value="${escapeHtml(row.weekly_volume)}" /></td>
      <td><input data-field="frequency" value="${escapeHtml(row.frequency)}" placeholder="Daily / weekly / seasonal" /></td>
      <td><input data-field="currency" value="${escapeHtml(row.currency)}" /></td>
      <td><input type="number" step="0.01" data-field="current_rate" value="${escapeHtml(row.current_rate)}" /></td>
      <td><textarea data-field="notes" rows="1">${escapeHtml(row.notes)}</textarea></td>
      <td><button type="button" class="secondary small-button" data-remove-lane="${index}">Remove</button></td>
    </tr>
  `).join("");
}

function clientCompleteness(rfi = null) {
  const domRows = Array.from(els.lanes?.querySelectorAll("tr[data-index]") || []);
  const lanes = rfi?.lanes || (domRows.length ? collectLaneRows() : state.lanes);
  if (!lanes.length) return 0;
  let checks = 0;
  let passed = 0;
  for (const lane of lanes) {
    for (const field of ["origin_text", "destination_text", "equipment_type", "weekly_volume"]) {
      checks += 1;
      if (cleanText(lane[field])) passed += 1;
    }
  }
  return Math.round((passed / Math.max(checks, 1)) * 100);
}

function setReadonlyMode() {
  const readonly = state.submitted;
  document.querySelectorAll(".customer-rfi-shell input, .customer-rfi-shell select, .customer-rfi-shell textarea").forEach((element) => {
    element.disabled = readonly;
  });
  document.querySelectorAll("#add-origin-row, #add-destination-row, #add-lane-row, [data-remove-location], [data-remove-lane]").forEach((element) => {
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
  renderLocationRows("origin");
  renderLocationRows("destination");
  renderLaneRows();
  setReadonlyMode();
}

function collectLocation(kind) {
  return Array.from(document.querySelectorAll(`.customer-rfi-location-row[data-kind="${kind}"]`))
    .map((row, index) => {
      const get = (field) => cleanText(row.querySelector(`[data-field="${field}"]`)?.value);
      return {
        key: get("key") || `${kind === "origin" ? "O" : "D"}${index + 1}`,
        name: get("name"),
        address: get("address"),
        city: get("city"),
        state: get("state"),
        country: get("country"),
        postal_code: get("postal_code"),
        contact_name: get("contact_name"),
        contact_phone: get("contact_phone"),
        contact_email: get("contact_email"),
        hours: get("hours"),
        appointment_required: row.querySelector('[data-field="appointment_required"]')?.checked === true,
        handling_type: get("handling_type"),
        average_time_hours: get("average_time_hours"),
        notes: get("notes")
      };
    })
    .filter((row) => Object.values(row).some((value) => value === true || cleanText(value)));
}

function collectLaneRows() {
  return Array.from(els.lanes?.querySelectorAll("tr[data-index]") || [])
    .map((row, index) => {
      const get = (field) => cleanText(row.querySelector(`[data-field="${field}"]`)?.value);
      const originKey = get("origin_key");
      const destinationKey = get("destination_key");
      return {
        lane_id: get("lane_id") || `L${index + 1}`,
        origin_key: originKey === "manual" ? "" : originKey,
        origin_text: get("origin_text"),
        destination_key: destinationKey === "manual" ? "" : destinationKey,
        destination_text: get("destination_text"),
        operating_segment: get("operation_type") === "crossborder" ? "crossborder" : get("operation_type"),
        operation_type: get("operation_type"),
        service_type: get("service_type"),
        equipment_type: get("equipment_type"),
        trailer_requirements: get("trailer_requirements"),
        weekly_volume: get("weekly_volume"),
        frequency: get("frequency"),
        currency: get("currency"),
        current_rate: get("current_rate"),
        notes: get("notes")
      };
    })
    .filter((row) => Object.values(row).some((value) => cleanText(value)));
}

function collectRfi(updateState = true) {
  const origins = collectLocation("origin");
  const destinations = collectLocation("destination");
  const lanes = collectLaneRows();
  if (updateState) {
    state.origins = origins;
    state.destinations = destinations;
    state.lanes = lanes;
  }
  return {
    account_overview: {
      company: cleanText(els.company?.value),
      contact: cleanText(els.contact?.value),
      scope: cleanText(els.scope?.value)
    },
    operating_segments: Array.from(document.querySelectorAll('input[name="rfi-segment"]:checked')).map((input) => ({ value: input.value })),
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
    logistics_models: { notes: cleanText(els.logisticsModels?.value) || cleanText(els.scope?.value) },
    operational_criteria: { notes: cleanText(els.operationalCriteria?.value) },
    business_rules: { notes: cleanText(els.businessRules?.value) },
    service_requirements: { notes: cleanText(els.serviceRequirements?.value) },
    carrier_requirements: { notes: cleanText(els.carrierRequirements?.value) },
    crossborder_details: { notes: cleanText(els.crossborder?.value) },
    notes_exceptions: { notes: cleanText(els.notes?.value) },
    attachments: cleanText(els.attachments?.value)
      .split(/\n+/)
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
    ? response.origins.map((row, index) => ({ ...makeLocation("origin", index), ...row, key: cleanText(row.origin_key || row.key) || `O${index + 1}` }))
    : (data.origins || []).map(rowOrigin);
  state.destinations = Array.isArray(response.destinations) && response.destinations.length
    ? response.destinations.map((row, index) => ({ ...makeLocation("destination", index), ...row, key: cleanText(row.destination_key || row.key) || `D${index + 1}` }))
    : (data.destinations || []).map(rowDestination);
  state.lanes = Array.isArray(response.lanes) && response.lanes.length
    ? response.lanes.map(rowLane)
    : (data.lanes || []).map(rowLane);

  if (!state.origins.length) state.origins = [makeLocation("origin", 0)];
  if (!state.destinations.length) state.destinations = [makeLocation("destination", 0)];
  if (!state.lanes.length) state.lanes = [makeLane(0)];
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
  const missing = rfi.lanes.filter((lane) => !cleanText(lane.origin_text) || !cleanText(lane.destination_text) || !cleanText(lane.equipment_type) || !cleanText(lane.weekly_volume));
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

function initEvents() {
  els.addOrigin?.addEventListener("click", () => {
    state.origins = collectLocation("origin");
    state.origins.push(makeLocation("origin", state.origins.length));
    render();
  });
  els.addDestination?.addEventListener("click", () => {
    state.destinations = collectLocation("destination");
    state.destinations.push(makeLocation("destination", state.destinations.length));
    render();
  });
  els.addLane?.addEventListener("click", () => {
    collectRfi();
    state.lanes.push(makeLane(state.lanes.length));
    render();
  });
  document.addEventListener("click", (event) => {
    const locationButton = event.target.closest("[data-remove-location]");
    if (locationButton) {
      const kind = locationButton.dataset.removeLocation;
      const index = Number(locationButton.dataset.index);
      if (kind === "origin") state.origins = collectLocation("origin").filter((_, rowIndex) => rowIndex !== index);
      if (kind === "destination") state.destinations = collectLocation("destination").filter((_, rowIndex) => rowIndex !== index);
      if (!state.origins.length) state.origins = [makeLocation("origin", 0)];
      if (!state.destinations.length) state.destinations = [makeLocation("destination", 0)];
      render();
      return;
    }
    const laneButton = event.target.closest("[data-remove-lane]");
    if (laneButton) {
      const index = Number(laneButton.dataset.removeLane);
      state.lanes = collectLaneRows().filter((_, rowIndex) => rowIndex !== index);
      if (!state.lanes.length) state.lanes = [makeLane(0)];
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
