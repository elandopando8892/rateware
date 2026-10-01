import { assert, assertEquals } from 'jsr:@std/assert@1.0.14';
import { memoryClient, type Row } from './helpers/memory-client.ts';
const serve = Deno.serve;
Object.defineProperty(Deno, 'serve', { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import('../supabase/functions/rateware-api/index.ts');
Object.defineProperty(Deno, 'serve', { configurable: true, value: serve });
const RATE = '00000000-0000-4000-8000-000000000001';
const valid = { id: RATE, owner_email: 'org:team-a', status: 'pending_review', all_in_rate: '1200', currency: 'USD', operation: 'Intra-Mex', service: 'One Way', origin_country: 'MX', destination_country: 'MX', vendor_id: 'carrier-a' };
async function approve(input: { row?: Row; patch?: Row; role?: string; action?: string; second?: Row } = {}) {
  const store = memoryClient({ rate_staging: [{ ...valid, ...input.row }, ...(input.second ? [{ ...valid, id: '00000000-0000-4000-8000-000000000002', ...input.second }] : [])], saas_audit_log: [], vendors: [] });
  const handler = createRatewareApiHandler({
    getClient: () => store.client as never,
    authenticate: () => Promise.resolve({ sub: 'user-a', email: 'fixture@example.test', roles: [input.role || 'admin'], rateware_organization_id: 'team-a' } as never),
    resolveUser: () => Promise.resolve({ owner_email: 'org:team-a', owner_user_id: 'user-a', organization_id: 'team-a' } as never),
  });
  const action = input.action || 'update_staging';
  const response = await handler(new Request('https://rateware.test/functions/v1/rateware-api', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, id: RATE, ids: store.tables.rate_staging.map(row => row.id), filters: { mode: 'staging', status: 'pending_review' }, patch: { status: 'approved', ...input.patch }, confirmed: true, confirmation_action: action }),
  }));
  return { status: response.status, body: await response.json(), store };
}
for (const action of ['update_staging', 'bulk_update_staging', 'bulk_update_rate_rows_by_filter']) for (const [label, row] of [
  ['sin tarifa', { all_in_rate: null }], ['tarifa texto', { all_in_rate: 'Tier 1' }],
  ['sin moneda', { currency: null }], ['sin origen', { origin_country: null }],
  ['sin destino', { destination_country: null }], ['sin operación', { operation: null }],
  ['sin servicio', { service: null }], ['cruce incompleto', { operation: 'D2D Export', destination_country: 'US' }],
] as const) Deno.test(`${action}: rechaza ${label} antes de aprobar`, async () => {
  const result = await approve({ action, row });
  assertEquals(result.status, 409);
  assertEquals(result.store.tables.rate_staging[0].status, 'pending_review');
  assertEquals(result.store.writes().filter(call => call.table !== 'saas_audit_log'), []);
});
for (const role of ['operator', 'viewer']) Deno.test(`API directa: ${role} no aprueba`, async () => {
  const result = await approve({ role });
  assertEquals(result.status, 403);
  assertEquals(result.store.writes(), []);
});
for (const action of ['update_staging', 'bulk_update_staging', 'bulk_update_rate_rows_by_filter']) Deno.test(`${action}: tarifa ajena no se modifica ni devuelve`, async () => {
  const result = await approve({ action, row: { owner_email: 'org:foreign' } });
  if (action === 'update_staging') assert(result.status >= 400);
  else assertEquals(result.body.updated, 0);
  assertEquals(result.store.tables.rate_staging[0].status, 'pending_review');
  assertEquals(result.store.writes().filter(call => call.table !== 'saas_audit_log'), []);
  assert(!JSON.stringify(result.body).includes('org:foreign'));
});
Deno.test('admin aprueba tarifa válida; fecha y carrier ausentes siguen siendo aviso', async () => {
  const result = await approve({ row: { vendor_id: null, quote_date: null } });
  assertEquals(result.status, 200);
  assertEquals(result.store.tables.rate_staging[0].status, 'approved');
  assert(result.store.calls.some(call => call.filters.some((filter: unknown[]) => filter[1] === 'owner_email' && filter[2] === 'org:team-a')));
});
Deno.test('valida la tarifa corregida en el mismo patch, no una copia anterior', async () => {
  assertEquals((await approve({ row: { currency: null }, patch: { currency: 'USD' } })).status, 200);
});
Deno.test('lote mixto: ninguna tarifa se aprueba antes de validar todo el lote', async () => {
  const result = await approve({ action: 'bulk_update_staging', second: { currency: null } });
  assertEquals(result.status, 409);
  assertEquals(result.store.tables.rate_staging.map(row => row.status), ['pending_review', 'pending_review']);
});
for (const action of ['bulk_update_staging', 'bulk_update_rate_rows_by_filter']) Deno.test(`${action}: lote válido aprobado y lote mixto sin cambios`, async () => {
  const validBatch = await approve({ action, second: {} });
  assertEquals(validBatch.status, 200, JSON.stringify(validBatch.body));
  assertEquals(validBatch.store.tables.rate_staging.map(row => row.status), ['approved', 'approved']);
  const invalidBatch = await approve({ action, second: { all_in_rate: null } });
  assertEquals(invalidBatch.status, 409, JSON.stringify(invalidBatch.body));
  assertEquals(invalidBatch.store.tables.rate_staging.map(row => row.status), ['pending_review', 'pending_review']);
});

for (const action of ['update_staging', 'bulk_update_staging', 'bulk_update_rate_rows_by_filter']) {
  for (const outcome of ['backup', 'not_awarded', 'submitted', 'withdrawn', 'future_outcome']) Deno.test(`${action}: retiene historia RFx ${outcome}`, async () => {
    const result = await approve({ action, row: { rfx_id: 'RFx-PILOT', rfx_bid_outcome: outcome } });
    assertEquals(result.status, 409);
    assertEquals(result.body.stage, 'staging_approval_not_ready');
    assertEquals(result.store.tables.rate_staging[0].status, 'pending_review');
    assertEquals(result.store.tables.rate_staging[0].rfx_bid_outcome, outcome);
    assertEquals(result.store.writes().filter(call => call.table !== 'saas_audit_log'), []);
  });
  Deno.test(`${action}: primaria adjudicada y carga sin resultado mantienen aprobación`, async () => {
    assertEquals((await approve({ action, row: { rfx_bid_outcome: 'awarded' } })).status, 200);
    assertEquals((await approve({ action, row: { rfx_bid_outcome: null } })).status, 200);
    assertEquals((await approve({ action, row: { rfx_bid_outcome: '  AWARDED  ' } })).status, 200);
  });
  Deno.test(`${action}: patch no puede convertir respaldo en primaria`, async () => {
    const result = await approve({ action, row: { rfx_id: 'RFx-PILOT', rfx_bid_outcome: 'backup' }, patch: { rfx_id: null, rfx_bid_outcome: 'awarded' } });
    assertEquals(result.status, 409);
    assertEquals(result.store.writes().filter(call => call.table !== 'saas_audit_log'), []);
  });
}
for (const action of ['bulk_update_staging', 'bulk_update_rate_rows_by_filter']) Deno.test(`${action}: selección primaria/respaldo rechaza todo antes de escribir`, async () => {
  const result = await approve({ action, row: { rfx_bid_outcome: 'awarded' }, second: { rfx_bid_outcome: 'backup' } });
  assertEquals(result.status, 409);
  assertEquals(result.store.tables.rate_staging.map(row => row.status), ['pending_review', 'pending_review']);
  assertEquals(result.store.writes().filter(call => call.table !== 'saas_audit_log'), []);
});
Deno.test('respaldo sigue siendo corregible sin aprobar ni cambiar su resultado', async () => {
  const result = await approve({ row: { rfx_bid_outcome: 'backup' }, patch: { status: 'pending_review', notes: 'Reviewed fixture; history preserved.', rfx_bid_outcome: 'awarded' } });
  assertEquals(result.status, 200);
  assertEquals(result.store.tables.rate_staging[0].status, 'pending_review');
  assertEquals(result.store.tables.rate_staging[0].rfx_bid_outcome, 'backup');
  assertEquals(result.store.tables.rate_staging[0].notes, 'Reviewed fixture; history preserved.');
});
