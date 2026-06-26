import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, requireKindeUser } from "../_shared/kinde.ts";

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

function normalizeDomain(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  const emailDomain = text.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/)?.[1];
  const domainText = emailDomain || text.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/^@/, "");
  if (!/[a-z0-9-]+\.[a-z]{2,}/i.test(domainText)) return null;
  return domainText.toLowerCase().split(/[\/\s,;]+/)[0].replace(/[^a-z0-9.-]+$/g, "");
}

function userEmail(payload: Record<string, unknown>) {
  return cleanText(payload.email || payload.preferred_email || payload["https://kinde.com/email"])?.toLowerCase() || null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const user = await requireKindeUser(request);
    const ownerEmail = userEmail(user);

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing SUPABASE_URL or RATEWARE_SUPABASE_SERVICE_ROLE_KEY." }, 500);
    }

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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

    const storage = await supabase.storage.from(RAW_UPLOADS_BUCKET).upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false
    });

    if (storage.error) throw storage.error;

    const rawUpload = {
      id: uploadId,
      original_filename: file.name,
      storage_bucket: RAW_UPLOADS_BUCKET,
      storage_path: path,
      mime_type: file.type || null,
      file_size_bytes: file.size,
      document_type: documentType,
      vendor_id: resolvedVendorId || null,
      vendor_hint: vendor || selectedVendorHint || null,
      vendor_match_source: resolvedVendorId ? "manual" : null,
      rfx_hint: rfx || null,
      status: "uploaded",
      staging_target: "rate_staging"
    };

    const insert = await supabase.from("raw_uploads").insert(rawUpload).select().single();

    if (insert.error) {
      await supabase.storage.from(RAW_UPLOADS_BUCKET).remove([path]);
      throw insert.error;
    }

    return jsonResponse({ raw_upload: insert.data });
  } catch (error) {
    return jsonResponse({ error: error.message }, 401);
  }
});
