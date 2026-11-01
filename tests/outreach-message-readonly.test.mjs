import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {parse} from '@babel/parser';

// Actual dispatcher branch and token hydration; synthetic query rows and spies
// replace migration, decryption, enrichment, provider diagnostics and WA preview.
// No SDK, credentials, real customer tokens or external service is loaded.
const source=readFileSync(fileURLToPath(new URL('../supabase/functions/rateware-api/index.ts',import.meta.url)),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['typescript']});
const functions=new Map(ast.program.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,n]));
let branch;
function visit(n){if(!n||typeof n!=='object')return;if(n.type==='IfStatement'&&n.test?.type==='BinaryExpression'&&n.test.left?.object?.name==='body'&&n.test.left?.property?.name==='action'&&n.test.right?.value==='get_outreach_message')branch=n;for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}
visit(ast.program);assert.ok(branch);
const code=[...['cleanText','objectRecord','relationRecord','hydrateOutreachInvitationTokens'].map(name=>{const n=functions.get(name);assert.ok(n,name);return source.slice(n.start,n.end);}),
 `async function dispatch(supabase,user,body,claims){const jsonResponse=(data,status=200)=>({data,status});${source.slice(branch.start,branch.end)}throw Error('Unexpected action');}`].join('\n');
const own='org:synthetic-a',foreign='org:synthetic-b';
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture({channel='email',encrypted=false,owner=own,event='synthetic-event',missing=false}={}){
 const migrations=[],decrypted=[],previews=[],queries=[];
 const row={id:'synthetic-message',owner_email:owner,rfx_event_id:event,channel,rfx_lane_vendors:{id:'synthetic-invitation',invitation_token:encrypted?null:'synthetic-legacy-token',invitation_token_encrypted:encrypted?'synthetic-ciphertext':null}};
 const ctx=vm.createContext({OUTREACH_MESSAGE_SELECT:'*',migrateLegacyRfxInvitationToken:async(...args)=>migrations.push(plain(args.slice(1))),
  decryptRfxInvitationToken:async value=>{decrypted.push(value);return value?'synthetic-decoded-token':null;},
  enrichOutreachMessage:row=>row,readLatestOutreachIssue:async()=>({delivery_issue:null}),
  whatsappApprovalHandlers:{review:async(_client,user,message,actor)=>{previews.push({owner:user.owner_email,message:plain(message),actor});return {whatsapp_preview:'synthetic-persisted-preview'};}}});
 vm.runInContext(stripTypeScriptTypes(code),ctx);
 const db={from(table){assert.equal(table,'outreach_messages');const filters=[];const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},async maybeSingle(){queries.push(plain(filters));return {data:!missing&&filters.every(([k,v])=>row[k]===v)?plain(row):null,error:null};}};return q;}};
 const run=async body=>plain(await ctx.dispatch(db,{owner_email:own},{action:'get_outreach_message',id:row.id,...body},{sub:'synthetic-actor'}));
 return {run,ctx,db,row,migrations,decrypted,previews,queries};
}
test('reading a legacy email invitation never invokes token migration',async()=>{
 const f=fixture();const r=await f.run({owner_email:foreign});assert.equal(r.data.row.rfx_lane_vendors.invitation_token,'synthetic-legacy-token');assert.equal(f.migrations.length,0);assert.ok(!Object.hasOwn(r.data.row.rfx_lane_vendors,'invitation_token_encrypted'));
});
test('repeated legacy message reads remain side-effect free',async()=>{
 const f=fixture();await f.run({});await f.run({});assert.equal(f.migrations.length,0);assert.equal(f.row.rfx_lane_vendors.invitation_token,'synthetic-legacy-token');
});
test('encrypted invitation remains readable without persisting its decoded token',async()=>{
 const f=fixture({encrypted:true});const r=await f.run({});assert.equal(r.data.row.rfx_lane_vendors.invitation_token,'synthetic-decoded-token');assert.deepEqual(f.decrypted,['synthetic-ciphertext']);assert.equal(f.migrations.length,0);assert.ok(!Object.hasOwn(r.data.row.rfx_lane_vendors,'invitation_token_encrypted'));
});
test('WhatsApp review keeps the saved row and does not hydrate its invitation',async()=>{
 const f=fixture({channel:'whatsapp'});const r=await f.run({});assert.equal(r.data.row.whatsapp_preview,'synthetic-persisted-preview');assert.equal(f.previews.length,1);assert.equal(f.previews[0].owner,own);assert.equal(f.migrations.length,0);assert.equal(f.decrypted.length,0);
});
test('foreign message is absent despite a forged body owner',async()=>{
 const f=fixture({owner:foreign});const r=await f.run({owner_email:foreign});assert.equal(r.data.row,null);assert.equal(f.migrations.length,0);assert.equal(f.decrypted.length,0);assert.equal(f.previews.length,0);
});
test('optional event scope rejects a message in another event',async()=>{
 const f=fixture();const r=await f.run({rfx_event_id:'foreign-event'});assert.equal(r.data.row,null);assert.equal(f.migrations.length,0);
});
test('missing message performs no token or preview work',async()=>{
 const f=fixture({missing:true});assert.equal((await f.run({})).data.row,null);assert.equal(f.migrations.length,0);assert.equal(f.previews.length,0);
});
test('explicit migration-capable callers preserve the existing hydration default',async()=>{
 const f=fixture();await f.ctx.hydrateOutreachInvitationTokens(f.db,[f.row]);assert.equal(f.migrations.length,1);
});
