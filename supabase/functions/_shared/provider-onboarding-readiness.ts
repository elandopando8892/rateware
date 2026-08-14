const UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE=/^[a-z][a-z0-9_]{1,127}$/;
const PROGRAM=/^[a-z][a-z0-9_]{1,63}$/;
const JURISDICTION=/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

function text(value:unknown,field:string,pattern:RegExp){
  const result=String(value||'').trim();
  if(!pattern.test(result)) throw new Error(`${field} is invalid.`);
  return result;
}
function uuid(value:unknown,field:string){
  return text(value,field,UUID_PATTERN);
}
function positiveInteger(value:unknown,field:string){
  const result=Number(value);
  if(!Number.isInteger(result)||result<1) throw new Error(`${field} must be a positive integer.`);
  return result;
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
function dateOnly(value:unknown){
  const candidate=String(value||'');
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate)?candidate:null;
}

export async function evaluateProviderOnboardingReadiness(
  supabase:any,input:Record<string,unknown>,actorId:string,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const legalEntityId=uuid(input.legal_entity_id,'legal_entity_id');
  const programCode=text(input.program_code,'program_code',PROGRAM);
  const version=positiveInteger(input.requirement_set_version,'requirement_set_version');
  const jurisdiction=text(input.jurisdiction_code,'jurisdiction_code',JURISDICTION);
  const legalEntityKind=input.legal_entity_kind?text(input.legal_entity_kind,'legal_entity_kind',CODE):null;
  const actor=String(actorId||'').trim();
  if(!actor) throw new Error('actor_id is required.');

  let requirementsQuery=supabase.from('provider_onboarding_requirements').select('*')
    .eq('organization_id',organizationId).eq('program_code',programCode)
    .eq('requirement_set_version',version).eq('jurisdiction_code',jurisdiction)
    .eq('active',true).order('display_order',{ascending:true});
  requirementsQuery=legalEntityKind
    ?requirementsQuery.or(`legal_entity_kind.is.null,legal_entity_kind.eq.${legalEntityKind}`)
    :requirementsQuery.is('legal_entity_kind',null);
  const requirements=await requirementsQuery;
  if(requirements.error) throw requirements.error;
  if(!(requirements.data||[]).length) throw new Error('No active onboarding requirements matched the requested scope.');

  const factCodes=requirements.data.filter((item:any)=>item.requirement_kind==='fact').map((item:any)=>item.fact_field_code);
  const documentTypes=requirements.data.filter((item:any)=>item.requirement_kind==='document').map((item:any)=>item.document_type);
  let facts=[] as Array<Record<string,any>>,assets=[] as Array<Record<string,any>>;
  if(factCodes.length){
    const result=await supabase.from('provider_legal_entity_facts')
      .select('id,field_code,fact_value_sha256,sensitivity,fact_status,effective_at')
      .eq('organization_id',organizationId).eq('legal_entity_id',legalEntityId)
      .eq('fact_status','current').in('field_code',factCodes);
    if(result.error) throw result.error;
    facts=result.data||[];
  }
  if(documentTypes.length){
    const result=await supabase.from('provider_legal_entity_document_assets')
      .select('id,document_type,file_sha256,verification_status,lifecycle_status,effective_date,expiration_date,created_at')
      .eq('organization_id',organizationId).eq('legal_entity_id',legalEntityId)
      .eq('lifecycle_status','active').in('document_type',documentTypes);
    if(result.error) throw result.error;
    assets=result.data||[];
  }

  const factByCode=new Map(facts.map((item)=>[item.field_code,item]));
  const assetsByType=new Map<string,Array<Record<string,any>>>();
  for(const asset of assets){
    const list=assetsByType.get(asset.document_type)||[];
    list.push(asset); assetsByType.set(asset.document_type,list);
  }
  const today=new Date().toISOString().slice(0,10);
  const now=Date.now();
  const rows=[] as Array<Record<string,any>>;
  for(const requirement of requirements.data){
    if(requirement.requirement_kind==='fact'){
      const fact=factByCode.get(requirement.fact_field_code);
      rows.push({
        requirement,
        status:fact?'satisfied':'missing',
        reason:fact?'current_reviewed_fact':'required_fact_missing',
        fact_id:fact?.id||null,asset_id:null,evidence_sha256:fact?.fact_value_sha256||null,
      });
      continue;
    }
    const candidates=(assetsByType.get(requirement.document_type)||[])
      .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
    const verified=candidates.find((item)=>item.verification_status==='verified');
    let status='missing',reason='required_document_missing',asset:any=null;
    if(verified){
      asset=verified;
      const expiry=dateOnly(verified.expiration_date);
      const effective=dateOnly(verified.effective_date);
      const tooOld=requirement.max_age_days&&effective
        ?now-new Date(`${effective}T00:00:00Z`).getTime()>Number(requirement.max_age_days)*86400000
        :false;
      if((expiry&&expiry<today)||tooOld){status='expired';reason=expiry&&expiry<today?'document_expired':'document_too_old';}
      else {status='satisfied';reason='verified_document_current';}
    } else if(candidates.length){
      asset=candidates[0];status='unverified';reason='document_not_verified';
    }
    rows.push({requirement,status,reason,fact_id:null,asset_id:asset?.id||null,evidence_sha256:asset?.file_sha256||null});
  }

  const requiredRows=rows.filter((row)=>row.requirement.is_required);
  const satisfied=requiredRows.filter((row)=>row.status==='satisfied').length;
  const missing=requiredRows.length-satisfied;
  const blocking=requiredRows.filter((row)=>['expired','unverified','conflict','withheld'].includes(row.status)).length;
  const evaluationStatus=missing===0?'complete':blocking?'blocked':'incomplete';
  const snapshot=await sha256(rows.map((row)=>({
    requirement_id:row.requirement.id,status:row.status,fact_id:row.fact_id,
    asset_id:row.asset_id,evidence_sha256:row.evidence_sha256,
  })));

  const evaluation=await supabase.from('provider_onboarding_readiness_evaluations').insert({
    organization_id:organizationId,legal_entity_id:legalEntityId,program_code:programCode,
    requirement_set_version:version,evaluation_status:evaluationStatus,
    required_count:requiredRows.length,satisfied_count:satisfied,missing_count:missing,
    blocking_count:blocking,evidence_snapshot_sha256:snapshot,evaluated_by_actor_id:actor,
    completed_at:new Date().toISOString(),metadata:{jurisdiction_code:jurisdiction,legal_entity_kind:legalEntityKind},
  }).select('id').single();
  if(evaluation.error) throw evaluation.error;

  const inserts=rows.map((row)=>({
    organization_id:organizationId,evaluation_id:evaluation.data.id,
    requirement_id:row.requirement.id,requirement_code:row.requirement.requirement_code,
    result_status:row.status,matched_fact_id:row.fact_id,
    matched_document_asset_id:row.asset_id,evidence_sha256:row.evidence_sha256,
    result_reason_code:row.reason,
  }));
  const stored=await supabase.from('provider_onboarding_readiness_results').insert(inserts);
  if(stored.error) throw stored.error;
  return {
    evaluation_id:evaluation.data.id,evaluation_status:evaluationStatus,
    required_count:requiredRows.length,satisfied_count:satisfied,
    missing_count:missing,blocking_count:blocking,evidence_snapshot_sha256:snapshot,
  };
}
