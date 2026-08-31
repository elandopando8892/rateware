import { describe, expect, it, vi } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';

import type { RuntimeConfig } from '../config/runtime';
import { createSupabaseAuthPort } from './supabase-auth-port';

const runtime: RuntimeConfig = {
  VITE_OSP_AUTH_PROVIDER: 'supabase',
  VITE_KINDE_DOMAIN: 'https://auth.heymarksman.com',
  VITE_KINDE_CLIENT_ID: 'production-client',
  VITE_KINDE_AUDIENCE: 'https://osp.heymarksman.com/api',
  VITE_SUPABASE_URL: 'https://alqjqzqagdmcywpjtnnr.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_test_key',
  VITE_OSP_BUILD_PROFILE: 'production-readonly',
};

function token(overrides: Record<string, unknown> = {}): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'ES256', kid: 'test' })}.${encode({
    iss: `${runtime.VITE_SUPABASE_URL}/auth/v1`,
    aud: 'authenticated',
    role: 'authenticated',
    sub: '11111111-1111-4111-8111-111111111111',
    session_id: '22222222-2222-4222-8222-222222222222',
    email: 'jgonzalez@xbfreight.com',
    amr: [{ method: 'oauth', timestamp: 1_800_000_000 }],
    ...overrides,
  })}.fixture`;
}

function fixture() {
  const accessToken = token();
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'jgonzalez@xbfreight.com',
    email_confirmed_at: '2026-08-30T00:00:00.000Z',
    confirmed_at: '2026-08-30T00:00:00.000Z',
  } as User;
  const session = { access_token: accessToken, user } as Session;
  const unsubscribe = vi.fn();
  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    getUser: vi.fn(async () => ({ data: { user }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session, user }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
    signInWithOAuth: vi.fn(async () => ({ data: { provider: 'google', url: 'https://accounts.google.com/' }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return { accessToken, auth, session, unsubscribe, user };
}

describe('createSupabaseAuthPort', () => {
  it('binds the verified Supabase user and starts Google OAuth with an approved login hint', async () => {
    const { accessToken, auth } = fixture();
    const port = createSupabaseAuthPort(runtime, {
      origin: 'https://osp.heymarksman.com',
      createClient: () => ({ auth: auth as never }),
    });

    const session = await port.initialize();
    expect(session).toMatchObject({
      generation: '22222222-2222-4222-8222-222222222222',
      approvalSessionIssuedAt: new Date(1_800_000_000 * 1_000).toISOString(),
      identity: {
        subject: '11111111-1111-4111-8111-111111111111',
        email: 'jgonzalez@xbfreight.com',
        organization: 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920',
      },
    });
    expect(await port.getAccessToken(session!)).toBe(accessToken);
    expect(await port.getApprovalProof(session!)).toBe(accessToken);

    await port.login('/app/pipeline', ' JGONZALEZ@XBFREIGHT.COM ');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://osp.heymarksman.com/app?returnTo=%2Fapp%2Fpipeline',
        queryParams: {
          login_hint: 'jgonzalez@xbfreight.com',
          prompt: 'select_account',
        },
      },
    });
  });

  it('starts Google account selection for an anonymous approved-session attempt', async () => {
    const { auth } = fixture();
    const port = createSupabaseAuthPort(runtime, {
      origin: 'https://osp.heymarksman.com',
      createClient: () => ({ auth: auth as never }),
    });
    await port.login('/app/pipeline');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://osp.heymarksman.com/app?returnTo=%2Fapp%2Fpipeline',
        queryParams: { prompt: 'select_account' },
      },
    });
  });

  it('rejects a verified Google session whose email is outside the OSP allowlist', async () => {
    const { auth, user } = fixture();
    const unauthorizedUser = { ...user, email: 'attacker@example.com' } as User;
    const unauthorizedSession = {
      access_token: token({ email: 'attacker@example.com' }),
      user: unauthorizedUser,
    } as Session;
    auth.getSession.mockResolvedValue({ data: { session: unauthorizedSession }, error: null });
    auth.getUser.mockResolvedValue({ data: { user: unauthorizedUser }, error: null });
    const port = createSupabaseAuthPort(runtime, {
      origin: 'https://osp.heymarksman.com',
      createClient: () => ({ auth: auth as never }),
    });
    await expect(port.initialize()).rejects.toThrow('Email is not approved for OSP');
    expect(port.getCurrentSession()).toBeNull();
  });

  it('fails closed for an unapproved email without asking Supabase to create a user', async () => {
    const { auth } = fixture();
    const port = createSupabaseAuthPort(runtime, {
      origin: 'https://osp.heymarksman.com',
      createClient: () => ({ auth: auth as never }),
    });
    await expect(port.login('/app/pipeline', 'attacker@example.com')).rejects.toThrow();
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('clears authority and unsubscribes when the managed port is deactivated', async () => {
    const { auth, unsubscribe } = fixture();
    const port = createSupabaseAuthPort(runtime, {
      origin: 'https://osp.heymarksman.com',
      createClient: () => ({ auth: auth as never }),
    });
    await port.initialize();
    port.deactivate();
    expect(port.getCurrentSession()).toBeNull();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
