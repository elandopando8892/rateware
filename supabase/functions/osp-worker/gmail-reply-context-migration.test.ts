import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260831101157_osp_gmail_reply_context.sql",
    import.meta.url,
  ),
);

Deno.test("Gmail reply context migration is idempotent and backfills only unambiguous email evidence", () => {
  assertMatch(
    migration,
    /add column if not exists sender_email text[\s\S]*add column if not exists internet_message_id text/i,
  );
  assertMatch(
    migration,
    /from public\.provider_communication_messages message[\s\S]*message\.organization_id[\s\S]*message\.external_message_id/i,
  );
  assertMatch(
    migration,
    /having count\(distinct lower\(btrim\(message\.sender_email\)\)\) = 1[\s\S]*count\(distinct btrim\(message\.internet_message_id\)\) = 1/i,
  );
  assertMatch(
    migration,
    /source\.organization_id = gmail\.organization_id[\s\S]*source\.external_message_id = gmail\.gmail_message_id/i,
  );
  assertMatch(
    migration,
    /validate constraint osp_gmail_messages_sender_email_check/i,
  );
  assertMatch(
    migration,
    /validate constraint osp_gmail_messages_internet_message_id_check/i,
  );
  assertNotMatch(migration, /insert\s+into\s+osp_private\.gmail_messages/i);
});

Deno.test("Gmail thread resolution is a narrow security-definer worker boundary", () => {
  assertMatch(
    migration,
    /create or replace function osp_private\.resolve_authorized_send_thread\([\s\S]*security definer[\s\S]*source\.internet_message_id = draft\.in_reply_to/i,
  );
  assertMatch(
    migration,
    /attempt\.organization_id = p_organization_id[\s\S]*attempt\.id = p_attempt_id[\s\S]*attempt\.job_id = p_job_id[\s\S]*attempt\.outcome = 'sending'[\s\S]*attempt\.send_claim_token = p_send_claim_token/i,
  );
  assertMatch(
    migration,
    /revoke all on function osp_private\.resolve_authorized_send_thread\([\s\S]*from public, anon, authenticated, osp_workflow_api/i,
  );
  assertMatch(
    migration,
    /grant execute on function osp_private\.resolve_authorized_send_thread\([\s\S]*to osp_worker/i,
  );
  assertNotMatch(migration, /grant select[\s\S]*gmail_messages[\s\S]*to osp_worker/i);
});
