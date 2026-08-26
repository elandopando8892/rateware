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

Deno.test('document service rejects unsafe MIME, size, malware, hash, permission, and caller object keys', async () => {
  const service = createDocumentService(dependencies());
  for (const invalid of [
    { ...source, contentType: 'text/html' },
    { ...source, bytes: new Uint8Array() },
    { ...source, opaqueObjectKey: 'caller/path' },
  ]) await assertRejects(() => service.upload(authority, invalid as never), Error, 'DOCUMENT_UPLOAD_REJECTED');
  const infected = createDocumentService(dependencies({ scan: async () => 'infected' as const }));
  await assertRejects(() => infected.upload(authority, source), Error, 'DOCUMENT_UPLOAD_REJECTED');
  await assertRejects(() => service.upload({ ...authority, permissions: ['osp:read'] }, source), Error, 'FORBIDDEN');
});

Deno.test('document service requires Operations approval and supersedes without rewriting source evidence', async () => {
  const approvals: unknown[] = [];
  const service = createDocumentService(dependencies({
    approveVersion: async (input: { versionId: string }) => { approvals.push(input); return { id: input.versionId, status: 'approved' as const }; },
  }));
  assertEquals(await service.approve(authority, { versionId: 'version-1', expectedVersion: 1, reviewBeforeSha256: 'a'.repeat(64), reviewAfterSha256: 'a'.repeat(64) }), { id: 'version-1', status: 'approved' });
  assertEquals(approvals.length, 1);
  await assertRejects(() => service.approve(authority, { versionId: 'version-1', expectedVersion: 1, reviewBeforeSha256: 'a'.repeat(64), reviewAfterSha256: 'b'.repeat(64) }), Error, 'DOCUMENT_REVIEW_HASH_MISMATCH');
});

Deno.test('document service snapshots bytes and removes an orphan if metadata persistence fails', async () => {
  const callerBytes = new TextEncoder().encode('immutable synthetic bytes');
  const stored: Uint8Array[] = [];
  const removed: unknown[] = [];
  const service = createDocumentService(dependencies({
    scan: async (bytes: Uint8Array) => {
      callerBytes.fill(0);
      bytes[0] = 88;
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
