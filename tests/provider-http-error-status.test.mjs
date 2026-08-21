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
