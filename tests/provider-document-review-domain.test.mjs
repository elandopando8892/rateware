import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableFieldDecisions, canFinalizeReview, displayableValue, groupReviewFields,
  normalizeReviewQueue, reviewIsActionable, reviewIsClaimable, reviewPriority,
  summarizeReviewQueue, validateFieldDecision,
} from '../src/provider-document-review-domain.js';

const field = (overrides = {}) => ({ field_status: 'pending', sensitivity: 'confidential', ...overrides });

test('priority bands follow the view\'s rank, restricted first', () => {
  assert.equal(reviewPriority({ priority_rank: 10 }), 'critical');
  assert.equal(reviewPriority({ priority_rank: 20 }), 'high');
  assert.equal(reviewPriority({ priority_rank: 25 }), 'overdue');
  assert.equal(reviewPriority({ priority_rank: 30 }), 'expiring');
  assert.equal(reviewPriority({ priority_rank: 50 }), 'normal');
});

test('a review is claimable only while pending and unassigned', () => {
  assert.equal(reviewIsClaimable({ review_status: 'pending' }), true);
  assert.equal(reviewIsClaimable({ review_status: 'pending', assigned_reviewer_user_id: 'someone' }), false);
  assert.equal(reviewIsClaimable({ review_status: 'in_review' }), false);
});

test('a review is actionable only by the reviewer holding it, with work left', () => {
  const row = { review_status: 'in_review', assigned_reviewer_user_id: 'me', pending_field_count: 2 };
  assert.equal(reviewIsActionable(row, 'me'), true);
  assert.equal(reviewIsActionable(row, 'someone-else'), false, 'another reviewer holds it');
  assert.equal(reviewIsActionable({ ...row, pending_field_count: 0 }, 'me'), false);
  assert.equal(reviewIsActionable({ ...row, review_status: 'pending' }, 'me'), false);
});

test('withheld is offered only for restricted material', () => {
  // The database constraint enforces the same rule; offering a button the server
  // will reject is its own defect.
  assert.ok(availableFieldDecisions(field({ sensitivity: 'restricted' })).includes('withheld'));
  assert.ok(availableFieldDecisions(field({ sensitivity: 'highly_restricted' })).includes('withheld'));
  assert.ok(!availableFieldDecisions(field({ sensitivity: 'confidential' })).includes('withheld'));
  assert.ok(!availableFieldDecisions(field({ sensitivity: 'public' })).includes('withheld'));
});

test('a decision without a note is refused before it is sent', () => {
  const result = validateFieldDecision(field(), 'accepted', {});
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'note_required');
});

test('a correction without a value is refused', () => {
  assert.equal(validateFieldDecision(field(), 'corrected', { decision_note: 'fixing' }).reason, 'correction_requires_value');
  assert.equal(validateFieldDecision(field(), 'corrected', { decision_note: 'fixing', reviewer_value: 'X' }).valid, true);
});

test('withholding a non-restricted field is refused with a reason', () => {
  const result = validateFieldDecision(field({ sensitivity: 'public' }), 'withheld', { decision_note: 'no' });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'withheld_requires_restricted_field');
});

test('an already-decided field cannot be decided again', () => {
  const result = validateFieldDecision(field({ field_status: 'accepted' }), 'rejected', { decision_note: 'x' });
  assert.equal(result.reason, 'field_already_decided');
});

test('a review cannot be finalized while any field is pending', () => {
  const result = canFinalizeReview([field(), field({ field_status: 'accepted' })]);
  assert.equal(result.can, false);
  assert.equal(result.reason, 'fields_pending');
  assert.equal(result.pending, 1);
});

test('a review carrying a rejected field cannot be approved', () => {
  const result = canFinalizeReview([field({ field_status: 'accepted' }), field({ field_status: 'rejected' })]);
  assert.equal(result.can, true);
  assert.ok(!result.allowed_decisions.includes('approved'), 'approval is not offered');
  assert.ok(result.allowed_decisions.includes('changes_required'));
});

test('a fully accepted review may be approved', () => {
  const result = canFinalizeReview([field({ field_status: 'accepted' }), field({ field_status: 'corrected' })]);
  assert.ok(result.allowed_decisions.includes('approved'));
});

test('a review with no fields cannot be finalized', () => {
  assert.deepEqual(canFinalizeReview([]), { can: false, reason: 'no_fields' });
});

test('withheld fields are grouped apart from ordinary pending work', () => {
  const grouped = groupReviewFields([
    field({ value_withheld: true }),
    field(),
    field({ field_status: 'accepted' }),
  ]);
  assert.equal(grouped.withheld.length, 1);
  assert.equal(grouped.pending.length, 1);
  assert.equal(grouped.decided.length, 1);
});

test('a withheld value is never displayed, but its existence is', () => {
  const withValue = displayableValue({ value_withheld: true, has_proposed_value: true });
  assert.equal(withValue.display, null);
  assert.equal(withValue.withheld, true);
  assert.match(withValue.hint, /withheld at this sensitivity/);

  const withoutValue = displayableValue({ value_withheld: true, has_proposed_value: false });
  assert.match(withoutValue.hint, /No value was extracted/);
});

test('an ordinary value is displayed as text', () => {
  assert.equal(displayableValue({ proposed_value: 'Synthetic Freight Systems LLC' }).display, 'Synthetic Freight Systems LLC');
  assert.equal(displayableValue({ proposed_value: null }).display, null);
});

test('the queue summary counts what an operator triages by', () => {
  const summary = summarizeReviewQueue([
    { review_status: 'pending', pending_field_count: 3, sensitivity: 'highly_restricted' },
    { review_status: 'in_review', assigned_reviewer_user_id: 'me', pending_field_count: 2, sensitivity: 'confidential' },
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.unassigned, 1);
  assert.equal(summary.in_review, 1);
  assert.equal(summary.pending_fields, 5);
  assert.equal(summary.restricted, 1);
});

test('an unknown queue name falls back to all', () => {
  assert.equal(normalizeReviewQueue('nonsense'), 'all');
  assert.equal(normalizeReviewQueue('mine'), 'mine');
});
