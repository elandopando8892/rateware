-- Synthetic CONTRACT foundation for the thirteen-migration rehearsal, not a full
-- production schema dump. No real XBF/carrier values or outgoing integrations.
create schema osp_private;
create schema extensions;
create schema storage;
create extension pgcrypto with schema extensions;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists(select 1 from pg_roles where rolname='osp_worker') then create role osp_worker; end if;
  if not exists(select 1 from pg_roles where rolname='osp_workflow_api') then create role osp_workflow_api; end if;
end $$;
grant usage on schema osp_private to osp_workflow_api,osp_worker;
create table public.organizations(id uuid primary key);
create table public.legal_entities(organization_id uuid,id uuid,entity_code text,legal_name text,country_code text,
  default_currency text,status text,unique(organization_id,id));
create table public.provider_legal_entity_document_assets(id uuid,organization_id uuid,legal_entity_id uuid,
  document_type text,document_key text,lifecycle_status text,verification_status text,sensitivity text,
  release_policy text,effective_date date,expiration_date date);
create table public.provider_entity_document_reviews(id uuid,organization_id uuid,legal_entity_id uuid,
  revision integer,review_status text,document_asset_id uuid,decided_at timestamptz,
  assigned_reviewer_user_id text,requested_at timestamptz default now(),unique(organization_id,id));
create table public.provider_entity_document_review_fields(id uuid,organization_id uuid,review_id uuid,
  field_code text,field_status text,proposed_value jsonb,reviewer_value jsonb,sensitivity text,unique(organization_id,id));
create table public.provider_legal_entity_profile_fields(id uuid,organization_id uuid,legal_entity_id uuid,
  field_code text,field_label text,field_value jsonb,verification_status text,sensitivity text,lifecycle_status text);
create table osp_private.supplier_counterparties(organization_id uuid,id uuid,legal_name text);
create table osp_private.customer_registration_cases(organization_id uuid,id uuid,supplier_id uuid,state text,
  aggregate_version bigint,unique(organization_id,id));
create table osp_private.case_profile_bindings(organization_id uuid,case_id uuid,legal_entity_id uuid,revision integer);
create table osp_private.form_templates(organization_id uuid,id uuid,name text,updated_at timestamptz default now());
create table osp_private.form_template_versions(organization_id uuid,id uuid,template_id uuid,
  version integer,status text,schema_sha256 text,unique(organization_id,id));
create table osp_private.form_fields(id uuid,organization_id uuid,template_version_id uuid,
  position integer,field_key text,definition_json jsonb);
create table osp_private.form_rules(organization_id uuid,template_version_id uuid,target_field_id uuid,rule_json jsonb);
create table osp_private.case_form_instances(organization_id uuid,id uuid,case_id uuid,template_version_id uuid,
  version integer,values_json jsonb,updated_at timestamptz default now(),unique(organization_id,id));
create table osp_private.case_package_input_snapshots(organization_id uuid,form_instance_id uuid,
  id uuid,case_id uuid,case_version bigint,canonical_sha256 text,created_at timestamptz default now(),
  document_version_ids uuid[] not null default '{}',unique(organization_id,case_id,id));
create table osp_private.background_jobs(organization_id uuid,id uuid,kind text,
  lease_token uuid,completed_at timestamptz,leased_until timestamptz,opaque_payload jsonb,
  unique(organization_id,id));
create table osp_private.request_manifest_decision_reviews(organization_id uuid,id uuid,case_id uuid,
  manifest_draft_id uuid,manifest_version integer,review_version integer,status text,manifest_sha256 text,
  reviewed_at timestamptz default now(),unique(organization_id,id));
create table osp_private.request_manifest_drafts(organization_id uuid,id uuid,case_id uuid,version integer,
  manifest_sha256 text,manifest_json jsonb);
create table osp_private.request_knowledge_promotions(organization_id uuid,id uuid,case_id uuid,
  review_id uuid,manifest_draft_id uuid,promoted_by_subject text,selected_keys_json jsonb,unique(organization_id,id));
create table osp_private.document_versions(id uuid,organization_id uuid,document_id uuid,version integer,
  document_type text,valid_from date,expires_at date,status text,review_after_sha256 text,
  unique(organization_id,id));
create table osp_private.documents(organization_id uuid,id uuid,case_id uuid);
create table osp_private.generated_packages(content_type text);
create table osp_private.document_extractions(organization_id uuid,id uuid,case_id uuid,source_version_id uuid,status text);
create table osp_private.extraction_fields(organization_id uuid,id uuid,extraction_id uuid,field_key text,
  presence text,value_json jsonb,confidence double precision,validation text,evidence_json jsonb,before_sha256 text,after_sha256 text);
create table osp_private.supplier_form_mappings(organization_id uuid,id uuid,case_id uuid,template_version_id uuid,
  extraction_id uuid,review_decision_id uuid,version integer,status text,mapping_json jsonb,
  before_sha256 text,after_sha256 text,updated_at timestamptz);
create table osp_private.review_decisions(organization_id uuid,id uuid,case_id uuid,subject_kind text,
  subject_id uuid,decision text,before_sha256 text,after_sha256 text);
create table storage.buckets(id text primary key,public boolean,file_size_limit bigint,allowed_mime_types text[]);
insert into storage.buckets values('osp-derived-documents',false,26214400,array[
  'application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
-- Deterministic upstream catalog seams. Pending migrations, their SQL
-- guards and actual API stores are exercised; catalog inference is not mocked as proven.
create function osp_private.reject_request_knowledge_ledger_mutation() returns trigger
  language plpgsql as $$ begin raise exception 'APPEND_ONLY'; end $$;
create function osp_private.request_knowledge_candidates(uuid,uuid,uuid)
  returns table(knowledge_kind text,canonical_key text,display_label text,aliases_json jsonb,value_type text,required boolean)
  language sql as $$ select 'field','supplier.website','Website','["website"]'::jsonb,'string',true $$;
create function osp_private.request_knowledge_reuse_policy(text,text,text,jsonb,text)
  returns table(reuse_eligibility text,target_canonical_key text)
  language sql as $$ select 'eligible','supplier.website' $$;
