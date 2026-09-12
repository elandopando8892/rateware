alter table osp_private.gmail_messages
  add column if not exists source_relationship text not null default 'direct_copy',
  add column if not exists parent_sender_email text,
  add column if not exists parent_sender_domain text,
  add column if not exists parent_internet_message_id text,
  add column if not exists parent_subject text,
  add column if not exists parent_to_addresses text[] not null default '{}',
  add column if not exists parent_cc_addresses text[] not null default '{}',
  add column if not exists parent_source_sha256 text,
  add column if not exists original_sender_email text,
  add column if not exists original_sender_domain text,
  add column if not exists original_internet_message_id text,
  add column if not exists original_subject text,
  add column if not exists original_to_addresses text[] not null default '{}',
  add column if not exists original_cc_addresses text[] not null default '{}',
  add column if not exists original_source_sha256 text,
  add column if not exists external_reply_to_addresses text[] not null default '{}',
  add column if not exists external_reply_cc_addresses text[] not null default '{}';

update osp_private.gmail_messages
set parent_sender_email = sender_email,
    parent_sender_domain = sender_domain,
    parent_internet_message_id = internet_message_id,
    parent_subject = subject,
    parent_to_addresses = to_addresses,
    parent_cc_addresses = cc_addresses,
    parent_source_sha256 = source_sha256
where source_relationship = 'direct_copy'
  and parent_source_sha256 is null;

alter table osp_private.gmail_attachments
  add column if not exists filename text,
  add column if not exists source_role text not null default 'direct_attachment',
  add column if not exists parent_source_sha256 text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'osp_private.gmail_messages'::regclass
      and conname = 'osp_gmail_messages_source_relationship_check'
  ) then
    alter table osp_private.gmail_messages
      add constraint osp_gmail_messages_source_relationship_check
      check (source_relationship in ('direct_copy', 'internal_relay')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'osp_private.gmail_messages'::regclass
      and conname = 'osp_gmail_messages_relay_provenance_check'
  ) then
    alter table osp_private.gmail_messages
      add constraint osp_gmail_messages_relay_provenance_check
      check (
        source_relationship = 'direct_copy'
        or (
          parent_sender_email = 'sales@heymarksman.com'
          and parent_sender_domain = 'heymarksman.com'
          and parent_internet_message_id is not null
          and parent_subject is not null
          and parent_source_sha256 = source_sha256
          and original_sender_email is not null
          and original_sender_domain is not null
          and original_internet_message_id is not null
          and original_subject is not null
          and original_source_sha256 is not null
          and cardinality(external_reply_to_addresses) = 1
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'osp_private.gmail_messages'::regclass
      and conname = 'osp_gmail_messages_provenance_hash_check'
  ) then
    alter table osp_private.gmail_messages
      add constraint osp_gmail_messages_provenance_hash_check
      check (
        (parent_source_sha256 is null or parent_source_sha256 ~ '^[0-9a-f]{64}$')
        and (original_source_sha256 is null or original_source_sha256 ~ '^[0-9a-f]{64}$')
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'osp_private.gmail_attachments'::regclass
      and conname = 'osp_gmail_attachments_source_role_check'
  ) then
    alter table osp_private.gmail_attachments
      add constraint osp_gmail_attachments_source_role_check
      check (
        (source_role = 'direct_attachment')
        or (
          source_role = 'original_eml'
          and content_type = 'message/rfc822'
          and filename = 'original.eml'
          and parent_source_sha256 is not null
        )
        or (
          source_role = 'original_attachment'
          and content_type in (
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel.sheet.macroEnabled.12'
          )
          and filename is not null
          and parent_source_sha256 is not null
        )
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'osp_private.gmail_attachments'::regclass
      and conname = 'osp_gmail_attachments_parent_hash_check'
  ) then
    alter table osp_private.gmail_attachments
      add constraint osp_gmail_attachments_parent_hash_check
      check (
        parent_source_sha256 is null
        or parent_source_sha256 ~ '^[0-9a-f]{64}$'
      ) not valid;
  end if;
end
$$;

alter table osp_private.gmail_messages
  validate constraint osp_gmail_messages_source_relationship_check;
alter table osp_private.gmail_messages
  validate constraint osp_gmail_messages_relay_provenance_check;
alter table osp_private.gmail_messages
  validate constraint osp_gmail_messages_provenance_hash_check;
alter table osp_private.gmail_attachments
  validate constraint osp_gmail_attachments_source_role_check;
alter table osp_private.gmail_attachments
  validate constraint osp_gmail_attachments_parent_hash_check;

create unique index if not exists osp_gmail_relay_attachment_hash_role_unique
  on osp_private.gmail_attachments (
    organization_id,
    gmail_message_id,
    source_sha256,
    source_role
  )
  where source_role in ('original_eml', 'original_attachment');
