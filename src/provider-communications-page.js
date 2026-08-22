import { requirePrivatePage } from './auth.js';
import { callRatewareFunction } from './rateware-api.js';
import { updatePlatform55Shell } from './platform55-shell.js';
import {
  communicationProviderLabel,
  communicationThreadSignals,
  normalizeCommunicationQueue,
  shouldReplaceCommunicationMetrics,
  sortCommunicationThreads,
  summarizeCommunicationThreads,
} from './provider-communications-page-domain.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const label = (value) => String(value || '—').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const dateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};
const bytes = (value) => {
  const size = number(value);
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const state = {
  queue: 'all',
  search: '',
  limit: 50,
  offset: 0,
  total: 0,
  rows: [],
  metrics: {},
  requestId: 0,
  selectedThreadId: null,
  detailRequestId: 0,
};

const queueButtons = [...document.querySelectorAll('[data-communication-queue]')];
const searchInput = document.getElementById('communications-search');
const rowsContainer = document.getElementById('communications-rows');
const detailContainer = document.getElementById('communications-detail');
const resultCaption = document.getElementById('communications-result-caption');
const prevButton = document.getElementById('communications-prev');
const nextButton = document.getElementById('communications-next');

function updateProviderCommunicationsShell(status, busy = false) {
  updatePlatform55Shell({ pageState: {
    title: 'Communications Inbox',
    subtitle: 'Read-only provider threads, matching evidence, and communication history.',
    breadcrumbs: ['Service', 'Provider Communications'],
    status,
    busy,
  } });
}

function metric(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = String(value ?? 0);
}

function renderMetrics() {
  const summary = summarizeCommunicationThreads(state.rows, state.metrics);
  metric('communication-metric-threads', summary.threads);
  metric('communication-metric-unmatched', summary.unmatched);
  metric('communication-metric-review', summary.needsReview);
  metric('communication-metric-reply', summary.needsReply);
  metric('communication-metric-xbf', summary.waitingXbf);
  metric('communication-metric-external', summary.waitingExternal);
  metric('communication-metric-resolved', summary.resolved);
}

function renderRows() {
  if (!rowsContainer) return;
  const rows = sortCommunicationThreads(state.rows);
  if (!rows.length) {
    rowsContainer.innerHTML = '<article class="ui-state"><strong>No threads in this queue</strong><p>Try another queue or search term.</p></article>';
    return;
  }

  rowsContainer.innerHTML = rows.map((row) => {
    const signals = communicationThreadSignals(row);
    const selected = state.selectedThreadId === row.thread_id;
    const provider = communicationProviderLabel(row);
    return `<button type="button" class="communications-row ${selected ? 'is-selected' : ''}" data-communication-thread="${escapeHtml(row.thread_id)}">
      <span class="communications-row-main">
        <strong>${escapeHtml(provider)}</strong>
        <small>${escapeHtml(row.subject || '(No subject)')}</small>
      </span>
      <span class="communications-row-state">
        <b>${escapeHtml(label(row.queue_code))}</b>
        <small>${escapeHtml(label(row.communication_status))} · ${escapeHtml(label(row.matching_status))}</small>
      </span>
      <span class="communications-row-signals">
        <span>${escapeHtml(signals[0])}</span>
        <small>${escapeHtml(signals.slice(1, 3).join(' · '))}</small>
      </span>
      <span class="communications-row-time">
        <b>${escapeHtml(dateTime(row.last_message_at || row.updated_at))}</b>
        <small>${number(row.message_count)} msg · ${number(row.attachment_count)} files</small>
      </span>
    </button>`;
  }).join('');

  rowsContainer.querySelectorAll('[data-communication-thread]').forEach((button) => {
    button.addEventListener('click', () => selectThread(button.dataset.communicationThread));
  });
}

function renderPagination() {
  const start = state.total ? state.offset + 1 : 0;
  const end = Math.min(state.offset + state.rows.length, state.total);
  if (resultCaption) resultCaption.textContent = `${start}–${end} of ${state.total}`;
  if (prevButton) prevButton.disabled = state.offset <= 0;
  if (nextButton) nextButton.disabled = state.offset + state.limit >= state.total;
}

function syncQueueUi() {
  queueButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.communicationQueue === state.queue));
}

function renderThreadDetail(payload = {}) {
  if (!detailContainer) return;
  const thread = payload.thread || {};
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const candidates = Array.isArray(payload.match_candidates) ? payload.match_candidates : [];
  const caseLinks = Array.isArray(payload.case_links) ? payload.case_links : [];
  const attachmentsByMessage = new Map();
  for (const attachment of attachments) {
    const list = attachmentsByMessage.get(attachment.message_id) || [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.message_id, list);
  }

  const provider = communicationProviderLabel(thread);
  const evidence = [];
  if (candidates.length) evidence.push(`${candidates.length} match candidate${candidates.length === 1 ? '' : 's'}`);
  if (caseLinks.filter((link) => link.status === 'active').length) evidence.push(`${caseLinks.filter((link) => link.status === 'active').length} linked case${caseLinks.filter((link) => link.status === 'active').length === 1 ? '' : 's'}`);
  if (thread.assigned_to_user_id) evidence.push(`Owner ${thread.assigned_to_user_id}`);

  detailContainer.innerHTML = `
    <section class="communication-thread-header">
      <p class="eyebrow">${escapeHtml(provider)}</p>
      <h2>${escapeHtml(thread.subject || '(No subject)')}</h2>
      <div class="communication-thread-meta">
        <span>${escapeHtml(label(thread.queue_code))}</span>
        <span>${escapeHtml(label(thread.channel))}</span>
        <span>${escapeHtml(thread.legal_entity_code || 'Entity')}</span>
        <span>${number(thread.message_count)} messages</span>
        <span>${number(thread.attachment_count)} attachments</span>
      </div>
      ${evidence.length ? `<div class="communication-thread-evidence">${evidence.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
    </section>
    <section class="communication-message-list">
      ${messages.length ? messages.map((message) => {
        const messageAttachments = attachmentsByMessage.get(message.id) || [];
        const sender = message.sender_name || message.sender_email || label(message.direction);
        return `<article class="communication-message communication-message--${escapeHtml(message.direction || 'internal')}">
          <header class="communication-message-head">
            <div>
              <strong>${escapeHtml(sender)}</strong>
              <small>${escapeHtml(message.sender_email || '')}${message.to_emails?.length ? ` → ${escapeHtml(message.to_emails.join(', '))}` : ''}</small>
            </div>
            <small>${escapeHtml(dateTime(message.message_at))}</small>
          </header>
          ${message.body_redacted
            ? `<div class="communication-message-redacted"><strong>Restricted content</strong><p>Message body is redacted by Provider Service policy.</p></div>`
            : `<p class="communication-message-body">${escapeHtml(message.body_text || '(No message body captured)')}</p>`}
          ${messageAttachments.length ? `<div class="communication-attachments">${messageAttachments.map((attachment) => `<div class="communication-attachment"><span>${escapeHtml(attachment.original_filename)}</span><small>${escapeHtml(label(attachment.processing_status))}${bytes(attachment.file_size_bytes) ? ` · ${escapeHtml(bytes(attachment.file_size_bytes))}` : ''}</small></div>`).join('')}</div>` : ''}
        </article>`;
      }).join('') : '<article class="ui-state"><strong>No messages captured</strong><p>The thread exists but has no stored message rows.</p></article>'}
    </section>`;
}

async function selectThread(threadId) {
  if (!threadId || !detailContainer) return;
  const requestId = ++state.detailRequestId;
  state.selectedThreadId = threadId;
  renderRows();
  detailContainer.innerHTML = '<div class="communication-detail-loading"><strong>Loading thread</strong><p>Resolving messages and evidence.</p></div>';
  try {
    const response = await callRatewareFunction('shipper-directory-api', 'get_provider_communication_thread', { thread_id: threadId });
    if (requestId !== state.detailRequestId || state.selectedThreadId !== threadId) return;
    renderThreadDetail(response?.data || {});
  } catch (error) {
    if (requestId !== state.detailRequestId || state.selectedThreadId !== threadId) return;
    detailContainer.innerHTML = `<div class="communication-detail-error"><strong>Thread could not load</strong><p>${escapeHtml(error?.message || 'Request failed.')}</p></div>`;
  }
}

async function loadInbox({ preserveSelection = false } = {}) {
  const requestId = ++state.requestId;
  updateProviderCommunicationsShell('Loading provider communication history', true);
  if (rowsContainer) rowsContainer.innerHTML = '<article class="ui-state ui-state-loading"><strong>Loading Communications Inbox</strong><p>Resolving provider threads.</p></article>';
  try {
    const response = await callRatewareFunction('shipper-directory-api', 'list_provider_communications_inbox', {
      queue: state.queue,
      search: state.search || undefined,
      limit: state.limit,
      offset: state.offset,
    });
    if (requestId !== state.requestId) return;
    const data = response?.data || {};
    state.rows = Array.isArray(data.rows) ? data.rows : [];
    if (shouldReplaceCommunicationMetrics({ queue: state.queue, search: state.search, metrics: data.metrics, currentMetrics: state.metrics })) {
      state.metrics = data.metrics || {};
    }
    state.total = number(data.total);
    if (!preserveSelection && !state.rows.some((row) => row.thread_id === state.selectedThreadId)) {
      state.selectedThreadId = null;
      if (detailContainer) detailContainer.innerHTML = '<div class="communications-detail-empty"><strong>Select a thread</strong><p>Open a conversation to inspect messages and evidence.</p></div>';
    }
    renderMetrics();
    renderRows();
    renderPagination();
    updateProviderCommunicationsShell(`${state.total.toLocaleString()} provider communication thread(s) loaded`);
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.rows = [];
    state.total = 0;
    if (rowsContainer) rowsContainer.innerHTML = `<article class="ui-state ui-state-error"><strong>Communications Inbox could not load</strong><p>${escapeHtml(error?.message || 'Request failed.')}</p></article>`;
    renderMetrics();
    renderPagination();
    updateProviderCommunicationsShell('Provider communication history could not load');
  }
}

queueButtons.forEach((button) => button.addEventListener('click', () => {
  state.queue = normalizeCommunicationQueue(button.dataset.communicationQueue);
  state.offset = 0;
  syncQueueUi();
  loadInbox({ preserveSelection: true });
}));

let searchTimer = null;
searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = searchInput.value.trim();
    state.offset = 0;
    loadInbox({ preserveSelection: true });
  }, 250);
});

prevButton?.addEventListener('click', () => {
  state.offset = Math.max(0, state.offset - state.limit);
  loadInbox({ preserveSelection: true });
});

nextButton?.addEventListener('click', () => {
  if (state.offset + state.limit >= state.total) return;
  state.offset += state.limit;
  loadInbox({ preserveSelection: true });
});

await requirePrivatePage();
syncQueueUi();
loadInbox();
