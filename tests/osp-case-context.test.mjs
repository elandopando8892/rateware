import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ORIGIN = 'https://osp.example.test';
const CASE = '8b4c7995-8952-4551-a137-2e90aee29c2a';
const OTHER = 'e5ff367a-a789-4f50-b281-ef80a0ccc8ea';

/** A DOM stub just wide enough for the module. postMessage is the thing under test. */
function environment({ framed = true } = {}) {
  const listeners = [];
  const posted = [];
  const parentWindow = { postMessage: (data, origin) => posted.push({ data, origin }) };
  const self = {
    location: { origin: ORIGIN, search: '', href: `${ORIGIN}/provider-onboarding-app` },
    addEventListener: (type, handler) => { if (type === 'message') listeners.push(handler); },
    removeEventListener: (type, handler) => {
      const index = listeners.indexOf(handler);
      if (index >= 0) listeners.splice(index, 1);
    },
  };
  self.parent = framed ? parentWindow : self;
  return { self, posted, deliver: (event) => listeners.forEach((handler) => handler(event)), listeners };
}

async function load(env) {
  const previous = { window: globalThis.window, URL: globalThis.URL };
  globalThis.window = env.self;
  const module = await import(`../src/osp-case-context.js?t=${Math.random()}`);
  globalThis.window = previous.window;
  return module;
}

test('a case id round-trips through the URL, and a bad one does not', async () => {
  const env = environment();
  globalThis.window = env.self;
  const { caseFromUrl, withCase } = await import('../src/osp-case-context.js');
  assert.equal(caseFromUrl(`?case=${CASE}`), CASE);
  assert.equal(caseFromUrl('?case=not-a-uuid'), null);
  assert.equal(caseFromUrl(''), null);
  // A junk id must not be appended: it would send a surface looking for nothing.
  assert.equal(withCase('./provider-onboarding.html?embed=1', 'drop-tables'), './provider-onboarding.html?embed=1');
  assert.match(withCase('./provider-onboarding.html?embed=1', CASE), new RegExp(`case=${CASE}`));
});

test('a surface announces its selection to the shell, on this origin only', async () => {
  const env = environment();
  const { announceCase } = await load(env);
  globalThis.window = env.self;
  announceCase(CASE, 'provider setup · MX-NLE');
  assert.equal(env.posted.length, 1);
  assert.equal(env.posted[0].origin, ORIGIN, 'must never post to "*"');
  assert.deepEqual(env.posted[0].data, { type: 'osp:case-selected', caseId: CASE, label: 'provider setup · MX-NLE' });
  globalThis.window = undefined;
});

test('an unframed surface announces nothing', async () => {
  // The same code has to run when the page is opened directly, not through the shell.
  const env = environment({ framed: false });
  const { announceCase } = await load(env);
  globalThis.window = env.self;
  announceCase(CASE, 'anything');
  assert.equal(env.posted.length, 0);
  globalThis.window = undefined;
});

test('the shell accepts a case only from its own frame on its own origin', async () => {
  const env = environment();
  const { listenForCase } = await load(env);
  globalThis.window = env.self;
  const seen = [];
  const frameWindow = { name: 'the shell frame' };
  listenForCase((payload) => seen.push(payload), () => frameWindow);

  const message = { type: 'osp:case-selected', caseId: CASE, label: 'ok' };
  // Another origin — the whole reason origin is checked.
  env.deliver({ origin: 'https://attacker.example', source: frameWindow, data: message });
  // Right origin, but not the frame the shell is hosting.
  env.deliver({ origin: ORIGIN, source: { name: 'some other window' }, data: message });
  assert.deepEqual(seen, [], 'accepted a message it should have dropped');

  env.deliver({ origin: ORIGIN, source: frameWindow, data: message });
  assert.deepEqual(seen, [{ caseId: CASE, label: 'ok' }]);
  globalThis.window = undefined;
});

test('a malformed payload is dropped rather than acted on', async () => {
  const env = environment();
  const { listenForCase } = await load(env);
  globalThis.window = env.self;
  const seen = [];
  const frameWindow = {};
  listenForCase((payload) => seen.push(payload), () => frameWindow);
  for (const data of [
    null, undefined, 'osp:case-selected', 42,
    { type: 'something-else', caseId: CASE },
    { type: 'osp:case-selected' },
    { type: 'osp:case-selected', caseId: '../../etc/passwd' },
    { type: 'osp:case-selected', caseId: `${CASE}' or 1=1` },
  ]) {
    env.deliver({ origin: ORIGIN, source: frameWindow, data });
  }
  assert.deepEqual(seen, []);
  globalThis.window = undefined;
});

test('a label is normalised and bounded', async () => {
  const env = environment();
  const { listenForCase } = await load(env);
  globalThis.window = env.self;
  const seen = [];
  const frameWindow = {};
  listenForCase((payload) => seen.push(payload), () => frameWindow);
  env.deliver({ origin: ORIGIN, source: frameWindow, data: {
    type: 'osp:case-selected', caseId: OTHER, label: `  spaced\n\tlabel   ${'x'.repeat(400)}`,
  } });
  assert.equal(seen.length, 1);
  assert.ok(seen[0].label.length <= 120, 'an unbounded label would let a frame stretch the shell chrome');
  assert.ok(seen[0].label.startsWith('spaced label'), 'whitespace should collapse');
  globalThis.window = undefined;
});

test('unsubscribing actually detaches', async () => {
  const env = environment();
  const { listenForCase } = await load(env);
  globalThis.window = env.self;
  const seen = [];
  const stop = listenForCase((payload) => seen.push(payload), null);
  stop();
  env.deliver({ origin: ORIGIN, source: {}, data: { type: 'osp:case-selected', caseId: CASE, label: '' } });
  assert.deepEqual(seen, []);
  assert.equal(env.listeners.length, 0);
  globalThis.window = undefined;
});

test('the shell and the surface are wired to the shared protocol', () => {
  // A protocol both sides agree on only helps if both sides actually import it.
  const shell = readFileSync(new URL('../src/provider-onboarding-app.js', import.meta.url), 'utf8');
  const surface = readFileSync(new URL('../src/provider-onboarding-page.js', import.meta.url), 'utf8');
  assert.match(shell, /from '\.\/osp-case-context\.js'/);
  assert.match(shell, /listenForCase\(/);
  assert.match(shell, /withCase\(/);
  assert.match(surface, /from '\.\/osp-case-context\.js'/);
  assert.match(surface, /announceCase\(/);
  assert.match(surface, /caseFromUrl\(/);
  // The shell must scope the listener to its own frame; omitting the source check is
  // the difference between a private channel and an open one.
  assert.match(shell, /listenForCase\([^;]*frame\?\.contentWindow/s);
});

test('the case travels only to surfaces that act on it', () => {
  // Sending a case to a screen that ignores it promises a filter that never happens.
  // Gmail, Document Review and Entity Vault are keyed by mailbox, document and legal
  // entity; only the case-keyed screens receive it.
  const shell = readFileSync(new URL('../src/provider-onboarding-app.js', import.meta.url), 'utf8');
  const surfaces = shell.slice(shell.indexOf('const SURFACES = ['), shell.indexOf('const BY_ID'));
  const honours = Object.fromEntries(
    [...surfaces.matchAll(/\['(\w+)',\s*'[^']+',\s*'[^']+',\s*(true|false)\]/g)]
      .map((match) => [match[1], match[2] === 'true']),
  );
  assert.deepEqual(honours, {
    gmail: false, command: true, review: false, vault: false, approvals: true, delivery: true,
  });
  // And the flag must actually gate the URL, not merely be declared.
  assert.match(shell, /function embeddedUrl\(path, honoursCase\)/);
  assert.match(shell, /honoursCase \? withCase\(base, activeCase\?\.caseId\) : base/);
});

test('the pill says when the surface on screen ignores the case', () => {
  const shell = readFileSync(new URL('../src/provider-onboarding-app.js', import.meta.url), 'utf8');
  assert.match(shell, /markCaseApplies\(item\[3\]\)/);
  assert.match(shell, /is not organised by case/);
});

test('a case-keyed surface lands on the case, and says when it cannot', () => {
  // Falling back to the first row without a word would look like the case was honoured.
  for (const name of ['provider-approvals-page.js', 'provider-delivery-page.js']) {
    const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    assert.match(source, /from '\.\/osp-case-context\.js'/, name);
    assert.match(source, /const workingCase = caseFromUrl\(\);/, name);
    assert.match(source, /row\.case_id === workingCase/, name);
    assert.match(source, /is not on this page/, name);
    assert.match(source, /has nothing here/, name);
  }
});
