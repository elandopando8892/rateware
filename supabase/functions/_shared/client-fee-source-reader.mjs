import {createHash} from 'node:crypto';
import {invitationDeadline} from './private-invitation-evidence.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canon(v))).digest('hex');
const sameActor=(a,b)=>['actorId','ownerScope','organizationId','permission','active'].every(k=>a?.[k]===b?.[k]);
const number=v=>typeof v==='number'?v:typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)?Number(v):NaN;
// Read only, real existing table/Storage bindings. No metadata/won flag can
// claim customer acceptance; acceptedAt/contact are Ops' explicit attestations.
export function createClientFeeSourceReader({enabled=false,client,readObjectHead,downloadObject,customerContactId,customerAcceptedAt,utcOffset='-06:00',mode='staff'}={}){
 let bound=null,description=null;const files=new Map();
 const authorize=a=>{if(enabled!==true||typeof client?.from!=='function')fail('CLIENT_FEE_SOURCE_DISABLED');
  const permitted=mode==='staff'?a?.permission==='commercial.client_fee_acceptance.verify':mode==='backend-read'&&
   a?.permission==='commercial.client_fee_acceptance.read'&&a?.actorId==='rateware-native-fee-reader';
  if(!a||a.active!==true||!permitted||!['actorId','ownerScope','organizationId'].every(k=>typeof a[k]==='string'&&a[k]&&!/[\r\n]/.test(a[k])))fail('CLIENT_FEE_ACCEPTANCE_FORBIDDEN');};
 async function rows(table,columns,filters){
  let q=client.from(table).select(columns);for(const [k,v] of filters)q=q.eq(k,v);
  const r=await q.limit(2);if(r.error||!Array.isArray(r.data))fail('CLIENT_FEE_SOURCE_UNAVAILABLE');return structuredClone(r.data);
 }
 async function one(table,columns,filters){const r=await rows(table,columns,filters);if(r.length!==1)fail('CLIENT_FEE_SOURCE_SCOPE_REQUIRED');return r[0];}
 const owned=(a,filters=[])=>[['owner_email',a.ownerScope],['organization_id',a.organizationId],...filters];
 async function readProposal(id,actor){
  authorize(actor);if(!uuid(id))fail('CLIENT_FEE_SOURCE_INVALID');
  const inv=await one('rfx_lane_vendors','id,rfx_event_id,rfx_lane_id,commercial_model,client_fee_amount,marksman_margin_pct,currency,updated_at',[['id',id]]);
  if(inv.commercial_model!=='fee_plus'||!uuid(inv.rfx_event_id)||!uuid(inv.rfx_lane_id))fail('CLIENT_FEE_SOURCE_INVALID');
  const event=await one('rfx_events','id,owner_email,status,due_date,updated_at',[['id',inv.rfx_event_id],['owner_email',actor.ownerScope]]);
  await one('rfx_lanes','id,rfx_event_id',[['id',inv.rfx_lane_id],['rfx_event_id',event.id]]);
  const quote=await one('quotedesk_quotes','id,owner_email,organization_id,shipper_id,rfx_event_id,currency,valid_until,updated_at',owned(actor,[['rfx_event_id',event.id]]));
  if(!uuid(quote.shipper_id)||!['USD','MXN','CAD'].includes(quote.currency)||inv.currency&&inv.currency!==quote.currency)fail('CLIENT_FEE_SOURCE_SCOPE_REQUIRED');
  const shipper=await one('shippers','id,owner_email,organization_id,status',owned(actor,[['id',quote.shipper_id]]));
  if(shipper.status==='archived')fail('CLIENT_FEE_SOURCE_SCOPE_REQUIRED');
  const basis=inv.client_fee_amount!==null&&inv.client_fee_amount!==undefined?'fixed_amount':'percentage_of_carrier_rate';
  const value=number(basis==='fixed_amount'?inv.client_fee_amount:inv.marksman_margin_pct);
  if(!Number.isFinite(value)||value<0||value>1e9||basis==='percentage_of_carrier_rate'&&value>100)fail('CLIENT_FEE_SOURCE_INVALID');
  const deadlines=[invitationDeadline(event.due_date,utcOffset)];if(quote.valid_until)deadlines.push(invitationDeadline(quote.valid_until,utcOffset));
  if(deadlines.some(v=>v===null)||![inv.updated_at,event.updated_at,quote.updated_at].every(v=>typeof v==='string'&&Number.isFinite(Date.parse(v))))fail('CLIENT_FEE_SOURCE_INVALID');
  // Canonical UTC/millisecond timestamps: SQL sealing must not depend on the
  // provider's equivalent Z/+00:00 transport spelling. Prototype-only upgrade;
  // existing historical acceptances are never rewritten or silently remapped.
  const revision=hash([inv.updated_at,event.updated_at,quote.updated_at].map(v=>new Date(v).toISOString()).concat(quote.id,shipper.id));
  const p={id,ownerScope:actor.ownerScope,organizationId:actor.organizationId,shipperId:shipper.id,rfxId:event.id,laneId:inv.rfx_lane_id,revision,
   model:'fee_plus',currency:quote.currency,basis,value,validUntil:new Date(Math.min(...deadlines.map(Date.parse))).toISOString()};
  const result={...p,termsFingerprint:hash(p)};bound={actor:structuredClone(actor),proposal:result};return structuredClone(result);
 }
 async function readEvidence(id,actor){
  authorize(actor);if(!bound||!sameActor(actor,bound.actor)||!uuid(id)||!uuid(customerContactId)||typeof downloadObject!=='function'||typeof readObjectHead!=='function')fail('CLIENT_FEE_SOURCE_SCOPE_REQUIRED');
  const contact=await one('shipper_contacts','id,shipper_id,owner_email,organization_id,status',owned(actor,[['id',customerContactId],['shipper_id',bound.proposal.shipperId]]));
  if(contact.status!=='active')fail('CLIENT_FEE_SOURCE_SCOPE_REQUIRED');
  const cols='id,owner_email,organization_id,storage_provider,storage_bucket,storage_path,storage_sha256,original_filename,filename,document_type,mime_type,file_size_bytes,status';
  const read=()=>one('raw_uploads',cols,owned(actor,[['id',id]]));
  const raw=await read(),filename=raw.original_filename||raw.filename;
  if(raw.status==='archived'||raw.storage_provider!=='supabase'||raw.storage_bucket!=='raw-uploads'||raw.document_type!=='pdf'||raw.mime_type!=='application/pdf'||
   typeof filename!=='string'||filename.length>240||!filename.toLowerCase().endsWith('.pdf')||/[\\/\r\n]/.test(filename)||
   !/^[a-f0-9]{64}$/.test(raw.storage_sha256||'')||!Number.isSafeInteger(Number(raw.file_size_bytes))||Number(raw.file_size_bytes)<=0||Number(raw.file_size_bytes)>25*1024*1024||
   typeof raw.storage_path!=='string'||!/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(raw.storage_path)||raw.storage_path.split('/').some(x=>x==='.'||x==='..'))fail('CLIENT_FEE_SOURCE_INVALID');
  const head=await readObjectHead(raw.storage_bucket,raw.storage_path);
  if(Number(head?.size)!==Number(raw.file_size_bytes)||typeof head.lastModified!=='string'||!Number.isFinite(Date.parse(head.lastModified)))fail('CLIENT_FEE_SOURCE_UNAVAILABLE');
  const version=hash([raw,head]);
  if(!files.has(version)){
   const blob=await downloadObject(raw.storage_bucket,raw.storage_path);if(!(blob instanceof Blob)||blob.size!==Number(raw.file_size_bytes))fail('CLIENT_FEE_SOURCE_CHANGED');
   const bytes=new Uint8Array(await blob.arrayBuffer());if(bytes.byteLength!==blob.size||Buffer.from(bytes.subarray(0,5)).toString()!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==raw.storage_sha256)fail('CLIENT_FEE_SOURCE_CHANGED');
   files.set(version,true);
  }
  const after=await read(),afterHead=await readObjectHead(raw.storage_bucket,raw.storage_path);
  if(hash([after,afterHead])!==version)fail('CLIENT_FEE_SOURCE_CHANGED');
  description={filename};
  return {id,ownerScope:actor.ownerScope,organizationId:actor.organizationId,shipperId:bound.proposal.shipperId,
   termsFingerprint:bound.proposal.termsFingerprint,sourceType:'document',sourceDigest:raw.storage_sha256,sourceVersion:version,
   customerContactId:contact.id,customerAcceptedAt,sourceVerified:true};
 }
 return Object.freeze({readProposal,readEvidence,describe:()=>description?structuredClone(description):null});
}
