import { requirePrivatePage } from './auth.js';
import { callOsp } from './osp-api.js';
import {
  availableFieldDecisions, canFinalizeReview, displayableValue, groupReviewFields,
  normalizeReviewQueue, reviewIsClaimable, reviewPriority, summarizeReviewQueue, validateFieldDecision,
} from './provider-document-review-domain.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const label = (value) => String(value || '—').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const date = (value) => { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d); };

const state = { queue: 'all', limit: 40, offset: 0, total: 0, rows: [], requestId: 0, selectedId: null, fields: [], busy: false };
const rowsNode = document.getElementById('review-rows');
const detailNode = document.getElementById('review-detail');
const caption = document.getElementById('review-caption');
const prev = document.getElementById('review-prev');
const next = document.getElementById('review-next');
const queueButtons = [...document.querySelectorAll('[data-review-queue]')];

function metric(id, value) { const node = document.getElementById(id); if (node) node.textContent = String(value ?? 0); }
function renderMetrics() {
  const summary = summarizeReviewQueue(state.rows);
  metric('metric-total', state.total || summary.total);
  metric('metric-unassigned', summary.unassigned);
  metric('metric-inreview', summary.in_review);
  metric('metric-fields', summary.pending_fields);
}
function renderPagination() {
  const start = state.total ? state.offset + 1 : 0;
  const end = Math.min(state.offset + state.rows.length, state.total);
  if (caption) caption.textContent = `${start}–${end} of ${state.total}`;
  if (prev) prev.disabled = state.offset <= 0;
  if (next) next.disabled = state.offset + state.limit >= state.total;
}
function renderRows() {
  if (!rowsNode) return;
  if (!state.rows.length) { rowsNode.innerHTML = '<article class="ui-state"><strong>No documents in this queue</strong><p>Try another queue.</p></article>'; return; }
  rowsNode.innerHTML = state.rows.map((row) => `<button type="button" class="onboarding-row review-row--${escapeHtml(reviewPriority(row))} ${state.selectedId === row.review_id ? 'is-selected' : ''}" data-review-id="${escapeHtml(row.review_id)}">
 <span><strong>${escapeHtml(row.document_name || row.document_type)}</strong><small>${escapeHtml(label(row.document_type))} · ${escapeHtml(label(row.review_reason))}</small></span>
 <span><b>${escapeHtml(row.legal_entity_code || '—')}</b><small>Requested ${escapeHtml(date(row.requested_at))}</small></span>
 <span><b>${escapeHtml(label(row.sensitivity))}</b><small>${escapeHtml(label(row.review_status))}</small></span>
 <span><b>${Number(row.pending_field_count || 0)} pending</b><small>of ${Number(row.field_count || 0)} fields</small></span></button>`).join('');
  rowsNode.querySelectorAll('[data-review-id]').forEach((button) => button.addEventListener('click', () => selectReview(button.dataset.reviewId)));
}

function fieldCard(field) {
  const value = displayableValue(field);
  const decided = field.field_status !== 'pending';
  const decisions = availableFieldDecisions(field);
  const valueMarkup = value.withheld
    ? `<em class="review-withheld">Value withheld</em><small>${escapeHtml(value.hint)}</small>`
    : (value.display ? `<code>${escapeHtml(value.display)}</code>` : `<small>${escapeHtml(value.hint || 'No value')}</small>`);
  const controls = decided
    ? `<p class="review-decided">${escapeHtml(label(field.field_status))} · ${escapeHtml(date(field.decided_at))}</p>`
    : `<div class="review-actions">
        <input type="text" data-note-for="${escapeHtml(field.field_id)}" placeholder="Reason (required)" aria-label="Decision reason" />
        <input type="text" data-value-for="${escapeHtml(field.field_id)}" placeholder="Corrected value" aria-label="Corrected value" />
        ${decisions.map((decision) => `<button type="button" class="review-decide review-decide--${escapeHtml(decision)}" data-decide="${escapeHtml(decision)}" data-field="${escapeHtml(field.field_id)}">${escapeHtml(label(decision))}</button>`).join('')}
       </div>`;
  return `<li class="review-field review-field--${escapeHtml(field.field_status)}">
    <span><strong>${escapeHtml(label(field.field_code))}</strong><small>${escapeHtml(label(field.sensitivity))}</small>${valueMarkup}</span>
    ${controls}</li>`;
}

function renderDetail(review, fields) {
  const grouped = groupReviewFields(fields);
  const finalize = canFinalizeReview(fields);
  const section = (title, list) => list.length ? `<section><h3>${escapeHtml(title)} <small>${list.length}</small></h3><ul class="review-fields">${list.map(fieldCard).join('')}</ul></section>` : '';
  const claimable = reviewIsClaimable(review);
  detailNode.innerHTML = `<div class="onboarding-detail-head"><p class="eyebrow">${escapeHtml(label(review.document_type))}</p><h2>${escapeHtml(review.document_name || review.document_type)}</h2>
    <div class="onboarding-pills"><span>${escapeHtml(label(review.sensitivity))}</span><span>${escapeHtml(label(review.review_status))}</span><span>${Number(review.pending_field_count || 0)} pending</span></div></div>
    ${claimable ? '<div class="onboarding-next-gate onboarding-next-gate--open"><strong>Unclaimed</strong><p>Claim this document to start deciding its fields.</p><button type="button" id="review-claim">Claim review</button></div>' : ''}
    ${section('Awaiting decision', grouped.pending)}
    ${section('Withheld — restricted', grouped.withheld)}
    ${section('Decided', grouped.decided)}
    <div class="review-finalize">
      <strong>Finalize</strong>
      <p>${escapeHtml(finalize.can ? 'Every field is decided.' : finalize.reason === 'fields_pending' ? `${finalize.pending} field(s) still pending.` : 'No fields to decide.')}</p>
      ${finalize.can ? `<input type="text" id="finalize-note" placeholder="Decision reason (required)" aria-label="Finalize reason" />${finalize.allowed_decisions.map((decision) => `<button type="button" class="review-finalize-action" data-finalize="${escapeHtml(decision)}">${escapeHtml(label(decision))}</button>`).join('')}` : ''}
    </div>
    <div class="onboarding-guard"><strong>Disclosure boundary</strong><p>Restricted values are withheld from this screen. Deciding a field records who decided it, when, and why.</p></div>`;

  detailNode.querySelector('#review-claim')?.addEventListener('click', () => claimReview(review.review_id));
  detailNode.querySelectorAll('[data-decide]').forEach((button) => button.addEventListener('click', () => decideField(review, button.dataset.field, button.dataset.decide)));
  detailNode.querySelectorAll('[data-finalize]').forEach((button) => button.addEventListener('click', () => finalizeReview(review, button.dataset.finalize)));
}

function reviewError(message) {
  const banner = document.createElement('p');
  banner.className = 'review-error';
  banner.setAttribute('role', 'alert');
  banner.textContent = message;
  detailNode.prepend(banner);
  setTimeout(() => banner.remove(), 6000);
}

async function selectReview(reviewId) {
  if (!reviewId || !detailNode) return;
  state.selectedId = reviewId;
  renderRows();
  detailNode.innerHTML = '<div class="onboarding-empty">Loading document…</div>';
  const review = state.rows.find((row) => row.review_id === reviewId);
  try {
    const response = await callOsp('list_provider_onboarding_field_review', { review_id: reviewId });
    if (state.selectedId !== reviewId) return;
    state.fields = Array.isArray(response?.data?.rows) ? response.data.rows : [];
    renderDetail(review || {}, state.fields);
  } catch (error) {
    if (state.selectedId !== reviewId) return;
    detailNode.innerHTML = `<div class="ui-state ui-state-error"><strong>Document could not load</strong><p>${escapeHtml(error?.message || 'Request failed.')}</p></div>`;
  }
}

async function runCommand(action, payload, onDone) {
  if (state.busy) return;
  state.busy = true;
  try {
    await callOsp(action, payload);
    await onDone();
  } catch (error) {
    reviewError(error?.message || 'The command was rejected.');
  } finally {
    state.busy = false;
  }
}

const claimReview = (reviewId) => runCommand('claim_provider_entity_document_review',
  { review_id: reviewId, expected_revision: 1 },
  async () => { await loadReviews({ preserve: true }); await selectReview(reviewId); });

async function decideField(review, fieldId, decision) {
  const field = state.fields.find((item) => item.field_id === fieldId);
  const note = detailNode.querySelector(`[data-note-for="${fieldId}"]`)?.value || '';
  const reviewerValue = detailNode.querySelector(`[data-value-for="${fieldId}"]`)?.value || '';
  // Validated here so a refusal is explained, rather than arriving as an opaque
  // server error after a round trip.
  const check = validateFieldDecision(field || {}, decision, { decision_note: note, reviewer_value: reviewerValue });
  if (!check.valid) {
    reviewError({
      note_required: 'A reason is required for every decision.',
      correction_requires_value: 'A correction needs the corrected value.',
      withheld_requires_restricted_field: 'Only restricted fields may be withheld.',
      field_already_decided: 'This field was already decided.',
    }[check.reason] || 'That decision is not allowed.');
    return;
  }
  await runCommand('decide_provider_entity_review_field', {
    review_id: review.review_id, field_id: fieldId, decision,
    decision_note: note, reviewer_value: decision === 'corrected' ? reviewerValue : undefined,
    expected_revision: Number(review.revision || 1),
  }, async () => { await selectReview(review.review_id); });
}

async function finalizeReview(review, decision) {
  const note = detailNode.querySelector('#finalize-note')?.value || '';
  if (!note.trim()) { reviewError('A reason is required to finalize.'); return; }
  await runCommand('finalize_provider_entity_document_review', {
    review_id: review.review_id, decision, decision_note: note,
    expected_revision: Number(review.revision || 1),
  }, async () => { await loadReviews({ preserve: true }); });
}

async function loadReviews({ preserve = false } = {}) {
  const requestId = ++state.requestId;
  if (!preserve) rowsNode.innerHTML = '<article class="ui-state ui-state-loading"><strong>Loading reviews</strong><p>Resolving the review queue.</p></article>';
  try {
    const response = await callOsp('list_provider_document_reviews', { queue: state.queue, limit: state.limit, offset: state.offset });
    if (requestId !== state.requestId) return;
    const data = response?.data || {};
    state.rows = Array.isArray(data.rows) ? data.rows : [];
    state.total = Number(data.total || 0);
    renderMetrics(); renderRows(); renderPagination();
    if (!preserve && state.rows[0]) selectReview(state.rows[0].review_id);
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.rows = []; state.total = 0;
    rowsNode.innerHTML = `<article class="ui-state ui-state-error"><strong>Reviews could not load</strong><p>${escapeHtml(error?.message || 'Request failed.')}</p></article>`;
    renderMetrics(); renderPagination();
  }
}

queueButtons.forEach((button) => button.addEventListener('click', () => {
  state.queue = normalizeReviewQueue(button.dataset.reviewQueue);
  state.offset = 0;
  queueButtons.forEach((other) => other.classList.toggle('is-active', other.dataset.reviewQueue === state.queue));
  loadReviews({ preserve: true });
}));
prev?.addEventListener('click', () => { state.offset = Math.max(0, state.offset - state.limit); loadReviews({ preserve: true }); });
next?.addEventListener('click', () => { if (state.offset + state.limit < state.total) { state.offset += state.limit; loadReviews({ preserve: true }); } });

await requirePrivatePage();
loadReviews();
