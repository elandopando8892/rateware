import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { applyPermissionState, initAuthControls, requirePrivatePage } from "./auth.js";
import { createVendor, fetchVendors, importVendors } from "./vendor-service.js";

const form = document.querySelector("#vendor-form");
const statusMessage = document.querySelector("#vendor-status");
const importInput = document.querySelector("#vendor-import");
const importStatus = document.querySelector("#import-status");
const vendorsBody = document.querySelector("#vendors-body");
const searchInput = document.querySelector("#vendor-search");
const statusFilter = document.querySelector("#vendor-status-filter");
const refreshButton = document.querySelector("#refresh-vendors-button");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(element, message, tone = "neutral") {
  element.textContent = message;
  element.dataset.tone = tone;
}

function readForm() {
  return {
    vendor_name: document.querySelector("#vendor-name").value,
    domain: document.querySelector("#vendor-domain").value,
    contact_name: document.querySelector("#contact-name").value,
    primary_email: document.querySelector("#primary-email").value,
    whatsapp_phone: document.querySelector("#whatsapp-phone").value,
    preferred_channel: document.querySelector("#preferred-channel").value,
    notes: document.querySelector("#vendor-notes").value
  };
}

function renderVendors(rows) {
  if (!rows.length) {
    vendorsBody.innerHTML =
      '<tr><td colspan="7"><div class="empty-state"><strong>No vendors yet</strong><span>Add a vendor manually or import your carrier list.</span></div></td></tr>';
    return;
  }

  vendorsBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.vendor_name)}</td>
          <td>${escapeHtml(row.domain)}</td>
          <td>${escapeHtml(row.contact_name)}</td>
          <td>${escapeHtml(row.primary_email)}</td>
          <td>${escapeHtml(row.whatsapp_phone)}</td>
          <td>${escapeHtml(row.preferred_channel)}</td>
          <td><span class="status-pill">${escapeHtml(row.status)}</span></td>
        </tr>
      `
    )
    .join("");
}

async function loadVendors() {
  vendorsBody.innerHTML = '<tr><td colspan="7">Loading vendors...</td></tr>';
  refreshButton.disabled = true;

  try {
    await requirePrivatePage();
    const rows = await fetchVendors({
      search: searchInput.value,
      status: statusFilter.value
    });
    renderVendors(rows);
  } catch (error) {
    vendorsBody.innerHTML = `<tr><td colspan="7">Could not load vendors. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

function normalizeImportedRow(row) {
  return {
    vendor_name: row.vendor_name || row.vendor || row.carrier || row.name || row["Vendor"] || row["Carrier"],
    domain: row.domain || row.vendor_domain || row["Domain"],
    contact_name: row.contact_name || row.contact || row["Contact"],
    primary_email: row.primary_email || row.email || row["Email"],
    whatsapp_phone: row.whatsapp_phone || row.whatsapp || row.phone || row["WhatsApp"] || row["Phone"],
    preferred_channel: row.preferred_channel || row.channel || row["Channel"] || "email",
    notes: row.notes || row["Notes"]
  };
}

async function parseVendorFile(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { defval: "" }).map(normalizeImportedRow);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#save-vendor-button");
  button.disabled = true;
  setStatus(statusMessage, "Saving vendor...");

  try {
    await requirePrivatePage();
    await createVendor(readForm());
    form.reset();
    setStatus(statusMessage, "Vendor saved.", "success");
    await loadVendors();
  } catch (error) {
    setStatus(statusMessage, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

importInput.addEventListener("change", async () => {
  const [file] = importInput.files;
  if (!file) return;

  setStatus(importStatus, "Importing vendors...");

  try {
    await requirePrivatePage();
    const vendors = (await parseVendorFile(file)).filter((vendor) => vendor.vendor_name);
    const result = await importVendors(vendors);
    setStatus(importStatus, `${result.inserted} vendor(s) imported.`, "success");
    await loadVendors();
  } catch (error) {
    setStatus(importStatus, error.message, "error");
  } finally {
    importInput.value = "";
  }
});

refreshButton.addEventListener("click", loadVendors);
statusFilter.addEventListener("change", loadVendors);
searchInput.addEventListener("input", () => {
  window.clearTimeout(searchInput._timer);
  searchInput._timer = window.setTimeout(loadVendors, 300);
});

initAuthControls();
requirePrivatePage()
  .then(() => applyPermissionState("#save-vendor-button, #vendor-import", "vendors:manage"))
  .catch(() => {});
loadVendors();
