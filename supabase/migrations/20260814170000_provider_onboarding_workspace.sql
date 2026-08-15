-- Build 30: sanitized Provider Onboarding workspace read model.
create or replace view public.provider_onboarding_workspace
with (security_invoker = true)
as
select
  c.id,
  c.organization_id,
  c.legal_entity_id,
  c.program_code,
  c.jurisdiction_code,
  c.legal_entity_kind,
  c.case_status,
  c.revision,
  c.owner_user_id,
  c.due_at,
  c.ready_at,
  c.opened_at,
  c.updated_at,
  coalesce(t.open_tasks,0)::integer as open_task_count,
  coalesce(t.blocking_tasks,0)::integer as blocking_task_count,
  coalesce(t.overdue_tasks,0)::integer as overdue_task_count,
  p.id as latest_package_id,
  p.package_status as latest_package_status,
  p.required_approval_count,
  coalesce(pa.approval_count,0)::integer as approval_count,
  a.id as latest_assembly_id,
  a.assembly_status as latest_assembly_status,
  m.id as latest_message_id,
  m.message_status as latest_message_status,
  m.followup_number,
  m.next_followup_at,
  count(*) over (partition by c.organization_id)::integer as total_cases,
  count(*) filter (where c.case_status='blocked') over (partition by c.organization_id)::integer as blocked_cases,
  count(*) filter (where c.case_status='ready_for_approval') over (partition by c.organization_id)::integer as approval_cases,
  count(*) filter (where coalesce(t.overdue_tasks,0)>0) over (partition by c.organization_id)::integer as overdue_cases
from public.provider_onboarding_cases c
left join lateral (
  select
    count(*) filter (where task_status in ('open','in_progress')) as open_tasks,
    count(*) filter (where blocking and task_status in ('open','in_progress')) as blocking_tasks,
    count(*) filter (where due_at<now() and task_status in ('open','in_progress')) as overdue_tasks
  from public.provider_onboarding_case_tasks t
  where t.organization_id=c.organization_id and t.case_id=c.id
) t on true
left join lateral (
  select id,package_status,required_approval_count
  from public.provider_onboarding_release_packages p
  where p.organization_id=c.organization_id and p.case_id=c.id
  order by p.package_version desc limit 1
) p on true
left join lateral (
  select count(*) filter (where decision='approved') as approval_count
  from public.provider_onboarding_release_package_approvals pa
  where pa.organization_id=c.organization_id and pa.package_id=p.id
) pa on true
left join lateral (
  select id,assembly_status
  from public.provider_onboarding_form_assemblies a
  where a.organization_id=c.organization_id and a.package_id=p.id
  order by a.requested_at desc limit 1
) a on true
left join lateral (
  select id,message_status,followup_number,next_followup_at
  from public.provider_onboarding_outbound_messages m
  where m.organization_id=c.organization_id and m.case_id=c.id
  order by m.created_at desc limit 1
) m on true;

revoke all on public.provider_onboarding_workspace from public,anon,authenticated;
grant select on public.provider_onboarding_workspace to service_role;

comment on view public.provider_onboarding_workspace is
'Sanitized service-role read model for the private Rateware onboarding workspace; excludes fact values, document paths, hashes, signature assets, message bodies, recipients, and mailbox addresses.';
