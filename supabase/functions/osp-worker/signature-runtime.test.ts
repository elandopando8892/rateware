import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import {
  createPostgresSignatureVaultReader,
  createSignatureJobService,
  createSignatureObjectPort,
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

Deno.test("signature object reader uses the Edge-compatible stream path instead of Blob conversion", async () => {
  let blobPathUsed = false;
  const builder = {
    asStream: () =>
      Promise.resolve({
        data: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
            controller.enqueue(new Uint8Array([3, 4]));
            controller.close();
          },
        }),
        error: null,
      }),
    then: () => {
      blobPathUsed = true;
      throw new TypeError("Blob conversion is unavailable");
    },
  };
  const port = createSignatureObjectPort({
    storage: {
      from: () => ({
        download: () => builder,
      }),
    },
  } as never);
  const bytes = await port.read(
    {
      organizationId: "11111111-1111-4111-8111-111111111111",
      objectId: "input",
    },
    new AbortController().signal,
  );
  assertEquals([...bytes], [1, 2, 3, 4]);
  assertEquals(blobPathUsed, false);
});

Deno.test("signature object reader converts Edge download failures into a stable safe code", async () => {
  const port = createSignatureObjectPort({
    storage: {
      from: () => ({
        download: () => ({
          asStream: () =>
            Promise.reject(new TypeError("runtime-specific detail")),
        }),
      }),
    },
  } as never);
  await assertRejects(
    () =>
      port.read(
        {
          organizationId: "11111111-1111-4111-8111-111111111111",
          objectId: "input",
        },
        new AbortController().signal,
      ),
    Error,
    "SIGNATURE_INPUT_INVALID",
  );
});
