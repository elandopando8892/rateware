-- Fix: a re-cut release package could never reach its approval threshold.
--
-- provider_release_package_approvals_unique was (organization_id, package_id,
-- approver_actor_id) — one approval per approver per PACKAGE — while approval
-- counting is scoped to package_revision. Those two disagreed: once a package
-- was revised, its original approvers were permanently barred from approving
-- the new revision, so the threshold became unreachable by the same approver
-- set and the package was effectively dead.
--
-- The replacement includes package_revision. It is strictly more permissive and
-- removes no rows: every existing approval already carries a revision, so each
-- one remains unique under the wider key. Separation of duties is unaffected —
-- it is enforced by provider_release_package_approvals_separation_check and
-- re-checked inside provider_onboarding_decide_release_package_approval.
alter table public.provider_onboarding_release_package_approvals
  drop constraint if exists provider_release_package_approvals_unique;

alter table public.provider_onboarding_release_package_approvals
  add constraint provider_release_package_approvals_revision_unique
  unique (organization_id, package_id, package_revision, approver_actor_id);

-- The duplicate-decision check must now be revision-scoped to match. Without
-- this the command would still refuse a legitimate re-approval after a revision
-- bump, and the widened constraint would have no effect.
create or replace function public.provider_onboarding_decide_release_package_approval(
  p_organization_id uuid,
  p_package_id uuid,
  p_approver_actor_id text,
  p_approval_role text,
  p_decision text,
  p_decision_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  package_row public.provider_onboarding_release_packages%rowtype;
  existing public.provider_onboarding_release_package_approvals%rowtype;
  normalized_decision text;
  normalized_role text;
  normalized_actor text;
  normalized_note text;
  approved_count integer;
  became_approved boolean := false;
begin
  normalized_decision := lower(btrim(coalesce(p_decision,'')));
  normalized_role := lower(btrim(coalesce(p_approval_role,'')));
  normalized_actor := nullif(btrim(coalesce(p_approver_actor_id,'')),'');
  normalized_note := nullif(btrim(coalesce(p_decision_note,'')),'');

  if normalized_decision not in ('approved','rejected') then
    raise exception 'Approval decision must be approved or rejected.' using errcode='22023';
  end if;
  if normalized_role not in ('operations','compliance','data_owner','legal') then
    raise exception 'Approval role is not recognized.' using errcode='22023';
  end if;
  if normalized_actor is null then
    raise exception 'Approval requires an identified approver.' using errcode='22023';
  end if;
  if normalized_note is null then
    raise exception 'Approval decision requires a note.' using errcode='22023';
  end if;

  select * into package_row
  from public.provider_onboarding_release_packages
  where organization_id=p_organization_id and id=p_package_id
  for update;

  if not found then
    raise exception 'Release package not found.' using errcode='P0002';
  end if;
  if package_row.revoked_at is not null then
    raise exception 'Release package has been revoked.' using errcode='23514';
  end if;
  if package_row.package_status <> 'pending_approval' then
    raise exception 'Release package is not pending approval.' using errcode='23514';
  end if;
  if package_row.expires_at is not null and package_row.expires_at <= now() then
    raise exception 'Release package authorization has expired.' using errcode='23514';
  end if;
  if package_row.requested_by_actor_id = normalized_actor then
    raise exception 'The requester cannot approve their own release package.' using errcode='23514';
  end if;

  -- Scoped to the current revision: an approval recorded against earlier
  -- contents neither counts toward nor blocks the current revision.
  select * into existing
  from public.provider_onboarding_release_package_approvals
  where organization_id=p_organization_id
    and package_id=p_package_id
    and package_revision=package_row.revision
    and approver_actor_id=normalized_actor;

  if found then
    if existing.decision = normalized_decision then
      return jsonb_build_object(
        'package_id', p_package_id,
        'decision', existing.decision,
        'package_status', package_row.package_status,
        'package_revision', package_row.revision,
        'idempotent_replay', true
      );
    end if;
    raise exception 'This approver has already decided this package revision.' using errcode='23505';
  end if;

  insert into public.provider_onboarding_release_package_approvals
    (organization_id,package_id,package_revision,requested_by_actor_id,approver_actor_id,approval_role,decision,decision_note)
  values
    (p_organization_id,p_package_id,package_row.revision,package_row.requested_by_actor_id,normalized_actor,normalized_role,normalized_decision,normalized_note);

  if normalized_decision = 'rejected' then
    update public.provider_onboarding_release_packages
    set package_status='rejected', updated_at=now()
    where organization_id=p_organization_id and id=p_package_id;

    insert into public.provider_onboarding_release_package_events
      (organization_id,package_id,event_type,previous_revision,revision,actor_id,payload)
    values
      (p_organization_id,p_package_id,'package_rejected',package_row.revision,package_row.revision,normalized_actor,
       jsonb_build_object('approval_role',normalized_role));

    return jsonb_build_object('package_id',p_package_id,'decision','rejected','package_status','rejected','package_revision',package_row.revision,'idempotent_replay',false);
  end if;

  select count(*) into approved_count
  from public.provider_onboarding_release_package_approvals
  where organization_id=p_organization_id
    and package_id=p_package_id
    and package_revision=package_row.revision
    and decision='approved';

  if approved_count >= package_row.required_approval_count then
    update public.provider_onboarding_release_packages
    set package_status='approved', approved_at=now(), updated_at=now()
    where organization_id=p_organization_id and id=p_package_id;
    became_approved := true;

    insert into public.provider_onboarding_release_package_events
      (organization_id,package_id,event_type,previous_revision,revision,actor_id,payload)
    values
      (p_organization_id,p_package_id,'package_approved',package_row.revision,package_row.revision,normalized_actor,
       jsonb_build_object('approved_count',approved_count,'required',package_row.required_approval_count));
  end if;

  return jsonb_build_object(
    'package_id', p_package_id,
    'decision', 'approved',
    'package_status', case when became_approved then 'approved' else 'pending_approval' end,
    'package_revision', package_row.revision,
    'approved_count', approved_count,
    'required_approval_count', package_row.required_approval_count,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.provider_onboarding_decide_release_package_approval(uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.provider_onboarding_decide_release_package_approval(uuid,uuid,text,text,text,text) to service_role;

comment on constraint provider_release_package_approvals_revision_unique on public.provider_onboarding_release_package_approvals is
'One decision per approver per package revision. Revision scope is required so a re-cut package can be re-approved by the same approver set.';
