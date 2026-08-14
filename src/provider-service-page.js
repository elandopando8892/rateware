import { callRatewareFunction } from './rateware-api.js';
import { renderProviderService360, loadProviderService360 } from './provider-service-360.js';
import {
  normalizeProviderServiceQueue,
  providerServiceHealthLabel,
  providerServiceRowSignals,
  shouldReplaceProviderServiceMetrics,
  sortProviderServiceRows,
  summarizeProviderServiceRows,
} from './provider-service-page-domain.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const label = (value) => String(value || '—').replaceAll('_',' ').replace(/\b\w/g, (char) => char.toUpperCase());
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const state = {
  queue: 'all',
  search: '',
  legalEntityId: '',
  limit: 50,
  offset: 0,
  total: 0,
  rows: [],
  metrics: {},
  requestId: 0,
  selectedVendorId: null,
  selectedLegalEntityId: null,
};

const queueButtons = [...document.querySelectorAll('[data-provider-queue]')];
const searchInput = document.getElementById('provider-service-search');
const entitySelect = document.getElementById('provider-service-entity');
const rowsContainer = document.getElementById('provider-service-rows');
const detailContainer = document.getElementById('provider-service-detail');
const resultCaption = document.getElementById('provider-service-result-caption');
const prevButton = document.getElementById('provider-service-prev');
const nextButton = document.getElementById('provider-service-next');

function metric(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = String(value ?? 0);
}

function renderMetrics() {
  const summary = summarizeProviderServiceRows(state.rows, state.metrics);
  metric('provider-metric-relationships', summary.relationships);
  metric('provider-metric-critical', summary.critical);
  metric('provider-metric-attention', summary.attention);
  metric('provider-metric-replies', summary.needsReply);
  metric('provider-metric-approvals', summary.pendingApprovals);
  metric('provider-metric-blocked', summary.blockedActivation);
}

function renderRows() {
  if (!rowsContainer) return;
  const rows = sortProviderServiceRows(state.rows);
  if (!rows.length) {
    rowsContainer.innerHTML = '<article class="ui-state"><strong>No relationships in this queue</strong><p>Try another queue, entity, or search term.</p></article>';
    return;
  }

  rowsContainer.innerHTML = rows.map((row) => {
    const health = providerServiceHealthLabel(row);
    const score = row.health_score == null ? '—' : Math.round(number(row.health_score));
    const signals = providerServiceRowSignals(row);
    const selected = state.selectedVendorId === row.vendor_id && state.selectedLegalEntityId === row.legal_entity_id;
    return `<button type="button" class="provider-service-row provider-service-row--${escapeHtml(row.attention_state || 'watch')} ${selected ? 'is-selected' : ''}" data-provider-vendor="${escapeHtml(row.vendor_id)}" data-provider-entity="${escapeHtml(row.legal_entity_id)}">
      <span class="provider-service-row-main">
        <strong>${escapeHtml(row.vendor_name || row.vendor_legal_name || row.vendor_code || 'Provider')}</strong>
        <small>${escapeHtml(row.vendor_code || '')} · ${escapeHtml(row.legal_entity_code || '')}</small>
      </span>
      <span class="provider-service-row-state"><b>${escapeHtml(label(row.attention_state))}</b><small>${escapeHtml(label(health))} ${escapeHtml(score)}</small></span>
      <span class="provider-service-row-stage"><b>${escapeHtml(label(row.lifecycle_status))}</b><small>${escapeHtml(label(row.activation_status))}</small></span>
      <span class="provider-service-row-signal"><b>${escapeHtml(signals[0])}</b><small>${escapeHtml(signals.slice(1, 3).join(' · '))}</small></span>
    </button>`;
  }).join('');

  rowsContainer.querySelectorAll('[data-provider-vendor]').forEach((button) => {
    button.addEventListener('click', () => selectProvider(button.dataset.providerVendor, button.dataset.providerEntity));
  });
}

function renderPagination() {
  const start = state.total ? state.offset + 1 : 0;
  const end = Math.min(state.offset + state.rows.length, state.total);
  if (resultCaption) resultCaption.textContent = `${start}–${end} of ${state.total}`;
  if (prevButton) prevButton.disabled = state.offset <= 0;
  if (nextButton) nextButton.disabled = state.offset + state.limit >= state.total;
}

async function selectProvider(vendorId, legalEntityId) {
  if (!vendorId || !detailContainer) return;
  state.selectedVendorId = vendorId;
  state.selectedLegalEntityId = legalEntityId || null;
  renderRows();
  detailContainer.innerHTML = '<div class="provider360-loading">Loading Provider 360…</div>';
  const selection = `${vendorId}:${legalEntityId || ''}`;
  try {
    const payload = await loadProviderService360(vendorId, legalEntityId || null);
    if (`${state.selectedVendorId}:${state.selectedLegalEntityId || ''}` !== selection) return;
    renderProviderService360(detailContainer, payload);
  } catch (error) {
    if (`${state.selectedVendorId}:${state.selectedLegalEntityId || ''}` !== selection) return;
    detailContainer.innerHTML = `<div class="provider360-error">${escapeHtml(error?.message || 'Provider 360 could not be loaded.')}</div>`;
  }
}

function syncQueueUi() {
  queueButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.providerQueue === state.queue));
}

async function loadCommandCenter({ preserveSelection = false } = {}) {
  const requestId = ++state.requestId;
  if (rowsContainer) rowsContainer.innerHTML = '<article class="ui-state ui-state-loading"><strong>Loading Provider Service</strong><p>Resolving relationships, cases, documents, communications and health.</p></article>';

  try {
    const response = await callRatewareFunction('shipper-directory-api', 'list_provider_service_command_center', {
      queue: state.queue,
      search: state.search || undefined,
      legal_entity_id: state.legalEntityId || undefined,
      limit: state.limit,
      offset: state.offset,
    });
    if (requestId !== state.requestId) return;
    const data = response?.data || {};
    state.rows = Array.isArray(data.rows) ? data.rows : [];
    if (shouldReplaceProviderServiceMetrics({
      queue: state.queue,
      search: state.search,
      metrics: data.metrics,
      currentMetrics: state.metrics,
    })) {
      state.metrics = data.metrics || {};
    }
    state.total = number(data.total);
    if (!preserveSelection && !state.rows.some((row) => row.vendor_id === state.selectedVendorId && row.legal_entity_id === state.selectedLegalEntityId)) {
      state.selectedVendorId = null;
      state.selectedLegalEntityId = null;
      if (detailContainer) detailContainer.innerHTML = '<div class="provider-service-detail-empty"><strong>Select a provider</strong><p>Open a relationship to inspect its activation, documents, cases and recent activity.</p></div>';
    }
    renderMetrics();
    renderRows();
    renderPagination();
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.rows = [];
    state.total = 0;
    if (rowsContainer) rowsContainer.innerHTML = `<article class="ui-state ui-state-error"><strong>Provider Service could not load</strong><p>${escapeHtml(error?.message || 'Request failed.')}</p></article>`;
    renderMetrics();
    renderPagination();
  }
}

queueButtons.forEach((button) => button.addEventListener('click', () => {
  state.queue = normalizeProviderServiceQueue(button.dataset.providerQueue);
  state.offset = 0;
  syncQueueUi();
  loadCommandCenter({ preserveSelection: true });
}));

let searchTimer = null;
searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = searchInput.value.trim();
    state.offset = 0;
    loadCommandCenter({ preserveSelection: true });
  }, 250);
});

entitySelect?.addEventListener('change', () => {
  state.legalEntityId = entitySelect.value || '';
  state.offset = 0;
  loadCommandCenter({ preserveSelection: false });
});

prevButton?.addEventListener('click', () => {
  state.offset = Math.max(0, state.offset - state.limit);
  loadCommandCenter({ preserveSelection: true });
});

nextButton?.addEventListener('click', () => {
  if (state.offset + state.limit >= state.total) return;
  state.offset += state.limit;
  loadCommandCenter({ preserveSelection: true });
});

syncQueueUi();
loadCommandCenter();
