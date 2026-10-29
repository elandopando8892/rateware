import {createBidOperationIntent} from './bid-operation-contract.mjs';
import {validateStoredBidPreparation as preparedRecord,originalReferenceFromSource,validOriginalReference} from './bid-preparation-contract.mjs';
import {lookupAuthenticatedBidOperation,submitAuthenticatedBidOperation,commitAuthenticatedPreparedBidOperation} from './bid-operation-store.mjs';
import {PRIVATE_DELIVERY_CONTRACT,activePrivateInvitation,loadPrivateDeliveryEvidence,privateInvitationProjection} from './private-invitation-evidence.mjs';
import {createNativeClientFeeGate} from './native-client-fee-gate.mjs';
import {createNativeClientFeeBinding,clientFeeBindingCodes} from './native-client-fee-binding.mjs';
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim()&&v.length<=256;
const relation=v=>Array.isArray(v)?v[0]:v;
const fail=(code,status)=>{throw Object.assign(new Error(code),{code,status});};
const canonical=v=>Array.isArray(v)?v.map(canonical):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const fields=new Set(['bid_rate','currency','weekly_capacity','transit_days','valid_through','commercial_model',
 'marksman_margin_pct','carrier_share_pct','best_alternative_offered','alternative_equipment','alternative_units',
 'alternative_notes','equipment_available','current_unit_location','deadhead_distance','deadhead_unit','unit_details',
 'eta_pickup','eta_delivery','mirror_account_enabled','notes','best_final']);
const envelope=new Set(['action','contractVersion','token','requestId','expectedUpdatedAt','sourceSignature','bid','language','originalSource']);
const statusOf={BID_OPERATION_CONFLICT:409,BID_OPERATION_STALE:409,BID_OPERATION_SCOPE_MISMATCH:403,
 BID_OPERATION_INVALID:400,BID_OPERATION_SOURCE_UNSUPPORTED:400,BID_OPERATION_CAPTURE_MISMATCH:409,
 ...clientFeeBindingCodes,BID_OPERATION_IDENTITY_INVALID:403,BID_OPERATION_APPROVAL_REQUIRED:403,BID_OPERATION_SOURCE_CHANGED:409,BID_OPERATION_WINDOW_CLOSED:409,
 BID_ORIGINAL_SOURCE_CHANGED:409,BID_OPERATION_NOT_PREPARED:409,BID_OPERATION_TRANSITION_DISABLED:503};
const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const feeCodes=['NATIVE_BID_CLIENT_FEE_REQUIRED','NATIVE_BID_CLIENT_FEE_UNAVAILABLE','NATIVE_BID_CLIENT_FEE_CHANGED',...Object.keys(clientFeeBindingCodes)];
const originalCodes={BID_ORIGINAL_SOURCE_UNAVAILABLE:503,BID_ORIGINAL_SOURCE_FORBIDDEN:403,BID_ORIGINAL_LINK_FORBIDDEN:403,BID_ORIGINAL_SOURCE_CHANGED:409,
 BID_ORIGINAL_SOURCE_HASH_MISMATCH:409,BID_ORIGINAL_SOURCE_SIZE_MISMATCH:409,BID_ORIGINAL_SOURCE_UNSUPPORTED:400,BID_ORIGINAL_SOURCE_INVALID:400};

export function isNativeBidRequest(body){
 return ['resolve_preparation_original','lookup_prepared_bid','read_native_bid_context','prepare_native_bid','review_prepared_bid','confirm_prepared_bid','recover_bid_confirmation','commit_prepared_bid','lookup_bid_operation'].includes(body?.action)||body?.action==='submit_bid'&&
  ['contractVersion','requestId','bid','expectedUpdatedAt','sourceSignature'].some(k=>Object.hasOwn(body,k));
}
// Backend source DTO, not the frontend's sourceSignature format. Reuses master
// route/event data and invitation revision; excludes bearer secrets and fit answers.
export async function nativeBidSourceSignature(invitation){
 const input={invitationId:invitation.id,vendorId:invitation.vendor_id,updatedAt:invitation.updated_at,
  event:relation(invitation.rfx_events),lane:relation(invitation.rfx_lanes)};
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(input))));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
async function readOne(client,table,columns,filters){
 try{
  let q=client.from(table).select(columns);
  for(const [key,value]of filters)q=q.eq(key,value);
  const {data,error}=await q.maybeSingle();
  if(error)fail('NATIVE_BID_AUTHORITY_UNAVAILABLE',503);
  return data;
 }catch(e){if(e.code)throw e;fail('NATIVE_BID_AUTHORITY_UNAVAILABLE',503);}
}
async function resolveMember(client,request,readMembership){
 const match=/^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization')||'');
 if(!match)fail('NATIVE_BID_AUTH_REQUIRED',401);
 let user;
 try{const response=await client.auth.getUser(match[1]);if(response.error)fail('NATIVE_BID_AUTH_REQUIRED',401);user=response.data?.user;}
 catch{fail('NATIVE_BID_AUTH_REQUIRED',401);}
 if(!text(user?.id)||!user.email_confirmed_at||user.app_metadata?.provider!=='google')fail('NATIVE_BID_AUTH_REQUIRED',401);
 let bootstrap;
 try{const r=await readMembership(match[1]);if(r.error)fail('NATIVE_BID_AUTHORITY_UNAVAILABLE',503);bootstrap=r.data;}
 catch{fail('NATIVE_BID_AUTHORITY_UNAVAILABLE',503);}
 if(bootstrap?.contractVersion!=='loads-carrier-bootstrap.v1')fail('NATIVE_BID_AUTHORITY_UNAVAILABLE',503);
 if(!['active','workspace_not_found'].includes(bootstrap.status))fail('NATIVE_BID_FORBIDDEN',403);
 const m=bootstrap.membership;
 if(!m||m.status!=='active'||m.supabaseUserId!==user.id||!text(m.organizationId)||
   !['ADMIN','OPERATOR','VIEWER'].includes(m.role)||!text(m.ratewareVendorId))fail('NATIVE_BID_FORBIDDEN',403);
 return {actorId:user.id,organizationId:m.organizationId,vendorId:m.ratewareVendorId};
}
/** @param {{receiptEnabled?:boolean,enabled?:boolean,preparationEnabled?:boolean,writePreparation?:(client:any,member:any,command:any)=>Promise<any>,preparedReviewEnabled?:boolean,confirmationEnabled?:boolean,preparedCommitEnabled?:boolean,readPreparation?:(client:any,member:any,invitationId:string,requestId:string)=>Promise<any>,contextEnabled?:boolean,contextUtcOffset?:string,assistedOriginalReadEnabled?:boolean,readBoundOriginal?:(client:any,member:any,invitationId:string,requestId:string)=>Promise<any>,originalSourceEnabled?:boolean,verifyOriginalSource?:(client:any,member:any,invitation:any,command:any,reference:any)=>Promise<any>,origin?:string,getClient?:()=>any,getOperationClient?:(token:string)=>any,readMembership?:(token:string)=>Promise<any>,findInvitation?:(client:any,token:string)=>Promise<any>,findBookInvitation?:(client:any,root:any,invitationId:string)=>Promise<any>,normalizeBid?:(input:any,invitation:any)=>any,captureBid?:(invitation:any,payload:any)=>any,blockReason?:(invitation:any,event:any,language:any)=>any,clientFeeEnabled?:boolean,clientFeeAtomicEnabled?:boolean,readClientFeeContext?:(client:any,invitation:any)=>Promise<any>,now?:()=>number}} options */
export function createNativeBidHandler({receiptEnabled=false,enabled=false,preparationEnabled=false,writePreparation,preparedReviewEnabled=false,confirmationEnabled=false,preparedCommitEnabled=false,readPreparation,contextEnabled=false,contextUtcOffset='',assistedOriginalReadEnabled=false,readBoundOriginal,originalSourceEnabled=false,verifyOriginalSource,clientFeeEnabled=false,clientFeeAtomicEnabled=false,readClientFeeContext,origin='',getClient,getOperationClient,readMembership,findInvitation,findBookInvitation,normalizeBid,captureBid,blockReason,now=Date.now}={}){
 const clientFeeGate=createNativeClientFeeGate({enabled:clientFeeEnabled,readCurrentContext:readClientFeeContext,now});
 const feeBinding=createNativeClientFeeBinding({enabled:clientFeeAtomicEnabled});
 const feeReference=(member,body)=>({member,invitationId:body.invitationId,requestId:body.requestId});
 const verifySavedOriginal=async(client,member,invitation,record)=>{
  if(!record.originalSource)return;
  if(originalSourceEnabled!==true||typeof verifyOriginalSource!=='function')fail('BID_ORIGINAL_SOURCE_UNAVAILABLE',503);
  const proof=await verifyOriginalSource(client,structuredClone(member),invitation,{scope:structuredClone(record.intent.scope),requestId:record.requestId,
   preparation:true,rawUploadId:record.originalSource.rawUploadId,source:{sourceSignature:record.sourceSignature}},undefined);
  if(proof?.sourceSignature!==record.sourceSignature||!same(originalReferenceFromSource(proof),record.originalSource))fail('BID_ORIGINAL_SOURCE_CHANGED',409);
 };
 const feeCapture=async(client,member,body,resolved,record,payload)=>{
  if(clientFeeAtomicEnabled!==true)fail('NATIVE_BID_MODEL_SEMANTICS_UNVERIFIED',409);
  const inv=(await resolved.reauthorize('active')).invitation;
  if(await nativeBidSourceSignature(inv)!==record.sourceSignature)fail('NATIVE_BID_SOURCE_CHANGED',409);
  const proof=await clientFeeGate.check(client,inv,payload);
  let binding;try{binding=await feeBinding.read(client,feeReference(member,body),{active:true,proof});}
  finally{await resolved.reauthorize('active');}
  if(binding.state==='not_found')fail('BID_FEE_BINDING_REQUIRED',409);
  if(binding.state!=='sealed')fail('NATIVE_BID_CLIENT_FEE_UNAVAILABLE',503);
  const current=(await resolved.reauthorize('active')).invitation;
  if(await nativeBidSourceSignature(current)!==record.sourceSignature)fail('NATIVE_BID_SOURCE_CHANGED',409);
  if(!same(proof,await clientFeeGate.check(client,current,payload)))fail('NATIVE_BID_CLIENT_FEE_CHANGED',409);
  await resolved.reauthorize('active');
  // Reuse route/equipment capture; every economic field comes from the SQL seal.
  return {...captureBid(current,payload),...binding.capture,all_in_rate:String(binding.capture.all_in_rate)};
 };
 // A root token authorizes only already-delivered rows in its exact private RFx.
 // The callback reads by ID; it never hydrates, repairs or returns bearer tokens.
 const identity=row=>({id:row?.id,vendorId:row?.vendor_id,eventId:row?.rfx_event_id,laneId:row?.rfx_lane_id,owner:relation(row?.rfx_events)?.owner_email});
 const resolveTarget=async(client,request,body,member,mode='history',baseline)=>{
  const root=structuredClone(await findInvitation(client,body.token));
  const check=(row,expected)=>{
   const event=relation(row?.rfx_events),lane=relation(row?.rfx_lanes);
   if(!row||row.vendor_id!==member.vendorId||!text(row.id)||!text(event?.owner_email)||!text(event.id)||!text(lane?.id)||
    row.rfx_event_id!==event.id||row.rfx_lane_id!==lane.id||expected&&!same(identity(row),expected)||
    !['invited','viewed','responded','quoted','bid_submitted','awarded'].includes(row.invitation_status))fail('NATIVE_BID_FORBIDDEN',403);
   if(mode!=='history'&&(!activePrivateInvitation(row,{vendorId:member.vendorId,ownerEmail:event.owner_email},contextUtcOffset,now())||
    mode==='active'&&(event.status!=='open'||blockReason(row,event))))fail(mode==='context'?'NATIVE_BID_FORBIDDEN':'NATIVE_BID_WINDOW_CLOSED',mode==='context'?403:409);
  };
  check(root,baseline?.root);
  const scope={vendorId:member.vendorId,ownerEmail:relation(root.rfx_events).owner_email};
  const proofs=async rows=>{try{return await loadPrivateDeliveryEvidence(client,rows,scope,now());}catch{fail('NATIVE_BID_AUTHORITY_UNAVAILABLE',503);}};
  const rootEvidence=await proofs([root]);
  if(!rootEvidence.has(root.id))fail('NATIVE_BID_FORBIDDEN',403);
  let invitation=root;
  if(root.id!==body.invitationId){
   if(typeof findBookInvitation!=='function')fail('NATIVE_BID_FORBIDDEN',403);
   try{invitation=structuredClone(await findBookInvitation(client,structuredClone(root),body.invitationId));}catch{fail('NATIVE_BID_AUTHORITY_UNAVAILABLE',503);}
  }
  check(invitation,baseline?.target);
  if(invitation.id!==body.invitationId||invitation.vendor_id!==root.vendor_id||invitation.rfx_event_id!==root.rfx_event_id||
   relation(invitation.rfx_events).owner_email!==scope.ownerEmail)fail('NATIVE_BID_FORBIDDEN',403);
  let evidence=rootEvidence;
  if(invitation!==root){
   // Re-read the exact bearer root after the target lookup. A withdrawn or
   // replaced root cannot survive an asynchronous book read via its old snapshot.
   const currentRoot=structuredClone(await findInvitation(client,body.token));
   check(currentRoot,identity(root));
   evidence=await proofs([currentRoot,invitation]);
  }
  if(!evidence.has(root.id)||!evidence.has(invitation.id))fail('NATIVE_BID_FORBIDDEN',403);
  const binding={root:identity(root),target:identity(invitation)};
  const reauthorize=async(nextMode=mode)=>{
   const current=await resolveMember(client,request,readMembership);if(!same(current,member))fail('NATIVE_BID_FORBIDDEN',403);
   const resolved=await resolveTarget(client,request,body,member,nextMode,binding);
   const after=await resolveMember(client,request,readMembership);if(!same(after,member))fail('NATIVE_BID_FORBIDDEN',403);
   return resolved;
  };
  return {invitation,proof:evidence.get(invitation.id),reauthorize};
 };
 return Object.freeze({
 // Read-only assisted-original resolution. No preparation, consent or ledger write.
 async resolvePreparationOriginal(request,input){
  const response=(payload,status=200)=>new Response(JSON.stringify({contractVersion:'rateware.assisted-original.v1',
   commercialWrites:false,submissionEnabled:false,approvalRecorded:false,...payload}),{
   status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
  try{
   if(assistedOriginalReadEnabled!==true||originalSourceEnabled!==true||typeof readBoundOriginal!=='function'||typeof verifyOriginalSource!=='function')
    fail('NATIVE_BID_ORIGINAL_READER_DISABLED',503);
   const u=new URL(origin);
   if(u.origin!==origin||u.protocol!=='https:'||request.headers.get('origin')!==origin)fail('NATIVE_BID_ORIGIN_REJECTED',403);
   if(request.method!=='POST')fail('NATIVE_BID_METHOD_REJECTED',405);
   if(!exact(input,['action','contractVersion','token','invitationId','requestId'])||input.action!=='resolve_preparation_original'||
    input.contractVersion!=='rateware.native-bid.v1'||!text(input.invitationId)||typeof input.token!=='string'||!input.token.trim()||input.token.length>128||
    typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId))fail('NATIVE_BID_INVALID',400);
   const body=structuredClone(input),client=getClient(),member=await resolveMember(client,request,readMembership);
   const resolved=await resolveTarget(client,request,body,member,'active'),inv=resolved.invitation;
   const sourceSignature=await nativeBidSourceSignature(inv);
   const recheck=async()=>{const current=(await resolved.reauthorize('active')).invitation;
    if(await nativeBidSourceSignature(current)!==sourceSignature)fail('NATIVE_BID_SOURCE_CHANGED',409);return current;};
   const binding=structuredClone(await readBoundOriginal(client,structuredClone(member),inv.id,body.requestId));
   await recheck();
   if(binding===null)return response({invitationId:inv.id,requestId:body.requestId,state:'awaiting_operations',original:null});
   if(!validOriginalReference(binding))fail('BID_ORIGINAL_SOURCE_UNAVAILABLE',503);
   const original=await verifyOriginalSource(client,structuredClone(member),await recheck(),{
    scope:{ownerScope:relation(inv.rfx_events).owner_email,actorId:member.actorId,vendorId:member.vendorId,invitationId:inv.id},
    requestId:body.requestId,preparation:true,rawUploadId:binding.rawUploadId,source:{sourceSignature}},undefined);
   if(original?.kind!=='verified_raw_upload'||original.sourceSignature!==sourceSignature||
    original.rawUploadId!==binding.rawUploadId||!same(originalReferenceFromSource(original),binding)||
    Object.keys(original).length!==7)fail('BID_ORIGINAL_SOURCE_CHANGED',409);
   await recheck();
   // Final database read uses one stable MVCC snapshot for membership, binding,
   // immutable metadata and event window. No asynchronous work follows it.
   // Observation at the start of that SQL statement, not a lease or permission:
   // preparation independently repeats authorization and physical verification.
   if(!same(binding,await readBoundOriginal(client,structuredClone(member),inv.id,body.requestId)))fail('BID_ORIGINAL_SOURCE_CHANGED',409);
   return response({invitationId:inv.id,requestId:body.requestId,state:'verified',original});
  }catch(e){
   const known=new Set([...Object.keys(originalCodes),'NATIVE_BID_ORIGINAL_READER_DISABLED','NATIVE_BID_ORIGIN_REJECTED','NATIVE_BID_METHOD_REJECTED',
    'NATIVE_BID_INVALID','NATIVE_BID_AUTH_REQUIRED','NATIVE_BID_FORBIDDEN','NATIVE_BID_AUTHORITY_UNAVAILABLE','NATIVE_BID_WINDOW_CLOSED','NATIVE_BID_SOURCE_CHANGED']);
   const code=known.has(e.code)?e.code:'BID_ORIGINAL_SOURCE_UNAVAILABLE';
   return response({code},known.has(e.code)?e.status||originalCodes[code]||503:503);
  }
 },

 // Historical status only; no consent, preparation, quote or file writer.
 async lookupPrepared(request,input){
  let requestId=typeof input?.requestId==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)?input.requestId:null;
  const response=(payload,status=200)=>new Response(JSON.stringify({contractVersion:'rateware.native-bid-receipt.v1',commercialWrites:false,submissionEnabled:false,retrySubmission:false,
   requestId,state:'uncertain',confirmed:false,fingerprint:null,receipt:null,...payload}),{status,
   headers:{'Content-Type':'application/json','Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer'}});
  try{
   if(receiptEnabled!==true)fail('NATIVE_BID_RECEIPT_DISABLED',503);
   const allowed=new URL(origin);
   if(allowed.protocol!=='https:'||allowed.origin!==origin||request.headers.get('Origin')!==origin)fail('NATIVE_BID_ORIGIN_REJECTED',403);
   if(request.method!=='POST')fail('NATIVE_BID_METHOD_REJECTED',405);
   if(!exact(input,['action','contractVersion','token','invitationId','requestId'])||input.action!=='lookup_prepared_bid'||input.contractVersion!=='rateware.native-bid.v1'||
    !requestId||!text(input.invitationId)||typeof input.token!=='string'||!input.token.trim()||input.token.length>8192)fail('NATIVE_BID_INVALID',400);
   const body=structuredClone(input),client=getClient(),member=await resolveMember(client,request,readMembership);
   const resolved=await resolveTarget(client,request,body,member,'history');
   await resolved.reauthorize();
   let result;try{result=structuredClone(await client.rpc('rateware_lookup_prepared_bid_local_v1',{
    p_actor_id:member.actorId,p_organization_id:member.organizationId,p_invitation_id:resolved.invitation.id,p_request_id:body.requestId}));}catch{result=null;}
   // Even an error or malformed provider body is followed by authority recheck.
   await resolved.reauthorize();
   const refusal={BID_RECEIPT_FORBIDDEN:403,BID_RECEIPT_INVALID:400};
   if(result?.error?.code==='P0001'&&refusal[result.error.message])fail(result.error.message,refusal[result.error.message]);
   const data=result?.error?null:result?.data;
   if(!exact(data,['state','requestId','fingerprint','receipt',...(data?.originalSource!==undefined?['originalSource']:[])])||data.requestId!==body.requestId||
    data.originalSource!==undefined&&!validOriginalReference(data.originalSource))return response({},202);
   if(data.state==='not_found'&&data.fingerprint===null&&data.receipt===null&&data.originalSource===undefined)return response({state:'not_found'});
   if(!/^[a-f0-9]{64}$/.test(data.fingerprint||''))return response({},202);
   let bindingHistory={};
   if(clientFeeAtomicEnabled===true&&['prepared','recorded'].includes(data.state)){
    let binding;try{binding=await feeBinding.read(client,feeReference(member,body));}finally{await resolved.reauthorize();}
    bindingHistory={clientFeeBinding:{state:binding.state,historyOnly:true,executionAuthorized:false}};
    if(binding.state==='uncertain')return response({...bindingHistory},202);
   }
   const originalHistory=data.originalSource?{originalSource:data.originalSource}:{};
   if(data.state==='prepared'&&data.receipt===null)return response({state:'prepared',fingerprint:data.fingerprint,...originalHistory,...bindingHistory});
   if(data.state==='recorded'&&exact(data.receipt,['receiptId','stagingId','targetStatus',...(data.receipt?.originalSource!==undefined?['originalSource']:[])])&&
    text(data.receipt.receiptId)&&text(data.receipt.stagingId)&&data.receipt.targetStatus==='pending_review'&&
    (data.receipt.originalSource===undefined||validOriginalReference(data.receipt.originalSource))&&
    same(data.receipt.originalSource,data.originalSource))
    return response({state:'recorded',confirmed:true,fingerprint:data.fingerprint,receipt:data.receipt,...originalHistory,...bindingHistory});
   return response({},202);
  }catch(e){const known=new Set([...feeCodes,'NATIVE_BID_RECEIPT_DISABLED','NATIVE_BID_ORIGIN_REJECTED','NATIVE_BID_METHOD_REJECTED','NATIVE_BID_INVALID','NATIVE_BID_AUTH_REQUIRED','NATIVE_BID_AUTHORITY_UNAVAILABLE','NATIVE_BID_FORBIDDEN','BID_RECEIPT_FORBIDDEN','BID_RECEIPT_INVALID']);
   return response(known.has(e.code)?{code:e.code}:{},known.has(e.code)?e.status||503:202);}
 },
 // Independent preparation-only opt-in; never confers quote execution authority.
 async prepareBid(request,input){
  const response=(payload,status=200)=>new Response(JSON.stringify({contractVersion:'rateware.native-bid-preparation.v1',commercialWrites:false,submissionEnabled:false,retrySubmission:false,...payload}),{
   status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer'}});
  const prepCodes={BID_PREPARATION_INVALID:400,BID_PREPARATION_AUTHORITY_REQUIRED:403,BID_PREPARATION_CONFLICT:409,BID_PREPARATION_STALE:409,BID_PREPARATION_WINDOW_CLOSED:409,
   BID_ORIGINAL_SOURCE_CHANGED:409,BID_ORIGINAL_LINK_FORBIDDEN:403,BID_ORIGINAL_SOURCE_FORBIDDEN:403,BID_ORIGINAL_SOURCE_INVALID:400,
   BID_ORIGINAL_SOURCE_UNAVAILABLE:503,BID_ORIGINAL_SOURCE_HASH_MISMATCH:409,BID_ORIGINAL_SOURCE_SIZE_MISMATCH:409,BID_ORIGINAL_SOURCE_UNSUPPORTED:400};
  try{
   if(preparationEnabled!==true||typeof writePreparation!=='function')fail('NATIVE_BID_PREPARATION_DISABLED',503);
   const allowed=new URL(origin);
   if(allowed.protocol!=='https:'||allowed.origin!==origin||request.headers.get('Origin')!==origin)fail('NATIVE_BID_ORIGIN_REJECTED',403);
   if(request.method!=='POST')fail('NATIVE_BID_METHOD_REJECTED',405);
   if(!exact(input,['action','contractVersion','token','invitationId','requestId','bid',...(input?.originalSource!==undefined&&originalSourceEnabled===true?['originalSource']:[])])||input.action!=='prepare_native_bid'||input.contractVersion!=='rateware.native-bid.v1'||
    typeof input.token!=='string'||!input.token.trim()||input.token.length>8192||!text(input.invitationId)||
    typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)||!plain(input.bid)||
    Object.keys(input.bid).some(k=>!fields.has(k))||!text(input.bid.currency)||!text(input.bid.commercial_model))fail('NATIVE_BID_INVALID',400);
   try{if(new TextEncoder().encode(JSON.stringify(input)).length>64*1024)fail('NATIVE_BID_INVALID',400);}catch{fail('NATIVE_BID_INVALID',400);}
   if(input.originalSource!==undefined&&(!exact(input.originalSource,['rawUploadId'])||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.originalSource.rawUploadId||'')))fail('NATIVE_BID_INVALID',400);
   const body=structuredClone(input),client=getClient(),member=await resolveMember(client,request,readMembership);
   const resolved=await resolveTarget(client,request,body,member,'active');
   const invitation=resolved.invitation,event=relation(invitation?.rfx_events),lane=relation(invitation?.rfx_lanes);
   const scope={ownerScope:event?.owner_email,actorId:member.actorId,vendorId:member.vendorId,invitationId:body.invitationId};
   if(!invitation||invitation.id!==body.invitationId||invitation.vendor_id!==member.vendorId||!text(event?.owner_email)||!text(event.id)||!text(lane?.id)||
    invitation.rfx_event_id!==event.id||invitation.rfx_lane_id!==lane.id)fail('NATIVE_BID_FORBIDDEN',403);
   if(event.status!=='open'||!activePrivateInvitation(invitation,{vendorId:member.vendorId,ownerEmail:event.owner_email},contextUtcOffset,now())||blockReason(invitation,event))fail('NATIVE_BID_WINDOW_CLOSED',409);
   let payload;try{payload=normalizeBid({bid:structuredClone(body.bid)},invitation);}catch{fail('NATIVE_BID_INVALID',400);}
   const feeProof=payload?.commercial_model==='fee_plus'?await clientFeeGate.check(client,invitation,payload):null;
   if(!['cost_plus','brokerage','sell_share','fee_plus'].includes(payload?.commercial_model))fail('NATIVE_BID_INVALID',400);
   const percentage=body.bid[payload.commercial_model==='sell_share'?'carrier_share_pct':'marksman_margin_pct'];
   if(!feeProof&&(percentage==null||!['number','string'].includes(typeof percentage)||typeof percentage==='string'&&!percentage.trim()))fail('NATIVE_BID_INVALID',400);
   const intent=await createBidOperationIntent({scope,requestId:body.requestId,payload});
   const command={intent,expectedUpdatedAt:invitation.updated_at,source:{kind:'native_snapshot',sourceSignature:await nativeBidSourceSignature(invitation)}};
   const verifyPreparationOriginal=async(current)=>{
    if(typeof verifyOriginalSource!=='function')fail('BID_ORIGINAL_SOURCE_UNAVAILABLE',503);
    const proof=await verifyOriginalSource(client,structuredClone(member),current,{scope,requestId:body.requestId,preparation:true,
     rawUploadId:body.originalSource.rawUploadId,source:{sourceSignature:command.source.sourceSignature}},undefined);
    if(!originalReferenceFromSource(proof)||proof.rawUploadId!==body.originalSource.rawUploadId||proof.sourceSignature!==command.source.sourceSignature)fail('BID_ORIGINAL_SOURCE_CHANGED',409);
    return proof;
   };
   if(body.originalSource)command.source=await verifyPreparationOriginal(invitation);
   const reauthorize=async()=>{const current=(await resolved.reauthorize()).invitation;
    if(await nativeBidSourceSignature(current)!==command.source.sourceSignature)fail('NATIVE_BID_SOURCE_CHANGED',409);
    if(body.originalSource&&!same(command.source,await verifyPreparationOriginal(current)))fail('BID_ORIGINAL_SOURCE_CHANGED',409);
    if(feeProof&&!same(feeProof,await clientFeeGate.check(client,current,payload)))fail('NATIVE_BID_CLIENT_FEE_CHANGED',409);};
   await reauthorize();
   const operationClient=getOperationClient(/^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization'))[1]);
   let value,saveError;
   try{value=structuredClone(await writePreparation(operationClient,structuredClone(member),structuredClone(command)));}catch(e){saveError=e;}
   await reauthorize();
   if(saveError){if(prepCodes[saveError.code])fail(saveError.code,prepCodes[saveError.code]);return response({state:'uncertain',saved:false,requestId:body.requestId,preparation:null},202);}
   let record;try{record=await preparedRecord(value,scope,body.requestId);
    if(record.state==='not_found'||!same(record.intent,intent)||record.sourceSignature!==command.source.sourceSignature||
     !same(record.originalSource??null,originalReferenceFromSource(command.source))||Date.parse(record.expectedUpdatedAt)!==Date.parse(command.expectedUpdatedAt))throw Error();
   }catch{return response({state:'uncertain',saved:false,requestId:body.requestId,preparation:null},202);}
   // Source can change while metadata persistence waits. Withhold acknowledgement,
   // do not silently regenerate a key or claim that the save was rolled back.
   await reauthorize();
   if(feeProof&&clientFeeAtomicEnabled===true&&record.state==='prepared'){
    let seal;try{seal=await feeBinding.seal(client,feeReference(member,body),feeProof);}finally{await reauthorize();}
    if(seal.state!=='sealed')return response({state:'uncertain',saved:false,requestId:body.requestId,preparation:null},202);
   }
   return response({state:record.state,saved:true,requestId:body.requestId,preparation:record});
  }catch(e){const known=new Set([...Object.keys(prepCodes),...feeCodes,'NATIVE_BID_PREPARATION_DISABLED','NATIVE_BID_ORIGIN_REJECTED','NATIVE_BID_METHOD_REJECTED','NATIVE_BID_INVALID','NATIVE_BID_AUTH_REQUIRED','NATIVE_BID_AUTHORITY_UNAVAILABLE','NATIVE_BID_FORBIDDEN','NATIVE_BID_WINDOW_CLOSED','NATIVE_BID_SOURCE_CHANGED','NATIVE_BID_MODEL_SEMANTICS_UNVERIFIED']);
   const code=known.has(e.code)?e.code:'NATIVE_BID_PREPARATION_UNAVAILABLE';return response({code,saved:false},known.has(e.code)?e.status||prepCodes[code]||503:503);}
 },
 // Read-only carrier review projection. It is neither a consent ticket nor a
 // commercial approval; the caller must not use it as execution authority.
 async reviewPrepared(request,input){
  const response=(payload,status=200)=>new Response(JSON.stringify({contractVersion:'rateware.native-bid-review.v1',commercialWrites:false,submissionEnabled:false,approvalRecorded:false,...payload}),{
   status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer'}});
  try{
   if(preparedReviewEnabled!==true||typeof readPreparation!=='function')fail('NATIVE_BID_REVIEW_DISABLED',503);
   const allowed=new URL(origin);
   if(allowed.protocol!=='https:'||allowed.origin!==origin||request.headers.get('Origin')!==origin)fail('NATIVE_BID_ORIGIN_REJECTED',403);
   if(request.method!=='POST')fail('NATIVE_BID_METHOD_REJECTED',405);
   if(!exact(input,['action','contractVersion','token','invitationId','requestId'])||input.action!=='review_prepared_bid'||input.contractVersion!=='rateware.native-bid.v1'||
    typeof input.token!=='string'||!input.token.trim()||input.token.length>8192||!text(input.invitationId)||
    typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId))fail('NATIVE_BID_INVALID',400);
   const body=structuredClone(input),client=getClient(),member=await resolveMember(client,request,readMembership);
   const resolved=await resolveTarget(client,request,body,member);
   const invitation=resolved.invitation,event=relation(invitation?.rfx_events),lane=relation(invitation?.rfx_lanes);
   if(!invitation||invitation.id!==body.invitationId||invitation.vendor_id!==member.vendorId||!text(event?.owner_email)||
    !text(event.id)||!text(lane?.id)||invitation.rfx_event_id!==event.id||invitation.rfx_lane_id!==lane.id)fail('NATIVE_BID_FORBIDDEN',403);
   const operationClient=getOperationClient(/^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization'))[1]);
   let value;try{value=structuredClone(await readPreparation(operationClient,structuredClone(member),invitation.id,body.requestId));}
   catch{fail('NATIVE_BID_PREPARATION_UNAVAILABLE',503);}
   const record=await preparedRecord(value,{ownerScope:event.owner_email,actorId:member.actorId,vendorId:member.vendorId,invitationId:invitation.id},body.requestId);
   const reauthorize=async(mode='history')=>{const current=(await resolved.reauthorize(mode)).invitation;
    if(mode==='active'&&await nativeBidSourceSignature(current)!==record.sourceSignature)fail('NATIVE_BID_SOURCE_CHANGED',409);
    if(record.state==='prepared'&&record.originalSource){
     if(originalSourceEnabled!==true||typeof verifyOriginalSource!=='function')fail('BID_ORIGINAL_SOURCE_UNAVAILABLE',503);
     const proof=await verifyOriginalSource(client,structuredClone(member),current,{scope:record.intent.scope,requestId:body.requestId,preparation:true,
      rawUploadId:record.originalSource.rawUploadId,source:{sourceSignature:record.sourceSignature}},undefined);
     if(proof?.sourceSignature!==record.sourceSignature||!same(originalReferenceFromSource(proof),record.originalSource))fail('BID_ORIGINAL_SOURCE_CHANGED',409);
    }};
   await reauthorize();
   if(record.state==='not_found')return response({state:'not_found',review:null});
   if(record.state==='recorded')return response({state:'recorded',review:null,result:record.receipt});
   const current=(await resolved.reauthorize('active')).invitation,currentEvent=relation(current?.rfx_events);
   if(!current||current.id!==invitation.id||current.vendor_id!==member.vendorId)fail('NATIVE_BID_FORBIDDEN',403);
   if(currentEvent?.status!=='open'||!activePrivateInvitation(current,{vendorId:member.vendorId,ownerEmail:event.owner_email},contextUtcOffset,now())||blockReason(current,currentEvent))fail('NATIVE_BID_WINDOW_CLOSED',409);
   if(Date.parse(current.updated_at)!==Date.parse(record.expectedUpdatedAt)||await nativeBidSourceSignature(current)!==record.sourceSignature)fail('NATIVE_BID_SOURCE_CHANGED',409);
   let normalized;try{normalized=normalizeBid({bid:structuredClone(record.intent.payload)},current);}catch{fail('NATIVE_BID_PREPARATION_INVALID',409);}
   if(!same(normalized,record.intent.payload))fail('NATIVE_BID_PREPARATION_INVALID',409);
   const feeProof=normalized.commercial_model==='fee_plus'?await clientFeeGate.check(client,current,normalized):null;
   await reauthorize('active');
   if(feeProof){const fresh=(await resolved.reauthorize('active')).invitation;
    if(!same(feeProof,await clientFeeGate.check(client,fresh,normalized)))fail('NATIVE_BID_CLIENT_FEE_CHANGED',409);
    await reauthorize('active');}
   return response({state:'ready_to_review',review:{invitationId:invitation.id,requestId:body.requestId,payload:record.intent.payload,
    fingerprint:record.intent.fingerprint,sourceSignature:record.sourceSignature,expectedUpdatedAt:record.expectedUpdatedAt,
    ...(record.originalSource?{originalSource:record.originalSource}:{})}});
  }catch(e){const known=new Set([...feeCodes,'BID_ORIGINAL_SOURCE_UNAVAILABLE','BID_ORIGINAL_SOURCE_FORBIDDEN','BID_ORIGINAL_SOURCE_CHANGED','BID_ORIGINAL_SOURCE_HASH_MISMATCH','BID_ORIGINAL_SOURCE_SIZE_MISMATCH','BID_ORIGINAL_SOURCE_UNSUPPORTED','BID_ORIGINAL_SOURCE_INVALID','NATIVE_BID_REVIEW_DISABLED','NATIVE_BID_ORIGIN_REJECTED','NATIVE_BID_METHOD_REJECTED','NATIVE_BID_INVALID','NATIVE_BID_AUTH_REQUIRED','NATIVE_BID_AUTHORITY_UNAVAILABLE','NATIVE_BID_FORBIDDEN','NATIVE_BID_PREPARATION_UNAVAILABLE','NATIVE_BID_PREPARATION_INVALID','NATIVE_BID_WINDOW_CLOSED','NATIVE_BID_SOURCE_CHANGED','NATIVE_BID_MODEL_SEMANTICS_UNVERIFIED']);
   return response({code:known.has(e.code)?e.code:'NATIVE_BID_REVIEW_UNAVAILABLE'},known.has(e.code)?e.status||503:503);}
 },
 // Local candidate confirmation producer; the HTTP dispatcher remains default-off.
 // Browser fingerprints are preconditions, never an authority or capture source.
 async confirmPrepared(request,input){
  const historical=input?.action==='recover_bid_confirmation';
  const response=(payload,status=200)=>new Response(JSON.stringify({contractVersion:'rateware.bid-confirmation.v1',submissionEnabled:false,retrySubmission:false,
   ...(historical?{historyOnly:true,confirmationUsable:false}:{}),...payload}),{
   status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer'}});
  const dbCodes={...clientFeeBindingCodes,...originalCodes,BID_CONFIRMATION_INVALID:400,BID_CONFIRMATION_FORBIDDEN:403,BID_CONFIRMATION_CHANGED:409,BID_CONFIRMATION_CLOSED:409,BID_CONFIRMATION_REVOKED:403};
  try{
   if(confirmationEnabled!==true||!historical&&typeof readPreparation!=='function')fail('NATIVE_BID_CONFIRMATION_DISABLED',503);
   const allowed=new URL(origin);
   if(allowed.protocol!=='https:'||allowed.origin!==origin||request.headers.get('Origin')!==origin)fail('NATIVE_BID_ORIGIN_REJECTED',403);
   if(request.method!=='POST')fail('NATIVE_BID_METHOD_REJECTED',405);
   const inputKeys=['action','contractVersion','token','invitationId','requestId',...(historical?[]:['reviewedFingerprint','reviewedSourceSignature','reviewedUpdatedAt','termsVersion',...(input?.reviewedOriginalSource!==undefined?['reviewedOriginalSource']:[])])];
   if(!exact(input,inputKeys)||
    !['confirm_prepared_bid','recover_bid_confirmation'].includes(input.action)||input.contractVersion!=='rateware.native-bid.v1'||
    typeof input.token!=='string'||!input.token.trim()||input.token.length>8192||!text(input.invitationId)||
    typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)||
    !historical&&(!/^[a-f0-9]{64}$/.test(input.reviewedFingerprint||'')||!/^[a-f0-9]{64}$/.test(input.reviewedSourceSignature||'')||
    !text(input.reviewedUpdatedAt)||!Number.isFinite(Date.parse(input.reviewedUpdatedAt))||input.termsVersion!=='carrier-offer.v1'||
    input.reviewedOriginalSource!==undefined&&!validOriginalReference(input.reviewedOriginalSource)))fail('NATIVE_BID_INVALID',400);
   const body=structuredClone(input),client=getClient(),member=await resolveMember(client,request,readMembership);
   const resolved=await resolveTarget(client,request,body,member,historical?'history':'active');
   const invitation=resolved.invitation,event=relation(invitation?.rfx_events),lane=relation(invitation?.rfx_lanes);
   if(!invitation||invitation.id!==body.invitationId||invitation.vendor_id!==member.vendorId||!text(event?.owner_email)||
    !text(event.id)||!text(lane?.id)||invitation.rfx_event_id!==event.id||invitation.rfx_lane_id!==lane.id)fail('NATIVE_BID_FORBIDDEN',403);
   if(historical){
    if(!['invited','viewed','responded','quoted','bid_submitted','awarded'].includes(invitation.invitation_status))fail('NATIVE_BID_FORBIDDEN',403);
   }else if(event.status!=='open'||!activePrivateInvitation(invitation,{vendorId:member.vendorId,ownerEmail:event.owner_email},contextUtcOffset,now())||blockReason(invitation,event))fail('NATIVE_BID_WINDOW_CLOSED',409);
   if(historical){
    // Read the original authorization directly. Its source/window may have moved;
    // that cannot confer execution rights or erase the historical result.
    const reauthorize=()=>resolved.reauthorize();
    await reauthorize();
    let result;try{result=await client.rpc('rateware_recover_bid_confirmation_local_v1',{
     p_actor_id:member.actorId,p_organization_id:member.organizationId,p_invitation_id:invitation.id,p_request_id:body.requestId});}catch{result=null;}
    await reauthorize();
    if(result?.error?.code==='P0001'&&dbCodes[result.error.message])fail(result.error.message,dbCodes[result.error.message]);
    const data=result?.error?null:result?.data;
    if(exact(data,['state','requestId'])&&data.state==='not_found'&&data.requestId===body.requestId)return response({state:'not_found',confirmationRecorded:false,requestId:body.requestId});
    if(!exact(data,['state','requestId','fingerprint','termsVersion','confirmedAt','expiresAt',...(data?.originalSource!==undefined?['originalSource']:[])])||
     data.originalSource!==undefined&&!validOriginalReference(data.originalSource)||data.state!=='confirmed'||data.requestId!==body.requestId||
     !/^[a-f0-9]{64}$/.test(data.fingerprint||'')||data.termsVersion!=='carrier-offer.v1'||!Number.isFinite(Date.parse(data.confirmedAt))||
     Date.parse(data.confirmedAt)>now()||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=Date.parse(data.confirmedAt))
     return response({state:'uncertain',confirmationRecorded:false,requestId:body.requestId},202);
    return response({state:'confirmed',confirmationRecorded:true,confirmation:data});
   }
   const operationClient=getOperationClient(/^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization'))[1]);
   let value;try{value=structuredClone(await readPreparation(operationClient,structuredClone(member),invitation.id,body.requestId));}catch{fail('NATIVE_BID_PREPARATION_UNAVAILABLE',503);}
   const record=await preparedRecord(value,{ownerScope:event.owner_email,actorId:member.actorId,vendorId:member.vendorId,invitationId:invitation.id},body.requestId);
   if(record.state!=='prepared')fail('NATIVE_BID_PREPARATION_INVALID',409);
   if(record.originalSource&&originalSourceEnabled!==true)fail('NATIVE_BID_ORIGINAL_CONFIRMATION_PENDING',409);
   if(!same(body.reviewedOriginalSource??null,record.originalSource??null))fail('BID_CONFIRMATION_CHANGED',409);
   if(record.intent.fingerprint!==body.reviewedFingerprint||record.sourceSignature!==body.reviewedSourceSignature||
    Date.parse(record.expectedUpdatedAt)!==Date.parse(body.reviewedUpdatedAt)||Date.parse(invitation.updated_at)!==Date.parse(record.expectedUpdatedAt)||
    await nativeBidSourceSignature(invitation)!==record.sourceSignature)fail('NATIVE_BID_SOURCE_CHANGED',409);
   let payload;try{payload=normalizeBid({bid:structuredClone(record.intent.payload)},invitation);}catch{fail('NATIVE_BID_PREPARATION_INVALID',409);}
   if(!same(payload,record.intent.payload)||!['cost_plus','brokerage','sell_share','fee_plus'].includes(payload.commercial_model))fail('NATIVE_BID_PREPARATION_INVALID',409);
   if(payload.commercial_model==='fee_plus'&&clientFeeAtomicEnabled!==true)fail('NATIVE_BID_PREPARATION_INVALID',409);
   const capture=payload.commercial_model==='fee_plus'?await feeCapture(client,member,body,resolved,record,payload):captureBid(invitation,payload);
   const reauthorize=async()=>{const current=(await resolved.reauthorize()).invitation;
    if(await nativeBidSourceSignature(current)!==record.sourceSignature)fail('NATIVE_BID_SOURCE_CHANGED',409);};
   const parameters={p_mode:body.action==='confirm_prepared_bid'?'confirm':'recover',p_actor_id:member.actorId,p_organization_id:member.organizationId,
    p_invitation_id:invitation.id,p_request_id:body.requestId,p_fingerprint:record.intent.fingerprint,p_source_signature:record.sourceSignature,
    p_expected_updated_at:record.expectedUpdatedAt,p_capture:capture,p_review_source:{event,lane},
    p_financial_context:{client_fee_amount:invitation.client_fee_amount??null,commercial_rounding_increment:invitation.commercial_rounding_increment??null},p_terms_version:body.termsVersion,
    p_original_source:record.originalSource??null};
   await verifySavedOriginal(client,member,(await resolved.reauthorize('active')).invitation,record);
   await reauthorize();
   let result;try{result=await client.rpc('rateware_confirm_prepared_local_v1',parameters);}catch{result=null;}
   await reauthorize();
   if(result?.error?.code==='P0001'&&dbCodes[result.error.message])fail(result.error.message,dbCodes[result.error.message]);
   const data=result?.error?null:result?.data;
   if(exact(data,['state','requestId'])&&data.state==='not_found'&&data.requestId===body.requestId&&parameters.p_mode==='recover')return response({state:'not_found',confirmationRecorded:false,requestId:body.requestId});
   if(!exact(data,['state','requestId','fingerprint','termsVersion','confirmedAt','expiresAt',...(record.originalSource?['originalSource']:[])])||
    record.originalSource&&!validOriginalReference(data.originalSource)||!same(data.originalSource??null,record.originalSource??null)||data.state!=='confirmed'||data.requestId!==body.requestId||
    data.fingerprint!==record.intent.fingerprint||data.termsVersion!==body.termsVersion||!Number.isFinite(Date.parse(data.confirmedAt))||
    Date.parse(data.confirmedAt)>now()||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=now()||Date.parse(data.expiresAt)<=Date.parse(data.confirmedAt)){
    return response({state:'uncertain',confirmationRecorded:false,requestId:body.requestId},202);
   }
   return response({state:'confirmed',confirmationRecorded:true,confirmation:data});
  }catch(e){const known=new Set([...Object.keys(dbCodes),...feeCodes,'NATIVE_BID_ORIGINAL_CONFIRMATION_PENDING','NATIVE_BID_MODEL_SEMANTICS_UNVERIFIED','NATIVE_BID_CONFIRMATION_DISABLED','NATIVE_BID_ORIGIN_REJECTED','NATIVE_BID_METHOD_REJECTED','NATIVE_BID_INVALID','NATIVE_BID_AUTH_REQUIRED','NATIVE_BID_AUTHORITY_UNAVAILABLE','NATIVE_BID_FORBIDDEN','NATIVE_BID_WINDOW_CLOSED','NATIVE_BID_PREPARATION_UNAVAILABLE','NATIVE_BID_PREPARATION_INVALID','NATIVE_BID_SOURCE_CHANGED']);
   return response({code:known.has(e.code)?e.code:'NATIVE_BID_CONFIRMATION_UNAVAILABLE',confirmationRecorded:false},known.has(e.code)?e.status||503:503);}
 },
 // HTTP-style LOCAL module only. No entrypoint/env activation.
 async commitPrepared(request,input){
  const response=(payload,status=200)=>new Response(JSON.stringify({contractVersion:'rateware.native-bid.v1',retrySubmission:false,...payload}),{
   status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer'}});
  try{
   // Preserve the isolated legacy factory gate; the composed preparation +
   // confirmation opt-ins may independently authorize the new local commit gate.
   if((enabled!==true&&(preparationEnabled!==true||confirmationEnabled!==true))||preparedCommitEnabled!==true||typeof readPreparation!=='function')fail('NATIVE_BID_PREPARED_DISABLED',503);
   const allowed=new URL(origin);
   if(allowed.protocol!=='https:'||allowed.origin!==origin||request.headers.get('Origin')!==origin)fail('NATIVE_BID_ORIGIN_REJECTED',403);
   if(request.method!=='POST')fail('NATIVE_BID_METHOD_REJECTED',405);
   if(!exact(input,['action','contractVersion','token','invitationId','requestId'])||input.action!=='commit_prepared_bid'||input.contractVersion!=='rateware.native-bid.v1'||
    typeof input.token!=='string'||!input.token.trim()||input.token.length>8192||!text(input.invitationId)||
    typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId))fail('NATIVE_BID_INVALID',400);
   const body=structuredClone(input),client=getClient(),member=await resolveMember(client,request,readMembership);
   const resolved=await resolveTarget(client,request,body,member);
   const invitation=resolved.invitation,event=relation(invitation?.rfx_events),lane=relation(invitation?.rfx_lanes);
   if(!invitation||invitation.id!==body.invitationId||invitation.vendor_id!==member.vendorId||!text(event?.owner_email)||
    !text(event.id)||!text(lane?.id)||invitation.rfx_event_id!==event.id||invitation.rfx_lane_id!==lane.id)fail('NATIVE_BID_FORBIDDEN',403);
   const operationClient=getOperationClient(/^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization'))[1]);
   let value;try{value=structuredClone(await readPreparation(operationClient,structuredClone(member),invitation.id,body.requestId));}
   catch{fail('NATIVE_BID_PREPARATION_UNAVAILABLE',503);}
   const scope={ownerScope:event.owner_email,actorId:member.actorId,vendorId:member.vendorId,invitationId:invitation.id};
   const record=await preparedRecord(value,scope,body.requestId);
   const reauthorize=async(mode='history')=>{const current=(await resolved.reauthorize(mode)).invitation;
    if(mode==='active'&&await nativeBidSourceSignature(current)!==record.sourceSignature)fail('NATIVE_BID_SOURCE_CHANGED',409);};
   await reauthorize();
   if(record.state==='not_found')return response({state:'not_found',confirmed:false,requestId:body.requestId});
   if(record.state==='recorded')return response({state:'recorded',confirmed:true,requestId:body.requestId,result:record.receipt});
   if(record.originalSource&&originalSourceEnabled!==true)fail('NATIVE_BID_ORIGINAL_CONFIRMATION_PENDING',409);
   if(event.status!=='open'||!activePrivateInvitation(invitation,{vendorId:member.vendorId,ownerEmail:event.owner_email},contextUtcOffset,now())||blockReason(invitation,event))fail('NATIVE_BID_WINDOW_CLOSED',409);
   if(Date.parse(invitation.updated_at)!==Date.parse(record.expectedUpdatedAt)||await nativeBidSourceSignature(invitation)!==record.sourceSignature)fail('NATIVE_BID_SOURCE_CHANGED',409);
   let payload;try{payload=normalizeBid({bid:structuredClone(record.intent.payload)},invitation);}catch{fail('NATIVE_BID_PREPARATION_INVALID',409);}
   if(!same(payload,record.intent.payload))fail('NATIVE_BID_PREPARATION_INVALID',409);
   if(payload.commercial_model==='fee_plus'&&clientFeeAtomicEnabled!==true)fail('NATIVE_BID_MODEL_SEMANTICS_UNVERIFIED',409);
   const approval=await readOne(client,'rfx_bid_authorizations','enabled,approved_at,approved_by,expires_at,payload_fingerprint,normalized_payload,source_signature,expected_updated_at,original_source_ref',[
    ['organization_id',member.organizationId],['actor_id',member.actorId],['invitation_id',invitation.id],['request_id',body.requestId]]);
   if(!approval||approval.enabled!==true||!text(approval.approved_by)||!Number.isFinite(Date.parse(approval.approved_at))||Date.parse(approval.approved_at)>now()||
    !Number.isFinite(Date.parse(approval.expires_at))||Date.parse(approval.expires_at)<=now()||approval.payload_fingerprint!==record.intent.fingerprint||
    !same(approval.normalized_payload,payload)||approval.source_signature!==record.sourceSignature||Date.parse(approval.expected_updated_at)!==Date.parse(record.expectedUpdatedAt))fail('NATIVE_BID_APPROVAL_REQUIRED',403);
   if(record.originalSource&&!validOriginalReference(approval.original_source_ref)||
    !same(approval.original_source_ref,record.originalSource??null))fail('BID_ORIGINAL_SOURCE_CHANGED',409);
   const capture=payload.commercial_model==='fee_plus'?await feeCapture(client,member,body,resolved,record,payload):captureBid(invitation,payload);
   const command={scope,requestId:body.requestId,payload,expectedUpdatedAt:record.expectedUpdatedAt,
    source:record.originalSource?{kind:'verified_raw_upload',sourceSignature:record.sourceSignature,...record.originalSource}:{kind:'native_snapshot',sourceSignature:record.sourceSignature},capture};
   await verifySavedOriginal(client,member,(await resolved.reauthorize('active')).invitation,record);
   await reauthorize('active');
   const result=await commitAuthenticatedPreparedBidOperation(operationClient,command);
   await reauthorize();
   return response(result,result.state==='uncertain'?202:200);
  }catch(e){const known=new Set([...Object.keys(statusOf),...Object.keys(originalCodes),...feeCodes,'NATIVE_BID_ORIGINAL_CONFIRMATION_PENDING','NATIVE_BID_MODEL_SEMANTICS_UNVERIFIED','NATIVE_BID_PREPARED_DISABLED','NATIVE_BID_ORIGIN_REJECTED','NATIVE_BID_METHOD_REJECTED','NATIVE_BID_INVALID','NATIVE_BID_AUTH_REQUIRED','NATIVE_BID_AUTHORITY_UNAVAILABLE','NATIVE_BID_FORBIDDEN','NATIVE_BID_PREPARATION_UNAVAILABLE','NATIVE_BID_PREPARATION_INVALID','NATIVE_BID_WINDOW_CLOSED','NATIVE_BID_SOURCE_CHANGED','NATIVE_BID_APPROVAL_REQUIRED']);
   const code=known.has(e.code)?e.code:'NATIVE_BID_UNAVAILABLE';return response({code,confirmed:false},known.has(e.code)?e.status||statusOf[code]||originalCodes[code]||503:503);}
 },async context(request,input){
  const response=(body,status=200)=>new Response(JSON.stringify({contractVersion:'rateware.native-bid-context.v1',businessWrites:false,...body}),{
   status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer'}});
  try{
   if(contextEnabled!==true)fail('NATIVE_BID_CONTEXT_DISABLED',503);
   const allowed=new URL(origin);
   if(allowed.protocol!=='https:'||allowed.origin!==origin||request.headers.get('Origin')!==origin)fail('NATIVE_BID_ORIGIN_REJECTED',403);
   if(request.method!=='POST')fail('NATIVE_BID_METHOD_REJECTED',405);
   if(!plain(input)||Object.keys(input).some(k=>!['action','contractVersion','token','invitationId'].includes(k))||
     input.action!=='read_native_bid_context'||input.contractVersion!=='rateware.native-bid-context.v1'||!text(input.invitationId)||
     typeof input.token!=='string'||!input.token.trim()||input.token.length>8192)fail('NATIVE_BID_INVALID',400);
   const body=structuredClone(input),client=getClient(),before=await resolveMember(client,request,readMembership);
   const resolved=await resolveTarget(client,request,body,before,'context');
   const current=await resolved.reauthorize();
   const invitation=current.invitation;
   const event=relation(invitation?.rfx_events),lane=relation(invitation?.rfx_lanes);
   const scope={vendorId:before.vendorId,ownerEmail:event?.owner_email};
   if(!invitation||invitation.id!==body.invitationId||invitation.vendor_id!==before.vendorId||!text(event?.id)||!text(lane?.id)||
     invitation.rfx_event_id!==event.id||invitation.rfx_lane_id!==lane.id||!Number.isFinite(Date.parse(invitation.updated_at))||
     !activePrivateInvitation(invitation,scope,contextUtcOffset,now()))fail('NATIVE_BID_FORBIDDEN',403);
   const proof=current.proof;
   if(!proof)fail('NATIVE_BID_FORBIDDEN',403);
   const after=await resolveMember(client,request,readMembership);
   if(['actorId','vendorId','organizationId'].some(k=>before[k]!==after[k])||!activePrivateInvitation(invitation,scope,contextUtcOffset,now()))fail('NATIVE_BID_FORBIDDEN',403);
   const sourceSignature=await nativeBidSourceSignature(invitation),projection=privateInvitationProjection(invitation,proof,contextUtcOffset);
   // Same data categories as the existing private peek, without credential fields.
   const columns=['id','vendor_id','rfx_event_id','rfx_lane_id','invitation_status','updated_at','award_role','bid_rate','currency','weekly_capacity','transit_days','valid_through','notes','commercial_model','marksman_margin_pct','carrier_share_pct','best_alternative_offered','alternative_equipment','alternative_units','alternative_notes','equipment_available','current_unit_location','deadhead_distance','deadhead_unit','unit_details','eta_pickup','eta_delivery','mirror_account_enabled','availability_validation_status','responded_at'];
   const clean=Object.fromEntries(columns.filter(k=>Object.hasOwn(invitation,k)).map(k=>[k,invitation[k]]));
   const eventColumns=['id','owner_email','rfx_id','customer','status','due_date','operation_start_date','notes','rfx_master_package'];
   const laneColumns=['id','lane_number','origin','origin_city','destination','destination_city','trailer','equipment','operation','service','border_crossing','config','rfx_segment_key','rfx_segment_name','logistics_model','operation_criteria','business_rules','service_specifications','carrier_requirements','other_notes','notes'];
   clean.rfx_events=Object.fromEntries(eventColumns.filter(k=>Object.hasOwn(event,k)).map(k=>[k,event[k]]));
   clean.rfx_lanes=Object.fromEntries(laneColumns.filter(k=>Object.hasOwn(lane,k)).map(k=>[k,lane[k]]));
   clean.vendors={vendor_name:relation(invitation.vendors)?.vendor_name};clean.expires_at=projection.expires_at;clean.delivery_receipt=projection.delivery_receipt;
   return response({context:{...after,invitationId:invitation.id,eventId:event.id,laneId:lane.id,updatedAt:invitation.updated_at,sourceSignature,expiresAt:projection.expires_at,eventStatus:event.status},
    invitation:clean,delivery_evidence:PRIVATE_DELIVERY_CONTRACT});
  }catch(e){return response({code:e.code||'NATIVE_BID_CONTEXT_UNAVAILABLE'},e.status||503);}
 },async fetch(request,input){
  const response=(payload,status=200)=>new Response(JSON.stringify({contractVersion:'rateware.native-bid.v1',...payload}),{
   status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store, max-age=0'}});
  try{
   if(!enabled)fail('NATIVE_BID_DISABLED',503);
   const allowed=new URL(origin);
   if(allowed.protocol!=='https:'||allowed.origin!==origin||request.headers.get('Origin')!==origin)fail('NATIVE_BID_ORIGIN_REJECTED',403);
   if(request.method!=='POST')fail('NATIVE_BID_METHOD_REJECTED',405);
   if(!plain(input)||input.contractVersion!=='rateware.native-bid.v1'||
    !['submit_bid','lookup_bid_operation'].includes(input.action)||Object.keys(input).some(k=>!envelope.has(k))||
    typeof input.token!=='string'||!input.token.trim()||input.token.length>8192||
    typeof input.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)||
    typeof input.expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(input.expectedUpdatedAt))||!/^[a-f0-9]{64}$/.test(input.sourceSignature||'')||
    !plain(input.bid)||Object.keys(input.bid).some(k=>!fields.has(k)))fail('NATIVE_BID_INVALID',400);
   if(input.originalSource!==undefined&&(!plain(input.originalSource)||Object.keys(input.originalSource).length!==1||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.originalSource.rawUploadId||'')))fail('NATIVE_BID_INVALID',400);
   if(input.originalSource!==undefined&&!originalSourceEnabled)fail('NATIVE_BID_ORIGINAL_SOURCE_DISABLED',503);
   // Detach the whole command before any await; browser/caller cannot mutate it
   // while an authorization/source lookup is pending.
   const body=structuredClone(input),client=getClient();
   const member=await resolveMember(client,request,readMembership);
   const operationClient=getOperationClient(/^Bearer\s+(\S+)$/i.exec(request.headers.get('Authorization'))[1]);
   const invitation=await findInvitation(client,body.token);
   if(!invitation||invitation.vendor_id!==member.vendorId)fail('NATIVE_BID_FORBIDDEN',403);
   const event=relation(invitation.rfx_events);
   if(!text(event?.owner_email))fail('NATIVE_BID_SOURCE_INVALID',503);
   let payload;
   try{payload=normalizeBid(body,invitation);}catch{fail('NATIVE_BID_INVALID',400);}
   const command={scope:{ownerScope:event.owner_email,actorId:member.actorId,vendorId:member.vendorId,invitationId:invitation.id},
    requestId:body.requestId,payload,expectedUpdatedAt:body.expectedUpdatedAt,
    source:body.originalSource?{kind:'lookup_raw_upload',sourceSignature:body.sourceSignature,rawUploadId:body.originalSource.rawUploadId}:{kind:'native_snapshot',sourceSignature:body.sourceSignature}};
   const intent=await createBidOperationIntent(command);
   const prior=await lookupAuthenticatedBidOperation(operationClient,command);
   if(prior.confirmed&&prior.result.originalSource?.rawUploadId!==body.originalSource?.rawUploadId)fail('BID_ORIGINAL_SOURCE_CHANGED',409);
   if(body.action==='lookup_bid_operation'||prior.state!=='not_found')return response(prior,prior.state==='uncertain'?202:200);
   if(payload.commercial_model==='fee_plus')fail('NATIVE_BID_MODEL_SEMANTICS_UNVERIFIED',409);
   if(event.status!=='open'||blockReason(invitation,event,body.language))fail('NATIVE_BID_WINDOW_CLOSED',409);
   if(Date.parse(invitation.updated_at)!==Date.parse(body.expectedUpdatedAt)||
    await nativeBidSourceSignature(invitation)!==body.sourceSignature)fail('NATIVE_BID_SOURCE_CHANGED',409);
   // A proposal field/boolean does not confer authority. This is a server-managed,
   // per-command approval contract, proposed locally; no table/grants activated.
   const approval=await readOne(client,'rfx_bid_authorizations',
    'enabled,approved_at,approved_by,expires_at,payload_fingerprint,source_signature,expected_updated_at,original_source_ref',[
     ['organization_id',member.organizationId],['actor_id',member.actorId],['invitation_id',invitation.id],['request_id',body.requestId]]);
   if(!approval||approval.enabled!==true||!text(approval.approved_by)||!Number.isFinite(Date.parse(approval.approved_at))||
    Date.parse(approval.approved_at)>now()||!Number.isFinite(Date.parse(approval.expires_at))||Date.parse(approval.expires_at)<=now()||
    approval.payload_fingerprint!==intent.fingerprint||approval.source_signature!==body.sourceSignature||
    Date.parse(approval.expected_updated_at)!==Date.parse(body.expectedUpdatedAt))fail('NATIVE_BID_APPROVAL_REQUIRED',403);
   if(approval.original_source_ref?.rawUploadId!==body.originalSource?.rawUploadId)fail('BID_ORIGINAL_SOURCE_CHANGED',409);
   if(body.originalSource){
    if(typeof verifyOriginalSource!=='function')fail('NATIVE_BID_ORIGINAL_SOURCE_DISABLED',503);
    command.source=await verifyOriginalSource(client,member,invitation,command,approval.original_source_ref);
   }
   command.capture=captureBid(invitation,payload);
   const result=await submitAuthenticatedBidOperation(operationClient,command);
   return response(result,result.state==='uncertain'?202:200);
  }catch(e){const code=e.code||'NATIVE_BID_UNAVAILABLE';return response({code,confirmed:false},e.status||statusOf[code]||503);}
 }});
}
