import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/rfx-events.js', import.meta.url), 'utf8');
const controls = [
  ['rfxOutreachCarrierSegment', 'rfxOutreachCarrierCandidates'],
  ['selectSegmentCarriersButton', 'clearCarrierSelectionButton'],
  ['loadManualShortlistTemplateButton', 'manualShortlistLane'],
];

function harness(control, nextControl) {
  let callback, resolve, reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const effects = [];
  const context = {
    selectedEventId: 'event-a', segment: 'list-a',
    selectedSegmentId: () => context.segment,
    participantTemplateMutationRunning: false,
    participantTemplates: () => [{ id: 'list-a', segment_name: 'List A', vendor_ids: ['carrier-a'] }],
    segmentVendorIds: row => row?.vendor_ids || [],
    loadSegmentCandidateRows: () => pending,
    renderManualShortlistControls: () => {}, renderOutreachCarrierAdder: () => {},
    manualShortlistStatus: {}, rfxOutreachCarrierStatus: {}, manualShortlistTemplateName: null,
    formatNumber: String, humanizeError: String,
    rememberSelectedVendorRows: rows => effects.push(['remember', rows]),
    selectManualVendorIds: ids => effects.push(['select', ids]),
    persistManualParticipantSelection: () => effects.push(['persist']),
    setStatus: (_target, message) => effects.push(['status', message]),
    selectedManualVendorIdsState: new Set(),
  };
  context[control] = { value: 'list-a', addEventListener: (_event, handler) => { callback = handler; } };
  const start = source.indexOf(`${control}?.addEventListener(`);
  const end = source.indexOf(`${nextControl}?.addEventListener(`, start);
  assert.ok(start >= 0 && end > start);
  runInNewContext(source.slice(start, end), context);
  return { context, effects, resolve, reject, start: () => callback() };
}

for (const [control, next] of controls) {
  for (const change of ['event', 'list']) {
    for (const outcome of ['success', 'error']) {
      test(`${control}: ignores late ${outcome} after ${change} changes`, async () => {
        const h = harness(control, next);
        h.start();
        h.effects.length = 0;
        if (change === 'event') h.context.selectedEventId = 'event-b';
        else { h.context.segment = 'list-b'; h.context[control].value = 'list-b'; }
        if (outcome === 'success') h.resolve([{ id: 'carrier-a' }]);
        else h.reject(new Error('Old request failed'));
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(h.effects, []);
        assert.equal(h.context.selectedManualVendorIdsState.size, 0);
      });
    }
  }
  test(`${control}: applies a response to the unchanged context`, async () => {
    const h = harness(control, next);
    h.start();
    h.resolve([{ id: 'carrier-a' }]);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(h.effects.some(([kind]) => kind === 'remember'));
    if (control === 'selectSegmentCarriersButton') assert.ok(h.effects.some(([kind]) => kind === 'select'));
    if (control === 'loadManualShortlistTemplateButton') assert.ok(h.context.selectedManualVendorIdsState.has('carrier-a'));
  });
}
