import { SUPABASE_URL } from "./config.js";

const title = document.querySelector("#carrier-profile-title");
const card = document.querySelector("#carrier-profile-card");
const statusMessage = document.querySelector("#carrier-profile-status");

const PROFILE_SECTIONS = [
  {
    key: "general",
    label: "General contact",
    fields: [
      { key: "full_name", label: "Full name", type: "text", required: true },
      { key: "mobile_number", label: "Mobile number", type: "text", required: true },
      { key: "company_type", label: "Company type", type: "select", required: true, options: ["Persona Fisica", "Persona Moral"] },
      { key: "operating_country", label: "Operating country", type: "select", required: true, options: ["Mexico", "Estados Unidos de America", "Canada"] }
    ]
  },
  {
    key: "identity",
    label: "Legal identity",
    fields: [
      { key: "dba_name", label: "DBA / commercial name", type: "text" },
      { key: "legal_name", label: "Legal name", type: "text", required: true },
      { key: "fiscal_address", label: "Fiscal address", type: "textarea", required: true },
      { key: "rfc", label: "RFC", type: "text" },
      { key: "usdot_number", label: "USDOT number", type: "text" },
      { key: "mc_number", label: "MC number", type: "text" },
      { key: "scac_code", label: "SCAC code", type: "text" },
      { key: "tax_id", label: "Tax ID", type: "text" },
      { key: "caat_code", label: "CAAT code", type: "text" }
    ]
  },
  {
    key: "carrier_profile",
    label: "Service profile",
    fields: [
      { key: "geographic_scope", label: "Geographic scope", type: "checks", required: true, options: ["Mexico", "Estados Unidos", "Canada"] },
      {
        key: "service_scope",
        label: "Service scope",
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
        label: "Regional coverage",
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
      { key: "border_crossings", label: "Border cities", type: "checks", options: ["Tijuana / San Diego", "Mexicali / Calexico", "Nogales", "Ciudad Juarez / El Paso", "Piedras Negras / Eagle Pass", "Nuevo Laredo / Laredo", "Reynosa / Pharr", "Matamoros / Brownsville"] },
      { key: "mexican_ports", label: "Mexican ports", type: "checks", options: ["Altamira", "Ensenada", "Lazaro Cardenas", "Manzanillo", "Mazatlan", "Progreso", "Veracruz"] },
      { key: "value_added_services", label: "Value added services", type: "checks", options: ["Hazmat", "Team driver", "Hot shot", "Fumigation", "Cross dock", "Warehousing", "Drop and hook", "Custody", "Cargo insurance", "Overweight / oversized"] },
      { key: "certifications", label: "Certifications", type: "checks", options: ["US Bonded Carrier", "TWIC", "SmartWay", "Transporte Limpio", "Hazmat", "ACE", "FAST", "CTPAT", "OEA", "ISO9001", "R-Control"] },
      { key: "interchange_agreements", label: "Interchange agreements", type: "textarea" }
    ]
  },
  {
    key: "insurance_infrastructure",
    label: "Insurance and infrastructure",
    fields: [
      { key: "coverage_amounts", label: "Insurance coverage amounts", type: "textarea" },
      { key: "mexico_terminal_zips", label: "Mexico terminal ZIPs / cities", type: "textarea" },
      { key: "us_ca_terminal_zips", label: "US / Canada terminal ZIPs", type: "textarea" },
      { key: "equipment_types", label: "Available equipment", type: "checks", required: true, options: ["Power Only", "Chassis", "Conestoga", "Lowboy", "Stepdeck", "Flatbed", "Dry Van", "Reefer", "Straight truck", "3.5 tons", "1.5 tons"] },
      { key: "equipment_notes", label: "Equipment notes", type: "textarea" }
    ]
  },
  {
    key: "payments",
    label: "Payments",
    fields: [
      { key: "bank_name", label: "Bank name", type: "text" },
      { key: "account_number", label: "Account number", type: "text" },
      { key: "routing_number", label: "Routing number", type: "text" },
      { key: "clabe_number", label: "CLABE", type: "text" },
      { key: "beneficiary_company", label: "Beneficiary company", type: "text" },
      { key: "factoring_company", label: "Factoring company", type: "select", options: ["Si", "No"] },
      { key: "payment_terms", label: "Payment terms", type: "textarea" }
    ]
  },
  {
    key: "key_contacts",
    label: "Key contacts",
    fields: [
      { key: "general_manager", label: "General manager", type: "textarea" },
      { key: "operations_manager", label: "Operations manager", type: "textarea" },
      { key: "safety_manager", label: "Safety manager", type: "textarea" },
      { key: "finance_manager", label: "Finance manager", type: "textarea" },
      { key: "commercial_manager", label: "Commercial manager", type: "textarea" },
      { key: "key_account_manager", label: "Key account manager", type: "textarea" }
    ]
  }
];

let currentVendor = null;

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

async function callProfileApi(action, payload = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/carrier-profile-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: tokenFromUrl(), ...payload })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Carrier profile request failed.");
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

function renderProfileField(section, field, value) {
  const required = field.required ? ' <span aria-hidden="true">*</span>' : "";
  const common = `data-profile-input data-section="${escapeHtml(section.key)}" data-field="${escapeHtml(field.key)}"`;
  if (field.type === "textarea") {
    return `
      <label class="profile-field profile-field-wide">
        ${escapeHtml(field.label)}${required}
        <textarea ${common} rows="3">${escapeHtml(scalarValue(value))}</textarea>
      </label>
    `;
  }
  if (field.type === "select") {
    const current = String(scalarValue(value));
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
    const selected = new Set(arrayValue(value));
    return `
      <details class="profile-checklist" open>
        <summary>
          <span>${escapeHtml(field.label)}${required}</span>
          <strong>${selected.size} selected</strong>
        </summary>
        <div class="profile-check-options">
          ${(field.options || []).map((option) => `
            <label class="profile-check-option">
              <input type="checkbox" data-profile-check data-section="${escapeHtml(section.key)}" data-field="${escapeHtml(field.key)}" value="${escapeHtml(option)}" ${selected.has(option) ? "checked" : ""} />
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
      <input ${common} value="${escapeHtml(scalarValue(value))}" />
    </label>
  `;
}

function renderProfile(vendor) {
  title.textContent = vendor.vendor_name || "Carrier profile";
  const logo = vendor.logo_url ? `<img src="${escapeHtml(vendor.logo_url)}" alt="" />` : `<span>${escapeHtml((vendor.vendor_name || "R").slice(0, 1).toUpperCase())}</span>`;
  card.innerHTML = `
    <form id="carrier-profile-form" class="carrier-profile-form">
      <section class="carrier-profile-summary">
        <div class="vendor-logo drawer">${logo}</div>
        <div>
          <p class="eyebrow">Carrier profile request</p>
          <h2>${escapeHtml(vendor.vendor_name || "Carrier")}</h2>
          <p>Complete or correct your company profile. This secure link only updates your own carrier record.</p>
        </div>
      </section>

      <section class="carrier-profile-grid">
        <label>
          Company name
          <input data-vendor-field="vendor_name" value="${escapeHtml(vendor.vendor_name || "")}" required />
        </label>
        <label>
          Legal name
          <input data-vendor-field="legal_name" value="${escapeHtml(vendor.legal_name || "")}" />
        </label>
        <label>
          Website / domain
          <input data-vendor-field="domain" value="${escapeHtml(vendor.domain || "")}" />
        </label>
        <label>
          Contact name
          <input data-vendor-field="contact_name" value="${escapeHtml(vendor.contact_name || "")}" />
        </label>
        <label>
          Email
          <input data-vendor-field="primary_email" type="email" value="${escapeHtml(vendor.primary_email || "")}" />
        </label>
        <label>
          WhatsApp / phone
          <input data-vendor-field="whatsapp_phone" value="${escapeHtml(vendor.whatsapp_phone || "")}" />
        </label>
        <label>
          Preferred channel
          <select data-vendor-field="preferred_channel">
            ${["email", "whatsapp", "portal"].map((channel) => `<option value="${channel}" ${vendor.preferred_channel === channel ? "selected" : ""}>${channel}</option>`).join("")}
          </select>
        </label>
        <label class="profile-field-wide">
          Coverage summary
          <textarea data-vendor-field="coverage_notes" rows="3">${escapeHtml(vendor.coverage_notes || "")}</textarea>
        </label>
      </section>

      <div class="carrier-profile-sections">
        ${PROFILE_SECTIONS.map((section) => `
          <details class="drawer-profile-section" open>
            <summary>${escapeHtml(section.label)}</summary>
            <div class="drawer-profile-grid">
              ${section.fields.map((field) => renderProfileField(section, field, profileValue(vendor, section.key, field.key))).join("")}
            </div>
          </details>
        `).join("")}
      </div>

      <section class="carrier-profile-grid">
        <label>
          Submitted by
          <input data-submitter-field="name" placeholder="Your name" />
        </label>
        <label>
          Submitter email
          <input data-submitter-field="email" type="email" placeholder="you@carrier.com" />
        </label>
        <label class="profile-field-wide">
          Additional notes
          <textarea data-vendor-field="notes" rows="3">${escapeHtml(vendor.notes || "")}</textarea>
        </label>
      </section>

      <div class="action-row">
        <button id="carrier-profile-submit" type="submit">Submit profile</button>
        <p id="carrier-profile-save-status" class="status-message" role="status"></p>
      </div>
    </form>
  `;
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
  return profile;
}

function readSubmitter(form) {
  return {
    name: form.querySelector('[data-submitter-field="name"]')?.value || "",
    email: form.querySelector('[data-submitter-field="email"]')?.value || ""
  };
}

async function submitProfile(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector("#carrier-profile-submit");
  const saveStatus = form.querySelector("#carrier-profile-save-status");
  button.disabled = true;
  saveStatus.textContent = "Saving profile...";
  saveStatus.dataset.tone = "neutral";
  try {
    const result = await callProfileApi("submit_profile", {
      vendor: readVendorPatch(form),
      profile_data: readProfileData(form),
      submitted_contact: readSubmitter(form)
    });
    currentVendor = result.vendor;
    saveStatus.textContent = "Profile submitted. Thank you.";
    saveStatus.dataset.tone = "success";
    renderProfile(result.vendor);
    setStatus("Profile submitted successfully.", "success");
  } catch (error) {
    saveStatus.textContent = error.message;
    saveStatus.dataset.tone = "error";
  } finally {
    button.disabled = false;
  }
}

async function init() {
  if (!tokenFromUrl()) {
    card.innerHTML = '<p class="status-message" data-tone="error">Missing carrier profile token.</p>';
    return;
  }
  try {
    const result = await callProfileApi("get_profile");
    currentVendor = result.vendor;
    renderProfile(result.vendor);
    setStatus(`Secure profile link expires ${new Date(result.request.expires_at).toLocaleDateString()}.`);
  } catch (error) {
    title.textContent = "Carrier profile unavailable";
    card.innerHTML = `<p class="status-message" data-tone="error">${escapeHtml(error.message)}</p>`;
  }
}

card.addEventListener("submit", (event) => {
  if (event.target?.id === "carrier-profile-form") submitProfile(event);
});

init();
