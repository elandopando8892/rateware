// Read-only projection of existing outreach receipts. Never sends or repairs data.
export const PRIVATE_DELIVERY_CONTRACT = Object.freeze({
  contractVersion: "rateware-private-book-sent.v1",
  source: "outreach_messages",
  sentOnly: true,
});
const RECEIPT_STATUSES = [
  "sent",
  "manual_sent",
  "delivered",
  "read",
  "replied",
  "archived",
];
const INVITATION_STATUSES = new Set([
  "invited",
  "viewed",
  "responded",
  "quoted",
  "bid_submitted",
  "awarded",
]);
const FAILED = new Set([
  "bounced",
  "failed",
  "delivery_unknown",
  "suppressed",
  "rejected",
]);
const text = (v) => typeof v === "string" ? v.trim() : "";
const relation = (v) => Array.isArray(v) ? v[0] || {} : v || {};
const instant = (v) => {
  const s = text(v);
  const calendar = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(calendar.getTime()) &&
      calendar.toISOString().slice(0, 10) === s.slice(0, 10) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
        .test(s)
    ? Date.parse(s)
    : NaN;
};

export function invitationDeadline(dueDate, utcOffset) {
  const due = text(dueDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) {
    const ms = instant(due);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  const calendar = new Date(`${due}T00:00:00Z`);
  if (
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== due
  ) return null;
  if (!/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(text(utcOffset))) return null;
  if (utcOffset.slice(1, 3) === "14" && utcOffset.slice(4) !== "00") {
    return null;
  }
  const ms = Date.parse(`${due}T23:59:59${utcOffset}`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function activePrivateInvitation(
  row,
  scope,
  utcOffset,
  now = Date.now(),
) {
  const event = relation(row.rfx_events);
  const deadline = invitationDeadline(event.due_date, utcOffset);
  return Boolean(
    text(row.id) && text(row.vendor_id) === scope.vendorId &&
      text(event.owner_email) === scope.ownerEmail &&
      text(event.id) === text(row.rfx_event_id) &&
      INVITATION_STATUSES.has(text(row.invitation_status).toLowerCase()) &&
      event.status === "open" && deadline && Date.parse(deadline) > now,
  );
}

export function messageInvitationIds(message) {
  const listed = message.metadata?.rfx_lane_vendor_ids;
  return [
    ...new Set(
      [
        text(message.rfx_lane_vendor_id),
        ...(Array.isArray(listed) ? listed.map(text) : []),
      ].filter(Boolean),
    ),
  ];
}

export function receiptEvidence(message, row, scope, now = Date.now()) {
  if (
    text(row.vendor_id) !== scope.vendorId ||
    text(relation(row.rfx_events).owner_email) !== scope.ownerEmail ||
    text(relation(row.rfx_events).id) !== text(row.rfx_event_id) ||
    text(message.owner_email) !== scope.ownerEmail ||
    text(message.vendor_id) !== scope.vendorId ||
    text(message.rfx_event_id) !== text(row.rfx_event_id) ||
    !messageInvitationIds(message).includes(text(row.id))
  ) return null;
  if (
    !RECEIPT_STATUSES.includes(text(message.status).toLowerCase()) ||
    FAILED.has(text(message.delivery_status).toLowerCase()) ||
    FAILED.has(text(message.provider_response_status).toLowerCase()) ||
    FAILED.has(text(message.send_result?.outcome).toLowerCase()) ||
    text(message.bounce_status) || message.suppressed_at
  ) return null;
  const sent = instant(message.sent_at);
  if (!Number.isFinite(sent) || sent > now) return null;
  // A historical failed_at can survive a successful retry; current outcome governs.
  const provider = text(message.provider).toLowerCase();
  const channel = text(message.channel).toLowerCase();
  if (
    text(message.provider_message_id) &&
    ((provider === "gmail" && channel === "email") ||
      (provider === "meta" && channel === "whatsapp"))
  ) {
    return {
      sent_at: new Date(sent).toISOString(),
      basis: "provider_accepted",
    };
  }
  const manual = instant(message.manual_sent_at);
  if (
    Number.isFinite(manual) && manual <= now &&
    text(message.manual_sent_by) === scope.ownerEmail
  ) {
    return { sent_at: new Date(sent).toISOString(), basis: "manual_reported" };
  }
  return null;
}

export async function loadPrivateDeliveryEvidence(
  supabase,
  rows,
  scope,
  now = Date.now(),
) {
  if (!scope.ownerEmail || !scope.vendorId) {
    throw new Error("PRIVATE_DELIVERY_EVIDENCE_UNAVAILABLE");
  }
  const events = [
    ...new Set(rows.map((row) => text(row.rfx_event_id)).filter(Boolean)),
  ];
  const byId = new Map(rows.map((row) => [text(row.id), row]));
  const proofs = new Map();
  if (!events.length) return proofs;
  // Reuses Rateware's paged outreach read; additionally binds vendor and invitation IDs.
  // Fail closed on a read error or a saturated budget rather than claim sent-only on a partial read.
  const pageSize = 200;
  let reads = 0;
  for (let eventOffset = 0; eventOffset < events.length; eventOffset += 100) {
    for (let page = 0;; page++) {
      if (reads++ >= 25) {
        throw new Error("PRIVATE_DELIVERY_EVIDENCE_UNAVAILABLE");
      }
      const result = await supabase.from("outreach_messages")
        .select(
          "id,owner_email,vendor_id,rfx_event_id,rfx_lane_vendor_id,metadata,status,channel,sent_at,manual_sent_at,manual_sent_by,provider,provider_message_id,provider_response_status,delivery_status,bounce_status,suppressed_at,send_result",
        )
        .eq("owner_email", scope.ownerEmail).eq("vendor_id", scope.vendorId)
        .in("rfx_event_id", events.slice(eventOffset, eventOffset + 100)).in(
          "status",
          RECEIPT_STATUSES,
        )
        .not("sent_at", "is", null).order("id", { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (result.error || !Array.isArray(result.data)) {
        throw new Error("PRIVATE_DELIVERY_EVIDENCE_UNAVAILABLE");
      }
      for (const message of result.data) {
        for (const id of messageInvitationIds(message)) {
          const row = byId.get(id);
          if (
            !row || text(row.vendor_id) !== scope.vendorId ||
            text(relation(row.rfx_events).owner_email) !== scope.ownerEmail
          ) continue;
          const proof = receiptEvidence(message, row, scope, now);
          if (
            proof &&
            (!proofs.has(id) ||
              Date.parse(proof.sent_at) > Date.parse(proofs.get(id).sent_at))
          ) proofs.set(id, proof);
        }
      }
      if (result.data.length < pageSize) break;
    }
  }
  return proofs;
}

export function privateInvitationProjection(row, proof, utcOffset) {
  return {
    ...row,
    expires_at: invitationDeadline(
      relation(row.rfx_events).due_date,
      utcOffset,
    ),
    delivery_receipt: { sent_at: proof.sent_at, basis: proof.basis },
  };
}
