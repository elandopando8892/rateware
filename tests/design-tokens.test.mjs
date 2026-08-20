import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A CSS custom property that is referenced but never defined fails silently. With a
// fallback it quietly pins that rule to a hardcoded colour, which is how several
// surfaces stayed light-mode-only; without one the whole declaration is invalid and the
// element inherits instead -- `var(--ink)` was doing that in 38 places and nothing
// reported it.
//
// This is the same shape of defect as the orphaned modules: invisible, and found one at
// a time. Checked as a class instead.

// Scoped to OSP's own stylesheets. src/styles.css belongs to Rateware and is checked by
// nobody here on purpose: OSP forked its tokens so the two can diverge, and asserting
// Rateware's palette from an OSP test is how the last leak happened.
const root = fileURLToPath(new URL('../src/', import.meta.url));
const files = readdirSync(root)
  .filter((name) => name.endsWith('.css'))
  .filter((name) => name === 'osp.css' || name.startsWith('provider-'));
const sources = files.map((name) => ({ name, text: readFileSync(root + name, 'utf8') }));
const base = sources.find((file) => file.name === 'osp.css');

/** Properties assigned a value at runtime by JS, so a static definition is not expected. */
const RUNTIME_ASSIGNED = new Set(['--funnel-stage-count', '--vendor-visible-columns']);

const defined = new Set(
  [...base.text.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1]),
);

test('the stylesheet actually parses into tokens', () => {
  // A regex that matched nothing would make every assertion below vacuous.
  assert.ok(defined.size >= 40, `only found ${defined.size} tokens`);
  for (const token of ['--bg', '--panel', '--text', '--muted', '--line', '--brand']) {
    assert.ok(defined.has(token), `missing core token ${token}`);
  }
});

test('every referenced token is defined, or is set at runtime', () => {
  const missing = [];
  for (const file of sources) {
    for (const match of file.text.matchAll(/var\((--[a-z0-9-]+)\s*(,)?/g)) {
      const token = match[1];
      if (defined.has(token) || RUNTIME_ASSIGNED.has(token)) continue;
      missing.push(`${token} (${file.name}${match[2] ? ', has fallback' : ', NO fallback'})`);
    }
  }
  assert.deepEqual([...new Set(missing)], [],
    `referenced but never defined -- define it, or rename it to the token that exists:\n  ${[...new Set(missing)].join('\n  ')}`);
});

test('a runtime-assigned token still carries a fallback', () => {
  // Without one, the rule is invalid until the script runs.
  for (const token of RUNTIME_ASSIGNED) {
    const bare = new RegExp(`var\\(${token}\\)`);
    assert.ok(!bare.test(base.text), `${token} is used without a fallback`);
  }
});

test('the dark theme redefines every colour token the light theme sets', () => {
  // A token defined only in :root keeps its light value under a dark theme, which is how
  // a single stray colour ruins an otherwise dark surface.
  const rootBlock = base.text.slice(0, base.text.indexOf('\n}'));
  const darkBlock = base.text.slice(base.text.indexOf(':root[data-theme="dark"]'));
  const darkTokens = new Set(
    [...darkBlock.slice(0, darkBlock.indexOf('\n}')).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]),
  );
  const colourish = [...rootBlock.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)]
    .filter(([, , value]) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(value))
    .map(([, token]) => token);
  const unthemed = colourish.filter((token) => !darkTokens.has(token));
  assert.deepEqual(unthemed, [], `light-only colour tokens:\n  ${unthemed.join('\n  ')}`);
});

test('both dark scopes stay in step', () => {
  // The media query serves the system preference and the attribute serves an explicit
  // toggle. If they drift, the toggle and the OS disagree about what dark means.
  const media = base.text.slice(base.text.indexOf('@media (prefers-color-scheme: dark)'));
  const mediaTokens = [...media.slice(0, media.indexOf('\n  }')).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)]
    .map(([, token, value]) => `${token}:${value.trim()}`);
  const attr = base.text.slice(base.text.indexOf(':root[data-theme="dark"]'));
  const attrTokens = [...attr.slice(0, attr.indexOf('\n}')).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)]
    .map(([, token, value]) => `${token}:${value.trim()}`);
  assert.ok(mediaTokens.length >= 30, `media scope only defines ${mediaTokens.length} tokens`);
  assert.deepEqual(mediaTokens, attrTokens, 'the two dark scopes define different values');
});

test('the font-weight scale stays collapsed', () => {
  // It had drifted to 21 distinct weights -- 730 and 740 among them, which nobody can
  // tell apart. Five steps is the scale.
  const allowed = new Set(['500', '600', '700', '800', '900']);
  const seen = new Set();
  for (const file of sources) {
    for (const match of file.text.matchAll(/font-weight:\s*(\d{3})/g)) seen.add(match[1]);
  }
  const stray = [...seen].filter((weight) => !allowed.has(weight)).sort();
  assert.deepEqual(stray, [], `weights outside the scale: ${stray.join(', ')}`);
});

test('OSP does not load the Rateware stylesheet', () => {
  // The whole point of the fork. If a page links styles.css again, OSP inherits
  // Rateware's palette and any OSP design change lands on all 34 Rateware pages.
  const repo = fileURLToPath(new URL('../', import.meta.url));
  const pages = readdirSync(repo).filter((name) => /^(provider-|osp-)/.test(name) && name.endsWith('.html'));
  const shellSurfaces = ['provider-onboarding-app.html', 'provider-onboarding.html', 'provider-approvals.html',
    'provider-delivery.html', 'provider-document-review.html', 'provider-entity-vault.html',
    'provider-gmail.html', 'osp-preview.html'];
  const leaks = [];
  for (const page of pages) {
    if (!shellSurfaces.includes(page)) continue; // Rateware-hosted provider views keep their own sheet
    const html = readFileSync(repo + page, 'utf8');
    if (/src\/styles\.css/.test(html)) leaks.push(page);
    if (!/src\/osp\.css/.test(html)) leaks.push(`${page} (does not load osp.css)`);
  }
  assert.deepEqual(leaks, [], `OSP surfaces must load src/osp.css, not Rateware's:\n  ${leaks.join('\n  ')}`);
});

test('the operator surfaces carry no hardcoded colour', () => {
  // These are the pages the dark theme has to reach. styles.css owns the palette; a raw
  // hex in a surface file is a colour the theme cannot touch.
  const offenders = [];
  for (const file of sources) {
    if (file.name === 'osp.css') continue;
    if (!file.name.startsWith('provider')) continue;
    const hexes = [...file.text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    if (hexes.length) offenders.push(`${file.name}: ${[...new Set(hexes)].join(', ')}`);
  }
  assert.deepEqual(offenders, [], `hardcoded colour in operator surfaces:\n  ${offenders.join('\n  ')}`);
});
