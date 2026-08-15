import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20260814070000_provider_entity_bounded_upload.sql');
const upload = read('../supabase/functions/_shared/provider-entity-upload.ts');
const syntax = read('../tools/validate-provider-service-runtime-syntax.mjs');

test('Build 20 bounds upload sessions to fifteen minutes at the database layer', () => {
  assert.match(migration, /upload_session_id uuid/);
  assert.match(migration, /upload_expires_at timestamptz/);
  assert.match(migration, /upload_expires_at<=upload_issued_at\+interval '15 minutes'/);
  assert.match(migration, /unique \(organization_id,upload_session_id\)/);
  assert.match(migration, /upload_completed_at is null/);
});

test('server owns bucket, path, ingestion id, and upload session', () => {
  assert.match(upload, /const VAULT_BUCKET = 'provider-entity-vault'/);
  assert.match(upload, /const ingestionId = crypto\.randomUUID\(\)/);
  assert.match(upload, /const uploadSessionId = crypto\.randomUUID\(\)/);
  assert.match(upload, /const storagePath = `\$\{organizationId\}\/\$\{legalEntityId\}\/\$\{ingestionId\}\/\$\{originalFilename\}`/);
  assert.doesNotMatch(upload, /input\.storage_bucket|input\.storage_path/);
  assert.match(upload, /createSignedUploadUrl\(storagePath\)/);
});

test('upload issuance is bounded by type, size, hash, identity, and idempotency', () => {
  assert.match(upload, /ALLOWED_MIME_TYPES/);
  assert.match(upload, /MAX_FILE_SIZE = 25 \* 1024 \* 1024/);
  assert.match(upload, /expected_sha256 must be lowercase SHA-256/);
  assert.match(upload, /ingestion_key is invalid/);
  assert.match(upload, /User uploads require an identified user/);
  assert.match(upload, /UPLOAD_TTL_SECONDS = 10 \* 60/);
});

test('confirmation verifies scope, expiry, exact object count, and declared size', () => {
  assert.match(upload, /\.eq\('organization_id', organizationId\)/);
  assert.match(upload, /\.eq\('legal_entity_id', legalEntityId\)/);
  assert.match(upload, /\.eq\('upload_session_id', uploadSessionId\)/);
  assert.match(upload, /Upload session expired/);
  assert.match(upload, /Exactly one uploaded object is required/);
  assert.match(upload, /Uploaded object size does not match the declared size/);
  assert.match(upload, /\.eq\('ingestion_status', 'requested'\)/);
  assert.match(upload, /Upload session was already consumed/);
});

test('upload orchestration cannot mark content clean, ready, approved, or released', () => {
  assert.doesNotMatch(upload, /malware_status:\s*'clean'/);
  assert.doesNotMatch(upload, /ingestion_status:\s*'ready'/);
  assert.doesNotMatch(upload, /item_status:\s*'approved'|lifecycle_status:\s*'released'/);
  assert.doesNotMatch(upload, /provider_legal_entity_release_packages/);
  assert.match(upload, /ingestion_status: 'uploaded'/);
});

test('the internal TypeScript helper is included in runtime syntax validation', () => {
  assert.match(syntax, /supabase\/functions\/_shared\/provider-entity-upload\.ts/);
});
