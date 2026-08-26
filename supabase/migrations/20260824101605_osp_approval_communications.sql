alter table osp_private.case_package_input_snapshots
  add constraint osp_package_snapshots_case_identity_unique
  unique (organization_id, case_id, id);

alter table osp_private.background_jobs
  drop constraint if exists background_jobs_kind_check;
alter table osp_private.background_jobs
  add constraint background_jobs_kind_check check (kind in (
    'gmail_ingest', 'duplicate_review_refresh', 'document_extract',
    'quarterly_document_check', 'form_ai_mapping', 'apply_signature'
  ));

create table osp_private.generated_packages (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  input_snapshot_id uuid not null,
  input_snapshot_sha256 text not null check (input_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  object_id text not null check (object_id ~ '^[A-Za-z0-9:_-]+$' and length(object_id) between 1 and 256),
  output_sha256 text not null check (output_sha256 ~ '^[0-9a-f]{64}$'),
  version integer not null check (version between 1 and 2147483647),
  package_kind text not null check (package_kind in ('supplier_completed', 'signed')),
  status text not null check (status in ('current', 'superseded', 'manual_reconciliation_required')),
  signature_approval_id uuid,
  supersedes_package_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, case_id, id),
  unique (organization_id, case_id, version),
  unique (organization_id, object_id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, case_id, input_snapshot_id)
    references osp_private.case_package_input_snapshots(organization_id, case_id, id),
  foreign key (organization_id, case_id, supersedes_package_id)
    references osp_private.generated_packages(organization_id, case_id, id),
  constraint generated_package_signature_kind_check check (
    (package_kind = 'supplier_completed' and signature_approval_id is null) or
    (package_kind = 'signed' and signature_approval_id is not null)
  )
);

create table osp_private.signature_approvals (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  generated_package_id uuid not null,
  input_snapshot_sha256 text not null check (input_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  signature_vault_ref text not null check (signature_vault_ref ~ '^[A-Za-z0-9:_-]+$' and length(signature_vault_ref) between 1 and 256),
  signature_position_version integer not null check (signature_position_version between 1 and 2147483647),
  status text not null default 'pending' check (status in ('pending', 'applied', 'superseded', 'manual_reconciliation_required')),
  actor_subject text not null check (actor_subject ~ '^[A-Za-z0-9:_@.-]+$' and length(actor_subject) between 1 and 256),
  actor_email text not null check (actor_email = 'jgonzalez@xbfreight.com'),
  authorization_session_id text not null check (authorization_session_id ~ '^[A-Za-z0-9:_-]+$' and length(authorization_session_id) between 1 and 256),
  authorization_session_issued_at timestamptz not null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9:_-]+$' and length(idempotency_key) between 1 and 256),
  command_sha256 text not null check (command_sha256 ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, case_id, id),
  unique (organization_id, idempotency_key),
  unique (organization_id, generated_package_id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, case_id, generated_package_id)
    references osp_private.generated_packages(organization_id, case_id, id)
);

alter table osp_private.generated_packages
  add constraint generated_packages_signature_approval_fk
  foreign key (organization_id, case_id, signature_approval_id)
  references osp_private.signature_approvals(organization_id, case_id, id);

create function osp_private.sha256_array_is_canonical(values_to_check text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(bool_and(value ~ '^[0-9a-f]{64}$'), true)
  from unnest(values_to_check) value;
$$;

create table osp_private.outbound_payloads (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  version integer not null check (version between 1 and 2147483647),
  payload_kind text not null check (payload_kind in ('clarification', 'final_response')),
  object_id text not null check (object_id ~ '^[A-Za-z0-9:_-]+$' and length(object_id) between 1 and 256),
  canonical_sha256 text not null check (canonical_sha256 ~ '^[0-9a-f]{64}$'),
  attachment_sha256s text[] not null default array[]::text[],
  status text not null default 'frozen' check (status in ('frozen', 'superseded')),
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, case_id, id),
  unique (organization_id, case_id, version, payload_kind),
  unique (organization_id, object_id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  constraint outbound_attachment_hashes_check check (
    osp_private.sha256_array_is_canonical(attachment_sha256s)
  )
);

create table osp_private.sales_authorizations (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  payload_id uuid not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'authorized' check (status in ('authorized', 'rejected', 'superseded')),
  actor_subject text not null check (actor_subject ~ '^[A-Za-z0-9:_@.-]+$' and length(actor_subject) between 1 and 256),
  actor_email text not null check (actor_email = 'sales@heymarksman.com'),
  authorization_session_id text not null check (authorization_session_id ~ '^[A-Za-z0-9:_-]+$' and length(authorization_session_id) between 1 and 256),
  authorization_session_issued_at timestamptz not null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9:_-]+$' and length(idempotency_key) between 1 and 256),
  command_sha256 text not null check (command_sha256 ~ '^[0-9a-f]{64}$'),
  authorized_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, case_id, id),
  unique (organization_id, idempotency_key),
  unique (organization_id, payload_id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, case_id, payload_id)
    references osp_private.outbound_payloads(organization_id, case_id, id)
);

create table osp_private.outbound_send_attempts (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  sales_authorization_id uuid not null,
  payload_id uuid not null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9:_-]+$' and length(idempotency_key) between 1 and 256),
  outcome text not null check (outcome in ('reserved', 'sending', 'sent', 'failed', 'manual_reconciliation_required')),
  deterministic_message_id text not null check (deterministic_message_id ~ '^[A-Za-z0-9._@-]+$' and length(deterministic_message_id) between 1 and 256),
  gmail_message_id text,
  failure_code text,
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, case_id, sales_authorization_id)
    references osp_private.sales_authorizations(organization_id, case_id, id),
  foreign key (organization_id, case_id, payload_id)
    references osp_private.outbound_payloads(organization_id, case_id, id),
  constraint outbound_attempt_result_check check (
    (outcome = 'sent' and gmail_message_id is not null and failure_code is null) or
    (outcome = 'failed' and gmail_message_id is null and failure_code ~ '^[A-Z0-9_]{1,64}$') or
    (outcome in ('reserved', 'sending', 'manual_reconciliation_required') and gmail_message_id is null and failure_code is null)
  )
);

create unique index outbound_one_success_per_authorization
  on osp_private.outbound_send_attempts (organization_id, sales_authorization_id)
  where outcome = 'sent';

create table osp_private.approval_events (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  case_version bigint not null check (case_version > 0),
  event_type text not null check (event_type in (
    'complete_operations_review', 'approve_signature', 'signature_applied',
    'authorize_outbound', 'request_authorized_send', 'approval_invalidated'
  )),
  actor_subject text not null check (actor_subject ~ '^[A-Za-z0-9:_@.-]+$' and length(actor_subject) between 1 and 256),
  actor_role text not null check (actor_role in (
    'operations_reviewer', 'signature_approver', 'sales_authorizer',
    'carriers_sender', 'system'
  )),
  authorization_session_id text,
  command_sha256 text not null check (command_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_refs) = 'array'),
  occurred_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, case_id, case_version),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id)
);

create table osp_private.production_controls (
  id text primary key default 'singleton' check (id = 'singleton'),
  outbound_enabled boolean not null default false,
  version integer not null default 1 check (version between 1 and 2147483647),
  updated_at timestamptz not null default statement_timestamp()
);

insert into osp_private.production_controls (id, outbound_enabled)
values ('singleton', false);

create function osp_private.reject_approval_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'OSP_APPEND_ONLY';
end;
$$;

create function osp_private.assert_approval_reference_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'signature_approvals' then
    if not exists (
      select 1
      from osp_private.generated_packages package
      where package.organization_id = new.organization_id
        and package.case_id = new.case_id
        and package.id = new.generated_package_id
        and package.package_kind = 'supplier_completed'
        and package.status = 'current'
        and package.input_snapshot_sha256 = new.input_snapshot_sha256
    ) then
      raise exception using errcode = '23514', message = 'OSP_PACKAGE_MISMATCH';
    end if;
  elsif tg_table_name = 'sales_authorizations' then
    if not exists (
      select 1
      from osp_private.outbound_payloads payload
      where payload.organization_id = new.organization_id
        and payload.case_id = new.case_id
        and payload.id = new.payload_id
        and payload.status = 'frozen'
        and payload.canonical_sha256 = new.payload_sha256
    ) then
      raise exception using errcode = '23514', message = 'OSP_PAYLOAD_MISMATCH';
    end if;
  elsif tg_table_name = 'outbound_send_attempts' then
    if not exists (
      select 1
      from osp_private.sales_authorizations approved
      join osp_private.outbound_payloads payload
        on payload.organization_id = approved.organization_id
       and payload.case_id = approved.case_id
       and payload.id = approved.payload_id
      where approved.organization_id = new.organization_id
        and approved.case_id = new.case_id
        and approved.id = new.sales_authorization_id
        and approved.status = 'authorized'
        and approved.payload_id = new.payload_id
        and payload.status = 'frozen'
        and payload.canonical_sha256 = approved.payload_sha256
    ) then
      raise exception using errcode = '23514', message = 'OSP_SEND_AUTHORIZATION_MISMATCH';
    end if;
  end if;
  return null;
end;
$$;

create function osp_private.assert_approval_actor(
  p_organization_id uuid,
  p_action text,
  p_actor_subject text,
  p_actor_email text,
  p_permissions text[],
  p_actor_role text,
  p_session_id text,
  p_session_issued_at timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tenant_id uuid := nullif(current_setting('osp.organization_id', true), '')::uuid;
  consequential_count integer;
begin
  if tenant_id is null or tenant_id <> p_organization_id or
     p_actor_subject !~ '^[A-Za-z0-9:_@.-]+$' or length(p_actor_subject) not between 1 and 256 or
     p_actor_email <> lower(p_actor_email) or
     p_session_id !~ '^[A-Za-z0-9:_-]+$' or length(p_session_id) not between 1 and 256 or
     p_session_issued_at > statement_timestamp() + interval '30 seconds' or
     p_session_issued_at < statement_timestamp() - interval '5 minutes' or
     p_permissions is null or cardinality(p_permissions) = 0 or
     cardinality(p_permissions) <> (select count(distinct permission) from unnest(p_permissions) permission)
  then
    raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
  end if;

  select count(*) into consequential_count
  from unnest(p_permissions) permission
  where permission = any(array['osp:signature-approve', 'osp:sales-authorize', 'osp:send-authorized']);

  if p_action = 'complete_operations_review' then
    if p_actor_role <> 'operations_reviewer' or
       not ('osp:operate' = any(p_permissions)) or consequential_count <> 0 then
      raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
    end if;
  elsif p_action = 'approve_signature' then
    if p_actor_role <> 'signature_approver' or
       p_actor_email <> 'jgonzalez@xbfreight.com' or
       not ('osp:signature-approve' = any(p_permissions)) or consequential_count <> 1 then
      raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
    end if;
  elsif p_action = 'authorize_outbound' then
    if p_actor_role <> 'sales_authorizer' or
       p_actor_email <> 'sales@heymarksman.com' or
       not ('osp:sales-authorize' = any(p_permissions)) or consequential_count <> 1 then
      raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
    end if;
  elsif p_action = 'request_authorized_send' then
    if p_actor_role <> 'carriers_sender' or
       p_actor_email <> 'carriers@xbfreight.com' or
       not ('osp:send-authorized' = any(p_permissions)) or consequential_count <> 1 then
      raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
    end if;
  else
    raise exception using errcode = '42501', message = 'OSP_APPROVAL_FORBIDDEN';
  end if;
end;
$$;

create function osp_private.package_snapshot_hash_is_current(
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

create function osp_private.assert_package_snapshot_hash_current(
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

create function osp_private.complete_operations_review_command(
  p_organization_id uuid,
  p_case_id uuid,
  p_input_snapshot_sha256 text,
  p_expected_case_version bigint,
  p_actor_subject text,
  p_actor_email text,
  p_permissions text[],
  p_actor_role text,
  p_session_id text,
  p_session_issued_at timestamptz,
  p_command_sha256 text
)
returns table (case_id uuid, state text, case_version bigint, approval_id uuid, authorization_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_case osp_private.customer_registration_cases%rowtype;
begin
  perform osp_private.assert_approval_actor(
    p_organization_id, 'complete_operations_review', p_actor_subject, p_actor_email,
    p_permissions, p_actor_role, p_session_id, p_session_issued_at
  );
  if p_input_snapshot_sha256 !~ '^[0-9a-f]{64}$' or p_command_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'OSP_APPROVAL_INVALID';
  end if;
  select * into current_case
  from osp_private.customer_registration_cases candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_case_id
  for update;
  if not found or current_case.aggregate_version <> p_expected_case_version then
    raise exception using errcode = '40001', message = 'OSP_VERSION_CONFLICT';
  end if;
  if current_case.state <> 'operations_review' then
    raise exception using errcode = '23514', message = 'OSP_TRANSITION_INVALID';
  end if;
  if not exists (
    select 1 from osp_private.case_package_input_snapshots snapshot
    where snapshot.organization_id = p_organization_id
      and snapshot.case_id = p_case_id
      and snapshot.case_version = p_expected_case_version
      and snapshot.canonical_sha256 = p_input_snapshot_sha256
      and not exists (
        select 1 from osp_private.case_package_input_snapshots later
        where later.organization_id = snapshot.organization_id
          and later.case_id = snapshot.case_id
          and (later.created_at, later.id) > (snapshot.created_at, snapshot.id)
      )
  ) then
    raise exception using errcode = '23514', message = 'OSP_SNAPSHOT_MISMATCH';
  end if;
  perform osp_private.assert_package_snapshot_hash_current(
    p_organization_id, p_case_id, p_input_snapshot_sha256
  );
  update osp_private.customer_registration_cases
  set state = 'signature_approval', aggregate_version = aggregate_version + 1,
      updated_at = statement_timestamp()
  where organization_id = p_organization_id and id = p_case_id
    and aggregate_version = p_expected_case_version;
  insert into osp_private.approval_events (
    id, organization_id, case_id, case_version, event_type, actor_subject,
    actor_role, authorization_session_id, command_sha256, evidence_refs
  ) values (
    extensions.gen_random_uuid(), p_organization_id, p_case_id,
    p_expected_case_version + 1, 'complete_operations_review', p_actor_subject,
    p_actor_role, p_session_id, p_command_sha256,
    jsonb_build_array(jsonb_build_object('inputSnapshotSha256', p_input_snapshot_sha256))
  );
  return query select p_case_id, 'signature_approval'::text,
    p_expected_case_version + 1, null::uuid, null::uuid;
end;
$$;

create function osp_private.approve_signature_command(
  p_organization_id uuid,
  p_case_id uuid,
  p_input_snapshot_sha256 text,
  p_signature_vault_ref text,
  p_signature_position_version integer,
  p_expected_case_version bigint,
  p_idempotency_key text,
  p_actor_subject text,
  p_actor_email text,
  p_permissions text[],
  p_actor_role text,
  p_session_id text,
  p_session_issued_at timestamptz,
  p_command_sha256 text
)
returns table (case_id uuid, state text, case_version bigint, approval_id uuid, authorization_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, osp_private, extensions
as $$
declare
  current_case osp_private.customer_registration_cases%rowtype;
  package_id uuid;
  created_approval_id uuid := extensions.gen_random_uuid();
begin
  perform osp_private.assert_approval_actor(
    p_organization_id, 'approve_signature', p_actor_subject, p_actor_email,
    p_permissions, p_actor_role, p_session_id, p_session_issued_at
  );
  if p_input_snapshot_sha256 !~ '^[0-9a-f]{64}$' or
     p_signature_vault_ref !~ '^[A-Za-z0-9:_-]+$' or length(p_signature_vault_ref) not between 1 and 256 or
     p_signature_position_version not between 1 and 2147483647 or
     p_idempotency_key !~ '^[A-Za-z0-9:_-]+$' or length(p_idempotency_key) not between 1 and 256 or
     p_command_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'OSP_APPROVAL_INVALID';
  end if;
  select * into current_case
  from osp_private.customer_registration_cases candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_case_id
  for update;
  if not found or current_case.aggregate_version <> p_expected_case_version then
    raise exception using errcode = '40001', message = 'OSP_VERSION_CONFLICT';
  end if;
  if current_case.state <> 'signature_approval' then
    raise exception using errcode = '23514', message = 'OSP_TRANSITION_INVALID';
  end if;
  perform osp_private.assert_package_snapshot_hash_current(
    p_organization_id, p_case_id, p_input_snapshot_sha256
  );
  if not exists (
    select 1 from osp_private.approval_events operations_event
    where operations_event.organization_id = p_organization_id
      and operations_event.case_id = p_case_id
      and operations_event.case_version = current_case.aggregate_version
      and operations_event.event_type = 'complete_operations_review'
      and operations_event.evidence_refs @> jsonb_build_array(
        jsonb_build_object('inputSnapshotSha256', p_input_snapshot_sha256)
      )
  ) then
    raise exception using errcode = '23514', message = 'OSP_SNAPSHOT_MISMATCH';
  end if;
  select package.id into package_id
  from osp_private.generated_packages package
  where package.organization_id = p_organization_id
    and package.case_id = p_case_id
    and package.input_snapshot_sha256 = p_input_snapshot_sha256
    and package.package_kind = 'supplier_completed'
    and package.status = 'current'
  order by package.version desc
  limit 1
  for update;
  if package_id is null then
    raise exception using errcode = '23514', message = 'OSP_PACKAGE_MISMATCH';
  end if;
  if exists (
    select 1 from osp_private.signature_approvals approval
    where approval.organization_id = p_organization_id
      and approval.case_id = p_case_id
      and approval.generated_package_id = package_id
  ) then
    raise exception using errcode = '23514', message = 'OSP_TRANSITION_INVALID';
  end if;
  insert into osp_private.signature_approvals (
    id, organization_id, case_id, generated_package_id, input_snapshot_sha256,
    signature_vault_ref, signature_position_version, actor_subject, actor_email,
    authorization_session_id, authorization_session_issued_at,
    idempotency_key, command_sha256
  ) values (
    created_approval_id, p_organization_id, p_case_id, package_id,
    p_input_snapshot_sha256, p_signature_vault_ref, p_signature_position_version,
    p_actor_subject, p_actor_email, p_session_id, p_session_issued_at,
    p_idempotency_key, p_command_sha256
  );
  insert into osp_private.background_jobs (
    id, organization_id, kind, opaque_payload, idempotency_key
  ) values (
    extensions.gen_random_uuid(), p_organization_id, 'apply_signature',
    jsonb_build_object('approvalId', created_approval_id::text, 'caseId', p_case_id::text),
    'signature:' || created_approval_id::text
  );
  update osp_private.customer_registration_cases
  set aggregate_version = aggregate_version + 1,
      updated_at = statement_timestamp()
  where organization_id = p_organization_id and id = p_case_id
    and aggregate_version = p_expected_case_version;
  insert into osp_private.approval_events (
    id, organization_id, case_id, case_version, event_type, actor_subject,
    actor_role, authorization_session_id, command_sha256, evidence_refs
  ) values (
    extensions.gen_random_uuid(), p_organization_id, p_case_id,
    p_expected_case_version + 1, 'approve_signature', p_actor_subject,
    p_actor_role, p_session_id, p_command_sha256,
    jsonb_build_array(jsonb_build_object(
      'approvalId', created_approval_id,
      'inputSnapshotSha256', p_input_snapshot_sha256
    ))
  );
  return query select p_case_id, 'signature_approval'::text,
    p_expected_case_version + 1, created_approval_id, null::uuid;
end;
$$;

create function osp_private.authorize_outbound_command(
  p_organization_id uuid,
  p_case_id uuid,
  p_payload_id uuid,
  p_payload_sha256 text,
  p_expected_case_version bigint,
  p_idempotency_key text,
  p_actor_subject text,
  p_actor_email text,
  p_permissions text[],
  p_actor_role text,
  p_session_id text,
  p_session_issued_at timestamptz,
  p_command_sha256 text
)
returns table (case_id uuid, state text, case_version bigint, approval_id uuid, authorization_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_case osp_private.customer_registration_cases%rowtype;
  created_authorization_id uuid := extensions.gen_random_uuid();
begin
  perform osp_private.assert_approval_actor(
    p_organization_id, 'authorize_outbound', p_actor_subject, p_actor_email,
    p_permissions, p_actor_role, p_session_id, p_session_issued_at
  );
  if p_payload_sha256 !~ '^[0-9a-f]{64}$' or
     p_idempotency_key !~ '^[A-Za-z0-9:_-]+$' or length(p_idempotency_key) not between 1 and 256 or
     p_command_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'OSP_APPROVAL_INVALID';
  end if;
  select * into current_case
  from osp_private.customer_registration_cases candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_case_id
  for update;
  if not found or current_case.aggregate_version <> p_expected_case_version then
    raise exception using errcode = '40001', message = 'OSP_VERSION_CONFLICT';
  end if;
  if current_case.state <> 'sales_authorization' then
    raise exception using errcode = '23514', message = 'OSP_TRANSITION_INVALID';
  end if;
  if not exists (
    select 1 from osp_private.outbound_payloads payload
    where payload.organization_id = p_organization_id
      and payload.case_id = p_case_id and payload.id = p_payload_id
      and payload.canonical_sha256 = p_payload_sha256 and payload.status = 'frozen'
    for update
  ) then
    raise exception using errcode = '23514', message = 'OSP_PAYLOAD_MISMATCH';
  end if;
  insert into osp_private.sales_authorizations (
    id, organization_id, case_id, payload_id, payload_sha256,
    actor_subject, actor_email, authorization_session_id,
    authorization_session_issued_at, idempotency_key, command_sha256
  ) values (
    created_authorization_id, p_organization_id, p_case_id, p_payload_id,
    p_payload_sha256, p_actor_subject, p_actor_email, p_session_id,
    p_session_issued_at, p_idempotency_key, p_command_sha256
  );
  update osp_private.customer_registration_cases
  set state = 'ready_to_send', aggregate_version = aggregate_version + 1,
      updated_at = statement_timestamp()
  where organization_id = p_organization_id and id = p_case_id
    and aggregate_version = p_expected_case_version;
  insert into osp_private.approval_events (
    id, organization_id, case_id, case_version, event_type, actor_subject,
    actor_role, authorization_session_id, command_sha256, evidence_refs
  ) values (
    extensions.gen_random_uuid(), p_organization_id, p_case_id,
    p_expected_case_version + 1, 'authorize_outbound', p_actor_subject,
    p_actor_role, p_session_id, p_command_sha256,
    jsonb_build_array(jsonb_build_object('authorizationId', created_authorization_id))
  );
  return query select p_case_id, 'ready_to_send'::text,
    p_expected_case_version + 1, null::uuid, created_authorization_id;
end;
$$;

create trigger generated_packages_append_only
before update or delete on osp_private.generated_packages
for each row execute function osp_private.reject_approval_mutation();
create trigger signature_approvals_append_only
before update or delete on osp_private.signature_approvals
for each row execute function osp_private.reject_approval_mutation();
create trigger outbound_payloads_append_only
before update or delete on osp_private.outbound_payloads
for each row execute function osp_private.reject_approval_mutation();
create trigger sales_authorizations_append_only
before update or delete on osp_private.sales_authorizations
for each row execute function osp_private.reject_approval_mutation();
create trigger outbound_send_attempts_append_only
before update or delete on osp_private.outbound_send_attempts
for each row execute function osp_private.reject_approval_mutation();
create trigger approval_events_append_only
before update or delete on osp_private.approval_events
for each row execute function osp_private.reject_approval_mutation();

create constraint trigger signature_approval_hash_guard
after insert on osp_private.signature_approvals
deferrable initially immediate
for each row execute function osp_private.assert_approval_reference_integrity();
create constraint trigger outbound_authorization_hash_guard
after insert on osp_private.sales_authorizations
deferrable initially immediate
for each row execute function osp_private.assert_approval_reference_integrity();
create constraint trigger outbound_send_authorization_guard
after insert on osp_private.outbound_send_attempts
deferrable initially immediate
for each row execute function osp_private.assert_approval_reference_integrity();

alter table osp_private.generated_packages enable row level security;
alter table osp_private.generated_packages force row level security;
alter table osp_private.signature_approvals enable row level security;
alter table osp_private.signature_approvals force row level security;
alter table osp_private.outbound_payloads enable row level security;
alter table osp_private.outbound_payloads force row level security;
alter table osp_private.sales_authorizations enable row level security;
alter table osp_private.sales_authorizations force row level security;
alter table osp_private.outbound_send_attempts enable row level security;
alter table osp_private.outbound_send_attempts force row level security;
alter table osp_private.approval_events enable row level security;
alter table osp_private.approval_events force row level security;

create policy generated_packages_workflow_select
on osp_private.generated_packages for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy generated_packages_workflow_insert
on osp_private.generated_packages for insert to osp_workflow_api
with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy signature_approvals_workflow_select
on osp_private.signature_approvals for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy outbound_payloads_workflow_select
on osp_private.outbound_payloads for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy outbound_payloads_workflow_insert
on osp_private.outbound_payloads for insert to osp_workflow_api
with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy sales_authorizations_workflow_select
on osp_private.sales_authorizations for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy sales_authorizations_workflow_insert
on osp_private.sales_authorizations for insert to osp_workflow_api
with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy outbound_attempts_workflow_select
on osp_private.outbound_send_attempts for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy approval_events_workflow_select
on osp_private.approval_events for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy approval_events_workflow_insert
on osp_private.approval_events for insert to osp_workflow_api
with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);

grant select, insert on osp_private.generated_packages to osp_workflow_api;
grant select on osp_private.signature_approvals to osp_workflow_api;
revoke insert on osp_private.signature_approvals from osp_workflow_api;
grant select, insert on osp_private.outbound_payloads to osp_workflow_api;
grant select, insert on osp_private.sales_authorizations to osp_workflow_api;
grant select on osp_private.outbound_send_attempts to osp_workflow_api;
grant select, insert on osp_private.approval_events to osp_workflow_api;
grant select on osp_private.production_controls to osp_workflow_api, osp_worker;

revoke all on function osp_private.reject_approval_mutation() from public;
revoke all on function osp_private.assert_approval_reference_integrity() from public;
revoke all on function osp_private.sha256_array_is_canonical(text[]) from public;
revoke all on function osp_private.assert_approval_actor(uuid, text, text, text, text[], text, text, timestamptz) from public;
revoke all on function osp_private.package_snapshot_hash_is_current(uuid, uuid, text) from public, anon, authenticated;
revoke all on function osp_private.assert_package_snapshot_hash_current(uuid, uuid, text) from public, anon, authenticated;
revoke all on function osp_private.complete_operations_review_command(uuid, uuid, text, bigint, text, text, text[], text, text, timestamptz, text) from public;
revoke all on function osp_private.approve_signature_command(uuid, uuid, text, text, integer, bigint, text, text, text, text[], text, text, timestamptz, text) from public;
revoke all on function osp_private.authorize_outbound_command(uuid, uuid, uuid, text, bigint, text, text, text, text[], text, text, timestamptz, text) from public;

grant execute on function osp_private.assert_approval_actor(uuid, text, text, text, text[], text, text, timestamptz) to osp_workflow_api;
grant execute on function osp_private.package_snapshot_hash_is_current(uuid, uuid, text) to osp_workflow_api;
grant execute on function osp_private.assert_package_snapshot_hash_current(uuid, uuid, text) to osp_workflow_api;
grant execute on function osp_private.sha256_array_is_canonical(text[]) to osp_workflow_api;
grant execute on function osp_private.complete_operations_review_command(uuid, uuid, text, bigint, text, text, text[], text, text, timestamptz, text) to osp_workflow_api;
grant execute on function osp_private.approve_signature_command(uuid, uuid, text, text, integer, bigint, text, text, text, text[], text, text, timestamptz, text) to osp_workflow_api;
grant execute on function osp_private.authorize_outbound_command(uuid, uuid, uuid, text, bigint, text, text, text, text[], text, text, timestamptz, text) to osp_workflow_api;
