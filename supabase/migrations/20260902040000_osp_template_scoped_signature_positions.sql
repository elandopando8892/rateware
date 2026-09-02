create table osp_private.signature_xlsx_template_positions (
  id uuid primary key,
  organization_id uuid not null,
  source_template_sha256 text not null check (
    source_template_sha256 ~ '^[0-9a-f]{64}$'
  ),
  position_version integer not null check (
    position_version between 1 and 2147483647
  ),
  revision integer not null check (revision between 1 and 2147483647),
  worksheet_name text not null check (
    worksheet_name = pg_catalog.btrim(worksheet_name)
    and pg_catalog.length(worksheet_name) between 1 and 31
    and worksheet_name !~ '[:\\/?*\[\]]'
  ),
  cell_range text not null check (
    cell_range ~ '^[A-Z]{1,3}[1-9][0-9]{0,6}:[A-Z]{1,3}[1-9][0-9]{0,6}$'
  ),
  source_case_id uuid not null,
  reviewed_by_email text not null check (
    reviewed_by_email = pg_catalog.lower(pg_catalog.btrim(reviewed_by_email))
    and reviewed_by_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
  ),
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  unique (organization_id, id),
  unique (
    organization_id, source_template_sha256, position_version, revision
  ),
  foreign key (organization_id, source_case_id)
    references osp_private.customer_registration_cases(organization_id, id)
    on delete restrict
);

create index signature_xlsx_template_positions_latest
  on osp_private.signature_xlsx_template_positions (
    organization_id, source_template_sha256, position_version, revision desc
  );

create trigger signature_xlsx_template_positions_append_only
before update or delete on osp_private.signature_xlsx_template_positions
for each row execute function osp_private.reject_signature_policy_mutation();

alter table osp_private.signature_xlsx_template_positions enable row level security;
alter table osp_private.signature_xlsx_template_positions force row level security;

create policy signature_xlsx_template_positions_workflow_select
on osp_private.signature_xlsx_template_positions
for select to osp_workflow_api
using (
  organization_id = nullif(
    pg_catalog.current_setting('osp.organization_id', true), ''
  )::uuid
);

revoke all on osp_private.signature_xlsx_template_positions
from public, anon, authenticated, service_role, osp_worker;
grant select on osp_private.signature_xlsx_template_positions to osp_workflow_api;

create or replace function osp_private.resolve_signature_application_policy(
  p_organization_id uuid,
  p_approval_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_position_version integer
)
returns table (
  vault_ref text, content_type text, target_kind text, page integer,
  x numeric, y numeric, width numeric, height numeric,
  worksheet_name text, cell_range text
)
language plpgsql security definer
set search_path = pg_catalog, osp_private as $function$
begin
  if not exists (
    select 1
    from osp_private.background_jobs job
    where job.id = p_job_id
      and job.organization_id = p_organization_id
      and job.kind = 'apply_signature'
      and job.completed_at is null
      and job.lease_token = p_lease_token
      and job.leased_until > pg_catalog.clock_timestamp()
      and job.opaque_payload->>'approvalId' = p_approval_id::text
  ) then
    raise exception using
      errcode = '42501', message = 'OSP_SIGNATURE_LEASE_INVALID';
  end if;

  return query
  with approval_scope as (
    select approval.organization_id, approval.id, approval.signature_vault_ref,
      approval.signature_position_version,
      input_package.artifact_receipt_json->>'sourceSha256'
        as source_template_sha256
    from osp_private.signature_approvals approval
    join osp_private.generated_packages input_package
      on input_package.organization_id = approval.organization_id
     and input_package.case_id = approval.case_id
     and input_package.id = approval.generated_package_id
     and input_package.package_kind = 'supplier_completed'
     and input_package.status = 'current'
    where approval.organization_id = p_organization_id
      and approval.id = p_approval_id
      and approval.signature_position_version = p_position_version
  ), resolved as (
    select policy.vault_ref, policy.content_type, 'xlsx'::text as target_kind,
      null::integer as page, null::numeric as x, null::numeric as y,
      null::numeric as width, null::numeric as height,
      template_position.worksheet_name, template_position.cell_range,
      0 as priority, template_position.revision
    from approval_scope approval
    join osp_private.signature_vault_policies policy
      on policy.organization_id = approval.organization_id
     and policy.vault_ref = approval.signature_vault_ref
     and policy.active = true
    join osp_private.signature_xlsx_template_positions template_position
      on template_position.organization_id = approval.organization_id
     and template_position.source_template_sha256 =
       approval.source_template_sha256
     and template_position.position_version = p_position_version

    union all

    select policy.vault_ref, policy.content_type,
      case when pdf_position.id is not null then 'pdf' else 'xlsx' end,
      pdf_position.page, pdf_position.x, pdf_position.y,
      pdf_position.width, pdf_position.height,
      xlsx_position.worksheet_name, xlsx_position.cell_range,
      1 as priority, 0 as revision
    from approval_scope approval
    join osp_private.signature_vault_policies policy
      on policy.organization_id = approval.organization_id
     and policy.vault_ref = approval.signature_vault_ref
     and policy.active = true
    left join osp_private.signature_positions pdf_position
      on pdf_position.organization_id = policy.organization_id
     and pdf_position.id = policy.signature_position_id
     and pdf_position.active = true
    left join osp_private.signature_xlsx_positions xlsx_position
      on xlsx_position.organization_id = policy.organization_id
     and xlsx_position.id = policy.signature_xlsx_position_id
     and xlsx_position.active = true
    where coalesce(pdf_position.version, xlsx_position.version) =
      p_position_version
      and (pdf_position.id is not null)::integer
        + (xlsx_position.id is not null)::integer = 1
  )
  select resolved.vault_ref, resolved.content_type, resolved.target_kind,
    resolved.page, resolved.x, resolved.y, resolved.width, resolved.height,
    resolved.worksheet_name, resolved.cell_range
  from resolved
  order by resolved.priority, resolved.revision desc
  limit 1;
end;
$function$;

revoke all on function osp_private.resolve_signature_application_policy(
  uuid, uuid, uuid, uuid, integer
) from public, anon, authenticated, osp_workflow_api;
grant execute on function osp_private.resolve_signature_application_policy(
  uuid, uuid, uuid, uuid, integer
) to osp_worker;

comment on table osp_private.signature_xlsx_template_positions is
  'Human-reviewed XLSX signature placements keyed by exact source template SHA-256; immutable revisions are reusable only for the same template.';

