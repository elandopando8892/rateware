alter table public.provider_portal_requirement_access
  add constraint provider_portal_requirement_access_scope_unique
  unique (
    organization_id,
    id,
    invitation_id,
    provider_relationship_id,
    legal_entity_id,
    activation_id,
    activation_requirement_id
  );
