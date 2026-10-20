type Row = Record<string, any>;
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const text = (value: unknown, max = 2000) => typeof value === "string" ? value.slice(0, max) : null;

/** Bounded read projection through the existing read action. No transport or mutation. */
export async function listWhatsappQueueEvidence(db: any, user: Row, body: Row) {
  const invalid = () => ({ status: 400, data: { error: "Invalid WhatsApp evidence scope or pagination." } });
  const unavailable = () => ({ status: 503, data: { error: "WhatsApp evidence is temporarily unavailable." } });
  const view = body.whatsapp_view;
  const offset = body.offset ?? 0, limit = body.limit ?? 25;
  if (!["pending", "message"].includes(view) || !Number.isSafeInteger(offset) || offset < 0
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) return invalid();
  if (!user.owner_email) return { status: 403, data: { error: "Workspace unavailable." } };
  if (view === "pending" && (body.rfx_event_id || body.outreach_message_id || body.vendor_id || body.campaign_id)) return invalid();
  if (view === "message") {
    if (!uuid(body.rfx_event_id) || !uuid(body.outreach_message_id)) return invalid();
    const message = await db.from("outreach_messages").select("id,owner_email,rfx_event_id,channel")
      .eq("owner_email", user.owner_email).eq("id", body.outreach_message_id).eq("rfx_event_id", body.rfx_event_id)
      .eq("channel", "whatsapp").maybeSingle();
    if (message.error) return unavailable();
    if (!message.data || message.data.owner_email !== user.owner_email || message.data.rfx_event_id !== body.rfx_event_id)
      return { status: 404, data: { error: "Message not found." } };
  }
  let query = db.from("contact_history")
    .select("id,owner_email,rfx_event_id,outreach_message_id,direction,status,body_preview,occurred_at,metadata", { count: "exact" })
    .eq("owner_email", user.owner_email).eq("channel", "whatsapp");
  query = view === "pending"
    ? query.is("rfx_event_id", null).is("outreach_message_id", null).eq("metadata->association->>state", "pending")
    : query.eq("rfx_event_id", body.rfx_event_id).eq("outreach_message_id", body.outreach_message_id);
  const result = await query.order("occurred_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
  if (result.error) return unavailable();
  const rows = (result.data || []).filter((row: Row) => row.owner_email === user.owner_email).map((row: Row) => {
    const metadata = record(row.metadata), callback = record(metadata.callback), association = record(metadata.association);
    return { id: row.id, direction: row.direction === "inbound" ? "inbound" : "outbound", status: text(row.status, 40),
      body_preview: text(row.body_preview), occurred_at: date(row.occurred_at), received_at: date(metadata.received_at),
      from_phone: typeof metadata.from_phone === "string" && /^\+?[1-9]\d{10,14}$/.test(metadata.from_phone) ? metadata.from_phone : null,
      association_reason: text(association.reason, 80),
      // IDs/credentials/payloads/approval signatures are deliberately excluded.
      provider_status: text(callback.status, 40) };
  });
  const total = Number(result.count || 0);
  return { status: 200, data: { contract: "bidware.whatsapp-evidence.v1", view,
    scope: view === "message" ? { rfx_event_id: body.rfx_event_id, outreach_message_id: body.outreach_message_id } : null,
    rows, total, offset, limit, has_more: offset + rows.length < total } };
}
