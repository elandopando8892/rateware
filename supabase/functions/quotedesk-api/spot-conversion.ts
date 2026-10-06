import { teamRoleAllows, teamRoleFromClaims } from "../_shared/team-roles.ts";

type Row = Record<string, unknown>;
type Workspace = { owner_email: string; owner_user_id: string | null; organization_id: string | null };
type Client = { rpc(name: string, args: Row): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
export class SpotConversionError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

/** The only write is the database transaction. Never retry or fall back to create_quote here. */
export async function convertSpotRequest(client: Client, workspace: Workspace, claims: Row, input: Row) {
  if (!workspace.owner_email || !workspace.organization_id || !teamRoleAllows(teamRoleFromClaims(claims), "operate")) {
    throw new SpotConversionError(403, "spot_conversion_forbidden");
  }
  const project = typeof input.project_id === "string" ? input.project_id : "";
  const version = typeof input.expected_submission_updated_at === "string" ? input.expected_submission_updated_at : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(project)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(version)
    || !Number.isFinite(Date.parse(version))) {
    throw new SpotConversionError(400, "spot_conversion_invalid_input");
  }
  const actor = typeof claims.email === "string" ? claims.email.trim() : "";
  if (!actor) throw new SpotConversionError(403, "spot_conversion_actor_required");
  const { data, error } = await client.rpc("quotedesk_convert_spot_request", {
    p_owner_email: workspace.owner_email, p_owner_user_id: workspace.owner_user_id,
    p_organization_id: workspace.organization_id, p_actor_email: actor,
    p_project_id: project, p_expected_submission_updated_at: version,
  });
  if (error) {
    const status = { PT404: 404, PT409: 409, PT422: 422 }[error.code ?? ""];
    if (status) throw new SpotConversionError(status, error.message || "spot_conversion_rejected");
    // A missing migration or transport failure is not permission to recreate the quote.
    throw new SpotConversionError(503, "spot_conversion_unavailable");
  }
  if (!data) throw new SpotConversionError(503, "spot_conversion_unavailable");
  return data;
}

/** Durable intake links; notes are only a legacy presentation aid. */
export async function listSpotRequestQuotes(client: { from: (table: string) => any }, workspace: Workspace, input: Row) {
  if (!workspace.owner_email || !workspace.organization_id) throw new SpotConversionError(403, "spot_conversion_forbidden");
  const ids = input.project_ids;
  if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    throw new SpotConversionError(400, "spot_conversion_invalid_input");
  }
  if (!ids.length) return { rows: [] };
  const receipts = await client.from("quotedesk_spot_conversions")
    .select("source_project_id,quote_id,original_lane_count,submission_updated_at")
    .eq("owner_email", workspace.owner_email).in("source_project_id", [...new Set(ids)]).limit(100);
  if (receipts.error) throw new SpotConversionError(503, "spot_conversion_unavailable");
  if (!receipts.data?.length) return { rows: [] };
  const quotes = await client.from("quotedesk_quotes").select("id,folio")
    .eq("owner_email", workspace.owner_email).in("id", receipts.data.map((r: Row) => r.quote_id)).limit(100);
  if (quotes.error) throw new SpotConversionError(503, "spot_conversion_unavailable");
  const byId = new Map<string, Row>((quotes.data || []).map((q: Row) => [String(q.id), q]));
  if (receipts.data.some((r: Row) => !byId.has(String(r.quote_id)))) throw new SpotConversionError(409, "spot_conversion_link_conflict");
  return { rows: receipts.data.map((r: Row) => ({ source_project_id: r.source_project_id,
    quote: byId.get(String(r.quote_id)), lane_count: r.original_lane_count, submission_updated_at: r.submission_updated_at })) };
}
