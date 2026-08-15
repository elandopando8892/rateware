const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function required(value:unknown,field:string){const result=String(value||'').trim();if(!result)throw new Error(`${field} is required.`);return result;}
function uuid(value:unknown,field:string){const result=required(value,field);if(!UUID.test(result))throw new Error(`${field} must be a UUID.`);return result;}
function email(value:unknown,field:string){const result=required(value,field).toLowerCase();if(!EMAIL.test(result))throw new Error(`${field} is invalid.`);return result;}
function positiveRevision(value:unknown){const result=Number(value);if(!Number.isInteger(result)||result<1)throw new Error('expected_revision is invalid.');return result;}
function render(template:string,variables:Record<string,unknown>,allowed:string[]){
  const used=new Set<string>();
  const output=template.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g,(_,key)=>{
    if(!allowed.includes(key)||!(key in variables)) throw new Error(`Template variable is unavailable: ${key}.`);
    used.add(key);return String(variables[key]??'');
  });
  if(/\{\{[^}]+\}\}/.test(output)) throw new Error('Template contains unresolved variables.');
  return output;
}
async function messageEvent(supabase:any,row:Record<string,any>,type:string,actorId:string,payload:Record<string,unknown>={}){
  const result=await supabase.from('provider_onboarding_outbound_message_events').insert({
    organization_id:row.organization_id,message_id:row.id,event_type:type,actor_id:actorId,payload,
  });if(result.error)throw result.error;
}
async function policyFor(supabase:any,organizationId:string,mailbox:string,recipient:string){
  const result=await supabase.from('provider_onboarding_mailbox_policies').select('*')
    .eq('organization_id',organizationId).eq('mailbox_email',mailbox).eq('enabled',true).maybeSingle();
  if(result.error)throw result.error;if(!result.data)throw new Error('Enabled mailbox policy was not found.');
  const domain=recipient.split('@')[1];
  if(!(result.data.allowed_recipient_domains||[]).map((item:string)=>item.toLowerCase()).includes(domain)){
    throw new Error('Recipient domain is not allowed by mailbox policy.');
  }
  return result.data;
}

export async function draftProviderOnboardingEmail(
  supabase:any,input:Record<string,unknown>,actorId:string,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const caseId=uuid(input.case_id,'case_id');
  const templateId=uuid(input.template_id,'template_id');
  const requestedBy=required(actorId,'actor_id');
  const mailbox=email(input.mailbox_email,'mailbox_email');
  const recipient=email(input.recipient_email,'recipient_email');
  const policy=await policyFor(supabase,organizationId,mailbox,recipient);
  const onboardingCase=await supabase.from('provider_onboarding_cases').select('id,case_status')
    .eq('organization_id',organizationId).eq('id',caseId).maybeSingle();
  if(onboardingCase.error)throw onboardingCase.error;
  if(!onboardingCase.data||['cancelled','closed'].includes(onboardingCase.data.case_status))throw new Error('Active onboarding case was not found.');
  const template=await supabase.from('provider_onboarding_message_templates').select('*')
    .eq('organization_id',organizationId).eq('id',templateId).eq('active',true).maybeSingle();
  if(template.error)throw template.error;if(!template.data)throw new Error('Active message template was not found.');
  const variables=(input.variables||{}) as Record<string,unknown>;
  const subject=render(template.data.subject_template,variables,template.data.allowed_variables||[]);
  const body=render(template.data.body_text_template,variables,template.data.allowed_variables||[]);
  let packageId:null|string=null,assemblyId:null|string=null,attachmentSha:null|string=null;
  if(input.package_id||input.assembly_id){
    packageId=uuid(input.package_id,'package_id');assemblyId=uuid(input.assembly_id,'assembly_id');
    const release=await supabase.from('provider_onboarding_release_packages').select('*')
      .eq('organization_id',organizationId).eq('id',packageId).eq('case_id',caseId)
      .eq('package_status','approved').maybeSingle();
    if(release.error)throw release.error;
    if(!release.data||Date.parse(release.data.expires_at)<=Date.now())throw new Error('Approved package is expired or unavailable.');
    if(release.data.recipient_key.toLowerCase()!==recipient)throw new Error('Email recipient differs from approved package recipient.');
    const assembly=await supabase.from('provider_onboarding_form_assemblies').select('*')
      .eq('organization_id',organizationId).eq('id',assemblyId).eq('package_id',packageId)
      .eq('assembly_status','assembled').maybeSingle();
    if(assembly.error)throw assembly.error;
    if(!assembly.data||assembly.data.output_size_bytes>policy.max_attachment_bytes)throw new Error('Private assembled artifact is unavailable or too large.');
    attachmentSha=assembly.data.output_sha256;
  }
  const idempotency=required(input.idempotency_key,'idempotency_key');
  if(!/^[A-Za-z0-9_.:-]{8,191}$/.test(idempotency))throw new Error('idempotency_key is invalid.');
  const needsHuman=Boolean(policy.require_human_approval||assemblyId);
  const initialStatus=needsHuman?'pending_approval':'approved';
  const policyActor=`policy:${policy.id}`;
  const inserted=await supabase.from('provider_onboarding_outbound_messages').insert({
    organization_id:organizationId,case_id:caseId,package_id:packageId,assembly_id:assemblyId,
    template_id:templateId,message_status:initialStatus,mailbox_email:mailbox,
    recipient_email:recipient,subject_text:subject,body_text:body,attachment_sha256:attachmentSha,
    idempotency_key:idempotency,requested_by_actor_id:requestedBy,
    approved_by_actor_id:needsHuman?null:policyActor,
    approval_note:needsHuman?null:'Pre-approved mailbox policy; no attachment.',
    metadata:{template_code:template.data.template_code,template_version:template.data.template_version},
  }).select('*').single();
  if(inserted.error)throw inserted.error;
  await messageEvent(supabase,inserted.data,'message_drafted',requestedBy,{message_status:initialStatus});
  return {message_id:inserted.data.id,message_status:initialStatus,revision:1};
}

export async function decideProviderOnboardingEmail(
  supabase:any,input:Record<string,unknown>,actorId:string,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const messageId=uuid(input.message_id,'message_id');
  const expectedRevision=positiveRevision(input.expected_revision);
  const approver=required(actorId,'actor_id');
  const decision=required(input.decision,'decision');
  const note=required(input.decision_note,'decision_note');
  if(!['approved','rejected'].includes(decision))throw new Error('decision is invalid.');
  const pending=await supabase.from('provider_onboarding_outbound_messages').select('*')
    .eq('organization_id',organizationId).eq('id',messageId)
    .eq('message_status','pending_approval').eq('revision',expectedRevision).maybeSingle();
  if(pending.error)throw pending.error;if(!pending.data)throw new Error('Pending message revision was not found.');
  if(pending.data.requested_by_actor_id===approver)throw new Error('Message requester cannot approve their own delivery.');
  const nextStatus=decision==='approved'?'approved':'cancelled';
  const updated=await supabase.from('provider_onboarding_outbound_messages').update({
    message_status:nextStatus,revision:expectedRevision+1,approved_by_actor_id:decision==='approved'?approver:null,
    approval_note:note,last_error_code:decision==='rejected'?'rejected_by_human':null,updated_at:new Date().toISOString(),
  }).eq('organization_id',organizationId).eq('id',messageId).eq('revision',expectedRevision)
    .eq('message_status','pending_approval').select('*').maybeSingle();
  if(updated.error)throw updated.error;if(!updated.data)throw new Error('Message revision changed during approval.');
  await messageEvent(supabase,updated.data,decision==='approved'?'message_approved':'message_rejected',approver);
  return {message_id:messageId,message_status:nextStatus,revision:expectedRevision+1};
}

export async function queueProviderOnboardingEmail(
  supabase:any,input:Record<string,unknown>,actorId:string,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const messageId=uuid(input.message_id,'message_id');
  const expectedRevision=positiveRevision(input.expected_revision);
  const queuedBy=required(actorId,'actor_id');
  const scheduledAt=input.scheduled_at?new Date(String(input.scheduled_at)).toISOString():new Date().toISOString();
  const updated=await supabase.from('provider_onboarding_outbound_messages').update({
    message_status:'queued',revision:expectedRevision+1,scheduled_at:scheduledAt,updated_at:new Date().toISOString(),
  }).eq('organization_id',organizationId).eq('id',messageId).eq('message_status','approved')
    .eq('revision',expectedRevision).select('*').maybeSingle();
  if(updated.error)throw updated.error;if(!updated.data)throw new Error('Approved message revision was not found.');
  await messageEvent(supabase,updated.data,'message_queued',queuedBy,{scheduled_at:scheduledAt});
  return {message_id:messageId,message_status:'queued',revision:expectedRevision+1,scheduled_at:scheduledAt};
}

export type ProviderOnboardingGmailSender={
  send(input:{
    mailbox:string;to:string;subject:string;text:string;threadId:string|null;
    idempotencyKey:string;
    attachment:null|{bucket:string;path:string;sha256:string;filename:string};
  }):Promise<{messageId:string;threadId:string}>;
};

export async function sendQueuedProviderOnboardingEmail(
  supabase:any,input:Record<string,unknown>,sender:ProviderOnboardingGmailSender,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const messageId=uuid(input.message_id,'message_id');
  const worker=required(input.worker_id,'worker_id');
  const leaseToken=crypto.randomUUID(),now=new Date().toISOString();
  const claimed=await supabase.from('provider_onboarding_outbound_messages').update({
    message_status:'sending',processing_lease_token:leaseToken,
    processing_lease_expires_at:new Date(Date.now()+5*60000).toISOString(),
    send_attempts:1,updated_at:now,
  }).eq('organization_id',organizationId).eq('id',messageId).eq('message_status','queued')
    .lte('scheduled_at',now).lt('send_attempts',10).select('*').maybeSingle();
  if(claimed.error)throw claimed.error;if(!claimed.data)throw new Error('Queued message is not claimable.');
  await messageEvent(supabase,claimed.data,'message_send_started',worker);
  try{
    const policy=await policyFor(supabase,organizationId,claimed.data.mailbox_email,claimed.data.recipient_email);
    let attachment:null|{bucket:string;path:string;sha256:string;filename:string}=null;
    if(claimed.data.assembly_id){
      const release=await supabase.from('provider_onboarding_release_packages').select('*')
        .eq('organization_id',organizationId).eq('id',claimed.data.package_id)
        .eq('package_status','approved').maybeSingle();
      if(release.error)throw release.error;
      if(!release.data||Date.parse(release.data.expires_at)<=Date.now()||release.data.recipient_key.toLowerCase()!==claimed.data.recipient_email){
        throw new Error('Release authorization expired or recipient changed.');
      }
      const assembled=await supabase.from('provider_onboarding_form_assemblies').select('*')
        .eq('organization_id',organizationId).eq('id',claimed.data.assembly_id)
        .eq('package_id',release.data.id).eq('assembly_status','assembled')
        .eq('output_sha256',claimed.data.attachment_sha256).maybeSingle();
      if(assembled.error)throw assembled.error;
      if(!assembled.data||assembled.data.output_size_bytes>policy.max_attachment_bytes)throw new Error('Approved attachment changed or is too large.');
      attachment={bucket:assembled.data.output_storage_bucket,path:assembled.data.output_storage_path,
        sha256:assembled.data.output_sha256,filename:`onboarding-${claimed.data.case_id}.pdf`};
    }
    const sent=await sender.send({
      mailbox:claimed.data.mailbox_email,to:claimed.data.recipient_email,
      subject:claimed.data.subject_text,text:claimed.data.body_text,
      threadId:claimed.data.gmail_thread_id||null,idempotencyKey:claimed.data.idempotency_key,attachment,
    });
    if(!sent.messageId||!sent.threadId)throw new Error('Gmail sender returned incomplete identifiers.');
    const followup=claimed.data.followup_number<policy.max_followups
      ?new Date(Date.now()+policy.followup_interval_hours*3600000).toISOString():null;
    const completed=await supabase.from('provider_onboarding_outbound_messages').update({
      message_status:'sent',sent_at:new Date().toISOString(),gmail_message_id:sent.messageId,
      gmail_thread_id:sent.threadId,next_followup_at:followup,
      processing_lease_token:null,processing_lease_expires_at:null,last_error_code:null,updated_at:new Date().toISOString(),
    }).eq('organization_id',organizationId).eq('id',messageId)
      .eq('processing_lease_token',leaseToken).select('*').maybeSingle();
    if(completed.error)throw completed.error;if(!completed.data)throw new Error('Message delivery lease was lost.');
    await messageEvent(supabase,completed.data,'message_sent',worker,{gmail_message_id:sent.messageId,gmail_thread_id:sent.threadId});
    if(followup)await messageEvent(supabase,completed.data,'followup_scheduled',worker,{next_followup_at:followup});
    return {message_id:messageId,message_status:'sent',gmail_message_id:sent.messageId,gmail_thread_id:sent.threadId,next_followup_at:followup};
  }catch(error){
    const code=error instanceof Error?error.message:String(error);
    await supabase.from('provider_onboarding_outbound_messages').update({
      message_status:'failed',last_error_code:code.slice(0,191),
      processing_lease_token:null,processing_lease_expires_at:null,updated_at:new Date().toISOString(),
    }).eq('organization_id',organizationId).eq('id',messageId).eq('processing_lease_token',leaseToken);
    await messageEvent(supabase,claimed.data,'message_failed',worker,{error_code:code.slice(0,191)});
    throw error;
  }
}

export async function draftDueProviderOnboardingFollowup(
  supabase:any,input:Record<string,unknown>,actorId:string,
){
  const organizationId=uuid(input.organization_id,'organization_id');
  const parentId=uuid(input.parent_message_id,'parent_message_id');
  const templateId=uuid(input.template_id,'template_id');
  const parent=await supabase.from('provider_onboarding_outbound_messages').select('*')
    .eq('organization_id',organizationId).eq('id',parentId).eq('message_status','sent')
    .lte('next_followup_at',new Date().toISOString()).maybeSingle();
  if(parent.error)throw parent.error;if(!parent.data)throw new Error('Due sent message was not found.');
  const policy=await policyFor(supabase,organizationId,parent.data.mailbox_email,parent.data.recipient_email);
  if(parent.data.followup_number>=policy.max_followups)throw new Error('Follow-up limit was reached.');
  const result=await draftProviderOnboardingEmail(supabase,{
    organization_id:organizationId,case_id:parent.data.case_id,template_id:templateId,
    mailbox_email:parent.data.mailbox_email,recipient_email:parent.data.recipient_email,
    variables:input.variables||{},idempotency_key:`${parent.data.idempotency_key}:followup:${parent.data.followup_number+1}`,
  },actorId);
  const linked=await supabase.from('provider_onboarding_outbound_messages').update({
    parent_message_id:parentId,gmail_thread_id:parent.data.gmail_thread_id,
    followup_number:parent.data.followup_number+1,
  }).eq('organization_id',organizationId).eq('id',result.message_id);
  if(linked.error)throw linked.error;
  await supabase.from('provider_onboarding_outbound_messages').update({next_followup_at:null})
    .eq('organization_id',organizationId).eq('id',parentId);
  return {...result,parent_message_id:parentId,followup_number:parent.data.followup_number+1};
}
