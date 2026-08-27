import assert from 'node:assert/strict';

import { createPostgresFormStore } from './postgres-store.ts';

const organizationId = '11111111-1111-4111-8111-111111111111';
const caseId = '21111111-1111-4111-8111-111111111111';
const mappingId = '31111111-1111-4111-8111-111111111111';
const afterSha256 = 'a'.repeat(64);
const beforeSha256 = 'b'.repeat(64);

type QueryRecord = { text: string; values: unknown[] };

function mappingRow(valuesJson: Record<string, unknown>) {
  return {
    id: mappingId,
    version: 1,
    status: 'unresolved',
    mapping_json: {
      schemaVersion: 1,
      status: 'ready_for_operations_review',
      values: { legal_name: 'Synthetic supplier' },
      fields: [{ fieldId: 'legal_name', source: 'rateware', status: 'prepared', evidenceIds: ['41111111-1111-4111-8111-111111111111'] }],
      externalEffects: false,
    },
    before_sha256: beforeSha256,
    after_sha256: afterSha256,
    updated_at: '2026-08-27T12:00:00.000Z',
    values_json: valuesJson,
  };
}

function fakeSql(valuesJson: Record<string, unknown>) {
  const calls: QueryRecord[] = [];
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim().toLowerCase();
    calls.push({ text, values });
    if (text.startsWith('set local role') || text.startsWith('select set_config') || text.includes('pg_advisory_xact_lock')) return [];
    if (text.includes('from osp_private.command_receipts')) return [];
    if (text.includes('from osp_private.customer_registration_cases') && text.includes('for update')) return [{ state: 'preparing' }];
    if (text.includes('from osp_private.supplier_form_mappings mapping') && text.includes('for update of mapping')) return [mappingRow(valuesJson)];
    if (text.startsWith('insert into osp_private.review_decisions')) return [];
    if (text.startsWith('update osp_private.supplier_form_mappings')) return [{ version: 1 }];
    if (text.startsWith('insert into osp_private.command_receipts')) return [];
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  }, { begin: async <T>(operation: (tx: typeof sql) => Promise<T>) => await operation(sql) });
  return { sql, calls };
}

Deno.test('Postgres form store accepts the exact current automatic mapping in one tenant transaction', async () => {
  const fake = fakeSql({ legal_name: 'Synthetic supplier' });
  const store = createPostgresFormStore({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: () => fake.sql });
  const result = await store.acceptCaseFormMapping({ organizationId, subject: 'operations-user', idempotencyKey: 'mapping-accept-1', caseId, mappingId, expectedMappingVersion: 1, expectedAfterSha256: afterSha256 });
  assert.deepEqual(result, { mappingId, mappingVersion: 1, status: 'accepted', reviewDecisionId: result.reviewDecisionId, replayed: false });
  assert.match(result.reviewDecisionId, /^[0-9a-f-]{36}$/);
  const decision = fake.calls.find((call) => call.text.startsWith('insert into osp_private.review_decisions'));
  assert.ok(decision);
  assert.match(decision.text, /'form_mapping'.*'accepted'.*'osp:operate'.*'mapping_confirmed'/);
  assert.equal(decision.values.includes(organizationId), true);
  assert.equal(decision.values.includes(caseId), true);
  assert.equal(decision.values.includes(mappingId), true);
  assert.equal(decision.values.includes('operations-user'), true);
  assert.equal(decision.values.includes(beforeSha256), true);
  assert.equal(decision.values.includes(afterSha256), true);
  assert.equal(fake.calls.some((call) => call.text.includes('for update of mapping')), true);
  assert.equal(fake.calls.some((call) => call.text.startsWith('insert into osp_private.command_receipts')), true);
});

Deno.test('Postgres form store rejects acceptance when the saved draft differs from the mapped values', async () => {
  const fake = fakeSql({ legal_name: 'Changed supplier' });
  const store = createPostgresFormStore({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: () => fake.sql });
  await assert.rejects(() => store.acceptCaseFormMapping({ organizationId, subject: 'operations-user', idempotencyKey: 'mapping-accept-2', caseId, mappingId, expectedMappingVersion: 1, expectedAfterSha256: afterSha256 }), /FORM_MAPPING_NOT_READY/);
  assert.equal(fake.calls.some((call) => call.text.startsWith('insert into osp_private.review_decisions')), false);
  assert.equal(fake.calls.some((call) => call.text.startsWith('update osp_private.supplier_form_mappings')), false);
});

Deno.test('Postgres form workspace keeps submission closed when document evidence decisions are absent', async () => {
  const templateId = '51111111-1111-4111-8111-111111111111';
  const templateVersionId = '61111111-1111-4111-8111-111111111111';
  const instanceId = '71111111-1111-4111-8111-111111111111';
  const sql = Object.assign(async (strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.startsWith('set local role') || text.startsWith('select set_config')) return [];
    if (text.includes('from osp_private.customer_registration_cases case_row')) return [{ supplier_name: 'Synthetic supplier', aggregate_version: 4, state: 'preparing' }];
    if (text.includes('from osp_private.form_templates template') && text.includes("status = 'published'")) return [{ template_id: templateId, name: 'XBF customer setup', updated_at: '2026-08-27T12:00:00.000Z', version_id: templateVersionId, version: 1, status: 'published', schema_sha256: 'c'.repeat(64) }];
    if (text.includes('from osp_private.form_fields')) return [{ id: '81111111-1111-4111-8111-111111111111', template_version_id: templateVersionId, position: 0, field_key: 'legal_name', definition_json: { label: 'Legal name', required: true, canonicalFieldId: 'supplier.legalName', supplierAliases: [], definition: { kind: 'text', minLength: 1, maxLength: 256 } } }];
    if (text.includes('from osp_private.form_rules')) return [];
    if (text.includes('from osp_private.case_form_instances')) return [{ id: instanceId, version: 1, values_json: { legal_name: 'Synthetic supplier' }, updated_at: '2026-08-27T12:00:00.000Z' }];
    if (text.includes('distinct on (extraction_id)')) return [{ ...mappingRow({ legal_name: 'Synthetic supplier' }), status: 'accepted' }];
    if (text.includes('from osp_private.document_versions version')) return [];
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  }, { begin: async <T>(operation: (tx: typeof sql) => Promise<T>) => await operation(sql) });
  const store = createPostgresFormStore({ databaseUrl: 'postgresql://synthetic.example.test/db', postgresFactory: () => sql });
  const workspace = await store.getCaseFormWorkspace(organizationId, caseId);
  assert.equal(workspace.mappings[0].status, 'accepted');
  assert.equal(workspace.evidenceReady, false);
  assert.equal(workspace.submitForReviewAllowed, false);
});
