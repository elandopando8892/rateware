#!/usr/bin/env node

import { SUPABASE_URL } from "../src/config.js";

const args = process.argv.slice(2);
const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const defaultRecipient = "sales@heymarksman.com";

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
Bid Room production E2E runner

Required:
  RATEWARE_E2E_KINDE_TOKEN=<token> node tools/bid-room-e2e.mjs

Optional:
  --recipient sales@heymarksman.com
  --send-gmail                 Sends the generated email draft through Gmail.
  --allow-external-email        Allows --send-gmail to non heymarksman.com / xbfreight.com recipients.
  --approved-closeout           Creates approved Rateware rows instead of pending_review rows.
  --visibility open_leaderboard Private Bid Room visibility mode.
  --app-origin https://rateware.vercel.app

Safe defaults:
  - Creates a dummy RFx event, dummy CRM carrier, lane, invitation, bid, chat, award and closeout.
  - Does not send Gmail unless --send-gmail is passed.
  - Closes out awards as pending_review unless --approved-closeout is passed.
`);
}

if (hasFlag("--help")) {
  printHelp();
  process.exit(0);
}

const kindeToken = (argValue("--kinde-token", process.env.RATEWARE_E2E_KINDE_TOKEN || process.env.KINDE_TOKEN || "") || "").trim();
const recipient = argValue("--recipient", process.env.RATEWARE_E2E_RECIPIENT || defaultRecipient).trim().toLowerCase();
const sendGmail = hasFlag("--send-gmail");
const allowExternalEmail = hasFlag("--allow-external-email");
const closeoutStatus = hasFlag("--approved-closeout") ? "approved" : "pending_review";
const appOrigin = argValue("--app-origin", process.env.RATEWARE_E2E_APP_ORIGIN || "https://rateware.vercel.app").replace(/\/$/, "");
const visibility = argValue("--visibility", "open_leaderboard");
const senderEmail = "sales@heymarksman.com";
const safeRecipientPattern = /@(heymarksman\.com|xbfreight\.com)$/i;

if (!kindeToken) {
  console.error("Missing RATEWARE_E2E_KINDE_TOKEN. Sign in to Rateware, provide a current Kinde token, then rerun this script.");
  printHelp();
  process.exit(1);
}

if (sendGmail && !allowExternalEmail && !safeRecipientPattern.test(recipient)) {
  console.error(`Refusing to send real Gmail to external recipient "${recipient}". Use --allow-external-email only when intentionally testing external delivery.`);
  process.exit(1);
}

const report = {
  run_id: runId,
  mode: {
    send_gmail: sendGmail,
    closeout_status: closeoutStatus,
    recipient,
    app_origin: appOrigin,
    visibility
  },
  checkpoints: [],
  artifacts: {}
};

function logCheckpoint(name, details = {}) {
  const item = {
    name,
    ok: true,
    at: new Date().toISOString(),
    ...details
  };
  report.checkpoints.push(item);
  console.log(`[ok] ${name}`);
  return item;
}

function requireValue(value, message) {
  if (value === null || value === undefined || value === "") throw new Error(message);
  return value;
}

async function parseResponse(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) {
    const message = data.error || data.message || text || `HTTP ${response.status}`;
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

async function step(name, run) {
  try {
    return await run();
  } catch (error) {
    report.checkpoints.push({
      name,
      ok: false,
      at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

function tomorrowPlus(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function eta(hours) {
  const date = new Date(Date.now() + hours * 3600000);
  return date.toISOString();
}

async function ensureTemplate() {
  const templates = await rateware("list_outreach_templates");
  const existing = (templates.rows || []).find((template) => template.active && ["email", "multi"].includes(String(template.channel || "").toLowerCase()));
  if (existing) return existing;
  const created = await rateware("create_outreach_template", {
    template: {
      name: `E2E Bid Room Template ${runId}`,
      channel: "email",
      subject: "E2E {{rfx_id}} | {{event_name}} | {{lane_count}} lane(s)",
      html_body: `
        <div>
          <p>Estimados {{vendor_name}},</p>
          <p>Esta es una prueba E2E controlada de Rateware Bid Room.</p>
          <p>RFx: <strong>{{rfx_id}}</strong> | {{event_name}}</p>
          <p>Portal: <a href="{{bid_link}}">{{bid_link}}</a></p>
        </div>
      `,
      whatsapp_body: "E2E {{rfx_id}} {{bid_link}}",
      active: true,
      is_default: false,
      placeholders: ["vendor_name", "rfx_id", "event_name", "lane_count", "bid_link"]
    }
  });
  return created.row;
}

try {
  const vendor = await step("create CRM carrier", async () => {
    const data = await rateware("create_vendor", {
      vendor: {
        vendor_name: `E2E Carrier ${runId}`,
        legal_name: `E2E Carrier ${runId} LLC`,
        domain: `e2e-${runId}.rateware.test`,
        contact_name: "Rateware QA",
        primary_email: recipient,
        preferred_channel: "email",
        status: "active",
        base_stage: "procurement",
        funnel_stage: "targeted",
        tags: ["e2e", "bid-room", "qa"],
        coverage_notes: "Synthetic production E2E carrier. Safe to archive after QA.",
        notes: `Created by tools/bid-room-e2e.mjs run ${runId}.`
      }
    });
    requireValue(data.row?.id, "Vendor was not created.");
    report.artifacts.vendor_id = data.row.id;
    logCheckpoint("CRM carrier created", { vendor_id: data.row.id, vendor_name: data.row.vendor_name });
    return data.row;
  });

  const event = await step("create RFx event", async () => {
    const data = await rateware("create_rfx_event", {
      event: {
        rfx_id: `E2E-${runId}`,
        name: `E2E Bid Room ${runId}`,
        customer: "Rateware QA",
        event_type: "rfx",
        status: "open",
        bid_visibility_mode: visibility,
        due_date: tomorrowPlus(7),
        notes: `Production E2E smoke test. Recipient: ${recipient}. Gmail send: ${sendGmail ? "yes" : "no"}.`
      }
    });
    requireValue(data.row?.id, "RFx event was not created.");
    report.artifacts.rfx_event_id = data.row.id;
    report.artifacts.rfx_id = data.row.rfx_id;
    logCheckpoint("RFx event created", { rfx_event_id: data.row.id, rfx_id: data.row.rfx_id });
    return data.row;
  });

  const lane = await step("load lane book", async () => {
    const data = await rateware("import_rfx_lanes", {
      event_id: event.id,
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
        weekly_volume: 3,
        target_rate: 2950,
        currency: "USD",
        notes: `E2E lane ${runId}`
      }]
    });
    const row = data.rows?.[0];
    requireValue(row?.id, "RFx lane was not imported.");
    report.artifacts.rfx_lane_id = row.id;
    logCheckpoint("Lane book loaded", { inserted: data.inserted, rfx_lane_id: row.id });
    return row;
  });

  const invitation = await step("select carrier participant", async () => {
    const data = await rateware("shortlist_rfx_lane_vendors", {
      lane_id: lane.id,
      vendor_ids: [vendor.id]
    });
    const row = data.rows?.[0];
    requireValue(row?.id, "Shortlisted invitation was not created.");
    requireValue(row?.invitation_token, "Invitation token was not generated.");
    report.artifacts.rfx_lane_vendor_id = row.id;
    report.artifacts.invitation_token = row.invitation_token;
    report.artifacts.portal_url = `${appOrigin}/rfx-bid.html?token=${row.invitation_token}`;
    logCheckpoint("Carrier selected for bid", { rfx_lane_vendor_id: row.id });
    return row;
  });

  const template = await step("load outreach template", async () => {
    const row = await ensureTemplate();
    requireValue(row?.id, "Outreach template is missing.");
    report.artifacts.template_id = row.id;
    logCheckpoint("Outreach template ready", { template_id: row.id, template_name: row.name });
    return row;
  });

  const campaign = await step("create outreach campaign", async () => {
    const data = await rateware("create_outreach_campaign", {
      campaign: {
        rfx_event_id: event.id,
        template_id: template.id,
        name: `E2E Bid Room Invite ${runId}`,
        channel: "email",
        sender_email: senderEmail,
        sender_label: senderEmail,
        sender_connection_status: "draft_only",
        status: "draft",
        notes: "Generated by production E2E runner."
      }
    });
    requireValue(data.row?.id, "Outreach campaign was not created.");
    report.artifacts.campaign_id = data.row.id;
    logCheckpoint("Outreach campaign created", { campaign_id: data.row.id });
    return data.row;
  });

  const drafts = await step("generate invitation drafts", async () => {
    const data = await rateware("generate_outreach_drafts", {
      campaign_id: campaign.id,
      template_id: template.id,
      invitation_ids: [invitation.id],
      app_origin: appOrigin,
      sender_email: senderEmail,
      sender_label: senderEmail,
      sender_connection_status: sendGmail ? "oauth_connected" : "draft_only"
    });
    if (!Number(data.generated)) throw new Error(`No outreach drafts generated. Skipped: ${JSON.stringify(data.skipped || [])}`);
    const emailDrafts = (data.rows || []).filter((row) => row.channel === "email");
    if (!emailDrafts.length) throw new Error("No email draft generated.");
    report.artifacts.outreach_message_ids = emailDrafts.map((row) => row.id);
    logCheckpoint("Invitation draft generated", { generated: data.generated, email_drafts: emailDrafts.length });
    return emailDrafts;
  });

  if (sendGmail) {
    await step("send Gmail invitation", async () => {
      const data = await rateware("send_outreach_messages", {
        ids: drafts.map((row) => row.id),
        sender_email: senderEmail,
        confirmed: true
      });
      if (!Number(data.sent)) throw new Error(`Gmail did not send. Failures: ${JSON.stringify(data.failures || [])}`);
      logCheckpoint("Gmail invitation sent", { sent: data.sent, failed: data.failed });
      return data;
    });
  } else {
    await step("mark invitation launched without Gmail send", async () => {
      const data = await rateware("invite_rfx_lane_vendors", { ids: [invitation.id], confirmed: true });
      if (!Number(data.updated)) throw new Error("Invitation was not marked invited.");
      logCheckpoint("Invitation marked invited", { updated: data.updated, send_gmail: false });
      return data;
    });
  }

  await step("carrier opens portal", async () => {
    const data = await carrier("get_invitation", invitation.invitation_token);
    if (data.invitation?.id !== invitation.id) throw new Error("Carrier portal returned a different invitation.");
    if (!data.live_board) throw new Error("Carrier live board did not load.");
    logCheckpoint("Carrier portal loaded", {
      invitation_status: data.invitation.invitation_status,
      live_bid_count: data.live_board.bid_count || 0
    });
    return data;
  });

  await step("carrier submits bid", async () => {
    const data = await carrier("submit_bid", invitation.invitation_token, {
      bid_rate: "2750",
      currency: "USD",
      weekly_capacity: "3",
      transit_days: "2",
      commercial_model: "direct_cost_plus",
      marksman_margin_pct: "3",
      carrier_share_pct: "",
      best_alternative_offered: true,
      alternative_equipment: "Two 3.5 ton units",
      alternative_units: "2",
      alternative_notes: "Alternative can cover urgent capacity if dry van is unavailable.",
      equipment_available: true,
      unit_details: "Unit E2E-01 / trailer E2E-DV / driver QA",
      eta_pickup: eta(24),
      eta_delivery: eta(60),
      mirror_account_enabled: true,
      availability_validation_status: "mirror_requested",
      availability_validation_notes: "E2E mirror validation requested.",
      best_final: true,
      notes: "E2E primary bid submitted through carrier portal."
    });
    if (data.row?.invitation_status !== "quoted") throw new Error(`Expected quoted status, got ${data.row?.invitation_status}`);
    logCheckpoint("Carrier bid submitted", {
      bid_rate: data.row.bid_rate,
      capacity: data.row.weekly_capacity,
      transit_days: data.row.transit_days
    });
    return data.row;
  });

  const carrierChat = await step("carrier posts chat message", async () => {
    const data = await carrier("post_bid_room_chat_message", invitation.invitation_token, {
      thread_type: "carrier_private",
      body: "E2E carrier confirms capacity, ETA and mirror account validation."
    });
    requireValue(data.message?.id, "Carrier chat message was not created.");
    report.artifacts.carrier_chat_thread_id = data.thread?.id;
    logCheckpoint("Carrier chat posted", {
      thread_id: data.thread?.id,
      google_chat_configured: Boolean(data.google_chat_configured),
      google_chat_sync_status: data.message?.google_chat_sync_status
    });
    return data;
  });

  await step("procurement replies in chat", async () => {
    const data = await rateware("post_bid_room_chat_message", {
      rfx_event_id: event.id,
      thread_type: "carrier_private",
      vendor_id: vendor.id,
      body: "E2E procurement reply: bid received and under award review."
    });
    requireValue(data.message?.id, "Procurement chat reply was not created.");
    logCheckpoint("Procurement chat reply posted", {
      thread_id: data.thread?.id || carrierChat.thread?.id,
      google_chat_configured: Boolean(data.google_chat_configured),
      google_chat_sync_status: data.message?.google_chat_sync_status
    });
    return data;
  });

  await step("sync Google Chat event thread", async () => {
    const data = await rateware("sync_bid_room_event_thread", {
      rfx_event_id: event.id,
      force: true
    });
    logCheckpoint("Google Chat event thread sync attempted", {
      google_chat_configured: Boolean(data.google_chat_configured),
      google_chat_sync_status: data.message?.google_chat_sync_status || data.thread?.google_chat_sync_status || "unknown"
    });
    return data;
  });

  const refreshedDetail = await step("refresh RFx detail after bid", async () => {
    const data = await rateware("list_rfx_detail", { event_id: event.id });
    const currentLane = (data.lanes || []).find((row) => row.id === lane.id);
    const currentInvitation = (currentLane?.invitations || []).find((row) => row.id === invitation.id);
    if (currentInvitation?.invitation_status !== "quoted") {
      throw new Error(`Detail did not show quoted invitation. Got ${currentInvitation?.invitation_status}`);
    }
    logCheckpoint("RFx detail refreshed with bid", { bid_count: currentLane.bid_count, invitation_status: currentInvitation.invitation_status });
    return { detail: data, lane: currentLane, invitation: currentInvitation };
  });

  await step("award primary carrier", async () => {
    const data = await rateware("award_rfx_lane_vendor", {
      id: refreshedDetail.invitation.id,
      award_role: "primary",
      award_reason: "E2E primary award after successful carrier portal bid.",
      award_notes: "Created by production E2E runner."
    });
    if (data.row?.award_role !== "primary") throw new Error(`Expected primary award, got ${data.row?.award_role}`);
    logCheckpoint("Primary award saved", { award_role: data.row.award_role, invitation_status: data.row.invitation_status });
    return data;
  });

  await step("closeout awarded bid to Rateware", async () => {
    const data = await rateware("closeout_awarded_rfx_to_rateware", {
      event_id: event.id,
      target_status: closeoutStatus
    });
    if (!Number(data.inserted)) throw new Error(`No Rateware rows were created. Skipped: ${data.skipped}`);
    report.artifacts.rate_staging_ids = (data.rows || []).map((row) => row.id);
    report.artifacts.raw_upload_id = data.raw_upload_id;
    logCheckpoint("Award closeout created Rateware rows", {
      inserted: data.inserted,
      target_status: data.target_status,
      rate_staging_ids: report.artifacts.rate_staging_ids
    });
    return data;
  });

  console.log("\nE2E result");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failed = true;
  report.error = error instanceof Error ? error.message : String(error);
  console.error("\nE2E failed");
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
