import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
const run=promisify(execFile);
test('real PostgreSQL: concurrent issuance, recovery, source binding, closure and rollback',async()=>{
  const migration=readFileSync(new URL('../supabase/migrations/20261008180000_rfx_rfi_link_atomic.sql',import.meta.url),'utf8');
  const name=`radar-rfi-${crypto.randomUUID()}`;
  const id=execFileSync('docker',['run','--pull=never','-d','--network=none','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'],{encoding:'utf8'}).trim();
  assert.match(id,/^[a-f0-9]{64}$/);
  const args=['exec','-i',id,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'];
  const sql=input=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  const project='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',operation='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const origin=JSON.stringify({system:'demand_radar',ownerId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',leadId:'synthetic-lead',requirementId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',operationId:operation});
  const issue=(hash='a',source='null')=>`select public.issue_rfx_rfi_link_once('${project}','org:test','operator',repeat('${hash}',64),'encrypted-${hash}',14,${source});`;
  try {
    let ready=false;for(let i=0;i<30;i++){try{sql('select 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}
    assert.equal(ready,true);
    sql(`create role anon; create role authenticated; create role service_role;
      create table rfx_projects(id uuid primary key,owner_email text,owner_user_id text,organization_id uuid,title text,customer_id uuid,operation_id uuid,status text,updated_at timestamptz);
      create table rfx_rfi_magic_links(id uuid primary key default gen_random_uuid(),owner_email text,owner_user_id text,organization_id uuid,project_id uuid references rfx_projects(id),token_hash text unique,token_encrypted text,status text default 'active',expires_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),revoked_at timestamptz,submitted_at timestamptz,metadata jsonb default '{}');
      create table rfx_rfi_submissions(project_id uuid unique,status text);
      create table rfx_process_audit(id uuid primary key default gen_random_uuid(),owner_email text,owner_user_id text,organization_id uuid,project_id uuid,actor_email text,action text,entity_type text,entity_id text,summary text,metadata jsonb);
      insert into rfx_projects values('${project}','org:test','operator',null,'Synthetic',null,'${operation}','draft',now());`);
    sql(migration);
    sql('grant select,insert,update on all tables in schema public to service_role');
    const results=await Promise.all(Array.from({length:10},(_,i)=>run('docker',[...args,'-c',issue(i%2?'a':'b')])));
    const receipts=results.map(r=>JSON.parse(r.stdout));
    assert.equal(new Set(receipts.map(r=>r.row.id)).size,1);
    assert.equal(receipts.filter(r=>!r.reused).length,1);
    assert.equal(sql('select count(*) from rfx_rfi_magic_links'),'1');
    assert.equal(sql('select count(*) from rfx_process_audit'),'1');
    const first=receipts[0].row.id;
    const bound=JSON.parse(sql(issue('c',`'${origin}'::jsonb`)));
    assert.equal(bound.row.id,first,'binding reuses the existing active link');
    assert.equal(JSON.parse(sql(`set role service_role; ${issue('d',`'${origin}'::jsonb`)}`).split('\n').at(-1)).row?.id,first);
    assert.equal(JSON.parse(sql(issue('d',`'${origin}'::jsonb`))).row.id,first,'lost acknowledgement replays the same receipt');
    assert.throws(()=>sql(issue('e',`'${origin.replace('synthetic-lead','other-lead')}'::jsonb`)));
    assert.throws(()=>sql(issue().replace('org:test','org:other')));
    assert.throws(()=>sql(`set role authenticated; ${issue()}`));
    assert.throws(()=>sql(`update rfx_projects set radar_origin='{}';`));
    sql(`insert into rfx_rfi_submissions values('${project}','submitted');`);
    assert.throws(()=>sql(issue()));
    sql('delete from rfx_rfi_submissions');
    sql('update rfx_rfi_magic_links set expires_at=now()-interval \'1 second\'');
    assert.throws(()=>sql(issue()),'expired source-bound links never rotate silently');
    assert.equal(sql('select count(*) from rfx_rfi_magic_links'),'1');
    // Separate synthetic project: an audit failure rolls back the new token and state.
    const second='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    sql(`insert into rfx_projects(id,owner_email,status,title) values('${second}','org:test','draft','Rollback');
      create function reject_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable';end$$;
      create trigger test_audit before insert on rfx_process_audit for each row execute function reject_audit();`);
    assert.throws(()=>sql(issue().replace(project,second)));
    assert.equal(sql(`select count(*) from rfx_rfi_magic_links where project_id='${second}'`),'0');
    assert.equal(sql(`select status from rfx_projects where id='${second}'`),'draft');
  }finally{
    const actual=execFileSync('docker',['inspect','--format','{{.Name}}',id],{encoding:'utf8'}).trim();
    assert.equal(actual,`/${name}`);execFileSync('docker',['rm','-f',id],{stdio:'pipe'});
  }
});

