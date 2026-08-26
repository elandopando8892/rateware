import postgres from 'postgres';

import { createOspReadRuntime } from './composition.ts';

const runtime = createOspReadRuntime({
  env: Deno.env,
  jwksFetch: globalThis.fetch.bind(globalThis),
  postgresFactory: postgres,
  clock: Date.now,
});

Deno.serve(runtime);
