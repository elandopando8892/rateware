import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  communicationPriorityRank,
  communicationProviderLabel,
  communicationThreadSignals,
  normalizeCommunicationQueue,
  shouldReplaceCommunicationMetrics,
  sortCommunicationThreads,
  summarizeCommunicationThreads,
} from '../src/provider-communications-page-domain.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260814020000_provider_service_communications_inbox.sql');
const api = read('../supabase/functions/shipper-directory-api/provider-service.ts');
const page = read('../provider-communications.html');
const controller = read('../src/provider-communications-page.js');
const providerServicePage = read('../provider-service.html');

test('normalizes only canonical communications queues', () => {
  assert.equal(normalizeCommunicationQueue('NEEDS_REPLY'), 'needs_reply');
  assert.equal(normalizeCommunicationQueue('waiting_provider'), 'waiting_provider');
  assert.equal(normalizeCommunicationQueue('invented'), 'all');
});

test('prioritizes unmatched and review work before routine threads', () => {
  const rows = sortCommunicationThreads([
    { subject: 'Routine', queue_code: 'active', last_message_at: '2026-08-14T01:00:00Z' },
    { subject: 'Reply', queue_code: 'needs_reply', last_message_at: '2026-08-14T02:00:00Z' },
    { subject: 'Unmatched', queue_code: 'unmatched', last_message_at: '2026-08-14T00:00:00Z' },
  ]);
  assert.deepEqual(rows.map((row) => row.subject), ['Unmatched', 'Reply', 'Routine']);
  assert.equal(communicationPriorityRank(rows[0]), 10);
});

test('summarizes server metrics and preserves global metrics under empty filters', () => {
  const metrics = {
    threads: 20,
    unmatched: 2,
    needs_review: 3,
    needs_reply: 4,
    waiting_xbf: 5,
    waiting_external: 6,
    resolved: 7,
  };
  assert.deepEqual(summarizeCommunicationThreads([], metrics), {
    threads: 20,
    unmatched: 2,
    needsReview: 3,
    needsReply: 4,
    waitingXbf: 5,
    waitingExternal: 6,
    resolved: 7,
  });
  assert.equal(shouldReplaceCommunicationMetrics({ queue: 'needs_reply', metrics: { threads: 0 }, currentMetrics: metrics }), false);
  assert.equal(shouldReplaceCommunicationMetrics({ queue: 'all', search: '', metrics: { threads: 0 }, currentMetrics: metrics }), true);
});

test('thread labels and signals remain deterministic', () => {
  assert.equal(communicationProviderLabel({ vendor_name: 'WTL Transport' }), 'WTL Transport');
  assert.equal(communicationProviderLabel({}), 'Unmatched provider');
  assert.deepEqual(
    communicationThreadSignals({ needs_reply: true, candidate_count: 2, attachment_count: 1, case_count: 1 }),
    ['Reply due', '2 match candidates', '1 attachment', '1 linked case'],
  );
});

test('communications read model is sanitized and service-role only', () => {
  assert.match(migration, /create or replace view public\.provider_service_communications_inbox/);
  assert.match(migration, /join public\.workspace_registry/);
  assert.match(migration, /join public\.legal_entities/);
  assert.match(migration, /left join public\.provider_relationships/);
  assert.match(migration, /left join public\.vendors/);
  assert.match(migration, /revoke all on table public\.provider_service_communications_inbox from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select on table public\.provider_service_communications_inbox to service_role/);
  assert.doesNotMatch(migration, /body_text|to_emails|cc_emails|tax_identifier|token_hash|storage_path|file_sha256|account_number/i);
});

test('communications API exposes bounded read-only inbox and thread detail actions', () => {
  assert.match(api, /list_provider_communications_inbox/);
  assert.match(api, /get_provider_communication_thread/);
  assert.match(api, /COMMUNICATION_INBOX_QUEUES/);
  assert.match(api, /clampInteger\(body\.limit, 50, 10, 100\)/);
  assert.match(api, /provider_service_communications_inbox/);
  assert.match(api, /REDACTED_MESSAGE_SENSITIVITIES/);
  assert.match(api, /body_redacted: bodyRedacted/);
  assert.match(api, /slice\(0, 12000\)/);
  assert.doesNotMatch(api, /send_provider|reply_provider|send_email|messages\.send/i);
});

test('Communications Inbox is private, wired, and discoverable from Provider Service', () => {
  assert.match(page, /Communications Inbox/);
  assert.match(page, /data-communication-queue="unmatched"/);
  assert.match(page, /id="communications-detail"/);
  assert.match(controller, /await requirePrivatePage\(\)/);
  assert.match(controller, /list_provider_communications_inbox/);
  assert.match(controller, /get_provider_communication_thread/);
  assert.match(providerServicePage, /href="\.\/provider-communications\.html">Communications Inbox<\/a>/);
});
