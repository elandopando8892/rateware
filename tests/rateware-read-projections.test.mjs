import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import {forwardSourceDownload} from '../supabase/functions/_shared/source-download-routing.mjs';

// Real branch text, query helpers and WhatsApp projection; synthetic DB/signer/
// transport only. This does not replace Auth/RLS or certify a production session.
const source=readFileSync(fileURLToPath(new URL('../supabase/functions/rateware-api/index.ts',import.meta.url)),'utf8');
const whatsapp=readFileSync(fileURLToPath(new URL('../supabase/functions/rateware-api/whatsapp-queue-evidence.ts',import.meta.url)),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['typescript']});
const functions=new Map(ast.program.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,n]));
const constants=new Map(ast.program.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations.map(d=>[d.id.name,n])));
const wanted=['get_rate_row_detail','get_upload_source_url','list_contact_history','list_rfx_invitation_wave_reviews'];
const branches=new Map();
function visit(n){if(!n||typeof n!=='object')return;if(n.type==='IfStatement'&&n.test?.type==='BinaryExpression'&&n.test.left?.object?.name==='body'&&n.test.left?.property?.name==='action'&&wanted.includes(n.test.right?.value))branches.set(n.test.right.value,n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
visit(ast.program);
const selected=[...['cleanText','objectRecord','requireOwnedRfxEvent','currentRfxCarrierReviews'].map(name=>{const n=functions.get(name);assert.ok(n,name);return source.slice(n.start,n.end);}),
 ...['UUID_PATTERN','RATE_ROW_RESPONSE_COLUMNS','RATE_ROW_RESPONSE_SELECT','RATE_ROW_RESPONSE_WITH_LEGS_SELECT'].map(name=>{const n=constants.get(name);assert.ok(n,name);return source.slice(n.start,n.end);}),
 whatsapp.replace(/^export /gm,''),
 `async function dispatch(supabase,user,body,request){const jsonResponse=(data,status=200)=>({data,status});${wanted.map(name=>{const n=branches.get(name);assert.ok(n,name);return source.slice(n.start,n.end);}).join('\n')}throw Error('Unexpected test action');}`].join('\n');
const own='org:synthetic-a',foreign='org:synthetic-b';
const event='00000000-0000-4000-8000-000000000001',otherEvent='00000000-0000-4000-8000-000000000002',message='00000000-0000-4000-8000-000000000003';
const plain=v=>JSON.parse(JSON.stringify(v));
const value=(row,key)=>key.replace(/->>?/g,'.').split('.').reduce((v,k)=>v?.[k],row);
function fields(text){let depth=0,start=0,out=[];for(let i=0;i<text.length;i++){if(text[i]==='(')depth++;if(text[i]===')')depth--;if(text[i]===','&&!depth){out.push(text.slice(start,i));start=i+1;}}return [...out,text.slice(start)].map(s=>s.trim());}
function project(row,columns){const out={};for(const f of fields(columns)){if(f==='*'){Object.assign(out,plain(row));continue;}const nested=f.match(/^([^()]+)\((.*)\)$/s);if(nested){out[nested[1]]=plain(row[nested[1]]??null);continue;}const [alias,expr]=f.includes(':')?f.split(':'):[f,f];out[alias]=plain(value(row,expr)??null);}return out;}
function fixture(){
 const tables={rate_staging:[{id:'rate',owner_email:own,status:'approved',origin:'Origin',extracted_payload:{bid:{transit_days:2},private_unrelated:'do-not-return'}}],
  raw_uploads:[{id:'file',owner_email:own,storage_provider:'supabase',storage_bucket:'stored-bucket',storage_path:'stored-path',original_filename:'synthetic.pdf',mime_type:'application/pdf'}],
  rfx_events:[{id:event,owner_email:own},{id:otherEvent,owner_email:foreign}],
  outreach_messages:[{id:message,owner_email:own,rfx_event_id:event,channel:'whatsapp'}],
  contact_history:[{id:'history',owner_email:own,channel:'email',vendor_id:'vendor',occurred_at:'2026-10-01',metadata:{}},{id:'foreign-history',owner_email:foreign,channel:'email',occurred_at:'2026-10-02',metadata:{}}],
  saas_audit_log:[{id:'old',owner_email:own,entity_type:'rfx_event_carrier_review',created_at:'2026-10-01',action:'rfx.invitation_carrier.reviewed',metadata:{rfx_event_id:event,vendor_id:'vendor'}},
   {id:'new',owner_email:own,entity_type:'rfx_event_carrier_review',created_at:'2026-10-02',action:'rfx.invitation_carrier.review_revoked',metadata:{rfx_event_id:event,vendor_id:'vendor'}},
   {id:'foreign',owner_email:foreign,entity_type:'rfx_event_carrier_review',created_at:'2026-10-03',action:'rfx.invitation_carrier.reviewed',metadata:{rfx_event_id:event,vendor_id:'foreign-vendor'}}]};
 const queries=[],signatures=[],transports=[],writes=[];let downstreamStatus=200;
 const db={from(table){assert.ok(Object.hasOwn(tables,table),table);const filters=[],orders=[];let columns='*',single=false,start=0,end,queryError=null;const q={
  select(c='*'){columns=c;return q;},eq(k,v){filters.push([k,'eq',v]);return q;},is(k,v){filters.push([k,'eq',v]);return q;},contains(k,v){filters.push([k,'contains',v]);return q;},order(k,opts={}){orders.push([k,opts.ascending!==false]);return q;},range(a,b){start=a;end=b+1;return q;},limit(n){end=n;return q;},maybeSingle(){single=true;return q;},
  insert(){writes.push(table);throw Error('WRITE FORBIDDEN');},update(){writes.push(table);throw Error('WRITE FORBIDDEN');},upsert(){writes.push(table);throw Error('WRITE FORBIDDEN');},delete(){writes.push(table);throw Error('WRITE FORBIDDEN');},
  then(ok,bad){return Promise.resolve().then(()=>{queries.push({table,columns,filters:plain(filters),start,end});let rows=tables[table].filter(r=>filters.every(([k,op,v])=>op==='eq'?value(r,k)===v:Object.entries(v).every(([a,b])=>value(r,k)?.[a]===b)));const count=rows.length;rows=[...rows].sort((a,b)=>{for(const [k,asc]of orders){const d=String(value(a,k)??'').localeCompare(String(value(b,k)??''));if(d)return asc?d:-d;}return 0;}).slice(start,end).map(r=>project(r,columns));return {data:single?rows[0]??null:rows,count,error:queryError};}).then(ok,bad);}};return q;},
  storage:{from(bucket){return {async createSignedUrl(path,seconds,options){signatures.push({bucket,path,seconds,options:plain(options)});return {data:{signedUrl:'https://fixture.invalid/signed'},error:null};}};}}};
 const context=vm.createContext({SUPABASE_URL:'https://fixture.invalid',forwardSourceDownload:(request,body,url)=>forwardSourceDownload(request,body,url,async(target,init)=>{transports.push({target:String(target),headers:init.headers,body:JSON.parse(init.body)});return Response.json(downstreamStatus===200?{url:'https://fixture.invalid/oracle-signed',expires_in_seconds:600,filename:'synthetic.pdf'}:{error:'private provider detail'},{status:downstreamStatus});})});
 vm.runInContext(stripTypeScriptTypes(selected),context);
 const run=async(action,body={})=>plain(await context.dispatch(db,{owner_email:own},{action,...body},new Request('https://fixture.invalid',{headers:{Authorization:'Bearer synthetic-only'}})));
 return {run,tables,queries,signatures,transports,writes,setDownstreamStatus:v=>downstreamStatus=v};
}
test('rate detail returns the saved duration without the whole extraction payload',async()=>{const f=fixture();const r=await f.run(wanted[0],{id:'rate',owner_email:foreign});assert.equal(r.data.row.transit_days,2);assert.equal(r.data.row.origin,'Origin');assert.ok(!Object.hasOwn(r.data.row,'extracted_payload'));assert.ok(!JSON.stringify(r).includes('do-not-return'));assert.equal(f.writes.length,0);});
for(const duration of [-1,'3',null])test(`non-numeric or negative saved duration ${duration} is null`,async()=>{const f=fixture();f.tables.rate_staging[0].extracted_payload.bid.transit_days=duration;assert.equal((await f.run(wanted[0],{id:'rate'})).data.row.transit_days,null);});
test('foreign or differently-stated rate is absent',async()=>{const f=fixture();await assert.rejects(f.run(wanted[0],{id:'rate',status:'rejected'}),e=>e.code==='404');f.tables.rate_staging[0].owner_email=foreign;await assert.rejects(f.run(wanted[0],{id:'rate',owner_email:foreign}),e=>e.code==='404');assert.equal(f.writes.length,0);});
test('missing rate id is rejected before querying',async()=>{const f=fixture();assert.equal((await f.run(wanted[0])).status,400);assert.equal(f.queries.length,0);});
test('normal contact history preserves owner scope and bounded pagination',async()=>{const f=fixture();const r=await f.run(wanted[2],{owner_email:foreign,limit:99999});assert.deepEqual(r.data.rows.map(r=>r.id),['history']);assert.equal(r.data.total,1);assert.equal(r.data.limit,1000);assert.equal(f.queries[0].end,1000);assert.equal(f.writes.length,0);});
test('normal history optional filters cannot select a foreign contact',async()=>{const f=fixture();const r=await f.run(wanted[2],{vendor_id:'foreign-vendor'});assert.equal(r.data.total,0);assert.equal(r.data.limit,300);});
test('review history resolves latest revocation inside the owned event',async()=>{const f=fixture();const r=await f.run(wanted[3],{rfx_event_id:event,owner_email:foreign});assert.equal(r.data.rows.length,1);assert.equal(r.data.rows[0].reviewed,false);assert.equal(r.data.rows[0].id,'new');assert.equal(f.writes.length,0);});
test('foreign event is rejected before reading review evidence',async()=>{const f=fixture();await assert.rejects(f.run(wanted[3],{event_id:otherEvent}),e=>e.code==='404');assert.deepEqual(f.queries.map(q=>q.table),['rfx_events']);});
test('invalid event id is rejected before querying',async()=>{const f=fixture();assert.equal((await f.run(wanted[3],{event_id:'invalid'})).status,400);assert.equal(f.queries.length,0);});
test('oversized review history fails closed without truncating an apparent success',async()=>{const f=fixture();f.tables.saas_audit_log=Array.from({length:5001},(_,i)=>({...f.tables.saas_audit_log[0],id:String(i)}));await assert.rejects(f.run(wanted[3],{event_id:event}),/safe read limit/);assert.equal(f.writes.length,0);});
test('pending WhatsApp evidence is scoped and removes private callback metadata',async()=>{const f=fixture();f.tables.contact_history.push({id:'pending',owner_email:own,channel:'whatsapp',rfx_event_id:null,outreach_message_id:null,direction:'inbound',body_preview:'Synthetic',metadata:{association:{state:'pending',reason:'unmatched'},callback:{status:'received',credential:'do-not-return'},received_at:'2026-10-02',from_phone:'+525555555555',private_payload:'do-not-return'}});const r=await f.run(wanted[2],{whatsapp_view:'pending',owner_email:foreign});assert.equal(r.data.rows.length,1);assert.equal(r.data.rows[0].id,'pending');assert.ok(!JSON.stringify(r).includes('do-not-return'));assert.ok(!Object.hasOwn(r.data.rows[0],'owner_email'));assert.equal(f.writes.length,0);});
test('WhatsApp message scope rejects a foreign message before reading history',async()=>{const f=fixture();f.tables.outreach_messages[0].owner_email=foreign;assert.equal((await f.run(wanted[2],{whatsapp_view:'message',rfx_event_id:event,outreach_message_id:message})).status,404);assert.deepEqual(f.queries.map(q=>q.table),['outreach_messages']);});
test('WhatsApp message evidence accepts only the same owner/event/message/channel',async()=>{const f=fixture();f.tables.contact_history.push({id:'matched',owner_email:own,channel:'whatsapp',rfx_event_id:event,outreach_message_id:message,metadata:{}});const r=await f.run(wanted[2],{whatsapp_view:'message',rfx_event_id:event,outreach_message_id:message});assert.deepEqual(r.data.rows.map(r=>r.id),['matched']);assert.equal(r.data.scope.rfx_event_id,event);});
test('invalid WhatsApp view and pagination fail before database access',async()=>{for(const body of [{whatsapp_view:'unknown'},{whatsapp_view:'pending',limit:51},{whatsapp_view:'pending',offset:-1},{whatsapp_view:'pending',vendor_id:'forged'}]){const f=fixture();assert.equal((await f.run(wanted[2],body)).status,400);assert.equal(f.queries.length,0);}});
test('Supabase signing uses stored path, name and expiry rather than body overrides',async()=>{const f=fixture();const r=await f.run(wanted[1],{id:'file',owner_email:foreign,storage_bucket:'forged',storage_path:'forged',storage_provider:'oracle_s3'});assert.equal(r.data.expires_in_seconds,600);assert.deepEqual(f.signatures,[{bucket:'stored-bucket',path:'stored-path',seconds:600,options:{download:'synthetic.pdf'}}]);assert.equal(f.transports.length,0);assert.equal(f.writes.length,0);});
test('foreign file is absent without signing or forwarding',async()=>{const f=fixture();f.tables.raw_uploads[0].owner_email=foreign;assert.equal((await f.run(wanted[1],{id:'file',owner_email:foreign})).status,404);assert.equal(f.signatures.length,0);assert.equal(f.transports.length,0);});
test('missing file storage location is not signed',async()=>{const f=fixture();f.tables.raw_uploads[0].storage_path=null;assert.equal((await f.run(wanted[1],{id:'file'})).status,404);assert.equal(f.signatures.length,0);});
test('Oracle file uses the existing bearer-preserving route and whitelisted identifiers',async()=>{const f=fixture();f.tables.raw_uploads[0].storage_provider='oracle_s3';const r=await f.run(wanted[1],{id:'file',owner_email:foreign,storage_path:'forged'});assert.equal(r.status,200);assert.equal(f.signatures.length,0);assert.equal(f.transports.length,1);assert.equal(f.transports[0].headers.Authorization,'Bearer synthetic-only');assert.deepEqual(f.transports[0].body,{action:wanted[1],id:'file'});});
test('Oracle denial remains a denial without Supabase signing fallback',async()=>{const f=fixture();f.tables.raw_uploads[0].storage_provider='oracle_s3';f.setDownstreamStatus(403);const r=await f.run(wanted[1],{id:'file'});assert.equal(r.status,403);assert.equal(f.signatures.length,0);assert.ok(!JSON.stringify(r).includes('private provider detail'));});
