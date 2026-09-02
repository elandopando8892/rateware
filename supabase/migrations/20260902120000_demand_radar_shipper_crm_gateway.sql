-- Demand Radar is a governed client of the canonical Rateware Shipper CRM.
-- The RPC applies one reviewed create/update atomically with CAS, idempotency,
-- a normal Rateware audit event, and an acceptance receipt of equal validity.

create table if not exists public.demand_radar_shipper_crm_receipts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_email text not null,
  organization_id text,
  idempotency_key text not null,
  request_hash text not null,
  demand_radar_account_id text not null,
  operation text not null check (operation in ('create_shipper', 'update_shipper')),
  state text not null default 'reserved' check (state in ('reserved', 'accepted', 'conflict', 'uncertain')),
  shipper_id uuid references public.shippers(id) on delete set null,
  expected_revision timestamptz,
  accepted_revision timestamptz,
  actor_email text,
  patch jsonb not null default '{}'::jsonb,
  receipt jsonb not null default '{}'::jsonb,
  constraint demand_radar_shipper_crm_receipts_owner_key_unique unique (owner_email, idempotency_key)
);

create index if not exists demand_radar_shipper_crm_receipts_owner_created_idx
  on public.demand_radar_shipper_crm_receipts (owner_email, created_at desc);
create index if not exists demand_radar_shipper_crm_receipts_shipper_idx
  on public.demand_radar_shipper_crm_receipts (owner_email, shipper_id, created_at desc);

alter table public.demand_radar_shipper_crm_receipts enable row level security;

create or replace function public.apply_demand_radar_shipper_crm_change(
  p_owner_email text,
  p_owner_user_id text,
  p_organization_id text,
  p_actor_email text,
  p_idempotency_key text,
  p_demand_radar_account_id text,
  p_shipper_id uuid,
  p_expected_revision timestamptz,
  p_request_hash text,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_inserted integer := 0;
  v_receipt_row public.demand_radar_shipper_crm_receipts%rowtype;
  v_current public.shippers%rowtype;
  v_shipper public.shippers%rowtype;
  v_metadata jsonb;
  v_receipt jsonb;
  v_unknown_keys text[];
begin
  if nullif(btrim(coalesce(p_owner_email, '')), '') is null
    or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
    or nullif(btrim(coalesce(p_demand_radar_account_id, '')), '') is null
    or p_request_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'INVALID_CHANGE_IDENTITY';
  end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then
    raise exception 'PATCH_OBJECT_REQUIRED';
  end if;
  if p_patch ? 'relationship_stage'
    and coalesce(p_patch ->> 'relationship_stage', '') <> all (
      array['target', 'qualified', 'customer', 'at_risk', 'inactive']::text[]
    )
  then
    raise exception 'RELATIONSHIP_STAGE_INVALID';
  end if;
  if p_patch ? 'website' and coalesce(p_patch ->> 'website', '') !~ '^https://' then
    raise exception 'WEBSITE_HTTPS_REQUIRED';
  end if;

  select array_agg(key order by key)
    into v_unknown_keys
  from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) as key
  where key <> all (array[
    'shipper_name', 'legal_name', 'domain', 'website', 'relationship_stage',
    'account_owner_email', 'next_action', 'notes', 'external_source_id',
    'source_campaign', 'intelligence_summary', 'primary_contact_ref',
    'demand_radar_provenance'
  ]::text[]);
  if coalesce(cardinality(v_unknown_keys), 0) > 0 then
    raise exception 'PATCH_FIELD_NOT_ALLOWED:%', array_to_string(v_unknown_keys, ',');
  end if;

  insert into public.demand_radar_shipper_crm_receipts (
    owner_email, organization_id, idempotency_key, request_hash,
    demand_radar_account_id, operation, shipper_id, expected_revision,
    actor_email, patch
  ) values (
    p_owner_email, p_organization_id, p_idempotency_key, p_request_hash,
    p_demand_radar_account_id,
    case when p_shipper_id is null then 'create_shipper' else 'update_shipper' end,
    p_shipper_id, p_expected_revision, p_actor_email, coalesce(p_patch, '{}'::jsonb)
  )
  on conflict (owner_email, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_receipt_row
  from public.demand_radar_shipper_crm_receipts
  where owner_email = p_owner_email and idempotency_key = p_idempotency_key
  for update;

  if v_receipt_row.request_hash <> p_request_hash then
    raise exception 'IDEMPOTENCY_KEY_REUSED';
  end if;
  if v_inserted = 0 then
    if v_receipt_row.state in ('accepted', 'conflict') then
      return v_receipt_row.receipt;
    end if;
    return jsonb_build_object(
      'accepted', false,
      'state', 'uncertain',
      'requestId', v_receipt_row.id::text,
      'idempotencyKey', v_receipt_row.idempotency_key,
      'requiresManualReconciliation', true
    );
  end if;

  if p_shipper_id is null then
    if nullif(btrim(coalesce(p_patch ->> 'shipper_name', '')), '') is null then
      raise exception 'SHIPPER_NAME_REQUIRED';
    end if;
    select * into v_current
    from public.shippers
    where owner_email = p_owner_email
      and status <> 'archived'
      and (
        (
          external_source = 'marksman_demand_radar'
          and external_source_id = coalesce(
            nullif(btrim(p_patch ->> 'external_source_id'), ''),
            p_demand_radar_account_id
          )
        )
        or (
          nullif(lower(btrim(p_patch ->> 'domain')), '') is not null
          and lower(domain) = lower(btrim(p_patch ->> 'domain'))
        )
      )
    order by updated_at desc
    limit 1
    for update;
    if found then
      v_receipt := jsonb_build_object(
        'accepted', false,
        'state', 'conflict',
        'reason', 'canonical_shipper_already_exists',
        'requestId', v_receipt_row.id::text,
        'idempotencyKey', p_idempotency_key,
        'ratewareShipperId', v_current.id::text,
        'observedRevision', v_current.updated_at,
        'detectedAt', v_now
      );
      update public.demand_radar_shipper_crm_receipts
      set state = 'conflict', shipper_id = v_current.id,
          accepted_revision = v_current.updated_at, receipt = v_receipt, updated_at = v_now
      where id = v_receipt_row.id;
      return v_receipt;
    end if;
    insert into public.shippers (
      owner_user_id, owner_email, organization_id, shipper_name, legal_name,
      domain, website, relationship_stage, account_owner_email, notes, source,
      external_source, external_source_id, metadata
    ) values (
      p_owner_user_id,
      p_owner_email,
      p_organization_id,
      btrim(p_patch ->> 'shipper_name'),
      nullif(btrim(p_patch ->> 'legal_name'), ''),
      nullif(lower(btrim(p_patch ->> 'domain')), ''),
      nullif(btrim(p_patch ->> 'website'), ''),
      coalesce(nullif(lower(btrim(p_patch ->> 'relationship_stage')), ''), 'target'),
      nullif(lower(btrim(p_patch ->> 'account_owner_email')), ''),
      nullif(btrim(p_patch ->> 'notes'), ''),
      'marksman_demand_radar',
      'marksman_demand_radar',
      coalesce(nullif(btrim(p_patch ->> 'external_source_id'), ''), p_demand_radar_account_id),
      jsonb_build_object(
        'demand_radar', jsonb_strip_nulls(jsonb_build_object(
          'account_id', p_demand_radar_account_id,
          'campaign_id', nullif(btrim(p_patch ->> 'source_campaign'), ''),
          'intelligence_summary', nullif(btrim(p_patch ->> 'intelligence_summary'), ''),
          'primary_contact_ref', nullif(btrim(p_patch ->> 'primary_contact_ref'), ''),
          'provenance', p_patch -> 'demand_radar_provenance',
          'accepted_at', v_now
        ))
      )
    ) returning * into v_shipper;
  else
    select * into v_current
    from public.shippers
    where id = p_shipper_id and owner_email = p_owner_email
    for update;

    if not found or p_expected_revision is null or v_current.updated_at is distinct from p_expected_revision then
      v_receipt := jsonb_build_object(
        'accepted', false,
        'state', 'conflict',
        'requestId', v_receipt_row.id::text,
        'idempotencyKey', p_idempotency_key,
        'ratewareShipperId', p_shipper_id::text,
        'expectedRevision', p_expected_revision,
        'observedRevision', v_current.updated_at,
        'detectedAt', v_now
      );
      update public.demand_radar_shipper_crm_receipts
      set state = 'conflict', receipt = v_receipt, updated_at = v_now
      where id = v_receipt_row.id;
      return v_receipt;
    end if;

    v_metadata := coalesce(v_current.metadata, '{}'::jsonb) || jsonb_build_object(
      'demand_radar', jsonb_strip_nulls(jsonb_build_object(
        'account_id', p_demand_radar_account_id,
        'campaign_id', nullif(btrim(p_patch ->> 'source_campaign'), ''),
        'intelligence_summary', nullif(btrim(p_patch ->> 'intelligence_summary'), ''),
        'primary_contact_ref', nullif(btrim(p_patch ->> 'primary_contact_ref'), ''),
        'provenance', p_patch -> 'demand_radar_provenance',
        'accepted_at', v_now
      ))
    );

    update public.shippers set
      shipper_name = case when p_patch ? 'shipper_name' then btrim(p_patch ->> 'shipper_name') else shipper_name end,
      legal_name = case when p_patch ? 'legal_name' then nullif(btrim(p_patch ->> 'legal_name'), '') else legal_name end,
      domain = case when p_patch ? 'domain' then nullif(lower(btrim(p_patch ->> 'domain')), '') else domain end,
      website = case when p_patch ? 'website' then nullif(btrim(p_patch ->> 'website'), '') else website end,
      relationship_stage = case when p_patch ? 'relationship_stage' then lower(btrim(p_patch ->> 'relationship_stage')) else relationship_stage end,
      account_owner_email = case when p_patch ? 'account_owner_email' then nullif(lower(btrim(p_patch ->> 'account_owner_email')), '') else account_owner_email end,
      notes = case when p_patch ? 'notes' then nullif(btrim(p_patch ->> 'notes'), '') else notes end,
      source = case when source = 'manual' then 'marksman_demand_radar' else source end,
      external_source = coalesce(external_source, 'marksman_demand_radar'),
      external_source_id = coalesce(external_source_id, nullif(btrim(p_patch ->> 'external_source_id'), ''), p_demand_radar_account_id),
      metadata = v_metadata,
      updated_at = v_now
    where id = p_shipper_id and owner_email = p_owner_email
    returning * into v_shipper;
  end if;

  if nullif(btrim(coalesce(p_patch ->> 'next_action', '')), '') is not null then
    insert into public.shipper_account_actions (
      owner_user_id, owner_email, organization_id, shipper_id, title,
      action_type, status, priority, owner_email_assignee, notes, metadata
    ) values (
      p_owner_user_id, p_owner_email, p_organization_id, v_shipper.id,
      btrim(p_patch ->> 'next_action'), 'follow_up', 'open', 'normal',
      nullif(lower(btrim(p_patch ->> 'account_owner_email')), ''),
      nullif(btrim(p_patch ->> 'notes'), ''),
      jsonb_build_object(
        'source', 'marksman_demand_radar',
        'demand_radar_account_id', p_demand_radar_account_id,
        'idempotency_key', p_idempotency_key
      )
    );
  end if;

  insert into public.saas_audit_log (
    owner_user_id, owner_email, actor_email, action, entity_type, entity_id, summary, metadata
  ) values (
    p_owner_user_id,
    p_owner_email,
    p_actor_email,
    case when p_shipper_id is null then 'shipper_created_from_demand_radar' else 'shipper_updated_from_demand_radar' end,
    'shipper',
    v_shipper.id::text,
    case when p_shipper_id is null then 'Created canonical Shipper from reviewed Demand Radar request.' else 'Updated canonical Shipper from reviewed Demand Radar request.' end,
    jsonb_build_object(
      'source', 'marksman_demand_radar',
      'demand_radar_account_id', p_demand_radar_account_id,
      'idempotency_key', p_idempotency_key,
      'request_hash', p_request_hash
    )
  );

  v_receipt := jsonb_build_object(
    'accepted', true,
    'state', 'accepted',
    'requestId', v_receipt_row.id::text,
    'idempotencyKey', p_idempotency_key,
    'ratewareShipperId', v_shipper.id::text,
    'revision', v_shipper.updated_at,
    'acceptedAt', v_now,
    'canonicalValidity', 'first_class_canonical',
    'auditAction', case when p_shipper_id is null then 'shipper_created_from_demand_radar' else 'shipper_updated_from_demand_radar' end
  );

  update public.demand_radar_shipper_crm_receipts
  set state = 'accepted', shipper_id = v_shipper.id, accepted_revision = v_shipper.updated_at,
      receipt = v_receipt, updated_at = v_now
  where id = v_receipt_row.id;

  return v_receipt;
end;
$$;

revoke all on function public.apply_demand_radar_shipper_crm_change(
  text, text, text, text, text, text, uuid, timestamptz, text, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_demand_radar_shipper_crm_change(
  text, text, text, text, text, text, uuid, timestamptz, text, jsonb
) to service_role;

comment on table public.demand_radar_shipper_crm_receipts is
  'Governed idempotency and canonical acceptance receipts for Demand Radar writes into Rateware Shipper CRM.';
comment on function public.apply_demand_radar_shipper_crm_change(
  text, text, text, text, text, text, uuid, timestamptz, text, jsonb
) is
  'Applies one reviewed Demand Radar Shipper change atomically; accepted rows have the same canonical validity as direct Rateware entries.';
