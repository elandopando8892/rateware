import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';

import { createDocumentService } from './document-service.ts';

const authority = { organizationId: 'org-1', subject: 'ops-subject', permissions: ['osp:operate'] };
const source = {
  documentType: 'proof_of_address' as const,
  contentType: 'application/pdf',
  bytes: new TextEncoder().encode('synthetic quarterly document'),
  validFrom: '2026-08-24',
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    scan: async () => 'clean' as const,
    putPrivateObject: async () => undefined,
    createPrivateReadUrl: async () => 'https://storage.example.test/private-object?token=synthetic',
    deletePrivateObject: async () => undefined,
    createVersion: async () => ({ id: 'version-1', version: 1 }),
    ...overrides,
  };
}

Deno.test('document service creates only private opaque quarterly versions and exact calendar expiry', async () => {
  const writes: unknown[] = [];
  const objects: unknown[] = [];
  const service = createDocumentService(dependencies({
    putPrivateObject: async (input: unknown) => { objects.push(input); },
    createVersion: async (input: unknown) => { writes.push(input); return { id: 'version-1', version: 1 }; },
  }));
  const result = await service.upload(authority, source);
  assertEquals(result, { id: 'version-1', version: 1, expiresAt: '2026-11-24' });
  const persisted = writes[0] as Record<string, unknown>;
  assertEquals(persisted.bucketId, 'osp-corporate-documents');
  assertEquals(typeof persisted.opaqueObjectKey, 'string');
  assertEquals((persisted.opaqueObjectKey as string).includes('proof_of_address'), false);
  assertEquals(persisted.status, 'uploaded');
  assertEquals((persisted.sourceSha256 as string).length, 64);
  assertEquals((objects[0] as Record<string, unknown>).bucketId, 'osp-corporate-documents');
});

Deno.test('document service rejects unsafe MIME, size, malware, missing authority, and caller object keys', async () => {
  const service = createDocumentService(dependencies());
  for (const invalid of [
    { ...source, contentType: 'text/html' },
    { ...source, bytes: new Uint8Array() },
    { ...source, opaqueObjectKey: 'caller/path' },
  ]) await assertRejects(() => service.upload(authority, invalid as never), Error, 'DOCUMENT_UPLOAD_REJECTED');
  const removed: unknown[] = [];
  const infected = createDocumentService(dependencies({ scan: async () => 'infected' as const, deletePrivateObject: async (input: unknown) => { removed.push(input); } }));
  await assertRejects(() => infected.upload(authority, source), Error, 'DOCUMENT_UPLOAD_REJECTED');
  assertEquals(removed.length, 1);
  assertEquals(
    await service.upload({ ...authority, permissions: ['osp:read'] }, source),
    { id: 'version-1', version: 1, expiresAt: '2026-11-24' },
  );
  await assertRejects(() => service.upload({ ...authority, permissions: [] }, source), Error, 'FORBIDDEN');
});

Deno.test('document service requires Operations approval and supersedes without rewriting source evidence', async () => {
  const approvals: unknown[] = [];
  const service = createDocumentService(dependencies({
    approveVersion: async (input: { versionId: string }) => { approvals.push(input); return { id: input.versionId, status: 'approved' as const }; },
  }));
  assertEquals(await service.approve(authority, { versionId: 'version-1', expectedVersion: 1, reviewBeforeSha256: 'a'.repeat(64), reviewAfterSha256: 'a'.repeat(64) }), { id: 'version-1', status: 'approved' });
  assertEquals(approvals.length, 1);
  await assertRejects(
    () => service.approve({ ...authority, permissions: ['osp:read'] }, { versionId: 'version-1', expectedVersion: 1, reviewBeforeSha256: 'a'.repeat(64), reviewAfterSha256: 'a'.repeat(64) }),
    Error,
    'FORBIDDEN',
  );
  await assertRejects(() => service.approve(authority, { versionId: 'version-1', expectedVersion: 1, reviewBeforeSha256: 'a'.repeat(64), reviewAfterSha256: 'b'.repeat(64) }), Error, 'DOCUMENT_REVIEW_HASH_MISMATCH');
});

Deno.test('document service snapshots bytes and removes an orphan if metadata persistence fails', async () => {
  const callerBytes = new TextEncoder().encode('immutable synthetic bytes');
  const stored: Uint8Array[] = [];
  const removed: unknown[] = [];
  const service = createDocumentService(dependencies({
    scan: async () => {
      callerBytes.fill(0);
      return 'clean' as const;
    },
    putPrivateObject: async (input: { bytes: Uint8Array }) => { stored.push(input.bytes); },
    deletePrivateObject: async (input: unknown) => { removed.push(input); },
    createVersion: async () => { throw new Error('DATABASE_TEMPORARY'); },
  }));
  await assertRejects(
    () => service.upload(authority, { ...source, bytes: callerBytes }),
    Error,
    'DOCUMENT_PERSISTENCE_FAILED',
  );
  assertEquals(stored[0]?.[0], 'i'.charCodeAt(0));
  assertEquals(removed.length, 1);
});

Deno.test('case conversion upload requires Operations, passive DOCX policy and private hash-checked bytes', async () => {
  const organizationId = '11111111-1111-4111-8111-111111111111';
  const caseId = '22222222-2222-4222-8222-222222222222';
  const sourceAttachmentId = '33333333-3333-4333-8333-333333333333';
  const converted = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  const stored: unknown[] = [];
  const persisted: unknown[] = [];
  let externalScanCalls = 0;
  const service = createDocumentService(dependencies({
    assertSafeDocx: async () => undefined,
    scan: async () => { externalScanCalls += 1; throw new Error('unexpected external scanner'); },
    putPrivateObject: async (input: unknown) => { stored.push(input); },
    createCaseConversionVersion: async (input: unknown) => {
      persisted.push(input);
      return { id: (input as { convertedVersionId: string }).convertedVersionId, version: 1 };
    },
  }));
  const actor = { organizationId, subject: 'fixture:operator', permissions: ['osp:operate'] };
  const input = { caseId, sourceAttachmentId, sourceSha256: 'a'.repeat(64), bytes: converted };
  const result = await service.uploadCaseConversion(actor, input);
  assertEquals(result.version, 1);
  assertEquals(result.convertedSha256.length, 64);
  assertEquals((persisted[0] as { sourceAttachmentId: string }).sourceAttachmentId, sourceAttachmentId);
  assertEquals((stored[0] as { contentType: string }).contentType,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assertEquals(externalScanCalls, 0);
  await assertRejects(() => service.uploadCaseConversion({ ...actor, permissions: ['osp:read'] }, input), Error, 'FORBIDDEN');
  await assertRejects(() => service.uploadCaseConversion(actor, { ...input, sourceSha256: 'invalid' }), Error, 'DOCUMENT_UPLOAD_REJECTED');
  const unsafe = createDocumentService(dependencies({
    assertSafeDocx: async () => { throw new Error('DOCX_PACKAGE_POLICY_REJECTED'); },
    createCaseConversionVersion: async () => { throw new Error('must not persist'); },
  }));
  await assertRejects(() => unsafe.uploadCaseConversion(actor, input), Error, 'DOCUMENT_UPLOAD_REJECTED');
});

Deno.test('legacy source download is signed only after tenant and source lookup', async () => {
  const calls: string[] = [];
  const service = createDocumentService(dependencies({
    getManualConversionSource: async () => {
      calls.push('lookup');
      return { opaqueObjectKey: '11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333', filename: 'source.doc' };
    },
    createOriginalReadUrl: async () => {
      calls.push('sign');
      return 'https://storage.example.test/source?token=synthetic';
    },
  }));
  const actor = { organizationId: '11111111-1111-4111-8111-111111111111', subject: 'fixture:operator', permissions: ['osp:operate'] };
  const input = { caseId: '22222222-2222-4222-8222-222222222222',
    sourceAttachmentId: '33333333-3333-4333-8333-333333333333', sourceSha256: 'a'.repeat(64) };
  assertEquals((await service.manualConversionSource(actor, input)).expiresInSeconds, 60);
  assertEquals(calls, ['lookup', 'sign']);
  await assertRejects(() => service.manualConversionSource({ ...actor, permissions: ['osp:read'] }, input), Error, 'FORBIDDEN');
  assertEquals(calls, ['lookup', 'sign']);
});

Deno.test('converted candidate download is signed only after exact tenant lookup', async () => {
  const calls: string[] = [];
  const service = createDocumentService(dependencies({
    getManualConversionCandidate: async () => {
      calls.push('lookup');
      return { opaqueObjectKey: '11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444', convertedSha256: 'b'.repeat(64) };
    },
    createPrivateReadUrl: async () => {
      calls.push('sign');
      return 'https://storage.example.test/candidate?token=synthetic';
    },
  }));
  const actor = { organizationId: '11111111-1111-4111-8111-111111111111', subject: 'fixture:operator', permissions: ['osp:operate'] };
  const input = { caseId: '22222222-2222-4222-8222-222222222222',
    sourceAttachmentId: '33333333-3333-4333-8333-333333333333', sourceSha256: 'a'.repeat(64),
    convertedDocumentVersionId: '44444444-4444-4444-8444-444444444444' };
  assertEquals((await service.manualConversionCandidate(actor, input)).convertedSha256, 'b'.repeat(64));
  assertEquals(calls, ['lookup', 'sign']);
  await assertRejects(() => service.manualConversionCandidate({ ...actor, permissions: ['osp:read'] }, input), Error, 'FORBIDDEN');
  assertEquals(calls, ['lookup', 'sign']);
});
