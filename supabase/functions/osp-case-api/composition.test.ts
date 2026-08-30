import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import { createCaseApiRuntime } from "./composition.ts";

function environment(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    OSP_KINDE_ISSUER: "https://auth.example.test",
    OSP_KINDE_CLIENT_ID: "synthetic-client",
    OSP_CASE_DATABASE_URL: "postgres://localhost:55322/osp",
    ...overrides,
  };
  return { get: (name: string) => values[name] };
}

Deno.test("case API runtime composes Kinde verification with isolated approval pools and no eager network I/O", () => {
  let fetches = 0;
  let databaseConnections = 0;
  const sql = Object.assign(async () => [], {
    begin: async (operation: (tx: typeof sql) => Promise<unknown>) =>
      await operation(sql),
  });
  const runtime = createCaseApiRuntime({
    env: environment(),
    fetch: async () => {
      fetches += 1;
      return new Response(null, { status: 500 });
    },
    postgresFactory: () => {
      databaseConnections += 1;
      return sql;
    },
    storageClient: {
      upload: async () => undefined,
      download: async () => null,
    },
  });
  assertEquals(typeof runtime, "function");
  assertEquals(fetches, 0);
  assertEquals(databaseConnections, 3);
});

Deno.test("case API runtime fails closed when auth or database configuration is absent", () => {
  for (
    const name of [
      "OSP_KINDE_ISSUER",
      "OSP_KINDE_CLIENT_ID",
      "OSP_CASE_DATABASE_URL",
    ]
  ) {
    assertThrows(
      () =>
        createCaseApiRuntime({
          env: environment({ [name]: undefined }),
          fetch: async () => new Response(null, { status: 500 }),
          postgresFactory: () =>
            Object.assign(async () => [], { begin: async () => undefined }),
          storageClient: {
            upload: async () => undefined,
            download: async () => null,
          },
        }),
      Error,
      "INVALID_RUNTIME_CONFIGURATION",
    );
  }
});

Deno.test("case API accepts only the standard TLS database query and relies on verify-full transport", () => {
  let seenUrl = "";
  createCaseApiRuntime({
    env: environment({
      OSP_CASE_DATABASE_URL: "postgres://localhost:55322/osp?sslmode=require",
    }),
    fetch: async () => new Response(null, { status: 500 }),
    postgresFactory: (url: string) => {
      seenUrl = url;
      return Object.assign(async () => [], { begin: async () => undefined });
    },
    storageClient: {
      upload: async () => undefined,
      download: async () => null,
    },
  });
  assertEquals(seenUrl, "postgres://localhost:55322/osp");
});
