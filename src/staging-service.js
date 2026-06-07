import { requireSupabase } from "./supabase-client.js";

export async function fetchStagingRows({ status = "pending_review" } = {}) {
  const client = requireSupabase();
  let query = client.from("rate_staging").select("*").order("created_at", { ascending: false }).limit(200);

  if (status) {
    query = query.eq("status", status);
  }

  const result = await query;
  if (result.error) throw result.error;
  return result.data;
}

export async function updateStagingRow(id, patch) {
  const client = requireSupabase();
  const result = await client.from("rate_staging").update(patch).eq("id", id).select().single();
  if (result.error) throw result.error;
  return result.data;
}
