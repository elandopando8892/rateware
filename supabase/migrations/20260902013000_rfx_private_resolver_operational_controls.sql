-- Local-only operational-control candidate for the private resolver.
-- No remote migration, scheduler, secret creation or production approval.

create table if not exists public.rfx_private_resolver_release_controls (
  singleton boolean primary key default true check (singleton),
  control_version text not null unique,
  rate_limit_enabled boolean not null default true,
  rate_limit_per_minute integer not null check (rate_limit_per_minute between 1 and 300),
  rate_limit_window_retention interval not null check (
    rate_limit_window_retention >= interval '1 hour'
    and rate_limit_window_retention <= interval '7 days'
  ),
  secret_custody_verified boolean not null default false,
  network_controls_verified boolean not null default false,
  monitoring_owner_assigned boolean not null default false,
  rollback_rehearsed boolean not null default false,
  production_approved boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.rfx_private_resolver_release_controls (
  singleton, control_version, rate_limit_enabled, rate_limit_per_minute,
  rate_limit_window_retention, secret_custody_verified,
  network_controls_verified, monitoring_owner_assigned,
  rollback_rehearsed, production_approved
) values (
  true, 'rfx-private-resolver-controls.v1', true, 30, interval '24 hours',
  false, false, false, false, false
) on conflict (singleton) do update set
  control_version = excluded.control_version,
  rate_limit_enabled = excluded.rate_limit_enabled,
  rate_limit_per_minute = excluded.rate_limit_per_minute,
  rate_limit_window_retention = excluded.rate_limit_window_retention,
  secret_custody_verified = false,
  network_controls_verified = false,
  monitoring_owner_assigned = false,
  rollback_rehearsed = false,
  production_approved = false,
  updated_at = now();

alter table public.rfx_private_resolver_release_controls enable row level security;
revoke all on table public.rfx_private_resolver_release_controls from public, anon, authenticated;
grant select on table public.rfx_private_resolver_release_controls to service_role;

create table if not exists public.rfx_private_resolver_rate_limit_windows (
  scope_hash text not null check (scope_hash ~ '^[0-9a-f]{64}$'),
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  denied_count integer not null default 0 check (denied_count >= 0 and denied_count <= request_count),
  updated_at timestamptz not null default now(),
  primary key (scope_hash, bucket_start)
);

comment on table public.rfx_private_resolver_rate_limit_windows is
  'Hashed one-minute resolver control windows. Stores no raw issuer, organization, request body, credential, quote, lane, carrier or invitation data.';

create index if not exists rfx_private_resolver_rate_limit_windows_updated_idx
  on public.rfx_private_resolver_rate_limit_windows (updated_at);

alter table public.rfx_private_resolver_rate_limit_windows enable row level security;
revoke all on table public.rfx_private_resolver_rate_limit_windows from public, anon, authenticated, service_role;

create or replace function public.check_rfx_private_resolver_rate_limit(
  p_scope_hash text,
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_control public.rfx_private_resolver_release_controls%rowtype;
  v_window public.rfx_private_resolver_rate_limit_windows%rowtype;
  v_bucket_start timestamptz := date_trunc('minute', p_now);
  v_retry_after integer;
begin
  if p_scope_hash is null or lower(p_scope_hash) !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_RATE_LIMIT_SCOPE';
  end if;

  select * into strict v_control
    from public.rfx_private_resolver_release_controls
    where singleton = true;

  if v_control.rate_limit_enabled is not true then
    return jsonb_build_object(
      'allowed', false,
      'code', 'RATE_LIMIT_CONTROL_DISABLED',
      'controlVersion', v_control.control_version,
      'retryAfterSeconds', 60,
      'externalExecutionPossible', false
    );
  end if;

  insert into public.rfx_private_resolver_rate_limit_windows as rate_window (
    scope_hash, bucket_start, request_count, denied_count, updated_at
  ) values (
    lower(p_scope_hash), v_bucket_start, 1, 0, p_now
  ) on conflict (scope_hash, bucket_start) do update set
    request_count = rate_window.request_count + 1,
    denied_count = rate_window.denied_count + case
      when rate_window.request_count + 1 > v_control.rate_limit_per_minute then 1
      else 0
    end,
    updated_at = p_now
  returning * into v_window;

  v_retry_after := greatest(
    1,
    ceil(extract(epoch from (v_bucket_start + interval '1 minute' - p_now)))::integer
  );

  return jsonb_build_object(
    'allowed', v_window.request_count <= v_control.rate_limit_per_minute,
    'code', case
      when v_window.request_count <= v_control.rate_limit_per_minute then 'RATE_LIMIT_OK'
      else 'PRIVATE_RESOLVER_RATE_LIMITED'
    end,
    'controlVersion', v_control.control_version,
    'limitPerMinute', v_control.rate_limit_per_minute,
    'remaining', greatest(v_control.rate_limit_per_minute - v_window.request_count, 0),
    'retryAfterSeconds', v_retry_after,
    'bucketStart', v_bucket_start,
    'externalExecutionPossible', false
  );
end;
$$;

create or replace function public.purge_rfx_private_resolver_rate_limit_windows(
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_control public.rfx_private_resolver_release_controls%rowtype;
  v_purged bigint := 0;
begin
  select * into strict v_control
    from public.rfx_private_resolver_release_controls
    where singleton = true;

  delete from public.rfx_private_resolver_rate_limit_windows
   where bucket_start < p_now - v_control.rate_limit_window_retention;
  get diagnostics v_purged = row_count;

  return jsonb_build_object(
    'controlVersion', v_control.control_version,
    'windowsPurged', v_purged,
    'ranAt', p_now,
    'externalExecutionPossible', false
  );
end;
$$;

create or replace function public.get_rfx_private_resolver_operational_readiness()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'controlVersion', control.control_version,
    'rateLimitEnabled', control.rate_limit_enabled,
    'rateLimitPerMinute', control.rate_limit_per_minute,
    'rateLimitWindowRetentionHours', extract(epoch from control.rate_limit_window_retention) / 3600,
    'currentWindows', count(*) filter (where rate_window.bucket_start >= now() - interval '1 minute'),
    'requests24h', coalesce(sum(rate_window.request_count) filter (where rate_window.bucket_start >= now() - interval '24 hours'), 0),
    'denied24h', coalesce(sum(rate_window.denied_count) filter (where rate_window.bucket_start >= now() - interval '24 hours'), 0),
    'windowsEligibleForPurge', count(*) filter (where rate_window.bucket_start < now() - control.rate_limit_window_retention),
    'secretCustodyVerified', control.secret_custody_verified,
    'networkControlsVerified', control.network_controls_verified,
    'monitoringOwnerAssigned', control.monitoring_owner_assigned,
    'rollbackRehearsed', control.rollback_rehearsed,
    'productionApproved', control.production_approved,
    'releaseReady', control.rate_limit_enabled
      and control.secret_custody_verified
      and control.network_controls_verified
      and control.monitoring_owner_assigned
      and control.rollback_rehearsed
      and control.production_approved,
    'requestBodyStored', false,
    'credentialMaterialStored', false,
    'externalExecutionPossible', false,
    'checkedAt', now()
  )
  from public.rfx_private_resolver_release_controls control
  left join public.rfx_private_resolver_rate_limit_windows rate_window on true
  where control.singleton = true
  group by control.control_version, control.rate_limit_enabled,
           control.rate_limit_per_minute, control.rate_limit_window_retention,
           control.secret_custody_verified, control.network_controls_verified,
           control.monitoring_owner_assigned, control.rollback_rehearsed,
           control.production_approved;
$$;

revoke all on function public.check_rfx_private_resolver_rate_limit(text,timestamptz) from public, anon, authenticated;
revoke all on function public.purge_rfx_private_resolver_rate_limit_windows(timestamptz) from public, anon, authenticated;
revoke all on function public.get_rfx_private_resolver_operational_readiness() from public, anon, authenticated;
grant execute on function public.check_rfx_private_resolver_rate_limit(text,timestamptz) to service_role;
grant execute on function public.purge_rfx_private_resolver_rate_limit_windows(timestamptz) to service_role;
grant execute on function public.get_rfx_private_resolver_operational_readiness() to service_role;

-- Deliberately absent: remote deployment, scheduler registration, secret
-- values, raw scopes, external network calls or bid execution.
