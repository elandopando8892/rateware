import { initAuthControls, requirePrivatePage } from "./auth.js";
import { fetchRfxEvents } from "./rfx-service.js";
import {
  archiveOutreachCampaign,
  archiveOutreachTemplate,
  createOutreachCampaign,
  createOutreachTemplate,
  deleteOutreachCampaign,
  deleteOutreachTemplate,
  duplicateOutreachCampaign,
  duplicateOutreachTemplate,
  fetchContactHistory,
  fetchOutreachCampaigns,
  fetchOutreachMessages,
  fetchOutreachTemplates,
  generateOutreachDrafts,
  markOutreachMessages,
  publishOutreachTemplateToWhatsapp,
  syncOutreachWhatsappTemplates,
  updateOutreachCampaign,
  updateOutreachTemplate
} from "./outreach-service.js?v=20260711-whatsapp-automatic-v3";
import { humanizeError } from "./error-copy.js";
import { stateBlock, tableState } from "./ui-state.js";
import { initWorkbenchTabs } from "./workbench-tabs.js";

const templateForm = document.querySelector("#outreach-template-form");
const templateName = document.querySelector("#template-name");
const templateChannel = document.querySelector("#template-channel");
const templateSubject = document.querySelector("#template-subject");
const templateHtml = document.querySelector("#template-html");
const templateWhatsapp = document.querySelector("#template-whatsapp");
const templateStatus = document.querySelector("#template-status");
const outreachWhatsappTemplateStatus = document.querySelector("#outreach-whatsapp-template-status");
const outreachPublishWhatsappTemplateButton = document.querySelector("#outreach-publish-whatsapp-template");

function metaNotifierStatus(value = "NOT_PUBLISHED") {
  const normalized = String(value || "NOT_PUBLISHED").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (["PENDING_REVIEW", "UNDER_REVIEW"].includes(normalized)) return "IN_REVIEW";
  return normalized || "NOT_PUBLISHED";
}

function metaNotifierStatusLabel(value = "NOT_PUBLISHED") {
  return metaNotifierStatus(value).toLowerCase().replace(/_/g, " ");
}

function metaNotifierPendingReview(value = "NOT_PUBLISHED") {
  return ["PENDING", "IN_REVIEW", "IN_APPEAL"].includes(metaNotifierStatus(value));
}
const outreachSyncWhatsappTemplatesButton = document.querySelector("#outreach-sync-whatsapp-templates");
const templateList = document.querySelector("#template-list");
const campaignForm = document.querySelector("#outreach-campaign-form");
const campaignName = document.querySelector("#campaign-name");
const campaignRfxEvent = document.querySelector("#campaign-rfx-event");
const campaignTemplate = document.querySelector("#campaign-template");
const campaignChannel = document.querySelector("#campaign-channel");
const createCampaignButton = document.querySelector("#create-campaign-button");
const editCampaignButton = document.querySelector("#edit-campaign-button");
const duplicateCampaignButton = document.querySelector("#duplicate-campaign-button");
const archiveCampaignButton = document.querySelector("#archive-campaign-button");
const deleteCampaignButton = document.querySelector("#delete-campaign-button");
const campaignTemplatePreview = document.querySelector("#campaign-template-preview");
const campaignStatus = document.querySelector("#campaign-status");
const campaignList = document.querySelector("#campaign-list");
const refreshButton = document.querySelector("#refresh-outreach");
const generateDraftsButton = document.querySelector("#generate-drafts-button");
const markQueuedButton = document.querySelector("#mark-queued-button");
const markSentButton = document.querySelector("#mark-sent-button");
const markRepliedButton = document.querySelector("#mark-replied-button");
const archiveMessagesButton = document.querySelector("#archive-messages-button");
const messageBody = document.querySelector("#outreach-message-body");
const draftPreview = document.querySelector("#outreach-draft-preview");
const historyList = document.querySelector("#contact-history-list");
const historyScope = document.querySelector("#contact-history-scope");
const draftTitle = document.querySelector("#outreach-draft-title");
const selectionCount = document.querySelector("#outreach-selection-count");
const actionStatus = document.querySelector("#outreach-action-status");
const campaignHealth = document.querySelector("#outreach-campaign-health");
const campaignDashboard = document.querySelector("#outreach-campaign-dashboard");
const placeholderBank = document.querySelector("#outreach-placeholder-bank");
const messageSearch = document.querySelector("#outreach-message-search");
const metricCampaigns = document.querySelector("#outreach-metric-campaigns");
const metricDrafts = document.querySelector("#outreach-metric-drafts");
const metricSent = document.querySelector("#outreach-metric-sent");
const metricHistory = document.querySelector("#outreach-metric-history");
const outreachOpsTitle = document.querySelector("#outreach-ops-title");
const outreachOpsSubtitle = document.querySelector("#outreach-ops-subtitle");
const outreachOpsHealth = document.querySelector("#outreach-ops-health");
const outreachOpsRfxLink = document.querySelector("#outreach-ops-rfx-link");

let rfxEvents = [];
let templates = [];
let campaigns = [];
let messages = [];
let historyRows = [];
const pageParams = new URLSearchParams(window.location.search);
const requestedRfxEventId = pageParams.get("rfx_event_id");
let selectedCampaignId = null;
let editingCampaignId = null;
let editingTemplateId = null;
let previewMessageId = null;
let selectedMessageIds = new Set();
let activeMessageFilter = "all";
const outreachWorkbench = initWorkbenchTabs({ defaultView: requestedRfxEventId ? "campaigns" : "dashboard" });

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(element, message, tone = "neutral") {
  if (!element) return;
  element.textContent = tone === "error" ? humanizeError(message) : message;
  element.dataset.tone = tone;
}

function templatePayload() {
  return {
    name: templateName.value,
    channel: templateChannel.value,
    subject: templateSubject.value,
    html_body: templateHtml.value,
    whatsapp_body: templateWhatsapp.value
  };
}

function campaignPayload() {
  return {
    name: campaignName.value,
    rfx_event_id: campaignRfxEvent.value,
    template_id: campaignTemplate.value,
    channel: campaignChannel.value
  };
}

function updateCampaignActionState() {
  const hasCampaign = Boolean(selectedCampaignId);
  [editCampaignButton, duplicateCampaignButton, archiveCampaignButton, deleteCampaignButton]
    .forEach((button) => {
      if (button) button.disabled = !hasCampaign;
    });
}

function resetTemplateForm() {
  editingTemplateId = null;
  templateForm?.reset();
  const submit = templateForm?.querySelector("button[type='submit']");
  if (submit) submit.textContent = "Save template";
  renderOutreachWhatsappTemplateStatus();
}

function fillTemplateForm(template) {
  if (!template) return;
  editingTemplateId = template.id;
  templateName.value = template.name || "";
  templateChannel.value = template.channel || "multi";
  templateSubject.value = template.subject || "";
  templateHtml.value = template.html_body || "";
  templateWhatsapp.value = template.whatsapp_body || "";
  const submit = templateForm?.querySelector("button[type='submit']");
  if (submit) submit.textContent = "Save changes";
  renderOutreachWhatsappTemplateStatus(template);
  activateOutreachView("templates", "#template-name");
  templateForm?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderOutreachWhatsappTemplateStatus(template = templates.find((item) => item.id === editingTemplateId)) {
  const mapping = template?.whatsapp_meta || null;
  const status = metaNotifierStatus(mapping?.meta_template_status || "NOT_PUBLISHED");
  let copy = "Save the Outreach template, then publish its WhatsApp version to Meta.";
  let tone = "neutral";
  if (template && !template.whatsapp_body) {
    copy = "Add the full WhatsApp copy in Outreach. Meta will use a compact approved notifier that links to the Bid Room.";
    tone = "warning";
  } else if (status === "APPROVED") {
    copy = `Meta notifier ${mapping.meta_template_name} is approved. Outreach remains the source for the full message and Bid Room details.`;
    tone = "success";
  } else if (metaNotifierPendingReview(status)) {
    copy = `Compact Meta notifier is ${metaNotifierStatusLabel(status)} at Meta. Direct WhatsApp sends unlock after approval.`;
    tone = "warning";
  } else if (["REJECTED", "PAUSED", "DISABLED"].includes(status)) {
    copy = `Meta notifier status: ${status.toLowerCase()}. Review the integration before direct WhatsApp sending.`;
    tone = "error";
  } else if (template) {
    copy = "Outreach is the source. Create the reusable Meta notifier before automated WhatsApp sends.";
  }
  setStatus(outreachWhatsappTemplateStatus, copy, tone);
  if (outreachPublishWhatsappTemplateButton) {
    outreachPublishWhatsappTemplateButton.disabled = !template?.id || !template?.whatsapp_body || status === "APPROVED" || metaNotifierPendingReview(status);
    outreachPublishWhatsappTemplateButton.textContent = status === "APPROVED" ? "Meta notifier ready" : metaNotifierPendingReview(status) ? "Submitted to Meta" : "Create Meta notifier";
  }
}

function resetCampaignForm() {
  editingCampaignId = null;
  campaignForm?.reset();
  if (createCampaignButton) createCampaignButton.textContent = "Create campaign";
}

function fillCampaignForm(campaign) {
  if (!campaign) return;
  editingCampaignId = campaign.id;
  campaignName.value = campaign.name || "";
  if (campaign.rfx_event_id) campaignRfxEvent.value = campaign.rfx_event_id;
  if (campaign.template_id) campaignTemplate.value = campaign.template_id;
  campaignChannel.value = campaign.channel || "multi";
  campaignName.dataset.autoName = "false";
  if (createCampaignButton) createCampaignButton.textContent = "Save changes";
  renderTemplatePreview();
  activateOutreachView("campaigns", "#campaign-name");
  campaignForm?.scrollIntoView({ behavior: "smooth", block: "start" });
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

function messageRecipient(row) {
  return row.recipient_email || row.recipient_phone || "-";
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (["sent", "replied", "quoted", "awarded"].includes(value)) return "success";
  if (["queued", "generated", "invited", "viewed", "responded"].includes(value)) return "neutral";
  if (["failed", "archived"].includes(value)) return "danger";
  return "muted";
}

function statusChip(status) {
  const value = status || "drafted";
  const label = value === "replied" ? "responded" : value;
  return `<span class="status-pill" data-tone="${statusTone(value)}">${escapeHtml(label)}</span>`;
}

function linkedInvitation(message) {
  const invitation = message.rfx_lane_vendors;
  if (Array.isArray(invitation)) return invitation[0] || {};
  return invitation || {};
}

function invitationStatusLabel(status) {
  const value = String(status || "drafted").toLowerCase();
  const normalized = value === "shortlisted" ? "drafted" : value === "bid_submitted" ? "quoted" : value;
  const labels = {
    drafted: "Drafted",
    invited: "Invited",
    viewed: "Viewed",
    responded: "Responded",
    quoted: "Quoted",
    declined: "Declined",
    awarded: "Awarded",
    archived: "Archived"
  };
  return labels[normalized] || normalized;
}

function bidLinkForMessage(message) {
  const invitation = linkedInvitation(message);
  const metadataLink = message.metadata?.bid_link;
  if (metadataLink) return metadataLink;
  if (!invitation.invitation_token) return "";
  return `${window.location.origin}/rfx-bid.html?token=${encodeURIComponent(invitation.invitation_token)}`;
}

function channelReady(message) {
  if (message.channel === "email") return Boolean(message.recipient_email && message.gmail_compose_url);
  if (message.channel === "whatsapp") return Boolean(message.recipient_phone && message.whatsapp_url);
  return false;
}

function messageSearchText(message) {
  return [
    vendorName(message),
    laneLabel(message),
    message.channel,
    message.status,
    messageRecipient(message),
    message.subject,
    message.whatsapp_text,
    message.text_body
  ].filter(Boolean).join(" ").toLowerCase();
}

function messageMatchesFilter(message) {
  const term = String(messageSearch?.value || "").trim().toLowerCase();
  if (term && !messageSearchText(message).includes(term)) return false;
  if (activeMessageFilter === "all") return true;
  if (activeMessageFilter === "missing_channel") return !channelReady(message);
  return message.status === activeMessageFilter;
}

function visibleMessages() {
  return messages.filter(messageMatchesFilter);
}

function selectedTemplate() {
  return templates.find((item) => item.id === campaignTemplate?.value) || templates[0] || null;
}

function placeholderList(template) {
  const variables = Array.isArray(template?.variables) ? template.variables : [];
  if (variables.length) return variables;
  const combined = [template?.subject, template?.html_body, template?.whatsapp_body].filter(Boolean).join(" ");
  return [...new Set([...combined.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((match) => match[1]))];
}

function renderTemplatePreview() {
  if (!campaignTemplatePreview) return;
  const template = selectedTemplate();
  if (!template) {
    campaignTemplatePreview.innerHTML = `
      <strong>No template selected.</strong>
      <span>Select a template to preview subject, Gmail HTML, WhatsApp copy, and placeholders.</span>
    `;
    if (placeholderBank) placeholderBank.innerHTML = "<span>No template selected</span>";
    renderOutreachOpsStrip();
    return;
  }
  const placeholders = placeholderList(template);
  if (placeholderBank) {
    placeholderBank.innerHTML = placeholders.length
      ? placeholders.map((item) => `<button type="button" class="secondary small-button" data-copy-placeholder="{{${escapeHtml(item)}}}">{{${escapeHtml(item)}}}</button>`).join("")
      : "<span>No placeholders detected</span>";
  }
  campaignTemplatePreview.innerHTML = `
    <div>
      <span class="status-pill">${escapeHtml(template.channel || "multi")}</span>
      <strong>${escapeHtml(template.name || "Template")}</strong>
      <small>${escapeHtml(template.subject || "No email subject")}</small>
    </div>
    <div class="outreach-template-preview-grid">
      <article>
        <span>Gmail subject</span>
        <strong>${escapeHtml(template.subject || "No subject")}</strong>
      </article>
      <article>
        <span>Channel</span>
        <strong>${escapeHtml(template.channel || "multi")}</strong>
      </article>
    </div>
    <p>${escapeHtml((template.whatsapp_body || template.html_body || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 180) || "No body preview"}</p>
    <div class="template-token-row">
      ${placeholders.length ? placeholders.slice(0, 12).map((item) => `<span>{{${escapeHtml(item)}}}</span>`).join("") : "<span>No placeholders detected</span>"}
    </div>
  `;
  renderOutreachOpsStrip();
}

function activateOutreachView(view, focusTarget = null) {
  const activeView = outreachWorkbench?.activate(view, focusTarget ? { focusTarget } : {}) || view;
  const url = new URL(window.location.href);
  url.searchParams.set("view", activeView);
  window.history.replaceState({}, "", url);
}

function renderDraftPreview(message = null) {
  if (!draftPreview) return;
  if (!message) {
    draftPreview.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Draft preview",
      title: "Select a generated message",
      detail: "Preview the exact Gmail or WhatsApp draft before opening the external channel."
    });
    return;
  }
  const isEmail = message.channel === "email";
  const body = isEmail ? message.html_body || message.text_body || "" : message.whatsapp_text || message.text_body || "";
  const portalLink = bidLinkForMessage(message);
  const messageStatusLabel = message.status === "replied" ? "responded" : message.status || "drafted";
  const vendorHistory = historyRows
    .filter((item) => item.vendor_id === message.vendor_id || item.outreach_message_id === message.id)
    .slice(0, 4);
  draftPreview.innerHTML = `
    <div class="draft-preview-header">
      <div>
        <p class="eyebrow">${escapeHtml(message.channel)} draft</p>
        <h3>${escapeHtml(vendorName(message))}</h3>
        <span>${escapeHtml(laneLabel(message))}</span>
      </div>
      <div class="draft-preview-actions">
        <span class="status-pill">${escapeHtml(messageStatusLabel)}</span>
        <button class="secondary small-button" type="button" data-open-url="${escapeHtml(isEmail ? message.gmail_compose_url || "" : message.whatsapp_url || "")}" ${isEmail ? (message.gmail_compose_url ? "" : "disabled") : (message.whatsapp_url ? "" : "disabled")}>Open ${isEmail ? "Gmail" : "WhatsApp"}</button>
        <button class="secondary small-button" type="button" data-open-url="${escapeHtml(portalLink)}" ${portalLink ? "" : "disabled"}>Open portal</button>
      </div>
    </div>
    <dl class="draft-preview-meta">
      <div><dt>Recipient</dt><dd>${escapeHtml(messageRecipient(message))}</dd></div>
      <div><dt>Subject</dt><dd>${escapeHtml(message.subject || "-")}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtml(messageStatusLabel)}</dd></div>
      <div><dt>Channel ready</dt><dd>${channelReady(message) ? "Yes" : "Needs contact data"}</dd></div>
    </dl>
    ${isEmail && message.html_body
      ? `<iframe class="draft-html-preview" sandbox="" srcdoc="${escapeHtml(message.html_body)}"></iframe>`
      : `<pre class="draft-text-preview">${escapeHtml(body || "-")}</pre>`}
    <div class="draft-vendor-timeline">
      <strong>Recent vendor touchpoints</strong>
      ${vendorHistory.length ? vendorHistory.map((item) => `
        <article>
          <span>${escapeHtml([item.channel, item.status, new Date(item.occurred_at || item.created_at).toLocaleString()].filter(Boolean).join(" | "))}</span>
          ${item.channel === "whatsapp" && item.metadata?.sender_display_phone
            ? `<small>Sent from ${escapeHtml(item.metadata.sender_display_phone)} (${escapeHtml(item.metadata.whatsapp_connection_mode || "workspace connection")})</small>`
            : ""}
          <p>${escapeHtml(item.body_preview || item.subject || "")}</p>
        </article>
      `).join("") : "<article>No previous touchpoints for this vendor.</article>"}
    </div>
  `;
}

function updateMetrics() {
  metricCampaigns.textContent = formatCount(campaigns.length);
  metricDrafts.textContent = formatCount(messages.filter((row) => row.status === "drafted" || row.status === "queued").length);
  metricSent.textContent = formatCount(messages.filter((row) => row.status === "sent").length);
  metricHistory.textContent = formatCount(historyRows.length);
}

function campaignMessageStats(rows = messages) {
  return {
    total: rows.length,
    drafted: rows.filter((row) => row.status === "drafted").length,
    queued: rows.filter((row) => row.status === "queued").length,
    sent: rows.filter((row) => row.status === "sent").length,
    replied: rows.filter((row) => row.status === "replied").length,
    failed: rows.filter((row) => row.status === "failed").length,
    archived: rows.filter((row) => row.status === "archived").length,
    email: rows.filter((row) => row.channel === "email").length,
    whatsapp: rows.filter((row) => row.channel === "whatsapp").length,
    missing_channel: rows.filter((row) => !channelReady(row)).length
  };
}

function selectedCampaign() {
  return campaigns.find((item) => item.id === selectedCampaignId) || null;
}

function selectedRfxEvent() {
  const campaign = selectedCampaign();
  const eventId = campaign?.rfx_event_id || campaignRfxEvent?.value || requestedRfxEventId;
  return rfxEvents.find((event) => event.id === eventId) || campaign?.rfx_events || null;
}

function setCampaignDefaultsFromRfx() {
  const event = selectedRfxEvent();
  if (!event || !campaignName) return;
  const defaultName = `${event.rfx_id || "RFx"} invitation wave`;
  if (!campaignName.value || campaignName.dataset.autoName === "true") {
    campaignName.value = defaultName;
    campaignName.dataset.autoName = "true";
  }
}

function renderOutreachOpsStrip() {
  if (!outreachOpsTitle || !outreachOpsSubtitle || !outreachOpsHealth) return;
  const campaign = selectedCampaign();
  const event = selectedRfxEvent();
  const template = selectedTemplate();
  const stats = campaignMessageStats(messages);
  const readyCount = stats.total - stats.missing_channel;
  const eventLabel = event ? `${event.rfx_id || "Bid Room"} | ${event.name || "Untitled event"}` : "No Bid Room event selected";
  const rfxHref = event
    ? `./rfx-events.html?view=responses&rfx_event_id=${encodeURIComponent(event.id)}`
    : "./rfx-events.html";

  outreachOpsTitle.textContent = campaign
    ? `${campaign.name || "Campaign"} cockpit`
    : event
      ? `${event.rfx_id || "RFx"} outreach setup`
      : "Connect RFx, template, and carrier targets";
  outreachOpsSubtitle.textContent = campaign
    ? `${eventLabel} | ${campaign.channel || "multi"} | ${campaign.status || "draft"}`
    : "Create a campaign from an RFx shortlist, choose a template, then generate drafts.";
  if (outreachOpsRfxLink) outreachOpsRfxLink.href = rfxHref;

  outreachOpsHealth.innerHTML = `
    <article data-tone="${campaign ? "success" : "neutral"}">
      <span>Campaign</span>
      <strong>${escapeHtml(campaign ? "Selected" : "Not started")}</strong>
      <small>${escapeHtml(campaign?.name || "Create a campaign from a Bid Room shortlist.")}</small>
    </article>
    <article data-tone="${event ? "success" : "warning"}">
      <span>Bid Room</span>
      <strong>${escapeHtml(event?.rfx_id || "-")}</strong>
      <small>${escapeHtml(event?.name || "Select a Bid Room event.")}</small>
    </article>
    <article data-tone="${template ? "success" : "warning"}">
      <span>Template</span>
      <strong>${escapeHtml(template?.name || "-")}</strong>
      <small>${escapeHtml(template?.channel || "Choose Gmail/WhatsApp copy.")}</small>
    </article>
    <article data-tone="${stats.total ? stats.missing_channel ? "warning" : "success" : "neutral"}">
      <span>Draft readiness</span>
      <strong>${formatCount(readyCount)} / ${formatCount(stats.total)}</strong>
      <small>${formatCount(stats.sent)} sent | ${formatCount(stats.replied)} responded | ${formatCount(stats.missing_channel)} missing channel</small>
    </article>
  `;
}

function renderCampaignDashboard() {
  const campaign = selectedCampaign();
  const stats = campaignMessageStats(messages);
  if (!campaignDashboard || !campaignHealth) return;
  renderOutreachOpsStrip();
  updateCampaignActionState();
  if (!campaign) {
    campaignHealth.textContent = "No campaign selected";
    campaignHealth.className = "status-pill muted";
    campaignDashboard.innerHTML = `
      <article>
        <span>Selected campaign</span>
        <strong>-</strong>
        <small>Create or select a campaign to inspect channel readiness.</small>
      </article>
    `;
    return;
  }

  const readyCount = stats.total - stats.missing_channel;
  const healthTone = stats.missing_channel ? "warning" : stats.sent || stats.replied ? "success" : "neutral";
  campaignHealth.textContent = stats.missing_channel
    ? `${formatCount(stats.missing_channel)} missing channel`
    : stats.total
      ? "Ready to send"
      : "Needs drafts";
  campaignHealth.className = `status-pill ${healthTone}`;
  campaignDashboard.innerHTML = `
    <article>
      <span>Campaign</span>
      <strong>${escapeHtml(campaign.name || "-")}</strong>
        <small>${escapeHtml([campaign.rfx_events?.rfx_id, campaign.outreach_templates?.name, campaign.channel].filter(Boolean).join(" | ") || "No Bid Room/template")}</small>
    </article>
    <article>
      <span>Draft readiness</span>
      <strong>${formatCount(readyCount)} / ${formatCount(stats.total)}</strong>
      <small>${formatCount(stats.email)} Gmail | ${formatCount(stats.whatsapp)} WhatsApp | ${formatCount(stats.missing_channel)} missing channel</small>
    </article>
    <article>
      <span>Delivery state</span>
      <strong>${formatCount(stats.sent + stats.replied)} sent/responded</strong>
      <small>${formatCount(stats.drafted)} drafted | ${formatCount(stats.queued)} queued | ${formatCount(stats.replied)} responded</small>
    </article>
    <article>
      <span>Contact history</span>
      <strong>${formatCount(historyRows.filter((row) => row.campaign_id === campaign.id).length)}</strong>
      <small>Touchpoints linked to this campaign.</small>
    </article>
  `;
}

function updateSelection() {
  const count = selectedMessageIds.size;
  selectionCount.textContent = `${count} selected`;
  markQueuedButton.disabled = !count;
  markSentButton.disabled = !count;
  markRepliedButton.disabled = !count;
  archiveMessagesButton.disabled = !count;
}

function renderTemplateSelects() {
  campaignTemplate.innerHTML = templates.map((template) => `
    <option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}${template.owner_email ? "" : " (default)"}</option>
  `).join("");
  renderTemplatePreview();
}

function renderRfxSelects() {
  campaignRfxEvent.innerHTML = rfxEvents.length
    ? rfxEvents.map((event) => `<option value="${escapeHtml(event.id)}">${escapeHtml(event.rfx_id || event.name)} | ${escapeHtml(event.name || "")}</option>`).join("")
    : "<option value=\"\">Create a Bid Room event first</option>";
  if (requestedRfxEventId && rfxEvents.some((event) => event.id === requestedRfxEventId)) {
    campaignRfxEvent.value = requestedRfxEventId;
  }
  setCampaignDefaultsFromRfx();
  renderOutreachOpsStrip();
}

function renderTemplates() {
  renderTemplateSelects();
  if (!templates.length) {
    templateList.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Templates",
      title: "No outreach templates yet",
      detail: "Create a Gmail/WhatsApp template with placeholders so RFx invitations can be generated consistently.",
      actionButton: '<button class="secondary small-button" type="button" data-outreach-focus="template">Create template</button>'
    });
    return;
  }
  templateList.innerHTML = templates.map((template) => {
    const metaStatus = metaNotifierStatus(template.whatsapp_meta?.meta_template_status || "NOT_PUBLISHED");
    const statusTone = metaStatus === "APPROVED" ? "success" : metaNotifierPendingReview(metaStatus) ? "warning" : "muted";
    return `
      <article>
        <div>
          <strong>${escapeHtml(template.name)}</strong>
          <span>${escapeHtml(template.channel)}${template.owner_email ? "" : " | global default"}</span>
        </div>
        <small>${escapeHtml(template.subject || "No subject")}</small>
        <span class="status-pill ${statusTone}">WhatsApp: ${escapeHtml(metaStatus.toLowerCase().replace(/_/g, " "))}</span>
        <div class="action-row">
          <button class="secondary small-button" type="button" data-template-edit="${escapeHtml(template.id)}" ${template.owner_email ? "" : "disabled"}>Edit</button>
          <button class="secondary small-button" type="button" data-template-duplicate="${escapeHtml(template.id)}">Duplicate</button>
          <button class="secondary small-button" type="button" data-template-archive="${escapeHtml(template.id)}" ${template.owner_email ? "" : "disabled"}>Archive</button>
          <button class="danger small-button" type="button" data-template-delete="${escapeHtml(template.id)}" ${template.owner_email ? "" : "disabled"}>Delete</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderCampaigns() {
  if (selectedCampaignId && !campaigns.some((campaign) => campaign.id === selectedCampaignId)) {
    selectedCampaignId = null;
  }
  if (!selectedCampaignId && requestedRfxEventId) {
    selectedCampaignId = campaigns.find((campaign) => campaign.rfx_event_id === requestedRfxEventId)?.id || null;
  }
  if (!selectedCampaignId && !requestedRfxEventId && campaigns[0]) selectedCampaignId = campaigns[0].id;
  generateDraftsButton.disabled = !selectedCampaignId;
  renderCampaignDashboard();
  if (!campaigns.length) {
    campaignList.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Campaigns",
      title: "No outreach campaigns yet",
      detail: "Create a campaign from a Bid Room shortlist, then generate Gmail and WhatsApp drafts for selected carriers.",
      actionButton: '<button class="secondary small-button" type="button" data-outreach-focus="campaign">Create campaign</button>'
    });
    return;
  }
  campaignList.innerHTML = campaigns.map((campaign) => `
    <button class="outreach-campaign-card ${campaign.id === selectedCampaignId ? "is-active" : ""}" type="button" data-campaign-id="${escapeHtml(campaign.id)}">
      <span>${escapeHtml(campaign.status || "draft")}</span>
      <strong>${escapeHtml(campaign.name)}</strong>
      <small>${escapeHtml(campaign.rfx_events?.rfx_id || "No Bid Room")} | ${escapeHtml(campaign.outreach_templates?.name || "No template")}</small>
      <b>${formatCount(campaign.message_count)} messages / ${formatCount(campaign.sent_count)} sent</b>
    </button>
  `).join("");
}

function renderMessages() {
  updateSelection();
  updateMetrics();
  renderCampaignDashboard();
  if (!selectedCampaignId) {
    messageBody.innerHTML = tableState(8, {
      tone: "neutral",
      eyebrow: "Draft queue",
      title: "Create or select a campaign",
      detail: "Drafts appear here after you connect a Bid Room event, template, and invitation channel."
    });
    renderDraftPreview(null);
    renderHistory();
    return;
  }
  if (!messages.length) {
    messageBody.innerHTML = tableState(8, {
      tone: "neutral",
      eyebrow: "Draft queue",
      title: "No drafts generated yet",
      detail: "Generate drafts from the selected RFx shortlist, then preview each vendor message before opening Gmail or WhatsApp.",
      actionButton: '<button class="secondary small-button" type="button" data-outreach-focus="generate">Generate drafts</button>'
    });
    renderDraftPreview(null);
    renderHistory();
    return;
  }
  const rows = visibleMessages();
  if (!rows.length) {
    messageBody.innerHTML = tableState(8, {
      tone: "neutral",
      eyebrow: "Filtered drafts",
      title: "No messages match current filters",
      detail: "Clear the search or choose a different delivery state to continue."
    });
    const fallbackPreview = messages.find((message) => message.id === previewMessageId) || messages[0] || null;
    renderDraftPreview(fallbackPreview);
    renderHistory();
    return;
  }
  const previewMessage = rows.find((message) => message.id === previewMessageId) || rows[0];
  previewMessageId = previewMessage?.id || null;
  renderDraftPreview(previewMessage);
  messageBody.innerHTML = rows.map((message) => {
    const draft = message.channel === "email"
      ? `<button class="small-button" type="button" data-open-url="${escapeHtml(message.gmail_compose_url || "")}" ${message.gmail_compose_url ? "" : "disabled"}>Open Gmail</button>`
      : `<button class="small-button" type="button" data-open-url="${escapeHtml(message.whatsapp_url || "")}" ${message.whatsapp_url ? "" : "disabled"}>Open WhatsApp</button>`;
    const copyHtml = message.html_body ? `<button class="secondary small-button" type="button" data-copy-html="${escapeHtml(message.id)}">Copy HTML</button>` : "";
    const ready = channelReady(message);
    const invitation = linkedInvitation(message);
    const invitationStatus = invitation.invitation_status ? invitationStatusLabel(invitation.invitation_status) : "";
    return `
      <tr data-message-id="${escapeHtml(message.id)}" class="${message.id === previewMessageId ? "is-focused-row" : ""}">
        <td><input type="checkbox" data-message-select="${escapeHtml(message.id)}" ${selectedMessageIds.has(message.id) ? "checked" : ""} /></td>
        <td>${escapeHtml(vendorName(message))}</td>
        <td>${escapeHtml(laneLabel(message))}</td>
        <td><span class="status-pill">${escapeHtml(message.channel)}</span></td>
        <td>${escapeHtml(messageRecipient(message))}${ready ? "" : "<small>Missing channel setup</small>"}</td>
        <td>${statusChip(message.status)}${invitationStatus ? `<small>RFx ${escapeHtml(invitationStatus)}</small>` : ""}</td>
        <td>${escapeHtml(message.subject || message.whatsapp_text || message.text_body || "-").slice(0, 140)}</td>
        <td class="compact-actions"><button class="secondary small-button" type="button" data-preview-message="${escapeHtml(message.id)}">Preview</button>${draft}${copyHtml}</td>
      </tr>
    `;
  }).join("");
  renderHistory();
}

function renderHistory() {
  updateMetrics();
  const previewMessage = messages.find((message) => message.id === previewMessageId);
  const scopedRows = previewMessage
    ? historyRows.filter((item) => item.vendor_id === previewMessage.vendor_id || item.outreach_message_id === previewMessage.id)
    : selectedCampaignId
      ? historyRows.filter((item) => item.campaign_id === selectedCampaignId)
      : historyRows;
  if (historyScope) {
    historyScope.textContent = previewMessage ? vendorName(previewMessage) : selectedCampaignId ? "Selected campaign" : "All vendors";
  }
  if (!scopedRows.length) {
    historyList.innerHTML = stateBlock({
      tone: "neutral",
      eyebrow: "Contact history",
      title: "No carrier touchpoints yet",
      detail: previewMessage ? "This vendor has no recorded outreach history yet." : "Sent, queued, replied, and archived activity will appear here after drafts are processed."
    });
    return;
  }
  historyList.innerHTML = scopedRows.slice(0, 80).map((item) => `
    <article class="contact-timeline-item" data-channel="${escapeHtml(item.channel || "")}">
      <i aria-hidden="true"></i>
      <div>
        <span>${escapeHtml(item.channel)} | ${escapeHtml(item.status)} | ${escapeHtml(new Date(item.occurred_at || item.created_at).toLocaleString())}</span>
        <strong>${escapeHtml(item.vendors?.vendor_name || item.vendors?.domain || "Vendor")}</strong>
        <small>${escapeHtml(item.outreach_campaigns?.name || "")}${item.rfx_events?.rfx_id ? ` | ${escapeHtml(item.rfx_events.rfx_id)}` : ""}</small>
        ${item.channel === "whatsapp" && item.metadata?.sender_display_phone
          ? `<small>Sent from ${escapeHtml(item.metadata.sender_display_phone)} (${escapeHtml(item.metadata.whatsapp_connection_mode || "workspace connection")})</small>`
          : ""}
        <p>${escapeHtml(item.body_preview || item.subject || "")}</p>
      </div>
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
  if (!messages.some((message) => message.id === previewMessageId)) previewMessageId = messages[0]?.id || null;
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
    renderOutreachWhatsappTemplateStatus();
    renderTemplatePreview();
    renderCampaigns();
    renderHistory();
    await loadMessages(selectedCampaignId);
    setStatus(actionStatus, "Invitation admin ready.", "success");
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
  const isEditing = Boolean(editingTemplateId);
  setStatus(templateStatus, isEditing ? "Saving template changes..." : "Saving template...");
  try {
    const saved = await (isEditing
      ? updateOutreachTemplate(editingTemplateId, templatePayload())
      : createOutreachTemplate(templatePayload()));
    templates = await fetchOutreachTemplates();
    renderTemplates();
    const refreshed = templates.find((template) => template.id === saved.id) || saved;
    fillTemplateForm(refreshed);
    setStatus(templateStatus, `${isEditing ? "Template updated" : "Template saved"}. Create the reusable Meta notifier when direct WhatsApp sending is needed.`, "success");
  } catch (error) {
    setStatus(templateStatus, error.message, "error");
  }
});

outreachPublishWhatsappTemplateButton?.addEventListener("click", async () => {
  if (!editingTemplateId) {
    setStatus(outreachWhatsappTemplateStatus, "Save or select an Outreach template first.", "error");
    return;
  }
  outreachPublishWhatsappTemplateButton.disabled = true;
  setStatus(outreachWhatsappTemplateStatus, "Creating the compact Meta notifier from this Outreach template...");
  try {
    const result = await publishOutreachTemplateToWhatsapp(editingTemplateId);
    templates = await fetchOutreachTemplates();
    renderTemplates();
    const refreshed = templates.find((template) => template.id === editingTemplateId);
    renderOutreachWhatsappTemplateStatus(refreshed);
    setStatus(outreachWhatsappTemplateStatus, result.message || "WhatsApp template submitted to Meta.", result.ready ? "success" : "warning");
  } catch (error) {
    setStatus(outreachWhatsappTemplateStatus, error.message, "error");
    outreachPublishWhatsappTemplateButton.disabled = false;
  }
});

outreachSyncWhatsappTemplatesButton?.addEventListener("click", async () => {
  outreachSyncWhatsappTemplatesButton.disabled = true;
  setStatus(outreachWhatsappTemplateStatus, "Syncing WhatsApp template status from Meta...");
  try {
    const result = await syncOutreachWhatsappTemplates();
    templates = await fetchOutreachTemplates();
    renderTemplates();
    renderOutreachWhatsappTemplateStatus(templates.find((template) => template.id === editingTemplateId));
    setStatus(
      outreachWhatsappTemplateStatus,
      `${formatCount(result.approved || 0)} approved of ${formatCount(result.synced || 0)} Meta template(s).`,
      result.approved ? "success" : "warning"
    );
  } catch (error) {
    setStatus(outreachWhatsappTemplateStatus, error.message, "error");
  } finally {
    outreachSyncWhatsappTemplatesButton.disabled = false;
  }
});

campaignForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const isEditing = Boolean(editingCampaignId);
  setStatus(campaignStatus, isEditing ? "Saving campaign..." : "Creating campaign...");
  try {
    const campaign = isEditing
      ? await updateOutreachCampaign(editingCampaignId, campaignPayload())
      : await createOutreachCampaign(campaignPayload());
    selectedCampaignId = campaign.id;
    resetCampaignForm();
    if (requestedRfxEventId && rfxEvents.some((event) => event.id === requestedRfxEventId)) campaignRfxEvent.value = requestedRfxEventId;
    renderTemplatePreview();
    setStatus(campaignStatus, isEditing ? "Campaign updated." : "Campaign created.", "success");
    campaigns = await fetchOutreachCampaigns();
    renderCampaigns();
    await loadMessages(selectedCampaignId);
  } catch (error) {
    setStatus(campaignStatus, error.message, "error");
  }
});

templateList?.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-template-edit]");
  const duplicateButton = event.target.closest("[data-template-duplicate]");
  const archiveButton = event.target.closest("[data-template-archive]");
  const deleteButton = event.target.closest("[data-template-delete]");
  const templateId = editButton?.dataset.templateEdit
    || duplicateButton?.dataset.templateDuplicate
    || archiveButton?.dataset.templateArchive
    || deleteButton?.dataset.templateDelete;
  if (!templateId) return;
  const template = templates.find((item) => item.id === templateId);

  try {
    if (editButton) {
      fillTemplateForm(template);
      return;
    }
    if (duplicateButton) {
      setStatus(templateStatus, "Duplicating template...");
      await duplicateOutreachTemplate(templateId);
      setStatus(templateStatus, "Template duplicated.", "success");
    }
    if (archiveButton) {
      if (!window.confirm("Archive this template? It will be hidden from active template lists.")) return;
      setStatus(templateStatus, "Archiving template...");
      await archiveOutreachTemplate(templateId);
      setStatus(templateStatus, "Template archived.", "success");
    }
    if (deleteButton) {
      if (!window.confirm(`Delete template ${template?.name || ""}? Campaigns using it will keep their records but lose the template link.`)) return;
      setStatus(templateStatus, "Deleting template...");
      await deleteOutreachTemplate(templateId);
      setStatus(templateStatus, "Template deleted.", "success");
    }
    resetTemplateForm();
    templates = await fetchOutreachTemplates();
    renderTemplates();
  } catch (error) {
    setStatus(templateStatus, error.message, "error");
  }
});

campaignList?.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-campaign-id]");
  if (!card) return;
  selectedCampaignId = card.dataset.campaignId;
  renderCampaigns();
  await loadMessages(selectedCampaignId);
});

editCampaignButton?.addEventListener("click", () => {
  fillCampaignForm(selectedCampaign());
});

duplicateCampaignButton?.addEventListener("click", async () => {
  if (!selectedCampaignId) return;
  if (!window.confirm("Duplicate this campaign setup without copying generated drafts?")) return;
  duplicateCampaignButton.disabled = true;
  setStatus(campaignStatus, "Duplicating campaign...");
  try {
    const campaign = await duplicateOutreachCampaign(selectedCampaignId);
    selectedCampaignId = campaign.id;
    resetCampaignForm();
    setStatus(campaignStatus, "Campaign duplicated.", "success");
    campaigns = await fetchOutreachCampaigns();
    renderCampaigns();
    await loadMessages(selectedCampaignId);
  } catch (error) {
    setStatus(campaignStatus, error.message, "error");
  } finally {
    updateCampaignActionState();
  }
});

archiveCampaignButton?.addEventListener("click", async () => {
  if (!selectedCampaignId) return;
  if (!window.confirm("Archive this campaign? Drafts and history stay stored but it leaves the active list.")) return;
  archiveCampaignButton.disabled = true;
  setStatus(campaignStatus, "Archiving campaign...");
  try {
    await archiveOutreachCampaign(selectedCampaignId);
    selectedCampaignId = null;
    messages = [];
    selectedMessageIds.clear();
    resetCampaignForm();
    setStatus(campaignStatus, "Campaign archived.", "success");
    campaigns = await fetchOutreachCampaigns();
    renderCampaigns();
    renderMessages();
  } catch (error) {
    setStatus(campaignStatus, error.message, "error");
  } finally {
    updateCampaignActionState();
  }
});

deleteCampaignButton?.addEventListener("click", async () => {
  if (!selectedCampaignId) return;
  const campaign = selectedCampaign();
  if (!window.confirm(`Delete campaign ${campaign?.name || ""}? This removes generated drafts for this campaign.`)) return;
  deleteCampaignButton.disabled = true;
  setStatus(campaignStatus, "Deleting campaign...");
  try {
    await deleteOutreachCampaign(selectedCampaignId);
    selectedCampaignId = null;
    messages = [];
    selectedMessageIds.clear();
    resetCampaignForm();
    setStatus(campaignStatus, "Campaign deleted.", "success");
    campaigns = await fetchOutreachCampaigns();
    renderCampaigns();
    renderMessages();
  } catch (error) {
    setStatus(campaignStatus, error.message, "error");
  } finally {
    updateCampaignActionState();
  }
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
  const previewButton = event.target.closest("[data-preview-message]");
  if (previewButton) {
    previewMessageId = previewButton.dataset.previewMessage;
    renderMessages();
    draftPreview?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

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

draftPreview?.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-open-url]");
  if (!openButton) return;
  const url = openButton.dataset.openUrl;
  if (url) window.open(url, "_blank", "noopener");
});

document.addEventListener("click", (event) => {
  const goButton = event.target.closest("[data-outreach-go]");
  if (goButton) {
    const view = goButton.dataset.outreachGo || "dashboard";
    const focusTargets = {
      campaigns: "#campaign-name",
      templates: "#template-name",
      drafts: "#outreach-message-search",
      history: "#contact-history-list"
    };
    activateOutreachView(view, focusTargets[view] || null);
    return;
  }

  const focusButton = event.target.closest("[data-outreach-focus]");
  if (!focusButton) return;
  const focusTarget = focusButton.dataset.outreachFocus;
  if (focusTarget === "template") {
    templateName?.focus();
    templateForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (focusTarget === "campaign") {
    campaignName?.focus();
    campaignForm?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (focusTarget === "generate" && !generateDraftsButton.disabled) {
    generateDraftsButton.click();
  }
});

campaignTemplate?.addEventListener("change", renderTemplatePreview);
campaignChannel?.addEventListener("change", renderTemplatePreview);
campaignRfxEvent?.addEventListener("change", () => {
  setCampaignDefaultsFromRfx();
  renderOutreachOpsStrip();
});
campaignName?.addEventListener("input", () => {
  campaignName.dataset.autoName = "false";
});

placeholderBank?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-placeholder]");
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copyPlaceholder || "");
    setStatus(campaignStatus, "Placeholder copied.", "success");
  } catch (error) {
    setStatus(campaignStatus, error.message, "error");
  }
});

document.querySelectorAll("[data-outreach-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeMessageFilter = button.dataset.outreachFilter || "all";
    document.querySelectorAll("[data-outreach-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    if (!visibleMessages().some((message) => message.id === previewMessageId)) previewMessageId = visibleMessages()[0]?.id || messages[0]?.id || null;
    renderMessages();
  });
});

messageSearch?.addEventListener("input", () => {
  if (!visibleMessages().some((message) => message.id === previewMessageId)) previewMessageId = visibleMessages()[0]?.id || messages[0]?.id || null;
  renderMessages();
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
    campaigns = await fetchOutreachCampaigns();
    renderCampaigns();
    renderHistory();
    await loadMessages(selectedCampaignId);
  } catch (error) {
    setStatus(actionStatus, error.message, "error");
  }
}

markQueuedButton?.addEventListener("click", () => markSelected("queued"));
markSentButton?.addEventListener("click", () => markSelected("sent"));
markRepliedButton?.addEventListener("click", () => markSelected("replied"));
archiveMessagesButton?.addEventListener("click", () => markSelected("archived"));
