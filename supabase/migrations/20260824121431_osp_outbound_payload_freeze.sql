create function osp_private.valid_outbound_recipients(value jsonb, required boolean)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_typeof(value) = 'array'
    and jsonb_array_length(value) <= 50
    and (not required or jsonb_array_length(value) > 0)
    and not exists (
      select 1
      from jsonb_array_elements(value) recipient
      where jsonb_typeof(recipient) <> 'object'
         or (select array_agg(key order by key) from jsonb_object_keys(recipient) key)
              <> array['email', 'source']::text[]
         or recipient->>'email' !~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$'
         or recipient->>'email' <> lower(recipient->>'email')
         or recipient->>'source' not in ('captured_supplier', 'reviewed_manual')
    );
$$;

create function osp_private.valid_outbound_attachments(value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_typeof(value) = 'array'
    and jsonb_array_length(value) <= 20
    and not exists (
      select 1
      from jsonb_array_elements(value) attachment
      where jsonb_typeof(attachment) <> 'object'
         or (select array_agg(key order by key) from jsonb_object_keys(attachment) key)
              <> array['bucketId', 'contentType', 'name', 'objectId', 'sha256']::text[]
         or attachment->>'bucketId' not in ('osp-corporate-documents', 'osp-derived-documents')
         or attachment->>'contentType' not in (
              'application/pdf',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'image/jpeg', 'image/png', 'image/tiff'
            )
         or attachment->>'name' !~ '^[A-Za-z0-9][A-Za-z0-9._ -]{0,127}$'
         or attachment->>'objectId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or attachment->>'sha256' !~ '^[0-9a-f]{64}$'
    );
$$;

create function osp_private.outbound_recipients_are_unique(to_value jsonb, cc_value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select count(*) = count(distinct recipient->>'email')
  from jsonb_array_elements(to_value || cc_value) recipient;
$$;

create function osp_private.valid_outbound_message_ids(value text[])
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select cardinality(value) <= 50
    and coalesce(bool_and(item ~ '^<[!-=?-~]+@[A-Za-z0-9.-]+>$'), true)
  from unnest(value) item;
$$;

create function osp_private.outbound_attachment_hashes(value jsonb)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(attachment->>'sha256' order by ordinal), array[]::text[])
  from jsonb_array_elements(value) with ordinality item(attachment, ordinal);
$$;

create table osp_private.outbound_drafts (
  id uuid primary key,
  organization_id uuid not null,
  case_id uuid not null,
  version integer not null check (version between 1 and 2147483647),
  payload_kind text not null check (payload_kind in ('clarification', 'final_response')),
  case_version bigint not null check (case_version between 0 and 2147483647),
  source_snapshot_sha256 text not null check (source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  signed_package_sha256 text,
  from_email text not null check (from_email = 'carriers@xbfreight.com'),
  to_recipients jsonb not null,
  cc_recipients jsonb not null,
  subject text not null check (length(subject) between 1 and 998 and subject !~ '[[:cntrl:]]'),
  in_reply_to text,
  references_header text[] not null default array[]::text[],
  body_text text not null check (length(body_text) between 1 and 100000),
  attachments_json jsonb not null,
  created_by_subject text not null check (
    created_by_subject ~ '^[A-Za-z0-9:_@.-]+$' and length(created_by_subject) between 1 and 256
  ),
  created_at timestamptz not null default statement_timestamp(),
  unique (organization_id, id),
  unique (organization_id, case_id, id),
  unique (organization_id, case_id, version, payload_kind),
  foreign key (organization_id, case_id)
    references osp_private.customer_registration_cases(organization_id, id),
  constraint outbound_draft_package_check check (
    (payload_kind = 'clarification' and signed_package_sha256 is null) or
    (payload_kind = 'final_response'
      and signed_package_sha256 ~ '^[0-9a-f]{64}$'
      and signed_package_sha256 = any (osp_private.outbound_attachment_hashes(attachments_json)))
  ),
  constraint outbound_draft_recipient_check check (
    osp_private.valid_outbound_recipients(to_recipients, true) and
    osp_private.valid_outbound_recipients(cc_recipients, false) and
    osp_private.outbound_recipients_are_unique(to_recipients, cc_recipients)
  ),
  constraint outbound_draft_message_id_check check (
    (in_reply_to is null or in_reply_to ~ '^<[!-=?-~]+@[A-Za-z0-9.-]+>$') and
    osp_private.valid_outbound_message_ids(references_header)
  ),
  constraint outbound_draft_attachment_check check (
    osp_private.valid_outbound_attachments(attachments_json)
  )
);

alter table osp_private.outbound_payloads add column draft_id uuid;
alter table osp_private.outbound_payloads add column case_version bigint;
alter table osp_private.outbound_payloads add column source_snapshot_sha256 text;
alter table osp_private.outbound_payloads add column signed_package_sha256 text;

do $$
begin
  if exists (
    select 1 from osp_private.outbound_payloads
    where draft_id is null or case_version is null or source_snapshot_sha256 is null
  ) then
    raise exception using errcode = '55000', message = 'OSP_OUTBOUND_MIGRATION_REQUIRES_EMPTY_PAYLOADS';
  end if;
end;
$$;

alter table osp_private.outbound_payloads alter column draft_id set not null;
alter table osp_private.outbound_payloads alter column case_version set not null;
alter table osp_private.outbound_payloads alter column source_snapshot_sha256 set not null;
alter table osp_private.outbound_payloads
  add check (case_version between 0 and 2147483647),
  add check (source_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint outbound_payload_signed_package_check check (
    (payload_kind = 'clarification' and signed_package_sha256 is null) or
    (payload_kind = 'final_response' and signed_package_sha256 ~ '^[0-9a-f]{64}$')
  ),
  add unique (organization_id, case_id, draft_id),
  add foreign key (organization_id, case_id, draft_id)
    references osp_private.outbound_drafts(organization_id, case_id, id);

alter table osp_private.sales_authorizations
  add column attachment_sha256s text[] not null default array[]::text[];
alter table osp_private.sales_authorizations
  add check (osp_private.sha256_array_is_canonical(attachment_sha256s));

drop trigger sales_authorizations_append_only on osp_private.sales_authorizations;
create function osp_private.protect_sales_authorization_supersede()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'authorized' and new.status = 'superseded' and exists (
    select 1 from osp_private.outbound_send_attempts attempt
    where attempt.organization_id = old.organization_id
      and attempt.sales_authorization_id = old.id
      and attempt.outcome in ('reserved', 'sending')
  ) then
    raise exception using errcode = '55000', message = 'OUTBOUND_SEND_ALREADY_RESERVED';
  end if;
  if tg_op = 'DELETE'
    or old.status <> 'authorized'
    or new.status <> 'superseded'
    or new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.case_id is distinct from old.case_id
    or new.payload_id is distinct from old.payload_id
    or new.payload_sha256 is distinct from old.payload_sha256
    or new.actor_subject is distinct from old.actor_subject
    or new.actor_email is distinct from old.actor_email
    or new.authorization_session_id is distinct from old.authorization_session_id
    or new.authorization_session_issued_at is distinct from old.authorization_session_issued_at
    or new.idempotency_key is distinct from old.idempotency_key
    or new.command_sha256 is distinct from old.command_sha256
    or new.authorized_at is distinct from old.authorized_at
    or new.attachment_sha256s is distinct from old.attachment_sha256s
  then
    raise exception using errcode = '55000', message = 'OSP_APPROVAL_APPEND_ONLY';
  end if;
  return new;
end;
$$;
create trigger sales_authorizations_append_only
before update or delete on osp_private.sales_authorizations
for each row execute function osp_private.protect_sales_authorization_supersede();

create function osp_private.assert_outbound_draft_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_case osp_private.customer_registration_cases%rowtype;
begin
  select * into current_case
  from osp_private.customer_registration_cases candidate
  where candidate.organization_id = new.organization_id and candidate.id = new.case_id
  for share;
  if not found or current_case.aggregate_version <> new.case_version then
    raise exception using errcode = '40001', message = 'OSP_VERSION_CONFLICT';
  end if;
  if new.payload_kind = 'clarification' then
    if current_case.state <> 'awaiting_clarification' or not exists (
      select 1
      from osp_private.case_package_input_snapshots snapshot
      where snapshot.organization_id = new.organization_id
        and snapshot.case_id = new.case_id
        and snapshot.canonical_sha256 = new.source_snapshot_sha256
        and not exists (
          select 1 from osp_private.case_package_input_snapshots later
          where later.organization_id = snapshot.organization_id
            and later.case_id = snapshot.case_id
            and (later.created_at, later.id) > (snapshot.created_at, snapshot.id)
        )
    ) then
      raise exception using errcode = '23514', message = 'OSP_OUTBOUND_CONTEXT_STALE';
    end if;
  elsif current_case.state <> 'sales_authorization' or not exists (
    select 1 from osp_private.generated_packages package
    where package.organization_id = new.organization_id
      and package.case_id = new.case_id
      and package.package_kind = 'signed'
      and package.status = 'current'
      and package.input_snapshot_sha256 = new.source_snapshot_sha256
      and package.output_sha256 = new.signed_package_sha256
  ) then
    raise exception using errcode = '23514', message = 'OSP_OUTBOUND_CONTEXT_STALE';
  end if;
  return new;
end;
$$;

create function osp_private.assert_outbound_payload_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from osp_private.outbound_drafts draft
    join osp_private.customer_registration_cases case_record
      on case_record.organization_id = draft.organization_id
     and case_record.id = draft.case_id
    where draft.organization_id = new.organization_id
      and draft.case_id = new.case_id
      and draft.id = new.draft_id
      and draft.id = new.id
      and draft.version = new.version
      and draft.payload_kind = new.payload_kind
      and draft.case_version = new.case_version
      and draft.source_snapshot_sha256 = new.source_snapshot_sha256
      and draft.signed_package_sha256 is not distinct from new.signed_package_sha256
      and osp_private.outbound_attachment_hashes(draft.attachments_json) = new.attachment_sha256s
      and case_record.aggregate_version = new.case_version
      and (
        (new.payload_kind = 'clarification' and case_record.state = 'awaiting_clarification') or
        (new.payload_kind = 'final_response' and case_record.state = 'sales_authorization')
      )
    for share of case_record
  ) then
    raise exception using errcode = '23514', message = 'OSP_OUTBOUND_CONTEXT_STALE';
  end if;
  return new;
end;
$$;

create trigger outbound_drafts_context_guard
before insert on osp_private.outbound_drafts
for each row execute function osp_private.assert_outbound_draft_integrity();
create trigger outbound_drafts_append_only
before update or delete on osp_private.outbound_drafts
for each row execute function osp_private.reject_approval_mutation();
create constraint trigger outbound_payload_context_guard
after insert on osp_private.outbound_payloads
deferrable initially immediate
for each row execute function osp_private.assert_outbound_payload_integrity();

drop function osp_private.authorize_outbound_command(
  uuid, uuid, uuid, text, bigint, text, text, text, text[], text, text, timestamptz, text
);

create function osp_private.authorize_outbound_command(
  p_organization_id uuid,
  p_case_id uuid,
  p_payload_id uuid,
  p_payload_sha256 text,
  p_attachment_sha256s text[],
  p_expected_case_version bigint,
  p_idempotency_key text,
  p_actor_subject text,
  p_actor_email text,
  p_permissions text[],
  p_actor_role text,
  p_session_id text,
  p_session_issued_at timestamptz,
  p_command_sha256 text
)
returns table (case_id uuid, state text, case_version bigint, approval_id uuid, authorization_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_case osp_private.customer_registration_cases%rowtype;
  current_payload osp_private.outbound_payloads%rowtype;
  created_authorization_id uuid := extensions.gen_random_uuid();
begin
  perform osp_private.assert_approval_actor(
    p_organization_id, 'authorize_outbound', p_actor_subject, p_actor_email,
    p_permissions, p_actor_role, p_session_id, p_session_issued_at
  );
  if p_payload_sha256 !~ '^[0-9a-f]{64}$' or
     not osp_private.sha256_array_is_canonical(p_attachment_sha256s) or
     p_idempotency_key !~ '^[A-Za-z0-9:_-]+$' or length(p_idempotency_key) not between 1 and 256 or
     p_command_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'OSP_APPROVAL_INVALID';
  end if;
  select * into current_case
  from osp_private.customer_registration_cases candidate
  where candidate.organization_id = p_organization_id and candidate.id = p_case_id
  for update;
  if not found or current_case.aggregate_version <> p_expected_case_version then
    raise exception using errcode = '40001', message = 'OSP_VERSION_CONFLICT';
  end if;
  select * into current_payload
  from osp_private.outbound_payloads payload
  where payload.organization_id = p_organization_id
    and payload.case_id = p_case_id
    and payload.id = p_payload_id
    and payload.canonical_sha256 = p_payload_sha256
    and payload.attachment_sha256s = p_attachment_sha256s
    and payload.case_version = p_expected_case_version
    and payload.status = 'frozen';
  if not found then
    raise exception using errcode = '23514', message = 'OSP_PAYLOAD_MISMATCH';
  end if;
  if not (
    (current_payload.payload_kind = 'clarification' and current_case.state = 'awaiting_clarification') or
    (current_payload.payload_kind = 'final_response' and current_case.state = 'sales_authorization')
  ) then
    raise exception using errcode = '23514', message = 'OSP_TRANSITION_INVALID';
  end if;
  perform osp_private.assert_package_snapshot_hash_current(
    p_organization_id, p_case_id, current_payload.source_snapshot_sha256
  );
  insert into osp_private.sales_authorizations (
    id, organization_id, case_id, payload_id, payload_sha256,
    attachment_sha256s, actor_subject, actor_email, authorization_session_id,
    authorization_session_issued_at, idempotency_key, command_sha256
  ) values (
    created_authorization_id, p_organization_id, p_case_id, p_payload_id,
    p_payload_sha256, p_attachment_sha256s, p_actor_subject, p_actor_email,
    p_session_id, p_session_issued_at, p_idempotency_key, p_command_sha256
  );
  update osp_private.customer_registration_cases
  set state = 'ready_to_send', aggregate_version = aggregate_version + 1,
      updated_at = statement_timestamp()
  where organization_id = p_organization_id and id = p_case_id
    and aggregate_version = p_expected_case_version;
  insert into osp_private.approval_events (
    id, organization_id, case_id, case_version, event_type, actor_subject,
    actor_role, authorization_session_id, command_sha256, evidence_refs
  ) values (
    extensions.gen_random_uuid(), p_organization_id, p_case_id,
    p_expected_case_version + 1, 'authorize_outbound', p_actor_subject,
    p_actor_role, p_session_id, p_command_sha256,
    jsonb_build_array(jsonb_build_object(
      'authorizationId', created_authorization_id,
      'payloadId', p_payload_id,
      'payloadSha256', p_payload_sha256,
      'attachmentSha256s', to_jsonb(p_attachment_sha256s)
    ))
  );
  return query select p_case_id, 'ready_to_send'::text,
    p_expected_case_version + 1, null::uuid, created_authorization_id;
end;
$$;

alter table osp_private.outbound_drafts enable row level security;
alter table osp_private.outbound_drafts force row level security;
create policy outbound_drafts_workflow_select
on osp_private.outbound_drafts for select to osp_workflow_api
using (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy outbound_drafts_workflow_insert
on osp_private.outbound_drafts for insert to osp_workflow_api
with check (organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid);
create policy sales_authorizations_workflow_supersede
on osp_private.sales_authorizations for update to osp_workflow_api
using (
  organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid
  and status = 'authorized'
)
with check (
  organization_id = nullif(current_setting('osp.organization_id', true), '')::uuid
  and status = 'superseded'
);

grant select, insert on osp_private.outbound_drafts to osp_workflow_api;
grant update (status) on osp_private.sales_authorizations to osp_workflow_api;
revoke all on function osp_private.valid_outbound_recipients(jsonb, boolean) from public;
revoke all on function osp_private.valid_outbound_attachments(jsonb) from public;
revoke all on function osp_private.outbound_recipients_are_unique(jsonb, jsonb) from public;
revoke all on function osp_private.valid_outbound_message_ids(text[]) from public;
revoke all on function osp_private.outbound_attachment_hashes(jsonb) from public;
revoke all on function osp_private.assert_outbound_draft_integrity() from public;
revoke all on function osp_private.assert_outbound_payload_integrity() from public;
revoke all on function osp_private.protect_sales_authorization_supersede() from public;
revoke all on function osp_private.authorize_outbound_command(
  uuid, uuid, uuid, text, text[], bigint, text, text, text, text[], text, text, timestamptz, text
) from public;
grant execute on function osp_private.valid_outbound_recipients(jsonb, boolean) to osp_workflow_api;
grant execute on function osp_private.valid_outbound_attachments(jsonb) to osp_workflow_api;
grant execute on function osp_private.outbound_recipients_are_unique(jsonb, jsonb) to osp_workflow_api;
grant execute on function osp_private.valid_outbound_message_ids(text[]) to osp_workflow_api;
grant execute on function osp_private.outbound_attachment_hashes(jsonb) to osp_workflow_api;
grant execute on function osp_private.assert_outbound_draft_integrity() to osp_workflow_api;
grant execute on function osp_private.assert_outbound_payload_integrity() to osp_workflow_api;
grant execute on function osp_private.authorize_outbound_command(
  uuid, uuid, uuid, text, text[], bigint, text, text, text, text[], text, text, timestamptz, text
) to osp_workflow_api;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'osp-outbound-payloads', 'osp-outbound-payloads', false, 26214400,
  array['message/rfc822']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
