import assert from 'node:assert/strict';

import { createOspRuntimeJwtVerifier } from './auth-runtime.ts';

function environment(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    OSP_AUTH_PROVIDER: 'supabase',
    SUPABASE_URL: 'https://alqjqzqagdmcywpjtnnr.supabase.co',
    ...overrides,
  };
  return { get: (name: string) => values[name] };
}

Deno.test('runtime auth can select the existing Rateware Supabase project without eager network', () => {
  let fetches = 0;
  const verifier = createOspRuntimeJwtVerifier({
    env: environment(),
    fetch: (() => {
      fetches += 1;
      return Promise.reject(new Error('must stay lazy'));
    }) as typeof fetch,
  });
  assert.equal(typeof verifier.verifyWorkflow, 'function');
  assert.equal(typeof verifier.verifyApproval, 'function');
  assert.equal(fetches, 0);
});

Deno.test('runtime auth rejects a separate Supabase project and unknown provider', () => {
  assert.throws(() => createOspRuntimeJwtVerifier({
    env: environment({ SUPABASE_URL: 'https://another-project.supabase.co' }),
    fetch,
  }), /INVALID_RUNTIME_CONFIGURATION/);
  assert.throws(() => createOspRuntimeJwtVerifier({
    env: environment({ OSP_AUTH_PROVIDER: 'other' }),
    fetch,
  }), /INVALID_RUNTIME_CONFIGURATION/);
});
