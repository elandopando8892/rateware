import { requirePrivatePage } from './auth.js';
import { caseFromUrl } from './osp-case-context.js';
import { callRatewareFunction } from './rateware-api.js';
import {
  approvalPosture, approvalPriority, approvalProgress, normalizeApprovalQueue, summarizeApprovals,
} from './provider-approvals-domain.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const label = (value) => String(value || '—').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const date = (value) => { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d); };

const state = { queue: 'all', limit: 40, offset: 0, total: 0, rows: [], requestId: 0, selectedId: null };
const rowsNode = document.getElementById('approval-rows');
const detailNode = document.getElementById('approval-detail');
const caption = document.getElementById('approval-caption');
const prev = document.getElementById('approval-prev');
const next = document.getElementById('approval-next');
const queueButtons = [...document.querySelectorAll('[data-approval-queue]')];

const postureLabels = {
  awaiting: 'Awaiting approval', complete: 'Approved', changes_required: 'Changes required',
  blocked_separation: 'Blocked — separation', expired: 'Authorization expired', revoked: 'Revoked',
};

function metric(id, value) { const node = document.getElementById(id); if (node) node.textContent = String(value ?? 0); }
function renderMetrics(serverMetrics) {
  const summary = summarizeApprovals(state.rows);
  metric('metric-total', state.total || summary.total);
  metric('metric-pending', serverMetrics ? serverMetrics.pending : summary.pending);
  metric('metric-complete', summary.complete);
  metric('metric-blocked', summary.blocked);
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
  if (!state.rows.length) { rowsNode.innerHTML = '<article class="ui-state"><strong>No packages in this queue</strong><p>Try another queue.</p></article>'; return; }
  rowsNode.innerHTML = state.rows.map((row) => {
    const posture = approvalPosture(row);
    const progress = approvalProgress(row);
    return `<button type="button" class="onboarding-row approval-row--${escapeHtml(approvalPriority(row))} ${state.selectedId === row.package_id ? 'is-selected' : ''}" data-approval-id="${escapeHtml(row.package_id)}">
 <span><strong>${escapeHtml(row.package_version || row.package_id)}</strong><small>${escapeHtml(label(row.purpose_code))}</small></span>
 <span><b>${progress.approved}/${progress.required}</b><small>approved</small></span>
 <span><b>${escapeHtml(postureLabels[posture] || label(posture))}</b><small>${escapeHtml(row.manifest_bound ? 'Manifest bound' : 'No manifest')}</small></span>
 <span><b>${escapeHtml(date(row.requested_at))}</b><small>${escapeHtml(row.expires_at ? `expires ${date(row.expires_at)}` : 'no expiry')}</small></span></button>`;
  }).join('');
  rowsNode.querySelectorAll('[data-approval-id]').forEach((button) => button.addEventListener('click', () => selectPackage(button.dataset.approvalId)));
}

function renderDetail(row) {
  const posture = approvalPosture(row);
  const progress = approvalProgress(row);
  detailNode.innerHTML = `<div class="onboarding-detail-head"><p class="eyebrow">${escapeHtml(label(row.purpose_code))}</p><h2>${escapeHtml(row.package_version || row.package_id)}</h2>
    <div class="onboarding-pills"><span>${escapeHtml(postureLabels[posture] || label(posture))}</span><span>${progress.approved}/${progress.required} approved</span><span>${escapeHtml(row.manifest_bound ? 'Manifest bound' : 'No manifest')}</span></div></div>
    <ul class="onboarding-detail-list">
      <li><span><strong>Case</strong><small>${escapeHtml(row.case_id || '—')}</small></span></li>
      <li><span><strong>Revision</strong><small>${escapeHtml(String(row.revision ?? '—'))}</small></span></li>
      <li><span><strong>Required approvals</strong><small>${progress.required}</small></span><b>${progress.approved} in</b></li>
      <li><span><strong>Rejected</strong><small>votes against</small></span><b>${Number(row.rejected_count || 0)}</b></li>
      <li><span><strong>Requested</strong><small>${escapeHtml(date(row.requested_at))}</small></span></li>
      <li><span><strong>Approved at</strong><small>${escapeHtml(date(row.approved_at))}</small></span></li>
      <li><span><strong>Expires</strong><small>${escapeHtml(date(row.expires_at))}</small></span></li>
      ${row.revoked_at ? `<li><span><strong>Revoked</strong><small>${escapeHtml(label(row.revocation_reason_code))}</small></span><b>${escapeHtml(date(row.revoked_at))}</b></li>` : ''}
    </ul>
    ${posture === 'blocked_separation' ? '<div class="onboarding-next-gate onboarding-next-gate--blocked"><strong>Separation of duties</strong><p>The requester is among the approvers. This package cannot be sent no matter how many approvals it gathers — a different approver is required.</p></div>' : ''}
    <div class="onboarding-guard"><strong>Read-only</strong><p>Approving, rejecting and revoking are done by an authorized approver once approver roles are assigned. This surface shows posture; it does not act.</p></div>`;
}

async function selectPackage(packageId) {
  if (!packageId || !detailNode) return;
  state.selectedId = packageId;
  renderRows();
  const row = state.rows.find((entry) => entry.package_id === packageId);
  if (row) renderDetail(row);
}

async function loadApprovals({ preserve = false } = {}) {
  const requestId = ++state.requestId;
  if (!preserve) rowsNode.innerHTML = '<article class="ui-state ui-state-loading"><strong>Loading approvals</strong><p>Resolving the approval queue.</p></article>';
  try {
    const response = await callRatewareFunction('shipper-directory-api', 'list_provider_onboarding_approvals', { queue: state.queue, limit: state.limit, offset: state.offset });
    if (requestId !== state.requestId) return;
    const data = response?.data || {};
    state.rows = Array.isArray(data.rows) ? data.rows : [];
    state.total = Number(data.total || 0);
    renderMetrics(data.metrics); renderRows(); renderPagination();
    if (!preserve) {
      // Opened from the shell for a specific case: land on that case's row rather than
      // whichever happens to be first. Pagination means the row may not be on this page;
      // that is said out loud instead of silently falling back.
      const workingCase = caseFromUrl();
      const match = workingCase ? state.rows.find((row) => row.case_id === workingCase) : null;
      if (match) selectPackage(match.package_id);
      else if (state.rows[0]) selectPackage(state.rows[0].package_id);
      if (workingCase && !match) setCaseNotice(state.rows.length
        ? 'The case you are working is not on this page.'
        : 'The case you are working has nothing here.');
      else setCaseNotice('');
    }
    else if (!state.rows.length && detailNode) detailNode.innerHTML = '<div class="onboarding-empty"><strong>Select a package</strong><p>See its approval posture and manifest binding.</p></div>';
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.rows = []; state.total = 0;
    rowsNode.innerHTML = `<article class="ui-state ui-state-error"><strong>Approvals could not load</strong><p>${escapeHtml(error?.message || 'Request failed.')}</p></article>`;
    renderMetrics(); renderPagination();
  }
}

queueButtons.forEach((button) => button.addEventListener('click', () => {
  state.queue = normalizeApprovalQueue(button.dataset.approvalQueue);
  state.offset = 0;
  queueButtons.forEach((other) => other.classList.toggle('is-active', other.dataset.approvalQueue === state.queue));
  loadApprovals({ preserve: true });
}));
prev?.addEventListener('click', () => { state.offset = Math.max(0, state.offset - state.limit); loadApprovals({ preserve: true }); });
next?.addEventListener('click', () => { if (state.offset + state.limit < state.total) { state.offset += state.limit; loadApprovals({ preserve: true }); } });

function setCaseNotice(message) {
  let node = document.getElementById('osp-case-notice');
  if (!message) { node?.remove(); return; }
  if (!node) {
    node = document.createElement('p');
    node.id = 'osp-case-notice';
    node.className = 'osp-case-notice';
    rowsNode?.parentNode?.insertBefore(node, rowsNode);
  }
  node.textContent = message;
}

await requirePrivatePage();
loadApprovals();
