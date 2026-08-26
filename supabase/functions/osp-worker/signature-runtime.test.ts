import { assertEquals } from "jsr:@std/assert@1.0.14";

import { createSignatureJobService } from "./signature-runtime.ts";

Deno.test("signature runtime composes the production Postgres adapter without eager I/O", () => {
  const service = createSignatureJobService({
    databaseUrl: "postgresql://localhost:5432/osp",
    storageClient: {
      upload: () => Promise.resolve(),
      download: () => Promise.resolve(null),
    },
    vault: {
      read: () => Promise.resolve(new Uint8Array([1])),
    },
  });
  assertEquals(typeof service.apply, "function");
});
