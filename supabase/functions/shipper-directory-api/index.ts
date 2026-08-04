import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, jsonResponse as baseJsonResponse, requireKindeUser } from "../_shared/kinde.ts";
import { resolveWorkspaceUser, workspaceUserContext } from "../_shared/workspace.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");

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
    return jsonResponse({ error: "Unknown Shipper directory action." }, 400);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, errorStatus(error));
  }
});
