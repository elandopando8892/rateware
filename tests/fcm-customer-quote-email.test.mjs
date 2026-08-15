import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const api = readFileSync("supabase/functions/rateware-api/index.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260814000300_fcm_customer_quote_email_receipts.sql",
  "utf8"
);
const handlerStart = api.indexOf("async function sendFcmCustomerQuoteEmail(");
const handlerEnd = api.indexOf("async function gmailApiGet(", handlerStart);
const handler = api.slice(handlerStart, handlerEnd);

assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, "FCM Gmail handler must be a named, discoverable action");
assert.match(api, /body\.action === "send_fcm_customer_quote_email"[\s\S]+sendFcmCustomerQuoteEmail\([\s\S]+request\.headers\.get\("x-idempotency-key"\)/);
assert.match(api, /FCM_CUSTOMER_QUOTE_EMAIL_CONTRACT_VERSION = "fcm\.rateware-gmail-send\.v1"/);
assert.match(api, /FCM_CUSTOMER_QUOTE_EMAIL_DRAFT_VERSION = "fcm\.rateware-gmail-draft\.v1"/);
assert.match(api, /packageInput\.sourceOrganizationId/);
assert.match(api, /authorization\.confirmation !== "EXPLICIT_QUOTE_DESK_SEND"/);
assert.match(api, /requestIdempotencyKey !== idempotencyKey \|\| headerKey !== idempotencyKey/);
assert.match(api, /expectedPayloadChecksum !== payloadChecksum/);
assert.match(api, /expectedIdempotencyKey !== idempotencyKey/);
assert.match(api, /ownerEmail !== GMAIL_ALLOWED_SENDER/);
assert.match(api, /preparedByEmail !== ownerEmail/);

const insertIndex = handler.indexOf('.from("fcm_customer_quote_email_receipts")\n      .insert(');
const gmailSendIndex = handler.indexOf('fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send"');
assert.ok(insertIndex >= 0 && insertIndex < gmailSendIndex, "The idempotent receipt claim must precede Gmail delivery");
assert.match(handler, /cleanText\(receipt\.status\) === "sent"[\s\S]+fcmReceiptAccepted\(receipt, true\)/);
assert.match(handler, /\["sending", "delivery_unknown"\][\s\S]+fcmReceiptBlocked\(receipt\)/);
assert.match(handler, /status: "delivery_unknown"[\s\S]+provider_response_status: "network_unknown"/);
assert.match(handler, /gmailResponse\.status === 408 \|\| gmailResponse\.status === 429 \|\| gmailResponse\.status >= 500/);
assert.match(handler, /if \(!providerMessageId\)[\s\S]+reconcile before retrying/);
assert.match(handler, /status: "sent"[\s\S]+provider_message_id: providerMessageId[\s\S]+\.eq\("status", "sending"\)/);
assert.match(handler, /await tryWriteAuditLog\([\s\S]+"fcm\.customer_quote\.gmail\.sent"/);

assert.match(migration, /unique \(owner_email, idempotency_key\)/);
assert.match(migration, /status in \('sending', 'sent', 'failed', 'delivery_unknown'\)/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.fcm_customer_quote_email_receipts from public, anon, authenticated/);
assert.match(migration, /grant select, insert, update, delete on table public\.fcm_customer_quote_email_receipts to service_role/);
assert.doesNotMatch(migration, /access_token|refresh_token|html_body|text_body/);

const payload = {
  toEmail: "buyer@example.com",
  subject: "Cotizacion CQ-1",
  html: "<p>Quote</p>",
  text: "Quote"
};
const checksum = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
const key = (organizationId) => createHash("sha256")
  .update(`fcm.rateware-gmail-send.v1:${organizationId}:draft-1:${checksum}`)
  .digest("hex");
assert.equal(checksum.length, 64);
assert.equal(key("org-1").length, 64);
assert.notEqual(key("org-1"), key("org-2"), "Idempotency must remain tenant-bound");

console.log("FCM customer quote Gmail contract tests passed");
