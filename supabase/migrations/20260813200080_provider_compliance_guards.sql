create or replace function public.provider_service_guard_compliance_evaluation_identity()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.provider_relationship_id is distinct from old.provider_relationship_id
    or new.legal_entity_id is distinct from old.legal_entity_id
    or new.rule_set_id is distinct from old.rule_set_id
    or new.rule_set_code_snapshot is distinct from old.rule_set_code_snapshot
    or new.rule_set_name_snapshot is distinct from old.rule_set_name_snapshot
    or new.rule_set_version_snapshot is distinct from old.rule_set_version_snapshot
    or new.evaluation_type is distinct from old.evaluation_type then
    raise exception 'Provider compliance evaluation identity is immutable.' using errcode='23514';
  end if;
  return new;
end;
$$;

create or replace function public.provider_service_guard_compliance_result_snapshot()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.result <> 'unknown' then
    raise exception 'Completed compliance rule results are immutable; create a new evaluation.' using errcode='23514';
  end if;
  if new.organization_id is distinct from old.organization_id
    or new.evaluation_id is distinct from old.evaluation_id
    or new.rule_set_id is distinct from old.rule_set_id
    or new.rule_id is distinct from old.rule_id
    or new.rule_code_snapshot is distinct from old.rule_code_snapshot
    or new.evaluator_code_snapshot is distinct from old.evaluator_code_snapshot then
    raise exception 'Provider compliance rule snapshot is immutable.' using errcode='23514';
  end if;
  return new;
end;
$$;

create or replace function public.provider_service_reject_compliance_event_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Provider compliance events are append-only.' using errcode='23514';
end;
$$;

drop trigger if exists provider_service_guard_compliance_evaluation_identity on public.provider_compliance_evaluations;
create trigger provider_service_guard_compliance_evaluation_identity before update on public.provider_compliance_evaluations for each row execute function public.provider_service_guard_compliance_evaluation_identity();

drop trigger if exists provider_service_guard_compliance_result_snapshot on public.provider_compliance_rule_results;
create trigger provider_service_guard_compliance_result_snapshot before update on public.provider_compliance_rule_results for each row execute function public.provider_service_guard_compliance_result_snapshot();

drop trigger if exists provider_service_reject_compliance_event_mutation on public.provider_compliance_events;
create trigger provider_service_reject_compliance_event_mutation before update or delete on public.provider_compliance_events for each row execute function public.provider_service_reject_compliance_event_mutation();
