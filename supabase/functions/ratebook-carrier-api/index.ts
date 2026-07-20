import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase service credentials.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function relationRecord(value: unknown): Record<string, unknown> {
  return Array.isArray(value) ? objectRecord(value[0]) : objectRecord(value);
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function requiredPositiveNumber(value: unknown, label: string) {
  const number = numberValue(value);
  if (number === null || number <= 0) throw new Error(`${label} must be a number greater than zero.`);
  return number;
}

function optionalNonNegativeNumber(value: unknown, label: string) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = numberValue(value);
  if (number === null || number < 0) throw new Error(`${label} must be zero or greater.`);
  return number;
}

function normalizedCurrency(value: unknown) {
  const currency = cleanText(value)?.toUpperCase() || "USD";
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must use a three-letter code, such as USD or MXN.");
  return currency;
}

function optionalDate(value: unknown) {
  const date = cleanText(value);
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    throw new Error("Valid until must be a valid date.");
  }
  return date;
}

async function hashAccessToken(token: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function resolveActiveShare(supabase: ReturnType<typeof createClient>, tokenInput: unknown) {
  const token = cleanText(tokenInput);
  if (!token || token.length < 32) throw new Error("This private Ratebook link is invalid or incomplete.");
  const tokenHash = await hashAccessToken(token);
  const shareResult = await supabase.from("rfx_ratebook_shares")
    .select("id,ratebook_id,vendor_id,status,access_granted_at,last_viewed_at,last_accessed_at,last_quote_at,access_count,metadata,owner_email,organization_id,rfx_ratebooks(*),vendors(id,vendor_name,domain,primary_email)")
    .eq("access_token_hash", tokenHash)
    .eq("status", "active")
    .maybeSingle();
  if (shareResult.error) throw shareResult.error;
  if (!shareResult.data) throw new Error("This private Ratebook link is unavailable. Ask procurement for a new link.");
  const share = shareResult.data as Record<string, unknown>;
  const ratebook = relationRecord(share.rfx_ratebooks);
  if (cleanText(ratebook.lifecycle_status)?.toLowerCase() !== "published") {
    throw new Error("This Ratebook is no longer available for carrier access.");
  }
  if (!cleanText(share.vendor_id)) throw new Error("This Ratebook link is not associated with a Carrier CRM record.");
  if (!cleanText(ratebook.rfx_package_id)) throw new Error("This Ratebook is missing its route package.");
  return { share, ratebook };
}

function routeDetail(lane: Record<string, unknown>) {
  const payload = objectRecord(lane.normalized_payload);
  return {
    logistics_model: firstText(payload.logistics_model, payload.model_logistico, lane.logistics_model),
    operation_criteria: firstText(payload.operation_criteria, payload.criterios_operacion, lane.operation_criteria),
    business_rules: firstText(payload.business_rules, payload.reglas_negocio, lane.business_rules),
    service_specifications: firstText(payload.service_specifications, payload.especificaciones_servicio, lane.service_specifications),
    carrier_requirements: firstText(payload.carrier_requirements, payload.perfil_requerido_carrier, lane.carrier_requirements),
    other_notes: firstText(payload.other_notes, payload.notas_adicionales, lane.other_notes)
  };
}

function routeSummary(row: Record<string, unknown>, index: number) {
  const lane = relationRecord(row.rfx_demand_lanes);
  const payload = objectRecord(lane.normalized_payload);
  return {
    id: cleanText(row.id) || `${cleanText(lane.id) || "lane"}-${index}`,
    transaction_id: firstText(lane.transaction_id, lane.lane_id, lane.lane_key, `Route ${index + 1}`),
    lane_key: firstText(lane.lane_key, lane.transaction_id, lane.lane_id),
    segment_key: firstText(lane.rfx_segment_key, lane.operating_segment, row.lot_name),
    origin: firstText(lane.origin_location, lane.origin_text, payload.origin, payload.origin_location),
    destination: firstText(lane.destination_location, lane.destination_text, payload.destination, payload.destination_location),
    origin_postal_code: firstText(lane.origin_postal_code, payload.origin_postal_code),
    destination_postal_code: firstText(lane.destination_postal_code, payload.destination_postal_code),
    equipment: firstText(lane.equipment_type, lane.equipment, payload.equipment),
    trailer: firstText(lane.trailer_requirements, lane.trailer, payload.trailer),
    configuration: firstText(lane.configuration, lane.config, payload.configuration),
    operation: firstText(lane.operation_type, lane.operation, payload.operation),
    service: firstText(lane.service_type, lane.service, payload.service),
    weekly_volume: numberValue(lane.weekly_volume ?? payload.weekly_volume),
    target_rate: numberValue(lane.target_rate ?? payload.target_rate),
    currency: firstText(lane.currency, payload.currency),
    detail: routeDetail(lane)
  };
}

async function getRatebookAccess(supabase: ReturnType<typeof createClient>, input: Record<string, unknown>) {
  const { share, ratebook } = await resolveActiveShare(supabase, input.token);
  const lifecycle = "published";
  const packageId = cleanText(ratebook.rfx_package_id);
  const [projectResult, packageResult, lanesResult, segmentsResult, quotesResult] = await Promise.all([
    cleanText(ratebook.rfx_project_id)
      ? supabase.from("rfx_projects").select("id,title,customer_name,due_date").eq("id", ratebook.rfx_project_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("rfx_packages").select("id,name,description").eq("id", packageId).maybeSingle(),
    supabase.from("rfx_package_lanes").select("id,demand_lane_id,lot_name,rfx_demand_lanes(*)")
      .eq("package_id", packageId).order("created_at", { ascending: true }),
    supabase.from("rfx_ratebook_segments").select("segment_key,segment_name,operation,service,equipment,trailer,lane_count")
      .eq("ratebook_id", ratebook.id).order("created_at", { ascending: true }),
    supabase.from("rfx_ratebook_carrier_quotes")
      .select("id,package_lane_id,status,all_in_rate,currency,weekly_capacity,transit_days,valid_until,quote_reference,notes,revision_number,updated_at")
      .eq("ratebook_share_id", share.id).eq("vendor_id", share.vendor_id)
  ]);
  for (const result of [projectResult, packageResult, lanesResult, segmentsResult, quotesResult]) {
    if (result.error) throw result.error;
  }
  const now = new Date().toISOString();
  const updateResult = await supabase.from("rfx_ratebook_shares").update({
    last_viewed_at: now,
    last_accessed_at: now,
    access_count: Math.max(0, Number(share.access_count) || 0) + 1,
    updated_at: now
  }).eq("id", share.id);
  if (updateResult.error) throw updateResult.error;

  return {
    share: {
      id: share.id,
      status: share.status,
      access_granted_at: share.access_granted_at,
      last_viewed_at: now,
      last_accessed_at: now,
      access_count: Math.max(0, Number(share.access_count) || 0) + 1
    },
    carrier: relationRecord(share.vendors),
    ratebook: {
      id: ratebook.id,
      name: firstText(ratebook.name, packageResult.data?.name, "Ratebook"),
      version_number: ratebook.version_number,
      source_type: ratebook.source_type,
      valid_from: ratebook.valid_from,
      valid_until: ratebook.valid_until,
      shipper_name: ratebook.shipper_name,
      lifecycle_status: lifecycle
    },
    project: projectResult.data || null,
    package: packageResult.data || null,
    segments: segmentsResult.data || [],
    routes: ((lanesResult.data || []) as Record<string, unknown>[]).map(routeSummary).map((route) => ({
      ...route,
      quote: ((quotesResult.data || []) as Record<string, unknown>[]).find((quote) => cleanText(quote.package_lane_id) === route.id) || null
    }))
  };
}

async function requireRatebookPackageLane(supabase: ReturnType<typeof createClient>, ratebook: Record<string, unknown>, input: Record<string, unknown>) {
  const packageLaneId = cleanText(input.package_lane_id || input.route_id);
  if (!packageLaneId) throw new Error("Choose a Ratebook route before submitting an offer.");
  const result = await supabase.from("rfx_package_lanes")
    .select("id,demand_lane_id")
    .eq("id", packageLaneId)
    .eq("package_id", ratebook.rfx_package_id)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("This route is not part of the shared Ratebook.");
  return result.data as Record<string, unknown>;
}

async function submitRatebookQuote(supabase: ReturnType<typeof createClient>, input: Record<string, unknown>) {
  const { share, ratebook } = await resolveActiveShare(supabase, input.token);
  const packageLane = await requireRatebookPackageLane(supabase, ratebook, input);
  const allInRate = requiredPositiveNumber(input.all_in_rate, "All-in rate");
  const weeklyCapacity = optionalNonNegativeNumber(input.weekly_capacity, "Weekly capacity");
  const transitDays = optionalNonNegativeNumber(input.transit_days, "Transit days");
  const notes = cleanText(input.notes);
  const quoteReference = cleanText(input.quote_reference);
  if (notes && notes.length > 5000) throw new Error("Notes must be 5,000 characters or less.");
  if (quoteReference && quoteReference.length > 180) throw new Error("Quote reference must be 180 characters or less.");
  const previousResult = await supabase.from("rfx_ratebook_carrier_quotes")
    .select("id,revision_number")
    .eq("ratebook_share_id", share.id).eq("vendor_id", share.vendor_id).eq("package_lane_id", packageLane.id)
    .maybeSingle();
  if (previousResult.error) throw previousResult.error;
  const previous = previousResult.data as Record<string, unknown> | null;
  const now = new Date().toISOString();
  const revisionNumber = (Number(previous?.revision_number) || 0) + 1;
  const quotePatch = {
    ratebook_id: ratebook.id,
    ratebook_share_id: share.id,
    vendor_id: share.vendor_id,
    package_lane_id: packageLane.id,
    demand_lane_id: cleanText(packageLane.demand_lane_id),
    owner_email: cleanText(share.owner_email),
    organization_id: cleanText(share.organization_id),
    status: "submitted",
    all_in_rate: allInRate,
    currency: normalizedCurrency(input.currency),
    weekly_capacity: weeklyCapacity,
    transit_days: transitDays,
    valid_until: optionalDate(input.valid_until),
    quote_reference: quoteReference,
    notes,
    source: "ratebook_carrier_portal",
    revision_number: revisionNumber,
    metadata: { submitted_at: now, channel: "private_ratebook_link" },
    updated_at: now
  };
  const quoteResult = await supabase.from("rfx_ratebook_carrier_quotes")
    .upsert(previous ? { ...quotePatch, id: previous.id } : quotePatch, { onConflict: "ratebook_share_id,package_lane_id" })
    .select("*").single();
  if (quoteResult.error) throw quoteResult.error;
  const quote = quoteResult.data as Record<string, unknown>;
  const revisionResult = await supabase.from("rfx_ratebook_carrier_quote_revisions").insert({
    quote_id: quote.id,
    ratebook_id: ratebook.id,
    ratebook_share_id: share.id,
    vendor_id: share.vendor_id,
    package_lane_id: packageLane.id,
    revision_number: revisionNumber,
    action: previous ? "updated" : "submitted",
    snapshot: quote
  });
  if (revisionResult.error) throw revisionResult.error;
  const shareResult = await supabase.from("rfx_ratebook_shares")
    .update({ last_quote_at: now, updated_at: now })
    .eq("id", share.id);
  if (shareResult.error) throw shareResult.error;
  return { quote, message: previous ? "Your Ratebook offer was updated." : "Your Ratebook offer was submitted." };
}

async function withdrawRatebookQuote(supabase: ReturnType<typeof createClient>, input: Record<string, unknown>) {
  const { share, ratebook } = await resolveActiveShare(supabase, input.token);
  const packageLane = await requireRatebookPackageLane(supabase, ratebook, input);
  const quoteResult = await supabase.from("rfx_ratebook_carrier_quotes")
    .select("*").eq("ratebook_share_id", share.id).eq("vendor_id", share.vendor_id).eq("package_lane_id", packageLane.id).maybeSingle();
  if (quoteResult.error) throw quoteResult.error;
  if (!quoteResult.data || cleanText(quoteResult.data.status) === "withdrawn") throw new Error("There is no active offer to withdraw for this route.");
  const quote = quoteResult.data as Record<string, unknown>;
  const revisionNumber = (Number(quote.revision_number) || 0) + 1;
  const updateResult = await supabase.from("rfx_ratebook_carrier_quotes")
    .update({ status: "withdrawn", revision_number: revisionNumber, updated_at: new Date().toISOString() })
    .eq("id", quote.id).select("*").single();
  if (updateResult.error) throw updateResult.error;
  const revisionResult = await supabase.from("rfx_ratebook_carrier_quote_revisions").insert({
    quote_id: quote.id,
    ratebook_id: ratebook.id,
    ratebook_share_id: share.id,
    vendor_id: share.vendor_id,
    package_lane_id: packageLane.id,
    revision_number: revisionNumber,
    action: "withdrawn",
    snapshot: updateResult.data
  });
  if (revisionResult.error) throw revisionResult.error;
  return { quote: updateResult.data, message: "Your Ratebook offer was withdrawn." };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
    const body = await request.json() as Record<string, unknown>;
    const supabase = getClient();
    const action = cleanText(body.action);
    if (action === "get_ratebook_access") return jsonResponse(await getRatebookAccess(supabase, body));
    if (action === "submit_ratebook_quote") return jsonResponse(await submitRatebookQuote(supabase, body));
    if (action === "withdraw_ratebook_quote") return jsonResponse(await withdrawRatebookQuote(supabase, body));
    return jsonResponse({ error: "Unsupported Ratebook access action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Ratebook access failed." }, 400);
  }
});
