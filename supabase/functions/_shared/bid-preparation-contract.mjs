import {createBidOperationIntent} from './bid-operation-contract.mjs';
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim()&&v.length<=256;
const canonical=v=>Array.isArray(v)?v.map(canonical):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
export const originalReferenceKeys=['rawUploadId','objectId','objectVersion','sha256','sizeBytes'];
export function validOriginalReference(v){
 const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
 return exact(v,originalReferenceKeys)&&uuid(v.rawUploadId)&&uuid(v.objectId)&&
  typeof v.objectVersion==='string'&&/^[A-Za-z0-9._:-]{1,160}$/.test(v.objectVersion)&&
  typeof v.sha256==='string'&&/^[a-f0-9]{64}$/.test(v.sha256)&&Number.isSafeInteger(v.sizeBytes)&&v.sizeBytes>0&&v.sizeBytes<=26214400;
}
export function originalReferenceFromSource(source){
 if(!exact(source,['kind','sourceSignature',...originalReferenceKeys])||source.kind!=='verified_raw_upload')return null;
 const reference=Object.fromEntries(originalReferenceKeys.map(k=>[k,source[k]]));
 return validOriginalReference(reference)?reference:null;
}
// Shared existing validator. A valid record is not commercial authorization.
export async function validateStoredBidPreparation(value,scope,requestId){
 const invalid=()=>{throw Object.assign(new Error('NATIVE_BID_PREPARATION_INVALID'),{code:'NATIVE_BID_PREPARATION_INVALID',status:409});};
 const base=['contractVersion','state','requestId','intent','receipt','submissionEnabled'];
 try{if(new TextEncoder().encode(JSON.stringify(value)).length>128*1024)invalid();}catch{invalid();}
 if(!plain(value)||value.contractVersion!=='rateware.bid-preparation.v1'||value.requestId!==requestId||value.submissionEnabled!==false||
  !['prepared','recorded','not_found'].includes(value.state)||!exact(value,value.state==='not_found'?base:[...base,'sourceSignature','expectedUpdatedAt',...(value.originalSource!==undefined?['originalSource']:[])]))invalid();
 if(value.originalSource!==undefined&&!validOriginalReference(value.originalSource))invalid();
 if(value.state==='not_found'){if(value.intent!==null||value.receipt!==null)invalid();return value;}
 const intent=value.intent;
 if(!exact(intent,['contractVersion','action','requestId','scope','payload','operationKey','fingerprint','externalExecution'])||
  intent.contractVersion!=='rateware.bid-operation-intent.v1'||intent.action!=='submit_bid'||intent.requestId!==requestId||
  intent.externalExecution!==false||!same(intent.scope,scope))invalid();
 let verified;try{verified=await createBidOperationIntent({scope,requestId,payload:intent.payload});}catch{invalid();}
 if(!same(verified,intent)||!Number.isFinite(Date.parse(value.expectedUpdatedAt))||!/^[a-f0-9]{64}$/.test(value.sourceSignature||''))invalid();
 if(value.state==='prepared'){if(value.receipt!==null)invalid();}
 else if(!exact(value.receipt,['receiptId','stagingId','targetStatus',...(value.originalSource!==undefined?['originalSource']:[])])||
  !text(value.receipt.receiptId)||!text(value.receipt.stagingId)||value.receipt.targetStatus!=='pending_review'||
  value.originalSource!==undefined&&!validOriginalReference(value.receipt.originalSource)||
  !same(value.receipt.originalSource??null,value.originalSource??null))invalid();
 return value;
}
