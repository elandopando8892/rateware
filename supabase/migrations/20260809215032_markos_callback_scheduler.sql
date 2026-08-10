create table if not exists public.markos_callback_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid,
  owner_user_id text,
  owner_email text not null,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  rfx_event_id uuid not null references public.rfx_events(id) on delete cascade,
  rfx_lane_id uuid not null references public.rfx_lanes(id) on delete cascade,
  rfx_lane_vendor_id uuid not null references public.rfx_lane_vendors(id) on delete cascade,
  source_session_id text not null,
  recipient_phone text not null check (recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  scheduled_at timestamptz not null,
  scheduled_local timestamp without time zone not null,
  timezone text not null,
  requested_expression text,
  purpose text not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'dispatching', 'queued', 'initiated', 'ringing', 'in_progress', 'completed', 'no_answer', 'busy', 'failed', 'canceled', 'needs_review')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  dispatch_attempt_id uuid,
  lease_until timestamptz,
  twilio_call_sid text,
  markos_voice_session_id text,
  consent_confirmed_at timestamptz not null,
  dispatched_at timestamptz,
  completed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  constraint markos_callback_jobs_session_time_unique
    unique (source_session_id, rfx_lane_vendor_id, scheduled_at)
);

alter table public.markos_callback_jobs enable row level security;
revoke all on table public.markos_callback_jobs from public, anon, authenticated;
grant select, insert, update on table public.markos_callback_jobs to service_role;

create index if not exists markos_callback_jobs_due_idx
  on public.markos_callback_jobs (scheduled_at, id)
  where status = 'scheduled';

create index if not exists markos_callback_jobs_owner_vendor_idx
  on public.markos_callback_jobs (owner_email, vendor_id, created_at desc);

create index if not exists markos_callback_jobs_twilio_sid_idx
  on public.markos_callback_jobs (twilio_call_sid)
  where twilio_call_sid is not null;

create or replace function public.claim_due_markos_callback_jobs(
  p_limit integer default 10,
  p_lease_seconds integer default 300
)
returns setof public.markos_callback_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  with due as (
    select job.id
    from public.markos_callback_jobs job
    where job.status = 'scheduled'
      and job.scheduled_at <= now()
      and job.attempt_count < 3
    order by job.scheduled_at, job.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  )
  update public.markos_callback_jobs job
  set status = 'dispatching',
      attempt_count = job.attempt_count + 1,
      dispatch_attempt_id = gen_random_uuid(),
      lease_until = now() + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 300), 900))),
      updated_at = now(),
      last_error = null
  from due
  where job.id = due.id
  returning job.*;
end;
$$;

revoke all on function public.claim_due_markos_callback_jobs(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_markos_callback_jobs(integer, integer) to service_role;

comment on table public.markos_callback_jobs is
  'Durable, carrier-confirmed MarkOS callback schedule owned by Outreach. Service-role only; Twilio dispatch is performed by a protected worker.';

comment on column public.markos_callback_jobs.status is
  'No blind retry is allowed after an uncertain external dispatch; use needs_review when Twilio acceptance cannot be proven.';
