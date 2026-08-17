import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20260817090000_provider_entity_vault_workspace.sql', import.meta.url), 'utf8');

test('the vault read model is a security-invoker view, not a table', () => {
  assert.match(migration, /create or replace view public\.provider_entity_vault_workspace/);
  assert.match(migration, /security_invoker = true/);
  assert.doesNotMatch(migration, /create table/i, 'the vault surface must not duplicate an existing table');
});

test('browser roles are revoked and only service_role may select', () => {
  assert.match(migration, /revoke all on public\.provider_entity_vault_workspace from public, anon, authenticated;/);
  assert.match(migration, /grant select on public\.provider_entity_vault_workspace to service_role;/);
  assert.doesNotMatch(migration, /grant\s+(select|all)[^;]*to\s+(anon|authenticated)/i);
});

test('document bytes, locations and hashes are never projected', () => {
  // The projection list ends at the closing FROM of the view body; the trailing
  // lateral join legitimately references the source table by name.
  const projection = migration.slice(migration.indexOf('select'), migration.indexOf('from public.provider_legal_entity_document_assets'));
  for (const column of ['storage_bucket', 'storage_path', 'file_sha256', 'original_filename', 'd.metadata']) {
    assert.ok(!projection.includes(column), `${column} must not be projected by the vault read model`);
  }
});

test('the disclosure posture columns the operator surface depends on are present', () => {
  for (const column of ['sensitivity', 'release_policy', 'lifecycle_status', 'verification_status', 'expiry_state', 'is_releasable', 'requires_human_release_approval']) {
    assert.match(migration, new RegExp(column), `missing ${column}`);
  }
});

test('releasability requires an active, verified, unexpired, releasable document', () => {
  assert.match(migration, /d\.lifecycle_status = 'active'/);
  assert.match(migration, /d\.verification_status = 'verified'/);
  assert.match(migration, /d\.release_policy <> 'never_release'/);
  assert.match(migration, /d\.expiration_date is null or d\.expiration_date >= current_date/);
});

test('restricted and highly restricted documents demand human release approval', () => {
  assert.match(migration, /\(d\.sensitivity in \('restricted','highly_restricted'\)\) as requires_human_release_approval/);
});

test('counters are organization-partitioned so they cannot leak across tenants', () => {
  const partitions = migration.match(/over \(partition by d\.organization_id\)/g) || [];
  assert.ok(partitions.length >= 4, 'every vault counter must partition by organization');
  assert.match(migration, /i\.organization_id = d\.organization_id/, 'package usage must be tenant-scoped');
});

test('the view documents what it deliberately excludes', () => {
  assert.match(migration, /comment on view public\.provider_entity_vault_workspace is/);
  assert.match(migration, /excludes storage buckets, storage paths, file hashes, original filenames/);
});
