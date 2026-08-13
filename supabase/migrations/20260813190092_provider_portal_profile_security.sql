alter table public.provider_portal_profile_proposals enable row level security;
revoke all on table public.provider_portal_profile_proposals from public,anon,authenticated,service_role;
