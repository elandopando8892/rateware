import test from 'node:test';
import assert from 'node:assert/strict';
import { commitEntityVaultImport, commitPlannedDocument, ingestionKeyFor } from '../supabase/functions/_shared/provider-entity-import-commit.mjs';
import { planEntityVaultImport } from '../supabase/functions/_shared/provider-entity-import.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const ENTITY = '22222222-2222-4222-8222-222222222222';
const pdf = (tail = 'a') => new Uint8Array([0x25, 0x50, 0x44, 0x46, ...new TextEncoder().encode(tail)]);

function fakeSupabase({ failOn = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    if (failOn && url.includes(failOn)) {
      return { ok: false, status: 400, json: async () => ({ message: 'constraint violated' }) };
    }
    if (url.includes('/rest/v1/') && init.method === 'POST') {
      return { ok: true, status: 201, json: async () => [{ id: JSON.parse(init.body).id }] };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return { calls, config: { supabaseUrl: 'https://x.supabase.co', serviceRoleKey: 'srk', organizationId: ORG, legalEntityId: ENTITY, actorUserId: 'reviewer-1', fetch: fetchImpl } };
}

test('the storage path embeds the ingestion id the check constraint requires', async () => {
  // The row's own id is part of the path, so it must be generated before the insert.
  const { calls, config } = fakeSupabase();
  const { plans } = await planEntityVaultImport([{ filename: 'XBFus - W9.pdf', bytes: pdf('w9') }]);
  const result = await commitPlannedDocument(config, plans[0], pdf('w9'));
  assert.match(result.storage_path, new RegExp(`^${ORG}/${ENTITY}/[0-9a-f-]{36}/XBFus - W9\\.pdf$`));
  const insert = JSON.parse(calls[0].body);
  assert.equal(insert.storage_path, result.storage_path);
  assert.equal(insert.id, result.ingestion_id, 'the id is client-generated, not returned by the insert');
});

test('upload never overwrites a stored document', async () => {
  const { calls, config } = fakeSupabase();
  const { plans } = await planEntityVaultImport([{ filename: 'XBFus - W9.pdf', bytes: pdf('w9') }]);
  await commitPlannedDocument(config, plans[0], pdf('w9'));
  const upload = calls.find((call) => call.url.includes('/storage/v1/object/'));
  assert.ok(upload, 'the bytes are uploaded');
  assert.equal(upload.headers['x-upsert'], 'false');
  assert.ok(upload.url.includes('provider-entity-vault'), 'always the private vault bucket');
});

test('the expected hash and declared size travel with the row', async () => {
  const { calls, config } = fakeSupabase();
  const bytes = pdf('w9');
  const { plans } = await planEntityVaultImport([{ filename: 'XBFus - W9.pdf', bytes }]);
  await commitPlannedDocument(config, plans[0], bytes);
  const insert = JSON.parse(calls[0].body);
  assert.equal(insert.expected_sha256, plans[0].sha256);
  assert.equal(insert.declared_size_bytes, bytes.byteLength);
  assert.equal(insert.ingestion_key, ingestionKeyFor(plans[0].sha256));
  assert.equal(insert.requested_by_user_id, 'reviewer-1', 'an identified actor is required');
});

test('a batch containing key material is refused whole, not file by file', async () => {
  // A batch that contained a signing key is not a batch to trust one file at a time.
  const { calls, config } = fakeSupabase();
  const planResult = await planEntityVaultImport([
    { filename: 'XBFus - W9.pdf', bytes: pdf('w9') },
    { filename: 'Claveprivada_FIEL_XSL.key', bytes: pdf('key') },
  ]);
  await assert.rejects(
    commitEntityVaultImport(config, planResult, new Map([['XBFus - W9.pdf', pdf('w9')]])),
    /cryptographic key material/,
  );
  assert.equal(calls.length, 0, 'not a single request is made');
});

test('a failure is reported by document type, never by filename', async () => {
  // Filenames are identifying; a failure report must not leak one.
  const { config } = fakeSupabase({ failOn: '/rest/v1/' });
  const planResult = await planEntityVaultImport([{ filename: 'XBFmx - INE_Someone.pdf', bytes: pdf('ine') }]);
  const outcome = await commitEntityVaultImport(config, planResult, new Map([['XBFmx - INE_Someone.pdf', pdf('ine')]]));
  assert.equal(outcome.committed.length, 0);
  assert.equal(outcome.failed.length, 1);
  assert.equal(outcome.failed[0].document_type, 'government_id');
  assert.ok(!JSON.stringify(outcome).includes('INE_Someone'), 'no filename in the outcome');
});

test('a partially failing batch still commits the rest', async () => {
  const { config } = fakeSupabase();
  const planResult = await planEntityVaultImport([
    { filename: 'XBFus - W9.pdf', bytes: pdf('w9') },
    { filename: 'XBFus - Bank Letter.pdf', bytes: pdf('bank') },
  ]);
  // Bytes for the second file are deliberately absent.
  const outcome = await commitEntityVaultImport(config, planResult, new Map([['XBFus - W9.pdf', pdf('w9')]]));
  assert.equal(outcome.committed.length, 1);
  assert.equal(outcome.failed.length, 1);
  assert.equal(outcome.failed[0].error, 'bytes_missing');
});

test('an organization or legal entity is mandatory', async () => {
  const { config } = fakeSupabase();
  const { plans } = await planEntityVaultImport([{ filename: 'XBFus - W9.pdf', bytes: pdf('w9') }]);
  await assert.rejects(
    commitPlannedDocument({ ...config, organizationId: '' }, plans[0], pdf('w9')),
    /organization and legal entity are required/,
  );
});
