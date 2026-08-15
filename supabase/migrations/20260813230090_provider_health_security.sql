alter table public.provider_health_policies enable row level security;
alter table public.provider_health_evaluations enable row level security;
revoke all on table public.provider_health_policies from public,anon,authenticated,service_role;
revoke all on table public.provider_health_evaluations from public,anon,authenticated,service_role;
grant select on table public.provider_health_policies to service_role;
grant select on table public.provider_health_evaluations to service_role;
