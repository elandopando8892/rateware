import {createAuthenticatedOpsReaders} from './assisted-ops-readers.mjs';
import {createAssistedOpsStore,createAssistedOpsWriter} from './assisted-ops-store.mjs';
import {createAssistedOriginalOpsHost} from './assisted-original-ops.mjs';

// Candidate mounting, loopback only. Production routing and credentials are not
// installed by this module. readStaff is the authenticated identity reader.
export function createOperationsService({enabled=false,origin,readStaff,rpc,downloadOriginal}={}){
 let local=false;try{const u=new URL(origin);local=u.origin===origin&&u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname);}catch{}
 const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
 return Object.freeze({async fetch(request){
  if(enabled!==true||!local)return json({code:'LOCAL_SIMULATION_DISABLED'},404);
  const url=new URL(request.url);
  if(url.origin!==origin || request.headers.has('origin')&&request.headers.get('origin')!==origin
   || request.headers.has('sec-fetch-site')&&request.headers.get('sec-fetch-site')!=='same-origin')return json({code:'ORIGIN_REJECTED'},403);
  if(!['/api/operations/original-link','/api/operations/original-requests'].includes(url.pathname)||url.search)return json({code:'NOT_FOUND'},404);
  try{
   const initial=Object.freeze({...await readStaff(request)});
   const pinnedStaff=async req=>{
    if(req!==request)throw Error('STAFF_CHANGED');
    const current=await readStaff(request);
    if(Object.keys(current).length!==Object.keys(initial).length||Object.keys(initial).some(k=>current[k]!==initial[k]))throw Error('STAFF_CHANGED');
    return current;
   };
   const readers=createAuthenticatedOpsReaders({request,readStaff:pinnedStaff,rpc,downloadOriginal});
   if(url.pathname==='/api/operations/original-link')return createAssistedOriginalOpsHost({enabled:true,origin,...readers,
    stateStore:createAssistedOpsStore({request,readStaff:pinnedStaff,rpc}),bindOriginal:createAssistedOpsWriter({request,readStaff:pinnedStaff,rpc})}).fetch(request);
   if(request.method!=='GET')return json({code:'METHOD_NOT_ALLOWED'},405);
   const queue=await readers.readQueue(),items=[];
   for(const row of queue.value.items){
    const files=await readers.readOriginals({reservationId:row.reservationId});
    items.push({...row,carrierLabel:row.carrierLabel||row.organizationId,route:row.route||'',originals:files.value.items.map(f=>({id:f.rawUploadId,name:f.originalFilename,sizeBytes:f.sizeBytes}))});
   }
   await pinnedStaff(request);
   // Display identity is projected only after the existing staff/tenant checks
   // and final reauthorization. It grants no capability of its own.
   const opsIdentity={actorId:initial.actorId,organizationId:initial.organizationId,role:initial.role,authoritySource:'rateware.operations_identity'};
   return json({contractVersion:'loads.assisted-ops-queue.v1',simulationOnly:true,commercialWrites:false,submissionEnabled:false,opsIdentity,items});
  }catch{return json({code:'OPS_ACCESS_UNAVAILABLE'},403);}
 }});
}
