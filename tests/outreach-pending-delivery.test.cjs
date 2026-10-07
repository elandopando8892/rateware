const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync(process.env.RATEWARE_SOURCE||path.join(__dirname,'../supabase/functions/rateware-api/index.ts'),'utf8');
const start=source.indexOf('function outreachMessageTrackingState('),end=source.indexOf('function outreachDedupeContactKey(',start);
assert.ok(start>=0&&end>start);
const classifiers=new Function('objectRecord','relationRecord','cleanText','hasSubmittedCarrierBid',stripTypeScriptTypes(source.slice(start,end))+';return {track:outreachMessageDeliveryState,carrier:outreachMessageTrackingState};')(
 v=>v&&typeof v==='object'?v:{},v=>Array.isArray(v)?v[0]||{}:v||{},v=>v==null?null:String(v).trim()||null,v=>v!=null&&String(v).trim()!==''&&Number.isFinite(Number(v))&&Number(v)>0);
const {track,carrier}=classifiers;
const quoted={invitation_status:'quoted',bid_rate:1650,responded_at:'2026-10-07T10:00:00Z'};
test('carrier classifier preserves quotation for auto-draft dedupe and audience aggregates',()=>assert.equal(carrier({status:'drafted',rfx_lane_vendors:quoted}),'quoted'));
test('actual message projection exposes draft and preserves original message fields',()=>{
 const a=source.indexOf('function enrichOutreachMessage('),b=source.indexOf('function outreachCarrierKey(',a);
 assert.ok(a>0&&b>a);
 const enrich=new Function('outreachMessageDeliveryState','outreachMessageTrackingState','outreachContactKey','outreachNextAction','outreachOutcomeReason',stripTypeScriptTypes(source.slice(a,b))+';return enrichOutreachMessage;')(track,carrier,()=>'',()=>'',()=>'');
 const message={id:'question',status:'drafted',rfx_lane_vendors:quoted,metadata:{source:'bid_room_carrier_ask'}};
 assert.equal(enrich(message).tracking_state,'drafted');assert.equal(enrich(message).id,'question');assert.equal(message.tracking_state,undefined);
 assert.equal(enrich({...message,status:'sent',sent_at:'2026-10-07T10:00:00Z'}).tracking_state,'quoted');
});
for(const status of ['drafted','queued','sending'])test('unsent '+status+' remains actionable after carrier quotes',()=>assert.equal(track({status,rfx_lane_vendors:quoted,metadata:{source:'bid_room_carrier_ask'}}),status));
test('array relation does not hide a question draft',()=>assert.equal(track({status:'drafted',rfx_lane_vendors:[quoted]}),'drafted'));
test('quoted carrier does not hide a confirmed quota rejection queued for explicit retry',()=>assert.equal(track({status:'queued',delivery_error:'Quota exceeded',failed_at:'2026-10-07T10:00:00Z',rfx_lane_vendors:quoted}),'queued'));
test('summary and drafted filter include unsent questions but retain sent quote status',()=>{
 const messages=[{status:'drafted',rfx_lane_vendors:quoted},{status:'drafted',rfx_lane_vendors:quoted},{status:'sent',sent_at:'2026-10-07T10:00:00Z',provider_message_id:'receipt',rfx_lane_vendors:quoted}];
 assert.equal(messages.filter(m=>track(m)==='drafted').length,2);
 assert.deepEqual(messages.reduce((r,m)=>(r[track(m)]=(r[track(m)]||0)+1,r),{}),{drafted:2,quoted:1});
});
for(const receipt of ['sent_at','manual_sent_at','provider_message_id'])test(receipt+' prevents returning a previously delivered message to drafted',()=>assert.equal(track({status:'drafted',[receipt]:'stored-evidence',rfx_lane_vendors:quoted}),'quoted'));
test('ordinary sent, quoted, archived, and failed messages retain their existing classifications',()=>{
 assert.equal(track({status:'sent',rfx_lane_vendors:quoted}),'quoted');
 assert.equal(track({status:'sent'}),'sent');assert.equal(track({status:'archived'}),'archived');assert.equal(track({status:'failed'}),'failed');
});
test('empty, null, and zero bids do not invent a quotation',()=>{
 for(const bid_rate of ['',null,0])assert.equal(track({status:'drafted',rfx_lane_vendors:{bid_rate}}),'drafted');
});
