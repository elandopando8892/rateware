-- Additive receipt ledger only. No activation, backfill, signature or job.
alter table osp_private.supplier_package_sets
  add constraint supplier_package_sets_case_identity unique (organization_id, case_id, id);
create table osp_private.package_set_operations_reviews (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  package_set_id uuid not null,
  idempotency_key text not null check (
    char_length(idempotency_key) between 1 and 256
    and idempotency_key ~ '^[A-Za-z0-9:_-]+$'
  ),
  command_sha256 text not null check (command_sha256 ~ '^[0-9a-f]{64}$'),
  review_sha256 text not null check (review_sha256 ~ '^[0-9a-f]{64}$'),
  basis_json jsonb not null check (
    jsonb_typeof(basis_json) = 'object'
    and (basis_json->>'reviewSha256' = review_sha256) is true
    and (basis_json->>'organizationId' = organization_id::text) is true
    and (basis_json->>'caseId' = case_id::text) is true
    and (basis_json->>'setId' = package_set_id::text) is true
    and (basis_json->>'schemaVersion' = '1') is true
    and (jsonb_typeof(basis_json->'members') = 'array') is true
    and (jsonb_array_length(basis_json->'members') between 1 and 20) is true
  ),
  actor_json jsonb not null check (
    jsonb_typeof(actor_json) = 'object'
    and (actor_json->>'organizationId' = organization_id::text) is true
    and (actor_json->>'role' = 'operations_reviewer') is true
  ),
  result_json jsonb not null check (
    jsonb_typeof(result_json) = 'object'
    and (result_json->>'caseId' = case_id::text) is true
    and (result_json->>'state' = 'signature_approval') is true
    and (result_json->>'caseVersion' = ((basis_json->>'caseVersion')::bigint + 1)::text) is true
  ),
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, idempotency_key),
  unique (organization_id, case_id, review_sha256),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, case_id, package_set_id)
    references osp_private.supplier_package_sets(organization_id, case_id, id)
);
alter table osp_private.package_set_operations_reviews enable row level security;
alter table osp_private.package_set_operations_reviews force row level security;
revoke all on osp_private.package_set_operations_reviews
  from public, anon, authenticated, service_role, osp_worker, osp_workflow_api;
grant select, insert on osp_private.package_set_operations_reviews to osp_workflow_api;
create policy package_set_operations_reviews_tenant on osp_private.package_set_operations_reviews
  for all to osp_workflow_api
  using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid)
  with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

create function osp_private.reject_package_set_operations_review_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $function$
begin
  raise exception using errcode = '55000', message = 'PACKAGE_SET_REVIEW_IMMUTABLE';
end;
$function$;
revoke all on function osp_private.reject_package_set_operations_review_mutation() from public;
create trigger package_set_operations_reviews_immutable
before update or delete on osp_private.package_set_operations_reviews
for each row execute function osp_private.reject_package_set_operations_review_mutation();
