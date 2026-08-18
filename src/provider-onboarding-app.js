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

const SURFACES = [
  ['Intake', [
    ['gmail', 'Gmail Intake', './provider-gmail.html'],
  ]],
  ['Work', [
    ['command', 'Command Center', './provider-onboarding.html'],
  ]],
  ['Evidence', [
    ['review', 'Document Review', './provider-document-review.html'],
    ['vault', 'Entity Vault', './provider-entity-vault.html'],
  ]],
  ['Release', [
    ['approvals', 'Approvals', './provider-approvals.html'],
    ['delivery', 'Delivery', './provider-delivery.html'],
  ]],
];
const BY_ID = new Map(SURFACES.flatMap(([, items]) => items.map((item) => [item[0], item])));
const DEFAULT_SURFACE = 'command';

const nav = document.getElementById('osp-nav');
const frame = document.getElementById('osp-frame');
const titleNode = document.getElementById('osp-title');

/** Adds ?embed=1 so the hosted surface drops its Rateware chrome. */
function embeddedUrl(path) {
  const url = new URL(path, window.location.href);
  url.searchParams.set('embed', '1');
  return `${url.pathname}${url.search}`;
}

function select(id) {
  const item = BY_ID.get(id);
  if (!item) return;
  const [, label, path] = item;
  // Reflect the surface in the address bar so a deep link reopens the same screen.
  window.history.replaceState(null, '', `?surface=${encodeURIComponent(id)}`);
  if (titleNode) titleNode.textContent = label;
  if (frame && frame.getAttribute('data-surface') !== id) {
    frame.src = embeddedUrl(path);
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
const requested = new URLSearchParams(window.location.search).get('surface');
select(BY_ID.has(requested) ? requested : DEFAULT_SURFACE);
