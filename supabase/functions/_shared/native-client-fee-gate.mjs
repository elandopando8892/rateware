import {clientFeeAcceptanceKey,validateClientFeeAcceptanceRecord} from './client-fee-acceptance.mjs';
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9@._:-]{1,160}$/.test(v);
const instant=v=>typeof v==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const fail=(code,status=409)=>{throw Object.assign(Error(code),{code,status});};
const proposalKeys=['id','ownerScope','organizationId','shipperId','rfxId','laneId','revision','model','currency','basis','value','termsFingerprint','validUntil'];
// Preparation/review only. A trusted server reader MUST resolve the broker's
// workspace, current terms, verified original and authoritative revocation.
// Carrier JWT/DTO/cache cannot supply this context. No reader is enabled here.
export function createNativeClientFeeGate({enabled=false,readCurrentContext,now=Date.now}={}){
 let lastTick=-Infinity;
 const time=()=>{const t=now();if(!Number.isFinite(t)||!Number.isFinite(new Date(t).getTime())||t<lastTick)fail('NATIVE_BID_CLIENT_FEE_UNAVAILABLE',503);lastTick=t;return t;};
 return Object.freeze({async check(client,invitation,payload){
  if(enabled!==true||typeof readCurrentContext!=='function')fail('NATIVE_BID_MODEL_SEMANTICS_UNVERIFIED');
  time();let inv,bid,context;
  try{inv=structuredClone(invitation);bid=structuredClone(payload);context=structuredClone(await readCurrentContext(client,structuredClone(inv)));}
  catch{fail('NATIVE_BID_CLIENT_FEE_UNAVAILABLE',503);}
  const tick=time();
  if(!exact(context,['proposal','record','evidence','revocation']))fail('NATIVE_BID_CLIENT_FEE_REQUIRED');
  const {proposal:p,record:r,evidence:e,revocation:v}=context;
  const event=Array.isArray(inv?.rfx_events)?inv.rfx_events[0]:inv?.rfx_events;
  if(!exact(p,proposalKeys)||!proposalKeys.slice(0,7).every(k=>id(p[k]))||!hex(p.termsFingerprint)||
   p.id!==inv.id||p.ownerScope!==event?.owner_email||p.rfxId!==inv.rfx_event_id||p.rfxId!==event?.id||p.laneId!==inv.rfx_lane_id||
   p.model!=='fee_plus'||inv.commercial_model!=='fee_plus'||bid?.commercial_model!=='fee_plus'||bid.currency!==p.currency||
   !['USD','MXN','CAD'].includes(p.currency)||!instant(p.validUntil)||Date.parse(p.validUntil)<=tick||
   typeof bid.bid_rate!=='number'||!Number.isFinite(bid.bid_rate)||bid.bid_rate<=0||
   typeof p.value!=='number'||!Number.isFinite(p.value)||p.value<0||p.value>1e9)fail('NATIVE_BID_CLIENT_FEE_REQUIRED');
  const amount=inv.client_fee_amount;
  const numeric=v=>typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&/^\d+(\.\d+)?$/.test(v);
  if(amount!==null&&amount!==undefined){
   if(!numeric(amount)||p.basis!=='fixed_amount'||Number(amount)!==p.value)fail('NATIVE_BID_CLIENT_FEE_REQUIRED');
  }else if(p.basis!=='percentage_of_carrier_rate'||p.value>100||!numeric(inv.marksman_margin_pct)||
   Number(inv.marksman_margin_pct)!==p.value||typeof bid.marksman_margin_pct!=='number'||bid.marksman_margin_pct!==p.value)fail('NATIVE_BID_CLIENT_FEE_REQUIRED');
  const key=clientFeeAcceptanceKey(p);
  try{validateClientFeeAcceptanceRecord(r,{p,key},()=>tick);}
  catch{fail('NATIVE_BID_CLIENT_FEE_REQUIRED');}
  if(Date.parse(r.verifiedAt)>=Date.parse(p.validUntil)||!exact(e,['id','ownerScope','organizationId','shipperId','termsFingerprint','sourceType','sourceDigest','sourceVersion','customerContactId','customerAcceptedAt','sourceVerified'])||
   e.id!==r.evidence.id||e.ownerScope!==p.ownerScope||e.organizationId!==p.organizationId||e.shipperId!==p.shipperId||e.termsFingerprint!==p.termsFingerprint||
   e.sourceType!==r.evidence.sourceType||e.sourceDigest!==r.evidence.sourceDigest||e.sourceVersion!==r.evidence.sourceVersion||e.sourceVerified!==true||
   e.customerContactId!==r.customerContactId||!instant(e.customerAcceptedAt)||Date.parse(e.customerAcceptedAt)!==Date.parse(r.customerAcceptedAt))fail('NATIVE_BID_CLIENT_FEE_REQUIRED');
  // Null/unknown is NOT no revocation. No automatic fallback to record.state.
  if(!exact(v,['acceptanceId','revision','revoked','checkedAt'])||v.acceptanceId!==key||!hex(v.revision)||v.revoked!==false||
   !instant(v.checkedAt)||Date.parse(v.checkedAt)>tick||tick-Date.parse(v.checkedAt)>30000)fail('NATIVE_BID_CLIENT_FEE_REQUIRED');
  return Object.freeze({acceptanceId:key,termsFingerprint:p.termsFingerprint,sourceVersion:e.sourceVersion,validUntil:p.validUntil,revocationRevision:v.revision});
 }});
}
