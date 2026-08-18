// Delivery Workspace domain.
//
// The surface an operator uses to see outbound messages: what is waiting on send
// approval, what is scheduled, what was sent, what failed, and which follow-ups
// are due. The read model (provider_onboarding_delivery_workspace) exposes
// recipient and mailbox domains only — never the local part, subject, body or
// attachment hash — and this layer never reconstructs them. Pure functions, no
// DOM, no network.

const text = (value) => (value == null ? '' : String(value).trim());
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const truthy = (value) => value === true;

export const DELIVERY_QUEUES = Object.freeze(['all', 'awaiting_approval', 'scheduled', 'sent', 'failed', 'followup_due']);

export function normalizeDeliveryQueue(value) {
  const queue = text(value).toLowerCase() || 'all';
  return DELIVERY_QUEUES.includes(queue) ? queue : 'all';
}

/** Whether a follow-up is due, computed against a caller-supplied clock. */
export function followupDue(row = {}, now = Date.now()) {
  const at = text(row.next_followup_at);
  if (!at) return false;
  const due = Date.parse(at);
  return Number.isFinite(due) && due <= now;
}

/**
 * What state the message is actually in, for the operator. A failed send is the
 * most urgent thing to see; a due follow-up next; then the ordinary lifecycle.
 */
export function deliveryPosture(row = {}, now = Date.now()) {
  const status = text(row.message_status);
  if (status === 'failed') return 'failed';
  if (status === 'sent') return followupDue(row, now) ? 'followup_due' : 'sent';
  if (status === 'approved' || status === 'queued') return 'scheduled';
  if (status === 'draft' || status === 'pending_approval') return 'awaiting_approval';
  return status || 'unknown';
}

/** Priority band for the queue rail, most urgent first. */
export function deliveryPriority(row = {}, now = Date.now()) {
  const posture = deliveryPosture(row, now);
  if (posture === 'failed') return 'critical';
  if (posture === 'followup_due') return 'attention';
  if (posture === 'awaiting_approval') return 'awaiting';
  return 'normal';
}

/**
 * Whether the message is cleared to send: an approver other than the requester
 * signed off. The read model exposes send_approved as a boolean derived from
 * approved_by_actor_id; this never treats a draft as sendable.
 */
export function sendApproved(row = {}) {
  return truthy(row.send_approved);
}

export function summarizeDelivery(rows = [], now = Date.now()) {
  const list = Array.isArray(rows) ? rows : [];
  return Object.freeze({
    total: list.length,
    awaiting_approval: list.filter((row) => deliveryPosture(row, now) === 'awaiting_approval').length,
    failed: list.filter((row) => text(row.message_status) === 'failed').length,
    followups_due: list.filter((row) => followupDue(row, now)).length,
  });
}
