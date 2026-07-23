function rawErrorMessage(errorOrMessage, depth = 0, seen = new Set()) {
  if (errorOrMessage === null || errorOrMessage === undefined || depth > 5) return "";
  if (typeof errorOrMessage === "string") return errorOrMessage.trim();
  if (typeof errorOrMessage === "number" || typeof errorOrMessage === "boolean") return String(errorOrMessage);
  if (typeof errorOrMessage !== "object") return "";
  if (seen.has(errorOrMessage)) return "";
  seen.add(errorOrMessage);

  const read = (value) => rawErrorMessage(value, depth + 1, seen);
  if (Array.isArray(errorOrMessage)) {
    return errorOrMessage.map(read).filter(Boolean).slice(0, 3).join(" | ");
  }

  const record = errorOrMessage;
  const status = read(record.status || record.statusCode || record.code);
  const message = [
    record.message,
    record.error,
    record.reason,
    record.description,
    record.detail,
    record.details,
    record.hint,
    record.cause
  ].map(read).find(Boolean) || "";
  const diagnostic = status && message && !message.startsWith(`${status}:`) && !message.startsWith(`HTTP ${status}:`)
    ? `${status}: ${message}`
    : (message || status);
  const incident = read(record.incidentId || record.incident_id);
  return incident && diagnostic ? `${diagnostic} | Incident ${incident}` : diagnostic;
}

export function humanizeError(errorOrMessage) {
  const raw = rawErrorMessage(errorOrMessage).trim();
  const lower = raw.toLowerCase();

  if (!raw) return "Something went wrong. Please try again.";
  if (lower === "[object object]" || lower.includes("[object object]")) {
    return "Rateware returned an unreadable error. Refresh the page and retry the action. If it repeats, check Observability for the detailed failure.";
  }
  if (lower.includes("insufficient_quota") || lower.includes("quota")) {
    return "OpenAI quota is not available for this project. Add billing or update the OpenAI key, then reprocess the file.";
  }
  if (lower.includes("not having enough compute resources") || lower.includes("http 546") || lower.includes("546")) {
    return "The processing service did not have enough compute resources for this request. Retry, or split the file into smaller batches.";
  }
  if (lower.includes("rateware api request failed")) {
    return "Rateware services could not complete the request. Retry the action, and check the workspace connection if it happens again.";
  }
  if (lower === "bad request" || lower.includes("bad request")) {
    return "Rateware rejected the request because some required data is missing or invalid. Refresh the module and retry; if it repeats, check Observability for the exact API failure.";
  }
  if (lower.includes("edge function") || lower.includes("function failed")) {
    return "A processing function failed before finishing. Retry the action; if it repeats, check the function logs.";
  }
  if (
    lower.includes("http 401")
    || lower.startsWith("401:")
    || lower.startsWith("401 ")
    || lower.includes("bearer token is required")
    || lower.includes("invalid bearer token")
    || lower.includes("jwt expired")
    || lower.includes("invalid jwt")
    || lower.includes("token has expired")
    || lower.includes("sign in with kinde")
    || lower.includes("authentication required")
  ) {
    return "Your session needs to be refreshed. Sign in again and retry the action.";
  }
  if (lower.includes("403") || lower.includes("forbidden")) {
    return "Your account is signed in, but this action is not allowed for the current workspace.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("timeout")) {
    if (raw.toLowerCase() !== "failed to fetch") return raw.length > 220 ? `${raw.slice(0, 217)}...` : raw;
    return "The request could not reach Rateware services. Check the connection and retry.";
  }
  if (lower.includes("500") || lower.includes("internal server error")) {
    const hasBackendCause = lower.includes("incident ") || raw.includes(" | ");
    if (hasBackendCause) return raw.length > 420 ? `${raw.slice(0, 417)}...` : raw;
    return "Rateware hit a server error while processing the request. Retry once, then check Observability if it repeats.";
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

export function apiErrorMessage(data = {}, text = "", fallback = "Request failed.") {
  const raw = rawErrorMessage(data?.error)
    || rawErrorMessage(data?.message)
    || rawErrorMessage(data?.details)
    || rawErrorMessage(data?.hint)
    || rawErrorMessage(data)
    || rawErrorMessage(text)
    || fallback;
  return humanizeError(raw);
}
