import {createHash} from 'node:crypto';
const CONTRACT='rateware.assisted-pilot-transport.v1',VIRTUAL='http://127.0.0.1:54321';
const scopeKeys=['actorId','organizationId','ownerScope','vendorId','invitationId'];
const reservationKeys=['id',...scopeKeys,'requestId','descriptor','sourceSignature','sourceUpdatedAt','inputDigest','verifiedAt','expiresAt'];
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const canonical=v=>Array.isArray(v)?v.map(canonical):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const demand=v=>{if(!v)throw Error('ASSISTED_ACCESS_UNAVAILABLE');};
const actions=new Set(['loads_assisted_register_v1','loads_assisted_lookup_v1','loads_assisted_ops_queue_v1','loads_assisted_ops_link_v1']);
export const isAssistedPilotTransportRequest=body=>typeof body?.action==='string'&&body.action.startsWith('loads_assisted_');
const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});

// Candidate attached ahead of existing dispatch. B1 and legacy actions are not
// intercepted. No generic RPC route and no client-supplied identity is authority.
/** @param {{enabled?:boolean, origin?:string, pilot?:Record<string,any>|null,
 * createRuntime?:(options:{origin:string,pilot:any,isEnabled:()=>boolean})=>any,
 * readCarrierContext?:(request:Request,input:Record<string,unknown>)=>Promise<Response>,
 * now?:()=>number,isEnabled?:()=>boolean}} [options] */
export function createAssistedPilotEdgeBridge({enabled=false,origin,pilot,createRuntime,readCarrierContext,now=Date.now,isEnabled=()=>enabled}={}){
 const selected=pilot?structuredClone(pilot):null;let runtime;
 const current=()=>{try{const u=new URL(origin);return isEnabled()===true&&u.protocol==='https:'&&u.origin===origin
  &&selected&&Date.parse(selected.expiresAt)>now()&&typeof createRuntime==='function'&&typeof readCarrierContext==='function';}catch{return false;}};
 const resolveRuntime=()=>{demand(current());runtime||=createRuntime({origin:VIRTUAL,pilot:selected,isEnabled});demand(runtime.config().available===true);return runtime;};
 const virtualRequest=(request,path,input)=>new Request(VIRTUAL+path,{method:input===undefined?'GET':'POST',headers:{Origin:VIRTUAL,
  Authorization:request.headers.get('authorization'),'Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})});
 const context=async(request,reservation,token)=>{
  const response=await readCarrierContext(request,{action:'read_native_bid_context',contractVersion:'rateware.native-bid-context.v1',token,invitationId:reservation.invitationId});
  demand(response instanceof Response&&response.status===200);const data=await response.json(),c=data?.context;
  demand(data?.contractVersion==='rateware.native-bid-context.v1'&&data.businessWrites===false&&plain(c)
   &&c.actorId===selected.actorId&&c.organizationId===selected.organizationId&&c.vendorId===selected.vendorId&&c.invitationId===selected.invitationId
   &&data.invitation?.rfx_events?.owner_email===selected.ownerScope&&c.eventStatus==='open'
   &&c.sourceSignature===reservation.sourceSignature&&Date.parse(c.updatedAt)===Date.parse(reservation.sourceUpdatedAt)
   &&Number.isFinite(Date.parse(c.expiresAt))&&Date.parse(c.expiresAt)>now()&&Date.parse(reservation.expiresAt)<=Date.parse(c.expiresAt));
  return c;
 };
 return Object.freeze({async fetch(request,body){
  if(!current())return reply({code:'ASSISTED_DISABLED'},503);
  let mutationStarted=false;
  try{
   const u=new URL(request.url);
   demand(request.method==='POST'&&!u.search&&!u.hash&&request.headers.get('origin')===origin&&!request.headers.has('cookie')
    &&/^Bearer [A-Za-z0-9._~+\/-]+=*$/.test(request.headers.get('authorization')||'')&&request.headers.get('authorization').length<=8192
    &&!request.headers.has('sec-fetch-site'));
   demand(body?.contractVersion===CONTRACT&&actions.has(body.action)&&new TextEncoder().encode(JSON.stringify(body)).byteLength<=65536);
   const runtime=resolveRuntime();let result;
   if(['loads_assisted_register_v1','loads_assisted_lookup_v1'].includes(body.action)){
    demand(exact(body,['action','contractVersion','reservation','invitationToken'])&&exact(body.reservation,reservationKeys)
     &&typeof body.invitationToken==='string'&&body.invitationToken.length>0&&body.invitationToken.length<=8192);
    const reservation=structuredClone(body.reservation);
    demand(scopeKeys.every(k=>reservation[k]===selected[k])&&/^[A-Za-z0-9_-]{16,80}$/.test(reservation.requestId)
     &&reservation.id==='ar_'+createHash('sha256').update(JSON.stringify(canonical({...Object.fromEntries(scopeKeys.map(k=>[k,reservation[k]])),requestId:reservation.requestId}))).digest('hex'));
    const before=await context(request,reservation,body.invitationToken);demand(current());
    const internal=virtualRequest(request,'/__internal/assisted-reservation',{});
    mutationStarted=body.action==='loads_assisted_register_v1';
    result=await runtime[mutationStarted?'register':'recover'](internal,{privateDeliveryVerified:true,reservation});
    demand(current()&&same(before,await context(request,reservation,body.invitationToken)));
   }else{
    const queue=body.action==='loads_assisted_ops_queue_v1';
    demand(exact(body,queue?['action','contractVersion']:['action','contractVersion','input'])&&(queue||plain(body.input)));
    const response=await runtime.fetch(virtualRequest(request,queue?'/api/operations/original-requests':'/api/operations/original-link',queue?undefined:body.input));
    result={status:response.status,body:await response.json()};demand(current());
   }
   return reply({contractVersion:CONTRACT,commercialWrites:false,submissionEnabled:false,result});
  }catch{return reply({code:mutationStarted?'PILOT_RESERVATION_UNKNOWN':'ASSISTED_ACCESS_UNAVAILABLE',retryWrite:false},mutationStarted?503:403);}
 }});
}
