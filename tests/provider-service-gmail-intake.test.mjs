import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260814030000_provider_gmail_intake.sql');
const outboundMigration = read('../supabase/migrations/20260831230000_osp_outbound_scope_reconciliation.sql');
const shared = read('../supabase/functions/_shared/provider-gmail.ts');
const sync = read('../supabase/functions/_shared/provider-gmail-sync.ts');
const watch = read('../supabase/functions/_shared/provider-gmail-watch.ts');
const api = read('../supabase/functions/provider-gmail-intake-api/index.ts');
const callback = read('../supabase/functions/provider-gmail-oauth-callback/index.ts');
const page = read('../provider-gmail.html');
const controller = read('../src/provider-gmail-page.js');
const supabaseConfig = read('../supabase/config.toml');

test('Provider Gmail storage is purpose-bound, tenant/entity scoped, and service-role only', () => {
  assert.match(migration, /create table if not exists public\.provider_gmail_connections/);
  assert.match(migration, /foreign key \(organization_id, legal_entity_id\)/);
  assert.match(migration, /purpose = 'provider_onboarding'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.provider_gmail_connections from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select, insert, update, delete on table public\.provider_gmail_connections to service_role/);
});

test('database and token helper allow only read plus exact authorized send authority', () => {
  for (const forbidden of ['gmail.compose', 'gmail.modify', 'https://mail.google.com/']) {
    assert.match(migration, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(shared, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(shared, /gmail\.readonly/);
  assert.match(shared, /gmail\.send/);
  assert.match(shared, /carriers@xbfreight\.com/);
  assert.match(outboundMigration, /drop constraint if exists provider_gmail_connections_readonly_scopes_check/);
  assert.match(outboundMigration, /provider_gmail_connections_least_privilege_scopes_check/);
  assert.match(outboundMigration, /scopes <@ array\[/);
});

test('OAuth callback enforces the dedicated provider mailbox and least-privilege outbound scopes', () => {
  assert.match(callback, /provider_gmail_oauth_states/);
  assert.match(callback, /providerGmailAllowedAccount\(\)/);
  assert.match(callback, /validateProviderGmailOutboundScopes\(tokenData\.scope\)/);
  assert.match(callback, /provider_gmail_connections/);
  assert.match(callback, /purpose: 'provider_onboarding'/);
  assert.match(callback, /provider-gmail\.html/);
});

test('intake API exposes status, OAuth, sync, and watch without a browser send operation', () => {
  for (const action of ['provider_gmail_status', 'start_provider_gmail_oauth', 'sync_provider_gmail_inbox', 'renew_provider_gmail_watch']) {
    assert.match(api, new RegExp(action));
  }
  assert.match(api, /requireKindeUser\(request\)/);
  assert.match(api, /resolveRuntimeWorkspaceUser/);
  assert.match(api, /PROVIDER_GMAIL_READONLY_SCOPE/);
  assert.match(api, /PROVIDER_GMAIL_SEND_SCOPE/);
  assert.match(api, /openid email/);
  assert.match(api, /login_hint/);
  assert.match(api, /syncProviderGmailConnection/);
  assert.doesNotMatch(api, /gmail\.compose|gmail\.modify|\/messages\/send|\/drafts\/send/i);
});

test('shared Gmail sync remains bounded, idempotent, confidential, and incremental', () => {
  assert.match(api, /clampProviderGmailInteger\(body\.limit, 25, 1, 100\)/);
  assert.match(sync, /startHistoryId/);
  assert.match(sync, /historyTypes: 'messageAdded'/);
  assert.match(sync, /labelId: 'INBOX'/);
  assert.match(sync, /newer_than:7d/);
  assert.match(sync, /\.status !== 404/);
  assert.match(sync, /external_message_id/);
  assert.match(sync, /processing_status: 'processed'/);
  assert.match(sync, /sensitivity: 'confidential'/);
  assert.match(sync, /needs_reply: message\.direction === 'inbound'/);
  assert.match(sync, /onConflict: 'organization_id,message_id,external_attachment_id'/);
  assert.match(sync, /run_id: run\.data\.id/);
});

test('watch registration is INBOX-only and stores returned history/expiration', () => {
  assert.match(api, /renewProviderGmailWatch/);
  assert.match(watch, /topicName/);
  assert.match(watch, /labelIds: \[["']INBOX["']\]/);
  assert.match(watch, /labelFilterBehavior: ["']INCLUDE["']/);
  assert.match(watch, /history_id: historyId/);
  assert.match(watch, /watch_expiration_at: watchExpirationAt/);
});

test('Provider Gmail Edge functions bypass only the Supabase JWT gateway and keep runtime auth', () => {
  assert.match(supabaseConfig, /\[functions\.provider-gmail-intake-api\]\s+verify_jwt = false/);
  assert.match(supabaseConfig, /\[functions\.provider-gmail-oauth-callback\]\s+verify_jwt = false/);
  assert.match(api, /requireKindeUser\(request\)/);
  assert.match(callback, /provider_gmail_oauth_states/);
});

test('Provider Gmail UI is private and describes human-gated send without exposing send controls', () => {
  assert.match(page, /Gmail Intake \+ Authorized Replies/);
  assert.match(page, /gmail\.readonly/);
  assert.match(page, /gmail\.send/);
  assert.match(page, /No compose, modify or delete/);
  assert.match(page, /id="provider-gmail-entity"/);
  assert.match(controller, /await requirePrivatePage\(\)/);
  assert.match(controller, /provider_gmail_status/);
  assert.match(controller, /start_provider_gmail_oauth/);
  assert.match(controller, /sync_provider_gmail_inbox/);
  assert.match(controller, /renew_provider_gmail_watch/);
  assert.doesNotMatch(page, /id="provider-gmail-send"|>Send email<|>Reply now<|>Compose message</i);
  assert.doesNotMatch(controller, /gmail\.compose|gmail\.modify|\/messages\/send|\/drafts\/send/i);
});
