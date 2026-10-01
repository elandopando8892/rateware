import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Deliberately CI-only: seeding a developer's shared local Supabase is unsafe.
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run only on an isolated GitHub Actions runner');
assert.equal(process.env.RFX_PEEK_LOCAL_ONLY, '1', 'Explicit local-only gate required');

const status = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8' }));
const apiUrl = status.API_URL || status.api_url;
const serviceKey = status.SERVICE_ROLE_KEY || status.service_role_key;
assert.ok(apiUrl && serviceKey, 'Local Supabase API URL and service-role key are required');
const parsedUrl = new URL(apiUrl);
assert.ok(['127.0.0.1', 'localhost'].includes(parsedUrl.hostname), 'Refusing a non-loopback Supabase URL');
const functionUrl = new URL('/functions/v1/rfx-bid-api', apiUrl);
const runId = randomUUID();
const ids = {
  vendorA: randomUUID(), vendorB: randomUUID(), event: randomUUID(), lane: randomUUID(), laneB: randomUUID(), laneDraft: randomUUID(),
  invitationA: randomUUID(), invitationB: randomUUID(), invitationB2: randomUUID(),
  invitationUnsent: randomUUID(), invitationDraft: randomUUID(), campaign: randomUUID(), receiptA: randomUUID()
};
const tokens = { a: `ci-peek-a-${runId}`, b: `ci-peek-b-${runId}` };
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
const tempDir = await mkdtemp(join(tmpdir(), 'rateware-peek-'));
const envPath = join(tempDir, 'edge.env');
let serve;
let serveDiagnostics = '';

async function rest(table, { method = 'GET', query = '', body } = {}) {
  const response = await fetch(new URL(`/rest/v1/${table}${query}`, apiUrl), {
    method, headers: { ...headers, Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  assert.ok(response.ok, `${method} ${table} failed: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function peek(token) {
  const response = await fetch(functionUrl, {
    method: 'POST', headers,
    body: JSON.stringify({ action: 'peek_invitation', token })
  });
  return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
}

async function waitForFunction() {
  let lastResult = 'no response';
  for (let attempt = 0; attempt < 15; attempt++) {
    if (serve.exitCode !== null) {
      const safeDiagnostics = serveDiagnostics.replaceAll(serviceKey, '[redacted]').slice(-3000);
      throw new Error(`Edge server exited with ${serve.exitCode}: ${safeDiagnostics}`);
    }
    try {
      const result = await peek('ci-probe-invalid-token');
      if (result.status === 404) return;
      lastResult = `${result.status} ${JSON.stringify(result.body)}`;
    } catch (error) { lastResult = String(error); }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const safeDiagnostics = `LAST_RESPONSE: ${lastResult}`.replaceAll(serviceKey, '[redacted]').slice(-3000);
  throw new Error(`Local rfx-bid-api did not become ready within 15 seconds: ${safeDiagnostics}`);
}

async function invitationSnapshot(id) {
  const rows = await rest('rfx_lane_vendors', {
    query: `?id=eq.${id}&select=id,invitation_status,viewed_at,updated_at,invitation_token,invitation_token_hash,invitation_token_encrypted`
  });
  assert.equal(rows.length, 1);
  return rows[0];
}

try {
  await writeFile(envPath,
    `RATEWARE_SUPABASE_SERVICE_ROLE_KEY=${serviceKey}\nRFX_INVITATION_TOKEN_ENCRYPTION_KEY=${randomUUID()}\nBID_DEADLINE_UTC_OFFSET=+02:00\n`,
    { mode: 0o600 });
  serve = spawn('supabase', ['functions', 'serve', '--no-verify-jwt', '--env-file', envPath], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  // Retain only a short, redacted diagnostic if startup fails.
  for (const stream of [serve.stdout, serve.stderr]) {
    stream.on('data', (chunk) => { serveDiagnostics = (serveDiagnostics + String(chunk)).slice(-6000); });
  }
  await waitForFunction();

  // Vendor CRM intentionally does not grant service_role INSERT in a clean replay.
  // Seed fixtures as the ephemeral database administrator, not via an app grant.
  execFileSync('docker', ['exec', 'supabase_db_alqjqzqagdmcywpjtnnr', 'psql', '-U', 'postgres', '-d', 'postgres', '-c',
    `insert into public.vendors (id,vendor_name,domain,primary_email) values
     ('${ids.vendorA}','CI Carrier A ${runId}','carrier-a.example.invalid','a@example.invalid'),
     ('${ids.vendorB}','CI Carrier B ${runId}','carrier-b.example.invalid','b@example.invalid')`], { stdio: 'pipe' });
  await rest('rfx_events', { method: 'POST', body: {
    id: ids.event, rfx_id: `CI-PEEK-${runId}`, name: 'Isolated private-book test',
    owner_email: 'owner@example.invalid', customer: 'Synthetic CI customer', status: 'open',
    due_date: '2099-12-31', bid_visibility_mode: 'private'
  } });
  await rest('rfx_lanes', { method: 'POST', body: [
    { id: ids.lane, rfx_event_id: ids.event, lane_number: 1,
      origin: 'Synthetic origin', destination: 'Synthetic destination', equipment: 'Dry Van' },
    { id: ids.laneB, rfx_event_id: ids.event, lane_number: 2,
      origin: 'B-only origin', destination: 'B-only destination', equipment: 'Reefer' },
    { id: ids.laneDraft, rfx_event_id: ids.event, lane_number: 3,
      origin: 'Draft origin', destination: 'Draft destination', equipment: 'Flatbed' }
  ] });
  await rest('rfx_lane_vendors', { method: 'POST', body: [
    { id: ids.invitationA, rfx_event_id: ids.event, rfx_lane_id: ids.lane, vendor_id: ids.vendorA, invitation_status: 'invited', invitation_token: tokens.a },
    { id: ids.invitationB, rfx_event_id: ids.event, rfx_lane_id: ids.lane, vendor_id: ids.vendorB, invitation_status: 'invited', invitation_token: tokens.b },
    { id: ids.invitationB2, rfx_event_id: ids.event, rfx_lane_id: ids.laneB, vendor_id: ids.vendorB, invitation_status: 'invited', invitation_token: `ci-peek-b2-${runId}` },
    { id: ids.invitationUnsent, rfx_event_id: ids.event, rfx_lane_id: ids.laneB, vendor_id: ids.vendorA, invitation_status: 'invited', invitation_token: `ci-unsent-${runId}` },
    { id: ids.invitationDraft, rfx_event_id: ids.event, rfx_lane_id: ids.laneDraft, vendor_id: ids.vendorA, invitation_status: 'drafted', invitation_token: `ci-draft-${runId}` }
  ] });

  assert.equal((await peek(tokens.a)).status, 404, 'An unsent invitation must not grant a book');
  // These are synthetic database receipts, not actual email/WhatsApp transmissions.
  const sql = (statement) => execFileSync('docker', ['exec', 'supabase_db_alqjqzqagdmcywpjtnnr',
    'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', statement], { stdio: 'pipe' });
  sql(`insert into public.outreach_campaigns (id,owner_email,rfx_event_id,name) values
    ('${ids.campaign}','owner@example.invalid','${ids.event}','Synthetic receipts only');
    insert into public.outreach_messages
      (id,campaign_id,owner_email,vendor_id,rfx_event_id,rfx_lane_vendor_id,channel,status,sent_at,provider,provider_message_id,delivery_status,metadata)
    values
      ('${ids.receiptA}','${ids.campaign}','owner@example.invalid','${ids.vendorA}','${ids.event}','${ids.invitationA}','email','sent',now(),'gmail',null,'sent','{}'),
      ('${randomUUID()}','${ids.campaign}','owner@example.invalid','${ids.vendorB}','${ids.event}','${ids.invitationB}','email','sent',now(),'gmail','synthetic-ci-provider-b','sent',
        '{"rfx_lane_vendor_ids":["${ids.invitationB}","${ids.invitationB2}","${ids.invitationA}"]}'),
      ('${randomUUID()}','${ids.campaign}','owner@example.invalid','${ids.vendorA}','${ids.event}','${ids.invitationDraft}','email','sent',now(),'gmail','synthetic-ci-provider-draft','sent','{}')`);
  assert.equal((await peek(tokens.a)).status, 404, 'A sent label without an accountable receipt is insufficient');
  sql(`update public.outreach_messages set provider_message_id='synthetic-ci-provider-a' where id='${ids.receiptA}'`);

  const beforeA = await invitationSnapshot(ids.invitationA);
  const beforeB = await invitationSnapshot(ids.invitationB);
  for (const [token, ownId, otherId] of [[tokens.a, ids.invitationA, ids.invitationB], [tokens.b, ids.invitationB, ids.invitationA]]) {
    const result = await peek(token);
    assert.equal(result.status, 200, `Expected private-book response: ${JSON.stringify(result.body)}`);
    assert.match(result.cache || '', /no-store/);
    assert.equal(result.body.invitation.id, ownId);
    assert.deepEqual(result.body.delivery_evidence, { contractVersion: 'rateware-private-book-sent.v1', source: 'outreach_messages', sentOnly: true });
    assert.equal(result.body.invitation.expires_at, '2099-12-31T21:59:59.000Z', 'Response must use configured server deadline');
    assert.equal(result.body.invitation.delivery_receipt.basis, 'provider_accepted');
    assert.ok(!JSON.stringify(result.body).includes('synthetic-ci-provider'), 'Provider receipt IDs must stay server-side');
    assert.ok(!JSON.stringify(result.body).includes(ids.invitationUnsent));
    assert.ok(!JSON.stringify(result.body).includes(ids.invitationDraft));
    assert.equal(result.body.invitation.vendor_id, ownId === ids.invitationA ? ids.vendorA : ids.vendorB);
    assert.equal(result.body.invitation.rfx_events?.id, ids.event);
    assert.equal(result.body.invitation.rfx_lanes?.id, ids.lane);
    assert.ok(result.body.invitation.vendors?.vendor_name, 'Loads needs the carrier name');
    assert.ok(Array.isArray(result.body.carrier_book?.invited));
    assert.ok(result.body.carrier_book.invited.some((row) => row.invitation_id === ownId));
    assert.ok(result.body.carrier_book.invited.every((row) => row.invitation_id !== otherId));
    for (const row of result.body.carrier_book.invited) {
      assert.equal(row.is_invited, true);
      assert.equal(row.rfx_event_id, row.event?.id);
      assert.equal(row.rfx_lane_id, row.lane?.id);
      assert.equal(row.event?.status, 'open');
      assert.ok(Date.parse(row.event?.due_date) > Date.now());
    }
    assert.deepEqual(result.body.carrier_book.open_not_invited, []);
    assert.equal(result.body.carrier_book.summary.not_invited_open, 0);
    if (ownId === ids.invitationA) {
      assert.ok(!JSON.stringify(result.body).includes(ids.laneB), 'Carrier A must not see B-only lane');
      assert.ok(!JSON.stringify(result.body).includes(ids.invitationB2), 'Carrier A must not see B-only invitation');
    } else {
      assert.ok(result.body.carrier_book.invited.some((row) => row.invitation_id === ids.invitationB2), 'Carrier B must see its own second lane');
    }
    assert.ok(!JSON.stringify(result.body).includes(tokens.a));
    assert.ok(!JSON.stringify(result.body).includes(tokens.b));
    assert.ok(!JSON.stringify(result.body).includes(`ci-peek-b2-${runId}`));
    assert.doesNotMatch(JSON.stringify(result.body), /invitation_token(?:_hash|_encrypted)?/);
    assert.ok(!('segment_confirmations' in result.body));
    assert.ok(!('bid_history' in result.body));
  }
  assert.deepEqual(await invitationSnapshot(ids.invitationA), beforeA, 'Carrier A read must not mutate invitation');
  assert.deepEqual(await invitationSnapshot(ids.invitationB), beforeB, 'Carrier B read must not mutate invitation');
  assert.equal((await peek(`ci-peek-unknown-${runId}`)).status, 404);
  assert.equal((await peek(`ci-draft-${runId}`)).status, 404);
  sql(`update public.outreach_messages set status='delivery_unknown' where id='${ids.receiptA}'`);
  assert.equal((await peek(tokens.a)).status, 404, 'Unknown delivery cannot grant a book');
  sql(`update public.outreach_messages set status='sent' where id='${ids.receiptA}'`);

  // Archive only the synthetic fixture; this checks server-side exclusion after revocation.
  await rest('rfx_lane_vendors', { method: 'PATCH', query: `?id=eq.${ids.invitationA}`, body: { invitation_status: 'archived' } });
  assert.equal((await peek(tokens.a)).status, 404);
  assert.equal((await peek(tokens.b)).status, 200);
  await rest('rfx_events', { method: 'PATCH', query: `?id=eq.${ids.event}`, body: { due_date: '2000-01-01' } });
  assert.equal((await peek(tokens.b)).status, 404, 'Expired root must be denied');
  console.log('PASS: isolated local private-book, scoped send evidence, authoritative deadline, tenant separation, read-only state and denials.');
} finally {
  if (serve?.exitCode === null) serve.kill('SIGTERM');
  await rm(tempDir, { recursive: true, force: true });
}
