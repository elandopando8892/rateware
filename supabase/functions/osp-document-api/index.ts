import { createClient } from 'supabase';
import postgres from 'npm:postgres@3.4.7';

import { createDocumentApiRuntime } from './composition.ts';

function required(name: string): string {
  const value = Deno.env.get(name);
  if (typeof value !== 'string' || value.trim() === '') throw new Error('INVALID_RUNTIME_CONFIGURATION');
  return value.trim();
}

function supabaseOrigin(value: string): string {
  try {
    const parsed = new URL(value);
    const local = parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
    if ((!local && parsed.protocol !== 'https:') || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== '' && parsed.pathname !== '/')) throw new Error('INVALID_RUNTIME_CONFIGURATION');
    return parsed.origin;
  } catch { throw new Error('INVALID_RUNTIME_CONFIGURATION'); }
}

const fetchImplementation = globalThis.fetch.bind(globalThis);
const storageClient = createClient(
  supabaseOrigin(required('SUPABASE_URL')),
  required('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetchImplementation } },
);
const runtime = createDocumentApiRuntime({ env: Deno.env, fetch: fetchImplementation, postgresFactory: postgres, storageClient });

Deno.serve(runtime);
