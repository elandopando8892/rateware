import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import { createSupabaseAttachmentPromotionStorage } from "./supabase-attachment-promotion-storage.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";

Deno.test("promotion storage accepts an idempotent duplicate only after target hash verification", async () => {
  const objects = new Map<string, Uint8Array>();
  const client = {
    download: async (bucket: string, key: string) =>
      objects.get(`${bucket}/${key}`) ?? null,
    upload: async (bucket: string, key: string, bytes: Uint8Array) => {
      const target = `${bucket}/${key}`;
      if (objects.has(target)) throw new Error("duplicate");
      objects.set(target, bytes.slice());
    },
    createSignedUrl: async (
      bucket: string,
      key: string,
      expiresInSeconds: number,
    ) =>
      `https://storage.example.test/${bucket}/${key}?expires=${expiresInSeconds}`,
  };
  const storage = createSupabaseAttachmentPromotionStorage({ client });
  const bytes = new TextEncoder().encode("same bytes");
  const sourceSha256 = await sha256Hex(bytes);
  objects.set("osp-originals/source", bytes);
  assertEquals(await storage.downloadOriginal({ objectKey: "source" }), bytes);
  assertEquals(
    await storage.createOriginalReadUrl({
      objectKey: "source",
      expiresInSeconds: 60,
    }),
    "https://storage.example.test/osp-originals/source?expires=60",
  );
  await storage.putCorporate({
    objectKey: "target",
    bytes,
    contentType: "application/pdf",
    sourceSha256,
  });
  await storage.putCorporate({
    objectKey: "target",
    bytes,
    contentType: "application/pdf",
    sourceSha256,
  });
  objects.set("osp-corporate-documents/target", new Uint8Array([0]));
  await assertRejects(
    () =>
      storage.putCorporate({
        objectKey: "target",
        bytes,
        contentType: "application/pdf",
        sourceSha256,
      }),
    Error,
    "SOURCE_HASH_MISMATCH",
  );
});
