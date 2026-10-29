import {createHash} from 'node:crypto';
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const fail=code=>{throw Object.assign(Error(code),{code});};
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9@._:-]{1,160}$/.test(v);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const instant=v=>typeof v==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const canon=v=>Array.isArray(v)?v.map(canon):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const digest=v=>createHash('sha256').update(JSON.stringify(canon(v))).digest('hex');
export const clientFeeAcceptanceKey=p=>digest([p.ownerScope,p.organizationId,p.shipperId,p.rfxId,p.laneId,p.id,p.revision,p.termsFingerprint]);
export function validateClientFeeAcceptanceRecord(r,c,time=Date.now){
 if(!exact(r,recordKeys)||r.contractVersion!=='rateware.client-fee-record.v1'||r.id!==c.key||r.state!=='accepted'||
  !exact(r.scope,['ownerScope','organizationId','shipperId','rfxId','laneId','proposalId','revision'])||
  r.scope.proposalId!==c.p.id||['ownerScope','organizationId','shipperId','rfxId','laneId','revision'].some(k=>r.scope[k]!==c.p[k])||
  !exact(r.terms,['model','currency','basis','value','validUntil'])||Object.keys(r.terms).some(k=>r.terms[k]!==c.p[k])||r.termsFingerprint!==c.p.termsFingerprint||
  r.terms.model!=='fee_plus'||!['USD','MXN','CAD'].includes(r.terms.currency)||!['fixed_amount','percentage_of_carrier_rate'].includes(r.terms.basis)||
  typeof r.terms.value!=='number'||!Number.isFinite(r.terms.value)||r.terms.value<0||r.terms.value>1e9||r.terms.basis==='percentage_of_carrier_rate'&&r.terms.value>100||!instant(r.terms.validUntil)||
  !exact(r.evidence,['id','sourceType','sourceDigest','sourceVersion'])||!id(r.evidence.id)||!['email','document'].includes(r.evidence.sourceType)||
  !hex(r.evidence.sourceDigest)||!id(r.evidence.sourceVersion)||!id(r.customerContactId)||!id(r.verifiedBy)||
  !instant(r.customerAcceptedAt)||!instant(r.verifiedAt)||Date.parse(r.customerAcceptedAt)>Date.parse(r.verifiedAt)||Date.parse(r.verifiedAt)>time())
  fail('CLIENT_FEE_ACCEPTANCE_RECORD_INVALID');
}
const clone=v=>{try{if(JSON.stringify(v).length>128*1024)throw Error();return structuredClone(v);}catch{fail('CLIENT_FEE_ACCEPTANCE_INVALID');}};
const proposalKeys=['id','ownerScope','organizationId','shipperId','rfxId','laneId','revision','model','currency','basis','value','termsFingerprint','validUntil'];
const evidenceKeys=['id','ownerScope','organizationId','shipperId','termsFingerprint','sourceType','sourceDigest','sourceVersion','customerContactId','customerAcceptedAt','sourceVerified'];
const recordKeys=['contractVersion','id','state','scope','terms','termsFingerprint','evidence','customerContactId','customerAcceptedAt','verifiedBy','verifiedAt'];
// LOCAL, DEFAULT OFF. Trusted callbacks must derive staff identity, proposal,
// customer/contact and verified evidence from Rateware, never the carrier DTO.
// Storage must atomically insert/replay by id, preserving audit and evidence;
// an ordinary read-then-write/upsert is NOT an implementation of that contract.
// Composed by the default-off HTTP/native flows; never grants billing authority.
/**
 * Callback payloads are deliberately unknown until the runtime validators run.
 * @param {{enabled?: boolean, resolvePrincipal?: () => Promise<unknown>,
 * readProposal?: (id: string, actor: object) => Promise<unknown>,
 * readEvidence?: (id: string, actor: object) => Promise<unknown>,
 * readAcceptance?: (id: string, actor: object) => Promise<unknown>,
 * writeAcceptance?: (record: object, actor: object) => Promise<unknown>,
 * now?: () => number}} [options]
 */
export function createClientFeeAcceptanceService({enabled=false,resolvePrincipal,readProposal,readEvidence,readAcceptance,writeAcceptance,now=Date.now}={}){
 let lastTick=-Infinity;
 const time=()=>{const tick=now();if(!Number.isFinite(tick)||!Number.isFinite(new Date(tick).getTime())||tick<lastTick)fail('CLIENT_FEE_ACCEPTANCE_CLOCK_INVALID');lastTick=tick;return tick;};
 const configured=()=>enabled===true&&[resolvePrincipal,readProposal,readEvidence,readAcceptance,writeAcceptance,now].every(f=>typeof f==='function');
 const reply=(state,record=null)=>({contractVersion:'rateware.client-fee-acceptance.v1',state,record:record?clone(record):null,billingEnabled:false,retryWrite:false});
 async function context(proposalId){
  if(!configured())fail('CLIENT_FEE_ACCEPTANCE_DISABLED');
  time();
  const actor=clone(await resolvePrincipal());
  if(!exact(actor,['actorId','ownerScope','organizationId','permission','active'])||!['actorId','ownerScope','organizationId'].every(k=>id(actor[k]))||
   actor.active!==true||actor.permission!=='commercial.client_fee_acceptance.verify')fail('CLIENT_FEE_ACCEPTANCE_FORBIDDEN');
  const p=clone(await readProposal(proposalId,clone(actor)));
  if(!exact(p,proposalKeys)||p.id!==proposalId||!proposalKeys.slice(0,7).every(k=>id(p[k]))||p.ownerScope!==actor.ownerScope||p.organizationId!==actor.organizationId||
   p.model!=='fee_plus'||!['USD','MXN','CAD'].includes(p.currency)||!['fixed_amount','percentage_of_carrier_rate'].includes(p.basis)||
   typeof p.value!=='number'||!Number.isFinite(p.value)||p.value<0||p.value>1e9||p.basis==='percentage_of_carrier_rate'&&p.value>100||
   !hex(p.termsFingerprint)||!instant(p.validUntil))fail('CLIENT_FEE_ACCEPTANCE_SCOPE_CHANGED');
  return {actor,p,key:clientFeeAcceptanceKey(p)};
 }
 async function proof(evidenceId,c){
  const e=clone(await readEvidence(evidenceId,clone(c.actor)));
  if(!exact(e,evidenceKeys)||e.id!==evidenceId||!['id','ownerScope','organizationId','shipperId','sourceVersion','customerContactId'].every(k=>id(e[k]))||
   e.ownerScope!==c.p.ownerScope||e.organizationId!==c.p.organizationId||e.shipperId!==c.p.shipperId||e.termsFingerprint!==c.p.termsFingerprint||
   !['email','document'].includes(e.sourceType)||!hex(e.sourceDigest)||e.sourceVerified!==true||!instant(e.customerAcceptedAt)||
   Date.parse(e.customerAcceptedAt)>time())fail('CLIENT_FEE_ACCEPTANCE_EVIDENCE_REQUIRED');
  return e;
 }
 function validateRecord(r,c){
  validateClientFeeAcceptanceRecord(r,c,time);
 }
 async function recheck(c,e){
  const fresh=await context(c.p.id);
  if(digest(fresh)!==digest(c))fail('CLIENT_FEE_ACCEPTANCE_SCOPE_CHANGED');
  if(e&&digest(await proof(e.id,fresh))!==digest(e))fail('CLIENT_FEE_ACCEPTANCE_SCOPE_CHANGED');
 }
 return Object.freeze({
  async record(input){
   if(!configured())fail('CLIENT_FEE_ACCEPTANCE_DISABLED');
   const body=clone(input);if(!exact(body,['proposalId','evidenceId','humanVerified'])||!id(body.proposalId)||!id(body.evidenceId)||body.humanVerified!==true)fail('CLIENT_FEE_ACCEPTANCE_INVALID');
   const c=await context(body.proposalId),e=await proof(body.evidenceId,c);
   if(Date.parse(c.p.validUntil)<=time())fail('CLIENT_FEE_ACCEPTANCE_EXPIRED');
   // Read failure is not absence; do not write on an unavailable lookup.
   const existing=clone(await readAcceptance(c.key,clone(c.actor)));await recheck(c,e);
   if(existing!==null){validateRecord(existing,c);if(existing.evidence.id!==e.id||existing.evidence.sourceDigest!==e.sourceDigest||
    existing.evidence.sourceVersion!==e.sourceVersion||existing.customerContactId!==e.customerContactId||
    Date.parse(existing.customerAcceptedAt)!==Date.parse(e.customerAcceptedAt))fail('CLIENT_FEE_ACCEPTANCE_CONFLICT');return reply('accepted',existing);}
   if(Date.parse(c.p.validUntil)<=time())fail('CLIENT_FEE_ACCEPTANCE_EXPIRED');
   const record={contractVersion:'rateware.client-fee-record.v1',id:c.key,state:'accepted',
    scope:{ownerScope:c.p.ownerScope,organizationId:c.p.organizationId,shipperId:c.p.shipperId,rfxId:c.p.rfxId,laneId:c.p.laneId,proposalId:c.p.id,revision:c.p.revision},
    terms:Object.fromEntries(['model','currency','basis','value','validUntil'].map(k=>[k,c.p[k]])),termsFingerprint:c.p.termsFingerprint,
    evidence:{id:e.id,sourceType:e.sourceType,sourceDigest:e.sourceDigest,sourceVersion:e.sourceVersion},customerContactId:e.customerContactId,
    customerAcceptedAt:new Date(e.customerAcceptedAt).toISOString(),verifiedBy:c.actor.actorId,verifiedAt:new Date(time()).toISOString()};
   let saved;try{saved=clone(await writeAcceptance(clone(record),clone(c.actor)));}catch{await recheck(c,e);return reply('uncertain');}
   await recheck(c,e);
   try{validateRecord(saved,c);if(digest(saved)!==digest(record))throw Error();}catch{return reply('uncertain');}
   return reply('accepted',saved);
  },
  async lookup(input){
   if(!configured())fail('CLIENT_FEE_ACCEPTANCE_DISABLED');
   const body=clone(input);if(!exact(body,['proposalId'])||!id(body.proposalId))fail('CLIENT_FEE_ACCEPTANCE_INVALID');
   const c=await context(body.proposalId),record=clone(await readAcceptance(c.key,clone(c.actor)));await recheck(c);
   if(record===null)return reply('not_found');validateRecord(record,c);
   const e=await proof(record.evidence.id,c);await recheck(c,e);
   if(e.sourceDigest!==record.evidence.sourceDigest||e.sourceVersion!==record.evidence.sourceVersion||e.customerContactId!==record.customerContactId||
    Date.parse(e.customerAcceptedAt)!==Date.parse(record.customerAcceptedAt))fail('CLIENT_FEE_ACCEPTANCE_SCOPE_CHANGED');
   return reply('accepted',record);
  }
 });
}
