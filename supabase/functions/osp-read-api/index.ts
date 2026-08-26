import postgres from 'npm:postgres@3.4.7';

import { createOspReadRuntime } from './composition.ts';

let runtime: (request: Request) => Promise<Response>;
try {
  runtime = createOspReadRuntime({
    env: Deno.env,
    jwksFetch: globalThis.fetch.bind(globalThis),
    postgresFactory: postgres,
    clock: Date.now,
  });
} catch (error) {
  const diagnostic = error instanceof Error ? error.message : 'UNKNOWN_BOOT_ERROR';
  console.error('OSP_READ_BOOT_FAILED', diagnostic);
  runtime = () => Promise.resolve(new Response(JSON.stringify({
    code: 'SERVICE_UNAVAILABLE',
    message: 'OSP read service is unavailable.',
  }), {
    status: 503,
    headers: { 'content-type': 'application/json' },
  }));
}

Deno.serve(runtime);
