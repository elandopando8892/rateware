import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";

import {
  createPostgresSignaturePolicyPort,
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

Deno.test("signature policy commits its worker transaction before the privileged Vault read", async () => {
  const calls: string[] = [];
  const transaction = (strings: TemplateStringsArray) => {
    const query = strings.join("$");
    if (query.includes("set local role")) calls.push("set-worker-role");
    else if (query.includes("resolve_signature_application_policy")) {
      calls.push("resolve-policy");
      return Promise.resolve([{
        vault_ref: "osp_signature_jagp_v1",
        content_type: "image/png",
        target_kind: "xlsx",
        worksheet_name: "Customer setup",
        cell_range: "C16:C21",
      }]);
    }
    return Promise.resolve([]);
  };
  const sql = Object.assign(transaction, {
    begin: async <T>(operation: (tx: typeof transaction) => Promise<T>) => {
      calls.push("begin");
      const result = await operation(transaction);
      calls.push("commit");
      return result;
    },
  });
  const policy = createPostgresSignaturePolicyPort({
    databaseUrl: "postgresql://localhost:5432/osp",
    postgresFactory: () => sql,
    vault: {
      read: () => {
        calls.push("read-vault");
        return Promise.resolve(new Uint8Array([1, 2, 3]));
      },
    },
  });
  const resolved = await policy.resolve({
    organizationId: "11111111-1111-4111-8111-111111111111",
    caseId: "22222222-2222-4222-8222-222222222222",
    approvalId: "33333333-3333-4333-8333-333333333333",
    jobId: "44444444-4444-4444-8444-444444444444",
    leaseToken: "55555555-5555-4555-8555-555555555555",
    positionVersion: 1,
  }, new AbortController().signal);
  assertEquals(calls, [
    "begin",
    "set-worker-role",
    "resolve-policy",
    "commit",
    "read-vault",
  ]);
  assertEquals(resolved.targetKind, "xlsx");
  assertEquals([...resolved.signatureBytes], [1, 2, 3]);
});

Deno.test("signature object reader uses an exact signed URL instead of the Edge Blob path", async () => {
  let blobPathUsed = false;
  let requestedUrl = "";
  const port = createSignatureObjectPort({
    storage: {
      url: "https://example.supabase.co/storage/v1",
      from: () => ({
        download: () => {
          blobPathUsed = true;
          throw new TypeError("Blob conversion is unavailable");
        },
        createSignedUrl: () =>
          Promise.resolve({
            data: {
              signedUrl:
                "https://example.supabase.co/storage/v1/object/sign/osp-derived-documents/input?token=opaque",
            },
            error: null,
          }),
      }),
    },
  } as never, "osp-derived-documents", (url) => {
    requestedUrl = String(url);
    return Promise.resolve(new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3, 4]));
          controller.close();
        },
      }),
      { status: 200 },
    ));
  });
  const bytes = await port.read(
    {
      organizationId: "11111111-1111-4111-8111-111111111111",
      objectId: "input",
    },
    new AbortController().signal,
  );
  assertEquals([...bytes], [1, 2, 3, 4]);
  assertEquals(blobPathUsed, false);
  assertEquals(
    requestedUrl,
    "https://example.supabase.co/storage/v1/object/sign/osp-derived-documents/input?token=opaque",
  );
});

Deno.test("signature object reader converts Edge download failures into a stable safe code", async () => {
  const port = createSignatureObjectPort({
    storage: {
      url: "https://example.supabase.co/storage/v1",
      from: () => ({
        createSignedUrl: () =>
          Promise.reject(new TypeError("runtime-specific detail")),
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

Deno.test("signature object reader rejects a cross-origin signed URL before fetch", async () => {
  let fetched = false;
  const port = createSignatureObjectPort({
    storage: {
      url: "https://example.supabase.co/storage/v1",
      from: () => ({
        createSignedUrl: () =>
          Promise.resolve({
            data: {
              signedUrl:
                "https://attacker.invalid/storage/v1/object/sign/osp-derived-documents/input?token=opaque",
            },
            error: null,
          }),
      }),
    },
  } as never, "osp-derived-documents", () => {
    fetched = true;
    return Promise.resolve(new Response(null, { status: 200 }));
  });
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
  assertEquals(fetched, false);
});
