alter table public.provider_portal_requirement_access enable row level security;
alter table public.provider_portal_requirement_responses enable row level security;
revoke all on table public.provider_portal_requirement_access from public,anon,authenticated,service_role;
revoke all on table public.provider_portal_requirement_responses from public,anon,authenticated,service_role;
