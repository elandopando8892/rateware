import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse as baseJsonResponse } from "../_shared/kinde.ts";
import { requireRatewareUser } from "../_shared/auth.ts";
import { resolveSourceFileUser, SOURCE_FILE_ACTIONS } from "../_shared/source-file-access.ts";
import { resolveRuntimeWorkspaceUser, runtimeIdentityStatus } from "../_shared/runtime-identity.ts";
import {
  deleteStorageObject,
  headStorageObject,
  putStorageObject,
  sha256Hex,
  storageWritePlan,
} from "../_shared/object-storage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("RATEWARE_SUPABASE_SERVICE_ROLE_KEY");
const RAW_UPLOADS_BUCKET = "raw-uploads";

function sanitizeFilename(filename: string) {
  return filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildStoragePath(file: File, uploadId = crypto.randomUUID(), now = new Date()) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const filename = sanitizeFilename(file.name) || "upload.bin";

  return {
    uploadId,
    path: `${year}/${month}/${uploadId}/${filename}`
  };
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function uploadErrorMessage(value: unknown, fallback = "Upload request failed."): string {
  if (value === null || value === undefined) return fallback;
  if (value instanceof Error) return cleanText(value.message) || fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return cleanText(value) || fallback;
  }
  if (typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  for (const key of ["error", "message", "reason", "description", "detail", "details", "hint", "cause"]) {
    if (record[key] && record[key] !== value) {
      const message: string = uploadErrorMessage(record[key], "");
      if (message) return message;
    }
  }
  return fallback;
}

function uploadErrorStatus(value: unknown) {
  const message = uploadErrorMessage(value, "").toLowerCase();
  if (/bearer|jwt|token|auth|unauthorized|sign in|kinde/.test(message)) return 401;
  return 500;
}

function normalizeDomain(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const emailDomain = text.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/)?.[1];
  const domainText = emailDomain || text.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/^@/, "");
  if (!/[a-z0-9-]+\.[a-z]{2,}/i.test(domainText)) return null;
  return domainText.toLowerCase().split(/[\/\s,;]+/)[0].replace(/[^a-z0-9.-]+$/g, "");
}

Deno.serve(async (request) => {
  const jsonResponse = (body: unknown, status = 200) => baseJsonResponse(body, status, request);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });

  try {
    const identity = await requireRatewareUser(request);

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY." }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const user = await resolveSourceFileUser(supabase, identity);
    const ownerEmail = user.owner_email;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return jsonResponse({ error: "file is required." }, 400);

    const documentType = String(formData.get("document_type") || "");
    if (!["xlsx", "pdf", "image", "email"].includes(documentType)) {
      return jsonResponse({ error: "Unsupported document type." }, 400);
    }

    const vendor = String(formData.get("vendor") || "").trim();
    const vendorId = String(formData.get("vendor_id") || "").trim();
    const rfx = String(formData.get("rfx") || "").trim();
    const { uploadId, path } = buildStoragePath(file);
    let selectedVendorQuery = vendorId
      ? supabase
          .from("vendors")
          .select("id,vendor_name,domain,primary_email")
          .eq("id", vendorId)
      : null;
    if (selectedVendorQuery && ownerEmail) selectedVendorQuery = selectedVendorQuery.eq("owner_email", ownerEmail);
    const selectedVendor = selectedVendorQuery ? await selectedVendorQuery.maybeSingle() : { data: null, error: null };
    if (selectedVendor.error) throw selectedVendor.error;
    if (vendorId && !selectedVendor.data) return jsonResponse({ error: "Selected vendor was not found in your vendor base." }, 400);
    const resolvedVendorId = cleanText(selectedVendor.data?.id);
    const selectedVendorHint = normalizeDomain(selectedVendor.data?.domain)
      || normalizeDomain(selectedVendor.data?.primary_email)
      || cleanText(selectedVendor.data?.vendor_name);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const storageSha256 = await sha256Hex(bytes);
    const writePlan = storageWritePlan(RAW_UPLOADS_BUCKET);
    const primary = await putStorageObject(supabase, writePlan.primary, RAW_UPLOADS_BUCKET, path, bytes, {
      contentType: file.type,
      sha256: storageSha256,
      upsert: false,
    });
    if (primary.provider === "oracle_s3") {
      const observed = await headStorageObject(supabase, primary.provider, RAW_UPLOADS_BUCKET, path);
      if (observed.size !== bytes.byteLength || observed.sha256 !== storageSha256) {
        await deleteStorageObject(supabase, primary.provider, RAW_UPLOADS_BUCKET, path).catch(() => undefined);
        throw new Error("Oracle primary object failed size or SHA-256 verification.");
      }
      primary.etag = observed.etag;
    }
    let replica: Awaited<ReturnType<typeof putStorageObject>> | null = null;
    let replicaError: string | null = null;
    if (writePlan.replica) {
      try {
        const uploadedReplica = await putStorageObject(supabase, writePlan.replica, RAW_UPLOADS_BUCKET, path, bytes, {
          contentType: file.type,
          sha256: storageSha256,
          upsert: false,
        });
        const observed = await headStorageObject(supabase, uploadedReplica.provider, RAW_UPLOADS_BUCKET, path);
        if (observed.size !== bytes.byteLength || observed.sha256 !== storageSha256) {
          throw new Error("Oracle replica failed size or SHA-256 verification.");
        }
        replica = { ...uploadedReplica, etag: observed.etag };
      } catch (error) {
        replicaError = uploadErrorMessage(error, "Oracle replica upload failed.");
      }
    }

    const rawUpload = {
      id: uploadId,
      original_filename: file.name,
      storage_bucket: RAW_UPLOADS_BUCKET,
      storage_path: path,
      storage_provider: primary.provider,
      storage_sha256: storageSha256,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      document_type: documentType,
      vendor_id: resolvedVendorId || null,
      vendor_hint: vendor || selectedVendorHint || null,
      vendor_match_source: resolvedVendorId ? "manual" : null,
      rfx_hint: rfx || null,
      owner_email: ownerEmail,
      organization_id: user.organization_id,
      status: "uploaded",
      staging_target: "rate_staging"
    };

    const insert = await supabase.from("raw_uploads").insert(rawUpload).select().single();

    if (insert.error) {
      await Promise.allSettled([
        deleteStorageObject(supabase, primary.provider, RAW_UPLOADS_BUCKET, path),
        ...(replica ? [deleteStorageObject(supabase, replica.provider, RAW_UPLOADS_BUCKET, path)] : []),
      ]);
      throw insert.error;
    }

    if (writePlan.replica) {
      const ledger = await supabase.from("object_storage_replicas").insert({
        organization_id: user.organization_id,
        owner_email: ownerEmail,
        source_table: "raw_uploads",
        source_record_id: uploadId,
        source_provider: primary.provider,
        source_bucket: RAW_UPLOADS_BUCKET,
        source_path: path,
        replica_provider: writePlan.replica,
        replica_bucket: RAW_UPLOADS_BUCKET,
        replica_path: path,
        object_sha256: storageSha256,
        object_size_bytes: bytes.byteLength,
        object_etag: replica?.etag || null,
        replica_status: replica ? "verified" : "failed",
        attempts: 1,
        last_error: replicaError,
        verified_at: replica ? new Date().toISOString() : null,
      });
      if (ledger.error) {
        await Promise.allSettled([
          supabase.from("raw_uploads").delete().eq("id", uploadId),
          deleteStorageObject(supabase, primary.provider, RAW_UPLOADS_BUCKET, path),
          ...(replica ? [deleteStorageObject(supabase, replica.provider, RAW_UPLOADS_BUCKET, path)] : []),
        ]);
        throw ledger.error;
      }
    }

    return jsonResponse({
      raw_upload: insert.data,
      storage: {
        mode: writePlan.mode,
        primary: primary.provider,
        replica_status: writePlan.replica ? (replica ? "verified" : "failed") : "disabled",
      },
    });
  } catch (error) {
    const identityStatus = runtimeIdentityStatus(error);
    return jsonResponse({ error: uploadErrorMessage(error) }, identityStatus === 403 ? 403 : uploadErrorStatus(error));
  }
});
