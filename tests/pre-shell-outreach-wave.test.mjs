import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/rfx-events.js', import.meta.url), 'utf8');
const start = source.indexOf('function outreachDraftRequestStorageKey(');
const end = source.indexOf('\nasync function applyRfxAwardDecision(', start);
assert.ok(start >= 0 && end > start, 'outreach preparation source must be present');
const preparationSource = source.slice(start, end);

function waveFixture({ carriers = 89, lanes = 69, failFirst = false } = {}) {
  const vendorIds = Array.from({ length: carriers }, (_, index) => `vendor-${index + 1}`);
  const targets = vendorIds.flatMap((vendorId) =>
    Array.from({ length: lanes }, (_, index) => ({
      invitation: { id: `${vendorId}-lane-${index + 1}`, vendor_id: vendorId },
    })),
  );
  const storage = new Map();
  const campaignInputs = [];
  const draftInputs = [];
  const effects = [];
  let draftAttempts = 0;
  const context = {
    window: {
      sessionStorage: {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
      },
      crypto: { randomUUID: () => 'idempotency-key' },
    },
    selectedEventId: 'event-a',
    selectedEvent: { rfx_id: 'RFx-test' },
    selectedOutreachAudienceVendorIds: new Set(vendorIds),
    rfxOutreachStatus: {},
    rfxTemplateEditorDirty: false,
    rfxTemplateVisualEditing: false,
    createRfxOutreachCampaignButton: null,
    rfxOutreachCampaignName: null,
    rfxOutreachSender: null,
    APPROVED_GMAIL_SENDER: 'sales@heymarksman.com',
    deliveryParticipationStatus: '',
    deliveryParticipationPage: 1,
    draftQueueTrackingStatus: '',
    draftQueueSearch: 'old',
    draftQueueOffset: 20,
    blockIfLaunchPreflightFails: () => false,
    selectedOutreachTemplate: () => ({ id: 'template-a' }),
    outreachWaveTargets: () => targets,
    selectedOutreachChannel: () => 'email',
    outreachDraftChannels: () => ['email'],
    currentOutreachAudiencePolicy: () => ({ mode: 'explicit', vendor_ids: vendorIds }),
    currentOutreachContactPolicy: () => ({ mode: 'primary' }),
    currentOutreachSequencePolicy: () => ({ mode: 'single' }),
    targetHasChannel: () => true,
    targetHasActiveOutreachDraft: () => false,
    outreachChannelLabel: () => 'Gmail',
    formatNumber: value => String(value),
    setStatus: (_element, message) => effects.push(['status', message]),
    createOutreachCampaign: async input => {
      campaignInputs.push(input);
      return { id: 'campaign-a', ...input };
    },
    generateOutreachDrafts: async (_campaignId, input) => {
      draftAttempts += 1;
      draftInputs.push(input);
      if (failFirst && draftAttempts === 1) throw new Error('transient preparation failure');
      return { generated: input.invitationIds.length, skipped: [] };
    },
    loadDetail: async eventId => effects.push(['load', eventId]),
    activateRfxLaunchWorkspace: (workspace, options) => effects.push(['workspace', workspace, options]),
    metaNotifierStatus: value => value,
    metaNotifierPendingReview: () => false,
    metaNotifierStatusLabel: value => value,
    humanizeError: error => String(error?.message || error),
    renderOutreachLaunchpad: () => effects.push(['render']),
  };
  runInNewContext(preparationSource, context);
  return { context, storage, campaignInputs, draftInputs, effects };
}

test('89 carriers by 69 lanes prepare one bounded draft request without sending', async () => {
  const h = waveFixture();
  const result = await h.context.createCurrentOutreachDrafts();
  assert.equal(result.generated, 6141);
  assert.equal(h.campaignInputs.length, 1);
  assert.equal(h.campaignInputs[0].audience_snapshot.selected_vendor_count, 89);
  assert.equal(h.campaignInputs[0].audience_snapshot.selected_invitation_count, 6141);
  assert.equal(h.draftInputs.length, 1);
  assert.equal(h.draftInputs[0].invitationIds.length, 6141);
  assert.equal(new Set(h.draftInputs[0].invitationIds).size, 6141);
  assert.equal(h.context.deliveryParticipationStatus, 'in_delivery');
  assert.ok(h.effects.some(([kind, workspace]) => kind === 'workspace' && workspace === 'delivery'));
  assert.doesNotMatch(preparationSource, /sendOutreachMessages|sendWhatsappOutreachMessages|sendWhatsappGroupOutreachMessages/);
});

test('a failed preparation retries with the same idempotency key and clears it after success', async () => {
  const h = waveFixture({ carriers: 2, lanes: 3, failFirst: true });
  await assert.rejects(h.context.createCurrentOutreachDrafts(), /transient preparation failure/);
  assert.equal(h.storage.size, 1, 'failed preparation must preserve its retry key');
  await h.context.createCurrentOutreachDrafts();
  assert.equal(h.campaignInputs.length, 2);
  assert.equal(h.campaignInputs[0].idempotency_key, 'idempotency-key');
  assert.equal(h.campaignInputs[1].idempotency_key, 'idempotency-key');
  assert.equal(h.storage.size, 0, 'successful preparation may clear the completed key');
});

test('a completed old-event response does not refresh or redirect the new event', async () => {
  const h = waveFixture({ carriers: 1, lanes: 1 });
  h.context.generateOutreachDrafts = async (_campaignId, input) => {
    h.context.selectedEventId = 'event-b';
    return { generated: input.invitationIds.length, skipped: [] };
  };
  const result = await h.context.createCurrentOutreachDrafts();
  assert.equal(result.generated, 1);
  assert.equal(h.effects.some(([kind]) => kind === 'load' || kind === 'workspace'), false);
  assert.equal(h.context.deliveryParticipationStatus, '');
});
