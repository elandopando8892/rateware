// Onboarding Service Provider — standalone modular app shell.
//
// The §14.A "aplicación independiente": one focused entry an operator opens to run
// the onboarding workflow, without navigating all of Rateware. It does not
// re-implement any surface — it hosts the existing surface pages in an embedded
// frame (?embed=1), so it is the same code and the same backend, viewed as one app.
//
// Provider Service 360 is deliberately not a screen here: it is a Rateware surface
// this workflow consumes from, not part of the standalone onboarding app.
import { requirePrivatePage } from './auth.js';
import { callRatewareFunction } from './rateware-api.js';
import { listenForCase, withCase } from './osp-case-context.js';

// The fourth element marks a surface that honours the working case. Gmail, Document
// Review and Entity Vault are keyed by mailbox, document and legal entity rather than by
// case, so sending them a case would promise a filter they do not apply.
const SURFACES = [
  ['Intake', [
    ['gmail', 'Gmail Intake', './provider-gmail.html', false],
  ]],
  ['Work', [
    ['command', 'Command Center', './provider-onboarding.html', true],
  ]],
  ['Evidence', [
    ['review', 'Document Review', './provider-document-review.html', false],
    ['vault', 'Entity Vault', './provider-entity-vault.html', false],
  ]],
  ['Release', [
    ['approvals', 'Approvals', './provider-approvals.html', true],
    ['delivery', 'Delivery', './provider-delivery.html', true],
  ]],
];
const BY_ID = new Map(SURFACES.flatMap(([, items]) => items.map((item) => [item[0], item])));
const DEFAULT_SURFACE = 'command';

const nav = document.getElementById('osp-nav');
const frame = document.getElementById('osp-frame');
const titleNode = document.getElementById('osp-title');
const mailboxNode = document.getElementById('osp-mailbox');
const caseNode = document.getElementById('osp-case');

/** The case the operator is working. Carried into every surface the shell opens. */
let activeCase = null;

/** Which surface a queue sends an operator to, so a count is also a way in. */
const COUNT_TARGETS = [
  ['command', 'blocked', 'blocked'],
  ['approvals', 'approval', 'waiting approval'],
];

/**
 * The mailbox indicator reports the connection it can actually see.
 *
 * It used to be a green dot hardcoded in CSS: it said "connected" whether the token was
 * live, expired or never granted. An operations console that asserts a healthy
 * integration it has not checked is worse than one that says nothing, because the
 * operator believes it.
 */
async function renderMailbox() {
  if (!mailboxNode) return;
  const paint = (tone, label, title) => {
    mailboxNode.dataset.tone = tone;
    mailboxNode.querySelector('b').textContent = label;
    mailboxNode.title = title;
  };
  try {
    const response = await callRatewareFunction('provider-gmail-intake-api', 'provider_gmail_status');
    const data = response?.data || {};
    mailboxNode.querySelector('span').textContent = data.mailbox_email || 'no mailbox configured';
    const connections = Array.isArray(data.connections) ? data.connections : [];
    if (connections.some((row) => row.status === 'watching')) {
      paint('ok', 'watching', 'Connected and watching INBOX.');
    } else if (connections.some((row) => row.status === 'connected')) {
      paint('warn', 'idle', 'Connected, but not watching the inbox: new mail will not arrive until a watch is started.');
    } else {
      paint('off', 'not connected', 'No Gmail connection. Nothing is being ingested.');
    }
  } catch (error) {
    // An unreachable status endpoint is itself unknown state, not healthy state.
    paint('unknown', 'unknown', `Mailbox status could not be read: ${error?.message || 'request failed'}`);
  }
}

/**
 * Work counts on the nav. The shell listed six tools and no state, so an operator had to
 * open each surface to discover whether anything was waiting for them.
 */
async function renderCounts() {
  let metrics = {};
  try {
    const response = await callRatewareFunction('shipper-directory-api', 'list_provider_onboarding_workspace', { queue: 'all', limit: 1 });
    metrics = response?.data?.metrics || {};
  } catch (_error) {
    return; // No badge is honest; a zero badge would not be.
  }
  for (const [surfaceId, metricKey, label] of COUNT_TARGETS) {
    const button = nav.querySelector(`[data-surface="${surfaceId}"]`);
    if (!button) continue;
    const count = Number(metrics[metricKey] || 0);
    let badge = button.querySelector('.osp-count');
    if (!count) { badge?.remove(); continue; }
    if (!badge) {
      badge = document.createElement('em');
      badge.className = 'osp-count';
      button.append(badge);
    }
    badge.textContent = String(count);
    badge.dataset.tone = metricKey === 'blocked' ? 'warn' : 'brand';
    button.setAttribute('aria-description', `${count} ${label}`);
  }
}

/** Adds ?embed=1 so the hosted surface drops its Rateware chrome. */
function embeddedUrl(path, honoursCase) {
  const url = new URL(path, window.location.href);
  url.searchParams.set('embed', '1');
  const base = `${url.pathname}${url.search}`;
  return honoursCase ? withCase(base, activeCase?.caseId) : base;
}

/**
 * Shows what the operator is working on, so it survives moving between surfaces.
 * A surface that does not understand the case simply ignores the parameter.
 */
function renderCase() {
  if (!caseNode) return;
  caseNode.hidden = !activeCase;
  if (!activeCase) return;
  caseNode.querySelector('b').textContent = activeCase.label || 'Selected case';
}

/** Says plainly whether the surface on screen acts on the working case. */
function markCaseApplies(applies) {
  if (!caseNode) return;
  caseNode.dataset.applies = applies ? 'true' : 'false';
  caseNode.title = applies
    ? 'This screen opens on the case you are working.'
    : 'This screen is not organised by case, so it ignores the one you are working.';
}

function setCase(next) {
  const changed = next?.caseId !== activeCase?.caseId;
  activeCase = next;
  renderCase();
  if (!changed || !frame) return;
  // Reload the current surface so it picks the case up, and keep the address bar
  // honest: a deep link should reopen the same surface on the same case.
  const item = BY_ID.get(frame.getAttribute('data-surface'));
  if (item) frame.src = embeddedUrl(item[2], item[3]);
  syncLocation(frame.getAttribute('data-surface'));
}

function syncLocation(surfaceId) {
  const params = new URLSearchParams();
  if (surfaceId) params.set('surface', surfaceId);
  if (activeCase?.caseId) params.set('case', activeCase.caseId);
  window.history.replaceState(null, '', `?${params}`);
}

function select(id) {
  const item = BY_ID.get(id);
  if (!item) return;
  const [, label, path] = item;
  markCaseApplies(item[3]);
  syncLocation(id);
  if (titleNode) titleNode.textContent = label;
  if (frame && frame.getAttribute('data-surface') !== id) {
    frame.src = embeddedUrl(path, item[3]);
    frame.setAttribute('data-surface', id);
  }
  nav.querySelectorAll('[data-surface]').forEach((button) => {
    const active = button.dataset.surface === id;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function renderNav() {
  nav.innerHTML = SURFACES.map(([group, items]) => `<div class="osp-group"><p>${group}</p>${items
    .map(([id, label]) => `<button type="button" class="osp-item" data-surface="${id}">${label}</button>`)
    .join('')}</div>`).join('');
  nav.querySelectorAll('[data-surface]').forEach((button) => {
    button.addEventListener('click', () => select(button.dataset.surface));
  });
}

await requirePrivatePage();
renderNav();
const params = new URLSearchParams(window.location.search);
// Adopted before the first select() so the opening frame already carries the case,
// rather than loading once without it and immediately reloading with it.
const initialCase = params.get('case');
if (initialCase) { activeCase = { caseId: initialCase, label: '' }; renderCase(); }
const requested = params.get('surface');
select(BY_ID.has(requested) ? requested : DEFAULT_SURFACE);
// Both are additive: the shell is usable before either resolves, and stays usable if
// either fails.
renderMailbox();
renderCounts();

// Only this shell's own frame may set the working case, and only with a well-formed
// payload. See osp-case-context.js.
listenForCase(({ caseId, label }) => setCase({ caseId, label }), () => frame?.contentWindow);
caseNode?.querySelector('button')?.addEventListener('click', () => setCase(null));
