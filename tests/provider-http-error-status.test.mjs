import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Every validation failure in the onboarding runtime answered 500. "Your justification is
// too short" as a server error is wrong in a way that costs something: a 500 promises
// that retrying might work and that someone should be paged, and neither is true. Found
// by calling the commands over HTTP against production.

const root = fileURLToPath(new URL('../', import.meta.url));
const helper = readFileSync(`${root}supabase/functions/_shared/http-error.ts`, 'utf8');
const runtime = readFileSync(`${root}supabase/functions/provider-onboarding-api/index.ts`, 'utf8');
const waiverCommands = readFileSync(`${root}supabase/functions/_shared/provider-onboarding-waiver-commands.ts`, 'utf8');

/** The SQLSTATE mapping, extracted so it can be executed rather than asserted on. */
function statusFromSqlState(code) {
  const sqlState = String(code ?? '').trim();
  if (sqlState === '23505') return 409;
  if (sqlState === '23503') return 409;
  if (sqlState === '23514') return 400;
  if (sqlState === '23502') return 400;
  if (sqlState === '22P02') return 400;
  if (sqlState === '22023') return 400;
  return null;
}

test('the extracted mapping is the one the helper ships', () => {
  for (const [code, status] of [['23505', 409], ['23503', 409], ['23514', 400], ['23502', 400], ['22P02', 400], ['22023', 400]]) {
    assert.ok(helper.includes(`'${code}') return ${status};`), `${code} -> ${status} is not in the helper`);
  }
});

test('a caller-fault SQLSTATE maps to a caller-fault status', () => {
  assert.equal(statusFromSqlState('23505'), 409, 'unique violation is a conflict');
  assert.equal(statusFromSqlState('23514'), 400, 'check violation is bad input');
  assert.equal(statusFromSqlState('22P02'), 400, 'malformed uuid is bad input');
});

test('an unrecognised SQLSTATE is not guessed at', () => {
  // Reporting a real outage as a bad request is worse than reporting it as 500.
  for (const code of ['57014', '53300', '08006', 'XX000', '', null, undefined, 'nonsense']) {
    assert.equal(statusFromSqlState(code), null, `guessed a status for ${JSON.stringify(code)}`);
  }
});

test('the runtime consults the explicit status first, then SQLSTATE, then the message', () => {
  // Order matters: an error that names its own status must not be overridden by a
  // coincidental SQLSTATE or a message that happens to contain the word "token".
  const block = runtime.slice(runtime.indexOf('function errorStatus'), runtime.indexOf('function getClient'));
  const explicitAt = block.indexOf('explicitStatus');
  const sqlAt = block.indexOf('statusFromSqlState');
  const messageAt = block.indexOf('errorMessage(value).toLowerCase()');
  assert.ok(explicitAt > 0 && sqlAt > explicitAt && messageAt > sqlAt,
    'errorStatus must check explicit status, then SQLSTATE, then the message');
});

test('the waiver commands say which failures are the caller\'s', () => {
  // Each of these was observed returning 500 over HTTP before this change.
  assert.match(waiverCommands, /throw new ClientError\(`\$\{field\} must be a valid UUID\.`\)/);
  assert.match(waiverCommands, /throw new ClientError\('revocation_reason must explain/);
  assert.match(waiverCommands, /throw conflict\('An active waiver already exists/);
  assert.match(waiverCommands, /throw notFound\('Active waiver was not found\.'\)/);
  assert.match(waiverCommands, /throw notFound\('Requirement was not found\.'\)/);
});

test('no waiver command still throws a bare Error for caller input', () => {
  // A bare Error falls through to 500, which is the defect this fixes.
  const bare = [...waiverCommands.matchAll(/throw new Error\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(bare, [], `still throwing unclassified errors:\n  ${bare.join('\n  ')}`);
});

test('the pure validator stays importable by Node', () => {
  // It is unit-tested directly, so it must not import a .ts module. The classification
  // happens at its call site instead.
  const validator = readFileSync(`${root}supabase/functions/_shared/provider-onboarding-requirement-waiver.mjs`, 'utf8');
  assert.ok(!/from '\.\/[a-z-]+\.ts'/.test(validator), 'the .mjs validator must not import a .ts module');
  assert.match(waiverCommands, /catch\(error\)\{\s*\n?\s*throw new ClientError/);
});

// --- the whole runtime, not just the waiver commands -------------------------------
//
// Converting one module proved the mechanism; leaving the other eleven commands on 500
// meant the same defect was still shipping under a different action name. What follows
// pins the conversion so it cannot quietly regress.

const COMMAND_MODULES = [
  'provider-entity-review-commands.ts',
  'provider-entity-fact-promotion.ts',
  'provider-onboarding-case-workflow.ts',
  'provider-onboarding-release-package.ts',
  'provider-onboarding-readiness.ts',
  'provider-entity-upload.ts',
  'provider-onboarding-waiver-commands.ts',
];

/**
 * The failures that are OURS, not the caller's, and so must keep answering 500.
 *
 * A 500 here is correct and load-bearing: each of these means a row we wrote is
 * malformed, or the tenant is mis-wired. Retrying will not help the caller, and nobody
 * should be told "you sent the wrong thing" when they did not. This list is the whole
 * justification for every remaining bare throw -- if a new one appears, it either
 * belongs here with a reason, or it is a caller error wearing the wrong status.
 */
const INTENTIONAL_500 = new Map([
  ['provider-entity-review-commands.ts', ['Review field code is invalid.']],
  ['provider-entity-fact-promotion.ts', [
    'Review contains an invalid field code.',
    'Approved field ${field.field_code} has no value.',
  ]],
  ['provider-entity-upload.ts', ['Upload session bucket is invalid.']],
  ['provider-service.ts', [
    'Organization workspace is required for Provider Service.',
    'Workspace tenant mapping is incomplete.',
  ]],
]);

function bareThrows(source) {
  return [...source.matchAll(/throw new Error\(\s*[`'"]([^`'"]*)/g)].map((match) => match[1]);
}

test('every caller-fault failure in the onboarding runtime carries a status', () => {
  const runtimeSource = readFileSync(`${root}supabase/functions/provider-onboarding-api/provider-service.ts`, 'utf8');
  const sources = new Map([['provider-service.ts', runtimeSource]]);
  for (const name of COMMAND_MODULES) {
    sources.set(name, readFileSync(`${root}supabase/functions/_shared/${name}`, 'utf8'));
  }

  for (const [name, source] of sources) {
    const expected = INTENTIONAL_500.get(name) ?? [];
    const actual = bareThrows(source);
    assert.deepEqual(actual.sort(), [...expected].sort(),
      `${name}: the bare throws are not the documented set.\n` +
      '  A new bare Error becomes a 500. If it is the caller\'s fault, throw ClientError,\n' +
      '  conflict, notFound, forbidden or unauthorized. If it is ours, add it to\n' +
      '  INTENTIONAL_500 with the reason.');
  }
});

test('a module that classifies errors imports the helper it uses', () => {
  // Naming conflict() without importing it is a ReferenceError at the moment a caller
  // makes a mistake -- the exact path least likely to be exercised before release.
  for (const name of COMMAND_MODULES) {
    const source = readFileSync(`${root}supabase/functions/_shared/${name}`, 'utf8');
    const importLine = source.match(/import \{([^}]*)\} from '\.\/http-error\.ts';/);
    assert.ok(importLine, `${name} classifies errors but does not import http-error.ts`);
    const imported = new Set(importLine[1].split(',').map((part) => part.trim()).filter(Boolean));
    const body = source.slice(importLine.index + importLine[0].length);
    for (const helper of ['conflict', 'notFound', 'forbidden', 'unauthorized']) {
      if (body.includes(`throw ${helper}(`)) {
        assert.ok(imported.has(helper), `${name} throws ${helper}() without importing it`);
      }
    }
    if (body.includes('throw new ClientError(')) {
      assert.ok(imported.has('ClientError'), `${name} throws ClientError without importing it`);
    }
  }
});

test('separation of duties answers 403, not 400 or 500', () => {
  // A requester who tries to approve their own package sent a perfectly well-formed
  // request. Telling them it was malformed is a lie, and telling them we broke is worse:
  // both invite a retry that can never succeed.
  const review = readFileSync(`${root}supabase/functions/_shared/provider-entity-review-commands.ts`, 'utf8');
  const release = readFileSync(`${root}supabase/functions/_shared/provider-onboarding-release-package.ts`, 'utf8');
  assert.match(review, /throw forbidden\('Requester cannot finalize their own review\.'\)/);
  assert.match(release, /throw forbidden\('Package requester cannot approve their own package\.'\)/);
  assert.match(helper, /export function forbidden\(message: string\) \{\s*\n\s*return new ClientError\(message, 403\);/);
  assert.match(helper, /export function unauthorized\(message: string\) \{\s*\n\s*return new ClientError\(message, 401\);/);
});

test('optimistic-concurrency failures answer 409 rather than 400', () => {
  // "The revision changed" is not bad input -- the caller sent what was true when they
  // read it. 409 is the one status that tells them to re-read and retry.
  const cases = [
    ['provider-entity-review-commands.ts', 'Review revision changed.'],
    ['provider-entity-fact-promotion.ts', 'Current fact changed for ${field.field_code}.'],
    ['provider-onboarding-case-workflow.ts', 'Onboarding case revision changed.'],
    ['provider-onboarding-release-package.ts', 'Package revision changed during approval.'],
    ['provider-entity-upload.ts', 'Upload session was already consumed.'],
  ];
  for (const [name, message] of cases) {
    const source = readFileSync(`${root}supabase/functions/_shared/${name}`, 'utf8');
    assert.ok(source.includes(`throw conflict(\`${message}\`)`) || source.includes(`throw conflict('${message}')`),
      `${name}: "${message}" should be a 409`);
  }
});
