function eventIdFromRow(row = {}) {
  return String(
    row.event?.id
      || row.rfx_events?.id
      || row.rfx_event_id
      || ""
  );
}

export function currentEventBookRows(carrierBook = {}, event = {}) {
  const eventId = String(event.id || "");
  const rows = Array.isArray(carrierBook.invited) ? carrierBook.invited : [];
  if (!eventId) return rows;
  return rows.filter((row) => eventIdFromRow(row) === eventId);
}

export function eventInvitedLaneRows(carrierBook = {}, invitation = {}) {
  const event = invitation.rfx_events || invitation.event || {};
  return currentEventBookRows(carrierBook, event)
    .filter((row) => Boolean(String(row.invitation_token || "").trim()));
}

export function canonicalLaneStatus(row = {}, fitProgress = {}) {
  const rawStatuses = [
    row.award_status,
    row.business_status,
    row.participation_status,
    row.invitation_status
  ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  const awardRole = String(row.award_role || "").trim().toLowerCase();

  if (awardRole === "primary" || rawStatuses.includes("awarded")) return "awarded";
  if (awardRole === "backup" || rawStatuses.includes("backup")) return "backup";
  if (rawStatuses.includes("not_awarded")) return "not_awarded";
  if (rawStatuses.includes("withdrawn")) return "withdrawn";
  if (rawStatuses.some((status) => status === "declined" || status === "rejected")) return "rejected";

  const hasBid = row.bid_rate !== null
    && row.bid_rate !== undefined
    && String(row.bid_rate).trim() !== ""
    && Number(row.bid_rate) > 0;
  if (hasBid || rawStatuses.some((status) => status === "quoted" || status === "bid_submitted")) return "quoted";

  const exceptions = Number(fitProgress.exceptions || 0);
  const disagreements = Number(fitProgress.disagreements || 0);
  const complete = Number(fitProgress.complete || 0);
  const total = Number(fitProgress.total || 0);
  if (exceptions > 0 || disagreements > 0) return "exception";
  if (total > 0 && complete === total) return "agreed";

  return row.is_invited === false ? "open" : "invited";
}

export function isBidToolsEligibleRow(row = {}, statusResolver = () => "") {
  const status = String(statusResolver(row) || "").toLowerCase();
  return Boolean(String(row.invitation_token || "").trim())
    && !["declined", "rejected", "awarded", "backup", "not_awarded"].includes(status);
}

export function bidTemplateSourceRows(carrierBook = {}, invitation = {}, statusResolver = () => "") {
  return eventInvitedLaneRows(carrierBook, invitation)
    .filter((row) => isBidToolsEligibleRow(row, statusResolver));
}

const BID_TEMPLATE_CONTEXT_KEYS = [
  "rfx_id",
  "event_name",
  "lane_number",
  "origin",
  "destination",
  "equipment",
  "trailer",
  "config",
  "operation",
  "service",
  "weekly_volume",
  "target_rate",
  "target_currency",
  "invitation_token"
];

export function reconcileBidTemplateUploadRows(uploadRows = [], allowedRows = []) {
  const allowedByToken = new Map(
    allowedRows
      .map((row) => [String(row.invitation_token || "").trim(), row])
      .filter(([token]) => Boolean(token))
  );
  const tokenCounts = uploadRows.reduce((counts, row) => {
    const token = String(row.invitation_token || "").trim();
    if (token) counts.set(token, (counts.get(token) || 0) + 1);
    return counts;
  }, new Map());

  const rows = uploadRows.map((row) => {
    const token = String(row.invitation_token || "").trim();
    const canonical = allowedByToken.get(token);
    const scopeErrors = [];
    if (!token) {
      scopeErrors.push("Missing invitation token. Download a fresh template.");
    } else if (!canonical) {
      scopeErrors.push("This lane token is not active in the current RFx. Download a fresh template.");
    } else if ((tokenCounts.get(token) || 0) > 1) {
      scopeErrors.push("Duplicate lane token in this file. Keep only one row for this lane.");
    }

    const reconciled = { ...row, scope_errors: scopeErrors };
    if (canonical) {
      for (const key of BID_TEMPLATE_CONTEXT_KEYS) reconciled[key] = canonical[key] ?? "";
    }
    return reconciled;
  });

  const uploadedActiveTokens = new Set(
    rows
      .map((row) => String(row.invitation_token || "").trim())
      .filter((token) => allowedByToken.has(token))
  );
  const missingRows = allowedRows.filter((row) => !uploadedActiveTokens.has(String(row.invitation_token || "").trim()));
  return {
    rows,
    coverage: {
      active: allowedByToken.size,
      matched: uploadedActiveTokens.size,
      missing: missingRows.length,
      stale: rows.filter((row) => row.invitation_token && !allowedByToken.has(String(row.invitation_token).trim())).length,
      duplicate: rows.filter((row) => row.scope_errors.some((error) => error.startsWith("Duplicate"))).length,
      missing_rows: missingRows
    }
  };
}
