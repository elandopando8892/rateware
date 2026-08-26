import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';

import { createSupabaseOriginalObjectStore } from './supabase-original-object-store.ts';

Deno.test('original object store uses generated opaque keys and verifies downloaded SHA-256', async () => {
  const data = new TextEncoder().encode('invented example.test bytes');
  const objects = new Map<string, Uint8Array>();
  const store = createSupabaseOriginalObjectStore({
    client: { upload: async (key, bytes) => { objects.set(key, bytes); }, download: async (key) => objects.get(key) ?? null },
    uuid: () => '11111111-1111-4111-8111-111111111111',
  });
  const saved = await store.put({ organizationId: '22222222-2222-4222-8222-222222222222', bytes: data, contentType: 'message/rfc822', originalFilename: '../../unsafe.exe' });
  assertEquals(saved.key, '22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111');
  assertEquals(saved.sha256.length, 64);
  assertEquals(saved.filename, undefined);
});

Deno.test('original object store rejects a read-back integrity mismatch', async () => {
  const store = createSupabaseOriginalObjectStore({ client: { upload: async () => undefined, download: async () => new TextEncoder().encode('wrong') }, uuid: () => '11111111-1111-4111-8111-111111111111' });
  await assertRejects(() => store.put({ organizationId: '22222222-2222-4222-8222-222222222222', bytes: new TextEncoder().encode('right'), contentType: 'application/octet-stream' }), Error, 'SOURCE_HASH_MISMATCH');
});
