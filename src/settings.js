import { initAuthControls, requirePrivatePage } from "./auth.js";
import {
  archiveCatalogValue,
  disconnectGmailConnection,
  disconnectGoogleChatConnection,
  disconnectWhatsappBusinessConnection,
  fetchCatalogValues,
  fetchGmailConnections,
  fetchGoogleChatConnections,
  fetchGoogleChatSpaces,
  fetchObservabilityEvents,
  fetchSaasSettings,
  fetchWhatsappConnections,
  fetchWhatsappTemplates,
  retryGoogleChatSync,
  saveCatalogValue,
  saveGoogleChatSettings,
  startWhatsappBusinessConnection,
  startGmailOAuth,
  startGoogleChatOAuth,
  syncGmailBounces,
  syncWhatsappTemplates,
  testWhatsappBusinessConnection,
  updateOnboardingTask,
  updateSaasOrganization,
  updateSaasProfile,
  verifyWhatsappWebhook
} from "./settings-service.js";
import { SUPABASE_URL } from "./config.js";
import { humanizeError } from "./error-copy.js";
import { initWorkbenchTabs } from "./workbench-tabs.js";

const accessMode = document.querySelector("#settings-access-mode");
const onboardingScore = document.querySelector("#settings-onboarding-score");
const auditCount = document.querySelector("#settings-audit-count");
const workspaceName = document.querySelector("#settings-workspace-name");
const accessCard = document.querySelector("#settings-access-card");
const settingsSession = document.querySelector("#settings-session");
const profileForm = document.querySelector("#profile-form");
const profileStatus = document.querySelector("#profile-status");
const organizationForm = document.querySelector("#organization-form");
const organizationStatus = document.querySelector("#organization-status");
const onboardingList = document.querySelector("#onboarding-list");
const auditLogBody = document.querySelector("#audit-log-body");
const refreshButton = document.querySelector("#refresh-settings-button");
const observabilitySummary = document.querySelector("#observability-summary");
const observabilityLogBody = document.querySelector("#observability-log-body");
const observabilityStatus = document.querySelector("#observability-status");
const observabilitySourceFilter = document.querySelector("#observability-source-filter");
const observabilitySeverityFilter = document.querySelector("#observability-severity-filter");
const refreshObservabilityButton = document.querySelector("#refresh-observability-button");
const gmailConnectionCard = document.querySelector("#gmail-connection-card");
const gmailConnectionStatus = document.querySelector("#gmail-connection-status");
const connectGmailButton = document.querySelector("#connect-gmail-button");
const disconnectGmailButton = document.querySelector("#disconnect-gmail-button");
const syncGmailBouncesButton = document.querySelector("#sync-gmail-bounces-button");
const refreshGmailConnectionButton = document.querySelector("#refresh-gmail-connection");
const googleChatConnectionCard = document.querySelector("#google-chat-connection-card");
const googleChatConnectionStatus = document.querySelector("#google-chat-connection-status");
const connectGoogleChatButton = document.querySelector("#connect-google-chat-button");
const disconnectGoogleChatButton = document.querySelector("#disconnect-google-chat-button");
const retryGoogleChatSyncButton = document.querySelector("#retry-google-chat-sync-button");
const refreshGoogleChatConnectionButton = document.querySelector("#refresh-google-chat-connection");
const googleChatSpaceSelect = document.querySelector("#google-chat-space-select");
const googleChatSpaceManualInput = document.querySelector("#google-chat-space-manual-input");
const googleChatSpaceHelp = document.querySelector("#google-chat-space-help");
const saveGoogleChatSpaceButton = document.querySelector("#save-google-chat-space-button");
const googleChatSpaceRow = document.querySelector("#google-chat-space-row");
const whatsappConnectionCard = document.querySelector("#whatsapp-connection-card");
const whatsappConnectionStatus = document.querySelector("#whatsapp-connection-status");
const connectWhatsappButton = document.querySelector("#connect-whatsapp-button");
const disconnectWhatsappButton = document.querySelector("#disconnect-whatsapp-button");
const testWhatsappButton = document.querySelector("#test-whatsapp-button");
const syncWhatsappTemplatesButton = document.querySelector("#sync-whatsapp-templates-button");
const verifyWhatsappWebhookButton = document.querySelector("#verify-whatsapp-webhook-button");
const refreshWhatsappConnectionButton = document.querySelector("#refresh-whatsapp-connection");
const catalogValueForm = document.querySelector("#catalog-value-form");
const catalogCategorySelect = document.querySelector("#catalog-category");
const catalogCategoryFilter = document.querySelector("#catalog-category-filter");
const catalogRawValueInput = document.querySelector("#catalog-raw-value");
const catalogNormalizedValueInput = document.querySelector("#catalog-normalized-value");
const catalogCodeInput = document.querySelector("#catalog-code");
const catalogNoteInput = document.querySelector("#catalog-note");
const catalogStatus = document.querySelector("#catalog-status");
const catalogValuesBody = document.querySelector("#catalog-values-body");
const refreshCatalogButton = document.querySelector("#refresh-catalog-values");

const profileInputs = {
  full_name: document.querySelector("#profile-full-name"),
  job_title: document.querySelector("#profile-job-title"),
  phone: document.querySelector("#profile-phone"),
  timezone: document.querySelector("#profile-timezone"),
  preferred_language: document.querySelector("#profile-language")
};

const organizationInputs = {
  org_name: document.querySelector("#org-name"),
  workspace_slug: document.querySelector("#org-slug"),
  website: document.querySelector("#org-website"),
  industry: document.querySelector("#org-industry"),
  billing_email: document.querySelector("#org-billing-email"),
  notes: document.querySelector("#org-notes")
};

let currentSettings = null;
let currentSession = null;
let currentCatalogValues = [];
let currentObservability = { summary: {}, events: [] };
initWorkbenchTabs({ defaultView: "access" });
const GMAIL_ALLOWED_SENDER = "sales@heymarksman.com";
const GOOGLE_CHAT_ALLOWED_ACCOUNT = "sales@heymarksman.com";
const GOOGLE_CHAT_APP_ENDPOINT = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/google-chat-app`;
const WHATSAPP_WEBHOOK_ENDPOINT = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/whatsapp-webhook`;

const CATALOG_CATEGORIES = [
  { key: "equipment", label: "Equipment" },
  { key: "trailer", label: "Trailer" },
  { key: "config", label: "Config" },
  { key: "operation", label: "Operation" },
  { key: "service", label: "Service" },
  { key: "driver", label: "Driver" },
  { key: "mx_border_crossing", label: "MX border city" },
  { key: "us_border_crossing", label: "US border city" },
  { key: "border_crossing", label: "Border crossing general" }
];

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

function setValue(input, value) {
  if (input) input.value = value || "";
}

function hasGoogleChatSpaceCandidate() {
  return Boolean((googleChatSpaceSelect?.value || "").trim() || (googleChatSpaceManualInput?.value || "").trim());
}

function updateGoogleChatSpaceSaveState(connected = true) {
  if (saveGoogleChatSpaceButton) saveGoogleChatSpaceButton.disabled = !connected || !hasGoogleChatSpaceCandidate();
}

function formValues(inputs) {
  return Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input?.value || ""]));
}

function categoryLabel(category) {
  return CATALOG_CATEGORIES.find((item) => item.key === category)?.label || category || "-";
}

function sourceLabel(source) {
  if (source === "rateware_manual_catalog") return "Manual";
  if (String(source || "").startsWith("rateware_reference_")) return "Reference";
  if (source === "rateware_seed") return "Seed";
  if (source === "rateware_google_catalog" || source === "cusCatalog") return "Imported";
  return source || "-";
}

function observabilitySourceLabel(source) {
  const value = String(source || "");
  if (value === "rateware_api") return "Rateware API";
  if (value === "gmail") return "Gmail";
  if (value === "google_chat") return "Google Chat";
  if (value === "whatsapp") return "WhatsApp";
  if (value === "bid_room") return "Bid Room";
  return value || "-";
}

function observabilitySeverityClass(severity) {
  if (severity === "error") return "danger";
  if (severity === "warning") return "warning";
  return "neutral";
}

function populateCatalogCategoryControls() {
  const options = CATALOG_CATEGORIES
    .map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`)
    .join("");
  if (catalogCategorySelect) catalogCategorySelect.innerHTML = options;
  if (catalogCategoryFilter) {
    const selected = catalogCategoryFilter.value || "";
    catalogCategoryFilter.innerHTML = `<option value="">All categories</option>${options}`;
    catalogCategoryFilter.value = CATALOG_CATEGORIES.some((item) => item.key === selected) ? selected : "";
  }
}

function fillForms(settings) {
  const profile = settings.profile || {};
  const organization = settings.organization || {};
  for (const [key, input] of Object.entries(profileInputs)) setValue(input, profile[key]);
  for (const [key, input] of Object.entries(organizationInputs)) setValue(input, organization[key]);
}

function renderAccess(settings) {
  const access = settings.access || {};
  accessMode.textContent = access.mode === "full_access" ? "Full" : "Roles later";
  workspaceName.textContent = settings.organization?.org_name || "-";
  accessCard.innerHTML = `
    <strong>${escapeHtml(access.label || "Full access enabled")}</strong>
    <p>${escapeHtml(access.detail || "All authenticated users can use every module.")}</p>
  `;
  const values = [
    currentSession?.user?.email || settings.profile?.owner_email || "-",
    access.label || "Full access enabled",
    "Disabled for MVP; all modules are available"
  ];
  settingsSession.querySelectorAll("dd").forEach((element, index) => {
    element.textContent = values[index] || "-";
  });
}

function renderOnboarding(settings) {
  const tasks = settings.onboarding || [];
  const completed = tasks.filter((task) => task.completed).length;
  const percent = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  onboardingScore.textContent = `${percent}%`;

  if (!tasks.length) {
    onboardingList.innerHTML = "<article>No onboarding tasks found.</article>";
    return;
  }

  onboardingList.innerHTML = tasks.map((task) => `
    <article class="${task.completed ? "is-complete" : ""}">
      <span>${task.completed ? "Done" : "Open"}</span>
      <div>
        <strong>${escapeHtml(task.label)}</strong>
        <p>${escapeHtml(task.detail)}</p>
      </div>
      <button class="secondary small-button" type="button" data-onboarding-task="${escapeHtml(task.key)}" ${task.completed ? "disabled" : ""}>
        ${task.completed ? "Complete" : "Mark done"}
      </button>
    </article>
  `).join("");
}

function renderAudit(settings) {
  const rows = settings.audit || [];
  auditCount.textContent = new Intl.NumberFormat().format(rows.length);
  if (!rows.length) {
    auditLogBody.innerHTML = `<tr><td colspan="5">No audit events yet.</td></tr>`;
    return;
  }
  auditLogBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(new Date(row.created_at).toLocaleString())}</td>
      <td>${escapeHtml(row.actor_email || row.owner_email || "-")}</td>
      <td><span class="status-pill">${escapeHtml(row.action || "-")}</span></td>
      <td>${escapeHtml([row.entity_type, row.entity_id].filter(Boolean).join(" / ") || "-")}</td>
      <td>${escapeHtml(row.summary || "-")}</td>
    </tr>
  `).join("");
}

function renderObservability(data = currentObservability) {
  currentObservability = data || { summary: {}, events: [] };
  const events = Array.isArray(currentObservability.events) ? currentObservability.events : [];
  const summary = currentObservability.summary || {};
  const bySource = summary.by_source || {};
  const sourceFilter = observabilitySourceFilter?.value || "";
  const severityFilter = observabilitySeverityFilter?.value || "";
  const visibleEvents = events.filter((event) => {
    const sourceOk = !sourceFilter || event.source === sourceFilter;
    const severityOk = !severityFilter || event.severity === severityFilter;
    return sourceOk && severityOk;
  });

  if (observabilitySummary) {
    const cards = [
      ["rateware_api", "Rateware API"],
      ["gmail", "Gmail"],
      ["google_chat", "Google Chat"],
      ["whatsapp", "WhatsApp"],
      ["bid_room", "Bid Room"]
    ];
    observabilitySummary.innerHTML = cards.map(([key, label]) => {
      const count = Number(bySource[key]?.total || 0);
      const errors = Number(bySource[key]?.error || 0);
      return `
        <article class="${errors ? "has-error" : count ? "has-warning" : ""}">
          <span>${escapeHtml(label)}</span>
          <strong>${count.toLocaleString()}</strong>
          <small>${errors ? `${errors.toLocaleString()} error(s)` : count ? "needs review" : "healthy"}</small>
        </article>
      `;
    }).join("");
  }

  if (!observabilityLogBody) return;
  if (!visibleEvents.length) {
    observabilityLogBody.innerHTML = `<tr><td colspan="5">No operational incidents in this view.</td></tr>`;
    setStatus(observabilityStatus, "No incidents match the current filters.", "success");
    return;
  }

  observabilityLogBody.innerHTML = visibleEvents.map((event) => `
    <tr>
      <td>${escapeHtml(event.at ? new Date(event.at).toLocaleString() : "-")}</td>
      <td>${escapeHtml(observabilitySourceLabel(event.source))}</td>
      <td><span class="status-pill ${observabilitySeverityClass(event.severity)}">${escapeHtml(event.severity || "info")}</span></td>
      <td>
        <strong>${escapeHtml(event.title || "-")}</strong>
        <small>${escapeHtml(event.detail || event.status || "")}</small>
      </td>
      <td>${escapeHtml(event.next_action || "-")}</td>
    </tr>
  `).join("");
  setStatus(
    observabilityStatus,
    `${visibleEvents.length.toLocaleString()} incident(s) shown from ${events.length.toLocaleString()} recent operational log(s).`,
    visibleEvents.some((event) => event.severity === "error") ? "warning" : "neutral"
  );
}

function humanGmailMessage(message = "") {
  const text = String(message || "");
  if (/GOOGLE_CLIENT|GOOGLE_CLIENT_SECRET|GMAIL_TOKEN_ENCRYPTION_KEY|OAuth is not configured|OAuth client is not configured|Google secrets|Supabase secrets/i.test(text)) {
    return "Gmail connector is not enabled for this deployment yet. No user credentials are required.";
  }
  return humanizeError(text || "Gmail action could not be completed.");
}

function humanGoogleChatMessage(message = "") {
  const text = String(message || "");
  if (/GOOGLE_CLIENT|GOOGLE_CLIENT_SECRET|GMAIL_TOKEN_ENCRYPTION_KEY|OAuth is not configured|OAuth client is not configured|Google secrets|Supabase secrets/i.test(text)) {
    return "Google Chat connector is not enabled for this deployment yet. No user credentials are required.";
  }
  if (/space/i.test(text) && /not available|not found|not configured|Select/i.test(text)) {
    return "Select a Google Chat space for Bid Room messages.";
  }
  if (/Google Chat app not found|configure the app|Chat app/i.test(text)) {
    return "Google Chat is connected, but the Google Cloud Chat app is not configured yet. Configure the Chat API as an HTTP app using the endpoint shown below, then retry sync.";
  }
  return humanizeError(text || "Google Chat action could not be completed.");
}

function humanWhatsappMessage(message = "") {
  const text = String(message || "");
  if (/WHATSAPP_|META_|WABA|PHONE_NUMBER_ID|ACCESS_TOKEN|Meta secrets|not configured|connector is not fully configured/i.test(text)) {
    return "WhatsApp Business connector is not enabled for this deployment. Configure Meta WhatsApp secrets server-side.";
  }
  if (/template mapping|Meta template|message template/i.test(text)) {
    return "This message needs an approved Meta WhatsApp template. Sync templates in Settings and map the template before sending.";
  }
  if (/do-not-contact|do not contact|opted_out/i.test(text)) {
    return "This vendor is blocked for WhatsApp automated sends. Review the vendor WhatsApp permission fields.";
  }
  return humanizeError(text || "WhatsApp action could not be completed.");
}

function applyOAuthUrlFeedback() {
  const params = new URLSearchParams(window.location.search);
  const chatStatus = params.get("chat");
  const gmailStatus = params.get("gmail");
  const reason = params.get("reason") || "";
  if (chatStatus === "connected") {
    setStatus(googleChatConnectionStatus, "Google Chat authorization completed. Select and save the Bid Room Space.", "success");
  } else if (chatStatus === "error") {
    setStatus(googleChatConnectionStatus, humanGoogleChatMessage(reason || "Google Chat authorization failed."), "error");
  }
  if (gmailStatus === "connected") {
    setStatus(gmailConnectionStatus, "Gmail authorization completed.", "success");
  } else if (gmailStatus === "error") {
    setStatus(gmailConnectionStatus, humanGmailMessage(reason || "Gmail authorization failed."), "error");
  }
  const whatsappStatus = params.get("whatsapp");
  if (whatsappStatus === "connected") {
    setStatus(whatsappConnectionStatus, "WhatsApp Business connection completed.", "success");
  } else if (whatsappStatus === "error") {
    setStatus(whatsappConnectionStatus, humanWhatsappMessage(reason || "WhatsApp Business connection failed."), "error");
  }
}

function renderGmailConnections(data = currentSettings?.gmail) {
  if (!gmailConnectionCard) return;
  const row = data?.rows?.[0] || {};
  const connected = row.status === "connected";
  const configured = row.configured === true;
  const scopes = Array.isArray(row.scopes) ? row.scopes : [];
  const canReadDeliveryFailures = scopes.includes("https://www.googleapis.com/auth/gmail.readonly")
    || scopes.includes("https://www.googleapis.com/auth/gmail.modify")
    || scopes.includes("https://mail.google.com/");
  const statusLabel = connected ? "Connected" : row.status === "error" ? "Connection error" : row.status === "revoked" ? "Disconnected" : "Not connected";
  const connectionCopy = connected
    ? "Ready to send invitations and monitor delivery failures from this approved Gmail account."
    : configured
      ? "Connect once with Google consent. Users never type or share Gmail credentials inside Rateware."
      : "This Gmail connector is not enabled for the deployment yet. Once enabled, connecting is a one-click Google consent flow.";
  gmailConnectionCard.innerHTML = `
    <strong>${escapeHtml(GMAIL_ALLOWED_SENDER)}</strong>
    <p>${escapeHtml(connectionCopy)}</p>
    <dl class="diagnostic-list compact-list">
      <div><dt>Status</dt><dd><span class="status-pill ${connected ? "success" : row.status === "error" ? "danger" : "neutral"}">${escapeHtml(statusLabel)}</span></dd></div>
      <div><dt>Sender</dt><dd>${escapeHtml(GMAIL_ALLOWED_SENDER)}</dd></div>
      <div><dt>Delivery failures</dt><dd>${escapeHtml(canReadDeliveryFailures ? "Monitoring enabled" : connected ? "Reconnect once to enable" : "-")}</dd></div>
      <div><dt>Updated</dt><dd>${escapeHtml(row.updated_at ? new Date(row.updated_at).toLocaleString() : "-")}</dd></div>
    </dl>
    ${row.last_error ? `<p class="error-text">${escapeHtml(humanGmailMessage(row.last_error))}</p>` : ""}
  `;
  if (connectGmailButton) {
    connectGmailButton.disabled = !configured || connected;
    connectGmailButton.textContent = connected ? "Gmail connected" : "Connect Gmail";
  }
  if (disconnectGmailButton) disconnectGmailButton.disabled = !connected && row.status !== "error";
  if (syncGmailBouncesButton) syncGmailBouncesButton.disabled = !connected || !canReadDeliveryFailures;
  setStatus(
    gmailConnectionStatus,
    configured
      ? (connected
        ? (canReadDeliveryFailures ? "Gmail is connected for invitations and delivery failure monitoring." : "Reconnect Gmail once to enable delivery failure monitoring.")
        : "Click Connect Gmail and approve access in Google.")
      : "Gmail connector is not enabled yet. No user credentials are required.",
    configured ? (connected && canReadDeliveryFailures ? "success" : "neutral") : "warning"
  );
}

function renderGoogleChatConnections(data = currentSettings?.google_chat, spacesData = null) {
  if (!googleChatConnectionCard) return;
  const row = data?.rows?.[0] || {};
  const connected = row.status === "connected";
  const configured = row.configured === true;
  const hasSpace = Boolean(row.default_space_name);
  const inboundEnabled = row.inbound_enabled === true;
  const needsChatAppSetup = /Google Chat app not found|configure the app|Chat app/i.test(String(row.last_error || ""));
  const statusLabel = connected
    ? hasSpace ? inboundEnabled ? "Connected" : "Connected outbound only" : "Connected, select Space"
    : row.status === "error" ? "Connection error" : row.status === "revoked" ? "Disconnected" : "Not connected";
  const connectionCopy = connected
    ? hasSpace
      ? inboundEnabled
        ? "Bid Room chat messages mirror to Google Chat and replies from Google Chat sync back into Rateware."
        : "Bid Room chat messages mirror to Google Chat. Reconnect Google Chat once to enable replies from Google Chat back into Rateware."
      : "Google Chat is connected. Select the Space where Bid Room threads should appear."
    : configured
      ? "The Space exists in Google Chat, but Rateware still needs Google authorization before it can read Spaces or mirror Bid Room threads."
      : "This Google Chat connector is not enabled for the deployment yet.";
  googleChatConnectionCard.innerHTML = `
    <strong>${escapeHtml(GOOGLE_CHAT_ALLOWED_ACCOUNT)}</strong>
    <p>${escapeHtml(connectionCopy)}</p>
    <dl class="diagnostic-list compact-list">
      <div><dt>Status</dt><dd><span class="status-pill ${connected && hasSpace && inboundEnabled ? "success" : connected && hasSpace ? "warning" : row.status === "error" ? "danger" : "neutral"}">${escapeHtml(statusLabel)}</span></dd></div>
      <div><dt>Account</dt><dd>${escapeHtml(GOOGLE_CHAT_ALLOWED_ACCOUNT)}</dd></div>
      <div><dt>Bid Room Space</dt><dd>${escapeHtml(row.default_space_display_name || row.default_space_name || "-")}</dd></div>
      <div><dt>Updated</dt><dd>${escapeHtml(row.updated_at ? new Date(row.updated_at).toLocaleString() : "-")}</dd></div>
    </dl>
    ${needsChatAppSetup ? `
      <div class="integration-callout warning">
        <strong>Google Chat app setup required</strong>
        <p>In Google Cloud > Google Chat API > Configuration, set Connection settings to HTTP endpoint URL and paste this endpoint.</p>
        <code>${escapeHtml(GOOGLE_CHAT_APP_ENDPOINT)}</code>
      </div>
    ` : ""}
    ${connected && hasSpace && !inboundEnabled ? `
      <div class="integration-callout warning">
        <strong>Reconnect required for inbound sync</strong>
        <p>Google Chat was connected before Rateware requested message-read permission. Click Connect Google Chat again and approve access.</p>
      </div>
    ` : ""}
    ${row.last_error ? `<p class="error-text">${escapeHtml(humanGoogleChatMessage(row.last_error))}</p>` : ""}
  `;
  if (connectGoogleChatButton) {
    connectGoogleChatButton.disabled = !configured || (connected && inboundEnabled);
    connectGoogleChatButton.textContent = connected && !inboundEnabled
      ? "Reconnect Google Chat"
      : connected
        ? "Google Chat connected"
        : "Connect Google Chat with Google";
  }
  if (disconnectGoogleChatButton) disconnectGoogleChatButton.disabled = !connected && row.status !== "error";
  if (retryGoogleChatSyncButton) retryGoogleChatSyncButton.disabled = !connected || !hasSpace;
  if (googleChatSpaceRow) googleChatSpaceRow.classList.toggle("hidden", !connected);
  const spaces = spacesData?.rows || [];
  const spacesError = spacesData?.error ? humanGoogleChatMessage(spacesData.error) : "";
  if (googleChatSpaceSelect) {
    const selected = row.default_space_name || spacesData?.default_space_name || googleChatSpaceSelect.value || "";
    googleChatSpaceSelect.innerHTML = connected
      ? `<option value="">Select Bid Room Space</option>${spaces.map((space) => `
          <option value="${escapeHtml(space.name)}">${escapeHtml(space.display_name || space.name)}</option>
        `).join("")}`
      : `<option value="">Connect Google Chat first</option>`;
    googleChatSpaceSelect.value = spaces.some((space) => space.name === selected) ? selected : "";
  }
  if (googleChatSpaceManualInput) {
    const selected = row.default_space_name || spacesData?.default_space_name || "";
    const selectedIsListed = spaces.some((space) => space.name === selected);
    googleChatSpaceManualInput.value = connected && selected && !selectedIsListed
      ? selected
      : googleChatSpaceManualInput.value || "";
    googleChatSpaceManualInput.disabled = !connected;
  }
  if (googleChatSpaceHelp) {
    googleChatSpaceHelp.textContent = connected
      ? spacesError
        ? `${spacesError} Paste the Google Chat Space link or resource name instead.`
        : "Choose a listed Space, or paste the Google Chat Space link if it does not appear."
      : "Connect Google Chat before selecting the Bid Room Space.";
    googleChatSpaceHelp.dataset.tone = spacesError ? "warning" : "neutral";
  }
  updateGoogleChatSpaceSaveState(connected);
  setStatus(
    googleChatConnectionStatus,
    configured
      ? (connected
          ? (spacesError || (hasSpace ? "Google Chat is ready for Bid Room threads." : "Select and save the Bid Room Space."))
          : "Click Connect Google Chat with Google and approve access.")
      : "Google Chat connector is not enabled yet. No user credentials are required.",
    configured ? (spacesError ? "warning" : connected && hasSpace ? "success" : "neutral") : "warning"
  );
}

function renderWhatsappConnections(data = currentSettings?.whatsapp) {
  if (!whatsappConnectionCard) return;
  const row = data?.rows?.[0] || {};
  const connected = row.status === "connected";
  const configured = row.configured === true;
  const manualSetup = row.status === "manual_setup";
  const templateCount = Number(row.template_count || 0);
  const senderLabel = row.display_phone_number
    ? [row.display_phone_number, row.verified_name].filter(Boolean).join(" | ")
    : row.phone_number_id_configured
      ? "Configured. Run Test line to fetch sender phone."
      : "-";
  const accountLabel = [
    row.waba_id_configured ? `WABA ${row.waba_id || "configured"}` : "",
    row.business_account_id_configured ? `Account ${row.business_account_id || "configured"}` : ""
  ].filter(Boolean).join(" | ") || "-";
  const webhookLabel = row.webhook_configured
    ? row.app_secret_configured
      ? "Verify token + app secret configured"
      : "Verify token configured; app secret missing"
    : "Verify token missing";
  const statusLabel = connected
    ? "Connected"
    : manualSetup
      ? "Manual setup"
      : row.status === "error"
        ? "Connection error"
        : row.status === "revoked"
          ? "Disconnected"
          : "Not configured";
  const connectionCopy = connected
    ? "Ready to create direct WhatsApp Business drafts and send approved Meta templates to opted-in vendors."
    : configured
      ? "Meta WhatsApp server secrets are configured. Test the line and sync approved templates before sending."
      : "WhatsApp Business connector is not enabled for this deployment. Configure Meta WhatsApp secrets server-side.";
  whatsappConnectionCard.innerHTML = `
    <strong>Meta WhatsApp Business Platform</strong>
    <p>${escapeHtml(connectionCopy)}</p>
    <dl class="diagnostic-list compact-list">
      <div><dt>Status</dt><dd><span class="status-pill ${connected ? "success" : row.status === "error" ? "danger" : configured ? "warning" : "neutral"}">${escapeHtml(statusLabel)}</span></dd></div>
      <div><dt>Sender</dt><dd>${escapeHtml(senderLabel)}</dd></div>
      <div><dt>WABA / account</dt><dd>${escapeHtml(accountLabel)}</dd></div>
      <div><dt>Templates</dt><dd>${escapeHtml(templateCount ? `${templateCount} synced` : row.templates_last_synced_at ? "Synced" : "-")}</dd></div>
      <div><dt>Webhook</dt><dd>${escapeHtml(row.webhook_verified_at ? "Verified" : webhookLabel)}</dd></div>
      <div><dt>Updated</dt><dd>${escapeHtml(row.updated_at ? new Date(row.updated_at).toLocaleString() : "-")}</dd></div>
    </dl>
    <div class="integration-callout">
      <strong>Webhook endpoint</strong>
      <p>Use this URL in Meta Webhooks for WhatsApp Business message statuses.</p>
      <code>${escapeHtml(WHATSAPP_WEBHOOK_ENDPOINT)}</code>
    </div>
    ${row.last_error ? `<p class="error-text">${escapeHtml(humanWhatsappMessage(row.last_error))}</p>` : ""}
  `;
  if (connectWhatsappButton) {
    connectWhatsappButton.disabled = !configured || connected;
    connectWhatsappButton.textContent = connected ? "WhatsApp connected" : "Connect WhatsApp";
  }
  if (disconnectWhatsappButton) disconnectWhatsappButton.disabled = !connected && row.status !== "error" && !manualSetup;
  if (testWhatsappButton) testWhatsappButton.disabled = !configured;
  if (syncWhatsappTemplatesButton) syncWhatsappTemplatesButton.disabled = !configured;
  if (verifyWhatsappWebhookButton) verifyWhatsappWebhookButton.disabled = !configured;
  setStatus(
    whatsappConnectionStatus,
    configured
      ? (connected
          ? "WhatsApp Business is ready for approved template sends. Group delivery remains manual unless explicitly enabled."
          : "Test the line and sync approved templates before enabling WhatsApp sends.")
      : "WhatsApp Business connector is not enabled for this deployment. Configure Meta WhatsApp secrets server-side.",
    configured ? (connected ? "success" : "warning") : "warning"
  );
}

function renderCatalogValues(rows = currentCatalogValues) {
  currentCatalogValues = rows || [];
  const category = catalogCategoryFilter?.value || "";
  const visibleRows = currentCatalogValues
    .filter((row) => !category || row.category === category)
    .sort((a, b) => {
      const categorySort = categoryLabel(a.category).localeCompare(categoryLabel(b.category));
      if (categorySort) return categorySort;
      return String(a.normalized_value || a.raw_value || "").localeCompare(String(b.normalized_value || b.raw_value || ""));
    });

  if (!catalogValuesBody) return;
  if (!visibleRows.length) {
    catalogValuesBody.innerHTML = `<tr><td colspan="6">No catalog values found.</td></tr>`;
    setStatus(catalogStatus, "No values in this catalog view.", "warning");
    return;
  }

  catalogValuesBody.innerHTML = visibleRows.map((row) => {
    const source = sourceLabel(row.source);
    const active = row.active !== false;
    return `
      <tr class="${active ? "" : "is-muted-row"}">
        <td>${escapeHtml(categoryLabel(row.category))}</td>
        <td>
          <strong>${escapeHtml(row.normalized_value || row.raw_value || "-")}</strong>
          ${row.raw_value && row.raw_value !== row.normalized_value ? `<small>${escapeHtml(row.raw_value)}</small>` : ""}
        </td>
        <td>${escapeHtml(row.code || "-")}</td>
        <td><span class="review-chip ${row.is_manual ? "success" : "neutral"}">${escapeHtml(source)}</span></td>
        <td><span class="review-chip ${active ? "success" : "muted"}">${escapeHtml(active ? "active" : "archived")}</span></td>
        <td>
          ${row.can_archive ? `<button type="button" class="danger small-button" data-catalog-archive="${escapeHtml(row.id)}">Archive</button>` : `<span class="muted-text">Locked</span>`}
        </td>
      </tr>
    `;
  }).join("");
  setStatus(catalogStatus, `${visibleRows.length.toLocaleString()} value(s) shown. Manual active values feed Staging and Rateware dropdowns.`, "success");
}

function renderSettings(settings) {
  currentSettings = settings;
  fillForms(settings);
  renderAccess(settings);
  renderOnboarding(settings);
  renderAudit(settings);
  renderGmailConnections(settings.gmail);
  renderGoogleChatConnections(settings.google_chat);
  renderWhatsappConnections(settings.whatsapp);
}

async function loadObservability() {
  setStatus(observabilityStatus, "Loading operational logs...");
  try {
    const data = await fetchObservabilityEvents({ limit: 150 });
    renderObservability(data);
  } catch (error) {
    if (observabilityLogBody) {
      observabilityLogBody.innerHTML = `
        <tr>
          <td colspan="5">
            <strong>Observability could not load</strong>
            <small>${escapeHtml(humanizeError(error) || "The request could not reach Rateware services.")}</small>
          </td>
        </tr>
      `;
    }
    setStatus(observabilityStatus, "Operational logs could not load. Retry after checking the API connection.", "error");
  }
}

async function loadSettings() {
  try {
    const settings = await fetchSaasSettings();
    renderSettings(settings);
    await loadObservability();
    if (settings.google_chat?.rows?.[0]?.status === "connected") {
      await loadGoogleChatConnections();
    }
    if (settings.whatsapp?.rows?.[0]?.status === "connected") {
      await loadWhatsappConnections();
    }
  } catch (error) {
    auditLogBody.innerHTML = `<tr><td colspan="5">${escapeHtml(humanizeError(error))}</td></tr>`;
  }
}

async function loadCatalogValues() {
  setStatus(catalogStatus, "Loading catalog values...");
  try {
    const values = await fetchCatalogValues(catalogCategoryFilter?.value || "");
    renderCatalogValues(values);
  } catch (error) {
    setStatus(catalogStatus, error.message, "error");
  }
}

async function loadGmailConnections() {
  setStatus(gmailConnectionStatus, "Checking Gmail connection...");
  try {
    const data = await fetchGmailConnections();
    currentSettings = currentSettings || {};
    currentSettings.gmail = data;
    renderGmailConnections(data);
  } catch (error) {
    setStatus(gmailConnectionStatus, humanGmailMessage(error.message), "error");
  }
}

async function loadGoogleChatConnections() {
  setStatus(googleChatConnectionStatus, "Checking Google Chat connection...");
  try {
    const data = await fetchGoogleChatConnections();
    currentSettings = currentSettings || {};
    currentSettings.google_chat = data;
    const row = data?.rows?.[0] || {};
    let spaces = null;
    if (row.status === "connected") {
      try {
        spaces = await fetchGoogleChatSpaces();
      } catch (error) {
        spaces = { connected: true, rows: [], error: error.message };
      }
    }
    renderGoogleChatConnections(data, spaces);
  } catch (error) {
    setStatus(googleChatConnectionStatus, humanGoogleChatMessage(error.message), "error");
  }
}

async function loadWhatsappConnections() {
  setStatus(whatsappConnectionStatus, "Checking WhatsApp Business connection...");
  try {
    const data = await fetchWhatsappConnections();
    currentSettings = currentSettings || {};
    currentSettings.whatsapp = data;
    renderWhatsappConnections(data);
  } catch (error) {
    setStatus(whatsappConnectionStatus, humanWhatsappMessage(error.message), "error");
  }
}

initAuthControls();
populateCatalogCategoryControls();
requirePrivatePage().then((session) => {
  currentSession = session;
  if (session?.token) {
    loadSettings().then(applyOAuthUrlFeedback);
  }
});

refreshButton?.addEventListener("click", loadSettings);
refreshObservabilityButton?.addEventListener("click", loadObservability);
observabilitySourceFilter?.addEventListener("change", () => renderObservability(currentObservability));
observabilitySeverityFilter?.addEventListener("change", () => renderObservability(currentObservability));
refreshCatalogButton?.addEventListener("click", loadCatalogValues);
refreshGmailConnectionButton?.addEventListener("click", loadGmailConnections);
refreshGoogleChatConnectionButton?.addEventListener("click", loadGoogleChatConnections);
refreshWhatsappConnectionButton?.addEventListener("click", loadWhatsappConnections);

connectGmailButton?.addEventListener("click", async () => {
  setStatus(gmailConnectionStatus, `Preparing Google consent for ${GMAIL_ALLOWED_SENDER}...`);
  try {
    const result = await startGmailOAuth(GMAIL_ALLOWED_SENDER, "settings.html?view=integrations");
    if (!result.authorization_url) throw new Error("Google authorization URL was not returned.");
    window.location.href = result.authorization_url;
  } catch (error) {
    setStatus(gmailConnectionStatus, humanGmailMessage(error.message), "error");
  }
});

disconnectGmailButton?.addEventListener("click", async () => {
  setStatus(gmailConnectionStatus, "Disconnecting Gmail sender...");
  try {
    await disconnectGmailConnection();
    await loadGmailConnections();
  } catch (error) {
    setStatus(gmailConnectionStatus, humanGmailMessage(error.message), "error");
  }
});

syncGmailBouncesButton?.addEventListener("click", async () => {
  syncGmailBouncesButton.disabled = true;
  setStatus(gmailConnectionStatus, "Checking Gmail delivery failures...");
  try {
    const result = await syncGmailBounces(50);
    await loadGmailConnections();
    setStatus(
      gmailConnectionStatus,
      `Delivery failure sync complete: ${Number(result.detected || 0).toLocaleString()} email(s) detected, ${Number(result.blocked || 0).toLocaleString()} blocked, ${Number(result.cleaned_vendors || 0).toLocaleString()} vendor contact(s) cleaned.`,
      "success"
    );
  } catch (error) {
    setStatus(gmailConnectionStatus, humanGmailMessage(error.message), "error");
  } finally {
    renderGmailConnections(currentSettings?.gmail);
  }
});

connectGoogleChatButton?.addEventListener("click", async () => {
  setStatus(googleChatConnectionStatus, `Preparing Google consent for ${GOOGLE_CHAT_ALLOWED_ACCOUNT}...`);
  try {
    const result = await startGoogleChatOAuth(GOOGLE_CHAT_ALLOWED_ACCOUNT, "settings.html?view=integrations");
    if (!result.authorization_url) throw new Error("Google authorization URL was not returned.");
    window.location.href = result.authorization_url;
  } catch (error) {
    setStatus(googleChatConnectionStatus, humanGoogleChatMessage(error.message), "error");
  }
});

disconnectGoogleChatButton?.addEventListener("click", async () => {
  setStatus(googleChatConnectionStatus, "Disconnecting Google Chat...");
  try {
    await disconnectGoogleChatConnection();
    await loadGoogleChatConnections();
  } catch (error) {
    setStatus(googleChatConnectionStatus, humanGoogleChatMessage(error.message), "error");
  }
});

retryGoogleChatSyncButton?.addEventListener("click", async () => {
  setStatus(googleChatConnectionStatus, "Retrying failed Google Chat messages...");
  try {
    const result = await retryGoogleChatSync(50);
    await loadGoogleChatConnections();
    setStatus(
      googleChatConnectionStatus,
      `Google Chat retry finished: ${result.synced || 0} synced, ${result.failed || 0} failed, ${result.skipped || 0} skipped.`,
      result.failed ? "warning" : "success"
    );
  } catch (error) {
    setStatus(googleChatConnectionStatus, humanGoogleChatMessage(error.message), "error");
  }
});

googleChatSpaceSelect?.addEventListener("change", () => {
  updateGoogleChatSpaceSaveState(true);
});

googleChatSpaceManualInput?.addEventListener("input", () => {
  updateGoogleChatSpaceSaveState(true);
});

saveGoogleChatSpaceButton?.addEventListener("click", async () => {
  const spaceName = googleChatSpaceSelect?.value || "";
  const manualSpaceName = googleChatSpaceManualInput?.value?.trim() || "";
  if (!spaceName && !manualSpaceName) {
    setStatus(googleChatConnectionStatus, "Select a Google Chat space or paste the Space link first.", "error");
    return;
  }
  setStatus(googleChatConnectionStatus, "Saving Bid Room Space...");
  try {
    await saveGoogleChatSettings(spaceName, manualSpaceName);
    await loadGoogleChatConnections();
  } catch (error) {
    setStatus(googleChatConnectionStatus, humanGoogleChatMessage(error.message), "error");
  }
});

connectWhatsappButton?.addEventListener("click", async () => {
  setStatus(whatsappConnectionStatus, "Preparing WhatsApp Business connection...");
  try {
    const result = await startWhatsappBusinessConnection("settings.html?view=integrations");
    if (result.authorization_url) {
      window.location.href = result.authorization_url;
      return;
    }
    await loadWhatsappConnections();
    setStatus(whatsappConnectionStatus, result.message || "WhatsApp Business connection is managed by server-side Meta secrets.", "success");
  } catch (error) {
    setStatus(whatsappConnectionStatus, humanWhatsappMessage(error.message), "error");
  }
});

disconnectWhatsappButton?.addEventListener("click", async () => {
  if (!window.confirm("Disconnect WhatsApp Business for this workspace? Existing draft rows stay unchanged.")) return;
  setStatus(whatsappConnectionStatus, "Disconnecting WhatsApp Business...");
  try {
    await disconnectWhatsappBusinessConnection();
    await loadWhatsappConnections();
  } catch (error) {
    setStatus(whatsappConnectionStatus, humanWhatsappMessage(error.message), "error");
  }
});

testWhatsappButton?.addEventListener("click", async () => {
  setStatus(whatsappConnectionStatus, "Testing WhatsApp Business sender...");
  testWhatsappButton.disabled = true;
  try {
    const result = await testWhatsappBusinessConnection();
    await loadWhatsappConnections();
    setStatus(
      whatsappConnectionStatus,
      `WhatsApp line ready: ${result.display_phone_number || result.phone_number_id || "configured sender"}.`,
      "success"
    );
  } catch (error) {
    setStatus(whatsappConnectionStatus, humanWhatsappMessage(error.message), "error");
  } finally {
    renderWhatsappConnections(currentSettings?.whatsapp);
  }
});

syncWhatsappTemplatesButton?.addEventListener("click", async () => {
  setStatus(whatsappConnectionStatus, "Syncing approved Meta WhatsApp templates...");
  syncWhatsappTemplatesButton.disabled = true;
  try {
    const result = await syncWhatsappTemplates();
    await loadWhatsappConnections();
    setStatus(
      whatsappConnectionStatus,
      `${Number(result.synced || result.rows?.length || 0).toLocaleString()} WhatsApp template(s) synced from Meta.`,
      "success"
    );
  } catch (error) {
    setStatus(whatsappConnectionStatus, humanWhatsappMessage(error.message), "error");
  } finally {
    renderWhatsappConnections(currentSettings?.whatsapp);
  }
});

verifyWhatsappWebhookButton?.addEventListener("click", async () => {
  setStatus(whatsappConnectionStatus, "Checking WhatsApp webhook configuration...");
  try {
    const result = await verifyWhatsappWebhook();
    await loadWhatsappConnections();
    setStatus(
      whatsappConnectionStatus,
      result.verified ? `Webhook configured: ${result.endpoint}` : `Webhook endpoint ready: ${result.endpoint}`,
      result.verified ? "success" : "warning"
    );
  } catch (error) {
    setStatus(whatsappConnectionStatus, humanWhatsappMessage(error.message), "error");
  }
});
catalogCategoryFilter?.addEventListener("change", loadCatalogValues);

catalogValueForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const rawValue = catalogRawValueInput?.value?.trim() || "";
  if (!rawValue) {
    setStatus(catalogStatus, "Write a catalog value first.", "error");
    return;
  }
  setStatus(catalogStatus, "Saving catalog value...");
  try {
    await saveCatalogValue({
      category: catalogCategorySelect?.value || "equipment",
      raw_value: rawValue,
      normalized_value: catalogNormalizedValueInput?.value?.trim() || rawValue,
      code: catalogCodeInput?.value?.trim() || "",
      note: catalogNoteInput?.value?.trim() || ""
    });
    catalogRawValueInput.value = "";
    catalogNormalizedValueInput.value = "";
    catalogCodeInput.value = "";
    catalogNoteInput.value = "";
    setStatus(catalogStatus, "Catalog value saved. It is now available in Staging and Rateware dropdowns.", "success");
    await loadCatalogValues();
  } catch (error) {
    setStatus(catalogStatus, error.message, "error");
  }
});

catalogValuesBody?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-catalog-archive]");
  if (!button) return;
  const row = currentCatalogValues.find((item) => item.id === button.dataset.catalogArchive);
  const label = row?.normalized_value || row?.raw_value || "this value";
  if (!window.confirm(`Archive manual catalog value "${label}"? It will stop appearing in new dropdown options.`)) return;
  button.disabled = true;
  setStatus(catalogStatus, "Archiving catalog value...");
  try {
    await archiveCatalogValue(button.dataset.catalogArchive);
    setStatus(catalogStatus, "Catalog value archived.", "success");
    await loadCatalogValues();
  } catch (error) {
    button.disabled = false;
    setStatus(catalogStatus, error.message, "error");
  }
});

profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(profileStatus, "Saving profile...");
  try {
    await updateSaasProfile(formValues(profileInputs));
    setStatus(profileStatus, "Profile saved.", "success");
    await loadSettings();
  } catch (error) {
    setStatus(profileStatus, error.message, "error");
  }
});

organizationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(organizationStatus, "Saving organization...");
  try {
    await updateSaasOrganization(formValues(organizationInputs));
    setStatus(organizationStatus, "Organization saved.", "success");
    await loadSettings();
  } catch (error) {
    setStatus(organizationStatus, error.message, "error");
  }
});

onboardingList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-onboarding-task]");
  if (!button) return;
  button.disabled = true;
  try {
    const result = await updateOnboardingTask(button.dataset.onboardingTask, true);
    currentSettings.onboarding = result.onboarding || currentSettings.onboarding;
    currentSettings.audit = result.audit || currentSettings.audit;
    renderOnboarding(currentSettings);
    renderAudit(currentSettings);
  } catch (error) {
    button.disabled = false;
    button.textContent = humanizeError(error);
  }
});
