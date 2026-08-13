alter table public.provider_portal_invitations enable row level security;
revoke all on table public.provider_portal_invitations from public,anon,authenticated,service_role;
