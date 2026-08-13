import test from 'node:test';
import assert from 'node:assert/strict';
import { communicationThreadNeedsReply, isAutoMatchBasis, normalizeProviderCommunicationEmail, resolveProviderCommunicationMatch, validateProviderCommunicationMessageDraft } from '../src/provider-service-communication-domain.js';

test('normalizes email', () => {
  assert.equal(normalizeProviderCommunicationEmail(' Accounting@Carrier.COM '), 'accounting@carrier.com');
  assert.throws(() => normalizeProviderCommunicationEmail('carrier.com'), /Invalid communication email/);
});

test('only deterministic bases auto-match', () => {
  assert.equal(isAutoMatchBasis('exact_email'), true);
  assert.equal(isAutoMatchBasis('email_domain'), false);
  assert.equal(resolveProviderCommunicationMatch([{ providerRelationshipId: 'rel-1', basis: 'exact_email', confidence: 1 }]).decision, 'auto_match');
});

test('soft and ambiguous candidates require review', () => {
  assert.equal(resolveProviderCommunicationMatch([{ providerRelationshipId: 'rel-1', basis: 'email_domain', confidence: 0.99 }]).decision, 'needs_review');
  assert.equal(resolveProviderCommunicationMatch([{ providerRelationshipId: 'rel-1', basis: 'exact_email', confidence: 1 }, { providerRelationshipId: 'rel-2', basis: 'verified_contact', confidence: 1 }]).decision, 'needs_review');
});

test('reply state follows the latest direction', () => {
  assert.equal(communicationThreadNeedsReply({ lastInboundAt: '2026-08-13T20:00:00Z' }), true);
  assert.equal(communicationThreadNeedsReply({ lastInboundAt: '2026-08-13T19:00:00Z', lastOutboundAt: '2026-08-13T20:00:00Z' }), false);
});

test('validates message identity', () => {
  assert.equal(validateProviderCommunicationMessageDraft({ externalMessageId: 'm1', mailboxReference: 'mailbox', direction: 'INBOUND', messageAt: '2026-08-13T20:00:00Z' }).direction, 'inbound');
});
