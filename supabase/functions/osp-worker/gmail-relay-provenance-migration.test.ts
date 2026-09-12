import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260912090000_osp_gmail_relay_provenance.sql",
    import.meta.url,
  ),
);

Deno.test("relay provenance migration keeps parent, original, reply, and attachment relationships separate", () => {
  assertMatch(
    migration,
    /add column if not exists source_relationship text[\s\S]*parent_sender_email text[\s\S]*parent_internet_message_id text[\s\S]*parent_source_sha256 text/i,
  );
  assertMatch(
    migration,
    /original_sender_email text[\s\S]*original_sender_domain text[\s\S]*original_to_addresses text\[\][\s\S]*original_cc_addresses text\[\][\s\S]*original_source_sha256 text/i,
  );
  assertMatch(
    migration,
    /external_reply_to_addresses text\[\][\s\S]*external_reply_cc_addresses text\[\]/i,
  );
  assertMatch(
    migration,
    /gmail_attachments[\s\S]*filename text[\s\S]*source_role text[\s\S]*parent_source_sha256 text/i,
  );
  assertMatch(
    migration,
    /source_role in \('original_eml', 'original_attachment'\)/i,
  );
  assertMatch(
    migration,
    /validate constraint osp_gmail_messages_relay_provenance_check/i,
  );
  assertNotMatch(migration, /insert\s+into\s+osp_private\.background_jobs/i);
  assertNotMatch(migration, /update\s+osp_private\.background_jobs/i);
  assertNotMatch(migration, /outbound_enabled\s*=\s*true/i);
});
