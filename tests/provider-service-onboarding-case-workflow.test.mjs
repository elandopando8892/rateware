import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/20260814130000_provider_onboarding_case_workflow.sql',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../supabase/functions/_shared/provider-onboarding-case-workflow.ts',import.meta.url),'utf8');

test('Build 26 creates case, task, and immutable event ledgers',()=>{
  assert.match(migration,/provider_onboarding_cases/);
  assert.match(migration,/provider_onboarding_case_tasks/);
  assert.match(migration,/provider_onboarding_case_events/);
  assert.match(migration,/provider_onboarding_cases_active_unique/);
});
test('case commands use optimistic revisions and terminal-state guards',()=>{
  assert.match(workflow,/eq\('revision',expectedRevision\)/);
  assert.match(workflow,/revision:expectedRevision\+1/);
  assert.match(workflow,/Closed onboarding cases cannot be reconciled/);
  assert.match(workflow,/Onboarding case revision changed during reconciliation/);
});
test('readiness outcomes create operational tasks',()=>{
  for(const type of ['collect_fact','collect_document','verify_document','refresh_evidence','resolve_conflict','run_human_review','approve_package']){
    assert.match(workflow,new RegExp(type));
  }
  assert.match(workflow,/task_key:\`readiness:\$\{result\.requirement_code\}\`/);
});
test('only complete readiness reaches ready for approval',()=>{
  assert.match(workflow,/evaluation_status==='complete'/);
  assert.match(workflow,/'ready_for_approval'/);
  assert.match(workflow,/evidence_snapshot_sha256/);
  assert.doesNotMatch(workflow,/submitted|send_email|signed_url/);
});
test('case cancellation closes open work and records a reason event',()=>{
  assert.match(workflow,/task_status:'cancelled'/);
  assert.match(workflow,/event_type:type/);
  assert.match(workflow,/reason_code:reason/);
});
test('workflow storage fails closed and grants no release authority',()=>{
  for(const table of ['provider_onboarding_cases','provider_onboarding_case_tasks','provider_onboarding_case_events']){
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration,new RegExp(`revoke all on table public\\.${table} from public,anon,authenticated,service_role`));
  }
  assert.doesNotMatch(migration,/grant\s+execute|create\s+policy|release_package/i);
  assert.doesNotMatch(workflow,/storage\.from|document_asset|release_package/);
});
