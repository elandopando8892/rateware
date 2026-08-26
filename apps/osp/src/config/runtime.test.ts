import { describe, expect, it } from 'vitest';

import {
  assertAllowedAppOrigin,
  authRedirectUri,
  loadRuntimeConfig,
} from './runtime';

const valid = {
  VITE_KINDE_DOMAIN: 'https://auth.heymarksman.com',
  VITE_KINDE_CLIENT_ID: 'synthetic-public-client',
  VITE_KINDE_AUDIENCE: 'https://osp.heymarksman.com/api',
  VITE_SUPABASE_URL: 'https://project.example.test',
  VITE_OSP_BUILD_PROFILE: 'local-e2e',
};
const preview = { ...valid, VITE_OSP_BUILD_PROFILE: 'preview-synthetic' as const };

describe('loadRuntimeConfig', () => {
  it('accepts only the complete approved synthetic local-e2e configuration', () => {
    expect(loadRuntimeConfig(valid)).toEqual(valid);
    expect(loadRuntimeConfig(preview)).toEqual(preview);
  });

  it.each([
    ['VITE_KINDE_DOMAIN', 'https://auth.example.test'],
    ['VITE_KINDE_CLIENT_ID', 'another-synthetic-client'],
    ['VITE_KINDE_AUDIENCE', 'https://osp.heymarksman.com/api/v2'],
    ['VITE_SUPABASE_URL', 'http://localhost:54321'],
    ['VITE_OSP_BUILD_PROFILE', 'production'],
  ] as const)('rejects an unapproved %s value', (key, value) => {
    expect(() => loadRuntimeConfig({ ...valid, [key]: value })).toThrow();
  });

  it.each(Object.keys(valid) as Array<keyof typeof valid>)('rejects missing %s', (key) => {
    const environment = { ...valid } as Partial<typeof valid>;
    delete environment[key];

    expect(() => loadRuntimeConfig(environment)).toThrow();
  });

  it('rejects an unknown VITE key while allowing only Vite built-ins outside the config', () => {
    expect(() => loadRuntimeConfig({ ...valid, VITE_UNAPPROVED: 'nope' })).toThrow();
    expect(() => loadRuntimeConfig({ ...valid, UNAPPROVED: 'nope' })).toThrow();
    expect(loadRuntimeConfig({
      ...valid,
      MODE: 'test',
      DEV: true,
      PROD: false,
      SSR: false,
      BASE_URL: '/app/',
    })).toEqual(valid);
  });
});

describe('application origins', () => {
  it('allows only the local origin for local-e2e', () => {
    expect(authRedirectUri('http://localhost:8791', 'local-e2e')).toBe('http://localhost:8791/app');
  });

  it.each([
    'http://localhost:8791',
    'https://osp-customer-setup-elandopando8892s-projects.vercel.app',
    'https://osp-customer-setup-a1b2c3-elandopando8892s-projects.vercel.app',
  ])('allows an owned Vercel deployment origin for preview-synthetic: %s', (origin) => {
    expect(() => assertAllowedAppOrigin(origin, 'preview-synthetic')).not.toThrow();
  });

  it.each([
    'http://localhost:8790',
    'http://localhost:8791/',
    'http://localhost:8791.evil.example.test',
    'https://osp.heymarksman.com',
    'https://osp.heymarksman.com.evil.example.test',
  ])('rejects a non-approved local-e2e origin: %s', (origin) => {
    expect(() => assertAllowedAppOrigin(origin, 'local-e2e')).toThrow();
    expect(() => authRedirectUri(origin, 'local-e2e')).toThrow();
  });

  it.each([
    'https://osp.heymarksman.com',
    'https://osp-customer-setup.vercel.app',
    'https://osp-customer-setup-a1b2c3-attacker-projects.vercel.app',
    'https://osp-customer-setup-a1b2c3-elandopando8892s-projects.vercel.app.evil.test',
  ])('rejects a non-owned preview origin: %s', (origin) => {
    expect(() => assertAllowedAppOrigin(origin, 'preview-synthetic')).toThrow();
  });
});
