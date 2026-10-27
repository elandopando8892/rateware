const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fail=(message,code='409')=>{throw Object.assign(Error(message),{code});};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');

// Auth, workspace resolution and the operate role remain in the real handler.
// The SQL transaction arbitrates every issuer, including legacy Bidware calls.
export async function issueRfxRfiLink({client,project,user,input,actorId,generateToken,encrypt,decrypt}) {
  if(!user.owner_email||!project||project.owner_email!==user.owner_email)fail('RFI access denied','403');
  // Legacy clients send their preview/custom app_origin. Ignore it, rather
  // than trusting it or breaking those callers: the output host is server-owned.
  const days=Number(input.expires_in_days??input.expiresInDays??14);
  if(!Number.isInteger(days)||days<1||days>90)fail('RFI link validity is invalid','400');
  if(input.radar_after_requirement_id!==undefined&&(input.radar_lead_id===undefined||!uuid.test(input.radar_after_requirement_id)))fail('Radar origin is invalid','400');
  const origin=input.radar_lead_id===undefined?null:await radarOrigin(client,actorId,input.radar_lead_id,project,input.radar_after_requirement_id);
  const token=generateToken();
  if(!/^[a-f0-9]{72}$/.test(token))fail('RFI token unavailable');
  const tokenHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
  const {data,error}=await client.rpc('issue_rfx_rfi_link_once',{
    p_project_id:project.id,p_owner_email:user.owner_email,p_actor_id:user.owner_user_id,
    p_token_hash:tokenHash,p_token_encrypted:await encrypt(token),p_days:days,p_radar_origin:origin,
  });
  // Do not echo RPC payload/errors (they may contain private token material).
  if(error)fail('RFI link needs reconciliation',error.code==='42501'?'403':'409');
  if(!data?.row||typeof data.reused!=='boolean')fail('RFI link receipt unavailable');
  if(origin&&(!data.origin||Object.keys(data.origin).length!==Object.keys(origin).length
    ||Object.entries(origin).some(([key,value])=>data.origin[key]!==value)))fail('Radar origin receipt unavailable');
  const row=data.row;
  const recovered=await decrypt(row.token_encrypted);
  if(recovered!==null&&!/^[a-f0-9]{72}$/.test(recovered))fail('RFI link receipt unavailable');
  return {reused:data.reused,...(origin?{origin}:{}),row:{id:row.id,status:row.status,expires_at:row.expires_at,created_at:row.created_at},
    recoverable:Boolean(recovered),link:recovered?`https://bidware.heymarksman.com/customer-rfi.html?token=${recovered}`:null,
    message:recovered?'Private capture link ready. No message was sent.':'The existing link cannot be recovered. Reconcile it in Bidware.'};
}

async function radarOrigin(client,actorId,leadId,project,afterRequirementId) {
  if(!uuid.test(actorId)||typeof leadId!=='string'||!leadId.trim()||leadId.length>180||/[\u0000-\u001f]/.test(leadId))fail('Radar origin is invalid','400');
  const ownerId=actorId.toLowerCase();
  async function job(prefix,id,action,selectionAfter) {
    const {data,error}=await client.from('demand_radar_spot_jobs').select('state,action,receipt_text,request_hash')
      .eq('owner_user_id',ownerId).eq('job_key',`${prefix}:${await digest(selectionAfter===undefined?[ownerId,id]:[ownerId,id,'after',selectionAfter.toLowerCase()])}`).maybeSingle();
    if(error||!data||data.state!=='completed'||data.action!==action)fail('Radar origin receipt unavailable');
    try{return {row:JSON.parse(data.receipt_text),hash:data.request_hash};}catch{fail('Radar origin receipt unavailable');}
  }
  const selected=(await job('bidware_lead_request',leadId,'bidware_lead_request_confirm',afterRequirementId)).row;
  if(selected.ownerId!==ownerId||selected.leadId!==leadId||!uuid.test(selected.requirementId)
    ||selected.afterRequirementId!==afterRequirementId?.toLowerCase())fail('Radar origin mismatch');
  const approval=await job('bidware_approval',selected.requirementId,'bidware_requirement_approve');
  const approved=approval.row;
  if(approved.ownerId!==ownerId||approved.id!==selected.requirementId||approved.state!=='approved'||approved.revision!==1
    ||!uuid.test(approved.operationId)||approved.operationId!==project.operation_id
    ||approved.project?.shipperId!==project.customer_id||approved.project?.type!=='spot'||project.opportunity_type!=='spot'
    ||await digest(selected.project)!==await digest(approved.project)
    ||approval.hash!==await digest({project:approved.project,expiresAt:approved.expiresAt}))fail('Radar origin mismatch');
  const created=await job('bidware_project',approved.operationId,'bidware_project_create');
  if(created.row.requestId!==approved.operationId||created.row.projectId!==project.id||created.row.shipperId!==project.customer_id
    ||created.hash!==await digest(approved.project))fail('Radar origin mismatch');
  return {system:'demand_radar',ownerId,leadId,requirementId:selected.requirementId,operationId:approved.operationId};
}

