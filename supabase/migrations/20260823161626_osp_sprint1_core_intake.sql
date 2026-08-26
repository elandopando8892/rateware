create schema if not exists osp_private;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'osp_workflow_api') then
    create role osp_workflow_api nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'osp_worker') then
    create role osp_worker nologin;
  end if;
end;
$$;

grant osp_workflow_api to postgres;
grant osp_worker to postgres;

create table osp_private.supplier_counterparties (
  id uuid primary key,
  organization_id uuid not null,
  legal_name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, legal_name)
);

create table osp_private.customer_registration_cases (
  id uuid primary key,
  organization_id uuid not null,
  supplier_id uuid not null,
  state text not null,
  aggregate_version bigint not null default 0 check (aggregate_version >= 0),
  gmail_message_id text,
  blocked_by_duplicate_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, supplier_id) references osp_private.supplier_counterparties(organization_id, id),
  unique (organization_id, gmail_message_id)
);

create table osp_private.case_events (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  sequence bigint not null check (sequence > 0),
  state text not null,
  actor_subject text not null,
  authority_role text not null,
  source_version bigint not null check (source_version >= 0),
  occurred_at timestamptz not null,
  reason_code text not null,
  correlation_id text not null,
  evidence_json jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_json) = 'array'),
  created_at timestamptz not null default now(),
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id),
  unique (organization_id, case_id, sequence)
);

create table osp_private.case_assignments (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  assignee_subject text not null,
  assigned_by_subject text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id)
);

create table osp_private.case_comments (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  body text not null,
  author_subject text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id)
);

create table osp_private.gmail_messages (
  id uuid primary key,
  organization_id uuid not null,
  gmail_message_id text not null,
  gmail_thread_id text not null,
  case_id uuid not null,
  opaque_object_key text not null check (opaque_object_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  sender_domain text not null,
  subject text not null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  safe_body text not null,
  application_reference text,
  requirement_tokens text[] not null default '{}',
  duplicate_evidence_json jsonb not null default '[]'::jsonb check (jsonb_typeof(duplicate_evidence_json) = 'array'),
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, gmail_message_id),
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id)
);

create table osp_private.gmail_attachments (
  id uuid primary key,
  organization_id uuid not null,
  gmail_message_id uuid not null,
  opaque_object_key text not null check (opaque_object_key ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  content_type text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, gmail_message_id) references osp_private.gmail_messages(organization_id, id)
);

create table osp_private.duplicate_candidates (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  candidate_case_id uuid not null,
  score numeric not null check (score >= 0 and score <= 1),
  resolution text,
  reason_code text,
  evidence_json jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_json) = 'array'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id),
  foreign key (organization_id, candidate_case_id) references osp_private.customer_registration_cases(organization_id, id),
  unique (organization_id, case_id, candidate_case_id)
);

create table osp_private.clarification_drafts (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  body text not null,
  attachment_ids uuid[] not null default '{}',
  created_by_subject text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, case_id) references osp_private.customer_registration_cases(organization_id, id)
);

create table osp_private.command_receipts (
  id uuid primary key,
  organization_id uuid not null,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id, operation, idempotency_key)
);

create table osp_private.background_jobs (
  id uuid primary key,
  organization_id uuid not null,
  kind text not null check (kind in ('gmail_ingest', 'duplicate_review_refresh')),
  opaque_payload jsonb not null,
  idempotency_key text not null,
  attempt integer not null default 0 check (attempt >= 0),
  lease_token uuid,
  leased_until timestamptz,
  completed_at timestamptz,
  retry_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  unique (organization_id, kind, idempotency_key)
);

create function osp_private.claim_next_background_jobs(
  p_lease_ms integer,
  p_limit integer
)
returns table (
  id uuid,
  organization_id uuid,
  kind text,
  opaque_payload jsonb,
  attempt integer,
  lease_token uuid,
  leased_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $function$
declare
  now_at timestamptz := clock_timestamp();
  lease_deadline timestamptz;
begin
  if p_lease_ms is null or p_lease_ms < 1 or p_lease_ms > 900000 or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = 'P0001', message = 'LEASE_CONFLICT';
  end if;
  lease_deadline := now_at + (p_lease_ms * interval '1 millisecond');
  return query
    with candidates as (
      select background_jobs.id
        from osp_private.background_jobs
       where background_jobs.completed_at is null
         and (background_jobs.retry_at is null or background_jobs.retry_at <= now_at)
         and (background_jobs.leased_until is null or background_jobs.leased_until <= now_at)
       order by background_jobs.created_at asc
       for update skip locked
       limit p_limit
    )
    update osp_private.background_jobs
       set attempt = background_jobs.attempt + 1,
           lease_token = gen_random_uuid(),
           leased_until = lease_deadline
      from candidates
     where background_jobs.id = candidates.id
    returning background_jobs.id, background_jobs.organization_id, background_jobs.kind,
              background_jobs.opaque_payload, background_jobs.attempt,
              background_jobs.lease_token, background_jobs.leased_until;
end;
$function$;

create function osp_private.complete_background_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_completed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $function$
declare
  changed integer;
begin
  update osp_private.background_jobs
     set completed_at = p_completed_at,
         lease_token = null,
         leased_until = null
   where id = p_job_id
     and lease_token = p_lease_token
     and completed_at is null;
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception using errcode = 'P0001', message = 'LEASE_CONFLICT';
  end if;
end;
$function$;

create function osp_private.fail_background_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_retry_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $function$
declare
  changed integer;
begin
  update osp_private.background_jobs
     set last_error_code = p_error_code,
         retry_at = p_retry_at,
         completed_at = case when p_retry_at is null then clock_timestamp() else null end,
         lease_token = null,
         leased_until = null
   where id = p_job_id
     and lease_token = p_lease_token
     and completed_at is null;
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception using errcode = 'P0001', message = 'LEASE_CONFLICT';
  end if;
end;
$function$;

revoke all on schema osp_private from public, anon, authenticated;
revoke all on all tables in schema osp_private from public, anon, authenticated;
grant usage on schema osp_private to osp_workflow_api, osp_worker;
grant select, insert, update on osp_private.supplier_counterparties, osp_private.customer_registration_cases,
  osp_private.case_assignments, osp_private.case_comments, osp_private.gmail_messages, osp_private.gmail_attachments,
  osp_private.duplicate_candidates, osp_private.clarification_drafts to osp_workflow_api;
grant select, insert on osp_private.command_receipts to osp_workflow_api;
grant select, insert on osp_private.case_events to osp_workflow_api;
grant select, insert on osp_private.background_jobs to osp_workflow_api;
revoke select, update on osp_private.background_jobs from osp_worker;
revoke all on function osp_private.claim_next_background_jobs(integer, integer) from public;
revoke all on function osp_private.complete_background_job(uuid, uuid, timestamptz) from public;
revoke all on function osp_private.fail_background_job(uuid, uuid, text, timestamptz) from public;
grant execute on function osp_private.claim_next_background_jobs(integer, integer) to osp_worker;
grant execute on function osp_private.complete_background_job(uuid, uuid, timestamptz) to osp_worker;
grant execute on function osp_private.fail_background_job(uuid, uuid, text, timestamptz) to osp_worker;

alter table osp_private.supplier_counterparties enable row level security;
alter table osp_private.supplier_counterparties force row level security;
alter table osp_private.customer_registration_cases enable row level security;
alter table osp_private.customer_registration_cases force row level security;
alter table osp_private.case_events enable row level security;
alter table osp_private.case_events force row level security;
alter table osp_private.case_assignments enable row level security;
alter table osp_private.case_assignments force row level security;
alter table osp_private.case_comments enable row level security;
alter table osp_private.case_comments force row level security;
alter table osp_private.gmail_messages enable row level security;
alter table osp_private.gmail_messages force row level security;
alter table osp_private.gmail_attachments enable row level security;
alter table osp_private.gmail_attachments force row level security;
alter table osp_private.duplicate_candidates enable row level security;
alter table osp_private.duplicate_candidates force row level security;
alter table osp_private.clarification_drafts enable row level security;
alter table osp_private.clarification_drafts force row level security;
alter table osp_private.command_receipts enable row level security;
alter table osp_private.command_receipts force row level security;
alter table osp_private.background_jobs enable row level security;
alter table osp_private.background_jobs force row level security;

create policy osp_supplier_counterparties_tenant on osp_private.supplier_counterparties for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_cases_tenant on osp_private.customer_registration_cases for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_events_tenant_select on osp_private.case_events for select to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_events_tenant_insert on osp_private.case_events for insert to osp_workflow_api with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_assignments_tenant on osp_private.case_assignments for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_comments_tenant on osp_private.case_comments for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_gmail_messages_tenant on osp_private.gmail_messages for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_gmail_attachments_tenant on osp_private.gmail_attachments for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_duplicates_tenant on osp_private.duplicate_candidates for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_clarifications_tenant on osp_private.clarification_drafts for all to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid) with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_receipts_tenant_select on osp_private.command_receipts for select to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_receipts_tenant_insert on osp_private.command_receipts for insert to osp_workflow_api with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_jobs_workflow_select on osp_private.background_jobs for select to osp_workflow_api using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy osp_jobs_workflow_insert on osp_private.background_jobs for insert to osp_workflow_api with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('osp-originals', 'osp-originals', false, 26214400, array['application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'message/rfc822'])
on conflict (id) do nothing;
