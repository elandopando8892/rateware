import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/20260814100000_provider_entity_review_commands.sql',import.meta.url),'utf8');
const commands=readFileSync(new URL('../supabase/functions/_shared/provider-entity-review-commands.ts',import.meta.url),'utf8');

test('Build 23 adds optimistic review revisions and immutable events',()=>{
  assert.match(migration,/add column if not exists revision integer not null default 1/);
  assert.match(migration,/provider_entity_document_review_events/);
  assert.match(migration,/review_claimed','field_decided','review_decided/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all .*public,anon,authenticated,service_role/);
});
test('claim is bounded by status, unassigned ownership, and expected revision',()=>{
  assert.match(commands,/eq\('review_status','pending'\)/);
  assert.match(commands,/is\('assigned_reviewer_user_id',null\)/);
  assert.match(commands,/eq\('revision',expectedRevision\)/);
});
test('field decisions require ownership, notes, and controlled corrections',()=>{
  assert.match(commands,/Review ownership or revision conflict/);
  assert.match(commands,/decision_note/);
  assert.match(commands,/reviewer_value is required for a correction/);
  assert.match(commands,/Only restricted fields may be withheld/);
});
test('finalization requires complete fields and separation of duties',()=>{
  assert.match(commands,/All review fields must be decided first/);
  assert.match(commands,/Requester cannot finalize their own review/);
  assert.match(commands,/A review with rejected fields cannot be approved/);
});
test('Build 23 changes verification only and creates no release authority',()=>{
  assert.match(commands,/verification_status:verificationStatus/);
  assert.doesNotMatch(commands,/release_package|release_policy|storage\.from/);
  assert.doesNotMatch(migration,/grant\s+execute|create\s+policy/i);
});
