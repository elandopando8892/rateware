import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/rfx-events.js', import.meta.url), 'utf8');
const start = source.indexOf('async function loadSegmentCandidateRows(');
const end = source.indexOf('\nfunction shortlistCandidateRows(', start);
assert.ok(start >= 0 && end > start);
const loaderSource = source.slice(start, end);

function harness(row) {
  const calls = [];
  const context = {
    savedVendorSegments: [{ id: 'list', vendor_ids: ['stale'] }],
    getCarrierListTemplate: async (id, options) => { calls.push({ id, options }); return { row }; },
    segmentVendorIds: (value) => value.vendor_ids || [],
    hydrateVendorOptionIds: async (ids) => { calls.push({ ids }); return ids.map(id => ({ id })); }
  };
  runInNewContext(loaderSource, context);
  return { context, calls, load: () => context.loadSegmentCandidateRows('list') };
}

test('loading uses the latest server membership instead of cached members', async () => {
  const h = harness({ id: 'list', lifecycle_status: 'active', vendor_ids: ['current'] });
  const rows = await h.load();
  assert.equal(rows[0].id, 'current');
  assert.equal(h.calls[0].options.usageContext, 'carrier_fit');
  assert.equal(h.context.savedVendorSegments[0].vendor_ids[0], 'current');
});

test('archived or unavailable templates never hydrate cached carriers', async () => {
  for (const row of [null, { id: 'list', lifecycle_status: 'archived', vendor_ids: ['stale'] }]) {
    const h = harness(row);
    await assert.rejects(h.load(), /no longer active/);
    assert.equal(h.calls.length, 1);
    assert.equal(h.context.savedVendorSegments.length, 0);
  }
});

test('an empty active template stays empty rather than expanding to the directory', async () => {
  const h = harness({ id: 'list', lifecycle_status: 'active', vendor_ids: [] });
  assert.equal((await h.load()).length, 0);
});
