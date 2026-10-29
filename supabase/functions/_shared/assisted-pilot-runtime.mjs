import {createOperationsIdentityReader} from './assisted-ops-readers.mjs';
import {createOperationsService} from './assisted-ops-service.mjs';
import {resolveSourceFileUser} from './source-file-access.ts';
import {teamRoleFromClaims} from './team-roles.ts';
import {createGoogleSessionVerifier} from './google-session-verifier.mjs';

const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const text=v=>typeof v==='string'&&v.length>0&&v.length<=256&&v.trim()===v&&!/[\x00-\x1f\x7f]/.test(v);
const scopeKeys=['actorId','organizationId','ownerScope','vendorId','invitationId'];
const pilotKeys=[...scopeKeys,'opsActorId','opsOrganizationId','expiresAt'];
const reservationKeys=['id',...scopeKeys,'requestId','descriptor','sourceSignature','sourceUpdatedAt','inputDigest','verifiedAt','expiresAt'];
const fail=code=>{throw Object.assign(Error(code),{code});};
const demand=(condition,code='PILOT_AUTHORITY_REQUIRED')=>{if(!condition)fail(code);};
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
const rpcNames=new Set(['rateware_assisted_register_local_v1','rateware_assisted_lookup_local_v1',
  'rateware_assisted_ops_read_local_v1','rateware_assisted_ops_state_local_v1','rateware_assisted_ops_bind_local_v1']);

// Local composition candidate. No environment/client creation, route installation,
// capability grants, token persistence or outbound transport. SDK ports are injected.
// register/recover are server methods; fetch NEVER exposes a reservation-write route.
export function createAuthenticatedAssistedPilotRuntime({enabled=false,origin,pilot,authClient,workspaceClient,operationClient,storageClient,now=Date.now}={}){
  const selected=pilot?structuredClone(pilot):null;
  let configured=false;
  try{const url=new URL(origin);configured=enabled===true&&url.origin===origin&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)
    &&exact(selected,pilotKeys)&&['actorId','vendorId','invitationId','opsActorId'].every(k=>uuid(selected[k]))
    &&['organizationId','ownerScope','opsOrganizationId'].every(k=>text(selected[k]))&&Number.isFinite(Date.parse(selected.expiresAt))
    &&typeof authClient?.getUser==='function'&&workspaceClient&&typeof operationClient?.rpc==='function'&&typeof storageClient?.from==='function';}catch{}
  const current=()=>configured&&Date.parse(selected.expiresAt)>now();
  const requestAllowed=(request,internal=false)=>{
    demand(current(),'PILOT_DISABLED');demand(request instanceof Request);
    const url=new URL(request.url);
    demand(url.origin===origin&&!url.search&&!url.hash&&request.headers.get('origin')===origin
      &&(!request.headers.has('sec-fetch-site')||request.headers.get('sec-fetch-site')==='same-origin'),'ORIGIN_REJECTED');
    if(internal)demand(url.pathname==='/__internal/assisted-reservation'&&request.method==='POST');
    demand(!request.headers.has('cookie'));
  };
  const pinnedScope=value=>demand(value&&scopeKeys.every(k=>value[k]===selected[k]),'PILOT_TARGET_REJECTED');
  const found=result=>{demand(result?.error===null&&result.data?.state==='found'&&result.data.value,'PILOT_TARGET_UNAVAILABLE');return result.data.value;};
  const rawRpc=(name,args)=>operationClient.rpc(name,args);
  const checkReservation=async(staff,id,call)=>{
    const r=await call('rateware_assisted_ops_read_local_v1',{p_staff:staff,p_kind:'reservation',p_input:{reservationId:id}});
    pinnedScope(found(r).target);return r;
  };
  const checkReview=async(staff,referenceHash,call)=>{
    const r=await call('rateware_assisted_ops_state_local_v1',{p_staff:staff,p_action:'get_review',p_input:{referenceHash}});
    pinnedScope(found(r).plan?.scope);return r;
  };
  const rpc=async(name,args,reauthorize=async()=>{})=>{
    demand(current(),'PILOT_DISABLED');demand(rpcNames.has(name),'PILOT_RPC_REJECTED');
    // Request-local guard: prerequisites/queue expansion also reauthenticate,
    // rather than continuing with identity captured before an awaited read.
    // The separate receipt RPC uses rawRpc to avoid recursive authorization.
    const call=async(n,a)=>{await reauthorize();demand(current(),'PILOT_DISABLED');
      const value=await rawRpc(n,a);await reauthorize();demand(current(),'PILOT_DISABLED');return value;};
    if(name==='rateware_assisted_ops_read_local_v1'){
      if(args.p_input?.scope)pinnedScope(args.p_input.scope);
      if(args.p_kind==='originals')await checkReservation(args.p_staff,args.p_input.reservationId,call);
    }
    if(name==='rateware_assisted_ops_state_local_v1'){
      if(args.p_action==='save_review')pinnedScope(args.p_input.entry?.plan?.scope);
      if(args.p_action==='get_attempt')pinnedScope(args.p_input.scope);
      if(args.p_action==='claim_attempt'){
        pinnedScope(args.p_input.expected);await checkReview(args.p_staff,args.p_input.referenceHash,call);
      }
    }
    if(name==='rateware_assisted_ops_bind_local_v1')await checkReview(args.p_staff,args.p_review_hash,call);
    demand(current(),'PILOT_DISABLED');
    const result=await call(name,args);
    if(result?.error===null){
      if(name==='rateware_assisted_ops_read_local_v1'&&args.p_kind==='reservation')pinnedScope(found(result).target);
      if(name==='rateware_assisted_ops_state_local_v1'&&args.p_action==='get_review'&&result.data?.state==='found')pinnedScope(found(result).plan?.scope);
      if(name==='rateware_assisted_ops_read_local_v1'&&args.p_kind==='queue'){
        const value=found(result);demand(Array.isArray(value.items)&&value.items.length<=100);
        const items=[];
        for(const row of value.items){
          if(!['organizationId','vendorId','invitationId'].every(k=>row[k]===selected[k]))continue;
          const reservation=await call('rateware_assisted_ops_read_local_v1',{p_staff:args.p_staff,p_kind:'reservation',p_input:{reservationId:row.reservationId}});
          const target=found(reservation).target;
          if(scopeKeys.every(k=>target?.[k]===selected[k]))items.push(row);
        }
        return {error:null,data:{state:'found',value:{items}}};
      }
    }
    return result;
  };
  const getUser=async request=>{
    const h=request.headers.get('authorization');demand(typeof h==='string'&&h.length<=8192);
    const match=/^Bearer ([A-Za-z0-9._~+\/-]+=*)$/.exec(h);demand(match);
    const r=await authClient.getUser(match[1]);
    demand(r?.error===null&&r.data?.user?.app_metadata?.provider==='google'&&uuid(r.data.user.id)
      &&Number.isFinite(Date.parse(r.data.user.email_confirmed_at)));
    return r.data.user;
  };
  let identityReader;
  if(configured)identityReader=createOperationsIdentityReader({getUser:token=>authClient.getUser(token),
    verifyGoogleSession:createGoogleSessionVerifier({now,rpc:(name,args)=>{demand(current(),'PILOT_DISABLED');return rawRpc(name,args);}}),
    resolveSourceFileUser,teamRoleFromClaims,workspaceClient});
  const readStaff=async request=>{
    requestAllowed(request);const staff=await identityReader(request);
    demand(current(),'PILOT_DISABLED');
    demand(staff.actorId===selected.opsActorId&&staff.organizationId===selected.opsOrganizationId&&staff.ownerScope===selected.ownerScope);
    return staff;
  };
  const downloadOriginal=async metadata=>{
    demand(current(),'PILOT_DISABLED');
    // The authenticated reader already validated the immutable object and scope.
    // No arbitrary URL, public URL, signed URL or client-supplied path is used.
    demand(metadata?.storageProvider==='supabase'&&metadata.bucket==='raw-uploads'&&text(metadata.path));
    const result=await storageClient.from('raw-uploads').download(metadata.path);
    demand(result?.error===null&&result.data instanceof Blob&&result.data.size===metadata.reference.sizeBytes&&result.data.size<=25*1024*1024,'PILOT_STORAGE_UNAVAILABLE');
    return new Uint8Array(await result.data.arrayBuffer());
  };
  const reservationCall=async(request,proof,lookup)=>{
    requestAllowed(request,true);
    demand(exact(proof,['privateDeliveryVerified','reservation'])&&proof.privateDeliveryVerified===true);
    const r=structuredClone(proof.reservation);
    demand(exact(r,reservationKeys)&&scopeKeys.every(k=>r[k]===selected[k])
      &&/^[A-Za-z0-9_-]{24,160}$/.test(r.id)&&/^[A-Za-z0-9_-]{16,80}$/.test(r.requestId)
      &&exact(r.descriptor,['sha256','sizeBytes'])&&/^[a-f0-9]{64}$/.test(r.descriptor.sha256)
      &&Number.isSafeInteger(r.descriptor.sizeBytes)&&r.descriptor.sizeBytes>0&&r.descriptor.sizeBytes<=25*1024*1024
      &&['sourceSignature','inputDigest'].every(k=>typeof r[k]==='string'&&/^[a-f0-9]{64}$/.test(r[k]))
      &&['sourceUpdatedAt','verifiedAt','expiresAt'].every(k=>typeof r[k]==='string'&&Number.isFinite(Date.parse(r[k])))
      &&Date.parse(r.verifiedAt)<=now()&&Date.parse(r.verifiedAt)>=now()-60000&&Date.parse(r.expiresAt)>now()
      &&Date.parse(r.expiresAt)<=Date.parse(selected.expiresAt));
    const before=await getUser(request);demand(before.id===selected.actorId);
    const result=await rpc(lookup?'rateware_assisted_lookup_local_v1':'rateware_assisted_register_local_v1',{p_reservation:r});
    demand(current(),'PILOT_DISABLED');const after=await getUser(request);demand(after.id===before.id);
    demand(result&&result.error===null,'PILOT_RESERVATION_UNKNOWN');const data=result.data;
    if(lookup&&exact(data,['state'])&&data.state==='absent')return data;
    demand(exact(data,['state','reservationId','expiresAt'])&&(lookup?data.state==='found':['reserved','unchanged'].includes(data.state))
      &&data.reservationId===r.id&&Number.isFinite(Date.parse(data.expiresAt))&&Date.parse(data.expiresAt)>now()
      &&Date.parse(data.expiresAt)<=Date.parse(r.expiresAt),'PILOT_RESERVATION_UNKNOWN');
    return structuredClone(data);
  };
  return Object.freeze({
    config:()=>({available:current(),localOnly:true,submissionEnabled:false}),
    register:(request,proof)=>reservationCall(request,proof,false),
    recover:(request,proof)=>reservationCall(request,proof,true),
    async fetch(request){
      if(!current())return json({code:'PILOT_DISABLED'},404);
      try{requestAllowed(request);
        const initial=await readStaff(request);
        const reauthorize=async()=>{
          const staff=await readStaff(request);
          demand(Object.keys(staff).length===Object.keys(initial).length&&Object.keys(initial).every(k=>initial[k]===staff[k]));
          return staff;
        };
        const scopedRpc=async(name,args)=>{
          const staff=await reauthorize();
          demand(args?.p_staff&&Object.keys(staff).length===Object.keys(args.p_staff).length&&Object.keys(staff).every(k=>staff[k]===args.p_staff[k]));
          return rpc(name,args,reauthorize);
        };
        const scopedDownload=async metadata=>{await reauthorize();const bytes=await downloadOriginal(metadata);await reauthorize();return bytes;};
        return await createOperationsService({enabled:true,origin,readStaff,rpc:scopedRpc,downloadOriginal:scopedDownload}).fetch(request);
      }catch{return json({code:'PILOT_ACCESS_UNAVAILABLE'},403);}
    },
  });
}
