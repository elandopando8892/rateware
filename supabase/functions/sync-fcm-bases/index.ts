// Keeps QuoteDesk's copy of the Freight Cost Model (FCM) bases current. Every
// hour it reads the FCM database through a read-only role (FCM_DATABASE_URL)
// and refreshes:
// - fcm_cost_bases: the assumption sets of each FCM organization whose users'
//   emails belong to a rateware workspace (sales@heymarksman.com's FCM
//   organization feeds that workspace's QuoteDesk);
// - fcm_mex_lanes, fcm_usa_lanes, fcm_usa_market_conditions: the reference
//   tables, rewritten only when their content changed.
// Each run is recorded in fcm_sync_runs. Only the shared cron secret can call it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";
import { chunk, costBaseRows, workspacesByOrg } from "./fcm-sync.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
// Same shared secret the Banxico and diesel schedules use.
const SYNC_CRON_SECRET = (Deno.env.get("SYNC_CRON_SECRET") || "").trim();
const FCM_DATABASE_URL = (Deno.env.get("FCM_DATABASE_URL") || "").trim();
const RUN_RETENTION_DAYS = 30;

type Row = Record<string, unknown>;
// postgres.js from deno.land ships untyped; its tagged-template query, as used here.
type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>;
type Db = ReturnType<typeof getClient>;

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function secretMatches(supplied: string) {
  if (!SYNC_CRON_SECRET || supplied.length !== SYNC_CRON_SECRET.length) return false;
  let diff = 0;
  for (let index = 0; index < supplied.length; index += 1) {
    diff |= supplied.charCodeAt(index) ^ SYNC_CRON_SECRET.charCodeAt(index);
  }
  return diff === 0;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readFcm(): Promise<Record<string, Row[]>> {
  const sql = postgres(FCM_DATABASE_URL, { ssl: "require", max: 1, prepare: false, connect_timeout: 15 });
  try {
    return await sql.begin("read only", async (tx: SqlTag) => {
      const users = await tx`select "orgId" as org_id, lower(email) as email from "User"`;
      const organizations = await tx`select id, name from "Organization"`;
      const sets = await tx`
        select s.id, s."orgId" as org_id, s.name as set_name, s.version, s.status::text as version_status,
               s."isActive" as is_active, s."applicabilityContext" is not null as has_profile, s."applicabilityContext" as profile,
               s."updatedAt" as updated_at,
               b.id as base_id, b.code, b.name as base_name, b.scope::text as scope, b.status::text as base_status,
               b."defaultPolicy"::text as policy, b.currency, b."isDefault" as base_default
        from "AssumptionSet" s left join "CostBase" b on b.id = s."costBaseId"`;
      const params = await tx`select "setId" as set_id, section::text as section, field, value from "AssumptionParam"`;
      const mexLanes = await tx`
        select "laneKeyNorm" as lane_key_norm, "laneKey" as lane_key, km, tolls, "driverExpenses" as driver_expenses,
               pension, "diasViaje" as trip_days, "horasRuta" as route_hours
        from "MexLaneExpense" order by "laneKeyNorm"`;
      const usaLanes = await tx`
        select "laneKey" as lane_key, "outState" as out_state, miles, "truckDays" as truck_days, "routeExpenses" as route_expenses
        from "UsaLaneData" order by "laneKey"`;
      const markets = await tx`
        select market, "dryVanCond" as dry_van, "flatbedCond" as flatbed, "reeferCond" as reefer, region
        from "UsaMktCondition" order by market`;
      return { users, organizations, sets, params, mexLanes, usaLanes, markets } as Record<string, Row[]>;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function upsertAll(supabase: Db, table: string, rows: Row[], onConflict: string) {
  for (const part of chunk(rows, 500)) {
    const result = await supabase.from(table).upsert(part, { onConflict });
    if (result.error) throw result.error;
  }
}

async function syncFcmBases(trigger: string) {
  const supabase = getClient();
  const startedAt = new Date().toISOString();
  const run = await supabase.from("fcm_sync_runs")
    .insert({ status: "running", trigger, started_at: startedAt }).select("id").single();
  if (run.error) throw run.error;
  const runId = run.data.id;
  try {
    const fcm = await readFcm();

    // FCM organization -> rateware workspace, through the users' emails.
    const emails = [...new Set(fcm.users.map((user) => String(user.email || "")).filter(Boolean))];
    const aliases = emails.length
      ? await supabase.from("workspace_identity_aliases").select("organization_id,identity_key").in("identity_key", emails)
      : { data: [], error: null };
    if (aliases.error) throw aliases.error;
    const organizationIds = [...new Set(((aliases.data || []) as Row[]).map((row) => String(row.organization_id)))];
    const registry = organizationIds.length
      ? await supabase.from("workspace_registry").select("organization_id,canonical_owner_key").in("organization_id", organizationIds)
      : { data: [], error: null };
    if (registry.error) throw registry.error;
    const { byOrg, conflicts } = workspacesByOrg(fcm.users, (aliases.data || []) as Row[], (registry.data || []) as Row[]);

    // Cost bases: upsert the mapped organizations' sets, drop the ones gone from the FCM.
    const bases = costBaseRows({ sets: fcm.sets, params: fcm.params, organizations: fcm.organizations, workspaces: byOrg, syncedAt: startedAt }) as Row[];
    if (bases.length) await upsertAll(supabase, "fcm_cost_bases", bases, "id");
    let basesRemoved = 0;
    for (const owner of new Set([...byOrg.values()].map((workspace) => workspace.owner_email))) {
      const keep = bases.filter((row) => row.owner_email === owner).map((row) => String(row.id));
      let removal = supabase.from("fcm_cost_bases").delete().eq("owner_email", owner);
      if (keep.length) removal = removal.not("id", "in", `(${keep.join(",")})`);
      const removed = await removal.select("id");
      if (removed.error) throw removed.error;
      basesRemoved += (removed.data || []).length;
    }

    // Reference tables: rewritten only when their content changed.
    const checksum = await sha256Hex(JSON.stringify([fcm.mexLanes, fcm.usaLanes, fcm.markets]));
    const last = await supabase.from("fcm_sync_runs").select("reference_checksum")
      .eq("status", "succeeded").not("reference_checksum", "is", null)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (last.error) throw last.error;
    const referenceChanged = last.data?.reference_checksum !== checksum;
    if (referenceChanged) {
      await upsertAll(supabase, "fcm_mex_lanes", fcm.mexLanes.map((row) => ({
        lane_key_norm: row.lane_key_norm,
        lane_key: row.lane_key,
        km: row.km,
        tolls_mxn: row.tolls ?? 0,
        driver_expenses_mxn: row.driver_expenses,
        pension_mxn: row.pension,
        trip_days: row.trip_days,
        route_hours: row.route_hours,
        synced_at: startedAt
      })), "lane_key_norm");
      await upsertAll(supabase, "fcm_usa_lanes", fcm.usaLanes.map((row) => ({ ...row, synced_at: startedAt })), "lane_key");
      await upsertAll(supabase, "fcm_usa_market_conditions", fcm.markets.map((row) => ({ ...row, synced_at: startedAt })), "market");
      // Rows the FCM no longer has kept an older synced_at.
      for (const table of ["fcm_mex_lanes", "fcm_usa_lanes", "fcm_usa_market_conditions"]) {
        const stale = await supabase.from(table).delete().lt("synced_at", startedAt);
        if (stale.error) throw stale.error;
      }
    }

    const counts = {
      workspaces: byOrg.size,
      conflicting_organizations: conflicts.length,
      cost_bases: bases.length,
      usable_cost_bases: bases.filter((row) => row.usable).length,
      cost_bases_removed: basesRemoved,
      reference_changed: referenceChanged,
      mex_lanes: fcm.mexLanes.length,
      usa_lanes: fcm.usaLanes.length,
      market_conditions: fcm.markets.length
    };
    const done = await supabase.from("fcm_sync_runs").update({
      status: "succeeded", finished_at: new Date().toISOString(), counts, reference_checksum: checksum
    }).eq("id", runId);
    if (done.error) throw done.error;
    const cutoff = new Date(Date.now() - RUN_RETENTION_DAYS * 86400000).toISOString();
    await supabase.from("fcm_sync_runs").delete().lt("started_at", cutoff);
    return { run_id: runId, ...counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as Row)?.message || error);
    await supabase.from("fcm_sync_runs").update({
      status: "failed", finished_at: new Date().toISOString(), error: message.slice(0, 500)
    }).eq("id", runId);
    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!SYNC_CRON_SECRET) return jsonResponse({ error: "SYNC_CRON_SECRET is not configured." }, 500, request);
  if (!secretMatches((request.headers.get("x-cron-secret") || "").trim())) {
    return jsonResponse({ error: "Unauthorized." }, 401, request);
  }
  if (!FCM_DATABASE_URL) return jsonResponse({ error: "FCM_DATABASE_URL is not configured." }, 503, request);
  try {
    const trigger = (request.headers.get("x-sync-trigger") || "cron").trim().slice(0, 20) || "cron";
    return jsonResponse(await syncFcmBases(trigger), 200, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as Row)?.message || "FCM sync failed.");
    console.error("SYNC_FCM_BASES_FAILED", message);
    return jsonResponse({ error: message }, 502, request);
  }
});
