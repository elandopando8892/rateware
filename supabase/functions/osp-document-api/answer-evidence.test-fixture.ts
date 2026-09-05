export const org = "11111111-1111-4111-8111-111111111111";
export const entity = "22222222-2222-4222-8222-222222222222";
export const caseId = "33333333-3333-4333-8333-333333333333";
export const reviewId = "44444444-4444-4444-8444-444444444444";
export const newReviewId = "55555555-5555-4555-8555-555555555555";

export interface EvidenceFixtureDatabase {
  exec(sql: string): Promise<unknown>;
}

/** Synthetic tables plus real migrations; never imported by application runtime. */
export async function initializeAnswerEvidenceFixture(
  db: EvidenceFixtureDatabase,
  nativeCrypto = false,
) {
  await db.exec(`
    create schema osp_private; create schema extensions;
    ${
    ["anon", "authenticated", "service_role", "osp_workflow_api", "osp_worker"]
      .map((role) =>
        nativeCrypto
          ? `do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}; end if; end $$;`
          : `create role ${role};`
      ).join("\n")
  }
    grant usage on schema osp_private to osp_workflow_api;
    ${
    nativeCrypto
      ? "create extension pgcrypto with schema extensions;"
      : `create function extensions.digest(bytea,text) returns bytea
    language sql immutable strict as $$ select case when $2='sha256' then pg_catalog.sha256($1) end $$;`
  }
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
  await db.exec(`
    alter table osp_private.case_profile_bindings add column revision integer default 1;
    create table osp_private.case_form_instances(organization_id uuid,case_id uuid,id uuid,version integer,template_version_id uuid,values_json jsonb);
    create table osp_private.case_answer_memory_candidates(id uuid primary key,organization_id uuid,case_id uuid,source_instance_id uuid,source_instance_version integer,
      source_template_version_id uuid,field_key text,answer_value jsonb,canonical_field_id text,legal_entity_id uuid,binding_revision integer,answer_sha256 text);
    create table osp_private.case_answer_memory_reviews(id uuid primary key default gen_random_uuid(),organization_id uuid,candidate_id uuid,decision text,answer_sha256 text);
    insert into osp_private.case_form_instances values('${org}','${caseId}','${caseId}',1,'${caseId}','{"phone":"+52 81 0000 0001"}');
    insert into osp_private.case_answer_memory_candidates values('${caseId}','${org}','${caseId}','${caseId}',1,'${caseId}','phone','"+52 81 0000 0001"','supplier.phone','${entity}',1,repeat('a',64));
    insert into osp_private.case_answer_memory_reviews(organization_id,candidate_id,decision,answer_sha256) values('${org}','${caseId}','accepted',repeat('a',64));
  `);

  for (
    const name of [
      "20260905083000_osp_answer_memory_evidence_preflight.sql",
      "20260905110000_osp_answer_memory_evidence_links.sql",
    ]
  ) {
    await db.exec(
      await Deno.readTextFile(
        new URL(`../../migrations/${name}`, import.meta.url),
      ),
    );
  }
}
