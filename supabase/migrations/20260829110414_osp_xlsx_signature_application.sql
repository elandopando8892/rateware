create table osp_private.signature_xlsx_positions (
  id uuid primary key,
  organization_id uuid not null,
  version integer not null check (version between 1 and 2147483647),
  worksheet_name text not null check (
    worksheet_name = btrim(worksheet_name) and length(worksheet_name) between 1 and 31
    and worksheet_name !~ '[:\\/?*\[\]]'
  ),
  cell_range text not null check (
    cell_range ~ '^[A-Z]{1,3}[1-9][0-9]{0,6}:[A-Z]{1,3}[1-9][0-9]{0,6}$'
    and (length(regexp_replace(split_part(cell_range, ':', 1), '[0-9]', '', 'g')) < 3
      or regexp_replace(split_part(cell_range, ':', 1), '[0-9]', '', 'g') <= 'XFD')
    and (length(regexp_replace(split_part(cell_range, ':', 2), '[0-9]', '', 'g')) < 3
      or regexp_replace(split_part(cell_range, ':', 2), '[0-9]', '', 'g') <= 'XFD')
    and regexp_replace(split_part(cell_range, ':', 1), '[A-Z]', '', 'g')::integer <= 1048576
    and regexp_replace(split_part(cell_range, ':', 2), '[A-Z]', '', 'g')::integer <= 1048576
  ),
  active boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, version)
);

create unique index signature_xlsx_positions_one_active_per_tenant
  on osp_private.signature_xlsx_positions (organization_id) where active;

create trigger signature_xlsx_positions_append_only
before update or delete on osp_private.signature_xlsx_positions
for each row execute function osp_private.reject_signature_policy_mutation();

alter table osp_private.signature_vault_policies
  add column signature_xlsx_position_id uuid,
  alter column signature_position_id drop not null,
  add constraint signature_vault_policies_xlsx_position_fk
    foreign key (organization_id, signature_xlsx_position_id)
    references osp_private.signature_xlsx_positions(organization_id, id),
  add constraint signature_vault_policies_exact_target_check check (
    (signature_position_id is not null)::integer +
    (signature_xlsx_position_id is not null)::integer = 1
  );

create index signature_vault_policies_xlsx_position_idx
  on osp_private.signature_vault_policies
  (organization_id, signature_xlsx_position_id)
  where signature_xlsx_position_id is not null;

alter table osp_private.generated_packages
  add column content_type text;

alter table osp_private.generated_packages
  add constraint generated_packages_content_type_check check (
    content_type is null or content_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  ) not valid;

create function osp_private.inherit_signed_package_content_type()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.package_kind = 'signed' and new.content_type is null then
    new.content_type := (
      select source.content_type
      from osp_private.generated_packages source
      where source.organization_id = new.organization_id
        and source.case_id = new.case_id
        and source.id = new.supersedes_package_id
    );
  end if;
  return new;
end;
$$;

create trigger generated_packages_inherit_signed_content_type
before insert on osp_private.generated_packages
for each row execute function osp_private.inherit_signed_package_content_type();

drop function osp_private.resolve_signature_application_policy(uuid, uuid, uuid, uuid, integer);

create function osp_private.resolve_signature_application_policy(
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
set search_path = pg_catalog, osp_private as $$
begin
  if not exists (
    select 1 from osp_private.background_jobs job
     where job.id = p_job_id and job.organization_id = p_organization_id
       and job.kind = 'apply_signature' and job.completed_at is null
       and job.lease_token = p_lease_token and job.leased_until > clock_timestamp()
       and job.opaque_payload->>'approvalId' = p_approval_id::text
  ) then
    raise exception using errcode = '42501', message = 'OSP_SIGNATURE_LEASE_INVALID';
  end if;
  return query
  select policy.vault_ref, policy.content_type,
    case when pdf_position.id is not null then 'pdf' else 'xlsx' end,
    pdf_position.page, pdf_position.x, pdf_position.y,
    pdf_position.width, pdf_position.height,
    xlsx_position.worksheet_name, xlsx_position.cell_range
  from osp_private.signature_approvals approval
  join osp_private.signature_vault_policies policy
    on policy.organization_id = approval.organization_id
   and policy.vault_ref = approval.signature_vault_ref and policy.active = true
  left join osp_private.signature_positions pdf_position
    on pdf_position.organization_id = policy.organization_id
   and pdf_position.id = policy.signature_position_id and pdf_position.active = true
  left join osp_private.signature_xlsx_positions xlsx_position
    on xlsx_position.organization_id = policy.organization_id
   and xlsx_position.id = policy.signature_xlsx_position_id and xlsx_position.active = true
  where approval.organization_id = p_organization_id and approval.id = p_approval_id
    and approval.signature_position_version = p_position_version
    and coalesce(pdf_position.version, xlsx_position.version) = p_position_version
    and (pdf_position.id is not null)::integer +
        (xlsx_position.id is not null)::integer = 1;
end;
$$;

alter table osp_private.signature_xlsx_positions enable row level security;
alter table osp_private.signature_xlsx_positions force row level security;

create policy signature_xlsx_positions_workflow_select
on osp_private.signature_xlsx_positions
for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

revoke all on osp_private.signature_xlsx_positions
from public, anon, authenticated, service_role, osp_worker;
grant select on osp_private.signature_xlsx_positions to osp_workflow_api;

revoke all on function osp_private.inherit_signed_package_content_type()
from public, anon, authenticated, service_role, osp_worker, osp_workflow_api;

revoke all on function osp_private.resolve_signature_application_policy(uuid, uuid, uuid, uuid, integer)
from public, anon, authenticated, osp_workflow_api;
grant execute on function osp_private.resolve_signature_application_policy(uuid, uuid, uuid, uuid, integer)
to osp_worker;
