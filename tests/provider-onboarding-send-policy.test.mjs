import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const delivery = readFileSync(
  new URL('../supabase/functions/_shared/provider-onboarding-gmail-delivery.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../supabase/migrations/20260819140000_provider_mailbox_policy_domain_shape.sql', import.meta.url),
  'utf8',
);
const gmail = readFileSync(
  new URL('../supabase/functions/_shared/provider-gmail.ts', import.meta.url),
  'utf8',
);
const dispatch = readFileSync(
  new URL('../supabase/functions/shipper-directory-api/provider-service.ts', import.meta.url),
  'utf8',
);

test('the sender allowlist is checked before the policy is read', () => {
  // The policy table said which recipients a mailbox may write to; nothing said which
  // mailbox may send at all. A policy row naming any address would have been honoured.
  const body = delivery.slice(delivery.indexOf('async function policyFor'), delivery.indexOf('export async function draftProviderOnboardingEmail'));
  assert.match(body, /const allowed=providerGmailAllowedAccount\(\);/);
  assert.match(body, /Mailbox is not the allowlisted provider intake account\./);
  const allowlistAt = body.indexOf('providerGmailAllowedAccount()');
  const queryAt = body.indexOf("from('provider_onboarding_mailbox_policies')");
  assert.ok(allowlistAt > 0 && allowlistAt < queryAt, 'the allowlist must gate before the lookup');
});

test('the allowlist has one definition, not a copy', () => {
  // Two copies of "which mailbox is ours" would eventually disagree, and this is the
  // copy that authorises sending.
  assert.match(delivery, /import \{ providerGmailAllowedAccount \} from '\.\/provider-gmail\.ts';/);
  assert.match(gmail, /export function providerGmailAllowedAccount\(\)/);
  // The delivery module must not re-read the env itself.
  assert.ok(!/PROVIDER_GMAIL_ALLOWED_ACCOUNT/.test(delivery), 'delivery re-derives the allowlist');
});

test('the allowlist resolves to one specific account, never a wildcard', () => {
  const resolve = (env) => (env.PROVIDER_GMAIL_ALLOWED_ACCOUNT || 'carriers@xbfreight.com').trim().toLowerCase();
  assert.equal(resolve({}), 'carriers@xbfreight.com', 'an unset env falls back to the intake account, not to "any"');
  assert.equal(resolve({ PROVIDER_GMAIL_ALLOWED_ACCOUNT: '  Ops@XBFreight.com ' }), 'ops@xbfreight.com');
  const matches = (mailbox, env) => String(mailbox || '').trim().toLowerCase() === resolve(env);
  assert.equal(matches('carriers@xbfreight.com', {}), true);
  assert.equal(matches('CARRIERS@XBFREIGHT.COM', {}), true);
  assert.equal(matches('attacker@example.com', {}), false);
  assert.equal(matches('', {}), false);
  assert.equal(matches(null, {}), false);
});

test('an enabled policy that allows nothing is refused, not silently denying', () => {
  assert.match(delivery, /Mailbox policy is enabled but allows no recipient domain\./);
  // cardinality, not array_length: array_length of an empty array is NULL, so the
  // first version of this constraint passed for exactly the case it was written to
  // catch. A probe against the live table caught it -- the same three-valued trap, in
  // the very migration whose comments warn about it.
  assert.match(migration, /enabled is false or cardinality\(allowed_recipient_domains\) >= 1/);
  assert.ok(!/array_length\(allowed_recipient_domains/.test(migration), 'array_length is NULL-valued on empty arrays');
});

test('recipient domains must be lowercase, trimmed, dotted domains', () => {
  const valid = (entry) => entry === entry.toLowerCase()
    && entry === entry.trim()
    && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(entry);
  for (const good of ['salzillo.com.mx', 'xbfreight.com', 'a-b.co', 'sub.domain.example.org']) {
    assert.equal(valid(good), true, `rejected a real domain: ${good}`);
  }
  for (const bad of ['*', '', ' salzillo.com.mx', 'Salzillo.com.mx', '@salzillo.com.mx', 'localhost',
                     'a@b.com', 'salzillo.com.mx.', '.salzillo.com.mx', '-bad.com', 'bad-.com']) {
    assert.equal(valid(bad), false, `accepted a non-domain: ${JSON.stringify(bad)}`);
  }
});

test('an empty domain list is valid and allows nothing', () => {
  // bool_and over an empty array is NULL, which a CHECK treats as passing. That is the
  // right outcome here, so the migration coalesces it deliberately rather than relying
  // on the same three-valued behaviour that hid a real defect elsewhere.
  assert.match(migration, /coalesce\(bool_and\(/);
  assert.match(migration, /coalesce\(domains, '\{\}'::text\[\]\)/);
});

test('the recipient must have a domain at all', () => {
  const domainOf = (recipient) => String(recipient || '').split('@')[1];
  assert.equal(domainOf('a@salzillo.com.mx'), 'salzillo.com.mx');
  assert.equal(domainOf('no-at-sign'), undefined);
  assert.equal(domainOf(''), undefined);
  assert.match(delivery, /if\(!domain\|\|!domains\.includes\(domain\)\)\{/);
});

test('nothing that reaches Gmail is dispatchable', () => {
  // Draft and approve are internal records. Queueing and sending reach outside and stay
  // unreachable regardless of policy, so a misconfiguration cannot become a send.
  for (const command of [
    'send_provider_onboarding_email',
    'queue_provider_onboarding_email',
    'sendQueuedProviderOnboardingEmail',
    'queueProviderOnboardingEmail',
  ]) {
    assert.ok(!dispatch.includes(command), `${command} must not be dispatchable`);
  }
});
