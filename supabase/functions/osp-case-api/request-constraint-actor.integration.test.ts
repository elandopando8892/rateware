// Execute the real pending migration and its forward-fix in synthetic Postgres.
// No network, production credentials, documents or business records are used.
import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

const org = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const promotionId = "33333333-3333-4333-8333-333333333333";
const signature =
  "osp_private.record_request_knowledge_constraints_command(uuid,uuid,text)";
const migration = (name: string) =>
  Deno.readTextFile(new URL(`../../migrations/${name}`, import.meta.url));

Deno.test("request constraint actor forward-fix executes real SQL without widening authority", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema osp_private; create schema storage;
      create role anon; create role authenticated; create role service_role;
      create role osp_worker; create role osp_workflow_api;
      create table osp_private.document_versions(document_type text,valid_from date,expires_at date);
      create table osp_private.generated_packages(content_type text);
      create table storage.buckets(id text primary key,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      insert into storage.buckets values('osp-derived-documents',false,26214400,array[
        'application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
      create table osp_private.customer_registration_cases(organization_id uuid,id uuid,unique(organization_id,id));
      create table osp_private.request_manifest_decision_reviews(organization_id uuid,id uuid,unique(organization_id,id));
      create table osp_private.request_manifest_drafts(organization_id uuid,id uuid,case_id uuid,manifest_sha256 text,manifest_json jsonb);
      create table osp_private.request_knowledge_promotions(organization_id uuid,id uuid,case_id uuid,
        review_id uuid,manifest_draft_id uuid,promoted_by_subject text,selected_keys_json jsonb,unique(organization_id,id));
      create function osp_private.reject_request_knowledge_ledger_mutation() returns trigger
        language plpgsql as $$ begin raise exception 'APPEND_ONLY'; end $$;
      -- These two upstream catalog projections are deterministic fixture dependencies;
      -- the command, constraints, grants, RLS and migration under test are real.
      create function osp_private.request_knowledge_candidates(uuid,uuid,uuid)
        returns table(knowledge_kind text,canonical_key text,display_label text,aliases_json jsonb,value_type text,required boolean)
        language sql as $$ select 'field','supplier.website','Website','["website"]'::jsonb,'string',true $$;
      create function osp_private.request_knowledge_reuse_policy(text,text,text,jsonb,text)
        returns table(reuse_eligibility text,target_canonical_key text)
        language sql as $$ select 'eligible','supplier.website' $$;
      insert into osp_private.customer_registration_cases values('${org}','${caseId}');
      insert into osp_private.request_manifest_decision_reviews values('${org}','${caseId}');
      insert into osp_private.request_manifest_drafts values('${org}','${caseId}','${caseId}',repeat('a',64),
        '{"requirements":[{"text":"Website required"}]}');
      insert into osp_private.request_knowledge_promotions values('${org}','${promotionId}','${caseId}',
        '${caseId}','${caseId}','fixture:operator','["field:supplier.website"]');
      select set_config('osp.organization_id','${org}',false);
    `);
    await db.exec(
      await migration("20260902120000_osp_request_contract_semantic_stop.sql"),
    );
    const command = (subject: string | null, tenant = org) =>
      db.query(
        "select * from osp_private.record_request_knowledge_constraints_command($1::uuid,$2::uuid,$3::text)",
        [tenant, promotionId, subject],
      );
    const count = async () =>
      (await db.query<{ count: number }>(
        "select count(*)::integer as count from osp_private.request_knowledge_constraint_rules",
      )).rows[0].count;
    const identity = async () =>
      (await db.query(
        `select proowner,prosecdef,proconfig,proacl from pg_proc where oid=$1::regprocedure`,
        [signature],
      )).rows;

    await t.step(
      "reproduces the invalid repetition bound before any ledger insert",
      async () => {
        await assertRejects(
          () => command("fixture:operator"),
          Error,
          "invalid repetition count",
        );
        assertEquals(await count(), 0);
      },
    );

    const beforeIdentity = await identity();
    const fix = await migration(
      "20260905173000_osp_request_constraint_actor_regex_hotfix.sql",
    );
    await db.exec(fix);
    await t.step(
      "preserves owner, security definer, search path and execute ACL",
      async () => {
        assertEquals(await identity(), beforeIdentity);
        const grants = await db.query(
          `select
        has_function_privilege('osp_workflow_api',$1,'execute') as workflow,
        has_function_privilege('osp_worker',$1,'execute') as worker,
        has_function_privilege('authenticated',$1,'execute') as browser,
        has_function_privilege('service_role',$1,'execute') as service,
        has_table_privilege('osp_workflow_api','osp_private.request_knowledge_constraint_rules','insert') as direct_insert`,
          [signature],
        );
        assertEquals(grants.rows, [{
          workflow: true,
          worker: false,
          browser: false,
          service: false,
          direct_insert: false,
        }]);
      },
    );

    await t.step(
      "rejects null, empty, overlong, whitespace and non-alphabet subjects",
      async () => {
        for (
          const subject of [
            null,
            "",
            "a".repeat(257),
            " fixture:operator",
            "fixture:operator ",
            "fixture:\noperator",
            "fixture/actor",
            "fixture:á",
            "fixture:actor;",
          ]
        ) {
          await assertRejects(
            () => command(subject),
            Error,
            "REQUEST_KNOWLEDGE_CONSTRAINT_FORBIDDEN",
          );
        }
        assertEquals(await count(), 0);
      },
    );

    await t.step(
      "still rejects a different tenant or promotion owner",
      async () => {
        await assertRejects(
          () => command("fixture:operator", caseId),
          Error,
          "REQUEST_KNOWLEDGE_CONSTRAINT_FORBIDDEN",
        );
        await assertRejects(
          () => command("fixture:other"),
          Error,
          "REQUEST_KNOWLEDGE_CONSTRAINT_FORBIDDEN",
        );
        assertEquals(await count(), 0);
      },
    );

    await t.step(
      "records one supervised constraint and replays without a second row",
      async () => {
        assertEquals((await command("fixture:operator")).rows, [{
          recorded_count: 1,
          replayed: false,
        }]);
        assertEquals((await command("fixture:operator")).rows, [{
          recorded_count: 1,
          replayed: true,
        }]);
        assertEquals(await count(), 1);
        const rule = await db.query(
          "select constraint_json->'humanReviewed' as reviewed, constraint_json->'externalEffects' as effects from osp_private.request_knowledge_constraint_rules",
        );
        assertEquals(rule.rows, [{ reviewed: true, effects: false }]);
      },
    );

    await t.step(
      "accepts the full 256-character contract and its one-character lower bound",
      async () => {
        // Only fixture ownership changes here; no production data is accessed.
        for (const subject of ["a", "a".repeat(256)]) {
          await db.query(
            "update osp_private.request_knowledge_promotions set promoted_by_subject=$1 where id=$2::uuid",
            [subject, promotionId],
          );
          assertEquals((await command(subject)).rows, [{
            recorded_count: 1,
            replayed: true,
          }]);
        }
        assertEquals(await count(), 1);
      },
    );

    await t.step(
      "refuses a second patch rather than silently accepting target drift",
      async () => {
        const before = (await db.query(
          "select pg_get_functiondef($1::regprocedure) as definition",
          [signature],
        )).rows;
        await assertRejects(
          () => db.exec(fix),
          Error,
          "REQUEST_CONSTRAINT_ACTOR_HOTFIX_TARGET_MISMATCH",
        );
        assertEquals(
          (await db.query(
            "select pg_get_functiondef($1::regprocedure) as definition",
            [signature],
          )).rows,
          before,
        );
        assertEquals(await count(), 1);
      },
    );
  } finally {
    await db.close();
  }
});
