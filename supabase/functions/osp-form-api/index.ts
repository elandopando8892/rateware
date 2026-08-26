import postgres from 'npm:postgres@3.4.7';
import { createFormApiRuntime } from './composition.ts';

const handler = createFormApiRuntime({ env: Deno.env, fetch: globalThis.fetch, postgresFactory: postgres as never });
Deno.serve(handler);
