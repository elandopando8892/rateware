-- Private orchestration ledger. Browser-editable records are not approvals.
create table public.demand_radar_spot_jobs (
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  job_key text not null check (job_key ~ '^(bidware_lead_request|bidware_approval|bidware_project):[a-f0-9]{64}$'),
  provider text not null,
  action text not null,
  subject_id text not null check (length(subject_id) between 1 and 180),
  request_hash character(64) not null check (request_hash ~ '^[a-f0-9]{64}$'),
  state text not null check (state in ('reserved','in_flight','completed','uncertain')),
  -- Preserve JSON property order used by the existing sealed fingerprint.
  receipt_text text not null default '{}' check (length(receipt_text)<=50000 and jsonb_typeof(receipt_text::jsonb)='object'),
  provider_request_id text check (length(provider_request_id)<=180),
  error_code text check (length(error_code)<=120),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id,job_key),
  constraint demand_radar_spot_job_kind check (
    (provider='radar' and action='bidware_lead_request_confirm' and job_key like 'bidware_lead_request:%') or
    (provider='radar' and action='bidware_requirement_approve' and job_key like 'bidware_approval:%') or
    (provider='rateware' and action='bidware_project_create' and job_key like 'bidware_project:%'))
);
create table public.demand_radar_spot_job_versions (
  owner_user_id uuid not null,
  job_key text not null,
  revision bigint not null,
  state text not null,
  receipt_text text not null,
  provider_request_id text,
  error_code text,
  recorded_at timestamptz not null default now(),
  primary key (owner_user_id,job_key,revision),
  foreign key (owner_user_id,job_key) references public.demand_radar_spot_jobs(owner_user_id,job_key) on delete cascade
);
alter table public.demand_radar_spot_jobs enable row level security;
alter table public.demand_radar_spot_job_versions enable row level security;
revoke all on public.demand_radar_spot_jobs,public.demand_radar_spot_job_versions from public,anon,authenticated,service_role;
grant select,insert,update on public.demand_radar_spot_jobs to service_role;
grant select,insert on public.demand_radar_spot_job_versions to service_role;

create function public.demand_radar_guard_spot_job() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='INSERT' then
    if new.state<>'reserved' then raise exception 'SPOT_INITIAL_STATE_INVALID'; end if;
    new.revision:=1;
    new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
    return new;
  end if;
  if row(new.owner_user_id,new.job_key,new.provider,new.action,new.subject_id,new.request_hash,new.created_at)
     is distinct from row(old.owner_user_id,old.job_key,old.provider,old.action,old.subject_id,old.request_hash,old.created_at)
  then raise exception 'SPOT_JOB_IDENTITY_IMMUTABLE'; end if;
  if old.state='completed' and row(new.state,new.receipt_text,new.provider_request_id,new.error_code)
     is distinct from row(old.state,old.receipt_text,old.provider_request_id,old.error_code)
  then raise exception 'SPOT_COMPLETED_RECEIPT_IMMUTABLE'; end if;
  if row(new.state,new.receipt_text,new.provider_request_id,new.error_code)
     is not distinct from row(old.state,old.receipt_text,old.provider_request_id,old.error_code)
  then return null; end if;
  if not (
    (old.state='reserved' and new.state='completed' and old.provider='radar') or
    (old.state='reserved' and new.state='in_flight' and old.provider='rateware') or
    (old.state='in_flight' and new.state in ('completed','uncertain')) or
    (old.state='uncertain' and new.state='completed'))
  then raise exception 'SPOT_JOB_TRANSITION_INVALID'; end if;
  new.revision:=old.revision+1;new.updated_at:=clock_timestamp();
  return new;
end $$;
create function public.demand_radar_record_spot_job_version() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  insert into public.demand_radar_spot_job_versions
    (owner_user_id,job_key,revision,state,receipt_text,provider_request_id,error_code,recorded_at)
  values (new.owner_user_id,new.job_key,new.revision,new.state,new.receipt_text,new.provider_request_id,new.error_code,new.updated_at);
  return new;
end $$;
revoke all on function public.demand_radar_guard_spot_job(),public.demand_radar_record_spot_job_version() from public,anon,authenticated;
grant execute on function public.demand_radar_guard_spot_job(),public.demand_radar_record_spot_job_version() to service_role;
create trigger demand_radar_spot_job_guard before insert or update on public.demand_radar_spot_jobs
  for each row execute function public.demand_radar_guard_spot_job();
create trigger demand_radar_spot_job_history after insert or update on public.demand_radar_spot_jobs
  for each row execute function public.demand_radar_record_spot_job_version();

