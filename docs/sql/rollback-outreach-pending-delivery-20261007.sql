-- Guarded rollback of exactly this candidate. No customer row writes.
BEGIN;
DO $guard$
BEGIN
  IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rateware_outreach_tracking_page' AND pg_get_function_identity_arguments(p.oid)='p_owner_email text, p_rfx_event_id uuid, p_channels text[], p_tracking_status text, p_search_terms text[], p_include_archived boolean, p_enforce_event_scope boolean, p_offset integer, p_limit integer') IS DISTINCT FROM '20829e25be87091a5c2e767a8a374db6' THEN RAISE EXCEPTION 'Function drift: rateware_outreach_tracking_page'; END IF;
  IF (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rateware_outreach_tracking_summary' AND pg_get_function_identity_arguments(p.oid)='p_owner_email text, p_rfx_event_id uuid, p_channels text[], p_include_archived boolean, p_enforce_event_scope boolean') IS DISTINCT FROM '389433144a3402e8eb081f65de4fad9d' THEN RAISE EXCEPTION 'Function drift: rateware_outreach_tracking_summary'; END IF;
END;
$guard$;
CREATE OR REPLACE FUNCTION public.rateware_outreach_tracking_page(p_owner_email text, p_rfx_event_id uuid DEFAULT NULL::uuid, p_channels text[] DEFAULT NULL::text[], p_tracking_status text DEFAULT NULL::text, p_search_terms text[] DEFAULT NULL::text[], p_include_archived boolean DEFAULT false, p_enforce_event_scope boolean DEFAULT false, p_offset integer DEFAULT 0, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
      ), 'ÃÃ‰ÃÃ“ÃšÃœÃ‘Ã¡Ã©Ã­Ã³ÃºÃ¼Ã±', 'AEIOUUNaeiouun')) as search_text
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
          where search_text not like '%' || lower(translate(term, 'ÃÃ‰ÃÃ“ÃšÃœÃ‘Ã¡Ã©Ã­Ã³ÃºÃ¼Ã±', 'AEIOUUNaeiouun')) || '%'
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
$function$
;
CREATE OR REPLACE FUNCTION public.rateware_outreach_tracking_summary(p_owner_email text, p_rfx_event_id uuid DEFAULT NULL::uuid, p_channels text[] DEFAULT NULL::text[], p_include_archived boolean DEFAULT true, p_enforce_event_scope boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$
;
DROP FUNCTION public.rateware_outreach_delivery_state_sql(text,text,text,jsonb,text,numeric,timestamp with time zone,boolean);
COMMIT;
