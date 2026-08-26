import { assertEquals } from 'jsr:@std/assert@1.0.14';

import { runComposedWorker } from './index.ts';

Deno.test('composed worker creates concrete intake persistence when no adapter is injected', async () => {
  let factoryCalls = 0;
  const sql = Object.assign(async () => [], { begin: async <T>(operation: (transaction: typeof sql) => Promise<T>) => await operation(sql) });
  const result = await runComposedWorker({
    databaseUrl: 'postgresql://synthetic.example.test/db',
    gmailAccessToken: async () => 'local-token',
    storageClient: { upload: async () => undefined, download: async () => null },
    workerId: 'worker-1',
    postgresFactory: () => { factoryCalls += 1; return sql; },
  } as never);
  assertEquals(result, 0);
  assertEquals(factoryCalls, 3);
});
