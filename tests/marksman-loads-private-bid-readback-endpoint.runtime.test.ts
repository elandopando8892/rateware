import { MARKSMAN_LOADS_READBACK_REQUEST_VERSION } from '../supabase/functions/_shared/marksman-loads-readback-contract.ts';
import { stableStringify } from '../supabase/functions/_shared/marksman-loads-bid-contract.ts';

function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}
const SECRET='0123456789abcdef0123456789abcdef';
const NOW=new Date('2026-09-07T12:00:30.000Z');
const ID={org:'99999999-9999-4999-8999-999999999999',vendor:'22222222-2222-4222-8222-222222222222',lane:'33333333-3333-4333-8333-333333333333',event:'44444444-4444-4444-8444-444444444444',invitation:'55555555-5555-4555-8555-555555555555',receipt:'66666666-6666-4666-8666-666666666666',staging:'77777777-7777-4777-8777-777777777777'};

async function envelope(effect:'fit'|'quote'='quote'){
  const unsigned={contractVersion:MARKSMAN_LOADS_READBACK_REQUEST_VERSION,issuer:'marksman-loads',audience:'rateware',keyId:'read-key',requestId:'11111111-1111-4111-8111-111111111111',issuedAt:'2026-09-07T12:00:00.000Z',expiresAt:'2026-09-07T12:01:00.000Z',body:{action:'read_operation_observation',organizationId:'carrier-org',vendorId:ID.vendor,eventId:ID.event,laneId:ID.lane,invitationId:ID.invitation,effect,operationId:'a'.repeat(64),payloadFingerprint:'b'.repeat(64),segmentKey:effect==='fit'?'dry-van':null,queryStartedAt:'2026-09-07T12:00:00.000Z'}};
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stableStringify(unsigned))));
  return {...unsigned,signature:[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('')};
}

class Query{
  rows:Record<string,unknown>[];filters:Array<(row:Record<string,unknown>)=>boolean>=[];maximum:number|null=null;
  constructor(rows:Record<string,unknown>[]){this.rows=rows;}
  select(){return this;}
  eq(key:string,value:unknown){this.filters.push(row=>row[key]===value);return this;}
  is(key:string,value:unknown){this.filters.push(row=>row[key]===value);return this;}
  limit(value:number){this.maximum=value;return this;}
  data(){const rows=this.rows.filter(row=>this.filters.every(filter=>filter(row)));return this.maximum==null?rows:rows.slice(0,this.maximum);}
  async maybeSingle(){const rows=this.data();return rows.length>1?{data:null,error:{message:'multiple rows'}}:{data:rows[0]||null,error:null};}
  then(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown){return Promise.resolve({data:this.data(),error:null}).then(resolve,reject);}
}
function fixtureClient(includeReceipt=true){
  const tables:Record<string,Record<string,unknown>[]>={
    external_organization_links:[{provider:'marksman_loads',external_organization_id:'carrier-org',organization_id:ID.org,status:'active',reviewed_at:'2026-09-01T00:00:00Z',reviewed_by_user_id:'reviewer',review_note:'approved'}],
    workspace_registry:[{organization_id:'sales@heymarksman.com',organization_uuid:ID.org}],
    rfx_lane_vendors:[{id:ID.invitation,vendor_id:ID.vendor,rfx_event_id:ID.event,rfx_lane_id:ID.lane}],
    vendors:[{id:ID.vendor,organization_id:'sales@heymarksman.com'}],
    rfx_events:[{id:ID.event,organization_id:'sales@heymarksman.com'}],
    rfx_lanes:[{id:ID.lane,rfx_event_id:ID.event}],
    rate_staging:[{id:ID.staging}],
    marksman_loads_operation_receipts:includeReceipt?[{id:ID.receipt,provider:'marksman_loads',external_organization_id:'carrier-org',organization_id:ID.org,workspace_organization_id:'sales@heymarksman.com',vendor_id:ID.vendor,rfx_event_id:ID.event,rfx_lane_id:ID.lane,rfx_lane_vendor_id:ID.invitation,effect:'quote',operation_id:'a'.repeat(64),payload_fingerprint:'b'.repeat(64),segment_key:null,record_id:ID.invitation,staging_record_id:ID.staging,outcome:'committed',committed_at:'2026-09-07T12:00:10.000Z'}]:[],
  };
  return{from(name:string){return new Query(tables[name]||[]);}};
}

const originalServe=Deno.serve;
Object.defineProperty(Deno,'serve',{configurable:true,value:()=>({})});
const endpoint=await import('../supabase/functions/rfx-internal-bid-read-api/index.ts');
Object.defineProperty(Deno,'serve',{configurable:true,value:originalServe});

function handler(client:ReturnType<typeof fixtureClient>,enabled=true){return endpoint.createRfxInternalBidReadHandler({getClient:()=>client as never,readEnabled:enabled,sharedSecret:SECRET,keyId:'read-key',now:()=>NOW});}
function post(body:unknown){return new Request('https://rateware.test/rfx-internal-bid-read-api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}

Deno.test('readback endpoint has no browser route and stays disabled before database access',async()=>{
  let opened=false;const disabled=handler({from(){opened=true;throw new Error('must not open');}} as never,false);
  const options=await disabled(new Request('https://rateware.test/read',{method:'OPTIONS'}));
  assert(options.status===405&&!options.headers.get('access-control-allow-origin'),'browser preflight must stay closed');
  const response=await disabled(post(await envelope()));const body=await response.json();
  assert(response.status===503&&body.code==='READBACK_DISABLED'&&!opened,'disabled request must stop before storage');
});

Deno.test('readback returns an operation-bound quote and independently observed staging record',async()=>{
  const response=await handler(fixtureClient())(post(await envelope()));const body=await response.json();
  assert(response.status===200&&body.status==='observed','quote receipt should be observed');
  assert(body.observation.scope.vendorId===ID.vendor&&body.observation.scope.invitationId===ID.invitation,'carrier scope must be exact');
  assert(body.observation.staging.recordId===ID.staging&&body.observation.operationId==='a'.repeat(64),'staging must bind to the operation');
  assert(!/token|signature|secret/i.test(JSON.stringify(body)),'response must contain no credential material');
});

Deno.test('missing fit evidence is explicit and never reported as rejection',async()=>{
  const response=await handler(fixtureClient())(post(await envelope('fit')));const body=await response.json();
  assert(response.status===200&&body.status==='not_observed'&&body.observation===null,'missing fit receipt must stay unknown');
});

Deno.test('wrong invitation scope cannot read another operation receipt',async()=>{
  const wrong=await envelope();(wrong.body as Record<string,unknown>).invitationId='88888888-8888-4888-8888-888888888888';
  const unsigned={...wrong};delete (unsigned as Record<string,unknown>).signature;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(stableStringify(unsigned))));wrong.signature=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
  const response=await handler(fixtureClient())(post(wrong));const body=await response.json();
  assert(response.status===404&&body.code==='PRIVATE_INVITATION_NOT_FOUND','wrong scope must fail before receipt query');
  assert(!JSON.stringify(body).includes(ID.receipt),'another receipt must not leak');
});

Deno.test('endpoint source never selects invitation credentials or exposes CORS',async()=>{
  const source=await Deno.readTextFile(new URL('../supabase/functions/rfx-internal-bid-read-api/index.ts',import.meta.url));
  assert(!/invitation_token|corsHeaders|access-control-allow-origin/.test(source),'read endpoint must not expose bearer credentials or browser CORS');
  assert(source.includes("MARKSMAN_LOADS_BID_READ_ENABLED")&&source.includes("=== 'true'"),'read capability requires exact opt-in');
});
