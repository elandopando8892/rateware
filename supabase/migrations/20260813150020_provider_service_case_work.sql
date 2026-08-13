-- Provider Service Build 4: case tasks and participants.

alter table public.provider_relationship_contacts
  add constraint provider_relationship_contacts_org_rel_id_unique
  unique (organization_id, provider_relationship_id, id);

create table if not exists public.provider_service_case_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null,
  task_code text not null,
  task_name text not null,
  task_description text,
  status text not null default 'pending',
  priority text not null default 'normal',
  owner_user_id text,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completion_note text,
  sequence_number integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_service_case_tasks_org_id_unique unique (organization_id, id),
  constraint provider_service_case_tasks_case_fkey
    foreign key (organization_id, case_id)
    references public.provider_service_cases(organization_id, id)
    on delete cascade,
  constraint provider_service_case_tasks_code_unique
    unique (organization_id, case_id, task_code),
  constraint provider_service_case_tasks_code_check
    check (task_code ~ '^[a-z][a-z0-9_]{1,127}$'),
  constraint provider_service_case_tasks_name_not_blank check (btrim(task_name) <> ''),
  constraint provider_service_case_tasks_status_check
    check (status in ('pending', 'in_progress', 'waiting', 'completed', 'cancelled')),
  constraint provider_service_case_tasks_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent', 'critical')),
  constraint provider_service_case_tasks_sequence_check check (sequence_number > 0),
  constraint provider_service_case_tasks_started_check
    check (status <> 'in_progress' or started_at is not null),
  constraint provider_service_case_tasks_completed_check
    check (status <> 'completed' or completed_at is not null)
);

create table if not exists public.provider_service_case_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  case_id uuid not null,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  participant_type text not null,
  relationship_contact_id uuid,
  user_id text,
  display_name text,
  email text,
  phone text,
  participant_role text not null default 'participant',
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_service_case_participants_org_id_unique unique (organization_id, id),
  constraint provider_service_case_participants_case_fkey
    foreign key (organization_id, case_id, provider_relationship_id, legal_entity_id)
    references public.provider_service_cases(organization_id, id, provider_relationship_id, legal_entity_id)
    on delete cascade,
  constraint provider_service_case_participants_contact_fkey
    foreign key (organization_id, provider_relationship_id, relationship_contact_id)
    references public.provider_relationship_contacts(organization_id, provider_relationship_id, id)
    on delete restrict,
  constraint provider_service_case_participants_type_check
    check (participant_type in ('internal_user', 'provider_contact', 'external_contact', 'system')),
  constraint provider_service_case_participants_role_check
    check (participant_role ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint provider_service_case_participants_status_check check (status in ('active', 'inactive')),
  constraint provider_service_case_participants_identity_check check (
    nullif(btrim(coalesce(user_id, '')), '') is not null
    or relationship_contact_id is not null
    or nullif(btrim(coalesce(email, '')), '') is not null
    or nullif(btrim(coalesce(phone, '')), '') is not null
  ),
  constraint provider_service_case_participants_email_check
    check (email is null or email = lower(btrim(email)))
);

create index if not exists provider_service_case_tasks_case_status_idx
  on public.provider_service_case_tasks (case_id, status, priority, due_at, sequence_number);
create index if not exists provider_service_case_participants_case_status_idx
  on public.provider_service_case_participants (case_id, status, participant_type);
