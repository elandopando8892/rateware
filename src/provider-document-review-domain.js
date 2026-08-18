// Document Review domain.
//
// The surface an operator uses to turn ingested documents into reviewed canonical
// facts. Pure functions only — no DOM, no network — so the rules that decide what a
// reviewer may do are testable on their own.

const text = (value) => (value == null ? '' : String(value).trim());
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const REVIEW_QUEUES = Object.freeze(['all', 'unassigned', 'mine', 'in_review', 'blocked', 'decided']);
export const FIELD_DECISIONS = Object.freeze(['accepted', 'corrected', 'rejected', 'withheld']);

export function normalizeReviewQueue(value) {
  const queue = text(value).toLowerCase() || 'all';
  return REVIEW_QUEUES.includes(queue) ? queue : 'all';
}

/**
 * Priority band for the queue rail. The view already computes priority_rank; this
 * turns it into something an operator reads at a glance.
 */
export function reviewPriority(row = {}) {
  const rank = number(row.priority_rank);
  if (rank <= 10) return 'critical';   // highly restricted
  if (rank <= 20) return 'high';       // restricted
  if (rank <= 25) return 'overdue';
  if (rank <= 30) return 'expiring';
  return 'normal';
}

/** A review is actionable only when a reviewer holds it and work remains. */
export function reviewIsActionable(row = {}, reviewerUserId = null) {
  if (text(row.review_status) !== 'in_review') return false;
  const assignee = text(row.assigned_reviewer_user_id);
  if (!assignee) return false;
  if (reviewerUserId && assignee !== text(reviewerUserId)) return false;
  return number(row.pending_field_count) > 0;
}

/** Whether this reviewer may claim the review. */
export function reviewIsClaimable(row = {}) {
  return text(row.review_status) === 'pending' && !text(row.assigned_reviewer_user_id);
}

export function summarizeReviewQueue(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  return Object.freeze({
    total: list.length,
    unassigned: list.filter((row) => reviewIsClaimable(row)).length,
    in_review: list.filter((row) => text(row.review_status) === 'in_review').length,
    pending_fields: list.reduce((sum, row) => sum + number(row.pending_field_count), 0),
    restricted: list.filter((row) => ['restricted', 'highly_restricted'].includes(text(row.sensitivity))).length,
  });
}

/**
 * Which decisions are offered for a field.
 *
 * `withheld` exists only for restricted material — the DB constraint enforces the
 * same rule, and offering a button the server will reject is its own defect.
 * `corrected` always requires the reviewer to supply a value.
 */
export function availableFieldDecisions(field = {}) {
  const sensitivity = text(field.sensitivity);
  const restricted = ['restricted', 'highly_restricted'].includes(sensitivity);
  return Object.freeze(FIELD_DECISIONS.filter((decision) => decision !== 'withheld' || restricted));
}

/**
 * Validates a decision before it is sent.
 * Returns { valid, reason } so the surface can explain a refusal rather than
 * letting the server reject it opaquely.
 */
export function validateFieldDecision(field = {}, decision, input = {}) {
  const chosen = text(decision);
  if (!FIELD_DECISIONS.includes(chosen)) return Object.freeze({ valid: false, reason: 'unsupported_decision' });
  if (text(field.field_status) !== 'pending') return Object.freeze({ valid: false, reason: 'field_already_decided' });
  if (!availableFieldDecisions(field).includes(chosen)) return Object.freeze({ valid: false, reason: 'withheld_requires_restricted_field' });
  if (!text(input.decision_note)) return Object.freeze({ valid: false, reason: 'note_required' });
  if (chosen === 'corrected' && !text(input.reviewer_value)) return Object.freeze({ valid: false, reason: 'correction_requires_value' });
  return Object.freeze({ valid: true, reason: null });
}

/** A review may be finalized only once every field is decided. */
export function canFinalizeReview(fields = []) {
  const list = Array.isArray(fields) ? fields : [];
  if (!list.length) return Object.freeze({ can: false, reason: 'no_fields' });
  const pending = list.filter((field) => text(field.field_status) === 'pending').length;
  if (pending) return Object.freeze({ can: false, reason: 'fields_pending', pending });
  const rejected = list.filter((field) => text(field.field_status) === 'rejected').length;
  return Object.freeze({
    can: true,
    reason: null,
    // A review carrying a rejected field cannot be approved — the command enforces
    // this too; surfacing it lets the operator see why before they try.
    allowed_decisions: Object.freeze(rejected ? ['rejected', 'changes_required'] : ['approved', 'rejected', 'changes_required']),
  });
}

/** Groups fields so restricted material is visibly separated in the surface. */
export function groupReviewFields(fields = []) {
  const list = Array.isArray(fields) ? fields : [];
  const withheld = [];
  const pending = [];
  const decided = [];
  for (const field of list) {
    if (text(field.field_status) !== 'pending') decided.push(field);
    else if (field.value_withheld === true) withheld.push(field);
    else pending.push(field);
  }
  return Object.freeze({
    withheld: Object.freeze(withheld),
    pending: Object.freeze(pending),
    decided: Object.freeze(decided),
  });
}

/** What the surface may display for a field's value. */
export function displayableValue(field = {}) {
  if (field.value_withheld === true) {
    return Object.freeze({
      display: null,
      withheld: true,
      // The reviewer still learns a value exists; they open the document itself
      // through the separate audited disclosure path to see it.
      hint: field.has_proposed_value === true ? 'A value was extracted and is withheld at this sensitivity.' : 'No value was extracted.',
    });
  }
  const value = field.proposed_value;
  const display = value == null ? null : (typeof value === 'string' ? value : JSON.stringify(value));
  return Object.freeze({ display, withheld: false, hint: display ? null : 'No value was extracted.' });
}
