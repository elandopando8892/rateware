import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { requireRatewareUser } from "../_shared/auth.ts";
import { resolveSourceFileUser, SOURCE_FILE_ACTIONS } from "../_shared/source-file-access.ts";
import {
  corsHeaders,
  jsonResponse as baseJsonResponse,
} from "../_shared/kinde.ts";
import {
  createStorageDownloadUrl,
  deleteStorageObject,
} from "../_shared/object-storage.ts";
import {
  resolveRuntimeWorkspaceUser,
  runtimeIdentityStatus,
} from "../_shared/runtime-identity.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
  "RATEWARE_SUPABASE_SERVICE_ROLE_KEY",
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function message(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "Storage request failed.");
}

async function audit(
  supabase: any,
  user: any,
  action: string,
  id: string,
  summary: string,
  metadata = {},
) {
  try {
    const result = await supabase.from("saas_audit_log").insert({
      owner_user_id: user.owner_user_id,
      owner_email: user.owner_email,
      organization_id: user.organization_id,
      actor_email: user.owner_email,
      action,
      entity_type: "raw_uploads",
      entity_id: id,
      summary,
      metadata,
    });
    if (result.error) throw result.error;
  } catch (error) {
    console.error("storage_audit_log_write_failed", {
      action,
      entity_id: id,
      error: message(error),
    });
  }
}

Deno.serve(async (request) => {
  const jsonResponse = (body: unknown, status = 200) =>
    baseJsonResponse(body, status, request);
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "POST is required." }, 405);
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY.",
      );
    }
    const identity = await requireRatewareUser(request);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const user = await resolveSourceFileUser(supabase, identity);
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!UUID_PATTERN.test(id)) {
      return jsonResponse({ error: "A valid upload id is required." }, 400);
    }

    const upload = await supabase
      .from("raw_uploads")
      .select(
        "id,original_filename,mime_type,storage_provider,storage_bucket,storage_path",
      )
      .eq("id", id)
      .eq("owner_email", user.owner_email)
      .single();
    if (upload.error || !upload.data) {
      return jsonResponse({ error: "Source file unavailable." }, upload.error?.code === "PGRST116" || !upload.error ? 404 : 503);
    }
    if (!upload.data.storage_bucket || !upload.data.storage_path) {
      return jsonResponse(
        { error: "Source file is missing from storage." },
        404,
      );
    }

    if (body.action === "get_upload_source_url") {
      const url = await createStorageDownloadUrl(
        supabase,
        upload.data.storage_provider,
        upload.data.storage_bucket,
        upload.data.storage_path,
        { expiresIn: 600, downloadName: upload.data.original_filename },
      );
      return jsonResponse({
        url,
        expires_in_seconds: 600,
        filename: upload.data.original_filename,
        mime_type: upload.data.mime_type,
      });
    }

    if (body.action === "remove_upload") {
      if (
        body.confirmed !== true || body.confirmation_action !== "remove_upload"
      ) {
        return jsonResponse({
          error: "Explicit remove_upload confirmation is required.",
        }, 409);
      }
      const replicas = await supabase
        .from("object_storage_replicas")
        .select(
          "id,replica_provider,replica_bucket,replica_path,replica_status",
        )
        .eq("source_table", "raw_uploads")
        .eq("source_record_id", id)
        .neq("replica_status", "deleted");
      if (replicas.error) throw replicas.error;

      for (const replica of replicas.data || []) {
        await deleteStorageObject(
          supabase,
          replica.replica_provider,
          replica.replica_bucket,
          replica.replica_path,
        );
        const marked = await supabase.from("object_storage_replicas").update({
          replica_status: "deleted",
          updated_at: new Date().toISOString(),
        }).eq("id", replica.id);
        if (marked.error) throw marked.error;
      }

      await deleteStorageObject(
        supabase,
        upload.data.storage_provider,
        upload.data.storage_bucket,
        upload.data.storage_path,
      );
      const removed = await supabase.from("raw_uploads")
        .delete()
        .eq("id", id)
        .eq("owner_email", user.owner_email)
        .select("id")
        .single();
      if (removed.error) throw removed.error;
      await audit(
        supabase,
        user,
        "upload.remove",
        id,
        `Removed upload ${upload.data.original_filename || id}`,
        {
          storage_provider: upload.data.storage_provider || "supabase",
          replicas_removed: replicas.data?.length || 0,
        },
      );
      return jsonResponse({ removed: removed.data });
    }

    return jsonResponse({ error: "Unknown action." }, 400);
  } catch (error) {
    const status = runtimeIdentityStatus(error);
    const errorMessage = message(error);
    return jsonResponse(
      { error: errorMessage },
      status === 403
        ? 403
        : /auth|bearer|jwt|token|sign in/i.test(errorMessage)
        ? 401
        : 500,
    );
  }
});
