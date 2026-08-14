const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VAULT='provider-entity-vault';
function required(value:unknown,field:string){const result=String(value||'').trim();if(!result)throw new Error(`${field} is required.`);return result;}
function uuid(value:unknown,field:string){const result=required(value,field);if(!UUID.test(result))throw new Error(`${field} must be a UUID.`);return result;}
function canonical(value:any):string{
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
async function sha256(value:unknown){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(digest)].map((item)=>item.toString(16).padStart(2,'0')).join('');
}
async function assemblyEvent(supabase:any,row:Record<string,any>,eventType:string,actorId:string,payload:Record<string,unknown>={}){
  const result=await supabase.from('provider_onboarding_form_assembly_events').insert({
    organization_id:row.organization_id,assembly_id:row.id,event_type:eventType,actor_id:actorId,payload,
  });
  if(result.error) throw result.error;
}

export async function authorizeProviderOnboardingSignature(
  supabase:any,input:Record<string,unknown>,signerActorId:string,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const packageId=uuid(input.package_id,'package_id');
  const signer=required(signerActorId,'signer_actor_id');
  const method=required(input.signature_method,'signature_method');
  const consentVersion=required(input.consent_text_version,'consent_text_version');
  if(!['stored_signature_asset','external_esign','manual_wet'].includes(method)) throw new Error('signature_method is invalid.');
  const consent=(input.consent_evidence||{}) as Record<string,unknown>;
  if(consent.affirmed!==true||!consent.channel||!consent.captured_at) throw new Error('Explicit signature consent evidence is required.');

  const release=await supabase.from('provider_onboarding_release_packages').select('*')
    .eq('organization_id',organizationId).eq('id',packageId)
    .eq('package_status','approved').maybeSingle();
  if(release.error) throw release.error;
  if(!release.data||!release.data.expires_at||Date.parse(release.data.expires_at)<=Date.now()){
    throw new Error('Approved unexpired release package was not found.');
  }
  let signatureAssetId:null|string=null;
  if(method==='stored_signature_asset'){
    signatureAssetId=uuid(input.signature_document_asset_id,'signature_document_asset_id');
    const asset=await supabase.from('provider_legal_entity_document_assets')
      .select('id,document_type,file_sha256,sensitivity')
      .eq('organization_id',organizationId).eq('id',signatureAssetId)
      .eq('lifecycle_status','active').eq('verification_status','verified').maybeSingle();
    if(asset.error) throw asset.error;
    if(!asset.data||!['authorized_signature','signature_specimen'].includes(asset.data.document_type)){
      throw new Error('Verified private signature asset was not found.');
    }
  }
  const requestedExpiry=Date.parse(String(input.expires_at||''));
  const expiresAt=new Date(Math.min(requestedExpiry||Date.parse(release.data.expires_at),Date.parse(release.data.expires_at))).toISOString();
  if(Date.parse(expiresAt)<=Date.now()) throw new Error('Signature authorization expiry must be in the future.');
  const scopeSha=await sha256({
    package_id:packageId,manifest_sha256:release.data.manifest_sha256,
    purpose_code:release.data.purpose_code,recipient_key:release.data.recipient_key,
    signer_actor_id:signer,signature_method:method,signature_document_asset_id:signatureAssetId,
    consent_text_version:consentVersion,expires_at:expiresAt,
  });
  const inserted=await supabase.from('provider_onboarding_signature_authorizations').insert({
    organization_id:organizationId,package_id:packageId,signer_actor_id:signer,
    signature_document_asset_id:signatureAssetId,signature_method:method,
    scope_sha256:scopeSha,consent_text_version:consentVersion,
    consent_evidence:consent,expires_at:expiresAt,
  }).select('id').single();
  if(inserted.error) throw inserted.error;
  return {signature_authorization_id:inserted.data.id,authorization_status:'active',scope_sha256:scopeSha,expires_at:expiresAt};
}

export async function queueProviderOnboardingFormAssembly(
  supabase:any,input:Record<string,unknown>,actorId:string,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const packageId=uuid(input.package_id,'package_id');
  const templateId=uuid(input.template_id,'template_id');
  const requestedBy=required(actorId,'actor_id');
  const release=await supabase.from('provider_onboarding_release_packages').select('*,provider_onboarding_cases(program_code)')
    .eq('organization_id',organizationId).eq('id',packageId)
    .eq('package_status','approved').maybeSingle();
  if(release.error) throw release.error;
  if(!release.data||Date.parse(release.data.expires_at)<=Date.now()) throw new Error('Approved package is expired or unavailable.');
  const programCode=release.data.provider_onboarding_cases?.program_code;
  const template=await supabase.from('provider_onboarding_form_templates').select('*')
    .eq('organization_id',organizationId).eq('id',templateId)
    .eq('program_code',programCode).eq('active',true).maybeSingle();
  if(template.error) throw template.error;
  if(!template.data) throw new Error('Active form template was not found for the case program.');

  let authorizationId:null|string=null;
  if(template.data.signature_policy!=='none'){
    authorizationId=uuid(input.signature_authorization_id,'signature_authorization_id');
    const authorization=await supabase.from('provider_onboarding_signature_authorizations').select('*')
      .eq('organization_id',organizationId).eq('id',authorizationId)
      .eq('package_id',packageId).eq('authorization_status','active').maybeSingle();
    if(authorization.error) throw authorization.error;
    if(!authorization.data||Date.parse(authorization.data.expires_at)<=Date.now()){
      throw new Error('Active signature authorization was not found.');
    }
    if(template.data.signature_policy==='external_esign'&&authorization.data.signature_method!=='external_esign'){
      throw new Error('Template requires external e-sign authorization.');
    }
  }
  const queued=await supabase.from('provider_onboarding_form_assemblies').insert({
    organization_id:organizationId,package_id:packageId,template_id:templateId,
    signature_authorization_id:authorizationId,input_manifest_sha256:release.data.manifest_sha256,
    requested_by_actor_id:requestedBy,
  }).select('*').single();
  if(queued.error) throw queued.error;
  await assemblyEvent(supabase,queued.data,'assembly_queued',requestedBy,{template_code:template.data.template_code});
  return {assembly_id:queued.data.id,assembly_status:'queued'};
}

export type ProviderOnboardingFormAssembler={
  assembleAndStore(input:{
    template:{bucket:string;path:string;sha256:string};
    fields:Record<string,unknown>;
    documentReferences:Array<{assetId:string;sha256:string;disclosureMode:string}>;
    signatureReference:null|{method:string;assetId:string|null;scopeSha256:string};
    output:{bucket:string;path:string};
  }):Promise<{bucket:string;path:string;sha256:string;sizeBytes:number}>;
};

function transform(value:any,code:string){
  if(code==='uppercase') return String(value).toUpperCase();
  if(code==='lowercase') return String(value).toLowerCase();
  if(code==='date_iso'){
    const date=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Mapped date is not ISO.');return date;
  }
  if(code==='boolean_yes_no') return value===true?'Yes':value===false?'No':String(value);
  return value;
}

export async function processProviderOnboardingFormAssembly(
  supabase:any,input:Record<string,unknown>,assembler:ProviderOnboardingFormAssembler,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const assemblyId=uuid(input.assembly_id,'assembly_id');
  const workerId=required(input.worker_id,'worker_id');
  const leaseToken=crypto.randomUUID(),now=new Date().toISOString();
  const claimed=await supabase.from('provider_onboarding_form_assemblies').update({
    assembly_status:'assembling',processing_lease_token:leaseToken,
    processing_lease_expires_at:new Date(Date.now()+5*60000).toISOString(),started_at:now,
  }).eq('organization_id',organizationId).eq('id',assemblyId).eq('assembly_status','queued')
    .select('*').maybeSingle();
  if(claimed.error) throw claimed.error;
  if(!claimed.data) throw new Error('Assembly is not claimable.');
  await assemblyEvent(supabase,claimed.data,'assembly_started',workerId);

  try{
    const release=await supabase.from('provider_onboarding_release_packages').select('*')
      .eq('organization_id',organizationId).eq('id',claimed.data.package_id)
      .eq('package_status','approved').eq('manifest_sha256',claimed.data.input_manifest_sha256).maybeSingle();
    if(release.error) throw release.error;
    if(!release.data||Date.parse(release.data.expires_at)<=Date.now()) throw new Error('Release package authorization expired.');
    const template=await supabase.from('provider_onboarding_form_templates').select('*')
      .eq('organization_id',organizationId).eq('id',claimed.data.template_id).eq('active',true).maybeSingle();
    if(template.error) throw template.error;if(!template.data) throw new Error('Form template is unavailable.');
    const mappings=await supabase.from('provider_onboarding_form_field_mappings').select('*')
      .eq('organization_id',organizationId).eq('template_id',template.data.id).order('display_order',{ascending:true});
    if(mappings.error) throw mappings.error;
    const items=await supabase.from('provider_onboarding_release_package_items').select('*')
      .eq('organization_id',organizationId).eq('package_id',release.data.id);
    if(items.error) throw items.error;
    const factItems=items.data.filter((item:any)=>item.item_kind==='fact');
    const factIds=factItems.map((item:any)=>item.source_fact_id);
    let facts=[] as Array<Record<string,any>>;
    if(factIds.length){
      const query=await supabase.from('provider_legal_entity_facts').select('id,field_code,fact_value,fact_value_sha256')
        .eq('organization_id',organizationId).eq('fact_status','current').in('id',factIds);
      if(query.error) throw query.error;facts=query.data||[];
    }
    const itemByFact=new Map(factItems.map((item:any)=>[item.source_fact_id,item]));
    const factByCode=new Map(facts.map((fact)=>[fact.field_code,fact]));
    const fields:Record<string,unknown>={};
    for(const mapping of mappings.data){
      if(mapping.source_kind==='static'){fields[mapping.target_field_name]=mapping.static_value;continue;}
      const fact=factByCode.get(mapping.source_field_code);
      const packageItem=fact?itemByFact.get(fact.id):null;
      const disclosureOk=packageItem&&(mapping.disclosure_required==='redacted'
        ?['redacted','full'].includes(packageItem.disclosure_mode)
        :packageItem.disclosure_mode==='full');
      if(!fact||!disclosureOk){
        if(mapping.required) throw new Error(`Approved full-disclosure fact is missing for ${mapping.source_field_code}.`);
        continue;
      }
      fields[mapping.target_field_name]=transform(fact.fact_value,mapping.transform_code);
    }
    let signatureReference:null|{method:string;assetId:string|null;scopeSha256:string}=null;
    if(claimed.data.signature_authorization_id){
      const authorization=await supabase.from('provider_onboarding_signature_authorizations').select('*')
        .eq('organization_id',organizationId).eq('id',claimed.data.signature_authorization_id)
        .eq('package_id',release.data.id).eq('authorization_status','active').maybeSingle();
      if(authorization.error) throw authorization.error;
      if(!authorization.data||Date.parse(authorization.data.expires_at)<=Date.now()) throw new Error('Signature consent expired.');
      signatureReference={method:authorization.data.signature_method,assetId:authorization.data.signature_document_asset_id,scopeSha256:authorization.data.scope_sha256};
    }
    const outputPath=`assembled/${organizationId}/${assemblyId}.pdf`;
    const output=await assembler.assembleAndStore({
      template:{bucket:template.data.storage_bucket,path:template.data.storage_path,sha256:template.data.template_sha256},
      fields,
      documentReferences:items.data.filter((item:any)=>item.item_kind==='document').map((item:any)=>({
        assetId:item.source_document_asset_id,sha256:item.evidence_sha256,disclosureMode:item.disclosure_mode,
      })),
      signatureReference,output:{bucket:VAULT,path:outputPath},
    });
    if(output.bucket!==VAULT||output.path!==outputPath||!/^[0-9a-f]{64}$/.test(output.sha256)||output.sizeBytes<1){
      throw new Error('Assembler returned an invalid private artifact.');
    }
    const completedAt=new Date().toISOString();
    const completed=await supabase.from('provider_onboarding_form_assemblies').update({
      assembly_status:'assembled',output_storage_bucket:output.bucket,output_storage_path:output.path,
      output_sha256:output.sha256,output_size_bytes:output.sizeBytes,completed_at:completedAt,
      processing_lease_token:null,processing_lease_expires_at:null,last_error_code:null,
    }).eq('organization_id',organizationId).eq('id',assemblyId)
      .eq('processing_lease_token',leaseToken).select('*').maybeSingle();
    if(completed.error) throw completed.error;if(!completed.data) throw new Error('Assembly lease was lost.');
    if(claimed.data.signature_authorization_id){
      const consumed=await supabase.from('provider_onboarding_signature_authorizations').update({
        authorization_status:'consumed',consumed_at:completedAt,
      }).eq('organization_id',organizationId).eq('id',claimed.data.signature_authorization_id)
        .eq('authorization_status','active');
      if(consumed.error) throw consumed.error;
      await assemblyEvent(supabase,completed.data,'signature_authorization_consumed',workerId);
    }
    await assemblyEvent(supabase,completed.data,'assembly_completed',workerId,{output_sha256:output.sha256,output_size_bytes:output.sizeBytes});
    return {assembly_id:assemblyId,assembly_status:'assembled',output_sha256:output.sha256};
  }catch(error){
    const code=error instanceof Error?error.message:String(error);
    await supabase.from('provider_onboarding_form_assemblies').update({
      assembly_status:'failed',failed_at:new Date().toISOString(),last_error_code:code.slice(0,191),
      processing_lease_token:null,processing_lease_expires_at:null,
    }).eq('organization_id',organizationId).eq('id',assemblyId).eq('processing_lease_token',leaseToken);
    await assemblyEvent(supabase,claimed.data,'assembly_failed',workerId,{error_code:code.slice(0,191)});
    throw error;
  }
}
