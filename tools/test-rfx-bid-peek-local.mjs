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
  vendorA: randomUUID(), vendorB: randomUUID(), event: randomUUID(), lane: randomUUID(),
  invitationA: randomUUID(), invitationB: randomUUID()
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
    `RATEWARE_SUPABASE_SERVICE_ROLE_KEY=${serviceKey}\nRFX_INVITATION_TOKEN_ENCRYPTION_KEY=${randomUUID()}\n`,
    { mode: 0o600 });
  serve = spawn('supabase', ['functions', 'serve', '--no-verify-jwt', '--env-file', envPath], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  // Retain only a short, redacted diagnostic if startup fails.
  for (const stream of [serve.stdout, serve.stderr]) {
    stream.on('data', (chunk) => { serveDiagnostics = (serveDiagnostics + String(chunk)).slice(-6000); });
  }
  await waitForFunction();

  await rest('vendors', { method: 'POST', body: [
    { id: ids.vendorA, vendor_name: `CI Carrier A ${runId}`, domain: 'carrier-a.example.invalid', primary_email: 'a@example.invalid' },
    { id: ids.vendorB, vendor_name: `CI Carrier B ${runId}`, domain: 'carrier-b.example.invalid', primary_email: 'b@example.invalid' }
  ] });
  await rest('rfx_events', { method: 'POST', body: {
    id: ids.event, rfx_id: `CI-PEEK-${runId}`, name: 'Isolated private-book test',
    owner_email: 'owner@example.invalid', customer: 'Synthetic CI customer', status: 'open',
    due_date: '2099-12-31', bid_visibility_mode: 'private'
  } });
  await rest('rfx_lanes', { method: 'POST', body: {
    id: ids.lane, rfx_event_id: ids.event, lane_number: 1,
    origin: 'Synthetic origin', destination: 'Synthetic destination', equipment: 'Dry Van'
  } });
  await rest('rfx_lane_vendors', { method: 'POST', body: [
    { id: ids.invitationA, rfx_event_id: ids.event, rfx_lane_id: ids.lane, vendor_id: ids.vendorA, invitation_status: 'invited', invitation_token: tokens.a },
    { id: ids.invitationB, rfx_event_id: ids.event, rfx_lane_id: ids.lane, vendor_id: ids.vendorB, invitation_status: 'invited', invitation_token: tokens.b }
  ] });

  const beforeA = await invitationSnapshot(ids.invitationA);
  const beforeB = await invitationSnapshot(ids.invitationB);
  for (const [token, ownId, otherId] of [[tokens.a, ids.invitationA, ids.invitationB], [tokens.b, ids.invitationB, ids.invitationA]]) {
    const result = await peek(token);
    assert.equal(result.status, 200, `Expected private-book response: ${JSON.stringify(result.body)}`);
    assert.match(result.cache || '', /no-store/);
    assert.equal(result.body.invitation.id, ownId);
    assert.ok(Array.isArray(result.body.carrier_book?.invited));
    assert.ok(result.body.carrier_book.invited.some((row) => row.invitation_id === ownId));
    assert.ok(result.body.carrier_book.invited.every((row) => row.invitation_id !== otherId));
    assert.ok(!JSON.stringify(result.body).includes(tokens.a));
    assert.ok(!JSON.stringify(result.body).includes(tokens.b));
    assert.ok(!('segment_confirmations' in result.body));
    assert.ok(!('bid_history' in result.body));
  }
  assert.deepEqual(await invitationSnapshot(ids.invitationA), beforeA, 'Carrier A read must not mutate invitation');
  assert.deepEqual(await invitationSnapshot(ids.invitationB), beforeB, 'Carrier B read must not mutate invitation');
  assert.equal((await peek(`ci-peek-unknown-${runId}`)).status, 404);

  // Archive only the synthetic fixture; this checks server-side exclusion after revocation.
  await rest('rfx_lane_vendors', { method: 'PATCH', query: `?id=eq.${ids.invitationA}`, body: { invitation_status: 'archived' } });
  assert.equal((await peek(tokens.a)).status, 404);
  assert.equal((await peek(tokens.b)).status, 200);
  console.log('PASS: isolated local private-book peek, tenant separation, read-only state, invalid and archived tokens.');
} finally {
  if (serve?.exitCode === null) serve.kill('SIGTERM');
  await rm(tempDir, { recursive: true, force: true });
}
