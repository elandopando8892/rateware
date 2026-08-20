// Renders the OSP design preview from fixtures and from the live design tokens.
//
// No auth, no network, no product data. The palette and contrast sections read the
// computed tokens rather than restating them, so this page cannot drift from the
// stylesheet the way a hand-written style guide does.

const NAV = [
  ['Intake', [['Gmail Intake', null]]],
  ['Work', [['Command Center', ['warn', '2']]]],
  ['Evidence', [['Document Review', null], ['Entity Vault', null]]],
  ['Release', [['Approvals', ['brand', '1']], ['Delivery', null]]],
];

const STAGES = [
  ['intake', 'Intake', 3], ['review', 'Review', 5], ['release', 'Release', 1],
  ['delivery', 'Delivery', 0], ['closed', 'Closed', 8], ['exception', 'Exception', 2],
];

// Deliberately invented. Real entity names never belong in a design fixture.
const ROWS = [
  ['critical', 'Programa de ejemplo · Entidad A', 'Blocked', 'Evidence missing', 'Package not cut'],
  ['attention', 'Programa de ejemplo · Entidad B', 'Evidence', 'Awaiting document', 'Package not cut'],
  ['approval', 'Programa de ejemplo · Entidad C', 'Ready', 'Awaiting approval', 'Package pending'],
];

const PALETTE = [
  '--bg', '--panel', '--soft-panel', '--text', '--muted', '--line', '--line-strong',
  '--brand', '--brand-strong', '--brand-tint', '--success', '--warning', '--danger',
  '--stage-intake', '--stage-review', '--stage-release', '--stage-delivery',
  '--stage-closed', '--stage-exception', '--stage-attention',
];

const CONTRAST = [
  ['--text', '--panel'], ['--muted', '--panel'], ['--brand', '--panel'],
  ['--brand-strong', '--panel'], ['--success', '--panel'], ['--warning', '--panel'],
  ['--danger', '--panel'], ['--stage-intake', '--panel'], ['--stage-review', '--panel'],
  ['--stage-closed', '--panel'], ['--stage-exception', '--panel'], ['--muted', '--bg'],
];

const root = document.documentElement;
const token = (name) => getComputedStyle(root).getPropertyValue(name).trim();

/* ---- theme switch ------------------------------------------------------- */
const buttons = { light: 'pv-light', dark: 'pv-dark', system: 'pv-system' };
function setTheme(mode) {
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  for (const [name, id] of Object.entries(buttons)) {
    document.getElementById(id)?.setAttribute('aria-pressed', String(name === mode));
  }
  // Rendered synchronously on purpose. A custom-property change is visible to
  // getComputedStyle as soon as the attribute lands, and requestAnimationFrame never
  // fires in a tab that is not compositing -- which is exactly the case when this page
  // is open in a background or hidden pane.
  renderPalette();
  renderContrast();
}
for (const [name, id] of Object.entries(buttons)) {
  document.getElementById(id)?.addEventListener('click', () => setTheme(name));
}

/* ---- shell -------------------------------------------------------------- */
document.getElementById('pv-nav').innerHTML = NAV.map(([group, items]) => `
  <div class="osp-group"><p>${group}</p>${items.map(([label, badge], index) => `
    <button type="button" class="osp-item${group === 'Work' && index === 0 ? ' is-active' : ''}">${label}${
      badge ? `<em class="osp-count" data-tone="${badge[0]}">${badge[1]}</em>` : ''
    }</button>`).join('')}</div>`).join('');

/* ---- pipeline and rows -------------------------------------------------- */
document.getElementById('pv-pipeline').innerHTML = STAGES.map(([code, label, count]) => `
  <li class="pipeline-stage pipeline-stage--${code} ${count ? 'has-cases' : 'is-empty'}">
    <span>${label}</span><b>${count}</b></li>`).join('');

document.getElementById('pv-rows').innerHTML = ROWS.map(([tone, name, stage, work, output]) => `
  <button type="button" class="onboarding-row onboarding-row--${tone}">
    <span><strong>${name}</strong><small>Fixture — not a real entity</small></span>
    <span><b>${stage}</b></span><span><b>${work}</b></span><span><small>${output}</small></span>
  </button>`).join('');

/* ---- palette ------------------------------------------------------------ */
function renderPalette() {
  document.getElementById('pv-swatches').innerHTML = PALETTE.map((name) => `
    <div class="pv-swatch"><i style="background:${token(name)}"></i>
      <div>${name}</div><code>${token(name) || '(unset)'}</code></div>`).join('');
}

/* ---- weights ------------------------------------------------------------ */
document.getElementById('pv-weights').innerHTML = [500, 600, 700, 800, 900].map((weight) => `
  <p style="font-weight:${weight}">The quick brown fox jumps over the lazy dog
    <span>&nbsp;${weight}</span></p>`).join('');

/* ---- contrast ----------------------------------------------------------- */
/** sRGB relative luminance, per WCAG 2.1. */
function luminance(colour) {
  const parts = colour.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return null;
  const [r, g, b] = parts.slice(0, 3).map((value) => {
    const channel = Number(value) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Tokens are hex; resolve them to rgb() by letting the browser do it. */
function resolved(value) {
  const probe = document.createElement('span');
  probe.style.color = value;
  document.body.append(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  return rgb;
}
function ratio(foreground, background) {
  const a = luminance(resolved(foreground));
  const b = luminance(resolved(background));
  if (a === null || b === null) return null;
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
function renderContrast() {
  document.getElementById('pv-contrast').innerHTML = CONTRAST.map(([fg, bg]) => {
    const value = ratio(token(fg), token(bg));
    const score = value === null ? '—' : value.toFixed(2);
    // 4.5 body text, 3.0 large text and non-text indicators.
    const verdict = value === null ? '' : value >= 4.5 ? ' AA' : value >= 3 ? ' AA-large' : ' fail';
    const colour = value === null ? 'var(--muted)'
      : value >= 4.5 ? 'var(--success)' : value >= 3 ? 'var(--warning)' : 'var(--danger)';
    return `<tr><td>${fg}</td><td>${bg}</td><td style="color:${colour}">${score}${verdict}</td></tr>`;
  }).join('');
}

setTheme('system');
