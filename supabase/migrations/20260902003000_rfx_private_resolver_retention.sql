-- Candidate retention policy for the private resolver anti-replay ledger.
-- Authored for local verification only. This migration does not configure
-- pg_cron and must not be applied remotely without release authorization.

create table if not exists public.rfx_private_resolver_retention_policy (
  singleton boolean primary key default true check (singleton),
  policy_version text not null unique,
  detail_retention interval not null check (detail_retention >= interval '1 day' and detail_retention <= interval '365 days'),
  tombstone_retention interval not null check (tombstone_retention >= interval '365 days' and tombstone_retention <= interval '730 days'),
  scheduler_enabled boolean not null default false check (scheduler_enabled = false),
  approved_for_production boolean not null default false check (approved_for_production = false),
  updated_at timestamptz not null default now()
);

insert into public.rfx_private_resolver_retention_policy (
  singleton, policy_version, detail_retention, tombstone_retention,
  scheduler_enabled, approved_for_production
) values (
  true, 'rfx-private-resolver-retention.v1', interval '90 days',
  interval '400 days', false, false
) on conflict (singleton) do update set
  policy_version = excluded.policy_version,
  detail_retention = excluded.detail_retention,
  tombstone_retention = excluded.tombstone_retention,
  scheduler_enabled = false,
  approved_for_production = false,
  updated_at = now();

alter table public.rfx_private_resolver_retention_policy enable row level security;
revoke all on table public.rfx_private_resolver_retention_policy from anon, authenticated;
grant select on table public.rfx_private_resolver_retention_policy to service_role;

create table if not exists public.rfx_private_resolver_request_tombstones (
  request_id uuid primary key,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  action text not null check (action = 'resolve_and_submit_bid_canary'),
  terminal_status text not null check (terminal_status in ('resolution_canary_passed', 'failed')),
  error_code text,
  tombstoned_at timestamptz not null,
  purge_after timestamptz not null check (purge_after > tombstoned_at),
  external_execution boolean not null default false check (external_execution = false)
);

comment on table public.rfx_private_resolver_request_tombstones is
  'Purpose-limited anti-replay tombstones. Stores request identity/hash and terminal class only; never request body, credentials, quote, fit, carrier, lane or invitation data.';

create index if not exists rfx_private_resolver_request_tombstones_purge_idx
  on public.rfx_private_resolver_request_tombstones (purge_after);

alter table public.rfx_private_resolver_request_tombstones enable row level security;
revoke all on table public.rfx_private_resolver_request_tombstones from anon, authenticated;
grant select on table public.rfx_private_resolver_request_tombstones to service_role;

create or replace function public.claim_rfx_private_resolver_request(
  p_request_id uuid,
  p_request_hash text,
  p_action text,
  p_issuer text,
  p_key_id text,
  p_organization_id text,
  p_vendor_id uuid,
  p_rfx_lane_id uuid,
  p_rfx_event_id uuid,
  p_payload_fingerprint text,
  p_evidence_fingerprint text,
  p_handoff_fingerprint text,
  p_claimed_at timestamptz,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_count bigint := 0;
  v_row public.rfx_private_resolver_requests%rowtype;
  v_tombstone public.rfx_private_resolver_request_tombstones%rowtype;
begin
  -- Claims share this lock; maintenance takes the exclusive form. This keeps
  -- tombstone creation and active-row claims atomic relative to each other.
  perform pg_advisory_xact_lock_shared(hashtextextended('rfx-private-resolver-retention.v1', 0));

  select * into v_tombstone
    from public.rfx_private_resolver_request_tombstones
    where request_id = p_request_id;

  if found then
    return jsonb_build_object(
      'claimed', false,
      'mismatch', v_tombstone.request_hash <> lower(p_request_hash),
      'record', jsonb_build_object(
        'request_id', v_tombstone.request_id,
        'request_hash', v_tombstone.request_hash,
        'action', v_tombstone.action,
        'status', 'tombstoned',
        'error_code', 'REQUEST_RETENTION_TOMBSTONE',
        'completed_at', v_tombstone.tombstoned_at,
        'external_execution', false
      )
    );
  end if;

  insert into public.rfx_private_resolver_requests (
    request_id, request_hash, action, issuer, key_id, organization_id,
    vendor_id, rfx_lane_id, rfx_event_id, payload_fingerprint,
    evidence_fingerprint, handoff_fingerprint, claimed_at, expires_at
  ) values (
    p_request_id, lower(p_request_hash), p_action, p_issuer, p_key_id,
    p_organization_id, p_vendor_id, p_rfx_lane_id, p_rfx_event_id,
    lower(p_payload_fingerprint), lower(p_evidence_fingerprint),
    lower(p_handoff_fingerprint), p_claimed_at, p_expires_at
  ) on conflict (request_id) do nothing;

  get diagnostics v_inserted_count = row_count;
  select * into strict v_row
    from public.rfx_private_resolver_requests
    where request_id = p_request_id;

  return jsonb_build_object(
    'claimed', v_inserted_count = 1,
    'mismatch', v_row.request_hash <> lower(p_request_hash),
    'record', to_jsonb(v_row)
  );
end;
$$;

create or replace function public.run_rfx_private_resolver_retention(
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.rfx_private_resolver_retention_policy%rowtype;
  v_recovered bigint := 0;
  v_compacted bigint := 0;
  v_details_deleted bigint := 0;
  v_tombstones_purged bigint := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('rfx-private-resolver-retention.v1', 0));

  select * into strict v_policy
    from public.rfx_private_resolver_retention_policy
    where singleton = true;

  update public.rfx_private_resolver_requests
     set status = 'failed',
         error_code = 'REQUEST_LEASE_EXPIRED',
         completed_at = p_now,
         updated_at = p_now
   where status = 'processing'
     and expires_at < p_now;
  get diagnostics v_recovered = row_count;

  insert into public.rfx_private_resolver_request_tombstones (
    request_id, request_hash, action, terminal_status, error_code,
    tombstoned_at, purge_after, external_execution
  )
  select request_id, request_hash, action, status, error_code,
         p_now, p_now + v_policy.tombstone_retention, false
    from public.rfx_private_resolver_requests
   where status in ('resolution_canary_passed', 'failed')
     and completed_at < p_now - v_policy.detail_retention
  on conflict (request_id) do nothing;
  get diagnostics v_compacted = row_count;

  delete from public.rfx_private_resolver_requests active
   using public.rfx_private_resolver_request_tombstones tombstone
   where active.request_id = tombstone.request_id;
  get diagnostics v_details_deleted = row_count;

  delete from public.rfx_private_resolver_request_tombstones
   where purge_after <= p_now;
  get diagnostics v_tombstones_purged = row_count;

  return jsonb_build_object(
    'policyVersion', v_policy.policy_version,
    'processingRecovered', v_recovered,
    'detailsCompacted', v_compacted,
    'detailsDeleted', v_details_deleted,
    'tombstonesPurged', v_tombstones_purged,
    'schedulerEnabled', v_policy.scheduler_enabled,
    'approvedForProduction', v_policy.approved_for_production,
    'ranAt', p_now,
    'externalExecutionPossible', false
  );
end;
$$;

create or replace function public.get_rfx_private_resolver_ledger_health()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'processingCurrent', count(*) filter (where request.status = 'processing' and request.expires_at >= now()),
    'processingExpired', count(*) filter (where request.status = 'processing' and request.expires_at < now()),
    'completed24h', count(*) filter (where request.status = 'resolution_canary_passed' and request.completed_at >= now() - interval '24 hours'),
    'failed24h', count(*) filter (where request.status = 'failed' and request.completed_at >= now() - interval '24 hours'),
    'oldestProcessingAt', min(request.claimed_at) filter (where request.status = 'processing'),
    'detailEligibleForCompaction', count(*) filter (
      where request.status in ('resolution_canary_passed', 'failed')
        and request.completed_at < now() - policy.detail_retention
    ),
    'tombstonesCurrent', (select count(*) from public.rfx_private_resolver_request_tombstones),
    'tombstonesEligibleForPurge', (select count(*) from public.rfx_private_resolver_request_tombstones where purge_after <= now()),
    'retentionPolicyVersion', policy.policy_version,
    'detailRetentionDays', extract(epoch from policy.detail_retention) / 86400,
    'tombstoneRetentionDays', extract(epoch from policy.tombstone_retention) / 86400,
    'schedulerEnabled', policy.scheduler_enabled,
    'approvedForProduction', policy.approved_for_production,
    'checkedAt', now(),
    'requestBodyStored', false,
    'credentialMaterialStored', false,
    'externalExecutionPossible', false
  )
  from public.rfx_private_resolver_retention_policy policy
  left join public.rfx_private_resolver_requests request on true
  where policy.singleton = true
  group by policy.policy_version, policy.detail_retention,
           policy.tombstone_retention, policy.scheduler_enabled,
           policy.approved_for_production;
$$;

comment on function public.run_rfx_private_resolver_retention(timestamptz) is
  'Recovers expired processing leases, compacts terminal detail to anti-replay tombstones and purges only expired tombstones. No external execution.';

revoke all on function public.claim_rfx_private_resolver_request(uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.run_rfx_private_resolver_retention(timestamptz) from public, anon, authenticated;
revoke all on function public.get_rfx_private_resolver_ledger_health() from public, anon, authenticated;
grant execute on function public.claim_rfx_private_resolver_request(uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.run_rfx_private_resolver_retention(timestamptz) to service_role;
grant execute on function public.get_rfx_private_resolver_ledger_health() to service_role;

-- Deliberately absent: scheduler registration, network calls, request-body
-- storage, production approval, or any external bid execution.
