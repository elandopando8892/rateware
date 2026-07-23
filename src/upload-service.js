import { authenticatedFetch } from "./auth.js";
import { SUPABASE_URL } from "./config.js";
import { detectDocumentType } from "./file-rules.js";
import { callRatewareApi } from "./rateware-api.js";
import { apiErrorMessage } from "./error-copy.js";

async function readApiJson(response) {
  const text = await response.text();
  try {
    return {
      data: text ? JSON.parse(text) : {},
      text
    };
  } catch {
    return {
      data: { error: text },
      text
    };
  }
}

export async function uploadRawFile(file, { vendorId = "", vendor = "", rfx = "" } = {}) {
  const documentType = detectDocumentType(file);

  if (documentType === "unsupported") {
    throw new Error(`${file.name} is not an accepted source type.`);
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("vendor_id", vendorId);
  formData.append("vendor", vendor);
  formData.append("rfx", rfx);
  formData.append("document_type", documentType);

  const response = await authenticatedFetch(`${SUPABASE_URL}/functions/v1/create-raw-upload`, {
    method: "POST",
    body: formData
  });

  const { data, text } = await readApiJson(response);
  if (!response.ok) throw new Error(apiErrorMessage(data, text, "Upload failed."));
  return data.raw_upload;
}

export async function fetchUploadHistory({ status = "" } = {}) {
  return (await callRatewareApi("list_uploads", { status })).rows;
}

export async function fetchUploadStagedRows(rawUploadId) {
  return (await callRatewareApi("list_upload_staged_rows", { raw_upload_id: rawUploadId })).rows;
}

export async function bulkImportUploadTemplate(rawUploadId, {
  rows = [],
  warnings = [],
  replaceExisting = true,
  expectedRows = rows.length,
  batchIndex = 0,
  batchCount = 1,
  importedBefore = 0,
  skippedBefore = 0
} = {}) {
  return await callRatewareApi("bulk_import_upload_template", {
    raw_upload_id: rawUploadId,
    template_rows: rows,
    template_warnings: warnings,
    replace_existing: replaceExisting,
    expected_rate_rows: expectedRows,
    batch_index: batchIndex,
    batch_count: batchCount,
    imported_before: importedBefore,
    skipped_before: skippedBefore
  });
}

export async function archiveUpload(rawUploadId) {
  return (await callRatewareApi("archive_upload", { id: rawUploadId, confirmed: true, confirmation_action: "archive_upload" })).row;
}

export async function removeUpload(rawUploadId) {
  return (await callRatewareApi("remove_upload", { id: rawUploadId, confirmed: true, confirmation_action: "remove_upload" })).removed;
}

export async function getUploadSourceUrl(rawUploadId) {
  return await callRatewareApi("get_upload_source_url", { id: rawUploadId });
}

export async function listInterpretationMemory(rawUploadId = "") {
  return (await callRatewareApi("list_interpretation_memory", { raw_upload_id: rawUploadId })).rows;
}

export async function createInterpretationMemory({ rawUploadId = "", scope = "global", instruction = "", title = "" } = {}) {
  return (await callRatewareApi("create_interpretation_memory", {
    raw_upload_id: rawUploadId,
    scope,
    instruction,
    title
  })).row;
}

export async function interpretUpload(rawUploadId, { correctionNote = "" } = {}) {
  const response = await authenticatedFetch(`${SUPABASE_URL}/functions/v1/interpret-upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw_upload_id: rawUploadId, correction_note: correctionNote })
  });

  const { data, text } = await readApiJson(response);
  if (!response.ok) throw new Error(apiErrorMessage(data, text, "Interpretation failed."));
  return data;
}
