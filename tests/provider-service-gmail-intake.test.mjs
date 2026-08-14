import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260814030000_provider_gmail_intake.sql');
const shared = read('../supabase/functions/_shared/provider-gmail.ts');
const api = read('../supabase/functions/provider-gmail-intake-api/index.ts');
const callback = read('../supabase/functions/provider-gmail-oauth-callback/index.ts');
const page = read('../provider-gmail.html');
const controller = read('../src/provider-gmail-page.js');

test('Provider Gmail storage is purpose-bound, tenant/entity scoped, and service-role only', () => {
  assert.match(migration, /create table if not exists public\.provider_gmail_connections/);
  assert.match(migration, /foreign key \(organization_id, legal_entity_id\)/);
  assert.match(migration, /purpose = 'provider_onboarding'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.provider_gmail_connections from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert, update, delete on table public\.provider_gmail_connections to service_role/);
});

test('database and token helper forbid outbound Gmail scopes', () => {
  for (const forbidden of ['gmail.send', 'gmail.compose', 'gmail.modify', 'https://mail.google.com/']) {
    assert.match(migration, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(shared, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(shared, /gmail\.readonly/);
  assert.match(shared, /carriers@xbfreight\.com/);
  assert.doesNotMatch(shared, /gmail\.send[^'"\]]*allow|gmail\.compose[^'"\]]*allow/i);
});

test('OAuth callback enforces the dedicated provider mailbox and readonly scope', () => {
  assert.match(callback, /provider_gmail_oauth_states/);
  assert.match(callback, /providerGmailAllowedAccount\(\)/);
  assert.match(callback, /validateProviderGmailScopes\(tokenData\.scope\)/);
  assert.match(callback, /provider_gmail_connections/);
  assert.match(callback, /purpose: 'provider_onboarding'/);
  assert.match(callback, /provider-gmail\.html/);
});

test('intake API exposes only status, OAuth, sync, and watch operations', () => {
  for (const action of ['provider_gmail_status', 'start_provider_gmail_oauth', 'sync_provider_gmail_inbox', 'renew_provider_gmail_watch']) {
    assert.match(api, new RegExp(action));
  }
  assert.match(api, /requireKindeUser\(request\)/);
  assert.match(api, /resolveRuntimeWorkspaceUser/);
  assert.match(api, /PROVIDER_GMAIL_READONLY_SCOPE/);
  assert.match(api, /openid email/);
  assert.match(api, /login_hint/);
  assert.doesNotMatch(api, /gmail\.send|gmail\.compose|gmail\.modify|\/messages\/send|\/drafts\/send/i);
});

test('Gmail sync is bounded, idempotent, confidential, and uses incremental history', () => {
  assert.match(api, /clampInteger\(body\.limit, 25, 1, 100\)/);
  assert.match(api, /startHistoryId/);
  assert.match(api, /historyTypes: 'messageAdded'/);
  assert.match(api, /labelId: 'INBOX'/);
  assert.match(api, /newer_than:7d/);
  assert.match(api, /\.status !== 404/);
  assert.match(api, /external_message_id/);
  assert.match(api, /processing_status: 'processed'/);
  assert.match(api, /sensitivity: 'confidential'/);
  assert.match(api, /needs_reply: message\.direction === 'inbound'/);
  assert.match(api, /onConflict: 'organization_id,message_id,external_attachment_id'/);
});

test('watch registration is INBOX-only and stores returned history/expiration', () => {
  assert.match(api, /topicName: PROVIDER_GMAIL_PUBSUB_TOPIC/);
  assert.match(api, /labelIds: \['INBOX'\]/);
  assert.match(api, /labelFilterBehavior: 'INCLUDE'/);
  assert.match(api, /history_id: historyId/);
  assert.match(api, /watch_expiration_at: watchExpirationAt/);
});

test('Provider Gmail UI is private and cannot expose outbound controls', () => {
  assert.match(page, /Gmail Intake/);
  assert.match(page, /gmail\.readonly only/);
  assert.match(page, /No send/);
  assert.match(page, /id="provider-gmail-entity"/);
  assert.match(controller, /await requirePrivatePage\(\)/);
  assert.match(controller, /provider_gmail_status/);
  assert.match(controller, /start_provider_gmail_oauth/);
  assert.match(controller, /sync_provider_gmail_inbox/);
  assert.match(controller, /renew_provider_gmail_watch/);
  assert.doesNotMatch(page, /id="provider-gmail-send"|>Send email<|>Reply now<|>Compose message</i);
  assert.doesNotMatch(controller, /gmail\.send|gmail\.compose|gmail\.modify|\/messages\/send|\/drafts\/send/i);
});
