-- Additive OSP-only persistence. Does not activate the new worker path or alter
-- the legacy single-package index, signatures, jobs, business data or salients.
create table osp_private.supplier_package_sets (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  input_snapshot_id uuid not null,
  input_snapshot_sha256 text not null check (input_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  job_id uuid not null,
  version integer not null check (version > 0),
  plan_sha256 text not null check (plan_sha256 ~ '^[0-9a-f]{64}$'),
  source_plan_json jsonb not null check (
    jsonb_typeof(source_plan_json) = 'array'
    and jsonb_array_length(source_plan_json) between 1 and 20
  ),
  status text not null check (status in (
    'prepared', 'current', 'superseded', 'manual_reconciliation_required'
  )),
  manifest_sha256 text check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  receipt_json jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, case_id, version),
  unique (organization_id, input_snapshot_id),
  unique (organization_id, job_id),
  foreign key (organization_id, case_id, input_snapshot_id)
    references osp_private.case_package_input_snapshots(organization_id, case_id, id),
  foreign key (organization_id, job_id)
    references osp_private.background_jobs(organization_id, id),
  constraint supplier_package_set_receipt_state check (
    case when status in ('current', 'superseded') then
      receipt_json is not null and manifest_sha256 is not null
      and jsonb_typeof(receipt_json) = 'object'
      and (receipt_json->>'manifestSha256' = manifest_sha256) is true
      and (receipt_json->>'planSha256' = plan_sha256) is true
      and (receipt_json->>'setId' = id::text) is true
      and (receipt_json->>'organizationId' = organization_id::text) is true
      and (receipt_json->>'caseId' = case_id::text) is true
      and (receipt_json->>'snapshotId' = input_snapshot_id::text) is true
      and (receipt_json->>'snapshotSha256' = input_snapshot_sha256) is true
      and (receipt_json->>'version' = version::text) is true
      and (receipt_json->>'schemaVersion' = '1') is true
      and (jsonb_typeof(receipt_json->'members') = 'array') is true
      and (jsonb_array_length(receipt_json->'members') = jsonb_array_length(source_plan_json)) is true
    else receipt_json is null and manifest_sha256 is null end
  )
);

create unique index supplier_package_sets_one_current
  on osp_private.supplier_package_sets (organization_id, case_id)
  where status = 'current';

alter table osp_private.supplier_package_sets enable row level security;
alter table osp_private.supplier_package_sets force row level security;
revoke all on osp_private.supplier_package_sets
  from public, anon, authenticated, service_role, osp_worker, osp_workflow_api;
grant select, insert on osp_private.supplier_package_sets to osp_worker;
grant update (status, receipt_json, manifest_sha256, updated_at)
  on osp_private.supplier_package_sets to osp_worker;
grant select on osp_private.supplier_package_sets to osp_workflow_api;
create policy supplier_package_sets_worker_tenant on osp_private.supplier_package_sets
  for all to osp_worker
  using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid)
  with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy supplier_package_sets_reader_tenant on osp_private.supplier_package_sets
  for select to osp_workflow_api
  using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

create function osp_private.guard_supplier_package_set_immutability()
returns trigger language plpgsql set search_path = pg_catalog, osp_private as $function$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'prepared' then
      raise exception using message = 'SUPPLIER_PACKAGE_SET_STATE_CONFLICT';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - array['status','receipt_json','manifest_sha256','updated_at'])
     is distinct from
     (to_jsonb(old) - array['status','receipt_json','manifest_sha256','updated_at'])
     or not ((old.status = 'prepared' and new.status in ('current','manual_reconciliation_required'))
       or (old.status = 'current' and new.status = 'superseded'
           and new.receipt_json = old.receipt_json
           and new.manifest_sha256 = old.manifest_sha256)) then
    raise exception using message = 'SUPPLIER_PACKAGE_SET_IMMUTABLE';
  end if;
  return new;
end;
$function$;
revoke all on function osp_private.guard_supplier_package_set_immutability() from public;
create trigger supplier_package_set_immutability
before insert or update on osp_private.supplier_package_sets
for each row execute function osp_private.guard_supplier_package_set_immutability();

-- A narrow locking helper avoids granting UPDATE on customer cases to a worker.
-- It locks both business aggregate and claimed job through the caller transaction.
create function osp_private.lock_supplier_package_set_context(
  p_org uuid, p_case uuid, p_snapshot uuid, p_sha text, p_job uuid, p_lease uuid
) returns void language plpgsql security definer
set search_path = pg_catalog, osp_private as $function$
declare
  v_case osp_private.customer_registration_cases%rowtype;
  v_job osp_private.background_jobs%rowtype;
begin
  if p_org is distinct from nullif(current_setting('osp.organization_id', true), '')::uuid then
    raise exception using message = 'INVALID_ORGANIZATION';
  end if;
  select * into v_case from osp_private.customer_registration_cases
    where organization_id = p_org and id = p_case for update;
  if not found or v_case.state <> 'operations_review' or not exists (
    select 1 from osp_private.case_package_input_snapshots
    where organization_id = p_org and case_id = p_case and id = p_snapshot
      and canonical_sha256 = p_sha and case_version = v_case.aggregate_version
      and id = (select latest.id from osp_private.case_package_input_snapshots latest
        where latest.organization_id = p_org and latest.case_id = p_case
        order by latest.created_at desc, latest.id desc limit 1)
  ) then raise exception using message = 'SUPPLIER_PACKAGE_SET_STALE_SNAPSHOT'; end if;
  perform source.id from osp_private.document_versions source
    join osp_private.case_package_input_snapshots snapshot
      on snapshot.organization_id = source.organization_id
      and source.id = any(snapshot.document_version_ids)
    where snapshot.organization_id = p_org and snapshot.case_id = p_case
      and snapshot.id = p_snapshot
    order by source.id for share of source;
  select * into v_job from osp_private.background_jobs
    where organization_id = p_org and id = p_job for update;
  if not found or v_job.kind <> 'generate_supplier_package'
    or v_job.lease_token is distinct from p_lease or p_lease is null
    or v_job.completed_at is not null
    or v_job.leased_until is null or v_job.leased_until < clock_timestamp()
    or v_job.opaque_payload is distinct from jsonb_build_object(
      'caseId', p_case::text, 'snapshotId', p_snapshot::text
    ) then raise exception using message = 'LEASE_CONFLICT'; end if;
end;
$function$;
revoke all on function osp_private.lock_supplier_package_set_context(uuid,uuid,uuid,text,uuid,uuid)
  from public, anon, authenticated, service_role, osp_workflow_api;
grant execute on function osp_private.lock_supplier_package_set_context(uuid,uuid,uuid,text,uuid,uuid)
  to osp_worker;
