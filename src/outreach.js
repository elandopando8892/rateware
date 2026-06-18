import { initAuthControls, requirePrivatePage } from "./auth.js";
import { fetchRfxEvents } from "./rfx-service.js";
import {
  createOutreachCampaign,
  createOutreachTemplate,
  fetchContactHistory,
  fetchOutreachCampaigns,
  fetchOutreachMessages,
  fetchOutreachTemplates,
  generateOutreachDrafts,
  markOutreachMessages
} from "./outreach-service.js";

const templateForm = document.querySelector("#outreach-template-form");
const templateName = document.querySelector("#template-name");
const templateChannel = document.querySelector("#template-channel");
const templateSubject = document.querySelector("#template-subject");
const templateHtml = document.querySelector("#template-html");
const templateWhatsapp = document.querySelector("#template-whatsapp");
const templateStatus = document.querySelector("#template-status");
const templateList = document.querySelector("#template-list");
const campaignForm = document.querySelector("#outreach-campaign-form");
const campaignName = document.querySelector("#campaign-name");
const campaignRfxEvent = document.querySelector("#campaign-rfx-event");
const campaignTemplate = document.querySelector("#campaign-template");
const campaignChannel = document.querySelector("#campaign-channel");
const campaignStatus = document.querySelector("#campaign-status");
const campaignList = document.querySelector("#campaign-list");
const refreshButton = document.querySelector("#refresh-outreach");
const generateDraftsButton = document.querySelector("#generate-drafts-button");
const markQueuedButton = document.querySelector("#mark-queued-button");
const markSentButton = document.querySelector("#mark-sent-button");
const archiveMessagesButton = document.querySelector("#archive-messages-button");
const messageBody = document.querySelector("#outreach-message-body");
const historyList = document.querySelector("#contact-history-list");
const draftTitle = document.querySelector("#outreach-draft-title");
const selectionCount = document.querySelector("#outreach-selection-count");
const actionStatus = document.querySelector("#outreach-action-status");
const metricCampaigns = document.querySelector("#outreach-metric-campaigns");
const metricDrafts = document.querySelector("#outreach-metric-drafts");
const metricSent = document.querySelector("#outreach-metric-sent");
const metricHistory = document.querySelector("#outreach-metric-history");

let rfxEvents = [];
let templates = [];
let campaigns = [];
let messages = [];
let historyRows = [];
let selectedCampaignId = null;
let selectedMessageIds = new Set();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(element, message, tone = "neutral") {
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
}

function formatCount(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function vendorName(row) {
  const vendor = row.vendors || {};
  return vendor.vendor_name || vendor.domain || row.recipient_email || row.recipient_phone || "Vendor";
}

function laneLabel(row) {
  const event = row.rfx_events || {};
  const lane = row.rfx_lanes || {};
  return `${event.rfx_id || "-"} | ${lane.origin || "-"} -> ${lane.destination || "-"}`;
}

function updateMetrics() {
  metricCampaigns.textContent = formatCount(campaigns.length);
  metricDrafts.textContent = formatCount(messages.filter((row) => row.status === "drafted" || row.status === "queued").length);
  metricSent.textContent = formatCount(messages.filter((row) => row.status === "sent").length);
  metricHistory.textContent = formatCount(historyRows.length);
}

function updateSelection() {
  const count = selectedMessageIds.size;
  selectionCount.textContent = `${count} selected`;
  markQueuedButton.disabled = !count;
  markSentButton.disabled = !count;
  archiveMessagesButton.disabled = !count;
}

function renderTemplateSelects() {
  campaignTemplate.innerHTML = templates.map((template) => `
    <option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}${template.owner_email ? "" : " (default)"}</option>
  `).join("");
}

function renderRfxSelects() {
  campaignRfxEvent.innerHTML = rfxEvents.length
    ? rfxEvents.map((event) => `<option value="${escapeHtml(event.id)}">${escapeHtml(event.rfx_id || event.name)} | ${escapeHtml(event.name || "")}</option>`).join("")
    : "<option value=\"\">Create an RFx event first</option>";
}

function renderTemplates() {
  renderTemplateSelects();
  if (!templates.length) {
    templateList.innerHTML = "<article>No templates yet.</article>";
    return;
  }
  templateList.innerHTML = templates.map((template) => `
    <article>
      <div>
        <strong>${escapeHtml(template.name)}</strong>
        <span>${escapeHtml(template.channel)}${template.owner_email ? "" : " | global default"}</span>
      </div>
      <small>${escapeHtml(template.subject || "No subject")}</small>
    </article>
  `).join("");
}

function renderCampaigns() {
  if (!selectedCampaignId && campaigns[0]) selectedCampaignId = campaigns[0].id;
  generateDraftsButton.disabled = !selectedCampaignId;
  if (!campaigns.length) {
    campaignList.innerHTML = "<article>No outreach campaigns yet.</article>";
    return;
  }
  campaignList.innerHTML = campaigns.map((campaign) => `
    <button class="outreach-campaign-card ${campaign.id === selectedCampaignId ? "is-active" : ""}" type="button" data-campaign-id="${escapeHtml(campaign.id)}">
      <span>${escapeHtml(campaign.status || "draft")}</span>
      <strong>${escapeHtml(campaign.name)}</strong>
      <small>${escapeHtml(campaign.rfx_events?.rfx_id || "No RFx")} | ${escapeHtml(campaign.outreach_templates?.name || "No template")}</small>
      <b>${formatCount(campaign.message_count)} messages / ${formatCount(campaign.sent_count)} sent</b>
    </button>
  `).join("");
}

function renderMessages() {
  updateSelection();
  updateMetrics();
  if (!selectedCampaignId) {
    messageBody.innerHTML = `<tr><td colspan="8">Create or select a campaign.</td></tr>`;
    return;
  }
  if (!messages.length) {
    messageBody.innerHTML = `<tr><td colspan="8">No drafts yet. Generate drafts from the selected RFx shortlist.</td></tr>`;
    return;
  }
  messageBody.innerHTML = messages.map((message) => {
    const draft = message.channel === "email"
      ? `<button class="small-button" type="button" data-open-url="${escapeHtml(message.gmail_compose_url || "")}" ${message.gmail_compose_url ? "" : "disabled"}>Open Gmail</button>`
      : `<button class="small-button" type="button" data-open-url="${escapeHtml(message.whatsapp_url || "")}" ${message.whatsapp_url ? "" : "disabled"}>Open WhatsApp</button>`;
    const copyHtml = message.html_body ? `<button class="secondary small-button" type="button" data-copy-html="${escapeHtml(message.id)}">Copy HTML</button>` : "";
    return `
      <tr data-message-id="${escapeHtml(message.id)}">
        <td><input type="checkbox" data-message-select="${escapeHtml(message.id)}" ${selectedMessageIds.has(message.id) ? "checked" : ""} /></td>
        <td>${escapeHtml(vendorName(message))}</td>
        <td>${escapeHtml(laneLabel(message))}</td>
        <td><span class="status-pill">${escapeHtml(message.channel)}</span></td>
        <td>${escapeHtml(message.recipient_email || message.recipient_phone || "-")}</td>
        <td><span class="status-pill">${escapeHtml(message.status)}</span></td>
        <td>${escapeHtml(message.subject || message.whatsapp_text || message.text_body || "-").slice(0, 140)}</td>
        <td class="compact-actions">${draft}${copyHtml}</td>
      </tr>
    `;
  }).join("");
}

function renderHistory() {
  updateMetrics();
  if (!historyRows.length) {
    historyList.innerHTML = "<article>No contact history yet.</article>";
    return;
  }
  historyList.innerHTML = historyRows.slice(0, 80).map((item) => `
    <article>
      <span>${escapeHtml(item.channel)} | ${escapeHtml(item.status)} | ${escapeHtml(new Date(item.occurred_at || item.created_at).toLocaleString())}</span>
      <strong>${escapeHtml(item.vendors?.vendor_name || item.vendors?.domain || "Vendor")}</strong>
      <small>${escapeHtml(item.outreach_campaigns?.name || "")}${item.rfx_events?.rfx_id ? ` | ${escapeHtml(item.rfx_events.rfx_id)}` : ""}</small>
      <p>${escapeHtml(item.body_preview || item.subject || "")}</p>
    </article>
  `).join("");
}

async function loadMessages(campaignId = selectedCampaignId) {
  if (!campaignId) {
    messages = [];
    renderMessages();
    return;
  }
  selectedCampaignId = campaignId;
  const campaign = campaigns.find((item) => item.id === campaignId);
  draftTitle.textContent = campaign ? `${campaign.name} drafts` : "Generated messages";
  messages = await fetchOutreachMessages({ campaign_id: campaignId });
  selectedMessageIds = new Set([...selectedMessageIds].filter((id) => messages.some((message) => message.id === id)));
  renderMessages();
}

async function loadAll() {
  setStatus(actionStatus, "Loading outreach...");
  try {
    [rfxEvents, templates, campaigns, historyRows] = await Promise.all([
      fetchRfxEvents(),
      fetchOutreachTemplates(),
      fetchOutreachCampaigns(),
      fetchContactHistory()
    ]);
    renderRfxSelects();
    renderTemplates();
    renderCampaigns();
    renderHistory();
    await loadMessages(selectedCampaignId);
    setStatus(actionStatus, "Outreach ready.", "success");
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
  }
}

initAuthControls();
requirePrivatePage().then((session) => {
  if (session?.token) loadAll();
});

refreshButton?.addEventListener("click", loadAll);

templateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(templateStatus, "Saving template...");
  try {
    await createOutreachTemplate({
      name: templateName.value,
      channel: templateChannel.value,
      subject: templateSubject.value,
      html_body: templateHtml.value,
      whatsapp_body: templateWhatsapp.value
    });
    templateForm.reset();
    setStatus(templateStatus, "Template saved.", "success");
    templates = await fetchOutreachTemplates();
    renderTemplates();
  } catch (error) {
    setStatus(templateStatus, error.message, "error");
  }
});

campaignForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(campaignStatus, "Creating campaign...");
  try {
    const campaign = await createOutreachCampaign({
      name: campaignName.value,
      rfx_event_id: campaignRfxEvent.value,
      template_id: campaignTemplate.value,
      channel: campaignChannel.value
    });
    selectedCampaignId = campaign.id;
    campaignForm.reset();
    setStatus(campaignStatus, "Campaign created.", "success");
    campaigns = await fetchOutreachCampaigns();
    renderCampaigns();
    await loadMessages(selectedCampaignId);
  } catch (error) {
    setStatus(campaignStatus, error.message, "error");
  }
});

campaignList?.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-campaign-id]");
  if (!card) return;
  selectedCampaignId = card.dataset.campaignId;
  renderCampaigns();
  await loadMessages(selectedCampaignId);
});

generateDraftsButton?.addEventListener("click", async () => {
  if (!selectedCampaignId) return;
  generateDraftsButton.disabled = true;
  setStatus(actionStatus, "Generating Gmail and WhatsApp drafts...");
  try {
    const result = await generateOutreachDrafts(selectedCampaignId);
    setStatus(actionStatus, `${result.generated || 0} draft(s) generated. ${result.skipped?.length || 0} skipped.`, "success");
    campaigns = await fetchOutreachCampaigns();
    historyRows = await fetchContactHistory();
    renderCampaigns();
    renderHistory();
    await loadMessages(selectedCampaignId);
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
  } finally {
    generateDraftsButton.disabled = !selectedCampaignId;
  }
});

messageBody?.addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-message-select]");
  if (!checkbox) return;
  if (checkbox.checked) selectedMessageIds.add(checkbox.dataset.messageSelect);
  else selectedMessageIds.delete(checkbox.dataset.messageSelect);
  updateSelection();
});

messageBody?.addEventListener("click", async (event) => {
  const openButton = event.target.closest("[data-open-url]");
  if (openButton) {
    const url = openButton.dataset.openUrl;
    if (url) window.open(url, "_blank", "noopener");
    return;
  }
  const copyButton = event.target.closest("[data-copy-html]");
  if (copyButton) {
    const message = messages.find((item) => item.id === copyButton.dataset.copyHtml);
    if (!message?.html_body) return;
    try {
      await navigator.clipboard.writeText(message.html_body);
      setStatus(actionStatus, "HTML copied.", "success");
    } catch (error) {
      setStatus(actionStatus, error.message, "error");
    }
  }
});

async function markSelected(status) {
  const ids = [...selectedMessageIds];
  if (!ids.length) return;
  setStatus(actionStatus, `Marking ${ids.length} message(s) ${status}...`);
  try {
    const result = await markOutreachMessages(ids, status);
    setStatus(actionStatus, `${result.updated || 0} message(s) updated.`, "success");
    selectedMessageIds.clear();
    historyRows = await fetchContactHistory();
    renderHistory();
    await loadMessages(selectedCampaignId);
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
  }
}

markQueuedButton?.addEventListener("click", () => markSelected("queued"));
markSentButton?.addEventListener("click", () => markSelected("sent"));
archiveMessagesButton?.addEventListener("click", () => markSelected("archived"));
