import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import {createRfxProjectOnce,projectOperationId,readRfxProjectCreationReceipt} from '../supabase/functions/rateware-api/rfx-project-create.mjs';

// Execute the actual two dispatch branches and normalization/ownership helpers.
// Auth, role policy, audit persistence, SDK, RLS and provider transport are outside
// this synthetic unit. No credentials, network or persistent database are loaded.
const source=readFileSync(fileURLToPath(new URL('../supabase/functions/rateware-api/index.ts',import.meta.url)),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['typescript']});
const functions=new Map(ast.program.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,n]));
const constants=new Map(ast.program.body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations.map(d=>[d.id.name,n])));
const branches=new Map();
function visit(n){
 if(!n||typeof n!=='object')return;
 if(n.type==='IfStatement'&&n.test?.type==='BinaryExpression'&&n.test.operator==='==='&&n.test.left?.object?.name==='body'&&n.test.left?.property?.name==='action')branches.set(n.test.right.value,n);
 for(const value of Object.values(n))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
}
visit(ast.program);
const actions=['create_rfx_process_project','get_rfx_process_project'];
const code=[...['RFX_PROCESS_SEGMENTS','RFX_PROCESS_STATUSES','RFX_PROCESS_OPPORTUNITY_TYPES','UUID_PATTERN'].map(name=>{const n=constants.get(name);assert.ok(n,name);return source.slice(n.start,n.end);}),
 ...['cleanText','cleanDate','objectRecord','withOwner','normalizeRfxProcessSegments','normalizeRfxProjectInput','requireOwnedShipper','requireOwnedRfxProcessProject','getRfxProcessProjectDetail'].map(name=>{const n=functions.get(name);assert.ok(n,name);return source.slice(n.start,n.end);}),
 `async function dispatch(supabase,user,body,request){let operationId=null;const jsonResponse=(data,status=200)=>({status,data});${actions.map(name=>{const n=branches.get(name);assert.ok(n,name);return source.slice(n.start,n.end);}).join('\n')}throw Error('Unexpected test action');}`].join('\n');
const own='org:synthetic-a',foreign='org:synthetic-b';
const operation='00000000-0000-4000-8000-000000000001';
const shipper='00000000-0000-4000-8000-000000000002';
const user={owner_email:own,owner_user_id:'verified-user',organization_id:'synthetic-a'};
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture({race=false}={}){
 const tables={rfx_projects:[],shippers:[{id:shipper,owner_email:own}]},queries=[],writes=[],audits=[];let sequence=0;
 const client={from(table){
  const filters=[];let payload=null,columns='*',single=false,required=false,executed;
  const q={select(c='*'){columns=c;return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},maybeSingle(){single=true;return q;},single(){single=true;required=true;return q;},
   insert(row){assert.equal(table,'rfx_projects','only synthetic project inserts permitted');payload=plain(row);return q;},
   then(ok,bad){executed??=Promise.resolve().then(()=>{
    queries.push({table,filters:plain(filters),write:Boolean(payload)});
    if(payload){
     const row={...payload,id:'synthetic-project-'+(++sequence)};
     if(race&&payload.operation_id){race=false;tables.rfx_projects.push(row);return {data:null,error:{code:'23505'}};}
     tables.rfx_projects.push(row);writes.push(plain(row));return {data:plain(row),error:null};
    }
    const rows=(tables[table]||[]).filter(r=>filters.every(([k,v])=>r[k]===v)).map(r=>columns==='*'?plain(r):Object.fromEntries(columns.split(',').map(k=>[k,r[k]??null])));
    return {data:single?rows[0]??null:rows,error:single&&(rows.length>1||required&&!rows.length)?{code:'PGRST116'}:null};
   });return executed.then(ok,bad);}};return q;
 }};
 const context=vm.createContext({createRfxProjectOnce,projectOperationId,readRfxProjectCreationReceipt,crypto:webcrypto,TextEncoder,
  writeRfxProcessAudit:async(...args)=>audits.push(plain(args.slice(1))),
  decryptRfxMagicLinkToken:()=>{throw Error('Unexpected token access');}});
 vm.runInContext(stripTypeScriptTypes(code),context);
 const run=async(action,body={},headers={},verified=user)=>plain(await context.dispatch(client,verified,{action,...body},{headers:new Headers(headers)}));
 return {run,tables,queries,writes,audits};
}
test('verified owner replaces forged ownership even without an operation id',async()=>{
 const f=fixture();const result=await f.run(actions[0],{project:{title:'Synthetic',owner_email:foreign,owner_user_id:'forged',organization_id:'foreign'}});
 assert.equal(result.data.row.owner_email,own);assert.equal(result.data.row.organization_id,user.organization_id);assert.equal(result.data.row.owner_user_id,user.owner_user_id);assert.equal(f.writes.length,1);
});
test('same operation and normalized payload reuses the owned project',async()=>{
 const f=fixture(),body={operation_id:operation,project:{title:'Synthetic',customer_id:shipper}};
 const first=await f.run(actions[0],body);const second=await f.run(actions[0],body);
 assert.equal(first.data.row.id,second.data.row.id);assert.equal(second.data.idempotent,true);assert.equal(f.writes.length,1);
});
test('a changed payload with the same operation is rejected without another insert',async()=>{
 const f=fixture();await f.run(actions[0],{operation_id:operation,project:{title:'First'}});
 await assert.rejects(f.run(actions[0],{operation_id:operation,project:{title:'Different'}}),e=>e.code==='409');assert.equal(f.writes.length,1);
});
test('unique-conflict recovery rereads the verified owner and operation',async()=>{
 const f=fixture({race:true});const result=await f.run(actions[0],{operation_id:operation,project:{title:'Synthetic'}});
 assert.equal(result.data.idempotent,true);assert.equal(f.tables.rfx_projects.length,1);
 assert.equal(f.queries.filter(q=>q.table==='rfx_projects'&&!q.write&&q.filters.some(([k,v])=>k==='owner_email'&&v===own)&&q.filters.some(([k,v])=>k==='operation_id'&&v===operation)).length,2);
});
test('the same operation in another workspace cannot reuse its project',async()=>{
 const f=fixture(),body={operation_id:operation,project:{title:'Synthetic'}};const first=await f.run(actions[0],body);
 const second=await f.run(actions[0],body,{}, {...user,owner_email:foreign,organization_id:'synthetic-b'});
 assert.notEqual(first.data.row.id,second.data.row.id);assert.equal(f.writes.length,2);assert.equal(second.data.row.owner_email,foreign);
});
test('foreign shipper is rejected before any project write or audit',async()=>{
 const f=fixture();f.tables.shippers[0].owner_email=foreign;
 await assert.rejects(f.run(actions[0],{project:{title:'Synthetic',customer_id:shipper}}));assert.equal(f.writes.length,0);assert.equal(f.audits.length,0);
});
test('dry run reads the owned shipper and performs no project write or audit',async()=>{
 const f=fixture();const result=await f.run(actions[0],{dry_run:true,customer_id:shipper,owner_email:foreign});
 assert.equal(result.data.allowed,true);assert.equal(f.writes.length,0);assert.equal(f.audits.length,0);
});
test('conflicting operation ids are rejected before database access',async()=>{
 const f=fixture();await assert.rejects(f.run(actions[0],{operation_id:operation,project:{title:'Synthetic'}},{'x-operation-id':'00000000-0000-4000-8000-000000000099'}),e=>e.code==='400');assert.equal(f.queries.length,0);
});
test('receipt reads the verified owner, ignores body ownership and does not write',async()=>{
 const f=fixture(),project={title:'Synthetic',customer_id:shipper};const created=await f.run(actions[0],{operation_id:operation,project});const n=f.writes.length;
 const result=await f.run(actions[1],{operation_id:operation,project:{...project,owner_email:foreign},owner_email:foreign});
 assert.equal(result.data.receipt.projectId,created.data.row.id);assert.equal(f.writes.length,n);
});
test('foreign operation receipt is absent without reading project children',async()=>{
 const f=fixture(),project={title:'Synthetic'};await f.run(actions[0],{operation_id:operation,project},{},{...user,owner_email:foreign});
 const n=f.queries.length;const result=await f.run(actions[1],{operation_id:operation,project});assert.equal(result.data.receipt,null);assert.equal(f.queries.length,n+1);
});
test('receipt payload conflict is rejected',async()=>{
 const f=fixture();await f.run(actions[0],{operation_id:operation,project:{title:'First'}});
 await assert.rejects(f.run(actions[1],{operation_id:operation,project:{title:'Different'}}),e=>e.code==='409');
});
test('ordinary detail rejects a foreign project before reading children',async()=>{
 const f=fixture();f.tables.rfx_projects.push({id:'foreign-project',owner_email:foreign});
 await assert.rejects(f.run(actions[1],{project_id:'foreign-project',owner_email:foreign}));assert.equal(f.queries.length,1);assert.equal(f.writes.length,0);
});
test('ordinary detail reads only the children of the owned project',async()=>{
 const f=fixture();f.tables.rfx_projects.push({id:'owned-project',owner_email:own});const result=await f.run(actions[1],{project_id:'owned-project'});
 assert.equal(result.data.project.id,'owned-project');assert.ok(f.queries.slice(1).every(q=>q.filters.some(([k,v])=>k==='project_id'&&v==='owned-project')));assert.equal(f.writes.length,0);
});
test('both project branches remain behind authentication, principal and role gates',()=>{
 const auth=source.indexOf('const claims = await authenticate(request);'),principal=source.indexOf('const { user } = await resolveRatewareApiPrincipal(supabase, claims, { resolveUser });'),role=source.indexOf('if (roleDenial) return jsonResponse(roleDenial, 403);');
 assert.ok(auth>=0&&principal>auth&&role>principal);for(const name of actions)assert.ok(branches.get(name).start>role);
});
