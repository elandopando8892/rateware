-- Separation of duties was enforced twice: in the RPC and by this table constraint. The
-- redundancy caught an incomplete first attempt, so it is kept rather than dropped --
-- but the invariant is restated instead of removed. Requester and approver may be the
-- same actor ONLY on a row that admits it is a self-approval.
alter table public.provider_onboarding_release_package_approvals
  drop constraint if exists provider_release_package_approvals_separation_check;
alter table public.provider_onboarding_release_package_approvals
  add constraint provider_release_package_approvals_separation_check check (
    requested_by_actor_id <> approver_actor_id or self_approved is true
  );;
