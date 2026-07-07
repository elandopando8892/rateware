function rawErrorMessage(errorOrMessage) {
  if (!errorOrMessage) return "";
  if (typeof errorOrMessage === "string") return errorOrMessage;
  if (errorOrMessage instanceof Error) return rawErrorMessage(errorOrMessage.message);
  if (typeof errorOrMessage !== "object") return String(errorOrMessage);

  const nested = errorOrMessage.message || errorOrMessage.error || errorOrMessage.details || errorOrMessage.hint;
  if (nested && nested !== errorOrMessage) {
    const message = rawErrorMessage(nested);
    if (message && message !== "[object Object]") return message;
  }

  try {
    const json = JSON.stringify(errorOrMessage);
    return json === "{}" ? "" : json;
  } catch {
    return "";
  }
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
  if (lower.includes("edge function") || lower.includes("function failed")) {
    return "A processing function failed before finishing. Retry the action; if it repeats, check the function logs.";
  }
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("jwt") || lower.includes("sign in")) {
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
    return "Rateware hit a server error while processing the request. Retry once, then check logs if it repeats.";
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
