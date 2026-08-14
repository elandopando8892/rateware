const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE=/^[a-z][a-z0-9_]{1,127}$/;
const RECIPIENT=/^[A-Za-z0-9][A-Za-z0-9_.:@-]{1,191}$/;
const ROLES=new Set(['operations','compliance','data_owner','legal']);
const DISCLOSURES=new Set(['reference_only','redacted','full']);
function required(value:unknown,field:string,pattern?:RegExp){
  const result=String(value||'').trim();
  if(!result||pattern&&!pattern.test(result)) throw new Error(`${field} is invalid.`);
  return result;
}
function uuid(value:unknown,field:string){return required(value,field,UUID);}
function positive(value:unknown,field:string,max=Number.MAX_SAFE_INTEGER){
  const result=Number(value);if(!Number.isInteger(result)||result<1||result>max)throw new Error(`${field} is invalid.`);return result;
}
function canonical(value:any):string{
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
async function sha256(value:unknown){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(digest)].map((item)=>item.toString(16).padStart(2,'0')).join('');
}
async function releaseEvent(supabase:any,row:Record<string,any>,type:string,actorId:string,previousRevision:number|null,payload:Record<string,unknown>={}){
  const result=await supabase.from('provider_onboarding_release_package_events').insert({
    organization_id:row.organization_id,package_id:row.id,event_type:type,
    previous_revision:previousRevision,revision:row.revision,actor_id:actorId,payload,
  });
  if(result.error) throw result.error;
}

export async function createProviderOnboardingReleasePackage(
  supabase:any,input:Record<string,unknown>,actorId:string,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const caseId=uuid(input.case_id,'case_id');
  const requestedBy=required(actorId,'actor_id');
  const purpose=required(input.purpose_code,'purpose_code',CODE);
  const recipient=required(input.recipient_key,'recipient_key',RECIPIENT);
  const packageVersion=positive(input.package_version,'package_version');
  const approvalCount=positive(input.required_approval_count||1,'required_approval_count',3);
  const ttlHours=positive(input.approval_ttl_hours||24,'approval_ttl_hours',168);
  const disclosure=(input.disclosure_modes||{}) as Record<string,string>;

  const onboardingCase=await supabase.from('provider_onboarding_cases').select('*')
    .eq('organization_id',organizationId).eq('id',caseId)
    .eq('case_status','ready_for_approval').maybeSingle();
  if(onboardingCase.error) throw onboardingCase.error;
  if(!onboardingCase.data||!onboardingCase.data.current_readiness_evaluation_id){
    throw new Error('Case is not ready for controlled package approval.');
  }
  const evaluation=await supabase.from('provider_onboarding_readiness_evaluations').select('*')
    .eq('organization_id',organizationId)
    .eq('id',onboardingCase.data.current_readiness_evaluation_id)
    .eq('evaluation_status','complete').maybeSingle();
  if(evaluation.error) throw evaluation.error;
  if(!evaluation.data) throw new Error('Current complete readiness evaluation was not found.');

  const results=await supabase.from('provider_onboarding_readiness_results')
    .select('id,requirement_code,result_status,matched_fact_id,matched_document_asset_id,evidence_sha256')
    .eq('organization_id',organizationId).eq('evaluation_id',evaluation.data.id)
    .eq('result_status','satisfied');
  if(results.error) throw results.error;
  if(!(results.data||[]).length) throw new Error('Complete evaluation has no releasable evidence references.');

  const factIds=results.data.map((item:any)=>item.matched_fact_id).filter(Boolean);
  const assetIds=results.data.map((item:any)=>item.matched_document_asset_id).filter(Boolean);
  let facts=[] as Array<Record<string,any>>,assets=[] as Array<Record<string,any>>;
  if(factIds.length){
    const query=await supabase.from('provider_legal_entity_facts')
      .select('id,sensitivity,fact_status,fact_value_sha256').eq('organization_id',organizationId)
      .eq('fact_status','current').in('id',factIds);
    if(query.error) throw query.error;facts=query.data||[];
  }
  if(assetIds.length){
    const query=await supabase.from('provider_legal_entity_document_assets')
      .select('id,sensitivity,lifecycle_status,verification_status,file_sha256')
      .eq('organization_id',organizationId).eq('lifecycle_status','active')
      .eq('verification_status','verified').in('id',assetIds);
    if(query.error) throw query.error;assets=query.data||[];
  }
  const factById=new Map(facts.map((item)=>[item.id,item]));
  const assetById=new Map(assets.map((item)=>[item.id,item]));
  const items=[] as Array<Record<string,any>>;
  for(const result of results.data){
    const source=result.matched_fact_id?factById.get(result.matched_fact_id):assetById.get(result.matched_document_asset_id);
    if(!source) throw new Error(`Evidence changed for ${result.requirement_code}; rerun readiness.`);
    const mode=disclosure[result.requirement_code]||'reference_only';
    if(!DISCLOSURES.has(mode)) throw new Error(`Invalid disclosure mode for ${result.requirement_code}.`);
    if(['restricted','highly_restricted'].includes(source.sensitivity)&&mode==='full'){
      throw new Error(`Restricted evidence cannot use full disclosure: ${result.requirement_code}.`);
    }
    items.push({
      item_key:`requirement:${result.requirement_code}`,
      item_kind:result.matched_fact_id?'fact':'document',
      source_fact_id:result.matched_fact_id||null,
      source_document_asset_id:result.matched_document_asset_id||null,
      disclosure_mode:mode,sensitivity:source.sensitivity,
      evidence_sha256:result.evidence_sha256,
      metadata:{readiness_result_id:result.id,requirement_code:result.requirement_code},
    });
  }

  const created=await supabase.from('provider_onboarding_release_packages').insert({
    organization_id:organizationId,case_id:caseId,readiness_evaluation_id:evaluation.data.id,
    package_version:packageVersion,purpose_code:purpose,recipient_key:recipient,
    required_approval_count:approvalCount,requested_by_actor_id:requestedBy,
    metadata:{approval_ttl_hours:ttlHours,evidence_snapshot_sha256:evaluation.data.evidence_snapshot_sha256},
  }).select('*').single();
  if(created.error) throw created.error;
  const packageId=created.data.id;
  const stored=await supabase.from('provider_onboarding_release_package_items').insert(
    items.map((item)=>({organization_id:organizationId,package_id:packageId,...item})),
  );
  if(stored.error) throw stored.error;
  const manifestSha=await sha256({
    case_id:caseId,readiness_evaluation_id:evaluation.data.id,
    evidence_snapshot_sha256:evaluation.data.evidence_snapshot_sha256,
    purpose_code:purpose,recipient_key:recipient,package_version:packageVersion,
    items:items.map((item)=>({
      item_key:item.item_key,item_kind:item.item_kind,source_fact_id:item.source_fact_id,
      source_document_asset_id:item.source_document_asset_id,
      disclosure_mode:item.disclosure_mode,sensitivity:item.sensitivity,evidence_sha256:item.evidence_sha256,
    })),
  });
  const now=new Date().toISOString();
  const submitted=await supabase.from('provider_onboarding_release_packages').update({
    package_status:'pending_approval',revision:2,manifest_sha256:manifestSha,
    requested_at:now,updated_at:now,
  }).eq('organization_id',organizationId).eq('id',packageId).eq('revision',1)
    .select('*').maybeSingle();
  if(submitted.error) throw submitted.error;
  if(!submitted.data) throw new Error('Package changed before approval submission.');
  await releaseEvent(supabase,submitted.data,'package_submitted_for_approval',requestedBy,1,{
    manifest_sha256:manifestSha,item_count:items.length,
  });
  return {package_id:packageId,package_status:'pending_approval',revision:2,manifest_sha256:manifestSha,item_count:items.length};
}

export async function decideProviderOnboardingReleasePackage(
  supabase:any,input:Record<string,unknown>,actorId:string,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const packageId=uuid(input.package_id,'package_id');
  const expectedRevision=positive(input.expected_revision,'expected_revision');
  const approver=required(actorId,'actor_id');
  const role=required(input.approval_role,'approval_role');
  const decision=required(input.decision,'decision');
  const note=required(input.decision_note,'decision_note');
  if(!ROLES.has(role)) throw new Error('approval_role is invalid.');
  if(!['approved','rejected'].includes(decision)) throw new Error('decision is invalid.');

  const pending=await supabase.from('provider_onboarding_release_packages').select('*')
    .eq('organization_id',organizationId).eq('id',packageId)
    .eq('package_status','pending_approval').eq('revision',expectedRevision).maybeSingle();
  if(pending.error) throw pending.error;
  if(!pending.data) throw new Error('Pending package revision was not found.');
  if(pending.data.requested_by_actor_id===approver) throw new Error('Package requester cannot approve their own package.');

  const approval=await supabase.from('provider_onboarding_release_package_approvals').insert({
    organization_id:organizationId,package_id:packageId,package_revision:expectedRevision,
    requested_by_actor_id:pending.data.requested_by_actor_id,approver_actor_id:approver,
    approval_role:role,decision,decision_note:note,
  });
  if(approval.error) throw approval.error;
  let nextStatus='pending_approval',approvedAt:null|string=null,expiresAt:null|string=null;
  if(decision==='rejected') nextStatus='rejected';
  else {
    const approvals=await supabase.from('provider_onboarding_release_package_approvals')
      .select('id',{count:'exact',head:true}).eq('organization_id',organizationId)
      .eq('package_id',packageId).eq('decision','approved');
    if(approvals.error) throw approvals.error;
    if(Number(approvals.count)>=Number(pending.data.required_approval_count)){
      nextStatus='approved';approvedAt=new Date().toISOString();
      const ttl=positive(pending.data.metadata?.approval_ttl_hours||24,'approval_ttl_hours',168);
      expiresAt=new Date(Date.now()+ttl*3600000).toISOString();
    }
  }
  const now=new Date().toISOString();
  const updated=await supabase.from('provider_onboarding_release_packages').update({
    package_status:nextStatus,revision:expectedRevision+1,
    approved_at:approvedAt,expires_at:expiresAt,updated_at:now,
  }).eq('organization_id',organizationId).eq('id',packageId)
    .eq('package_status','pending_approval').eq('revision',expectedRevision)
    .select('*').maybeSingle();
  if(updated.error) throw updated.error;
  if(!updated.data) throw new Error('Package revision changed during approval.');
  const eventType=nextStatus==='approved'?'package_approved':nextStatus==='rejected'?'package_rejected':'package_created';
  if(nextStatus!=='pending_approval') await releaseEvent(supabase,updated.data,eventType,approver,expectedRevision,{approval_role:role});
  return {package_id:packageId,package_status:nextStatus,revision:expectedRevision+1,expires_at:expiresAt};
}
