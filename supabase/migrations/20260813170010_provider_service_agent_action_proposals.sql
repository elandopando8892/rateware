create table if not exists public.provider_agent_action_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_run_id uuid not null,
  sequence_number integer not null,
  action_code text not null,
  action_payload jsonb not null default '{}'::jsonb,
  rationale text not null,
  confidence numeric not null,
  policy_decision text not null,
  approval_mode text not null,
  proposal_state text not null default 'proposed',
  created_at timestamptz not null default now()
);
