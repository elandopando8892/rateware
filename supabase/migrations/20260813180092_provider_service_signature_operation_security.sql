alter table public.provider_signature_operations enable row level security;
revoke all on table public.provider_signature_operations from public, anon, authenticated, service_role;
