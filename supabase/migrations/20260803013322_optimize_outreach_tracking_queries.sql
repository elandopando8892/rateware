create or replace function public.rateware_outreach_tracking_state_sql(
  p_status text,
  p_provider_response_status text,
  p_delivery_error text,
  p_metadata jsonb,
  p_invitation_status text,
  p_bid_rate numeric,
  p_responded_at timestamptz
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  with signal as (
    select lower(concat_ws(
      ' ',
      coalesce(p_status, ''),
      coalesce(p_provider_response_status, ''),
      coalesce(p_delivery_error, ''),
      coalesce(p_metadata ->> 'delivery_status', ''),
      coalesce(p_metadata ->> 'provider_response_status', ''),
      coalesce(p_metadata ->> 'last_event', '')
    )) as value
  )
  select case
    when p_bid_rate is not null and p_bid_rate > 0 then 'quoted'
    when value ~ 'archived' then 'archived'
    when value ~ 'suppressed|do_not_contact|do-not-contact|blocked contact' then 'suppressed'
    when value ~ 'bounc|mailer-daemon|undeliverable' then 'bounced'
    when value ~ 'failed|error|rejected' then 'failed'
    when lower(coalesce(p_invitation_status, '')) = any(array['replied','responded','quoted','bid_submitted','awarded','award_pending'])
      or p_responded_at is not null
      or value ~ 'replied|responded'
      then 'replied'
    when value ~ 'manual_sent' then 'manual_sent'
    when value ~ 'delivery_unknown' then 'delivery_unknown'
    when value ~ 'read' then 'read'
    when value ~ 'delivered' then 'delivered'
    when value ~ 'sending' then 'sending'
    when value ~ 'queued' then 'queued'
    when value ~ 'sent|accepted' then 'sent'
    else 'drafted'
  end
  from signal;
$$;

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
  with candidates as materialized (
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
    where om.owner_email = p_owner_email
      and (p_rfx_event_id is null or om.rfx_event_id = p_rfx_event_id)
      and (coalesce(cardinality(p_channels), 0) = 0 or om.channel = any(p_channels))
      and (p_include_archived or lower(coalesce(om.status, '')) <> 'archived')
      and (
        not p_enforce_event_scope
        or p_rfx_event_id is null
        or exists (
          select 1
          from public.rfx_lane_vendors active
          where active.rfx_event_id = p_rfx_event_id
            and (
              active.id = om.rfx_lane_vendor_id
              or (
                case
                  when jsonb_typeof(om.metadata -> 'rfx_lane_vendor_ids') = 'array'
                    then om.metadata -> 'rfx_lane_vendor_ids'
                  else '[]'::jsonb
                end
              ) ? active.id::text
              or (
                om.rfx_lane_vendor_id is null
                and jsonb_array_length(
                  case
                    when jsonb_typeof(om.metadata -> 'rfx_lane_vendor_ids') = 'array'
                      then om.metadata -> 'rfx_lane_vendor_ids'
                    else '[]'::jsonb
                  end
                ) = 0
                and active.vendor_id = om.vendor_id
              )
            )
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
  with classified as materialized (
    select
      om.id,
      om.status,
      om.vendor_id,
      om.recipient_email,
      om.recipient_phone,
      om.next_action,
      om.outcome_reason,
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
    where om.owner_email = p_owner_email
      and (p_rfx_event_id is null or om.rfx_event_id = p_rfx_event_id)
      and (coalesce(cardinality(p_channels), 0) = 0 or om.channel = any(p_channels))
      and (p_include_archived or lower(coalesce(om.status, '')) <> 'archived')
      and (
        not p_enforce_event_scope
        or p_rfx_event_id is null
        or exists (
          select 1
          from public.rfx_lane_vendors active
          where active.rfx_event_id = p_rfx_event_id
            and (
              active.id = om.rfx_lane_vendor_id
              or (
                case
                  when jsonb_typeof(om.metadata -> 'rfx_lane_vendor_ids') = 'array'
                    then om.metadata -> 'rfx_lane_vendor_ids'
                  else '[]'::jsonb
                end
              ) ? active.id::text
              or (
                om.rfx_lane_vendor_id is null
                and jsonb_array_length(
                  case
                    when jsonb_typeof(om.metadata -> 'rfx_lane_vendor_ids') = 'array'
                      then om.metadata -> 'rfx_lane_vendor_ids'
                    else '[]'::jsonb
                  end
                ) = 0
                and active.vendor_id = om.vendor_id
              )
            )
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
      coalesce(
        'vendor:' || vendor_id::text,
        'email:' || nullif(lower(trim(recipient_email)), ''),
        'phone:' || nullif(regexp_replace(coalesce(recipient_phone, ''), '[^0-9]+', '', 'g'), ''),
        'message:' || id::text
      ) as carrier_key,
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
  ),
  action_counts as (
    select
      coalesce(
        nullif(trim(next_action), ''),
        case
          when lower(coalesce(status, '')) = 'archived' then 'No action'
          when tracking_state = 'bounced' then 'Replace contact'
          when tracking_state = 'suppressed' then 'Keep suppressed'
          when tracking_state = 'failed' then 'Review delivery failure'
          when tracking_state = 'replied' then 'Review reply'
          when tracking_state = 'quoted' then 'Review quote'
          when tracking_state = 'delivery_unknown' then 'Review delivery status'
          when tracking_state = any(array['sent','delivered','read','manual_sent']) then 'Await response'
          when lower(coalesce(status, '')) = any(array['queued','sending']) then 'Wait for delivery result'
          else 'Review and send'
        end
      ) as label,
      count(*)::bigint as count
    from classified
    group by 1
  ),
  outcome_counts as (
    select
      coalesce(
        nullif(trim(outcome_reason), ''),
        case
          when tracking_state = 'bounced' then 'Delivery bounced or address is no longer valid'
          when tracking_state = 'suppressed' then 'Contact is suppressed and should not receive outreach'
          when tracking_state = 'failed' then 'Provider rejected or failed to deliver the message'
          when tracking_state = 'quoted' then 'Carrier submitted a bid'
          when tracking_state = 'replied' then 'Carrier replied'
          when tracking_state = 'read' then 'Carrier opened the WhatsApp message; awaiting carrier response'
          when tracking_state = 'manual_sent' then 'Marked manually sent; awaiting carrier response'
          when tracking_state = 'delivery_unknown' then 'Provider accepted the attempt, but delivery is not confirmed'
          when tracking_state = any(array['sent','delivered']) then 'Delivered to provider; awaiting carrier response'
          when lower(coalesce(status, '')) = any(array['queued','sending']) then 'Queued for the selected channel'
          else 'Eligible contact ready for review'
        end
      ) as label,
      count(*)::bigint as count
    from classified
    group by 1
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
    'next_actions', coalesce((select jsonb_object_agg(label, count) from action_counts), '{}'::jsonb),
    'outcomes', coalesce((select jsonb_object_agg(label, count) from outcome_counts), '{}'::jsonb)
  );
$$;

revoke all on function public.rateware_outreach_tracking_state_sql(text, text, text, jsonb, text, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public.rateware_outreach_tracking_page(text, uuid, text[], text, text[], boolean, boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.rateware_outreach_tracking_summary(text, uuid, text[], boolean, boolean) from public, anon, authenticated;

grant execute on function public.rateware_outreach_tracking_state_sql(text, text, text, jsonb, text, numeric, timestamptz) to service_role;
grant execute on function public.rateware_outreach_tracking_page(text, uuid, text[], text, text[], boolean, boolean, integer, integer) to service_role;
grant execute on function public.rateware_outreach_tracking_summary(text, uuid, text[], boolean, boolean) to service_role;
