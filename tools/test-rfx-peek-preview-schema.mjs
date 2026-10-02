import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Disposable CI runner required');
assert.equal(process.env.RFX_PEEK_LOCAL_ONLY, '1', 'Local-only gate required');
const container = 'supabase_db_alqjqzqagdmcywpjtnnr';
const name = `rfx_peek_preview_${process.pid}`;
const dir = mkdtempSync(join(tmpdir(), 'rfx-peek-schema-'));
const sqlPath = join(dir, 'preview.sql');
const run = (args, options = {}) => execFileSync('docker', ['exec', '-i', container, ...args],
  { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options });
let created = false;
try {
  execFileSync('node', ['tools/build-rfx-peek-preview-schema.mjs', container, sqlPath], {
    env: { ...process.env, RFX_PEEK_SCHEMA_EXPORT_ONLY: '1' }, stdio: 'pipe'
  });
  run(['createdb', '-U', 'postgres', name]);
  created = true;
  run(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', name, '-q'],
    { input: readFileSync(sqlPath, 'utf8') });
  const result = run(['psql', '-U', 'postgres', '-d', name, '-Atc', `select
    (select count(*) from pg_tables where schemaname='public'),
    (select count(*) from pg_constraint where contype='f' and connamespace='public'::regnamespace),
    has_table_privilege('anon','public.rfx_lane_vendors','SELECT'),
    has_table_privilege('authenticated','public.rfx_lane_vendors','SELECT'),
    has_table_privilege('service_role','public.rfx_lane_vendors','SELECT'),
    has_table_privilege('service_role','public.rfx_lane_vendors','INSERT'),
    (select count(*) from public.rfx_lane_vendors);`]).trim();
  assert.equal(result, '6|10|f|f|t|f|0');
  console.log('PASS: six-table disposable Preview schema, internal relations, no data, browser denied, service role read-only.');
} finally {
  if (created) run(['dropdb', '-U', 'postgres', name]);
  rmSync(dir, { recursive: true, force: true });
}
