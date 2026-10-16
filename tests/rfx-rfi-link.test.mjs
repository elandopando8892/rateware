import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {issueRfxRfiLink} from '../supabase/functions/rateware-api/rfx-rfi-link.mjs';

const project={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',customer_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',owner_email:'org:test'};
const token='a'.repeat(72);
test('returns the persisted winning token, never the losing candidate',async()=>{
  let calls=0;
  const result=await issueRfxRfiLink({client:{rpc:async()=>{calls++;return {data:{reused:true,row:{id:'link',status:'active',expires_at:'2099-01-01T00:00:00Z',created_at:'2026-10-08T00:00:00Z',token_encrypted:'winner'}}};}},
    project,user:{owner_email:'org:test',owner_user_id:'operator'},input:{},
    generateToken:()=>token,encrypt:async()=> 'candidate',decrypt:async value=>value==='winner'?'b'.repeat(72):token});
  assert.equal(calls,1);
  assert.equal(result.link,`https://bidware.heymarksman.com/customer-rfi.html?token=${'b'.repeat(72)}`);
  assert.equal(result.row.token_encrypted,undefined);
  assert.equal(result.token,undefined);
});

const actor='cccccccc-cccc-4ccc-8ccc-cccccccccccc',requirement='dddddddd-dddd-4ddd-8ddd-dddddddddddd',operation='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture() {
  const selectedProject={shipperId:project.customer_id,title:'Synthetic',type:'spot'};
  const expiry='2026-10-08T00:00:00Z'; // Expired creation approval remains historical evidence, not a new grant.
  const rows=new Map();
  const add=(prefix,id,action,row,requestHash)=>rows.set(`${prefix}:${hash([actor,id])}`,{state:'completed',action,receipt_text:JSON.stringify(row),request_hash:requestHash});
  add('bidware_lead_request','test-lead','bidware_lead_request_confirm',{ownerId:actor,leadId:'test-lead',requirementId:requirement,project:selectedProject});
  add('bidware_approval',requirement,'bidware_requirement_approve',{ownerId:actor,id:requirement,state:'approved',revision:1,operationId:operation,project:selectedProject,expiresAt:expiry},hash({project:selectedProject,expiresAt:expiry}));
  add('bidware_project',operation,'bidware_project_create',{requestId:operation,projectId:project.id,shipperId:project.customer_id},hash(selectedProject));
  let calls=0,origin;
  const client={from:table=>{
    assert.equal(table,'demand_radar_spot_jobs');const filters={};
    const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q;},maybeSingle:async()=>({data:filters.owner_user_id===actor?rows.get(filters.job_key):null})};return q;
  },rpc:async(name,input)=>{assert.equal(name,'issue_rfx_rfi_link_once');calls++;origin=input.p_radar_origin;
    return {data:{reused:false,origin,row:{id:'link',token_encrypted:'winner',status:'active'}}};}};
  const args={client,project:{...project,operation_id:operation,opportunity_type:'spot'},user:{owner_email:'org:test',owner_user_id:actor},actorId:actor,
    input:{radar_lead_id:'test-lead'},generateToken:()=>token,encrypt:async()=> 'ciphertext',decrypt:async()=>token};
  return {rows,args,calls:()=>calls,origin:()=>origin};
}
test('binds only the three sealed cloud receipts for the authenticated actor',async()=>{
  const f=fixture();await issueRfxRfiLink(f.args);
  assert.deepEqual(f.origin(),{system:'demand_radar',ownerId:actor,leadId:'test-lead',requirementId:requirement,operationId:operation});
  assert.equal(f.calls(),1);
});
test('forged source, foreign actor, incomplete jobs and wrong project cannot issue',async()=>{
  for(const mutate of [
    f=>{f.args.input.radar_lead_id='foreign-lead';},
    f=>{f.args.actorId=project.id;},
    f=>{f.args.project.id=operation;},
    f=>{f.args.project.operation_id=project.id;},
    f=>{f.args.project.customer_id=operation;},
    f=>{[...f.rows.values()][2].state='uncertain';},
    f=>{[...f.rows.values()][2].request_hash='0'.repeat(64);},
    f=>{[...f.rows.values()][0].receipt_text='null';},
  ]) {const f=fixture();mutate(f);await assert.rejects(()=>issueRfxRfiLink(f.args));assert.equal(f.calls(),0);}
});
test('invalid validity is rejected before an issuance',async()=>{
  for(const input of [{expires_in_days:0},{expires_in_days:91},{expires_in_days:1.5}]) {
    const f=fixture();f.args.input=input;await assert.rejects(()=>issueRfxRfiLink(f.args));assert.equal(f.calls(),0);
  }
});
test('legacy preview/custom hosts cannot choose where the bearer URL points',async()=>{
  const f=fixture();f.args.input={app_origin:'https://attacker.test'};
  assert.equal(new URL((await issueRfxRfiLink(f.args)).link).origin,'https://bidware.heymarksman.com');
});
test('ambiguous database result is not retried and does not expose provider detail',async()=>{
  const f=fixture();let calls=0;
  f.args.client.rpc=async()=>{calls++;return {error:{message:'private token candidate',code:'P0001'}};};
  await assert.rejects(()=>issueRfxRfiLink(f.args),e=>e.code==='409'&&!e.message.includes('private token'));
  assert.equal(calls,1);
});

