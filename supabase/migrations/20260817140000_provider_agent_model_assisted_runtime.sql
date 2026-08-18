-- Record model-assisted agent runs honestly.
--
-- provider_agent_runs.runtime_type allowed only 'deterministic' or
-- 'openai_agents_sdk'. The onboarding classifier calls OpenAI and Anthropic over
-- raw HTTP behind one interface — it is neither. Recording it as 'deterministic'
-- would claim no model was involved; recording it as 'openai_agents_sdk' would
-- name an SDK that is not in use and would be wrong outright on the Anthropic and
-- keyword tiers. Both corrupt the §17 audit trail this column exists to keep.
--
-- Adds 'model_assisted'. Strictly more permissive, removes no rows: every existing
-- run keeps its value under the widened check.
alter table public.provider_agent_runs
  drop constraint if exists provider_agent_runs_runtime_check;

alter table public.provider_agent_runs
  add constraint provider_agent_runs_runtime_check
  check (runtime_type in ('deterministic', 'model_assisted', 'openai_agents_sdk'));

comment on column public.provider_agent_runs.runtime_type is
'How the run reached its proposal. deterministic = rules only; model_assisted = an LLM classified or extracted, with engine, model and prompt version recorded in metadata; openai_agents_sdk = the vendor agent runtime. The engine that actually answered is in metadata, since a model-assisted run can fall through to the deterministic tier.';
