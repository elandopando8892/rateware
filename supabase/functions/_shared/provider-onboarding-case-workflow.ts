const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PARTY=/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,127}$/;
const PROGRAM=/^[a-z][a-z0-9_]{1,63}$/;
const JURISDICTION=/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;
function checked(value:unknown,field:string,pattern:RegExp){
  const result=String(value||'').trim();
  if(!pattern.test(result)) throw new Error(`${field} is invalid.`);
  return result;
}
function uuid(value:unknown,field:string){return checked(value,field,UUID_PATTERN);}
function actor(value:unknown){const result=String(value||'').trim();if(!result)throw new Error('actor_id is required.');return result;}
function revision(value:unknown){const result=Number(value);if(!Number.isInteger(result)||result<1)throw new Error('expected_revision must be positive.');return result;}
async function caseEvent(supabase:any,row:Record<string,any>,type:string,actorId:string,previousRevision:number|null,payload:Record<string,unknown>={}){
  const result=await supabase.from('provider_onboarding_case_events').insert({
    organization_id:row.organization_id,case_id:row.id,event_type:type,
    previous_revision:previousRevision,revision:row.revision,actor_id:actorId,payload,
  });
  if(result.error) throw result.error;
}

export async function openProviderOnboardingCase(supabase:any,input:Record<string,unknown>,actorId:string){
  const organizationId=uuid(input.organization_id,'organization_id');
  const legalEntityId=uuid(input.legal_entity_id,'legal_entity_id');
  const openedBy=actor(actorId);
  const externalPartyKey=checked(input.external_party_key,'external_party_key',PARTY);
  const programCode=checked(input.program_code,'program_code',PROGRAM);
  const jurisdiction=checked(input.jurisdiction_code,'jurisdiction_code',JURISDICTION);
  const inserted=await supabase.from('provider_onboarding_cases').insert({
    organization_id:organizationId,legal_entity_id:legalEntityId,
    external_party_key:externalPartyKey,program_code:programCode,
    jurisdiction_code:jurisdiction,legal_entity_kind:input.legal_entity_kind||null,
    case_status:'evidence_collection',opened_by_actor_id:openedBy,
    owner_user_id:input.owner_user_id||null,due_at:input.due_at||null,
  }).select('*').single();
  if(inserted.error) throw inserted.error;
  await caseEvent(supabase,inserted.data,'case_opened',openedBy,null,{case_status:'evidence_collection'});
  return {case_id:inserted.data.id,case_status:'evidence_collection',revision:1};
}

function taskFor(result:Record<string,any>){
  if(result.result_status==='satisfied') return null;
  let taskType='collect_document';
  if(result.result_reason_code==='required_fact_missing') taskType='collect_fact';
  else if(result.result_status==='unverified') taskType='verify_document';
  else if(result.result_status==='expired') taskType='refresh_evidence';
  else if(result.result_status==='conflict') taskType='resolve_conflict';
  else if(result.result_status==='withheld') taskType='run_human_review';
  return {
    task_type:taskType,task_key:`readiness:${result.requirement_code}`,
    requirement_code:result.requirement_code,blocking:true,
    source_readiness_result_id:result.id,
    metadata:{result_status:result.result_status,result_reason_code:result.result_reason_code},
  };
}

export async function reconcileProviderOnboardingCase(supabase:any,input:Record<string,unknown>,actorId:string){
  const organizationId=uuid(input.organization_id,'organization_id');
  const caseId=uuid(input.case_id,'case_id');
  const evaluationId=uuid(input.readiness_evaluation_id,'readiness_evaluation_id');
  const expectedRevision=revision(input.expected_revision);
  const reconciledBy=actor(actorId);

  const current=await supabase.from('provider_onboarding_cases').select('*')
    .eq('organization_id',organizationId).eq('id',caseId)
    .eq('revision',expectedRevision).maybeSingle();
  if(current.error) throw current.error;
  if(!current.data) throw new Error('Onboarding case revision changed.');
  if(['cancelled','closed'].includes(current.data.case_status)) throw new Error('Closed onboarding cases cannot be reconciled.');

  const evaluation=await supabase.from('provider_onboarding_readiness_evaluations').select('*')
    .eq('organization_id',organizationId).eq('id',evaluationId)
    .eq('legal_entity_id',current.data.legal_entity_id)
    .eq('program_code',current.data.program_code).maybeSingle();
  if(evaluation.error) throw evaluation.error;
  if(!evaluation.data||!evaluation.data.completed_at) throw new Error('Completed readiness evaluation was not found for this case.');

  const results=await supabase.from('provider_onboarding_readiness_results')
    .select('id,requirement_code,result_status,result_reason_code')
    .eq('organization_id',organizationId).eq('evaluation_id',evaluationId);
  if(results.error) throw results.error;
  const desired=(results.data||[]).map(taskFor).filter(Boolean) as Array<Record<string,any>>;
  if(evaluation.data.evaluation_status==='complete'){
    desired.push({
      task_type:'approve_package',task_key:'approval:package',
      requirement_code:null,blocking:true,source_readiness_result_id:null,
      metadata:{evidence_snapshot_sha256:evaluation.data.evidence_snapshot_sha256},
    });
  }
  const desiredKeys=new Set(desired.map((item)=>item.task_key));
  const existing=await supabase.from('provider_onboarding_case_tasks').select('id,task_key,task_status')
    .eq('organization_id',organizationId).eq('case_id',caseId)
    .in('task_status',['open','in_progress']);
  if(existing.error) throw existing.error;
  const completedAt=new Date().toISOString();
  for(const task of existing.data||[]){
    if(!desiredKeys.has(task.task_key)){
      const closed=await supabase.from('provider_onboarding_case_tasks').update({
        task_status:'completed',completed_by_actor_id:reconciledBy,
        completed_at:completedAt,updated_at:completedAt,
      }).eq('organization_id',organizationId).eq('id',task.id)
        .in('task_status',['open','in_progress']);
      if(closed.error) throw closed.error;
    }
  }
  if(desired.length){
    const rows=desired.map((item)=>({
      organization_id:organizationId,case_id:caseId,...item,
    }));
    const upserted=await supabase.from('provider_onboarding_case_tasks').upsert(rows,{
      onConflict:'organization_id,case_id,task_key',ignoreDuplicates:true,
    });
    if(upserted.error) throw upserted.error;
  }

  const nextStatus=evaluation.data.evaluation_status==='complete'
    ?'ready_for_approval'
    :evaluation.data.evaluation_status==='blocked'?'blocked':'evidence_collection';
  const now=new Date().toISOString();
  const updated=await supabase.from('provider_onboarding_cases').update({
    current_readiness_evaluation_id:evaluationId,case_status:nextStatus,
    revision:expectedRevision+1,ready_at:nextStatus==='ready_for_approval'?now:null,updated_at:now,
  }).eq('organization_id',organizationId).eq('id',caseId)
    .eq('revision',expectedRevision).select('*').maybeSingle();
  if(updated.error) throw updated.error;
  if(!updated.data) throw new Error('Onboarding case revision changed during reconciliation.');
  await caseEvent(supabase,updated.data,'tasks_reconciled',reconciledBy,expectedRevision,{
    readiness_evaluation_id:evaluationId,evaluation_status:evaluation.data.evaluation_status,
    case_status:nextStatus,open_task_count:desired.length,
  });
  return {case_id:caseId,case_status:nextStatus,revision:expectedRevision+1,open_task_count:desired.length};
}

export async function cancelProviderOnboardingCase(supabase:any,input:Record<string,unknown>,actorId:string){
  const organizationId=uuid(input.organization_id,'organization_id');
  const caseId=uuid(input.case_id,'case_id');
  const expectedRevision=revision(input.expected_revision);
  const cancelledBy=actor(actorId);
  const reason=String(input.reason_code||'').trim();
  if(!/^[a-z][a-z0-9_]{1,127}$/.test(reason)) throw new Error('reason_code is invalid.');
  const now=new Date().toISOString();
  const updated=await supabase.from('provider_onboarding_cases').update({
    case_status:'cancelled',revision:expectedRevision+1,closed_at:now,updated_at:now,
  }).eq('organization_id',organizationId).eq('id',caseId)
    .eq('revision',expectedRevision).not('case_status','in','(cancelled,closed)')
    .select('*').maybeSingle();
  if(updated.error) throw updated.error;
  if(!updated.data) throw new Error('Onboarding case cannot be cancelled.');
  const tasks=await supabase.from('provider_onboarding_case_tasks').update({
    task_status:'cancelled',completed_by_actor_id:cancelledBy,completed_at:now,updated_at:now,
  }).eq('organization_id',organizationId).eq('case_id',caseId).in('task_status',['open','in_progress']);
  if(tasks.error) throw tasks.error;
  await caseEvent(supabase,updated.data,'case_cancelled',cancelledBy,expectedRevision,{reason_code:reason});
  return {case_id:caseId,case_status:'cancelled',revision:expectedRevision+1};
}
