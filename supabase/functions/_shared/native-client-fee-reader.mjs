import {createHash} from 'node:crypto';
import {createClientFeeSourceReader} from './client-fee-source-reader.mjs';
import {clientFeeAcceptanceKey,validateClientFeeAcceptanceRecord} from './client-fee-acceptance.mjs';
const fail=()=>{throw Object.assign(Error('NATIVE_BID_CLIENT_FEE_UNAVAILABLE'),{code:'NATIVE_BID_CLIENT_FEE_UNAVAILABLE',status:503});};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canon(v))).digest('hex');
// Backend service reader, never an Ops impersonation or caller-chosen tenant.
// Called only after native carrier identity, delivered invitation and scope guards.
/**
 * @param {{enabled?: boolean, client?: object,
 * readObjectHead?: (bucket: string, path: string) => Promise<unknown>,
 * downloadObject?: (bucket: string, path: string) => Promise<Blob>,
 * utcOffset?: string, now?: () => number}} [options]
 */
export function createNativeClientFeeReader({enabled=false,client,readObjectHead,downloadObject,utcOffset='-06:00',now=Date.now}={}){
 async function one(table,cols,filters){
  let q=client.from(table).select(cols);for(const [k,v]of filters)q=q.eq(k,v);
  const r=await q.limit(2);if(r.error||!Array.isArray(r.data)||r.data.length!==1)fail();return structuredClone(r.data[0]);
 }
 async function broker(owner){
  const row=await one('workspace_registry','organization_id,organization_uuid,canonical_owner_key',[['canonical_owner_key',owner]]);
  if(row.canonical_owner_key!==owner||!uuid(row.organization_uuid)||typeof row.organization_id!=='string'||!/^[a-zA-Z0-9@._:-]{1,160}$/.test(row.organization_id))fail();
  const link=await one('external_organization_links','organization_id,status',[['provider','supabase'],['external_organization_id',row.organization_id]]);
  if(link.status!=='active'||link.organization_id!==row.organization_uuid)fail();
  return {actorId:'rateware-native-fee-reader',ownerScope:owner,organizationId:row.organization_id,canonicalTenantId:row.organization_uuid,permission:'commercial.client_fee_acceptance.read',active:true};
 }
 async function rpc(name,args){const r=await client.rpc(name,args);if(r?.error||!r?.data)fail();return structuredClone(r.data);}
 return Object.freeze({async read(input){
  if(enabled!==true||typeof client?.from!=='function'||typeof client?.rpc!=='function')fail();
  try{
   if(typeof now!=='function'||!Number.isFinite(now()))fail();
   const inv=structuredClone(input),event=Array.isArray(inv?.rfx_events)?inv.rfx_events[0]:inv?.rfx_events;
   if(!uuid(inv?.id)||!uuid(inv.rfx_event_id)||!uuid(inv.rfx_lane_id)||event?.id!==inv.rfx_event_id||typeof event.owner_email!=='string')fail();
   const scope=await broker(event.owner_email);
   const create=options=>createClientFeeSourceReader({enabled:true,mode:'backend-read',client,readObjectHead,downloadObject,utcOffset,...options});
   const initial=await create().readProposal(inv.id,scope),key=clientFeeAcceptanceKey(initial);
   const args={p_id:key,p_owner_scope:scope.ownerScope,p_organization_id:scope.organizationId};
   const saved=await rpc('rateware_client_fee_acceptance_read_local_v1',args);
   if(!exact(saved,['state','record']))fail();
   if(saved.state==='not_found'&&saved.record===null){if(hash(await broker(event.owner_email))!==hash(scope))fail();return {proposal:initial,record:null,evidence:null,revocation:null};}
   if(saved.state!=='accepted')fail();const record=saved.record;
   validateClientFeeAcceptanceRecord(record,{p:initial,key},now);
   const source=create({customerContactId:record.customerContactId,customerAcceptedAt:record.customerAcceptedAt});
   const proposal=await source.readProposal(inv.id,scope);if(hash(proposal)!==hash(initial))fail();
   const evidence=await source.readEvidence(record.evidence.id,scope);
   if(evidence.sourceDigest!==record.evidence.sourceDigest||evidence.sourceVersion!==record.evidence.sourceVersion||evidence.sourceType!==record.evidence.sourceType)fail();
   const result=await rpc('rateware_client_fee_revocation_read_local_v1',args);
   if(!exact(result,['state','status'])||result.state!=='known'||!exact(result.status,['acceptanceId','revision','revoked','checkedAt'])||
    result.status.acceptanceId!==key||!hex(result.status.revision)||typeof result.status.revoked!=='boolean'||
    typeof result.status.checkedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(result.status.checkedAt)||!Number.isFinite(Date.parse(result.status.checkedAt))||
    Date.parse(result.status.checkedAt)>now()||now()-Date.parse(result.status.checkedAt)>30000)fail();
   if(hash(await broker(event.owner_email))!==hash(scope)||hash(await source.readProposal(inv.id,scope))!==hash(proposal))fail();
   return {proposal,record,evidence,revocation:result.status};
  }catch{fail();}
 }});
}
