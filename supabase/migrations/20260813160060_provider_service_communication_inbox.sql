create or replace view public.provider_communication_inbox
with (security_invoker = true)
as
select t.*,
  case
    when t.matching_status = 'unmatched' then 'unmatched'
    when t.matching_status in ('candidate', 'needs_review') then 'needs_review'
    when t.communication_status = 'waiting_provider' then 'waiting_provider'
    when t.communication_status = 'waiting_xbf' then 'waiting_xbf'
    when t.communication_status = 'waiting_external' then 'waiting_external'
    when t.needs_reply then 'needs_reply'
    when t.communication_status in ('resolved', 'archived') then 'resolved'
    else 'active'
  end as queue_code
from public.provider_communication_threads t;
