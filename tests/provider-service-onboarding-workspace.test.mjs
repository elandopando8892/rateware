import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { approvalProgress,normalizeOnboardingQueue,onboardingAttention,onboardingOutputStage,safeCaseLabel,summarizeOnboarding } from '../src/provider-onboarding-domain.js';
const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('onboarding domain fails closed and prioritizes overdue work',()=>{
 assert.equal(normalizeOnboardingQueue('unknown'),'all');
 assert.equal(onboardingAttention({case_status:'blocked',overdue_task_count:1}),'critical');
 assert.equal(onboardingOutputStage({latest_message_status:'sent'}),'delivery:sent');
 assert.deepEqual(approvalProgress({approval_count:2,required_approval_count:2}),{approved:2,required:2,complete:true});
 assert.equal(safeCaseLabel({program_code:'carrier_setup',jurisdiction_code:'US-TX'}),'carrier setup · US-TX');
 assert.deepEqual(summarizeOnboarding([{case_status:'blocked',overdue_task_count:1}]),{total:1,blocked:1,approval:0,overdue:1});
});
test('workspace read model and API exclude sensitive content',async()=>{
 const [sql,api,page,html]=await Promise.all([read('supabase/migrations/20260814170000_provider_onboarding_workspace.sql'),read('supabase/functions/shipper-directory-api/provider-service.ts'),read('src/provider-onboarding-page.js'),read('provider-onboarding.html')]);
 assert.match(sql,/revoke all on public\.provider_onboarding_workspace from public,anon,authenticated/i);
 assert.match(sql,/grant select on public\.provider_onboarding_workspace to service_role/i);
 assert.match(api,/list_provider_onboarding_workspace/);
 assert.match(api,/get_provider_onboarding_case/);
 for(const forbidden of ['body_text','recipient_email','mailbox_email','storage_path','manifest_sha256','signature_document_asset_id'])assert.doesNotMatch(api.slice(api.indexOf('async function listProviderOnboardingWorkspace')),new RegExp(forbidden));
 assert.match(page,/Controlled-action boundary/);
 assert.match(html,/never renders fact values/i);
});
test('Provider Service links the onboarding workspace',async()=>{assert.match(await read('provider-service.html'),/provider-onboarding\.html/);});
