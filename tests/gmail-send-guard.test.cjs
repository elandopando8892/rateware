const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{transformSync}=require('esbuild');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/rateware-api/index.ts'),'utf8');
const chunk=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const logic=transformSync(chunk('async function claimOutreachMessageForSend(','async function writeOutreachSentHistory(')+chunk('async function sendOutreachMessages(','async function metaSendWhatsappTemplate('),{loader:'ts',format:'cjs'}).code;
const clone=x=>structuredClone(x);
function database(statuses=['drafted','drafted','drafted']){
 const state={gmail_mailbox_connections:[{id:'connection',owner_email:'owner',mailbox_email:'sender',status:'connected',updated_at:'2026-10-07T00:00:00Z',metadata:{unrelated:'preserved'}}],outreach_messages:statuses.map((status,i)=>({id:'m'+i,owner_email:'owner',status,channel:'email',recipient_email:'test@example.test',sender_email:'sender',campaign_id:null,sent_at:null,manual_sent_at:null,provider_message_id:null}))};
 return {state,from(table){let patch=null,filters=[];const q={select(){return q},update(v){patch=v;return q},eq(k,v){filters.push(r=>k==='metadata'?JSON.stringify(r[k])===v:r[k]===v);return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},order(){return q},not(){return q},async execute(single){const rows=(state[table]||[]).filter(r=>filters.every(f=>f(r)));if(patch)for(const r of rows)Object.assign(r,clone(patch));return {data:clone(single?rows[0]||null:rows),error:null};},maybeSingle(){return q.execute(true)},then(a,b){return q.execute(false).then(a,b)}};return q;}};
}
async function harness(responses){
 const guards=await import('../supabase/functions/rateware-api/gmail-send-guard.mjs');
 const db=database(),calls=[],waits=[],leases=[];
 const globals={...guards,BULK_SEND_LIMIT:100,GMAIL_ALLOWED_SENDER:'sender',OUTREACH_SENDABLE_STATUSES:new Set(['drafted','queued','failed']),cleanText:v=>v==null?null:String(v).trim()||null,objectRecord:v=>v||{},normalizeBulkIds:v=>v,requireBulkConfirmation:()=>{},isQuoteQueueMessage:()=>false,suppressedEmailSet:async()=>new Set(),gmailAccessToken:async()=>'',gmailConnectionIdentity:async()=>({id:'connection'}),gmailRawMessage:m=>m.id,crypto,
  acquireSendLease:async(...args)=>{const l=await guards.acquireSendLease(...args);leases.push(l);return l;},safeOperationalError:e=>e.message||String(e),outreachSendResult:(stage,v)=>({stage,...v}),withOwner:r=>r,writeOutreachSentHistory:async()=>{},writeOutreachDeliveryIssueHistory:async()=>{},messageInvitationIds:()=>[],writeAuditLog:async()=>{},tryWriteAuditLog:async()=>{},
  setTimeout:(fn,ms)=>{waits.push(ms);fn();},fetch:async(url,options)=>{calls.push(JSON.parse(options.body).raw);const response=responses.shift()||{status:200,data:{id:'receipt-'+calls.length}};if(response.throw)throw new Error('Transport lost');return {ok:response.status===200,status:response.status,headers:new Headers(response.headers||{}),json:async()=>response.data};}
 };
 const send=new Function(...Object.keys(globals),logic+'; return sendOutreachMessages;')(...Object.values(globals));
 return {db,calls,waits,leases,send:()=>send(db,{owner_email:'owner',owner_user_id:'u'},{ids:['m0','m1','m2'],confirmed:true})};
}
test('quota classification: 403 quota / 429 pause, ordinary 403 does not; Retry-After respected',async()=>{
 const {quotaPause}=await import('../supabase/functions/rateware-api/gmail-send-guard.mjs');const now=1000000;
 assert.equal(quotaPause(403,{error:{message:'permission denied'}},null,now),null);
 assert.equal(Date.parse(quotaPause(429,{},'600',now)),now+600000);
 assert.equal(Date.parse(quotaPause(403,{error:{errors:[{reason:'userRateLimitExceeded'}]}},null,now)),now+300000);
});
test('only one concurrent mailbox lease; preserved metadata; cooldown blocks later request',async()=>{
 const g=await import('../supabase/functions/rateware-api/gmail-send-guard.mjs'),db=database();
 const results=await Promise.allSettled([g.acquireSendLease(db,'owner','sender',1000,'a'),g.acquireSendLease(db,'owner','sender',1000,'b')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const lease=results.find(r=>r.status==='fulfilled').value;
 await g.finishSendLease(db,'owner',lease,new Date(600000).toISOString(),2000);
 assert.equal(db.state.gmail_mailbox_connections[0].metadata.unrelated,'preserved');
 await assert.rejects(g.acquireSendLease(db,'owner','sender',3000),/quota pause/);
 await assert.rejects(g.acquireSendLease(db,'different-owner','sender'),/unavailable/);
});
test('real send handler stops at quota; remaining messages unchanged and cooldown durable',async()=>{
 const h=await harness([{status:429,data:{error:{message:'Quota exceeded'}},headers:{'retry-after':'600'}}]);
 const r=await h.send();assert.equal(h.calls.length,1);assert.equal(r.failed,1);assert.equal(r.skipped,2);
 assert.deepEqual(h.db.state.outreach_messages.map(r=>r.status),['failed','drafted','drafted']);
 assert.ok(h.db.state.gmail_mailbox_connections[0].metadata.outreach_send_guard.cooldown_until);
 await assert.rejects(h.send(),/quota pause/);assert.equal(h.calls.length,1);
});
test('real send handler stops at uncertain outcome; no automatic resend',async()=>{
 const h=await harness([{throw:true}]);const r=await h.send();
 assert.equal(r.delivery_unknown,1);assert.equal(r.skipped,2);assert.equal(h.calls.length,1);
 assert.equal(h.db.state.outreach_messages[0].status,'delivery_unknown');
});
test('real send handler spaces successful attempts and refuses replayed accepted rows',async()=>{
 const h=await harness([]);const r=await h.send();assert.equal(r.sent,3);assert.equal(h.calls.length,3);assert.equal(h.waits.length,2);
 assert.ok(h.waits.every(ms=>ms>0 && ms<=1500));const replay=await h.send();assert.equal(replay.sent,0);assert.equal(h.calls.length,3);
});
test('a manual queued status cannot resend a row with provider receipt',async()=>{
 const h=await harness([]);h.db.state.outreach_messages[0].status='queued';h.db.state.outreach_messages[0].provider_message_id='already-accepted';
 const r=await h.send();assert.equal(r.sent,2);assert.equal(r.skipped,1);assert.ok(!h.calls.includes('m0'));
});
test('successful HTTP without receipt remains uncertain and stops the batch',async()=>{
 const h=await harness([{status:200,data:{}}]);const r=await h.send();assert.equal(r.delivery_unknown,1);assert.equal(r.skipped,2);assert.equal(h.calls.length,1);
});
