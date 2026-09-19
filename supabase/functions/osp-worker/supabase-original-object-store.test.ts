import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { sha256Hex } from "../_shared/osp/source-hash.ts";
import { createSupabaseOriginalObjectStore } from "./supabase-original-object-store.ts";

Deno.test("original object store uses generated opaque keys and verifies downloaded SHA-256", async () => {
  const data = new TextEncoder().encode("invented example.test bytes");
  const objects = new Map<string, Uint8Array>();
  const store = createSupabaseOriginalObjectStore({
    client: {
      upload: async (key, bytes) => {
        objects.set(key, bytes);
      },
      download: async (key) => objects.get(key) ?? null,
    },
    uuid: () => "11111111-1111-4111-8111-111111111111",
  });
  const saved = await store.put({
    organizationId: "22222222-2222-4222-8222-222222222222",
    bytes: data,
    contentType: "message/rfc822",
    originalFilename: "../../unsafe.exe",
  });
  assertEquals(
    saved.key,
    "22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111",
  );
  assertEquals(saved.sha256.length, 64);
  assertEquals(saved.filename, undefined);
});

Deno.test("original object store calls the platform UUID generator with its required receiver", async () => {
  const objects = new Map<string, Uint8Array>();
  const store = createSupabaseOriginalObjectStore({
    client: {
      upload: async (key, bytes) => {
        objects.set(key, bytes);
      },
      download: async (key) => objects.get(key) ?? null,
    },
  });
  const saved = await store.put({
    organizationId: "22222222-2222-4222-8222-222222222222",
    bytes: new TextEncoder().encode("synthetic"),
    contentType: "message/rfc822",
  });
  assertEquals(
    /^22222222-2222-4222-8222-222222222222\/[0-9a-f-]{36}$/.test(saved.key),
    true,
  );
});

Deno.test("original object store rejects a read-back integrity mismatch", async () => {
  const store = createSupabaseOriginalObjectStore({
    client: {
      upload: async () => undefined,
      download: async () => new TextEncoder().encode("wrong"),
    },
    uuid: () => "11111111-1111-4111-8111-111111111111",
  });
  await assertRejects(
    () =>
      store.put({
        organizationId: "22222222-2222-4222-8222-222222222222",
        bytes: new TextEncoder().encode("right"),
        contentType: "application/octet-stream",
      }),
    Error,
    "SOURCE_HASH_MISMATCH",
  );
});

Deno.test("original object store reuses a guarded parser digest without a CPU-heavy readback", async () => {
  let downloads = 0;
  const bytes = new TextEncoder().encode("already verified by guarded parser");
  const preverifiedSha256 = await sha256Hex(bytes);
  const store = createSupabaseOriginalObjectStore({
    client: {
      upload: async () => undefined,
      download: async () => {
        downloads++;
        return bytes;
      },
    },
    uuid: () => "11111111-1111-4111-8111-111111111111",
  });
  const saved = await store.put({
    organizationId: "22222222-2222-4222-8222-222222222222",
    bytes,
    contentType: "message/rfc822",
    preverifiedSha256,
  });
  assertEquals(saved.sha256, preverifiedSha256);
  assertEquals(downloads, 0);
});

Deno.test("original object store rejects an invalid guarded digest before upload", async () => {
  let uploads = 0;
  const store = createSupabaseOriginalObjectStore({
    client: {
      upload: async () => {
        uploads++;
      },
      download: async () => null,
    },
  });
  await assertRejects(
    () =>
      store.put({
        organizationId: "22222222-2222-4222-8222-222222222222",
        bytes: new Uint8Array([1]),
        contentType: "message/rfc822",
        preverifiedSha256: "not-a-sha",
      }),
    Error,
    "INVALID_SOURCE_OBJECT",
  );
  assertEquals(uploads, 0);
});

Deno.test("original object store classifies thrown upload and download failures without leaking provider details", async () => {
  const input = {
    organizationId: "22222222-2222-4222-8222-222222222222",
    bytes: new TextEncoder().encode("synthetic"),
    contentType: "message/rfc822",
  };
  const uploadFailure = createSupabaseOriginalObjectStore({
    client: {
      upload: async () => {
        throw new Error("provider secret detail");
      },
      download: async () => null,
    },
    uuid: () => "11111111-1111-4111-8111-111111111111",
  });
  await assertRejects(
    () => uploadFailure.put(input),
    Error,
    "STORAGE_UPLOAD_TEMPORARY",
  );

  const downloadFailure = createSupabaseOriginalObjectStore({
    client: {
      upload: async () => undefined,
      download: async () => {
        throw new Error("provider secret detail");
      },
    },
    uuid: () => "11111111-1111-4111-8111-111111111111",
  });
  await assertRejects(
    () => downloadFailure.put(input),
    Error,
    "STORAGE_DOWNLOAD_TEMPORARY",
  );
});
