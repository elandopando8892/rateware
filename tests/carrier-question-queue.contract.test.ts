import { assert, assertEquals } from 'jsr:@std/assert@1.0.14';
import { memoryClient, type Row } from './helpers/memory-client.ts';
const serve = Deno.serve;
Object.defineProperty(Deno, 'serve', { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import('../supabase/functions/rateware-api/index.ts');
Object.defineProperty(Deno, 'serve', { configurable: true, value: serve });
const EVENT = '00000000-0000-4000-8000-000000000001';
const INVITATION = '00000000-0000-4000-8000-000000000002';
const OWNER = 'org:team-a';
async function fixture() {
  Deno.env.set('GMAIL_TOKEN_ENCRYPTION_KEY', 'local-test-only');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('local-test-only'));
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
  const iv = new Uint8Array(12);
  const token = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('fixture-token'));
  const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  const lane = { id: 'lane-a', rfx_event_id: EVENT, lane_number: 1, origin: 'Monterrey, NL', destination: 'Dallas, TX', currency: 'USD' };
  const store = memoryClient({
    rfx_events: [{ id: EVENT, rfx_id: 'RFX-TEST', owner_email: OWNER }], rfx_lanes: [lane],
    rfx_lane_vendors: [{ id: INVITATION, rfx_event_id: EVENT, rfx_lane_id: lane.id, vendor_id: 'carrier-a', invitation_status: 'quoted', invitation_token: 'fixture-only', invitation_token_hash: 'fixture-hash', rfx_events: { owner_email: OWNER }, rfx_lanes: lane }],
    vendors: [{ id: 'carrier-a', owner_email: OWNER, vendor_name: 'Carrier de prueba', domain: 'example.test', primary_email: 'carrier@example.test' }],
    outreach_messages: [], outreach_campaigns: [], outreach_contact_suppressions: [], email_suppression_list: [], contact_history: [], saas_audit_log: [],
    vendor_profile_requests: [{ id: 'profile-fixture', owner_email: OWNER, vendor_id: 'carrier-a', request_token: 'profile-fixture-only', status: 'active', expires_at: '2099-01-01T00:00:00Z' }],
    gmail_mailbox_connections: [{ id: 'gmail-fixture', owner_email: OWNER, mailbox_email: 'sales@heymarksman.com', status: 'connected', scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'], token_expires_at: '2099-01-01T00:00:00Z', access_token_encrypted: `v1:${b64(iv)}:${b64(new Uint8Array(token))}` }],
  });
  const provider: Row[] = [];
  async function call(body: Row, role = 'operator') {
    const handler = createRatewareApiHandler({
      getClient: () => store.client as never,
      authenticate: () => Promise.resolve({ sub: 'user-a', email: 'fixture@example.test', roles: [role], rateware_organization_id: 'team-a' } as never),
      resolveUser: () => Promise.resolve({ owner_email: OWNER, owner_user_id: 'user-a', organization_id: 'team-a' } as never),
    });
    const savedFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input), method = init?.method || 'GET';
      if (!url.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/')) throw new Error(`Unmocked provider: ${url}`);
      provider.push({ method, url });
      return Promise.resolve(new Response(JSON.stringify(method === 'GET' ? { messages: [] } : { id: 'fixture-sent-id', threadId: 'fixture-thread' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }) as typeof fetch;
    try {
      const response = await handler(new Request('https://rateware.test/functions/v1/rateware-api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
      return { status: response.status, body: await response.json() };
    } finally { globalThis.fetch = savedFetch; }
  }
  const question = { action: 'draft_bid_room_carrier_message', rfx_event_id: EVENT, rfx_lane_vendor_id: INVITATION, rfx_lane_id: lane.id, body: '¿Incluye el cruce?', idempotency_key: 'fixture-question-key', confirmed: true, confirmation_action: 'draft_bid_room_carrier_message', app_origin: 'http://127.0.0.1:3018' };
  return { store, provider, call, question };
}
Deno.test('Operate solo prepara un borrador, reintenta sin duplicar y no entrega al proveedor', async () => {
  const f = await fixture();
  const first = await f.call(f.question);
  assertEquals(first.status, 200, JSON.stringify(first.body));
  assertEquals(first.body.outreach_message.status, 'drafted');
  assertEquals(first.body.draft_only, true);
  assertEquals(f.provider.filter(c => c.method !== 'GET'), []);
  assertEquals(f.store.tables.contact_history, []);
  assert(String(first.body.outreach_message.html_body).includes('http://127.0.0.1:3018/rfx-bid.html?token='));
  const second = await f.call(f.question);
  assertEquals(second.status, 200);
  assertEquals(second.body.reused, true);
  assertEquals(f.store.tables.outreach_messages.length, 1);
});
Deno.test('la Cola exige aprobación explícita y solo entonces entrega una vez', async () => {
  const f = await fixture();
  const drafted = await f.call(f.question);
  assertEquals(drafted.body.outreach_message.status, 'drafted');
  const send = { action: 'send_outreach_messages', ids: [drafted.body.outreach_message.id], channel: 'email' };
  assert((await f.call(send)).status >= 400);
  assertEquals(f.provider.filter(c => c.method !== 'GET'), []);
  const approved = { ...send, confirmed: true, confirmation_action: 'send_outreach_messages' };
  assertEquals((await f.call(approved)).body.sent, 1);
  assertEquals((await f.call(approved)).body.sent, 0);
  assertEquals(f.provider.filter(c => c.method === 'POST').length, 1);
});
Deno.test('viewer y evento ajeno no preparan ni envían preguntas', async () => {
  const f = await fixture();
  assertEquals((await f.call(f.question, 'viewer')).status, 403);
  assert((await f.call({ ...f.question, rfx_event_id: 'foreign' })).status >= 400);
  assertEquals(f.provider, []);
  assertEquals(f.store.tables.outreach_messages, []);
});
Deno.test('el endpoint heredado también prepara y exige confirmar su propia acción', async () => {
  const f = await fixture();
  const mismatched = await f.call({ ...f.question, action: 'send_bid_room_carrier_message' });
  assert(mismatched.status >= 400);
  assertEquals(f.store.tables.outreach_messages, []);
  const legacy = await f.call({ ...f.question, action: 'send_bid_room_carrier_message', confirmation_action: 'send_bid_room_carrier_message' });
  assertEquals(legacy.status, 200);
  assertEquals(legacy.body.draft_only, true);
  assertEquals(legacy.body.outreach_message.status, 'drafted');
  assertEquals(f.provider.filter(c => c.method !== 'GET'), []);
});
for (const status of ['sent', 'failed', 'delivery_unknown']) Deno.test(`pregunta histórica ${status}: conserva estado y nunca reenvía desde Operate`, async () => {
  const f = await fixture();
  await f.call(f.question);
  f.store.tables.outreach_messages[0].status = status;
  const retried = await f.call(f.question);
  assertEquals(retried.status, 200);
  assertEquals(retried.body.reused, true);
  assertEquals(retried.body.outreach_message.status, status);
  assertEquals(f.store.tables.outreach_messages.length, 1);
  assertEquals(f.provider.filter(c => c.method !== 'GET'), []);
});
