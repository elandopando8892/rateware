-- steel-intake-api (contrato steel.freight-request.v1): The Steel Marketplace publica
-- oportunidades spot en el Bid Room. Sólo la Edge Function (service role) usa estas
-- tablas y funciones; ningún navegador. No invita carriers ni modifica filas existentes.
begin;

-- Receipt idempotente por llave del cliente: misma llave + mismo hash = misma respuesta.
create table public.steel_intake_receipts (
  idempotency_key text primary key,
  action text not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  constraint steel_intake_receipts_key_length check (char_length(idempotency_key) between 1 and 200),
  constraint steel_intake_receipts_action_check
    check (action in ('publish_spot_opportunity', 'cancel_spot_opportunity')),
  constraint steel_intake_receipts_hash_check check (request_hash ~ '^[0-9a-f]{64}$')
);

-- Marca los rfx_events creados por la integración: get_spot_status sólo lee éstos.
create table public.steel_intake_events (
  rfx_event_id uuid primary key references public.rfx_events(id) on delete cascade,
  external_system text not null,
  external_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint steel_intake_events_external_ref_object check (jsonb_typeof(external_ref) = 'object')
);
create index steel_intake_events_shipment_idx
  on public.steel_intake_events (external_system, (external_ref->>'shipment_id'));

alter table public.steel_intake_receipts enable row level security;
alter table public.steel_intake_events enable row level security;
revoke all on table public.steel_intake_receipts from public, anon, authenticated;
revoke all on table public.steel_intake_events from public, anon, authenticated;
-- Receipts y marcas son inmutables también para el service role.
revoke all on table public.steel_intake_receipts from service_role;
revoke all on table public.steel_intake_events from service_role;
grant select, insert on table public.steel_intake_receipts to service_role;
grant select, insert on table public.steel_intake_events to service_role;

-- Crea en una transacción el rfx_event spot abierto, su rfx_lane, la marca y el receipt.
-- La Edge valida y arma filas y respuesta; aquí se fijan event_type/status/visibilidad.
create function public.steel_intake_publish_spot(
  p_idempotency_key text, p_request_hash text,
  p_owner_email text, p_owner_user_id text, p_organization_id text, p_actor_email text,
  p_event jsonb, p_lane jsonb, p_external_system text, p_external_ref jsonb, p_response jsonb
) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public
as $function$
declare
  receipt public.steel_intake_receipts%rowtype;
  event_id uuid;
  lane_id uuid;
begin
  if nullif(btrim(p_idempotency_key), '') is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_owner_email), '') is null or nullif(btrim(p_organization_id), '') is null
    or nullif(btrim(p_actor_email), '') is null or nullif(btrim(p_external_system), '') is null
    or jsonb_typeof(p_event) is distinct from 'object' or jsonb_typeof(p_lane) is distinct from 'object'
    or jsonb_typeof(p_external_ref) is distinct from 'object' or jsonb_typeof(p_response) is distinct from 'object' then
    raise exception using errcode = 'PT422', message = 'steel_intake_invalid_arguments';
  end if;

  -- Serializa la misma llave: la segunda petición concurrente ve el receipt de la primera.
  perform pg_advisory_xact_lock(hashtextextended('steel_intake:' || p_idempotency_key, 0));
  select * into receipt from public.steel_intake_receipts where idempotency_key = p_idempotency_key;
  if found then
    if receipt.action <> 'publish_spot_opportunity' or receipt.request_hash <> p_request_hash then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return receipt.response || jsonb_build_object('replayed', true);
  end if;

  perform 1 from public.workspace_registry
    where organization_id = p_organization_id and canonical_owner_key = p_owner_email;
  if not found then
    raise exception using errcode = 'PT503', message = 'intake_workspace_not_configured';
  end if;

  event_id := (p_event->>'id')::uuid;
  lane_id := (p_lane->>'id')::uuid;
  if event_id is null or lane_id is null or (p_lane->>'rfx_event_id')::uuid is distinct from event_id
    or (p_response->>'rfx_event_id')::uuid is distinct from event_id then
    raise exception using errcode = 'PT422', message = 'steel_intake_invalid_arguments';
  end if;

  insert into public.rfx_events (id, owner_user_id, owner_email, organization_id, rfx_id, name, customer,
    event_type, status, bid_visibility_mode, due_date, operation_start_date, notes)
  select event_id, p_owner_user_id, p_owner_email, p_organization_id, r.rfx_id, r.name, r.customer,
    'spot', 'open', 'private', r.due_date, r.operation_start_date, r.notes
  from jsonb_populate_record(null::public.rfx_events, p_event) as r;

  insert into public.rfx_lanes (id, rfx_event_id, lane_number, origin, origin_city, origin_state, origin_country,
    destination, destination_city, destination_state, destination_country, equipment, weekly_volume, currency, notes)
  select lane_id, event_id, 1, r.origin, r.origin_city, r.origin_state, r.origin_country,
    r.destination, r.destination_city, r.destination_state, r.destination_country, r.equipment,
    r.weekly_volume, coalesce(r.currency, 'USD'), r.notes
  from jsonb_populate_record(null::public.rfx_lanes, p_lane) as r;

  insert into public.steel_intake_events (rfx_event_id, external_system, external_ref)
  values (event_id, p_external_system, p_external_ref);
  insert into public.steel_intake_receipts (idempotency_key, action, request_hash, response)
  values (p_idempotency_key, 'publish_spot_opportunity', p_request_hash, p_response || jsonb_build_object('replayed', false));
  insert into public.saas_audit_log (owner_user_id, owner_email, organization_id, actor_email, action, entity_type, entity_id, summary, metadata)
  values (p_owner_user_id, p_owner_email, p_organization_id, p_actor_email, 'steel_intake.spot.publish', 'rfx_events', event_id::text,
    'The Steel Marketplace publicó la oportunidad spot ' || coalesce(p_event->>'rfx_id', event_id::text),
    jsonb_build_object('source', 'steel-intake-api', 'external_system', p_external_system, 'external_ref', p_external_ref,
      'receipt_id', p_response->>'receipt_id', 'request_hash', p_request_hash));
  return p_response || jsonb_build_object('replayed', false);
end;
$function$;

-- Archiva (estado de cierre del Bid Room) un evento creado por la integración, con motivo en notes.
-- Repetir sobre un evento ya archivado no lo vuelve a tocar. No cancela un evento adjudicado.
create function public.steel_intake_cancel_spot(
  p_idempotency_key text, p_request_hash text,
  p_owner_email text, p_owner_user_id text, p_organization_id text, p_actor_email text,
  p_rfx_event_id uuid, p_reason text, p_receipt_id uuid
) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public
as $function$
declare
  receipt public.steel_intake_receipts%rowtype;
  event public.rfx_events%rowtype;
  already_archived boolean;
  response jsonb;
  now_at timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_idempotency_key), '') is null or p_request_hash !~ '^[0-9a-f]{64}$'
    or nullif(btrim(p_owner_email), '') is null or nullif(btrim(p_organization_id), '') is null
    or nullif(btrim(p_actor_email), '') is null or p_rfx_event_id is null or p_receipt_id is null
    or nullif(btrim(p_reason), '') is null then
    raise exception using errcode = 'PT422', message = 'steel_intake_invalid_arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('steel_intake:' || p_idempotency_key, 0));
  select * into receipt from public.steel_intake_receipts where idempotency_key = p_idempotency_key;
  if found then
    if receipt.action <> 'cancel_spot_opportunity' or receipt.request_hash <> p_request_hash then
      raise exception using errcode = 'PT409', message = 'idempotency_conflict';
    end if;
    return receipt.response || jsonb_build_object('replayed', true);
  end if;

  select e.* into event from public.rfx_events e
    join public.steel_intake_events s on s.rfx_event_id = e.id
    where e.id = p_rfx_event_id and e.owner_email = p_owner_email
    for update of e;
  if not found then raise exception using errcode = 'PT404', message = 'spot_not_found'; end if;

  perform 1 from public.rfx_lane_vendors
    where rfx_event_id = event.id and award_role = 'primary';
  if found or event.status = 'awarded' then
    raise exception using errcode = 'PT409', message = 'spot_already_awarded';
  end if;

  already_archived := event.status = 'archived';
  if not already_archived then
    update public.rfx_events
      set status = 'archived',
          notes = left(concat_ws(E'\n', nullif(notes, ''),
            'Cancelado por The Steel Marketplace (' || to_char(now_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') || '): ' || btrim(p_reason)), 8000),
          updated_at = now_at
      where id = event.id;
  end if;

  response := jsonb_build_object('contract', 'steel.freight-request.v1', 'receipt_id', p_receipt_id, 'status', 'archived',
    'rfx_event_id', event.id, 'already_archived', already_archived,
    'received_at', to_char(now_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'replayed', false);
  insert into public.steel_intake_receipts (idempotency_key, action, request_hash, response)
  values (p_idempotency_key, 'cancel_spot_opportunity', p_request_hash, response);
  insert into public.saas_audit_log (owner_user_id, owner_email, organization_id, actor_email, action, entity_type, entity_id, summary, metadata)
  values (p_owner_user_id, p_owner_email, p_organization_id, p_actor_email, 'steel_intake.spot.cancel', 'rfx_events', event.id::text,
    'The Steel Marketplace canceló la oportunidad spot ' || event.rfx_id,
    jsonb_build_object('source', 'steel-intake-api', 'reason', btrim(p_reason), 'already_archived', already_archived,
      'receipt_id', p_receipt_id, 'request_hash', p_request_hash));
  return response;
end;
$function$;

revoke all on function public.steel_intake_publish_spot(text, text, text, text, text, text, jsonb, jsonb, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.steel_intake_publish_spot(text, text, text, text, text, text, jsonb, jsonb, text, jsonb, jsonb)
  to service_role;
revoke all on function public.steel_intake_cancel_spot(text, text, text, text, text, text, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.steel_intake_cancel_spot(text, text, text, text, text, text, uuid, text, uuid)
  to service_role;
comment on function public.steel_intake_publish_spot(text, text, text, text, text, text, jsonb, jsonb, text, jsonb, jsonb) is
  'Interna (service role). steel-intake-api autentica el secreto y resuelve el workspace antes de llamarla.';
comment on function public.steel_intake_cancel_spot(text, text, text, text, text, text, uuid, text, uuid) is
  'Interna (service role). steel-intake-api autentica el secreto y resuelve el workspace antes de llamarla.';
commit;
