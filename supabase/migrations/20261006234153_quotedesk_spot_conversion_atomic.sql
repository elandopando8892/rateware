-- LOCAL CANDIDATE. Not applied. Deployment requires the isolated PostgreSQL checks.
-- Existing owner_email is the workspace key; no new master or tenant model.
begin;

create table public.quotedesk_spot_conversions (
  owner_email text not null,
  source_project_id uuid not null references public.rfx_projects(id) on delete restrict,
  submission_id uuid not null references public.rfx_rfi_submissions(id) on delete restrict,
  submission_updated_at timestamptz not null,
  quote_id uuid not null unique references public.quotedesk_quotes(id) on delete restrict,
  original_lane_count integer not null check (original_lane_count between 1 and 50),
  actor_email text not null,
  created_at timestamptz not null default now(),
  primary key (owner_email, source_project_id)
);
alter table public.quotedesk_spot_conversions enable row level security;
revoke all on table public.quotedesk_spot_conversions from public, anon, authenticated;
-- Receipts are immutable through the Data API, including the service-role client.
revoke all on table public.quotedesk_spot_conversions from service_role;
grant select, insert on table public.quotedesk_spot_conversions to service_role;

create function public.quotedesk_convert_spot_request(
  p_owner_email text, p_owner_user_id text, p_organization_id text,
  p_actor_email text, p_project_id uuid, p_expected_submission_updated_at timestamptz
) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public
as $function$
declare
  project public.rfx_projects%rowtype;
  submission public.rfx_rfi_submissions%rowtype;
  receipt public.quotedesk_spot_conversions%rowtype;
  quote public.quotedesk_quotes%rowtype;
  shipper public.shippers%rowtype;
  snapshot jsonb;
  route jsonb;
  mapped jsonb;
  place jsonb;
  side text;
  country text;
  route_number integer := 0;
  lane_count integer;
  next_folio integer;
  violated_constraint text;
  currency text;
  operation text;
  crossing text;
  fx_rate numeric;
  fx_date date;
  legacy text[];
begin
  if nullif(btrim(p_owner_email), '') is null or nullif(btrim(p_organization_id), '') is null
    or nullif(btrim(p_actor_email), '') is null or p_expected_submission_updated_at is null then
    raise exception using errcode = 'PT422', message = 'spot_conversion_identity_required';
  end if;

  -- Serialize this source, including concurrent requests in separate browser sessions.
  select * into project from public.rfx_projects
    where id = p_project_id and owner_email = p_owner_email for update;
  if not found then raise exception using errcode = 'PT404', message = 'spot_source_not_found'; end if;
  select * into submission from public.rfx_rfi_submissions
    where project_id = project.id and owner_email = p_owner_email for update;
  if not found then raise exception using errcode = 'PT404', message = 'spot_submission_not_found'; end if;
  if project.opportunity_type <> 'spot' or submission.status <> 'submitted'
    or project.status = 'archived' or project.linked_rfx_event_id is not null then
    raise exception using errcode = 'PT409', message = 'spot_source_not_convertible';
  end if;
  if submission.updated_at <> p_expected_submission_updated_at then
    raise exception using errcode = 'PT409', message = 'spot_source_version_conflict';
  end if;

  select * into receipt from public.quotedesk_spot_conversions
    where owner_email = p_owner_email and source_project_id = project.id;
  if found then
    if receipt.submission_id <> submission.id or receipt.submission_updated_at <> submission.updated_at then
      raise exception using errcode = 'PT409', message = 'spot_source_version_conflict';
    end if;
    select * into quote from public.quotedesk_quotes where id = receipt.quote_id and owner_email = p_owner_email;
    if not found or quote.shipper_id is distinct from project.customer_id then
      raise exception using errcode = 'PT409', message = 'spot_conversion_link_conflict';
    end if;
    -- No write, no new folio, no overwrite of prices or edited routes on replay.
    return jsonb_build_object('quote', jsonb_build_object('id', quote.id, 'folio', quote.folio),
      'source_project_id', project.id, 'lane_count', receipt.original_lane_count, 'replayed', true);
  end if;

  if coalesce(project.notes, '') ~* 'QuoteDesk' then
    legacy := regexp_match(project.notes, 'QuoteDesk (Q-[0-9]+) · ([0-9a-f-]{36})', 'i');
    if legacy is not null then
      select * into quote from public.quotedesk_quotes
        where id::text = lower(legacy[2]) and owner_email = p_owner_email and folio = legacy[1];
      if not found or quote.shipper_id is distinct from project.customer_id then
        raise exception using errcode = 'PT409', message = 'spot_legacy_link_conflict';
      end if;
      -- Old multi-POST conversion may have copied only some routes. Never adopt by count alone.
      perform 1 from public.quotedesk_quote_lanes where quote_id = quote.id and owner_email = p_owner_email;
    end if;
    raise exception using errcode = 'PT409', message = 'spot_legacy_reconciliation_required';
  end if;
  select * into shipper from public.shippers where id = project.customer_id and owner_email = p_owner_email for share;
  if not found then raise exception using errcode = 'PT422', message = 'spot_shipper_required'; end if;

  -- Use the immutable submitted payload, not potentially half-rebuilt normalized child tables.
  snapshot := submission.frozen_snapshot;
  if jsonb_typeof(snapshot->'lanes') is distinct from 'array' then
    raise exception using errcode = 'PT422', message = 'spot_snapshot_required';
  end if;
  lane_count := jsonb_array_length(snapshot->'lanes');
  if lane_count < 1 or lane_count > 50 then
    raise exception using errcode = 'PT422', message = 'spot_lane_limit';
  end if;
  currency := coalesce(nullif(snapshot #>> '{account_overview,currency}', ''),
    nullif(snapshot #>> '{business_rules,rate_currency}', ''), nullif(snapshot #>> '{lanes,0,currency}', ''), 'USD');
  currency := upper(currency);
  if currency not in ('USD', 'MXN') then raise exception using errcode = 'PT422', message = 'spot_currency_invalid'; end if;
  -- Validate every route before allocating a folio. No guessed legacy geography.
  for route in select value from jsonb_array_elements(snapshot->'lanes') loop
    if jsonb_typeof(route) <> 'object'
      or nullif(btrim(coalesce(route->>'origin_location', route->>'origin_text', '')), '') is null
      or nullif(btrim(coalesce(route->>'destination_location', route->>'destination_text', '')), '') is null
      or nullif(btrim(coalesce(route->>'truck_type', route->>'equipment_type', route->>'equipment', '')), '') is null
      or coalesce(route->>'weekly_volume', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception using errcode = 'PT422', message = 'spot_lane_incomplete';
    end if;
    if (route->>'weekly_volume')::numeric <= 0 then
      raise exception using errcode = 'PT422', message = 'spot_lane_incomplete';
    end if;
    if nullif(route->>'average_weight', '') is not null
      and (route->>'average_weight') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception using errcode = 'PT422', message = 'spot_weight_invalid';
    end if;
  end loop;

  select rate, rate_date into fx_rate, fx_date from public.rateware_fx_spot_rates
    where currency_pair = 'USD/MXN' and rate_date <= current_date order by rate_date desc limit 1;
  -- Reuse the existing workspace sequence and its unique constraint, including ordinary create_quote.
  for attempt in 1..5 loop
    select greatest(coalesce(max(folio_number) + 1, 1001), 1001) into next_folio
      from public.quotedesk_quotes where owner_email = p_owner_email;
    begin
      insert into public.quotedesk_quotes (owner_email, owner_user_id, organization_id, folio_number, folio,
        shipper_id, shipper_name, title, quote_type, channel, requested_by, currency, fx_usd_mxn, fx_rate_date, notes)
      values (p_owner_email, p_owner_user_id, p_organization_id, next_folio, 'Q-' || next_folio,
        shipper.id, coalesce(shipper.shipper_name, shipper.legal_name), project.title, 'spot', 'rfi',
        coalesce(nullif(snapshot #>> '{account_overview,contact}', ''), project.customer_contact_name), currency,
        fx_rate, fx_date, left(concat_ws(' ', 'Solicitud del cliente por liga (' || project.title || ').',
          'Contacto: ' || nullif(concat_ws(' · ', snapshot #>> '{account_overview,contact}', snapshot #>> '{account_overview,contact_email}',
            snapshot #>> '{account_overview,contact_phone}'), '')), 4000)) returning * into quote;
      exit;
    exception when unique_violation then
      get stacked diagnostics violated_constraint = constraint_name;
      if violated_constraint <> 'quotedesk_quotes_owner_email_folio_number_key' then raise; end if;
      if attempt = 5 then raise exception using errcode = 'PT409', message = 'spot_folio_conflict'; end if;
    end;
  end loop;

  for route in select value from jsonb_array_elements(snapshot->'lanes') loop
    route_number := route_number + 1;
    mapped := '{}'::jsonb;
    foreach side in array array['origin', 'destination'] loop
      place := coalesce(route->(side || '_place'), '{}'::jsonb);
      country := upper(coalesce(nullif(place->>'country', ''), nullif(route->>(side || '_country'), '')));
      mapped := mapped || jsonb_build_object(
        side, coalesce(route->>(side || '_location'), route->>(side || '_text')),
        side || '_city', coalesce(nullif(place->>'city', ''), route->>(side || '_city')),
        side || '_state', coalesce(nullif(place->>'state_code', ''), route->>(side || '_state')),
        side || '_country', country,
        side || '_postal_code', case when country = 'MX' then null else
          coalesce(nullif(place->>'zip_prefix', ''), nullif(place->>'postal_code', ''), route->>(side || '_postal_code')) end,
        side || '_market', coalesce(place->>'market', route->>(side || '_market')),
        side || '_region', coalesce(place->>'region', route->>(side || '_region')));
    end loop;
    operation := case route->>'operation'
      when 'Intra-MX' then 'Intra-Mex' when 'US/CA Northbound' then 'US Northbound'
      when 'US/CA Southbound' then 'US Southbound' else nullif(route->>'operation', '') end;
    crossing := case route->>'border_crossing'
      when 'Laredo / Nuevo Laredo' then 'Nuevo Laredo / Laredo'
      when 'Pharr / Reynosa' then 'Reynosa / Pharr'
      when 'Brownsville / Matamoros' then 'Matamoros / Brownsville'
      when 'El Paso / Juarez' then 'Cd. Juarez / El Paso'
      when 'Eagle Pass / Piedras Negras' then 'Piedras Negras / Eagle Pass'
      when 'Del Rio / Ciudad Acuña' then 'Cd. Acuña / Del Rio'
      when 'Otay / Tijuana' then 'Tijuana / Otay Mesa'
      when 'Laredo / Colombia' then 'Colombia / Laredo'
      when 'Santa Teresa / Juarez' then 'Cd. Juarez / Santa Teresa'
      when 'Presidio / Ojinaga' then 'Ojinaga / Presidio'
      when 'Douglas / Agua Prieta' then 'Agua Prieta / Douglas'
      when 'Yuma / San Luis Rio Colorado' then 'San Luis Rio Colorado / San Luis'
      else nullif(route->>'border_crossing', '') end;
    mapped := mapped || jsonb_build_object('equipment', coalesce(route->>'truck_type', route->>'equipment_type', route->>'equipment'),
      'trailer', nullif(route->>'trailer_requirements', ''), 'config', nullif(route->>'config', ''),
      'service', nullif(route->>'service', ''), 'operation', operation, 'border_crossing', crossing,
      'crossing_model', nullif(route->>'crossing_model', ''), 'weight_lb', nullif(route->>'average_weight', '')::numeric,
      'notes', left(concat_ws(' · ',
        case when nullif(route->>'pickup_date', '') is not null then 'Carga: ' || (route->>'pickup_date') end,
        case when nullif(route->>'product', '') is not null then 'Producto: ' || (route->>'product') end,
        case when route->>'hazmat' = 'true' then 'Hazmat ' || coalesce(route->>'hazmat_un_number', '') end,
        case when nullif(route->>'packaging', '') is not null then 'Embalaje: ' || (route->>'packaging') ||
          coalesce(' (' || (route->>'pieces') || ' piezas)', '') end,
        case when nullif(route->>'cargo_value', '') is not null then 'Valor de factura: ' || coalesce(route->>'cargo_value_currency', 'USD') || ' ' || (route->>'cargo_value') end,
        case when nullif(route->>'temperature_range', '') is not null then 'Temperatura: ' || (route->>'temperature_range') end,
        case when nullif(route->>'target_rate', '') is not null then 'Tarifa objetivo del cliente: ' || (route->>'target_rate') end,
        (route->>'weekly_volume') || ' carga(s)', nullif(route->>'notes', '')), 2000));
    insert into public.quotedesk_quote_lanes (owner_email, owner_user_id, organization_id, quote_id, lane_number,
      origin, origin_city, origin_state, origin_country, origin_postal_code, origin_market, origin_region,
      destination, destination_city, destination_state, destination_country, destination_postal_code, destination_market, destination_region,
      equipment, trailer, config, service, operation, border_crossing, crossing_model, weight_lb, weekly_volume, notes, metadata)
    select p_owner_email, p_owner_user_id, p_organization_id, quote.id, route_number,
      lane.origin, lane.origin_city, lane.origin_state, lane.origin_country, lane.origin_postal_code, lane.origin_market, lane.origin_region,
      lane.destination, lane.destination_city, lane.destination_state, lane.destination_country, lane.destination_postal_code, lane.destination_market, lane.destination_region,
      lane.equipment, lane.trailer, lane.config, lane.service, lane.operation, lane.border_crossing, lane.crossing_model, lane.weight_lb, null,
      lane.notes, jsonb_build_object('source_project_id', project.id, 'source_submission_id', submission.id, 'source_lane', route)
    from jsonb_populate_record(null::public.quotedesk_quote_lanes, mapped) as lane;
  end loop;

  insert into public.quotedesk_spot_conversions (owner_email, source_project_id, submission_id, submission_updated_at,
    quote_id, original_lane_count, actor_email)
  values (p_owner_email, project.id, submission.id, submission.updated_at, quote.id, lane_count, p_actor_email);
  -- Compatibility display only: the receipt is authoritative, not this note.
  update public.rfx_projects set notes = concat_ws(E'\n', nullif(notes, ''), 'QuoteDesk ' || quote.folio || ' · ' || quote.id),
    updated_at = now() where id = project.id and owner_email = p_owner_email;
  insert into public.saas_audit_log (owner_user_id, owner_email, organization_id, actor_email, action, entity_type, entity_id, summary, metadata)
  values (p_owner_user_id, p_owner_email, p_organization_id, p_actor_email, 'quotedesk_spot_request_converted', 'quotedesk_quote', quote.id::text,
    'Converted submitted Spot request to ' || quote.folio,
    jsonb_build_object('source', 'quotedesk-api', 'source_project_id', project.id, 'submission_id', submission.id,
      'submission_updated_at', submission.updated_at, 'lane_count', lane_count));
  return jsonb_build_object('quote', jsonb_build_object('id', quote.id, 'folio', quote.folio),
    'source_project_id', project.id, 'lane_count', lane_count, 'replayed', false);
end;
$function$;
revoke all on function public.quotedesk_convert_spot_request(text, text, text, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.quotedesk_convert_spot_request(text, text, text, text, uuid, timestamptz) to service_role;
comment on function public.quotedesk_convert_spot_request(text, text, text, text, uuid, timestamptz) is
  'Internal service-role transaction. Edge authenticates actor/workspace and requires operate. No browser execution grant.';
commit;
