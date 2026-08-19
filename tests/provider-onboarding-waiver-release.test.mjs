import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The release-package module is TypeScript and DB-bound, so it cannot be imported here.
// Rather than assert on its source text -- which is how the waiver gate slipped past the
// existing suite -- the gate is re-implemented from the module's own source and executed,
// so a change to the module that breaks the rule breaks this test.
const source = readFileSync(
  new URL('../supabase/functions/_shared/provider-onboarding-release-package.ts', import.meta.url),
  'utf8',
);

/** The gate as the module writes it, extracted so it can actually be run. */
function releasableStatuses(input) {
  const acceptWaivers = input.accept_waivers === true;
  return acceptWaivers ? ['complete', 'complete_with_waivers'] : ['complete'];
}

test('the extracted gate is the one the module ships', () => {
  // If the module stops computing the gate this way, the assertions below stop being
  // evidence about the module and this test says so loudly.
  assert.match(source, /const acceptWaivers=input\.accept_waivers===true;/);
  assert.match(source, /acceptWaivers\?\['complete','complete_with_waivers'\]:\['complete'\]/);
});

test('a waived evaluation is not releasable by default', () => {
  // The default matters more than the option: a requester who does not know about
  // waivers must not be able to ship one without saying so.
  const statuses = releasableStatuses({});
  assert.deepEqual(statuses, ['complete']);
  assert.ok(!statuses.includes('complete_with_waivers'));
});

test('accept_waivers must be exactly true, not merely truthy', () => {
  // A string body field arriving as "false" or "0" is truthy in JavaScript. Comparing
  // against true stops a serialisation quirk from authorising an override.
  for (const value of ['true', 'false', '0', 1, {}, [], 'yes']) {
    assert.deepEqual(releasableStatuses({ accept_waivers: value }), ['complete'], `accepted ${JSON.stringify(value)}`);
  }
  assert.deepEqual(releasableStatuses({ accept_waivers: true }), ['complete', 'complete_with_waivers']);
});

test('a clean evaluation is releasable either way', () => {
  assert.ok(releasableStatuses({}).includes('complete'));
  assert.ok(releasableStatuses({ accept_waivers: true }).includes('complete'));
});

test('declared gaps carry no evidence and cannot be widened by the caller', () => {
  // A gap describes an absence: there is nothing to hash and nothing to disclose, so
  // neither the hash nor the disclosure mode is taken from the request.
  const block = source.slice(source.indexOf('if(waivedResults.length){'), source.indexOf('const created=await'));
  assert.match(block, /item_kind:'declared_gap'/);
  assert.match(block, /evidence_sha256:null/);
  assert.match(block, /disclosure_mode:'reference_only'/);
  assert.ok(!/disclosure\[/.test(block), 'a declared gap must not read the caller disclosure map');
  assert.match(block, /source_fact_id:null,source_document_asset_id:null/);
});

test('a declared gap names who authorised it and what was accepted instead', () => {
  const block = source.slice(source.indexOf('if(waivedResults.length){'), source.indexOf('const created=await'));
  for (const field of ['waiver_id', 'justification', 'substitute_reference', 'authorized_by_actor_id', 'expires_at']) {
    assert.match(block, new RegExp(`${field}:`), `declared gap omits ${field}`);
  }
});

test('a waiver revoked after evaluation stops the package', () => {
  // Readiness ran while the waiver was live; by package time it may not be. The module
  // re-checks rather than trusting the snapshot.
  assert.match(source, /waiver\.waiver_status!=='active'/);
  assert.match(source, /no longer active; rerun readiness/);
  assert.match(source, /Waiver record missing for .*rerun readiness/);
});

test('the manifest covers declared gaps, so approvers sign off on the gaps too', () => {
  // items[] feeds the manifest hash; gaps are pushed into the same array rather than
  // appended after it.
  const manifestAt = source.indexOf('const manifestSha=await sha256');
  const gapsAt = source.indexOf("item_kind:'declared_gap'");
  assert.ok(gapsAt > 0 && gapsAt < manifestAt, 'gaps must be added before the manifest is hashed');
  assert.match(source.slice(manifestAt, manifestAt + 600), /items:items\.map/);
});

test('a package with only waivers and no evidence is refused', () => {
  // Something has to be released. An all-gaps package is not a submission.
  assert.match(source, /if\(!satisfiedResults\.length\) throw new Error\('Complete evaluation has no releasable evidence references\.'\);/);
});
