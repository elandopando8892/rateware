// QuoteDesk snapshots live in the existing delivery queue. Receipts remain the
// authority for provider outcomes; no ambiguous attempt is reclaimed automatically.
import { QUOTE_QUEUE_SOURCE } from "../_shared/quote-queue-scope.ts";
type Row = Record<string, any>;
type Db = { from: (table: string) => any };
type Workspace = { owner_email: string; owner_user_id: string | null; organization_id: string | null };
export class QuoteQueueError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}
function uuidFromHash(hash: string) {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function check(result: Row) { if (result.error) throw result.error; return result.data; }
const owned = (row: Row, workspace: Workspace) => ({ ...row, ...workspace });

export function quoteQueue(deps: {
  requireQuote: (db: any, workspace: Workspace, id: unknown) => Promise<Row>;
  draft: (db: any, workspace: Workspace, input: Row) => Promise<Row>;
  send: (db: any, workspace: Workspace, input: Row) => Promise<Row>;
  validEmail: (email: string) => boolean;
}) {
  async function receipt(db: Db, workspace: Workspace, quoteId: string, checksum: string) {
    return check(await db.from("quotedesk_quote_emails").select("*").eq("owner_email", workspace.owner_email)
      .eq("quote_id", quoteId).eq("payload_checksum", checksum).maybeSingle());
  }
  async function hydrate(db: Db, workspace: Workspace, row: Row) {
    const outcome = await receipt(db, workspace, row.metadata.quote_id, row.metadata.checksum);
    return { ...row, status: outcome?.status || row.status, receipt: outcome };
  }
  async function prepare(db: Db, workspace: Workspace, input: Row) {
    const draft = await deps.draft(db, workspace, input);
    if (input.checksum !== draft.checksum) throw new QuoteQueueError(409, "La cotización cambió. Actualiza la vista previa.");
    if (!draft.to || !deps.validEmail(draft.to) || draft.cc.some((email: string) => !deps.validEmail(email))) {
      throw new QuoteQueueError(400, "Revisa el destinatario y los correos en copia.");
    }
    if (draft.suppressed.length) throw new QuoteQueueError(400, "Un destinatario está en la lista de rebotes o bajas.");
    const campaignHash = await digest(`${QUOTE_QUEUE_SOURCE}:${workspace.owner_email}:${draft.quote.id}`);
    const campaignId = uuidFromHash(campaignHash);
    const id = uuidFromHash(await digest(`${campaignHash}:${draft.checksum}`));
    const existing = check(await db.from("outreach_messages").select("*").eq("owner_email", workspace.owner_email).eq("id", id).maybeSingle());
    if (existing) return { draft_only: true, reused: true, message: await hydrate(db, workspace, existing) };
    const campaign = await db.from("outreach_campaigns").insert(owned({
      id: campaignId, idempotency_key: campaignHash, name: `QuoteDesk ${draft.quote.folio}`,
      channel: "email", status: "draft", rfx_event_id: null,
    }, workspace));
    if (campaign.error && campaign.error.code !== "23505") throw campaign.error;
    const inserted = await db.from("outreach_messages").insert(owned({
      id, campaign_id: campaignId, channel: "email", status: "drafted", rfx_event_id: null,
      recipient_email: draft.to, subject: draft.subject, html_body: draft.html, text_body: draft.text,
      metadata: { source: QUOTE_QUEUE_SOURCE, quote_id: draft.quote.id, checksum: draft.checksum,
        from: draft.from, cc: draft.cc, contact_name: draft.contact_name, note: draft.note },
    }, workspace)).select().single();
    if (inserted.error?.code === "23505") {
      const row = check(await db.from("outreach_messages").select("*").eq("owner_email", workspace.owner_email).eq("id", id).single());
      return { draft_only: true, reused: true, message: await hydrate(db, workspace, row) };
    }
    return { draft_only: true, reused: false, message: await hydrate(db, workspace, check(inserted)) };
  }
  async function list(db: Db, workspace: Workspace, input: Row) {
    const quote = await deps.requireQuote(db, workspace, input.quote_id);
    const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
    const result = await db.from("outreach_messages").select("*", { count: "exact" })
      .eq("owner_email", workspace.owner_email).contains("metadata", { source: QUOTE_QUEUE_SOURCE, quote_id: quote.id })
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 19);
    const rows = check(result);
    return { quote, rows: await Promise.all(rows.map((row: Row) => hydrate(db, workspace, row))), total: result.count || 0 };
  }
  async function send(db: Db, workspace: Workspace, input: Row) {
    if (input.confirmed !== true || input.confirmation_action !== "send_quote_queue_message") {
      throw new QuoteQueueError(400, "Aprueba el envío desde la Cola.");
    }
    await deps.requireQuote(db, workspace, input.quote_id);
    const row = check(await db.from("outreach_messages").select("*").eq("owner_email", workspace.owner_email)
      .eq("id", input.message_id).contains("metadata", { source: QUOTE_QUEUE_SOURCE, quote_id: input.quote_id }).maybeSingle());
    if (!row) throw new QuoteQueueError(404, "Borrador no encontrado en esta cotización.");
    if (input.checksum !== row.metadata.checksum) throw new QuoteQueueError(409, "El borrador cambió. Revisa la Cola otra vez.");
    const hydrated = await hydrate(db, workspace, row);
    if (hydrated.receipt?.status === "sent") return { message: hydrated, duplicate: true };
    if (!["drafted", "failed"].includes(hydrated.status)) throw new QuoteQueueError(409, "Envío en curso o sin confirmar. Revisa Enviados en Gmail.");
    const fields = { quote_id: input.quote_id, to: row.recipient_email, cc: row.metadata.cc,
      note: row.metadata.note, contact_name: row.metadata.contact_name, checksum: row.metadata.checksum, confirmed: true };
    const current = await deps.draft(db, workspace, fields);
    const snapshot = await digest(JSON.stringify({ to: row.recipient_email, cc: row.metadata.cc,
      subject: row.subject, text: row.text_body, html: row.html_body }));
    if (current.checksum !== fields.checksum || snapshot !== fields.checksum || current.from !== row.metadata.from) {
      throw new QuoteQueueError(409, "La cotización cambió. Prepara y revisa un nuevo borrador.");
    }
    if (current.suppressed.length) throw new QuoteQueueError(400, "Un destinatario está en la lista de rebotes o bajas.");
    const attempt = crypto.randomUUID();
    let claim = db.from("outreach_messages").update({ status: "sending", send_attempt_id: attempt,
      send_started_at: new Date().toISOString() }).eq("owner_email", workspace.owner_email).eq("id", row.id)
      .eq("status", row.status);
    // A durable failed receipt can recover a stale sending row. Compare the
    // previous attempt too, so two recoveries cannot take the same claim.
    claim = row.send_attempt_id ? claim.eq("send_attempt_id", row.send_attempt_id) : claim.is("send_attempt_id", null);
    const claimed = check(await claim.select().maybeSingle());
    if (!claimed) throw new QuoteQueueError(409, "Otro envío está en curso. Actualiza la Cola.");
    async function persistOutcome() {
      const result = await hydrate(db, workspace, claimed);
      const status = result.receipt?.status || "delivery_unknown";
      check(await db.from("outreach_messages").update({ status, sent_at: result.receipt?.sent_at || null,
        send_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("owner_email", workspace.owner_email).eq("id", row.id).eq("send_attempt_id", attempt).select().single());
      return { ...result, status };
    }
    try {
      const sent = await deps.send(db, workspace, fields);
      return { message: await persistOutcome(), duplicate: sent.duplicate };
    } catch (error) {
      // If either readback or persistence fails, leave the claim untouched. A
      // receipt in sending/unknown prevents a retry from reaching the provider.
      await persistOutcome();
      throw error;
    }
  }
  return { prepare, list, send };
}
