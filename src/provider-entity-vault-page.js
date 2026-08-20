import { requirePrivatePage } from './auth.js';
import { callOsp } from './osp-api.js';
import {
  disclosureDisposition, expiryLabel, formatFileSize, normalizeVaultQueue,
  summarizeVault, vaultPriority,
} from './provider-entity-vault-domain.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const label = (value) => String(value || '—').replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const date = (value) => { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d); };

const state = { queue: 'all', search: '', limit: 40, offset: 0, total: 0, rows: [], requestId: 0, selectedId: null };
const rowsNode = document.getElementById('vault-rows');
const detailNode = document.getElementById('vault-detail');
const caption = document.getElementById('vault-caption');
const prev = document.getElementById('vault-prev');
const next = document.getElementById('vault-next');
const searchInput = document.getElementById('vault-search');
const queueButtons = [...document.querySelectorAll('[data-vault-queue]')];

function metric(id, value) { const node = document.getElementById(id); if (node) node.textContent = String(value ?? 0); }
function renderMetrics(serverMetrics) {
  const summary = serverMetrics || summarizeVault(state.rows);
  metric('metric-total', state.total || summary.total);
  metric('metric-expired', summary.expired);
  metric('metric-unverified', summary.unverified);
  metric('metric-restricted', summary.restricted);
}
function renderPagination() {
  const start = state.total ? state.offset + 1 : 0;
  const end = Math.min(state.offset + state.rows.length, state.total);
  if (caption) caption.textContent = `${start}–${end} of ${state.total}`;
  if (prev) prev.disabled = state.offset <= 0;
  if (next) next.disabled = state.offset + state.limit >= state.total;
}

const dispositionLabels = {
  releasable: 'Releasable', requires_approval: 'Needs approval',
  blocked_unverified: 'Unverified', blocked_expired: 'Expired',
};

function renderRows() {
  if (!rowsNode) return;
  if (!state.rows.length) { rowsNode.innerHTML = '<article class="ui-state"><strong>No documents in this queue</strong><p>Try another queue or clear the search.</p></article>'; return; }
  rowsNode.innerHTML = state.rows.map((row) => {
    const disposition = disclosureDisposition(row);
    return `<button type="button" class="onboarding-row vault-row--${escapeHtml(vaultPriority(row))} ${state.selectedId === row.id ? 'is-selected' : ''}" data-vault-id="${escapeHtml(row.id)}">
 <span><strong>${escapeHtml(row.document_name || row.document_type)}</strong><small>${escapeHtml(label(row.document_type))} · ${escapeHtml(label(row.sensitivity))}</small></span>
 <span><b>${escapeHtml(row.legal_entity_code || row.legal_entity_id || '—')}</b><small>${escapeHtml(expiryLabel(row))}</small></span>
 <span><b>${escapeHtml(label(row.verification_status))}</b><small>${escapeHtml(date(row.expiration_date))}</small></span>
 <span><span class="vault-disposition vault-disposition--${escapeHtml(disposition)}">${escapeHtml(dispositionLabels[disposition] || label(disposition))}</span></span></button>`;
  }).join('');
  rowsNode.querySelectorAll('[data-vault-id]').forEach((button) => button.addEventListener('click', () => selectDocument(button.dataset.vaultId)));
}

function metaCell(title, value) {
  return `<div><small>${escapeHtml(title)}</small><strong>${escapeHtml(value)}</strong></div>`;
}

function renderDetail(row) {
  const disposition = disclosureDisposition(row);
  detailNode.innerHTML = `<div class="onboarding-detail-head"><p class="eyebrow">${escapeHtml(label(row.document_type))}</p><h2>${escapeHtml(row.document_name || row.document_type)}</h2>
    <div class="onboarding-pills"><span>${escapeHtml(label(row.sensitivity))}</span><span>${escapeHtml(label(row.verification_status))}</span><span>${escapeHtml(expiryLabel(row))}</span></div></div>
    <p><span class="vault-disposition vault-disposition--${escapeHtml(disposition)}">${escapeHtml(dispositionLabels[disposition] || label(disposition))}</span></p>
    <div class="vault-meta-grid">
      ${metaCell('Legal entity', row.legal_entity_code || row.legal_entity_id || '—')}
      ${metaCell('Lifecycle', label(row.lifecycle_status))}
      ${metaCell('Release policy', label(row.release_policy))}
      ${metaCell('Issuer', row.issuer_name || '—')}
      ${metaCell('Effective', date(row.effective_date))}
      ${metaCell('Expiration', date(row.expiration_date))}
      ${metaCell('File type', row.mime_type || '—')}
      ${metaCell('File size', formatFileSize(row.file_size_bytes))}
      ${metaCell('Packaged', `${Number(row.package_use_count || 0)} time(s)`)}
      ${metaCell('Last packaged', date(row.last_packaged_at))}
    </div>
    <div class="onboarding-guard"><strong>Disclosure boundary</strong><p>${disposition === 'releasable'
      ? 'This document is verified and in policy. It may be shared by reference or copy through an approved release package.'
      : disposition === 'requires_approval'
        ? 'This is restricted material. Sharing it requires an explicit human release decision, recorded against the package and recipient.'
        : disposition === 'blocked_expired'
          ? 'This document has expired. It must be re-collected before it can be shared.'
          : 'This document is not yet verified. Nothing may be shared from it until a reviewer verifies it.'}</p></div>`;
}

async function selectDocument(documentId) {
  if (!documentId || !detailNode) return;
  state.selectedId = documentId;
  renderRows();
  const row = state.rows.find((entry) => entry.id === documentId);
  if (row) renderDetail(row);
}

async function loadVault({ preserve = false } = {}) {
  const requestId = ++state.requestId;
  if (!preserve) rowsNode.innerHTML = '<article class="ui-state ui-state-loading"><strong>Loading vault</strong><p>Resolving canonical documents.</p></article>';
  try {
    const response = await callOsp('list_provider_entity_vault', { queue: state.queue, search: state.search || undefined, limit: state.limit, offset: state.offset });
    if (requestId !== state.requestId) return;
    const data = response?.data || {};
    state.rows = Array.isArray(data.rows) ? data.rows : [];
    state.total = Number(data.total || 0);
    renderMetrics(data.metrics); renderRows(); renderPagination();
    if (!preserve && state.rows[0]) selectDocument(state.rows[0].id);
    else if (!state.rows.length && detailNode) detailNode.innerHTML = '<div class="onboarding-empty"><strong>Select a document</strong><p>See its metadata, verification and disclosure posture.</p></div>';
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.rows = []; state.total = 0;
    rowsNode.innerHTML = `<article class="ui-state ui-state-error"><strong>Vault could not load</strong><p>${escapeHtml(error?.message || 'Request failed.')}</p></article>`;
    renderMetrics(); renderPagination();
  }
}

queueButtons.forEach((button) => button.addEventListener('click', () => {
  state.queue = normalizeVaultQueue(button.dataset.vaultQueue);
  state.offset = 0;
  queueButtons.forEach((other) => other.classList.toggle('is-active', other.dataset.vaultQueue === state.queue));
  loadVault({ preserve: true });
}));

let searchTimer = null;
searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = searchInput.value.trim(); state.offset = 0; loadVault({ preserve: true }); }, 250);
});
prev?.addEventListener('click', () => { state.offset = Math.max(0, state.offset - state.limit); loadVault({ preserve: true }); });
next?.addEventListener('click', () => { if (state.offset + state.limit < state.total) { state.offset += state.limit; loadVault({ preserve: true }); } });

await requirePrivatePage();
loadVault();
