import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/20260814110000_provider_legal_entity_fact_promotion.sql',import.meta.url),'utf8');
const promotion=readFileSync(new URL('../supabase/functions/_shared/provider-entity-fact-promotion.ts',import.meta.url),'utf8');

test('Build 24 creates provenance-preserving fact and promotion ledgers',()=>{
  assert.match(migration,/provider_legal_entity_fact_promotions/);
  assert.match(migration,/provider_legal_entity_facts/);
  assert.match(migration,/provider_legal_entity_fact_events/);
  assert.match(migration,/source_review_field_id/);
  assert.match(migration,/source_promotion_id/);
});
test('only one current fact exists for each entity field',()=>{
  assert.match(migration,/provider_legal_entity_facts_current_unique/);
  assert.match(migration,/where fact_status='current'/);
  assert.match(migration,/fact_status in \('current','superseded','withdrawn'\)/);
});
test('promotion requires an approved review at the expected revision',()=>{
  assert.match(promotion,/eq\('review_status','approved'\)/);
  assert.match(promotion,/eq\('revision',expectedRevision\)/);
  assert.match(promotion,/Approved review or expected revision was not found/);
});
test('different current facts require explicit compare-and-swap consent',()=>{
  assert.match(promotion,/expected_current_fact_ids/);
  assert.match(promotion,/promotion_status:conflicts.length\?'conflict':'pending'/);
  assert.match(promotion,/event_type:'fact_conflict'/);
  assert.match(promotion,/eq\('fact_status','current'\)/);
});
test('withheld fields never enter canonical fact values',()=>{
  assert.match(promotion,/field_status==='withheld'/);
  assert.match(promotion,/event_type:'field_withheld'/);
  assert.doesNotMatch(promotion,/fact_value:field\.proposed_value/);
});
test('fact storage fails closed and grants no release authority',()=>{
  for(const table of ['provider_legal_entity_fact_promotions','provider_legal_entity_facts','provider_legal_entity_fact_events']){
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration,new RegExp(`revoke all on table public\\.${table} from public,anon,authenticated,service_role`));
  }
  assert.doesNotMatch(migration,/grant\s+execute|create\s+policy|release_package/i);
  assert.doesNotMatch(promotion,/storage\.from|release_package|document_asset/);
});
