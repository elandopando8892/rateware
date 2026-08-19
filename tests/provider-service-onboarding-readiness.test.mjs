import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyWaivers} from '../supabase/functions/_shared/provider-onboarding-requirement-waiver.mjs';
const migration=readFileSync(new URL('../supabase/migrations/20260814120000_provider_onboarding_readiness.sql',import.meta.url),'utf8');
const evaluator=readFileSync(new URL('../supabase/functions/_shared/provider-onboarding-readiness.ts',import.meta.url),'utf8');

test('Build 25 creates versioned requirements and immutable evaluation snapshots',()=>{
  assert.match(migration,/provider_onboarding_requirements/);
  assert.match(migration,/requirement_set_version/);
  assert.match(migration,/provider_onboarding_readiness_evaluations/);
  assert.match(migration,/evidence_snapshot_sha256/);
  assert.match(migration,/provider_onboarding_readiness_results/);
});
test('requirements are scoped by tenant, program, version, jurisdiction, and entity kind',()=>{
  for(const token of ['organization_id','program_code','requirement_set_version','jurisdiction_code','legal_entity_kind']){
    assert.match(evaluator,new RegExp(token));
  }
  assert.match(evaluator,/No active onboarding requirements matched/);
});
test('facts must be current and documents active and verified',()=>{
  assert.match(evaluator,/eq\('fact_status','current'\)/);
  assert.match(evaluator,/eq\('lifecycle_status','active'\)/);
  assert.match(evaluator,/verification_status==='verified'/);
  assert.match(evaluator,/document_expired/);
  assert.match(evaluator,/document_too_old/);
});
test('readiness is blocked by unresolved evidence and complete only with all required evidence',()=>{
  // Executed rather than grepped. The status rule moved into the waiver module when
  // operator overrides landed; a source-text assertion would have gone on passing
  // against a copy of the rule that no longer decided anything.
  const row=(code,status)=>({requirement:{id:`req-${code}`,requirement_code:code,is_required:true},status,
    reason:'r',fact_id:null,asset_id:null,evidence_sha256:null});
  const statusOf=(rows)=>applyWaivers({rows,waivers:[]}).evaluation_status;
  assert.equal(statusOf([row('a','satisfied')]),'complete');
  assert.equal(statusOf([row('a','satisfied'),row('b','missing')]),'incomplete');
  assert.equal(statusOf([row('a','satisfied'),row('b','unverified')]),'blocked');
  assert.equal(statusOf([row('a','expired')]),'blocked');
  assert.equal(statusOf([row('a','conflict')]),'blocked');
  // An optional requirement never holds the evaluation back.
  assert.equal(applyWaivers({rows:[{requirement:{id:'r1',requirement_code:'o',is_required:false},status:'missing'}],
    waivers:[]}).evaluation_status,'complete');
  assert.match(evaluator,/required_fact_missing/);
  assert.match(evaluator,/document_not_verified/);
});
test('snapshot hashes references and evidence hashes, not fact values or document bytes',()=>{
  assert.match(evaluator,/requirement_id:row\.requirement\.id,status:row\.status,fact_id:row\.fact_id/);
  assert.doesNotMatch(evaluator,/select\([^)]*fact_value[,)]/);
  assert.doesNotMatch(evaluator,/storage\.from|download\(/);
});
test('readiness data fails closed and grants no release authority',()=>{
  for(const table of ['provider_onboarding_requirements','provider_onboarding_readiness_evaluations','provider_onboarding_readiness_results']){
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration,new RegExp(`revoke all on table public\\.${table} from public,anon,authenticated,service_role`));
  }
  assert.doesNotMatch(migration,/grant\s+execute|create\s+policy|release_package/i);
  assert.doesNotMatch(evaluator,/release_package|signed_url|send_email/);
});
