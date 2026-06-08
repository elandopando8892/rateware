import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { applyPermissionState, initAuthControls, requirePrivatePage } from "./auth.js";
import {
  bulkUpdateVendors,
  createVendor,
  createVendorSegment,
  deleteVendorSegment,
  fetchVendorSegments,
  fetchVendors,
  importVendors,
  updateVendor
} from "./vendor-service.js";

const form = document.querySelector("#vendor-form");
const vendorTabs = document.querySelectorAll(".vendor-tab");
const tabPanels = document.querySelectorAll("[data-tab-panel]");
const vendorMetricTotal = document.querySelector("#vendor-metric-total");
const vendorMetricReady = document.querySelector("#vendor-metric-ready");
const vendorMetricMissingContact = document.querySelector("#vendor-metric-missing-contact");
const vendorMetricDuplicates = document.querySelector("#vendor-metric-duplicates");
const vendorMetricWhatsapp = document.querySelector("#vendor-metric-whatsapp");
const wizardForm = document.querySelector("#vendor-wizard-form");
const wizardStepButtons = document.querySelectorAll(".wizard-step");
const wizardPanels = document.querySelectorAll("[data-step-panel]");
const wizardBackButton = document.querySelector("#wizard-back-button");
const wizardNextButton = document.querySelector("#wizard-next-button");
const wizardSaveButton = document.querySelector("#wizard-save-button");
const wizardStatus = document.querySelector("#wizard-status");
const wizardReview = document.querySelector("#wizard-review");
const statusMessage = document.querySelector("#vendor-status");
const importInput = document.querySelector("#vendor-import");
const importStatus = document.querySelector("#import-status");
const templateButton = document.querySelector("#download-template-button");
const importPreviewPanel = document.querySelector("#import-preview-panel");
const importPreviewSummary = document.querySelector("#import-preview-summary");
const importPreviewBody = document.querySelector("#import-preview-body");
const confirmImportButton = document.querySelector("#confirm-import-button");
const cancelImportButton = document.querySelector("#cancel-import-button");
const confirmImportStatus = document.querySelector("#confirm-import-status");
const vendorsBody = document.querySelector("#vendors-body");
const searchInput = document.querySelector("#vendor-search");
const statusFilter = document.querySelector("#vendor-status-filter");
const refreshButton = document.querySelector("#refresh-vendors-button");
const quickFilterButtons = document.querySelectorAll(".quick-filter");
const bulkToolbar = document.querySelector("#bulk-toolbar");
const bulkSelectionCount = document.querySelector("#bulk-selection-count");
const bulkStatus = document.querySelector("#bulk-status");
const bulkTags = document.querySelector("#bulk-tags");
const bulkButton = document.querySelector("#bulk-update-button");
const bulkStatusMessage = document.querySelector("#bulk-status-message");
const segmentForm = document.querySelector("#segment-form");
const segmentStatusMessage = document.querySelector("#segment-status-message");
const segmentsList = document.querySelector("#segments-list");
const duplicateReviewList = document.querySelector("#duplicate-review-list");
const drawer = document.querySelector("#vendor-drawer");
const closeDrawerButton = document.querySelector("#close-vendor-drawer");
const drawerEditForm = document.querySelector("#drawer-edit-form");
const drawerArchiveButton = document.querySelector("#drawer-archive-button");
const drawerEditStatus = document.querySelector("#drawer-edit-status-message");
let allVendors = [];
let currentVendors = [];
let selectedVendorIds = new Set();
let pendingImportRows = [];
let savedSegments = [];
let wizardStep = 0;
let activeQuickFilter = "all";
let activeDrawerVendorId = null;

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

function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function isValidDomain(value) {
  if (!value) return true;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(value).trim().replace(/^https?:\/\//, "").replace(/^www\./, ""));
}

function importIssues(row) {
  const issues = [];
  if (!row.vendor_name) issues.push("Missing vendor name");
  if (!row.primary_email && !row.whatsapp_phone) issues.push("Missing contact channel");
  if (!isValidEmail(row.primary_email)) issues.push("Invalid email");
  if (!isValidDomain(row.domain)) issues.push("Invalid domain");
  if (duplicateSignals(row).length) issues.push("Possible duplicate");
  return issues;
}

function validImportRows() {
  return pendingImportRows.filter((row) => !importIssues(row).some((issue) => !issue.includes("duplicate")));
}

function downloadVendorTemplate() {
  const headers = [
    "vendor_name",
    "legal_name",
    "domain",
    "contact_name",
    "primary_email",
    "whatsapp_phone",
    "preferred_channel",
    "tags",
    "coverage_notes",
    "notes"
  ];
  const examples = [
    [
      "ABC Logistics",
      "ABC Logistics LLC",
      "abclogistics.com",
      "Jane Doe",
      "pricing@abclogistics.com",
      "+5215550000000",
      "email",
      "mx, cross-border, ftl",
      "MX-US lanes, Laredo, dry van",
      "Preferred for border freight"
    ]
  ];
  const csv = [headers, ...examples]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "rateware-vendor-template.csv";
  link.click();
  URL.revokeObjectURL(url);
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

function isRfxReady(row) {
  return scoreVendor(row) >= 80 && row.primary_email && splitTags(row.tags).length;
}

function hasMissingContact(row) {
  return !row.primary_email && !row.whatsapp_phone;
}

function activateVendorTab(tabName) {
  vendorTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.vendorTab === tabName));
  tabPanels.forEach((panel) => {
    const shouldShow = panel.dataset.tabPanel === tabName;
    const isEmptyImportPreview = panel.id === "import-preview-panel" && !pendingImportRows.length;
    panel.classList.toggle("hidden", !shouldShow || isEmptyImportPreview);
  });
}

function updateBulkState() {
  const count = selectedVendorIds.size;
  bulkToolbar.classList.toggle("hidden", count === 0);
  bulkSelectionCount.textContent = `${count} selected`;
}

function updateVendorMetrics() {
  const rows = allVendors;
  vendorMetricTotal.textContent = rows.length;
  vendorMetricReady.textContent = rows.filter(isRfxReady).length;
  vendorMetricMissingContact.textContent = rows.filter(hasMissingContact).length;
  vendorMetricDuplicates.textContent = rows.filter((row) => duplicateSignals(row, rows).length).length;
  vendorMetricWhatsapp.textContent = rows.filter((row) => row.whatsapp_phone || row.preferred_channel === "whatsapp").length;
}

function duplicateGroups(rows = allVendors) {
  const seen = new Set();
  return rows
    .map((vendor) => {
      if (seen.has(vendor.id)) return null;
      const matches = rows.filter((candidate) => candidate.id !== vendor.id && duplicateSignals(vendor, rows).includes(candidate.vendor_name));
      if (!matches.length) return null;
      seen.add(vendor.id);
      matches.forEach((match) => seen.add(match.id));
      return [vendor, ...matches];
    })
    .filter(Boolean);
}

function renderDuplicateReview() {
  const groups = duplicateGroups();

  if (!groups.length) {
    duplicateReviewList.innerHTML =
      '<div class="empty-state"><strong>No obvious duplicates</strong><span>Duplicate signals will appear here when names, domains, or emails overlap.</span></div>';
    return;
  }

  duplicateReviewList.innerHTML = groups
    .map(
      (group, groupIndex) => `
        <article class="duplicate-card">
          <div class="duplicate-heading">
            <strong>Duplicate set ${groupIndex + 1}</strong>
            <span>${group.length} vendors</span>
          </div>
          ${group
            .map(
              (vendor) => `
                <div class="duplicate-row">
                  <div>
                    <strong>${escapeHtml(vendor.vendor_name)}</strong>
                    <span>${escapeHtml([vendor.domain, vendor.primary_email, vendor.status].filter(Boolean).join(" | "))}</span>
                  </div>
                  <div class="action-row">
                    <button class="small-button" type="button" data-duplicate-open="${escapeHtml(vendor.id)}">Open</button>
                    <button class="small-button secondary" type="button" data-duplicate-inactive="${escapeHtml(vendor.id)}">Mark inactive</button>
                  </div>
                </div>
              `
            )
            .join("")}
        </article>
      `
    )
    .join("");
}

function applyQuickFilter(filter) {
  activeQuickFilter = filter;
  quickFilterButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.quickFilter === filter));

  const rows = allVendors.filter((row) => {
    if (filter === "ready") return isRfxReady(row);
    if (filter === "missing-contact") return hasMissingContact(row);
    if (filter === "duplicates") return duplicateSignals(row, allVendors).length > 0;
    if (filter === "whatsapp") return row.whatsapp_phone || row.preferred_channel === "whatsapp";
    if (filter === "cross-border") return splitTags(row.tags).includes("cross-border") || String(row.coverage_notes || "").toLowerCase().includes("cross-border");
    return true;
  });

  renderVendors(rows);
}

function readWizard() {
  return {
    vendor_name: document.querySelector("#wizard-vendor-name").value,
    legal_name: document.querySelector("#wizard-legal-name").value,
    domain: document.querySelector("#wizard-domain").value,
    contact_name: document.querySelector("#wizard-contact-name").value,
    primary_email: document.querySelector("#wizard-primary-email").value,
    whatsapp_phone: document.querySelector("#wizard-whatsapp-phone").value,
    preferred_channel: document.querySelector("#wizard-preferred-channel").value,
    tags: splitTags(document.querySelector("#wizard-tags").value),
    coverage_notes: document.querySelector("#wizard-coverage-notes").value,
    notes: document.querySelector("#wizard-notes").value
  };
}

function renderWizard() {
  wizardStepButtons.forEach((button) => button.classList.toggle("is-active", Number(button.dataset.wizardStep) === wizardStep));
  wizardPanels.forEach((panel) => panel.classList.toggle("hidden", Number(panel.dataset.stepPanel) !== wizardStep));
  wizardBackButton.disabled = wizardStep === 0;
  wizardNextButton.classList.toggle("hidden", wizardStep === wizardPanels.length - 1);
  wizardSaveButton.classList.toggle("hidden", wizardStep !== wizardPanels.length - 1);

  if (wizardStep === wizardPanels.length - 1) {
    const vendor = readWizard();
    wizardReview.innerHTML = `
      <div><strong>${escapeHtml(vendor.vendor_name || "Unnamed vendor")}</strong><span>${escapeHtml(vendor.domain || "No domain")}</span></div>
      <div><strong>Contact</strong><span>${escapeHtml([vendor.contact_name, vendor.primary_email, vendor.whatsapp_phone].filter(Boolean).join(" | ") || "Missing contact")}</span></div>
      <div><strong>Coverage</strong><span>${escapeHtml(vendor.coverage_notes || "No coverage captured")}</span></div>
      <div><strong>Tags</strong><span>${renderTags(vendor.tags)}</span></div>
      <div><strong>Readiness</strong><span>${scoreVendor(vendor)}% complete</span></div>
    `;
  }
}

function resetWizard() {
  wizardForm.reset();
  wizardStep = 0;
  renderWizard();
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
  updateVendorMetrics();
  updateBulkState();
  renderSegments();
  renderDuplicateReview();

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

function segmentMatches(segment, vendor) {
  const vendorTags = splitTags(vendor.tags);
  const requiredTags = splitTags(segment.tags);
  const hasTags = requiredTags.every((tag) => vendorTags.includes(tag));
  const hasStatus = !segment.status || vendor.status === segment.status;
  const hasChannel = !segment.preferred_channel || vendor.preferred_channel === segment.preferred_channel;
  return hasTags && hasStatus && hasChannel;
}

function renderSegments() {
  if (!segmentsList) return;

  if (!savedSegments.length) {
    segmentsList.innerHTML = '<div class="empty-state"><strong>No saved segments</strong><span>Create lists from tags, status, and channel.</span></div>';
    return;
  }

  segmentsList.innerHTML = savedSegments
    .map((segment) => {
      const matches = currentVendors.filter((vendor) => segmentMatches(segment, vendor));
      return `
        <article class="segment-card">
          <div>
            <strong>${escapeHtml(segment.segment_name)}</strong>
            <span>${matches.length} vendor(s)</span>
          </div>
          <div class="tag-list">${renderTags(segment.tags)}</div>
          <small>${escapeHtml([segment.status, segment.preferred_channel].filter(Boolean).join(" | ") || "Any active filter")}</small>
          <div class="action-row">
            <button class="small-button" type="button" data-segment-filter="${escapeHtml(segment.id)}">Apply</button>
            <button class="small-button danger" type="button" data-segment-delete="${escapeHtml(segment.id)}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadSegments() {
  try {
    savedSegments = await fetchVendorSegments();
    renderSegments();
  } catch (error) {
    segmentsList.innerHTML = `<div class="empty-state"><strong>Could not load segments</strong><span>${escapeHtml(error.message)}</span></div>`;
  }
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
    allVendors = rows;
    applyQuickFilter(activeQuickFilter);
  } catch (error) {
    vendorsBody.innerHTML = `<tr><td colspan="9">Could not load vendors. ${escapeHtml(error.message)}</td></tr>`;
  } finally {
    refreshButton.disabled = false;
  }
}

function readSegmentForm() {
  return {
    segment_name: document.querySelector("#segment-name").value,
    tags: splitTags(document.querySelector("#segment-tags").value),
    status: document.querySelector("#segment-status").value,
    preferred_channel: document.querySelector("#segment-channel").value
  };
}

function normalizeImportedRow(row) {
  return {
    vendor_name: row.vendor_name || row.vendor || row.carrier || row.name || row["Vendor"] || row["Carrier"],
    legal_name: row.legal_name || row["Legal Name"],
    domain: row.domain || row.vendor_domain || row["Domain"],
    contact_name: row.contact_name || row.contact || row["Contact"],
    primary_email: row.primary_email || row.email || row["Email"] || row["Primary Email"],
    whatsapp_phone: row.whatsapp_phone || row.whatsapp || row.phone || row["WhatsApp"] || row["Phone"],
    preferred_channel: row.preferred_channel || row.channel || row["Channel"] || "email",
    tags: row.tags || row.tag || row.services || row.equipment || row.coverage || row["Tags"] || row["Equipment"],
    coverage_notes: row.coverage_notes || row.coverage || row.lanes || row["Coverage"] || row["Lanes"],
    notes: row.notes || row["Notes"]
  };
}

function renderImportPreview() {
  const total = pendingImportRows.length;
  const validRows = validImportRows();
  const duplicateCount = pendingImportRows.filter((row) => duplicateSignals(row).length).length;
  const incompleteCount = pendingImportRows.filter((row) => importIssues(row).some((issue) => !issue.includes("duplicate"))).length;

  importPreviewSummary.innerHTML = `
    <article><strong>${total}</strong><span>Total rows</span></article>
    <article><strong>${validRows.length}</strong><span>Ready to import</span></article>
    <article><strong>${duplicateCount}</strong><span>Duplicate signals</span></article>
    <article><strong>${incompleteCount}</strong><span>Needs cleanup</span></article>
  `;

  importPreviewBody.innerHTML = pendingImportRows
    .slice(0, 50)
    .map((row, index) => {
      const issues = importIssues(row);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(row.vendor_name)}</td>
          <td>${escapeHtml(row.primary_email)}</td>
          <td>${escapeHtml(row.domain)}</td>
          <td><div class="tag-list">${renderTags(row.tags)}</div></td>
          <td>${issues.length ? issues.map((issue) => `<span class="warning-pill">${escapeHtml(issue)}</span>`).join(" ") : '<span class="score-pill strong">Ready</span>'}</td>
        </tr>
      `;
    })
    .join("");

  if (!pendingImportRows.length) {
    importPreviewBody.innerHTML = '<tr><td colspan="6">No rows found.</td></tr>';
  }

  confirmImportButton.disabled = !validRows.length;
  importPreviewPanel.classList.remove("hidden");
  activateVendorTab("import");
}

function setDrawerValue(selector, value) {
  document.querySelector(selector).innerHTML = value || '<span class="muted-text">Not captured</span>';
}

function openVendorDrawer(vendorId) {
  const vendor = allVendors.find((row) => row.id === vendorId) || currentVendors.find((row) => row.id === vendorId);
  if (!vendor) return;

  activeDrawerVendorId = vendor.id;
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
  document.querySelector("#drawer-edit-name").value = vendor.vendor_name || "";
  document.querySelector("#drawer-edit-domain").value = vendor.domain || "";
  document.querySelector("#drawer-edit-contact").value = vendor.contact_name || "";
  document.querySelector("#drawer-edit-email").value = vendor.primary_email || "";
  document.querySelector("#drawer-edit-whatsapp").value = vendor.whatsapp_phone || "";
  document.querySelector("#drawer-edit-channel").value = vendor.preferred_channel || "email";
  document.querySelector("#drawer-edit-status").value = vendor.status || "active";
  document.querySelector("#drawer-edit-tags").value = splitTags(vendor.tags).join(", ");
  document.querySelector("#drawer-edit-coverage").value = vendor.coverage_notes || "";
  document.querySelector("#drawer-edit-notes").value = vendor.notes || "";
  setStatus(drawerEditStatus, "");
  drawer.classList.remove("hidden");
}

function readDrawerPatch() {
  return {
    vendor_name: document.querySelector("#drawer-edit-name").value,
    domain: document.querySelector("#drawer-edit-domain").value,
    contact_name: document.querySelector("#drawer-edit-contact").value,
    primary_email: document.querySelector("#drawer-edit-email").value,
    whatsapp_phone: document.querySelector("#drawer-edit-whatsapp").value,
    preferred_channel: document.querySelector("#drawer-edit-channel").value,
    status: document.querySelector("#drawer-edit-status").value,
    tags: splitTags(document.querySelector("#drawer-edit-tags").value),
    coverage_notes: document.querySelector("#drawer-edit-coverage").value,
    notes: document.querySelector("#drawer-edit-notes").value
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

wizardStepButtons.forEach((button) => {
  button.addEventListener("click", () => {
    wizardStep = Number(button.dataset.wizardStep);
    renderWizard();
  });
});

wizardBackButton.addEventListener("click", () => {
  wizardStep = Math.max(0, wizardStep - 1);
  renderWizard();
});

wizardNextButton.addEventListener("click", () => {
  if (wizardStep === 0 && !document.querySelector("#wizard-vendor-name").value.trim()) {
    setStatus(wizardStatus, "Vendor name is required.", "error");
    return;
  }
  setStatus(wizardStatus, "");
  wizardStep = Math.min(wizardPanels.length - 1, wizardStep + 1);
  renderWizard();
});

wizardForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  wizardSaveButton.disabled = true;
  setStatus(wizardStatus, "Saving vendor...");

  try {
    await requirePrivatePage();
    await createVendor(readWizard());
    resetWizard();
    setStatus(wizardStatus, "Vendor saved.", "success");
    await loadVendors();
  } catch (error) {
    setStatus(wizardStatus, error.message, "error");
  } finally {
    wizardSaveButton.disabled = false;
  }
});

importInput.addEventListener("change", async () => {
  const [file] = importInput.files;
  if (!file) return;

  setStatus(importStatus, "Reading vendor file...");

  try {
    await requirePrivatePage();
    pendingImportRows = (await parseVendorFile(file)).map((vendor) => ({
      ...vendor,
      tags: splitTags(vendor.tags)
    }));
    renderImportPreview();
    setStatus(importStatus, "Review the file before importing.", "success");
  } catch (error) {
    setStatus(importStatus, error.message, "error");
  } finally {
    importInput.value = "";
  }
});

templateButton.addEventListener("click", downloadVendorTemplate);

confirmImportButton.addEventListener("click", async () => {
  const vendors = validImportRows();
  confirmImportButton.disabled = true;
  setStatus(confirmImportStatus, "Importing valid rows...");

  try {
    await requirePrivatePage();
    const result = await importVendors(vendors);
    pendingImportRows = [];
    importPreviewPanel.classList.add("hidden");
    setStatus(importStatus, `${result.inserted} vendor(s) imported.`, "success");
    setStatus(confirmImportStatus, "");
    await loadVendors();
  } catch (error) {
    setStatus(confirmImportStatus, error.message, "error");
  } finally {
    confirmImportButton.disabled = false;
  }
});

cancelImportButton.addEventListener("click", () => {
  pendingImportRows = [];
  importPreviewPanel.classList.add("hidden");
  setStatus(importStatus, "Import canceled.");
  setStatus(confirmImportStatus, "");
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

segmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#save-segment-button");
  button.disabled = true;
  setStatus(segmentStatusMessage, "Saving segment...");

  try {
    await requirePrivatePage();
    await createVendorSegment(readSegmentForm());
    segmentForm.reset();
    setStatus(segmentStatusMessage, "Segment saved.", "success");
    await loadSegments();
  } catch (error) {
    setStatus(segmentStatusMessage, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

segmentsList.addEventListener("click", async (event) => {
  const filterButton = event.target.closest("[data-segment-filter]");
  const deleteButton = event.target.closest("[data-segment-delete]");

  if (filterButton) {
    const segment = savedSegments.find((item) => item.id === filterButton.dataset.segmentFilter);
    if (!segment) return;
    searchInput.value = splitTags(segment.tags).join(", ");
    statusFilter.value = segment.status || "";
    renderVendors(allVendors.filter((vendor) => segmentMatches(segment, vendor)));
  }

  if (deleteButton) {
    deleteButton.disabled = true;
    try {
      await requirePrivatePage();
      await deleteVendorSegment(deleteButton.dataset.segmentDelete);
      await loadSegments();
    } catch (error) {
      deleteButton.title = error.message;
      deleteButton.disabled = false;
    }
  }
});

duplicateReviewList.addEventListener("click", async (event) => {
  const openButton = event.target.closest("[data-duplicate-open]");
  const inactiveButton = event.target.closest("[data-duplicate-inactive]");

  if (openButton) {
    openVendorDrawer(openButton.dataset.duplicateOpen);
    return;
  }

  if (inactiveButton) {
    inactiveButton.disabled = true;
    try {
      await requirePrivatePage();
      await updateVendor(inactiveButton.dataset.duplicateInactive, { status: "inactive" });
      await loadVendors();
    } catch (error) {
      inactiveButton.title = error.message;
      inactiveButton.disabled = false;
    }
  }
});

refreshButton.addEventListener("click", loadVendors);
statusFilter.addEventListener("change", loadVendors);
vendorTabs.forEach((button) => {
  button.addEventListener("click", () => activateVendorTab(button.dataset.vendorTab));
});
quickFilterButtons.forEach((button) => {
  button.addEventListener("click", () => applyQuickFilter(button.dataset.quickFilter));
});
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
  updateBulkState();
});
closeDrawerButton.addEventListener("click", () => drawer.classList.add("hidden"));
drawerEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeDrawerVendorId) return;
  const button = document.querySelector("#drawer-save-button");
  button.disabled = true;
  setStatus(drawerEditStatus, "Saving vendor...");

  try {
    await requirePrivatePage();
    const updated = await updateVendor(activeDrawerVendorId, readDrawerPatch());
    setStatus(drawerEditStatus, "Vendor updated.", "success");
    await loadVendors();
    openVendorDrawer(updated.id);
  } catch (error) {
    setStatus(drawerEditStatus, error.message, "error");
  } finally {
    button.disabled = false;
  }
});
drawerArchiveButton.addEventListener("click", async () => {
  if (!activeDrawerVendorId) return;
  drawerArchiveButton.disabled = true;
  setStatus(drawerEditStatus, "Marking inactive...");

  try {
    await requirePrivatePage();
    const updated = await updateVendor(activeDrawerVendorId, { status: "inactive" });
    setStatus(drawerEditStatus, "Vendor marked inactive.", "success");
    await loadVendors();
    openVendorDrawer(updated.id);
  } catch (error) {
    setStatus(drawerEditStatus, error.message, "error");
  } finally {
    drawerArchiveButton.disabled = false;
  }
});

initAuthControls();
requirePrivatePage()
  .then(() =>
    applyPermissionState(
      "#save-vendor-button, #wizard-save-button, #vendor-import, #bulk-update-button, #confirm-import-button, #save-segment-button, #drawer-save-button, #drawer-archive-button, [data-duplicate-inactive]",
      "vendors:manage"
    )
  )
  .catch(() => {});
renderWizard();
activateVendorTab("directory");
updateBulkState();
loadSegments();
loadVendors();
