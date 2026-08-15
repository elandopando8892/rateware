create table if not exists public.provider_system_activation_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  provider_relationship_id uuid not null,
  legal_entity_id uuid not null,
  activation_id uuid not null,
  activation_requirement_id uuid not null,
  system_code text not null,
  mapping_type text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_system_activation_links_activation_fkey foreign key (organization_id,activation_id,provider_relationship_id,legal_entity_id) references public.provider_activations(organization_id,id,provider_relationship_id,legal_entity_id) on delete restrict,
  constraint provider_system_activation_links_requirement_fkey foreign key (organization_id,activation_id,activation_requirement_id) references public.provider_activation_requirements(organization_id,activation_id,id) on delete restrict,
  constraint provider_system_activation_links_mapping_fkey foreign key (organization_id,provider_relationship_id,legal_entity_id,system_code,mapping_type) references public.provider_system_links(organization_id,provider_relationship_id,legal_entity_id,system_code,mapping_type) on delete restrict,
  constraint provider_system_activation_links_unique unique (organization_id,activation_requirement_id,system_code,mapping_type),
  constraint provider_system_activation_links_status_check check (status in ('active','revoked','superseded'))
);
