// Opt-in, schema-only local rehearsal. Reuses the established Supabase image
// and restore recipe; never connects to a hosted database or imports real rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const snapshot=process.env.RADAR_RFI_SCHEMA_SNAPSHOT;
const prerequisite=process.env.RADAR_RFI_RECEIPT_MIGRATION;
const hash=s=>createHash('sha256').update(s).digest('hex');
const run=promisify(execFile);
test('full schema: additive migration and one durable origin-bound link under concurrent service calls',
  {skip:!snapshot||!prerequisite},async()=>{
  const schema=readFileSync(snapshot,'utf8'),receipt=readFileSync(prerequisite,'utf8');
  assert.equal(hash(schema),'a7bb85bf5eeb608509f2597951b53c465270a28466a932acf2a050b9b2fa711a');
  assert.equal(hash(receipt),'872e8af381a886bc280e333f759ddc8ffc0f7b9cd5c18f29741c73b69b33cc73');
  const migration=readFileSync(new URL('../supabase/migrations/20261008180000_rfx_rfi_link_atomic.sql',import.meta.url),'utf8');
  const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:16*1024*1024}).trim();
  assert.match(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),/^(npipe|unix):\/\//);
  const name=`radar-rfi-schema-${crypto.randomUUID()}`,label='marksman.radar.rfi-rehearsal';
  const id=docker(['run','--detach','--pull=never','--network=none','--name',name,'--label',`${label}=true`,
    '--user','postgres','--tmpfs','/tmp:rw,mode=1777','--entrypoint','sh','public.ecr.aws/supabase/postgres:17.6.1.167','-c',
    'initdb -D /tmp/radar-pg -A trust >/tmp/init.log 2>&1 && exec postgres -D /tmp/radar-pg -c listen_addresses= -c unix_socket_directories=/tmp -c shared_preload_libraries=pg_cron,pg_net,pg_stat_statements -c cron.database_name=postgres']);
  assert.match(id,/^[a-f0-9]{64}$/);
  const args=['exec','-i',id,'psql','-X','-h','/tmp','-U','postgres','-v','ON_ERROR_STOP=1','-At'];
  const sql=input=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:16*1024*1024}).trim();
  try{
    let ready=false;for(let i=0;i<40;i++){try{sql('select 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}
    assert(ready);
    const roles=[...new Set([...schema.matchAll(/(?:OWNER TO| TO) "([a-z_]+)"/g)].map(m=>m[1]))].filter(r=>!['postgres','pg_database_owner'].includes(r));
    sql(roles.map(r=>`CREATE ROLE "${r}" NOLOGIN;`).join('\n')+
      '\nCREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION pg_trgm WITH SCHEMA extensions; CREATE EXTENSION pg_stat_statements WITH SCHEMA extensions; CREATE EXTENSION pg_cron; CREATE EXTENSION pg_net; CREATE EXTENSION pg_repack; CREATE EXTENSION supabase_vault;');
    sql(schema);
    assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'"),'494');
    assert.equal(sql('select count(*) from public.rfx_projects'),'0');
    // The export predates the already applied project receipt migration. Apply
    // that exact prerequisite locally, never synthesize missing columns alone.
    sql(receipt);
    const security="select relname,relrowsecurity,relforcerowsecurity,relacl from pg_class where oid in ('public.rfx_projects'::regclass,'public.rfx_rfi_magic_links'::regclass,'public.rfx_process_audit'::regclass) order by relname";
    const before=sql(security);
    sql("insert into public.rfx_projects(title,owner_email) values('Synthetic legacy','org:test')");
    sql(migration);
    assert.equal(sql(security),before);
    assert.equal(sql("select count(*) from public.rfx_projects where title='Synthetic legacy' and radar_origin is null"),'1');
    const project='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',operation='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const origin=JSON.stringify({system:'demand_radar',ownerId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',leadId:'synthetic-lead',requirementId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',operationId:operation});
    sql(`insert into public.rfx_projects(id,owner_email,organization_id,title,operation_id,operation_payload_fingerprint) values('${project}','org:test','test','Synthetic Spot','${operation}',repeat('a',64))`);
    // Supabase service role bypasses RLS. No real credentials or grants widened.
    sql('alter role service_role bypassrls');
    const issue=`select public.issue_rfx_rfi_link_once('${project}','org:test','synthetic-actor',repeat('b',64),'synthetic-ciphertext',14,'${origin}'::jsonb)`;
    const responses=await Promise.all(Array.from({length:10},()=>run('docker',[...args,'-c',`set role service_role; ${issue};`])));
    const results=responses.map(r=>JSON.parse(r.stdout.trim().split('\n').at(-1)));
    assert.equal(new Set(results.map(r=>r.row.id)).size,1);assert.equal(results.filter(r=>!r.reused).length,1);
    assert.equal(sql(`select count(*) from rfx_rfi_magic_links where project_id='${project}'`),'1');
    assert.equal(sql(`select count(*) from rfx_process_audit where project_id='${project}'`),'2');
    assert.equal(sql(`select organization_id from rfx_rfi_magic_links where project_id='${project}'`),'test','the link retains its project organization');
    assert.equal(sql(`select count(*) from rfx_process_audit where project_id='${project}' and organization_id='test'`),'2','both atomic audit rows retain the organization');
    assert.throws(()=>sql(`update rfx_projects set organization_id='other' where id='${project}'`),e=>String(e.stderr).includes('Radar origin is immutable'));
    assert.throws(()=>sql(`set role authenticated; ${issue}`),e=>String(e.stderr).includes('permission denied for function'));
    assert.throws(()=>sql(`set role service_role; ${issue.replace("'org:test'","'org:other'")}`),e=>String(e.stderr).includes('RFI access denied'));
    assert.throws(()=>sql(`update rfx_projects set customer_id=gen_random_uuid() where id='${project}'`),e=>String(e.stderr).includes('Radar origin is immutable'));
    sql(`update rfx_projects set title='Synthetic edited',status='archived' where id='${project}'`);
    assert.throws(()=>sql(issue),e=>String(e.stderr).includes('capture is closed'));
    assert.equal(sql(`select count(*) from rfx_projects where id='${project}' and radar_link_id='${results[0].row.id}' and operation_id='${operation}'`),'1');
    console.log('494-table snapshot restored; original grants/RLS and legacy row preserved; 10 service calls / 1 link; origin, owner and lifecycle gates passed.');
  }finally{
    const meta=JSON.parse(docker(['inspect',id]))[0];
    assert.equal(meta.Id,id);assert.equal(meta.Name,`/${name}`);assert.equal(meta.Config.Labels[label],'true');
    docker(['rm','--force',id]);
  }
});

