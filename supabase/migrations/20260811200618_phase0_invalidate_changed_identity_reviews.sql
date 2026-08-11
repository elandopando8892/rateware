-- A review approves one exact identity or tenant mapping. If any key field is
-- changed, invalidate that approval before the row can be activated again.

create or replace function public.phase0_invalidate_changed_mapping_review()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  new.status := 'needs_review';
  new.reviewed_at := null;
  new.reviewed_by_user_id := null;
  new.updated_at := now();

  if tg_table_name = 'external_organization_links' then
    new.review_note := null;
  end if;

  return new;
end
$$;

revoke all on function public.phase0_invalidate_changed_mapping_review()
  from public, anon, authenticated;
grant execute on function public.phase0_invalidate_changed_mapping_review()
  to service_role;

drop trigger if exists external_identities_invalidate_changed_review
  on public.external_identities;
create trigger external_identities_invalidate_changed_review
before update of provider, external_subject
on public.external_identities
for each row
when (
  old.provider is distinct from new.provider
  or old.external_subject is distinct from new.external_subject
)
execute function public.phase0_invalidate_changed_mapping_review();

drop trigger if exists external_organization_links_invalidate_changed_review
  on public.external_organization_links;
create trigger external_organization_links_invalidate_changed_review
before update of provider, external_organization_id, organization_id
on public.external_organization_links
for each row
when (
  old.provider is distinct from new.provider
  or old.external_organization_id is distinct from new.external_organization_id
  or old.organization_id is distinct from new.organization_id
)
execute function public.phase0_invalidate_changed_mapping_review();
