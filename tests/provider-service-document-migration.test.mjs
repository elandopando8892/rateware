import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const core = read('../supabase/migrations/20260813140000_provider_service_document_registry_core.sql');
const views = read('../supabase/migrations/20260813141000_provider_service_document_registry_views.sql');
const security = read('../supabase/migrations/20260813143000_provider_service_document_registry_security.sql');

test('creates the native document registry under provider relationships', () => {
  for (const table of ['provider_documents','provider_document_versions','provider_document_extractions','provider_document_reviews','provider_document_requirement_links','provider_document_events']) {
    assert.match(core, new RegExp(`create table if not exists public\\.${table}`));
  }
  assert.match(core, /provider_documents_relationship_fkey/);
  assert.match(core, /provider_document_requirement_links_activation_fkey/);
  assert.match(core, /provider_document_requirement_links_version_fkey/);
});

test('keeps binary storage and Gmail integration out of Build 3', () => {
  assert.doesNotMatch(core, /insert into storage\.buckets/i);
  assert.doesNotMatch(core, /storage\.objects/i);
  assert.doesNotMatch(core, /carriers@xbfreight\.com/i);
});
