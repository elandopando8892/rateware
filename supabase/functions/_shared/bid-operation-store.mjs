import { createBidOperationIntent, decideBidOperation } from './bid-operation-contract.mjs';
import {validateStoredBidPreparation,originalReferenceFromSource} from './bid-preparation-contract.mjs';

// Internal adapter for the LOCAL candidate RPC, not an authenticated HTTP API.
// The producer owns identity, commercial authorization, quote normalization,
// source validation and the frozen expected revision. No legacy fallback.
const rpc = 'rateware_bid_operation_local_v1';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const rejection = new Set(['BID_OPERATION_INVALID','BID_OPERATION_SCOPE_MISMATCH',
  'BID_OPERATION_CONFLICT','BID_OPERATION_WINDOW_CLOSED','BID_OPERATION_STALE',
  'BID_OPERATION_SOURCE_UNSUPPORTED','BID_OPERATION_CAPTURE_MISMATCH','BID_OPERATION_NO_ROW',
  'BID_OPERATION_IDENTITY_INVALID','BID_OPERATION_APPROVAL_REQUIRED','BID_OPERATION_SOURCE_CHANGED',
  'BID_ORIGINAL_SOURCE_CHANGED','BID_ORIGINAL_LINK_FORBIDDEN','BID_OPERATION_NOT_PREPARED','BID_OPERATION_TRANSITION_DISABLED',
  'BID_FEE_BINDING_REQUIRED','BID_FEE_AGREEMENT_REQUIRED','BID_FEE_AGREEMENT_CHANGED','BID_FEE_REVOKED','BID_FEE_CAPTURE_CHANGED','BID_FEE_PRECISION_UNVERIFIED']);

function parameters(intent, command, mode) {
  return {p_intent:intent,p_mode:mode,p_expected_updated_at:command.expectedUpdatedAt ?? null,
    p_capture:command.capture ?? null,p_source:command.source ?? null};
}
function outcome(intent, record) {
  if(record===null) return {state:'not_found',confirmed:false,requestId:intent.requestId};
  const decision=decideBidOperation(intent,record);
  if(!decision.confirmed) return {state:'uncertain',confirmed:false,requestId:intent.requestId};
  return {state:'recorded',confirmed:true,requestId:intent.requestId,result:decision.result};
}
async function lookup(client,intent,command,rpcName=rpc) {
  let response;
  try { response=await client.rpc(rpcName,parameters(intent,command,'lookup')); }
  catch { fail('BID_OPERATION_LOOKUP_FAILED'); }
  if(!response || response.error || response.data===undefined) fail('BID_OPERATION_LOOKUP_FAILED');
  return outcome(intent,response.data);
}
export async function lookupPreparedBidOperation(client,command) {
  return lookup(client,await createBidOperationIntent(command),command);
}
async function submit(client,command,rpcName) {
  // Clone/freeze boundary inputs before the await. The caller cannot mutate a
  // prepared revision/evidence while lookup is pending.
  const prepared=structuredClone(command);
  const intent=await createBidOperationIntent(prepared);
  const prior=await lookup(client,intent,prepared,rpcName);
  if(prior.state!=='not_found') return prior;
  let response;
  try { response=await client.rpc(rpcName,parameters(intent,prepared,'submit')); }
  catch { return {state:'uncertain',confirmed:false,requestId:intent.requestId}; }
  if(response?.error?.code==='P0001' && rejection.has(response.error.message)) fail(response.error.message);
  // HTTP/server failures and invalid responses may follow a successful commit.
  // Preserve requestId; only an explicit subsequent lookup resolves uncertainty.
  if(!response || response.error || response.data==null) return {state:'uncertain',confirmed:false,requestId:intent.requestId};
  try { return outcome(intent,response.data); }
  catch { return {state:'uncertain',confirmed:false,requestId:intent.requestId}; }
}
export async function submitPreparedBidOperation(client,command){return submit(client,command,rpc);}
// User JWT required by the v2 DB boundary; no service-role fallback.
export async function lookupAuthenticatedBidOperation(client,command){return lookup(client,await createBidOperationIntent(command),command,'rateware_bid_operation_local_v2');}
export async function submitAuthenticatedBidOperation(client,command){return submit(client,command,'rateware_bid_operation_local_v2');}
// Explicit LOCAL transition. The RPC itself checks/replays the prepared key
// atomically; ordinary pre-lookup rejects prepared rows, so do not call submit().
// One attempt only. Unknown acknowledgement requires explicit recovery, not retry.
export async function commitAuthenticatedPreparedBidOperation(client,command){
 const prepared=structuredClone(command),intent=await createBidOperationIntent(prepared);
 const uncertain=()=>({state:'uncertain',confirmed:false,requestId:intent.requestId});
 let response;
 try{response=await client.rpc('rateware_bid_operation_local_v2',parameters(intent,prepared,'commit_prepared'));}
 catch{return uncertain();}
 if(response?.error?.code==='P0001'&&rejection.has(response.error.message))fail(response.error.message);
 if(!response||response.error||response.data==null)return uncertain();
 try{
  const expectedOriginal=originalReferenceFromSource(prepared.source);
  if(!same(response.data.result?.originalSource??null,expectedOriginal))return uncertain();
  return outcome(intent,response.data);
 }catch{return uncertain();}
}

// Explicit LOCAL preparation bridge. The caller supplies its already user-bound
// client; SQL derives identity/organization itself. Never switch client/schema.
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const canonical=v=>Array.isArray(v)?v.map(canonical):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const prepRefusals=new Set(['BID_PREPARATION_INVALID','BID_PREPARATION_AUTHORITY_REQUIRED','BID_PREPARATION_CONFLICT','BID_PREPARATION_STALE','BID_PREPARATION_WINDOW_CLOSED','BID_ORIGINAL_SOURCE_CHANGED','BID_ORIGINAL_LINK_FORBIDDEN']);
function preparationMember(value){
 if(!exact(value,['actorId','vendorId','organizationId'])||!uuid(value.actorId)||!uuid(value.vendorId)||
  typeof value.organizationId!=='string'||!value.organizationId.trim()||value.organizationId.length>256)fail('BID_PREPARATION_AUTHORITY_REQUIRED');
 return structuredClone(value);
}
function preparationReference(id,key){if(!uuid(id)||typeof key!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(key))fail('BID_PREPARATION_INVALID');}
export async function writeAuthenticatedBidPreparation(client,member,command){
 const identity=preparationMember(member);let c;
 try{c=structuredClone(command);if(!exact(c,['intent','expectedUpdatedAt','source'])||
  new TextEncoder().encode(JSON.stringify(c)).length>64*1024||!Number.isFinite(Date.parse(c.expectedUpdatedAt))||
  !(exact(c.source,['kind','sourceSignature'])&&c.source.kind==='native_snapshot'||originalReferenceFromSource(c.source))||!/^[a-f0-9]{64}$/.test(c.source.sourceSignature||''))fail('BID_PREPARATION_INVALID');}
 catch{fail('BID_PREPARATION_INVALID');}
 if(c.intent?.scope?.actorId!==identity.actorId||c.intent?.scope?.vendorId!==identity.vendorId)fail('BID_PREPARATION_AUTHORITY_REQUIRED');
 preparationReference(c.intent.scope.invitationId,c.intent.requestId);
 let verified;try{verified=await createBidOperationIntent({scope:c.intent.scope,requestId:c.intent.requestId,payload:c.intent.payload});}catch{fail('BID_PREPARATION_INVALID');}
 if(!same(verified,c.intent))fail('BID_PREPARATION_INVALID');
 let r;try{r=await client.rpc('rateware_bid_preparation_local_v1',{p_mode:'prepare',p_invitation_id:c.intent.scope.invitationId,p_request_id:c.intent.requestId,
  p_intent:c.intent,p_expected_updated_at:c.expectedUpdatedAt,p_source:c.source});}catch{fail('BID_PREPARATION_WRITE_UNCERTAIN');}
 if(r?.error?.code==='P0001'&&prepRefusals.has(r.error.message))fail(r.error.message);
 if(!r||r.error||r.data==null)fail('BID_PREPARATION_WRITE_UNCERTAIN');
 try{const saved=structuredClone(r.data);await validateStoredBidPreparation(saved,c.intent.scope,c.intent.requestId);
  if(saved.state==='not_found'||!same(saved.intent,c.intent)||saved.sourceSignature!==c.source.sourceSignature||
   !same(saved.originalSource??null,originalReferenceFromSource(c.source))||Date.parse(saved.expectedUpdatedAt)!==Date.parse(c.expectedUpdatedAt))throw Error();return saved;}
 catch{fail('BID_PREPARATION_WRITE_UNCERTAIN');}
}
export async function readAuthenticatedBidPreparation(client,member,invitationId,requestId){
 const identity=preparationMember(member);preparationReference(invitationId,requestId);
 try{const r=await client.rpc('rateware_bid_preparation_local_v1',{p_mode:'recover',p_invitation_id:invitationId,p_request_id:requestId,p_intent:null,p_expected_updated_at:null,p_source:null});
  if(!r||r.error||r.data==null)throw Error();const saved=structuredClone(r.data);
  // ownerScope is derived in SQL; handler separately checks it against the live
  // invitation. Bind actor/vendor/root here without trusting a caller-owned DTO.
  await validateStoredBidPreparation(saved,{ownerScope:saved?.intent?.scope?.ownerScope,actorId:identity.actorId,vendorId:identity.vendorId,invitationId},requestId);
  return saved;
 }catch{fail('BID_PREPARATION_READ_FAILED');}
}
