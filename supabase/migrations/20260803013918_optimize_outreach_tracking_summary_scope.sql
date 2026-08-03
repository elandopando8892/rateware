create or replace function public.rateware_outreach_tracking_summary(
  p_owner_email text,
  p_rfx_event_id uuid default null,
  p_channels text[] default null,
  p_include_archived boolean default true,
  p_enforce_event_scope boolean default false
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
  classified as materialized (
    select
      om.id,
      om.vendor_id,
      om.recipient_email,
      om.recipient_phone,
      public.rateware_outreach_tracking_state_sql(
        om.status,
        om.provider_response_status,
        om.delivery_error,
        om.metadata,
        linked.invitation_status,
        linked.bid_rate,
        linked.responded_at
      ) as tracking_state
    from public.outreach_messages om
    left join public.rfx_lane_vendors linked on linked.id = om.rfx_lane_vendor_id
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
  state_counts as (
    select tracking_state, count(*)::bigint as count
    from classified
    group by tracking_state
  ),
  carrier_ranked as (
    select
      tracking_state,
      row_number() over (
        partition by coalesce(
          'vendor:' || vendor_id::text,
          'email:' || nullif(lower(trim(recipient_email)), ''),
          'phone:' || nullif(regexp_replace(coalesce(recipient_phone, ''), '[^0-9]+', '', 'g'), ''),
          'message:' || id::text
        )
        order by case tracking_state
          when 'quoted' then 90
          when 'replied' then 80
          when 'failed' then 70
          when 'bounced' then 70
          when 'suppressed' then 65
          when 'read' then 60
          when 'delivered' then 50
          when 'manual_sent' then 50
          when 'sent' then 40
          when 'delivery_unknown' then 35
          when 'sending' then 30
          when 'queued' then 20
          when 'drafted' then 10
          else 0
        end desc
      ) as position
    from classified
  ),
  carrier_counts as (
    select tracking_state, count(*)::bigint as count
    from carrier_ranked
    where position = 1
    group by tracking_state
  )
  select jsonb_build_object(
    'total', (select count(*) from classified),
    'states', jsonb_build_object(
      'drafted', coalesce((select count from state_counts where tracking_state = 'drafted'), 0),
      'queued', coalesce((select count from state_counts where tracking_state = 'queued'), 0),
      'sending', coalesce((select count from state_counts where tracking_state = 'sending'), 0),
      'sent', coalesce((select count from state_counts where tracking_state = 'sent'), 0),
      'delivered', coalesce((select count from state_counts where tracking_state = 'delivered'), 0),
      'read', coalesce((select count from state_counts where tracking_state = 'read'), 0),
      'manual_sent', coalesce((select count from state_counts where tracking_state = 'manual_sent'), 0),
      'delivery_unknown', coalesce((select count from state_counts where tracking_state = 'delivery_unknown'), 0),
      'failed', coalesce((select count from state_counts where tracking_state = 'failed'), 0),
      'replied', coalesce((select count from state_counts where tracking_state = 'replied'), 0),
      'quoted', coalesce((select count from state_counts where tracking_state = 'quoted'), 0),
      'bounced', coalesce((select count from state_counts where tracking_state = 'bounced'), 0),
      'suppressed', coalesce((select count from state_counts where tracking_state = 'suppressed'), 0),
      'archived', coalesce((select count from state_counts where tracking_state = 'archived'), 0)
    ),
    'carrier_total', (select count(*) from carrier_ranked where position = 1),
    'carrier_states', jsonb_build_object(
      'drafted', coalesce((select count from carrier_counts where tracking_state = 'drafted'), 0),
      'queued', coalesce((select count from carrier_counts where tracking_state = 'queued'), 0),
      'sending', coalesce((select count from carrier_counts where tracking_state = 'sending'), 0),
      'sent', coalesce((select count from carrier_counts where tracking_state = 'sent'), 0),
      'delivered', coalesce((select count from carrier_counts where tracking_state = 'delivered'), 0),
      'read', coalesce((select count from carrier_counts where tracking_state = 'read'), 0),
      'manual_sent', coalesce((select count from carrier_counts where tracking_state = 'manual_sent'), 0),
      'delivery_unknown', coalesce((select count from carrier_counts where tracking_state = 'delivery_unknown'), 0),
      'failed', coalesce((select count from carrier_counts where tracking_state = 'failed'), 0),
      'replied', coalesce((select count from carrier_counts where tracking_state = 'replied'), 0),
      'quoted', coalesce((select count from carrier_counts where tracking_state = 'quoted'), 0),
      'bounced', coalesce((select count from carrier_counts where tracking_state = 'bounced'), 0),
      'suppressed', coalesce((select count from carrier_counts where tracking_state = 'suppressed'), 0),
      'archived', coalesce((select count from carrier_counts where tracking_state = 'archived'), 0)
    ),
    'next_actions', '{}'::jsonb,
    'outcomes', '{}'::jsonb
  );
$$;

revoke all on function public.rateware_outreach_tracking_summary(text, uuid, text[], boolean, boolean) from public, anon, authenticated;
grant execute on function public.rateware_outreach_tracking_summary(text, uuid, text[], boolean, boolean) to service_role;
