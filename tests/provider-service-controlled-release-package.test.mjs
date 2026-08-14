import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../supabase/migrations/20260814140000_provider_onboarding_release_packages.sql',import.meta.url),'utf8');
const commands=readFileSync(new URL('../supabase/functions/_shared/provider-onboarding-release-package.ts',import.meta.url),'utf8');

test('Build 27 creates packages, reference-only items, approvals, and events',()=>{
  assert.match(migration,/provider_onboarding_release_packages/);
  assert.match(migration,/provider_onboarding_release_package_items/);
  assert.match(migration,/provider_onboarding_release_package_approvals/);
  assert.match(migration,/provider_onboarding_release_package_events/);
});
test('packages require a ready case and its current complete readiness snapshot',()=>{
  assert.match(commands,/eq\('case_status','ready_for_approval'\)/);
  assert.match(commands,/current_readiness_evaluation_id/);
  assert.match(commands,/eq\('evaluation_status','complete'\)/);
  assert.match(commands,/Evidence changed .* rerun readiness/);
});
test('manifest is deterministic and contains references and hashes',()=>{
  assert.match(commands,/manifestSha=await sha256/);
  assert.match(commands,/evidence_snapshot_sha256/);
  assert.match(commands,/source_document_asset_id/);
  assert.match(commands,/evidence_sha256/);
  assert.doesNotMatch(commands,/select\\([^)]*(?:^|,)fact_value(?:,|\\))/);
  assert.doesNotMatch(commands,/download\\(|storage\\.from/);
});
test('restricted evidence cannot be fully disclosed',()=>{
  assert.match(migration,/provider_release_package_items_restricted_check/);
  assert.match(commands,/Restricted evidence cannot use full disclosure/);
});
test('approval has separation of duties, revision guards, threshold, and expiry',()=>{
  assert.match(migration,/requested_by_actor_id<>approver_actor_id/);
  assert.match(commands,/Package requester cannot approve their own package/);
  assert.match(commands,/eq\('revision',expectedRevision\)/);
  assert.match(commands,/required_approval_count/);
  assert.match(commands,/approval_ttl_hours/);
});
test('Build 27 authorizes a manifest state but no delivery channel',()=>{
  assert.doesNotMatch(commands,/signed_url|createSignedUrl|send_email|gmail|fetch\(/);
  assert.doesNotMatch(migration,/grant\s+execute|create\s+policy/i);
  for(const table of ['provider_onboarding_release_packages','provider_onboarding_release_package_items','provider_onboarding_release_package_approvals','provider_onboarding_release_package_events']){
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration,new RegExp(`revoke all on table public\\.${table} from public,anon,authenticated,service_role`));
  }
});
