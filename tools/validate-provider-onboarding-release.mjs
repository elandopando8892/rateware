import { readFile,readdir } from 'node:fs/promises';
import { evaluateProviderOnboardingRelease,assertSyntheticPilotFixture } from '../src/provider-onboarding-release-domain.js';
const root=new URL('../',import.meta.url);
const policy=JSON.parse(await readFile(new URL('config/provider-onboarding-release-policy.json',root),'utf8'));
const fixture=JSON.parse(await readFile(new URL('fixtures/provider-onboarding-e2e.synthetic.json',root),'utf8'));
const synthetic=assertSyntheticPilotFixture(fixture);
if(!synthetic.valid)throw new Error(`Synthetic fixture failed: ${synthetic.reasons.join(', ')}`);
const staticEvidence={
 ci_workflow:policy.required_ci_workflow,ci_conclusion:policy.required_ci_conclusion,
 production_environment_confirmed:false,private_vault_confirmed:false,human_pilot_owner_confirmed:false,rollback_owner_confirmed:false,
 configured_secret_names:[],completed_stages:fixture.stages,case_count:1,message_count:0,automatic_followups:false
};
const gate=evaluateProviderOnboardingRelease(policy,staticEvidence);
if(gate.ready||!gate.reasons.includes('release_disabled'))throw new Error('Repository release policy must fail closed by default.');
for(const forbidden of policy.prohibited_repository_artifacts||[]){
 const suffix=forbidden.replace('*','').toLowerCase();
 const roots=['project_sources','fixtures','config'];
 for(const dir of roots){
  try{const names=await readdir(new URL(`${dir}/`,root),{recursive:true});for(const name of names)if(String(name).toLowerCase().endsWith(suffix)&&dir!=='project_sources')throw new Error(`Prohibited repository artifact: ${dir}/${name}`);}catch(error){if(error?.code!=='ENOENT')throw error;}
 }
}
console.log(`Provider onboarding release gate PASS (fail-closed): ${gate.reasons.length} unresolved production gate(s).`);
