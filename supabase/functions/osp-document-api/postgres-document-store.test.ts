import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';

import { createPostgresDocumentStore } from './postgres-document-store.ts';

const organizationId = '11111111-1111-4111-8111-111111111111';
const sourceSha256 = 'a'.repeat(64);

function input() {
  return {
    organizationId,
    documentType: 'proof_of_address' as const,
    contentType: 'application/pdf',
    validFrom: '2026-08-24',
    expiresAt: '2026-11-24',
    uploadedBySubject: 'ops-subject',
    bucketId: 'osp-corporate-documents' as const,
    opaqueObjectKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    sizeBytes: 100,
    sourceSha256,
    malwareStatus: 'clean' as const,
    status: 'uploaded' as const,
  };
}

Deno.test('Postgres document store creates a safe review-required immutable version in one tenant transaction', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim().toLowerCase();
    queries.push({ text, values });
    if (text.startsWith('set local role') || text.startsWith('select set_config') || text.includes('pg_advisory_xact_lock')) return [];
    if (text.includes('from osp_private.documents document') && text.includes('for update')) return [];
    if (text.startsWith('insert into osp_private.documents')) return [{ id: '22222222-2222-4222-8222-222222222222', version: 0 }];
    if (text.startsWith('insert into osp_private.document_versions')) return [{ id: values[0], version: 1 }];
    if (text.startsWith('insert into osp_private.source_safety_assessments')) return [];
    if (text.includes('mark_document_review_required_command')) return [{ id: values[0], status: 'review_required' }];
    if (text.startsWith('update osp_private.documents set version')) return [{ version: 1 }];
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  }) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>);
  Object.assign(sql, { begin: async <T>(operation: (tx: typeof sql) => Promise<T>) => await operation(sql) });
  const store = createPostgresDocumentStore({ databaseUrl: 'postgres://localhost:55322/osp', postgresFactory: () => sql });
  const created = await store.createVersion(input());
  assertEquals(created.version, 1);
  assertEquals(typeof created.id, 'string');
  assertEquals(queries.some((query) => query.text.includes('pg_advisory_xact_lock')), true);
  assertEquals(queries.some((query) => query.text.includes("insert into osp_private.source_safety_assessments") && query.values.includes(sourceSha256)), true);
  assertEquals(queries.some((query) => query.text.includes('mark_document_review_required_command')), true);
});

Deno.test('Postgres document store lists only safe org-vault metadata under the bound organization', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim().toLowerCase();
    queries.push({ text, values });
    if (text.startsWith('set local role') || text.startsWith('select set_config')) return [];
    return [{ id: '33333333-3333-4333-8333-333333333333', document_type: 'proof_of_address', version: 1, status: 'review_required', valid_from: '2026-08-24', expires_at: '2026-11-24' }];
  }, { begin: async <T>(operation: (tx: typeof sql) => Promise<T>) => await operation(sql) });
  const store = createPostgresDocumentStore({ databaseUrl: 'postgres://localhost:55322/osp', postgresFactory: () => sql });
  assertEquals(await store.listVersions(organizationId), [{ id: '33333333-3333-4333-8333-333333333333', documentType: 'proof_of_address', version: 1, status: 'review_required', validFrom: '2026-08-24', expiresAt: '2026-11-24' }]);
  assertEquals(queries.some((query) => query.text.includes('version.organization_id = ?') && query.values.includes(organizationId)), true);
  assertEquals(queries.some((query) => /source_sha256|opaque_object_key/.test(query.text)), false);
});

Deno.test('Postgres document store approves only the reviewed persisted source and supersedes the prior approval', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim().toLowerCase();
    queries.push({ text, values });
    if (text.startsWith('set local role') || text.startsWith('select set_config')) return [];
    if (text.includes('from osp_private.document_versions version')) return [{
      id: '33333333-3333-4333-8333-333333333333', document_id: '22222222-2222-4222-8222-222222222222', version: '1',
      status: 'review_required', source_sha256: sourceSha256, case_id: null, aggregate_version: '1',
    }];
    if (text.includes('approve_document_version_command')) return [{ id: '33333333-3333-4333-8333-333333333333', status: 'approved' }];
    if (text.startsWith('insert into osp_private.review_decisions')) return [];
    if (text.startsWith('update osp_private.documents set version')) return [{ version: 2 }];
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  }) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>);
  Object.assign(sql, { begin: async <T>(operation: (tx: typeof sql) => Promise<T>) => await operation(sql) });
  const store = createPostgresDocumentStore({ databaseUrl: 'postgres://localhost:55322/osp', postgresFactory: () => sql });
  assertEquals(await store.approveVersion({
    organizationId, approvedBySubject: 'ops-subject', approvedByPermission: 'osp:operate',
    versionId: '33333333-3333-4333-8333-333333333333', expectedVersion: 1,
    reviewBeforeSha256: sourceSha256, reviewAfterSha256: sourceSha256,
  }), { id: '33333333-3333-4333-8333-333333333333', status: 'approved' });
  assertEquals(queries.some((query) => query.text.includes('approve_document_version_command')), true);
  assertEquals(queries.some((query) => query.text.includes('for update')), false);
  assertEquals(queries.some((query) => query.text.startsWith('insert into osp_private.review_decisions') && query.text.includes("'document_version'") && query.text.includes("'document_approved'")), true);

  const mismatchSql = Object.assign(async (strings: TemplateStringsArray) => {
      const text = strings.join(' ').toLowerCase();
      if (text.includes('set local role') || text.includes('set_config')) return [];
      if (text.includes('from osp_private.document_versions version')) return [{ id: '33333333-3333-4333-8333-333333333333', document_id: '22222222-2222-4222-8222-222222222222', version: 1, status: 'review_required', source_sha256: 'b'.repeat(64), case_id: null, aggregate_version: 1 }];
      return [];
    }, { begin: async (operation: (tx: typeof mismatchSql) => Promise<unknown>) => await operation(mismatchSql) });
  const mismatch = createPostgresDocumentStore({ databaseUrl: 'postgres://localhost:55322/osp', postgresFactory: () => mismatchSql });
  await assertRejects(() => mismatch.approveVersion({
    organizationId, approvedBySubject: 'ops-subject', approvedByPermission: 'osp:operate', versionId: '33333333-3333-4333-8333-333333333333', expectedVersion: 1,
    reviewBeforeSha256: sourceSha256, reviewAfterSha256: sourceSha256,
  }), Error, 'DOCUMENT_REVIEW_HASH_MISMATCH');
});

Deno.test('Postgres document store performs profile review commands atomically under tenant authority', async () => {
  const queries: Array<{ text: string; values: unknown[] }> = [];
  const reviewId = '44444444-4444-4444-8444-444444444444';
  const fieldId = '55555555-5555-4555-8555-555555555555';
  const sql = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim().toLowerCase();
    queries.push({ text, values });
    if (text.startsWith('set local role') || text.startsWith('select set_config')) return [];
    if (text.includes('claim_profile_evidence_review_command')) return [{ review_id: reviewId, review_status: 'in_review', revision: 2 }];
    if (text.includes('decide_profile_evidence_field_command')) return [{ review_id: reviewId, field_id: fieldId, field_status: 'accepted', revision: 3 }];
    if (text.includes('finalize_profile_evidence_review_command')) return [{ review_id: reviewId, review_status: 'approved', verification_status: 'verified', revision: 4 }];
    throw new Error(`UNEXPECTED_QUERY:${text}`);
  }, { begin: async <T>(operation: (tx: typeof sql) => Promise<T>) => await operation(sql) });
  const store = createPostgresDocumentStore({ databaseUrl: 'postgres://localhost:55322/osp', postgresFactory: () => sql });

  assertEquals(await store.claimProfileReview({ organizationId, reviewId, expectedRevision: 1, actorSubject: 'ops-subject', actorPermission: 'osp:operate' }), { reviewId, reviewStatus: 'in_review', revision: 2 });
  assertEquals(await store.decideProfileReviewField({ organizationId, reviewId, fieldId, expectedRevision: 2, decision: 'accepted', decisionNote: 'Evidence matches the proposed value.', reviewerValue: null, actorSubject: 'ops-subject', actorPermission: 'osp:operate' }), { reviewId, fieldId, fieldStatus: 'accepted', revision: 3 });
  assertEquals(await store.finalizeProfileReview({ organizationId, reviewId, expectedRevision: 3, decision: 'approved', decisionNote: 'All fields were reviewed.', actorSubject: 'second-ops-subject', actorPermission: 'osp:operate' }), { reviewId, reviewStatus: 'approved', verificationStatus: 'verified', revision: 4 });

  assertEquals(queries.filter((query) => query.text.startsWith('set local role')).length, 3);
  assertEquals(queries.filter((query) => query.text.startsWith('select set_config')).length, 3);
  assertEquals(queries.some((query) => query.text.includes('insert into public.provider_legal_entity_facts')), false);
  assertEquals(queries.some((query) => /\b(?:send|webhook|email)\b/i.test(query.text)), false);
});
