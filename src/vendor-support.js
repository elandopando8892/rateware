import { applyPermissionState, initAuthControls, requirePrivatePage } from "./auth.js";
import { humanizeError } from "./error-copy.js";
import { fetchVendorSupportTickets, updateVendorSupportTicket } from "./vendor-support-service.js";

const refreshButton = document.querySelector("#refresh-support-tickets");
const statusFilter = document.querySelector("#support-status-filter");
const priorityFilter = document.querySelector("#support-priority-filter");
const searchInput = document.querySelector("#support-search");
const clearFiltersButton = document.querySelector("#clear-support-filters");
const statusMessage = document.querySelector("#support-status-message");
const supportBody = document.querySelector("#support-ticket-body");
const metricTotal = document.querySelector("#support-total");
const metricOpen = document.querySelector("#support-open");
const metricInProgress = document.querySelector("#support-in-progress");
const metricResolved = document.querySelector("#support-resolved");
const metricGoogleChat = document.querySelector("#support-google-chat");

let supportRows = [];
let searchTimer = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function statusLabel(value) {
  const labels = {
    open: "Open",
    in_progress: "In progress",
    resolved: "Resolved",
    archived: "Archived"
  };
  return labels[value] || "Open";
}

function priorityClass(value) {
  if (value === "urgent") return "danger";
  if (value === "high") return "warning";
  if (value === "low") return "muted";
  return "neutral";
}

function googleChatLabel(row) {
  const status = row.google_chat_sync_status || "";
  if (status === "synced") return '<span class="status-pill success">Synced</span>';
  if (status === "error") return '<span class="status-pill danger">Error</span>';
  if (status === "pending") return '<span class="status-pill warning">Pending</span>';
  return '<span class="status-pill muted">Not linked</span>';
}

function setStatus(message = "", tone = "neutral") {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function renderMetrics(summary = {}) {
  metricTotal.textContent = String(summary.total || 0);
  metricOpen.textContent = String(summary.open || 0);
  metricInProgress.textContent = String(summary.in_progress || 0);
  metricResolved.textContent = String(summary.resolved || 0);
  metricGoogleChat.textContent = String(summary.google_chat_synced || 0);
}

function rowDetail(row) {
  return [
    row.rfx_id || row.rfx_name,
    row.route,
    row.event_customer ? `Customer: ${row.event_customer}` : null,
    row.due_date ? `Due: ${row.due_date}` : null
  ].filter(Boolean).join(" | ");
}

function renderRows(rows = supportRows) {
  if (!supportBody) return;
  if (!rows.length) {
    supportBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state compact-empty">
            <strong>No support tickets in current filters</strong>
            <span>Tickets are created from Bid Room support questions and invitation requests that need human follow-up.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  supportBody.innerHTML = rows.map((row) => `
    <tr data-support-ticket-id="${escapeHtml(row.id)}">
      <td>
        <strong>${escapeHtml((row.id || "").slice(0, 8))}</strong>
        <small>${escapeHtml(formatDate(row.occurred_at || row.created_at))}</small>
      </td>
      <td>
        <strong>${escapeHtml(row.vendor_name || "Unknown vendor")}</strong>
        <small>${escapeHtml(row.vendor_domain || row.contact_email || "-")}</small>
      </td>
      <td>
        <strong>${escapeHtml(rowDetail(row) || "No RFx context")}</strong>
        <small>${escapeHtml(row.public_context ? "Public board" : "Private Bid Room")}</small>
      </td>
      <td>
        <span>${escapeHtml(row.question || row.body_preview || "-")}</span>
        ${row.answer ? `<small>${escapeHtml(row.answer)}</small>` : ""}
      </td>
      <td>
        <select data-support-field="priority">
          ${["urgent", "high", "normal", "low"].map((priority) => `<option value="${priority}" ${row.priority === priority ? "selected" : ""}>${priority}</option>`).join("")}
        </select>
        <span class="status-pill ${priorityClass(row.priority)}">${escapeHtml(row.priority || "normal")}</span>
      </td>
      <td>
        <select data-support-field="support_status">
          ${["open", "in_progress", "resolved", "archived"].map((status) => `<option value="${status}" ${row.support_status === status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}
        </select>
      </td>
      <td>${googleChatLabel(row)}</td>
      <td>
        <button class="small-button secondary" type="button" data-support-action="in_progress">Take</button>
        <button class="small-button" type="button" data-support-action="resolved">Resolve</button>
        <a class="secondary small-button" href="./vendors.html?vendor_id=${encodeURIComponent(row.vendor_id || "")}">Vendor</a>
      </td>
    </tr>
  `).join("");
}

function readFilters() {
  return {
    status: statusFilter?.value || "all",
    priority: priorityFilter?.value || "all",
    search: searchInput?.value || "",
    limit: 1000
  };
}

async function loadSupportTickets() {
  setStatus("Loading support tickets...");
  if (supportBody) supportBody.innerHTML = '<tr><td colspan="8">Loading support tickets...</td></tr>';
  try {
    await requirePrivatePage();
    const result = await fetchVendorSupportTickets(readFilters());
    supportRows = result.rows || [];
    renderMetrics(result.summary || {});
    renderRows();
    setStatus(`${supportRows.length.toLocaleString()} ticket(s) loaded.`, "success");
  } catch (error) {
    supportRows = [];
    renderMetrics();
    supportBody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state error-state">
            <strong>Vendor support could not load</strong>
            <span>${escapeHtml(humanizeError(error))}</span>
            <button type="button" data-support-retry>Retry</button>
          </div>
        </td>
      </tr>
    `;
    setStatus(humanizeError(error), "error");
  }
}

async function updateTicket(id, patch) {
  if (!id) return;
  setStatus("Updating support ticket...");
  try {
    await requirePrivatePage();
    const row = await updateVendorSupportTicket(id, patch);
    supportRows = supportRows.map((item) => (item.id === id ? { ...item, ...row } : item));
    renderRows();
    setStatus("Support ticket updated.", "success");
  } catch (error) {
    setStatus(humanizeError(error), "error");
  }
}

refreshButton?.addEventListener("click", loadSupportTickets);
clearFiltersButton?.addEventListener("click", () => {
  statusFilter.value = "all";
  priorityFilter.value = "all";
  searchInput.value = "";
  loadSupportTickets();
});
[statusFilter, priorityFilter].forEach((control) => control?.addEventListener("change", loadSupportTickets));
searchInput?.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadSupportTickets, 250);
});
supportBody?.addEventListener("click", async (event) => {
  if (event.target.closest("[data-support-retry]")) {
    await loadSupportTickets();
    return;
  }
  const button = event.target.closest("[data-support-action]");
  if (!button) return;
  const row = button.closest("[data-support-ticket-id]");
  await updateTicket(row?.dataset.supportTicketId, { status: button.dataset.supportAction });
});
supportBody?.addEventListener("change", async (event) => {
  const field = event.target.closest("[data-support-field]");
  if (!field) return;
  const row = field.closest("[data-support-ticket-id]");
  await updateTicket(row?.dataset.supportTicketId, { [field.dataset.supportField]: field.value });
});

applyPermissionState();
initAuthControls();
loadSupportTickets();
