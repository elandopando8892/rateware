import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {evaluateProviderOnboardingRelease,assertSyntheticPilotFixture} from '../src/provider-onboarding-release-domain.js';
const load=async(path)=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
test('release policy is disabled and bounded by default',async()=>{const policy=await load('config/provider-onboarding-release-policy.json');assert.equal(policy.release_enabled,false);assert.equal(policy.pilot_mode,'disabled');assert.equal(policy.rollout.canary_legal_entities,1);assert.equal(policy.rollout.max_initial_messages,1);assert.equal(policy.rollout.automatic_followups,false);});
test('synthetic E2E fixture contains no real pilot identity',async()=>{const result=assertSyntheticPilotFixture(await load('fixtures/provider-onboarding-e2e.synthetic.json'));assert.deepEqual(result,{valid:true,reasons:[]});});
test('release gate opens only with every production and workflow proof',async()=>{
 const policy=await load('config/provider-onboarding-release-policy.json');policy.release_enabled=true;policy.pilot_mode='private_canary';
 const fixture=await load('fixtures/provider-onboarding-e2e.synthetic.json');
 const evidence={ci_workflow:'clean-migration-replay',ci_conclusion:'success',production_environment_confirmed:true,private_vault_confirmed:true,human_pilot_owner_confirmed:true,rollback_owner_confirmed:true,configured_secret_names:policy.required_secret_names,completed_stages:fixture.stages,case_count:1,message_count:1,automatic_followups:false,evaluated_at:'2026-08-14T00:00:00Z'};
 assert.deepEqual(evaluateProviderOnboardingRelease(policy,evidence),{ready:true,reasons:[],evaluated_at:'2026-08-14T00:00:00Z'});
 for(const field of ['production_environment_confirmed','private_vault_confirmed','human_pilot_owner_confirmed','rollback_owner_confirmed']){const broken={...evidence,[field]:false};assert.equal(evaluateProviderOnboardingRelease(policy,broken).ready,false);}
});
test('one missing stage, secret, or bounded limit blocks release',async()=>{
 const policy=await load('config/provider-onboarding-release-policy.json');policy.release_enabled=true;policy.pilot_mode='private_canary';const fixture=await load('fixtures/provider-onboarding-e2e.synthetic.json');
 const base={ci_workflow:policy.required_ci_workflow,ci_conclusion:'success',production_environment_confirmed:true,private_vault_confirmed:true,human_pilot_owner_confirmed:true,rollback_owner_confirmed:true,configured_secret_names:policy.required_secret_names,completed_stages:fixture.stages,case_count:1,message_count:1,automatic_followups:false};
 assert.match(evaluateProviderOnboardingRelease(policy,{...base,completed_stages:fixture.stages.slice(1)}).reasons.join(','),/missing_stage:inbound_received/);
 assert.match(evaluateProviderOnboardingRelease(policy,{...base,configured_secret_names:policy.required_secret_names.slice(1)}).reasons.join(','),/missing_secret:/);
 assert.match(evaluateProviderOnboardingRelease(policy,{...base,message_count:2}).reasons.join(','),/message_count_out_of_bounds/);
});
