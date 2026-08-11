-- The shared trigger record has a different shape for identities and
-- organization links. Resolve review_note only inside the link-table branch.

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
