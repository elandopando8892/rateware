import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

// Never use a linked project, connection URL, or shared developer database.
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Isolated CI runner required');
assert.equal(process.env.RFX_PEEK_LOCAL_ONLY, '1', 'Local-only gate required');
const container = 'supabase_db_alqjqzqagdmcywpjtnnr';
const target = `loads_schema_probe_${randomBytes(8).toString('hex')}`;
const docker = (args, input) => execFileSync('docker', ['exec', '-i', container, ...args], {
  input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  stdio: ['pipe', 'pipe', 'pipe'],
});
// Platform objects retain their owners; the local platform administrator is
// required to restore those owners without changing grants or granting roles.
const sql = (db, query) => docker(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', db, '-At'], query);
let created = false;
try {
  // All platform schemas are included to preserve cross-schema dependencies.
  // No rows, production connection or credentials enter the output.
  const schema = docker(['pg_dump', '-U', 'postgres', '-d', 'postgres', '--schema-only']);
  assert.ok(schema.includes('rfx_lane_vendors') && schema.includes('outreach_messages'));
  docker(['createdb', '-U', 'postgres', '--template=template0', target]);
  created = true;
  sql(target, schema);
  sql(target, `DO $$ DECLARE t record; n bigint; BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('SELECT count(*) FROM public.%I', t.tablename) INTO n;
      IF n <> 0 THEN RAISE EXCEPTION 'Schema-only restore populated table %', t.tablename; END IF;
    END LOOP;
  END $$;`);
  const privileges = sql(target, `SELECT
    has_table_privilege('service_role','public.rfx_lane_vendors','SELECT'),
    has_table_privilege('service_role','public.outreach_messages','SELECT'),
    has_table_privilege('anon','public.rfx_lane_vendors','SELECT'),
    has_table_privilege('anon','public.outreach_messages','SELECT');`).trim();
  assert.equal(privileges, 't|t|f|f');
  console.log('PASS: schema-only restored to a disposable database; public tables empty; private-book grants preserved.');
  console.log('Not a hosted Preview acceptance; function bodies still require sensitive-literal review before export.');
} finally {
  if (created) docker(['dropdb', '-U', 'postgres', target]);
}
