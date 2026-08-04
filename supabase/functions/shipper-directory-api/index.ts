import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, jsonResponse as baseJsonResponse, requireKindeUser } from "../_shared/kinde.ts";
import { resolveWorkspaceUser, workspaceUserContext } from "../_shared/workspace.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DETAIL_PAGE_SIZE = 1000;
const DETAIL_MAX_ROWS = 100000;

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function safeSearch(value: unknown) {
  return (cleanText(value) || "").replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message || "Shipper directory request failed.";
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return cleanText(record.message || record.error || record.details || record.hint) || "Shipper directory request failed.";
  }
  return "Shipper directory request failed.";
}

function errorStatus(value: unknown) {
  const message = errorMessage(value).toLowerCase();
  return /bearer|jwt|token|auth|unauthorized|sign in|kinde/.test(message) ? 401 : 500;
}

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function requireOwnedShipper(
  supabase: ReturnType<typeof getClient>,
  ownerEmail: string | null,
  value: unknown
) {
  const id = cleanText(value);
  if (!id || !UUID_PATTERN.test(id)) throw new Error("A valid Shipper id is required.");
  const result = await supabase.from("shippers").select("*")
    .eq("owner_email", ownerEmail).eq("id", id).single();
  if (result.error) throw result.error;
  return result.data as Record<string, unknown>;
}

async function fetchAllOwnedRows(
  supabase: ReturnType<typeof getClient>,
  table: string,
  ownerEmail: string | null,
  shipperId: string
) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < DETAIL_MAX_ROWS; offset += DETAIL_PAGE_SIZE) {
    const result = await supabase.from(table).select("*")
      .eq("owner_email", ownerEmail).eq("shipper_id", shipperId)
      .order("updated_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + DETAIL_PAGE_SIZE - 1);
    if (result.error) throw new Error(`${table} load failed: ${result.error.message}`);
    const page = (result.data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < DETAIL_PAGE_SIZE) return rows;
  }
  throw new Error(`${table} load exceeded ${DETAIL_MAX_ROWS} rows for one Shipper.`);
}

async function fetchShipperRatebooks(
  supabase: ReturnType<typeof getClient>,
  ownerEmail: string | null,
  shipperId: string,
  opportunityRows: Record<string, unknown>[]
) {
  const linkedProjectIds = new Set(
    opportunityRows.map((row) => cleanText(row.rfx_project_id)).filter((id): id is string => Boolean(id))
  );
  const [directRatebooksResult, customerProjectsResult] = await Promise.all([
    supabase.from("rfx_ratebooks").select("*")
      .eq("owner_email", ownerEmail).eq("shipper_id", shipperId)
      .order("updated_at", { ascending: false }),
    supabase.from("rfx_projects").select("id,title,customer_name,due_date,status")
      .eq("owner_email", ownerEmail).eq("customer_id", shipperId)
  ]);
  if (directRatebooksResult.error) throw directRatebooksResult.error;
  if (customerProjectsResult.error) throw customerProjectsResult.error;
  (customerProjectsResult.data || []).forEach((row) => {
    const id = cleanText(row.id);
    if (id) linkedProjectIds.add(id);
  });

  let linkedRatebooks: Record<string, unknown>[] = [];
  if (linkedProjectIds.size) {
    const result = await supabase.from("rfx_ratebooks").select("*")
      .eq("owner_email", ownerEmail).in("project_id", Array.from(linkedProjectIds))
      .order("updated_at", { ascending: false });
    if (result.error) throw result.error;
    linkedRatebooks = (result.data || []) as Record<string, unknown>[];
  }
  const byId = new Map<string, Record<string, unknown>>();
  [...((directRatebooksResult.data || []) as Record<string, unknown>[]), ...linkedRatebooks].forEach((row) => {
    const id = cleanText(row.id);
    if (id) byId.set(id, row);
  });
  const ratebooks = Array.from(byId.values());
  if (!ratebooks.length) return [];

  const projectIds = Array.from(new Set(ratebooks.map((row) => cleanText(row.project_id)).filter((id): id is string => Boolean(id))));
  const packageIds = Array.from(new Set(ratebooks.map((row) => cleanText(row.rfx_package_id)).filter((id): id is string => Boolean(id))));
  const ratebookIds = Array.from(byId.keys());
  const [projectsResult, packagesResult, sharesResult] = await Promise.all([
    projectIds.length
      ? supabase.from("rfx_projects").select("id,title,customer_name,due_date,status").eq("owner_email", ownerEmail).in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    packageIds.length
      ? supabase.from("rfx_packages").select("id,name,status,bid_due_at,linked_rfx_event_id").eq("owner_email", ownerEmail).in("id", packageIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("rfx_ratebook_shares").select("id,ratebook_id")
      .eq("owner_email", ownerEmail).eq("status", "active").in("ratebook_id", ratebookIds)
  ]);
  if (projectsResult.error) throw projectsResult.error;
  if (packagesResult.error) throw packagesResult.error;
  if (sharesResult.error) throw sharesResult.error;
  const projects = new Map((projectsResult.data || []).map((row) => [cleanText(row.id), row]));
  const packages = new Map((packagesResult.data || []).map((row) => [cleanText(row.id), row]));
  const shareCounts = new Map<string, number>();
  (sharesResult.data || []).forEach((row) => {
    const id = cleanText(row.ratebook_id);
    if (id) shareCounts.set(id, (shareCounts.get(id) || 0) + 1);
  });
  return ratebooks.map((row) => ({
    ...row,
    lane_count: Number(row.lane_count || 0),
    shared_carrier_count: shareCounts.get(cleanText(row.id) || "") || 0,
    project: projects.get(cleanText(row.project_id)) || {},
    package: packages.get(cleanText(row.rfx_package_id)) || {}
  }));
}

async function getShipper(
  supabase: ReturnType<typeof getClient>,
  ownerEmail: string | null,
  value: unknown
) {
  const shipper = await requireOwnedShipper(supabase, ownerEmail, value);
  const shipperId = cleanText(shipper.id)!;
  const [contacts, opportunities, actions, profileRequestsResult] = await Promise.all([
    fetchAllOwnedRows(supabase, "shipper_contacts", ownerEmail, shipperId),
    fetchAllOwnedRows(supabase, "shipper_opportunities", ownerEmail, shipperId),
    fetchAllOwnedRows(supabase, "shipper_account_actions", ownerEmail, shipperId),
    supabase.from("shipper_profile_requests")
      .select("id,status,expires_at,viewed_at,submitted_at,created_at,updated_at")
      .eq("owner_email", ownerEmail).eq("shipper_id", shipperId)
      .order("created_at", { ascending: false }).limit(10)
  ]);
  if (profileRequestsResult.error && profileRequestsResult.error.code !== "42P01") throw profileRequestsResult.error;
  let ratebooks: Record<string, unknown>[] = [];
  try {
    ratebooks = await fetchShipperRatebooks(supabase, ownerEmail, shipperId, opportunities);
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "42P01") throw error;
  }
  return {
    row: shipper,
    contacts,
    opportunities,
    actions,
    locations: [],
    lanes: [],
    rfis: [],
    profile_requests: profileRequestsResult.data || [],
    ratebooks,
    bid_room_events: [],
    ratebook_materialization_failures: []
  };
}

async function getShipperActivity(
  supabase: ReturnType<typeof getClient>,
  ownerEmail: string | null,
  value: unknown
) {
  const shipper = await requireOwnedShipper(supabase, ownerEmail, value);
  const shipperId = cleanText(shipper.id)!;
  const [opportunitiesResult, rfisResult, actionsResult, auditResult] = await Promise.all([
    supabase.from("shipper_opportunities").select("id,rfx_project_id").eq("owner_email", ownerEmail).eq("shipper_id", shipperId),
    supabase.from("shipper_rfis").select("id").eq("owner_email", ownerEmail).eq("shipper_id", shipperId),
    supabase.from("shipper_account_actions").select("id").eq("owner_email", ownerEmail).eq("shipper_id", shipperId),
    supabase.from("saas_audit_log").select("id,created_at,actor_email,action,entity_type,entity_id,summary,metadata")
      .eq("owner_email", ownerEmail).order("created_at", { ascending: false }).limit(300)
  ]);
  for (const result of [opportunitiesResult, rfisResult, actionsResult, auditResult]) {
    if (result.error) throw result.error;
  }
  const opportunityIds = new Set((opportunitiesResult.data || []).map((row) => cleanText(row.id)).filter(Boolean));
  const rfiIds = new Set((rfisResult.data || []).map((row) => cleanText(row.id)).filter(Boolean));
  const actionIds = new Set((actionsResult.data || []).map((row) => cleanText(row.id)).filter(Boolean));
  const projectIds = new Set((opportunitiesResult.data || []).map((row) => cleanText(row.rfx_project_id)).filter(Boolean));
  const rows = (auditResult.data || []).filter((row) => {
    const entityId = cleanText(row.entity_id);
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    return (row.entity_type === "shipper" && entityId === shipperId)
      || (row.entity_type === "shipper_opportunity" && opportunityIds.has(entityId))
      || (row.entity_type === "shipper_rfi" && rfiIds.has(entityId))
      || (row.entity_type === "shipper_account_action" && actionIds.has(entityId))
      || (row.entity_type === "rfx_project" && projectIds.has(entityId))
      || cleanText(metadata.shipper_id) === shipperId
      || opportunityIds.has(cleanText(metadata.shipper_opportunity_id));
  }).slice(0, 120);
  return { rows, shipper_id: shipperId, loaded: rows.length };
}

async function shipperSummary(supabase: ReturnType<typeof getClient>, ownerEmail: string | null) {
  const scopedCount = (configure: (query: any) => any = (query) => query) => configure(
    supabase.from("shippers").select("id", { count: "exact", head: true }).eq("owner_email", ownerEmail)
  );
  const [total, active, prospects, missingContact, opportunities] = await Promise.all([
    scopedCount((query) => query.neq("status", "archived")),
    scopedCount((query) => query.eq("status", "active")),
    scopedCount((query) => query.eq("status", "prospect")),
    scopedCount((query) => query.neq("status", "archived").is("primary_contact_email", null)),
    supabase.from("shipper_opportunities").select("id", { count: "exact", head: true })
      .eq("owner_email", ownerEmail).not("stage", "in", '("won","lost","archived")')
  ]);
  for (const result of [total, active, prospects, missingContact, opportunities]) {
    if (result.error) throw result.error;
  }
  return {
    total: total.count || 0,
    active: active.count || 0,
    prospects: prospects.count || 0,
    missing_contact: missingContact.count || 0,
    open_opportunities: opportunities.count || 0
  };
}

async function listShippers(
  supabase: ReturnType<typeof getClient>,
  ownerEmail: string | null,
  body: Record<string, unknown>
) {
  const offset = Math.max(Number(body.offset) || 0, 0);
  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 250);
  const search = safeSearch(body.search);
  let query = supabase
    .from("shippers")
    .select("id,shipper_name,legal_name,domain,website,logo_url,industry,status,relationship_stage,segment,revenue_tier,account_owner_email,primary_contact_name,primary_contact_email,primary_contact_phone,headquarters_city,headquarters_state,headquarters_country,tags,notes,source,created_at,updated_at,shipper_account_actions(title,status,priority,due_date,created_at)", { count: "exact" })
    .eq("owner_email", ownerEmail)
    .order(cleanText(body.sort_by) === "shipper_name" ? "shipper_name" : "updated_at", {
      ascending: cleanText(body.sort_direction)?.toLowerCase() === "asc"
    })
    .range(offset, offset + limit - 1);
  const status = cleanText(body.status)?.toLowerCase();
  const relationshipStage = cleanText(body.relationship_stage)?.toLowerCase();
  const segment = cleanText(body.segment);
  if (status && status !== "all") query = query.eq("status", status);
  else query = query.neq("status", "archived");
  if (relationshipStage && relationshipStage !== "all") query = query.eq("relationship_stage", relationshipStage);
  if (segment && segment.toLowerCase() !== "all") query = query.eq("segment", segment);
  query = query.in("shipper_account_actions.status", ["open", "in_progress"]);
  if (search) {
    query = query.or([
      `shipper_name.ilike.%${search}%`,
      `legal_name.ilike.%${search}%`,
      `domain.ilike.%${search}%`,
      `industry.ilike.%${search}%`,
      `primary_contact_name.ilike.%${search}%`,
      `primary_contact_email.ilike.%${search}%`,
      `headquarters_city.ilike.%${search}%`,
      `headquarters_state.ilike.%${search}%`,
      `notes.ilike.%${search}%`
    ].join(","));
  }
  const result = await query;
  if (result.error) throw result.error;
  const today = new Date().toISOString().slice(0, 10);
  const rows = ((result.data || []) as Record<string, unknown>[]).map((shipper) => {
    const actions = (Array.isArray(shipper.shipper_account_actions)
      ? shipper.shipper_account_actions as Record<string, unknown>[]
      : [])
      .slice()
      .sort((left, right) => {
        const dueComparison = (cleanText(left.due_date) || "9999-12-31")
          .localeCompare(cleanText(right.due_date) || "9999-12-31");
        return dueComparison || (cleanText(left.created_at) || "").localeCompare(cleanText(right.created_at) || "");
      });
    const nextAction = actions[0] || null;
    const dueActionCount = actions.filter((action) => {
      const dueDate = cleanText(action.due_date);
      return Boolean(dueDate && dueDate <= today);
    }).length;
    const { shipper_account_actions: _actions, ...shipperRow } = shipper;
    return {
      ...shipperRow,
      open_action_count: actions.length,
      due_action_count: dueActionCount,
      next_action: cleanText(nextAction?.title),
      next_due_date: cleanText(nextAction?.due_date),
      next_action_priority: cleanText(nextAction?.priority)
    };
  });
  return { rows, total: result.count || 0, limit, offset };
}

Deno.serve(async (request) => {
  const jsonResponse = (body: unknown, status = 200) => baseJsonResponse(body, status, request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse({ error: "POST is required." }, 405);

  try {
    const supabase = getClient();
    const identity = await requireKindeUser(request);
    const user = await resolveWorkspaceUser(
      supabase,
      workspaceUserContext(identity as Record<string, unknown>),
      { persistIdentity: false }
    );
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "shipper_crm_summary") return jsonResponse(await shipperSummary(supabase, user.owner_email));
    if (body.action === "list_shippers") return jsonResponse(await listShippers(supabase, user.owner_email, body));
    if (body.action === "get_shipper") return jsonResponse(await getShipper(supabase, user.owner_email, body.id || body.shipper_id));
    if (body.action === "shipper_account_activity") return jsonResponse(await getShipperActivity(supabase, user.owner_email, body.id || body.shipper_id));
    return jsonResponse({ error: "Unknown Shipper directory action." }, 400);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, errorStatus(error));
  }
});
