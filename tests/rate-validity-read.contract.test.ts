// Actual handler; isolated table projection. No PostgreSQL/RLS or production certification.
import { assertEquals } from 'jsr:@std/assert@1.0.14';
import { memoryClient } from './helpers/memory-client.ts';
const serve = Deno.serve;
Object.defineProperty(Deno, 'serve', { configurable: true, value: () => ({}) });
const { createRatewareApiHandler } = await import('../supabase/functions/rateware-api/index.ts');
Object.defineProperty(Deno, 'serve', { configurable: true, value: serve });
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
for (const action of ['list_staging', 'list_rateware', 'list_rateware_rows_by_ids']) {
  Deno.test(`${action}: conserva vigencia y null sin revelar filas ajenas ni escribir`, async () => {
    const status = action === 'list_staging' ? 'pending_review' : 'approved';
    const rows = [
      { id: uid(1), owner_email: 'org:team-a', status, valid_through: '2026-10-07', created_at: '2026-10-01', source_bid_status: 'awarded' },
      { id: uid(2), owner_email: 'org:team-a', status, valid_through: null, created_at: '2026-09-30', source_bid_status: 'initial' },
      { id: uid(3), owner_email: 'org:team-b', status, valid_through: '2099-12-31', created_at: '2026-10-02' },
    ];
    const store = memoryClient({ rate_staging: rows });
    const handler = createRatewareApiHandler({
      getClient: () => store.client as never,
      authenticate: () => Promise.resolve({ sub: 'user-a', email: 'fixture@example.test', roles: ['viewer'], rateware_organization_id: 'team-a' } as never),
      resolveUser: () => Promise.resolve({ owner_email: 'org:team-a', owner_user_id: 'user-a', organization_id: 'team-a' } as never),
    });
    const response = await handler(new Request('https://rateware.test/functions/v1/rateware-api', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, status, ids: rows.map(row => row.id), limit: 100, offset: 0 }),
    }));
    const body = await response.json();
    assertEquals(response.status, 200, JSON.stringify(body));
    assertEquals(body.rows.map((row: Record<string, unknown>) => [row.id, row.valid_through]), [[uid(1), '2026-10-07'], [uid(2), null]]);
    assertEquals(store.writes(), []);
  });
}
