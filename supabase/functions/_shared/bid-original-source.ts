import {downloadStorageObject,sha256Hex} from './object-storage.ts';
type Scope={actorId:string;organizationId:string;vendorId:string;invitationId:string;ownerScope:string;requestId:string};
export type OriginalSourceRef={rawUploadId:string;objectId:string;objectVersion:string;sha256:string;sizeBytes:number};
export type OriginalSourceContext=Scope&{reference:OriginalSourceRef;storageProvider:string;bucket:string;path:string;originalFilename:string;documentType:string;mimeType:string};
const MAX_BYTES=25*1024*1024;
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const keys=['rawUploadId','objectId','objectVersion','sha256','sizeBytes'] as const;
const scopeKeys=['actorId','organizationId','vendorId','invitationId','ownerScope','requestId'] as const;
function fail(code:string,status=409):never{throw Object.assign(new Error(code),{code,status});}
function validRef(v:OriginalSourceRef){return !!v&&typeof v==='object'&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>(keys as readonly string[]).includes(k))&&uuid(v.rawUploadId)&&uuid(v.objectId)&&hash(v.sha256)&&typeof v.objectVersion==='string'&&/^[a-zA-Z0-9._:-]{1,160}$/.test(v.objectVersion)&&Number.isSafeInteger(v.sizeBytes)&&v.sizeBytes>0&&v.sizeBytes<=MAX_BYTES;}
const sameRef=(a:OriginalSourceRef,b:OriginalSourceRef)=>keys.every(k=>a[k]===b[k]);
function validate(ctx:OriginalSourceContext|null,input:{scope:Scope;reference:OriginalSourceRef}){
 if(!ctx||scopeKeys.some(k=>ctx[k]!==input.scope[k])||!validRef(ctx.reference)||!sameRef(ctx.reference,input.reference))fail('BID_ORIGINAL_SOURCE_FORBIDDEN',403);
 // This gate proves only Supabase object versions. Oracle remains supported by
 // the common adapter but needs its own immutable-version proof; never fallback.
 if(ctx.storageProvider!=='supabase'||ctx.bucket!=='raw-uploads'||typeof ctx.path!=='string'||
  !/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(ctx.path)||ctx.path.split('/').some(p=>p==='.'||p==='..')||
  !ctx.originalFilename||ctx.originalFilename.length>240||/[\\/\r\n]/.test(ctx.originalFilename)||['.','..'].includes(ctx.originalFilename))fail('BID_ORIGINAL_SOURCE_UNSUPPORTED',400);
 const mime=ctx.documentType==='pdf'?'application/pdf':ctx.documentType==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':null;
 if(!mime||ctx.mimeType!==mime||!ctx.originalFilename.toLowerCase().endsWith('.'+ctx.documentType))fail('BID_ORIGINAL_SOURCE_UNSUPPORTED',400);
 return ctx;
}
// Trusted reader must scope raw_uploads + approval or assisted link + Storage metadata to the
// verified actor/company/invitation. No claim here grants generic file access.
// Reads bytes using Rateware's existing adapter; no uploads, deletes or URLs.
export async function verifyBidOriginalSource(client:any,input:{scope:Scope;reference:OriginalSourceRef;sourceSignature:string},readContext:(scope:Scope,rawUploadId:string)=>Promise<OriginalSourceContext|null>){
 const expected=structuredClone(input);
 if(!validRef(expected.reference)||!hash(expected.sourceSignature)||!expected.scope||scopeKeys.some(k=>typeof expected.scope[k]!=='string'||!expected.scope[k]))fail('BID_ORIGINAL_SOURCE_INVALID',400);
 let first:OriginalSourceContext;
 try{first=structuredClone(validate(await readContext(expected.scope,expected.reference.rawUploadId),expected));}
 catch(e){if((e as any).code)throw e;fail('BID_ORIGINAL_SOURCE_UNAVAILABLE',503);}
 let blob:Blob;
 try{blob=await downloadStorageObject(client,'supabase',first.bucket,first.path);}
 catch{fail('BID_ORIGINAL_SOURCE_UNAVAILABLE',503);}
 if(blob.size!==expected.reference.sizeBytes||blob.size>MAX_BYTES)fail('BID_ORIGINAL_SOURCE_SIZE_MISMATCH');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 if(await sha256Hex(bytes)!==expected.reference.sha256)fail('BID_ORIGINAL_SOURCE_HASH_MISMATCH');
 let current:OriginalSourceContext|null;
 try{current=await readContext(expected.scope,expected.reference.rawUploadId);}catch{fail('BID_ORIGINAL_SOURCE_UNAVAILABLE',503);}
 if(!current||!validRef(current.reference)||!sameRef(first.reference,current.reference)||
  scopeKeys.some(k=>first[k]!==current![k])||['bucket','path','originalFilename','documentType','mimeType','storageProvider'].some(k=>(first as any)[k]!== (current as any)[k]))fail('BID_ORIGINAL_SOURCE_CHANGED');
 return Object.freeze({kind:'verified_raw_upload',sourceSignature:expected.sourceSignature,...expected.reference});
}

// Preparation gets the exact reference from the scoped assisted link, never
// from a carrier-supplied hash/version. Physical verification remains shared.
export async function resolveBidPreparationOriginalSource(client:any,input:{scope:Scope;rawUploadId:string;sourceSignature:string},readContext:(scope:Scope,rawUploadId:string)=>Promise<OriginalSourceContext|null>){
 const expected=structuredClone(input);
 if(!uuid(expected.rawUploadId)||!hash(expected.sourceSignature)||!expected.scope||scopeKeys.some(k=>typeof expected.scope[k]!=='string'||!expected.scope[k]))fail('BID_ORIGINAL_SOURCE_INVALID',400);
 let context:OriginalSourceContext|null;
 try{context=await readContext(expected.scope,expected.rawUploadId);}catch{fail('BID_ORIGINAL_SOURCE_UNAVAILABLE',503);}
 if(!context||context.reference?.rawUploadId!==expected.rawUploadId)fail('BID_ORIGINAL_SOURCE_FORBIDDEN',403);
 return verifyBidOriginalSource(client,{scope:expected.scope,reference:structuredClone(context.reference),sourceSignature:expected.sourceSignature},readContext);
}
