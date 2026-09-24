// QuoteDesk API (Bidware): a tracker of freight quotes. Each quote belongs to a
// shipper and has one or more routes; each route carries its inputs, miles,
// cost components, accessorials and markup, and the server derives base cost,
// all-in and margin with ./calc.mjs. A quote can be sent to the Bid Room: the
// client creates the event through rateware-api and links it here.
//
// Identity and CORS come from the shared rateware modules so a quote is scoped
// to exactly the same workspace (owner_email) as shippers and RFx events.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";
import { requireRatewareUser } from "../_shared/auth.ts";
import { resolveRuntimeWorkspaceUser, runtimeIdentityStatus } from "../_shared/runtime-identity.ts";
import { GMAIL_ALLOWED_SENDER, GmailSendError, gmailAccessToken, gmailRawMessage, sendGmailRaw, suppressedEmails } from "../_shared/gmail-send.ts";
import { isEmail, renderQuoteEmail } from "./email.mjs";
import { metersToMiles, placeQuery, queryKey } from "./routes.mjs";
import {
  ACCESSORIAL_UNITS,
  COST_SOURCES,
  QUOTE_CHANNELS,
  QUOTE_CURRENCIES,
  QUOTE_STATUSES,
  QUOTE_TYPES,
  QuoteInputError,
  canTransition,
  computeLane,
  folioFor,
  legRouteKeys,
  summarizeLanes,
  toNumber
} from "./calc.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIRST_FOLIO = 1001;
// Optional: legs missing from the mileage catalog are measured with Google Routes.
const GOOGLE_MAPS_API_KEY = (Deno.env.get("GOOGLE_MAPS_API_KEY") || "").trim();
const EMAIL_CONTRACT = "quotedesk.gmail-send.v1";
const EMAIL_SENDER_NAME = "MARKSMAN";
const LANE_LIMIT = 50;

// Starting catalog for a workspace that has none yet (values from the approved
// Figma "Adicionales + markup" modal; every value is editable in the app).
const DEFAULT_ACCESSORIALS = [
  { code: "detention_origin", label: "Detención en origen", unit: "hour", default_rate: 45 },
  { code: "detention_destination", label: "Detención en destino", unit: "hour", default_rate: 45 },
  { code: "layover", label: "Layover", unit: "event", default_rate: 60 },
  { code: "tonu", label: "TONU / cancelación", unit: "event", default_rate: 250 },
  { code: "redelivery", label: "Redelivery", unit: "event", default_rate: 120 },
  { code: "escort", label: "Escolta", unit: "trip", default_rate: 180 },
  { code: "storage", label: "Estadía / almacenaje", unit: "day", default_rate: 75 }
];

// Route inputs, homologated with rfx_lanes so a quote can become a Bid Room event.
const LANE_TEXT_FIELDS = [
  "origin", "origin_city", "origin_state", "origin_country", "origin_postal_code", "origin_market", "origin_region",
  "destination", "destination_city", "destination_state", "destination_country", "destination_postal_code",
  "destination_market", "destination_region",
  "equipment", "trailer", "config", "operation", "service", "border_crossing", "crossing_model", "miles_source", "notes"
];

type Workspace = { owner_user_id: string | null; owner_email: string; organization_id: string | null };
type Row = Record<string, unknown>;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function db() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("QuoteDesk is missing its database configuration.");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

type Db = ReturnType<typeof db>;

function text(value: unknown, max = 500): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim().replace(/\s+/g, " ");
  return cleaned ? cleaned.slice(0, max) : null;
}

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function uuid(value: unknown, label: string): string {
  const id = text(value, 80);
  if (!id || !UUID_PATTERN.test(id)) throw new HttpError(400, `${label} no es válido.`);
  return id.toLowerCase();
}

function optionalUuid(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return uuid(value, label);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const cleaned = text(value, 40)?.toLowerCase();
  return (allowed as readonly string[]).includes(cleaned || "") ? cleaned as T : fallback;
}

function isoDate(value: unknown): string | null {
  const cleaned = text(value, 40);
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match || Number.isNaN(Date.parse(match[1]))) throw new HttpError(400, "La fecha no es válida.");
  return match[1];
}

function nowIso() {
  return new Date().toISOString();
}

function owned(row: Row, workspace: Workspace) {
  return {
    ...row,
    owner_user_id: workspace.owner_user_id,
    owner_email: workspace.owner_email,
    organization_id: workspace.organization_id
  };
}

async function audit(supabase: Db, workspace: Workspace, action: string, entityType: string, entityId: string, summary: string, metadata: Row = {}) {
  // Audit must never fail the user's action; a missing entry is logged instead.
  const result = await supabase.from("saas_audit_log").insert(owned({
    actor_email: workspace.owner_email,
    action,
    entity_type: entityType,
    entity_id: entityId,
    summary,
    metadata: { source: "quotedesk-api", ...metadata }
  }, workspace));
  if (result.error) console.warn("QUOTEDESK_AUDIT_FAILED", { action, entityId, error: result.error.message });
}

async function resolveWorkspace(request: Request, supabase: Db): Promise<Workspace> {
  let claims: Row;
  try {
    claims = await requireRatewareUser(request) as Row;
  } catch (error) {
    throw new HttpError(401, error instanceof Error ? error.message : "Authentication required.");
  }
  try {
    const user = await resolveRuntimeWorkspaceUser(supabase, claims, { persistLegacyIdentity: false }) as Row;
    const ownerEmail = text(user.owner_email, 320);
    const organizationId = text(user.organization_id, 200);
    if (!ownerEmail || !organizationId) throw new HttpError(403, "QuoteDesk requires an organization workspace.");
    return { owner_user_id: text(user.owner_user_id, 200), owner_email: ownerEmail, organization_id: organizationId };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(runtimeIdentityStatus(error) === 403 ? 403 : 401, "Workspace could not be resolved.");
  }
}

// ---------------------------------------------------------------- context

async function accessorialCatalog(supabase: Db, workspace: Workspace) {
  const load = () => supabase.from("quotedesk_accessorial_catalog").select("*")
    .eq("owner_email", workspace.owner_email)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  let result = await load();
  if (result.error) throw result.error;
  if (!(result.data || []).length) {
    const seed = DEFAULT_ACCESSORIALS.map((item, index) => owned({ ...item, currency: "USD", sort_order: (index + 1) * 10 }, workspace));
    const insert = await supabase.from("quotedesk_accessorial_catalog")
      .upsert(seed, { onConflict: "owner_email,code", ignoreDuplicates: true });
    if (insert.error) throw insert.error;
    result = await load();
    if (result.error) throw result.error;
  }
  return result.data || [];
}

async function latestFx(supabase: Db) {
  const result = await supabase.from("rateware_fx_spot_rates").select("rate,rate_date,source")
    .eq("currency_pair", "USD/MXN")
    .lte("rate_date", nowIso().slice(0, 10))
    .order("rate_date", { ascending: false })
    .limit(1);
  if (result.error) throw result.error;
  const row = (result.data || [])[0] as Row | undefined;
  return row ? { usd_mxn: toNumber(row.rate), rate_date: row.rate_date, source: row.source } : null;
}

async function fuelIndex(supabase: Db) {
  const [regions, trend] = await Promise.all([
    supabase.from("rateware_fuel_regions").select("state_code,fuel_region").eq("active", true),
    supabase.from("rateware_fsc_trend").select("fuel_region,index_date,fsc_per_mile")
      .eq("active", true)
      .order("index_date", { ascending: false })
      .limit(400)
  ]);
  if (regions.error) throw regions.error;
  if (trend.error) throw trend.error;
  const latest = new Map<string, Row>();
  for (const row of (trend.data || []) as Row[]) {
    const region = text(row.fuel_region, 80);
    if (region && !latest.has(region)) latest.set(region, row);
  }
  const stateRegion: Record<string, string> = {};
  for (const row of (regions.data || []) as Row[]) {
    const state = text(row.state_code, 10)?.toUpperCase();
    const region = text(row.fuel_region, 80);
    if (state && region) stateRegion[state] = region;
  }
  return {
    state_region: stateRegion,
    regions: [...latest.values()].map((row) => ({
      region: row.fuel_region,
      fsc_per_mile: toNumber(row.fsc_per_mile),
      index_date: row.index_date
    }))
  };
}

async function borderCrossings(supabase: Db) {
  const result = await supabase.from("border_crossing_pairs")
    .select("crossing_name,mx_city,mx_state,us_city,us_state,default_rank")
    .eq("active", true)
    .order("default_rank", { ascending: true })
    .limit(100);
  if (result.error) throw result.error;
  return result.data || [];
}

async function getContext(supabase: Db, workspace: Workspace) {
  const [catalog, fx, fuel, crossings] = await Promise.all([
    accessorialCatalog(supabase, workspace),
    latestFx(supabase),
    fuelIndex(supabase),
    borderCrossings(supabase)
  ]);
  const mailbox = await supabase.from("gmail_mailbox_connections").select("status,scopes")
    .eq("owner_email", workspace.owner_email).eq("mailbox_email", GMAIL_ALLOWED_SENDER).maybeSingle();
  if (mailbox.error) throw mailbox.error;
  const scopes = Array.isArray(mailbox.data?.scopes) ? mailbox.data.scopes.map(String) : [];
  return {
    accessorial_catalog: catalog,
    fx,
    fuel,
    border_crossings: crossings,
    google_routes_enabled: Boolean(GOOGLE_MAPS_API_KEY),
    email: {
      sender: GMAIL_ALLOWED_SENDER,
      connected: mailbox.data?.status === "connected" && scopes.includes("https://www.googleapis.com/auth/gmail.send")
    }
  };
}

// ---------------------------------------------------------------- quotes

async function requireQuote(supabase: Db, workspace: Workspace, id: unknown) {
  const quoteId = uuid(id, "La cotización");
  const result = await supabase.from("quotedesk_quotes").select("*")
    .eq("owner_email", workspace.owner_email).eq("id", quoteId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(404, "No encontramos esa cotización.");
  return result.data as Row;
}

async function quoteLanes(supabase: Db, workspace: Workspace, quoteIds: string[]) {
  if (!quoteIds.length) return [] as Row[];
  const rows: Row[] = [];
  for (let index = 0; index < quoteIds.length; index += 100) {
    const result = await supabase.from("quotedesk_quote_lanes").select("*")
      .eq("owner_email", workspace.owner_email)
      .in("quote_id", quoteIds.slice(index, index + 100))
      .order("lane_number", { ascending: true });
    if (result.error) throw result.error;
    rows.push(...(result.data || []) as Row[]);
  }
  return rows;
}

async function requireShipper(supabase: Db, workspace: Workspace, id: unknown) {
  const shipperId = uuid(id, "El shipper");
  const result = await supabase.from("shippers").select("id,shipper_name,legal_name")
    .eq("owner_email", workspace.owner_email).eq("id", shipperId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(400, "Ese shipper no está en tu CRM.");
  return result.data as Row;
}

async function requireOpportunity(supabase: Db, workspace: Workspace, id: string, shipperId: string | null) {
  const result = await supabase.from("shipper_opportunities").select("id,shipper_id")
    .eq("owner_email", workspace.owner_email).eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(400, "Esa oportunidad no está en tu CRM.");
  if (shipperId && text(result.data.shipper_id) !== shipperId) {
    throw new HttpError(400, "La oportunidad pertenece a otro shipper.");
  }
}

function quoteHeaderPatch(input: Row, partial: boolean) {
  const patch: Row = {};
  const has = (key: string) => !partial || Object.prototype.hasOwnProperty.call(input, key);
  if (has("title")) patch.title = text(input.title, 200);
  if (has("quote_type")) patch.quote_type = oneOf(input.quote_type, QUOTE_TYPES, "spot");
  if (has("channel")) patch.channel = oneOf(input.channel, QUOTE_CHANNELS, "email");
  if (has("requested_by")) patch.requested_by = text(input.requested_by, 200);
  if (has("assigned_to_email")) patch.assigned_to_email = text(input.assigned_to_email, 320)?.toLowerCase() ?? null;
  if (has("currency")) {
    const currency = text(input.currency, 10)?.toUpperCase();
    patch.currency = (QUOTE_CURRENCIES as readonly string[]).includes(currency || "") ? currency : "USD";
  }
  if (has("valid_until")) patch.valid_until = isoDate(input.valid_until);
  if (has("notes")) patch.notes = text(input.notes, 4000);
  return patch;
}

async function nextFolioNumber(supabase: Db, workspace: Workspace) {
  const result = await supabase.from("quotedesk_quotes").select("folio_number")
    .eq("owner_email", workspace.owner_email)
    .order("folio_number", { ascending: false })
    .limit(1);
  if (result.error) throw result.error;
  const last = toNumber((result.data || [])[0]?.folio_number);
  return last && last >= FIRST_FOLIO ? last + 1 : FIRST_FOLIO;
}

async function createQuote(supabase: Db, workspace: Workspace, input: Row) {
  const shipper = await requireShipper(supabase, workspace, input.shipper_id);
  const shipperId = text(shipper.id) as string;
  const opportunityId = optionalUuid(input.shipper_opportunity_id, "La oportunidad");
  if (opportunityId) await requireOpportunity(supabase, workspace, opportunityId, shipperId);
  const fx = await latestFx(supabase);
  const header = quoteHeaderPatch(input, false);

  // Folios are sequential per workspace; a concurrent create retries on the
  // unique (owner_email, folio_number) constraint instead of duplicating.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const folioNumber = await nextFolioNumber(supabase, workspace) + attempt;
    const insert = await supabase.from("quotedesk_quotes").insert(owned({
      ...header,
      folio_number: folioNumber,
      folio: folioFor(folioNumber),
      shipper_id: shipperId,
      shipper_name: text(shipper.shipper_name, 300) || text(shipper.legal_name, 300),
      shipper_opportunity_id: opportunityId,
      fx_usd_mxn: fx?.usd_mxn ?? null,
      fx_rate_date: fx?.rate_date ?? null,
      status: "new"
    }, workspace)).select().single();
    if (!insert.error) {
      await audit(supabase, workspace, "quotedesk_quote_created", "quotedesk_quote", String(insert.data.id),
        `Created quote ${insert.data.folio} for ${insert.data.shipper_name || "shipper"}.`, { shipper_id: shipperId });
      return insert.data as Row;
    }
    if (insert.error.code !== "23505") throw insert.error;
  }
  throw new HttpError(409, "No pudimos asignar un folio; intenta de nuevo.");
}

async function updateQuote(supabase: Db, workspace: Workspace, id: unknown, input: Row) {
  const quote = await requireQuote(supabase, workspace, id);
  const patch = quoteHeaderPatch(input, true);
  if (Object.prototype.hasOwnProperty.call(input, "shipper_id")) {
    const shipper = await requireShipper(supabase, workspace, input.shipper_id);
    patch.shipper_id = shipper.id;
    patch.shipper_name = text(shipper.shipper_name, 300) || text(shipper.legal_name, 300);
  }
  if (Object.prototype.hasOwnProperty.call(input, "shipper_opportunity_id")) {
    const opportunityId = optionalUuid(input.shipper_opportunity_id, "La oportunidad");
    if (opportunityId) await requireOpportunity(supabase, workspace, opportunityId, text(patch.shipper_id ?? quote.shipper_id));
    patch.shipper_opportunity_id = opportunityId;
  }
  if (!Object.keys(patch).length) return quote;
  if (patch.currency && patch.currency !== quote.currency) {
    const priced = await quoteLanes(supabase, workspace, [String(quote.id)]);
    if (priced.some((lane) => toNumber(lane.base_cost) !== null || toNumber(lane.accessorials_total))) {
      throw new HttpError(400, "No se puede cambiar la moneda cuando ya hay costos capturados; ajusta primero los montos.");
    }
  }
  const result = await supabase.from("quotedesk_quotes").update({ ...patch, updated_at: nowIso() })
    .eq("owner_email", workspace.owner_email).eq("id", quote.id).select().single();
  if (result.error) throw result.error;
  return result.data as Row;
}

async function setQuoteStatus(supabase: Db, workspace: Workspace, id: unknown, statusInput: unknown, reason: unknown) {
  const quote = await requireQuote(supabase, workspace, id);
  const from = String(quote.status);
  const to = text(statusInput, 40)?.toLowerCase() || "";
  if (!(QUOTE_STATUSES as readonly string[]).includes(to)) throw new HttpError(400, "Ese estado no existe.");
  if (!canTransition(from, to)) throw new HttpError(400, `No se puede pasar de ${from} a ${to}.`);
  if (to === "bid_room" && !quote.rfx_event_id) {
    throw new HttpError(400, "Para marcarla en Bid Room primero se crea el evento desde la cotización.");
  }
  if (to === "quoted") {
    const lanes = await quoteLanes(supabase, workspace, [String(quote.id)]);
    if (!lanes.length || lanes.some((lane) => toNumber(lane.all_in_rate) === null)) {
      throw new HttpError(400, "Para cotizar, cada ruta necesita su tarifa all-in.");
    }
  }
  if (from === to) return quote;
  const now = nowIso();
  const patch: Row = { status: to, status_changed_at: now, updated_at: now };
  if (to === "quoted" && !quote.quoted_at) patch.quoted_at = now;
  if (["won", "lost", "expired"].includes(to)) {
    patch.closed_at = now;
    patch.outcome_reason = text(reason, 500);
  } else if (["won", "lost", "expired"].includes(from)) {
    patch.closed_at = null;
    patch.outcome_reason = null;
  }
  const result = await supabase.from("quotedesk_quotes").update(patch)
    .eq("owner_email", workspace.owner_email).eq("id", quote.id).eq("status", from).select().maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(409, "La cotización cambió mientras tanto; recarga e intenta de nuevo.");
  await audit(supabase, workspace, "quotedesk_quote_status", "quotedesk_quote", String(quote.id),
    `Quote ${quote.folio}: ${from} → ${to}.`, { from, to, reason: patch.outcome_reason ?? null });
  return result.data as Row;
}

async function linkedEvent(supabase: Db, workspace: Workspace, eventId: unknown) {
  const id = text(eventId, 80);
  if (!id) return null;
  const result = await supabase.from("rfx_events").select("id,rfx_id,name,status,event_type,due_date")
    .eq("owner_email", workspace.owner_email).eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  return result.data as Row | null;
}

async function laneAwards(supabase: Db, rfxLaneIds: string[]) {
  const awards: Record<string, Row> = {};
  if (!rfxLaneIds.length) return awards;
  const result = await supabase.from("rfx_lane_vendors")
    .select("rfx_lane_id,vendor_id,bid_rate,currency,award_role,awarded_at")
    .in("rfx_lane_id", rfxLaneIds)
    .eq("award_role", "primary");
  if (result.error) throw result.error;
  const vendorIds = [...new Set(((result.data || []) as Row[]).map((row) => text(row.vendor_id)).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (vendorIds.length) {
    const vendors = await supabase.from("vendors").select("id,vendor_name").in("id", vendorIds);
    if (vendors.error) throw vendors.error;
    for (const vendor of (vendors.data || []) as Row[]) names.set(String(vendor.id), String(vendor.vendor_name || ""));
  }
  for (const row of (result.data || []) as Row[]) {
    const laneId = String(row.rfx_lane_id);
    if (toNumber(row.bid_rate) === null) continue;
    awards[laneId] = {
      bid_rate: toNumber(row.bid_rate),
      currency: row.currency || "USD",
      vendor_name: names.get(String(row.vendor_id)) || null,
      awarded_at: row.awarded_at
    };
  }
  return awards;
}

async function getQuote(supabase: Db, workspace: Workspace, id: unknown) {
  const quote = await requireQuote(supabase, workspace, id);
  const lanes = await quoteLanes(supabase, workspace, [String(quote.id)]);
  const rfxLaneIds = lanes.map((lane) => text(lane.rfx_lane_id)).filter(Boolean) as string[];
  const [event, awards] = await Promise.all([
    linkedEvent(supabase, workspace, quote.rfx_event_id),
    laneAwards(supabase, rfxLaneIds)
  ]);
  return { quote, lanes, summary: summarizeLanes(lanes), event, awards };
}

async function listQuotes(supabase: Db, workspace: Workspace, input: Row) {
  const limit = Math.min(Math.max(Number(input.limit) || 200, 1), 500);
  const status = text(input.status, 40)?.toLowerCase();
  let query = supabase.from("quotedesk_quotes").select("*")
    .eq("owner_email", workspace.owner_email)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (status && (QUOTE_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  else if (input.include_archived !== true) query = query.neq("status", "archived");
  const search = text(input.search, 100)?.replace(/[(),%_*]/g, " ").trim();
  if (search) query = query.or(`folio.ilike.%${search}%,title.ilike.%${search}%,shipper_name.ilike.%${search}%`);
  const result = await query;
  if (result.error) throw result.error;
  const quotes = (result.data || []) as Row[];
  const lanes = await quoteLanes(supabase, workspace, quotes.map((quote) => String(quote.id)));
  const byQuote = new Map<string, Row[]>();
  for (const lane of lanes) {
    const key = String(lane.quote_id);
    byQuote.set(key, [...(byQuote.get(key) || []), lane]);
  }
  const rows: Row[] = quotes.map((quote) => {
    const quoteLaneRows = byQuote.get(String(quote.id)) || [];
    const first = quoteLaneRows[0];
    return {
      ...quote,
      first_lane: first ? { origin: first.origin, destination: first.destination, equipment: first.equipment } : null,
      summary: summarizeLanes(quoteLaneRows)
    };
  });

  // KPIs over every active quote in the workspace, not just this page.
  const kpiResult = await supabase.from("quotedesk_quotes").select("id,status")
    .eq("owner_email", workspace.owner_email).neq("status", "archived").limit(5000);
  if (kpiResult.error) throw kpiResult.error;
  const counts: Record<string, number> = {};
  for (const row of (kpiResult.data || []) as Row[]) counts[String(row.status)] = (counts[String(row.status)] || 0) + 1;
  const quotedRows = rows.filter((row) => ["quoted", "won"].includes(String(row.status)));
  const margins = quotedRows.map((row) => toNumber((row.summary as Row).margin_pct)).filter((value): value is number => value !== null);
  return {
    rows,
    kpis: {
      counts,
      avg_margin_pct: margins.length ? Math.round(margins.reduce((sum, value) => sum + value, 0) / margins.length * 100) / 100 : null
    }
  };
}

// ---------------------------------------------------------------- lanes

function laneInputs(input: Row) {
  const patch: Row = {};
  for (const field of LANE_TEXT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) patch[field] = text(input[field], field === "notes" ? 2000 : 300);
  }
  for (const [field, label] of [["weight_lb", "El peso"], ["weekly_volume", "El volumen"], ["mx_miles", "Las millas MX"], ["us_miles", "Las millas US"], ["fsc_per_mile", "El FSC por milla"]] as const) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    const value = toNumber(input[field]);
    if (value !== null && value < 0) throw new QuoteInputError(`${label} no puede ser negativo.`);
    patch[field] = value;
  }
  if (Object.prototype.hasOwnProperty.call(input, "fsc_rate_date")) patch.fsc_rate_date = isoDate(input.fsc_rate_date);
  if (Object.prototype.hasOwnProperty.call(input, "cost_source")) {
    patch.cost_source = oneOf(input.cost_source, COST_SOURCES, "manual");
  }
  for (const country of ["origin_country", "destination_country"]) {
    if (typeof patch[country] === "string") patch[country] = String(patch[country]).toUpperCase().slice(0, 10);
  }
  return patch;
}

const PRICING_FIELDS = ["linehaul_mx", "linehaul_us", "fuel_amount", "border_amount", "carrier_rate", "accessorials", "markup_mode", "markup_value"];

function pricedLane(existing: Row, input: Row) {
  const merged: Row = { ...existing };
  for (const field of PRICING_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) merged[field] = input[field];
  }
  return computeLane(merged);
}

async function saveQuoteLane(supabase: Db, workspace: Workspace, quoteIdInput: unknown, laneInput: Row) {
  const quote = await requireQuote(supabase, workspace, quoteIdInput);
  if (["won", "lost", "archived"].includes(String(quote.status))) {
    throw new HttpError(400, "Esta cotización ya está cerrada; reábrela para editar sus rutas.");
  }
  const laneId = optionalUuid(laneInput.id, "La ruta");
  let existing: Row = {};
  if (laneId) {
    const result = await supabase.from("quotedesk_quote_lanes").select("*")
      .eq("owner_email", workspace.owner_email).eq("quote_id", quote.id).eq("id", laneId).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new HttpError(404, "No encontramos esa ruta.");
    existing = result.data as Row;
  }
  const inputs = laneInputs(laneInput);
  const pricing = pricedLane(existing, laneInput);
  const now = nowIso();
  let saved: Row;
  if (laneId) {
    const update = await supabase.from("quotedesk_quote_lanes").update({ ...inputs, ...pricing, updated_at: now })
      .eq("owner_email", workspace.owner_email).eq("id", laneId).select().single();
    if (update.error) throw update.error;
    saved = update.data as Row;
  } else {
    const lanes = await quoteLanes(supabase, workspace, [String(quote.id)]);
    if (lanes.length >= LANE_LIMIT) throw new HttpError(400, `Una cotización admite hasta ${LANE_LIMIT} rutas.`);
    const laneNumber = lanes.reduce((max, lane) => Math.max(max, Number(lane.lane_number) || 0), 0) + 1;
    const insert = await supabase.from("quotedesk_quote_lanes").insert(owned({
      ...inputs,
      ...pricing,
      quote_id: quote.id,
      lane_number: laneNumber
    }, workspace)).select().single();
    if (insert.error) throw insert.error;
    saved = insert.data as Row;
  }

  // Capturing a cost moves a new quote into "estimating" on its own.
  let currentQuote = quote;
  if (quote.status === "new" && (toNumber(saved.base_cost) !== null || toNumber(saved.accessorials_total))) {
    const moved = await supabase.from("quotedesk_quotes")
      .update({ status: "estimating", status_changed_at: now, updated_at: now })
      .eq("owner_email", workspace.owner_email).eq("id", quote.id).eq("status", "new").select().maybeSingle();
    if (moved.error) throw moved.error;
    if (moved.data) currentQuote = moved.data as Row;
  } else {
    const touched = await supabase.from("quotedesk_quotes").update({ updated_at: now })
      .eq("owner_email", workspace.owner_email).eq("id", quote.id).select().single();
    if (touched.error) throw touched.error;
    currentQuote = touched.data as Row;
  }
  const lanes = await quoteLanes(supabase, workspace, [String(quote.id)]);
  return { lane: saved, quote: currentQuote, lanes, summary: summarizeLanes(lanes) };
}

async function deleteQuoteLane(supabase: Db, workspace: Workspace, laneIdInput: unknown) {
  const laneId = uuid(laneIdInput, "La ruta");
  const lane = await supabase.from("quotedesk_quote_lanes").select("id,quote_id,rfx_lane_id")
    .eq("owner_email", workspace.owner_email).eq("id", laneId).maybeSingle();
  if (lane.error) throw lane.error;
  if (!lane.data) throw new HttpError(404, "No encontramos esa ruta.");
  if (lane.data.rfx_lane_id) throw new HttpError(400, "Esta ruta ya está en el Bid Room; no se puede quitar de la cotización.");
  const quote = await requireQuote(supabase, workspace, lane.data.quote_id);
  if (["won", "lost", "archived"].includes(String(quote.status))) {
    throw new HttpError(400, "Esta cotización ya está cerrada; reábrela para editar sus rutas.");
  }
  const removed = await supabase.from("quotedesk_quote_lanes").delete()
    .eq("owner_email", workspace.owner_email).eq("id", laneId);
  if (removed.error) throw removed.error;
  const lanes = await quoteLanes(supabase, workspace, [String(quote.id)]);
  return { removed: laneId, lanes, summary: summarizeLanes(lanes) };
}

// ---------------------------------------------------------------- miles

type Place = { country?: string; city?: string; state_code?: string; state_name?: string; market?: string; label?: string };

function place(input: unknown): Place {
  const row = record(input);
  return {
    country: text(row.country, 10)?.toUpperCase() || undefined,
    city: text(row.city, 120) || undefined,
    state_code: text(row.state_code, 20) || undefined,
    state_name: text(row.state_name, 80) || undefined,
    market: text(row.market, 120) || undefined,
    label: text(row.label, 200) || undefined
  };
}

async function locationFor(supabase: Db, country: string, city: string, stateCode: string | null) {
  let query = supabase.from("rateware_locations").select("city,state_code,state_name,market,country")
    .eq("active", true).eq("country", country).ilike("city", city).limit(10);
  if (stateCode) query = query.eq("state_code", stateCode);
  const result = await query;
  if (result.error) throw result.error;
  const rows = (result.data || []) as Row[];
  return (rows.find((row) => text(row.market)) || rows[0] || null) as Row | null;
}

async function mileageFor(supabase: Db, scope: "mx" | "us", from: Place, to: Place) {
  const keys = legRouteKeys(from, to);
  if (!keys.length) return null;
  const result = await supabase.from("rateware_lane_mileage").select("route_key,miles,km,source")
    .eq("active", true).eq("country_scope", scope).in("route_key", keys).limit(10);
  if (result.error) throw result.error;
  const rows = (result.data || []) as Row[];
  // Keep the caller's preference order (city+code first, then names, then markets).
  const ranked = keys.map((key) => rows.find((row) => row.route_key === key)).find(Boolean);
  return ranked ? { miles: toNumber(ranked.miles), km: toNumber(ranked.km), route_key: ranked.route_key, source: ranked.source } : null;
}

// Distance for a leg the catalog doesn't have: cached answer first, then Google
// Routes (DRIVE; Google has no truck profile in MX/US, highway distance is close).
async function googleLegMiles(supabase: Db, from: Place, to: Place): Promise<{ miles: number | null; error?: string } | null> {
  const originQuery = placeQuery(from);
  const destinationQuery = placeQuery(to);
  if (!originQuery || !destinationQuery) return null;
  const originKey = queryKey(originQuery);
  const destinationKey = queryKey(destinationQuery);
  const cached = await supabase.from("quotedesk_route_distances").select("miles")
    .eq("provider", "google_routes").eq("origin_key", originKey).eq("destination_key", destinationKey).maybeSingle();
  if (cached.error) throw cached.error;
  if (cached.data) return { miles: toNumber(cached.data.miles) };
  if (!GOOGLE_MAPS_API_KEY) return null;
  let response: Response;
  try {
    response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration"
      },
      body: JSON.stringify({
        origin: { address: originQuery },
        destination: { address: destinationQuery },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        languageCode: "es-MX",
        units: "IMPERIAL"
      })
    });
  } catch (error) {
    return { miles: null, error: `Google Routes no respondió: ${error instanceof Error ? error.message : String(error)}` };
  }
  const data = await response.json().catch(() => ({})) as Row;
  if (!response.ok) {
    const detail = text(record(data.error).message, 200) || `HTTP ${response.status}`;
    return { miles: null, error: `Google Routes: ${detail}` };
  }
  const route = record(Array.isArray(data.routes) ? data.routes[0] : null);
  const meters = toNumber(route.distanceMeters);
  const miles = metersToMiles(meters);
  if (meters === null || miles === null) return { miles: null, error: "Google Routes no encontró la ruta." };
  const seconds = toNumber(String(route.duration || "").replace(/s$/, ""));
  const now = nowIso();
  const stored = await supabase.from("quotedesk_route_distances").upsert({
    provider: "google_routes",
    origin_key: originKey,
    destination_key: destinationKey,
    origin_query: originQuery,
    destination_query: destinationQuery,
    meters,
    miles,
    duration_seconds: seconds === null ? null : Math.round(seconds),
    fetched_at: now,
    updated_at: now
  }, { onConflict: "provider,origin_key,destination_key" });
  if (stored.error) console.warn("QUOTEDESK_ROUTE_CACHE_FAILED", stored.error.message);
  return { miles };
}

// Saved routes keep only city + state code (MX) or market (US/CA); fill in what
// the mileage keys also use (MX state name, US market) from rateware_locations.
async function enrichPlace(supabase: Db, value: Place): Promise<Place> {
  if (!value.city || !value.country) return value;
  if (value.country === "MX" && value.state_name) return value;
  if (value.country !== "MX" && value.market) return value;
  const location = await locationFor(supabase, value.country, value.city, value.state_code || null);
  if (!location) return value;
  return {
    ...value,
    state_code: value.state_code || text(location.state_code) || undefined,
    state_name: value.state_name || text(location.state_name) || undefined,
    market: value.market || text(location.market) || undefined
  };
}

async function suggestLaneMiles(supabase: Db, input: Row) {
  const [origin, destination] = await Promise.all([
    enrichPlace(supabase, place(input.origin)),
    enrichPlace(supabase, place(input.destination))
  ]);
  const originMx = origin.country === "MX";
  const destinationMx = destination.country === "MX";
  const crossingName = text(input.border_crossing, 200);
  const legs: Row[] = [];

  let borderMx: Place | null = null;
  let borderUs: Place | null = null;
  if (originMx !== destinationMx) {
    const crossings = await borderCrossings(supabase) as Row[];
    const pair = crossings.find((row) => text(row.crossing_name) === crossingName) || crossings[0];
    if (!pair) return { mx_miles: null, us_miles: null, legs, complete: false, reason: "No hay cruces fronterizos en el catálogo." };
    const mxLocation = await locationFor(supabase, "MX", String(pair.mx_city), text(pair.mx_state));
    const usLocation = await locationFor(supabase, "US", String(pair.us_city), text(pair.us_state));
    borderMx = { country: "MX", city: String(pair.mx_city), state_code: text(pair.mx_state) || undefined, state_name: text(mxLocation?.state_name) || undefined };
    borderUs = { country: "US", city: String(pair.us_city), state_code: text(pair.us_state) || undefined, market: text(usLocation?.market) || undefined };
    legs.push({ scope: "border", crossing: pair.crossing_name });
  }

  let mxMiles: number | null = null;
  let usMiles: number | null = null;
  const addLeg = async (scope: "mx" | "us", from: Place, to: Place) => {
    const found = await mileageFor(supabase, scope, from, to);
    let miles = found?.miles ?? null;
    let provider: string | null = found ? "catalog" : null;
    let providerError: string | null = null;
    if (miles === null) {
      const google = await googleLegMiles(supabase, from, to);
      if (google?.miles !== null && google?.miles !== undefined) {
        miles = google.miles;
        provider = "google_routes";
      } else if (google?.error) {
        providerError = google.error;
      }
    }
    legs.push({
      scope,
      from: from.market || [from.city, from.state_code].filter(Boolean).join(", "),
      to: to.market || [to.city, to.state_code].filter(Boolean).join(", "),
      miles,
      route_key: found?.route_key ?? null,
      found: miles !== null,
      provider,
      provider_error: providerError
    });
    return miles;
  };

  if (originMx && destinationMx) {
    mxMiles = await addLeg("mx", origin, destination);
  } else if (!originMx && !destinationMx) {
    usMiles = await addLeg("us", origin, destination);
  } else if (originMx) {
    mxMiles = await addLeg("mx", origin, borderMx as Place);
    usMiles = await addLeg("us", borderUs as Place, destination);
  } else {
    usMiles = await addLeg("us", origin, borderUs as Place);
    mxMiles = await addLeg("mx", borderMx as Place, destination);
  }

  // US fuel surcharge per mile from the state where the US leg starts, as FCM does.
  let fuel: Row | null = null;
  const usStart = !originMx ? origin : borderUs;
  if (usMiles !== null && usStart) {
    const index = await fuelIndex(supabase);
    const state = (usStart.state_code || (usStart.market?.match(/\(([A-Z]{2})\)/)?.[1]) || "").toUpperCase();
    const region = index.state_region[state] || "U.S.";
    const regionRow = index.regions.find((row) => row.region === region) || index.regions.find((row) => row.region === "U.S.");
    if (regionRow) fuel = { region: regionRow.region, fsc_per_mile: regionRow.fsc_per_mile, index_date: regionRow.index_date, state };
  }

  const measured = legs.filter((leg) => leg.scope !== "border");
  const providers = [...new Set(measured.map((leg) => leg.provider).filter(Boolean))] as string[];
  return {
    mx_miles: mxMiles,
    us_miles: usMiles,
    legs,
    fuel,
    miles_source: providers.length ? providers.map((p) => (p === "catalog" ? "rateware_lane_mileage" : p)).join("+") : null,
    google_routes_enabled: Boolean(GOOGLE_MAPS_API_KEY),
    complete: measured.length > 0 && measured.every((leg) => leg.found)
  };
}

// ---------------------------------------------------------------- Bid Room

async function linkBidRoomEvent(supabase: Db, workspace: Workspace, input: Row) {
  const quote = await requireQuote(supabase, workspace, input.quote_id);
  const eventId = uuid(input.rfx_event_id, "El evento");
  const event = await linkedEvent(supabase, workspace, eventId);
  if (!event) throw new HttpError(400, "Ese evento no está en tu espacio de trabajo.");
  if (quote.rfx_event_id && quote.rfx_event_id !== eventId) {
    throw new HttpError(409, "Esta cotización ya está ligada a otro evento del Bid Room.");
  }
  if (["won", "lost", "archived"].includes(String(quote.status))) {
    throw new HttpError(400, "Esta cotización ya está cerrada.");
  }
  const links = Array.isArray(input.lane_links) ? input.lane_links.map(record) : [];
  if (links.length) {
    const laneIds = links.map((link) => uuid(link.quote_lane_id, "La ruta"));
    const rfxLaneIds = links.map((link) => uuid(link.rfx_lane_id, "La ruta del evento"));
    const rfxLanes = await supabase.from("rfx_lanes").select("id").eq("rfx_event_id", eventId).in("id", rfxLaneIds);
    if (rfxLanes.error) throw rfxLanes.error;
    if ((rfxLanes.data || []).length !== new Set(rfxLaneIds).size) throw new HttpError(400, "Alguna ruta no pertenece a ese evento.");
    for (let index = 0; index < laneIds.length; index += 1) {
      const update = await supabase.from("quotedesk_quote_lanes").update({ rfx_lane_id: rfxLaneIds[index], updated_at: nowIso() })
        .eq("owner_email", workspace.owner_email).eq("quote_id", quote.id).eq("id", laneIds[index]);
      if (update.error) throw update.error;
    }
  }
  const now = nowIso();
  const result = await supabase.from("quotedesk_quotes").update({
    rfx_event_id: eventId,
    bid_room_launched_at: quote.bid_room_launched_at || now,
    status: "bid_room",
    status_changed_at: quote.status === "bid_room" ? quote.status_changed_at : now,
    updated_at: now
  }).eq("owner_email", workspace.owner_email).eq("id", quote.id).select().single();
  if (result.error) throw result.error;
  await audit(supabase, workspace, "quotedesk_quote_bid_room", "quotedesk_quote", String(quote.id),
    `Quote ${quote.folio} sent to the Bid Room as ${event.rfx_id || event.name || eventId}.`,
    { rfx_event_id: eventId, lane_links: links.length });
  return { quote: result.data };
}

async function applyBidRoomAwards(supabase: Db, workspace: Workspace, quoteIdInput: unknown) {
  const quote = await requireQuote(supabase, workspace, quoteIdInput);
  if (!quote.rfx_event_id) throw new HttpError(400, "Esta cotización no tiene evento en el Bid Room.");
  const lanes = await quoteLanes(supabase, workspace, [String(quote.id)]);
  const awards = await laneAwards(supabase, lanes.map((lane) => text(lane.rfx_lane_id)).filter(Boolean) as string[]);
  const fx = await latestFx(supabase);
  let applied = 0;
  const skipped: Row[] = [];
  for (const lane of lanes) {
    const award = awards[String(lane.rfx_lane_id)];
    if (!award) continue;
    let rate = toNumber(award.bid_rate);
    const awardCurrency = String(award.currency || "USD").toUpperCase();
    if (rate !== null && awardCurrency !== quote.currency) {
      const usdMxn = fx?.usd_mxn;
      if (!usdMxn) {
        skipped.push({ lane_number: lane.lane_number, reason: "Sin tipo de cambio para convertir la tarifa." });
        continue;
      }
      rate = awardCurrency === "USD" ? rate * usdMxn : rate / usdMxn;
    }
    if (rate === null) continue;
    // The carrier's awarded rate replaces the estimate; the estimate is kept
    // in metadata so the analyst can compare.
    const previous = {
      linehaul_mx: lane.linehaul_mx, linehaul_us: lane.linehaul_us, fuel_amount: lane.fuel_amount,
      border_amount: lane.border_amount, carrier_rate: lane.carrier_rate, cost_source: lane.cost_source
    };
    const pricing = computeLane({
      ...lane,
      linehaul_mx: null,
      linehaul_us: null,
      fuel_amount: null,
      border_amount: null,
      carrier_rate: rate
    });
    const update = await supabase.from("quotedesk_quote_lanes").update({
      ...pricing,
      cost_source: "bid_room_award",
      metadata: {
        ...record(lane.metadata),
        previous_estimate: previous,
        award: { ...award, converted_rate: pricing.carrier_rate, applied_at: nowIso() }
      },
      updated_at: nowIso()
    }).eq("owner_email", workspace.owner_email).eq("id", lane.id);
    if (update.error) throw update.error;
    applied += 1;
  }
  if (applied) {
    await audit(supabase, workspace, "quotedesk_award_applied", "quotedesk_quote", String(quote.id),
      `Applied ${applied} Bid Room award(s) to quote ${quote.folio}.`, { applied });
  }
  const refreshed = await getQuote(supabase, workspace, quote.id);
  return { ...refreshed, applied, skipped };
}

async function eventOrigins(supabase: Db, workspace: Workspace, input: Row) {
  const ids = (Array.isArray(input.event_ids) ? input.event_ids : [])
    .map((value: unknown) => text(value, 80))
    .filter((value: string | null): value is string => Boolean(value && UUID_PATTERN.test(value)))
    .slice(0, 500);
  const origins: Record<string, string> = {};
  if (!ids.length) return { origins };
  const [quotes, events] = await Promise.all([
    supabase.from("quotedesk_quotes").select("rfx_event_id,folio").eq("owner_email", workspace.owner_email).in("rfx_event_id", ids),
    supabase.from("rfx_events").select("id,source_rfx_process_project_id").eq("owner_email", workspace.owner_email).in("id", ids)
  ]);
  if (quotes.error) throw quotes.error;
  if (events.error) throw events.error;
  const quoteByEvent = new Map(((quotes.data || []) as Row[]).map((row) => [String(row.rfx_event_id), String(row.folio)]));
  const projectIds = [...new Set(((events.data || []) as Row[]).map((row) => text(row.source_rfx_process_project_id)).filter(Boolean))] as string[];
  const intakeProjects = new Set<string>();
  if (projectIds.length) {
    // A project came from shipper intake when it has a magic link, a submitted
    // RFI, or a CRM opportunity; rateware's Ratebook sync creates a bare
    // project for every other event, so the project alone proves nothing.
    const [links, submissions, opportunities] = await Promise.all([
      supabase.from("rfx_rfi_magic_links").select("project_id").in("project_id", projectIds),
      supabase.from("rfx_rfi_submissions").select("project_id").in("project_id", projectIds),
      supabase.from("shipper_opportunities").select("rfx_project_id").eq("owner_email", workspace.owner_email).in("rfx_project_id", projectIds)
    ]);
    for (const result of [links, submissions]) {
      if (result.error) throw result.error;
      for (const row of (result.data || []) as Row[]) intakeProjects.add(String(row.project_id));
    }
    if (opportunities.error) throw opportunities.error;
    for (const row of (opportunities.data || []) as Row[]) intakeProjects.add(String(row.rfx_project_id));
  }
  const folios: Record<string, string> = {};
  for (const event of (events.data || []) as Row[]) {
    const id = String(event.id);
    if (quoteByEvent.has(id)) {
      origins[id] = "quotedesk";
      folios[id] = quoteByEvent.get(id) as string;
    } else if (intakeProjects.has(String(event.source_rfx_process_project_id))) {
      origins[id] = "magic";
    } else {
      origins[id] = "manual";
    }
  }
  return { origins, folios };
}

// ---------------------------------------------------------------- email

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function emailList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : String(value || "").split(/[,;\s]+/);
  return [...new Set(items.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))].slice(0, 5);
}

// The email as it would go out now. Rendered on the server from stored prices,
// for the preview and again at send time; the checksum ties the two together.
async function quoteEmailDraft(supabase: Db, workspace: Workspace, input: Row) {
  const quote = await requireQuote(supabase, workspace, input.quote_id);
  if (["won", "lost", "archived"].includes(String(quote.status))) {
    throw new HttpError(400, "Esta cotización ya está cerrada; reábrela para enviarla.");
  }
  const lanes = await quoteLanes(supabase, workspace, [String(quote.id)]);
  if (!lanes.length || lanes.some((lane) => toNumber(lane.all_in_rate) === null)) {
    throw new HttpError(400, "Cada ruta necesita su tarifa all-in antes de enviar la cotización.");
  }
  let to = text(input.to, 320)?.toLowerCase() || null;
  let contactName = text(input.contact_name, 120);
  if ((!to || !contactName) && quote.shipper_id) {
    const shipper = await supabase.from("shippers").select("primary_contact_name,primary_contact_email")
      .eq("owner_email", workspace.owner_email).eq("id", quote.shipper_id).maybeSingle();
    if (shipper.error) throw shipper.error;
    to = to || text(shipper.data?.primary_contact_email, 320)?.toLowerCase() || null;
    contactName = contactName || text(shipper.data?.primary_contact_name, 120);
  }
  const cc = emailList(input.cc).filter((email) => email !== to);
  const note = text(input.note, 2000);
  const rendered = renderQuoteEmail({ quote, lanes, contactName: contactName ?? undefined, note: note ?? undefined, senderName: EMAIL_SENDER_NAME });
  const checksum = await sha256Hex(JSON.stringify({ to, cc, subject: rendered.subject, text: rendered.text, html: rendered.html }));
  const suppressed = [...await suppressedEmails(supabase, workspace.owner_email, [to || "", ...cc])];
  return { quote, to, cc, contact_name: contactName, note, from: GMAIL_ALLOWED_SENDER, ...rendered, checksum, suppressed };
}

async function quoteEmails(supabase: Db, workspace: Workspace, quoteId: string) {
  const result = await supabase.from("quotedesk_quote_emails")
    .select("id,recipient_email,cc_emails,subject,status,attempt,error,attempted_at,sent_at,provider_message_id")
    .eq("owner_email", workspace.owner_email).eq("quote_id", quoteId)
    .order("created_at", { ascending: false }).limit(20);
  if (result.error) throw result.error;
  return result.data || [];
}

async function previewQuoteEmail(supabase: Db, workspace: Workspace, input: Row) {
  const draft = await quoteEmailDraft(supabase, workspace, input);
  const { quote, ...email } = draft;
  return { ...email, history: await quoteEmails(supabase, workspace, String(quote.id)) };
}

async function sendQuoteEmail(supabase: Db, workspace: Workspace, input: Row) {
  if (input.confirmed !== true) throw new HttpError(400, "Confirma el envío de la cotización.");
  const draft = await quoteEmailDraft(supabase, workspace, input);
  const quote = draft.quote;
  if (!draft.to || !isEmail(draft.to)) throw new HttpError(400, "El destinatario no es un correo válido.");
  const badCc = draft.cc.filter((email) => !isEmail(email));
  if (badCc.length) throw new HttpError(400, `Estos correos en copia no son válidos: ${badCc.join(", ")}.`);
  if (text(input.checksum, 80) !== draft.checksum) {
    throw new HttpError(409, "La cotización o el correo cambiaron desde la vista previa. Revísala otra vez antes de enviar.");
  }
  if (draft.suppressed.length) {
    throw new HttpError(400, `No se envía a ${draft.suppressed.join(", ")}: está en la lista de rebotes o bajas.`);
  }

  const idempotencyKey = await sha256Hex(`${EMAIL_CONTRACT}:${workspace.owner_email}:${quote.id}:${draft.checksum}`);
  const lookup = async () => {
    const existing = await supabase.from("quotedesk_quote_emails").select("*")
      .eq("owner_email", workspace.owner_email).eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing.error) throw existing.error;
    return existing.data as Row | null;
  };
  let receipt = await lookup();
  if (receipt?.status === "sent") return { receipt, quote, duplicate: true };
  if (receipt && receipt.status !== "failed") {
    throw new HttpError(409, "Ese correo ya se está enviando o no está confirmado que haya salido. Revisa Enviados en Gmail antes de reintentar.");
  }
  const now = nowIso();
  if (receipt) {
    const reclaimed = await supabase.from("quotedesk_quote_emails").update({
      status: "sending", attempt: Number(receipt.attempt || 1) + 1, error: null, attempted_at: now, updated_at: now,
      requested_by_user_id: workspace.owner_user_id
    }).eq("id", receipt.id).eq("status", "failed").select().maybeSingle();
    if (reclaimed.error) throw reclaimed.error;
    if (!reclaimed.data) throw new HttpError(409, "Otro intento de envío está en curso; espera un momento.");
    receipt = reclaimed.data as Row;
  } else {
    const inserted = await supabase.from("quotedesk_quote_emails").insert(owned({
      quote_id: quote.id,
      idempotency_key: idempotencyKey,
      payload_checksum: draft.checksum,
      mailbox_email: GMAIL_ALLOWED_SENDER,
      recipient_email: draft.to,
      cc_emails: draft.cc,
      subject: draft.subject,
      status: "sending",
      attempted_at: now,
      requested_by_user_id: workspace.owner_user_id
    }, workspace)).select().single();
    if (inserted.error) {
      if (inserted.error.code === "23505") throw new HttpError(409, "Ese correo ya se está enviando; espera un momento.");
      throw inserted.error;
    }
    receipt = inserted.data as Row;
  }

  const finish = async (patch: Row) => {
    const done = await supabase.from("quotedesk_quote_emails").update({ ...patch, updated_at: nowIso() })
      .eq("id", receipt!.id).eq("status", "sending").select().maybeSingle();
    if (done.error) console.error("QUOTEDESK_EMAIL_RECEIPT_UPDATE_FAILED", done.error.message);
    return (done.data as Row | null) || { ...receipt, ...patch };
  };

  let accessToken: string;
  try {
    accessToken = await gmailAccessToken(supabase, workspace.owner_email);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish({ status: "failed", error: message });
    throw new HttpError(502, message);
  }
  let sent: { id: string; threadId: string | null };
  try {
    sent = await sendGmailRaw(accessToken, gmailRawMessage({
      to: draft.to,
      cc: draft.cc,
      from: GMAIL_ALLOWED_SENDER,
      fromName: EMAIL_SENDER_NAME,
      subject: draft.subject,
      text: draft.text,
      html: draft.html,
      headers: { "X-QuoteDesk-Folio": String(quote.folio), "X-QuoteDesk-Receipt-Id": String(receipt.id) }
    }));
  } catch (error) {
    const outcome = error instanceof GmailSendError ? error.outcome : "delivery_unknown";
    const message = error instanceof Error ? error.message : String(error);
    await finish({ status: outcome, error: message });
    throw new HttpError(502, outcome === "failed"
      ? message
      : `${message} No sabemos si salió: revisa Enviados en Gmail antes de reintentar.`);
  }
  receipt = await finish({ status: "sent", provider_message_id: sent.id, provider_thread_id: sent.threadId, sent_at: nowIso(), error: null });

  // Sending it is quoting it.
  let current = quote;
  if (["new", "estimating", "bid_room", "expired"].includes(String(quote.status))) {
    const moved = await supabase.from("quotedesk_quotes").update({
      status: "quoted", status_changed_at: nowIso(), quoted_at: quote.quoted_at || nowIso(), updated_at: nowIso()
    }).eq("owner_email", workspace.owner_email).eq("id", quote.id).eq("status", quote.status).select().maybeSingle();
    if (moved.error) console.error("QUOTEDESK_QUOTE_STATUS_AFTER_EMAIL_FAILED", moved.error.message);
    if (moved.data) current = moved.data as Row;
  }
  await audit(supabase, workspace, "quotedesk_quote_emailed", "quotedesk_quote", String(quote.id),
    `Emailed quote ${quote.folio} to ${draft.to}.`, { receipt_id: receipt.id, cc: draft.cc.length, provider_message_id: sent.id });
  return { receipt, quote: current, duplicate: false };
}

// ---------------------------------------------------------------- catalog

async function saveAccessorial(supabase: Db, workspace: Workspace, input: Row) {
  const label = text(input.label, 120);
  if (!label) throw new HttpError(400, "El adicional necesita un nombre.");
  const rate = toNumber(input.default_rate);
  if (rate === null || rate < 0) throw new HttpError(400, "La tarifa del adicional no es válida.");
  const code = (text(input.code, 60) || label).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  if (!code) throw new HttpError(400, "El adicional necesita un código.");
  const row = owned({
    code,
    label,
    unit: oneOf(input.unit, ACCESSORIAL_UNITS, "event"),
    default_rate: Math.round(rate * 100) / 100,
    currency: (QUOTE_CURRENCIES as readonly string[]).includes(text(input.currency, 10)?.toUpperCase() || "") ? text(input.currency, 10)!.toUpperCase() : "USD",
    active: input.active !== false,
    sort_order: Math.max(0, Math.min(10000, Number(input.sort_order) || 500)),
    updated_at: nowIso()
  }, workspace);
  const result = await supabase.from("quotedesk_accessorial_catalog")
    .upsert(row, { onConflict: "owner_email,code" }).select().single();
  if (result.error) throw result.error;
  return { item: result.data };
}

// ---------------------------------------------------------------- handler

async function handle(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  try {
    const supabase = db();
    const workspace = await resolveWorkspace(request, supabase);
    let body: Row;
    try {
      body = record(await request.json());
    } catch {
      throw new HttpError(400, "El cuerpo de la solicitud no es JSON válido.");
    }
    switch (body.action) {
      case "get_context":
        return jsonResponse(await getContext(supabase, workspace), 200, request);
      case "list_quotes":
        return jsonResponse(await listQuotes(supabase, workspace, body), 200, request);
      case "get_quote":
        return jsonResponse(await getQuote(supabase, workspace, body.id), 200, request);
      case "create_quote":
        return jsonResponse({ quote: await createQuote(supabase, workspace, record(body.quote)) }, 200, request);
      case "update_quote":
        return jsonResponse({ quote: await updateQuote(supabase, workspace, body.id, record(body.patch)) }, 200, request);
      case "set_quote_status":
        return jsonResponse({ quote: await setQuoteStatus(supabase, workspace, body.id, body.status, body.outcome_reason) }, 200, request);
      case "save_quote_lane":
        return jsonResponse(await saveQuoteLane(supabase, workspace, body.quote_id, record(body.lane)), 200, request);
      case "delete_quote_lane":
        return jsonResponse(await deleteQuoteLane(supabase, workspace, body.id), 200, request);
      case "suggest_lane_miles":
        return jsonResponse(await suggestLaneMiles(supabase, body), 200, request);
      case "link_bid_room_event":
        return jsonResponse(await linkBidRoomEvent(supabase, workspace, body), 200, request);
      case "apply_bid_room_awards":
        return jsonResponse(await applyBidRoomAwards(supabase, workspace, body.quote_id), 200, request);
      case "event_origins":
        return jsonResponse(await eventOrigins(supabase, workspace, body), 200, request);
      case "preview_quote_email":
        return jsonResponse(await previewQuoteEmail(supabase, workspace, body), 200, request);
      case "send_quote_email":
        return jsonResponse(await sendQuoteEmail(supabase, workspace, body), 200, request);
      case "list_quote_emails": {
        const quote = await requireQuote(supabase, workspace, body.quote_id);
        return jsonResponse({ rows: await quoteEmails(supabase, workspace, String(quote.id)) }, 200, request);
      }
      case "save_accessorial":
        return jsonResponse(await saveAccessorial(supabase, workspace, record(body.item)), 200, request);
      default:
        return jsonResponse({ error: `Unknown QuoteDesk action: ${text(body.action, 80) || "(none)"}.` }, 400, request);
    }
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, request);
    if (error instanceof QuoteInputError) return jsonResponse({ error: error.message }, 400, request);
    const message = error instanceof Error ? error.message : String((error as Row)?.message || "QuoteDesk failed.");
    console.error("QUOTEDESK_API_ERROR", message);
    return jsonResponse({ error: message }, 500, request);
  }
}

Deno.serve(handle);
