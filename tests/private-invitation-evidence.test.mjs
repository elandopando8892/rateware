import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationDeadline, activePrivateInvitation, receiptEvidence,
  loadPrivateDeliveryEvidence, PRIVATE_DELIVERY_CONTRACT } from '../supabase/functions/_shared/private-invitation-evidence.mjs';

const now = Date.parse('2026-09-30T18:00:00Z');
const scope = { ownerEmail: 'owner@example.invalid', vendorId: 'carrier-a' };
const row = { id: 'invitation-a', vendor_id: scope.vendorId, rfx_event_id: 'event-a', invitation_status: 'invited',
  rfx_events: { id: 'event-a', owner_email: scope.ownerEmail, status: 'open', due_date: '2026-09-30' } };
const message = { id: 'message-a', owner_email: scope.ownerEmail, vendor_id: scope.vendorId,
  rfx_event_id: row.rfx_event_id, rfx_lane_vendor_id: row.id, status: 'sent', channel: 'email',
  sent_at: '2026-09-30T12:00:00Z', provider: 'gmail', provider_message_id: 'synthetic-provider-id',
  provider_response_status: 'accepted', delivery_status: 'sent' };

test('provider acceptance is not delivery; manual report is distinct and accountable', () => {
  assert.deepEqual(receiptEvidence(message, row, scope, now), { sent_at: '2026-09-30T12:00:00.000Z', basis: 'provider_accepted' });
  assert.equal(receiptEvidence({ ...message, provider_message_id: null }, row, scope, now), null);
  assert.equal(receiptEvidence({ ...message, provider: 'unknown' }, row, scope, now), null);
  assert.equal(receiptEvidence({ ...message, channel: 'whatsapp' }, row, scope, now), null);
  assert.equal(receiptEvidence({ ...message, provider: 'meta', channel: 'whatsapp' }, row, scope, now).basis, 'provider_accepted');
  const manual = { ...message, provider_message_id: null, status: 'manual_sent',
    manual_sent_at: message.sent_at, manual_sent_by: scope.ownerEmail };
  assert.equal(receiptEvidence(manual, row, scope, now).basis, 'manual_reported');
  assert.equal(receiptEvidence({ ...manual, manual_sent_by: 'someone@example.invalid' }, row, scope, now), null);
  assert.equal(receiptEvidence({ ...manual, manual_sent_at: null }, row, scope, now), null);
});

test('queued, uncertain, failed, bounced, suppressed, future or incomplete evidence never grants access', () => {
  for (const status of ['drafted', 'queued', 'sending', 'delivery_unknown', 'bounced', 'failed', '', 'unexpected']) {
    assert.equal(receiptEvidence({ ...message, status }, row, scope, now), null, status);
  }
  for (const patch of [{ delivery_status: 'failed' }, { provider_response_status: 'delivery_unknown' },
    { send_result: { outcome: 'delivery_unknown' } }, { bounce_status: 'hard' },
    { suppressed_at: message.sent_at }, { sent_at: null }, { sent_at: 'not-a-date' }, { sent_at: '2026-10-01T00:00:00Z' }]) {
    assert.equal(receiptEvidence({ ...message, ...patch }, row, scope, now), null);
  }
  assert.ok(receiptEvidence({ ...message, failed_at: '2026-09-29T00:00:00Z' }, row, scope, now), 'successful retry keeps historical failed_at');
  assert.ok(receiptEvidence({ ...message, status: 'archived' }, row, scope, now), 'archived message does not revoke an invitation');
});

test('receipt must match owner, vendor, event AND an explicit invitation ID', () => {
  for (const patch of [{ owner_email: 'foreign@example.invalid' }, { vendor_id: 'carrier-b' },
    { rfx_event_id: 'event-b' }, { rfx_lane_vendor_id: 'invitation-b' }, { rfx_lane_vendor_id: null }]) {
    assert.equal(receiptEvidence({ ...message, ...patch }, row, scope, now), null);
  }
  assert.ok(receiptEvidence({ ...message, rfx_lane_vendor_id: null, metadata: { rfx_lane_vendor_ids: [row.id] } }, row, scope, now));
  assert.equal(receiptEvidence({ ...message, rfx_lane_vendor_id: null, metadata: { rfx_lane_vendor_ids: 'invitation-a' } }, row, scope, now), null);
});

test('deadline is authoritative with configured offset, strict dates and unknowns fail closed', () => {
  assert.equal(invitationDeadline('2026-09-30', '-06:00'), '2026-10-01T05:59:59.000Z');
  assert.equal(invitationDeadline('2026-09-30', '+02:00'), '2026-09-30T21:59:59.000Z');
  assert.equal(invitationDeadline('2026-09-30T10:00:00-04:00', '-06:00'), '2026-09-30T14:00:00.000Z');
  for (const due of ['', null, '2026-02-30', '2026-13-01', '09/30/2026']) assert.equal(invitationDeadline(due, '-06:00'), null);
  for (const offset of ['invalid', '+15:00', '+14:01', '-06:99']) assert.equal(invitationDeadline('2026-09-30', offset), null);
  assert.ok(activePrivateInvitation(row, scope, '-06:00', now));
  assert.equal(activePrivateInvitation(row, scope, '-06:00', Date.parse('2026-10-01T05:59:59Z')), false);
  for (const status of ['drafted', 'queued', 'revoked', 'declined', 'archived', 'unknown', '']) {
    assert.equal(activePrivateInvitation({ ...row, invitation_status: status }, scope, '-06:00', now), false);
  }
  for (const patch of [{ vendor_id: 'carrier-b' }, { rfx_event_id: 'event-b' },
    { rfx_events: { ...row.rfx_events, status: 'closed' } }, { rfx_events: { ...row.rfx_events, owner_email: 'foreign' } },
    { rfx_events: { ...row.rfx_events, due_date: null } }]) {
    assert.equal(activePrivateInvitation({ ...row, ...patch }, scope, '-06:00', now), false);
  }
});

function database(pages) {
  const calls = [];
  const client = { from(table) {
    assert.equal(table, 'outreach_messages');
    const query = {};
    for (const method of ['select', 'eq', 'in', 'not', 'order']) query[method] = (...args) => {
      calls.push([method, ...args]); return query;
    };
    query.range = async (start, end) => { calls.push(['range', start, end]); return pages(start / 200); };
    return query;
  } };
  return { client, calls };
}

test('paged read is scoped and filters foreign IDs, malformed results and missing receipts', async () => {
  const db = database(() => ({ error: null, data: [message, { ...message, vendor_id: 'carrier-b' },
    { ...message, metadata: { rfx_lane_vendor_ids: ['foreign-row'] } }] }));
  const proofs = await loadPrivateDeliveryEvidence(db.client, [row, { ...row, id: 'foreign-row', vendor_id: 'carrier-b' }], scope, now);
  assert.equal(proofs.size, 1);
  assert.deepEqual(db.calls.filter(([method]) => method === 'eq'), [['eq', 'owner_email', scope.ownerEmail], ['eq', 'vendor_id', scope.vendorId]]);
  assert.deepEqual(PRIVATE_DELIVERY_CONTRACT, { contractVersion: 'rateware-private-book-sent.v1', source: 'outreach_messages', sentOnly: true });
  for (const result of [{ error: { message: 'private DB detail' }, data: null }, { error: null, data: null }]) {
    await assert.rejects(loadPrivateDeliveryEvidence(database(() => result).client, [row], scope, now), /^Error: PRIVATE_DELIVERY_EVIDENCE_UNAVAILABLE$/);
  }
  const empty = await loadPrivateDeliveryEvidence(database(() => ({ error: null, data: [] })).client, [row], scope, now);
  assert.equal(empty.size, 0);
  const chunked = database(() => ({ error: null, data: [] }));
  await loadPrivateDeliveryEvidence(chunked.client, Array.from({ length: 101 }, (_, i) => ({ ...row, id: `invite-${i}`, rfx_event_id: `event-${i}` })), scope, now);
  assert.deepEqual(chunked.calls.filter(([method, field]) => method === 'in' && field === 'rfx_event_id').map(([, , ids]) => ids.length), [100, 1]);
});

test('pagination finishes only after exhaustion; saturated read budget fails closed', async () => {
  const db = database((page) => ({ error: null, data: page === 0 ? Array.from({ length: 200 }, () => message) : [{ ...message, sent_at: '2026-09-30T13:00:00Z' }] }));
  assert.equal((await loadPrivateDeliveryEvidence(db.client, [row], scope, now)).get(row.id).sent_at, '2026-09-30T13:00:00.000Z');
  assert.equal(db.calls.filter(([method]) => method === 'range').length, 2);
  const saturated = database(() => ({ error: null, data: Array.from({ length: 200 }, () => message) }));
  await assert.rejects(loadPrivateDeliveryEvidence(saturated.client, [row], scope, now), /PRIVATE_DELIVERY_EVIDENCE_UNAVAILABLE/);
  assert.equal(saturated.calls.filter(([method]) => method === 'range').length, 25);
});
