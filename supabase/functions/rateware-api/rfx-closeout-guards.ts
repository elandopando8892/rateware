type Row = Record<string, unknown>;

/** A calendar validity date uses the same Mexico City business day as the Bid Room. */
export function rfxOfferExpired(value: unknown, now = Date.now()): boolean {
  if (value === null || value === undefined || value === "") return false;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return true;
  const end = Date.parse(`${text}T23:59:59.999-06:00`);
  return !Number.isFinite(end) || end < now;
}

/** Preflight only: the caller must run this before changing outcomes or staging. */
export function requireEligibleRfxCloseout(
  invitations: Row[], confirmations: Row[], rubricKeys: readonly string[], now = Date.now(),
) {
  const awarded = invitations.filter(row => String(row.invitation_status || "").trim().toLowerCase() !== "archived"
    && ["primary", "backup"].includes(String(row.award_role || "").toLowerCase()));
  const rows = [...confirmations].sort((a, b) => (Date.parse(String(b.updated_at)) || 0) - (Date.parse(String(a.updated_at)) || 0));
  for (const invitation of awarded) {
    let reason = "";
    let stage = "";
    if (rfxOfferExpired(invitation.valid_through, now)) {
      reason = "Awarded offer has expired. Renew the offer or award another carrier before Rateware closeout.";
      stage = "rfx_closeout_expired";
    } else if (String((invitation.vendors as Row | null)?.status || "").toLowerCase() === "blocked") {
      reason = "An awarded carrier is blocked. Award another carrier before Rateware closeout.";
      stage = "rfx_closeout_blocked";
    }
    else {
      const lane = (invitation.rfx_lanes || {}) as Row;
      const segment = String(lane.rfx_segment_key || [lane.operation, lane.service, lane.equipment, lane.trailer].filter(Boolean).join("-") || "general")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "general";
      const own = rows.filter(row => row.rfx_lane_vendor_id === invitation.id);
      const source = own.length ? own : rows.filter(row => row.vendor_id === invitation.vendor_id && row.segment_key === segment);
      const latest = new Map<string, Row>();
      for (const row of source) if (!latest.has(String(row.rubric_key))) latest.set(String(row.rubric_key), row);
      if (rubricKeys.some(key => latest.get(key)?.answer === "disagree")) {
        reason = "An awarded carrier refused a rubric. Resolve it or award another carrier before Rateware closeout.";
        stage = "rfx_closeout_refused";
      }
      // Missing answers warn in Bidware; they do not invalidate the quote.
    }
    if (reason) throw Object.assign(new Error(reason), { code: "409", stage });
  }
}
