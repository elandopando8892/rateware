import { MARKSMAN_LOADS_PROVIDER, MarksmanLoadsBidContractError, payloadFingerprint, sha256Hex, stableStringify } from './marksman-loads-bid-contract.ts';

export const MARKSMAN_LOADS_FIT_REQUEST_VERSION='rateware-internal-fit.v1';
export const FIT_RUBRICS=['logistics_model','operation_criteria','business_rules','service_specifications','carrier_requirements','other_notes'] as const;
const ANSWERS=new Set(['agree','exception','disagree','not_applicable']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256=/^[0-9a-f]{64}$/;
const MAX_TTL_MS=5*60_000;
type RecordValue=Record<string,unknown>;

function object(value:unknown):RecordValue{return value&&typeof value==='object'&&!Array.isArray(value)?value as RecordValue:{};}
function text(value:unknown){return String(value==null?'':value).trim();}
function requiredText(value:unknown,field:string,maximum=191){const normalized=text(value);if(!normalized||normalized.length>maximum)throw new MarksmanLoadsBidContractError(`${field} is invalid.`,'INVALID_FIT_REQUEST');return normalized;}
function requiredUuid(value:unknown,field:string){const normalized=text(value).toLowerCase();if(!UUID.test(normalized))throw new MarksmanLoadsBidContractError(`${field} must be a UUID.`,'INVALID_FIT_REQUEST');return normalized;}
function unsignedEnvelope(envelope:RecordValue){const{signature:_signature,...unsigned}=envelope;return unsigned;}
function hexToBytes(value:string){if(!SHA256.test(value))return null;const bytes=new Uint8Array(value.length/2);for(let i=0;i<value.length;i+=2)bytes[i/2]=Number.parseInt(value.slice(i,i+2),16);return bytes;}
function equal(left:Uint8Array|null,right:Uint8Array){if(!left||left.length!==right.length)return false;let diff=0;for(let i=0;i<right.length;i++)diff|=left[i]^right[i];return diff===0;}
async function signature(envelope:RecordValue,secret:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stableStringify(unsignedEnvelope(envelope)))));}

export function normalizeFitPayload(value:unknown){
  const payload=object(value);
  if(payload.action!=='save_segment_confirmations'||Object.keys(payload).some(key=>!['action','confirmations'].includes(key))||!Array.isArray(payload.confirmations))throw new MarksmanLoadsBidContractError('Fit payload is invalid.','INVALID_FIT_PAYLOAD');
  const seen=new Set<string>();
  const rows=payload.confirmations.map((item,index)=>{
    const row=object(item);if(Object.keys(row).some(key=>!['segment_key','rubric_key','answer','comment'].includes(key)))throw new MarksmanLoadsBidContractError(`Fit response ${index+1} contains unsupported fields.`,'INVALID_FIT_PAYLOAD');
    const segment_key=requiredText(row.segment_key,'segment_key',200),rubric_key=requiredText(row.rubric_key,'rubric_key',80),answer=text(row.answer).toLowerCase(),comment=text(row.comment).slice(0,1200);
    if(!FIT_RUBRICS.includes(rubric_key as typeof FIT_RUBRICS[number])||seen.has(rubric_key)||!ANSWERS.has(answer))throw new MarksmanLoadsBidContractError('Fit must contain one valid answer per rubric.','INVALID_FIT_PAYLOAD');
    if(['exception','disagree'].includes(answer)&&!comment)throw new MarksmanLoadsBidContractError('Each fit exception or disagreement requires its own comment.','FIT_CONDITION_COMMENT_REQUIRED');
    seen.add(rubric_key);return{segment_key,rubric_key,answer,comment};
  });
  if(rows.length!==FIT_RUBRICS.length||FIT_RUBRICS.some(key=>!seen.has(key)))throw new MarksmanLoadsBidContractError('All six fit rubrics must be answered.','FIT_INCOMPLETE');
  const segmentKey=rows[0].segment_key;if(rows.some(row=>row.segment_key!==segmentKey))throw new MarksmanLoadsBidContractError('All fit responses must use one segment.','FIT_SEGMENT_MISMATCH');
  rows.sort((a,b)=>FIT_RUBRICS.indexOf(a.rubric_key as typeof FIT_RUBRICS[number])-FIT_RUBRICS.indexOf(b.rubric_key as typeof FIT_RUBRICS[number]));
  return{action:'save_segment_confirmations',confirmations:rows};
}

export type VerifiedMarksmanLoadsFitRequest={requestId:string;keyId:string;issuedAt:string;expiresAt:string;requestFingerprint:string;body:{action:'resolve_and_save_fit';organizationId:string;vendorId:string;eventId:string;laneId:string;invitationId:string;operationId:string;preparedReceiptId:string;payloadFingerprint:string;payload:ReturnType<typeof normalizeFitPayload>;humanConfirmation:{actorId:string;role:'ADMIN'|'OPERATOR';confirmedAt:string}}};

export async function verifyMarksmanLoadsFitRequest(envelopeValue:unknown,options:{sharedSecret:string;expectedKeyId:string;now?:Date}):Promise<VerifiedMarksmanLoadsFitRequest>{
  const envelope=object(envelopeValue),secret=text(options.sharedSecret);if(secret.length<32)throw new MarksmanLoadsBidContractError('Fit connector secret is not configured.','FIT_CONNECTOR_NOT_CONFIGURED',503);
  if(envelope.contractVersion!==MARKSMAN_LOADS_FIT_REQUEST_VERSION||envelope.issuer!=='marksman-loads'||envelope.audience!=='rateware')throw new MarksmanLoadsBidContractError('Fit request routing is invalid.','INVALID_FIT_AUTHORIZATION',401);
  const keyId=requiredText(envelope.keyId,'keyId',96);if(keyId!==text(options.expectedKeyId))throw new MarksmanLoadsBidContractError('Fit key is not accepted.','INVALID_FIT_KEY',401);
  if(!equal(hexToBytes(text(envelope.signature).toLowerCase()),await signature(envelope,secret)))throw new MarksmanLoadsBidContractError('Fit signature is invalid.','INVALID_FIT_SIGNATURE',401);
  const now=(options.now||new Date()).getTime(),issued=Date.parse(text(envelope.issuedAt)),expires=Date.parse(text(envelope.expiresAt));
  if(!Number.isFinite(issued)||!Number.isFinite(expires)||expires<=issued||expires-issued>MAX_TTL_MS||issued>now+30_000)throw new MarksmanLoadsBidContractError('Fit timestamps are invalid.','INVALID_FIT_TIMESTAMP',401);if(expires<now)throw new MarksmanLoadsBidContractError('Fit authorization expired.','FIT_AUTHORIZATION_EXPIRED',401);
  const raw=object(envelope.body);if(raw.action!=='resolve_and_save_fit')throw new MarksmanLoadsBidContractError('Fit action is invalid.','INVALID_FIT_ACTION');
  const organizationId=requiredText(raw.organizationId,'organizationId').toLowerCase();if(organizationId!==text(raw.organizationId))throw new MarksmanLoadsBidContractError('organizationId must be normalized lowercase.','INVALID_FIT_REQUEST');
  const operationId=text(raw.operationId).toLowerCase();if(!SHA256.test(operationId))throw new MarksmanLoadsBidContractError('operationId must be SHA-256.','INVALID_FIT_REQUEST');
  const preparedReceiptId=requiredText(raw.preparedReceiptId,'preparedReceiptId');
  const payload=normalizeFitPayload(raw.payload),fingerprint=text(raw.payloadFingerprint).toLowerCase();if(!SHA256.test(fingerprint)||await payloadFingerprint(payload)!==fingerprint)throw new MarksmanLoadsBidContractError('Fit payload fingerprint does not match canonical responses.','FIT_PAYLOAD_FINGERPRINT_MISMATCH');
  const vendorId=requiredUuid(raw.vendorId,'vendorId'),eventId=requiredUuid(raw.eventId,'eventId'),laneId=requiredUuid(raw.laneId,'laneId'),invitationId=requiredUuid(raw.invitationId,'invitationId');
  const expectedOperationId=await sha256Hex(stableStringify({effect:'fit',organizationId,vendorId,eventId,laneId,invitationId,preparedReceiptId,fitPayloadFingerprint:fingerprint}));
  if(operationId!==expectedOperationId)throw new MarksmanLoadsBidContractError('operationId does not match the signed Fit scope and content.','OPERATION_ID_MISMATCH');
  const confirmation=object(raw.humanConfirmation),role=text(confirmation.role).toUpperCase(),confirmedAt=text(confirmation.confirmedAt),confirmed=Date.parse(confirmedAt);
  if(!['ADMIN','OPERATOR'].includes(role)||!Number.isFinite(confirmed)||confirmed>now+30_000||confirmed<now-MAX_TTL_MS)throw new MarksmanLoadsBidContractError('Fresh ADMIN or OPERATOR confirmation is required.','HUMAN_CONFIRMATION_REQUIRED',403);
  return{requestId:requiredUuid(envelope.requestId,'requestId'),keyId,issuedAt:new Date(issued).toISOString(),expiresAt:new Date(expires).toISOString(),requestFingerprint:await sha256Hex(stableStringify(unsignedEnvelope(envelope))),body:{action:'resolve_and_save_fit',organizationId,vendorId,eventId,laneId,invitationId,operationId,preparedReceiptId,payloadFingerprint:fingerprint,payload,humanConfirmation:{actorId:requiredText(confirmation.actorId,'humanConfirmation.actorId'),role:role as 'ADMIN'|'OPERATOR',confirmedAt:new Date(confirmed).toISOString()}}};
}

export function reconcileFitPayload(payloadValue:unknown,rowsValue:unknown){
  const expected=normalizeFitPayload(payloadValue).confirmations;
  const rows=Array.isArray(rowsValue)?rowsValue.map(object):[];
  const observed=rows.filter(row=>row.segment_key===expected[0].segment_key&&FIT_RUBRICS.includes(text(row.rubric_key) as typeof FIT_RUBRICS[number])).map(row=>({segment_key:text(row.segment_key),rubric_key:text(row.rubric_key),answer:text(row.answer).toLowerCase(),comment:text(row.comment).slice(0,1200)})).sort((a,b)=>FIT_RUBRICS.indexOf(a.rubric_key as typeof FIT_RUBRICS[number])-FIT_RUBRICS.indexOf(b.rubric_key as typeof FIT_RUBRICS[number]));
  const matches=observed.length===6&&stableStringify(observed)===stableStringify(expected);
  return{matches,expectedCount:6,observedCount:observed.length,segmentKey:expected[0].segment_key};
}

export function canBindFitCommandReadback(command:RecordValue){const result=object(command.result);return command.status==='submitted'&&command.external_execution===true&&command.rateware_fit_submission===true&&Object.prototype.hasOwnProperty.call(result,'canonicalResult');}
export{MARKSMAN_LOADS_PROVIDER};
