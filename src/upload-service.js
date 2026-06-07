import { RAW_UPLOADS_BUCKET, requireSupabase } from "./supabase-client.js";
import { buildStoragePath, detectDocumentType } from "./file-rules.js";

export async function uploadRawFile(file, { vendor = "", rfx = "" } = {}) {
  const client = requireSupabase();
  const documentType = detectDocumentType(file);

  if (documentType === "unsupported") {
    throw new Error(`${file.name} is not an accepted source type.`);
  }

  const { uploadId, path } = buildStoragePath(file);
  const storageResult = await client.storage.from(RAW_UPLOADS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || undefined,
    upsert: false
  });

  if (storageResult.error) {
    throw storageResult.error;
  }

  const rawUpload = {
    id: uploadId,
    original_filename: file.name,
    storage_bucket: RAW_UPLOADS_BUCKET,
    storage_path: path,
    mime_type: file.type || null,
    file_size_bytes: file.size,
    document_type: documentType,
    vendor_hint: vendor.trim() || null,
    rfx_hint: rfx.trim() || null,
    status: "uploaded",
    staging_target: "rate_staging"
  };

  const insertResult = await client.from("raw_uploads").insert(rawUpload).select().single();

  if (insertResult.error) {
    await client.storage.from(RAW_UPLOADS_BUCKET).remove([path]);
    throw insertResult.error;
  }

  return insertResult.data;
}

export async function fetchUploadHistory({ status = "" } = {}) {
  const client = requireSupabase();
  let query = client.from("raw_uploads").select("*").order("created_at", { ascending: false }).limit(100);

  if (status) {
    query = query.eq("status", status);
  }

  const result = await query;
  if (result.error) throw result.error;

  return result.data;
}

export async function interpretUpload(rawUploadId) {
  const client = requireSupabase();
  const result = await client.functions.invoke("interpret-upload", {
    body: { raw_upload_id: rawUploadId }
  });

  if (result.error) throw result.error;
  return result.data;
}
