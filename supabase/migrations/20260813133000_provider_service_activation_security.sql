-- Provider Service Build 2: fail-closed Data API boundary.
-- Runtime mutation occurs only through audited security-definer commands.

alter table public.provider_activation_templates enable row level security;
alter table public.provider_activation_template_requirements enable row level security;
alter table public.provider_activations enable row level security;
alter table public.provider_activation_requirements enable row level security;
alter table public.provider_activation_evidence_links enable row level security;
alter table public.provider_activation_exceptions enable row level security;
alter table public.provider_activation_events enable row level security;

revoke all on table public.provider_activation_templates
  from public, anon, authenticated, service_role;
revoke all on table public.provider_activation_template_requirements
  from public, anon, authenticated, service_role;
revoke all on table public.provider_activations
  from public, anon, authenticated, service_role;
revoke all on table public.provider_activation_requirements
  from public, anon, authenticated, service_role;
revoke all on table public.provider_activation_evidence_links
  from public, anon, authenticated, service_role;
revoke all on table public.provider_activation_exceptions
  from public, anon, authenticated, service_role;
revoke all on table public.provider_activation_events
  from public, anon, authenticated, service_role;

revoke all on table public.provider_activation_effective_exceptions
  from public, anon, authenticated, service_role;
revoke all on table public.provider_activation_requirement_readiness
  from public, anon, authenticated, service_role;
revoke all on table public.provider_activation_track_readiness
  from public, anon, authenticated, service_role;
revoke all on table public.provider_activation_readiness
  from public, anon, authenticated, service_role;

grant select on table public.provider_activation_templates to service_role;
grant select on table public.provider_activation_template_requirements to service_role;
grant select on table public.provider_activations to service_role;
grant select on table public.provider_activation_requirements to service_role;
grant select on table public.provider_activation_evidence_links to service_role;
grant select on table public.provider_activation_exceptions to service_role;
grant select on table public.provider_activation_events to service_role;

grant select on table public.provider_activation_effective_exceptions to service_role;
grant select on table public.provider_activation_requirement_readiness to service_role;
grant select on table public.provider_activation_track_readiness to service_role;
grant select on table public.provider_activation_readiness to service_role;

revoke all on function public.provider_service_requirement_transition_allowed(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_guard_template_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_guard_template_requirement_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_guard_activation_identity()
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_guard_requirement_snapshot()
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_reject_activation_event_mutation()
  from public, anon, authenticated, service_role;

revoke all on function public.provider_service_refresh_activation_state(uuid, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_create_activation(uuid, uuid, uuid, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_add_evidence_link(uuid, uuid, text, text, text, text, text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_set_requirement_state(uuid, uuid, text, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_request_exception(uuid, uuid, text, text, text, uuid, text, text, uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_decide_exception(uuid, uuid, text, text, text, timestamptz, timestamptz, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_revoke_exception(uuid, uuid, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.provider_service_activate_relationship(uuid, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.provider_service_requirement_transition_allowed(text, text)
  to service_role;
grant execute on function public.provider_service_refresh_activation_state(uuid, uuid, text, text, uuid)
  to service_role;
grant execute on function public.provider_service_create_activation(uuid, uuid, uuid, text, text, text, text, uuid)
  to service_role;
grant execute on function public.provider_service_add_evidence_link(uuid, uuid, text, text, text, text, text, text, uuid, jsonb)
  to service_role;
grant execute on function public.provider_service_set_requirement_state(uuid, uuid, text, text, text, text, uuid)
  to service_role;
grant execute on function public.provider_service_request_exception(uuid, uuid, text, text, text, uuid, text, text, uuid, jsonb)
  to service_role;
grant execute on function public.provider_service_decide_exception(uuid, uuid, text, text, text, timestamptz, timestamptz, text, uuid)
  to service_role;
grant execute on function public.provider_service_revoke_exception(uuid, uuid, text, text, text, uuid)
  to service_role;
grant execute on function public.provider_service_activate_relationship(uuid, uuid, text, text, uuid)
  to service_role;

comment on table public.provider_activation_templates is
  'Versioned Provider Service activation templates scoped to one tenant legal entity. Published content is immutable.';
comment on table public.provider_activation_template_requirements is
  'Canonical requirements grouped into Provider Readiness, XBF Customer Setup, and Commercial & Operational Readiness.';
comment on table public.provider_activations is
  'Historical activation processes under one stable provider relationship. Only one open activation is allowed per relationship.';
comment on table public.provider_activation_requirements is
  'Immutable snapshots of template requirements for one activation. State changes occur through audited commands.';
comment on table public.provider_activation_evidence_links is
  'References to evidence stored in external systems or the future Document Registry. No document binary is stored in Build 2.';
comment on table public.provider_activation_exceptions is
  'Requested, approved, expiring, rejected, or revoked exceptions with explicit scope, requester, reviewer, reason, and expiration.';
comment on table public.provider_activation_events is
  'Append-only activation timeline with actor, source, correlation ID, requirement context, and exception context.';
comment on function public.provider_service_activate_relationship(uuid, uuid, text, text, uuid) is
  'Activates a provider relationship only when the deterministic readiness projection reports ready across all three tracks.';
