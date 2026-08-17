import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260817110000_provider_onboarding_approval_commands.sql', import.meta.url), 'utf8');
const contract = readFileSync(new URL('../supabase/functions/_shared/action-contract-provider-service.mjs', import.meta.url), 'utf8');

const SIGNATURES = [
  'public.provider_onboarding_decide_release_package_approval(uuid,uuid,text,text,text,text)',
  'public.provider_onboarding_revoke_release_package(uuid,uuid,text,text)',
];

test('both commands are security definer with a pinned search_path', () => {
  // Match the declaration form only; the file header also mentions the phrase.
  const declarations = migration.match(/language plpgsql\s+security definer\s+set search_path = public, pg_temp/g) || [];
  assert.equal(declarations.length, 2);
});

test('direct browser execution is revoked and only service_role may execute', () => {
  for (const signature of SIGNATURES) {
    assert.ok(migration.includes(`revoke all on function ${signature} from public, anon, authenticated;`), `missing revoke for ${signature}`);
    assert.ok(migration.includes(`grant execute on function ${signature} to service_role;`), `missing grant for ${signature}`);
  }
});

test('the acting identity is an explicit argument, never inferred from the session', () => {
  assert.match(migration, /p_approver_actor_id text/);
  assert.match(migration, /p_actor_id text/);
  assert.ok(!/current_user|session_user/.test(migration), 'the actor must not be taken from the database session');
});

test('separation of duties is enforced before any write', () => {
  assert.match(migration, /if package_row\.requested_by_actor_id = normalized_actor then/);
  assert.match(migration, /The requester cannot approve their own release package\./);
});

test('a decision requires a recognized role and a non-empty note', () => {
  assert.match(migration, /normalized_role not in \('operations','compliance','data_owner','legal'\)/);
  assert.match(migration, /Approval decision requires a note\./);
  assert.match(migration, /normalized_decision not in \('approved','rejected'\)/);
});

test('the package row is locked and its state revalidated inside the command', () => {
  assert.match(migration, /from public\.provider_onboarding_release_packages\s+where organization_id=p_organization_id and id=p_package_id\s+for update;/);
  assert.match(migration, /Release package has been revoked\./);
  assert.match(migration, /Release package is not pending approval\./);
  assert.match(migration, /Release package authorization has expired\./);
});

test('approvals are counted only against the current package revision', () => {
  assert.match(migration, /and package_revision=package_row\.revision\s+and decision='approved'/);
  assert.match(migration, /if approved_count >= package_row\.required_approval_count then/);
});

test('an identical decision replays idempotently while a changed decision is refused', () => {
  assert.match(migration, /if existing\.decision = normalized_decision and existing\.package_revision = package_row\.revision then/);
  assert.match(migration, /'idempotent_replay', true/);
  assert.match(migration, /This approver has already decided this release package\./);
});

test('revocation cascades to any active signature authorization for the package', () => {
  // A consent issued against approved contents must not outlive the approval.
  assert.match(migration, /update public\.provider_onboarding_signature_authorizations\s+set authorization_status='revoked', revoked_at=now\(\), revocation_reason_code='package_revoked'/);
  assert.match(migration, /and authorization_status='active';/);
});

test('revocation is idempotent and requires an actor and a reason', () => {
  assert.match(migration, /Revocation requires an identified actor\./);
  assert.match(migration, /Revocation requires a reason code\./);
  assert.match(migration, /if package_row\.revoked_at is not null then\s+return jsonb_build_object\([^)]*'idempotent_replay',true\)/);
});

test('every state change writes an append-only package event', () => {
  for (const eventType of ['package_rejected', 'package_approved', 'package_revoked']) {
    assert.ok(migration.includes(`'${eventType}'`), `missing ${eventType} event`);
  }
  assert.equal((migration.match(/insert into public\.provider_onboarding_release_package_events/g) || []).length, 3);
});

test('both commands are registered in the Provider Service action contract', () => {
  for (const signature of SIGNATURES) {
    assert.ok(contract.includes(`rpc.${signature}`), `${signature} is not registered`);
  }
  assert.match(contract, /internal\.provider_onboarding\.decide_release_package_approval/);
  assert.match(contract, /internal\.provider_onboarding\.revoke_release_package/);
  assert.match(contract, /expectedCountsDelta: \{ governable: 38, edge: 0, postgres: 38, ratewareApi: 0 \}/);
});

test('both commands are declared critical and tenant-scoped', () => {
  const rows = contract.split('\n').filter((line) => line.includes('provider_onboarding_decide_release_package_approval') || line.includes('provider_onboarding_revoke_release_package'));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.ok(row.includes('"critical"'), 'approval commands must be classified critical');
    assert.ok(row.includes('"tenant-scoped"'), 'approval commands must be tenant-scoped');
    assert.ok(row.includes('"provider_approvals"'), 'approval commands belong to the provider_approvals resource');
  }
});
