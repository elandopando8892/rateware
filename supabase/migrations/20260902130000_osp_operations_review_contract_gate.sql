-- Sprint 13: require a resolved review of the CURRENT carrier manifest.
-- This is a review-freshness prerequisite, not proof of document fulfillment.
-- The API's evidence assessment still checks format, coverage, age and signature.

create or replace function osp_private.assert_request_contract_ready(
  p_organization_id uuid,
  p_case_id uuid
) returns void
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $function$
begin
  if not coalesce((
    select review.status = 'resolved'
      and review.manifest_version = manifest.version
      and review.manifest_sha256 = manifest.manifest_sha256
    from osp_private.request_manifest_drafts manifest
    left join lateral (
      select candidate.status, candidate.manifest_version, candidate.manifest_sha256
      from osp_private.request_manifest_decision_reviews candidate
      where candidate.organization_id = manifest.organization_id
        and candidate.case_id = manifest.case_id
        and candidate.manifest_draft_id = manifest.id
      order by candidate.review_version desc
      limit 1
    ) review on true
    where manifest.organization_id = p_organization_id
      and manifest.case_id = p_case_id
    order by manifest.version desc
    limit 1
  ), false) then
    raise exception using errcode = '23514', message = 'REQUEST_FULFILLMENT_BLOCKED';
  end if;
end;
$function$;

create or replace function osp_private.guard_operations_review_contract()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, osp_private
as $function$
begin
  if old.state = 'operations_review'
     and new.state = 'signature_approval'
     and old.state is distinct from new.state then
    perform osp_private.assert_request_contract_ready(new.organization_id, new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists customer_registration_cases_request_contract_gate
  on osp_private.customer_registration_cases;
create trigger customer_registration_cases_request_contract_gate
after update of state on osp_private.customer_registration_cases
for each row execute function osp_private.guard_operations_review_contract();

revoke all on function osp_private.assert_request_contract_ready(uuid, uuid)
  from public, anon, authenticated, service_role, osp_worker, osp_workflow_api;
revoke all on function osp_private.guard_operations_review_contract()
  from public, anon, authenticated, service_role, osp_worker, osp_workflow_api;

comment on function osp_private.assert_request_contract_ready(uuid, uuid) is
'Review-freshness prerequisite: Operations requires a resolved review matching the latest manifest id, version and hash. Not a substitute for evidence fulfillment assessment.';
