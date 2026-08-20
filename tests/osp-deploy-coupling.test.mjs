import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The frontend names an edge function that must exist before the static site ships.
// Before this branch, OSP's actions lived in shipper-directory-api, deployed for months,
// so frontend and backend could ship in any order. They cannot now: naming a function
// that has not been deployed turns every OSP action into a 404.
//
// A test cannot check production without credentials, and holding a production
// service-role key in CI to assert a deploy would be a worse trade. What it can check is
// that the function the frontend names still exists in this repo, complete -- which
// catches the version of this that actually happens: someone renames or removes the
// function and leaves the caller pointing at nothing.

const root = fileURLToPath(new URL('../', import.meta.url));
const apiClient = readFileSync(`${root}src/osp-api.js`, 'utf8');

function namedFunction(constant) {
  const match = apiClient.match(new RegExp(`${constant} = '([a-z0-9-]+)'`));
  assert.ok(match, `${constant} is not declared in src/osp-api.js`);
  return match[1];
}

test('every edge function the OSP client names exists in the repo', () => {
  for (const constant of ['OSP_FUNCTION', 'OSP_GMAIL_FUNCTION']) {
    const slug = namedFunction(constant);
    const dir = `${root}supabase/functions/${slug}`;
    assert.ok(existsSync(dir), `${constant} names ${slug}, which has no directory`);
    assert.ok(existsSync(`${dir}/index.ts`), `${slug} has no index.ts to deploy`);
  }
});

test('the onboarding runtime carries the module that serves its actions', () => {
  const slug = namedFunction('OSP_FUNCTION');
  const dir = `${root}supabase/functions/${slug}`;
  assert.ok(existsSync(`${dir}/provider-service.ts`), `${slug} cannot answer without provider-service.ts`);
  const index = readFileSync(`${dir}/index.ts`, 'utf8');
  assert.match(index, /from "\.\/provider-service\.ts"/);
  assert.match(index, /isProviderServiceAction/, 'the runtime must gate on the action set');
});

test('no OSP module still calls Rateware\'s function by name', () => {
  // The whole point of src/osp-api.js is that the runtime name lives in one place.
  const files = ['provider-approvals-page.js', 'provider-delivery-page.js', 'provider-gmail-page.js',
    'provider-document-review-page.js', 'provider-entity-vault-page.js', 'provider-onboarding-app.js',
    'provider-onboarding-page.js', 'provider-service-360.js', 'provider-service-page.js',
    'provider-communications-page.js'];
  const strays = [];
  for (const file of files) {
    const text = readFileSync(`${root}src/${file}`, 'utf8');
    if (/callRatewareFunction\(\s*'shipper-directory-api'/.test(text)) strays.push(file);
  }
  assert.deepEqual(strays, [], `these still name Rateware's function directly:\n  ${strays.join('\n  ')}`);
});

test('the deploy order is written down where someone will find it', () => {
  const runbook = readFileSync(`${root}docs/osp-deploy-order.md`, 'utf8');
  assert.match(runbook, /provider-onboarding-api/);
  assert.match(runbook, /before the frontend/i);
  // The rollback asymmetry is the part people get wrong under pressure.
  assert.match(runbook, /Rolling back/i);
});
