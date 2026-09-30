import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Isolated CI runner required');
assert.equal(process.env.RFX_PEEK_LOCAL_ONLY, '1', 'Local-only gate required');
const sourceContainer = 'supabase_db_alqjqzqagdmcywpjtnnr';
const sourceDirectory = process.cwd();
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
  const sourceSchema = docker(sourceContainer, [
    'pg_dump', '-U', 'postgres', '-d', 'postgres',
    '--schema=public', '--schema-only', '--no-owner',
  ]);
  assert.ok(sourceSchema.includes('rfx_lane_vendors') && sourceSchema.includes('outreach_messages'));
  // Fresh Supabase already creates public; retain its grants and comments.
  assert.equal((sourceSchema.match(/^CREATE SCHEMA public;$/gm) || []).length, 1);
  const defaultPrivilegeLines = sourceSchema.match(/^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public .*;$/gm) || [];
  assert.ok(defaultPrivilegeLines.length > 0, 'Expected Supabase-owned default privileges');
  const schema = sourceSchema
    .replace(/^CREATE SCHEMA public;$/m, 'CREATE SCHEMA IF NOT EXISTS public;')
    .replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public .*;$/gm, '');

  // Finish the source integration test before replacing its local stack.
  run('supabase', ['stop', '--no-backup']);
  run('supabase', ['init', '--yes'], { cwd: directory });
  run('supabase', ['start'], { cwd: directory });
  targetStarted = true;

  // The source migrations enable pg_trgm in extensions; a fresh project does
  // not enable it until its own migrations run. Recreate that dependency only.
  docker(targetContainer, [
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-q',
  ], 'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;');
  docker(targetContainer, [
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-q',
  ], schema);
  docker(targetContainer, [
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres', '-q',
  ], `${defaultPrivilegeLines.join('\n')}\n`);
  // The temporary hosted Preview will have no direct browser Data API or RPC
  // access to the copied Rateware schema. Only the server-side Edge Function
  // uses service_role. Test that posture on the disposable restored instance.
  docker(targetContainer, [
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-q',
  ], `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO service_role;`);
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
  assert.equal(sql(`SELECT count(*) FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
    AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));`), '0',
  'Browser roles must have no direct access to restored public tables');
  assert.equal(sql(`SELECT count(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));`), '0',
  'Browser roles must have no direct access to restored public routines');
  // Exercise the actual function against the restored, initially empty schema.
  // Copy only function source and the existing synthetic harness into the
  // disposable target; no migrations or historical contact rows are copied.
  mkdirSync(join(directory, 'supabase', 'functions'), { recursive: true });
  cpSync(join(sourceDirectory, 'supabase', 'functions', 'rfx-bid-api'),
    join(directory, 'supabase', 'functions', 'rfx-bid-api'), { recursive: true });
  cpSync(join(sourceDirectory, 'supabase', 'functions', '_shared'),
    join(directory, 'supabase', 'functions', '_shared'), { recursive: true });
  mkdirSync(join(directory, 'tools'), { recursive: true });
  cpSync(join(sourceDirectory, 'tools', 'test-rfx-bid-peek-local.mjs'),
    join(directory, 'tools', 'test-rfx-bid-peek-local.mjs'));
  run('node', ['tools/test-rfx-bid-peek-local.mjs'], {
    cwd: directory,
    env: { ...process.env, RFX_PEEK_DB_CONTAINER: targetContainer },
  });
  console.log('PASS: separate local Supabase instance; initially empty public schema; browser roles locked out; private-book grants and synthetic function flow verified.');
} finally {
  if (targetStarted) run('supabase', ['stop', '--no-backup'], { cwd: directory });
  rmSync(directory, { recursive: true, force: true });
}
