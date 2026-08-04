import { initAuthControls, requirePrivatePage } from "./auth.js";
import { humanizeError } from "./error-copy.js";
import {
  archiveGrowthSegment,
  convertGrowthResult,
  exportGrowthCampaign,
  getGrowthCampaign,
  importGrowthCsv,
  listGrowthCampaigns,
  listGrowthResults,
  listGrowthSegments,
  loadGrowthDashboard,
  previewGrowthSegment,
  recordGrowthResult,
  refreshGrowthCampaignAudience,
  restoreGrowthSegment,
  runGrowthAiAction,
  saveGrowthCampaign,
  saveGrowthMessage,
  saveGrowthSegment,
  setGrowthCampaignStatus
} from "./growth-service.js";

const state = {
  csvFile: null,
  csvHeaders: [],
  csvRows: [],
  csvMapping: {},
  importStep: 1,
  segments: [],
  segmentPreview: null,
  campaigns: [],
  campaignDetail: null,
  campaignStep: 1,
  campaignMemberFilter: "all",
  campaignMemberQuery: "",
  currentCampaignId: "",
  campaignDirty: false,
  campaignMessagesDirty: false,
  resultCampaignDetail: null,
  resultMemberQuery: "",
  resultFilter: "all",
  results: { metrics: {}, rows: [] }
};

const FIELD_OPTIONS = [
  ["", "No importar"],
  ["company_name", "Cuenta: nombre comercial"],
  ["legal_name", "Cuenta: razón social"],
  ["domain", "Cuenta: dominio"],
  ["website", "Cuenta: sitio web"],
  ["company_linkedin", "Cuenta: LinkedIn"],
  ["industry", "Cuenta: industria"],
  ["employees", "Cuenta: empleados"],
  ["annual_revenue", "Cuenta: ingreso anual"],
  ["city", "Cuenta: ciudad"],
  ["state", "Cuenta: estado"],
  ["country", "Cuenta: país"],
  ["account_type", "Cuenta: tipo"],
  ["logistics_fit", "Cuenta: logistics fit"],
  ["labels", "Cuenta: etiquetas"],
  ["description", "Cuenta: descripción"],
  ["notes", "Cuenta: notas"],
  ["external_account_id", "Cuenta: ID externo"],
  ["full_name", "Contacto: nombre completo"],
  ["first_name", "Contacto: nombre"],
  ["last_name", "Contacto: apellido"],
  ["title", "Contacto: puesto"],
  ["department", "Contacto: departamento"],
  ["email", "Contacto: email"],
  ["phone", "Contacto: teléfono"],
  ["contact_linkedin", "Contacto: LinkedIn"],
  ["persona", "Contacto: persona"],
  ["buying_role", "Contacto: buying role"],
  ["external_contact_id", "Contacto: ID externo"]
];

const HEADER_ALIASES = {
  company_name: ["company", "company name", "account", "account name", "organization", "organization name", "empresa", "nombre empresa", "nombre comercial"],
  legal_name: ["legal name", "legal company name", "razon social", "razón social"],
  domain: ["domain", "company domain", "website domain", "dominio"],
  website: ["website", "company website", "sitio web", "url"],
  company_linkedin: ["company linkedin", "company linkedin url", "account linkedin", "linkedin company"],
  industry: ["industry", "industria"],
  employees: ["employees", "employee count", "headcount", "empleados"],
  annual_revenue: ["annual revenue", "revenue", "ingresos", "ventas anuales"],
  city: ["city", "headquarters city", "hq city", "ciudad"],
  state: ["state", "headquarters state", "hq state", "estado", "province"],
  country: ["country", "headquarters country", "hq country", "pais", "país"],
  account_type: ["account type", "company type", "tipo de cuenta"],
  logistics_fit: ["logistics fit", "fit", "service fit", "logistics services"],
  labels: ["labels", "tags", "etiquetas"],
  description: ["description", "company description", "descripcion", "descripción"],
  notes: ["notes", "account notes", "notas"],
  external_account_id: ["account id", "external account id", "company id", "organization id"],
  full_name: ["full name", "contact", "contact name", "name", "nombre completo"],
  first_name: ["first name", "given name", "nombre"],
  last_name: ["last name", "surname", "apellido"],
  title: ["title", "job title", "position", "puesto", "cargo"],
  department: ["department", "departamento"],
  email: ["email", "email address", "work email", "correo", "correo electronico"],
  phone: ["phone", "phone number", "mobile", "telefono", "teléfono"],
  contact_linkedin: ["contact linkedin", "linkedin url", "person linkedin", "linkedin"],
  persona: ["persona", "contact persona"],
  buying_role: ["buying role", "decision role", "rol de compra"],
  external_contact_id: ["contact id", "external contact id", "person id"]
};

const EXPORT_COLUMNS = [
  "campaign_name", "account_name", "domain", "contact_name", "first_name", "last_name", "title", "email", "phone", "linkedin_url", "persona", "logistics_fit",
  "execution_channel", "execution_destination", "available_delivery_channels",
  "email_1_subject", "email_1_body", "follow_up_1_subject", "follow_up_1_body", "follow_up_2_subject", "follow_up_2_body", "linkedin_note", "call_script", "whatsapp_message"
];

const STEP_LABELS = {
  email_1: "Email inicial",
  follow_up_1: "Seguimiento 1",
  follow_up_2: "Seguimiento 2",
  linkedin_note: "Nota de LinkedIn",
  call_script: "Guion de llamada",
  whatsapp_message: "Mensaje de WhatsApp",
  custom: "Mensaje personalizado"
};

const CAMPAIGN_MEMBER_FILTER_LABELS = {
  all: "Todos",
  ready: "Listos",
  review: "Revisar",
  blocked: "Bloqueados",
  history: "Historial"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[character]));
const clean = (value) => String(value ?? "").trim();
const unique = (values) => [...new Set(values.filter(Boolean))];

function normalize(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return clean(value);
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(date);
}

function setGlobalStatus(message = "", type = "") {
  const element = $("#growth-global-status");
  if (!element) return;
  element.textContent = message;
  element.className = `growth-status${type ? ` ${type}` : ""}${message ? "" : " hidden"}`;
}

function errorMessage(error) {
  const message = humanizeError(error) || error?.message || "No se pudo completar la acción.";
  if (/unknown action/i.test(message)) {
    return "Growth Hacking todavía no está publicado en este entorno. Aplica la migración y vuelve a desplegar rateware-api.";
  }
  return message;
}

async function withBusy(button, label, task) {
  const original = button?.textContent || "";
  if (button) {
    button.disabled = true;
    button.textContent = label;
  }
  try {
    return await task();
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

function splitCriteria(value) {
  return unique(clean(value).split(/[,;|]/).map((item) => item.trim()));
}

function activateView(view) {
  const target = ["dashboard", "segments", "campaigns", "ai", "results"].includes(view) ? view : "dashboard";
  $$('[data-growth-view]').forEach((button) => button.classList.toggle("active", button.dataset.growthView === target));
  $$('[data-growth-panel]').forEach((panel) => panel.classList.toggle("active", panel.dataset.growthPanel === target));
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#${target}`);
  if (target === "segments") loadSegments().catch((error) => setGlobalStatus(errorMessage(error), "error"));
  if (target === "campaigns") loadCampaigns().catch((error) => setGlobalStatus(errorMessage(error), "error"));
  if (target === "results") loadResults().catch((error) => setGlobalStatus(errorMessage(error), "error"));
}

function setImportStep(step) {
  state.importStep = Math.max(1, Math.min(3, Number(step) || 1));
  $$('[data-import-step]').forEach((button) => button.classList.toggle("active", Number(button.dataset.importStep) === state.importStep));
  $$('[data-import-panel]').forEach((panel) => panel.classList.toggle("active", Number(panel.dataset.importPanel) === state.importStep));
}

function setCampaignStep(step) {
  state.campaignStep = Math.max(1, Math.min(5, Number(step) || 1));
  $$('[data-campaign-step]').forEach((button) => button.classList.toggle("active", Number(button.dataset.campaignStep) === state.campaignStep));
  $$('[data-campaign-panel]').forEach((panel) => panel.classList.toggle("active", Number(panel.dataset.campaignPanel) === state.campaignStep));
  $("#campaign-back-button").disabled = state.campaignStep === 1;
  $("#campaign-next-button").classList.toggle("hidden", state.campaignStep === 5);
  renderCampaignProgress();
}

function campaignDraftState() {
  const campaign = state.campaignDetail?.campaign || {};
  const name = clean($("#campaign-name")?.value);
  const segmentId = $("#campaign-segment")?.value || campaign.segment_id || "";
  const hasChannels = campaignChannels().length > 0;
  const saved = Boolean(state.currentCampaignId) && !state.campaignDirty;
  const messagesSaved = saved && (state.campaignDetail?.messages || []).length > 0 && !state.campaignMessagesDirty;
  return { name, segmentId, hasChannels, saved, messagesSaved };
}

function renderCampaignProgress() {
  const draft = campaignDraftState();
  const steps = {
    1: { ready: Boolean(draft.name), enabled: Boolean(draft.name), next: "Continuar a segmento", hint: draft.name ? "Objetivo listo. Selecciona la audiencia guardada." : "Escribe un nombre para identificar esta campaña." },
    2: { ready: Boolean(draft.segmentId), enabled: Boolean(draft.segmentId), next: "Continuar a oferta", hint: draft.segmentId ? "Audiencia seleccionada. Define la oferta y los canales disponibles." : "Selecciona un segmento listo antes de continuar." },
    3: { ready: draft.saved && draft.hasChannels, enabled: Boolean(draft.name && draft.segmentId && draft.hasChannels), next: "Guardar campaña y audiencia", hint: draft.saved && draft.hasChannels ? "Campaña guardada. Puedes revisar los mensajes o actualizar la audiencia." : "Guarda la campaña para construir una audiencia auditable." },
    4: { ready: draft.messagesSaved, enabled: draft.saved, next: "Guardar mensajes y revisar", hint: !draft.saved ? "Guarda primero la campaña para generar los mensajes." : draft.messagesSaved ? "Mensajes guardados. La audiencia está lista para revisión." : "Revisa y guarda los mensajes antes de exportar." },
    5: { ready: draft.saved, enabled: draft.saved, next: "", hint: !draft.saved ? "Guarda la campaña antes de preparar el archivo de ejecución." : "Revisa la audiencia y exporta solo los contactos listos. Rateware no enviará mensajes." }
  };
  $$('[data-campaign-step]').forEach((button) => {
    const step = Number(button.dataset.campaignStep);
    const meta = steps[step];
    button.classList.toggle("is-ready", meta.ready);
    button.classList.toggle("is-pending", !meta.ready);
    button.title = meta.hint;
    button.setAttribute("aria-label", `Paso ${step}: ${button.textContent.trim()}. ${meta.hint}`);
  });
  const meta = steps[state.campaignStep] || steps[1];
  const nextButton = $("#campaign-next-button");
  const guidance = $("#campaign-step-guidance");
  nextButton.disabled = !meta.enabled;
  nextButton.textContent = meta.next || "Continuar";
  nextButton.title = meta.hint;
  if (guidance) guidance.textContent = meta.hint;
}

function markCampaignDirty() {
  state.campaignDirty = true;
  renderCampaignProgress();
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((item) => clean(item))) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some((item) => clean(item))) rows.push(row);
  return rows;
}

function parseCsv(text) {
  const normalizedText = String(text || "").replace(/^\uFEFF/, "");
  const candidates = [",", ";", "\t"];
  const parsed = candidates.map((delimiter) => ({ delimiter, rows: parseDelimited(normalizedText, delimiter) }));
  parsed.sort((left, right) => (right.rows[0]?.length || 0) - (left.rows[0]?.length || 0));
  const matrix = parsed[0].rows;
  if (!matrix.length || matrix[0].length < 2) throw new Error("El archivo no contiene una tabla CSV reconocible.");
  const seen = new Map();
  const headers = matrix[0].map((value, index) => {
    const base = clean(value) || `Column ${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
  const rows = matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, clean(values[index])]))).filter((row) => Object.values(row).some(Boolean));
  return { headers, rows };
}

function autoMapHeaders(headers) {
  const mapping = {};
  const claimed = new Set();
  for (const header of headers) {
    const key = normalize(header);
    let match = "";
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (claimed.has(field)) continue;
      if (aliases.some((alias) => normalize(alias) === key)) {
        match = field;
        break;
      }
    }
    if (!match) {
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        if (claimed.has(field)) continue;
        if (aliases.some((alias) => key.includes(normalize(alias)) || normalize(alias).includes(key))) {
          match = field;
          break;
        }
      }
    }
    mapping[header] = match;
    if (match) claimed.add(match);
  }
  return mapping;
}

function mappingOptions(selected) {
  return FIELD_OPTIONS.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function renderCsvMapping() {
  const body = $("#growth-mapping-body");
  body.innerHTML = state.csvHeaders.map((header) => {
    const samples = unique(state.csvRows.slice(0, 3).map((row) => clean(row[header]))).join(" · ");
    return `<tr><td><strong>${escapeHtml(header)}</strong></td><td><select data-map-header="${escapeHtml(header)}">${mappingOptions(state.csvMapping[header] || "")}</select></td><td title="${escapeHtml(samples)}">${escapeHtml(samples || "-")}</td></tr>`;
  }).join("");
  body.querySelectorAll("[data-map-header]").forEach((select) => {
    select.addEventListener("change", () => {
      const field = select.value;
      if (field) {
        for (const [header, mapped] of Object.entries(state.csvMapping)) {
          if (header !== select.dataset.mapHeader && mapped === field) state.csvMapping[header] = "";
        }
      }
      state.csvMapping[select.dataset.mapHeader] = field;
      renderCsvMapping();
      updateImportSummary();
    });
  });
}

function renderCsvPreview() {
  const visibleHeaders = state.csvHeaders.slice(0, 8);
  $("#growth-csv-preview").innerHTML = `<table class="growth-table"><thead><tr>${visibleHeaders.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${state.csvRows.slice(0, 8).map((row) => `<tr>${visibleHeaders.map((header) => `<td>${escapeHtml(row[header] || "-")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function updateImportSummary() {
  $("#growth-import-file-name").textContent = state.csvFile?.name || "Sin archivo";
  $("#growth-import-row-count").textContent = `${state.csvRows.length.toLocaleString("es-MX")} filas`;
  $("#growth-import-mapped-count").textContent = `${Object.values(state.csvMapping).filter(Boolean).length} columnas mapeadas`;
}

function mappedImportRows() {
  return state.csvRows.map((source) => {
    const target = { _source: source };
    for (const [header, field] of Object.entries(state.csvMapping)) {
      if (field && clean(source[header])) target[field] = clean(source[header]);
    }
    return target;
  }).filter((row) => row.company_name || row.domain || row.email || row.external_account_id);
}

function renderImportReview() {
  const rows = mappedImportRows();
  const accounts = rows.filter((row) => row.company_name || row.domain || row.external_account_id).length;
  const contacts = rows.filter((row) => row.email || row.full_name || row.first_name || row.last_name).length;
  const genericEmails = rows.filter((row) => /^(info|sales|ventas|contact|contacto|admin|office|support|operations|operaciones|dispatch|traffic|trafico)@/i.test(row.email || "")).length;
  $("#growth-import-review").innerHTML = [
    ["Filas a procesar", rows.length],
    ["Filas con cuenta", accounts],
    ["Filas con contacto", contacts],
    ["Emails genéricos detectados", genericEmails],
    ["Fuente", state.csvFile?.name || "-"],
    ["Lista", clean($("#growth-source-list").value) || "Sin nombre"]
  ].map(([label, value]) => `<div>${escapeHtml(label)}<strong>${escapeHtml(value)}</strong></div>`).join("");
  return rows;
}

async function readSelectedCsv() {
  const file = $("#growth-csv-file").files?.[0];
  if (!file) throw new Error("Selecciona un archivo CSV.");
  state.csvFile = file;
  const parsed = parseCsv(await file.text());
  if (parsed.rows.length > 5000) throw new Error("Este MVP procesa hasta 5,000 filas por importación. Divide el archivo en lotes.");
  state.csvHeaders = parsed.headers;
  state.csvRows = parsed.rows;
  state.csvMapping = autoMapHeaders(parsed.headers);
  if (!clean($("#growth-source-list").value)) $("#growth-source-list").value = file.name.replace(/\.csv$/i, "");
  renderCsvMapping();
  renderCsvPreview();
  updateImportSummary();
  setImportStep(2);
}

async function confirmImport() {
  const rows = mappedImportRows();
  if (!rows.length) throw new Error("Mapea al menos una cuenta, dominio, email o ID externo.");
  const sourceListName = clean($("#growth-source-list").value) || state.csvFile?.name || "Growth import";
  const response = await importGrowthCsv({
    rows,
    sourceFileName: state.csvFile?.name || "growth-import.csv",
    sourceListName
  });
  const summary = response.summary || {};
  const result = $("#growth-import-result");
  result.className = "growth-result-banner success";
  const duplicateCount = Number(summary.duplicate_accounts || 0) + Number(summary.duplicate_contacts || 0);
  result.innerHTML = `<strong>Importación terminada.</strong> ${Number(summary.accounts_imported || 0).toLocaleString("es-MX")} cuentas y ${Number(summary.contacts_imported || 0).toLocaleString("es-MX")} contactos creados; ${duplicateCount.toLocaleString("es-MX")} registros existentes fueron vinculados sin sobrescribir el CRM. ${Number(summary.needs_review || 0).toLocaleString("es-MX")} cuentas requieren revisión. <button type="button" data-use-imported-list>Crear audiencia con esta lista</button>`;
  result.querySelector("[data-use-imported-list]")?.addEventListener("click", async () => {
    fillSegmentForm(null);
    $("#segment-source-list").value = sourceListName;
    activateView("segments");
    await previewSegment();
  });
  await Promise.all([loadDashboard(), loadSegments()]);
}

function segmentCriteriaFromForm() {
  return {
    query: clean($("#segment-query").value),
    account_types: splitCriteria($("#segment-account-type").value),
    data_statuses: splitCriteria($("#segment-data-status").value),
    logistics_fit: splitCriteria($("#segment-logistics-fit").value),
    countries: splitCriteria($("#segment-country").value),
    states: splitCriteria($("#segment-state").value),
    industries: splitCriteria($("#segment-industry").value),
    personas: splitCriteria($("#segment-persona").value),
    titles: splitCriteria($("#segment-title").value),
    source_lists: splitCriteria($("#segment-source-list").value),
    has_valid_email: $("#segment-valid-email").checked
  };
}

function fillSegmentForm(segment) {
  const criteria = segment?.criteria || {};
  $("#segment-name").value = segment?.name || "";
  $("#segment-status").value = segment?.status === "ready" ? "ready" : "draft";
  $("#segment-query").value = criteria.query || "";
  $("#segment-account-type").value = criteria.account_types?.[0] || "shipper";
  $("#segment-data-status").value = criteria.data_statuses?.[0] || "ready";
  $("#segment-logistics-fit").value = criteria.logistics_fit?.[0] || "";
  $("#segment-country").value = (criteria.countries || []).join(", ");
  $("#segment-state").value = (criteria.states || []).join(", ");
  $("#segment-industry").value = (criteria.industries || []).join(", ");
  $("#segment-persona").value = (criteria.personas || []).join(", ");
  $("#segment-title").value = (criteria.titles || []).join(", ");
  $("#segment-source-list").value = (criteria.source_lists || []).join(", ");
  $("#segment-valid-email").checked = criteria.has_valid_email !== false;
}

function renderSegmentPreview(response) {
  state.segmentPreview = response;
  $("#segment-account-count").textContent = Number(response.account_count || 0).toLocaleString("es-MX");
  $("#segment-contact-count").textContent = Number(response.contact_count || 0).toLocaleString("es-MX");
  const rows = [];
  for (const item of response.sample || []) {
    const contacts = item.contacts?.length ? item.contacts : [null];
    for (const contact of contacts) {
      rows.push(`<tr><td><strong>${escapeHtml(item.account?.shipper_name || "-")}</strong><small>${escapeHtml(item.account?.domain || "")}</small></td><td>${escapeHtml(item.account?.industry || "-")}</td><td>${escapeHtml((item.account?.logistics_fit || []).join(", ") || "-")}</td><td>${escapeHtml(contact?.contact_name || "Sin contacto")}</td><td>${escapeHtml(contact?.email || "-")}</td></tr>`);
    }
  }
  $("#segment-preview-body").innerHTML = rows.join("") || '<tr><td colspan="5" class="growth-empty-cell">No hay coincidencias con estos filtros.</td></tr>';
}

function renderSegments() {
  const body = $("#segments-table-body");
  body.innerHTML = state.segments.map((segment) => `<tr><td><strong>${escapeHtml(segment.name)}</strong></td><td><span class="growth-pill ${escapeHtml(segment.status)}">${escapeHtml(segment.status)}</span></td><td>${Number(segment.account_count || 0).toLocaleString("es-MX")}</td><td>${Number(segment.contact_count || 0).toLocaleString("es-MX")}</td><td>${escapeHtml(formatDate(segment.updated_at))}</td><td class="growth-actions-cell"><button type="button" data-create-campaign-segment="${escapeHtml(segment.id)}">Crear campaña</button><button class="secondary" type="button" data-use-segment="${escapeHtml(segment.id)}">Ver filtros</button><button class="secondary" type="button" data-archive-segment="${escapeHtml(segment.id)}">Archivar</button></td></tr>`).join("") || '<tr><td colspan="6" class="growth-empty-cell">Todavía no hay segmentos guardados.</td></tr>';
  body.querySelectorAll("[data-archive-segment]").forEach((button) => {
    const segment = state.segments.find((item) => item.id === button.dataset.archiveSegment);
    if (segment?.status !== "archived") return;
    const actions = button.closest(".growth-actions-cell");
    if (!actions) return;
    actions.innerHTML = '<button type="button">Restaurar</button><button class="secondary" type="button">Ver filtros</button>';
    const [restoreButton, viewButton] = actions.querySelectorAll("button");
    restoreButton.addEventListener("click", async () => {
      await restoreGrowthSegment(segment.id);
      await loadSegments();
      setGlobalStatus("Segmento restaurado y listo para una nueva campaña.", "success");
    });
    viewButton.addEventListener("click", async () => {
      fillSegmentForm(segment);
      renderSegmentPreview(await previewGrowthSegment(segment.criteria || {}));
    });
  });
  body.querySelectorAll("[data-create-campaign-segment]").forEach((button) => button.addEventListener("click", () => {
    const segment = state.segments.find((item) => item.id === button.dataset.createCampaignSegment);
    if (segment) startCampaignFromSegment(segment);
  }));
  body.querySelectorAll("[data-use-segment]").forEach((button) => button.addEventListener("click", async () => {
    const segment = state.segments.find((item) => item.id === button.dataset.useSegment);
    if (!segment) return;
    fillSegmentForm(segment);
    renderSegmentPreview(await previewGrowthSegment(segment.criteria || {}));
  }));
  body.querySelectorAll("[data-archive-segment]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("¿Archivar este segmento? Las campañas existentes conservarán su historial.")) return;
    await archiveGrowthSegment(button.dataset.archiveSegment);
    await loadSegments();
  }));
}

function updateSegmentOptions() {
  const select = $("#campaign-segment");
  const current = select.value;
  select.innerHTML = '<option value="">Selecciona un segmento</option>' + state.segments.filter((segment) => segment.status !== "archived").map((segment) => `<option value="${escapeHtml(segment.id)}">${escapeHtml(segment.name)} · ${Number(segment.contact_count || 0).toLocaleString("es-MX")} contactos</option>`).join("");
  const selectableSegmentIds = new Set(state.segments.filter((segment) => ["ready", "used"].includes(segment.status)).map((segment) => segment.id));
  [...select.options].forEach((option) => {
    if (option.value && !selectableSegmentIds.has(option.value)) option.remove();
  });
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function describeSegment(segment) {
  if (!segment) return "Selecciona un segmento listo.";
  return `${segment.name}: ${Number(segment.account_count || 0).toLocaleString("es-MX")} cuentas y ${Number(segment.contact_count || 0).toLocaleString("es-MX")} contactos. Preparación manual; sin envío automático.`;
}

function refreshCampaignSegmentSummary() {
  const segment = state.segments.find((item) => item.id === $("#campaign-segment").value);
  $("#campaign-segment-summary").textContent = describeSegment(segment);
  markCampaignDirty();
}

function startCampaignFromSegment(segment) {
  if (!["ready", "used"].includes(segment.status)) {
    setGlobalStatus("Marca el segmento como Ready o restáuralo antes de crear una campaña.", "error");
    return;
  }
  resetCampaign();
  activateView("campaigns");
  $("#campaign-segment").value = segment.id;
  $("#campaign-name").value = `${segment.name} - ${new Date().toLocaleDateString("en-CA")}`;
  refreshCampaignSegmentSummary();
  renderCampaignProgress();
  $("#campaign-name").focus();
  setGlobalStatus("Segmento seleccionado. Define el objetivo y prepara la campaña; Rateware no enviará mensajes.", "success");
}

async function loadSegments() {
  const response = await listGrowthSegments();
  state.segments = response.rows || [];
  renderSegments();
  updateSegmentOptions();
}

async function previewSegment() {
  renderSegmentPreview(await previewGrowthSegment(segmentCriteriaFromForm()));
}

async function saveSegment() {
  const name = clean($("#segment-name").value);
  if (!name) throw new Error("Escribe un nombre para el segmento.");
  const response = await saveGrowthSegment({ name, status: $("#segment-status").value, criteria: segmentCriteriaFromForm() });
  renderSegmentPreview({
    account_count: response.row?.account_count || 0,
    contact_count: response.row?.contact_count || 0,
    sample: (response.sample || []).map((item) => ({ account: item.account, contacts: item.contacts || [] }))
  });
  await loadSegments();
  setGlobalStatus("Segmento guardado sobre Shipper CRM.", "success");
}

function campaignChannels() {
  return $$('.growth-channel-options input:checked').map((input) => input.value);
}

function resetCampaign() {
  state.currentCampaignId = "";
  state.campaignDetail = null;
  state.campaignMemberFilter = "all";
  state.campaignMemberQuery = "";
  state.campaignDirty = false;
  state.campaignMessagesDirty = false;
  $("#campaign-name").value = "";
  $("#campaign-objective").value = "get_rfqs";
  $("#campaign-segment").value = "";
  $("#campaign-hook").value = "cross_border_operation_review";
  $$('.growth-channel-options input').forEach((input) => { input.checked = ["email", "linkedin", "call"].includes(input.value); });
  $("#campaign-segment-summary").textContent = describeSegment(null);
  $("#campaign-messages").innerHTML = '<p class="growth-empty-cell">Guarda primero objetivo, segmento y oferta.</p>';
  $("#campaign-export-summary").innerHTML = "";
  $("#campaign-next-action").textContent = "Guarda una campaña para ver el siguiente paso.";
  $("#campaign-member-preview").innerHTML = "";
  $("#campaign-member-count").textContent = "";
  $("#campaign-member-search").value = "";
  $("#campaign-member-guidance").textContent = "El CSV de ejecucion solo incluye contactos listos. Los demas quedan en revision o bloqueados.";
  $$('[data-campaign-member-filter]').forEach((button) => {
    const bucket = button.dataset.campaignMemberFilter || "all";
    button.classList.toggle("active", bucket === "all");
    button.textContent = `${CAMPAIGN_MEMBER_FILTER_LABELS[bucket] || bucket} 0`;
    button.title = `0 contacto(s) en ${CAMPAIGN_MEMBER_FILTER_LABELS[bucket] || bucket}.`;
  });
  $("#campaign-save-status").textContent = "Nueva campaña";
  $$(".growth-campaign-item").forEach((item) => item.classList.remove("active"));
  setCampaignStep(1);
}

function renderCampaignList() {
  const root = $("#campaign-list-body");
  root.innerHTML = state.campaigns.map((campaign) => `<button class="growth-campaign-item ${campaign.id === state.currentCampaignId ? "active" : ""}" type="button" data-campaign-id="${escapeHtml(campaign.id)}"><strong>${escapeHtml(campaign.name)}</strong><span>${escapeHtml(campaign.segment?.name || "Sin segmento")}</span><span><span class="growth-pill ${escapeHtml(campaign.status)}">${escapeHtml(campaign.status)}</span> · ${Number(campaign.member_counts?.total || 0).toLocaleString("es-MX")} contactos</span></button>`).join("") || '<p class="growth-empty-cell">Todavía no hay campañas.</p>';
  root.querySelectorAll("[data-campaign-id]").forEach((button) => button.addEventListener("click", () => openCampaign(button.dataset.campaignId)));
}

async function loadCampaigns() {
  const response = await listGrowthCampaigns();
  state.campaigns = response.rows || [];
  renderCampaignList();
  updateCampaignResultOptions();
}

function renderCampaignMessages(messages) {
  const root = $("#campaign-messages");
  root.innerHTML = (messages || []).map((message) => `<div class="growth-message-row" data-message-id="${escapeHtml(message.id || "")}" data-step-type="${escapeHtml(message.step_type)}" data-channel="${escapeHtml(message.channel)}" data-variant="${escapeHtml(message.variant || "A")}"><strong>${escapeHtml(STEP_LABELS[message.step_type] || message.step_type)}</strong><label><span>Asunto</span><input data-message-subject value="${escapeHtml(message.subject || "")}" ${message.channel === "email" ? "" : "disabled"} /></label><label><span>Contenido</span><textarea data-message-body>${escapeHtml(message.body || "")}</textarea></label></div>`).join("") || '<p class="growth-empty-cell">No hay mensajes configurados.</p>';
}

function campaignMemberBucket(member) {
  const status = clean(member?.status).toLowerCase();
  if (status === "ready") return "ready";
  if (["pending", "needs_review", "invalid"].includes(status)) return "review";
  if (["unsubscribed", "bounced", "do_not_contact", "excluded"].includes(status)) return "blocked";
  return "history";
}

function campaignConfiguredChannels(campaign) {
  const channels = (campaign?.channels || []).map((channel) => clean(channel).toLowerCase()).filter(Boolean);
  return channels.length ? channels : ["email"];
}

function campaignLinkedInUrl(contact) {
  return clean(contact?.linkedin_url || contact?.contact_linkedin);
}

function campaignMemberDeliveryPaths(campaign, contact) {
  const channels = campaignConfiguredChannels(campaign);
  const paths = [];
  const email = clean(contact?.email);
  for (const channel of channels) {
    if (channel === "email" && clean(contact?.email_quality).toLowerCase() === "valid" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) paths.push({ channel: "Email", destination: email });
    if (channel === "linkedin" && /^https?:\/\//i.test(campaignLinkedInUrl(contact))) paths.push({ channel: "LinkedIn", destination: campaignLinkedInUrl(contact) });
    if (channel === "call" && clean(contact?.phone)) paths.push({ channel: "Call", destination: clean(contact.phone) });
    if (channel === "whatsapp" && clean(contact?.phone)) paths.push({ channel: "WhatsApp", destination: clean(contact.phone) });
  }
  return paths;
}

function campaignMemberDeliveryChannels(campaign, contact) {
  return campaignMemberDeliveryPaths(campaign, contact).map((path) => path.channel);
}

function campaignMemberChannel(member, campaign) {
  const paths = campaignMemberDeliveryPaths(campaign, member?.contact || {});
  if (!paths.length) return "Sin canal habilitado";
  const [primary, ...alternatives] = paths;
  return `${primary.channel} · ${primary.destination}${alternatives.length ? ` (+${alternatives.length})` : ""}`;
}

function campaignMemberReason(member, campaign) {
  const status = clean(member?.status).toLowerCase();
  const contact = member?.contact || {};
  const account = member?.account || {};
  const deliveryChannels = campaignMemberDeliveryChannels(campaign, contact);
  if (status === "ready") return `Listo para exportar por ${deliveryChannels[0] || "canal"}`;
  if (status === "pending" || status === "needs_review") {
    if (clean(account.data_status).toLowerCase() === "excluded") return "Cuenta excluida por regla de segmento";
    if (!member?.contact_id && !contact?.id) return "La cuenta no tiene contacto vinculado";
    if (clean(contact.status).toLowerCase() === "inactive") return "Contacto inactivo en Shipper CRM";
    const requiredChannels = campaignConfiguredChannels(campaign).map((channel) => ({
      email: "email validado",
      call: "telefono",
      whatsapp: "telefono",
      linkedin: "LinkedIn valido"
    }[channel] || channel));
    return `Sin canal habilitado: requiere ${[...new Set(requiredChannels)].join(" o ")}`;
  }
  if (status === "bounced") return "Rebote registrado; no exportar";
  if (status === "unsubscribed") return "Baja solicitada; no contactar";
  if (status === "do_not_contact") return "Marcado como no contactar";
  if (status === "excluded") return "Excluido por regla de segmento";
  if (status === "exported") return "Ya incluido en un archivo exportado";
  if (status === "contacted") return "Contacto registrado; no reabrir audiencia";
  if (status === "replied") return "Respuesta registrada; gestionar en Resultados";
  if (status === "interested") return "Interesado; registrar siguiente acción";
  if (status === "not_interested") return "No interesado; conservar historial";
  if (status === "wrong_person") return "Contacto incorrecto; buscar reemplazo en CRM";
  if (status === "referral") return "Referido registrado; gestionar nuevo contacto";
  if (status === "send_info") return "Pidió información; registrar seguimiento";
  if (status === "meeting_booked") return "Reunión registrada; conservar historial";
  if (status === "rfq") return "RFQ registrado; conservar historial";
  if (status === "opportunity") return "Oportunidad creada en Shipper CRM";
  return "Sin accion pendiente";
}

function updateCampaignAudienceControls(members) {
  const filter = state.campaignMemberFilter;
  const counts = members.reduce((result, member) => {
    result[campaignMemberBucket(member)] += 1;
    return result;
  }, { ready: 0, review: 0, blocked: 0, history: 0 });
  $$('[data-campaign-member-filter]').forEach((button) => {
    const bucket = button.dataset.campaignMemberFilter || "all";
    const count = bucket === "all" ? members.length : counts[bucket] || 0;
    button.classList.toggle("active", bucket === filter);
    button.textContent = `${CAMPAIGN_MEMBER_FILTER_LABELS[bucket] || bucket} ${count.toLocaleString("es-MX")}`;
    button.title = `${count.toLocaleString("es-MX")} contacto(s) en ${CAMPAIGN_MEMBER_FILTER_LABELS[bucket] || bucket}.`;
  });
  const filtered = members.filter((member) => filter === "all" || campaignMemberBucket(member) === filter);
  const query = clean(state.campaignMemberQuery).toLowerCase();
  const queryFiltered = query ? filtered.filter((member) => [
    member.account?.shipper_name,
    member.account?.domain,
    member.contact?.contact_name,
    member.contact?.email,
    member.contact?.title
  ].filter(Boolean).join(" ").toLowerCase().includes(query)) : filtered;
  $("#campaign-member-count").textContent = query
    ? `${queryFiltered.length.toLocaleString("es-MX")} coincidencias de ${filtered.length.toLocaleString("es-MX")}`
    : `${filtered.length.toLocaleString("es-MX")} de ${members.length.toLocaleString("es-MX")} contactos`;
  const guidance = {
    all: "El CSV de ejecucion solo incluye contactos listos. Historiales y bloqueados se preservan fuera de la exportacion.",
    ready: "Estos contactos tienen una ruta de entrega valida y entraran al CSV de ejecucion.",
    review: "Estos contactos no entraran al CSV hasta corregir o validar su canal de entrega en Shipper CRM.",
    blocked: "Estos contactos quedan excluidos por rebote, baja o una regla de no contacto.",
    history: "Estos contactos ya tienen actividad o un resultado registrado. Actualizar CRM no los devuelve a la audiencia."
  };
  $("#campaign-member-guidance").textContent = guidance[filter] || guidance.all;
  return queryFiltered;
}

function renderCampaignMemberPreview(members) {
  const filteredMembers = updateCampaignAudienceControls(members);
  const campaign = state.campaignDetail?.campaign || {};
  $("#campaign-member-preview").innerHTML = filteredMembers.slice(0, 100).map((member) => `<tr><td><strong>${escapeHtml(member.account?.shipper_name || "-")}</strong><small>${escapeHtml(member.account?.domain || "")}</small></td><td>${escapeHtml(member.contact?.contact_name || "Sin contacto")}</td><td>${escapeHtml(campaignMemberChannel(member, campaign))}</td><td><span class="growth-pill ${escapeHtml(member.status)}">${escapeHtml(member.status)}</span></td><td>${escapeHtml(campaignMemberReason(member, campaign))}</td></tr>`).join("") || '<tr><td colspan="5" class="growth-empty-cell">No hay contactos en este estado.</td></tr>';
}

function campaignNextAction(campaign, readyMembers, reviewMembers, suppressedMembers, historyMembers) {
  const status = clean(campaign.status).toLowerCase() || "draft";
  if (!readyMembers && !reviewMembers && !suppressedMembers && historyMembers > 0 && !["exported", "launched"].includes(status)) {
    return "La audiencia solo conserva actividad historica. Crea una nueva campaña o ajusta el segmento para encontrar contactos sin gestionar.";
  }
  if (status === "launched") return "Siguiente paso: registra las respuestas, rebotes o solicitudes en Resultados. La ejecución externa ya quedó marcada.";
  if (status === "exported") return "Siguiente paso: ejecuta el CSV fuera de Rateware y, cuando termine la salida, marca la campaña como lanzada.";
  if (readyMembers > 0) return `${readyMembers.toLocaleString("es-MX")} contacto(s) están listos. Exporta la audiencia CSV para ejecutar la campaña fuera de Rateware.`;
  if (reviewMembers > 0) return "Actualiza la audiencia desde CRM para revalidar contactos pendientes. Si siguen en revisión, descarga el archivo y corrige sus datos de entrega.";
  if (suppressedMembers > 0) return "La audiencia quedó bloqueada por bajas, rebotes o reglas de no contacto. Revisa los contactos antes de volver a segmentar.";
  return "La campaña no tiene contactos exportables. Ajusta el segmento o completa datos de contacto en Shipper CRM.";
}

function renderCampaignSummary() {
  const detail = state.campaignDetail;
  if (!detail) return;
  const campaign = detail.campaign || {};
  const members = detail.members || [];
  $("#campaign-export-summary").innerHTML = [
    ["Campaña", campaign.name || "-"],
    ["Segmento", campaign.segment?.name || "-"],
    ["Contactos", members.length.toLocaleString("es-MX")],
    ["Canales", (campaign.channels || []).join(", ") || "email"],
    ["Estado", campaign.status || "draft"],
    ["Ejecución", "Exportación CSV manual"]
  ].map(([label, value]) => `<div>${escapeHtml(label)}<strong>${escapeHtml(value)}</strong></div>`).join("");
  const readyMembers = members.filter((member) => member.status === "ready").length;
  const reviewMembers = members.filter((member) => ["pending", "needs_review", "invalid"].includes(member.status)).length;
  const suppressedMembers = members.filter((member) => ["unsubscribed", "bounced", "do_not_contact", "excluded"].includes(member.status)).length;
  const historyMembers = members.filter((member) => campaignMemberBucket(member) === "history").length;
  const preferredChannelCounts = members.filter((member) => member.status === "ready").reduce((counts, member) => {
    const channel = campaignMemberDeliveryPaths(campaign, member.contact || {})[0]?.channel;
    if (channel) counts[channel] = (counts[channel] || 0) + 1;
    return counts;
  }, {});
  const channelCoverage = Object.entries(preferredChannelCounts).map(([channel, count]) => `${channel} ${count}`).join(" · ") || "Sin ruta valida";
  $("#campaign-export-summary").insertAdjacentHTML("beforeend", [
    ["Listos para exportar", readyMembers.toLocaleString("es-MX")],
    ["Canal de ejecucion", channelCoverage],
    ["Requieren revisión", reviewMembers.toLocaleString("es-MX")],
    ["Bajas / bloqueados", suppressedMembers.toLocaleString("es-MX")]
  ].map(([label, value]) => `<div>${escapeHtml(label)}<strong>${escapeHtml(value)}</strong></div>`).join(""));
  $("#campaign-export-summary").insertAdjacentHTML("beforeend", `<div>Historial protegido<strong>${historyMembers.toLocaleString("es-MX")}</strong></div>`);
  $("#campaign-next-action").textContent = campaignNextAction(campaign, readyMembers, reviewMembers, suppressedMembers, historyMembers);
  renderCampaignMemberPreview(members);
  const campaignStatus = clean(campaign.status).toLowerCase() || "draft";
  const exportButton = $("#export-campaign-button");
  const launchedButton = $("#mark-campaign-launched-button");
  const resultsButton = $("#open-campaign-results-button");
  const refreshAudienceButton = $("#refresh-campaign-audience-button");
  exportButton.disabled = readyMembers === 0 || campaignStatus === "launched";
  exportButton.title = exportButton.disabled ? (campaignStatus === "launched" ? "La campaña ya fue marcada como lanzada." : "No hay contactos listos para exportar.") : "Descarga la audiencia lista para ejecución externa.";
  launchedButton.disabled = campaignStatus !== "exported";
  launchedButton.title = launchedButton.disabled ? (campaignStatus === "launched" ? "La campaña ya fue marcada como lanzada." : "Exporta primero la audiencia CSV.") : "Registra que la ejecución externa fue lanzada.";
  resultsButton.classList.toggle("hidden", campaignStatus !== "launched");
  resultsButton.disabled = campaignStatus !== "launched";
  refreshAudienceButton.disabled = !campaign.id;
  refreshAudienceButton.title = refreshAudienceButton.disabled
    ? "Guarda una campaña antes de actualizar la audiencia."
    : "Revalida solo contactos pendientes contra Shipper CRM. No altera exportados, respuestas, bajas ni rebotes.";
}

async function openCampaign(id) {
  state.currentCampaignId = id;
  state.campaignMemberFilter = "all";
  state.campaignMemberQuery = "";
  state.campaignDirty = false;
  state.campaignMessagesDirty = false;
  state.campaignDetail = await getGrowthCampaign(id);
  const campaign = state.campaignDetail.campaign || {};
  $("#campaign-name").value = campaign.name || "";
  $("#campaign-objective").value = campaign.objective || "get_rfqs";
  $("#campaign-segment").value = campaign.segment_id || "";
  $("#campaign-hook").value = campaign.offer_hook || "cross_border_operation_review";
  $$('.growth-channel-options input').forEach((input) => { input.checked = (campaign.channels || []).includes(input.value); });
  $("#campaign-segment-summary").textContent = campaign.segment ? describeSegment(campaign.segment) : "Segmento no disponible.";
  $("#campaign-save-status").textContent = `Guardada · ${formatDate(campaign.updated_at)}`;
  $("#campaign-member-search").value = "";
  renderCampaignMessages(state.campaignDetail.messages);
  renderCampaignSummary();
  renderCampaignList();
  setCampaignStep(1);
}

async function persistCampaign() {
  const name = clean($("#campaign-name").value);
  const segmentId = $("#campaign-segment").value;
  if (!name) throw new Error("Escribe un nombre para la campaña.");
  if (!segmentId) throw new Error("Selecciona un segmento guardado.");
  const response = await saveGrowthCampaign({
    id: state.currentCampaignId || undefined,
    name,
    objective: $("#campaign-objective").value,
    segment_id: segmentId,
    offer_hook: $("#campaign-hook").value,
    channels: campaignChannels(),
    status: state.campaignDetail?.campaign?.status || "draft"
  });
  state.currentCampaignId = response.row.id;
  state.campaignDirty = false;
  await Promise.all([loadCampaigns(), openCampaign(response.row.id)]);
  return response;
}

async function persistCampaignMessages() {
  if (!state.currentCampaignId) throw new Error("Guarda primero la campaña.");
  const rows = $$(".growth-message-row");
  for (const row of rows) {
    await saveGrowthMessage({
      campaign_id: state.currentCampaignId,
      step_type: row.dataset.stepType,
      channel: row.dataset.channel,
      variant: row.dataset.variant || "A",
      subject: row.querySelector("[data-message-subject]")?.value || "",
      body: row.querySelector("[data-message-body]")?.value || ""
    });
  }
  state.campaignDetail = await getGrowthCampaign(state.currentCampaignId);
  state.campaignMessagesDirty = false;
  renderCampaignMessages(state.campaignDetail.messages);
  renderCampaignSummary();
}

async function moveCampaignForward() {
  if (state.campaignStep === 1) {
    if (!clean($("#campaign-name").value)) throw new Error("Escribe un nombre para continuar.");
    setCampaignStep(2);
    return;
  }
  if (state.campaignStep === 2) {
    if (!$("#campaign-segment").value) throw new Error("Selecciona un segmento para continuar.");
    setCampaignStep(3);
    return;
  }
  if (state.campaignStep === 3) {
    await persistCampaign();
    setCampaignStep(4);
    $("#campaign-save-status").textContent = "Campaña y audiencia guardadas";
    return;
  }
  if (state.campaignStep === 4) {
    await persistCampaignMessages();
    setCampaignStep(5);
    $("#campaign-save-status").textContent = "Mensajes guardados; listo para exportar";
  }
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(rows, filename) {
  const csv = `\uFEFF${EXPORT_COLUMNS.map(csvCell).join(",")}\r\n${rows.map((row) => EXPORT_COLUMNS.map((column) => csvCell(row[column])).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "growth-campaign.csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadMessageCsv(rows, filename) {
  const columns = ["step", "channel", "variant", "subject", "message"];
  const csv = `\uFEFF${columns.map(csvCell).join(",")}\r\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadCampaignReview() {
  const campaign = state.campaignDetail?.campaign || {};
  const rows = (state.campaignDetail?.members || []).filter((member) => ["review", "blocked"].includes(campaignMemberBucket(member))).map((member) => ({
    campaign_name: campaign.name || "",
    account_name: member.account?.shipper_name || "",
    domain: member.account?.domain || "",
    contact_name: member.contact?.contact_name || "",
    email: member.contact?.email || "",
    phone: member.contact?.phone || "",
    linkedin_url: campaignLinkedInUrl(member.contact),
    status: member.status || "",
    reason: campaignMemberReason(member, campaign)
  }));
  if (!rows.length) throw new Error("No hay contactos pendientes o bloqueados para descargar.");
  const columns = ["campaign_name", "account_name", "domain", "contact_name", "email", "phone", "linkedin_url", "status", "reason"];
  const csv = `\uFEFF${columns.map(csvCell).join(",")}\r\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\r\n")}`;
  const slug = clean(campaign.name).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "growth-campaign";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug}-audience-review.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  $("#campaign-save-status").textContent = `${rows.length.toLocaleString("es-MX")} contactos descargados para revision; no se envio ningun mensaje`;
}

async function downloadCampaignMessages() {
  if (!state.currentCampaignId) throw new Error("Guarda una campaña antes de descargar sus mensajes.");
  await persistCampaignMessages();
  const campaign = state.campaignDetail?.campaign || {};
  const rows = (state.campaignDetail?.messages || []).map((message) => ({
    step: STEP_LABELS[message.step_type] || message.step_type,
    channel: message.channel || "",
    variant: message.variant || "A",
    subject: message.subject || "",
    message: message.body || ""
  }));
  if (!rows.length) throw new Error("La campaña todavía no tiene mensajes para descargar.");
  const slug = clean(campaign.name).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "growth-campaign";
  downloadMessageCsv(rows, `${slug}-messages.csv`);
  $("#campaign-save-status").textContent = `${rows.length} mensajes descargados; no se envió ningún mensaje`;
}

async function refreshCampaignAudience() {
  if (!state.currentCampaignId) throw new Error("Guarda una campaña antes de actualizar su audiencia.");
  const response = await refreshGrowthCampaignAudience(state.currentCampaignId);
  state.campaignDetail = await getGrowthCampaign(state.currentCampaignId);
  renderCampaignSummary();
  await Promise.all([loadCampaigns(), loadDashboard()]);
  const updated = Number(response.updated || 0);
  const ready = Number(response.ready || 0);
  const review = Number(response.review || 0);
  const preserved = Number(response.preserved || 0);
  $("#campaign-save-status").textContent = `Audiencia actualizada: ${ready.toLocaleString("es-MX")} lista(s), ${review.toLocaleString("es-MX")} en revisión y ${preserved.toLocaleString("es-MX")} historial(es) preservado(s)${updated ? `; ${updated.toLocaleString("es-MX")} estado(s) actualizado(s)` : ""}.`;
}

async function markCampaignLaunched() {
  if (!state.currentCampaignId) throw new Error("Guarda una campaña antes de marcarla como lanzada.");
  const status = state.campaignDetail?.campaign?.status || "draft";
  if (!['exported', 'launched'].includes(status)) throw new Error("Exporta primero el archivo de ejecución para conservar una audiencia auditable.");
  if (status === "launched") return;
  if (!window.confirm("Esto solo registrará que la campaña fue lanzada fuera de Rateware. No se enviará ningún mensaje. ¿Continuar?")) return;
  await setGrowthCampaignStatus(state.currentCampaignId, "launched");
  state.campaignDetail = await getGrowthCampaign(state.currentCampaignId);
  renderCampaignSummary();
  await Promise.all([loadCampaigns(), loadDashboard(), loadResults()]);
  $("#campaign-save-status").textContent = "Campaña marcada como lanzada; ejecución externa, sin envío automático";
}

async function openCampaignResults() {
  if (!state.currentCampaignId) throw new Error("Guarda una campaña antes de registrar resultados.");
  activateView("results");
  updateCampaignResultOptions();
  $("#result-campaign").value = state.currentCampaignId;
  await loadResultCampaignMembers(state.currentCampaignId);
  $("#result-member-search").focus();
  setGlobalStatus("Campaña cargada en Resultados. Busca la cuenta o contacto para registrar su señal.", "success");
}

async function exportCurrentCampaign() {
  if (!state.currentCampaignId) throw new Error("Guarda una campaña antes de exportarla.");
  await persistCampaignMessages();
  const response = await exportGrowthCampaign(state.currentCampaignId);
  downloadCsv(response.rows || [], response.filename);
  const suppressed = Number(response.suppressed_count || 0);
  const review = Number(response.review_count || 0);
  $("#campaign-save-status").textContent = `${Number(response.exported_count || 0).toLocaleString("es-MX")} contactos exportados${suppressed ? `; ${suppressed.toLocaleString("es-MX")} baja(s) o rebote(s) excluidos` : ""}; no se envió ningún mensaje`;
  if (review) $("#campaign-save-status").textContent = `${Number(response.exported_count || 0).toLocaleString("es-MX")} contactos exportados; ${review.toLocaleString("es-MX")} requieren revisión${suppressed ? `; ${suppressed.toLocaleString("es-MX")} bajas o bloqueos excluidos` : ""}. No se envió ningún mensaje.`;
  await Promise.all([loadCampaigns(), loadDashboard(), loadResults()]);
  state.campaignDetail = await getGrowthCampaign(state.currentCampaignId);
  renderCampaignSummary();
}

function renderAiOutput(response) {
  const recommendations = response.recommendations || [];
  const primary = response.output || response.next_action || response.outcome || response.campaign?.name || "Revisa la sugerencia antes de aplicarla.";
  $("#growth-ai-output").innerHTML = `<h3>${escapeHtml(response.title || "Sugerencia")}</h3><p>${escapeHtml(primary)}</p>${response.campaign ? `<dl><dt>Objetivo</dt><dd>${escapeHtml(response.campaign.objective || "-")}</dd><dt>Hook</dt><dd>${escapeHtml(response.campaign.offer_hook || "-")}</dd></dl>` : ""}${recommendations.length ? `<ul>${recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}<p class="growth-safety-note">Modo: ${escapeHtml(response.mode || "rules_mvp")}. AI propone; el usuario confirma.</p>`;
}

async function runAiAction(button) {
  const text = clean($("#growth-ai-input").value);
  const response = await runGrowthAiAction(button.dataset.aiAction, { text, context: { text, last_response: text } });
  $$("[data-ai-action]").forEach((item) => item.classList.toggle("active", item === button));
  renderAiOutput(response);
}

function updateCampaignResultOptions() {
  const campaignOptions = '<option value="">Selecciona una campaña</option>' + state.campaigns.map((campaign) => `<option value="${escapeHtml(campaign.id)}">${escapeHtml(campaign.name)}</option>`).join("");
  for (const selector of ["#result-campaign", "#results-campaign-filter"]) {
    const select = $(selector);
    if (!select) continue;
    const current = select.value;
    select.innerHTML = selector === "#results-campaign-filter" ? campaignOptions.replace("Selecciona una campaña", "Todas las campañas") : campaignOptions;
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }
}

async function loadResultCampaignMembers(campaignId) {
  const select = $("#result-member");
  const search = $("#result-member-search");
  const count = $("#result-member-count");
  state.resultMemberQuery = "";
  if (search) {
    search.value = "";
    search.disabled = !campaignId;
  }
  select.innerHTML = '<option value="">Cargando contactos...</option>';
  if (!campaignId) {
    state.resultCampaignDetail = null;
    select.innerHTML = '<option value="">Selecciona una cuenta o contacto</option>';
    if (count) count.textContent = "Selecciona una campaña para buscar contactos.";
    renderResultMemberSummary();
    return;
  }
  state.resultCampaignDetail = await getGrowthCampaign(campaignId);
  renderResultCampaignMembers();
}

function resultMemberLabel(member) {
  return `${member.account?.shipper_name || "Cuenta"} · ${member.contact?.contact_name || member.contact?.email || "Sin contacto"}`;
}

function renderResultCampaignMembers({ preserveSelection = true } = {}) {
  const select = $("#result-member");
  const count = $("#result-member-count");
  const previousValue = preserveSelection ? select.value : "";
  const actionableMembers = (state.resultCampaignDetail?.members || []).filter((member) => !["unsubscribed", "bounced", "do_not_contact", "excluded"].includes(member.status));
  const query = normalize(state.resultMemberQuery);
  const matches = query ? actionableMembers.filter((member) => normalize([
    member.account?.shipper_name,
    member.account?.domain,
    member.contact?.contact_name,
    member.contact?.email,
    member.contact?.title
  ].filter(Boolean).join(" ")).includes(query)) : actionableMembers;
  if (!actionableMembers.length) {
    select.innerHTML = '<option value="">No hay contactos accionables en esta campaña</option>';
    if (count) count.textContent = "Esta campaña no tiene contactos disponibles para registrar resultados.";
    renderResultMemberSummary();
    return;
  }
  select.innerHTML = `<option value="">${matches.length ? "Selecciona una cuenta o contacto" : "No hay coincidencias"}</option>` + matches.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(resultMemberLabel(member))}</option>`).join("");
  if (previousValue && matches.some((member) => member.id === previousValue)) select.value = previousValue;
  if (count) count.textContent = query
    ? `${matches.length.toLocaleString("es-MX")} de ${actionableMembers.length.toLocaleString("es-MX")} contactos coinciden.`
    : `${actionableMembers.length.toLocaleString("es-MX")} contactos disponibles. Busca por cuenta, contacto o correo.`;
  renderResultMemberSummary();
}

function renderResultMemberSummary() {
  const summary = $("#result-member-summary");
  if (!summary) return;
  const memberId = $("#result-member")?.value || "";
  const member = (state.resultCampaignDetail?.members || []).find((item) => item.id === memberId);
  if (!member) {
    summary.classList.add("hidden");
    summary.innerHTML = "";
    return;
  }

  const campaign = state.resultCampaignDetail?.campaign || {};
  const account = member.account || {};
  const contact = member.contact || {};
  const delivery = campaignMemberDeliveryPaths(campaign, contact)[0];
  const signals = (state.results.rows || [])
    .filter((row) => row.campaign_id === campaign.id && row.campaign_member_id === member.id)
    .slice()
    .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
  const latest = signals[0];
  const memberStatus = clean(member.status) || "ready";

  summary.classList.remove("hidden");
  summary.innerHTML = `
    <div class="growth-result-member-summary-heading">
      <div><span>Contacto seleccionado</span><strong>${escapeHtml(account.shipper_name || "Cuenta")}</strong><small>${escapeHtml(contact.contact_name || contact.email || "Sin contacto")}</small></div>
      <span class="growth-pill">${escapeHtml(memberStatus)}</span>
    </div>
    <dl>
      <div><dt>Canal</dt><dd>${escapeHtml(delivery ? `${delivery.channel} · ${delivery.destination}` : "Sin canal validado")}</dd></div>
      <div><dt>Señales</dt><dd>${signals.length ? `${signals.length} registrada${signals.length === 1 ? "" : "s"}` : "Sin señales previas"}</dd></div>
      <div><dt>Última</dt><dd>${escapeHtml(latest ? `${RESULT_LABELS[latest.outcome] || latest.outcome} · ${formatDate(latest.created_at)}` : campaignMemberReason(member, campaign))}</dd></div>
    </dl>`;
}

const RESULT_LABELS = {
  replied: "Respondió",
  interested: "Interesado",
  not_interested: "No interesado",
  wrong_person: "Contacto incorrecto",
  referral: "Referido",
  send_info: "Enviar información",
  meeting_booked: "Reunión agendada",
  rfq_received: "RFQ recibido",
  opportunity_created: "Oportunidad creada",
  no_response: "Sin respuesta",
  unsubscribe: "Do not contact",
  bounce: "Rebote"
};

const RESULT_NEXT_ACTIONS = {
  replied: "Revisar respuesta y confirmar interés",
  interested: "Agendar llamada de discovery",
  not_interested: "Mover a recuperación en 90 días",
  wrong_person: "Solicitar al contacto responsable",
  referral: "Agregar y contactar al referido",
  send_info: "Enviar información y confirmar recepción",
  meeting_booked: "Preparar la reunión",
  rfq_received: "Revisar alcance y crear RFQ",
  no_response: "Reintentar por el canal más relevante",
  unsubscribe: "No contactar de nuevo",
  bounce: "Validar o reemplazar el correo"
};

const CONVERTIBLE_RESULT_OUTCOMES = new Set(["replied", "interested", "referral", "send_info", "meeting_booked", "rfq_received"]);
const CLOSED_RESULT_OUTCOMES = new Set(["not_interested", "unsubscribe", "bounce"]);

function syncResultNextActionSuggestion({ force = false } = {}) {
  const outcome = $("#result-outcome")?.value || "";
  const nextAction = $("#result-next-action");
  const guide = $("#result-outcome-guide");
  if (!nextAction || !guide) return;

  const suggestion = RESULT_NEXT_ACTIONS[outcome] || "";
  const current = clean(nextAction.value);
  const previousSuggestion = clean(nextAction.dataset.suggestedAction || "");
  if (force || !current || current === previousSuggestion) nextAction.value = suggestion;
  nextAction.dataset.suggestedAction = suggestion;
  nextAction.placeholder = suggestion || "Ej. Agendar discovery call";

  if (outcome === "unsubscribe") {
    guide.textContent = "Este contacto quedará fuera de nuevas campañas. No se envía nada ni se crea una tarea automáticamente.";
    return;
  }
  if (outcome === "bounce") {
    guide.textContent = "Sugerencia editable: valida o reemplaza el correo antes de volver a incluir este contacto.";
    return;
  }
  if (outcome === "not_interested") {
    guide.textContent = "Sugerencia editable: conserva la señal y programa una recuperación solo si corresponde.";
    return;
  }
  guide.textContent = suggestion
    ? `Sugerencia editable: ${suggestion}. Confírmala o modifícala antes de guardar.`
    : "Define el siguiente paso antes de guardar.";
}

function resultBucket(row) {
  if (CLOSED_RESULT_OUTCOMES.has(row.outcome)) return "closed";
  if (CONVERTIBLE_RESULT_OUTCOMES.has(row.outcome) && !row.converted_opportunity_id && !row.converted_rfi_id) return "convertible";
  return "follow_up";
}

function updateResultControls(rows) {
  const filtered = state.resultFilter === "all" ? rows : rows.filter((row) => resultBucket(row) === state.resultFilter);
  const count = $("#results-row-count");
  if (count) count.textContent = `${filtered.length.toLocaleString("es-MX")} de ${rows.length.toLocaleString("es-MX")} señales`;
  const guide = $("#results-filter-guide");
  if (guide) {
    guide.textContent = {
      all: "El historial conserva cada señal. Las métricas superiores reflejan el estado más reciente de cada contacto.",
      follow_up: "Registra el siguiente movimiento sin perder el contexto anterior del contacto.",
      convertible: "Estas señales pueden abrir una oportunidad o un RFQ en Shipper CRM cuando el usuario confirme.",
      closed: "Contactos cerrados o suprimidos. No se exportarán en nuevas campañas hasta corregirlos o restaurarlos."
    }[state.resultFilter] || "";
  }
  $$('[data-result-filter]').forEach((button) => button.classList.toggle("active", button.dataset.resultFilter === state.resultFilter));
  return filtered;
}

function renderResults() {
  const metrics = state.results.metrics || {};
  const metricMap = {
    exported: metrics.contacts_exported,
    responses: metrics.responses,
    interested: metrics.interested,
    referrals: metrics.referrals,
    meetings: metrics.meetings,
    rfqs: metrics.rfqs,
    opportunities: metrics.opportunities,
    suppressed: metrics.suppressed
  };
  for (const [key, value] of Object.entries(metricMap)) {
    const element = $(`#result-metric-${key}`);
    if (element) element.textContent = Number(value || 0).toLocaleString("es-MX");
  }
  const rows = updateResultControls(state.results.rows || []);
  $("#results-table-body").innerHTML = rows.map((row) => {
    const converted = row.converted_opportunity_id || row.converted_rfi_id;
    const actions = `<button class="secondary" type="button" data-follow-up-result="${escapeHtml(row.id)}">Seguimiento</button>${converted ? '<span class="growth-pill launched">Convertido</span>' : CONVERTIBLE_RESULT_OUTCOMES.has(row.outcome) ? `<button type="button" data-convert-result="${escapeHtml(row.id)}" data-conversion="opportunity">Oportunidad</button><button class="secondary" type="button" data-convert-result="${escapeHtml(row.id)}" data-conversion="rfq">RFQ</button>` : '<span class="growth-muted">Sin conversión</span>'}`;
    return `<tr><td><strong>${escapeHtml(row.account?.shipper_name || "-")}</strong><small>${escapeHtml(row.contact?.contact_name || row.contact?.email || "Sin contacto")}</small></td><td>${escapeHtml(row.campaign?.name || "-")}</td><td><span class="growth-pill ${escapeHtml(row.outcome)}">${escapeHtml(RESULT_LABELS[row.outcome] || row.outcome.replace(/_/g, " "))}</span></td><td>${escapeHtml(row.next_action || "-")}<small>${escapeHtml(row.follow_up_at ? formatDate(row.follow_up_at) : "")}</small></td><td>${escapeHtml(formatDate(row.created_at))}</td><td class="growth-actions-cell">${actions}</td></tr>`;
  }).join("") || '<tr><td colspan="6" class="growth-empty-cell">Todavía no hay respuestas registradas.</td></tr>';
  $$('[data-follow-up-result]').forEach((button) => button.addEventListener("click", () => prepareResultFollowUp(button.dataset.followUpResult).catch((error) => setGlobalStatus(errorMessage(error), "error"))));
  $$("[data-convert-result]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm(`¿Crear ${button.dataset.conversion === "rfq" ? "un RFQ" : "una oportunidad"} desde este resultado?`)) return;
    try {
      await withBusy(button, "Creando...", () => convertGrowthResult(button.dataset.convertResult, button.dataset.conversion));
      await Promise.all([loadResults(), loadDashboard()]);
      setGlobalStatus("Conversión creada en el mismo Shipper CRM.", "success");
    } catch (error) {
      setGlobalStatus(errorMessage(error), "error");
    }
  }));
}

async function prepareResultFollowUp(resultId) {
  const result = (state.results.rows || []).find((row) => row.id === resultId);
  if (!result?.campaign_id || !result?.campaign_member_id) throw new Error("No hay contexto de campaña para registrar este seguimiento.");
  $("#result-campaign").value = result.campaign_id;
  await loadResultCampaignMembers(result.campaign_id);
  $("#result-member").value = result.campaign_member_id;
  renderResultMemberSummary();
  $("#result-outcome").value = "replied";
  $("#result-notes").value = "";
  $("#result-next-action").value = result.next_action || "";
  $("#result-next-action").dataset.suggestedAction = "";
  $("#result-follow-up").value = "";
  syncResultNextActionSuggestion();
  $("#result-notes").focus();
  $(".growth-result-entry")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  setGlobalStatus("Registrarás un nuevo seguimiento. El resultado anterior se conserva en la bitácora.", "success");
}

async function loadResults(campaignId = $("#results-campaign-filter")?.value || "") {
  state.results = await listGrowthResults(campaignId);
  renderResults();
}

async function saveResult() {
  const campaignId = $("#result-campaign").value;
  const memberId = $("#result-member").value;
  const member = (state.resultCampaignDetail?.members || []).find((item) => item.id === memberId);
  if (!campaignId || !member) throw new Error("Selecciona una campaña y un contacto.");
  await recordGrowthResult({
    campaign_id: campaignId,
    campaign_member_id: member.id,
    shipper_id: member.shipper_id,
    contact_id: member.contact_id,
    outcome: $("#result-outcome").value,
    notes: clean($("#result-notes").value),
    next_action: clean($("#result-next-action").value),
    follow_up_at: $("#result-follow-up").value ? new Date($("#result-follow-up").value).toISOString() : null
  });
  $("#result-notes").value = "";
  $("#result-next-action").value = "";
  $("#result-follow-up").value = "";
  await Promise.all([loadResults(), loadDashboard(), loadCampaigns()]);
  setGlobalStatus("Resultado registrado y vinculado al Shipper CRM.", "success");
}

function renderDashboard(response) {
  const metrics = response.metrics || {};
  for (const key of ["shippers", "ready", "segments", "campaigns", "responses", "rfqs", "opportunities"]) {
    const element = $(`#growth-metric-${key}`);
    if (element) element.textContent = Number(metrics[key] || 0).toLocaleString("es-MX");
    $$(`[data-growth-source-metric="${key}"]`).forEach((metric) => {
      metric.textContent = Number(metrics[key] || 0).toLocaleString("es-MX");
    });
  }
}

async function loadDashboard() {
  renderDashboard(await loadGrowthDashboard());
}

function bindEvents() {
  $("#growth-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-growth-view]");
    if (button) activateView(button.dataset.growthView);
  });
  $$('[data-open-view]').forEach((button) => button.addEventListener("click", () => activateView(button.dataset.openView)));
  const openCrmAudience = (button) => withBusy(button, "Consultando...", async () => {
    activateView("segments");
    await previewSegment();
  }).catch((error) => setGlobalStatus(errorMessage(error), "error"));
  for (const selector of ["#open-crm-audience-button", "#dashboard-crm-audience-button"]) {
    $(selector)?.addEventListener("click", (event) => openCrmAudience(event.currentTarget));
  }
  for (const selector of ["#dashboard-import-button", "#segments-import-button"]) {
    $(selector)?.addEventListener("click", () => {
      activateView("dashboard");
      $("#growth-import-panel").classList.remove("hidden");
      setImportStep(1);
      $("#growth-import-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  $("#close-import-button").addEventListener("click", () => $("#growth-import-panel").classList.add("hidden"));
  $("#read-growth-csv").addEventListener("click", (event) => withBusy(event.currentTarget, "Leyendo...", readSelectedCsv).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $$('[data-import-back]').forEach((button) => button.addEventListener("click", () => setImportStep(button.dataset.importBack)));
  $("#review-growth-import").addEventListener("click", () => {
    try {
      const rows = renderImportReview();
      if (!rows.length) throw new Error("Mapea al menos una cuenta, dominio, email o ID externo.");
      setImportStep(3);
    } catch (error) {
      setGlobalStatus(errorMessage(error), "error");
    }
  });
  $("#confirm-growth-import").addEventListener("click", (event) => withBusy(event.currentTarget, "Importando...", confirmImport).catch((error) => {
    const result = $("#growth-import-result");
    result.className = "growth-result-banner error";
    result.textContent = errorMessage(error);
  }));

  $("#preview-segment-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Consultando...", previewSegment).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#save-segment-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Guardando...", saveSegment).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#refresh-segments-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Actualizando...", loadSegments).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#clear-segment-filters").addEventListener("click", () => fillSegmentForm(null));

  $("#new-campaign-button").addEventListener("click", resetCampaign);
  $("#refresh-campaigns-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Actualizando...", loadCampaigns).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#campaign-segment").addEventListener("change", refreshCampaignSegmentSummary);
  ["#campaign-name", "#campaign-objective", "#campaign-hook"].forEach((selector) => {
    $(selector).addEventListener("input", markCampaignDirty);
    $(selector).addEventListener("change", markCampaignDirty);
  });
  $$(".growth-channel-options input").forEach((input) => input.addEventListener("change", markCampaignDirty));
  $("#campaign-messages").addEventListener("input", () => {
    state.campaignMessagesDirty = true;
    renderCampaignProgress();
  });
  $("#campaign-next-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Guardando...", moveCampaignForward).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#campaign-back-button").addEventListener("click", () => setCampaignStep(state.campaignStep - 1));
  $("#campaign-stepper").addEventListener("click", (event) => {
    const button = event.target.closest("[data-campaign-step]");
    if (!button) return;
    const step = Number(button.dataset.campaignStep);
    if (step <= state.campaignStep || state.currentCampaignId) setCampaignStep(step);
  });
  $("#export-campaign-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Preparando CSV...", exportCurrentCampaign).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#download-campaign-messages-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Preparando...", downloadCampaignMessages).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#download-campaign-review-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Preparando...", downloadCampaignReview).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#refresh-campaign-audience-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Revalidando...", refreshCampaignAudience).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#mark-campaign-launched-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Actualizando...", markCampaignLaunched).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#open-campaign-results-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Abriendo...", openCampaignResults).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $$('[data-campaign-member-filter]').forEach((button) => button.addEventListener("click", () => {
    state.campaignMemberFilter = button.dataset.campaignMemberFilter || "all";
    renderCampaignMemberPreview(state.campaignDetail?.members || []);
  }));
  $("#campaign-member-search").addEventListener("input", (event) => {
    state.campaignMemberQuery = event.target.value;
    renderCampaignMemberPreview(state.campaignDetail?.members || []);
  });

  $$('[data-ai-action]').forEach((button) => button.addEventListener("click", () => withBusy(button, "Analizando...", () => runAiAction(button)).catch((error) => setGlobalStatus(errorMessage(error), "error"))));

  $("#result-campaign").addEventListener("change", (event) => loadResultCampaignMembers(event.target.value).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#result-member").addEventListener("change", () => {
    renderResultMemberSummary();
    syncResultNextActionSuggestion();
  });
  $("#result-outcome").addEventListener("change", () => syncResultNextActionSuggestion());
  $("#result-member-search").addEventListener("input", (event) => {
    state.resultMemberQuery = event.target.value;
    renderResultCampaignMembers();
  });
  $("#save-result-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Guardando...", saveResult).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#refresh-results-button").addEventListener("click", (event) => withBusy(event.currentTarget, "Actualizando...", () => loadResults()).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $("#results-campaign-filter").addEventListener("change", (event) => loadResults(event.target.value).catch((error) => setGlobalStatus(errorMessage(error), "error")));
  $$('[data-result-filter]').forEach((button) => button.addEventListener("click", () => {
    state.resultFilter = button.dataset.resultFilter || "all";
    renderResults();
  }));
}

async function initialize() {
  bindEvents();
  fillSegmentForm(null);
  resetCampaign();
  activateView(window.location.hash.replace("#", "") || "dashboard");
  await Promise.all([loadDashboard(), loadSegments(), loadCampaigns(), loadResults()]);
  setGlobalStatus("Growth Hacking listo. Shipper CRM es la fuente principal; los CSV nuevos se integran primero al CRM.", "success");
}

initAuthControls();
requirePrivatePage()
  .then(initialize)
  .catch((error) => setGlobalStatus(errorMessage(error), "error"));
