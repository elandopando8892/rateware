alter table public.provider_compliance_findings
  add constraint provider_compliance_findings_evaluation_fkey
  foreign key (organization_id,evaluation_id,provider_relationship_id,legal_entity_id)
  references public.provider_compliance_evaluations(organization_id,id,provider_relationship_id,legal_entity_id)
  on delete cascade;
