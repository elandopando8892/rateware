import { PGlite } from "npm:@electric-sql/pglite@0.5.8";
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

const org = "11111111-1111-4111-8111-111111111111";
const entity = "22222222-2222-4222-8222-222222222222";
const caseId = "33333333-3333-4333-8333-333333333333";
const reviewId = "44444444-4444-4444-8444-444444444444";
const newReviewId = "55555555-5555-4555-8555-555555555555";

// Characterization of existing SQL, not an authorization to use the command as
// a single-answer promotion bridge. No application runtime imports this test.
Deno.test("existing fact promotion compatibility exposes batch scope and unchanged-source limits", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema osp_private; create schema extensions;
      create role anon; create role authenticated; create role service_role;
      create role osp_workflow_api; create role osp_worker;
      grant usage on schema osp_private to osp_workflow_api;
      -- PGlite fixture only: implement the used pgcrypto SHA-256 signature using
      -- PostgreSQL's built-in SHA-256. No fake promotion or approval functions.
      create function extensions.digest(bytea,text) returns bytea
      language sql immutable strict as $$ select case when $2='sha256' then pg_catalog.sha256($1) end $$;
      create table public.organizations(id uuid primary key);
      create table public.legal_entities(organization_id uuid,id uuid,status text,unique(organization_id,id));
      create table osp_private.case_profile_bindings(organization_id uuid,case_id uuid,legal_entity_id uuid);
      create table public.provider_legal_entity_document_assets(id uuid,organization_id uuid,legal_entity_id uuid,
        lifecycle_status text,verification_status text,effective_date date,expiration_date date);
      create table public.provider_entity_document_reviews(id uuid,organization_id uuid,legal_entity_id uuid,
        revision integer,review_status text,document_asset_id uuid,decided_at timestamptz,unique(organization_id,id));
      create table public.provider_entity_document_review_fields(id uuid,organization_id uuid,review_id uuid,
        field_code text,field_status text,proposed_value jsonb,reviewer_value jsonb,sensitivity text,unique(organization_id,id));
      insert into public.organizations values('${org}');
      insert into public.legal_entities values('${org}','${entity}','active');
      insert into osp_private.case_profile_bindings values('${org}','${caseId}','${entity}');
      insert into public.provider_legal_entity_document_assets values('${reviewId}','${org}','${entity}',
        'active','verified',current_date-1,current_date+10);
      insert into public.provider_entity_document_reviews values('${reviewId}','${org}','${entity}',1,'approved','${reviewId}',now());
      insert into public.provider_entity_document_review_fields values
        (gen_random_uuid(),'${org}','${reviewId}','phone','accepted','"+52 81 0000 0001"',null,'internal'),
        (gen_random_uuid(),'${org}','${reviewId}','website','accepted','"https://example.test"',null,'internal');
      select set_config('osp.organization_id','${org}',false);
    `);
    for (
      const file of [
        "20260814110000_provider_legal_entity_fact_promotion.sql",
        "20260828213328_osp_profile_fact_promotion.sql",
        "20260905050000_osp_approved_profile_memory_reuse.sql",
      ]
    ) {
      await db.exec(
        await Deno.readTextFile(
          new URL(`../../migrations/${file}`, import.meta.url),
        ),
      );
    }
    const counts = async () =>
      (await db.query<{ facts: number; promotions: number }>(
        `select (select count(*)::int from public.provider_legal_entity_facts) as facts,
       (select count(*)::int from public.provider_legal_entity_fact_promotions) as promotions`,
      )).rows[0];
    const hash = async (id: string) =>
      (await db.query<{ hash: string }>(
        "select osp_private.profile_review_candidate_sha256($1,$2,1) as hash",
        [org, id],
      )).rows[0].hash;
    const promote = async (
      id: string,
      expectations: Record<string, string | null>,
    ) => {
      const candidateHash = await hash(id);
      await db.exec("set role osp_workflow_api");
      try {
        return (await db.query<
          {
            promoted_fact_count: number;
            unchanged_fact_count: number;
            replayed: boolean;
          }
        >(
          "select * from osp_private.promote_profile_review_facts_command($1,$2,1,$3,$4::jsonb,'test-operator','osp:operate')",
          [org, id, candidateHash, JSON.stringify(expectations)],
        )).rows[0];
      } finally {
        await db.exec("reset role");
      }
    };
    const load = async () =>
      (await db.query(
        "select * from osp_private.load_xbf_customer_setup_candidates_for_case($1,$2)",
        [org, caseId],
      )).rows;

    await t.step(
      "one selected answer cannot be promoted by omitting the other document fields",
      async () => {
        await assertRejects(
          () => promote(reviewId, { phone: null }),
          Error,
          "PROFILE_FACT_EXPECTATION_INCOMPLETE",
        );
        assertEquals(await counts(), { facts: 0, promotions: 0 });
      },
    );
    await t.step(
      "the existing action promotes the complete review and its exact replay creates no duplicates",
      async () => {
        const first = await promote(reviewId, { phone: null, website: null });
        assertEquals(first.promoted_fact_count, 2);
        assertEquals(first.replayed, false);
        assertEquals(
          (await promote(reviewId, { phone: null, website: null })).replayed,
          true,
        );
        assertEquals(await counts(), { facts: 2, promotions: 1 });
        assertEquals((await load()).length, 2);
      },
    );
    await t.step(
      "an identical value does not replace its original evidence even with a newer approved document",
      async () => {
        await db.exec(`
        insert into public.provider_legal_entity_document_assets values('${newReviewId}','${org}','${entity}',
          'active','verified',current_date-1,current_date+30);
        insert into public.provider_entity_document_reviews values('${newReviewId}','${org}','${entity}',1,'approved','${newReviewId}',now());
        insert into public.provider_entity_document_review_fields
          select gen_random_uuid(),organization_id,'${newReviewId}',field_code,field_status,proposed_value,reviewer_value,sensitivity
          from public.provider_entity_document_review_fields where review_id='${reviewId}';
      `);
        const facts = (await db.query<{ id: string; field_code: string }>(
          "select id,field_code from public.provider_legal_entity_facts",
        )).rows;
        const next = await promote(
          newReviewId,
          Object.fromEntries(facts.map((fact) => [fact.field_code, fact.id])),
        );
        assertEquals(next.promoted_fact_count, 0);
        assertEquals(next.unchanged_fact_count, 2);
        assertEquals(
          (await db.query<{ source_review_id: string }>(
            "select distinct source_review_id from public.provider_legal_entity_facts",
          )).rows,
          [{ source_review_id: reviewId }],
        );
        // This is the limitation the bridge MUST handle, not desired renewal behavior.
        await db.query(
          "update public.provider_legal_entity_document_assets set expiration_date=current_date-1 where id=$1",
          [reviewId],
        );
        assertEquals(await load(), []);
        assertEquals(await counts(), { facts: 2, promotions: 2 });
      },
    );
  } finally {
    await db.close();
  }
});
