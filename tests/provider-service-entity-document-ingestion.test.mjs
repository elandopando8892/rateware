import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260814060000_provider_entity_document_ingestion.sql', import.meta.url),
  'utf8',
);

test('Build 19 creates a private bounded vault bucket', () => {
  assert.match(migration, /insert into storage\.buckets/);
  assert.match(migration, /'provider-entity-vault'/);
  assert.match(migration, /false,\s*26214400/);
  assert.match(migration, /'application\/pdf','image\/png','image\/jpeg'/);
  assert.doesNotMatch(migration, /create policy[\s\S]+storage\.objects/i);
});

test('ingestion is tenant and legal-entity scoped with idempotent paths', () => {
  assert.match(migration, /create table if not exists public\.provider_entity_document_ingestions/);
  assert.match(migration, /foreign key \(organization_id,legal_entity_id\)/);
  assert.match(migration, /unique \(organization_id,legal_entity_id,ingestion_key\)/);
  assert.match(migration, /unique \(organization_id,storage_bucket,storage_path\)/);
  assert.match(migration, /organization_id::text \|\| '\/' \|\| legal_entity_id::text/);
  assert.match(migration, /original_filename !~ '\[\\\\\/\]'/);
});

test('files cannot become ready without clean scanning, hash disposition, classification, and asset registration', () => {
  assert.match(migration, /ingestion_status<>'ready'/);
  assert.match(migration, /malware_status='clean'/);
  assert.match(migration, /hash_status in \('matched','unavailable'\)/);
  assert.match(migration, /classification_status in \('classified','needs_review'\)/);
  assert.match(migration, /provider_document_asset_id is not null/);
  assert.match(migration, /ingestion_status<>'quarantined'/);
  assert.match(migration, /quarantine_reason/);
});

test('direct table and queue access fail closed', () => {
  for (const table of [
    'provider_entity_document_ingestions',
    'provider_entity_document_ingestion_events',
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public,anon,authenticated,service_role`));
  }
  assert.match(migration, /revoke all on table public\.provider_entity_document_ingestion_queue/);
});

test('Build 19 contains no production document payloads or autonomous release authority', () => {
  assert.doesNotMatch(migration, /XSL260511N11|32-0786975|carriers@xbfreight\.com|finances@xbfreight\.com/i);
  assert.doesNotMatch(migration, /JOSE ANDRES GONZALEZ PERALES|IBC BANK|1771165|4483382/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.provider_legal_entity_document_assets/i);
  assert.doesNotMatch(migration, /create\s+policy|grant\s+insert|grant\s+update/i);
  assert.doesNotMatch(migration, /data:image|base64|BEGIN (?:RSA )?PRIVATE KEY/i);
});
