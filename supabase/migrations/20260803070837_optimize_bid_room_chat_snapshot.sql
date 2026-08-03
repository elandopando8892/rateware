create or replace function public.rateware_bid_room_chat_snapshot(
  p_owner_email text,
  p_rfx_event_id uuid,
  p_thread_type text default null,
  p_rfx_lane_id uuid default null,
  p_vendor_id uuid default null,
  p_message_limit integer default 500,
  p_google_chat_account text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
  with owned_event as (
    select event_row.*
    from public.rfx_events as event_row
    where event_row.id = p_rfx_event_id
      and event_row.owner_email = p_owner_email
    limit 1
  ),
  selected_threads as (
    select
      thread_row.id,
      thread_row.updated_at,
      jsonb_build_object(
        'id', thread_row.id,
        'created_at', thread_row.created_at,
        'updated_at', thread_row.updated_at,
        'owner_email', thread_row.owner_email,
        'rfx_event_id', thread_row.rfx_event_id,
        'rfx_lane_id', thread_row.rfx_lane_id,
        'vendor_id', thread_row.vendor_id,
        'thread_type', thread_row.thread_type,
        'title', thread_row.title,
        'status', thread_row.status,
        'google_chat_space', thread_row.google_chat_space,
        'google_chat_thread_key', thread_row.google_chat_thread_key,
        'google_chat_sync_status', thread_row.google_chat_sync_status,
        'metadata', thread_row.metadata,
        'google_chat_thread_name', thread_row.google_chat_thread_name,
        'communication_status', thread_row.communication_status,
        'needs_reply', thread_row.needs_reply,
        'read_status', thread_row.read_status,
        'assigned_to', thread_row.assigned_to,
        'internal_note', thread_row.internal_note,
        'last_read_at', thread_row.last_read_at,
        'resolved_at', thread_row.resolved_at,
        'resolved_by', thread_row.resolved_by,
        'last_action_at', thread_row.last_action_at,
        'vendors', case
          when vendor_row.id is null then null
          else jsonb_build_object('vendor_name', vendor_row.vendor_name, 'domain', vendor_row.domain)
        end,
        'rfx_lanes', case
          when lane_row.id is null then null
          else jsonb_build_object(
            'lane_number', lane_row.lane_number,
            'origin', lane_row.origin,
            'destination', lane_row.destination
          )
        end
      ) as payload
    from public.bid_room_chat_threads as thread_row
    join owned_event as event_row
      on event_row.id = thread_row.rfx_event_id
    left join public.vendors as vendor_row
      on vendor_row.id = thread_row.vendor_id
      and vendor_row.owner_email = p_owner_email
    left join public.rfx_lanes as lane_row
      on lane_row.id = thread_row.rfx_lane_id
      and lane_row.rfx_event_id = event_row.id
    where thread_row.owner_email = p_owner_email
      and thread_row.status <> 'archived'
      and (p_thread_type is null or thread_row.thread_type = p_thread_type)
      and (p_rfx_lane_id is null or thread_row.rfx_lane_id = p_rfx_lane_id)
      and (p_vendor_id is null or thread_row.vendor_id = p_vendor_id)
  ),
  limited_messages as (
    select
      message_row.created_at,
      message_row.id,
      jsonb_build_object(
        'id', message_row.id,
        'created_at', message_row.created_at,
        'thread_id', message_row.thread_id,
        'rfx_event_id', message_row.rfx_event_id,
        'rfx_lane_id', message_row.rfx_lane_id,
        'vendor_id', message_row.vendor_id,
        'sender_role', message_row.sender_role,
        'sender_name', message_row.sender_name,
        'sender_email', message_row.sender_email,
        'body', message_row.body,
        'google_chat_message_name', message_row.google_chat_message_name,
        'google_chat_sync_status', message_row.google_chat_sync_status,
        'metadata', message_row.metadata,
        'google_chat_sender_name', message_row.google_chat_sender_name,
        'vendors', case
          when vendor_row.id is null then null
          else jsonb_build_object('vendor_name', vendor_row.vendor_name, 'domain', vendor_row.domain)
        end
      ) as payload
    from public.bid_room_chat_messages as message_row
    join selected_threads as selected_thread
      on selected_thread.id = message_row.thread_id
    left join public.vendors as vendor_row
      on vendor_row.id = message_row.vendor_id
      and vendor_row.owner_email = p_owner_email
    where message_row.owner_email = p_owner_email
      and message_row.rfx_event_id = p_rfx_event_id
    order by message_row.created_at desc, message_row.id desc
    limit greatest(50, least(coalesce(p_message_limit, 500), 1000))
  )
  select jsonb_build_object(
    'event', (select to_jsonb(event_row) from owned_event as event_row),
    'threads', coalesce(
      (select jsonb_agg(selected_thread.payload order by selected_thread.updated_at desc)
       from selected_threads as selected_thread),
      '[]'::jsonb
    ),
    'messages', coalesce(
      (select jsonb_agg(message_row.payload order by message_row.created_at desc, message_row.id desc)
       from limited_messages as message_row),
      '[]'::jsonb
    ),
    'google_chat_connection_configured', exists (
      select 1
      from public.google_chat_connections as connection_row
      where connection_row.owner_email = p_owner_email
        and connection_row.account_email = p_google_chat_account
        and connection_row.status = 'connected'
        and connection_row.default_space_name is not null
    ),
    'message_limit', greatest(50, least(coalesce(p_message_limit, 500), 1000)),
    'messages_limited', (
      select count(*) >= greatest(50, least(coalesce(p_message_limit, 500), 1000))
      from limited_messages
    )
  );
$function$;

revoke all on function public.rateware_bid_room_chat_snapshot(text, uuid, text, uuid, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.rateware_bid_room_chat_snapshot(text, uuid, text, uuid, uuid, integer, text)
  to service_role;

comment on function public.rateware_bid_room_chat_snapshot(text, uuid, text, uuid, uuid, integer, text)
  is 'Backend-only workspace-scoped Bid Room event, thread, message, and Google Chat snapshot.';
