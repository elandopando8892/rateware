// Quote-only protocol primitives. Not imported by a live handler. A trusted
// producer must derive/authorize scope, validate its offer, and atomically store
// offer + staging + audit + receipt before returning a recorded result.
const fields=new Set(['bid_rate','currency','weekly_capacity','transit_days','valid_through',
 'commercial_model','marksman_margin_pct','carrier_share_pct','best_alternative_offered',
 'alternative_equipment','alternative_units','alternative_notes','equipment_available',
 'current_unit_location','deadhead_distance','deadhead_unit','unit_details','eta_pickup',
 'eta_delivery','mirror_account_enabled','notes','best_final']);
const scopeFields=['ownerScope','vendorId','invitationId','actorId'];
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&!!v.trim()&&v.length<=256;
const fail=(code,status=400)=>{throw Object.assign(new Error(code),{code,status});};
const canonical=v=>Array.isArray(v)?v.map(canonical):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const encode=v=>JSON.stringify(canonical(v));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
async function digest(v){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(encode(v)));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}

export async function createBidOperationIntent({scope,requestId,payload}={}){
 if(!plain(scope)||Object.keys(scope).some(k=>!scopeFields.includes(k))||scopeFields.some(k=>!text(scope[k]))||
    typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)||!plain(payload)||!Object.keys(payload).length||
    Object.keys(payload).some(k=>!fields.has(k))||Object.values(payload).some(v=>v!==null&&
      (!['string','boolean','number'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v))))fail('BID_OPERATION_INVALID');
 const normalizedScope=Object.fromEntries(scopeFields.map(k=>[k,scope[k].trim()]));
 const normalizedPayload=structuredClone(payload);
 return freeze({contractVersion:'rateware.bid-operation-intent.v1',action:'submit_bid',requestId,
  scope:normalizedScope,payload:normalizedPayload,
  operationKey:await digest([normalizedScope.ownerScope,normalizedScope.vendorId,normalizedScope.invitationId,requestId]),
  fingerprint:await digest({scope:normalizedScope,payload:normalizedPayload}),externalExecution:false});
}

export function decideBidOperation(intent,stored){
 if(!plain(intent)||intent.contractVersion!=='rateware.bid-operation-intent.v1'||!plain(intent.scope)||
    !/^[a-f0-9]{64}$/.test(intent.operationKey||'')||!/^[a-f0-9]{64}$/.test(intent.fingerprint||''))fail('BID_OPERATION_INVALID');
 // A decision is not authorization or a DB claim; start is not confirmation.
 if(stored===null)return {decision:'start',execute:true,confirmed:false};
 if(!plain(stored)||scopeFields.some(k=>stored.scope?.[k]!==intent.scope[k]))fail('BID_OPERATION_SCOPE_MISMATCH',403);
 if(stored.operationKey!==intent.operationKey||stored.requestId!==intent.requestId||stored.fingerprint!==intent.fingerprint)fail('BID_OPERATION_CONFLICT',409);
 if(['claimed','uncertain'].includes(stored.state))return {decision:'lookup',execute:false,confirmed:false};
 const r=stored.result;
 if(stored.state!=='recorded'||!plain(r)||!text(r.receiptId)||!text(r.stagingId)||r.targetStatus!=='pending_review')fail('BID_OPERATION_RECEIPT_INVALID',503);
 const original=r.originalSource;
 if(original!==undefined&&(!plain(original)||Object.keys(original).length!==5||
  !['rawUploadId','objectId'].every(k=>typeof original[k]==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(original[k]))||
  !/^[a-f0-9]{64}$/.test(original.sha256||'')||!text(original.objectVersion)||!Number.isSafeInteger(original.sizeBytes)||original.sizeBytes<=0))fail('BID_OPERATION_RECEIPT_INVALID',503);
 return {decision:'replay',execute:false,confirmed:true,
  result:{receiptId:r.receiptId,stagingId:r.stagingId,targetStatus:r.targetStatus,...(original?{originalSource:{rawUploadId:original.rawUploadId,objectId:original.objectId,objectVersion:original.objectVersion,sha256:original.sha256,sizeBytes:original.sizeBytes}}:{})}};
}
