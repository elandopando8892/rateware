-- Build 15: private operational Communications Inbox for Provider Service.
-- Thread summary stays sanitized; message bodies are never projected by this view.

create or replace view public.provider_service_communications_inbox as
with base as (
  select
    inbox.organization_id,
    registry.organization_id as workspace_id,
    inbox.id as thread_id,
    inbox.legal_entity_id,
    entity.entity_code as legal_entity_code,
    entity.legal_name as legal_entity_name,
    inbox.provider_relationship_id,
    relationship.vendor_id,
    relationship.vendor_code,
    vendor.vendor_name,
    vendor.legal_name as vendor_legal_name,
    inbox.channel,
    inbox.mailbox_reference,
    inbox.subject,
    inbox.communication_status,
    inbox.matching_status,
    inbox.match_method,
    inbox.assigned_to_user_id,
    inbox.needs_reply,
    inbox.first_message_at,
    inbox.last_message_at,
    inbox.last_inbound_at,
    inbox.last_outbound_at,
    inbox.resolved_at,
    inbox.queue_code,
    inbox.updated_at,
    coalesce(messages.message_count, 0)::integer as message_count,
    coalesce(attachments.attachment_count, 0)::integer as attachment_count,
    coalesce(cases.case_count, 0)::integer as case_count,
    coalesce(candidates.candidate_count, 0)::integer as candidate_count,
    case
      when inbox.queue_code = 'unmatched' then 10
      when inbox.queue_code = 'needs_review' then 20
      when inbox.queue_code = 'needs_reply' or inbox.needs_reply then 30
      when inbox.queue_code = 'waiting_xbf' then 40
      when inbox.queue_code in ('waiting_provider', 'waiting_external') then 50
      when inbox.queue_code = 'active' then 60
      else 90
    end as priority_rank
  from public.provider_communication_inbox inbox
  join public.workspace_registry registry
    on registry.organization_uuid = inbox.organization_id
  join public.legal_entities entity
    on entity.organization_id = inbox.organization_id
   and entity.id = inbox.legal_entity_id
  left join public.provider_relationships relationship
    on relationship.organization_id = inbox.organization_id
   and relationship.id = inbox.provider_relationship_id
   and relationship.legal_entity_id = inbox.legal_entity_id
  left join public.vendors vendor
    on vendor.id = relationship.vendor_id
   and vendor.organization_id = registry.organization_id
  left join lateral (
    select count(*) as message_count
    from public.provider_communication_messages message
    where message.organization_id = inbox.organization_id
      and message.thread_id = inbox.id
  ) messages on true
  left join lateral (
    select count(*) as attachment_count
    from public.provider_communication_attachments attachment
    join public.provider_communication_messages message
      on message.organization_id = attachment.organization_id
     and message.id = attachment.message_id
    where attachment.organization_id = inbox.organization_id
      and message.thread_id = inbox.id
  ) attachments on true
  left join lateral (
    select count(*) filter (where link.status = 'active') as case_count
    from public.provider_communication_case_links link
    where link.organization_id = inbox.organization_id
      and link.thread_id = inbox.id
  ) cases on true
  left join lateral (
    select count(*) filter (where candidate.candidate_status = 'candidate') as candidate_count
    from public.provider_communication_match_candidates candidate
    where candidate.organization_id = inbox.organization_id
      and candidate.thread_id = inbox.id
  ) candidates on true
)
select
  base.*,
  count(*) over (partition by organization_id)::integer as total_threads,
  count(*) filter (where queue_code = 'unmatched') over (partition by organization_id)::integer as unmatched_threads,
  count(*) filter (where queue_code = 'needs_review') over (partition by organization_id)::integer as review_threads,
  count(*) filter (where needs_reply or queue_code = 'needs_reply') over (partition by organization_id)::integer as needs_reply_threads,
  count(*) filter (where queue_code = 'waiting_xbf') over (partition by organization_id)::integer as waiting_xbf_threads,
  count(*) filter (where queue_code in ('waiting_provider', 'waiting_external')) over (partition by organization_id)::integer as waiting_external_threads,
  count(*) filter (where queue_code = 'resolved') over (partition by organization_id)::integer as resolved_threads
from base;

revoke all on table public.provider_service_communications_inbox from public, anon, authenticated, service_role;
grant select on table public.provider_service_communications_inbox to service_role;

comment on view public.provider_service_communications_inbox is
  'Build 15 private Provider Service communications queue. Excludes message bodies, recipient lists, tokens, banking data, tax identifiers, storage paths, hashes and unrestricted metadata.';
