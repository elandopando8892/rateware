import { assert, assertEquals } from 'jsr:@std/assert@1.0.14';

import { createScheduledGmailPollHandler } from './handler.ts';

const expectedToken = 'x'.repeat(48);
const body = JSON.stringify({ version: 1, action: 'poll_connected_provider_mailbox' });

function request(token = expectedToken, value = body): Request {
  return new Request('https://project.example/functions/v1/osp-gmail-poll', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: value,
  });
}

Deno.test('scheduled Gmail poll authenticates, claims once and returns bounded no-send counts', async () => {
  const calls: string[] = [];
  const receipt = { discovered: 2, insertedMessages: 1, duplicates: 1, attachmentMetadataRows: 3, ospEnqueued: 1, ospProcessed: 1 };
  const handler = createScheduledGmailPollHandler({
    expectedToken,
    claim: async () => { calls.push('claim'); return { status: 'claimed', leaseId: 'lease-1' }; },
    poll: async () => { calls.push('poll'); return receipt; },
    complete: async (value, leaseId) => { calls.push(`complete:${value.insertedMessages}:${leaseId}`); },
    fail: async () => { calls.push('fail'); },
    incidentId: () => 'incident-test',
  });
  const response = await handler(request());
  assertEquals(response.status, 200);
  assertEquals(calls, ['claim', 'poll', 'complete:1:lease-1']);
  assertEquals(await response.json(), {
    version: 1,
    data: { status: 'completed', discovered: 2, inserted_messages: 1, duplicates: 1, attachment_metadata_rows: 3, osp_enqueued: 1, osp_processed: 1, outbound_enabled: false },
  });
});

Deno.test('scheduled Gmail poll skips disabled and busy controls without touching Gmail', async () => {
  for (const reason of ['disabled', 'busy'] as const) {
    let polls = 0;
    const handler = createScheduledGmailPollHandler({
      expectedToken,
      claim: async () => ({ status: reason }),
      poll: async () => { polls += 1; throw new Error('must not run'); },
      complete: async () => undefined,
      fail: async () => undefined,
      incidentId: () => 'incident-test',
    });
    const response = await handler(request());
    assertEquals(response.status, 200);
    assertEquals(polls, 0);
    assertEquals(await response.json(), { version: 1, data: { status: 'skipped', reason, outbound_enabled: false } });
  }
});

Deno.test('scheduled Gmail poll rejects wrong tokens and malformed bodies before claiming', async () => {
  let claims = 0;
  const handler = createScheduledGmailPollHandler({
    expectedToken,
    claim: async () => { claims += 1; return { status: 'claimed', leaseId: 'lease-2' }; },
    poll: async () => ({ discovered: 0, insertedMessages: 0, duplicates: 0, attachmentMetadataRows: 0, ospEnqueued: 0, ospProcessed: 0 }),
    complete: async () => undefined,
    fail: async () => undefined,
    incidentId: () => 'incident-safe',
  });
  assertEquals((await handler(request('wrong-token'))).status, 401);
  assertEquals((await handler(request(expectedToken, JSON.stringify({ version: 1, action: 'other' })))).status, 400);
  assertEquals((await handler(request(expectedToken, JSON.stringify({ version: 1, action: 'poll_connected_provider_mailbox', extra: true })))).status, 400);
  assertEquals(claims, 0);
});

Deno.test('scheduled Gmail poll closes a failed lease and exposes no dependency detail', async () => {
  let failures = 0;
  const handler = createScheduledGmailPollHandler({
    expectedToken,
    claim: async () => ({ status: 'claimed', leaseId: 'lease-3' }),
    poll: async () => { throw new Error('private Gmail refresh token failed'); },
    complete: async () => undefined,
    fail: async (leaseId) => { assertEquals(leaseId, 'lease-3'); failures += 1; },
    incidentId: () => 'incident-safe',
  });
  const response = await handler(request());
  assertEquals(response.status, 503);
  assertEquals(failures, 1);
  const payload = JSON.stringify(await response.json());
  assert(payload.includes('DEPENDENCY_UNAVAILABLE'));
  assert(!payload.includes('refresh token'));
});
