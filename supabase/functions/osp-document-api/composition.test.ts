import { assertEquals, assertThrows } from 'jsr:@std/assert@1.0.14';

import { createDocumentApiRuntime } from './composition.ts';

function environment(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    OSP_KINDE_ISSUER: 'https://auth.example.test',
    OSP_KINDE_CLIENT_ID: 'synthetic-client',
    OSP_DOCUMENT_DATABASE_URL: 'postgres://localhost:55322/osp',
    OSP_MALWARE_SCANNER_ORIGIN: 'https://scanner.example.test',
    OSP_MALWARE_SCANNER_TOKEN: 'synthetic-token-value',
    ...overrides,
  };
  return { get: (name: string) => values[name] };
}

Deno.test('document API runtime composes verified auth, tenant Postgres, private Storage, and managed scanning without eager I/O', () => {
  let fetches = 0;
  let databaseConnections = 0;
  const sql = Object.assign(async () => [], { begin: async (operation: (tx: typeof sql) => Promise<unknown>) => await operation(sql) });
  const runtime = createDocumentApiRuntime({
    env: environment(),
    fetch: async () => { fetches += 1; return new Response(null, { status: 500 }); },
    postgresFactory: () => { databaseConnections += 1; return sql; },
    storageClient: { upload: async () => undefined, download: async () => null, remove: async () => undefined },
  });
  assertEquals(typeof runtime, 'function');
  assertEquals(fetches, 0);
  assertEquals(databaseConnections, 1);
});

Deno.test('document API runtime fails closed on every absent external dependency', () => {
  for (const name of ['OSP_KINDE_ISSUER', 'OSP_KINDE_CLIENT_ID', 'OSP_DOCUMENT_DATABASE_URL', 'OSP_MALWARE_SCANNER_ORIGIN', 'OSP_MALWARE_SCANNER_TOKEN']) {
    assertThrows(() => createDocumentApiRuntime({
      env: environment({ [name]: undefined }), fetch: async () => new Response(null, { status: 500 }),
      postgresFactory: () => Object.assign(async () => [], { begin: async () => undefined }),
      storageClient: { upload: async () => undefined, download: async () => null, remove: async () => undefined },
    }), Error, 'INVALID_RUNTIME_CONFIGURATION');
  }
});
