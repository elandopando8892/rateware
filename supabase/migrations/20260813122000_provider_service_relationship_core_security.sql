-- Provider Service Build 1: fail-closed Data API boundary and object documentation.

alter table public.legal_entities enable row level security;
alter table public.provider_relationships enable row level security;
alter table public.provider_relationship_roles enable row level security;
alter table public.provider_relationship_contacts enable row level security;
alter table public.provider_external_references enable row level security;
alter table public.provider_relationship_events enable row level security;

revoke all on table public.legal_entities from public, anon, authenticated;
revoke all on table public.provider_relationships from public, anon, authenticated;
revoke all on table public.provider_relationship_roles from public, anon, authenticated;
revoke all on table public.provider_relationship_contacts from public, anon, authenticated;
revoke all on table public.provider_external_references from public, anon, authenticated;
revoke all on table public.provider_relationship_events from public, anon, authenticated;

revoke all on sequence public.provider_relationships_vendor_number_seq from public, anon, authenticated;

grant select, insert, update on table public.legal_entities to service_role;
grant select, insert, update on table public.provider_relationships to service_role;
grant select, insert, update on table public.provider_relationship_roles to service_role;
grant select, insert, update on table public.provider_relationship_contacts to service_role;
grant select, insert, update on table public.provider_external_references to service_role;
grant select, insert on table public.provider_relationship_events to service_role;
grant usage, select on sequence public.provider_relationships_vendor_number_seq to service_role;

comment on table public.legal_entities is
  'Canonical legal entities inside one Rateware tenant. Provider relationships are scoped to one legal entity to prevent XBF US and XBF MX data mixing.';
comment on table public.provider_relationships is
  'Stable relationship between an existing Carrier CRM vendor and one tenant legal entity. vendor_code is an immutable, database-generated Provider Service ID.';
comment on column public.provider_relationships.vendor_workspace_id is
  'External workspace ID copied from the canonical vendor record and used with organization_id to enforce the reviewed workspace-to-tenant bridge.';
comment on table public.provider_relationship_roles is
  'Composable roles for a Provider Service relationship, such as carrier, drayage_carrier, warehouse, customs_broker, or technology_provider.';
comment on table public.provider_relationship_contacts is
  'Relationship-specific contacts. Existing vendor CRM contact fields remain intact for backward compatibility.';
comment on table public.provider_external_references is
  'External system identifiers for a provider relationship, including future Fleet Rocket and MARKSMAN ERP IDs.';
comment on table public.provider_relationship_events is
  'Append-only Provider Service timeline. Transactional API commands will append lifecycle, agent, approval, integration, and operational events.';
