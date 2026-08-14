import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260814050000_provider_legal_entity_source_of_truth.sql', import.meta.url),
  'utf8',
);

test('Build 18 creates an entity-scoped source of truth and controlled release package', () => {
  for (const table of [
    'provider_legal_entity_profile_fields',
    'provider_legal_entity_document_assets',
    'provider_legal_entity_release_packages',
    'provider_legal_entity_release_items',
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public,anon,authenticated,service_role`));
  }
  assert.match(migration, /provider_legal_entity_release_readiness/);
  assert.match(migration, /foreign key \(organization_id,provider_relationship_id,legal_entity_id\)/);
});

test('restricted and highly restricted releases require an approval reference', () => {
  assert.match(migration, /maximum_sensitivity not in \('restricted','highly_restricted'\)/);
  assert.match(migration, /or approval_request_id is not null/);
  assert.match(migration, /release_policy in \('automatic','review_required','approval_required','never_release'\)/);
  assert.match(migration, /release_policy<>'never_release' or item_status in \('pending','withheld','revoked'\)/);
});

test('release packages are attributable, immutable by default, and evidence-bearing', () => {
  assert.match(migration, /requested_by_actor_type/);
  assert.match(migration, /released_by_user_id/);
  assert.match(migration, /released_at/);
  assert.match(migration, /released_sha256/);
  assert.match(migration, /lifecycle_status<>'released'/);
});

test('Build 18 does not commit XBF production data or sensitive binaries', () => {
  assert.doesNotMatch(migration, /XSL260511N11|32-0786975|carriers@xbfreight\.com|finances@xbfreight\.com/i);
  assert.doesNotMatch(migration, /JOSE ANDRES GONZALEZ PERALES|IBC BANK|1771165|4483382/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.provider_legal_entity_/i);
  assert.doesNotMatch(migration, /data:image|base64|BEGIN (?:RSA )?PRIVATE KEY/i);
});
