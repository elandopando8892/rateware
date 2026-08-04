#!/usr/bin/env node

import { SUPABASE_URL } from "../src/config.js";
import { bidTemplateSourceRows, eventInvitedLaneRows } from "../src/rfx-bid-lane-scope.js";

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
  --send-closeout-email        Sends the three final outcome notices through Gmail.
  --allow-external-email       Allows real Gmail sends to non heymarksman.com / xbfreight.com recipients.
  --visibility open_leaderboard Private Bid Room visibility mode.
  --app-origin https://rateware.vercel.app

Safe defaults:
  - Creates a dummy RFx event, three CRM carriers, lanes, invitations, bids, chat, award, backup, no-award and closeout.
  - Does not send Gmail unless --send-gmail is passed.
  - Does not send final notices unless --send-closeout-email is passed.
  - Always closes awarded carrier costs to pending_review; production approval remains human-only.
`);
}

if (hasFlag("--help")) {
  printHelp();
  process.exit(0);
}

const kindeToken = (argValue("--kinde-token", process.env.RATEWARE_E2E_KINDE_TOKEN || process.env.KINDE_TOKEN || "") || "").trim();
const recipient = argValue("--recipient", process.env.RATEWARE_E2E_RECIPIENT || defaultRecipient).trim().toLowerCase();
const sendGmail = hasFlag("--send-gmail");
const sendCloseoutEmail = hasFlag("--send-closeout-email");
const allowExternalEmail = hasFlag("--allow-external-email");
const closeoutStatus = "pending_review";
const appOrigin = argValue("--app-origin", process.env.RATEWARE_E2E_APP_ORIGIN || "https://rateware.vercel.app").replace(/\/$/, "");
const visibility = argValue("--visibility", "open_leaderboard");
const senderEmail = "sales@heymarksman.com";
const safeRecipientPattern = /@(heymarksman\.com|xbfreight\.com)$/i;

if (!kindeToken) {
  console.error("Missing RATEWARE_E2E_KINDE_TOKEN. Sign in to Rateware, provide a current Kinde token, then rerun this script.");
  printHelp();
  process.exit(1);
}

if ((sendGmail || sendCloseoutEmail) && !allowExternalEmail && !safeRecipientPattern.test(recipient)) {
  console.error(`Refusing to send real Gmail to external recipient "${recipient}". Use --allow-external-email only when intentionally testing external delivery.`);
  process.exit(1);
}

const report = {
  run_id: runId,
  mode: {
    send_gmail: sendGmail,
    send_closeout_email: sendCloseoutEmail,
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

function invitationStatus(row = {}) {
  return row.award_status || row.business_status || row.participation_status || row.invitation_status || "open";
}

function assertCarrierLaneCoverage(detail = {}, vendorId, expectedLaneIds = [], label = "RFx coverage") {
  const rows = (detail.lanes || []).flatMap((lane) => (lane.invitations || [])
    .filter((row) => String(row.vendor_id || "") === String(vendorId || ""))
    .map((row) => ({ ...row, rfx_lane_id: row.rfx_lane_id || lane.id })));
  const actualIds = [...new Set(rows.map((row) => String(row.rfx_lane_id || "")).filter(Boolean))].sort();
  const expectedIds = [...new Set(expectedLaneIds.map(String))].sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error(`${label} mismatch. Expected ${expectedIds.join(", ")}; got ${actualIds.join(", ") || "none"}.`);
  }
  if (rows.length !== expectedIds.length) throw new Error(`${label} contains duplicate carrier-lane rows.`);
  if (rows.some((row) => !String(row.invitation_token || "").trim())) throw new Error(`${label} contains a lane without invitation token.`);
  return rows;
}

function sortedUniqueIds(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort();
}

function assertSameIds(actual = [], expected = [], label = "IDs") {
  const actualIds = sortedUniqueIds(actual);
  const expectedIds = sortedUniqueIds(expected);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error(`${label} mismatch. Expected ${expectedIds.join(", ") || "none"}; got ${actualIds.join(", ") || "none"}.`);
  }
  return actualIds;
}

function assertOutcomeCounts(result = {}, label = "RFx outcomes") {
  const counts = result.outcomes?.counts || result.counts || {};
  const actual = {
    awarded: Number(counts.awarded || 0),
    backup: Number(counts.backup || 0),
    not_awarded: Number(counts.not_awarded || 0)
  };
  const expected = { awarded: 1, backup: 1, not_awarded: 1 };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch. Expected ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}.`);
  }
  return actual;
}

function noticeOutcome(row = {}) {
  const summary = row.metadata?.award_summary || {};
  if (Number(summary.awarded || 0)) return "awarded";
  if (Number(summary.backup || 0)) return "backup";
  return "not_awarded";
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
  const carrierSpecs = [{
    key: "primary",
    label: "Primary",
    bid_rate: "2750",
    weekly_capacity: "3",
    transit_days: "2",
    commercial_model: "direct_cost_plus",
    marksman_margin_pct: "3",
    carrier_share_pct: ""
  }, {
    key: "backup",
    label: "Backup",
    bid_rate: "2850",
    weekly_capacity: "2",
    transit_days: "2",
    commercial_model: "carrier_share",
    marksman_margin_pct: "",
    carrier_share_pct: "3"
  }, {
    key: "not_awarded",
    label: "No Award",
    bid_rate: "3100",
    weekly_capacity: "1",
    transit_days: "3",
    commercial_model: "xbf_buy_sell",
    marksman_margin_pct: "7.5",
    carrier_share_pct: ""
  }];

  const vendors = [];
  for (const spec of carrierSpecs) {
    const vendor = await step(`create ${spec.key} CRM carrier`, async () => {
      const data = await rateware("create_vendor", {
        vendor: {
          vendor_name: `E2E ${spec.label} Carrier ${runId}`,
          legal_name: `E2E ${spec.label} Carrier ${runId} LLC`,
          domain: `e2e-${spec.key}-${runId}.rateware.test`,
          contact_name: "Rateware QA",
          primary_email: recipient,
          preferred_channel: "email",
          status: "active",
          base_stage: "procurement",
          funnel_stage: "targeted",
          tags: ["e2e", "bid-room", "qa", spec.key],
          coverage_notes: "Synthetic production E2E carrier. Safe to archive after QA.",
          notes: `Created by tools/bid-room-e2e.mjs run ${runId}. Expected closeout: ${spec.key}.`
        }
      });
      requireValue(data.row?.id, `${spec.label} vendor was not created.`);
      logCheckpoint(`${spec.label} CRM carrier created`, { vendor_id: data.row.id, vendor_name: data.row.vendor_name });
      return { ...data.row, spec };
    });
    vendors.push(vendor);
  }
  report.artifacts.vendor_ids = Object.fromEntries(vendors.map((vendor) => [vendor.spec.key, vendor.id]));

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

  const initialLanes = await step("load initial multi-lane book", async () => {
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
        notes: `E2E initial lane 1 ${runId}`
      }, {
        lane_number: 2,
        origin: "Saltillo, CU",
        origin_city: "Saltillo",
        origin_state: "CU",
        origin_country: "MX",
        origin_market: "Saltillo Market",
        origin_region: "Northeast Mexico",
        destination: "Memphis, TN",
        destination_city: "Memphis",
        destination_state: "TN",
        destination_country: "US",
        destination_market: "Memphis Market",
        destination_region: "Southeast",
        equipment: "Truck Trailer",
        trailer: "Dry Van",
        config: "Single",
        operation: "D2D Export",
        service: "One Way",
        weekly_volume: 2,
        target_rate: 4100,
        currency: "USD",
        notes: `E2E initial lane 2 ${runId}`
      }]
    });
    const rows = data.rows || [];
    if (rows.length !== 2 || rows.some((row) => !row.id)) throw new Error(`Expected two initial RFx lanes, got ${rows.length}.`);
    report.artifacts.initial_rfx_lane_ids = rows.map((row) => row.id);
    logCheckpoint("Initial multi-lane book loaded", { inserted: data.inserted, rfx_lane_ids: report.artifacts.initial_rfx_lane_ids });
    return rows;
  });

  const lane = initialLanes[0];
  report.artifacts.rfx_lane_id = lane.id;

  const initialInvitations = await step("select three carrier participants", async () => {
    const data = await rateware("shortlist_rfx_lane_vendors", {
      lane_id: lane.id,
      vendor_ids: vendors.map((vendor) => vendor.id)
    });
    const rows = data.rows || [];
    if (rows.length !== vendors.length) throw new Error(`Expected ${vendors.length} shortlisted carriers, got ${rows.length}.`);
    if (rows.some((row) => !row.id || !row.invitation_token)) throw new Error("A shortlisted carrier is missing its invitation id or token.");
    logCheckpoint("Three carriers selected for bid", { invitation_ids: rows.map((row) => row.id) });
    return rows;
  });

  await step("verify initial carrier coverage", async () => {
    const detail = await rateware("list_rfx_detail", { event_id: event.id });
    const laneIds = initialLanes.map((row) => row.id);
    const coverage = vendors.map((vendor) => assertCarrierLaneCoverage(
      detail,
      vendor.id,
      laneIds,
      `Initial ${vendor.spec.key} carrier coverage`
    ));
    logCheckpoint("Initial carrier coverage verified", { carriers: coverage.length, lanes_per_carrier: laneIds.length });
    return coverage;
  });

  const appendedLane = await step("append lane after carrier selection", async () => {
    const data = await rateware("import_rfx_lanes", {
      event_id: event.id,
      rows: [{
        lane_number: 3,
        origin: "Queretaro, QE 76130",
        origin_city: "Queretaro",
        origin_state: "QE",
        origin_postal: "76130",
        origin_country: "MX",
        origin_market: "Queretaro Market",
        origin_region: "Central Mexico",
        destination: "Pharr, TX 78577",
        destination_city: "Pharr",
        destination_state: "TX",
        destination_postal: "78577",
        destination_country: "US",
        destination_market: "Pharr Market (TX)",
        destination_region: "Texas",
        equipment: "Truck Trailer",
        trailer: "Reefer",
        config: "Single",
        operation: "MX Northbound",
        service: "One Way",
        weekly_volume: 4,
        target_rate: 2900,
        currency: "USD",
        notes: `E2E appended lane ${runId}`
      }]
    });
    const row = data.rows?.[0];
    requireValue(row?.id, "Appended RFx lane was not imported.");
    report.artifacts.appended_rfx_lane_id = row.id;
    logCheckpoint("Post-selection lane appended", { rfx_lane_id: row.id });
    return row;
  });

  const targetInvitations = await step("verify appended lane carrier coverage", async () => {
    const detail = await rateware("list_rfx_detail", { event_id: event.id });
    const expectedLaneIds = [...initialLanes.map((row) => row.id), appendedLane.id];
    const targetRows = [];
    for (const vendor of vendors) {
      const rows = assertCarrierLaneCoverage(detail, vendor.id, expectedLaneIds, `Expanded ${vendor.spec.key} carrier coverage`);
      const target = rows.find((row) => String(row.rfx_lane_id) === String(lane.id));
      if (!target) throw new Error(`Target lane invitation is missing for ${vendor.spec.key} carrier.`);
      targetRows.push({ ...target, vendor, spec: vendor.spec });
    }
    report.artifacts.covered_rfx_lane_ids = expectedLaneIds;
    report.artifacts.target_invitation_ids = Object.fromEntries(targetRows.map((row) => [row.spec.key, row.id]));
    logCheckpoint("Appended lane carrier coverage verified", { carriers: targetRows.length, lanes_per_carrier: expectedLaneIds.length });
    return targetRows;
  });

  const primaryInvitation = targetInvitations.find((row) => row.spec.key === "primary");
  const backupInvitation = targetInvitations.find((row) => row.spec.key === "backup");
  const noAwardInvitation = targetInvitations.find((row) => row.spec.key === "not_awarded");
  requireValue(primaryInvitation?.id, "Primary invitation was not resolved after lane expansion.");
  requireValue(backupInvitation?.id, "Backup invitation was not resolved after lane expansion.");
  requireValue(noAwardInvitation?.id, "No-award invitation was not resolved after lane expansion.");
  report.artifacts.invitation_token = primaryInvitation.invitation_token;
  report.artifacts.portal_url = `${appOrigin}/rfx-bid.html?token=${primaryInvitation.invitation_token}`;

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
      invitation_ids: targetInvitations.map((row) => row.id),
      app_origin: appOrigin,
      sender_email: senderEmail,
      sender_label: senderEmail,
      sender_connection_status: sendGmail ? "oauth_connected" : "draft_only"
    });
    if (Number(data.generated) !== targetInvitations.length) {
      throw new Error(`Expected ${targetInvitations.length} outreach drafts, got ${Number(data.generated || 0)}. Skipped: ${JSON.stringify(data.skipped || [])}`);
    }
    const emailDrafts = (data.rows || []).filter((row) => row.channel === "email");
    if (emailDrafts.length !== targetInvitations.length) {
      throw new Error(`Expected ${targetInvitations.length} email drafts, got ${emailDrafts.length}.`);
    }
    if (sortedUniqueIds(emailDrafts.map((row) => row.id)).length !== targetInvitations.length) {
      throw new Error("Invitation draft generation returned duplicate message ids.");
    }
    report.artifacts.outreach_message_ids = emailDrafts.map((row) => row.id);
    logCheckpoint("Invitation drafts generated", { generated: data.generated, email_drafts: emailDrafts.length });
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
    await step("mark invitations launched without Gmail send", async () => {
      const data = await rateware("invite_rfx_lane_vendors", {
        ids: targetInvitations.map((row) => row.id),
        confirmed: true
      });
      if (Number(data.updated) !== targetInvitations.length) {
        throw new Error(`Expected ${targetInvitations.length} invitations marked invited, got ${Number(data.updated || 0)}.`);
      }
      logCheckpoint("Invitations marked invited", { updated: data.updated, send_gmail: false });
      return data;
    });
  }

  await step("carrier opens complete multi-lane portal", async () => {
    const data = await carrier("get_invitation", primaryInvitation.invitation_token);
    if (data.invitation?.id !== primaryInvitation.id) throw new Error("Carrier portal returned a different invitation.");
    if (!data.live_board) throw new Error("Carrier live board did not load.");
    const invitedRows = eventInvitedLaneRows(data.carrier_book || {}, data.invitation || {});
    const expectedLaneIds = [...initialLanes.map((row) => row.id), appendedLane.id].map(String).sort();
    const portalLaneIds = [...new Set(invitedRows.map((row) => String(row.rfx_lane_id || row.lane?.id || "")))].sort();
    if (JSON.stringify(portalLaneIds) !== JSON.stringify(expectedLaneIds)) {
      throw new Error(`Carrier portal lane scope mismatch. Expected ${expectedLaneIds.join(", ")}; got ${portalLaneIds.join(", ") || "none"}.`);
    }
    if (invitedRows.length !== expectedLaneIds.length) throw new Error("Carrier portal contains duplicate event lanes.");
    const xlsxRows = bidTemplateSourceRows(data.carrier_book || {}, data.invitation || {}, invitationStatus);
    const xlsxLaneIds = xlsxRows.map((row) => String(row.rfx_lane_id || row.lane?.id || "")).sort();
    if (JSON.stringify(xlsxLaneIds) !== JSON.stringify(expectedLaneIds)) {
      throw new Error(`Bid Tools/XLSX lane scope mismatch. Expected ${expectedLaneIds.join(", ")}; got ${xlsxLaneIds.join(", ") || "none"}.`);
    }
    report.artifacts.portal_lane_ids = portalLaneIds;
    report.artifacts.bid_tools_xlsx_lane_ids = xlsxLaneIds;
    logCheckpoint("Complete multi-lane portal loaded", {
      invitation_status: data.invitation.invitation_status,
      live_bid_count: data.live_board.bid_count || 0,
      portal_lane_count: portalLaneIds.length,
      bid_tools_xlsx_lane_count: xlsxLaneIds.length
    });
    return data;
  });

  const stagingIdsByOutcome = await step("three carriers submit competing bids", async () => {
    const stagingIds = {};
    for (const invitation of targetInvitations) {
      const spec = invitation.spec;
      const data = await carrier("submit_bid", invitation.invitation_token, {
        bid_rate: spec.bid_rate,
        currency: "USD",
        weekly_capacity: spec.weekly_capacity,
        transit_days: spec.transit_days,
        valid_through: tomorrowPlus(14),
        commercial_model: spec.commercial_model,
        marksman_margin_pct: spec.marksman_margin_pct,
        carrier_share_pct: spec.carrier_share_pct,
        best_alternative_offered: spec.key === "primary",
        alternative_equipment: spec.key === "primary" ? "Two 3.5 ton units" : "",
        alternative_units: spec.key === "primary" ? "2" : "",
        alternative_notes: spec.key === "primary" ? "Alternative can cover urgent capacity if dry van is unavailable." : "",
        equipment_available: true,
        current_unit_location: "Laredo, TX",
        deadhead_distance: spec.key === "primary" ? "80" : "120",
        deadhead_unit: "mi",
        unit_details: `Unit E2E-${spec.key} / trailer E2E-DV / driver QA`,
        eta_pickup: eta(24),
        eta_delivery: eta(60),
        mirror_account_enabled: spec.key === "primary",
        availability_validation_status: spec.key === "primary" ? "mirror_requested" : "operator_confirmed",
        availability_validation_notes: `E2E ${spec.key} availability validation.`,
        best_final: true,
        notes: `E2E ${spec.key} bid submitted through carrier portal.`
      });
      if (data.row?.invitation_status !== "quoted") {
        throw new Error(`Expected quoted status for ${spec.key}, got ${data.row?.invitation_status}.`);
      }
      const stagingId = data.rateware_capture?.id || data.rateware_capture?.row?.id || data.row?.bid_rate_staging_id;
      requireValue(stagingId, `${spec.label} bid did not create or reuse a Rateware staging row.`);
      stagingIds[spec.key] = stagingId;
    }
    if (sortedUniqueIds(Object.values(stagingIds)).length !== targetInvitations.length) {
      throw new Error("Each carrier bid must retain its own Rateware staging row.");
    }
    report.artifacts.bid_rate_staging_ids = stagingIds;
    logCheckpoint("Three competing bids captured in Review Queue", { staging_ids: stagingIds });
    return stagingIds;
  });

  const carrierChat = await step("carrier posts chat message", async () => {
    const data = await carrier("post_bid_room_chat_message", primaryInvitation.invitation_token, {
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
      vendor_id: primaryInvitation.vendor.id,
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

  await step("refresh RFx detail after bids", async () => {
    const data = await rateware("list_rfx_detail", { event_id: event.id });
    const currentLane = (data.lanes || []).find((row) => row.id === lane.id);
    const currentInvitations = targetInvitations.map((target) => (currentLane?.invitations || []).find((row) => row.id === target.id));
    if (currentInvitations.some((row) => row?.invitation_status !== "quoted")) {
      throw new Error(`Detail did not show all three quoted invitations: ${currentInvitations.map((row) => row?.invitation_status || "missing").join(", ")}.`);
    }
    if (Number(currentLane?.bid_count || 0) !== targetInvitations.length) {
      throw new Error(`Expected ${targetInvitations.length} bids on the target lane, got ${Number(currentLane?.bid_count || 0)}.`);
    }
    logCheckpoint("RFx detail refreshed with three bids", { bid_count: currentLane.bid_count });
    return data;
  });

  await step("award primary carrier", async () => {
    const data = await rateware("award_rfx_lane_vendor", {
      id: primaryInvitation.id,
      award_role: "primary",
      award_reason: "E2E primary award after successful carrier portal bid.",
      award_notes: "Created by production E2E runner."
    });
    if (data.row?.award_role !== "primary") throw new Error(`Expected primary award, got ${data.row?.award_role}`);
    logCheckpoint("Primary award saved", { award_role: data.row.award_role, invitation_status: data.row.invitation_status });
    return data;
  });

  await step("assign backup carrier", async () => {
    const data = await rateware("award_rfx_lane_vendor", {
      id: backupInvitation.id,
      award_role: "backup",
      award_reason: "E2E backup capacity after successful carrier portal bid.",
      award_notes: "Created by production E2E runner."
    });
    if (data.row?.award_role !== "backup") throw new Error(`Expected backup award, got ${data.row?.award_role}.`);
    logCheckpoint("Backup award saved", { award_role: data.row.award_role, invitation_status: data.row.invitation_status });
    return data;
  });

  const expectedStagingIds = Object.values(stagingIdsByOutcome);
  const firstCloseout = await step("closeout decisions to Review Queue", async () => {
    const data = await rateware("closeout_awarded_rfx_to_rateware", {
      event_id: event.id,
      target_status: closeoutStatus
    });
    if (data.target_status !== "pending_review") throw new Error(`Closeout bypassed Review Queue with status ${data.target_status}.`);
    if (Number(data.outcomes?.missing_staging || 0) !== 0) throw new Error("A finalized bid is missing its historical Rateware staging row.");
    const counts = assertOutcomeCounts(data.outcomes, "First closeout outcomes");
    const stagingIds = assertSameIds(data.existing_rate_staging_ids, expectedStagingIds, "First closeout staging ids");
    report.artifacts.rate_staging_ids = stagingIds;
    report.artifacts.raw_upload_id = data.raw_upload_id;
    logCheckpoint("Award closeout queued for human review", {
      inserted: data.inserted,
      linked: data.linked,
      target_status: data.target_status,
      outcomes: counts,
      rate_staging_ids: stagingIds
    });
    return data;
  });

  await step("retry closeout without duplicate staging rows", async () => {
    const data = await rateware("closeout_awarded_rfx_to_rateware", {
      event_id: event.id,
      target_status: closeoutStatus
    });
    if (data.target_status !== "pending_review") throw new Error(`Retry bypassed Review Queue with status ${data.target_status}.`);
    assertOutcomeCounts(data.outcomes, "Retry closeout outcomes");
    assertSameIds(data.existing_rate_staging_ids, expectedStagingIds, "Retry closeout staging ids");
    if (Number(data.inserted || 0) !== 0) throw new Error(`Retry inserted ${data.inserted} duplicate Rateware row(s).`);
    logCheckpoint("Closeout retry reused historical staging rows", {
      inserted: data.inserted,
      linked: data.linked,
      already_staged: data.already_staged
    });
    return data;
  });

  const firstNotices = await step("generate final carrier notices", async () => {
    const data = await rateware("generate_rfx_award_notices", {
      event_id: event.id,
      app_origin: appOrigin,
      sender_email: senderEmail,
      sender_label: senderEmail
    });
    if (Number(data.generated || 0) !== targetInvitations.length || (data.rows || []).length !== targetInvitations.length) {
      throw new Error(`Expected ${targetInvitations.length} final notices, got ${Number(data.generated || 0)}.`);
    }
    const outcomes = (data.rows || []).map(noticeOutcome).sort();
    const expectedOutcomes = ["awarded", "backup", "not_awarded"].sort();
    if (JSON.stringify(outcomes) !== JSON.stringify(expectedOutcomes)) {
      throw new Error(`Final notice outcomes mismatch. Expected ${expectedOutcomes.join(", ")}; got ${outcomes.join(", ")}.`);
    }
    const ids = sortedUniqueIds((data.rows || []).map((row) => row.id));
    if (ids.length !== targetInvitations.length) throw new Error("Final notice generation returned duplicate message ids.");
    report.artifacts.closeout_notice_ids = ids;
    logCheckpoint("Award, backup and no-award notices generated", { ids, outcomes });
    return data;
  });

  if (sendCloseoutEmail) {
    await step("send final carrier notices", async () => {
      const data = await rateware("send_outreach_messages", {
        ids: firstNotices.rows.map((row) => row.id),
        sender_email: senderEmail,
        confirmed: true
      });
      if (Number(data.sent || 0) !== targetInvitations.length || Number(data.failed || 0) !== 0) {
        throw new Error(`Final notice send mismatch. Sent ${Number(data.sent || 0)}, failed ${Number(data.failed || 0)}.`);
      }
      logCheckpoint("Final carrier notices sent", { sent: data.sent, failed: data.failed });
      return data;
    });
  }

  await step("regenerate final notices without duplicates", async () => {
    const data = await rateware("generate_rfx_award_notices", {
      event_id: event.id,
      app_origin: appOrigin,
      sender_email: senderEmail,
      sender_label: senderEmail
    });
    assertSameIds((data.rows || []).map((row) => row.id), report.artifacts.closeout_notice_ids, "Regenerated notice ids");
    if (Number(data.created || 0) !== 0) throw new Error(`Notice retry created ${data.created} duplicate message(s).`);
    logCheckpoint("Final notice retry reused the same messages", {
      created: data.created,
      refreshed: data.refreshed,
      preserved: data.preserved
    });
    return data;
  });

  await step("close event with decisions and notices preserved", async () => {
    const data = await rateware("update_rfx_event", {
      id: event.id,
      patch: { status: "closed" }
    });
    if (data.row?.status !== "closed") throw new Error(`Expected closed RFx status, got ${data.row?.status}.`);
    if (data.closeout_notice_error) throw new Error(`Automatic closeout notice failed: ${data.closeout_notice_error}`);
    if (data.closeout_staging?.target_status !== "pending_review") {
      throw new Error(`Event close bypassed Review Queue with status ${data.closeout_staging?.target_status || "missing"}.`);
    }
    assertOutcomeCounts(data.closeout_outcomes, "Closed event outcomes");
    assertSameIds(data.closeout_staging?.existing_rate_staging_ids, expectedStagingIds, "Closed event staging ids");
    assertSameIds((data.closeout_notices?.rows || []).map((row) => row.id), report.artifacts.closeout_notice_ids, "Closed event notice ids");
    logCheckpoint("RFx event closed without duplicate rows or notices", {
      status: data.row.status,
      staging_status: data.closeout_staging.target_status,
      notice_count: data.closeout_notices?.rows?.length || 0
    });
    return data;
  });

  await step("verify all bid costs remain in Review Queue", async () => {
    const data = await rateware("list_staging", { status: "pending_review", limit: 1000 });
    const expectedOutcomeById = new Map([
      [String(stagingIdsByOutcome.primary), "awarded"],
      [String(stagingIdsByOutcome.backup), "backup"],
      [String(stagingIdsByOutcome.not_awarded), "not_awarded"]
    ]);
    const rows = (data.rows || []).filter((row) => expectedOutcomeById.has(String(row.id)));
    assertSameIds(rows.map((row) => row.id), expectedStagingIds, "Review Queue staging ids");
    for (const row of rows) {
      if (String(row.status || "").toLowerCase() !== "pending_review") {
        throw new Error(`Staging row ${row.id} unexpectedly has status ${row.status}.`);
      }
      const expectedOutcome = expectedOutcomeById.get(String(row.id));
      if (String(row.rfx_bid_outcome || "").toLowerCase() !== expectedOutcome) {
        throw new Error(`Staging row ${row.id} expected outcome ${expectedOutcome}, got ${row.rfx_bid_outcome || "missing"}.`);
      }
    }
    report.completed = true;
    report.finished_at = new Date().toISOString();
    logCheckpoint("Review Queue contains all finalized carrier costs", {
      pending_review: rows.length,
      approved: rows.filter((row) => String(row.status || "").toLowerCase() === "approved").length
    });
    return rows;
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
