import { assertEquals } from 'jsr:@std/assert@1.0.14';

import { createPostgresQuarterlyDocumentService } from './postgres-quarterly-document-service.ts';

Deno.test('Postgres quarterly service scopes reads and persists idempotent alert boundaries', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim().toLowerCase();
    queries.push({ text, values });
    if (text.startsWith('select set_config')) return [];
    if (text.includes('from osp_private.document_versions')) return [
      { id: 'version-1', document_type: 'proof_of_address', version: 1, status: 'approved', valid_from: '2026-08-01', expires_at: '2026-09-01' },
      { id: 'version-2', document_type: 'sat_compliance_opinion', version: 1, status: 'approved', valid_from: '2026-08-01', expires_at: '2026-09-01' },
      { id: 'version-3', document_type: 'tax_status_certificate', version: 1, status: 'approved', valid_from: '2026-08-01', expires_at: '2026-09-01' },
      { id: 'version-4', document_type: 'bank_statement', version: 1, status: 'approved', valid_from: '2026-08-01', expires_at: '2026-09-01' },
    ];
    return [];
  };
  (sql as unknown as { begin: (operation: (tx: typeof sql) => Promise<unknown>) => Promise<unknown> }).begin = (operation) => operation(sql);
  const service = createPostgresQuarterlyDocumentService({ databaseUrl: 'postgres://localhost:55322/osp', postgresFactory: () => sql });
  const result = await service.check({ organizationId: '11111111-1111-4111-8111-111111111111', referenceDate: new Date('2026-08-24T00:00:00.000Z'), correlationId: 'job-1' });
  assertEquals(result.blocked, false);
  assertEquals(queries.filter((query) => query.text.startsWith('insert into osp_private.document_renewal_alerts')).length, 8);
  assertEquals(queries.some((query) => query.text.includes('on conflict (organization_id, document_version_id, boundary_days) do nothing')), true);
  assertEquals(queries.some((query) => query.text.includes('document.organization_id = ?')), true);
});
