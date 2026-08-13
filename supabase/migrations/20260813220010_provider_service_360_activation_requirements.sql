create or replace view public.provider_service_360_activation_requirements as
select r.organization_id,r.vendor_id,a.provider_relationship_id,a.legal_entity_id,a.id activation_id,a.status activation_status,q.id requirement_id,q.track_code,q.requirement_code,q.requirement_name,q.requirement_type,q.is_required,q.is_blocking,q.evidence_required,q.sequence_number,q.state,q.due_at,q.submitted_at,q.reviewed_at,q.satisfied_at,q.expires_at,q.state_changed_at
from public.provider_relationships r
join public.provider_activations a on a.organization_id=r.organization_id and a.provider_relationship_id=r.id
join public.provider_activation_requirements q on q.organization_id=a.organization_id and q.activation_id=a.id
where a.id=(select x.id from public.provider_activations x where x.organization_id=r.organization_id and x.provider_relationship_id=r.id order by x.opened_at desc,x.id desc limit 1);
revoke all on table public.provider_service_360_activation_requirements from public,anon,authenticated,service_role;
grant select on table public.provider_service_360_activation_requirements to service_role;
