-- Generated with Supabase CLI; reviewed for the shared Rateware/OSP boundary.
alter table osp_private.background_jobs
  drop constraint if exists background_jobs_kind_check;

alter table osp_private.background_jobs
  add constraint background_jobs_kind_check check (kind in (
    'gmail_ingest', 'duplicate_review_refresh', 'document_extract',
    'quarterly_document_check', 'form_ai_mapping',
    'generate_supplier_package', 'apply_signature',
    'send_authorized_payload'
  ));

do $bucket_boundary$
declare
  target storage.buckets%rowtype;
begin
  select * into target
  from storage.buckets
  where id = 'osp-derived-documents'
  for update;

  if not found
     or target.public is distinct from false
     or target.file_size_limit is distinct from 26214400
     or target.allowed_mime_types is distinct from array['application/pdf']::text[] then
    raise exception using errcode = '23514', message = 'BUCKET_POLICY_CONFLICT';
  end if;

  update storage.buckets
  set allowed_mime_types = array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
  where id = 'osp-derived-documents';
end;
$bucket_boundary$;

alter table osp_private.generated_packages
  add column artifact_receipt_json jsonb;

alter table osp_private.generated_packages
  add constraint generated_packages_artifact_receipt_check check (
    (package_kind = 'supplier_completed'
      and jsonb_typeof(artifact_receipt_json) = 'object'
      and artifact_receipt_json->>'outputSha256' = output_sha256
      and artifact_receipt_json->>'packageSnapshotId' = input_snapshot_id::text
      and artifact_receipt_json->>'packageSnapshotSha256' = input_snapshot_sha256)
    or
    (package_kind = 'signed' and artifact_receipt_json is null)
  ) not valid;

create table osp_private.supplier_package_generation_runs (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  input_snapshot_id uuid not null,
  job_id uuid not null,
  package_id uuid not null,
  object_id text not null check (
    object_id ~ '^[A-Za-z0-9:_-]+$' and length(object_id) between 1 and 256
  ),
  package_version integer not null check (package_version between 1 and 2147483647),
  status text not null check (status in (
    'prepared', 'generated', 'failed', 'manual_reconciliation_required'
  )),
  artifact_receipt_json jsonb,
  last_error_code text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, job_id),
  unique (organization_id, input_snapshot_id),
  unique (organization_id, package_id),
  unique (organization_id, object_id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, case_id, input_snapshot_id)
    references osp_private.case_package_input_snapshots(organization_id, case_id, id),
  constraint supplier_package_generation_receipt_check check (
    (status = 'generated' and jsonb_typeof(artifact_receipt_json) = 'object'
      and last_error_code is null)
    or (status = 'failed' and artifact_receipt_json is null
      and last_error_code ~ '^[A-Z][A-Z0-9_]{2,63}$')
    or (status in ('prepared', 'manual_reconciliation_required')
      and artifact_receipt_json is null)
  )
);

alter table osp_private.supplier_package_generation_runs enable row level security;
alter table osp_private.supplier_package_generation_runs force row level security;

revoke all on osp_private.supplier_package_generation_runs
  from public, anon, authenticated, service_role, osp_workflow_api, osp_worker;
grant select, insert, update on osp_private.supplier_package_generation_runs to osp_worker;
grant select on osp_private.background_jobs to osp_worker;
grant select, insert on osp_private.generated_packages to osp_worker;
grant update (status) on osp_private.generated_packages to osp_worker;
grant select on osp_private.case_package_input_snapshots,
  osp_private.case_form_instances, osp_private.form_fields,
  osp_private.supplier_form_mappings, osp_private.review_decisions,
  osp_private.document_versions, osp_private.documents,
  osp_private.document_extractions, osp_private.extraction_fields,
  osp_private.customer_registration_cases to osp_worker;

create policy supplier_package_runs_worker_tenant
on osp_private.supplier_package_generation_runs for all to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid)
with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy generated_packages_worker_tenant
on osp_private.generated_packages for all to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid)
with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy background_jobs_worker_package_tenant
on osp_private.background_jobs for select to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy customer_cases_worker_package_tenant
on osp_private.customer_registration_cases for select to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy package_snapshots_worker_package_tenant
on osp_private.case_package_input_snapshots for select to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy form_instances_worker_package_tenant
on osp_private.case_form_instances for select to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy form_fields_worker_package_tenant
on osp_private.form_fields for select to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy form_mappings_worker_package_tenant
on osp_private.supplier_form_mappings for select to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy review_decisions_worker_package_tenant
on osp_private.review_decisions for select to osp_worker
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

create unique index generated_packages_one_current_supplier_completed
  on osp_private.generated_packages (organization_id, case_id)
  where package_kind = 'supplier_completed' and status = 'current';

create function osp_private.enqueue_supplier_package_generation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $function$
begin
  insert into osp_private.background_jobs (
    id, organization_id, kind, opaque_payload, idempotency_key
  ) values (
    extensions.gen_random_uuid(),
    new.organization_id,
    'generate_supplier_package',
    jsonb_build_object('caseId', new.case_id::text, 'snapshotId', new.id::text),
    'supplier-package:' || new.id::text
  ) on conflict (organization_id, kind, idempotency_key) do nothing;
  return new;
end;
$function$;

revoke all on function osp_private.enqueue_supplier_package_generation() from public;

create trigger enqueue_supplier_package_generation_after_snapshot
after insert on osp_private.case_package_input_snapshots
for each row execute function osp_private.enqueue_supplier_package_generation();
