import { requirePrivatePage } from './auth.js';
import { callRatewareFunction } from './rateware-api.js';

const entitySelect = document.getElementById('provider-gmail-entity');
const connectButton = document.getElementById('provider-gmail-connect');
const syncButton = document.getElementById('provider-gmail-sync');
const watchButton = document.getElementById('provider-gmail-watch');
const refreshButton = document.getElementById('provider-gmail-refresh');
const statusMessage = document.getElementById('provider-gmail-status-message');
const mailboxLabel = document.getElementById('provider-gmail-mailbox');
const connectionState = document.getElementById('provider-gmail-connection-state');
const tokenState = document.getElementById('provider-gmail-token-state');
const watchState = document.getElementById('provider-gmail-watch-state');
const watchExpiration = document.getElementById('provider-gmail-watch-expiration');
const lastSync = document.getElementById('provider-gmail-last-sync');
const historyLabel = document.getElementById('provider-gmail-history');

let snapshot = { mailbox_email: '', legal_entities: [], connections: [], pubsub_configured: false };
let actionRunning = false;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const dateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

function setStatus(message, tone = 'neutral') {
  if (!statusMessage) return;
  statusMessage.textContent = message || '';
  statusMessage.dataset.tone = tone;
}

function selectedEntityId() {
  return entitySelect?.value || '';
}

function selectedConnection() {
  const entityId = selectedEntityId();
  return snapshot.connections.find((row) => row.legal_entity_id === entityId) || null;
}

function renderEntityOptions() {
  if (!entitySelect) return;
  const selected = entitySelect.value;
  const active = snapshot.legal_entities.filter((row) => row.status === 'active');
  entitySelect.innerHTML = `<option value="">Select legal entity</option>${active.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.entity_code)} — ${escapeHtml(row.legal_name)}</option>`).join('')}`;
  if (active.some((row) => row.id === selected)) entitySelect.value = selected;
  else if (active.length === 1) entitySelect.value = active[0].id;
}

function renderConnection() {
  const connection = selectedConnection();
  const entityId = selectedEntityId();
  const connected = Boolean(connection && ['connected', 'watching'].includes(connection.status));
  if (mailboxLabel) mailboxLabel.textContent = `Expected mailbox: ${snapshot.mailbox_email || '—'}`;
  if (connectionState) connectionState.textContent = connection ? connection.status.replaceAll('_', ' ') : 'Not connected';
  if (tokenState) tokenState.textContent = connection?.token_expires_at ? `Token expires ${dateTime(connection.token_expires_at)}` : 'No access token';
  if (watchState) watchState.textContent = connection?.status === 'watching' ? 'Watching INBOX' : snapshot.pubsub_configured ? 'Ready to start' : 'Pub/Sub not configured';
  if (watchExpiration) watchExpiration.textContent = connection?.watch_expiration_at ? `Expires ${dateTime(connection.watch_expiration_at)}` : '—';
  if (lastSync) lastSync.textContent = connection?.last_sync_completed_at ? dateTime(connection.last_sync_completed_at) : 'Never';
  if (historyLabel) historyLabel.textContent = connection?.history_id ? `History ${connection.history_id}` : 'No history ID';
  if (connectButton) connectButton.disabled = actionRunning || !entityId;
  if (syncButton) syncButton.disabled = actionRunning || !connected;
  if (watchButton) watchButton.disabled = actionRunning || !connected || !snapshot.pubsub_configured;
  if (connection?.last_error) setStatus(connection.last_error, 'error');
}

async function loadStatus({ quiet = false } = {}) {
  if (!quiet) setStatus('Loading Gmail intake status…');
  try {
    const response = await callRatewareFunction('provider-gmail-intake-api', 'provider_gmail_status');
    snapshot = response?.data || snapshot;
    renderEntityOptions();
    renderConnection();
    if (!quiet) setStatus('Gmail intake status loaded.', 'success');
  } catch (error) {
    setStatus(error?.message || 'Gmail intake status could not be loaded.', 'error');
  }
}

async function runAction(callback) {
  if (actionRunning) return;
  actionRunning = true;
  renderConnection();
  try {
    await callback();
  } finally {
    actionRunning = false;
    renderConnection();
  }
}

entitySelect?.addEventListener('change', () => {
  setStatus('');
  renderConnection();
});

refreshButton?.addEventListener('click', () => loadStatus());

connectButton?.addEventListener('click', () => runAction(async () => {
  const legalEntityId = selectedEntityId();
  if (!legalEntityId) return;
  setStatus(`Preparing read-only OAuth for ${snapshot.mailbox_email}…`);
  const response = await callRatewareFunction('provider-gmail-intake-api', 'start_provider_gmail_oauth', { legal_entity_id: legalEntityId });
  const authUrl = response?.data?.auth_url;
  if (!authUrl) throw new Error('Provider Gmail OAuth URL was not returned.');
  window.location.assign(authUrl);
}));

syncButton?.addEventListener('click', () => runAction(async () => {
  const legalEntityId = selectedEntityId();
  if (!legalEntityId) return;
  setStatus('Synchronizing Gmail INBOX into Provider Service…');
  const response = await callRatewareFunction('provider-gmail-intake-api', 'sync_provider_gmail_inbox', { legal_entity_id: legalEntityId, limit: 50 });
  const data = response?.data || {};
  setStatus(`Sync complete: ${data.inserted_messages || 0} new message(s), ${data.duplicates || 0} duplicate(s), ${data.attachment_metadata_rows || 0} attachment metadata row(s).`, 'success');
  await loadStatus({ quiet: true });
}));

watchButton?.addEventListener('click', () => runAction(async () => {
  const legalEntityId = selectedEntityId();
  if (!legalEntityId) return;
  setStatus('Starting or renewing Gmail INBOX watch…');
  const response = await callRatewareFunction('provider-gmail-intake-api', 'renew_provider_gmail_watch', { legal_entity_id: legalEntityId });
  setStatus(`Watch active until ${dateTime(response?.data?.watch_expiration_at)}.`, 'success');
  await loadStatus({ quiet: true });
}));

const params = new URLSearchParams(window.location.search);
if (params.get('gmail') === 'connected') setStatus('Gmail connected. Run the first sync, then start the watch.', 'success');
if (params.get('gmail') === 'error') setStatus(`Gmail connection failed: ${params.get('reason') || 'unknown error'}`, 'error');

await requirePrivatePage();
await loadStatus({ quiet: params.has('gmail') });
