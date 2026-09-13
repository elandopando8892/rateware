import {
  MARKSMAN_LOADS_OBSERVATION_VERSION,
  MARKSMAN_LOADS_READBACK_REQUEST_VERSION,
  projectOperationObservation,
  verifyMarksmanLoadsReadbackRequest,
} from '../supabase/functions/_shared/marksman-loads-readback-contract.ts';
import { stableStringify } from '../supabase/functions/_shared/marksman-loads-bid-contract.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const SECRET='0123456789abcdef0123456789abcdef';
const NOW=new Date('2026-09-07T12:00:30.000Z');
const IDS={request:'11111111-1111-4111-8111-111111111111',vendor:'22222222-2222-4222-8222-222222222222',lane:'33333333-3333-4333-8333-333333333333',event:'44444444-4444-4444-8444-444444444444',invitation:'55555555-5555-4555-8555-555555555555',receipt:'66666666-6666-4666-8666-666666666666',staging:'77777777-7777-4777-8777-777777777777'};

async function signature(unsigned: Record<string,unknown>) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stableStringify(unsigned))));
  return [...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
}

async function request(effect:'fit'|'quote'='quote', overrides:Record<string,unknown>={}) {
  const unsigned={contractVersion:MARKSMAN_LOADS_READBACK_REQUEST_VERSION,issuer:'marksman-loads',audience:'rateware',keyId:'read-key',requestId:IDS.request,
    issuedAt:'2026-09-07T12:00:00.000Z',expiresAt:'2026-09-07T12:01:00.000Z',body:{action:'read_operation_observation',organizationId:'carrier-org',vendorId:IDS.vendor,eventId:IDS.event,laneId:IDS.lane,invitationId:IDS.invitation,effect,operationId:'a'.repeat(64),payloadFingerprint:'b'.repeat(64),segmentKey:effect==='fit'?'dry-van':null,queryStartedAt:'2026-09-07T12:00:00.000Z'},...overrides};
  return {...unsigned,signature:await signature(unsigned)};
}

Deno.test('verifies a short-lived read-only request and exact effect scope',async()=>{
  const verified=await verifyMarksmanLoadsReadbackRequest(await request(),{sharedSecret:SECRET,expectedKeyId:'read-key',now:NOW});
  assert(verified.body.effect==='quote'&&verified.body.segmentKey===null,'quote scope should verify');
  const fit=await verifyMarksmanLoadsReadbackRequest(await request('fit'),{sharedSecret:SECRET,expectedKeyId:'read-key',now:NOW});
  assert(fit.body.segmentKey==='dry-van','fit must retain its segment');
});

Deno.test('rejects tampering, stale timestamps and invalid fit/quote shapes',async()=>{
  const tampered=await request(); (tampered.body as Record<string,unknown>).vendorId=IDS.receipt;
  await rejects(tampered,'INVALID_READBACK_SIGNATURE');
  const stale=await request('quote',{expiresAt:'2026-09-07T11:59:00.000Z'}); await rejects(stale,'INVALID_READBACK_TIMESTAMP');
  const bad=await request(); (bad.body as Record<string,unknown>).segmentKey='unexpected';
  const {signature:_signature,...unsigned}=bad; bad.signature=await signature(unsigned); await rejects(bad,'INVALID_READBACK_REQUEST');
});

Deno.test('projects quote and fit receipts without source payloads or credentials',async()=>{
  for(const effect of ['quote','fit'] as const){
    const verified=await verifyMarksmanLoadsReadbackRequest(await request(effect),{sharedSecret:SECRET,expectedKeyId:'read-key',now:NOW});
    const row={id:IDS.receipt,provider:'marksman_loads',external_organization_id:'carrier-org',vendor_id:IDS.vendor,rfx_event_id:IDS.event,rfx_lane_id:IDS.lane,rfx_lane_vendor_id:IDS.invitation,effect,operation_id:'a'.repeat(64),payload_fingerprint:'b'.repeat(64),segment_key:effect==='fit'?'dry-van':null,record_id:IDS.invitation,staging_record_id:effect==='quote'?IDS.staging:null,outcome:'committed',committed_at:'2026-09-07T12:00:10.000Z'};
    const projected=projectOperationObservation(verified,row,'2026-09-07T12:00:31.000Z');
    const encoded=JSON.stringify(projected);const observation=projected.observation as Record<string,unknown>;
    assert(projected.status==='observed'&&observation.contractVersion===MARKSMAN_LOADS_OBSERVATION_VERSION,'receipt should project');
    assert(!/token|signature|quote payload/i.test(encoded),'observation must stay payload-minimized');
    if(effect==='quote') assert((observation.staging as Record<string,unknown>).recordId===IDS.staging,'quote must expose bound staging evidence');
    else assert(!('staging' in observation),'fit must not invent staging');
  }
});

Deno.test('absence is not rejection and a mismatched stored scope fails closed',async()=>{
  const verified=await verifyMarksmanLoadsReadbackRequest(await request(),{sharedSecret:SECRET,expectedKeyId:'read-key',now:NOW});
  assert(projectOperationObservation(verified,null,'2026-09-07T12:00:31.000Z').status==='not_observed','missing evidence must remain explicit');
  let code='';try{projectOperationObservation(verified,{provider:'marksman_loads'},'2026-09-07T12:00:31.000Z');}catch(error){code=(error as {code?:string}).code||'';}
  assert(code==='READBACK_SCOPE_MISMATCH','mismatched persisted evidence must fail closed');
});

Deno.test('invalid receipt chronology cannot become confirmed evidence',async()=>{
  const verified=await verifyMarksmanLoadsReadbackRequest(await request(),{sharedSecret:SECRET,expectedKeyId:'read-key',now:NOW});
  const row={id:IDS.receipt,provider:'marksman_loads',external_organization_id:'carrier-org',vendor_id:IDS.vendor,rfx_event_id:IDS.event,rfx_lane_id:IDS.lane,rfx_lane_vendor_id:IDS.invitation,effect:'quote',operation_id:'a'.repeat(64),payload_fingerprint:'b'.repeat(64),segment_key:null,record_id:IDS.invitation,staging_record_id:IDS.staging,outcome:'committed',committed_at:'2026-09-07T12:00:40.000Z'};
  let code='';try{projectOperationObservation(verified,row,'2026-09-07T12:00:31.000Z');}catch(error){code=(error as {code?:string}).code||'';}
  assert(code==='READBACK_RECORD_INVALID','receipt after the read must fail closed');
});

async function rejects(envelope:Record<string,unknown>,code:string){let observed='';try{await verifyMarksmanLoadsReadbackRequest(envelope,{sharedSecret:SECRET,expectedKeyId:'read-key',now:NOW});}catch(error){observed=(error as {code?:string}).code||'';}assert(observed===code,`expected ${code}, received ${observed}`);}
