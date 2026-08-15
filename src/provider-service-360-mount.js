import { loadProviderService360, renderProviderService360 } from './provider-service-360.js';

const HOST_ID = 'drawer-provider-service-360';
let loadVersion = 0;
let activeVendorId = null;

function ensureStylesheet() {
  if (document.querySelector('link[data-provider360-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './src/provider-service-360.css';
  link.dataset.provider360Styles = 'true';
  document.head.append(link);
}

function ensureHost() {
  let host = document.querySelector(`#${HOST_ID}`);
  if (host) return host;

  const relationship = document.querySelector('#drawer-vendor-relationship');
  const anchor = relationship?.closest('.vendor-drawer-card');
  if (!anchor) return null;

  const section = document.createElement('section');
  section.className = 'vendor-drawer-card provider-service-drawer-card';
  section.innerHTML = `
    <div class="section-heading compact">
      <div>
        <p class="eyebrow">Provider Service</p>
        <h2>Activation & onboarding 360</h2>
      </div>
      <span class="status-pill">Read only</span>
    </div>
    <div id="${HOST_ID}" class="drawer-provider-service-360">
      <p class="status-message">Open a vendor to load Provider Service.</p>
    </div>`;
  anchor.after(section);
  host = section.querySelector(`#${HOST_ID}`);
  return host;
}

function triggerVendorId(target) {
  if (!(target instanceof Element)) return null;
  const trigger = target.closest('.vendor-profile-button,.vendor-logo-button,[data-vendor-card-id],[data-funnel-open],[data-duplicate-open]');
  if (!trigger) return null;
  return trigger.getAttribute('data-vendor-id')
    || trigger.getAttribute('data-vendor-card-id')
    || trigger.getAttribute('data-funnel-open')
    || trigger.getAttribute('data-duplicate-open')
    || null;
}

function renderError(host, message) {
  const error = document.createElement('div');
  error.className = 'provider360-error';
  error.textContent = message || 'Provider Service 360 could not be loaded.';
  host.replaceChildren(error);
}

async function loadVendor(vendorId) {
  if (!vendorId) return;
  const version = ++loadVersion;
  activeVendorId = vendorId;
  ensureStylesheet();
  const host = ensureHost();
  if (!host) return;
  host.innerHTML = '<div class="provider360-loading">Loading Provider Service 360…</div>';

  try {
    const payload = await loadProviderService360(vendorId);
    if (version !== loadVersion || activeVendorId !== vendorId) return;
    renderProviderService360(host, payload);
    host.dataset.vendorId = vendorId;
  } catch (error) {
    if (version !== loadVersion || activeVendorId !== vendorId) return;
    renderError(host, error?.message || 'Provider Service 360 could not be loaded.');
  }
}

document.addEventListener('click', (event) => {
  const vendorId = triggerVendorId(event.target);
  if (!vendorId) return;
  window.setTimeout(() => loadVendor(vendorId), 0);
}, true);

document.querySelector('#close-vendor-drawer')?.addEventListener('click', () => {
  activeVendorId = null;
  loadVersion += 1;
});
