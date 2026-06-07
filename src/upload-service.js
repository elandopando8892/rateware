import { getKindeToken } from "./auth.js";
import { SUPABASE_URL } from "./config.js";
import { detectDocumentType } from "./file-rules.js";
import { callRatewareApi } from "./rateware-api.js";

export async function uploadRawFile(file, { vendor = "", rfx = "" } = {}) {
  const documentType = detectDocumentType(file);

  if (documentType === "unsupported") {
    throw new Error(`${file.name} is not an accepted source type.`);
  }

  const token = await getKindeToken();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("vendor", vendor);
  formData.append("rfx", rfx);
  formData.append("document_type", documentType);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-raw-upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Upload failed.");
  return data.raw_upload;
}

export async function fetchUploadHistory({ status = "" } = {}) {
  return (await callRatewareApi("list_uploads", { status })).rows;
}

export async function interpretUpload(rawUploadId) {
  const token = await getKindeToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/interpret-upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw_upload_id: rawUploadId })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Interpretation failed.");
  return data;
}
