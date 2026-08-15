create or replace view public.provider_compliance_relationship_status
with (security_invoker=true)
as
with latest as (
  select distinct on (e.organization_id,e.provider_relationship_id)
    e.*
  from public.provider_compliance_evaluations e
  where e.status in ('review_required','compliant','non_compliant','error')
  order by e.organization_id,e.provider_relationship_id,coalesce(e.completed_at,e.created_at) desc,e.id desc
)
select latest.*,
  case
    when latest.valid_until is not null and latest.valid_until <= current_timestamp then 'expired'
    else latest.status
  end as effective_status,
  (
    latest.status='non_compliant'
    or (latest.valid_until is not null and latest.valid_until <= current_timestamp)
  ) as hold_recommended
from latest;
