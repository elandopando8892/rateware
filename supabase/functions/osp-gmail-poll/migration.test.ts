import { assert, assertEquals } from 'jsr:@std/assert@1.0.14';

const sql = await Deno.readTextFile(new URL('../../migrations/20260828040032_osp_scheduled_gmail_poll_release_v2.sql', import.meta.url));

Deno.test('scheduled Gmail poll migration is fail-closed, bounded and secret-backed', () => {
  assert(sql.includes("add column gmail_poll_enabled boolean not null default false"));
  assert(sql.includes("'osp-gmail-poll-every-5-minutes'"));
  assert(sql.includes("'*/5 * * * *'"));
  assert(sql.includes("where name = 'osp_gmail_poll_secret'"));
  assert(sql.includes("where name = 'osp_gmail_poll_url'"));
  assert(sql.includes("'action', 'poll_connected_provider_mailbox'"));
  assert(sql.includes('add column gmail_poll_lease_id uuid'));
  assert(sql.includes("check ((gmail_poll_last_status = 'running') = (gmail_poll_lease_id is not null))"));
  assert(sql.includes('active := false'));
  assertEquals(/gmail_poll_enabled\s*=\s*true/i.test(sql), false);
  assertEquals(/outbound_enabled\s*=\s*true/i.test(sql), false);
});
