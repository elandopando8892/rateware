import { requirePrivatePage } from './auth.js';
import { callRatewareFunction } from './rateware-api.js';
import {
  deliveryPosture, deliveryPriority, followupDue, normalizeDeliveryQueue, sendApproved, summarizeDelivery,
} from './provider-delivery-domain.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const label = (value) => String(value || '—').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const date = (value) => { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d); };

const state = { queue: 'all', limit: 40, offset: 0, total: 0, rows: [], requestId: 0, selectedId: null };
const rowsNode = document.getElementById('delivery-rows');
const detailNode = document.getElementById('delivery-detail');
const caption = document.getElementById('delivery-caption');
const prev = document.getElementById('delivery-prev');
const next = document.getElementById('delivery-next');
const queueButtons = [...document.querySelectorAll('[data-delivery-queue]')];

const postureLabels = {
  awaiting_approval: 'Awaiting approval', scheduled: 'Scheduled', sent: 'Sent',
  failed: 'Failed', followup_due: 'Follow-up due',
};

function metric(id, value) { const node = document.getElementById(id); if (node) node.textContent = String(value ?? 0); }
function renderMetrics(serverMetrics) {
  const summary = summarizeDelivery(state.rows);
  metric('metric-total', state.total || summary.total);
  metric('metric-awaiting', serverMetrics ? serverMetrics.awaiting_approval : summary.awaiting_approval);
  metric('metric-failed', serverMetrics ? serverMetrics.failed : summary.failed);
  metric('metric-followups', serverMetrics ? serverMetrics.followups_due : summary.followups_due);
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
  if (!state.rows.length) { rowsNode.innerHTML = '<article class="ui-state"><strong>No messages in this queue</strong><p>Try another queue.</p></article>'; return; }
  rowsNode.innerHTML = state.rows.map((row) => {
    const posture = deliveryPosture(row);
    return `<button type="button" class="onboarding-row delivery-row--${escapeHtml(deliveryPriority(row))} ${state.selectedId === row.message_id ? 'is-selected' : ''}" data-delivery-id="${escapeHtml(row.message_id)}">
 <span><strong>@${escapeHtml(row.recipient_domain || '—')}</strong><small>${escapeHtml(row.has_attachment ? 'with attachment' : 'no attachment')}</small></span>
 <span><b>${escapeHtml(postureLabels[posture] || label(posture))}</b><small>${escapeHtml(row.send_approved ? 'send approved' : 'not approved')}</small></span>
 <span><b>${escapeHtml(row.thread_bound ? 'In thread' : 'New thread')}</b><small>${Number(row.send_attempts || 0)} attempt(s)</small></span>
 <span><b>${escapeHtml(date(row.sent_at || row.scheduled_at || row.created_at))}</b><small>${escapeHtml(row.next_followup_at ? `follow-up ${date(row.next_followup_at)}` : 'no follow-up')}</small></span></button>`;
  }).join('');
  rowsNode.querySelectorAll('[data-delivery-id]').forEach((button) => button.addEventListener('click', () => selectMessage(button.dataset.deliveryId)));
}

function renderDetail(row) {
  const posture = deliveryPosture(row);
  detailNode.innerHTML = `<div class="onboarding-detail-head"><p class="eyebrow">Outbound message</p><h2>@${escapeHtml(row.recipient_domain || '—')}</h2>
    <div class="onboarding-pills"><span>${escapeHtml(postureLabels[posture] || label(posture))}</span><span>${escapeHtml(row.send_approved ? 'Send approved' : 'Not approved')}</span><span>${escapeHtml(row.thread_bound ? 'In thread' : 'New thread')}</span></div></div>
    <ul class="onboarding-detail-list">
      <li><span><strong>Case</strong><small>${escapeHtml(row.case_id || '—')}</small></span></li>
      <li><span><strong>Recipient domain</strong><small>local part withheld</small></span><b>@${escapeHtml(row.recipient_domain || '—')}</b></li>
      <li><span><strong>Mailbox domain</strong><small>sending account</small></span><b>@${escapeHtml(row.mailbox_domain || '—')}</b></li>
      <li><span><strong>Attachment</strong><small>hash withheld</small></span><b>${escapeHtml(row.has_attachment ? 'Yes' : 'No')}</b></li>
      <li><span><strong>Send attempts</strong><small>${escapeHtml(row.last_error_code ? label(row.last_error_code) : 'no error')}</small></span><b>${Number(row.send_attempts || 0)}</b></li>
      <li><span><strong>Follow-up #</strong><small>${escapeHtml(followupDue(row) ? 'due now' : 'scheduled')}</small></span><b>${Number(row.followup_number || 0)}</b></li>
      <li><span><strong>Next follow-up</strong><small>${escapeHtml(date(row.next_followup_at))}</small></span></li>
      <li><span><strong>Sent</strong><small>${escapeHtml(date(row.sent_at))}</small></span></li>
    </ul>
    <div class="onboarding-guard"><strong>Recipient privacy</strong><p>Only the recipient and mailbox domains are shown — never the local part, subject, body or attachment hash. Recipient-domain policy is an explicit send-approval gate.</p></div>`;
}

async function selectMessage(messageId) {
  if (!messageId || !detailNode) return;
  state.selectedId = messageId;
  renderRows();
  const row = state.rows.find((entry) => entry.message_id === messageId);
  if (row) renderDetail(row);
}

async function loadDelivery({ preserve = false } = {}) {
  const requestId = ++state.requestId;
  if (!preserve) rowsNode.innerHTML = '<article class="ui-state ui-state-loading"><strong>Loading delivery</strong><p>Resolving the delivery workspace.</p></article>';
  try {
    const response = await callRatewareFunction('shipper-directory-api', 'list_provider_onboarding_delivery', { queue: state.queue, limit: state.limit, offset: state.offset });
    if (requestId !== state.requestId) return;
    const data = response?.data || {};
    state.rows = Array.isArray(data.rows) ? data.rows : [];
    state.total = Number(data.total || 0);
    renderMetrics(data.metrics); renderRows(); renderPagination();
    if (!preserve && state.rows[0]) selectMessage(state.rows[0].message_id);
    else if (!state.rows.length && detailNode) detailNode.innerHTML = '<div class="onboarding-empty"><strong>Select a message</strong><p>See its delivery posture and follow-up state.</p></div>';
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.rows = []; state.total = 0;
    rowsNode.innerHTML = `<article class="ui-state ui-state-error"><strong>Delivery could not load</strong><p>${escapeHtml(error?.message || 'Request failed.')}</p></article>`;
    renderMetrics(); renderPagination();
  }
}

queueButtons.forEach((button) => button.addEventListener('click', () => {
  state.queue = normalizeDeliveryQueue(button.dataset.deliveryQueue);
  state.offset = 0;
  queueButtons.forEach((other) => other.classList.toggle('is-active', other.dataset.deliveryQueue === state.queue));
  loadDelivery({ preserve: true });
}));
prev?.addEventListener('click', () => { state.offset = Math.max(0, state.offset - state.limit); loadDelivery({ preserve: true }); });
next?.addEventListener('click', () => { if (state.offset + state.limit < state.total) { state.offset += state.limit; loadDelivery({ preserve: true }); } });

await requirePrivatePage();
loadDelivery();
