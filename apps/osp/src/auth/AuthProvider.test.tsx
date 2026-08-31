import { generateKeyPairSync, sign as signBytes, type KeyObject } from 'node:crypto';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { KindeClientOptions } from '@kinde-oss/kinde-auth-pkce-js';
import { createLocalJWKSet } from 'jose';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeConfig } from '../config/runtime';
import type { AuthPort, BoundSession } from './auth-port';
import { AuthProvider, useAuth } from './AuthProvider';
import { createKindeAuthPort } from './kinde-auth-port';
import { createSessionChannel, type SessionChannel } from './session-channel';
import {
  createKindeTokenVerifier,
  type KindeTokenVerifier,
} from './token-binding';

const runtime: RuntimeConfig = {
  VITE_OSP_AUTH_PROVIDER: 'kinde',
  VITE_KINDE_DOMAIN: 'https://auth.heymarksman.com',
  VITE_KINDE_CLIENT_ID: 'synthetic-public-client',
  VITE_KINDE_AUDIENCE: 'https://osp.heymarksman.com/api',
  VITE_SUPABASE_URL: 'https://project.example.test',
  VITE_OSP_BUILD_PROFILE: 'local-e2e',
};
const fixtureAuthTime = 1_700_000_000;

afterEach(cleanup);

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.fixture-signature`;
}

function signedJwt(payload: Record<string, unknown>, privateKey: KeyObject): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'RS256', kid: 'synthetic-kid', typ: 'JWT' })}.${encode(payload)}`;
  return `${input}.${signBytes('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}

function fixtureClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Malformed fixture token');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

const fixtureVerifier: KindeTokenVerifier = {
  verifyAccessToken: async (token) => fixtureClaims(token),
  verifyIdToken: async (token) => fixtureClaims(token),
};

function tokenPair(subject = 'user-a', organization = 'org-a') {
  const email = `${subject}@example.test`;
  return {
    accessToken: jwt({
      iss: runtime.VITE_KINDE_DOMAIN,
      aud: runtime.VITE_KINDE_AUDIENCE,
      azp: runtime.VITE_KINDE_CLIENT_ID,
      sub: subject,
      org_code: organization,
      email,
      osp_email_verified: true,
      osp_verified_email: email,
      permissions: ['osp:read'],
    }),
    idToken: jwt({
      iss: runtime.VITE_KINDE_DOMAIN,
      aud: runtime.VITE_KINDE_CLIENT_ID,
      azp: runtime.VITE_KINDE_CLIENT_ID,
      sub: subject,
      org_code: organization,
      email,
      email_verified: true,
      auth_time: fixtureAuthTime,
      name: `Visible ${subject}`,
    }),
  };
}

function bound(subject: string, organization: string, generation: string): BoundSession {
  return {
    identity: {
      issuer: runtime.VITE_KINDE_DOMAIN,
      authorizedParty: runtime.VITE_KINDE_CLIENT_ID,
      subject,
      organization,
      email: `${subject}@example.test`,
      emailVerified: true,
    },
    generation,
    approvalSessionIssuedAt: new Date(fixtureAuthTime * 1_000).toISOString(),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type MutablePort = AuthPort & {
  current: BoundSession | null;
  emit(session: BoundSession | null): void;
};

function mutablePort(initial: BoundSession | null): MutablePort {
  let listener: (() => void) | undefined;
  return {
    current: initial,
    initialize: vi.fn(async () => initial),
    revalidate: vi.fn(async () => initial),
    subscribe(nextListener) {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    },
    getCurrentSession() {
      return this.current;
    },
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    getAccessToken: vi.fn(async () => 'access-token'),
    emit(session) {
      this.current = session;
      listener?.();
    },
  };
}

function AuthProbe() {
  const auth = useAuth();
  return (
    <output data-testid="auth-state">
      {auth.state.status === 'authenticated'
        ? `${auth.state.status}:${auth.state.session.identity.subject}:${auth.state.session.identity.organization}:${auth.state.session.generation}`
        : auth.state.status}
    </output>
  );
}

function LogoutProbe() {
  const auth = useAuth();
  return <button type="button" onClick={() => void auth.logout()}>logout</button>;
}

function Harness({ port, children }: { port: AuthPort; children?: ReactNode }) {
  return (
    <AuthProvider port={port}>
      <AuthProbe />
      {children}
    </AuthProvider>
  );
}

describe('createKindeAuthPort', () => {
  it('passes the exact runtime audience and redirects with Local Storage disabled', async () => {
    const tokens = tokenPair();
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => tokens.accessToken),
      getIdToken: vi.fn(async () => tokens.idToken),
      getToken: vi.fn(async () => tokens.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const createClient = vi.fn(async (options: KindeClientOptions) => {
      void options;
      return client;
    });
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient,
      createGeneration: () => 'generation-1',
      tokenVerifier: fixtureVerifier,
    });

    await port.initialize();

    expect(createClient).toHaveBeenCalledOnce();
    expect(createClient.mock.calls[0]?.[0]).toMatchObject({
      _framework: 'React',
      _frameworkVersion: '19.2.8',
      audience: 'https://osp.heymarksman.com/api',
      client_id: 'synthetic-public-client',
      domain: 'https://auth.heymarksman.com',
      redirect_uri: 'http://localhost:8791/app',
      logout_uri: 'http://localhost:8791/app',
      is_dangerously_use_local_storage: false,
      on_error_callback: expect.any(Function),
      on_redirect_callback: expect.any(Function),
    });
  });

  it('retries a transient client creation rejection on explicit logout without replacing the recovered client', async () => {
    const pair = tokenPair();
    const firstFailure = new Error('synthetic client creation failure');
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const createClient = vi.fn()
      .mockRejectedValueOnce(firstFailure)
      .mockResolvedValue(client);
    const generations = ['logout-generation', 'authenticated-generation'];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient,
      createGeneration: () => generations.shift() ?? 'unexpected',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });

    await expect(port.logout()).rejects.toBe(firstFailure);
    expect(createClient).toHaveBeenCalledOnce();
    expect(client.logout).not.toHaveBeenCalled();
    expect(channel.publish).not.toHaveBeenCalled();

    await expect(port.logout()).resolves.toBeUndefined();
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(client.logout).toHaveBeenCalledOnce();
    expect(channel.publish).toHaveBeenCalledOnce();
    expect(channel.publish).toHaveBeenCalledWith('logout-generation');

    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a', organization: 'org-a' },
      generation: 'authenticated-generation',
    });
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent successful client creation and retains that client', async () => {
    const pair = tokenPair();
    const pendingClient = deferred<{
      isAuthenticated(): Promise<boolean>;
      getAccessToken(): Promise<string>;
      getIdToken(): Promise<string>;
      getToken(): Promise<string>;
      login(): Promise<void>;
      logout(): Promise<void>;
    }>();
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const createClient = vi.fn(() => pendingClient.promise);
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient,
      createGeneration: () => 'authenticated-generation',
      tokenVerifier: fixtureVerifier,
    });

    const initialize = port.initialize();
    const revalidate = port.revalidate('focus');
    expect(createClient).toHaveBeenCalledOnce();
    pendingClient.resolve(client);
    await Promise.all([initialize, revalidate]);

    expect(port.getCurrentSession()).toMatchObject({
      identity: { subject: 'user-a', organization: 'org-a' },
      generation: 'authenticated-generation',
    });
    await port.revalidate('visible');
    expect(createClient).toHaveBeenCalledOnce();
  });

  it('reuses generation only for a same-identity focus or visibility refresh', async () => {
    let tokens = tokenPair('user-a', 'org-a');
    const generations = ['g-a', 'g-b', 'g-org', 'g-cross'];
    const client = {
      isAuthenticated: async () => true,
      getAccessToken: async () => tokens.accessToken,
      getIdToken: async () => tokens.idToken,
      getToken: async () => tokens.accessToken,
      login: async () => undefined,
      logout: async () => undefined,
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      tokenVerifier: fixtureVerifier,
    });

    expect((await port.initialize())?.generation).toBe('g-a');
    expect((await port.revalidate('focus'))?.generation).toBe('g-a');
    expect((await port.revalidate('visible'))?.generation).toBe('g-a');

    tokens = tokenPair('user-b', 'org-a');
    expect((await port.revalidate('focus'))?.generation).toBe('g-b');

    tokens = tokenPair('user-b', 'org-b');
    expect((await port.revalidate('visible'))?.generation).toBe('g-org');
    expect((await port.revalidate('cross-tab'))?.generation).toBe('g-cross');
  });

  it('creates a new generation after logout and login as the same identity', async () => {
    const tokens = tokenPair();
    const generations = ['before-logout', 'logout-invalidation', 'after-login'];
    const client = {
      isAuthenticated: async () => true,
      getAccessToken: async () => tokens.accessToken,
      getIdToken: async () => tokens.idToken,
      getToken: async () => tokens.accessToken,
      login: async () => undefined,
      logout: async () => undefined,
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      tokenVerifier: fixtureVerifier,
    });

    expect((await port.initialize())?.generation).toBe('before-logout');
    await port.logout();
    expect(port.getCurrentSession()).toBeNull();
    expect((await port.initialize())?.generation).toBe('after-login');
  });

  it('revalidates every cross-tab invalidation with a new generation and notifies subscribers', async () => {
    const tokens = tokenPair();
    let receiveInvalidation: ((generation: string) => void) | undefined;
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe(listener) {
        receiveInvalidation = listener;
        return () => {
          receiveInvalidation = undefined;
        };
      },
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: async () => true,
      getAccessToken: async () => tokens.accessToken,
      getIdToken: async () => tokens.idToken,
      getToken: async () => tokens.accessToken,
      login: async () => undefined,
      logout: async () => undefined,
    };
    const generations = ['local-g', 'cross-tab-g'];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    const notified = vi.fn();
    port.subscribe(notified);
    await port.initialize();

    receiveInvalidation?.('remote-generation-with-no-identity');

    await waitFor(() => expect(port.getCurrentSession()?.generation).toBe('cross-tab-g'));
    expect(notified).toHaveBeenCalled();
  });

  it('lets only the latest real-adapter validation mutate or notify when B completes before A', async () => {
    const pairA = tokenPair('user-a', 'org-a');
    const pairB = tokenPair('user-b', 'org-b');
    const accessA = deferred<string | undefined>();
    const accessB = deferred<string | undefined>();
    const idA = deferred<string | undefined>();
    const idB = deferred<string | undefined>();
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn()
        .mockImplementationOnce(() => accessA.promise)
        .mockImplementationOnce(() => accessB.promise),
      getIdToken: vi.fn()
        .mockImplementationOnce(() => idA.promise)
        .mockImplementationOnce(() => idB.promise),
      getToken: vi.fn(async () => pairB.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'latest-generation',
      tokenVerifier: fixtureVerifier,
    });
    const notified = vi.fn();
    port.subscribe(notified);

    const validationA = port.initialize();
    await waitFor(() => expect(client.getAccessToken).toHaveBeenCalledTimes(1));
    const validationB = port.revalidate('cross-tab');
    await waitFor(() => expect(client.getAccessToken).toHaveBeenCalledTimes(2));
    accessB.resolve(pairB.accessToken);
    idB.resolve(pairB.idToken);
    await expect(validationB).resolves.toMatchObject({
      identity: { subject: 'user-b', organization: 'org-b' },
    });

    accessA.resolve(pairA.accessToken);
    idA.resolve(pairA.idToken);
    await expect(validationA).resolves.toMatchObject({
      identity: { subject: 'user-b', organization: 'org-b' },
    });
    expect(port.getCurrentSession()?.identity.subject).toBe('user-b');
    expect(notified).toHaveBeenCalledOnce();
  });

  it('cannot restore a session during logout and broadcasts only after SDK token clearing completes', async () => {
    const pair = tokenPair();
    const pendingAccess = deferred<string | undefined>();
    const pendingId = deferred<string | undefined>();
    const sdkLogout = deferred<void>();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn()
        .mockResolvedValueOnce(pair.accessToken)
        .mockImplementationOnce(() => pendingAccess.promise),
      getIdToken: vi.fn()
        .mockResolvedValueOnce(pair.idToken)
        .mockImplementationOnce(() => pendingId.promise),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(() => sdkLogout.promise),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();
    const validation = port.revalidate('focus');
    await waitFor(() => expect(client.getAccessToken).toHaveBeenCalledTimes(2));

    const logout = port.logout();
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());
    expect(port.getCurrentSession()).toBeNull();
    expect(channel.publish).not.toHaveBeenCalled();
    pendingAccess.resolve(pair.accessToken);
    pendingId.resolve(pair.idToken);
    await expect(validation).resolves.toBeNull();
    expect(port.getCurrentSession()).toBeNull();

    sdkLogout.resolve();
    await logout;
    expect(channel.publish).toHaveBeenCalledOnce();
  });

  it.each([
    ['still authenticated', true],
    ['already anonymous', false],
  ])('makes logout dominant while the SDK is %s', async (_name, authenticatedDuringLogout) => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const eventOrder: string[] = [];
    let authenticated = true;
    const channel: SessionChannel = {
      publish: vi.fn((generation) => {
        eventOrder.push(`publish:${generation}`);
      }),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => authenticated),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => {
        eventOrder.push('sdk-logout-start');
        await sdkLogout.promise;
        eventOrder.push('sdk-token-clear-complete');
      }),
    };
    const generations = ['authenticated-generation', 'logout-generation'];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    const session = await port.initialize();
    if (!session) throw new Error('fixture failed to authenticate');
    authenticated = authenticatedDuringLogout;

    const logout = port.logout();
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());
    expect(port.getCurrentSession()).toBeNull();

    const attemptedValidations = await Promise.all([
      port.revalidate('focus'),
      port.revalidate('visible'),
      port.revalidate('cross-tab'),
      port.revalidate('refresh'),
    ]);
    await expect(port.getAccessToken(session)).rejects.toThrow('not current');
    expect(attemptedValidations).toEqual([null, null, null, null]);
    expect(port.getCurrentSession()).toBeNull();
    expect(client.isAuthenticated).toHaveBeenCalledOnce();
    expect(client.getAccessToken).toHaveBeenCalledOnce();
    expect(client.getToken).not.toHaveBeenCalled();
    expect(channel.publish).not.toHaveBeenCalled();

    sdkLogout.resolve();
    await logout;

    expect(channel.publish).toHaveBeenCalledOnce();
    expect(channel.publish).toHaveBeenCalledWith('logout-generation');
    expect(eventOrder).toEqual([
      'sdk-logout-start',
      'sdk-token-clear-complete',
      'publish:logout-generation',
    ]);
  });

  it('keeps logout dominant across same-port deactivate and reactivate until SDK clearing completes', async () => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const activeChannelListeners = new Set<(generation: string) => void>();
    const channels: Array<{
      publish: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }> = [];
    const createChannel = () => {
      const localListeners = new Set<(generation: string) => void>();
      const publish = vi.fn();
      const close = vi.fn(() => {
        for (const listener of localListeners) activeChannelListeners.delete(listener);
        localListeners.clear();
      });
      channels.push({ publish, close });
      return {
        publish,
        subscribe(listener: (generation: string) => void) {
          localListeners.add(listener);
          activeChannelListeners.add(listener);
          return () => {
            localListeners.delete(listener);
            activeChannelListeners.delete(listener);
          };
        },
        close,
      } satisfies SessionChannel;
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(() => sdkLogout.promise),
    };
    const generations = ['authenticated-generation', 'logout-generation'];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      createSessionChannel: createChannel,
      tokenVerifier: fixtureVerifier,
    });
    const beforeDeactivate = vi.fn();
    port.subscribe(beforeDeactivate);
    await port.initialize();
    beforeDeactivate.mockClear();

    const logout = port.logout();
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());
    expect(port.getCurrentSession()).toBeNull();
    expect(beforeDeactivate).toHaveBeenCalledOnce();
    port.deactivate();
    port.activate();
    const afterReactivate = vi.fn();
    port.subscribe(afterReactivate);

    await expect(port.initialize()).resolves.toBeNull();
    expect(port.getCurrentSession()).toBeNull();
    expect(client.isAuthenticated).toHaveBeenCalledOnce();
    expect(client.getAccessToken).toHaveBeenCalledOnce();
    expect(channels).toHaveLength(2);
    expect(channels[0]?.close).toHaveBeenCalledOnce();
    expect(activeChannelListeners).toHaveLength(1);
    expect(channels[0]?.publish).not.toHaveBeenCalled();
    expect(channels[1]?.publish).not.toHaveBeenCalled();

    sdkLogout.resolve();
    await logout;

    expect(port.getCurrentSession()).toBeNull();
    expect(afterReactivate).not.toHaveBeenCalled();
    expect(channels[0]?.publish).not.toHaveBeenCalled();
    expect(channels[1]?.publish).toHaveBeenCalledOnce();
    expect(channels[1]?.publish).toHaveBeenCalledWith('logout-generation');
    port.deactivate();
    expect(activeChannelListeners).toHaveLength(0);
    expect(channels[1]?.close).toHaveBeenCalledOnce();
  });

  it('keeps the port inactive when channel creation throws and lets a later activation retry', async () => {
    const pair = tokenPair();
    const factoryFailure = new Error('synthetic channel factory failure');
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const retryChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const createChannel = vi.fn()
      .mockReturnValueOnce(initialChannel)
      .mockImplementationOnce(() => {
        throw factoryFailure;
      })
      .mockReturnValueOnce(retryChannel);
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const createClient = vi.fn(async () => client);
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient,
      createGeneration: () => 'authenticated-generation',
      createSessionChannel: createChannel,
      tokenVerifier: fixtureVerifier,
    });
    port.deactivate();

    expect(() => port.activate()).toThrow(factoryFailure);
    await expect(port.initialize()).rejects.toThrow('inactive');
    expect(createClient).not.toHaveBeenCalled();

    expect(() => port.activate()).not.toThrow();
    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a', organization: 'org-a' },
      generation: 'authenticated-generation',
    });
    expect(createChannel).toHaveBeenCalledTimes(3);
    expect(retryChannel.subscribe).toHaveBeenCalledOnce();
  });

  it('rolls back and closes a staged channel when subscription throws before activation', async () => {
    const pair = tokenPair();
    const subscribeFailure = new Error('synthetic channel subscribe failure');
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const failedChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => {
        throw subscribeFailure;
      }),
      close: vi.fn(),
    };
    const retryChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const createChannel = vi.fn()
      .mockReturnValueOnce(initialChannel)
      .mockReturnValueOnce(failedChannel)
      .mockReturnValueOnce(retryChannel);
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const createClient = vi.fn(async () => client);
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient,
      createGeneration: () => 'authenticated-generation',
      createSessionChannel: createChannel,
      tokenVerifier: fixtureVerifier,
    });
    port.deactivate();

    expect(() => port.activate()).toThrow(subscribeFailure);
    expect(failedChannel.close).toHaveBeenCalledOnce();
    await expect(port.initialize()).rejects.toThrow('inactive');
    expect(createClient).not.toHaveBeenCalled();

    expect(() => port.activate()).not.toThrow();
    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a', organization: 'org-a' },
      generation: 'authenticated-generation',
    });
    expect(createChannel).toHaveBeenCalledTimes(3);
    expect(retryChannel.subscribe).toHaveBeenCalledOnce();
  });

  it('contains unsubscribe cleanup failure and fully resets authority for a healthy activation', async () => {
    const pair = tokenPair();
    const unsubscribeFailure = new Error('sensitive unsubscribe failure');
    const failedUnsubscribe = vi.fn(() => {
      throw unsubscribeFailure;
    });
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => failedUnsubscribe),
      close: vi.fn(),
    };
    const retryChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const createChannel = vi.fn()
      .mockReturnValueOnce(initialChannel)
      .mockReturnValueOnce(retryChannel);
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const generations = ['initial-generation', 'retry-generation'];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      createSessionChannel: createChannel,
      tokenVerifier: fixtureVerifier,
    });
    const staleListener = vi.fn();
    port.subscribe(staleListener);
    await port.initialize();
    staleListener.mockClear();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      expect(() => port.deactivate()).not.toThrow();
      expect(failedUnsubscribe).toHaveBeenCalledOnce();
      expect(initialChannel.close).toHaveBeenCalledOnce();
      expect(port.getCurrentSession()).toBeNull();
      expect(consoleError).not.toHaveBeenCalled();

      port.activate();
      const healthyListener = vi.fn();
      port.subscribe(healthyListener);
      await expect(port.initialize()).resolves.toMatchObject({
        identity: { subject: 'user-a', organization: 'org-a' },
        generation: 'retry-generation',
      });
      expect(staleListener).not.toHaveBeenCalled();
      expect(healthyListener).toHaveBeenCalledOnce();
      expect(retryChannel.subscribe).toHaveBeenCalledOnce();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('contains channel close failure after unsubscribe and permits a healthy activation', async () => {
    const pair = tokenPair();
    const closeFailure = new Error('sensitive channel close failure');
    const initialUnsubscribe = vi.fn();
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => initialUnsubscribe),
      close: vi.fn(() => {
        throw closeFailure;
      }),
    };
    const retryChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const createChannel = vi.fn()
      .mockReturnValueOnce(initialChannel)
      .mockReturnValueOnce(retryChannel);
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const generations = ['initial-generation', 'retry-generation'];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      createSessionChannel: createChannel,
      tokenVerifier: fixtureVerifier,
    });
    const staleListener = vi.fn();
    port.subscribe(staleListener);
    await port.initialize();
    staleListener.mockClear();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      expect(() => port.deactivate()).not.toThrow();
      expect(initialUnsubscribe).toHaveBeenCalledOnce();
      expect(initialChannel.close).toHaveBeenCalledOnce();
      expect(port.getCurrentSession()).toBeNull();
      expect(consoleError).not.toHaveBeenCalled();

      port.activate();
      const healthyListener = vi.fn();
      port.subscribe(healthyListener);
      await expect(port.initialize()).resolves.toMatchObject({
        identity: { subject: 'user-a', organization: 'org-a' },
        generation: 'retry-generation',
      });
      expect(staleListener).not.toHaveBeenCalled();
      expect(healthyListener).toHaveBeenCalledOnce();
      expect(retryChannel.subscribe).toHaveBeenCalledOnce();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rejects inactive logout without contacting Kinde or stranding later initialization', async () => {
    const pair = tokenPair();
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const createClient = vi.fn(async () => client);
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient,
      createGeneration: () => 'generation',
      tokenVerifier: fixtureVerifier,
    });
    port.deactivate();

    await expect(port.logout()).rejects.toThrow('inactive');
    expect(createClient).not.toHaveBeenCalled();
    expect(client.logout).not.toHaveBeenCalled();

    port.activate();
    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a' },
    });
  });

  it('joins duplicate concurrent logout calls into one SDK clear and one publish', async () => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(() => sdkLogout.promise),
    };
    const generations = ['authenticated-generation', 'logout-generation'];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();

    const first = port.logout();
    const second = port.logout();

    expect(second).toBe(first);
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());
    sdkLogout.resolve();
    await Promise.all([first, second]);
    expect(channel.publish).toHaveBeenCalledOnce();
    expect(channel.publish).toHaveBeenCalledWith('logout-generation');
  });

  it('installs the shared logout promise before a subscriber can reenter logout', async () => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const eventOrder: string[] = [];
    const channel: SessionChannel = {
      publish: vi.fn((generation) => {
        eventOrder.push(`publish:${generation}`);
      }),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => {
        eventOrder.push('sdk-logout-start');
        await sdkLogout.promise;
        eventOrder.push('sdk-token-clear-complete');
      }),
    };
    const generations = [
      'authenticated-generation',
      'logout-generation',
      'reinitialized-generation',
    ];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();
    eventOrder.length = 0;

    let reentrantLogout: Promise<void> | undefined;
    port.subscribe(() => {
      eventOrder.push('subscriber-notified');
      if (!reentrantLogout) {
        reentrantLogout = port.logout();
        eventOrder.push('reentrant-logout-returned');
      }
    });

    const outerLogout = port.logout();
    const samePromise = reentrantLogout === outerLogout;
    await waitFor(() => expect(client.logout).toHaveBeenCalled());
    sdkLogout.resolve();
    if (!reentrantLogout) throw new Error('subscriber did not reenter logout');
    const outcomes = await Promise.allSettled([outerLogout, reentrantLogout]);

    expect(samePromise).toBe(true);
    expect(outcomes).toEqual([
      { status: 'fulfilled', value: undefined },
      { status: 'fulfilled', value: undefined },
    ]);
    expect(client.logout).toHaveBeenCalledOnce();
    expect(channel.publish).toHaveBeenCalledOnce();
    expect(channel.publish).toHaveBeenCalledWith('logout-generation');
    expect(eventOrder).toEqual([
      'subscriber-notified',
      'reentrant-logout-returned',
      'sdk-logout-start',
      'sdk-token-clear-complete',
      'publish:logout-generation',
    ]);

    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a' },
      generation: 'reinitialized-generation',
    });
  });

  it('joins the existing logout promise after deactivation without a second SDK clear or publish', async () => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(() => sdkLogout.promise),
    };
    const generations = ['authenticated-generation', 'logout-generation'];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();

    const first = port.logout();
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());
    port.deactivate();
    const duplicate = port.logout();
    const samePromise = duplicate === first;
    sdkLogout.resolve();
    const outcomes = await Promise.allSettled([first, duplicate]);

    expect(samePromise).toBe(true);
    expect(outcomes).toEqual([
      { status: 'fulfilled', value: undefined },
      { status: 'fulfilled', value: undefined },
    ]);
    expect(client.logout).toHaveBeenCalledOnce();
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('defers one inactive logout invalidation to the same port next activation before initialization', async () => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const eventOrder: string[] = [];
    const channels: Array<{
      publish: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }> = [];
    const createChannel = (): SessionChannel => {
      const channelIndex = channels.length;
      const publish = vi.fn((generation: string) => {
        eventOrder.push(`publish:${channelIndex}:${generation}`);
      });
      const close = vi.fn();
      channels.push({ publish, close });
      return {
        publish,
        subscribe: vi.fn(() => () => undefined),
        close,
      };
    };
    const client = {
      isAuthenticated: vi.fn(async () => {
        eventOrder.push('sdk-is-authenticated');
        return true;
      }),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => {
        eventOrder.push('sdk-logout-start');
        await sdkLogout.promise;
        eventOrder.push('sdk-token-clear-complete');
      }),
    };
    const generations = [
      'authenticated-generation',
      'logout-generation',
      'reactivated-generation',
    ];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      createSessionChannel: createChannel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();
    eventOrder.length = 0;

    const logout = port.logout();
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());
    port.deactivate();
    sdkLogout.resolve();
    await logout;

    expect(channels).toHaveLength(1);
    expect(channels[0]?.publish).not.toHaveBeenCalled();
    expect(eventOrder).toEqual([
      'sdk-logout-start',
      'sdk-token-clear-complete',
    ]);

    port.activate();
    const reinitialized = port.initialize();
    await expect(reinitialized).resolves.toMatchObject({
      identity: { subject: 'user-a', organization: 'org-a' },
      generation: 'reactivated-generation',
    });

    expect(channels).toHaveLength(2);
    expect(channels[1]?.publish).toHaveBeenCalledOnce();
    expect(channels[1]?.publish).toHaveBeenCalledWith('logout-generation');
    expect(eventOrder).toEqual([
      'sdk-logout-start',
      'sdk-token-clear-complete',
      'publish:1:logout-generation',
      'sdk-is-authenticated',
    ]);

    port.deactivate();
    port.activate();
    expect(channels).toHaveLength(3);
    expect(channels[2]?.publish).not.toHaveBeenCalled();
  });

  it('retains a deferred invalidation and rolls back when staged activation publish throws', async () => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const publishFailure = new Error('synthetic deferred publish failure');
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const failedUnsubscribe = vi.fn();
    const failedChannel: SessionChannel = {
      publish: vi.fn(() => {
        throw publishFailure;
      }),
      subscribe: vi.fn(() => failedUnsubscribe),
      close: vi.fn(),
    };
    const retryChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const laterChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const createChannel = vi.fn()
      .mockReturnValueOnce(initialChannel)
      .mockReturnValueOnce(failedChannel)
      .mockReturnValueOnce(retryChannel)
      .mockReturnValueOnce(laterChannel);
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(() => sdkLogout.promise),
    };
    const generations = [
      'authenticated-generation',
      'logout-generation',
      'reinitialized-generation',
    ];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      createSessionChannel: createChannel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();

    const logout = port.logout();
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());
    port.deactivate();
    sdkLogout.resolve();
    await logout;

    expect(() => port.activate()).toThrow(publishFailure);
    expect(failedUnsubscribe).toHaveBeenCalledOnce();
    expect(failedChannel.close).toHaveBeenCalledOnce();
    await expect(port.initialize()).rejects.toThrow('inactive');
    expect(client.isAuthenticated).toHaveBeenCalledOnce();

    expect(() => port.activate()).not.toThrow();
    expect(retryChannel.publish).toHaveBeenCalledOnce();
    expect(retryChannel.publish).toHaveBeenCalledWith('logout-generation');
    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a', organization: 'org-a' },
      generation: 'reinitialized-generation',
    });

    port.deactivate();
    port.activate();
    expect(laterChannel.publish).not.toHaveBeenCalled();
  });

  it('rolls back rejecting activation stages and publishes one retained invalidation on retry', async () => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const factoryFailure = new Error('synthetic async channel factory failure');
    const subscribeFailure = new Error('synthetic async channel subscribe failure');
    const publishFailure = new Error('synthetic async deferred publish failure');
    const rejectedFactory = Promise.reject(factoryFailure);
    const rejectedSubscribe = Promise.reject(subscribeFailure);
    const rejectedPublish = Promise.reject(publishFailure);
    void rejectedFactory.catch(() => undefined);
    void rejectedSubscribe.catch(() => undefined);
    void rejectedPublish.catch(() => undefined);

    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const subscribeFailedChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => rejectedSubscribe as unknown as () => void),
      close: vi.fn(),
    };
    const publishFailedUnsubscribe = vi.fn();
    const publishFailedChannel: SessionChannel = {
      publish: vi.fn(() => rejectedPublish as unknown as void),
      subscribe: vi.fn(() => publishFailedUnsubscribe),
      close: vi.fn(),
    };
    const retryChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const channelResults: unknown[] = [
      initialChannel,
      rejectedFactory,
      subscribeFailedChannel,
      publishFailedChannel,
      retryChannel,
    ];
    const createChannel = vi.fn(
      () => channelResults.shift() as SessionChannel,
    );
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(() => sdkLogout.promise),
    };
    const generations = [
      'authenticated-generation',
      'logout-generation',
      'reinitialized-generation',
    ];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      createSessionChannel: createChannel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();
    const logout = port.logout();
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());
    port.deactivate();
    sdkLogout.resolve();
    await logout;

    await expect(Promise.resolve().then(() => port.activate())).rejects.toBe(factoryFailure);
    await expect(port.initialize()).rejects.toThrow('inactive');

    await expect(Promise.resolve().then(() => port.activate())).rejects.toBe(subscribeFailure);
    expect(subscribeFailedChannel.close).toHaveBeenCalledOnce();
    await expect(port.initialize()).rejects.toThrow('inactive');

    await expect(Promise.resolve().then(() => port.activate())).rejects.toBe(publishFailure);
    expect(publishFailedUnsubscribe).toHaveBeenCalledOnce();
    expect(publishFailedChannel.close).toHaveBeenCalledOnce();
    await expect(port.initialize()).rejects.toThrow('inactive');

    await expect(Promise.resolve().then(() => port.activate())).resolves.toBeUndefined();
    expect(retryChannel.publish).toHaveBeenCalledOnce();
    expect(retryChannel.publish).toHaveBeenCalledWith('logout-generation');
    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a', organization: 'org-a' },
      generation: 'reinitialized-generation',
    });
    expect(createChannel).toHaveBeenCalledTimes(5);
  });

  it('isolates throwing subscribers so logout remains Promise<void> and the port stays healthy', async () => {
    const pair = tokenPair();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const generations = [
      'authenticated-generation',
      'logout-generation',
      'reinitialized-generation',
    ];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();
    port.subscribe(() => {
      throw new Error('sensitive subscriber detail');
    });
    const healthySubscriber = vi.fn();
    port.subscribe(healthySubscriber);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      let logoutOperation: Promise<void> | undefined;
      let synchronousError: unknown;
      try {
        logoutOperation = port.logout();
      } catch (error) {
        synchronousError = error;
      }

      expect(synchronousError).toBeUndefined();
      expect(logoutOperation).toBeInstanceOf(Promise);
      if (!logoutOperation) throw new Error('logout did not return a Promise');
      await expect(logoutOperation).resolves.toBeUndefined();
      expect(healthySubscriber).toHaveBeenCalledOnce();
      expect(client.logout).toHaveBeenCalledOnce();
      expect(channel.publish).toHaveBeenCalledOnce();
      expect(consoleError).not.toHaveBeenCalled();

      await expect(port.initialize()).resolves.toMatchObject({
        identity: { subject: 'user-a' },
        generation: 'reinitialized-generation',
      });
      expect(healthySubscriber).toHaveBeenCalledTimes(2);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('contains rejecting subscriber thenables and snapshots reentrant listener changes', async () => {
    const pair = tokenPair();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const generations = [
      'authenticated-generation',
      'logout-generation',
      'reinitialized-generation',
    ];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();

    const lateSubscriber = vi.fn();
    const healthySubscriber = vi.fn();
    let unsubscribeHealthy: () => void = () => undefined;
    port.subscribe(() => {
      unsubscribeHealthy();
      port.subscribe(lateSubscriber);
    });
    port.subscribe(() => {
      throw new Error('sensitive sync subscriber detail');
    });
    const asyncThen = vi.fn((
      _resolve?: (value: unknown) => void,
      reject?: (reason: unknown) => void,
    ) => {
      reject?.(new Error('sensitive async subscriber detail'));
    });
    port.subscribe(() => ({ then: asyncThen }) as unknown as void);
    unsubscribeHealthy = port.subscribe(healthySubscriber);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(port.logout()).resolves.toBeUndefined();
      await waitFor(() => expect(asyncThen).toHaveBeenCalledOnce());
      expect(healthySubscriber).toHaveBeenCalledOnce();
      expect(lateSubscriber).not.toHaveBeenCalled();
      expect(client.logout).toHaveBeenCalledOnce();
      expect(channel.publish).toHaveBeenCalledOnce();
      expect(consoleError).not.toHaveBeenCalled();

      await expect(port.initialize()).resolves.toMatchObject({
        identity: { subject: 'user-a' },
        generation: 'reinitialized-generation',
      });
      await waitFor(() => expect(asyncThen).toHaveBeenCalledTimes(2));
      expect(healthySubscriber).toHaveBeenCalledOnce();
      expect(lateSubscriber).toHaveBeenCalledOnce();
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rejects login while inactive before creating or calling a Kinde client', async () => {
    const pair = tokenPair();
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const createClient = vi.fn(async () => client);
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient,
      createGeneration: () => 'generation',
      tokenVerifier: fixtureVerifier,
    });
    port.deactivate();

    await expect(port.login('/app')).rejects.toThrow('inactive');
    expect(createClient).not.toHaveBeenCalled();
    expect(client.login).not.toHaveBeenCalled();
  });

  it('rechecks login after pending client creation loses dominance to logout', async () => {
    const pair = tokenPair();
    const clientPending = deferred<{
      isAuthenticated(): Promise<boolean>;
      getAccessToken(): Promise<string>;
      getIdToken(): Promise<string>;
      getToken(): Promise<string>;
      login(): Promise<void>;
      logout(): Promise<void>;
    }>();
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: () => clientPending.promise,
      createGeneration: () => 'logout-generation',
      tokenVerifier: fixtureVerifier,
    });

    const login = port.login('/app/case');
    const logout = port.logout();
    clientPending.resolve(client);

    await expect(login).rejects.toThrow('not current');
    await logout;
    expect(client.login).not.toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalledOnce();
  });

  it('rejects login during pending logout without calling the SDK redirect', async () => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(() => sdkLogout.promise),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();
    const logout = port.logout();
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());

    await expect(port.login('/app/case')).rejects.toThrow('logout');
    expect(client.login).not.toHaveBeenCalled();
    sdkLogout.resolve();
    await logout;
  });

  it('clears and notifies an established session when cross-tab validation becomes anonymous', async () => {
    const pair = tokenPair();
    let authenticated = true;
    let receiveInvalidation: ((generation: string) => void) | undefined;
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe(listener) {
        receiveInvalidation = listener;
        return () => {
          receiveInvalidation = undefined;
        };
      },
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => authenticated),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    const notified = vi.fn();
    port.subscribe(notified);
    await port.initialize();
    notified.mockClear();
    authenticated = false;

    receiveInvalidation?.('remote-generation');

    await waitFor(() => expect(port.getCurrentSession()).toBeNull());
    expect(notified).toHaveBeenCalledOnce();
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('cannot authenticate forged broadcast-revalidated token strings through the real verifier', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicJwk = publicKey.export({ format: 'jwk' });
    if (!publicJwk.kty) throw new Error('fixture public key has no type');
    const fixturePair = tokenPair();
    let accessToken = signedJwt(fixtureClaims(fixturePair.accessToken), privateKey);
    const idToken = signedJwt(fixtureClaims(fixturePair.idToken), privateKey);
    let receiveInvalidation: ((generation: string) => void) | undefined;
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe(listener) {
        receiveInvalidation = listener;
        return () => {
          receiveInvalidation = undefined;
        };
      },
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => accessToken),
      getIdToken: vi.fn(async () => idToken),
      getToken: vi.fn(async () => accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      sessionChannel: channel,
      tokenVerifier: createKindeTokenVerifier(runtime, createLocalJWKSet({
        keys: [{ ...publicJwk, kty: publicJwk.kty, alg: 'RS256', kid: 'synthetic-kid', use: 'sig' }],
      })),
    });
    const notified = vi.fn();
    port.subscribe(notified);
    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a' },
    });
    notified.mockClear();
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    accessToken = `${encode({ alg: 'none', kid: 'synthetic-kid' })}.${encode(
      fixtureClaims(fixturePair.accessToken),
    )}.`;

    receiveInvalidation?.('remote-generation');

    await waitFor(() => expect(port.getCurrentSession()).toBeNull());
    expect(notified).toHaveBeenCalledOnce();
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('rejects malicious returnTo values and sends an approved same-origin /app path once', async () => {
    const tokens = tokenPair();
    const login = vi.fn(async () => undefined);
    const client = {
      isAuthenticated: async () => true,
      getAccessToken: async () => tokens.accessToken,
      getIdToken: async () => tokens.idToken,
      getToken: async () => tokens.accessToken,
      login,
      logout: async () => undefined,
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'g',
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();

    await expect(port.login('https://evil.example.test/app')).rejects.toThrow();
    await expect(port.login('/application')).rejects.toThrow();
    await port.login('http://localhost:8791/app/case?tab=overview');

    expect(login).toHaveBeenCalledOnce();
    expect(login).toHaveBeenCalledWith({
      app_state: { returnTo: '/app/case?tab=overview' },
      prompt: 'login',
      authUrlParams: { max_age: 0 },
    });
  });

  it('binds production login to the reviewed Rateware Kinde organization', async () => {
    const login = vi.fn(async () => undefined);
    const client = {
      isAuthenticated: async () => false,
      getAccessToken: async () => undefined,
      getIdToken: async () => undefined,
      getToken: async () => undefined,
      login,
      logout: async () => undefined,
    };
    const port = createKindeAuthPort({
      ...runtime,
      VITE_KINDE_CLIENT_ID: 'production-client',
      VITE_OSP_BUILD_PROFILE: 'production-readonly',
    }, {
      origin: 'https://osp.heymarksman.com',
      createClient: async () => client,
      tokenVerifier: fixtureVerifier,
    });

    await port.login('/app/pipeline');

    expect(login).toHaveBeenCalledWith({
      app_state: { returnTo: '/app/pipeline' },
      prompt: 'login',
      authUrlParams: { max_age: 0 },
      orgCode: 'org_dbc2fd12c76',
    });
  });

  it('consumes an approved successful redirect callback exactly once without replay', async () => {
    const pair = tokenPair();
    const replaceUrl = vi.fn();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async (options) => {
        options.on_redirect_callback?.({
          given_name: 'Visible',
          id: 'user-a',
          family_name: 'Operator',
          email: 'user-a@example.test',
          picture: undefined,
        }, { returnTo: '/app/case?tab=approved#detail' });
        return client;
      },
      createGeneration: () => 'generation',
      replaceUrl,
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });

    await port.initialize();
    await port.revalidate('focus');

    expect(replaceUrl).toHaveBeenCalledOnce();
    expect(replaceUrl).toHaveBeenCalledWith('/app/case?tab=approved#detail');
    expect(channel.publish).toHaveBeenCalledOnce();
  });

  it('broadcasts local subject and organization replacements without cross-tab loops', async () => {
    let pair = tokenPair('user-a', 'org-a');
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const generations = ['initial', 'subject', 'organization'];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();
    expect(channel.publish).not.toHaveBeenCalled();

    pair = tokenPair('user-b', 'org-a');
    await port.revalidate('focus');
    pair = tokenPair('user-b', 'org-b');
    await port.revalidate('visible');

    expect(channel.publish).toHaveBeenNthCalledWith(1, 'subject');
    expect(channel.publish).toHaveBeenNthCalledWith(2, 'organization');
  });

  it('surfaces a Kinde callback failure and never binds a session', async () => {
    const tokens = tokenPair();
    const client = {
      isAuthenticated: async () => true,
      getAccessToken: async () => tokens.accessToken,
      getIdToken: async () => tokens.idToken,
      getToken: async () => tokens.accessToken,
      login: async () => undefined,
      logout: async () => undefined,
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async (options) => {
        options.on_error_callback?.({
          error: 'ERR_CODE_EXCHANGE',
          errorDescription: 'synthetic callback failure',
          state: 'fixture-state',
          appState: {},
        });
        return client;
      },
      createGeneration: () => 'must-not-bind',
      tokenVerifier: fixtureVerifier,
    });

    await expect(port.initialize()).rejects.toThrow('synthetic callback failure');
    expect(port.getCurrentSession()).toBeNull();
  });

  it('rejects an access token that no longer matches the bound session', async () => {
    let tokens = tokenPair('user-a', 'org-a');
    const client = {
      isAuthenticated: async () => true,
      getAccessToken: async () => tokens.accessToken,
      getIdToken: async () => tokens.idToken,
      getToken: async () => tokens.accessToken,
      login: async () => undefined,
      logout: async () => undefined,
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'bound-a',
      tokenVerifier: fixtureVerifier,
    });
    const session = await port.initialize();
    if (!session) throw new Error('fixture failed to authenticate');
    tokens = tokenPair('user-b', 'org-a');

    await expect(port.getAccessToken(session)).rejects.toThrow();
  });

  it('reuses the verified ID token bound during session establishment for approval proof', async () => {
    const tokens = tokenPair('user-a', 'org-a');
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => tokens.accessToken),
      getIdToken: vi.fn()
        .mockResolvedValueOnce(tokens.idToken)
        .mockImplementationOnce(() => new Promise<string | undefined>(() => undefined)),
      getToken: vi.fn(async () => tokens.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'approval-proof-generation',
      tokenVerifier: fixtureVerifier,
    });
    const session = await port.initialize();
    if (!session) throw new Error('fixture failed to authenticate');

    await expect(port.getIdToken(session)).resolves.toBe(tokens.idToken);
    expect(client.getIdToken).toHaveBeenCalledOnce();
  });

  it('clears the bound approval proof when the session is logged out', async () => {
    const tokens = tokenPair('user-a', 'org-a');
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => tokens.accessToken),
      getIdToken: vi.fn(async () => tokens.idToken),
      getToken: vi.fn(async () => tokens.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'approval-proof-generation',
      tokenVerifier: fixtureVerifier,
    });
    const session = await port.initialize();
    if (!session) throw new Error('fixture failed to authenticate');

    await port.logout();
    await expect(port.getIdToken(session)).rejects.toThrow('not current');
  });

  it('rechecks session authority after an access-token SDK await races with logout', async () => {
    const pair = tokenPair();
    const pendingToken = deferred<string | undefined>();
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn()
        .mockResolvedValueOnce(pair.accessToken)
        .mockImplementationOnce(() => pendingToken.promise),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      tokenVerifier: fixtureVerifier,
    });
    const session = await port.initialize();
    if (!session) throw new Error('fixture failed to authenticate');

    const tokenRequest = port.getAccessToken(session);
    await waitFor(() => expect(client.getAccessToken).toHaveBeenCalledTimes(2));
    await port.logout();
    pendingToken.resolve(pair.accessToken);

    await expect(tokenRequest).rejects.toThrow('not current');
  });

  it('rechecks generation and identity after cryptographic verification races with cross-tab replacement', async () => {
    let pair = tokenPair('user-a', 'org-a');
    const pendingVerification = deferred<Record<string, unknown>>();
    let accessVerification = 0;
    let receiveInvalidation: ((generation: string) => void) | undefined;
    const verifier: KindeTokenVerifier = {
      async verifyAccessToken(token) {
        accessVerification += 1;
        if (accessVerification === 2) return pendingVerification.promise;
        return fixtureClaims(token);
      },
      verifyIdToken: async (token) => fixtureClaims(token),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => `generation-${accessVerification}`,
      sessionChannel: {
        publish: vi.fn(),
        subscribe(listener) {
          receiveInvalidation = listener;
          return () => {
            receiveInvalidation = undefined;
          };
        },
        close: vi.fn(),
      },
      tokenVerifier: verifier,
    });
    const sessionA = await port.initialize();
    if (!sessionA) throw new Error('fixture failed to authenticate');
    const tokenRequest = port.getAccessToken(sessionA);
    await waitFor(() => expect(accessVerification).toBe(2));
    pair = tokenPair('user-b', 'org-b');

    receiveInvalidation?.('remote-generation');
    await waitFor(() => expect(port.getCurrentSession()?.identity.subject).toBe('user-b'));
    pendingVerification.resolve(fixtureClaims(tokenPair('user-a', 'org-a').accessToken));

    await expect(tokenRequest).rejects.toThrow('not current');
  });

  it('clears and notifies stale authority when established-session token binding fails', async () => {
    let pair = tokenPair('user-a', 'org-a');
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      tokenVerifier: fixtureVerifier,
    });
    const notified = vi.fn();
    port.subscribe(notified);
    await port.initialize();
    notified.mockClear();
    pair = tokenPair('user-b', 'org-a');
    pair.idToken = tokenPair('user-a', 'org-a').idToken;

    await expect(port.revalidate('focus')).rejects.toThrow();
    expect(port.getCurrentSession()).toBeNull();
    expect(notified).toHaveBeenCalledOnce();
  });

  it('cancels activation when the channel factory synchronously deactivates the attempt', async () => {
    const pair = tokenPair();
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const abandonedChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const retryChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const channels = [initialChannel, abandonedChannel, retryChannel];
    let deactivatePort: () => void = () => undefined;
    const createChannel = vi.fn(() => {
      const channel = channels.shift();
      if (!channel) throw new Error('missing channel fixture');
      if (channel === abandonedChannel) deactivatePort();
      return channel;
    });
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'authenticated-generation',
      createSessionChannel: createChannel,
      tokenVerifier: fixtureVerifier,
    });
    deactivatePort = () => port.deactivate();
    port.deactivate();

    port.activate();

    await expect(port.initialize()).rejects.toThrow('inactive');
    expect(client.isAuthenticated).not.toHaveBeenCalled();
    expect(abandonedChannel.subscribe).not.toHaveBeenCalled();
    expect(abandonedChannel.close).toHaveBeenCalledOnce();

    port.activate();
    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a' },
    });
  });

  it('cancels activation when channel subscription synchronously deactivates the attempt', async () => {
    const pair = tokenPair();
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const abandonedUnsubscribe = vi.fn();
    let deactivatePort: () => void = () => undefined;
    const abandonedChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => {
        deactivatePort();
        return abandonedUnsubscribe;
      }),
      close: vi.fn(),
    };
    const retryChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const channels = [initialChannel, abandonedChannel, retryChannel];
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'authenticated-generation',
      createSessionChannel: () => {
        const channel = channels.shift();
        if (!channel) throw new Error('missing channel fixture');
        return channel;
      },
      tokenVerifier: fixtureVerifier,
    });
    deactivatePort = () => port.deactivate();
    port.deactivate();

    port.activate();

    await expect(port.initialize()).rejects.toThrow('inactive');
    expect(client.isAuthenticated).not.toHaveBeenCalled();
    expect(abandonedUnsubscribe).toHaveBeenCalledOnce();
    expect(abandonedChannel.close).toHaveBeenCalledOnce();

    port.activate();
    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a' },
    });
  });

  it('records a successful deferred publish exactly once when publish deactivates activation', async () => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    let deactivatePort: () => void = () => undefined;
    const abandonedChannel: SessionChannel = {
      publish: vi.fn(() => {
        deactivatePort();
      }),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const retryChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const channels = [initialChannel, abandonedChannel, retryChannel];
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(() => sdkLogout.promise),
    };
    const generations = [
      'authenticated-generation',
      'logout-generation',
      'reactivated-generation',
    ];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      createSessionChannel: () => {
        const channel = channels.shift();
        if (!channel) throw new Error('missing channel fixture');
        return channel;
      },
      tokenVerifier: fixtureVerifier,
    });
    deactivatePort = () => port.deactivate();
    await port.initialize();
    const logout = port.logout();
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());
    port.deactivate();
    sdkLogout.resolve();
    await logout;

    port.activate();

    await expect(port.initialize()).rejects.toThrow('inactive');
    expect(abandonedChannel.publish).toHaveBeenCalledOnce();
    expect(abandonedChannel.publish).toHaveBeenCalledWith('logout-generation');
    expect(abandonedChannel.close).toHaveBeenCalledOnce();

    port.activate();
    await expect(port.initialize()).resolves.toMatchObject({
      generation: 'reactivated-generation',
    });
    expect(retryChannel.publish).not.toHaveBeenCalled();
  });

  it('does not let a stale async activation clean a reused replacement channel', async () => {
    const pair = tokenPair();
    const staleChannel = deferred<SessionChannel>();
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const sharedUnsubscribe = vi.fn();
    const sharedChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => sharedUnsubscribe),
      close: vi.fn(),
    };
    const channelResults: Array<SessionChannel | Promise<SessionChannel>> = [
      initialChannel,
      staleChannel.promise,
      sharedChannel,
    ];
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'replacement-generation',
      createSessionChannel: () => {
        const channel = channelResults.shift();
        if (!channel) throw new Error('missing channel fixture');
        return channel;
      },
      tokenVerifier: fixtureVerifier,
    });
    port.deactivate();
    const oldActivation = port.activate();
    port.deactivate();

    port.activate();
    staleChannel.resolve(sharedChannel);
    await Promise.resolve(oldActivation);

    expect(sharedChannel.subscribe).toHaveBeenCalledOnce();
    expect(sharedUnsubscribe).not.toHaveBeenCalled();
    expect(sharedChannel.close).not.toHaveBeenCalled();
    await expect(port.initialize()).resolves.toMatchObject({
      generation: 'replacement-generation',
    });

    port.deactivate();
    expect(sharedUnsubscribe).toHaveBeenCalledOnce();
    expect(sharedChannel.close).toHaveBeenCalledOnce();
  });

  it('publishes logout completion that arrives while async activation is staging', async () => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const stagedChannel = deferred<SessionChannel>();
    const eventOrder: string[] = [];
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const activatedChannel: SessionChannel = {
      publish: vi.fn((generation) => {
        eventOrder.push(`publish:${generation}`);
      }),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const laterChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const channelResults: Array<SessionChannel | Promise<SessionChannel>> = [
      initialChannel,
      stagedChannel.promise,
      laterChannel,
    ];
    const client = {
      isAuthenticated: vi.fn(async () => {
        eventOrder.push('sdk-is-authenticated');
        return true;
      }),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(() => sdkLogout.promise),
    };
    const generations = [
      'authenticated-generation',
      'logout-generation',
      'reactivated-generation',
    ];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      createSessionChannel: () => {
        const channel = channelResults.shift();
        if (!channel) throw new Error('missing channel fixture');
        return channel;
      },
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();
    eventOrder.length = 0;
    const logout = port.logout();
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());
    port.deactivate();
    const activation = port.activate();

    sdkLogout.resolve();
    await logout;
    stagedChannel.resolve(activatedChannel);
    await Promise.resolve(activation);

    expect(activatedChannel.publish).toHaveBeenCalledOnce();
    expect(activatedChannel.publish).toHaveBeenCalledWith('logout-generation');
    await expect(port.initialize()).resolves.toMatchObject({
      generation: 'reactivated-generation',
    });
    expect(eventOrder).toEqual([
      'publish:logout-generation',
      'sdk-is-authenticated',
    ]);

    port.deactivate();
    port.activate();
    expect(laterChannel.publish).not.toHaveBeenCalled();
  });

  it('never lets an abandoned async activation publish after its replacement', async () => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const staleChannel = deferred<SessionChannel>();
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const abandonedChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const replacementChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const channelResults: Array<SessionChannel | Promise<SessionChannel>> = [
      initialChannel,
      staleChannel.promise,
      replacementChannel,
    ];
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(() => sdkLogout.promise),
    };
    const generations = [
      'authenticated-generation',
      'logout-generation',
      'reactivated-generation',
    ];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      createSessionChannel: () => {
        const channel = channelResults.shift();
        if (!channel) throw new Error('missing channel fixture');
        return channel;
      },
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();
    const logout = port.logout();
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());
    port.deactivate();
    sdkLogout.resolve();
    await logout;
    const oldActivation = port.activate();
    port.deactivate();

    port.activate();
    expect(replacementChannel.publish).toHaveBeenCalledOnce();
    expect(replacementChannel.publish).toHaveBeenCalledWith('logout-generation');
    staleChannel.resolve(abandonedChannel);
    await Promise.resolve(oldActivation);

    expect(abandonedChannel.subscribe).not.toHaveBeenCalled();
    expect(abandonedChannel.publish).not.toHaveBeenCalled();
    expect(abandonedChannel.close).toHaveBeenCalledOnce();
    expect(replacementChannel.publish).toHaveBeenCalledOnce();
    await expect(port.initialize()).resolves.toMatchObject({
      generation: 'reactivated-generation',
    });
  });

  it('returns the already-installed activation Promise to factory reentry', async () => {
    const pair = tokenPair();
    const pendingChannel = deferred<SessionChannel>();
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const activatedChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    let nestedActivation: void | Promise<void> = undefined;
    let factoryCalls = 0;
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      createSessionChannel: () => {
        factoryCalls += 1;
        if (factoryCalls === 1) return initialChannel;
        nestedActivation = port.activate();
        return pendingChannel.promise;
      },
      tokenVerifier: fixtureVerifier,
    });
    port.deactivate();

    const outerActivation = port.activate();

    expect(nestedActivation).toBe(outerActivation);
    pendingChannel.resolve(activatedChannel);
    await expect(outerActivation).resolves.toBeUndefined();
    expect(activatedChannel.subscribe).toHaveBeenCalledOnce();
  });

  it('does not let the earlier owner close a channel from a shared factory Promise', async () => {
    const pair = tokenPair();
    const pendingChannel = deferred<SessionChannel>();
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const sharedUnsubscribe = vi.fn();
    const sharedChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => sharedUnsubscribe),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    let factoryCalls = 0;
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      createSessionChannel: () => {
        factoryCalls += 1;
        return factoryCalls === 1 ? initialChannel : pendingChannel.promise;
      },
      tokenVerifier: fixtureVerifier,
    });
    port.deactivate();
    const staleActivation = port.activate();
    port.deactivate();
    const replacementActivation = port.activate();

    pendingChannel.resolve(sharedChannel);
    await expect(Promise.all([staleActivation, replacementActivation])).resolves.toEqual([undefined, undefined]);

    expect(sharedChannel.subscribe).toHaveBeenCalledOnce();
    expect(sharedUnsubscribe).not.toHaveBeenCalled();
    expect(sharedChannel.close).not.toHaveBeenCalled();
  });

  it('does not close a channel reactivated by the old cleanup unsubscribe', () => {
    const pair = tokenPair();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    let subscriptions = 0;
    channel.subscribe = vi.fn(() => {
      subscriptions += 1;
      const subscription = subscriptions;
      return () => {
        if (subscription === 1) port.activate();
      };
    });
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      createSessionChannel: () => channel,
      tokenVerifier: fixtureVerifier,
    });

    port.deactivate();

    expect(channel.subscribe).toHaveBeenCalledTimes(2);
    expect(channel.close).not.toHaveBeenCalled();
    port.deactivate();
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('fails closed when the active logout publication thenable rejects', async () => {
    const pair = tokenPair();
    const publishFailure = new Error('synthetic invalidation publish failure');
    const channel: SessionChannel = {
      publish: vi.fn(() => Promise.reject(publishFailure)),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'logout-generation',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();

    await expect(port.logout()).rejects.toBe(publishFailure);
    await expect(port.login('/app')).rejects.toThrow('logout must complete successfully');
  });

  it('does not let a stale distinct factory promise close a channel claimed by its replacement', async () => {
    const pair = tokenPair();
    const staleResult = deferred<SessionChannel>();
    const replacementResult = deferred<SessionChannel>();
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const unsubscribe = vi.fn();
    const sharedChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => unsubscribe),
      close: vi.fn(),
    };
    const factoryResults: Array<SessionChannel | Promise<SessionChannel>> = [
      initialChannel,
      staleResult.promise,
      replacementResult.promise,
    ];
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      createSessionChannel: () => {
        const result = factoryResults.shift();
        if (!result) throw new Error('missing channel fixture');
        return result;
      },
      tokenVerifier: fixtureVerifier,
    });
    port.deactivate();
    const staleActivation = port.activate();
    port.deactivate();
    const replacementActivation = port.activate();

    staleResult.resolve(sharedChannel);
    await Promise.resolve();
    expect(sharedChannel.close).not.toHaveBeenCalled();

    replacementResult.resolve(sharedChannel);
    await expect(Promise.all([staleActivation, replacementActivation])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(sharedChannel.subscribe).toHaveBeenCalledOnce();
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(sharedChannel.close).not.toHaveBeenCalled();
  });

  it('does not close an old channel while unsubscribe starts an async same-channel reactivation', async () => {
    const pair = tokenPair();
    const reactivationResult = deferred<SessionChannel>();
    const unsubscribe = vi.fn();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    let subscriptions = 0;
    let activatePort: () => void | Promise<void> = () => undefined;
    channel.subscribe = vi.fn(() => {
      subscriptions += 1;
      return () => {
        if (subscriptions === 1) {
          const activation = activatePort();
          if (activation) void activation.catch(() => undefined);
        }
        unsubscribe();
      };
    });
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      createSessionChannel: () => subscriptions === 1 ? reactivationResult.promise : channel,
      tokenVerifier: fixtureVerifier,
    });
    activatePort = () => port.activate();

    port.deactivate();
    expect(subscriptions).toBe(1);
    expect(channel.close).not.toHaveBeenCalled();
    reactivationResult.resolve(channel);
    await Promise.resolve();
    await Promise.resolve();

    expect(channel.subscribe).toHaveBeenCalledTimes(2);
    expect(channel.close).not.toHaveBeenCalled();
    port.deactivate();
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('fails closed instead of reclaiming a channel that completed close, then recovers with a new channel', async () => {
    const pair = tokenPair();
    const closedChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const recoveredChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    let factoryCalls = 0;
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      createSessionChannel: () => {
        factoryCalls += 1;
        if (factoryCalls === 1) return closedChannel;
        if (factoryCalls === 2) return Promise.resolve(closedChannel);
        return recoveredChannel;
      },
      tokenVerifier: fixtureVerifier,
    });

    port.deactivate();
    expect(closedChannel.close).toHaveBeenCalledOnce();

    await expect(port.activate()).rejects.toThrow('retired');
    await expect(port.initialize()).rejects.toThrow('inactive');

    port.activate();
    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a' },
    });
    expect(recoveredChannel.subscribe).toHaveBeenCalledOnce();
  });

  it('fails a same-channel activation started reentrantly by close after retirement begins', async () => {
    const pair = tokenPair();
    let reactivation: void | Promise<void> = undefined;
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(() => {
        reactivation = port.activate();
      }),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    let factoryCalls = 0;
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      createSessionChannel: () => {
        factoryCalls += 1;
        return factoryCalls === 1 ? channel : Promise.resolve(channel);
      },
      tokenVerifier: fixtureVerifier,
    });

    port.deactivate();

    await expect(Promise.resolve(reactivation)).rejects.toThrow('retired');
    await expect(port.initialize()).rejects.toThrow('inactive');
    expect(channel.subscribe).toHaveBeenCalledOnce();
  });

  it('does not let a second auth port reclaim a channel retired by the first port', async () => {
    const pair = tokenPair();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const firstPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      createSessionChannel: () => channel,
      tokenVerifier: fixtureVerifier,
    });
    firstPort.deactivate();

    const secondPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'generation',
      createSessionChannel: () => Promise.resolve(channel),
      tokenVerifier: fixtureVerifier,
    });

    await expect(secondPort.activate()).rejects.toThrow('retired');
    await expect(secondPort.initialize()).rejects.toThrow('inactive');
    expect(channel.subscribe).toHaveBeenCalledOnce();
  });

  it('keeps a shared active channel authoritative for the other port after one port deactivates', async () => {
    const pair = tokenPair();
    const listeners = new Set<(generation: string) => void>();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn((listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
      close: vi.fn(),
    };
    const firstClient = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const secondClient = { ...firstClient, isAuthenticated: vi.fn(async () => true) };
    const firstPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => firstClient,
      createGeneration: () => 'first', createSessionChannel: () => channel, tokenVerifier: fixtureVerifier,
    });
    const secondPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => secondClient,
      createGeneration: () => 'second', createSessionChannel: () => channel, tokenVerifier: fixtureVerifier,
    });

    firstPort.deactivate();
    expect(channel.close).not.toHaveBeenCalled();
    expect(listeners).toHaveLength(1);

    for (const listener of [...listeners]) listener('remote-generation');
    await waitFor(() => expect(secondClient.isAuthenticated).toHaveBeenCalledOnce());
    expect(channel.close).not.toHaveBeenCalled();
    secondPort.deactivate();
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('keeps the surviving port authoritative when two ports await one shared factory promise', async () => {
    const pair = tokenPair();
    const pendingChannel = deferred<SessionChannel>();
    const channel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true), getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken), getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const dependencies = {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'shared-promise-generation',
      createSessionChannel: () => pendingChannel.promise,
      tokenVerifier: fixtureVerifier,
    };
    const stalePort = createKindeAuthPort(runtime, dependencies);
    const survivingPort = createKindeAuthPort(runtime, dependencies);

    stalePort.deactivate();
    pendingChannel.resolve(channel);

    await expect(survivingPort.activate()).resolves.toBeUndefined();
    await expect(survivingPort.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a' },
    });
    expect(channel.subscribe).toHaveBeenCalledOnce();
    expect(channel.close).not.toHaveBeenCalled();
  });

  it('keeps a native shared factory result alive while the first subscriber synchronously deactivates', async () => {
    const pair = tokenPair();
    const pendingChannel = deferred<SessionChannel>();
    const unsubscribe = vi.fn();
    const firstPortRef: { current?: ReturnType<typeof createKindeAuthPort> } = {};
    const channel: SessionChannel = {
      publish: vi.fn(),
      close: vi.fn(),
      subscribe: vi.fn(() => {
        firstPortRef.current?.deactivate();
        return unsubscribe;
      }),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true), getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken), getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const dependencies = {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'shared-native', createSessionChannel: () => pendingChannel.promise,
      tokenVerifier: fixtureVerifier,
    };
    firstPortRef.current = createKindeAuthPort(runtime, dependencies);
    const secondPort = createKindeAuthPort(runtime, dependencies);

    pendingChannel.resolve(channel);

    await expect(secondPort.activate()).resolves.toBeUndefined();
    expect(channel.subscribe).toHaveBeenCalledTimes(2);
    expect(channel.close).not.toHaveBeenCalled();
    await expect(secondPort.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a' },
    });
    secondPort.deactivate();
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('lets a distinct pending factory claim the canceled port channel that resolves first', async () => {
    const pair = tokenPair();
    const pendingA = deferred<SessionChannel>();
    const pendingB = deferred<SessionChannel>();
    const channel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true), getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken), getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const firstPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'distinct-first', createSessionChannel: () => pendingA.promise,
      tokenVerifier: fixtureVerifier,
    });
    const secondPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'distinct-second', createSessionChannel: () => pendingB.promise,
      tokenVerifier: fixtureVerifier,
    });
    const secondActivation = secondPort.activate();

    firstPort.deactivate();
    pendingA.resolve(channel);
    await Promise.resolve();
    await Promise.resolve();
    expect(channel.close).not.toHaveBeenCalled();

    pendingB.resolve(channel);
    await expect(secondActivation).resolves.toBeUndefined();
    expect(channel.subscribe).toHaveBeenCalledOnce();
    expect(channel.close).not.toHaveBeenCalled();
    secondPort.deactivate();
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('retires a canceled result after a distinct pending factory resolves differently', async () => {
    const pair = tokenPair();
    const pendingA = deferred<SessionChannel>();
    const pendingB = deferred<SessionChannel>();
    const staleChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const claimedChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true), getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken), getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const firstPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'distinct-stale', createSessionChannel: () => pendingA.promise,
      tokenVerifier: fixtureVerifier,
    });
    const secondPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'distinct-claimed', createSessionChannel: () => pendingB.promise,
      tokenVerifier: fixtureVerifier,
    });
    const secondActivation = secondPort.activate();

    firstPort.deactivate();
    pendingA.resolve(staleChannel);
    await Promise.resolve();
    await Promise.resolve();
    expect(staleChannel.close).not.toHaveBeenCalled();

    pendingB.resolve(claimedChannel);
    await expect(secondActivation).resolves.toBeUndefined();
    expect(staleChannel.close).toHaveBeenCalledOnce();
    expect(claimedChannel.close).not.toHaveBeenCalled();
    secondPort.deactivate();
    expect(claimedChannel.close).toHaveBeenCalledOnce();
  });

  it('retires a canceled result after the last distinct pending factory rejects', async () => {
    const pendingA = deferred<SessionChannel>();
    const pendingB = deferred<SessionChannel>();
    const staleChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => false), getAccessToken: vi.fn(), getIdToken: vi.fn(),
      getToken: vi.fn(), login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const firstPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'distinct-reject-a', createSessionChannel: () => pendingA.promise,
      tokenVerifier: fixtureVerifier,
    });
    const secondPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'distinct-reject-b', createSessionChannel: () => pendingB.promise,
      tokenVerifier: fixtureVerifier,
    });
    const secondActivation = secondPort.activate();

    firstPort.deactivate();
    pendingA.resolve(staleChannel);
    await Promise.resolve();
    await Promise.resolve();
    expect(staleChannel.close).not.toHaveBeenCalled();

    const failure = new Error('distinct factory rejected');
    pendingB.reject(failure);
    await expect(secondActivation).rejects.toBe(failure);
    expect(staleChannel.close).toHaveBeenCalledOnce();
  });

  it('retires a canceled result when the last distinct never-settling factory is canceled', async () => {
    const pendingA = deferred<SessionChannel>();
    const neverSettles = deferred<SessionChannel>();
    const staleChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => false), getAccessToken: vi.fn(), getIdToken: vi.fn(),
      getToken: vi.fn(), login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const firstPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'distinct-cancel-a', createSessionChannel: () => pendingA.promise,
      tokenVerifier: fixtureVerifier,
    });
    const canceledPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'distinct-cancel-b', createSessionChannel: () => neverSettles.promise,
      tokenVerifier: fixtureVerifier,
    });

    firstPort.deactivate();
    pendingA.resolve(staleChannel);
    await Promise.resolve();
    await Promise.resolve();
    expect(staleChannel.close).not.toHaveBeenCalled();

    canceledPort.deactivate();
    expect(staleChannel.close).toHaveBeenCalledOnce();
  });

  it('does not register a canceled reentrant factory as a global waiter', async () => {
    const neverSettles = deferred<SessionChannel>();
    const pendingVictim = deferred<SessionChannel>();
    const staleChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => false), getAccessToken: vi.fn(), getIdToken: vi.fn(),
      getToken: vi.fn(), login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const reentrantPortRef: { current?: ReturnType<typeof createKindeAuthPort> } = {};
    const reentrantPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'reentrant-never-settles',
      createSessionChannel: () => {
        reentrantPortRef.current?.deactivate();
        return neverSettles.promise;
      },
      tokenVerifier: fixtureVerifier,
    });
    reentrantPortRef.current = reentrantPort;
    const victimPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'canceled-victim', createSessionChannel: () => pendingVictim.promise,
      tokenVerifier: fixtureVerifier,
    });

    void reentrantPort.activate();
    reentrantPort.deactivate();
    reentrantPort.deactivate();
    void victimPort.activate();
    victimPort.deactivate();
    pendingVictim.resolve(staleChannel);
    await Promise.resolve();
    await Promise.resolve();

    expect(staleChannel.subscribe).not.toHaveBeenCalled();
    expect(staleChannel.close).toHaveBeenCalledOnce();
    reentrantPort.deactivate();
    victimPort.deactivate();
    expect(staleChannel.close).toHaveBeenCalledOnce();
  });

  it('does not ghost-register a factory waiter canceled by its then getter', async () => {
    const pendingVictim = deferred<SessionChannel>();
    const staleChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const initialChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => false), getAccessToken: vi.fn(), getIdToken: vi.fn(),
      getToken: vi.fn(), login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const reentrantPortRef: { current?: ReturnType<typeof createKindeAuthPort> } = {};
    const neverSettlingSource = {
      get then() {
        reentrantPortRef.current?.deactivate();
        return () => undefined;
      },
    } as unknown as PromiseLike<SessionChannel>;
    let factoryCalls = 0;
    const reentrantPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'getter-reentrant',
      createSessionChannel: () => (++factoryCalls === 1 ? initialChannel : neverSettlingSource),
      tokenVerifier: fixtureVerifier,
    });
    reentrantPortRef.current = reentrantPort;
    const victimPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'getter-victim', createSessionChannel: () => pendingVictim.promise,
      tokenVerifier: fixtureVerifier,
    });

    reentrantPort.deactivate();
    void reentrantPort.activate();
    void victimPort.activate();
    victimPort.deactivate();
    pendingVictim.resolve(staleChannel);
    await Promise.resolve();
    await Promise.resolve();

    expect(staleChannel.subscribe).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(staleChannel.close).toHaveBeenCalledOnce());
    reentrantPort.deactivate();
    victimPort.deactivate();
    expect(staleChannel.close).toHaveBeenCalledOnce();
  });

  it('preserves PromiseResolve ordering for a fulfilled Promise subclass', async () => {
    class SessionChannelPromise extends Promise<SessionChannel> {}
    const channel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const source = SessionChannelPromise.resolve(channel);
    const client = {
      isAuthenticated: vi.fn(async () => false), getAccessToken: vi.fn(), getIdToken: vi.fn(),
      getToken: vi.fn(), login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'promise-subclass', createSessionChannel: () => source,
      tokenVerifier: fixtureVerifier,
    });

    queueMicrotask(() => port.deactivate());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(channel.subscribe).not.toHaveBeenCalled();
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('retires a stale divergent PromiseLike result exactly once after the other waiter rejects', async () => {
    const pair = tokenPair();
    const factoryFailure = new Error('second waiter rejected');
    const staleChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    let thenCalls = 0;
    const divergentSource = {
      then(onFulfilled: (channel: SessionChannel) => unknown, onRejected: (reason: unknown) => unknown) {
        thenCalls += 1;
        if (thenCalls === 1) onFulfilled(staleChannel);
        else onRejected(factoryFailure);
        return divergentSource;
      },
    } as unknown as PromiseLike<SessionChannel>;
    const client = {
      isAuthenticated: vi.fn(async () => true), getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken), getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const firstPortRef: { current?: ReturnType<typeof createKindeAuthPort> } = {};
    staleChannel.subscribe = vi.fn(() => {
      firstPortRef.current?.deactivate();
      return () => undefined;
    });
    const dependencies = {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'divergent', createSessionChannel: () => divergentSource,
      tokenVerifier: fixtureVerifier,
    };
    firstPortRef.current = createKindeAuthPort(runtime, dependencies);
    const secondPort = createKindeAuthPort(runtime, dependencies);

    await expect(secondPort.activate()).rejects.toBe(factoryFailure);
    await Promise.resolve();
    expect(staleChannel.close).toHaveBeenCalledOnce();
    expect(staleChannel.subscribe).toHaveBeenCalledOnce();
  });

  it('closes a canceled divergent PromiseLike result after its last shared waiter rejects', async () => {
    const pair = tokenPair();
    const factoryFailure = new Error('surviving waiter rejected');
    const staleChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    let thenCalls = 0;
    const divergentSource = {
      then(onFulfilled: (channel: SessionChannel) => unknown, onRejected: (reason: unknown) => unknown) {
        thenCalls += 1;
        if (thenCalls === 1) onFulfilled(staleChannel);
        else onRejected(factoryFailure);
        return divergentSource;
      },
    } as unknown as PromiseLike<SessionChannel>;
    const client = {
      isAuthenticated: vi.fn(async () => true), getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken), getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const dependencies = {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'canceled-divergent', createSessionChannel: () => divergentSource,
      tokenVerifier: fixtureVerifier,
    };
    const stalePort = createKindeAuthPort(runtime, dependencies);
    const survivingPort = createKindeAuthPort(runtime, dependencies);

    stalePort.deactivate();

    await expect(survivingPort.activate()).rejects.toBe(factoryFailure);
    await Promise.resolve();
    expect(staleChannel.subscribe).not.toHaveBeenCalled();
    expect(staleChannel.close).toHaveBeenCalledOnce();
  });

  it('reclaims only the canceled divergent channel when another waiter claims a different result', async () => {
    const pair = tokenPair();
    const staleChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const claimedChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    let thenCalls = 0;
    const divergentSource = {
      then(onFulfilled: (channel: SessionChannel) => unknown) {
        thenCalls += 1;
        onFulfilled(thenCalls === 1 ? staleChannel : claimedChannel);
        return divergentSource;
      },
    } as unknown as PromiseLike<SessionChannel>;
    const client = {
      isAuthenticated: vi.fn(async () => true), getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken), getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const dependencies = {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'different-divergent', createSessionChannel: () => divergentSource,
      tokenVerifier: fixtureVerifier,
    };
    const stalePort = createKindeAuthPort(runtime, dependencies);
    const survivingPort = createKindeAuthPort(runtime, dependencies);

    stalePort.deactivate();

    await expect(survivingPort.activate()).resolves.toBeUndefined();
    expect(staleChannel.close).toHaveBeenCalledOnce();
    expect(claimedChannel.subscribe).toHaveBeenCalledOnce();
    expect(claimedChannel.close).not.toHaveBeenCalled();
    survivingPort.deactivate();
    expect(staleChannel.close).toHaveBeenCalledOnce();
    expect(claimedChannel.close).toHaveBeenCalledOnce();
  });

  it('locally invalidates the other active port when both ports share one channel handle', async () => {
    const pair = tokenPair();
    const listeners = new Set<(generation: string) => void>();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn((listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
      close: vi.fn(),
    };
    const firstClient = {
      isAuthenticated: vi.fn(async () => true), getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken), getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const secondClient = { ...firstClient, isAuthenticated: vi.fn(async () => true) };
    const firstPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => firstClient,
      createGeneration: () => 'first-logout', createSessionChannel: () => channel, tokenVerifier: fixtureVerifier,
    });
    const secondPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => secondClient,
      createGeneration: () => 'second-session', createSessionChannel: () => channel, tokenVerifier: fixtureVerifier,
    });
    await firstPort.initialize();
    await secondPort.initialize();
    const secondInvalidations = vi.fn();
    secondPort.subscribe(secondInvalidations);

    await firstPort.logout();

    expect(channel.publish).toHaveBeenCalledWith('first-logout');
    expect(secondPort.getCurrentSession()).toBeNull();
    expect(secondInvalidations).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(2);
  });

  it('locally invalidates every other shared owner for identity replacement and anonymous clearing publications', async () => {
    let firstTokens = tokenPair('user-a', 'org-a');
    const secondTokens = tokenPair('user-a', 'org-a');
    const listeners = new Set<(generation: string) => void>();
    const channel: SessionChannel = {
      publish: vi.fn(), close: vi.fn(),
      subscribe: vi.fn((listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
    };
    let firstAuthenticated = true;
    const firstClient = {
      isAuthenticated: vi.fn(async () => firstAuthenticated),
      getAccessToken: vi.fn(async () => firstTokens.accessToken),
      getIdToken: vi.fn(async () => firstTokens.idToken),
      getToken: vi.fn(async () => firstTokens.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const secondClient = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => secondTokens.accessToken),
      getIdToken: vi.fn(async () => secondTokens.idToken),
      getToken: vi.fn(async () => secondTokens.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const firstPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => firstClient,
      createGeneration: () => 'first', createSessionChannel: () => channel, tokenVerifier: fixtureVerifier,
    });
    const secondPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => secondClient,
      createGeneration: () => 'second', createSessionChannel: () => channel, tokenVerifier: fixtureVerifier,
    });
    await firstPort.initialize();
    await secondPort.initialize();

    firstTokens = tokenPair('user-b', 'org-b');
    await firstPort.revalidate('refresh');
    expect(secondPort.getCurrentSession()).toBeNull();

    await secondPort.revalidate('refresh');
    expect(secondPort.getCurrentSession()).toMatchObject({ identity: { subject: 'user-a' } });
    firstAuthenticated = false;
    await firstPort.revalidate('refresh');
    expect(secondPort.getCurrentSession()).toBeNull();
    expect(channel.publish).toHaveBeenCalledTimes(2);
  });

  it('does not retain a canceled never-settling reentrant factory as a global channel owner', () => {
    const pair = tokenPair();
    const neverChannel = deferred<SessionChannel>();
    const firstPortRef: { current?: ReturnType<typeof createKindeAuthPort> } = {};
    let subscriptions = 0;
    const channel: SessionChannel = {
      publish: vi.fn(),
      close: vi.fn(),
      subscribe: vi.fn(() => () => {
        subscriptions += 1;
        if (subscriptions !== 1) return;
        const activation = firstPortRef.current?.activate();
        if (activation) void activation.catch(() => undefined);
      }),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true), getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken), getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    let firstFactoryCalls = 0;
    const firstPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'first',
      createSessionChannel: () => {
        firstFactoryCalls += 1;
        return firstFactoryCalls === 1 ? channel : neverChannel.promise;
      },
      tokenVerifier: fixtureVerifier,
    });
    firstPortRef.current = firstPort;
    const secondPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'second', createSessionChannel: () => channel, tokenVerifier: fixtureVerifier,
    });

    firstPort.deactivate();
    firstPort.deactivate();
    secondPort.deactivate();

    expect(firstFactoryCalls).toBe(2);
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('does not retire a shared channel while another port has a pending subscription', async () => {
    const pair = tokenPair();
    const pendingUnsubscribe = deferred<() => void>();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn()
        .mockImplementationOnce(() => () => undefined)
        .mockImplementationOnce(() => pendingUnsubscribe.promise as unknown as () => void),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true), getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken), getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    const firstPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'first', createSessionChannel: () => channel, tokenVerifier: fixtureVerifier,
    });
    const secondPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'second', createSessionChannel: () => channel, tokenVerifier: fixtureVerifier,
    });

    firstPort.deactivate();
    expect(channel.close).not.toHaveBeenCalled();
    pendingUnsubscribe.resolve(() => undefined);
    await expect(secondPort.activate()).resolves.toBeUndefined();
    expect(channel.close).not.toHaveBeenCalled();
    secondPort.deactivate();
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('fails closed for a primitive channel factory result and permits a healthy retry', async () => {
    const pair = tokenPair();
    const initialChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const recoveredChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true), getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken), getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(async () => undefined),
    };
    let factoryCalls = 0;
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'generation',
      createSessionChannel: () => {
        factoryCalls += 1;
        if (factoryCalls === 1) return initialChannel;
        return factoryCalls === 2 ? 7 as unknown as SessionChannel : recoveredChannel;
      },
      tokenVerifier: fixtureVerifier,
    });

    port.deactivate();
    expect(() => port.activate()).toThrow('invalid channel');
    await expect(Promise.resolve(port.activate())).resolves.toBeUndefined();
    expect(factoryCalls).toBe(3);
    expect(recoveredChannel.subscribe).toHaveBeenCalledOnce();
    port.deactivate();
    expect(recoveredChannel.close).toHaveBeenCalledOnce();
  });

  it('recreates the default BroadcastChannel after reactivation and receives its remote invalidations', async () => {
    const pair = tokenPair();
    const originalBroadcastChannel = globalThis.BroadcastChannel;
    const channels: Array<{
      close: ReturnType<typeof vi.fn>;
      emit(generation: string): void;
    }> = [];
    function FakeBroadcastChannel() {
      let listener: ((event: MessageEvent<unknown>) => void) | undefined;
      const record = {
        close: vi.fn(() => {
          listener = undefined;
        }),
        emit(generation: string) {
          listener?.(new MessageEvent('message', {
            data: { type: 'session-invalidated', generation },
          }));
        },
      };
      channels.push(record);
      return {
        postMessage: vi.fn(),
        addEventListener: vi.fn((_type: 'message', nextListener) => {
          listener = nextListener;
        }),
        removeEventListener: vi.fn(() => {
          listener = undefined;
        }),
        close: record.close,
      };
    }
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    try {
      const port = createKindeAuthPort(runtime, {
        origin: 'http://localhost:8791',
        createClient: async () => client,
        createGeneration: () => 'generation',
        tokenVerifier: fixtureVerifier,
      });
      await port.initialize();
      port.deactivate();
      port.activate();
      await port.initialize();

      channels[1]?.emit('remote-generation');
      await waitFor(() => expect(client.isAuthenticated).toHaveBeenCalledTimes(3));

      expect(channels).toHaveLength(2);
      expect(channels[0]?.close).toHaveBeenCalledOnce();
      expect(channels[1]?.close).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('BroadcastChannel', originalBroadcastChannel);
    }
  });

  it('contains a rejected clear-session publication without restoring authority', async () => {
    const pair = tokenPair();
    const publicationFailure = new Error('clear publication failure');
    const channel: SessionChannel = {
      publish: vi.fn(() => Promise.reject(publicationFailure) as unknown as void),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'clear-generation',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();

    await expect(port.revalidate('focus')).resolves.toBeNull();
    await Promise.resolve();
    expect(port.getCurrentSession()).toBeNull();
    expect(channel.publish).toHaveBeenCalledOnce();
  });

  it('fails closed when an authority-change publication thenable rejects', async () => {
    const pairA = tokenPair('user-a', 'org-a');
    const pairB = tokenPair('user-b', 'org-b');
    const publicationFailure = new Error('authority publication failure');
    const channel: SessionChannel = {
      publish: vi.fn(() => Promise.reject(publicationFailure) as unknown as void),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn()
        .mockResolvedValueOnce(pairA.accessToken)
        .mockResolvedValueOnce(pairB.accessToken),
      getIdToken: vi.fn()
        .mockResolvedValueOnce(pairA.idToken)
        .mockResolvedValueOnce(pairB.idToken),
      getToken: vi.fn(async () => pairB.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'authority-generation',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();

    await expect(port.revalidate('focus')).rejects.toBe(publicationFailure);
    expect(port.getCurrentSession()).toBeNull();
    expect(channel.publish).toHaveBeenCalledTimes(2);
  });

  it('keeps a synchronously staged reactivation channel leased through the old unsubscribe cleanup', async () => {
    const pair = tokenPair();
    const stagedUnsubscribe = deferred<() => void>();
    const channel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    let subscriptions = 0;
    let reactivation: void | Promise<void> = undefined;
    channel.subscribe = vi.fn(() => {
      subscriptions += 1;
      if (subscriptions === 1) {
        return () => {
          reactivation = port.activate();
        };
      }
      return stagedUnsubscribe.promise;
    }) as unknown as SessionChannel['subscribe'];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'lease-generation',
      createSessionChannel: () => channel,
      tokenVerifier: fixtureVerifier,
    });

    port.deactivate();
    stagedUnsubscribe.resolve(() => undefined);
    await expect(reactivation).resolves.toBeUndefined();

    expect(channel.close).not.toHaveBeenCalled();
    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a' },
    });
  });

  it('lets deferred-publication cleanup unsubscribe claim a same-channel replacement before factory guards retire it', async () => {
    const pair = tokenPair();
    const sdkLogout = deferred<void>();
    const deferredPublication = deferred<void>();
    const initialChannel: SessionChannel = {
      publish: vi.fn(), subscribe: vi.fn(() => () => undefined), close: vi.fn(),
    };
    let subscriptions = 0;
    let replacementActivation: void | Promise<void> = undefined;
    const stagedChannel: SessionChannel = {
      publish: vi.fn(() => deferredPublication.promise as unknown as void),
      subscribe: vi.fn(() => {
        subscriptions += 1;
        if (subscriptions === 1) {
          return () => {
            replacementActivation = port.activate();
          };
        }
        return () => undefined;
      }),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true), getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken), getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined), logout: vi.fn(() => sdkLogout.promise),
    };
    let factoryCalls = 0;
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791', createClient: async () => client,
      createGeneration: () => 'deferred-replacement',
      createSessionChannel: () => {
        factoryCalls += 1;
        if (factoryCalls === 1) return initialChannel;
        if (factoryCalls === 2) return Promise.resolve(stagedChannel);
        return stagedChannel;
      },
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();

    const logout = port.logout();
    await waitFor(() => expect(client.logout).toHaveBeenCalledOnce());
    port.deactivate();
    sdkLogout.resolve();
    await logout;

    const stagedActivation = port.activate();
    await waitFor(() => expect(stagedChannel.publish).toHaveBeenCalledOnce());
    port.deactivate();

    expect(stagedChannel.close).not.toHaveBeenCalled();
    expect(replacementActivation).toBeDefined();
    deferredPublication.resolve();
    await expect(Promise.resolve(stagedActivation)).resolves.toBeUndefined();
    await expect(Promise.resolve(replacementActivation)).resolves.toBeUndefined();
    expect(stagedChannel.subscribe).toHaveBeenCalledTimes(2);
    expect(stagedChannel.close).not.toHaveBeenCalled();
  });

  it('starts a fresh reactivation when a rejected factory closes the prior lease', async () => {
    const pair = tokenPair();
    const factoryFailure = new Error('factory failure');
    const initialChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      close: vi.fn(),
    };
    const recoveredChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    let factoryCalls = 0;
    let failedActivation: void | Promise<void> = undefined;
    let closeReactivation: void | Promise<void> = undefined;
    initialChannel.subscribe = vi.fn(() => () => {
      failedActivation = port.activate();
    });
    initialChannel.close = vi.fn(() => {
      closeReactivation = port.activate();
    });
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'recovery-generation',
      createSessionChannel: () => {
        factoryCalls += 1;
        if (factoryCalls === 1) return initialChannel;
        if (factoryCalls === 2) return Promise.reject(factoryFailure);
        return recoveredChannel;
      },
      tokenVerifier: fixtureVerifier,
    });

    port.deactivate();

    await expect(failedActivation).rejects.toBe(factoryFailure);
    await expect(Promise.resolve(closeReactivation)).resolves.toBeUndefined();
    expect(factoryCalls).toBe(3);
    await expect(port.initialize()).resolves.toMatchObject({
      identity: { subject: 'user-a' },
    });
  });

  it('clears an unpropagated authority change when a concurrent focus validation supersedes it', async () => {
    const pairA = tokenPair('user-a', 'org-a');
    const pairB = tokenPair('user-b', 'org-b');
    const publication = deferred<void>();
    void publication.promise.catch(() => undefined);
    const channel: SessionChannel = {
      publish: vi.fn(() => publication.promise as unknown as void),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn()
        .mockResolvedValueOnce(pairA.accessToken)
        .mockResolvedValueOnce(pairB.accessToken)
        .mockResolvedValueOnce(pairB.accessToken),
      getIdToken: vi.fn()
        .mockResolvedValueOnce(pairA.idToken)
        .mockResolvedValueOnce(pairB.idToken)
        .mockResolvedValueOnce(pairB.idToken),
      getToken: vi.fn(async () => pairB.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'authority-generation',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();

    const changing = port.revalidate('refresh');
    await waitFor(() => expect(channel.publish).toHaveBeenCalledOnce());
    await expect(port.revalidate('focus')).resolves.toMatchObject({
      identity: { subject: 'user-b' },
    });
    publication.reject(new Error('authority propagation failed'));

    await expect(changing).rejects.toThrow('authority propagation failed');
    expect(port.getCurrentSession()).toBeNull();
  });

  it('fails closed when an authority publication then getter throws', async () => {
    const pairA = tokenPair('user-a', 'org-a');
    const pairB = tokenPair('user-b', 'org-b');
    const publicationFailure = new Error('throwing then getter');
    const throwingThen = Object.defineProperty({}, 'then', {
      get() {
        throw publicationFailure;
      },
    });
    const channel: SessionChannel = {
      publish: vi.fn(() => throwingThen as unknown as void),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn()
        .mockResolvedValueOnce(pairA.accessToken)
        .mockResolvedValueOnce(pairB.accessToken),
      getIdToken: vi.fn()
        .mockResolvedValueOnce(pairA.idToken)
        .mockResolvedValueOnce(pairB.idToken),
      getToken: vi.fn(async () => pairB.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => 'authority-generation',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    await port.initialize();

    await expect(port.revalidate('focus')).rejects.toBe(publicationFailure);
    expect(port.getCurrentSession()).toBeNull();
  });
});

describe('createSessionChannel', () => {
  it('uses the exact channel and transmits only the invalidation type and generation', () => {
    let onMessage: ((event: MessageEvent<unknown>) => void) | undefined;
    const postMessage = vi.fn();
    const removeEventListener = vi.fn();
    const close = vi.fn();
    const createBroadcastChannel = vi.fn(() => ({
      postMessage,
      addEventListener: (_type: 'message', listener: (event: MessageEvent<unknown>) => void) => {
        onMessage = listener;
      },
      removeEventListener,
      close,
    }));
    const channel = createSessionChannel(createBroadcastChannel);
    const receive = vi.fn();
    const unsubscribe = channel.subscribe(receive);

    channel.publish('local-generation');
    onMessage?.(new MessageEvent('message', {
      data: { type: 'session-invalidated', generation: 'remote-generation' },
    }));
    onMessage?.(new MessageEvent('message', {
      data: { type: 'session-invalidated', generation: 'bad', token: 'must-not-pass' },
    }));
    unsubscribe();
    channel.close();

    expect(createBroadcastChannel).toHaveBeenCalledWith('osp-session-v1');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'session-invalidated',
      generation: 'local-generation',
    });
    expect(receive).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenCalledWith('remote-generation');
    expect(removeEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(close).toHaveBeenCalledOnce();
  });

  it('uses a no-op channel without falling back to Local Storage', () => {
    const originalBroadcastChannel = globalThis.BroadcastChannel;
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    vi.stubGlobal('BroadcastChannel', undefined);
    try {
      const channel = createSessionChannel();
      channel.publish('no-channel-generation');
      channel.subscribe(() => undefined)();
      channel.close();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('BroadcastChannel', originalBroadcastChannel);
      setItem.mockRestore();
    }
  });

  it('closes an acquired raw channel when message-listener installation throws', () => {
    const listenerFailure = new Error('synthetic listener installation failure');
    const close = vi.fn();
    const createBroadcastChannel = vi.fn(() => ({
      postMessage: vi.fn(),
      addEventListener: vi.fn(() => {
        throw listenerFailure;
      }),
      removeEventListener: vi.fn(),
      close,
    }));

    expect(() => createSessionChannel(createBroadcastChannel)).toThrow(listenerFailure);
    expect(close).toHaveBeenCalledOnce();
  });

  it('isolates a throwing message listener so later listeners still receive invalidation', () => {
    const onMessages: Array<(event: MessageEvent<unknown>) => void> = [];
    const createBroadcastChannel = vi.fn(() => ({
      postMessage: vi.fn(),
      addEventListener: (_type: 'message', listener: (event: MessageEvent<unknown>) => void) => {
        onMessages.push(listener);
      },
      removeEventListener: vi.fn(),
      close: vi.fn(),
    }));
    const channel = createSessionChannel(createBroadcastChannel);
    channel.subscribe(() => {
      throw new Error('sensitive channel listener detail');
    });
    const healthyListener = vi.fn();
    channel.subscribe(healthyListener);
    const event = new MessageEvent('message', {
      data: { type: 'session-invalidated', generation: 'remote-generation' },
    });

    expect(() => {
      for (const onMessage of onMessages) onMessage(event);
    }).not.toThrow();
    expect(healthyListener).toHaveBeenCalledOnce();
    expect(healthyListener).toHaveBeenCalledWith('remote-generation');
  });

  it('contains rejecting channel listeners and snapshots reentrant subscriptions per message', async () => {
    const nativeListeners = new Set<(event: MessageEvent<unknown>) => void>();
    const postMessage = vi.fn();
    const removeEventListener = vi.fn((
      _type: 'message',
      listener: (event: MessageEvent<unknown>) => void,
    ) => {
      nativeListeners.delete(listener);
    });
    const createBroadcastChannel = vi.fn(() => ({
      postMessage,
      addEventListener: (_type: 'message', listener: (event: MessageEvent<unknown>) => void) => {
        nativeListeners.add(listener);
      },
      removeEventListener,
      close: vi.fn(),
    }));
    const emit = (generation: string) => {
      const event = new MessageEvent('message', {
        data: { type: 'session-invalidated', generation },
      });
      for (const listener of nativeListeners) listener(event);
    };
    const channel = createSessionChannel(createBroadcastChannel);
    const lateListener = vi.fn();
    const healthyListener = vi.fn();
    let unsubscribeHealthy: () => void = () => undefined;
    channel.subscribe(() => {
      unsubscribeHealthy();
      channel.subscribe(lateListener);
    });
    channel.subscribe(() => {
      throw new Error('sensitive sync channel listener detail');
    });
    const asyncThen = vi.fn((
      _resolve?: (value: unknown) => void,
      reject?: (reason: unknown) => void,
    ) => {
      reject?.(new Error('sensitive async channel listener detail'));
    });
    channel.subscribe(() => ({ then: asyncThen }) as unknown as void);
    unsubscribeHealthy = channel.subscribe(healthyListener);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      emit('remote-generation-1');
      await waitFor(() => expect(asyncThen).toHaveBeenCalledOnce());
      expect(healthyListener).toHaveBeenCalledOnce();
      expect(healthyListener).toHaveBeenCalledWith('remote-generation-1');
      expect(lateListener).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();

      emit('remote-generation-2');
      await waitFor(() => expect(asyncThen).toHaveBeenCalledTimes(2));
      expect(healthyListener).toHaveBeenCalledOnce();
      expect(lateListener).toHaveBeenCalledOnce();
      expect(lateListener).toHaveBeenCalledWith('remote-generation-2');
      channel.publish('local-generation');
      expect(postMessage).toHaveBeenCalledOnce();
      expect(consoleError).not.toHaveBeenCalled();

      channel.close();
      expect(nativeListeners).toHaveLength(0);
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('AuthProvider', () => {
  it('lets only the latest validation run update authenticated state', async () => {
    const first = deferred<BoundSession | null>();
    const second = deferred<BoundSession | null>();
    const port = mutablePort(null);
    port.initialize = vi.fn(() => first.promise);
    port.revalidate = vi.fn(() => second.promise);
    render(<Harness port={port} />);
    await waitFor(() => expect(port.initialize).toHaveBeenCalledOnce());

    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(port.revalidate).toHaveBeenCalledWith('focus'));
    second.resolve(bound('user-b', 'org-b', 'newer'));
    await screen.findByText('authenticated:user-b:org-b:newer');

    first.resolve(bound('user-a', 'org-a', 'stale'));
    await act(async () => undefined);
    expect(screen.getByTestId('auth-state')).toHaveTextContent(
      'authenticated:user-b:org-b:newer',
    );
  });

  it('exposes loading immediately when a replacement real port is still initializing', async () => {
    const pairA = tokenPair('user-a', 'org-a');
    const pairB = tokenPair('user-b', 'org-b');
    const newClientPending = deferred<{
      isAuthenticated(): Promise<boolean>;
      getAccessToken(): Promise<string>;
      getIdToken(): Promise<string>;
      getToken(): Promise<string>;
      login(): Promise<void>;
      logout(): Promise<void>;
    }>();
    const oldClient = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pairA.accessToken),
      getIdToken: vi.fn(async () => pairA.idToken),
      getToken: vi.fn(async () => pairA.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const newClient = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pairB.accessToken),
      getIdToken: vi.fn(async () => pairB.idToken),
      getToken: vi.fn(async () => pairB.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const oldPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => oldClient,
      createGeneration: () => 'old-generation',
      tokenVerifier: fixtureVerifier,
    });
    const newPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: () => newClientPending.promise,
      createGeneration: () => 'new-generation',
      tokenVerifier: fixtureVerifier,
    });
    const view = render(<Harness port={oldPort} />);
    await screen.findByText('authenticated:user-a:org-a:old-generation');

    view.rerender(<Harness port={newPort} />);

    expect(screen.getByTestId('auth-state')).toHaveTextContent('loading');
    expect(screen.getByTestId('auth-state')).not.toHaveTextContent('user-a');
    newClientPending.resolve(newClient);
    await screen.findByText('authenticated:user-b:org-b:new-generation');
  });

  it('does not reuse stale A state during a rapid A-to-B-to-A port transition', async () => {
    const initialA = bound('user-a', 'org-a', 'initial-a');
    const reinitializedA = bound('user-a', 'org-a', 'reinitialized-a');
    const pendingA = deferred<BoundSession | null>();
    const pendingB = deferred<BoundSession | null>();
    const portA = mutablePort(initialA);
    portA.initialize = vi.fn()
      .mockResolvedValueOnce(initialA)
      .mockImplementationOnce(() => pendingA.promise);
    const portB = mutablePort(null);
    portB.initialize = vi.fn(() => pendingB.promise);
    const view = render(<Harness port={portA} />);
    await screen.findByText('authenticated:user-a:org-a:initial-a');

    view.rerender(<Harness port={portB} />);
    expect(screen.getByTestId('auth-state')).toHaveTextContent('loading');
    await waitFor(() => expect(portB.initialize).toHaveBeenCalledOnce());

    view.rerender(<Harness port={portA} />);

    expect(screen.getByTestId('auth-state')).toHaveTextContent('loading');
    expect(screen.getByTestId('auth-state')).not.toHaveTextContent('initial-a');
    pendingB.resolve(bound('user-b', 'org-b', 'late-b'));
    await act(async () => undefined);
    expect(screen.getByTestId('auth-state')).toHaveTextContent('loading');
    pendingA.resolve(reinitializedA);
    await screen.findByText('authenticated:user-a:org-a:reinitialized-a');
  });

  it('revalidates on focus and when the document becomes visible', async () => {
    const session = bound('user-a', 'org-a', 'g-a');
    const port = mutablePort(session);
    render(<Harness port={port} />);
    await screen.findByText('authenticated:user-a:org-a:g-a');

    window.dispatchEvent(new Event('focus'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(port.revalidate).toHaveBeenCalledWith('focus');
      expect(port.revalidate).toHaveBeenCalledWith('visible');
    });
  });

  it('updates from a subscribed cross-tab session change', async () => {
    const port = mutablePort(bound('user-a', 'org-a', 'g-a'));
    render(<Harness port={port} />);
    await screen.findByText('authenticated:user-a:org-a:g-a');

    act(() => port.emit(bound('user-b', 'org-b', 'g-cross')));

    expect(screen.getByTestId('auth-state')).toHaveTextContent(
      'authenticated:user-b:org-b:g-cross',
    );
  });

  it('renders a visible error state for the latest callback failure', async () => {
    const port = mutablePort(null);
    port.initialize = vi.fn(async () => {
      throw new Error('synthetic callback failure');
    });
    render(<Harness port={port} />);

    await screen.findByText('error');
  });

  it('ignores and deactivates an old real port whose pending logout finishes after replacement', async () => {
    const pairA = tokenPair('user-a', 'org-a');
    const pairB = tokenPair('user-b', 'org-b');
    const oldLogout = deferred<void>();
    const oldChannel: SessionChannel = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      close: vi.fn(),
    };
    const oldClient = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pairA.accessToken),
      getIdToken: vi.fn(async () => pairA.idToken),
      getToken: vi.fn(async () => pairA.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(() => oldLogout.promise),
    };
    const newClient = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pairB.accessToken),
      getIdToken: vi.fn(async () => pairB.idToken),
      getToken: vi.fn(async () => pairB.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const oldPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => oldClient,
      createGeneration: () => 'old-generation',
      sessionChannel: oldChannel,
      tokenVerifier: fixtureVerifier,
    });
    const newPort = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => newClient,
      createGeneration: () => 'new-generation',
      tokenVerifier: fixtureVerifier,
    });
    const view = render(<Harness port={oldPort}><LogoutProbe /></Harness>);
    await screen.findByText('authenticated:user-a:org-a:old-generation');
    fireEvent.click(screen.getByRole('button', { name: 'logout' }));
    await waitFor(() => expect(oldClient.logout).toHaveBeenCalledOnce());

    view.rerender(<Harness port={newPort}><LogoutProbe /></Harness>);
    await screen.findByText('authenticated:user-b:org-b:new-generation');
    oldLogout.resolve();
    await act(async () => undefined);

    expect(screen.getByTestId('auth-state')).toHaveTextContent(
      'authenticated:user-b:org-b:new-generation',
    );
    expect(oldChannel.publish).not.toHaveBeenCalled();
    expect(oldChannel.close).toHaveBeenCalledOnce();
  });

  it('reactivates one real port across StrictMode setup-cleanup-setup without duplicate channels', async () => {
    const pair = tokenPair();
    const replaceUrl = vi.fn();
    const activeChannelListeners = new Set<(generation: string) => void>();
    const channels: Array<{
      publish: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
      emit(generation: string): void;
    }> = [];
    const createChannel = () => {
      const localListeners = new Set<(generation: string) => void>();
      const publish = vi.fn();
      const close = vi.fn(() => {
        for (const listener of localListeners) activeChannelListeners.delete(listener);
        localListeners.clear();
      });
      const record = {
        publish,
        close,
        emit(generation: string) {
          for (const listener of [...localListeners]) listener(generation);
        },
      };
      channels.push(record);
      return {
        publish,
        subscribe(listener: (generation: string) => void) {
          localListeners.add(listener);
          activeChannelListeners.add(listener);
          return () => {
            localListeners.delete(listener);
            activeChannelListeners.delete(listener);
          };
        },
        close,
      } satisfies SessionChannel;
    };
    const client = {
      isAuthenticated: vi.fn(async () => true),
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    };
    const generations = ['strict-generation', 'cross-generation'];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async (options) => {
        options.on_redirect_callback?.({
          given_name: 'Visible',
          id: 'user-a',
          family_name: 'Operator',
          email: 'user-a@example.test',
          picture: undefined,
        }, { returnTo: '/app/strict-mode' });
        return client;
      },
      createGeneration: () => generations.shift() ?? 'unexpected',
      createSessionChannel: createChannel,
      replaceUrl,
      tokenVerifier: fixtureVerifier,
    });

    const view = render(
      <StrictMode>
        <Harness port={port} />
      </StrictMode>,
    );

    await screen.findByText('authenticated:user-a:org-a:strict-generation');
    expect(channels).toHaveLength(2);
    expect(activeChannelListeners).toHaveLength(1);
    expect(replaceUrl).toHaveBeenCalledOnce();
    expect(replaceUrl).toHaveBeenCalledWith('/app/strict-mode');
    expect(channels[0]?.publish).not.toHaveBeenCalled();
    expect(channels[1]?.publish).toHaveBeenCalledOnce();
    expect(channels[1]?.publish).toHaveBeenCalledWith('strict-generation');
    act(() => channels.at(-1)?.emit('remote-generation'));
    await screen.findByText('authenticated:user-a:org-a:cross-generation');
    expect(client.getAccessToken).toHaveBeenCalledTimes(2);
    expect(channels.reduce(
      (count, channel) => count + channel.publish.mock.calls.length,
      0,
    )).toBe(1);

    view.unmount();

    expect(activeChannelListeners).toHaveLength(0);
    expect(channels.every((channel) => channel.close.mock.calls.length === 1)).toBe(true);
    expect(port.getCurrentSession()).toBeNull();
  });
});
