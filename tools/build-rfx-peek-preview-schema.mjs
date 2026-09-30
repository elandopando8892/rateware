import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// This is a read-only extraction from a local database. The output is a
// disposable contract fixture, not a migration of Rateware production data.
assert.equal(process.env.RFX_PEEK_SCHEMA_EXPORT_ONLY, '1', 'Explicit schema-only export gate required');
const container = process.argv[2];
const outputPath = process.argv[3];
assert.match(container || '', /^supabase_db_[a-zA-Z0-9_-]+$/, 'Expected local Supabase database container');
assert.ok(outputPath, 'An output path is required');
const tables = ['vendors', 'outreach_campaigns', 'outreach_messages', 'rfx_events', 'rfx_lane_vendors', 'rfx_lanes'];
const tableSet = new Set(tables);
const dump = execFileSync('docker', ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres',
  '--schema-only', '--no-owner', ...tables.map((table) => `--table=public.${table}`)],
{ encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
assert.ok(!/(?:^|\n)\s*(?:INSERT\s+INTO|COPY\s+)\b/im.test(dump),
  'Schema dump contains data statements');
assert.ok(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(dump),
  'Schema dump contains an email-like literal');

const createBlocks = [...dump.matchAll(/^CREATE TABLE public\.([a-z_]+) \([\s\S]*?^\);/gm)];
assert.deepEqual(new Set(createBlocks.map((match) => match[1])), tableSet, 'Unexpected preview table set');
const constraints = [...dump.matchAll(/^ALTER TABLE ONLY public\.([a-z_]+)\s+ADD CONSTRAINT ([^;]+);/gm)]
  .filter((match) => {
    assert.ok(tableSet.has(match[1]), `Unexpected constraint table ${match[1]}`);
    const reference = match[2].match(/REFERENCES public\.([a-z_]+)/);
    return !reference || tableSet.has(reference[1]);
  });
assert.ok(constraints.length >= 12, 'Expected primary/unique keys and internal relations');
const internalForeignKeys = constraints.filter((match) => /FOREIGN KEY/.test(match[2]));
assert.ok(internalForeignKeys.length >= 7, 'Expected PostgREST relationships for the private book');

const sql = [
  '-- Disposable MARKSMAN Loads private-book Preview: table definitions only.',
  '-- Source: local Rateware schema dump; no contacts, users, bids or migrations.',
  ...createBlocks.map((match) => match[0]),
  ...constraints.map((match) => match[0]),
  ...tables.map((table) => `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`),
  'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;',
  `GRANT SELECT ON ${tables.map((table) => `public.${table}`).join(', ')} TO service_role;`
].join('\n\n') + '\n';
assert.ok(!/(?:^|\n)\s*(?:INSERT\s+INTO|COPY\s+|CREATE\s+FUNCTION|CREATE\s+TRIGGER)\b/im.test(sql),
  'Preview SQL contains executable data or function definitions');
for (const match of sql.matchAll(/REFERENCES public\.([a-z_]+)/g)) {
  assert.ok(tableSet.has(match[1]), `External foreign key leaked into Preview: ${match[1]}`);
}
await writeFile(resolve(outputPath), sql, { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ tables: tables.length, internalForeignKeys: internalForeignKeys.length,
  constraints: constraints.length, bytes: Buffer.byteLength(sql) }));
