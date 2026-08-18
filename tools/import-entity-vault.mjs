// Private Entity Vault importer.
//
// Reads local files, plans the import, and prints what would happen. Dry-run is the
// default and the only mode implemented: upload requires the bounded-upload endpoint,
// which is not yet wired to an entrypoint (see docs/provider-service).
//
// Never prints a document's contents. Filenames are shown because the operator supplied
// them; hashes are truncated. Nothing here writes to the repository.
//
// Usage:
//   node tools/import-entity-vault.mjs --source <dir> [--entity <uuid>] [--json]
//   node tools/import-entity-vault.mjs --manifest       # report the expected corpus

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  IMPORT_CORE_VERSION, planEntityVaultImport, summarizeForLog,
} from '../supabase/functions/_shared/provider-entity-import.mjs';
import { commitEntityVaultImport } from '../supabase/functions/_shared/provider-entity-import-commit.mjs';

// The corpus named in the onboarding brief §5. Listed so the tool can report exactly
// which files must be mounted rather than failing vaguely.
const EXPECTED_CORPUS = [
  'Onboarding.txt',
  'SigneeMerge_57778_219160(1).pdf',
  'XBFus - Bank Letter.pdf',
  'XBFus - EIN Assignation.pdf',
  'XBFus - MC Authority LI_CPL20260429.pdf',
  'XBFus - Articles of Organization.pdf',
  'XBFus - W9.pdf',
  'XBFmx - Acuse de inscripcion RFC.pdf',
  'XBFmx - Boleta de Inscripcion RPC.pdf',
  'XBFmx - CSF.pdf',
  'XBFmx - INE_Jose Andres Gonzalez Perales.pdf',
  'XBFnx - Acta Constitutiva.pdf',
  'firma JAGP sin fondo.png',
];

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
const hasFlag = (name) => process.argv.includes(name);

async function readSource(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries.sort()) {
    const full = path.join(directory, entry);
    const info = await stat(full);
    if (!info.isFile()) continue;
    files.push({ filename: entry, bytes: new Uint8Array(await readFile(full)) });
  }
  return files;
}

function reportCorpus(present) {
  const missing = EXPECTED_CORPUS.filter((name) => !present.has(name));
  const extra = [...present].filter((name) => !EXPECTED_CORPUS.includes(name));
  console.log(`\nExpected corpus: ${EXPECTED_CORPUS.length - missing.length}/${EXPECTED_CORPUS.length} present`);
  if (missing.length) {
    console.log('\nMissing — these must be mounted before a real import:');
    for (const name of missing) console.log(`  - ${name}`);
  }
  if (extra.length) {
    console.log('\nPresent but not in the expected corpus:');
    for (const name of extra) console.log(`  - ${name}`);
  }
}

/**
 * Lists the organizations and legal entities available, so the operator never has to
 * hunt for a UUID by hand. Read-only; writes nothing.
 */
async function listEntities() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
    process.exitCode = 1;
    return;
  }
  const headers = { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` };
  const get = async (path) => {
    const response = await fetch(`${supabaseUrl}${path}`, { headers });
    if (!response.ok) throw new Error(`Supabase responded ${response.status}`);
    return response.json();
  };
  const organizations = await get('/rest/v1/organizations?select=id,org_name,organization_id');
  const entities = await get('/rest/v1/legal_entities?select=id,organization_id,entity_code,legal_name,country_code');

  console.log('\nORGANIZATIONS  (use one of these for --org)\n');
  for (const org of organizations) {
    console.log(`  --org ${org.id}`);
    console.log(`      ${org.org_name || org.organization_id || '(unnamed)'}\n`);
  }
  console.log('LEGAL ENTITIES  (use one of these for --entity)\n');
  if (!entities.length) {
    console.log('  None found. Create the XBF legal entities before importing —');
    console.log('  a document cannot be filed against an entity that does not exist.\n');
  }
  for (const entity of entities) {
    console.log(`  --entity ${entity.id}`);
    console.log(`      ${entity.entity_code} · ${entity.legal_name} · ${entity.country_code}\n`);
  }
}

async function main() {
  if (hasFlag('--list-entities')) {
    await listEntities();
    return;
  }
  if (hasFlag('--manifest')) {
    console.log('Entity Vault expected corpus (onboarding brief §5):');
    for (const name of EXPECTED_CORPUS) console.log(`  ${name}`);
    console.log(`\nimport core ${IMPORT_CORE_VERSION}`);
    return;
  }

  const source = arg('--source');
  if (!source) {
    console.error('Usage: node tools/import-entity-vault.mjs --source <dir> [--entity <uuid>] [--json]');
    console.error('       node tools/import-entity-vault.mjs --manifest');
    process.exitCode = 1;
    return;
  }

  let files;
  try {
    files = await readSource(path.resolve(source));
  } catch (error) {
    console.error(`Source directory is not readable: ${source}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const result = await planEntityVaultImport(files, { legalEntityId: arg('--entity') });

  if (hasFlag('--json')) {
    // Redacted: filenames and full hashes are identifying.
    console.log(JSON.stringify({
      plans: result.plans.map(summarizeForLog),
      duplicates: result.duplicates.length,
      rejections: result.rejections.map((entry) => ({ reason: entry.reason })),
      import_core_version: IMPORT_CORE_VERSION,
    }, null, 2));
    return;
  }

  console.log(`Planned import from ${source}`);
  console.log(`  ${result.plans.length} to ingest, ${result.duplicates.length} duplicate, ${result.rejections.length} rejected\n`);

  for (const plan of result.plans) {
    const flag = plan.requires_human_classification ? '  [NEEDS CLASSIFICATION]' : '';
    console.log(`  ${plan.filename}`);
    console.log(`    ${plan.document_type} · ${plan.sensitivity} · ${plan.extension} · ${plan.size_bytes} bytes · ${plan.sha256.slice(0, 12)}…${flag}`);
  }
  for (const duplicate of result.duplicates) {
    console.log(`  ${duplicate.filename}\n    duplicate (${duplicate.scope})`);
  }
  for (const entry of result.rejections) {
    console.log(`  ${entry.filename || '(unnamed)'}\n    REJECTED: ${entry.reason}${entry.detail ? ` — ${entry.detail}` : ''}`);
  }

  reportCorpus(new Set(files.map((file) => file.filename)));

  if (!hasFlag('--commit')) {
    console.log('\nDry run only. No file was read beyond hashing, and nothing was uploaded.');
    console.log('To ingest for real, re-run with:  --commit --entity <uuid> --org <uuid> --actor <user-id>');
    return;
  }

  // --- commit -------------------------------------------------------------
  const organizationId = arg('--org');
  const legalEntityId = arg('--entity');
  const actorUserId = arg('--actor');
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    !organizationId && '--org', !legalEntityId && '--entity', !actorUserId && '--actor',
    !supabaseUrl && 'SUPABASE_URL', !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean);
  if (missing.length) {
    console.error(`\nCannot commit — missing: ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  // Key material aborts the whole batch, not just its own file.
  if (result.rejections.some((entry) => entry.reason === 'key_material_refused')) {
    console.error('\nRefusing to commit: this batch contains cryptographic key material.');
    process.exitCode = 1;
    return;
  }

  console.log(`\nCommitting ${result.plans.length} document(s) to the private vault…`);
  const bytesByFilename = new Map(files.map((file) => [file.filename, file.bytes]));
  const outcome = await commitEntityVaultImport(
    { supabaseUrl, serviceRoleKey, organizationId, legalEntityId, actorUserId, fetch: globalThis.fetch },
    result,
    bytesByFilename,
  );
  console.log(`  ${outcome.committed.length} ingested, ${outcome.failed.length} failed`);
  for (const entry of outcome.failed) console.log(`  FAILED ${entry.document_type}: ${entry.error}`);
  console.log('\nEach document is queued for human review. Nothing is releasable until reviewed.');
  if (outcome.failed.length) process.exitCode = 1;
}

await main();
