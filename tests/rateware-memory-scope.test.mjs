import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {parse} from '@babel/parser';

// Run the real handler and its actual pure helpers without loading an SDK,
// credentials or Deno. This tests query scope before pagination and aggregation.
const source=readFileSync(fileURLToPath(new URL('../supabase/functions/rateware-api/index.ts',import.meta.url)),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['typescript']});
const functions=new Map(ast.program.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,n]));
const selected=['cleanText','normalizeDomain','objectRecord','memoryRuleMatchesUpload','handleSimulateInterpretationMemory'].map(name=>{
 const n=functions.get(name);assert.ok(n,name);return source.slice(n.start,n.end);
}).join('\n');
const context=vm.createContext({});vm.runInContext(stripTypeScriptTypes(selected),context);
const simulate=context.handleSimulateInterpretationMemory;
const own='org:synthetic-a',foreign='org:synthetic-b';
const uploads=[
 {id:'own',owner_email:own,status:'uploaded',original_filename:'own.csv',vendor_hint:'carrier.example.test',rfx_hint:'same-event',created_at:'2026-10-01',interpreted_rate_rows:2,expected_rate_rows:3,audit_warnings:[]},
 {id:'foreign',owner_email:foreign,status:'uploaded',original_filename:'foreign.csv',vendor_hint:'carrier.example.test',rfx_hint:'same-event',created_at:'2026-10-02',interpreted_rate_rows:99,expected_rate_rows:100,audit_warnings:['foreign']},
 {id:'archived',owner_email:own,status:'archived',original_filename:'archived.csv',interpreted_rate_rows:500,expected_rate_rows:500,audit_warnings:[]}
];
async function run(body={},owner=own,rules=[]){
 const queries=[];
 const client={from(table){
  const filters=[];const query={table,filters};queries.push(query);let single=false,limit=Infinity;
  const chain={select(){return chain;},eq(k,v){filters.push([k,'eq',v]);return chain;},neq(k,v){filters.push([k,'neq',v]);return chain;},
   or(){filters.push(['owner_email','rule-scope',owner]);return chain;},order(){return chain;},limit(n){limit=n;return chain;},maybeSingle(){single=true;return chain;},
   then(ok,bad){const rows=(table==='raw_uploads'?uploads:rules).filter(row=>filters.every(([k,op,v])=>op==='eq'?row[k]===v:op==='neq'?row[k]!==v:row[k]===v||row[k]===null)).slice(0,limit);return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(ok,bad);}};
  return chain;
 }};
 const result=await simulate({supabase:client,user:{owner_email:owner},body,claims:{},jsonResponse:(data,status=200)=>({status,data:JSON.parse(JSON.stringify(data))})});
 return {...result,queries};
}
for(const scope of ['global','vendor','rfx'])test(`${scope} simulation only aggregates the verified workspace`,async()=>{
 const result=await run({scope,vendor_domain:'carrier.example.test',rfx_hint:'same-event',owner_email:foreign});
 assert.equal(result.status,200);assert.deepEqual(result.data.rows.map(r=>r.id),['own']);
 assert.equal(result.data.impact.upload_count,1);assert.equal(result.data.impact.staged_rows,2);assert.equal(result.data.impact.expected_rows,3);assert.equal(result.data.impact.warning_count,0);
 assert.ok(result.queries.find(q=>q.table==='raw_uploads').filters.some(([k,op,v])=>k==='owner_email'&&op==='eq'&&v===own));
});
test('a second verified workspace receives only its own documents',async()=>{
 const result=await run({scope:'global'},foreign);assert.deepEqual(result.data.rows.map(r=>r.id),['foreign']);assert.equal(result.data.impact.staged_rows,99);
});
test('a persisted global rule preserves workspace isolation',async()=>{
 const result=await run({id:'global-rule'},own,[{id:'global-rule',owner_email:null,scope:'global'}]);assert.deepEqual(result.data.rows.map(r=>r.id),['own']);
});
test('a foreign rule is rejected before querying uploads',async()=>{
 const result=await run({id:'foreign-rule'},own,[{id:'foreign-rule',owner_email:foreign,scope:'global'}]);assert.equal(result.status,404);assert.ok(!result.queries.some(q=>q.table==='raw_uploads'));
});
