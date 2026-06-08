import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { applyPermissionState, initAuthControls, requirePrivatePage } from "./auth.js";
import { bulkUpdateVendors, createVendor, fetchVendors, importVendors } from "./vendor-service.js";

const form = document.querySelector("#vendor-form");
const statusMessage = document.querySelector("#vendor-status");
const importInput = document.querySelector("#vendor-import");
const importStatus = document.querySelector("#import-status");
const vendorsBody = document.querySelector("#vendors-body");
const searchInput = document.querySelector("#vendor-search");
const statusFilter = document.querySelector("#vendor-status-filter");
const refreshButton = document.querySelector("#refresh-vendors-button");
const bulkStatus = document.querySelector("#bulk-status");
const bulkTags = document.querySelector("#bulk-tags");
const bulkButton = document.querySelector("#bulk-update-button");
const bulkStatusMessage = document.querySelector("#bulk-status-message");
const drawer = document.querySelector("#vendor-drawer");
const closeDrawerButton = document.querySelector("#close-vendor-drawer");
let currentVendors = [];
let selectedVendorIds = new Set();

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

function scoreVendor(row) {
  const fields = [
    row.vendor_name,
    row.domain,
    row.contact_name,
    row.primary_email,
    row.whatsapp_phone,
    row.preferred_channel,
    splitTags(row.tags).length,
    row.coverage_notes
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function duplicateSignals(row, rows = currentVendors) {
  const nameKey = normalizeKey(row.vendor_name);
  const domain = String(row.domain || "").toLowerCase();
  const email = String(row.primary_email || "").toLowerCase();

  return rows
    .filter((candidate) => candidate.id !== row.id)
    .filter((candidate) => {
      const candidateName = normalizeKey(candidate.vendor_name);
      return (
        (domain && String(candidate.domain || "").toLowerCase() === domain) ||
        (email && String(candidate.primary_email || "").toLowerCase() === email) ||
        (nameKey && candidateName && (nameKey.includes(candidateName) || candidateName.includes(nameKey)))
      );
    })
    .map((candidate) => candidate.vendor_name);
}

function renderTags(tags) {
  const values = splitTags(tags);
  if (!values.length) return '<span class="muted-text">No tags</span>';
  return values.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("");
}

function renderCompleteness(row) {
  const score = scoreVendor(row);
  const duplicates = duplicateSignals(row);
  const ready = score >= 80 && row.primary_email && splitTags(row.tags).length;
  const tone = ready ? "strong" : score >= 55 ? "medium" : "weak";
  return `
    <div class="fit-stack">
      <span class="score-pill ${tone}">${ready ? "RFx ready" : `${score}%`}</span>
      ${duplicates.length ? '<span class="warning-pill">Duplicate?</span>' : ""}
    </div>
  `;
}

function readForm() {
  return {
    vendor_name: document.querySelector("#vendor-name").value,
    domain: document.querySelector("#vendor-domain").value,
    contact_name: document.querySelector("#contact-name").value,
    primary_email: document.querySelector("#primary-email").value,
    whatsapp_phone: document.querySelector("#whatsapp-phone").value,
    preferred_channel: document.querySelector("#preferred-channel").value,
    tags: splitTags(document.querySelector("#vendor-tags").value),
    coverage_notes: document.querySelector("#coverage-notes").value,
    notes: document.querySelector("#vendor-notes").value
  };
}

function renderVendors(rows) {
  currentVendors = rows;

  if (!rows.length) {
    vendorsBody.innerHTML =
      '<tr><td colspan="9"><div class="empty-state"><strong>No vendors yet</strong><span>Add a vendor manually or import your carrier list.</span></div></td></tr>';
    return;
  }

  vendorsBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td><input class="vendor-select" type="checkbox" data-vendor-id="${escapeHtml(row.id)}" ${selectedVendorIds.has(row.id) ? "checked" : ""} /></td>
          <td>
            <button class="link-button vendor-profile-button" type="button" data-vendor-id="${escapeHtml(row.id)}">
              ${escapeHtml(row.vendor_name)}
            </button>
          </td>
          <td>${escapeHtml(row.domain)}</td>
          <td>${escapeHtml(row.contact_name)}</td>
          <td>${escapeHtml(row.primary_email)}</td>
          <td>${renderCompleteness(row)}</td>
          <td><div class="tag-list">${renderTags(row.tags)}</div></td>
          <td>${escapeHtml(row.preferred_channel)}</td>
          <td><span class="status-pill">${escapeHtml(row.status)}</span></td>
        </tr>
      `
    )
    .join("");
}

async function loadVendors() {
  vendorsBody.innerHTML = '<tr><td colspan="9">Loading vendors...</td></tr>';
  refreshButton.disabled = true;

  try {
    await requirePrivatePage();
    const rows = await fetchVendors({
      search: searchInput.value,
      status: statusFilter.value
    });
    renderVendors(rows);
  } catch (error) {
    vendorsBody.innerHTML = `<tr><td colspan="9">Could not load vendors. ${escapeHtml(error.message)}</td></tr>`;
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
    tags: row.tags || row.tag || row.services || row.equipment || row.coverage || row["Tags"] || row["Equipment"],
    coverage_notes: row.coverage_notes || row.coverage || row.lanes || row["Coverage"] || row["Lanes"],
    notes: row.notes || row["Notes"]
  };
}

function setDrawerValue(selector, value) {
  document.querySelector(selector).innerHTML = value || '<span class="muted-text">Not captured</span>';
}

function openVendorDrawer(vendorId) {
  const vendor = currentVendors.find((row) => row.id === vendorId);
  if (!vendor) return;

  const duplicates = duplicateSignals(vendor);
  document.querySelector("#drawer-vendor-name").textContent = vendor.vendor_name || "Vendor";
  setDrawerValue("#drawer-completeness", `${scoreVendor(vendor)}% complete`);
  setDrawerValue(
    "#drawer-contact",
    [vendor.contact_name, vendor.primary_email, vendor.whatsapp_phone].filter(Boolean).map(escapeHtml).join("<br>")
  );
  setDrawerValue("#drawer-channel", escapeHtml(vendor.preferred_channel));
  setDrawerValue("#drawer-tags", `<div class="tag-list">${renderTags(vendor.tags)}</div>`);
  setDrawerValue("#drawer-coverage", escapeHtml(vendor.coverage_notes));
  setDrawerValue("#drawer-duplicates", duplicates.length ? duplicates.map(escapeHtml).join("<br>") : "No obvious duplicates");
  setDrawerValue("#drawer-notes", escapeHtml(vendor.notes));
  drawer.classList.remove("hidden");
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

bulkButton.addEventListener("click", async () => {
  const ids = Array.from(selectedVendorIds);
  const patch = {};
  if (bulkStatus.value) patch.status = bulkStatus.value;
  if (bulkTags.value.trim()) {
    patch.add_tags = splitTags(bulkTags.value);
  }

  if (!ids.length) {
    setStatus(bulkStatusMessage, "Select at least one vendor.", "error");
    return;
  }

  if (!Object.keys(patch).length) {
    setStatus(bulkStatusMessage, "Choose a status or tags to apply.", "error");
    return;
  }

  bulkButton.disabled = true;
  setStatus(bulkStatusMessage, "Updating vendors...");

  try {
    await requirePrivatePage();
    const result = await bulkUpdateVendors(ids, patch);
    selectedVendorIds = new Set();
    bulkStatus.value = "";
    bulkTags.value = "";
    setStatus(bulkStatusMessage, `${result.updated} vendor(s) updated.`, "success");
    await loadVendors();
  } catch (error) {
    setStatus(bulkStatusMessage, error.message, "error");
  } finally {
    bulkButton.disabled = false;
  }
});

refreshButton.addEventListener("click", loadVendors);
statusFilter.addEventListener("change", loadVendors);
searchInput.addEventListener("input", () => {
  window.clearTimeout(searchInput._timer);
  searchInput._timer = window.setTimeout(loadVendors, 300);
});
vendorsBody.addEventListener("click", (event) => {
  const button = event.target.closest(".vendor-profile-button");
  if (!button) return;
  openVendorDrawer(button.dataset.vendorId);
});
vendorsBody.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".vendor-select");
  if (!checkbox) return;
  if (checkbox.checked) selectedVendorIds.add(checkbox.dataset.vendorId);
  else selectedVendorIds.delete(checkbox.dataset.vendorId);
});
closeDrawerButton.addEventListener("click", () => drawer.classList.add("hidden"));

initAuthControls();
requirePrivatePage()
  .then(() => applyPermissionState("#save-vendor-button, #vendor-import, #bulk-update-button", "vendors:manage"))
  .catch(() => {});
loadVendors();
