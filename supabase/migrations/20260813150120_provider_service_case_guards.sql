-- Provider Service Build 4: case lifecycle and immutable identity guards.

create or replace function public.provider_service_case_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_from, ''))
    when 'new' then lower(coalesce(p_to, '')) = any (array['new','open','blocked','escalated','cancelled'])
    when 'open' then lower(coalesce(p_to, '')) = any (array['open','waiting_provider','waiting_xbf','waiting_external','blocked','escalated','resolved','cancelled'])
    when 'waiting_provider' then lower(coalesce(p_to, '')) = any (array['waiting_provider','open','blocked','escalated','resolved','cancelled'])
    when 'waiting_xbf' then lower(coalesce(p_to, '')) = any (array['waiting_xbf','open','blocked','escalated','resolved','cancelled'])
    when 'waiting_external' then lower(coalesce(p_to, '')) = any (array['waiting_external','open','blocked','escalated','resolved','cancelled'])
    when 'blocked' then lower(coalesce(p_to, '')) = any (array['blocked','open','escalated','resolved','cancelled'])
    when 'escalated' then lower(coalesce(p_to, '')) = any (array['escalated','open','blocked','resolved','cancelled'])
    when 'resolved' then lower(coalesce(p_to, '')) = any (array['resolved','open','closed'])
    when 'closed' then lower(coalesce(p_to, '')) = 'closed'
    when 'cancelled' then lower(coalesce(p_to, '')) = 'cancelled'
    else false
  end;
$$;

create or replace function public.provider_service_guard_case_identity_and_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.provider_relationship_id is distinct from old.provider_relationship_id
    or new.legal_entity_id is distinct from old.legal_entity_id
    or new.legal_entity_code is distinct from old.legal_entity_code
    or new.case_number is distinct from old.case_number
    or new.case_code is distinct from old.case_code
    or new.case_type is distinct from old.case_type
    or new.policy_id is distinct from old.policy_id
    or new.policy_version_snapshot is distinct from old.policy_version_snapshot
    or new.first_response_minutes_snapshot is distinct from old.first_response_minutes_snapshot
    or new.resolution_minutes_snapshot is distinct from old.resolution_minutes_snapshot
    or new.opened_at is distinct from old.opened_at then
    raise exception 'Provider Service case identity and SLA snapshot are immutable.' using errcode = '23514';
  end if;

  if not public.provider_service_case_transition_allowed(old.status, new.status) then
    raise exception 'Invalid Provider Service case transition: % -> %', old.status, new.status using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists provider_service_guard_case_identity_and_transition on public.provider_service_cases;
create trigger provider_service_guard_case_identity_and_transition
before update on public.provider_service_cases
for each row execute function public.provider_service_guard_case_identity_and_transition();

revoke all on function public.provider_service_case_transition_allowed(text, text) from public, anon, authenticated;
revoke all on function public.provider_service_guard_case_identity_and_transition() from public, anon, authenticated;
