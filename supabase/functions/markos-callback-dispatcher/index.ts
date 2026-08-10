import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("MARKOS_CALLBACK_CRON_SECRET") || "";
const DISPATCH_URL = (Deno.env.get("MARKOS_DISPATCH_URL") || "").replace(/\/$/, "");
const MARKOS_SECRET = Deno.env.get("MARKOS_WEBHOOK_SECRET") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function sameSecret(supplied: string, expected: string) {
  if (!supplied || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(supplied)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.min(leftBytes.length, rightBytes.length); index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

function bearer(request: Request) {
  return (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

function configured() {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && CRON_SECRET.length >= 24 && DISPATCH_URL.startsWith("https://") && MARKOS_SECRET.length >= 24);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!configured()) return json({ error: "Scheduled callback dispatcher is not fully configured." }, 503);
  if (!await sameSecret(bearer(request), CRON_SECRET)) return json({ error: "Unauthorized." }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const expired = await supabase
    .from("markos_callback_jobs")
    .update({ status: "needs_review", lease_until: null, updated_at: new Date().toISOString(), last_error: "Dispatch lease expired; automatic retry suppressed to avoid a duplicate call." })
    .eq("status", "dispatching")
    .lt("lease_until", new Date().toISOString());
  if (expired.error) return json({ error: expired.error.message }, 500);

  const claimed = await supabase.rpc("claim_due_markos_callback_jobs", { p_limit: 10, p_lease_seconds: 300 });
  if (claimed.error) return json({ error: claimed.error.message }, 500);
  const results: Record<string, unknown>[] = [];

  for (const job of claimed.data || []) {
    const invitation = await supabase
      .from("rfx_lane_vendors")
      .select("invitation_token")
      .eq("id", job.rfx_lane_vendor_id)
      .maybeSingle();
    if (invitation.error || !invitation.data?.invitation_token) {
      await supabase.from("markos_callback_jobs").update({
        status: "failed",
        lease_until: null,
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        last_error: invitation.error?.message || "Invitation token is unavailable."
      }).eq("id", job.id).eq("dispatch_attempt_id", job.dispatch_attempt_id);
      results.push({ id: job.id, status: "failed", reason: "invitation_unavailable" });
      continue;
    }

    try {
      const response = await fetch(`${DISPATCH_URL}/scheduled-callbacks/dispatch`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MARKOS_SECRET}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          callback_job_id: job.id,
          dispatch_attempt_id: job.dispatch_attempt_id,
          invitation_token: invitation.data.invitation_token,
          to: job.recipient_phone
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.accepted !== true) {
        const retrySafe = payload.retry_safe === true;
        await supabase.from("markos_callback_jobs").update({
          status: retrySafe && Number(job.attempt_count || 0) < 3 ? "scheduled" : "needs_review",
          scheduled_at: retrySafe ? new Date(Date.now() + 5 * 60_000).toISOString() : job.scheduled_at,
          lease_until: null,
          updated_at: new Date().toISOString(),
          last_error: String(payload.error || `MarkOS dispatch returned ${response.status}.`).slice(0, 1000)
        }).eq("id", job.id).eq("dispatch_attempt_id", job.dispatch_attempt_id);
        results.push({ id: job.id, status: retrySafe ? "scheduled" : "needs_review" });
        continue;
      }
      await supabase.from("markos_callback_jobs").update({
        status: "queued",
        twilio_call_sid: payload.call_sid || null,
        markos_voice_session_id: payload.voice_session_id || null,
        dispatched_at: new Date().toISOString(),
        lease_until: null,
        updated_at: new Date().toISOString(),
        last_error: null
      }).eq("id", job.id).eq("dispatch_attempt_id", job.dispatch_attempt_id);
      results.push({ id: job.id, status: "queued", call_sid: payload.call_sid || null });
    } catch (error) {
      await supabase.from("markos_callback_jobs").update({
        status: "needs_review",
        lease_until: null,
        updated_at: new Date().toISOString(),
        last_error: `Uncertain dispatch state; automatic retry suppressed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 1000)
      }).eq("id", job.id).eq("dispatch_attempt_id", job.dispatch_attempt_id);
      results.push({ id: job.id, status: "needs_review" });
    }
  }
  return json({ ok: true, claimed: (claimed.data || []).length, results });
});
