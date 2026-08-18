// Approval Center domain.
//
// The surface an operator uses to see which release packages are waiting on
// approval, which are complete, and — the part that is easy to get wrong — which
// look complete but are not actionable because the requester also approved. The
// read model (provider_onboarding_approval_queue) computes the counts and the
// separation-of-duties flag; this layer turns them into what an operator reads.
// Pure functions, no DOM, no network.

const text = (value) => (value == null ? '' : String(value).trim());
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const truthy = (value) => value === true;

export const APPROVAL_QUEUES = Object.freeze(['all', 'pending', 'approved', 'expired', 'revoked']);

export function normalizeApprovalQueue(value) {
  const queue = text(value).toLowerCase() || 'all';
  return APPROVAL_QUEUES.includes(queue) ? queue : 'all';
}

/** approved of required, with what is left to reach the threshold. */
export function approvalProgress(row = {}) {
  const approved = number(row.approved_count);
  const required = Math.max(1, number(row.required_approval_count));
  return Object.freeze({ approved, required, remaining: Math.max(0, required - approved) });
}

/**
 * What actually stands between this package and being sendable. Order matters:
 * a revoked package is dead regardless of its counts; an expired authorization
 * cannot be used however many approvals it has; a separation conflict makes an
 * otherwise-complete package unactionable; only then does the count matter.
 */
export function approvalPosture(row = {}) {
  if (text(row.revoked_at)) return 'revoked';
  if (truthy(row.authorization_expired)) return 'expired';
  // A package whose only approver is also its requester can never be sent — the
  // table constraint refuses that write. Surfacing it stops an operator waiting
  // on an approval that will never satisfy the rule.
  if (truthy(row.separation_conflict)) return 'blocked_separation';
  if (truthy(row.approval_complete)) return 'complete';
  if (number(row.rejected_count) > 0) return 'changes_required';
  return 'awaiting';
}

/** Priority band for the queue rail, most urgent first. */
export function approvalPriority(row = {}) {
  const posture = approvalPosture(row);
  if (posture === 'blocked_separation') return 'critical';
  if (posture === 'expired' || posture === 'revoked') return 'expired';
  if (posture === 'changes_required') return 'attention';
  if (posture === 'awaiting') return 'awaiting';
  return 'normal';
}

/** A package is actionable by an approver only while genuinely pending. */
export function approvalIsActionable(row = {}) {
  return approvalPosture(row) === 'awaiting' && !truthy(row.authorization_expired) && !text(row.revoked_at);
}

export function summarizeApprovals(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  return Object.freeze({
    total: list.length,
    pending: list.filter((row) => approvalPosture(row) === 'awaiting').length,
    complete: list.filter((row) => approvalPosture(row) === 'complete').length,
    blocked: list.filter((row) => ['blocked_separation', 'expired', 'revoked'].includes(approvalPosture(row))).length,
  });
}
