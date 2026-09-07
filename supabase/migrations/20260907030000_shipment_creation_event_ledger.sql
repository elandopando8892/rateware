-- Confirmed shipment creation events recorded in Rateware.
-- This migration is additive and intentionally does not backfill or emit events.

create table if not exists public.rateware_shipment_creation_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  occurred_at timestamptz not null,
  organization_id text not null check (btrim(organization_id) <> ''),
  owner_email text not null check (btrim(owner_email) <> ''),
  event_type text not null default 'shipment.created'
    check (event_type = 'shipment.created'),
  source_system text not null default 'marksman_loads'
    check (source_system = 'marksman_loads'),
  target_system text not null default 'fleet_rocket'
    check (target_system = 'fleet_rocket'),
  status text not null default 'confirmed'
    check (status = 'confirmed'),
  receipt_version text not null
    check (receipt_version = 'fleetrocket-execution-receipt.v1'),
  execution_receipt_id text not null check (btrim(execution_receipt_id) <> ''),
  idempotency_key text not null check (length(btrim(idempotency_key)) >= 8),
  rfx_event_id uuid not null references public.rfx_events(id) on delete restrict,
  rfx_reference text,
  rfx_lane_id uuid references public.rfx_lanes(id) on delete restrict,
  customer_name text,
  origin text,
  destination text,
  instruction_letter_id text not null check (btrim(instruction_letter_id) <> ''),
  instruction_letter_revision integer not null check (instruction_letter_revision >= 1),
  fleet_rocket_load_number text not null check (btrim(fleet_rocket_load_number) <> ''),
  fleet_rocket_environment text not null
    check (fleet_rocket_environment in ('demo', 'prod')),
  request_payload_hash text not null check (length(btrim(request_payload_hash)) >= 8),
  instruction_terms_hash text not null
    check (instruction_terms_hash ~ '^sha256:[a-f0-9]{64}$')
);

create unique index if not exists rateware_shipment_events_idempotency_unique
  on public.rateware_shipment_creation_events (organization_id, idempotency_key);
create unique index if not exists rateware_shipment_events_receipt_unique
  on public.rateware_shipment_creation_events (organization_id, execution_receipt_id);
create unique index if not exists rateware_shipment_events_load_unique
  on public.rateware_shipment_creation_events (organization_id, lower(fleet_rocket_load_number));
create index if not exists rateware_shipment_events_timeline_idx
  on public.rateware_shipment_creation_events (organization_id, occurred_at desc, id desc);
create index if not exists rateware_shipment_events_rfx_idx
  on public.rateware_shipment_creation_events (rfx_event_id, rfx_lane_id);

alter table public.rateware_shipment_creation_events enable row level security;
revoke all on table public.rateware_shipment_creation_events from public, anon, authenticated, service_role;
grant select on table public.rateware_shipment_creation_events to service_role;

create or replace function public.rateware_register_shipment_created(
  p_organization_id text,
  p_receipt_version text,
  p_execution_receipt_id text,
  p_idempotency_key text,
  p_rfx_event_id uuid,
  p_rfx_lane_id uuid,
  p_instruction_letter_id text,
  p_instruction_letter_revision integer,
  p_receipt_mode text,
  p_external_execution boolean,
  p_occurred_at timestamptz,
  p_fleet_rocket_environment text,
  p_fleet_rocket_load_number text,
  p_request_payload_hash text,
  p_instruction_terms_hash text
)
returns table(event_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rfx record;
  v_lane record;
  v_inserted uuid;
  v_existing public.rateware_shipment_creation_events%rowtype;
begin
  if nullif(btrim(p_organization_id), '') is null
    or p_receipt_version <> 'fleetrocket-execution-receipt.v1'
    or nullif(btrim(p_execution_receipt_id), '') is null
    or length(btrim(coalesce(p_idempotency_key, ''))) < 8
    or p_rfx_event_id is null
    or nullif(btrim(p_instruction_letter_id), '') is null
    or coalesce(p_instruction_letter_revision, 0) < 1
    or p_receipt_mode <> 'executed'
    or p_external_execution is distinct from true
    or p_occurred_at is null
    or p_fleet_rocket_environment not in ('demo', 'prod')
    or nullif(btrim(p_fleet_rocket_load_number), '') is null
    or length(btrim(coalesce(p_request_payload_hash, ''))) < 8
    or p_instruction_terms_hash !~ '^sha256:[a-f0-9]{64}$'
  then
    raise exception 'SHIPMENT_EVENT_NOT_CONFIRMED' using errcode = '22023';
  end if;

  select event.id, event.owner_email, event.organization_id, event.rfx_id, event.customer
    into v_rfx
  from public.rfx_events event
  where event.id = p_rfx_event_id
    and event.organization_id = btrim(p_organization_id)
    and event.status <> 'archived';

  if not found or nullif(btrim(v_rfx.owner_email), '') is null then
    raise exception 'SHIPMENT_EVENT_RFX_UNAVAILABLE' using errcode = 'P0002';
  end if;

  if p_rfx_lane_id is not null then
    select lane.id,
      coalesce(nullif(btrim(lane.origin), ''), nullif(btrim(concat_ws(', ', lane.origin_city, lane.origin_state)), '')) as origin,
      coalesce(nullif(btrim(lane.destination), ''), nullif(btrim(concat_ws(', ', lane.destination_city, lane.destination_state)), '')) as destination
      into v_lane
    from public.rfx_lanes lane
    where lane.id = p_rfx_lane_id and lane.rfx_event_id = p_rfx_event_id;
    if not found then
      raise exception 'SHIPMENT_EVENT_LANE_UNAVAILABLE' using errcode = 'P0002';
    end if;
  end if;

  insert into public.rateware_shipment_creation_events (
    occurred_at, organization_id, owner_email, receipt_version,
    execution_receipt_id, idempotency_key, rfx_event_id, rfx_reference,
    rfx_lane_id, customer_name, origin, destination, instruction_letter_id,
    instruction_letter_revision, fleet_rocket_environment,
    fleet_rocket_load_number, request_payload_hash, instruction_terms_hash
  ) values (
    p_occurred_at, btrim(p_organization_id), v_rfx.owner_email, p_receipt_version,
    btrim(p_execution_receipt_id), btrim(p_idempotency_key), p_rfx_event_id,
    v_rfx.rfx_id, p_rfx_lane_id, v_rfx.customer,
    case when p_rfx_lane_id is null then null else v_lane.origin end,
    case when p_rfx_lane_id is null then null else v_lane.destination end,
    btrim(p_instruction_letter_id), p_instruction_letter_revision,
    p_fleet_rocket_environment, btrim(p_fleet_rocket_load_number),
    btrim(p_request_payload_hash), p_instruction_terms_hash
  )
  on conflict (organization_id, idempotency_key) do nothing
  returning id into v_inserted;

  if v_inserted is not null then
    return query select v_inserted, false;
    return;
  end if;

  select event.* into v_existing
  from public.rateware_shipment_creation_events event
  where event.organization_id = btrim(p_organization_id)
    and event.idempotency_key = btrim(p_idempotency_key);

  if not found
    or v_existing.receipt_version is distinct from p_receipt_version
    or v_existing.execution_receipt_id is distinct from btrim(p_execution_receipt_id)
    or v_existing.rfx_event_id is distinct from p_rfx_event_id
    or v_existing.rfx_lane_id is distinct from p_rfx_lane_id
    or v_existing.instruction_letter_id is distinct from btrim(p_instruction_letter_id)
    or v_existing.instruction_letter_revision is distinct from p_instruction_letter_revision
    or v_existing.occurred_at is distinct from p_occurred_at
    or v_existing.fleet_rocket_environment is distinct from p_fleet_rocket_environment
    or v_existing.fleet_rocket_load_number is distinct from btrim(p_fleet_rocket_load_number)
    or v_existing.request_payload_hash is distinct from btrim(p_request_payload_hash)
    or v_existing.instruction_terms_hash is distinct from p_instruction_terms_hash
  then
    raise exception 'SHIPMENT_EVENT_IDEMPOTENCY_CONFLICT' using errcode = '23505';
  end if;

  return query select v_existing.id, true;
end;
$$;

create or replace function public.rateware_search_shipment_creation_events(
  p_organization_id text,
  p_query text default '',
  p_after_occurred_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 25
)
returns table(
  event_id uuid, event_type text, occurred_at timestamptz,
  rfx_event_id uuid, rfx_reference text, rfx_lane_id uuid,
  instruction_letter_id text, instruction_letter_revision integer,
  execution_receipt_id text, fleet_rocket_load_number text,
  target_system text, status text, customer_name text,
  origin text, destination text, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_query text := btrim(coalesce(p_query, ''));
begin
  if nullif(btrim(p_organization_id), '') is null
    or length(v_query) > 200
    or v_query ~ '[[:cntrl:]]'
    or p_limit < 1 or p_limit > 26
    or ((p_after_occurred_at is null) <> (p_after_id is null))
  then
    raise exception 'INVALID_SHIPMENT_CONTEXT_REQUEST' using errcode = '22023';
  end if;

  return query
  select event.id, event.event_type, event.occurred_at,
    event.rfx_event_id, event.rfx_reference, event.rfx_lane_id,
    event.instruction_letter_id, event.instruction_letter_revision,
    event.execution_receipt_id, event.fleet_rocket_load_number,
    event.target_system, event.status, event.customer_name,
    event.origin, event.destination, event.updated_at
  from public.rateware_shipment_creation_events event
  where event.organization_id = btrim(p_organization_id)
    and (v_query = ''
      or strpos(lower(event.fleet_rocket_load_number), lower(v_query)) > 0
      or strpos(lower(event.rfx_reference), lower(v_query)) > 0
      or strpos(lower(event.instruction_letter_id), lower(v_query)) > 0
      or strpos(lower(event.execution_receipt_id), lower(v_query)) > 0
      or strpos(lower(coalesce(event.customer_name, '')), lower(v_query)) > 0)
    and (p_after_occurred_at is null
      or (event.occurred_at, event.id) < (p_after_occurred_at, p_after_id))
  order by event.occurred_at desc, event.id desc
  limit p_limit;
end;
$$;

create or replace function public.rateware_get_shipment_creation_event(
  p_organization_id text,
  p_event_id uuid
)
returns table(
  event_id uuid, event_type text, occurred_at timestamptz,
  rfx_event_id uuid, rfx_reference text, rfx_lane_id uuid,
  instruction_letter_id text, instruction_letter_revision integer,
  execution_receipt_id text, fleet_rocket_load_number text,
  target_system text, status text, customer_name text,
  origin text, destination text, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select event.id, event.event_type, event.occurred_at,
    event.rfx_event_id, event.rfx_reference, event.rfx_lane_id,
    event.instruction_letter_id, event.instruction_letter_revision,
    event.execution_receipt_id, event.fleet_rocket_load_number,
    event.target_system, event.status, event.customer_name,
    event.origin, event.destination, event.updated_at
  from public.rateware_shipment_creation_events event
  where event.organization_id = btrim(p_organization_id)
    and event.id = p_event_id
  limit 1
$$;

revoke all on function public.rateware_register_shipment_created(text,text,text,text,uuid,uuid,text,integer,text,boolean,timestamptz,text,text,text,text)
  from public, anon, authenticated;
revoke all on function public.rateware_search_shipment_creation_events(text,text,timestamptz,uuid,integer)
  from public, anon, authenticated;
revoke all on function public.rateware_get_shipment_creation_event(text,uuid)
  from public, anon, authenticated;

grant execute on function public.rateware_register_shipment_created(text,text,text,text,uuid,uuid,text,integer,text,boolean,timestamptz,text,text,text,text)
  to service_role;
grant execute on function public.rateware_search_shipment_creation_events(text,text,timestamptz,uuid,integer)
  to service_role;
grant execute on function public.rateware_get_shipment_creation_event(text,uuid)
  to service_role;

comment on table public.rateware_shipment_creation_events is
  'Append-only Rateware ledger of confirmed shipment.created events. Fleet Rocket remains the execution system.';
comment on function public.rateware_register_shipment_created(text,text,text,text,uuid,uuid,text,integer,text,boolean,timestamptz,text,text,text,text) is
  'Idempotently records only a confirmed MARKSMAN Loads Fleet Rocket execution receipt. Not exposed to browsers.';
comment on function public.rateware_search_shipment_creation_events(text,text,timestamptz,uuid,integer) is
  'Bounded service-role projection for an authenticated, organization-scoped context gateway.';
comment on function public.rateware_get_shipment_creation_event(text,uuid) is
  'Returns one organization-scoped shipment creation event without commercial receipt contents.';
