import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// handleProviderServiceAction ends in an unconditional
//   return await getProvider360(...)
// with no `if (action === "get_provider_360")` guarding it. Today that is correct:
// isProviderServiceAction gates the whole function, commands are taken by a Map, ten reads
// have explicit branches, and get_provider_360 is the only member left. It is not a live
// bug.
//
// It is a trap. Add a read action to PROVIDER_SERVICE_ACTIONS and forget its branch, and
// the caller silently receives Provider 360 data instead of an error -- a wrong answer
// rather than a failure, which is the harder kind to notice. An action was added to this
// set during the waiver work, so the trap is live traffic, not hypothetical.

const source = readFileSync(
  new URL('../supabase/functions/shipper-directory-api/provider-service.ts', import.meta.url),
  'utf8',
);

/** The one action allowed to be served by the terminal fallback. */
const FALLBACK_ACTION = 'get_provider_360';

function block(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `could not find ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `could not find ${endMarker} after ${startMarker}`);
  return source.slice(start, end);
}

const declaredActions = [...block('const PROVIDER_SERVICE_ACTIONS = new Set([', ']);')
  .matchAll(/"([a-z0-9_]+)"/g)].map((match) => match[1]);

const commandActions = [...block('const PROVIDER_SERVICE_COMMANDS = new Map', '\n]);')
  .matchAll(/\["([a-z0-9_]+)",/g)].map((match) => match[1]);

const branchedActions = [...source.matchAll(/if \(action === "([a-z0-9_]+)"\)/g)].map((match) => match[1]);

test('the parse found the real sets, not an empty regex match', () => {
  assert.ok(declaredActions.length >= 20, `only parsed ${declaredActions.length} declared actions`);
  assert.ok(commandActions.length >= 10, `only parsed ${commandActions.length} commands`);
  assert.ok(branchedActions.length >= 9, `only parsed ${branchedActions.length} read branches`);
  assert.ok(declaredActions.includes(FALLBACK_ACTION));
  // Pinned because a waiver command was added to this surface and must stay dispatchable.
  for (const action of ['record_provider_onboarding_requirement_waiver', 'evaluate_provider_onboarding_readiness']) {
    assert.ok(declaredActions.includes(action), `${action} left the action set`);
  }
});

test('every declared action is dispatched by name, except the single fallback', () => {
  const dispatched = new Set([...commandActions, ...branchedActions]);
  const undispatched = declaredActions.filter((action) => !dispatched.has(action));
  assert.deepEqual(undispatched, [FALLBACK_ACTION],
    'an action with no branch falls through to Provider 360 and answers the wrong question '
    + `instead of failing. Give it a branch, or a command entry:\n  ${undispatched.join('\n  ')}`);
});

test('every command in the map is declared in the action set', () => {
  // The reverse gap: a command the guard rejects before it can ever run.
  const declared = new Set(declaredActions);
  const unreachable = commandActions.filter((action) => !declared.has(action));
  assert.deepEqual(unreachable, [], `command registered but not accepted by isProviderServiceAction:\n  ${unreachable.join('\n  ')}`);
});

test('every read branch is declared in the action set', () => {
  const declared = new Set(declaredActions);
  const orphanBranches = branchedActions.filter((action) => !declared.has(action));
  assert.deepEqual(orphanBranches, [], `branch for an action the guard rejects:\n  ${orphanBranches.join('\n  ')}`);
});

test('nothing is both a command and a read branch', () => {
  // The command Map is consulted first, so a duplicate would make the branch dead code.
  const both = commandActions.filter((action) => branchedActions.includes(action));
  assert.deepEqual(both, [], `dispatched twice; the read branch is unreachable:\n  ${both.join('\n  ')}`);
});

test('the guard still runs before dispatch', () => {
  // Everything above assumes only declared actions reach the dispatch.
  assert.match(source, /if \(!isProviderServiceAction\(action\)\) throw new Error\("Unknown Provider Service action\."\);/);
  assert.match(source, /return PROVIDER_SERVICE_ACTIONS\.has\(cleanText\(value\) \|\| ""\);/);
});
