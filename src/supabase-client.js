import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { RAW_UPLOADS_BUCKET, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const missingConfig =
  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY ||
  SUPABASE_URL.includes("YOUR_PROJECT") ||
  SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");

export const supabase = missingConfig
  ? null
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

export { RAW_UPLOADS_BUCKET };

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured. Update src/config.js with the project URL and anon key.");
  }

  return supabase;
}
