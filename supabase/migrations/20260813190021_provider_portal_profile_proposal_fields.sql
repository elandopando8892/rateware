alter table public.provider_portal_profile_proposals add column revision integer not null default 1;
alter table public.provider_portal_profile_proposals add column reviewed_at timestamptz;
alter table public.provider_portal_profile_proposals add column reviewed_by_user_id text;
alter table public.provider_portal_profile_proposals add column review_note text;
alter table public.provider_portal_profile_proposals add column applied_reference text;
alter table public.provider_portal_profile_proposals add column metadata jsonb not null default '{}'::jsonb;
alter table public.provider_portal_profile_proposals add column updated_at timestamptz not null default now();
