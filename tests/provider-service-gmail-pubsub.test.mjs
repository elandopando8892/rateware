import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260814040000_provider_gmail_pubsub_push.sql');
const auth = read('../supabase/functions/_shared/provider-pubsub-auth.ts');
const sync = read('../supabase/functions/_shared/provider-gmail-sync.ts');
const manualApi = read('../supabase/functions/provider-gmail-intake-api/index.ts');
const push = read('../supabase/functions/provider-gmail-push/index.ts');
const config = read('../supabase/config.toml');

test('Pub/Sub delivery ledger is tenant/entity scoped, idempotent, and service-role only', () => {
  assert.match(migration, /create table if not exists public\.provider_gmail_push_events/);
  assert.match(migration, /foreign key \(organization_id, legal_entity_id\)/);
  assert.match(migration, /unique \(connection_id, pubsub_message_id\)/);
  assert.match(migration, /notification_history_id ~ '\^\[0-9\]\+\$'/);
  assert.match(migration, /status in \('received', 'processing', 'completed', 'ignored_stale', 'failed'\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.provider_gmail_push_events from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert, update on table public\.provider_gmail_push_events to service_role/);
});

test('Pub/Sub authentication verifies Google signature and explicit identity claims', () => {
  assert.match(auth, /https:\/\/www\.googleapis\.com\/oauth2\/v3\/certs/);
  assert.match(auth, /crypto\.subtle\.verify/);
  assert.match(auth, /RSASSA-PKCS1-v1_5/);
  assert.match(auth, /PROVIDER_GMAIL_PUBSUB_AUDIENCE/);
  assert.match(auth, /PROVIDER_GMAIL_PUBSUB_SERVICE_ACCOUNT/);
  assert.match(auth, /GOOGLE_ISSUERS/);
  assert.match(auth, /audienceMatches/);
  assert.match(auth, /claims\.email_verified/);
  assert.match(auth, /claims\.exp/);
  assert.match(auth, /claims\.iat/);
});

test('push receiver only accepts POST and exact allowed mailbox notifications', () => {
  assert.match(push, /request\.method !== 'POST'/);
  assert.match(push, /verifyProviderPubSubRequest\(request\)/);
  assert.match(push, /emailAddress/);
  assert.match(push, /historyId/);
  assert.match(push, /providerGmailAllowedAccount\(\)/);
  assert.match(push, /notification\.emailAddress !== allowedMailbox/);
  assert.match(push, /\.eq\('mailbox_email', allowedMailbox\)/);
  assert.match(push, /\.limit\(2\)/);
  assert.match(push, /routing is ambiguous/);
});

test('push receiver deduplicates, ignores stale history, claims work, and retries failures', () => {
  assert.match(push, /onConflict: 'connection_id,pubsub_message_id'/);
  assert.match(push, /ignoreDuplicates: true/);
  assert.match(push, /BigInt\(candidate\) <= BigInt\(currentText\)/);
  assert.match(push, /ignored_stale/);
  assert.match(push, /\.in\('status', \['received', 'failed'\]\)/);
  assert.match(push, /already processing/);
  assert.match(push, /status: 'completed'/);
  assert.match(push, /status: 'failed'/);
  assert.match(push, /return response\(500/);
  assert.match(push, /return response\(204\)/);
});

test('manual and push paths share the same bounded Gmail sync engine', () => {
  assert.match(manualApi, /syncProviderGmailConnection/);
  assert.match(push, /syncProviderGmailConnection/);
  assert.match(push, /limit: 25/);
  assert.match(push, /trigger: 'pubsub'/);
  assert.match(manualApi, /trigger: 'manual'/);
  assert.match(sync, /historyTypes: 'messageAdded'/);
  assert.match(sync, /newer_than:7d/);
  assert.match(sync, /outbound_enabled: false/);
});

test('Build 17 adds no Gmail outbound authority', () => {
  const combined = [auth, sync, manualApi, push].join('\n');
  assert.doesNotMatch(combined, /gmail\.send|gmail\.compose|gmail\.modify|\/messages\/send|\/drafts\/send/i);
});


test('Pub/Sub push bypasses only the Supabase JWT gateway and verifies Google OIDC internally', () => {
  assert.match(config, /\[functions\.provider-gmail-push\]\s+verify_jwt = false/);
  assert.match(push, /verifyProviderPubSubRequest\(request\)/);
  assert.match(auth, /crypto\.subtle\.verify/);
});
