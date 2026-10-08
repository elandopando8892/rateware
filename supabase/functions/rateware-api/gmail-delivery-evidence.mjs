const record = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const reasons = new Set(["badRequest", "authError", "domainPolicy", "rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded", "failedPrecondition", "backendError", "notFound", "invalidArgument", "forbidden", "accessNotConfigured", "insufficientPermissions", "FAILED_PRECONDITION", "RESOURCE_EXHAUSTED", "UNAUTHENTICATED", "PERMISSION_DENIED"]);
export function gmailFailureEvidence(status, payload) {
  const error = record(record(payload).error);
  const entries = Array.isArray(error.errors) ? error.errors.slice(0, 20) : [];
  return { http_status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    provider_reason_codes: [...new Set([...entries.map(entry => record(entry).reason), error.status].filter(reason => reasons.has(reason)))].slice(0, 8) };
}
export async function readLatestOutreachIssue(client, owner, message) {
  const empty = { delivery_issue: null, delivery_issue_unavailable: false };
  if (message.channel !== "email") return empty;
  try {
    let query = client.from("contact_history").select("outreach_message_id,owner_email,rfx_event_id,status,occurred_at,metadata")
      .eq("owner_email", owner).eq("outreach_message_id", message.id)
      .eq("metadata->>source", "outreach_send_attempt").eq("metadata->>provider", "gmail")
      .in("status", ["failed", "delivery_unknown"]);
    if (message.rfx_event_id) query = query.eq("rfx_event_id", message.rfx_event_id);
    const result = await query.order("occurred_at", { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(2000)).maybeSingle();
    if (result.error) return { ...empty, delivery_issue_unavailable: true };
    const row = result.data;
    if (!row) return empty;
    if (row.owner_email !== owner || row.outreach_message_id !== message.id || (message.rfx_event_id && row.rfx_event_id !== message.rfx_event_id)) return { ...empty, delivery_issue_unavailable: true };
    const metadata = record(row.metadata), safe = gmailFailureEvidence(metadata.http_status, { error: { errors: Array.isArray(metadata.provider_reason_codes) ? metadata.provider_reason_codes.map(reason => ({ reason })) : [] } });
    return { delivery_issue_unavailable: false, delivery_issue: { status: row.status, occurred_at: typeof row.occurred_at === "string" ? row.occurred_at : null,
      error: typeof metadata.delivery_error === "string" ? metadata.delivery_error.slice(0, 500) : null, http_status: safe.http_status, reason_codes: safe.provider_reason_codes } };
  } catch { return { ...empty, delivery_issue_unavailable: true }; }
}
