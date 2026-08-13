alter table public.provider_compliance_rules add column evidence_required boolean not null default false;
alter table public.provider_compliance_rule_results add column evidence_required_snapshot boolean not null default false;
