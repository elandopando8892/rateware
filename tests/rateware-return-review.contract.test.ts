// Real handler with isolated tables; not PostgreSQL/RLS or a production write.
import { assert, assertEquals } from 'jsr:@std/assert@1.0.14';
import { memoryClient } from './helpers/memory-client.ts';
const serve = Deno.serve;
Object.defineProperty(Deno, 'serve', { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import('../supabase/functions/rateware-api/index.ts');
Object.defineProperty(Deno, 'serve', { configurable: true, value: serve });
const RATE = '00000000-0000-4000-8000-000000000001';
const ARCHIVED = '00000000-0000-4000-8000-000000000002';
const reason = 'Controlled fixture recovery; no commercial validity.';
function fixture(role = 'admin', owner = 'org:team-a') {
  const row = { id: RATE, owner_email: owner, status: 'approved', all_in_rate: '1200', currency: 'USD', valid_through: '2026-10-07', mx_border_crossing_point: 'Nuevo Laredo, TM', us_border_crossing_point: 'Laredo, TX', rfx_bid_outcome: 'awarded', notes: 'PRUEBA CONTROLADA' };
  const store = memoryClient({ rate_staging: [row, { ...row, id: ARCHIVED, status: 'archived' }], rfx_lane_vendors: [{ id: 'invitation', rate_staging_id: RATE, bid_rate_staging_id: RATE, award_role: 'primary' }], saas_audit_log: [] });
  const handler = createRatewareApiHandler({ getClient: () => store.client as never,
    authenticate: () => Promise.resolve({ sub: 'user-a', email: 'fixture@example.test', roles: [role], rateware_organization_id: 'team-a' } as never),
    resolveUser: () => Promise.resolve({ owner_email: 'org:team-a', owner_user_id: 'user-a', organization_id: 'team-a' } as never) });
  async function call(ids = [RATE], confirmed = true) {
    const response = await handler(new Request('https://rateware.test/functions/v1/rateware-api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'return_rateware_to_staging', ids, reason, confirmed, confirmation_action: 'return_rateware_to_staging' }) }));
    return { status: response.status, body: await response.json() };
  }
  return { store, call, row };
}
Deno.test('retorno: conserva precio, cruces, vigencia, notas y adjudicación; reintento no duplica', async () => {
  const f = fixture(); const before = structuredClone(f.row); const links = structuredClone(f.store.tables.rfx_lane_vendors);
  const result = await f.call([RATE, ARCHIVED]); assertEquals(result.status, 200); assertEquals(result.body.updated, 1);
  assertEquals(f.row.status, 'pending_review'); assert(f.row.notes.startsWith(before.notes)); assert(f.row.notes.includes(reason));
  for (const key of ['id', 'all_in_rate', 'currency', 'valid_through', 'mx_border_crossing_point', 'us_border_crossing_point', 'rfx_bid_outcome'] as const) assertEquals(f.row[key], before[key]);
  assertEquals(f.store.tables.rfx_lane_vendors, links); assertEquals(f.store.tables.rate_staging[1].status, 'archived');
  const notes = f.row.notes; const writes = f.store.writes().length;
  const again = await f.call(); assertEquals(again.status, 200); assertEquals(again.body.updated, 0);
  assertEquals(f.row.notes, notes); assertEquals(f.store.writes().length, writes); assertEquals(f.store.tables.rate_staging.length, 2);
});
for (const role of ['viewer', 'operator']) Deno.test(`retorno: ${role} recibe 403 sin escribir`, async () => {
  const f = fixture(role); assertEquals((await f.call()).status, 403); assertEquals(f.row.status, 'approved'); assertEquals(f.store.writes(), []);
});
Deno.test('retorno: administrador de otra organización no devuelve ni revela la tarifa', async () => {
  const f = fixture('admin', 'org:foreign'); const result = await f.call(); assertEquals(result.status, 200); assertEquals(result.body.updated, 0);
  assertEquals(f.row.status, 'approved'); assertEquals(f.store.writes(), []); assert(!JSON.stringify(result.body).includes('org:foreign'));
});
Deno.test('retorno: sin confirmación explícita no cambia la tarifa', async () => {
  const f = fixture(); assert((await f.call([RATE], false)).status >= 400); assertEquals(f.row.status, 'approved');
  assertEquals(f.store.writes().filter(call => call.table !== 'saas_audit_log'), []);
  assertEquals(f.store.tables.saas_audit_log.map(row => row.action), ['api.error']);
});
