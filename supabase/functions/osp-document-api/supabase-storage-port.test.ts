import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';

import { createSupabaseDocumentStoragePort } from './supabase-storage-port.ts';

const bytes = new TextEncoder().encode('synthetic corporate document');
const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

Deno.test('document Storage port writes private bytes, verifies read-back hash, and removes exact opaque keys', async () => {
  const objects = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const port = createSupabaseDocumentStoragePort({
    client: {
      upload: async (objectKey: string, value: Uint8Array) => { objects.set(objectKey, value.slice()); },
      download: async (objectKey: string) => objects.get(objectKey)?.slice() ?? null,
      remove: async (objectKey: string) => { removed.push(objectKey); objects.delete(objectKey); },
      createSignedUrl: async (objectKey: string, expiresInSeconds: number) => `https://storage.example.test/${objectKey}?expires=${expiresInSeconds}`,
    },
  });
  await port.putPrivateObject({ bucketId: 'osp-corporate-documents', opaqueObjectKey: key, bytes, contentType: 'application/pdf', sourceSha256: await sha256(bytes) });
  assertEquals(objects.get(key), bytes);
  assertEquals(await port.createPrivateReadUrl({ bucketId: 'osp-corporate-documents', opaqueObjectKey: key, expiresInSeconds: 60 }), `https://storage.example.test/${key}?expires=60`);
  await port.deletePrivateObject({ bucketId: 'osp-corporate-documents', opaqueObjectKey: key });
  assertEquals(removed, [key]);
});

Deno.test('document Storage port rejects write/read mismatch and invalid keys without exposing a public URL', async () => {
  const port = createSupabaseDocumentStoragePort({ client: { upload: async () => undefined, download: async () => new Uint8Array([0]), remove: async () => undefined } });
  const sourceSha256 = await sha256(bytes);
  await assertRejects(() => port.putPrivateObject({ bucketId: 'osp-corporate-documents', opaqueObjectKey: key, bytes, contentType: 'application/pdf', sourceSha256 }), Error, 'DOCUMENT_STORAGE_INTEGRITY');
  await assertRejects(() => port.deletePrivateObject({ bucketId: 'osp-corporate-documents', opaqueObjectKey: '../unsafe' }), Error, 'DOCUMENT_STORAGE_REJECTED');
  assertEquals('getPublicUrl' in port, false);
});

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
