import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REVIEWED, reviewedSql, parseMode, batchTransaction } from '../tools/probe-rateware-local-migrations.mjs';
test('reviewed batch matches exact repository bytes', () => {
  const sql = reviewedSql(name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url)));
  assert.equal(REVIEWED.length, 12);
  assert.match(sql, /create table if not exists public.vendors/);
  assert.doesNotMatch(sql, /cron\.schedule|net\.http_post/);
});
test('apply is explicit and transaction refuses nonempty bootstrap with atomic ledger', () => {
  assert.equal(parseMode([]), false);
  assert.equal(parseMode(['--apply-local-empty']), true);
  assert.throws(() => parseMode(['--db-url', 'remote']));
  assert.match(batchTransaction('SELECT 1;', false), /ROLLBACK;\n$/);
  const sql = batchTransaction('SELECT 1;', true);
  assert.match(sql, /auth.users/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /migration_batches/);
  assert.match(sql, /COMMIT;\n$/);
});
test('changed or substituted SQL invalidates the review before execution', () => {
  assert.throws(() => reviewedSql(() => Buffer.from('select 1;')), /Review invalidated/);
});
