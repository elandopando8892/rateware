-- MARKSMAN Loads closed-pilot controls for the dedicated staging branch only.
-- Never add this file to supabase/migrations and never apply it to production.

begin;

update public.rfx_private_resolver_release_controls
set secret_custody_verified = true,
    network_controls_verified = true,
    monitoring_owner_assigned = true,
    rollback_rehearsed = true,
    production_approved = false,
    updated_at = now()
where singleton = true
  and control_version = 'rfx-private-resolver-controls.v1';

do $$
begin
  if not exists (
    select 1
    from public.rfx_private_resolver_release_controls
    where singleton = true
      and control_version = 'rfx-private-resolver-controls.v1'
      and secret_custody_verified
      and network_controls_verified
      and monitoring_owner_assigned
      and rollback_rehearsed
      and not production_approved
  ) then
    raise exception 'CLOSED_PILOT_CONTROL_ROW_NOT_FOUND';
  end if;
end;
$$;

commit;
