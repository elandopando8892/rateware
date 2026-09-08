import { spawnSync } from 'node:child_process';
import { assessContainers, REQUIRED } from './check-rateware-local.mjs';

const inspected = spawnSync('docker', ['inspect', ...REQUIRED], { encoding: 'utf8' });
if (inspected.status !== 0) throw new Error('Local inspection failed');
const containers = JSON.parse(inspected.stdout);
if (assessContainers(containers).status !== 'PASS') throw new Error('Local infrastructure gate failed');
const db = containers.find(c => c.Name === '/supabase_db_rateware-carrier-local-v1');
const localEnv = Object.fromEntries(db.Config.Env.map(entry => {
  const index = entry.indexOf('='); return [entry.slice(0, index), entry.slice(index + 1)];
}));
if (!localEnv.POSTGRES_PASSWORD || !localEnv.JWT_SECRET) throw new Error('Local bootstrap credentials missing');
// Pass only local credentials in the child environment, never command arguments
// or logs. This official migration-only process exposes no ports or file mounts.
const result = spawnSync('docker', ['run', '--rm', '--name', 'rateware-local-storage-init',
  '--network', 'rateware-carrier-local-v1', '--entrypoint', 'node',
  '-e', 'DATABASE_URL', '-e', 'AUTH_JWT_SECRET',
  'public.ecr.aws/supabase/storage-api@sha256:528ec49c3c32561908b07ee91bced7f8456f3b688164e341eaa422441767a0bd', 'dist/scripts/migrate-call.js'], {
  encoding: 'utf8', timeout: 120000,
  env: { ...process.env,
    DATABASE_URL: `postgresql://supabase_storage_admin:${encodeURIComponent(localEnv.POSTGRES_PASSWORD)}@supabase_db_rateware-carrier-local-v1:5432/postgres`,
    AUTH_JWT_SECRET: localEnv.JWT_SECRET },
});
// Provider errors can contain connection strings; suppress raw provider logs.
console.log(JSON.stringify({ scope: 'official-local-storage-schema-only', exit_code: result.status,
  status: result.status === 0 ? 'PASS' : 'FAIL', process_error: result.error?.code || null }, null, 2));
if (result.status !== 0) {
  const safeErrors = (result.stderr || '').split('\n').filter(line => /Error:/.test(line))
    .map(line => line.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted-db-url]').replaceAll(localEnv.POSTGRES_PASSWORD, '[redacted]').replaceAll(localEnv.JWT_SECRET, '[redacted]'));
  console.error(safeErrors.join('\n'));
}
process.exitCode = result.status === 0 ? 0 : 1;
