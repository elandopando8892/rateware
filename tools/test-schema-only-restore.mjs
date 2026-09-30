import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Isolated CI runner required');
assert.equal(process.env.RFX_PEEK_LOCAL_ONLY, '1', 'Local-only gate required');
const sourceContainer = 'supabase_db_alqjqzqagdmcywpjtnnr';
const directory = mkdtempSync(join(tmpdir(), 'loads-schema-'));
const targetContainer = `supabase_db_${basename(directory)}`;
const run = (command, args, options = {}) => {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'], ...options,
    });
  } catch (error) {
    // execFileSync errors can include the entire stdin schema. Keep CI logs
    // limited to the tool and the first diagnostic line.
    const reason = String(error.stderr || error.message).split(/\r?\n/, 1)[0].slice(0, 240);
    throw new Error(`${command} failed: ${reason}`);
  }
};
const docker = (container, args, input) => run('docker', ['exec', '-i', container, ...args], { input });
let targetStarted = false;
try {
  // Dump definitions only; the original migrations contain contact INSERTs.
  const schema = docker(sourceContainer, [
    'pg_dump', '-U', 'postgres', '-d', 'postgres',
    '--schema=public', '--schema-only', '--no-owner',
  ]);
  assert.ok(schema.includes('rfx_lane_vendors') && schema.includes('outreach_messages'));

  // Finish the source integration test before replacing its local stack.
  run('supabase', ['stop', '--no-backup']);
  run('supabase', ['init', '--yes'], { cwd: directory });
  run('supabase', ['start'], { cwd: directory });
  targetStarted = true;

  docker(targetContainer, [
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-q',
  ], schema);
  const sql = (query) => docker(targetContainer, [
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At',
  ], query).trim();
  sql(`DO $$ DECLARE t record; n bigint; BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('SELECT count(*) FROM public.%I', t.tablename) INTO n;
      IF n <> 0 THEN RAISE EXCEPTION 'Unexpected row in public.%', t.tablename; END IF;
    END LOOP;
  END $$;`);
  assert.equal(sql(`SELECT
    has_table_privilege('service_role','public.rfx_lane_vendors','SELECT'),
    has_table_privilege('service_role','public.outreach_messages','SELECT'),
    has_table_privilege('anon','public.rfx_lane_vendors','SELECT'),
    has_table_privilege('anon','public.outreach_messages','SELECT');`), 't|t|f|f');
  console.log('PASS: separate local Supabase instance; public schema empty; private-book grants preserved.');
} finally {
  if (targetStarted) run('supabase', ['stop', '--no-backup'], { cwd: directory });
  rmSync(directory, { recursive: true, force: true });
}
