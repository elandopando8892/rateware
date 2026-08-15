import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/20260814090000_provider_entity_document_review.sql',import.meta.url),'utf8');

test('Build 22 creates document and field review records',()=>{
  assert.match(migration,/create table if not exists public\.provider_entity_document_reviews/);
  assert.match(migration,/create table if not exists public\.provider_entity_document_review_fields/);
  assert.match(migration,/provider_entity_document_review_queue/);
  assert.match(migration,/pending_field_count/);
});
test('review decisions require identified reviewer, timestamp, note, and separation',()=>{
  assert.match(migration,/decided_by_user_id<>requested_by_user_id/);
  assert.match(migration,/decided_at is not null/);
  assert.match(migration,/decision_note/);
  assert.match(migration,/review_status in \('pending','in_review','approved','rejected','changes_required','cancelled'\)/);
});
test('field corrections and withholding are controlled',()=>{
  assert.match(migration,/field_status in \('pending','accepted','corrected','rejected','withheld'\)/);
  assert.match(migration,/field_status<>'corrected' or reviewer_value is not null/);
  assert.match(migration,/field_status<>'withheld' or sensitivity in \('restricted','highly_restricted'\)/);
});
test('queue prioritizes sensitivity, overdue work, and expiry',()=>{
  assert.match(migration,/asset\.sensitivity='highly_restricted' then 10/);
  assert.match(migration,/review\.due_at<=now\(\)/);
  assert.match(migration,/asset\.expiration_date<=current_date\+30/);
});
test('review data fails closed and adds no release authority',()=>{
  for(const table of ['provider_entity_document_reviews','provider_entity_document_review_fields']){
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration,new RegExp(`revoke all on table public\\.${table} from public,anon,authenticated,service_role`));
  }
  assert.doesNotMatch(migration,/provider_legal_entity_release_packages|grant\s+execute|create\s+policy/i);
});
