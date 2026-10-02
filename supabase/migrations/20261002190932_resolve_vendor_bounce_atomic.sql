-- Review/apply only with explicit human authorization. No existing rows are backfilled.
begin;

create table public.vendor_email_bounce_resolutions (
  owner_email text not null,
  operation_id uuid not null,
  vendor_id uuid not null,
  bounced_email text not null,
  replacement_email text not null,
  resolved_at timestamptz not null default now(),
  primary key (owner_email, operation_id)
);
alter table public.vendor_email_bounce_resolutions enable row level security;
revoke all on public.vendor_email_bounce_resolutions from public, anon, authenticated;
grant select, insert on public.vendor_email_bounce_resolutions to service_role;

create function public.resolve_vendor_email_bounce(
  p_owner_email text, p_vendor_id uuid, p_bounced_email text,
  p_replacement_email text, p_operation_id uuid
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_vendor public.vendors%rowtype;
  v_receipt public.vendor_email_bounce_resolutions%rowtype;
  v_bounces jsonb;
  v_next_bounces jsonb;
  v_has_bounce boolean;
  v_primary text;
  v_secondary text[];
  v_tags text[];
  v_now timestamptz := transaction_timestamp();
begin
  if nullif(btrim(p_owner_email), '') is null or p_vendor_id is null or p_operation_id is null
    or p_bounced_email is null or p_replacement_email is null
    or p_bounced_email <> lower(btrim(p_bounced_email))
    or p_replacement_email <> lower(btrim(p_replacement_email))
    or p_bounced_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_replacement_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_bounced_email = p_replacement_email then
    raise exception 'bounce_resolution_invalid_input' using errcode = '22023';
  end if;

  -- Serialize the same operation even if another call changes its payload.
  perform pg_advisory_xact_lock(hashtextextended(p_owner_email || ':' || p_operation_id::text, 0));
  select * into v_vendor from public.vendors
    where owner_email = p_owner_email and id = p_vendor_id for update;
  if not found then raise exception 'bounce_vendor_not_found'; end if;

  -- Existing suppression writers must wait for these rows until both updates commit.
  perform s.id from public.email_suppression_list s
    where s.owner_email = p_owner_email and s.email in (p_bounced_email, p_replacement_email)
    order by s.email, s.id for update;
  v_bounces := case when jsonb_typeof(v_vendor.profile_data->'bounced_emails') = 'array'
    then v_vendor.profile_data->'bounced_emails' else '[]'::jsonb end;
  select exists(select 1 from jsonb_array_elements(v_bounces) b
    where lower(btrim(b->>'email')) = p_bounced_email and nullif(b->>'resolved_at', '') is null)
    into v_has_bounce;

  select * into v_receipt from public.vendor_email_bounce_resolutions
    where owner_email = p_owner_email and operation_id = p_operation_id;
  if found then
    if v_receipt.vendor_id <> p_vendor_id or v_receipt.bounced_email <> p_bounced_email
      or v_receipt.replacement_email <> p_replacement_email then
      raise exception 'bounce_operation_conflict';
    end if;
    if v_has_bounce or not (lower(coalesce(v_vendor.primary_email, '')) = p_replacement_email
      or p_replacement_email = any(coalesce(v_vendor.secondary_emails, '{}'::text[])))
      or exists(select 1 from public.email_suppression_list s where s.owner_email = p_owner_email
        and s.email in (p_bounced_email, p_replacement_email) and s.resolved_at is null
        and (s.status in ('hard_bounce', 'soft_bounce', 'delivery_incomplete')
          or (s.email = p_replacement_email and s.status in ('complaint', 'unsubscribed', 'manual')))) then
      raise exception 'bounce_resolution_state_changed';
    end if;
    return jsonb_build_object('row', to_jsonb(v_vendor), 'replayed', true, 'operation_id', p_operation_id,
      'bounced_email', p_bounced_email, 'replacement_email', p_replacement_email);
  end if;
  if not v_has_bounce then raise exception 'bounce_not_unresolved'; end if;
  if exists(select 1 from public.email_suppression_list s where s.owner_email = p_owner_email
    and s.email = p_replacement_email and s.resolved_at is null
    and s.status in ('hard_bounce', 'soft_bounce', 'delivery_incomplete', 'complaint', 'unsubscribed', 'manual')) then
    raise exception 'bounce_replacement_blocked';
  end if;

  v_primary := lower(nullif(btrim(v_vendor.primary_email), ''));
  if v_primary is null or v_primary = p_bounced_email then v_primary := p_replacement_email; end if;
  select coalesce(array_agg(email order by pos), '{}'::text[]) into v_secondary from (
    select lower(btrim(value)) as email, min(pos) as pos
    from unnest(array[p_replacement_email] || coalesce(v_vendor.secondary_emails, '{}'::text[]))
      with ordinality t(value, pos)
    where nullif(btrim(value), '') is not null group by lower(btrim(value))
  ) contacts where email <> p_bounced_email and email <> v_primary;
  select coalesce(jsonb_agg(case when lower(btrim(b->>'email')) = p_bounced_email
    and nullif(b->>'resolved_at', '') is null then b || jsonb_build_object(
      'resolved_at', v_now, 'resolved_by', p_owner_email, 'replacement_email', p_replacement_email)
    else b end order by pos), '[]'::jsonb) into v_next_bounces
    from jsonb_array_elements(v_bounces) with ordinality t(b, pos);
  select coalesce(array_agg(tag order by pos), '{}'::text[]) into v_tags from (
    select tag, min(pos) as pos from unnest(coalesce(v_vendor.tags, '{}'::text[]))
      with ordinality t(tag, pos) where tag <> 'email_bounce' group by tag
  ) preserved_tags;
  if exists(select 1 from jsonb_array_elements(v_next_bounces) b where nullif(b->>'resolved_at', '') is null)
    then v_tags := array_append(v_tags, 'email_bounce'); end if;

  update public.vendors set primary_email = v_primary, secondary_emails = v_secondary,
    tags = v_tags, profile_data = coalesce(profile_data, '{}'::jsonb) || jsonb_build_object('bounced_emails', v_next_bounces),
    updated_at = v_now where owner_email = p_owner_email and id = p_vendor_id returning * into v_vendor;
  update public.email_suppression_list set resolved_at = v_now, resolved_by = p_owner_email,
    replacement_email = p_replacement_email, updated_at = v_now
    where owner_email = p_owner_email and email = p_bounced_email and resolved_at is null
      and status in ('hard_bounce', 'soft_bounce', 'delivery_incomplete');
  insert into public.vendor_email_bounce_resolutions(owner_email, operation_id, vendor_id, bounced_email, replacement_email, resolved_at)
    values (p_owner_email, p_operation_id, p_vendor_id, p_bounced_email, p_replacement_email, v_now);
  return jsonb_build_object('row', to_jsonb(v_vendor), 'replayed', false, 'operation_id', p_operation_id,
    'bounced_email', p_bounced_email, 'replacement_email', p_replacement_email);
end;
$$;

revoke all on function public.resolve_vendor_email_bounce(text, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.resolve_vendor_email_bounce(text, uuid, text, text, uuid) to service_role;
commit;
