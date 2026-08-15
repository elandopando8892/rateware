alter table public.provider_agent_action_proposals add column sensitivity text not null default 'internal';
alter table public.provider_agent_action_proposals add column external_side_effect boolean not null default false;
alter table public.provider_agent_action_proposals add column approval_reference text;
alter table public.provider_agent_action_proposals add column execution_reference text;
alter table public.provider_agent_action_proposals add column error_message text;
alter table public.provider_agent_action_proposals add column updated_at timestamptz not null default now();
