create table if not exists public.provider_compliance_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  evaluation_id uuid not null,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  finding_code text not null,
  title text not null,
  severity text not null,
  blocking boolean not null default true,
  status text not null default 'open',
  remediation_due_at timestamptz,
  approval_request_id uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
