// Tarifa en revisión de Fr8Quote (contrato fr8quote.rateware-rate.v1). Las reglas 2–6 del contrato se validan aquí;
// la firma (regla 1) ya la verificó la entrada firmada de quotedesk-api. Solo inserta en fcm_ratebook_imports.

export const RATEBOOK_CONTRACT = "fr8quote.rateware-rate.v1";
type Row = Record<string, any>;

export class RatebookError extends Error {
  status: number;
  field?: string;
  constructor(status: number, message: string, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reglas 2–6 de §3.3: contrato y estado, moneda y unidades por tramo, montos, precio reconstruible, vigencia y clave. */
export async function validateRatebook(pkg: Row) {
  const bad = (code: string, field: string) => { throw new RatebookError(400, code, field); };
  if (pkg?.contract_version !== RATEBOOK_CONTRACT) bad("unsupported_contract", "contract_version");
  if (pkg.status !== "pending_review") bad("invalid_status", "status");
  const rate = pkg.rate ?? {}, cb = pkg.cost_basis ?? {}, pv = pkg.provenance ?? {};
  if (!["USD", "MXN"].includes(rate.currency)) bad("invalid_currency", "rate.currency");
  for (const u of Array.isArray(rate.per_unit) ? rate.per_unit : []) {
    if (u?.leg === "MX" ? u.unit !== "MXN/km" : u?.unit !== "USD/mi") bad("invalid_unit", "rate.per_unit");
  }
  if (!(Number(rate.total) > 0) || !(Number(cb.cost_total) > 0)) bad("non_positive_amount", "rate.total");
  if (!(cb.margin >= 0 && cb.margin < 1)) bad("invalid_margin", "cost_basis.margin");
  if (Math.abs(rate.total - cb.cost_total / (1 - cb.margin)) > 0.01) bad("price_not_reconstructible", "rate.total");
  if (rate.valid_until && rate.valid_from && rate.valid_until < rate.valid_from) bad("invalid_validity", "rate.valid_until");
  if (!pv.quote_id || !pv.snapshot_hash) bad("missing_provenance", "provenance");
  const key = await sha256Hex(`${RATEBOOK_CONTRACT}:${pv.organization_id}:${pv.quote_id}:${pv.snapshot_hash}`);
  if (key !== pkg.idempotency_key) bad("idempotency_key_invalid", "idempotency_key");
}

/** Inserta la tarifa en revisión; el reintento idéntico devuelve el mismo recibo y la versión nueva reemplaza a la anterior. */
export async function importRatebook(supabase: any, workspace: { owner_email: string; organization_id: string | null }, pkg: Row) {
  await validateRatebook(pkg);
  const checksum = await sha256Hex(JSON.stringify(pkg));
  const prior = await supabase.from("fcm_ratebook_imports").select("id,payload_checksum,status")
    .eq("owner_email", workspace.owner_email).eq("idempotency_key", pkg.idempotency_key).maybeSingle();
  if (prior.error) throw new RatebookError(503, "receiver_unavailable");
  if (prior.data) {
    if (prior.data.payload_checksum !== checksum) throw new RatebookError(409, "idempotency_conflict");
    return { accepted: true, duplicate: true, receipt_id: prior.data.id, status: prior.data.status, payload_checksum: checksum };
  }
  const quoteId = String(pkg.provenance.quote_id);
  const inserted = await supabase.from("fcm_ratebook_imports").insert({
    owner_email: workspace.owner_email, organization_id: workspace.organization_id, idempotency_key: pkg.idempotency_key,
    contract_version: RATEBOOK_CONTRACT, source_organization_id: String(pkg.provenance.organization_id ?? ""),
    source_quote_id: quoteId, source_quote_version: Number(pkg.provenance.quote_version) || null,
    payload_checksum: checksum, payload: pkg, status: "pending_review",
  }).select("id").single();
  if (inserted.error) {
    if (inserted.error.code === "23505") throw new RatebookError(409, "in_progress");
    throw new RatebookError(503, "receiver_unavailable");
  }
  // Primero entra la nueva; solo entonces la anterior en revisión de la misma cotización pasa a superseded.
  await supabase.from("fcm_ratebook_imports").update({ status: "superseded", updated_at: new Date().toISOString() })
    .eq("owner_email", workspace.owner_email).eq("source_quote_id", quoteId).eq("status", "pending_review").neq("id", inserted.data.id);
  return { accepted: true, duplicate: false, receipt_id: inserted.data.id, status: "pending_review", payload_checksum: checksum };
}

const REVIEW_STATUSES = new Set(["pending_review", "approved", "rejected", "superseded"]);

/** La bandeja del workspace para revisarla: las más recientes primero, filtrable por estado. */
export async function listRatebookImports(supabase: any, workspace: { owner_email: string }, body: Row) {
  const status = String(body.status ?? "pending_review");
  let query = supabase.from("fcm_ratebook_imports")
    .select("id,received_at,status,source_quote_id,source_quote_version,payload,reviewed_at,reviewed_by_email,review_note")
    .eq("owner_email", workspace.owner_email).order("received_at", { ascending: false }).limit(100);
  if (status !== "all") {
    if (!REVIEW_STATUSES.has(status)) throw new RatebookError(400, "invalid_status", "status");
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) throw new RatebookError(503, "receiver_unavailable");
  return { rows: data ?? [] };
}

/** Aprobar o rechazar una tarifa en revisión, con nota. Aprobar no publica nada: la deja revisada como referencia. */
export async function reviewRatebookImport(supabase: any, workspace: { owner_email: string }, reviewer: string, body: Row) {
  const id = String(body.id ?? "");
  const decision = String(body.decision ?? "");
  if (!id) throw new RatebookError(400, "missing_id", "id");
  if (decision !== "approved" && decision !== "rejected") throw new RatebookError(400, "invalid_decision", "decision");
  const note = String(body.note ?? "").trim().slice(0, 1000) || null;
  if (decision === "rejected" && !note) throw new RatebookError(400, "note_required", "note");
  const { data, error } = await supabase.from("fcm_ratebook_imports")
    .update({ status: decision, reviewed_at: new Date().toISOString(), reviewed_by_email: reviewer, review_note: note, updated_at: new Date().toISOString() })
    .eq("owner_email", workspace.owner_email).eq("id", id).eq("status", "pending_review").select("id,status,reviewed_at,reviewed_by_email,review_note").maybeSingle();
  if (error) throw new RatebookError(503, "receiver_unavailable");
  if (!data) throw new RatebookError(409, "not_pending");
  return { row: data };
}
