-- Status changes are part of the approval lifecycle. Leaving active clears the
-- approval, while reactivation requires a new review timestamp in that same
-- update. Reusing historical metadata fails closed to needs_review.

create or replace function public.phase0_invalidate_changed_mapping_review()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  trigger_mode text := coalesce(tg_argv[0], 'mapping');
  fresh_activation boolean;
begin
  if trigger_mode = 'status' then
    if old.status = 'active' and new.status <> 'active' then
      new.reviewed_at := null;
      new.reviewed_by_user_id := null;
      if tg_table_name = 'external_organization_links' then
        new.review_note := null;
      end if;
    elsif old.status <> 'active' and new.status = 'active' then
      fresh_activation := new.reviewed_at is not null
        and new.reviewed_at is distinct from old.reviewed_at
        and nullif(btrim(new.reviewed_by_user_id), '') is not null;

      if tg_table_name = 'external_organization_links' then
        fresh_activation := fresh_activation
          and nullif(btrim(new.review_note), '') is not null;
      end if;

      if not fresh_activation then
        new.status := 'needs_review';
        new.reviewed_at := null;
        new.reviewed_by_user_id := null;
        if tg_table_name = 'external_organization_links' then
          new.review_note := null;
        end if;
      end if;
    end if;
  else
    new.status := 'needs_review';
    new.reviewed_at := null;
    new.reviewed_by_user_id := null;
    if tg_table_name = 'external_organization_links' then
      new.review_note := null;
    end if;
  end if;

  new.updated_at := now();
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
execute function public.phase0_invalidate_changed_mapping_review('mapping');

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
execute function public.phase0_invalidate_changed_mapping_review('mapping');

drop trigger if exists external_identities_invalidate_status_review
  on public.external_identities;
create trigger external_identities_invalidate_status_review
before update of status
on public.external_identities
for each row
when (old.status is distinct from new.status)
execute function public.phase0_invalidate_changed_mapping_review('status');

drop trigger if exists external_organization_links_invalidate_status_review
  on public.external_organization_links;
create trigger external_organization_links_invalidate_status_review
before update of status
on public.external_organization_links
for each row
when (old.status is distinct from new.status)
execute function public.phase0_invalidate_changed_mapping_review('status');
