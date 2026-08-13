create or replace view public.provider_health_latest as select distinct on (e.organization_id,e.provider_relationship_id) e.* from public.provider_health_evaluations e order by e.organization_id,e.provider_relationship_id,e.evaluated_at desc,e.id desc;
revoke all on table public.provider_health_latest from public,anon,authenticated,service_role;
grant select on table public.provider_health_latest to service_role;
