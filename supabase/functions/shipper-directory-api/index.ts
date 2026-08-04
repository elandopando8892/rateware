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

async function shipperRelationshipPipeline(
  supabase: ReturnType<typeof getClient>,
  ownerEmail: string | null,
  body: Record<string, unknown>
) {
  const limit = Math.min(Math.max(Number(body.limit) || 500, 1), 750);
  const search = safeSearch(body.search);
  const status = cleanText(body.status)?.toLowerCase();
  let query = supabase.from("shippers")
    .select("id,shipper_name,domain,logo_url,industry,status,relationship_stage,primary_contact_name,primary_contact_email,headquarters_city,headquarters_state,headquarters_country,updated_at", { count: "exact" })
    .eq("owner_email", ownerEmail).neq("status", "archived")
    .order("updated_at", { ascending: false }).range(0, limit - 1);
  if (status && status !== "all") query = query.eq("status", status);
  if (search) {
    query = query.or([
      `shipper_name.ilike.%${search}%`, `domain.ilike.%${search}%`, `industry.ilike.%${search}%`,
      `primary_contact_name.ilike.%${search}%`, `primary_contact_email.ilike.%${search}%`,
      `headquarters_city.ilike.%${search}%`, `headquarters_state.ilike.%${search}%`
    ].join(","));
  }
  const shipperResult = await query;
  if (shipperResult.error) throw shipperResult.error;
  const shippers = (shipperResult.data || []) as Record<string, unknown>[];
  const shipperIds = shippers.map((row) => cleanText(row.id)).filter((id): id is string => Boolean(id));
  let opportunities: Record<string, unknown>[] = [];
  let rfis: Record<string, unknown>[] = [];
  let actions: Record<string, unknown>[] = [];
  if (shipperIds.length) {
    const [opportunityResult, rfiResult, actionResult] = await Promise.all([
      supabase.from("shipper_opportunities").select("shipper_id,stage,estimated_value,currency,due_date,next_action")
        .eq("owner_email", ownerEmail).in("shipper_id", shipperIds),
      supabase.from("shipper_rfis").select("shipper_id,status,due_date")
        .eq("owner_email", ownerEmail).in("shipper_id", shipperIds),
      supabase.from("shipper_account_actions").select("shipper_id,title,action_type,status,priority,due_date")
        .eq("owner_email", ownerEmail).in("shipper_id", shipperIds).in("status", ["open", "in_progress"])
        .order("due_date", { ascending: true, nullsFirst: false })
    ]);
    for (const result of [opportunityResult, rfiResult, actionResult]) if (result.error) throw result.error;
    opportunities = (opportunityResult.data || []) as Record<string, unknown>[];
    rfis = (rfiResult.data || []) as Record<string, unknown>[];
    actions = (actionResult.data || []) as Record<string, unknown>[];
  }
  const grouped = (rows: Record<string, unknown>[]) => {
    const result = new Map<string, Record<string, unknown>[]>();
    rows.forEach((row) => {
      const id = cleanText(row.shipper_id);
      if (id) result.set(id, [...(result.get(id) || []), row]);
    });
    return result;
  };
  const opportunityByShipper = grouped(opportunities);
  const rfiByShipper = grouped(rfis);
  const actionByShipper = grouped(actions);
  const openStages = new Set(["identified", "discovery", "rfi", "rfx", "proposal", "negotiation"]);
  const activeRfiStatuses = new Set(["draft", "sent", "in_progress", "submitted"]);
  const today = new Date().toISOString().slice(0, 10);
  const rows: Record<string, unknown>[] = shippers.map((shipper): Record<string, unknown> => {
    const id = cleanText(shipper.id)!;
    const accountOpportunities = opportunityByShipper.get(id) || [];
    const accountRfis = rfiByShipper.get(id) || [];
    const accountActions = actionByShipper.get(id) || [];
    const openOpportunities = accountOpportunities.filter((row) => openStages.has(cleanText(row.stage)?.toLowerCase() || ""));
    const activeRfis = accountRfis.filter((row) => activeRfiStatuses.has(cleanText(row.status)?.toLowerCase() || ""));
    const nextOpportunity = openOpportunities[0] || null;
    const nextAccountAction = accountActions[0] || null;
    const currencies = [...new Set(openOpportunities.map((row) => cleanText(row.currency)?.toUpperCase()).filter(Boolean))];
    const pipelineCurrency = currencies.length === 1 ? currencies[0] : currencies.length ? "mixed" : null;
    return {
      ...shipper,
      open_opportunity_count: openOpportunities.length,
      active_rfi_count: activeRfis.length,
      open_action_count: accountActions.length,
      due_action_count: accountActions.filter((row) => Boolean(cleanText(row.due_date) && cleanText(row.due_date)! <= today)).length,
      next_action: cleanText(nextAccountAction?.title) || cleanText(nextOpportunity?.next_action),
      next_due_date: cleanText(nextAccountAction?.due_date) || cleanText(nextOpportunity?.due_date),
      next_action_priority: cleanText(nextAccountAction?.priority),
      pipeline_value: pipelineCurrency === "mixed" ? null : openOpportunities.reduce((sum, row) => sum + (Number(row.estimated_value) || 0), 0),
      pipeline_currency: pipelineCurrency
    };
  });
  const stages = ["target", "qualified", "customer", "at_risk", "inactive"].map((stage) => ({
    stage, count: rows.filter((row) => cleanText(row.relationship_stage) === stage).length
  }));
  return { rows, total: shipperResult.count || 0, loaded: rows.length, limit, stages };
}

async function shipperCommercialWork(
  supabase: ReturnType<typeof getClient>,
  ownerEmail: string | null,
  body: Record<string, unknown>
) {
  const search = safeSearch(body.search).toLowerCase();
  const focus = cleanText(body.focus)?.toLowerCase() || "all";
  if (!new Set(["all", "needs_rfi", "rfi_due", "deal_due", "won", "lost"]).has(focus)) {
    throw new Error("Unknown commercial work focus.");
  }
  const limit = Math.min(Math.max(Number(body.limit) || 1000, 1), 1000);
  const shipperResult = await supabase.from("shippers").select("id,shipper_name,domain,relationship_stage,status")
    .eq("owner_email", ownerEmail).neq("status", "archived")
    .order("updated_at", { ascending: false }).range(0, limit - 1);
  if (shipperResult.error) throw shipperResult.error;
  const shippers = (shipperResult.data || []) as Record<string, unknown>[];
  const shipperIds = shippers.map((row) => cleanText(row.id)).filter((id): id is string => Boolean(id));
  const emptyCounts = { open_rfis: 0, unlinked_rfis: 0, open_opportunities: 0, won_opportunities: 0, lost_opportunities: 0, due_soon: 0 };
  if (!shipperIds.length) return { rfis: [], opportunities: [], counts: emptyCounts, loaded: 0 };
  const [rfiResult, opportunityResult] = await Promise.all([
    supabase.from("shipper_rfis").select("id,shipper_id,rfi_name,external_reference,status,due_date,updated_at")
      .eq("owner_email", ownerEmail).in("shipper_id", shipperIds).neq("status", "archived")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("shipper_opportunities").select("id,shipper_id,rfi_id,rfx_project_id,opportunity_name,stage,probability,estimated_value,currency,estimated_weekly_volume,due_date,next_action,updated_at")
      .eq("owner_email", ownerEmail).in("shipper_id", shipperIds).neq("stage", "archived")
      .order("due_date", { ascending: true, nullsFirst: false })
  ]);
  if (rfiResult.error) throw rfiResult.error;
  if (opportunityResult.error) throw opportunityResult.error;
  const shipperById = new Map(shippers.map((row) => [cleanText(row.id), row]));
  const projectIds = Array.from(new Set((opportunityResult.data || []).map((row) => cleanText(row.rfx_project_id)).filter((id): id is string => Boolean(id))));
  const projectResult = projectIds.length
    ? await supabase.from("rfx_projects").select("id,title,status,linked_rfx_event_id,due_date,updated_at")
      .eq("owner_email", ownerEmail).in("id", projectIds)
    : { data: [], error: null };
  if (projectResult.error) throw projectResult.error;
  const projectById = new Map((projectResult.data || []).map((row) => [cleanText(row.id), row]));
  const allOpportunities = (opportunityResult.data || []).map((row) => {
    const shipper = shipperById.get(cleanText(row.shipper_id)) || {};
    return {
      ...row,
      shipper_name: cleanText(shipper.shipper_name),
      shipper_domain: cleanText(shipper.domain),
      relationship_stage: cleanText(shipper.relationship_stage),
      rfx_project: projectById.get(cleanText(row.rfx_project_id)) || null
    };
  });
  const opportunityByRfi = new Map<string, Record<string, unknown>>();
  allOpportunities.forEach((row) => {
    const id = cleanText(row.rfi_id);
    if (id) opportunityByRfi.set(id, row);
  });
  const allRfis = (rfiResult.data || []).map((row) => {
    const shipper = shipperById.get(cleanText(row.shipper_id)) || {};
    return {
      ...row,
      shipper_name: cleanText(shipper.shipper_name),
      shipper_domain: cleanText(shipper.domain),
      linked_opportunity: opportunityByRfi.get(cleanText(row.id) || "") || null
    };
  });
  const matches = (row: Record<string, unknown>, fields: string[]) => !search
    || fields.some((field) => String(row[field] || "").toLowerCase().includes(search));
  const dueSoon = new Date();
  dueSoon.setDate(dueSoon.getDate() + 14);
  const dueBy = (value: unknown) => {
    const date = value ? new Date(String(value)) : null;
    return Boolean(date && !Number.isNaN(date.getTime()) && date <= dueSoon);
  };
  const openStages = new Set(["identified", "discovery", "rfi", "rfx", "proposal", "negotiation"]);
  const openOpportunities = allOpportunities.filter((row) => openStages.has(cleanText(row.stage)?.toLowerCase() || ""));
  const wonOpportunities = allOpportunities.filter((row) => cleanText(row.stage)?.toLowerCase() === "won");
  const lostOpportunities = allOpportunities.filter((row) => cleanText(row.stage)?.toLowerCase() === "lost");
  let rfis = allRfis.filter((row) => matches(row, ["shipper_name", "shipper_domain", "rfi_name", "external_reference", "status"]));
  let opportunities = openOpportunities.filter((row) => matches(row, ["shipper_name", "shipper_domain", "opportunity_name", "stage", "next_action"]));
  if (focus === "needs_rfi") rfis = rfis.filter((row) => !row.linked_opportunity);
  if (focus === "rfi_due") rfis = rfis.filter((row) => dueBy(row.due_date));
  if (focus === "deal_due") opportunities = opportunities.filter((row) => dueBy(row.due_date));
  if (focus === "won") {
    rfis = [];
    opportunities = wonOpportunities.filter((row) => matches(row, ["shipper_name", "shipper_domain", "opportunity_name", "next_action"]));
  }
  if (focus === "lost") {
    rfis = [];
    opportunities = lostOpportunities.filter((row) => matches(row, ["shipper_name", "shipper_domain", "opportunity_name", "next_action"]));
  }
  return {
    rfis,
    opportunities,
    counts: {
      open_rfis: allRfis.length,
      unlinked_rfis: allRfis.filter((row) => !row.linked_opportunity).length,
      open_opportunities: openOpportunities.length,
      won_opportunities: wonOpportunities.length,
      lost_opportunities: lostOpportunities.length,
      due_soon: [...allRfis, ...openOpportunities].filter((row) => dueBy(row.due_date)).length
    },
    loaded: shippers.length
  };
}

async function fetchAllActionCounts(supabase: ReturnType<typeof getClient>, ownerEmail: string | null) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < DETAIL_MAX_ROWS; offset += DETAIL_PAGE_SIZE) {
    const result = await supabase.from("shipper_account_actions").select("id,status,due_date")
      .eq("owner_email", ownerEmail).order("id", { ascending: true })
      .range(offset, offset + DETAIL_PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const page = (result.data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < DETAIL_PAGE_SIZE) return rows;
  }
  throw new Error(`Shipper account action counts exceeded ${DETAIL_MAX_ROWS} rows.`);
}

async function shipperActionQueue(
  supabase: ReturnType<typeof getClient>,
  ownerEmail: string | null,
  body: Record<string, unknown>
) {
  const focus = cleanText(body.focus)?.toLowerCase() || "open";
  if (!new Set(["open", "overdue", "today", "upcoming", "done"]).has(focus)) throw new Error("Unknown account action queue focus.");
  const limit = Math.max(1, Math.min(1000, Number(body.limit) || 250));
  const today = new Date().toISOString().slice(0, 10);
  const upcomingDate = new Date();
  upcomingDate.setUTCDate(upcomingDate.getUTCDate() + 7);
  const nextWeek = upcomingDate.toISOString().slice(0, 10);
  let query = supabase.from("shipper_account_actions")
    .select("id,shipper_id,title,action_type,status,priority,due_date,owner_email_assignee,notes,updated_at")
    .eq("owner_email", ownerEmail).order("due_date", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false }).order("id", { ascending: false }).limit(limit);
  query = focus === "done" ? query.eq("status", "done") : query.in("status", ["open", "in_progress"]);
  if (focus === "overdue") query = query.lt("due_date", today);
  if (focus === "today") query = query.eq("due_date", today);
  if (focus === "upcoming") query = query.gte("due_date", today).lte("due_date", nextWeek);
  const [actionsResult, countRows] = await Promise.all([query, fetchAllActionCounts(supabase, ownerEmail)]);
  if (actionsResult.error) throw actionsResult.error;
  const actions = (actionsResult.data || []) as Record<string, unknown>[];
  const shipperIds = Array.from(new Set(actions.map((row) => cleanText(row.shipper_id)).filter((id): id is string => Boolean(id))));
  const accountsResult = shipperIds.length
    ? await supabase.from("shippers").select("id,shipper_name,domain,primary_contact_email")
      .eq("owner_email", ownerEmail).in("id", shipperIds)
    : { data: [], error: null };
  if (accountsResult.error) throw accountsResult.error;
  const accountById = new Map((accountsResult.data || []).map((row) => [cleanText(row.id), row]));
  const search = safeSearch(body.search).toLowerCase();
  const rows: Record<string, unknown>[] = actions.map((row): Record<string, unknown> => {
    const account = (accountById.get(cleanText(row.shipper_id)) || {}) as Record<string, unknown>;
    return {
      ...row,
      shipper_name: cleanText(account.shipper_name),
      shipper_domain: cleanText(account.domain),
      primary_contact_email: cleanText(account.primary_contact_email)
    };
  }).filter((row) => !search || [row.shipper_name, row.shipper_domain, row.primary_contact_email, row.title, row.notes, row.owner_email_assignee]
    .map(cleanText).filter(Boolean).join(" ").toLowerCase().includes(search));
  const counts = { open: 0, today: 0, overdue: 0, done: 0 };
  countRows.forEach((row) => {
    const status = cleanText(row.status)?.toLowerCase();
    const dueDate = cleanText(row.due_date);
    if (["open", "in_progress"].includes(status || "")) {
      counts.open += 1;
      if (dueDate === today) counts.today += 1;
      if (dueDate && dueDate < today) counts.overdue += 1;
    }
    if (status === "done") counts.done += 1;
  });
  return { rows, counts, focus, loaded: rows.length };
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
    if (body.action === "shipper_relationship_pipeline") return jsonResponse(await shipperRelationshipPipeline(supabase, user.owner_email, body));
    if (body.action === "shipper_commercial_work") return jsonResponse(await shipperCommercialWork(supabase, user.owner_email, body));
    if (body.action === "shipper_action_queue") return jsonResponse(await shipperActionQueue(supabase, user.owner_email, body));
    return jsonResponse({ error: "Unknown Shipper directory action." }, 400);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, errorStatus(error));
  }
});
