import { IdentityContractError } from "../_shared/identity-contract.mjs";

export const SERVICE_DESK_ORIGIN = "https://servicedesk-auth-preview-elandopando8892s-projects.vercel.app";
export const SHIPMENT_CONTEXT_FIELDS = [
  "event_id", "event_type", "occurred_at", "rfx_event_id", "rfx_reference",
  "rfx_lane_id", "instruction_letter_id", "instruction_letter_revision",
  "execution_receipt_id", "fleet_rocket_load_number", "target_system", "status",
  "customer_name", "origin", "destination", "updated_at"
] as const;

type Row = Record<string, unknown>;
type Principal = { organization_id: string | null; owner_user_id: string | null };
type RpcClient = { rpc: (name: string, args: Row) => Promise<{ data: unknown; error: unknown }> };
type Dependencies<T extends RpcClient> = {
  getClient: () => T;
  authenticate: (request: Request) => Promise<Row>;
  resolveUser: (client: T, claims: Row, options: { persistLegacyIdentity: boolean }) => Promise<Principal>;
};
type SearchInput = { search: true; eventId: null; query: string; limit: number; cursor: unknown };
type DetailInput = { search: false; eventId: string; query: ""; limit: 1; cursor: null };
type ContextInput = SearchInput | DetailInput;

class ContextError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const invalid = (): never => { throw new ContextError(400, "INVALID_CONTEXT_REQUEST"); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return (value as string).toLowerCase();
}

async function scopeHash(organization: string, subject: string, query: string) {
  const bytes = new TextEncoder().encode(JSON.stringify([organization, subject, query]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function cursorEncode(occurredAt: string, id: string, scope: string) {
  return btoa(JSON.stringify({ v: 1, occurred_at: occurredAt, id, scope }))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function cursorDecode(value: unknown, scope: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) invalid();
  try {
    const encoded = value as string;
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded));
    if (Object.keys(decoded).sort().join() !== "id,occurred_at,scope,v" || decoded.v !== 1 || decoded.scope !== scope) invalid();
    if (typeof decoded.occurred_at !== "string" || !ISO.test(decoded.occurred_at) || !Number.isFinite(Date.parse(decoded.occurred_at))) invalid();
    return { occurredAt: decoded.occurred_at, id: uuid(decoded.id) };
  } catch { invalid(); }
}

function parseInput(body: Row): ContextInput {
  const search = body.action === "search_shipment_creation_events";
  const allowed = search ? ["action", "query", "limit", "cursor"] : ["action", "event_id"];
  if (Object.keys(body).some(key => !allowed.includes(key))) invalid();
  if (!search && body.action !== "get_shipment_creation_event") invalid();
  if (!search) return { search: false, eventId: uuid(body.event_id), query: "", limit: 1, cursor: null };
  if (body.query !== undefined && typeof body.query !== "string") invalid();
  const query = (body.query as string | undefined) ?? "";
  if (query.length > 200 || /[\u0000-\u001f\u007f]/.test(query)) invalid();
  const requestedLimit = body.limit === undefined ? 25 : body.limit;
  if (typeof requestedLimit !== "number" || !Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 25) invalid();
  return { search: true, eventId: null, query: query.trim(), limit: requestedLimit as number, cursor: body.cursor };
}

function projection(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ContextError(503, "CONTEXT_UNAVAILABLE");
  const row = value as Row;
  if (Object.keys(row).some(key => !SHIPMENT_CONTEXT_FIELDS.includes(key as typeof SHIPMENT_CONTEXT_FIELDS[number])))
    throw new ContextError(503, "CONTEXT_UNAVAILABLE");
  const text = (key: string, required = false) => {
    const value = row[key];
    if (value === null || value === undefined) {
      if (required) throw new ContextError(503, "CONTEXT_UNAVAILABLE");
      return null;
    }
    if (typeof value !== "string") throw new ContextError(503, "CONTEXT_UNAVAILABLE");
    return value;
  };
  const result = {
    event_id: uuid(row.event_id),
    event_type: text("event_type", true) as string, occurred_at: text("occurred_at", true) as string,
    rfx_event_id: uuid(row.rfx_event_id), rfx_reference: text("rfx_reference"),
    rfx_lane_id: row.rfx_lane_id === null || row.rfx_lane_id === undefined ? null : uuid(row.rfx_lane_id),
    instruction_letter_id: text("instruction_letter_id", true) as string,
    instruction_letter_revision: row.instruction_letter_revision,
    execution_receipt_id: text("execution_receipt_id", true) as string,
    fleet_rocket_load_number: text("fleet_rocket_load_number", true) as string,
    target_system: text("target_system", true) as string, status: text("status", true) as string,
    customer_name: text("customer_name"), origin: text("origin"), destination: text("destination"),
    updated_at: text("updated_at", true) as string
  };
  if (result.event_type !== "shipment.created" || result.target_system !== "fleet_rocket" || result.status !== "confirmed"
    || typeof result.instruction_letter_revision !== "number" || !Number.isInteger(result.instruction_letter_revision)
    || result.instruction_letter_revision < 1 || !ISO.test(result.occurred_at || "") || !ISO.test(result.updated_at || ""))
    throw new ContextError(503, "CONTEXT_UNAVAILABLE");
  return result;
}

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  return origin === SERVICE_DESK_ORIGIN ? {
    "Access-Control-Allow-Origin": SERVICE_DESK_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  } : { "Vary": "Origin" };
}

export function createShipmentContextHandler<T extends RpcClient>(dependencies: Dependencies<T>) {
  return async (request: Request) => {
    const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store, max-age=0", ...cors(request) }
    });
    try {
      const origin = request.headers.get("Origin");
      if (origin && origin !== SERVICE_DESK_ORIGIN) throw new ContextError(403, "ORIGIN_DENIED");
      if (request.method === "OPTIONS") return reply({});
      if (request.method !== "POST") throw new ContextError(405, "METHOD_NOT_ALLOWED");
      const raw = await request.text();
      if (raw.length > 4096) invalid();
      let body: Row = {};
      try { body = JSON.parse(raw); } catch { invalid(); }
      if (!body || typeof body !== "object" || Array.isArray(body)) invalid();
      const input = parseInput(body);
      let claims: Row;
      try { claims = await dependencies.authenticate(request); }
      catch { throw new ContextError(401, "CONTEXT_AUTH_REQUIRED"); }
      const client = dependencies.getClient();
      let principal: Principal;
      try { principal = await dependencies.resolveUser(client, claims, { persistLegacyIdentity: false }); }
      catch (error) {
        if (error instanceof IdentityContractError) throw new ContextError(403, "CONTEXT_FORBIDDEN");
        throw new ContextError(503, "CONTEXT_UNAVAILABLE");
      }
      const organization = principal.organization_id;
      const subject = principal.owner_user_id;
      if (!organization || !subject) throw new ContextError(403, "CONTEXT_FORBIDDEN");
      const scope = await scopeHash(organization, subject, input.query);
      if (input.search) {
        const after = cursorDecode(input.cursor, scope);
        const result = await client.rpc("rateware_search_shipment_creation_events", {
          p_organization_id: organization, p_query: input.query,
          p_after_occurred_at: after?.occurredAt ?? null, p_after_id: after?.id ?? null,
          p_limit: input.limit + 1
        });
        if (result.error || !Array.isArray(result.data)) throw new ContextError(503, "CONTEXT_UNAVAILABLE");
        const visible = result.data.slice(0, input.limit).map(projection);
        const last = visible.at(-1);
        return reply({ rows: visible, next_cursor: result.data.length > input.limit && last
          ? cursorEncode(last.occurred_at as string, last.event_id, scope) : null,
        fetched_at: new Date().toISOString() });
      }
      const result = await client.rpc("rateware_get_shipment_creation_event", {
        p_organization_id: organization, p_event_id: input.eventId
      });
      if (result.error || !Array.isArray(result.data)) throw new ContextError(503, "CONTEXT_UNAVAILABLE");
      if (result.data.length === 0) throw new ContextError(404, "CONTEXT_NOT_AVAILABLE");
      if (result.data.length !== 1) throw new ContextError(503, "CONTEXT_UNAVAILABLE");
      return reply({ row: projection(result.data[0]), fetched_at: new Date().toISOString() });
    } catch (error) {
      const safe = error instanceof ContextError ? error : new ContextError(503, "CONTEXT_UNAVAILABLE");
      return reply({ error: safe.code }, safe.status);
    }
  };
}
