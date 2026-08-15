-- Convergence hardening: make the Provider Service RPC boundary explicit.
-- Operational commands and pure transition helpers are server-only (service_role).
-- Trigger/guard functions are not directly invocable by runtime roles; triggers were created earlier.

-- Server-only operational commands and helpers.
revoke all on function public.provider_service_activate_relationship(uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_add_evidence_link(uuid,uuid,text,text,text,text,text,text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_case_transition_allowed(text,text) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_consume_approval(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_create_activation(uuid,uuid,uuid,text,text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_decide_approval(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_decide_exception(uuid,uuid,text,text,text,timestamptz,timestamptz,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_enqueue_sync_command(uuid,uuid,uuid,text,text,jsonb,text,text,text,uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_lifecycle_transition_allowed(text,text) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_refresh_activation_state(uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_request_approval(uuid,uuid,text,text,text,text,uuid,uuid,uuid,uuid,uuid,jsonb,text,timestamptz,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_request_exception(uuid,uuid,text,text,text,uuid,text,text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_requirement_transition_allowed(text,text) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_revoke_exception(uuid,uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_set_relationship_lifecycle(uuid,uuid,text,text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.provider_service_set_requirement_state(uuid,uuid,text,text,text,text,uuid) from public,anon,authenticated,service_role;

grant execute on function public.provider_service_activate_relationship(uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.provider_service_add_evidence_link(uuid,uuid,text,text,text,text,text,text,uuid,jsonb) to service_role;
grant execute on function public.provider_service_case_transition_allowed(text,text) to service_role;
grant execute on function public.provider_service_consume_approval(uuid,uuid,text,text) to service_role;
grant execute on function public.provider_service_create_activation(uuid,uuid,uuid,text,text,text,text,uuid) to service_role;
grant execute on function public.provider_service_decide_approval(uuid,uuid,text,text,text) to service_role;
grant execute on function public.provider_service_decide_exception(uuid,uuid,text,text,text,timestamptz,timestamptz,text,uuid) to service_role;
grant execute on function public.provider_service_enqueue_sync_command(uuid,uuid,uuid,text,text,jsonb,text,text,text,uuid,timestamptz) to service_role;
grant execute on function public.provider_service_lifecycle_transition_allowed(text,text) to service_role;
grant execute on function public.provider_service_refresh_activation_state(uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.provider_service_request_approval(uuid,uuid,text,text,text,text,uuid,uuid,uuid,uuid,uuid,jsonb,text,timestamptz,jsonb) to service_role;
grant execute on function public.provider_service_request_exception(uuid,uuid,text,text,text,uuid,text,text,uuid,jsonb) to service_role;
grant execute on function public.provider_service_requirement_transition_allowed(text,text) to service_role;
grant execute on function public.provider_service_revoke_exception(uuid,uuid,text,text,text,uuid) to service_role;
grant execute on function public.provider_service_set_relationship_lifecycle(uuid,uuid,text,text,text,text,uuid) to service_role;
grant execute on function public.provider_service_set_requirement_state(uuid,uuid,text,text,text,text,uuid) to service_role;

-- Trigger/guard functions: never a direct RPC capability.
revoke all on function public.provider_service_guard_activation_identity() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_case_identity_and_transition() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_communication_message_identity() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_compliance_evaluation_identity() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_compliance_result_snapshot() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_document_identity() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_document_version_file_identity() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_exception_approval() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_extraction_terminal_state() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_requirement_link_identity() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_requirement_snapshot() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_review_terminal_state() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_template_mutation() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_guard_template_requirement_mutation() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_reject_activation_event_mutation() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_reject_approval_event_mutation() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_reject_communication_event_mutation() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_reject_compliance_event_mutation() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_reject_document_event_mutation() from public,anon,authenticated,service_role;
revoke all on function public.provider_service_reject_portal_event_mutation() from public,anon,authenticated,service_role;
