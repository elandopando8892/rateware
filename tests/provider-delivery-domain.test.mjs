import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deliveryPosture, deliveryPriority, followupDue, normalizeDeliveryQueue,
  sendApproved, summarizeDelivery,
} from '../src/provider-delivery-domain.js';

const NOW = Date.parse('2026-08-18T12:00:00Z');
const msg = (overrides = {}) => ({ message_status: 'draft', next_followup_at: null, send_approved: false, ...overrides });

test('an unknown queue falls back to all', () => {
  assert.equal(normalizeDeliveryQueue('nope'), 'all');
  assert.equal(normalizeDeliveryQueue('SENT'), 'sent');
});

test('a follow-up is due only when its time has passed', () => {
  assert.equal(followupDue(msg({ next_followup_at: '2026-08-18T11:00:00Z' }), NOW), true);
  assert.equal(followupDue(msg({ next_followup_at: '2026-08-18T13:00:00Z' }), NOW), false);
  assert.equal(followupDue(msg({ next_followup_at: null }), NOW), false);
  assert.equal(followupDue(msg({ next_followup_at: 'not-a-date' }), NOW), false);
});

test('posture ranks a failed send above everything', () => {
  assert.equal(deliveryPosture(msg({ message_status: 'failed' }), NOW), 'failed');
  assert.equal(deliveryPriority(msg({ message_status: 'failed' }), NOW), 'critical');
});

test('a sent message with a due follow-up reads followup_due, not sent', () => {
  const row = msg({ message_status: 'sent', next_followup_at: '2026-08-18T09:00:00Z' });
  assert.equal(deliveryPosture(row, NOW), 'followup_due');
  assert.equal(deliveryPriority(row, NOW), 'attention');
});

test('a sent message with no due follow-up reads sent', () => {
  assert.equal(deliveryPosture(msg({ message_status: 'sent' }), NOW), 'sent');
  assert.equal(deliveryPriority(msg({ message_status: 'sent' }), NOW), 'normal');
});

test('draft and pending_approval both read awaiting_approval', () => {
  assert.equal(deliveryPosture(msg({ message_status: 'draft' }), NOW), 'awaiting_approval');
  assert.equal(deliveryPosture(msg({ message_status: 'pending_approval' }), NOW), 'awaiting_approval');
  assert.equal(deliveryPriority(msg({ message_status: 'draft' }), NOW), 'awaiting');
});

test('approved and queued read scheduled', () => {
  assert.equal(deliveryPosture(msg({ message_status: 'approved' }), NOW), 'scheduled');
  assert.equal(deliveryPosture(msg({ message_status: 'queued' }), NOW), 'scheduled');
});

test('send approval reflects the boolean and never treats a draft as sendable', () => {
  assert.equal(sendApproved(msg({ send_approved: true })), true);
  assert.equal(sendApproved(msg({ send_approved: false })), false);
  assert.equal(sendApproved(msg()), false);
});

test('the summary counts what an operator triages by, at a fixed clock', () => {
  const summary = summarizeDelivery([
    msg({ message_status: 'draft' }),
    msg({ message_status: 'failed' }),
    msg({ message_status: 'sent', next_followup_at: '2026-08-18T09:00:00Z' }),
    msg({ message_status: 'sent' }),
  ], NOW);
  assert.equal(summary.total, 4);
  assert.equal(summary.awaiting_approval, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.followups_due, 1);
});
