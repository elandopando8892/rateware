create or replace function public.rateware_outreach_tracking_page(
  p_owner_email text,
  p_rfx_event_id uuid default null,
  p_channels text[] default null,
  p_tracking_status text default null,
  p_search_terms text[] default null,
  p_include_archived boolean default false,
  p_enforce_event_scope boolean default false,
  p_offset integer default 0,
  p_limit integer default 100
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with scope as materialized (
    select
      coalesce(array_agg(id), '{}'::uuid[]) as invitation_ids,
      coalesce(array_agg(id::text), '{}'::text[]) as invitation_id_texts,
      coalesce(array_agg(distinct vendor_id) filter (where vendor_id is not null), '{}'::uuid[]) as vendor_ids
    from public.rfx_lane_vendors
    where rfx_event_id = p_rfx_event_id
  ),
  candidates as materialized (
    select
      om.id,
      om.created_at,
      public.rateware_outreach_tracking_state_sql(
        om.status,
        om.provider_response_status,
        om.delivery_error,
        om.metadata,
        linked.invitation_status,
        linked.bid_rate,
        linked.responded_at
      ) as tracking_state,
      lower(translate(concat_ws(
        ' ',
        om.recipient_email,
        om.recipient_phone,
        om.subject,
        om.status,
        om.channel,
        om.metadata ->> 'vendor_name',
        om.metadata ->> 'vendor_domain',
        om.metadata ->> 'contact_name',
        om.metadata ->> 'recipient_email',
        om.metadata ->> 'lane_rows_text',
        om.metadata ->> 'event_name',
        om.metadata ->> 'rfx_id',
        vendor.vendor_name,
        vendor.domain,
        vendor.primary_email,
        lane.origin,
        lane.destination,
        event.rfx_id,
        event.name,
        linked.invitation_status
      ), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) as search_text
    from public.outreach_messages om
    left join public.rfx_lane_vendors linked on linked.id = om.rfx_lane_vendor_id
    left join public.vendors vendor on vendor.id = om.vendor_id
    left join public.rfx_lanes lane on lane.id = om.rfx_lane_id
    left join public.rfx_events event on event.id = om.rfx_event_id
    cross join scope
    where om.owner_email = p_owner_email
      and (p_rfx_event_id is null or om.rfx_event_id = p_rfx_event_id)
      and (coalesce(cardinality(p_channels), 0) = 0 or om.channel = any(p_channels))
      and (p_include_archived or lower(coalesce(om.status, '')) <> 'archived')
      and (
        not p_enforce_event_scope
        or p_rfx_event_id is null
        or om.rfx_lane_vendor_id = any(scope.invitation_ids)
        or (
          case
            when jsonb_typeof(om.metadata -> 'rfx_lane_vendor_ids') = 'array'
              then om.metadata -> 'rfx_lane_vendor_ids'
            else '[]'::jsonb
          end
        ) ?| scope.invitation_id_texts
        or (
          om.rfx_lane_vendor_id is null
          and jsonb_array_length(
            case
              when jsonb_typeof(om.metadata -> 'rfx_lane_vendor_ids') = 'array'
                then om.metadata -> 'rfx_lane_vendor_ids'
              else '[]'::jsonb
            end
          ) = 0
          and om.vendor_id = any(scope.vendor_ids)
        )
      )
  ),
  filtered as materialized (
    select id, created_at, tracking_state
    from candidates
    where (p_tracking_status is null or tracking_state = lower(p_tracking_status))
      and (
        coalesce(cardinality(p_search_terms), 0) = 0
        or not exists (
          select 1
          from unnest(p_search_terms) term
          where search_text not like '%' || lower(translate(term, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) || '%'
        )
      )
  ),
  page as (
    select id, created_at
    from filtered
    order by created_at desc, id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 100), 25), 250)
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id order by created_at desc, id desc) from page), '[]'::jsonb),
    'total', (select count(*) from filtered)
  );
$$;

revoke all on function public.rateware_outreach_tracking_page(text, uuid, text[], text, text[], boolean, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.rateware_outreach_tracking_page(text, uuid, text[], text, text[], boolean, boolean, integer, integer) to service_role;
