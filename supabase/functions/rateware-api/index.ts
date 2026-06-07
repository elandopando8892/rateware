import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, requireKindeUser } from "../_shared/kinde.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    await requireKindeUser(request);
    const supabase = getClient();
    const body = await request.json();

    if (body.action === "list_uploads") {
      let query = supabase.from("raw_uploads").select("*").order("created_at", { ascending: false }).limit(100);
      if (body.status) query = query.eq("status", body.status);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data });
    }

    if (body.action === "list_staging") {
      let query = supabase.from("rate_staging").select("*").order("created_at", { ascending: false }).limit(200);
      if (body.status) query = query.eq("status", body.status);
      const result = await query;
      if (result.error) throw result.error;
      return jsonResponse({ rows: result.data });
    }

    if (body.action === "update_staging") {
      const allowedStatus = ["pending_review", "approved", "rejected"];
      const patch = {
        status: allowedStatus.includes(body.patch?.status) ? body.patch.status : undefined
      };

      if (!patch.status) return jsonResponse({ error: "Only staging status updates are supported." }, 400);

      const result = await supabase.from("rate_staging").update(patch).eq("id", body.id).select().single();
      if (result.error) throw result.error;
      return jsonResponse({ row: result.data });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse({ error: error.message }, 401);
  }
});
