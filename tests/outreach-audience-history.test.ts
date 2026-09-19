import assert from "node:assert/strict";

const source = await Deno.readTextFile(new URL("../supabase/functions/rateware-api/index.ts", import.meta.url));
const names = ["scopedOutreachMessagesQuery", "allScopedOutreachMessages", "outreachMessageTrackingState", "outreachDedupeContactKey", "outreachEventDedupeKey", "outreachHistoryByContact", "outreachBlocksAutoDraft", "outreachNextAction", "outreachOutcomeReason"];
const extracted = names.map((name) => {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?^}`, "m"));
  assert.ok(match, name);
  return `export ${match[0]}`;
}).join("\n");
const harness = `
type RatewareSupabaseClient = any;
type OutreachTrackingState = string;
const cleanText = (v: any) => v == null ? null : String(v).trim() || null;
const objectRecord = (v: any) => v && typeof v === 'object' ? v : {};
const relationRecord = (v: any) => Array.isArray(v) ? v[0] || {} : objectRecord(v);
const phoneForWhatsapp = (v: any) => String(v || '').replace(/\\D/g, '');
const hasSubmittedCarrierBid = (v: any) => Number(v) > 0;
const OUTREACH_DO_NOT_AUTO_REQUEUE_STATUSES = new Set(['queued','sending','sent','delivered','read','manual_sent','delivery_unknown','replied','quoted','failed','bounced','suppressed']);
const OUTREACH_MESSAGE_EVENT_SELECT = 'event-select';
const OUTREACH_MESSAGE_COMPACT_SELECT = 'compact-select';
const OUTREACH_MESSAGE_SELECT = 'full-select';
export let hydrations = 0;
async function hydrateOutreachInvitationTokens(_: any, rows: any[]) { hydrations++; return rows; }
${extracted}`;
const api = await import(`data:application/typescript;base64,${btoa(harness)}`);

function database(rows: any[], failPage = -1) {
  const calls: any[] = [];
  let selection = "";
  const query: any = {};
  for (const method of ["from", "eq", "neq", "gte", "in", "order"]) {
    query[method] = (...args: any[]) => { calls.push([method, ...args]); return query; };
  }
  query.select = (value: string) => { selection = value; return query; };
  query.range = (first: number, last: number) => {
    calls.push(["range", first, last]);
    return first === failPage ? { error: new Error("page failed") } : { data: rows.slice(first, last + 1) };
  };
  return { query, calls, selection: () => selection };
}

Deno.test("audience history keeps every page, scope and order without decrypting tokens", async () => {
  const rows = Array.from({ length: 2001 }, (_, i) => ({ id: String(i) }));
  const db = database(rows);
  assert.deepEqual(await api.allScopedOutreachMessages(db.query, { owner_email: "owner@example.test" }, { view: "audience_history", rfx_event_id: "event", channel: "email", include_archived: false }), rows);
  assert.equal(api.hydrations, 0);
  assert.deepEqual(db.calls.filter((c) => c[0] === "range"), [["range", 0, 999], ["range", 1000, 1999], ["range", 2000, 2999]]);
  for (const expected of [["eq", "owner_email", "owner@example.test"], ["eq", "rfx_event_id", "event"], ["eq", "channel", "email"], ["neq", "status", "archived"], ["order", "created_at", { ascending: false }], ["order", "id", { ascending: false }]]) assert.ok(db.calls.some((c) => JSON.stringify(c) === JSON.stringify(expected)));
  assert.doesNotMatch(db.selection(), /\*|body|token|vendors\(vendor_name|campaigns/);
  assert.match(db.selection(), /normalized_recipient_phone/);
  assert.match(db.selection(), /rfx_lane_vendors\(invitation_status,bid_rate,responded_at\)/);
  const failed = database(rows, 1000);
  await assert.rejects(api.allScopedOutreachMessages(failed.query, {}, { view: "audience_history" }), /page failed/);
  const regular = database([]);
  await api.allScopedOutreachMessages(regular.query, {}, {});
  assert.equal(api.hydrations, 1);
  assert.equal(regular.selection(), "full-select");
});

Deno.test("slim history preserves contact matching, blocking, tracking and next actions", () => {
  const db = database([]);
  api.scopedOutreachMessagesQuery(db.query, {}, { view: "audience_history" });
  const fields = db.selection().split(",rfx_lane_vendors(")[0].split(",");
  const statuses = ["drafted", "queued", "sending", "sent", "delivered", "read", "manual_sent", "delivery_unknown", "replied", "quoted", "failed", "bounced", "suppressed", "archived"];
  for (const status of statuses) for (const channel of ["email", "whatsapp"]) {
    for (const extra of [{}, { metadata: { last_event: "bounced" } }, { provider_response_status: "rejected" }, { rfx_lane_vendors: { bid_rate: 1700 } }, { rfx_lane_vendors: [{ responded_at: "2026-09-19" }] }]) {
      const full: any = { id: "history", rfx_event_id: "event", vendor_id: "carrier", status, channel, recipient_email: channel === "email" ? "PERSON@example.test" : null, recipient_phone: "+52 81 1234", normalized_recipient_phone: "52811234", updated_at: "2026-09-19", body_html: "unused body", invitation_token: "unused token", ...extra };
      const slim = Object.fromEntries(fields.map((key) => [key, full[key]]));
      slim.rfx_lane_vendors = full.rfx_lane_vendors;
      for (const fn of ["outreachEventDedupeKey", "outreachMessageTrackingState", "outreachBlocksAutoDraft", "outreachNextAction", "outreachOutcomeReason"]) assert.deepEqual(api[fn](slim), api[fn](full), `${fn}: ${status}/${channel}`);
      assert.deepEqual([...api.outreachHistoryByContact([slim]).keys()], [...api.outreachHistoryByContact([full]).keys()]);
    }
  }
});
