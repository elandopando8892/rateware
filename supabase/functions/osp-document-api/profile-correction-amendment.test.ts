import { PGlite } from 'npm:@electric-sql/pglite@0.5.8';
import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';
import postgres from 'postgres';

async function database() {
  if (Deno.env.get('OSP_CORRECTION_NATIVE') !== '1') return new PGlite();
  const name = Deno.env.get('OSP_CORRECTION_DATABASE') ?? 'osp_correction_rehearsal_run_1';
  if (!/^osp_correction_rehearsal_run_[0-9]+$/.test(name)) throw new Error('Synthetic database name required');
  const sql = postgres({ hostname: '127.0.0.1', port: 55472, username: 'osp_local_rehearsal',
    database: name, ssl: false, prepare: false, max: 1, connect_timeout: 3 });
  const [identity] = await sql`select current_database() db, current_user usr, current_setting('server_version_num') version`;
  assertEquals(identity.db, name);
  assertEquals(identity.usr, 'osp_local_rehearsal');
  assertEquals(Math.floor(Number(identity.version) / 10000), 17);
  // The test uses only exec/query/close. Keep the same fixture on both engines.
  return {
    exec: (query: string) => sql.unsafe(query),
    query: async (query: string, parameters: never[] = []) => ({ rows: Array.from(await sql.unsafe(query, parameters)) }),
    close: () => sql.end({ timeout: 2 }),
  } as unknown as PGlite;
}

Deno.test('open correction amendment preserves history and rejects stale or closed decisions', async () => {
  const db = await database();
  const org = '11111111-1111-4111-8111-111111111111';
  const review = '22222222-2222-4222-8222-222222222222';
  const field = '33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`create schema osp_private;
      create table public.provider_entity_document_reviews (id uuid primary key, organization_id uuid, review_status text, assigned_reviewer_user_id text, revision int, updated_at timestamptz);
      create table public.provider_entity_document_review_fields (id uuid primary key, organization_id uuid, review_id uuid, field_code text, field_status text, sensitivity text, reviewer_value jsonb, decided_by_user_id text, decided_at timestamptz, decision_note text, updated_at timestamptz);
      create table public.provider_entity_document_review_events (organization_id uuid, review_id uuid, event_type text check(event_type in ('review_claimed','field_decided','review_decided')), previous_revision int, revision int check(revision>0 and (previous_revision is null or revision>previous_revision)), actor_user_id text check(btrim(actor_user_id)<>''), payload jsonb, occurred_at timestamptz);
      select set_config('osp.organization_id','${org}',false);
      insert into public.provider_entity_document_reviews values ('${review}','${org}','in_review','operator',3,now());
      insert into public.provider_entity_document_review_fields values ('${field}','${org}','${review}','legal_name','corrected','internal',to_jsonb('"Example LLC"'::text),'operator','2026-09-08T00:00:00Z','Original check',now());`);
    const previous = await Deno.readTextFile(new URL('../../migrations/20260828202820_osp_profile_evidence_human_review.sql', import.meta.url));
    await db.exec(previous.slice(previous.indexOf('create or replace function osp_private.decide_profile_evidence_field_command('), previous.indexOf('create or replace function osp_private.finalize_profile_evidence_review_command(')));
    await db.exec('revoke all on function osp_private.decide_profile_evidence_field_command(uuid,uuid,uuid,integer,text,text,jsonb,text,text) from public');
    const acl = () => db.query("select proacl::text acl from pg_proc where oid='osp_private.decide_profile_evidence_field_command(uuid,uuid,uuid,integer,text,text,jsonb,text,text)'::regprocedure");
    const beforeAcl = (await acl()).rows;
    await db.exec(await Deno.readTextFile(new URL('../../migrations/20260908233000_osp_profile_correction_amendment.sql', import.meta.url)));
    assertEquals((await acl()).rows, beforeAcl);
    const amend = (revision = 3, actor = 'operator', decision = 'corrected') => db.query(`select * from osp_private.decide_profile_evidence_field_command($1,$2,$3,$4,$5,$6,$7::text::jsonb,$8,$9)`, [org,review,field,revision,decision,'Exact source value',JSON.stringify('Example LLC'),actor,'osp:operate']);
    await assertRejects(() => amend(2), Error, 'PROFILE_REVIEW_VERSION_CONFLICT');
    await assertRejects(() => amend(3,'other'), Error, 'PROFILE_REVIEW_VERSION_CONFLICT');
    await assertRejects(() => amend(3,'operator','accepted'), Error, 'PROFILE_CORRECTION_AMENDMENT_FORBIDDEN');
    await amend();
    assertEquals((await db.query(`select payload->>'amendment' as amendment, payload->'previous_decision'->>'reviewer_value' as old_value, payload->'new_decision'->>'reviewer_value' as new_value from public.provider_entity_document_review_events`)).rows, [{amendment:'true',old_value:'"Example LLC"',new_value:'Example LLC'}]);
    assertEquals((await db.query('select reviewer_value from public.provider_entity_document_review_fields')).rows, [{reviewer_value:'Example LLC'}]);
    await assertRejects(() => amend(), Error, 'PROFILE_REVIEW_VERSION_CONFLICT');
    await db.exec("update public.provider_entity_document_reviews set review_status='approved'");
    await assertRejects(() => amend(4), Error, 'PROFILE_REVIEW_VERSION_CONFLICT');
    await db.exec("update public.provider_entity_document_reviews set review_status='in_review'; update public.provider_entity_document_review_fields set sensitivity='restricted'");
    await assertRejects(() => amend(4), Error, 'PROFILE_RESTRICTED_REVIEW_REQUIRED');
    await db.exec("update public.provider_entity_document_review_fields set sensitivity='internal', decided_by_user_id='other'");
    await assertRejects(() => amend(4), Error, 'PROFILE_CORRECTION_AMENDMENT_FORBIDDEN');
    assertEquals((await db.query('select revision from public.provider_entity_document_reviews')).rows, [{revision:4}]);
    assertEquals((await db.query('select count(*)::int n from public.provider_entity_document_review_events')).rows, [{n:1}]);
  } finally { await db.close(); }
});
