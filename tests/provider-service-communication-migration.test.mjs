import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const threads = read('../supabase/migrations/20260813160000_provider_service_communication_threads.sql');
const messageKeys = read('../supabase/migrations/20260813160011_provider_service_communication_message_keys.sql');
const attachments = read('../supabase/migrations/20260813160020_provider_service_communication_attachments.sql');
const matches = read('../supabase/migrations/20260813160030_provider_service_communication_matches.sql');
const caseLinks = read('../supabase/migrations/20260813160041_provider_service_communication_case_link_constraints.sql');
const security = read('../supabase/migrations/20260813160092_provider_service_communication_table_revokes.sql');

test('threads are idempotent and can remain unmatched', () => {
  assert.match(threads, /provider_communication_threads_external_unique/);
  assert.match(threads, /matching_status text not null default 'unmatched'/);
  assert.match(threads, /provider_relationship_id uuid/);
});

test('messages are idempotent per mailbox and external ID', () => {
  assert.match(messageKeys, /provider_communication_messages_external_unique/);
});

test('attachments bridge into Build 3 without cross-entity mixing', () => {
  assert.match(attachments, /provider_communication_attachments_document_fkey/);
  assert.match(attachments, /provider_document_versions/);
  assert.match(attachments, /provider_relationship_id, legal_entity_id/);
});

test('soft provider signals stay candidates rather than automatic vendors', () => {
  assert.match(matches, /email_domain/);
  assert.match(matches, /legal_name/);
  assert.match(matches, /candidate_status text not null default 'candidate'/);
});

test('case links require the same provider relationship and legal entity', () => {
  assert.match(caseLinks, /provider_communication_case_links_thread_fkey/);
  assert.match(caseLinks, /provider_communication_case_links_case_fkey/);
});

test('direct runtime writes stay closed', () => {
  assert.match(security, /revoke all on table public\.provider_communication_threads/);
  assert.match(security, /service_role/);
});
