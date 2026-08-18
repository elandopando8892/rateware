import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  boundedConfidence, normalizeMailbox, planInboundEnvelope, selectLegalEntity,
} from '../supabase/functions/_shared/provider-inbound-envelope-plan.mjs';

const MX = [{ id: 'mx-uuid', entity_code: 'XBFMX' }];
const NOW = '2026-08-18T12:00:00.000Z';

const base = {
  organization_id: 'org-1',
  mailbox_reference: 'carriers@xbfreight.com',
  external_message_id: 'gmail-abc',
  external_thread_id: 'thread-abc',
  now: NOW,
};

const plan = (overrides) => planInboundEnvelope({ ...base, ...overrides });

test('a resolved entity routes, naming the legal entity found for its jurisdiction', () => {
  const { row, routed } = plan({
    entity: { entity_kind: 'mexico', decision: 'resolved', confidence: 0.9 },
    entities: MX,
  });
  assert.equal(routed, true);
  assert.equal(row.envelope_status, 'routed');
  assert.equal(row.routing_decision, 'mexico');
  assert.equal(row.legal_entity_id, 'mx-uuid');
  assert.equal(row.entity_code, 'XBFMX');
  // The check constraint requires routed_at on a routed envelope.
  assert.equal(row.routed_at, NOW);
  // Entity routing is deterministic evidence, not model output; the audit says so.
  assert.equal(row.routed_by_type, 'rule');
});

test('an ambiguous entity routes to review and names no entity', () => {
  const { row, routed } = plan({
    entity: {
      entity_kind: 'mexico', decision: 'needs_review',
      basis: 'conflicting_evidence', confidence: 0.5,
    },
    entities: MX,
  });
  assert.equal(routed, false);
  assert.equal(row.envelope_status, 'needs_review');
  assert.equal(row.routing_decision, 'needs_review');
  // The constraint forbids a legal entity on a non-routed envelope, and §4 forbids
  // resolving an ambiguous entity silently. Both point the same way.
  assert.equal(row.legal_entity_id, null);
  assert.equal(row.entity_code, null);
  assert.equal(row.routed_at, null);
  assert.equal(row.review_reason, 'conflicting_evidence');
});

test('two entities in one jurisdiction is an ambiguity the agent refuses to break', () => {
  const { row } = plan({
    entity: { entity_kind: 'mexico', decision: 'resolved', confidence: 1 },
    entities: [{ id: 'a', entity_code: 'XBFMX' }, { id: 'b', entity_code: 'XBFMX2' }],
  });
  assert.equal(row.envelope_status, 'needs_review');
  assert.equal(row.review_reason, 'legal_entity_not_resolvable_for_jurisdiction');
});

test('a missing legal entity routes to review rather than inventing an FK target', () => {
  const { row } = plan({
    entity: { entity_kind: 'united_states', decision: 'resolved', confidence: 0.95 },
    entities: [],
  });
  assert.equal(row.envelope_status, 'needs_review');
  assert.equal(row.legal_entity_id, null);
});

test('an unknown jurisdiction never routes, however confident the resolver was', () => {
  const { row } = plan({
    entity: { entity_kind: 'canada', decision: 'resolved', confidence: 1 },
    entities: [{ id: 'ca', entity_code: 'XBFCA' }],
  });
  assert.equal(row.envelope_status, 'needs_review');
});

test('the mailbox is normalized to satisfy the table check', () => {
  const { row } = plan({
    mailbox_reference: '  Carriers@XBFreight.com  ',
    entity: { entity_kind: 'mexico', decision: 'resolved', confidence: 0.8 },
    entities: MX,
  });
  assert.equal(row.mailbox_reference, 'carriers@xbfreight.com');
  assert.equal(normalizeMailbox(' A@B.COM '), 'a@b.com');
});

test('confidence is clamped and rounded to the numeric(5,4) the column accepts', () => {
  assert.equal(boundedConfidence(1.7), 1);
  assert.equal(boundedConfidence(-3), 0);
  assert.equal(boundedConfidence(0.123456), 0.1235);
  assert.equal(boundedConfidence('nonsense'), null);
  assert.equal(boundedConfidence(undefined), null);
});

test('an incomplete identity is refused rather than written', () => {
  assert.throws(() => plan({ external_message_id: '   ', entity: {}, entities: [] }),
    /envelope_identity_incomplete/);
  assert.throws(() => plan({ mailbox_reference: '', entity: {}, entities: [] }),
    /envelope_identity_incomplete/);
  assert.throws(() => plan({ organization_id: '  ', entity: {}, entities: [] }),
    /envelope_identity_incomplete/);
});

test('routing emits append-only received and routed events', () => {
  const { events } = plan({
    entity: { entity_kind: 'mexico', decision: 'resolved', confidence: 0.9 },
    entities: MX,
  });
  assert.deepEqual(events.map((event) => event.event_type), ['received', 'routed']);
  assert.equal(events[1].event_metadata.entity_code, 'XBFMX');
});

test('review emits review_requested instead of routed, carrying the reason', () => {
  const { events } = plan({
    entity: { entity_kind: null, decision: 'needs_review', basis: 'no_evidence', confidence: 0 },
    entities: [],
  });
  assert.deepEqual(events.map((event) => event.event_type), ['received', 'review_requested']);
  assert.equal(events[1].event_metadata.review_reason, 'no_evidence');
});

test('selectLegalEntity declines rows missing the composite FK columns', () => {
  assert.equal(selectLegalEntity([{ id: 'x' }], 'mexico'), null);
  assert.equal(selectLegalEntity([{ entity_code: 'XBFMX' }], 'mexico'), null);
  assert.deepEqual(selectLegalEntity(MX, 'mexico'), { id: 'mx-uuid', entity_code: 'XBFMX' });
});

test('no message content reaches the envelope', () => {
  const { row } = plan({
    entity: { entity_kind: 'mexico', decision: 'resolved', confidence: 0.9 },
    entities: MX,
    metadata: { request_type: 'customer_setup', attachment_count: 2, match_decision: 'matched' },
  });
  const serialized = JSON.stringify(row);
  for (const forbidden of ['subject', 'body_text', 'filename', 'attachment_names', 'sender']) {
    assert.ok(!serialized.includes(forbidden), `envelope must not carry ${forbidden}`);
  }
});

test('the writer never updates an envelope it did not create', () => {
  // Re-routing would rewrite a decision a human may already have reviewed. The
  // replay path returns the stored envelope, so assert the writer has no update.
  const source = readFileSync(
    new URL('../supabase/functions/_shared/provider-inbound-envelope.ts', import.meta.url),
    'utf8',
  );
  assert.ok(!/\.update\(/.test(source), 'the envelope writer must not contain an update');
  assert.match(source, /created: false/);
});
