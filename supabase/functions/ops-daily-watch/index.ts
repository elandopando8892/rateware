// Daily watch over the automatic jobs QuoteDesk and the Bid Room depend on: the
// FCM copy and its formula alarm, Banxico's FX, the US diesel index, the
// sales@ mailbox and the delivery queue (./watch.mjs has the rules). When
// something needs a look it posts to the team's Google Chat space, the one the
// Bid Room relay uses, through the same connection; on Mondays it also says
// when all is well, so a silent watch gets noticed. pg_cron runs it every
// morning; only the shared cron secret can call it. The header
// `x-watch-dry-run: 1` returns the message without posting it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "https://deno.land/x/postgresjs@v3.4.5/mod.js";
import { corsHeaders, jsonResponse } from "../_shared/kinde.ts";
import { googleChatAccessToken } from "../_shared/bid-room-google-chat.ts";
import { watchFindings, watchMessage } from "./watch.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_DB_URL = (Deno.env.get("SUPABASE_DB_URL") || "").trim();
// Same shared secret the Banxico, diesel and FCM schedules use.
const SYNC_CRON_SECRET = (Deno.env.get("SYNC_CRON_SECRET") || "").trim();
const THREAD_KEY = "vigilancia-diaria";

type Row = Record<string, unknown>;
// postgres.js from deno.land ships untyped; its tagged-template query, as used here.
type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>;

function secretMatches(supplied: string) {
  if (!SYNC_CRON_SECRET || supplied.length !== SYNC_CRON_SECRET.length) return false;
  let diff = 0;
  for (let index = 0; index < supplied.length; index += 1) {
    diff |= supplied.charCodeAt(index) ^ SYNC_CRON_SECRET.charCodeAt(index);
  }
  return diff === 0;
}

/** Everything the rules look at, in one read-only query (cron's tables aren't exposed through the API). */
async function readSnapshot(): Promise<Row> {
  const sql = postgres(SUPABASE_DB_URL, { max: 1, prepare: false, connect_timeout: 15 });
  try {
    const [row] = await sql.begin("read only", async (tx: SqlTag) => {
      await tx`set local statement_timeout = '20s'`;
      return await tx`
        select json_build_object(
          'cron_failures', (
            select coalesce(json_agg(failure order by failure.jobname), '[]'::json) from (
              select j.jobname, count(*)::int as failed, max(d.start_time) as last_failed
              from cron.job_run_details d join cron.job j on j.jobid = d.jobid
              where d.start_time > now() - interval '24 hours' and d.status <> 'succeeded'
              group by j.jobname
            ) failure),
          'fcm', (
            select json_build_object(
              'last_ok', max(started_at) filter (where status = 'succeeded'),
              'failed_24h', count(*) filter (where status = 'failed' and started_at > now() - interval '24 hours'),
              'last_error', (select error from public.fcm_sync_runs where status = 'failed' order by started_at desc limit 1),
              'engine_check', (
                select engine_check from public.fcm_sync_runs
                where status = 'succeeded' and engine_check is not null order by started_at desc limit 1))
            from public.fcm_sync_runs),
          'fx_last_date', (select max(rate_date) from public.rateware_fx_spot_rates),
          'diesel_last_week', (select max(index_date) from public.rateware_fsc_trend where source = 'eia_weekly_rss'),
          'mailbox', (
            select json_build_object('status', status, 'last_error', last_error)
            from public.gmail_mailbox_connections
            where mailbox_email = 'sales@heymarksman.com' order by updated_at desc limit 1),
          'outreach', (
            select json_build_object(
              'failed', count(*) filter (where failed_at > now() - interval '24 hours'),
              'bounced', count(*) filter (where bounce_detected_at > now() - interval '24 hours'))
            from public.outreach_messages
            where failed_at > now() - interval '24 hours' or bounce_detected_at > now() - interval '24 hours')
        ) as snapshot`;
    });
    return (row?.snapshot ?? {}) as Row;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Posts to the team's space through the Google Chat connection the Bid Room relay uses. */
async function postToTeamChat(text: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const connection = await supabase.from("google_chat_connections")
    .select("owner_email,default_space_name")
    .eq("status", "connected").not("default_space_name", "is", null)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (connection.error) throw connection.error;
  const space = String(connection.data?.default_space_name || "");
  if (!space) throw new Error("No connected Google Chat space to post the watch to.");
  const accessToken = await googleChatAccessToken(supabase, String(connection.data?.owner_email));
  const params = new URLSearchParams({ messageReplyOption: "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD" });
  const response = await fetch(`https://chat.googleapis.com/v1/${space}/messages?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, thread: { threadKey: THREAD_KEY } }),
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => ({})) as Row;
  if (!response.ok) {
    const message = String((payload.error as Row | undefined)?.message || `Google Chat answered ${response.status}.`);
    throw new Error(message.slice(0, 300));
  }
  return String(payload.name || "");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!SYNC_CRON_SECRET) return jsonResponse({ error: "SYNC_CRON_SECRET is not configured." }, 500, request);
  if (!secretMatches((request.headers.get("x-cron-secret") || "").trim())) {
    return jsonResponse({ error: "Unauthorized." }, 401, request);
  }
  if (!SUPABASE_DB_URL) return jsonResponse({ error: "SUPABASE_DB_URL is not configured." }, 503, request);
  try {
    const now = new Date();
    const findings = watchFindings(await readSnapshot(), now);
    const message = watchMessage(findings, now);
    if (request.headers.get("x-watch-dry-run") === "1") {
      return jsonResponse({ findings, message, posted: false }, 200, request);
    }
    const posted = message ? await postToTeamChat(message) : "";
    return jsonResponse({ findings: findings.length, posted: Boolean(posted) }, 200, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as Row)?.message || "Watch failed.");
    console.error("OPS_DAILY_WATCH_FAILED", message);
    return jsonResponse({ error: message }, 502, request);
  }
});
