import assert from "node:assert/strict";
import test from "node:test";
import {
  carrierReplies,
  isAutomatedReply,
  matchInvitation,
  senderEmail,
  summarizeCarrierReplies
} from "./rfx-carrier-replies.mjs";

const MAILBOX = "sales@heymarksman.com";
const SENT = "2026-10-22T15:13:00.000Z";
const at = (iso) => String(new Date(iso).getTime());
const invitations = [
  { id: "lv-g8", vendor_id: "v-g8", rfx_lane_id: "lane-1", emails: ["ops@g8transport.com"], domain: "g8transport.com" },
  { id: "lv-sun", vendor_id: "v-sun", rfx_lane_id: "lane-1", emails: ["dispatch@sunline.mx"], domain: "sunline.mx" },
  { id: "lv-gm1", vendor_id: "v-gm1", rfx_lane_id: "lane-1", emails: ["fletes1@gmail.com"], domain: null },
  { id: "lv-gm2", vendor_id: "v-gm2", rfx_lane_id: "lane-1", emails: ["fletes2@gmail.com"], domain: null }
];

test("senderEmail reads display-name and bare addresses", () => {
  assert.equal(senderEmail("Dante Ruiz <Dante@ExpressGena.com>"), "dante@expressgena.com");
  assert.equal(senderEmail("ops@g8transport.com"), "ops@g8transport.com");
  assert.equal(senderEmail("sin correo"), null);
});

test("auto-replies and bounces are not replies", () => {
  assert.equal(isAutomatedReply({ from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>" }), true);
  assert.equal(isAutomatedReply({ from: "a@b.com", "auto-submitted": "auto-replied" }), true);
  assert.equal(isAutomatedReply({ from: "a@b.com", subject: "Respuesta automática: RFx-1021" }), true);
  assert.equal(isAutomatedReply({ from: "a@b.com", subject: "RE: RFx-1021 SLP - Tulsa" }), false);
});

test("thread replies skip our own mailbox and anything before the invitation", () => {
  const replies = carrierReplies({
    mailbox: MAILBOX,
    since: SENT,
    messages: [
      { id: "m1", threadId: "t1", internalDate: at("2026-10-22T15:13:05Z"), headers: { from: `Marksman <${MAILBOX}>` } },
      { id: "m0", threadId: "t1", internalDate: at("2026-10-21T10:00:00Z"), headers: { from: "old@g8transport.com" } },
      { id: "m2", threadId: "t1", internalDate: at("2026-10-23T09:00:00Z"), headers: { from: "Ventas <ventas@tramitaciones.com>", subject: "RE: RFx-1021" } }
    ]
  });
  assert.deepEqual(replies.map((reply) => reply.gmail_message_id), ["m2"]);
  assert.equal(replies[0].from, "ventas@tramitaciones.com");
});

test("a reply outside the thread matches by address, then by a unique corporate domain, never by free mail", () => {
  assert.equal(matchInvitation("ops@g8transport.com", invitations)?.id, "lv-g8");
  assert.equal(matchInvitation("trafico@sunline.mx", invitations)?.id, "lv-sun");
  assert.equal(matchInvitation("fletes2@gmail.com", invitations)?.id, "lv-gm2");
  assert.equal(matchInvitation("otro@gmail.com", invitations), null);
  assert.equal(matchInvitation("nadie@desconocido.com", invitations), null);
});

test("summary joins email and Bid Room chat per invitation and counts a message once", () => {
  const rows = summarizeCarrierReplies({
    invitations,
    threadReplies: [{ rfx_lane_vendor_id: "lv-g8", gmail_message_id: "m2", at: "2026-10-23T09:00:00.000Z", from: "ventas@tramitaciones.com" }],
    searchReplies: [
      { gmail_message_id: "m2", at: "2026-10-23T09:00:00.000Z", from: "ventas@tramitaciones.com" },
      { gmail_message_id: "m3", at: "2026-10-23T11:00:00.000Z", from: "trafico@sunline.mx" }
    ],
    chatMessages: [
      { id: "c1", vendor_id: "v-sun", rfx_lane_id: "lane-1", sender_role: "carrier", created_at: "2026-10-23T12:00:00.000Z" },
      { id: "c2", vendor_id: "v-gm1", rfx_lane_id: null, sender_role: "procurement", created_at: "2026-10-23T12:00:00.000Z" }
    ]
  });
  assert.deepEqual(rows.map((row) => row.rfx_lane_vendor_id), ["lv-g8", "lv-sun"]);
  assert.equal(rows[0].count, 1);
  assert.deepEqual(rows[1].channels, ["email", "bid_room_chat"]);
  assert.equal(rows[1].last_reply_at, "2026-10-23T12:00:00.000Z");
});
