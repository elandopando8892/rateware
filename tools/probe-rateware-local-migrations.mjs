import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assessContainers, REQUIRED } from './check-rateware-local.mjs';

export const REVIEWED = [
  ['20260607102000_uploads_interpretation_staging.sql', '1308d5fa228f1111fe64ab4927a8487a5e8ed251a9c5cc0ac79efac80f66374c'],
  ['20260608120000_vendor_crm.sql', '86f65dbd130cf1e8c623562525a4413ef4d7a707d936e85dad342efe06274f28'],
  ['20260608133000_vendor_quickwins.sql', 'b31315556e4fa984053996732bd0b6ffb6112de4da833dbb36333e812143e4ca'],
  ['20260608150000_vendor_segments.sql', '8c323ab22176a9733ae642fef5600130f3639699b851e84e087379f99b8274b1'],
  ['20260608162000_upload_vendor_match_source.sql', '243f10200304e49bdfac8646682487df8163d726cc6a014a1caa9b72f8b5b940'],
  ['20260608180000_rate_staging_quote_date.sql', 'b13d56ec14017b4b58b00141afe0e60f5eb9b4a527787a069a918fb95d09357e'],
  ['20260608193000_catalog_normalization_mileage.sql', '1ea7c6e48a46f7cbe7bf23c63739718b474a08265b0e3e8a4d2e45a925ff1892'],
  ['20260608202000_fuel_fsc_normalization.sql', '35e3aa332aea95b446a8c5a8916b38540082eb3273220376e39253008be95279'],
  ['20260608210000_location_resolution.sql', 'fba518f6df6833cdf9a3e7f09760829e4a59932d52d80eb873ce804b4b9500ac'],
  ['20260608213000_location_match_trace.sql', 'e49662b0ef0b22937963c43ce5b9a53362410ca60f55568ac4d2a3ac7e79f96b'],
  ['20260608220000_border_pairs_lane_legs.sql', '830f9f6e5ed926e960476de31a17bea217467496112bc4781ba1395d4b4073a2'],
  ['20260608223000_mx_fuel_fx_normalization.sql', '2acdbbab30a5ef4fe296cc4a69ac0166760a021eaa872521daf5580ef8882063'],
];
export function parseMode(args) {
  if (!args.length) return false;
  if (args.length === 1 && args[0] === '--apply-local-empty') return true;
  throw new Error('Only the explicit --apply-local-empty option is supported.');
}
export function batchTransaction(sql, apply) {
  const ledger = `CREATE SCHEMA rateware_local_control;
REVOKE ALL ON SCHEMA rateware_local_control FROM PUBLIC;
CREATE TABLE rateware_local_control.migration_batches (name text primary key, sha256 text not null, applied_at timestamptz not null default now());
INSERT INTO rateware_local_control.migration_batches(name,sha256) VALUES
${REVIEWED.map(([name, hash]) => `('${name}','${hash}')`).join(',\n')};`;
  return `BEGIN; SET LOCAL statement_timeout = '30s'; SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(56432, 1);
DO $$ BEGIN
IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public') OR EXISTS (SELECT 1 FROM auth.users) THEN
RAISE EXCEPTION 'Refusing bootstrap: local application schema or users already exist';
END IF;
END $$;
${sql}\n${apply ? ledger : ''}\n${apply ? 'COMMIT' : 'ROLLBACK'};\n`;
}
export function reviewedSql(read) {
  return REVIEWED.map(([name, expected]) => {
    const bytes = read(name);
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`Review invalidated: ${name}`);
    return bytes.toString('utf8');
  }).join('\n');
}

function main() {
  const apply = parseMode(process.argv.slice(2));
  const inspected = spawnSync('docker', ['inspect', ...REQUIRED], { encoding: 'utf8' });
  if (inspected.status !== 0 || assessContainers(JSON.parse(inspected.stdout)).status !== 'PASS') throw new Error('Local infrastructure gate failed.');
  const root = resolve(import.meta.dirname, '..');
  const sql = reviewedSql(name => readFileSync(resolve(root, 'supabase', 'migrations', name)));
  // Exact local container, no configurable URL, no remote credentials.
  // Default is rollback. Explicit apply requires empty local schema and users.
  const result = spawnSync('docker', ['exec', '-i', 'supabase_db_rateware-carrier-local-v1', 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: batchTransaction(sql, apply), encoding: 'utf8', timeout: 90000,
  });
  const error = (result.stderr || '').split(/\r?\n/).filter(line => /ERROR:/.test(line));
  console.log(JSON.stringify({ status: result.status === 0 ? 'PASS' : 'FAIL',
    scope: 'reviewed-local-bootstrap-batch', applied: apply && result.status === 0,
    reviewed_files: REVIEWED.map(([name]) => name), errors: error,
    execution_error: result.error ? result.error.code || 'PROCESS_ERROR' : null }, null, 2));
  process.exitCode = result.status === 0 ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
