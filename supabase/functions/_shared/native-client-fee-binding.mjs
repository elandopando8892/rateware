// Server-only adapter. Identity and agreement proof come from the native handler,
// never a carrier DTO. Unknown acknowledgements require an explicit history read.
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export const clientFeeBindingCodes=Object.freeze({BID_FEE_SEAL_FORBIDDEN:403,BID_FEE_BINDING_REQUIRED:409,BID_FEE_BINDING_CONFLICT:409,
 BID_FEE_AGREEMENT_REQUIRED:409,BID_FEE_AGREEMENT_CHANGED:409,BID_FEE_REVOKED:409,BID_FEE_CAPTURE_CHANGED:409,BID_FEE_PRECISION_UNVERIFIED:409});
const fail=(code,status=503)=>{throw Object.assign(Error(code),{code,status});};
const uncertain=()=>({state:'uncertain'});
const captureKeys=['carrier_cost_rate','customer_board_rate','commission_pct','commission_fee','markup_fee','markup_pct','all_in_rate','currency','commercial_model'];
function validCapture(c){return exact(c,captureKeys)&&captureKeys.slice(0,7).every(k=>typeof c[k]==='number'&&Number.isFinite(c[k])&&c[k]>=0)&&
 c.carrier_cost_rate>0&&c.carrier_cost_rate<=1e9&&c.all_in_rate===c.carrier_cost_rate&&c.commission_pct===0&&c.commission_fee===0&&
 c.customer_board_rate>=c.carrier_cost_rate&&['USD','MXN','CAD'].includes(c.currency)&&c.commercial_model==='fee_plus';}
export function createNativeClientFeeBinding({enabled=false}={}){
 function parameters(ref){
  if(enabled!==true)fail('NATIVE_BID_MODEL_SEMANTICS_UNVERIFIED',409);
  const r=structuredClone(ref);
  if(!uuid(r?.member?.actorId)||typeof r.member.organizationId!=='string'||!r.member.organizationId.trim()||r.member.organizationId.length>256||
   !uuid(r.invitationId)||typeof r.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(r.requestId))fail('NATIVE_BID_INVALID',400);
  return {p_actor:r.member.actorId,p_carrier_org:r.member.organizationId,p_invitation:r.invitationId,p_request:r.requestId};
 }
 async function rpc(client,name,args){
  let r;try{r=structuredClone(await client.rpc(name,args));}catch{return null;}
  if(r?.error?.code==='P0001'&&Object.hasOwn(clientFeeBindingCodes,r.error.message))fail(r.error.message,clientFeeBindingCodes[r.error.message]);
  return r?.error?null:r?.data;
 }
 return Object.freeze({
  async seal(client,ref,proof){
   const args=parameters(ref),p=structuredClone(proof);
   if(!p||!['acceptanceId','termsFingerprint','sourceVersion'].every(k=>hex(p[k])))fail('NATIVE_BID_CLIENT_FEE_REQUIRED',409);
   const d=await rpc(client,'rateware_client_fee_seal_local_v1',{...args,p_acceptance:p.acceptanceId,p_terms:p.termsFingerprint,p_version:p.sourceVersion});
   return exact(d,['state','operationId','capture'])&&d.state==='sealed'&&uuid(d.operationId)&&validCapture(d.capture)?d:uncertain();
  },
  async read(client,ref,{active=false,proof}={}){
   const args=parameters(ref),p=proof?structuredClone(proof):null;
   const d=await rpc(client,'rateware_client_fee_binding_read_local_v1',{...args,p_mode:active?'active':'history'});
   if(exact(d,['state'])&&d.state==='not_found')return d;
   if(!exact(d,['state','operationId','acceptanceId','termsFingerprint','sourceVersion','capture','historyOnly'])||d.state!=='sealed'||!uuid(d.operationId)||
    !['acceptanceId','termsFingerprint','sourceVersion'].every(k=>hex(d[k]))||d.historyOnly!==!active||
    (active?!validCapture(d.capture):d.capture!==null))return uncertain();
   if(active&&(!p||!['acceptanceId','termsFingerprint','sourceVersion'].every(k=>p[k]===d[k])))fail('NATIVE_BID_CLIENT_FEE_CHANGED',409);
   return d;
  }
 });
}
