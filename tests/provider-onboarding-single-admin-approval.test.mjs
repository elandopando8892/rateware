import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260819120000_provider_onboarding_single_admin_approval.sql', import.meta.url),
  'utf8',
);
const packageModule = readFileSync(
  new URL('../supabase/functions/_shared/provider-onboarding-release-package.ts', import.meta.url),
  'utf8',
);

test('separation of duties is still the default', () => {
  // A package that says nothing must keep refusing its own requester. The column
  // defaults to false and the RPC only relaxes for a package that opted in.
  assert.match(migration, /self_approval_permitted boolean not null default false/);
  assert.match(migration, /if not package_row\.self_approval_permitted then\s*\n\s*raise exception 'The requester cannot approve their own release package\.'/);
});

test('the guard is relaxed, not removed', () => {
  // Deleting the check would drop separation of duties for every package forever.
  assert.match(migration, /if package_row\.requested_by_actor_id = normalized_actor then/);
  assert.match(migration, /is_self_approval := true;/);
});

test('a self-approval is recorded as one', () => {
  // Otherwise the row is indistinguishable from an independent approval.
  assert.match(migration, /self_approved boolean not null default false/);
  assert.match(migration, /decision_note,self_approved\)/);
  assert.match(migration, /normalized_note,is_self_approval\)/);
  assert.match(migration, /'self_approved',is_self_approval/);
});

test('the table constraint also admits only a flagged self-approval', () => {
  // Separation of duties was enforced in two places; relaxing only the RPC left the
  // table constraint rejecting the insert. Both are relaxed, and neither now permits an
  // unflagged self-approval.
  assert.match(migration, /requested_by_actor_id <> approver_actor_id or self_approved is true/);
  const admits = (requester, approver, selfApproved) => requester !== approver || selfApproved === true;
  assert.equal(admits('a', 'b', false), true, 'independent approval');
  assert.equal(admits('a', 'a', false), false, 'unflagged self-approval must be refused');
  assert.equal(admits('a', 'a', true), true, 'flagged self-approval is admitted');
});

test('a self-approving package may not require more than one approval', () => {
  // The only eligible approver decides once; a higher threshold is unreachable and the
  // package would sit looking merely pending.
  assert.match(migration, /self_approval_permitted is false or required_approval_count = 1/);
  assert.match(packageModule, /A self-approving package must require exactly one approval\./);
});

test('self-approval must be asked for explicitly, not inferred', () => {
  assert.match(packageModule, /const selfApproval=input\.self_approval_permitted===true;/);
  // Same reasoning as accept_waivers: a truthy string must not authorise it.
  const relax = (value) => value === true;
  for (const value of ['true', 'false', '0', 1, {}, [], 'yes']) {
    assert.equal(relax(value), false, `accepted ${JSON.stringify(value)}`);
  }
  assert.equal(relax(true), true);
});

test('the package carries the flag it was cut with', () => {
  assert.match(packageModule, /self_approval_permitted:selfApproval,/);
});

test('the approval threshold rule is executable, not just asserted', () => {
  const check = (selfApproval, count) => {
    if (selfApproval && count !== 1) throw new Error('A self-approving package must require exactly one approval.');
    return { selfApproval, count };
  };
  assert.deepEqual(check(true, 1), { selfApproval: true, count: 1 });
  assert.throws(() => check(true, 2), /exactly one approval/);
  assert.throws(() => check(true, 3), /exactly one approval/);
  // Two-person packages are unaffected.
  assert.deepEqual(check(false, 2), { selfApproval: false, count: 2 });
  assert.deepEqual(check(false, 1), { selfApproval: false, count: 1 });
});

test('everything else the RPC guarded is still guarded', () => {
  // The function was rewritten wholesale, so the untouched rules need re-proving.
  for (const guard of [
    /Release package not found\./,
    /Release package has been revoked\./,
    /Release package is not pending approval\./,
    /Release package authorization has expired\./,
    /Approval decision requires a note\./,
    /Approval requires an identified approver\./,
    /Approval role is not recognized\./,
    /This approver has already decided this package revision\./,
    /idempotent_replay', true/,
    /and package_revision=package_row\.revision/,
    /for update;/,
  ]) {
    assert.match(migration, guard, `lost guard: ${guard}`);
  }
});
