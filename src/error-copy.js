export function humanizeError(errorOrMessage) {
  const raw = String(errorOrMessage?.message || errorOrMessage || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return "Something went wrong. Please try again.";
  if (lower.includes("insufficient_quota") || lower.includes("quota")) {
    return "OpenAI quota is not available for this project. Add billing or update the OpenAI key, then reprocess the file.";
  }
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("jwt") || lower.includes("sign in")) {
    return "Your session needs to be refreshed. Sign in again and retry the action.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("timeout")) {
    return "The request could not reach Rateware services. Check the connection and retry.";
  }
  if (lower.includes("unsupported") || lower.includes("accepted source type") || lower.includes("document type")) {
    return "This file type is not supported. Upload XLSX, PDF, image, or EML email files.";
  }
  if (lower.includes("storage") || lower.includes("bucket")) {
    return "The source file could not be read from storage. Re-upload the file or contact an admin.";
  }
  if (lower.includes("raw_upload_id") || lower.includes("upload id")) {
    return "Rateware could not find this upload. Refresh Upload History and try again.";
  }
  if (lower.includes("no rows") || lower.includes("no rates")) {
    return "No rate rows were detected. Review the source file and reprocess if the quote contains rates.";
  }

  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}
