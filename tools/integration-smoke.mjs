#!/usr/bin/env node

import { SUPABASE_URL } from "../src/config.js";

const args = process.argv.slice(2);
const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const defaultAppOrigin = "https://rateware.vercel.app";
const defaultRecipient = "sales@heymarksman.com";
const senderEmail = "sales@heymarksman.com";
const safeRecipientPattern = /@(heymarksman\.com|xbfreight\.com)$/i;

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) return args[index + 1];
  return fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function printHelp() {
  console.log(`
Rateware production integration smoke test

Required for authenticated checks:
  RATEWARE_E2E_KINDE_TOKEN=<token> node tools/integration-smoke.mjs

Optional:
  --recipient sales@heymarksman.com
  --send-gmail                 Sends one real Gmail test invite to --recipient.
  --allow-external-email        Allows --send-gmail to non heymarksman.com / xbfreight.com recipients.
  --approved-closeout           Creates approved Rateware rows. Default is pending_review.
  --app-origin https://rateware.vercel.app

Checks:
  - Vercel deploy responds.
  - Kinde token is present, current, and accepted by Rateware API.
  - Supabase Edge API responds.
  - Gmail OAuth connection is connected, and optional real send works.
  - Google Chat inbound endpoint responds.
  - Google Chat OAuth connection has outbound and inbound scopes.
  - Bid Room chat syncs outbound to Google Chat.
  - Google Chat inbound sync runs without error.
  - RFx award closeout creates Rateware staging rows.

Safe defaults:
  - No Gmail is sent unless --send-gmail is passed.
  - Closeout writes to pending_review unless --approved-closeout is passed.
`);
}

if (hasFlag("--help")) {
  printHelp();
  process.exit(0);
}

const kindeToken = (argValue("--kinde-token", process.env.RATEWARE_E2E_KINDE_TOKEN || process.env.KINDE_TOKEN || "") || "").trim();
const appOrigin = argValue("--app-origin", process.env.RATEWARE_E2E_APP_ORIGIN || defaultAppOrigin).replace(/\/$/, "");
const recipient = argValue("--recipient", process.env.RATEWARE_E2E_RECIPIENT || defaultRecipient).trim().toLowerCase();
const sendGmail = hasFlag("--send-gmail");
const allowExternalEmail = hasFlag("--allow-external-email");
const closeoutStatus = hasFlag("--approved-closeout") ? "approved" : "pending_review";

if (sendGmail && !allowExternalEmail && !safeRecipientPattern.test(recipient)) {
  console.error(`Refusing to send real Gmail to external recipient "${recipient}". Use --allow-external-email only when intentionally testing external delivery.`);
  process.exit(1);
}

const report = {
  run_id: runId,
  app_origin: appOrigin,
  mode: {
    recipient,
    send_gmail: sendGmail,
    closeout_status: closeoutStatus
  },
  checks: [],
  artifacts: {}
};

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function record(name, status, details = {}) {
  const item = {
    name,
    status,
    at: new Date().toISOString(),
    ...details
  };
  report.checks.push(item);
  const marker = status === "pass" ? "ok" : status;
  console.log(`[${marker}] ${name}`);
  return item;
}

async function check(name, run, options = {}) {
  try {
    const details = await run();
    record(name, "pass", details || {});
    return details;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(name, options.required === false ? "warn" : "fail", { error: message });
    if (options.stopOnFail) throw error;
    return null;
  }
}

function skip(name, reason) {
  record(name, "skip", { reason });
}

function requireValue(value, message) {
  if (value === null || value === undefined || value === "") throw new Error(message);
  return value;
}

function parseJwt(token) {
  const [, payload] = token.split(".");
  if (!payload) return {};
  try {
    return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return {};
  }
}

async function parseResponse(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { text };
  }
  if (!response.ok) {
    const message = data.error || data.message || data.text || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function rateware(action, payload = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/rateware-api`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${kindeToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action, ...payload })
  });
  return parseResponse(response);
}

async function carrier(action, invitationToken, payload = {}) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/rfx-bid-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token: invitationToken, ...payload })
  });
  return parseResponse(response);
}

function tomorrowPlus(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function eta(hours) {
  return new Date(Date.now() + hours * 3600000).toISOString();
}

async function checkVercelDeploy() {
  const appResponse = await fetch(`${appOrigin}/app`, { redirect: "follow" });
  const appText = await appResponse.text();
  if (!appResponse.ok) throw new Error(`App returned HTTP ${appResponse.status}.`);
  if (!/Rateware/i.test(appText)) throw new Error("App HTML did not contain Rateware marker.");

  const configResponse = await fetch(`${appOrigin}/src/config.js`, { redirect: "follow" });
  const configText = await configResponse.text();
  if (!configResponse.ok) throw new Error(`Config asset returned HTTP ${configResponse.status}.`);
  if (!configText.includes("SUPABASE_URL") || !configText.includes("KINDE_DOMAIN")) {
    throw new Error("Deployed config asset does not expose expected Rateware settings.");
  }
  return {
    app_status: appResponse.status,
    config_status: configResponse.status,
    url: `${appOrigin}/app`
  };
}

async function checkGoogleChatInboundEndpoint() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/google-chat-app`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "MESSAGE",
      space: { displayName: `Rateware smoke ${runId}` },
      user: { displayName: "Rateware smoke" },
      message: { text: `Smoke test ${runId}` }
    })
  });
  const data = await parseResponse(response);
  if (!cleanText(data.text)) throw new Error("Google Chat app endpoint did not return text.");
  return { endpoint_status: response.status, response: cleanText(data.text) };
}

async function ensureTemplate() {
  const templates = await rateware("list_outreach_templates");
  const existing = (templates.rows || []).find((template) => template.active && cleanText(template.name) === "Rateware Integration Smoke Template");
  if (existing) return existing;
  const created = await rateware("create_outreach_template", {
    template: {
      name: "Rateware Integration Smoke Template",
      channel: "email",
      subject: "Rateware smoke {{rfx_id}} | {{event_name}}",
      html_body: `
        <div>
          <p>Rateware integration smoke test.</p>
          <p>RFx: <strong>{{rfx_id}}</strong></p>
          <p>Portal: <a href="{{bid_link}}">{{bid_link}}</a></p>
        </div>
      `,
      whatsapp_body: "Rateware smoke {{rfx_id}} {{bid_link}}",
      active: true,
      is_default: false,
      placeholders: ["rfx_id", "event_name", "bid_link"]
    }
  });
  return created.row;
}

async function createSmokeBidRoom() {
  const vendor = await rateware("create_vendor", {
    vendor: {
      vendor_name: `Smoke Carrier ${runId}`,
      legal_name: `Smoke Carrier ${runId} LLC`,
      domain: `smoke-${runId}.rateware.test`,
      contact_name: "Rateware Smoke",
      primary_email: recipient,
      preferred_channel: "email",
      status: "active",
      base_stage: "procurement",
      funnel_stage: "targeted",
      tags: ["smoke", "integration"],
      coverage_notes: "Synthetic smoke test carrier. Safe to archive.",
      notes: `Created by tools/integration-smoke.mjs run ${runId}.`
    }
  });
  requireValue(vendor.row?.id, "Smoke vendor was not created.");

  const event = await rateware("create_rfx_event", {
    event: {
      rfx_id: `SMOKE-${runId}`,
      name: `Integration Smoke ${runId}`,
      customer: "Rateware QA",
      event_type: "rfx",
      status: "open",
      bid_visibility_mode: "open_leaderboard",
      due_date: tomorrowPlus(7),
      notes: `Production integration smoke. Gmail send: ${sendGmail ? "yes" : "no"}.`
    }
  });
  requireValue(event.row?.id, "Smoke RFx event was not created.");

  const lanes = await rateware("import_rfx_lanes", {
    event_id: event.row.id,
    rows: [{
      lane_number: 1,
      origin: "Monterrey, NL",
      origin_city: "Monterrey",
      origin_state: "NL",
      origin_country: "MX",
      origin_market: "Monterrey Market",
      origin_region: "Northeast Mexico",
      destination: "Laredo, TX",
      destination_city: "Laredo",
      destination_state: "TX",
      destination_country: "US",
      destination_market: "Laredo, TX",
      destination_region: "Texas",
      equipment: "Truck Trailer",
      trailer: "Dry Van",
      config: "Single",
      operation: "D2D Export",
      service: "One Way",
      weekly_volume: 2,
      target_rate: 2900,
      currency: "USD",
      notes: `Smoke lane ${runId}`
    }]
  });
  const lane = lanes.rows?.[0];
  requireValue(lane?.id, "Smoke lane was not imported.");

  const shortlist = await rateware("shortlist_rfx_lane_vendors", {
    lane_id: lane.id,
    vendor_ids: [vendor.row.id]
  });
  const invitation = shortlist.rows?.[0];
  requireValue(invitation?.id, "Smoke participant was not created.");
  requireValue(invitation?.invitation_token, "Smoke participant token was not created.");

  report.artifacts.vendor_id = vendor.row.id;
  report.artifacts.rfx_event_id = event.row.id;
  report.artifacts.rfx_id = event.row.rfx_id;
  report.artifacts.rfx_lane_id = lane.id;
  report.artifacts.rfx_lane_vendor_id = invitation.id;
  report.artifacts.portal_url = `${appOrigin}/rfx-bid.html?token=${invitation.invitation_token}`;

  return { vendor: vendor.row, event: event.row, lane, invitation };
}

async function generateInvitationDraft(event, invitation) {
  const template = await ensureTemplate();
  const campaign = await rateware("create_outreach_campaign", {
    campaign: {
      rfx_event_id: event.id,
      template_id: template.id,
      name: `Smoke invite ${runId}`,
      channel: "email",
      sender_email: senderEmail,
      sender_label: senderEmail,
      sender_connection_status: sendGmail ? "oauth_connected" : "draft_only",
      status: "draft",
      notes: "Generated by production integration smoke test."
    }
  });
  requireValue(campaign.row?.id, "Smoke outreach campaign was not created.");

  const drafts = await rateware("generate_outreach_drafts", {
    campaign_id: campaign.row.id,
    template_id: template.id,
    invitation_ids: [invitation.id],
    app_origin: appOrigin,
    sender_email: senderEmail,
    sender_label: senderEmail,
    sender_connection_status: sendGmail ? "oauth_connected" : "draft_only"
  });
  const emailDrafts = (drafts.rows || []).filter((row) => row.channel === "email");
  if (!emailDrafts.length) throw new Error("No email draft was generated.");

  report.artifacts.template_id = template.id;
  report.artifacts.campaign_id = campaign.row.id;
  report.artifacts.outreach_message_ids = emailDrafts.map((row) => row.id);
  return emailDrafts;
}

async function runGmailSendIfEnabled(drafts) {
  const result = await rateware("send_outreach_messages", {
    ids: drafts.map((row) => row.id),
    sender_email: senderEmail,
    confirmed: true
  });
  if (!Number(result.sent)) throw new Error(`No Gmail messages were sent. Failures: ${JSON.stringify(result.failures || [])}`);
  return { sent: result.sent, failed: result.failed };
}

async function runCarrierPortal(invitation) {
  const portal = await carrier("get_invitation", invitation.invitation_token);
  if (portal.invitation?.id !== invitation.id) throw new Error("Carrier portal returned a different invitation.");
  if (!portal.live_board) throw new Error("Carrier live board did not load.");

  const bid = await carrier("submit_bid", invitation.invitation_token, {
    bid_rate: "2765",
    currency: "USD",
    weekly_capacity: "2",
    transit_days: "2",
    commercial_model: "direct_cost_plus",
    marksman_margin_pct: "3",
    carrier_share_pct: "",
    best_alternative_offered: true,
    alternative_equipment: "Two 3.5 ton units",
    alternative_units: "2",
    alternative_notes: "Smoke alternative offer.",
    equipment_available: true,
    unit_details: "Smoke unit / smoke trailer / smoke driver",
    eta_pickup: eta(24),
    eta_delivery: eta(60),
    mirror_account_enabled: true,
    availability_validation_status: "mirror_requested",
    availability_validation_notes: "Smoke mirror validation requested.",
    best_final: true,
    notes: "Smoke bid submitted through carrier portal."
  });
  if (bid.row?.invitation_status !== "quoted") throw new Error(`Expected quoted status, got ${bid.row?.invitation_status}`);

  const carrierChat = await carrier("post_bid_room_chat_message", invitation.invitation_token, {
    thread_type: "carrier_private",
    body: `Smoke carrier chat ${runId}.`
  });
  requireValue(carrierChat.message?.id, "Carrier chat message was not created.");

  return {
    bid_rate: bid.row.bid_rate,
    invitation_status: bid.row.invitation_status,
    carrier_chat_sync_status: carrierChat.message?.google_chat_sync_status || null
  };
}

async function runChatAndCloseout(context) {
  const procurementChat = await rateware("post_bid_room_chat_message", {
    rfx_event_id: context.event.id,
    thread_type: "carrier_private",
    vendor_id: context.vendor.id,
    body: `Smoke procurement chat ${runId}.`
  });
  requireValue(procurementChat.message?.id, "Procurement chat message was not created.");
  const procurementSync = cleanText(procurementChat.message.google_chat_sync_status);
  if (procurementSync !== "synced") {
    throw new Error(`Google Chat outbound did not sync. Status: ${procurementSync || "unknown"}.`);
  }

  const eventSync = await rateware("sync_bid_room_event_thread", {
    rfx_event_id: context.event.id,
    force: true
  });
  const eventSyncStatus = cleanText(eventSync.message?.google_chat_sync_status || eventSync.thread?.google_chat_sync_status);
  if (eventSyncStatus !== "synced") {
    throw new Error(`Google Chat event thread did not sync. Status: ${eventSyncStatus || "unknown"}.`);
  }

  const chatList = await rateware("list_bid_room_chat", { rfx_event_id: context.event.id });
  const inboundStatus = cleanText(chatList.google_chat_inbound?.status);
  if (!["synced", "skipped"].includes(inboundStatus)) {
    throw new Error(`Google Chat inbound sync failed. Status: ${inboundStatus || "unknown"} ${cleanText(chatList.google_chat_inbound?.error || chatList.google_chat_inbound?.reason)}`);
  }

  const detail = await rateware("list_rfx_detail", { event_id: context.event.id });
  const currentLane = (detail.lanes || []).find((row) => row.id === context.lane.id);
  const currentInvitation = (currentLane?.invitations || []).find((row) => row.id === context.invitation.id);
  if (currentInvitation?.invitation_status !== "quoted") {
    throw new Error(`RFx detail did not show quoted participant. Got ${currentInvitation?.invitation_status}`);
  }

  const award = await rateware("award_rfx_lane_vendor", {
    id: currentInvitation.id,
    award_role: "primary",
    award_reason: "Integration smoke primary award.",
    award_notes: `Smoke run ${runId}.`
  });
  if (award.row?.award_role !== "primary") throw new Error("Primary award was not saved.");

  const closeout = await rateware("closeout_awarded_rfx_to_rateware", {
    event_id: context.event.id,
    target_status: closeoutStatus
  });
  if (!Number(closeout.inserted)) throw new Error(`Closeout did not create Rateware rows. Skipped: ${closeout.skipped}`);

  report.artifacts.rate_staging_ids = (closeout.rows || []).map((row) => row.id);
  report.artifacts.raw_upload_id = closeout.raw_upload_id;
  return {
    google_chat_outbound_status: procurementSync,
    google_chat_event_status: eventSyncStatus,
    google_chat_inbound_status: inboundStatus,
    google_chat_inbound_imported: chatList.google_chat_inbound?.imported || 0,
    closeout_inserted: closeout.inserted,
    closeout_status: closeout.target_status
  };
}

await check("Vercel deploy", checkVercelDeploy);
await check("Google Chat inbound endpoint", checkGoogleChatInboundEndpoint);

if (!kindeToken) {
  record("Kinde login", "fail", {
    error: "Missing RATEWARE_E2E_KINDE_TOKEN. Sign in to Rateware and provide a current Kinde token to run authenticated production checks."
  });
  skip("Supabase API", "Requires Kinde token.");
  skip("Gmail connection", "Requires Kinde token.");
  skip("Google Chat OAuth connection", "Requires Kinde token.");
  skip("Bid Room workflow", "Requires Kinde token.");
  console.log("\nSmoke result");
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

const claims = parseJwt(kindeToken);
const expiresAt = Number(claims.exp || 0) * 1000;
if (!expiresAt || expiresAt <= Date.now()) {
  record("Kinde login", "fail", {
    error: "Kinde token is missing exp or has expired."
  });
  console.log("\nSmoke result");
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

record("Kinde login", "pass", {
  email: cleanText(claims.email || claims.preferred_email || claims["https://kinde.com/email"]),
  issuer: cleanText(claims.iss),
  expires_at: new Date(expiresAt).toISOString()
});

await check("Supabase API", async () => {
  const settings = await rateware("get_saas_settings");
  const summary = await rateware("dashboard_summary");
  if (!settings.access || !summary.metrics) throw new Error("Rateware API did not return settings and dashboard summary.");
  return {
    access_mode: settings.access.mode || "unknown",
    raw_uploads: summary.metrics.raw_uploads,
    rateware_rows: summary.metrics.approved_rows
  };
}, { stopOnFail: true });

await check("Gmail connection", async () => {
  const data = await rateware("list_gmail_connections");
  const row = data.rows?.[0] || {};
  if (!row.configured) throw new Error("Gmail OAuth secrets are not configured.");
  if (!row.connected) throw new Error(`Gmail is not connected. Status: ${row.status || "unknown"}.`);
  return {
    allowed_sender: data.allowed_sender,
    status: row.status,
    token_expires_at: row.token_expires_at
  };
});

await check("Google Chat OAuth connection", async () => {
  const data = await rateware("list_google_chat_connections");
  const row = data.rows?.[0] || {};
  if (!row.configured) throw new Error("Google Chat OAuth secrets are not configured.");
  if (!row.connected) throw new Error(`Google Chat is not connected. Status: ${row.status || "unknown"}.`);
  if (!row.default_space_name) throw new Error("Google Chat is connected but no default Bid Room Space is saved.");
  if (!row.outbound_enabled) throw new Error("Google Chat outbound is not enabled.");
  if (!row.inbound_enabled) throw new Error("Google Chat inbound scopes are missing. Reconnect Google Chat with message read scopes.");
  return {
    account: data.allowed_account,
    space: row.default_space_display_name || row.default_space_name,
    inbound_enabled: row.inbound_enabled,
    outbound_enabled: row.outbound_enabled,
    token_expires_at: row.token_expires_at
  };
});

let context = null;
await check("Bid Room setup", async () => {
  context = await createSmokeBidRoom();
  return {
    rfx_id: context.event.rfx_id,
    vendor: context.vendor.vendor_name,
    portal_url: report.artifacts.portal_url
  };
}, { stopOnFail: true });

let drafts = [];
await check("Invitation draft", async () => {
  drafts = await generateInvitationDraft(context.event, context.invitation);
  return { drafts: drafts.length, message_ids: drafts.map((row) => row.id) };
}, { stopOnFail: true });

if (!sendGmail) {
  skip("Gmail send", "Skipped by default. Rerun with --send-gmail to send one real test email.");
  await rateware("invite_rfx_lane_vendors", { ids: [context.invitation.id], confirmed: true });
} else {
  await check("Gmail send", async () => runGmailSendIfEnabled(drafts), { stopOnFail: true });
}

await check("Carrier portal", async () => runCarrierPortal(context), { stopOnFail: true });
await check("Google Chat outbound/inbound and Rateware closeout", async () => runChatAndCloseout(context), { stopOnFail: true });

const failures = report.checks.filter((item) => item.status === "fail");
console.log("\nSmoke result");
console.log(JSON.stringify(report, null, 2));
process.exit(failures.length ? 1 : 0);
