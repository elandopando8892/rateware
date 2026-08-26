create table osp_private.signature_positions (
  id uuid primary key,
  organization_id uuid not null,
  version integer not null check (version between 1 and 2147483647),
  page integer not null check (page between 1 and 1000),
  x numeric not null check (x >= 0),
  y numeric not null check (y >= 0),
  width numeric not null check (width > 0),
  height numeric not null check (height > 0),
  active boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, version)
);

create unique index signature_positions_one_active_per_tenant
  on osp_private.signature_positions (organization_id) where active;

create table osp_private.signature_vault_policies (
  id uuid primary key,
  organization_id uuid not null,
  vault_ref text not null check (vault_ref ~ '^[A-Za-z0-9:_-]+$' and length(vault_ref) between 1 and 256),
  content_type text not null check (content_type in ('image/png', 'image/jpeg')),
  signature_position_id uuid not null,
  active boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, vault_ref),
  foreign key (organization_id, signature_position_id)
    references osp_private.signature_positions(organization_id, id)
);

create unique index signature_vault_policies_one_active_per_tenant
  on osp_private.signature_vault_policies (organization_id) where active;

create table osp_private.signature_application_receipts (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  approval_id uuid not null,
  input_object_id text not null check (input_object_id ~ '^[A-Za-z0-9:_/-]+$' and length(input_object_id) between 1 and 512),
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  output_object_id text check (output_object_id ~ '^[A-Za-z0-9:_/-]+$' and length(output_object_id) between 1 and 512),
  output_sha256 text check (output_sha256 ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in ('reserved', 'applied', 'failed', 'manual_reconciliation_required')),
  failure_code text check (failure_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  unique (organization_id, id),
  unique (organization_id, approval_id),
  unique (organization_id, output_object_id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, case_id, approval_id)
    references osp_private.signature_approvals(organization_id, case_id, id),
  constraint signature_application_outcome_check check (
    (outcome = 'reserved' and output_object_id is null and output_sha256 is null and failure_code is null and completed_at is null) or
    (outcome = 'applied' and output_object_id is not null and output_sha256 is not null and failure_code is null and completed_at is not null) or
    (outcome = 'failed' and output_object_id is null and output_sha256 is null and failure_code is not null and completed_at is not null) or
    (outcome = 'manual_reconciliation_required' and output_object_id is null and output_sha256 is null and failure_code is null and completed_at is not null)
  )
);

create function osp_private.reject_signature_policy_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '55000', message = 'OSP_APPEND_ONLY';
end;
$$;

create trigger signature_positions_append_only
before update or delete on osp_private.signature_positions
for each row execute function osp_private.reject_signature_policy_mutation();

create trigger signature_vault_policies_append_only
before update or delete on osp_private.signature_vault_policies
for each row execute function osp_private.reject_signature_policy_mutation();

create or replace function osp_private.package_snapshot_hash_is_current(
  p_organization_id uuid,
  p_case_id uuid,
  p_snapshot_sha256 text
)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from osp_private.case_package_input_snapshots snapshot
    where snapshot.organization_id = p_organization_id
      and snapshot.case_id = p_case_id
      and snapshot.canonical_sha256 = p_snapshot_sha256
      and not exists (
        select 1 from osp_private.case_package_input_snapshots later
        where later.organization_id = snapshot.organization_id
          and later.case_id = snapshot.case_id
          and (later.created_at, later.id) > (snapshot.created_at, snapshot.id)
      )
      and cardinality(snapshot.document_version_ids) = (
        select count(*) from osp_private.document_versions version
        where version.organization_id = snapshot.organization_id
          and version.id = any(snapshot.document_version_ids)
          and version.status = 'approved'
          and version.retention_disposition <> 'disposed'
          and (
            version.document_type = 'supplier_requirement' or (
              version.valid_from <= (statement_timestamp() at time zone 'UTC')::date
              and (statement_timestamp() at time zone 'UTC')::date < version.expires_at
            )
          )
      )
      and not exists (
        select 1 from osp_private.document_versions version
        join osp_private.document_versions later_version
          on later_version.organization_id = version.organization_id
         and later_version.document_id = version.document_id
         and later_version.id <> version.id
         and later_version.version > version.version
         and later_version.status = 'approved'
        where version.organization_id = snapshot.organization_id
          and version.id = any(snapshot.document_version_ids)
      )
      and cardinality(snapshot.extraction_ids) = (
        select count(*) from osp_private.document_extractions extraction
        where extraction.organization_id = snapshot.organization_id
          and extraction.case_id = snapshot.case_id
          and extraction.id = any(snapshot.extraction_ids)
          and extraction.status = 'reviewed'
      )
      and exists (
        select 1 from osp_private.case_form_instances form_instance
        where form_instance.organization_id = snapshot.organization_id
          and form_instance.case_id = snapshot.case_id
          and form_instance.id = snapshot.form_instance_id
          and form_instance.version = snapshot.form_instance_version
          and form_instance.template_version_id = snapshot.template_version_id
      )
      and not exists (
        select 1 from jsonb_array_elements(snapshot.mapping_refs) item(ref)
        where not exists (
          select 1 from osp_private.supplier_form_mappings mapping
          where mapping.organization_id = snapshot.organization_id
            and mapping.case_id = snapshot.case_id
            and mapping.id = (ref->>'mappingId')::uuid
            and mapping.version = (ref->>'mappingVersion')::integer
            and mapping.after_sha256 = ref->>'mappingSha256'
            and mapping.review_decision_id = (ref->>'reviewDecisionId')::uuid
            and mapping.status in ('accepted', 'corrected')
        )
      )
  );
$$;

create or replace function osp_private.assert_package_snapshot_hash_current(
  p_organization_id uuid,
  p_case_id uuid,
  p_snapshot_sha256 text
)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  current_snapshot osp_private.case_package_input_snapshots%rowtype;
  document_version_id uuid;
begin
  if nullif(current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id then
    raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
  end if;
  perform 1 from osp_private.customer_registration_cases case_record
  where case_record.organization_id = p_organization_id
    and case_record.id = p_case_id
  for update;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SNAPSHOT_MISMATCH';
  end if;
  select * into current_snapshot from osp_private.case_package_input_snapshots snapshot
  where snapshot.organization_id = p_organization_id
    and snapshot.case_id = p_case_id
    and snapshot.canonical_sha256 = p_snapshot_sha256
    and not exists (
      select 1 from osp_private.case_package_input_snapshots later
      where later.organization_id = snapshot.organization_id
        and later.case_id = snapshot.case_id
        and (later.created_at, later.id) > (snapshot.created_at, snapshot.id)
    )
  for share;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SNAPSHOT_MISMATCH';
  end if;
  foreach document_version_id in array current_snapshot.document_version_ids loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      pg_catalog.json_build_array(
        p_organization_id, 'document_effect', document_version_id
      )::text, 0
    ));
  end loop;
  perform 1 from osp_private.document_versions version
  where version.organization_id = p_organization_id
    and version.id = any(current_snapshot.document_version_ids)
  for share;
  if not osp_private.package_snapshot_hash_is_current(
    p_organization_id, p_case_id, p_snapshot_sha256
  ) then
    raise exception using errcode = '23514', message = 'OSP_SNAPSHOT_MISMATCH';
  end if;
end;
$$;

create function osp_private.assert_current_package_snapshot(
  p_organization_id uuid,
  p_case_id uuid,
  p_expected_case_version bigint
)
returns table (canonical_sha256 text)
language plpgsql security invoker set search_path = '' as $$
declare
  current_case osp_private.customer_registration_cases%rowtype;
  current_snapshot osp_private.case_package_input_snapshots%rowtype;
begin
  if nullif(current_setting('osp.organization_id', true), '')::uuid is distinct from p_organization_id then
    raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
  end if;
  select * into current_case from osp_private.customer_registration_cases candidate
   where candidate.organization_id = p_organization_id and candidate.id = p_case_id for update;
  if not found or current_case.aggregate_version <> p_expected_case_version then
    raise exception using errcode = '40001', message = 'OSP_VERSION_CONFLICT';
  end if;
  if current_case.state <> 'operations_review' then
    raise exception using errcode = '23514', message = 'OSP_TRANSITION_INVALID';
  end if;
  select * into current_snapshot from osp_private.case_package_input_snapshots snapshot
   where snapshot.organization_id = p_organization_id and snapshot.case_id = p_case_id
     and snapshot.case_version = p_expected_case_version
   order by snapshot.created_at desc limit 1;
  if not found then
    raise exception using errcode = '23514', message = 'OSP_SNAPSHOT_MISMATCH';
  end if;
  perform osp_private.assert_package_snapshot_hash_current(
    p_organization_id, p_case_id, current_snapshot.canonical_sha256
  );
  return query select current_snapshot.canonical_sha256;
end;
$$;

create function osp_private.prepare_signature_application(
  p_organization_id uuid, p_approval_id uuid, p_job_id uuid, p_lease_token uuid
)
returns table (
  preparation text, case_id uuid, input_object_id text, input_sha256 text,
  position_version integer, output_object_id text, output_sha256 text
)
language plpgsql security definer
set search_path = pg_catalog, osp_private, extensions as $$
declare
  approval_case_id uuid;
  approval osp_private.signature_approvals%rowtype;
  package osp_private.generated_packages%rowtype;
  receipt osp_private.signature_application_receipts%rowtype;
begin
  if not exists (
    select 1 from osp_private.background_jobs job
     where job.id = p_job_id and job.organization_id = p_organization_id
       and job.kind = 'apply_signature' and job.completed_at is null
       and job.lease_token = p_lease_token and job.leased_until > clock_timestamp()
       and job.opaque_payload->>'approvalId' = p_approval_id::text
  ) then raise exception using errcode = '42501', message = 'OSP_SIGNATURE_LEASE_INVALID'; end if;
  perform pg_catalog.set_config('osp.organization_id', p_organization_id::text, true);
  select candidate.case_id into approval_case_id
  from osp_private.signature_approvals candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_approval_id;
  if not found then raise exception using errcode = '23514', message = 'OSP_SIGNATURE_APPROVAL_INVALID'; end if;
  perform 1 from osp_private.customer_registration_cases case_record
  where case_record.organization_id = p_organization_id and case_record.id = approval_case_id
  for update;
  if not found then raise exception using errcode = '23514', message = 'OSP_SIGNATURE_APPROVAL_INVALID'; end if;
  select * into approval from osp_private.signature_approvals candidate
   where candidate.organization_id = p_organization_id and candidate.id = p_approval_id
     and candidate.case_id = approval_case_id for update;
  if not found then raise exception using errcode = '23514', message = 'OSP_SIGNATURE_APPROVAL_INVALID'; end if;
  if not exists (
    select 1 from osp_private.approval_events approved_event
    where approved_event.organization_id = approval.organization_id
      and approved_event.case_id = approval.case_id
      and approved_event.event_type = 'approve_signature'
      and approved_event.command_sha256 = approval.command_sha256
      and approved_event.actor_subject = approval.actor_subject
      and approved_event.authorization_session_id = approval.authorization_session_id
      and approved_event.evidence_refs @> pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'approvalId', approval.id,
          'inputSnapshotSha256', approval.input_snapshot_sha256
        )
      )
  ) then
    raise exception using errcode = '23514', message = 'OSP_SIGNATURE_APPROVAL_INVALID';
  end if;
  select * into receipt from osp_private.signature_application_receipts candidate
   where candidate.organization_id = p_organization_id and candidate.approval_id = p_approval_id for update;
  if found then
    if receipt.outcome = 'applied' then
      return query select 'applied'::text, receipt.case_id, receipt.input_object_id, receipt.input_sha256,
        approval.signature_position_version, receipt.output_object_id, receipt.output_sha256;
      return;
    end if;
    if receipt.outcome = 'failed' then
      return query select 'failed'::text, receipt.case_id, receipt.input_object_id, receipt.input_sha256,
        approval.signature_position_version, null::text, null::text;
      return;
    end if;
    return query select 'unknown_write'::text, receipt.case_id, receipt.input_object_id, receipt.input_sha256,
      approval.signature_position_version, null::text, null::text;
    return;
  end if;
  perform osp_private.assert_package_snapshot_hash_current(
    p_organization_id, approval.case_id, approval.input_snapshot_sha256
  );
  select * into package from osp_private.generated_packages candidate
   where candidate.organization_id = p_organization_id and candidate.case_id = approval.case_id
     and candidate.id = approval.generated_package_id and candidate.package_kind = 'supplier_completed'
     and candidate.status = 'current' and candidate.input_snapshot_sha256 = approval.input_snapshot_sha256;
  if not found or exists (
    select 1 from osp_private.approval_events event
     where event.organization_id = p_organization_id and event.case_id = approval.case_id
       and event.event_type = 'approval_invalidated' and event.occurred_at >= approval.approved_at
  ) then raise exception using errcode = '23514', message = 'OSP_SIGNATURE_APPROVAL_INVALID'; end if;
  insert into osp_private.signature_application_receipts (
    id, organization_id, case_id, approval_id, input_object_id, input_sha256, outcome
  ) values (
    extensions.gen_random_uuid(), p_organization_id, approval.case_id, p_approval_id,
    package.object_id, package.output_sha256, 'reserved'
  );
  return query select 'ready'::text, approval.case_id, package.object_id, package.output_sha256,
    approval.signature_position_version, null::text, null::text;
end;
$$;

create function osp_private.resolve_signature_application_policy(
  p_organization_id uuid,
  p_approval_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_position_version integer
)
returns table (
  vault_ref text, content_type text, page integer,
  x numeric, y numeric, width numeric, height numeric
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
  ) then raise exception using errcode = '42501', message = 'OSP_SIGNATURE_LEASE_INVALID'; end if;
  return query
  select policy.vault_ref, policy.content_type, position.page,
    position.x, position.y, position.width, position.height
  from osp_private.signature_approvals approval
  join osp_private.signature_vault_policies policy
    on policy.organization_id = approval.organization_id
   and policy.vault_ref = approval.signature_vault_ref and policy.active = true
  join osp_private.signature_positions position
    on position.organization_id = policy.organization_id
   and position.id = policy.signature_position_id and position.active = true
  where approval.organization_id = p_organization_id and approval.id = p_approval_id
    and approval.signature_position_version = p_position_version
    and position.version = p_position_version;
end;
$$;

create function osp_private.complete_signature_application(
  p_organization_id uuid,
  p_approval_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_input_sha256 text,
  p_output_object_id text,
  p_output_sha256 text
)
returns void language plpgsql security definer
set search_path = pg_catalog, osp_private, extensions as $$
declare
  receipt_case_id uuid;
  receipt osp_private.signature_application_receipts%rowtype;
  approval osp_private.signature_approvals%rowtype;
  source_package osp_private.generated_packages%rowtype;
  current_case osp_private.customer_registration_cases%rowtype;
  next_version integer;
begin
  if not exists (
    select 1 from osp_private.background_jobs job
     where job.id = p_job_id and job.organization_id = p_organization_id
       and job.kind = 'apply_signature' and job.completed_at is null
       and job.lease_token = p_lease_token and job.leased_until > clock_timestamp()
       and job.opaque_payload->>'approvalId' = p_approval_id::text
  ) then raise exception using errcode = '42501', message = 'OSP_SIGNATURE_LEASE_INVALID'; end if;
  perform pg_catalog.set_config('osp.organization_id', p_organization_id::text, true);
  select candidate.case_id into receipt_case_id
  from osp_private.signature_application_receipts candidate
  where candidate.organization_id = p_organization_id and candidate.approval_id = p_approval_id;
  if not found then raise exception using errcode = '23514', message = 'OSP_SIGNATURE_RECEIPT_INVALID'; end if;
  select * into current_case from osp_private.customer_registration_cases candidate
   where candidate.organization_id = p_organization_id and candidate.id = receipt_case_id for update;
  if not found then raise exception using errcode = '23514', message = 'OSP_TRANSITION_INVALID'; end if;
  select * into approval from osp_private.signature_approvals candidate
   where candidate.organization_id = p_organization_id and candidate.id = p_approval_id
     and candidate.case_id = receipt_case_id for update;
  if not found then raise exception using errcode = '23514', message = 'OSP_SIGNATURE_RECEIPT_INVALID'; end if;
  select * into receipt from osp_private.signature_application_receipts candidate
   where candidate.organization_id = p_organization_id and candidate.approval_id = p_approval_id
     and candidate.case_id = receipt_case_id for update;
  if not found or receipt.outcome <> 'reserved' or receipt.input_sha256 <> p_input_sha256 or
     p_output_object_id !~ '^[A-Za-z0-9:_/-]+$' or length(p_output_object_id) not between 1 and 512 or
     p_output_object_id not like 'signed:' || p_organization_id::text || ':%' or
     split_part(p_output_object_id, ':', 3) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
     array_length(string_to_array(p_output_object_id, ':'), 1) <> 3 or
     p_output_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '23514', message = 'OSP_SIGNATURE_RECEIPT_INVALID';
  end if;
  if current_case.state <> 'signature_approval' then
    raise exception using errcode = '23514', message = 'OSP_TRANSITION_INVALID';
  end if;
  perform osp_private.assert_package_snapshot_hash_current(
    p_organization_id, receipt.case_id, approval.input_snapshot_sha256
  );
  select * into source_package from osp_private.generated_packages candidate
   where candidate.organization_id = p_organization_id and candidate.id = approval.generated_package_id;
  select coalesce(max(package.version), 0) + 1 into next_version from osp_private.generated_packages package
   where package.organization_id = p_organization_id and package.case_id = receipt.case_id;
  update osp_private.signature_application_receipts set
    output_object_id = p_output_object_id, output_sha256 = p_output_sha256,
    outcome = 'applied', completed_at = statement_timestamp()
   where organization_id = p_organization_id and approval_id = p_approval_id;
  insert into osp_private.generated_packages (
    id, organization_id, case_id, input_snapshot_id, input_snapshot_sha256, object_id,
    output_sha256, version, package_kind, status, signature_approval_id, supersedes_package_id
  ) values (
    extensions.gen_random_uuid(), p_organization_id, receipt.case_id, source_package.input_snapshot_id,
    source_package.input_snapshot_sha256, p_output_object_id, p_output_sha256, next_version,
    'signed', 'current', p_approval_id, source_package.id
  );
  update osp_private.customer_registration_cases set state = 'sales_authorization',
    aggregate_version = aggregate_version + 1, updated_at = statement_timestamp()
   where organization_id = p_organization_id and id = receipt.case_id;
  insert into osp_private.approval_events (
    id, organization_id, case_id, case_version, event_type, actor_subject, actor_role,
    command_sha256, evidence_refs
  ) values (
    extensions.gen_random_uuid(), p_organization_id, receipt.case_id,
    current_case.aggregate_version + 1, 'signature_applied', 'osp-worker', 'system',
    p_output_sha256, jsonb_build_array(jsonb_build_object('approvalId', p_approval_id, 'outputSha256', p_output_sha256))
  );
end;
$$;

create function osp_private.fail_signature_application(
  p_organization_id uuid, p_approval_id uuid, p_job_id uuid, p_lease_token uuid,
  p_error_code text
)
returns void language plpgsql security definer
set search_path = pg_catalog, osp_private as $$
begin
  if not exists (
    select 1 from osp_private.background_jobs job
     where job.id = p_job_id and job.organization_id = p_organization_id
       and job.kind = 'apply_signature' and job.completed_at is null
       and job.lease_token = p_lease_token and job.leased_until > clock_timestamp()
       and job.opaque_payload->>'approvalId' = p_approval_id::text
  ) or p_error_code !~ '^[A-Z][A-Z0-9_]{2,63}$' then
    raise exception using errcode = '42501', message = 'OSP_SIGNATURE_LEASE_INVALID';
  end if;
  update osp_private.signature_application_receipts set
    outcome = 'failed', failure_code = p_error_code, completed_at = statement_timestamp()
   where organization_id = p_organization_id and approval_id = p_approval_id and outcome = 'reserved';
  if not found then raise exception using errcode = '23514', message = 'OSP_SIGNATURE_RECEIPT_INVALID'; end if;
end;
$$;

create function osp_private.hold_signature_application(
  p_organization_id uuid, p_approval_id uuid, p_job_id uuid, p_lease_token uuid
)
returns void language plpgsql security definer
set search_path = pg_catalog, osp_private as $$
begin
  if not exists (
    select 1 from osp_private.background_jobs job
     where job.id = p_job_id and job.organization_id = p_organization_id
       and job.kind = 'apply_signature' and job.completed_at is null
       and job.lease_token = p_lease_token and job.leased_until > clock_timestamp()
       and job.opaque_payload->>'approvalId' = p_approval_id::text
  ) then raise exception using errcode = '42501', message = 'OSP_SIGNATURE_LEASE_INVALID'; end if;
  update osp_private.signature_application_receipts set
    outcome = 'manual_reconciliation_required', completed_at = statement_timestamp()
   where organization_id = p_organization_id and approval_id = p_approval_id and outcome = 'reserved';
  if not found then raise exception using errcode = '23514', message = 'OSP_SIGNATURE_RECEIPT_INVALID'; end if;
end;
$$;

alter table osp_private.signature_positions enable row level security;
alter table osp_private.signature_positions force row level security;
alter table osp_private.signature_vault_policies enable row level security;
alter table osp_private.signature_vault_policies force row level security;
alter table osp_private.signature_application_receipts enable row level security;
alter table osp_private.signature_application_receipts force row level security;

create policy signature_positions_workflow_select on osp_private.signature_positions
for select to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy signature_vault_policies_workflow_select on osp_private.signature_vault_policies
for select to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy signature_receipts_workflow_select on osp_private.signature_application_receipts
for select to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

revoke all on osp_private.signature_positions, osp_private.signature_vault_policies, osp_private.signature_application_receipts from public, anon, authenticated, osp_worker;
grant select on osp_private.signature_positions, osp_private.signature_vault_policies, osp_private.signature_application_receipts to osp_workflow_api;
revoke all on function osp_private.prepare_signature_application(uuid, uuid, uuid, uuid) from public, anon, authenticated, osp_workflow_api;
revoke all on function osp_private.complete_signature_application(uuid, uuid, uuid, uuid, text, text, text) from public, anon, authenticated, osp_workflow_api;
revoke all on function osp_private.fail_signature_application(uuid, uuid, uuid, uuid, text) from public, anon, authenticated, osp_workflow_api;
revoke all on function osp_private.hold_signature_application(uuid, uuid, uuid, uuid) from public, anon, authenticated, osp_workflow_api;
revoke all on function osp_private.resolve_signature_application_policy(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated, osp_workflow_api;
revoke all on function osp_private.package_snapshot_hash_is_current(uuid, uuid, text) from public, anon, authenticated;
revoke all on function osp_private.assert_package_snapshot_hash_current(uuid, uuid, text) from public, anon, authenticated;
grant execute on function osp_private.prepare_signature_application(uuid, uuid, uuid, uuid) to osp_worker;
grant execute on function osp_private.complete_signature_application(uuid, uuid, uuid, uuid, text, text, text) to osp_worker;
grant execute on function osp_private.fail_signature_application(uuid, uuid, uuid, uuid, text) to osp_worker;
grant execute on function osp_private.hold_signature_application(uuid, uuid, uuid, uuid) to osp_worker;
grant execute on function osp_private.resolve_signature_application_policy(uuid, uuid, uuid, uuid, integer) to osp_worker;
grant execute on function osp_private.assert_current_package_snapshot(uuid, uuid, bigint) to osp_workflow_api;
grant execute on function osp_private.package_snapshot_hash_is_current(uuid, uuid, text) to osp_workflow_api;
grant execute on function osp_private.assert_package_snapshot_hash_current(uuid, uuid, text) to osp_workflow_api;
