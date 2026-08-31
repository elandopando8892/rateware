alter table osp_private.gmail_messages
  add column if not exists sender_email text,
  add column if not exists internet_message_id text;

with unambiguous_provider_message as (
  select
    message.organization_id,
    message.external_message_id,
    min(lower(btrim(message.sender_email))) as sender_email,
    min(btrim(message.internet_message_id)) as internet_message_id
  from public.provider_communication_messages message
  where message.channel = 'email'
    and message.sender_email is not null
    and char_length(btrim(message.sender_email)) between 3 and 254
    and lower(btrim(message.sender_email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and message.internet_message_id is not null
    and char_length(btrim(message.internet_message_id)) between 5 and 998
    and btrim(message.internet_message_id) ~ '^<[^<>[:space:]@]+@[A-Za-z0-9.-]+>$'
  group by message.organization_id, message.external_message_id
  having count(distinct lower(btrim(message.sender_email))) = 1
    and count(distinct btrim(message.internet_message_id)) = 1
)
update osp_private.gmail_messages gmail
set sender_email = coalesce(gmail.sender_email, source.sender_email),
    internet_message_id = coalesce(
      gmail.internet_message_id,
      source.internet_message_id
    )
from unambiguous_provider_message source
where source.organization_id = gmail.organization_id
  and source.external_message_id = gmail.gmail_message_id
  and (gmail.sender_email is null or gmail.sender_email = source.sender_email)
  and (
    gmail.internet_message_id is null
    or gmail.internet_message_id = source.internet_message_id
  )
  and (gmail.sender_email is null or gmail.internet_message_id is null);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'osp_private.gmail_messages'::regclass
      and conname = 'osp_gmail_messages_sender_email_check'
  ) then
    alter table osp_private.gmail_messages
      add constraint osp_gmail_messages_sender_email_check
      check (
        sender_email is null
        or (
          sender_email = lower(btrim(sender_email))
          and char_length(sender_email) between 3 and 254
          and sender_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        )
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'osp_private.gmail_messages'::regclass
      and conname = 'osp_gmail_messages_internet_message_id_check'
  ) then
    alter table osp_private.gmail_messages
      add constraint osp_gmail_messages_internet_message_id_check
      check (
        internet_message_id is null
        or (
          internet_message_id = btrim(internet_message_id)
          and char_length(internet_message_id) between 5 and 998
          and internet_message_id ~ '^<[^<>[:space:]@]+@[A-Za-z0-9.-]+>$'
        )
      ) not valid;
  end if;
end
$$;

alter table osp_private.gmail_messages
  validate constraint osp_gmail_messages_sender_email_check;

alter table osp_private.gmail_messages
  validate constraint osp_gmail_messages_internet_message_id_check;

create or replace function osp_private.resolve_authorized_send_thread(
  p_organization_id uuid,
  p_attempt_id uuid,
  p_job_id uuid,
  p_send_claim_token uuid
)
returns table (payload_kind text, gmail_thread_id text)
language sql
stable
security definer
set search_path = pg_catalog, osp_private
as $$
  select payload.payload_kind, source.gmail_thread_id
  from osp_private.outbound_send_attempts attempt
  join osp_private.outbound_payloads payload
    on payload.organization_id = attempt.organization_id
   and payload.case_id = attempt.case_id
   and payload.id = attempt.payload_id
  join osp_private.outbound_drafts draft
    on draft.organization_id = payload.organization_id
   and draft.case_id = payload.case_id
   and draft.id = payload.draft_id
  left join osp_private.gmail_messages source
    on source.organization_id = draft.organization_id
   and source.case_id = draft.case_id
   and source.internet_message_id = draft.in_reply_to
  where attempt.organization_id = p_organization_id
    and attempt.id = p_attempt_id
    and attempt.job_id = p_job_id
    and attempt.outcome = 'sending'
    and attempt.send_claim_token = p_send_claim_token
  order by source.received_at asc nulls last,
           source.created_at asc nulls last,
           source.id asc nulls last
  limit 2
$$;

revoke all on function osp_private.resolve_authorized_send_thread(
  uuid, uuid, uuid, uuid
) from public, anon, authenticated, osp_workflow_api;
grant execute on function osp_private.resolve_authorized_send_thread(
  uuid, uuid, uuid, uuid
) to osp_worker;
