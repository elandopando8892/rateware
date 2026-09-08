-- Final-output human review evidence, distinct from extraction/mapping approval.
-- No backfill, endpoint activation, signature, provider or outbound work.
create table osp_private.package_set_member_reviews (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  package_set_id uuid not null,
  source_version_id uuid not null,
  review_version integer not null check (review_version > 0),
  set_manifest_sha256 text not null check (set_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  request_manifest_sha256 text not null check (request_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  output_sha256 text not null check (output_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('approved','rejected')),
  full_output_inspected boolean not null,
  completion_percent integer check (completion_percent between 0 and 100),
  page_count integer check (page_count between 1 and 1000),
  signature_requirement text not null check (signature_requirement in ('none','image','autograph')),
  signature_policy_version integer check (signature_policy_version > 0),
  actor_json jsonb not null check (jsonb_typeof(actor_json) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  check (status <> 'approved' or (full_output_inspected and completion_percent is not null)),
  check ((signature_requirement = 'none' and signature_policy_version is null)
    or (signature_requirement <> 'none' and signature_policy_version is not null)),
  unique (organization_id, package_set_id, source_version_id, review_version),
  foreign key (organization_id, case_id, package_set_id)
    references osp_private.supplier_package_sets(organization_id, case_id, id),
  foreign key (organization_id, source_version_id)
    references osp_private.document_versions(organization_id, id)
);
alter table osp_private.package_set_member_reviews enable row level security;
alter table osp_private.package_set_member_reviews force row level security;
revoke all on osp_private.package_set_member_reviews
  from public, anon, authenticated, service_role, osp_worker, osp_workflow_api;
grant select, insert on osp_private.package_set_member_reviews to osp_workflow_api;
create policy package_set_member_reviews_tenant on osp_private.package_set_member_reviews
  for all to osp_workflow_api
  using (organization_id = nullif(current_setting('osp.organization_id',true),'')::uuid)
  with check (organization_id = nullif(current_setting('osp.organization_id',true),'')::uuid);

create function osp_private.guard_package_set_member_review()
returns trigger language plpgsql security definer
set search_path = pg_catalog, osp_private as $function$
declare p osp_private.supplier_package_sets%rowtype;
  v_version integer;
begin
  if tg_op <> 'INSERT' then raise exception 'PACKAGE_SET_MEMBER_REVIEW_IMMUTABLE'; end if;
  if new.organization_id is distinct from nullif(current_setting('osp.organization_id',true),'')::uuid
    or (new.actor_json->>'organizationId') is distinct from new.organization_id::text
    or (new.actor_json->>'active') is distinct from 'true' then raise exception 'APPROVAL_FORBIDDEN'; end if;
  perform osp_private.assert_approval_actor(new.organization_id, 'complete_operations_review',
    new.actor_json->>'subject', new.actor_json->>'verifiedEmail',
    array(select jsonb_array_elements_text(new.actor_json->'permissions')),
    new.actor_json->>'role', new.actor_json->>'authorizationSessionId',
    (new.actor_json->>'authorizationSessionIssuedAt')::timestamptz);
  perform id from osp_private.customer_registration_cases
    where organization_id = new.organization_id and id = new.case_id and state = 'operations_review' for update;
  if not found then raise exception 'PACKAGE_SET_REVIEW_STALE'; end if;
  select * into p from osp_private.supplier_package_sets
    where organization_id = new.organization_id and case_id = new.case_id and id = new.package_set_id for share;
  if not found or p.status <> 'current' or p.manifest_sha256 <> new.set_manifest_sha256
    or not exists (select 1 from jsonb_array_elements(p.receipt_json->'members') member
      where member->'artifact'->>'sourceVersionId' = new.source_version_id::text
        and member->'artifact'->>'outputSha256' = new.output_sha256)
    or new.request_manifest_sha256 is distinct from (
      select manifest_sha256 from osp_private.request_manifest_drafts
      where organization_id = new.organization_id and case_id = new.case_id order by version desc limit 1)
  then raise exception 'PACKAGE_SET_REVIEW_STALE'; end if;
  select coalesce(max(review_version),0)+1 into v_version from osp_private.package_set_member_reviews
    where organization_id = new.organization_id and package_set_id = new.package_set_id and source_version_id = new.source_version_id;
  if new.review_version <> v_version then raise exception 'PACKAGE_SET_REVIEW_STALE'; end if;
  return new;
end;
$function$;
revoke all on function osp_private.guard_package_set_member_review() from public;
create trigger package_set_member_review_guard before insert or update or delete
  on osp_private.package_set_member_reviews for each row execute function osp_private.guard_package_set_member_review();

-- Locking only, no write grants on cases/sources/sets are given to the API role.
create function osp_private.lock_package_set_operations_context(p_org uuid,p_case uuid,p_version bigint,p_sha text)
returns void language plpgsql security definer set search_path = pg_catalog, osp_private as $function$
declare v_case osp_private.customer_registration_cases%rowtype;
begin
  if p_org is distinct from nullif(current_setting('osp.organization_id',true),'')::uuid then raise exception 'INVALID_ORGANIZATION'; end if;
  select * into v_case from osp_private.customer_registration_cases
    where organization_id = p_org and id = p_case for update;
  if not found or v_case.state <> 'operations_review' or v_case.aggregate_version <> p_version
    or p_sha is distinct from (select canonical_sha256 from osp_private.case_package_input_snapshots
      where organization_id = p_org and case_id = p_case and case_version = p_version order by created_at desc,id desc limit 1)
    then raise exception 'PACKAGE_SET_REVIEW_STALE'; end if;
  perform id from osp_private.supplier_package_sets where organization_id = p_org and case_id = p_case and status = 'current' for share;
  perform version.id from osp_private.document_versions version
    join osp_private.documents document on document.organization_id = version.organization_id and document.id = version.document_id
    where version.organization_id = p_org and (document.case_id = p_case or document.case_id is null)
    order by version.id for share of version;
  perform id from osp_private.request_manifest_drafts where organization_id = p_org and case_id = p_case order by version for share;
  perform id from osp_private.request_manifest_decision_reviews where organization_id = p_org and case_id = p_case order by review_version for share;
  perform id from osp_private.package_set_member_reviews where organization_id = p_org and case_id = p_case order by review_version for share;
end;
$function$;
revoke all on function osp_private.lock_package_set_operations_context(uuid,uuid,bigint,text)
  from public, anon, authenticated, service_role, osp_worker;
grant execute on function osp_private.lock_package_set_operations_context(uuid,uuid,bigint,text) to osp_workflow_api;
