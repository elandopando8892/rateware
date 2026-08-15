create or replace view public.provider_approval_queue
with (security_invoker = true)
as
select a.*,
  case
    when a.status = 'requested' and a.expires_at is not null and a.expires_at <= current_timestamp then 'expired'
    else a.status
  end as effective_status,
  case a.approval_mode
    when 'executive' then 40
    when 'legal' then 30
    when 'finance' then 20
    else 10
  end as queue_priority
from public.provider_approval_requests a
where a.status in ('requested','approved');
