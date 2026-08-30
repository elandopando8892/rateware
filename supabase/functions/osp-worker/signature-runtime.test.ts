import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import {
  createPostgresSignatureVaultReader,
  createSignatureJobService,
} from "./signature-runtime.ts";

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

Deno.test("signature vault reader returns only one canonical private Base64 asset", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("$"), values });
    return Promise.resolve([{
      decrypted_secret: btoa("private-signature"),
    }]);
  };
  const reader = createPostgresSignatureVaultReader({
    databaseUrl: "postgresql://localhost:5432/osp",
    postgresFactory: () => sql,
  });
  const bytes = await reader.read(
    "osp_signature_jagp_v1",
    new AbortController().signal,
  );
  assertEquals(new TextDecoder().decode(bytes), "private-signature");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].values, ["osp_signature_jagp_v1"]);
});

Deno.test("signature vault reader fails closed on invalid references, duplicate secrets, and malformed Base64", async () => {
  for (
    const [reference, rows] of [
      ["../signature", [{ decrypted_secret: btoa("private-signature") }]],
      ["osp_signature_jagp_v1", []],
      ["osp_signature_jagp_v1", [{ decrypted_secret: "not-base64" }]],
      ["osp_signature_jagp_v1", [{ decrypted_secret: btoa("one") }, {
        decrypted_secret: btoa("two"),
      }]],
    ] as const
  ) {
    const reader = createPostgresSignatureVaultReader({
      databaseUrl: "postgresql://localhost:5432/osp",
      postgresFactory: () => () => Promise.resolve([...rows]),
    });
    await assertRejects(
      () => reader.read(reference, new AbortController().signal),
      Error,
      "SIGNATURE_VAULT_INVALID",
    );
  }
});
