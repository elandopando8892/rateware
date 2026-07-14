import { SUPABASE_URL } from "./config.js";

const token = new URLSearchParams(window.location.search).get("token") || "";
const root = document.querySelector("#shipper-profile-root");
const languageButton = document.querySelector("#shipper-language");
let locale = "en";
let profile = null;

const copy = {
  en: {
    title: "Customer onboarding profile", intro: "Review only the details that changed. This secure profile updates the existing Rateware shipper record.",
    company: "Company and legal identity", contacts: "Functional contacts", locations: "Addresses and operating sites", onboarding: "TMS and operational onboarding", network: "Network and service scope", billing: "Billing and accounting", save: "Save profile", submitted: "Profile saved. Your account team can now review the update.", addContact: "Add contact", addLocation: "Add location", submitter: "Your name", submitterEmail: "Your email", valid: "Valid through", remove: "Remove"
  },
  es: {
    title: "Perfil de onboarding del cliente", intro: "Revisa solo los datos que cambiaron. Este perfil seguro actualiza el mismo expediente de shipper dentro de Rateware.",
    company: "Empresa e identidad legal", contacts: "Contactos funcionales", locations: "Direcciones y sitios operativos", onboarding: "TMS y onboarding operativo", network: "Red y alcance de servicio", billing: "Facturacion y contabilidad", save: "Guardar perfil", submitted: "Perfil guardado. El equipo de cuenta ya puede revisar la actualizacion.", addContact: "Agregar contacto", addLocation: "Agregar ubicacion", submitter: "Tu nombre", submitterEmail: "Tu correo", valid: "Vigente hasta", remove: "Quitar"
  }
};

const escapeHtml = (raw) => String(raw ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const value = (object, key) => escapeHtml(object?.[key] || "");

async function callProfileApi(action, payload = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/shipper-profile-api`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, token, ...payload })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to load the profile.");
  return data;
}

function input(label, name, current, type = "text") {
  return `<label><span>${label}</span><input name="${name}" type="${type}" value="${current}" /></label>`;
}

function textarea(label, name, current) {
  return `<label class="wide"><span>${label}</span><textarea name="${name}">${current}</textarea></label>`;
}

function contactRow(contact = {}, t = copy.en) {
  return `<div class="shipper-profile-contact" data-contact>
    <input type="hidden" name="contact_id" value="${value(contact, "id")}" />
    ${input("Name", "contact_name", value(contact, "name"))}
    ${input("Title", "contact_title", value(contact, "title"))}
    ${input("Department / role", "contact_department", value(contact, "department"))}
    ${input("Email", "contact_email", value(contact, "email"), "email")}
    ${input("Phone", "contact_phone", value(contact, "phone"), "tel")}
    ${input("WhatsApp", "contact_whatsapp", value(contact, "whatsapp_phone"), "tel")}
    <label><span>Preferred channel</span><select name="contact_channel"><option value="">Select</option>${["email", "phone", "whatsapp"].map((item) => `<option value="${item}" ${contact.preferred_channel === item ? "selected" : ""}>${item}</option>`).join("")}</select></label>
    <label class="shipper-profile-check"><input type="checkbox" name="contact_primary" ${contact.is_primary ? "checked" : ""} /> <span>Primary contact</span></label>
    <button class="secondary" type="button" data-remove-contact>${t.remove}</button>
  </div>`;
}

function locationRow(location = {}, t = copy.en) {
  return `<div class="shipper-profile-location" data-location>
    <input type="hidden" name="location_id" value="${value(location, "id")}" />
    ${input("Location name", "location_name", value(location, "location_name"))}
    ${input("Location type", "location_type", value(location, "location_type"))}
    ${input("Address", "location_address_1", value(location, "address_line_1"))}
    ${input("City", "location_city", value(location, "city"))}
    ${input("State", "location_state", value(location, "state_code"))}
    ${input("Country", "location_country", value(location, "country_code"))}
    ${input("Postal code", "location_postal", value(location, "postal_code"))}
    ${input("Site contact", "location_contact_name", value(location, "contact_name"))}
    ${input("Site email", "location_contact_email", value(location, "contact_email"), "email")}
    ${input("Site phone", "location_contact_phone", value(location, "contact_phone"), "tel")}
    ${input("Operating hours", "location_hours", value(location, "operating_hours"))}
    <label class="shipper-profile-check"><input type="checkbox" name="location_appointment" ${location.appointment_required ? "checked" : ""} /> <span>Appointment required</span></label>
    ${textarea("Site restrictions or notes", "location_notes", value(location, "notes"))}
    <button class="secondary" type="button" data-remove-location>${t.remove}</button>
  </div>`;
}

function detail(title, body, open = false) {
  return `<details ${open ? "open" : ""}><summary>${title}</summary>${body}</details>`;
}

function render() {
  const t = copy[locale];
  const shipper = profile.shipper || {};
  const data = shipper.profile_data || {};
  const company = data.company || {};
  const onboarding = data.onboarding || {};
  const network = data.network || {};
  const billing = data.billing || {};
  root.innerHTML = `<form id="shipper-profile-form" class="shipper-profile-form">
    <header><div><p class="eyebrow">Rateware customer profile</p><h1>${t.title}</h1><p>${t.intro}</p></div><span class="shipper-profile-expiry">${t.valid} ${escapeHtml(String(profile.request?.expires_at || "").slice(0, 10))}</span></header>
    ${detail(t.company, `<div class="shipper-profile-grid">
      ${input("Company name", "shipper_name", value(shipper, "shipper_name"))}${input("Legal name", "legal_name", value(shipper, "legal_name"))}${input("DBA name", "dba_name", value(company, "dba_name"))}${input("Legal form", "legal_form", value(company, "legal_form"))}
      ${input("Country of origin", "headquarters_country", value(shipper, "headquarters_country"))}${input("Company type", "company_type", value(company, "company_type"))}${input("Industry", "industry", value(shipper, "industry"))}${input("DUNS", "duns_number", value(company, "duns_number"))}
      ${input("Website", "website", value(shipper, "website"), "url")}${input("Business domain", "domain", value(shipper, "domain"))}${input("HQ city", "headquarters_city", value(shipper, "headquarters_city"))}${input("HQ state", "headquarters_state", value(shipper, "headquarters_state"))}
      ${input("Account owner", "owner_name", value(company, "owner_name"))}${input("Account owner phone", "owner_phone", value(company, "owner_phone"), "tel")}${input("Customer source", "source", value(company, "source"))}${input("Customer type / solution", "solution_type", value(company, "solution_type"))}
    </div>`, true)}
    ${detail(t.contacts, `<div id="shipper-profile-contacts">${(profile.contacts || []).map((contact) => contactRow(contact, t)).join("") || contactRow({ name: shipper.primary_contact_name, email: shipper.primary_contact_email, phone: shipper.primary_contact_phone, title: "Primary contact", is_primary: true }, t)}</div><button class="secondary" id="add-shipper-profile-contact" type="button">${t.addContact}</button>`)}
    ${detail(t.locations, `<div id="shipper-profile-locations">${(profile.locations || []).map((location) => locationRow(location, t)).join("") || locationRow({}, t)}</div><button class="secondary" id="add-shipper-profile-location" type="button">${t.addLocation}</button>`)}
    ${detail(t.onboarding, `<div class="shipper-profile-grid">
      ${input("TMS provider", "tms_provider", value(onboarding, "tms_provider"))}${input("Integration method", "integration_method", value(onboarding, "integration_method"))}${input("Integration contact", "integration_contact", value(onboarding, "integration_contact"))}${input("API / EDI capability", "api_edi", value(onboarding, "api_edi"))}
      ${input("Main communication channel", "main_communication", value(onboarding, "main_communication"))}${input("Tracking period", "tracking_period", value(onboarding, "tracking_period"))}${textarea("Operational onboarding notes", "onboarding_notes", value(onboarding, "onboarding_notes"))}
    </div>`)}
    ${detail(t.network, `<div class="shipper-profile-grid">
      ${input("Geographic scope", "geographic_scope", value(network, "geographic_scope"))}${input("Service scope", "service_scope", value(network, "service_scope"))}${input("Mexico regional coverage", "mx_coverage", value(network, "mx_coverage"))}${input("US / Canada coverage", "us_ca_coverage", value(network, "us_ca_coverage"))}
      ${input("Primary cargo", "primary_cargo", value(network, "primary_cargo"))}${textarea("Service or operating requirements", "service_requirements", value(network, "service_requirements"))}
    </div>`)}
    ${detail(t.billing, `<div class="shipper-profile-grid">
      ${input("USA pay-to entity", "usa_pay_to_entity", value(billing, "usa_pay_to_entity"))}${input("USA EIN", "usa_ein", value(billing, "usa_ein"))}${input("USA invoice reference", "usa_invoice_reference", value(billing, "usa_invoice_reference"))}${input("USA credit type", "usa_credit_type", value(billing, "usa_credit_type"))}
      ${input("Mexico pay-to entity", "mex_pay_to_entity", value(billing, "mex_pay_to_entity"))}${input("Mexico RFC", "mex_rfc", value(billing, "mex_rfc"))}${input("Mexico CFDI / tax regime", "mex_cfdi_tax", value(billing, "mex_cfdi_tax"))}${input("Canada / ROW pay-to entity", "can_row_pay_to_entity", value(billing, "can_row_pay_to_entity"))}
      ${input("Tax ID / EIN / RFC", "tax_id", value(billing, "tax_id"))}${input("Credit limit", "credit_limit", value(billing, "credit_limit"))}${input("Credit terms", "credit_terms", value(billing, "credit_terms"))}${input("Billing reference", "billing_reference", value(billing, "billing_reference"))}${textarea("Billing requirements", "billing_notes", value(billing, "billing_notes"))}
    </div>`)}
    <section class="shipper-profile-submit"><div>${input(t.submitter, "submitted_name", "")}${input(t.submitterEmail, "submitted_email", "", "email")}</div><button type="submit">${t.save}</button><p id="shipper-profile-message" aria-live="polite"></p></section>
  </form>`;
}

function readContacts(form) {
  return [...form.querySelectorAll("[data-contact]")].map((row) => ({
    id: row.querySelector('[name="contact_id"]')?.value, name: row.querySelector('[name="contact_name"]')?.value,
    title: row.querySelector('[name="contact_title"]')?.value, department: row.querySelector('[name="contact_department"]')?.value,
    email: row.querySelector('[name="contact_email"]')?.value, phone: row.querySelector('[name="contact_phone"]')?.value,
    whatsapp_phone: row.querySelector('[name="contact_whatsapp"]')?.value, preferred_channel: row.querySelector('[name="contact_channel"]')?.value,
    is_primary: Boolean(row.querySelector('[name="contact_primary"]')?.checked)
  }));
}

function readLocations(form) {
  return [...form.querySelectorAll("[data-location]")].map((row) => ({
    id: row.querySelector('[name="location_id"]')?.value, location_name: row.querySelector('[name="location_name"]')?.value,
    location_type: row.querySelector('[name="location_type"]')?.value, address_line_1: row.querySelector('[name="location_address_1"]')?.value,
    city: row.querySelector('[name="location_city"]')?.value, state_code: row.querySelector('[name="location_state"]')?.value,
    country_code: row.querySelector('[name="location_country"]')?.value, postal_code: row.querySelector('[name="location_postal"]')?.value,
    contact_name: row.querySelector('[name="location_contact_name"]')?.value, contact_email: row.querySelector('[name="location_contact_email"]')?.value,
    contact_phone: row.querySelector('[name="location_contact_phone"]')?.value, operating_hours: row.querySelector('[name="location_hours"]')?.value,
    appointment_required: Boolean(row.querySelector('[name="location_appointment"]')?.checked), notes: row.querySelector('[name="location_notes"]')?.value
  }));
}

function formPayload(form) {
  const fields = Object.fromEntries(new FormData(form).entries());
  const companyKeys = ["dba_name", "legal_form", "company_type", "duns_number", "owner_name", "owner_phone", "source", "solution_type"];
  const onboardingKeys = ["tms_provider", "integration_method", "integration_contact", "api_edi", "main_communication", "tracking_period", "onboarding_notes"];
  const networkKeys = ["geographic_scope", "service_scope", "mx_coverage", "us_ca_coverage", "primary_cargo", "service_requirements"];
  const billingKeys = ["usa_pay_to_entity", "usa_ein", "usa_invoice_reference", "usa_credit_type", "mex_pay_to_entity", "mex_rfc", "mex_cfdi_tax", "can_row_pay_to_entity", "tax_id", "credit_limit", "credit_terms", "billing_reference", "billing_notes"];
  const section = (keys) => Object.fromEntries(keys.map((key) => [key, fields[key]]));
  return {
    shipper: Object.fromEntries(["shipper_name", "legal_name", "headquarters_country", "industry", "website", "domain", "headquarters_city", "headquarters_state"].map((key) => [key, fields[key]])),
    contacts: readContacts(form), locations: readLocations(form),
    profile_data: { company: section(companyKeys), onboarding: section(onboardingKeys), network: section(networkKeys), billing: section(billingKeys) },
    submitted_contact: { name: fields.submitted_name, email: fields.submitted_email }
  };
}

root.addEventListener("click", (event) => {
  if (event.target.closest("#add-shipper-profile-contact")) document.querySelector("#shipper-profile-contacts").insertAdjacentHTML("beforeend", contactRow({}, copy[locale]));
  if (event.target.closest("#add-shipper-profile-location")) document.querySelector("#shipper-profile-locations").insertAdjacentHTML("beforeend", locationRow({}, copy[locale]));
  const contact = event.target.closest("[data-remove-contact]");
  if (contact) contact.closest("[data-contact]")?.remove();
  const location = event.target.closest("[data-remove-location]");
  if (location) location.closest("[data-location]")?.remove();
});

root.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const message = root.querySelector("#shipper-profile-message");
  try {
    const result = await callProfileApi("submit_profile", formPayload(form));
    profile = { ...profile, ...result };
    render();
    root.querySelector("#shipper-profile-message").textContent = copy[locale].submitted;
  } catch (error) {
    if (message) message.textContent = error.message;
  }
});

languageButton.addEventListener("click", () => {
  locale = locale === "en" ? "es" : "en";
  languageButton.textContent = locale === "en" ? "ES" : "EN";
  render();
});

callProfileApi("get_profile").then((data) => { profile = data; render(); }).catch((error) => {
  root.innerHTML = `<h1>Profile unavailable</h1><p>${escapeHtml(error.message)}</p>`;
});
