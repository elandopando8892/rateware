-- Durable, payload-minimized anti-replay ledger for the read-only private RFx
-- resolver candidate. This migration is intentionally authored but not applied
-- by MARKSMAN Loads Sprint 9.4.

create table if not exists public.rfx_private_resolver_requests (
  request_id uuid primary key,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  action text not null check (action = 'resolve_and_submit_bid_canary'),
  issuer text not null,
  key_id text not null,
  organization_id text not null,
  vendor_id uuid not null references public.vendors(id),
  rfx_lane_id uuid not null references public.rfx_lanes(id),
  rfx_event_id uuid not null references public.rfx_events(id),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[0-9a-f]{64}$'),
  handoff_fingerprint text not null check (handoff_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'processing'
    check (status in ('processing', 'resolution_canary_passed', 'failed')),
  resolver_ref text,
  invitation_status text,
  evidence_class text,
  error_code text,
  external_execution boolean not null default false check (external_execution = false),
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (status = 'processing' and completed_at is null)
    or (status = 'resolution_canary_passed' and completed_at is not null and resolver_ref is not null and invitation_status is not null and evidence_class is not null)
    or (status = 'failed' and completed_at is not null and error_code is not null)
  )
);

comment on table public.rfx_private_resolver_requests is
  'Minimal anti-replay evidence. Never stores request body, signature, invitation token, quote, notes, or operational-fit detail.';

create index if not exists rfx_private_resolver_requests_lane_idx
  on public.rfx_private_resolver_requests (rfx_lane_id, claimed_at desc);
create index if not exists rfx_private_resolver_requests_org_idx
  on public.rfx_private_resolver_requests (organization_id, claimed_at desc);

alter table public.rfx_private_resolver_requests enable row level security;
revoke all on table public.rfx_private_resolver_requests from anon, authenticated;
grant select, insert, update on table public.rfx_private_resolver_requests to service_role;

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
begin
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

create or replace function public.complete_rfx_private_resolver_request(
  p_request_id uuid,
  p_request_hash text,
  p_resolver_ref text,
  p_invitation_status text,
  p_evidence_class text,
  p_completed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rfx_private_resolver_requests%rowtype;
begin
  update public.rfx_private_resolver_requests
     set status = 'resolution_canary_passed',
         resolver_ref = p_resolver_ref,
         invitation_status = p_invitation_status,
         evidence_class = p_evidence_class,
         error_code = null,
         completed_at = p_completed_at,
         updated_at = now()
   where request_id = p_request_id
     and request_hash = lower(p_request_hash)
     and status = 'processing'
  returning * into v_row;
  if not found then raise exception using errcode = 'P0001', message = 'REQUEST_LEDGER_STATE_CONFLICT'; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.fail_rfx_private_resolver_request(
  p_request_id uuid,
  p_request_hash text,
  p_error_code text,
  p_completed_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.rfx_private_resolver_requests%rowtype;
begin
  update public.rfx_private_resolver_requests
     set status = 'failed',
         error_code = p_error_code,
         completed_at = p_completed_at,
         updated_at = now()
   where request_id = p_request_id
     and request_hash = lower(p_request_hash)
     and status = 'processing'
  returning * into v_row;
  return case when found then to_jsonb(v_row) else null end;
end;
$$;

revoke all on function public.claim_rfx_private_resolver_request(uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz) from public, anon, authenticated;
revoke all on function public.complete_rfx_private_resolver_request(uuid,text,text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.fail_rfx_private_resolver_request(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_rfx_private_resolver_request(uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,timestamptz,timestamptz) to service_role;
grant execute on function public.complete_rfx_private_resolver_request(uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.fail_rfx_private_resolver_request(uuid,text,text,timestamptz) to service_role;
