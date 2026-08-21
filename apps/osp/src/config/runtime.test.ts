import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  authRedirectUri,
  getRuntimeConfig,
  parseRuntimeConfig,
} from './runtime';

const validEnv = {
  VITE_KINDE_DOMAIN: 'https://auth.heymarksman.com',
  VITE_KINDE_CLIENT_ID: '25b7de39865b49308cf4d670d1c9a3cf',
  VITE_SUPABASE_URL: 'https://alqjqzqagdmcywpjtnnr.supabase.co',
};

describe('runtime configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('accepts the approved public configuration values', () => {
    expect(parseRuntimeConfig(validEnv)).toEqual(validEnv);
  });

  test('rejects configuration without the Kinde domain', () => {
    expect(() => parseRuntimeConfig({})).toThrow(/VITE_KINDE_DOMAIN/);
  });

  test('reads the public configuration from Vite runtime environment', () => {
    vi.stubEnv('VITE_KINDE_DOMAIN', validEnv.VITE_KINDE_DOMAIN);
    vi.stubEnv('VITE_KINDE_CLIENT_ID', validEnv.VITE_KINDE_CLIENT_ID);
    vi.stubEnv('VITE_SUPABASE_URL', validEnv.VITE_SUPABASE_URL);

    expect(getRuntimeConfig()).toEqual(validEnv);
  });
});

describe('OSP auth callback', () => {
  test('uses the app path for local development', () => {
    expect(authRedirectUri('http://localhost:8791')).toBe('http://localhost:8791/app');
  });

  test('uses the app path for the production origin', () => {
    expect(authRedirectUri('https://osp.heymarksman.com')).toBe('https://osp.heymarksman.com/app');
  });

  test('rejects an unexpected production origin', () => {
    expect(() => authRedirectUri('https://partners.heymarksman.com', true)).toThrow(/production origin/i);
  });
});
