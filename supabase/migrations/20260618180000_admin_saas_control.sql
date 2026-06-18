create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null unique,
  full_name text,
  job_title text,
  phone text,
  timezone text default 'America/Mexico_City',
  preferred_language text default 'en',
  access_mode text not null default 'full_access' check (access_mode in ('full_access', 'roles_later')),
  avatar_url text
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null unique,
  org_name text not null default 'Rateware workspace',
  workspace_slug text,
  website text,
  industry text default 'freight procurement',
  timezone text default 'America/Mexico_City',
  billing_email text,
  notes text
);

create table if not exists public.onboarding_checklist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  task_key text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  notes text,
  constraint onboarding_checklist_owner_task_unique unique (owner_email, task_key)
);

create table if not exists public.saas_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text,
  actor_email text,
  action text not null,
  entity_type text,
  entity_id text,
  summary text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists user_profiles_owner_email_idx on public.user_profiles (owner_email);
create index if not exists organizations_owner_email_idx on public.organizations (owner_email);
create index if not exists onboarding_checklist_owner_idx on public.onboarding_checklist (owner_email, task_key);
create index if not exists saas_audit_log_owner_created_idx on public.saas_audit_log (owner_email, created_at desc);
create index if not exists saas_audit_log_action_idx on public.saas_audit_log (action);

alter table public.user_profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.onboarding_checklist enable row level security;
alter table public.saas_audit_log enable row level security;

create policy "authenticated users can read user profiles"
  on public.user_profiles for select
  to authenticated
  using (true);

create policy "authenticated users can create user profiles"
  on public.user_profiles for insert
  to authenticated
  with check (true);

create policy "authenticated users can update user profiles"
  on public.user_profiles for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read organizations"
  on public.organizations for select
  to authenticated
  using (true);

create policy "authenticated users can create organizations"
  on public.organizations for insert
  to authenticated
  with check (true);

create policy "authenticated users can update organizations"
  on public.organizations for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read onboarding checklist"
  on public.onboarding_checklist for select
  to authenticated
  using (true);

create policy "authenticated users can create onboarding checklist"
  on public.onboarding_checklist for insert
  to authenticated
  with check (true);

create policy "authenticated users can update onboarding checklist"
  on public.onboarding_checklist for update
  to authenticated
  using (true)
  with check (true);

create policy "authenticated users can read saas audit log"
  on public.saas_audit_log for select
  to authenticated
  using (true);

create policy "authenticated users can create saas audit log"
  on public.saas_audit_log for insert
  to authenticated
  with check (true);
