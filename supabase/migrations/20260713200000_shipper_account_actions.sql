create table if not exists public.shipper_account_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id text,
  owner_email text not null,
  organization_id text,
  shipper_id uuid not null references public.shippers(id) on delete cascade,
  title text not null,
  action_type text not null default 'follow_up'
    check (action_type in ('follow_up', 'call', 'email', 'meeting', 'rfi_follow_up', 'rate_review', 'data_cleanup', 'other')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  due_date date,
  owner_email_assignee text,
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists shipper_account_actions_owner_shipper_idx
  on public.shipper_account_actions (owner_email, shipper_id, status, due_date, updated_at desc);
create index if not exists shipper_account_actions_owner_due_idx
  on public.shipper_account_actions (owner_email, status, due_date)
  where status in ('open', 'in_progress');

alter table public.shipper_account_actions enable row level security;

create policy "workspace users can manage shipper account actions"
  on public.shipper_account_actions for all to authenticated
  using (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  )
  with check (
    lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or (organization_id is not null and organization_id = coalesce(auth.jwt() ->> 'org_code', auth.jwt() ->> 'organization_id', auth.jwt() ->> 'org_id'))
  );
