import { SUPABASE_URL } from "./config.js";

const title = document.querySelector("#carrier-profile-title");
const card = document.querySelector("#carrier-profile-card");
const statusMessage = document.querySelector("#carrier-profile-status");
const pageEyebrow = document.querySelector("#carrier-profile-eyebrow");

const LANGUAGE_KEY = "rateware_carrier_profile_language";

const COPY = {
  en: {
    loadingTitle: "Loading carrier profile...",
    loadingStatus: "Loading profile request...",
    missingToken: "Missing carrier profile token.",
    unavailableTitle: "Carrier profile unavailable",
    secureLink: "Secure profile link",
    expires: "Expires",
    requestEyebrow: "Carrier onboarding",
    profileRequest: "Carrier profile request",
    privateProfile: "Private carrier profile",
    intro: "Complete or correct your company profile. You can answer in English or Spanish.",
    privacy: "This private link only updates your own carrier record.",
    language: "Language",
    english: "English",
    spanish: "Español",
    completion: "Profile completion",
    requiredComplete: "required fields complete",
    missingRequired: "Missing required fields",
    reviewRequired: "Review required fields",
    requiredHint: "Fields marked with * help procurement validate your profile faster.",
    selected: "selected",
    previous: "Back",
    next: "Save and continue",
    submit: "Submit profile",
    saving: "Saving profile...",
    submitted: "Profile submitted. Thank you.",
    submittedStatus: "Profile submitted successfully.",
    fixMissingPrefix: "Please complete",
    fixMissingSuffix: "required field(s) before submitting.",
    answerLanguage: "Answer in English or Spanish. Rateware will keep your original wording.",
    companyStepHelp: "Confirm the company identity and main contact channel.",
    finalStepHelp: "Add contacts by role so procurement knows who to reach.",
    noTokenTitle: "Profile link required",
    noTokenDetail: "Open the private carrier profile link sent by the procurement team.",
    requestFailed: "Carrier profile request failed.",
    submitterName: "Your name",
    submitterEmail: "Your email",
    additionalNotes: "Additional notes",
    companyName: "Company name",
    legalName: "Legal name",
    website: "Website / domain",
    contactName: "Contact name",
    email: "Email",
    phone: "WhatsApp / phone",
    channel: "Preferred channel",
    coverageSummary: "Coverage summary",
    optional: "Optional",
    startHere: "Start here",
    profileSaved: "Your information is ready to submit.",
    statusReady: "Ready",
    statusNeedsInfo: "Needs info"
  },
  es: {
    loadingTitle: "Cargando perfil del carrier...",
    loadingStatus: "Cargando solicitud de perfil...",
    missingToken: "Falta el token del perfil del carrier.",
    unavailableTitle: "Perfil del carrier no disponible",
    secureLink: "Liga segura de perfil",
    expires: "Vence",
    requestEyebrow: "Alta de proveedor",
    profileRequest: "Solicitud de perfil de carrier",
    privateProfile: "Perfil privado de carrier",
    intro: "Completa o corrige el perfil de tu empresa. Puedes responder en ingles o español.",
    privacy: "Esta liga privada solo actualiza tu propio registro de carrier.",
    language: "Idioma",
    english: "English",
    spanish: "Español",
    completion: "Avance del perfil",
    requiredComplete: "campos requeridos completos",
    missingRequired: "Campos requeridos pendientes",
    reviewRequired: "Revisar campos requeridos",
    requiredHint: "Los campos con * ayudan a procurement a validar tu perfil mas rapido.",
    selected: "seleccionados",
    previous: "Atras",
    next: "Guardar y continuar",
    submit: "Enviar perfil",
    saving: "Guardando perfil...",
    submitted: "Perfil enviado. Gracias.",
    submittedStatus: "Perfil enviado correctamente.",
    fixMissingPrefix: "Completa",
    fixMissingSuffix: "campo(s) requerido(s) antes de enviar.",
    answerLanguage: "Responde en ingles o español. Rateware conserva tu texto original.",
    companyStepHelp: "Confirma la identidad de la empresa y el canal principal de contacto.",
    finalStepHelp: "Agrega contactos por rol para que procurement sepa a quien contactar.",
    noTokenTitle: "Se requiere liga de perfil",
    noTokenDetail: "Abre la liga privada de perfil enviada por el equipo de procurement.",
    requestFailed: "Fallo la solicitud del perfil del carrier.",
    submitterName: "Tu nombre",
    submitterEmail: "Tu correo",
    additionalNotes: "Notas adicionales",
    companyName: "Nombre comercial",
    legalName: "Razon social",
    website: "Sitio web / dominio",
    contactName: "Contacto principal",
    email: "Correo",
    phone: "WhatsApp / telefono",
    channel: "Canal preferido",
    coverageSummary: "Resumen de cobertura",
    optional: "Opcional",
    startHere: "Empieza aqui",
    profileSaved: "Tu informacion esta lista para enviarse.",
    statusReady: "Listo",
    statusNeedsInfo: "Falta info"
  }
};

const COMPANY_FIELDS = [
  { key: "vendor_name", label: { en: "Company name", es: "Nombre comercial" }, type: "text", required: true },
  { key: "legal_name", label: { en: "Legal name", es: "Razon social" }, type: "text" },
  { key: "domain", label: { en: "Website / domain", es: "Sitio web / dominio" }, type: "text" },
  { key: "contact_name", label: { en: "Contact name", es: "Contacto principal" }, type: "text" },
  { key: "primary_email", label: { en: "Email", es: "Correo" }, type: "email", required: true },
  { key: "whatsapp_phone", label: { en: "WhatsApp / phone", es: "WhatsApp / telefono" }, type: "text" },
  { key: "preferred_channel", label: { en: "Preferred channel", es: "Canal preferido" }, type: "select", options: ["email", "whatsapp", "portal"] },
  { key: "coverage_notes", label: { en: "Coverage summary", es: "Resumen de cobertura" }, type: "textarea", wide: true }
];

const PROFILE_SECTIONS = [
  {
    key: "general",
    label: { en: "Main contact", es: "Contacto principal" },
    help: { en: "Tell us who owns this profile and where the company operates.", es: "Indica quien responde este perfil y donde opera la empresa." },
    fields: [
      { key: "full_name", label: { en: "Full name", es: "Nombre completo" }, type: "text", required: true },
      { key: "mobile_number", label: { en: "Mobile number", es: "Celular" }, type: "text", required: true },
      { key: "company_type", label: { en: "Company type", es: "Tipo de empresa" }, type: "select", required: true, options: ["Persona Fisica", "Persona Moral"] },
      { key: "operating_country", label: { en: "Operating country", es: "Pais de operacion" }, type: "select", required: true, options: ["Mexico", "Estados Unidos de America", "Canada"] }
    ]
  },
  {
    key: "identity",
    label: { en: "Legal identity", es: "Identidad legal" },
    help: { en: "Add legal, tax and operating authority identifiers.", es: "Agrega datos legales, fiscales y de autoridad operativa." },
    fields: [
      { key: "dba_name", label: { en: "DBA / commercial name", es: "DBA / nombre comercial" }, type: "text" },
      { key: "legal_name", label: { en: "Legal name", es: "Razon social" }, type: "text", required: true },
      { key: "fiscal_address", label: { en: "Fiscal address", es: "Domicilio fiscal" }, type: "textarea", required: true },
      { key: "rfc", label: { en: "RFC", es: "RFC" }, type: "text" },
      { key: "usdot_number", label: { en: "USDOT number", es: "Numero USDOT" }, type: "text" },
      { key: "mc_number", label: { en: "MC number", es: "Numero MC" }, type: "text" },
      { key: "scac_code", label: { en: "SCAC code", es: "Codigo SCAC" }, type: "text" },
      { key: "tax_id", label: { en: "Tax ID", es: "Tax ID" }, type: "text" },
      { key: "caat_code", label: { en: "CAAT code", es: "Codigo CAAT" }, type: "text" }
    ]
  },
  {
    key: "carrier_profile",
    label: { en: "Services and coverage", es: "Servicios y cobertura" },
    help: { en: "Select the services, regions and crossings you can support.", es: "Selecciona servicios, regiones y cruces que puedes cubrir." },
    fields: [
      { key: "geographic_scope", label: { en: "Geographic scope", es: "Alcance geografico" }, type: "checks", required: true, options: ["Mexico", "Estados Unidos", "Canada"] },
      {
        key: "service_scope",
        label: { en: "Service scope", es: "Tipo de servicio" },
        type: "checks",
        required: true,
        options: [
          "Local MEX",
          "Regional MEX",
          "Domestic MEX",
          "Border drayage",
          "Cross-border D2D",
          "Door 2 Door with B1 drivers",
          "Power Only",
          "Transfer"
        ]
      },
      {
        key: "regional_coverage",
        label: { en: "Regional coverage", es: "Cobertura regional" },
        type: "checks",
        required: true,
        options: [
          "Noreste MX",
          "Noroeste MX",
          "Bajio MX",
          "Centro MX",
          "Occidente MX",
          "Golfo MX",
          "Southwest US",
          "Southeast US",
          "Midwest US",
          "Northeast US",
          "West US",
          "Central CA",
          "West CA"
        ]
      },
      { key: "border_crossings", label: { en: "Border cities", es: "Ciudades fronterizas" }, type: "checks", options: ["Tijuana / San Diego", "Mexicali / Calexico", "Nogales", "Ciudad Juarez / El Paso", "Piedras Negras / Eagle Pass", "Nuevo Laredo / Laredo", "Reynosa / Pharr", "Matamoros / Brownsville"] },
      { key: "mexican_ports", label: { en: "Mexican ports", es: "Puertos mexicanos" }, type: "checks", options: ["Altamira", "Ensenada", "Lazaro Cardenas", "Manzanillo", "Mazatlan", "Progreso", "Veracruz"] },
      { key: "value_added_services", label: { en: "Value added services", es: "Servicios adicionales" }, type: "checks", options: ["Hazmat", "Team driver", "Hot shot", "Fumigation", "Cross dock", "Warehousing", "Drop and hook", "Custody", "Cargo insurance", "Overweight / oversized"] },
      { key: "certifications", label: { en: "Certifications", es: "Certificaciones" }, type: "checks", options: ["US Bonded Carrier", "TWIC", "SmartWay", "Transporte Limpio", "Hazmat", "ACE", "FAST", "CTPAT", "OEA", "ISO9001", "R-Control"] },
      { key: "interchange_agreements", label: { en: "Interchange agreements", es: "Convenios de intercambio" }, type: "textarea" }
    ]
  },
  {
    key: "insurance_infrastructure",
    label: { en: "Equipment and insurance", es: "Equipo y seguros" },
    help: { en: "Share available equipment, terminals and insurance notes.", es: "Comparte equipo disponible, terminales y notas de seguro." },
    fields: [
      { key: "coverage_amounts", label: { en: "Insurance coverage amounts", es: "Montos de cobertura de seguro" }, type: "textarea" },
      { key: "mexico_terminal_zips", label: { en: "Mexico terminal ZIPs / cities", es: "CP / ciudades de terminales en Mexico" }, type: "textarea" },
      { key: "us_ca_terminal_zips", label: { en: "US / Canada terminal ZIPs", es: "ZIPs de terminales US / Canada" }, type: "textarea" },
      { key: "equipment_types", label: { en: "Available equipment", es: "Equipo disponible" }, type: "checks", required: true, options: ["Power Only", "Chassis", "Conestoga", "Lowboy", "Stepdeck", "Flatbed", "Dry Van", "Reefer", "Straight truck", "3.5 tons", "1.5 tons"] },
      { key: "equipment_notes", label: { en: "Equipment notes", es: "Notas de equipo" }, type: "textarea" }
    ]
  },
  {
    key: "payments",
    label: { en: "Payments", es: "Pagos" },
    help: { en: "Optional billing details. You can also send legal documents separately.", es: "Datos de pago opcionales. Tambien puedes enviar documentos legales por separado." },
    fields: [
      { key: "bank_name", label: { en: "Bank name", es: "Banco" }, type: "text" },
      { key: "account_number", label: { en: "Account number", es: "Numero de cuenta" }, type: "text" },
      { key: "routing_number", label: { en: "Routing number", es: "Routing number" }, type: "text" },
      { key: "clabe_number", label: { en: "CLABE", es: "CLABE" }, type: "text" },
      { key: "beneficiary_company", label: { en: "Beneficiary company", es: "Beneficiario" }, type: "text" },
      { key: "factoring_company", label: { en: "Factoring company", es: "Empresa de factoring" }, type: "select", options: ["Si", "No"] },
      { key: "payment_terms", label: { en: "Payment terms", es: "Terminos de pago" }, type: "textarea" }
    ]
  },
  {
    key: "key_contacts",
    label: { en: "Key contacts", es: "Contactos clave" },
    help: { en: "Use name, email and phone per role when available.", es: "Incluye nombre, correo y telefono por rol si lo tienes." },
    fields: [
      { key: "general_manager", label: { en: "General manager", es: "Gerente general" }, type: "textarea" },
      { key: "operations_manager", label: { en: "Operations manager", es: "Gerente de operaciones" }, type: "textarea" },
      { key: "safety_manager", label: { en: "Safety manager", es: "Gerente de seguridad" }, type: "textarea" },
      { key: "finance_manager", label: { en: "Finance manager", es: "Gerente de finanzas" }, type: "textarea" },
      { key: "commercial_manager", label: { en: "Commercial manager", es: "Gerente comercial" }, type: "textarea" },
      { key: "key_account_manager", label: { en: "Key account manager", es: "Key account manager" }, type: "textarea" }
    ]
  }
];

const STEPS = [
  { key: "company", label: { en: "Company", es: "Empresa" }, help: { en: COPY.en.companyStepHelp, es: COPY.es.companyStepHelp }, fields: COMPANY_FIELDS },
  ...PROFILE_SECTIONS
];

let currentVendor = null;
let currentLanguage = initialLanguage();
let activeStepIndex = 0;
let submitterDraft = { name: "", email: "" };

function initialLanguage() {
  const queryLanguage = new URLSearchParams(window.location.search).get("lang");
  if (queryLanguage && queryLanguage.toLowerCase().startsWith("es")) return "es";
  if (queryLanguage && queryLanguage.toLowerCase().startsWith("en")) return "en";
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (stored === "en" || stored === "es") return stored;
  return (navigator.language || "").toLowerCase().startsWith("es") ? "es" : "en";
}

function t(key) {
  return COPY[currentLanguage][key] || COPY.en[key] || key;
}

function localized(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value[currentLanguage] || value.en || value.es || "";
  return value ?? "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tokenFromUrl() {
  return new URLSearchParams(window.location.search).get("token") || "";
}

function setStatus(message, tone = "neutral") {
  if (!statusMessage) return;
  statusMessage.textContent = message || "";
  statusMessage.dataset.tone = tone;
}

function setDocumentLanguage() {
  document.documentElement.lang = currentLanguage;
  if (pageEyebrow) pageEyebrow.textContent = t("privateProfile");
}

async function callProfileApi(action, payload = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/carrier-profile-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: tokenFromUrl(), ...payload })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || t("requestFailed"));
  return data;
}

function profileSection(vendor = {}, sectionKey) {
  return vendor.profile_data?.[sectionKey] && typeof vendor.profile_data[sectionKey] === "object"
    ? vendor.profile_data[sectionKey]
    : {};
}

function profileValue(vendor, sectionKey, fieldKey) {
  return profileSection(vendor, sectionKey)[fieldKey];
}

function scalarValue(value) {
  if (Array.isArray(value)) return value.join("; ");
  return value ?? "";
}

function arrayValue(value) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  return String(value).split(/[;\n|]+/).map((item) => item.trim()).filter(Boolean);
}

function mergeProfileObjects(baseValue = {}, patchValue = {}) {
  const merged = { ...(baseValue || {}) };
  Object.entries(patchValue || {}).forEach(([sectionKey, sectionValue]) => {
    merged[sectionKey] = {
      ...(merged[sectionKey] && typeof merged[sectionKey] === "object" ? merged[sectionKey] : {}),
      ...(sectionValue && typeof sectionValue === "object" ? sectionValue : {})
    };
  });
  return merged;
}

function renderLanguageToggle() {
  return `
    <div class="carrier-profile-language" aria-label="${escapeHtml(t("language"))}">
      <span>${escapeHtml(t("language"))}</span>
      <button type="button" data-language-toggle="en" ${currentLanguage === "en" ? "aria-pressed=\"true\"" : ""}>${escapeHtml(t("english"))}</button>
      <button type="button" data-language-toggle="es" ${currentLanguage === "es" ? "aria-pressed=\"true\"" : ""}>${escapeHtml(t("spanish"))}</button>
    </div>
  `;
}

function renderVendorLogo(vendor) {
  return vendor.logo_url
    ? `<img src="${escapeHtml(vendor.logo_url)}" alt="" />`
    : `<span>${escapeHtml((vendor.vendor_name || "R").slice(0, 1).toUpperCase())}</span>`;
}

function renderCompanyField(field, value) {
  const required = field.required ? ' <span aria-hidden="true">*</span>' : "";
  const common = `data-vendor-field="${escapeHtml(field.key)}" ${field.required ? "data-required-field" : ""}`;
  if (field.type === "textarea") {
    return `
      <label class="profile-field ${field.wide ? "profile-field-wide" : ""}">
        <span>${escapeHtml(localized(field.label))}${required}</span>
        <textarea ${common} rows="3">${escapeHtml(scalarValue(value))}</textarea>
      </label>
    `;
  }
  if (field.type === "select") {
    const current = String(scalarValue(value));
    const options = Array.from(new Set([...(field.options || []), current].filter(Boolean)));
    return `
      <label class="profile-field">
        <span>${escapeHtml(localized(field.label))}${required}</span>
        <select ${common}>
          <option value=""></option>
          ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === current ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
      </label>
    `;
  }
  return `
    <label class="profile-field ${field.wide ? "profile-field-wide" : ""}">
      <span>${escapeHtml(localized(field.label))}${required}</span>
      <input ${common} type="${escapeHtml(field.type || "text")}" value="${escapeHtml(scalarValue(value))}" />
    </label>
  `;
}

function renderProfileField(section, field, value) {
  const required = field.required ? ' <span aria-hidden="true">*</span>' : "";
  const common = `data-profile-input data-section="${escapeHtml(section.key)}" data-field="${escapeHtml(field.key)}" ${field.required ? "data-required-field" : ""}`;
  if (field.type === "textarea") {
    return `
      <label class="profile-field profile-field-wide">
        <span>${escapeHtml(localized(field.label))}${required}</span>
        <textarea ${common} rows="3">${escapeHtml(scalarValue(value))}</textarea>
      </label>
    `;
  }
  if (field.type === "select") {
    const current = String(scalarValue(value));
    const options = Array.from(new Set([...(field.options || []), current].filter(Boolean)));
    return `
      <label class="profile-field">
        <span>${escapeHtml(localized(field.label))}${required}</span>
        <select ${common}>
          <option value=""></option>
          ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === current ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
      </label>
    `;
  }
  if (field.type === "checks") {
    const selected = new Set(arrayValue(value));
    return `
      <fieldset class="profile-checklist" data-required-checklist="${field.required ? "true" : "false"}" data-section="${escapeHtml(section.key)}" data-field="${escapeHtml(field.key)}">
        <legend>
          <span>${escapeHtml(localized(field.label))}${required}</span>
          <strong data-check-count>${formatSelectedCount(selected.size)}</strong>
        </legend>
        <div class="profile-check-options">
          ${(field.options || []).map((option) => `
            <label class="profile-check-option">
              <input type="checkbox" data-profile-check data-section="${escapeHtml(section.key)}" data-field="${escapeHtml(field.key)}" value="${escapeHtml(option)}" ${selected.has(option) ? "checked" : ""} />
              <span>${escapeHtml(option)}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
    `;
  }
  return `
    <label class="profile-field">
      <span>${escapeHtml(localized(field.label))}${required}</span>
      <input ${common} value="${escapeHtml(scalarValue(value))}" />
    </label>
  `;
}

function formatSelectedCount(count) {
  return `${count} ${t("selected")}`;
}

function renderStepPanel(step, index, vendor) {
  const isCompany = step.key === "company";
  const fields = isCompany
    ? step.fields.map((field) => renderCompanyField(field, vendor[field.key])).join("")
    : step.fields.map((field) => renderProfileField(step, field, profileValue(vendor, step.key, field.key))).join("");
  return `
    <section class="carrier-profile-step-panel" data-step-panel="${escapeHtml(step.key)}" ${index === activeStepIndex ? "" : "hidden"}>
      <div class="carrier-profile-step-heading">
        <div>
          <p class="eyebrow">${escapeHtml(index === 0 ? t("startHere") : t("profileRequest"))}</p>
          <h3>${escapeHtml(localized(step.label))}</h3>
          <p>${escapeHtml(localized(step.help) || t("answerLanguage"))}</p>
        </div>
        <span data-step-status="${escapeHtml(step.key)}">${escapeHtml(t("statusNeedsInfo"))}</span>
      </div>
      <div class="carrier-profile-grid">
        ${fields}
      </div>
    </section>
  `;
}

function renderStepper() {
  return `
    <nav class="carrier-profile-stepper" aria-label="Carrier profile sections">
      ${STEPS.map((step, index) => `
        <button type="button" data-step-target="${index}" ${index === activeStepIndex ? "aria-current=\"step\"" : ""}>
          <span>${index + 1}</span>
          <strong>${escapeHtml(localized(step.label))}</strong>
          <small data-step-count="${escapeHtml(step.key)}">0 / 0</small>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderProfile(vendor) {
  setDocumentLanguage();
  title.textContent = vendor.vendor_name || (currentLanguage === "es" ? "Perfil del carrier" : "Carrier profile");
  card.innerHTML = `
    <form id="carrier-profile-form" class="carrier-profile-form" novalidate>
      <section class="carrier-profile-hero">
        <div class="carrier-profile-summary">
          <div class="vendor-logo drawer">${renderVendorLogo(vendor)}</div>
          <div>
            <p class="eyebrow">${escapeHtml(t("requestEyebrow"))}</p>
            <h2>${escapeHtml(vendor.vendor_name || "Carrier")}</h2>
            <p>${escapeHtml(t("intro"))}</p>
            <p class="muted-text">${escapeHtml(t("privacy"))}</p>
          </div>
        </div>
        <aside class="carrier-profile-assist">
          ${renderLanguageToggle()}
          <div class="carrier-profile-progress">
            <span>${escapeHtml(t("completion"))}</span>
            <strong data-profile-progress-label>0%</strong>
            <div class="profile-progress-track"><div data-profile-progress-bar></div></div>
            <small data-profile-required-count>0 / 0 ${escapeHtml(t("requiredComplete"))}</small>
          </div>
          <p>${escapeHtml(t("answerLanguage"))}</p>
        </aside>
      </section>

      <section class="carrier-profile-workspace">
        ${renderStepper()}
        <div class="carrier-profile-editor">
          <div class="carrier-profile-alert" data-required-alert hidden>
            <strong>${escapeHtml(t("missingRequired"))}</strong>
            <span>${escapeHtml(t("requiredHint"))}</span>
          </div>
          ${STEPS.map((step, index) => renderStepPanel(step, index, vendor)).join("")}
          <section class="carrier-profile-submit-panel">
            <div class="carrier-profile-grid">
              <label class="profile-field">
                <span>${escapeHtml(t("submitterName"))}</span>
                <input data-submitter-field="name" value="${escapeHtml(submitterDraft.name || "")}" />
              </label>
              <label class="profile-field">
                <span>${escapeHtml(t("submitterEmail"))}</span>
                <input data-submitter-field="email" type="email" value="${escapeHtml(submitterDraft.email || "")}" />
              </label>
              <label class="profile-field profile-field-wide">
                <span>${escapeHtml(t("additionalNotes"))}</span>
                <textarea data-vendor-field="notes" rows="3">${escapeHtml(vendor.notes || "")}</textarea>
              </label>
            </div>
          </section>
          <div class="carrier-profile-actions">
            <button class="secondary" type="button" data-step-action="previous">${escapeHtml(t("previous"))}</button>
            <button class="secondary" type="button" data-step-action="next">${escapeHtml(t("next"))}</button>
            <button id="carrier-profile-submit" type="submit">${escapeHtml(t("submit"))}</button>
            <p id="carrier-profile-save-status" class="status-message" role="status"></p>
          </div>
        </div>
      </section>
    </form>
  `;
  setActiveStep(activeStepIndex, { silent: true });
  refreshProgress();
}

function readVendorPatch(form) {
  const patch = {};
  form.querySelectorAll("[data-vendor-field]").forEach((input) => {
    patch[input.dataset.vendorField] = input.value;
  });
  return patch;
}

function readProfileData(form) {
  const profile = {};
  PROFILE_SECTIONS.forEach((section) => {
    const sectionData = {};
    section.fields.forEach((field) => {
      if (field.type === "checks") {
        const values = Array.from(form.querySelectorAll(`[data-profile-check][data-section="${section.key}"][data-field="${field.key}"]:checked`)).map((input) => input.value);
        if (values.length) sectionData[field.key] = values;
        return;
      }
      const input = form.querySelector(`[data-profile-input][data-section="${section.key}"][data-field="${field.key}"]`);
      const value = input ? String(input.value || "").trim() : "";
      if (value) sectionData[field.key] = value;
    });
    if (Object.keys(sectionData).length) profile[section.key] = sectionData;
  });
  profile._meta = { response_language: currentLanguage };
  return profile;
}

function readSubmitter(form) {
  return {
    name: form.querySelector('[data-submitter-field="name"]')?.value || "",
    email: form.querySelector('[data-submitter-field="email"]')?.value || ""
  };
}

function applyDraftToCurrentVendor() {
  const form = card.querySelector("#carrier-profile-form");
  if (!form || !currentVendor) return;
  submitterDraft = readSubmitter(form);
  currentVendor = {
    ...currentVendor,
    ...readVendorPatch(form),
    profile_data: mergeProfileObjects(currentVendor.profile_data, readProfileData(form))
  };
}

function fieldFilled(form, step, field) {
  if (step.key === "company") {
    const input = form.querySelector(`[data-vendor-field="${field.key}"]`);
    return Boolean(String(input?.value || "").trim());
  }
  if (field.type === "checks") {
    return form.querySelectorAll(`[data-profile-check][data-section="${step.key}"][data-field="${field.key}"]:checked`).length > 0;
  }
  const input = form.querySelector(`[data-profile-input][data-section="${step.key}"][data-field="${field.key}"]`);
  return Boolean(String(input?.value || "").trim());
}

function stepRequiredStatus(form, step) {
  const requiredFields = (step.fields || []).filter((field) => field.required);
  const complete = requiredFields.filter((field) => fieldFilled(form, step, field)).length;
  return { complete, total: requiredFields.length };
}

function requiredMissing(form) {
  const missing = [];
  STEPS.forEach((step, stepIndex) => {
    (step.fields || []).filter((field) => field.required).forEach((field) => {
      if (!fieldFilled(form, step, field)) {
        missing.push({ stepIndex, step, field });
      }
    });
  });
  return missing;
}

function refreshCheckCounts(form = card.querySelector("#carrier-profile-form")) {
  if (!form) return;
  form.querySelectorAll(".profile-checklist").forEach((fieldset) => {
    const checked = fieldset.querySelectorAll("input[type='checkbox']:checked").length;
    const label = fieldset.querySelector("[data-check-count]");
    if (label) label.textContent = formatSelectedCount(checked);
  });
}

function refreshProgress() {
  const form = card.querySelector("#carrier-profile-form");
  if (!form) return;
  refreshCheckCounts(form);
  let complete = 0;
  let total = 0;
  STEPS.forEach((step) => {
    const status = stepRequiredStatus(form, step);
    complete += status.complete;
    total += status.total;
    const stepCount = form.querySelector(`[data-step-count="${step.key}"]`);
    const stepStatus = form.querySelector(`[data-step-status="${step.key}"]`);
    if (stepCount) stepCount.textContent = `${status.complete} / ${status.total}`;
    if (stepStatus) {
      stepStatus.textContent = status.total && status.complete < status.total ? t("statusNeedsInfo") : t("statusReady");
      stepStatus.dataset.tone = status.total && status.complete < status.total ? "warning" : "success";
    }
  });
  const percent = total ? Math.round((complete / total) * 100) : 100;
  const progressLabel = form.querySelector("[data-profile-progress-label]");
  const progressBar = form.querySelector("[data-profile-progress-bar]");
  const requiredCount = form.querySelector("[data-profile-required-count]");
  const alert = form.querySelector("[data-required-alert]");
  if (progressLabel) progressLabel.textContent = `${percent}%`;
  if (progressBar) progressBar.style.width = `${percent}%`;
  if (requiredCount) requiredCount.textContent = `${complete} / ${total} ${t("requiredComplete")}`;
  if (alert) alert.hidden = complete === total;
}

function setActiveStep(index, { silent = false } = {}) {
  const nextIndex = Math.max(0, Math.min(STEPS.length - 1, Number(index) || 0));
  activeStepIndex = nextIndex;
  const form = card.querySelector("#carrier-profile-form");
  if (!form) return;
  form.querySelectorAll("[data-step-panel]").forEach((panel, panelIndex) => {
    panel.hidden = panelIndex !== activeStepIndex;
  });
  form.querySelectorAll("[data-step-target]").forEach((button, buttonIndex) => {
    if (buttonIndex === activeStepIndex) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  const previous = form.querySelector('[data-step-action="previous"]');
  const next = form.querySelector('[data-step-action="next"]');
  const submitPanel = form.querySelector(".carrier-profile-submit-panel");
  const submitButton = form.querySelector("#carrier-profile-submit");
  if (previous) previous.disabled = activeStepIndex === 0;
  if (next) next.hidden = activeStepIndex === STEPS.length - 1;
  if (submitPanel) submitPanel.hidden = activeStepIndex !== STEPS.length - 1;
  if (submitButton) submitButton.hidden = activeStepIndex !== STEPS.length - 1;
  if (!silent) form.querySelector(`[data-step-panel="${STEPS[activeStepIndex].key}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
}

async function submitProfile(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector("#carrier-profile-submit");
  const saveStatus = form.querySelector("#carrier-profile-save-status");
  const missing = requiredMissing(form);
  if (missing.length) {
    setActiveStep(missing[0].stepIndex);
    saveStatus.textContent = `${t("fixMissingPrefix")} ${missing.length} ${t("fixMissingSuffix")}`;
    saveStatus.dataset.tone = "error";
    refreshProgress();
    return;
  }
  button.disabled = true;
  saveStatus.textContent = t("saving");
  saveStatus.dataset.tone = "neutral";
  try {
    const result = await callProfileApi("submit_profile", {
      vendor: readVendorPatch(form),
      profile_data: readProfileData(form),
      submitted_contact: readSubmitter(form)
    });
    currentVendor = result.vendor;
    saveStatus.textContent = t("submitted");
    saveStatus.dataset.tone = "success";
    setStatus(t("submittedStatus"), "success");
    renderProfile(result.vendor);
  } catch (error) {
    saveStatus.textContent = error.message;
    saveStatus.dataset.tone = "error";
  } finally {
    button.disabled = false;
  }
}

function renderMissingToken() {
  title.textContent = t("noTokenTitle");
  card.innerHTML = `
    <section class="carrier-profile-empty">
      ${renderLanguageToggle()}
      <strong>${escapeHtml(t("missingToken"))}</strong>
      <p>${escapeHtml(t("noTokenDetail"))}</p>
    </section>
  `;
}

async function init() {
  setDocumentLanguage();
  title.textContent = t("loadingTitle");
  setStatus(t("loadingStatus"));
  if (!tokenFromUrl()) {
    renderMissingToken();
    return;
  }
  try {
    const result = await callProfileApi("get_profile");
    currentVendor = result.vendor;
    renderProfile(result.vendor);
    setStatus(`${t("secureLink")} - ${t("expires")} ${new Date(result.request.expires_at).toLocaleDateString(currentLanguage === "es" ? "es-MX" : "en-US")}.`);
  } catch (error) {
    title.textContent = t("unavailableTitle");
    card.innerHTML = `
      <section class="carrier-profile-empty">
        ${renderLanguageToggle()}
        <p class="status-message" data-tone="error">${escapeHtml(error.message)}</p>
      </section>
    `;
  }
}

card.addEventListener("submit", (event) => {
  if (event.target?.id === "carrier-profile-form") submitProfile(event);
});

card.addEventListener("input", (event) => {
  if (event.target?.matches("[data-vendor-field], [data-profile-input], [data-profile-check], [data-submitter-field]")) {
    refreshProgress();
  }
});

card.addEventListener("change", (event) => {
  if (event.target?.matches("[data-vendor-field], [data-profile-input], [data-profile-check], [data-submitter-field]")) {
    refreshProgress();
  }
});

card.addEventListener("click", (event) => {
  const languageButton = event.target.closest("[data-language-toggle]");
  if (languageButton) {
    applyDraftToCurrentVendor();
    currentLanguage = languageButton.dataset.languageToggle === "es" ? "es" : "en";
    localStorage.setItem(LANGUAGE_KEY, currentLanguage);
    if (currentVendor) renderProfile(currentVendor);
    else init();
    return;
  }

  const stepButton = event.target.closest("[data-step-target]");
  if (stepButton) {
    setActiveStep(Number(stepButton.dataset.stepTarget));
    return;
  }

  const stepAction = event.target.closest("[data-step-action]");
  if (!stepAction) return;
  if (stepAction.dataset.stepAction === "previous") setActiveStep(activeStepIndex - 1);
  if (stepAction.dataset.stepAction === "next") setActiveStep(activeStepIndex + 1);
});

init();
