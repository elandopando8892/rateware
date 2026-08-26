alter table osp_private.production_controls
  add column release_id text,
  add column release_mode text not null default 'disabled',
  add column cohort_policy_sha256 text,
  add column actor_subject text,
  add column reason_code text;

alter table osp_private.production_controls
  add constraint osp_production_release_id
    check (release_id is null or release_id ~ '^osp-mvp-[0-9]{8}-[0-9]{2}$'),
  add constraint osp_production_release_mode
    check (release_mode in ('disabled', 'shadow', 'internal_send', 'bounded_cohort')),
  add constraint osp_production_outbound_mode
    check (outbound_enabled = (release_mode in ('internal_send', 'bounded_cohort'))),
  add constraint osp_production_cohort_policy
    check (
      (release_mode = 'bounded_cohort' and cohort_policy_sha256 ~ '^[0-9a-f]{64}$')
      or (release_mode <> 'bounded_cohort' and cohort_policy_sha256 is null)
    ),
  add constraint osp_production_actor
    check (actor_subject is null or (actor_subject ~ '^[A-Za-z0-9:_-]+$' and length(actor_subject) between 4 and 128)),
  add constraint osp_production_reason
    check (reason_code is null or reason_code ~ '^P[0-9]{1,2}_[A-Z0-9_]{3,96}$');

create table osp_private.production_release_transitions (
  id uuid primary key default extensions.gen_random_uuid(),
  release_id text not null check (release_id ~ '^osp-mvp-[0-9]{8}-[0-9]{2}$'),
  from_mode text not null check (from_mode in ('disabled', 'shadow', 'internal_send', 'bounded_cohort')),
  to_mode text not null check (to_mode in ('disabled', 'shadow', 'internal_send', 'bounded_cohort')),
  from_version integer not null check (from_version between 1 and 2147483646),
  to_version integer not null check (to_version = from_version + 1),
  approval_id text not null unique check (approval_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{3,127}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  approver_role text not null check (approver_role in (
    'release_owner', 'security_reviewer', 'signature_owner', 'sales_authorizer'
  )),
  approver_subject text not null check (approver_subject ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{3,127}$'),
  key_id text not null check (key_id ~ '^[A-Za-z0-9][A-Za-z0-9:_-]{3,127}$'),
  cohort_policy_sha256 text,
  operation_id text not null check (operation_id ~ '^P[0-9]{1,2}_[A-Z0-9_]{3,96}$'),
  cohort_size integer,
  maximum_cohort_size integer,
  occurred_at timestamptz not null default statement_timestamp(),
  check (
    (to_mode = 'bounded_cohort' and cohort_size between 1 and maximum_cohort_size and maximum_cohort_size between 1 and 50)
    or (to_mode <> 'bounded_cohort' and cohort_size is null and maximum_cohort_size is null)
  )
);

create table osp_private.production_release_cohort_cases (
  release_id text not null check (release_id ~ '^osp-mvp-[0-9]{8}-[0-9]{2}$'),
  organization_id uuid not null,
  case_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (release_id, organization_id, case_id),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases (organization_id, id)
    on delete restrict
);

create function osp_private.reject_activated_cohort_mutation()
returns trigger language plpgsql security definer
set search_path = pg_catalog, osp_private as $$
declare candidate_release text := case when tg_op = 'DELETE' then old.release_id else new.release_id end;
begin
  if tg_op = 'UPDATE' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(old.release_id, new.release_id), 728451));
    if old.release_id <> new.release_id then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(greatest(old.release_id, new.release_id), 728451)); end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(candidate_release, 728451));
  end if;
  if exists (select 1 from osp_private.production_release_transitions transition where transition.release_id in (candidate_release, case when tg_op = 'UPDATE' then old.release_id else candidate_release end) and transition.to_mode = 'bounded_cohort') then
    raise exception using errcode = '55000', message = 'RELEASE_COHORT_FROZEN';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger osp_release_cohort_freeze
before insert or update or delete on osp_private.production_release_cohort_cases
for each row execute function osp_private.reject_activated_cohort_mutation();

create trigger osp_production_release_transitions_append_only
before update or delete on osp_private.production_release_transitions
for each row execute function osp_private.reject_approval_mutation();

create function osp_private.set_release_mode(
  p_release_id text,
  p_mode text,
  p_expected_version integer,
  p_approval_id text,
  p_manifest_sha256 text,
  p_approver_role text,
  p_approver_subject text,
  p_key_id text,
  p_cohort_policy_sha256 text,
  p_operation_id text,
  p_cohort_size integer default null,
  p_maximum_cohort_size integer default null,
  p_cohort_members jsonb default null
)
returns table (
  receipt_id text,
  release_id text,
  release_mode text,
  control_version integer
)
language plpgsql
security definer
set search_path = pg_catalog, osp_private, extensions
as $$
declare
  current_control osp_private.production_controls%rowtype;
  transition_id uuid;
  computed_cohort_sha256 text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_release_id, 728451));
  if pg_catalog.jsonb_typeof(p_cohort_members) = 'string' then
    p_cohort_members := (p_cohort_members #>> '{}')::jsonb;
  end if;
  if p_release_id !~ '^osp-mvp-[0-9]{8}-[0-9]{2}$'
     or p_mode not in ('disabled', 'shadow', 'internal_send', 'bounded_cohort')
     or p_expected_version not between 1 and 2147483646
     or p_approval_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{3,127}$'
     or p_manifest_sha256 !~ '^[0-9a-f]{64}$'
     or p_approver_role not in ('release_owner', 'security_reviewer', 'signature_owner', 'sales_authorizer')
     or p_approver_subject !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{3,127}$'
     or p_key_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{3,127}$'
     or (p_mode = 'bounded_cohort' and p_cohort_policy_sha256 !~ '^[0-9a-f]{64}$')
     or (p_mode <> 'bounded_cohort' and p_cohort_policy_sha256 is not null)
     or p_operation_id !~ '^P[0-9]{1,2}_[A-Z0-9_]{3,96}$'
     or (p_mode = 'shadow' and p_operation_id <> 'P8_ENABLE_SHADOW_INTAKE')
     or (p_mode = 'internal_send' and p_operation_id <> 'P11_INTERNAL_TEST_SEND')
     or (p_mode = 'bounded_cohort' and p_operation_id <> 'P12_BOUNDED_COHORT')
     or (p_mode = 'disabled' and p_operation_id <> 'P13_ROLLBACK_DRILL')
     or (p_mode in ('shadow', 'disabled') and p_approver_role <> 'release_owner')
     or (p_mode in ('internal_send', 'bounded_cohort') and p_approver_role <> 'sales_authorizer')
     or (p_mode = 'bounded_cohort' and (
       p_cohort_size is null or p_maximum_cohort_size is null
       or p_cohort_size not between 1 and p_maximum_cohort_size
       or p_maximum_cohort_size not between 1 and 50
     ))
     or (p_mode = 'bounded_cohort' and (p_cohort_members is null or pg_catalog.jsonb_typeof(p_cohort_members) <> 'array' or pg_catalog.jsonb_array_length(p_cohort_members) <> p_cohort_size))
     or (p_mode <> 'bounded_cohort' and (p_cohort_size is not null or p_maximum_cohort_size is not null or p_cohort_members is not null)) then
    raise exception using errcode = '23514', message = 'RELEASE_CONTROL_INVALID';
  end if;
  if p_mode = 'bounded_cohort' then
    delete from osp_private.production_release_cohort_cases existing where existing.release_id = p_release_id;
    insert into osp_private.production_release_cohort_cases (release_id, organization_id, case_id)
    select p_release_id, raw."organizationId"::uuid, raw."caseId"::uuid
    from pg_catalog.jsonb_to_recordset(p_cohort_members) as raw("organizationId" text, "caseId" text);
    select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      pg_catalog.string_agg(member.organization_id::text || ':' || member.case_id::text, E'\n' order by member.organization_id::text, member.case_id::text), 'UTF8'
    ), 'sha256'), 'hex') into computed_cohort_sha256
    from osp_private.production_release_cohort_cases member where member.release_id = p_release_id;
    if (select count(*) from osp_private.production_release_cohort_cases member where member.release_id = p_release_id) <> p_cohort_size
       or computed_cohort_sha256 is distinct from p_cohort_policy_sha256 then
      raise exception using errcode = '23514', message = 'RELEASE_COHORT_MISMATCH';
    end if;
  end if;

  select * into current_control
  from osp_private.production_controls
  where id = 'singleton'
  for update;
  if not found then
    raise exception using errcode = '55000', message = 'RELEASE_CONTROL_UNAVAILABLE';
  end if;
  if current_control.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'RELEASE_CONTROL_STALE';
  end if;
  if exists (
    select 1 from osp_private.production_release_transitions used
    where used.approval_id = p_approval_id
  ) then
    raise exception using errcode = '23505', message = 'RELEASE_APPROVAL_REPLAY';
  end if;
  if not (
    (p_mode = 'disabled' and current_control.release_mode <> 'disabled')
    or (current_control.release_mode = 'disabled' and p_mode = 'shadow')
    or (current_control.release_mode = 'shadow' and p_mode = 'internal_send')
    or (current_control.release_mode = 'internal_send' and p_mode = 'bounded_cohort')
  ) then
    raise exception using errcode = '23514', message = 'RELEASE_MODE_TRANSITION_DENIED';
  end if;
  if not (current_control.release_mode = 'disabled' and p_mode = 'shadow')
     and current_control.release_id is distinct from p_release_id then
    raise exception using errcode = '23514', message = 'RELEASE_ID_MISMATCH';
  end if;

  update osp_private.production_controls
  set release_id = p_release_id,
      release_mode = p_mode,
      outbound_enabled = p_mode in ('internal_send', 'bounded_cohort'),
      cohort_policy_sha256 = case when p_mode = 'bounded_cohort' then p_cohort_policy_sha256 else null end,
      actor_subject = p_approver_subject,
      reason_code = p_operation_id,
      version = version + 1,
      updated_at = statement_timestamp()
  where id = 'singleton';

  insert into osp_private.production_release_transitions (
    release_id, from_mode, to_mode, from_version, to_version,
    approval_id, manifest_sha256, approver_role, approver_subject, key_id, cohort_policy_sha256, operation_id,
    cohort_size, maximum_cohort_size
  ) values (
    p_release_id, current_control.release_mode, p_mode,
    current_control.version, current_control.version + 1,
    p_approval_id, p_manifest_sha256, p_approver_role, p_approver_subject, p_key_id, p_cohort_policy_sha256, p_operation_id,
    p_cohort_size, p_maximum_cohort_size
  ) returning id into transition_id;

  receipt_id := transition_id::text;
  release_id := p_release_id;
  release_mode := p_mode;
  control_version := current_control.version + 1;
  return next;
end;
$$;

alter table osp_private.production_release_transitions enable row level security;
alter table osp_private.production_release_transitions force row level security;
alter table osp_private.production_release_cohort_cases enable row level security;
alter table osp_private.production_release_cohort_cases force row level security;

create function osp_private.assert_release_cohort_membership(
  p_organization_id uuid,
  p_case_id uuid
) returns void language plpgsql security definer
set search_path = pg_catalog, osp_private as $$
declare control osp_private.production_controls%rowtype;
begin
  select * into control from osp_private.production_controls where id = 'singleton';
  if control.release_mode = 'bounded_cohort' and not exists (
    select 1 from osp_private.production_release_cohort_cases member
    where member.release_id = control.release_id
      and member.organization_id = p_organization_id and member.case_id = p_case_id
  ) then raise exception using errcode = '42501', message = 'OSP_RELEASE_COHORT_DENIED'; end if;
end;
$$;

create function osp_private.enforce_release_cohort_case()
returns trigger language plpgsql security definer
set search_path = pg_catalog, osp_private as $$
begin
  perform osp_private.assert_release_cohort_membership(new.organization_id, new.case_id);
  return new;
end;
$$;

create trigger osp_outbound_attempt_release_cohort
before insert or update of outcome on osp_private.outbound_send_attempts
for each row execute function osp_private.enforce_release_cohort_case();

revoke all on osp_private.production_release_transitions from public, anon, authenticated, osp_workflow_api, osp_worker;
revoke all on osp_private.production_release_cohort_cases from public, anon, authenticated, osp_workflow_api, osp_worker;
revoke all on function osp_private.assert_release_cohort_membership(uuid, uuid) from public, anon, authenticated, osp_workflow_api, osp_worker, service_role;
revoke all on function osp_private.enforce_release_cohort_case() from public, anon, authenticated, osp_workflow_api, osp_worker, service_role;
revoke all on function osp_private.reject_activated_cohort_mutation() from public, anon, authenticated, osp_workflow_api, osp_worker, service_role;
revoke update on osp_private.production_controls from public, anon, authenticated, osp_workflow_api, osp_worker;
revoke all on function osp_private.set_release_mode(text, text, integer, text, text, text, text, text, text, text, integer, integer, jsonb)
  from public, anon, authenticated, osp_workflow_api, osp_worker;
grant select on osp_private.production_controls to service_role;
grant usage on schema osp_private to service_role;
grant execute on function osp_private.set_release_mode(text, text, integer, text, text, text, text, text, text, text, integer, integer, jsonb)
  to service_role;
