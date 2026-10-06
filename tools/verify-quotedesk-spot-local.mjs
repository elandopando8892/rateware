// Prepared only. Run after explicit authorization to apply the migration in a disposable database.
import { readFileSync } from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import assert from 'node:assert/strict';

if (!process.argv.includes('--authorized-local-sql')) throw new Error('Explicit local SQL authorization required. No database was touched.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = `bidware-spot-fixture-${randomUUID()}`;
const image = 'postgres:17-alpine'; // --pull=never prevents a download or registry side effect.
const timeout = 30_000;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout });
docker('image', 'inspect', image);
let id;
const args = () => ['exec', '-i', id, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'quotedesk_spot_fixture'];
const sql = text => new Promise((resolve, reject) => {
  const child = execFile('docker', args(), { encoding: 'utf8', timeout, maxBuffer: 2_000_000 }, (error, stdout, stderr) => {
    if (error) reject(new Error(`Local fixture SQL failed: ${stderr || error.message}`)); else resolve(stdout);
  });
  child.stdin.end(text);
});
const read = path => readFileSync(resolve(root, path), 'utf8');
const expand = path => read(path).replace(/^\\ir (.+)$/gm, (_, relative) =>
  readFileSync(resolve(root, dirname(path), relative.trim()), 'utf8'));
try {
  id = docker('run', '--pull=never', '--network=none', '--detach', '--name', name,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=quotedesk_spot_fixture', image).trim();
  for (let attempt = 0; attempt < 30; attempt++) {
    try { docker('exec', id, 'pg_isready', '-U', 'postgres', '-d', 'quotedesk_spot_fixture'); break; }
    catch { if (attempt === 29) throw new Error('Fixture startup timed out'); await new Promise(r => setTimeout(r, 500)); }
  }
  await sql(expand('tests/fixtures/quotedesk-spot-conversion-schema.sql'));
  const acceptance = read('tests/quotedesk-spot-conversion.postgres.sql');
  await sql(acceptance);
  // The previous assertions rolled back all synthetic data. Commit only the same synthetic seed.
  const seed = acceptance.split('\nbegin;\n')[1].split('\nset local role service_role;')[0];
  assert.ok(seed.startsWith('insert into public.shippers'));
  await sql(`begin;\n${seed}\ncommit;`);
  const command = "select public.quotedesk_convert_spot_request('org:fixture','owner','fixture','operator@example.test','00000000-0000-4000-8000-000000000001','2026-10-06T12:00:00.123456Z');";
  const first = sql(`begin; set local role service_role; ${command} select pg_sleep(1); commit;`);
  const second = sql(`begin; set local role service_role; ${command} commit;`);
  const responses = (await Promise.all([first, second])).map(output => JSON.parse(output.split('\n').find(line => line.startsWith('{'))));
  assert.deepEqual(responses[0].quote, responses[1].quote);
  assert.deepEqual(responses.map(r => r.replayed).sort(), [false, true]);
  // Simulates an HTTP response lost after commit: a new call must return the same durable result.
  const replay = JSON.parse((await sql(`set role service_role; ${command}`)).trim());
  assert.deepEqual(replay.quote, responses[0].quote);
  assert.equal(replay.replayed, true);
  const counts = await sql("select (select count(*) from public.quotedesk_quotes)||','||(select count(*) from public.quotedesk_quote_lanes)||','||(select count(*) from public.quotedesk_spot_conversions)||','||(select count(*) from public.saas_audit_log);");
  assert.equal(counts.trim(), '1,1,1,1');
  console.log(JSON.stringify({ scope: 'disposable PostgreSQL synthetic fixture', sequential: 'passed', concurrentSessions: 2,
    concurrentReplay: 'passed', lostResponseReplay: 'passed', counts: { quotes: 1, lanes: 1, receipts: 1, audits: 1 }, production: false }, null, 2));
} finally {
  if (id) {
    const actual = JSON.parse(docker('inspect', id))[0];
    assert.equal(actual.Name, `/${name}`);
    assert.equal(actual.Id, id);
    docker('rm', '--force', '--volumes', id); // Only this run's confirmed disposable container.
  }
}
