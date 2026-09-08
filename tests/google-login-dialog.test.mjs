import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the production dialog lifecycle without network or a Google redirect.
function harness(signInWithOAuth = async () => ({ data: {}, error: null })) {
  const form = new EventTarget();
  const button = new EventTarget();
  const errorNode = { textContent: '' };
  const dialog = new EventTarget();
  dialog.open = false;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => {
    if (!dialog.open) return;
    dialog.open = false;
    queueMicrotask(() => dialog.dispatchEvent(new Event('close')));
  };
  dialog.querySelector = selector => ({ form, '[data-close]': button, '[data-auth-error]': errorNode })[selector];
  const document = { readyState: 'loading', addEventListener() {}, querySelector: () => dialog };
  const source = readFileSync(new URL('../src/auth.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const context = vm.createContext({ document, window: { location: { href: 'https://example.invalid/app' } },
    createClient: () => ({ auth: { signInWithOAuth } }), SUPABASE_URL: '', SUPABASE_ANON_KEY: '',
    humanizeError: error => error.message });
  vm.runInContext(source, context);
  return { open: context.openLogin, dialog, form, button, errorNode };
}

test('Escape settles login and allows reopening without stale close events', async () => {
  const h = harness();
  const first = h.open();
  assert.equal(h.open(), first);
  h.dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
  assert.equal(await first, null);
  const second = h.open();
  assert.notEqual(second, first);
  h.dialog.dispatchEvent(new Event('close')); // stale event while open
  assert.equal(h.dialog.open, true);
  h.button.dispatchEvent(new Event('click'));
  assert.equal(await second, null);
});

test('native close settles login', async () => {
  const h = harness();
  const login = h.open();
  h.dialog.close();
  assert.equal(await login, null);
});

test('late OAuth result from a dismissed login cannot close the next login', async () => {
  let complete;
  const h = harness(() => new Promise(resolve => { complete = resolve; }));
  const first = h.open();
  h.form.dispatchEvent(new Event('submit', { cancelable: true }));
  h.button.dispatchEvent(new Event('click'));
  await first;
  const second = h.open();
  complete({ data: { url: 'https://example.invalid' }, error: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.dialog.open, true);
  h.button.dispatchEvent(new Event('click'));
  await second;
});

test('OAuth error permits retry and still requests only Google', async () => {
  let calls = 0;
  const h = harness(async options => {
    assert.equal(options.provider, 'google');
    return ++calls === 1 ? { error: new Error('Try again') } : { data: { ok: true } };
  });
  const login = h.open();
  h.form.dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.errorNode.textContent, 'Try again');
  h.form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal((await login).ok, true);
  assert.equal(calls, 2);
});
