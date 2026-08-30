import { QueryClient, useQuery } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Suspense,
  startTransition,
  type ReactNode,
  useState,
} from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeConfig } from '../config/runtime';
import type { AuthPort, BoundSession } from './auth-port';
import { AuthProvider, type AuthState, useAuth } from './AuthProvider';
import { createKindeAuthPort } from './kinde-auth-port';
import type { SessionChannel } from './session-channel';
import {
  SessionScopedQueryProvider,
  sessionQueryScopeKey,
} from './SessionScopedQueryProvider';
import type { KindeTokenVerifier } from './token-binding';

const runtime: RuntimeConfig = {
  VITE_KINDE_DOMAIN: 'https://auth.heymarksman.com',
  VITE_KINDE_CLIENT_ID: 'synthetic-public-client',
  VITE_KINDE_AUDIENCE: 'https://osp.heymarksman.com/api',
  VITE_SUPABASE_URL: 'https://project.example.test',
  VITE_OSP_BUILD_PROFILE: 'local-e2e',
};

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function bound(subject: string, organization: string, generation: string): BoundSession {
  return {
    identity: {
      issuer: 'https://auth.heymarksman.com',
      authorizedParty: 'synthetic-public-client',
      subject,
      organization,
      email: `${subject}@example.test`,
      emailVerified: true,
    },
    generation,
  };
}

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(payload)}.fixture-signature`;
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

function tokenPair() {
  const identity = {
    iss: runtime.VITE_KINDE_DOMAIN,
    azp: runtime.VITE_KINDE_CLIENT_ID,
    sub: 'user-a',
    org_code: 'org-a',
    email: 'user-a@example.test',
  };
  return {
    accessToken: jwt({
      ...identity,
      aud: runtime.VITE_KINDE_AUDIENCE,
      osp_email_verified: true,
      osp_verified_email: identity.email,
      permissions: ['osp:read'],
    }),
    idToken: jwt({
      ...identity,
      aud: runtime.VITE_KINDE_CLIENT_ID,
      email_verified: true,
      auth_time: 1_700_000_000,
      name: 'Visible user-a',
    }),
  };
}

type MutablePort = AuthPort & { emit(session: BoundSession | null): void };

function mutablePort(initial: BoundSession | null): MutablePort {
  let current = initial;
  let listener: (() => void) | undefined;
  return {
    initialize: vi.fn(async () => current),
    revalidate: vi.fn(async () => current),
    subscribe(nextListener) {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    },
    getCurrentSession: () => current,
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    getAccessToken: vi.fn(async () => 'access-token'),
    emit(session) {
      current = session;
      listener?.();
    },
  };
}

function QueryProbe({
  load,
}: {
  load?: (subject: string) => Promise<string>;
}) {
  const auth = useAuth();
  const subject = auth.state.status === 'authenticated'
    ? auth.state.session.identity.subject
    : auth.state.status;
  const query = useQuery({
    queryKey: ['session-value'],
    queryFn: () => load ? load(subject) : Promise.resolve(subject),
  });
  return <output data-testid="query-value">{query.data ?? query.status}</output>;
}

function LogoutControl() {
  const auth = useAuth();
  return <button type="button" onClick={() => void auth.logout()}>logout</button>;
}

function ObservedLogoutControl({
  observe,
}: {
  observe(operation: Promise<void>): void;
}) {
  const auth = useAuth();
  return (
    <button type="button" onClick={() => observe(auth.logout())}>
      observed logout
    </button>
  );
}

function ScopeProbe() {
  const auth = useAuth();
  return (
    <output data-testid="auth-scope">
      {`${auth.state.status}:${auth.scopeVersion}`}
    </output>
  );
}

function SuspendPending({ pending }: { pending: Promise<void> }): never {
  throw pending;
}

function Harness({
  port,
  apiClient,
  factory,
  children,
}: {
  port: AuthPort;
  apiClient: object;
  factory: () => QueryClient;
  children?: ReactNode;
}) {
  return (
    <AuthProvider port={port}>
      <SessionScopedQueryProvider apiClient={apiClient} createQueryClient={factory}>
        {children ?? <QueryProbe />}
      </SessionScopedQueryProvider>
    </AuthProvider>
  );
}

function clientFactory(clients: QueryClient[]) {
  return () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    clients.push(client);
    return client;
  };
}

describe('SessionScopedQueryProvider', () => {
  it('changes the canonical scope key when only the verified email changes', () => {
    const apiClient = {};
    const first: AuthState = {
      status: 'authenticated',
      session: bound('user-a', 'org-a', 'generation-a'),
    };
    const second: AuthState = {
      status: 'authenticated',
      session: {
        ...first.session,
        identity: {
          ...first.session.identity,
          email: 'replacement@example.test',
        },
      },
    };

    expect(sessionQueryScopeKey(first, apiClient))
      .not.toBe(sessionQueryScopeKey(second, apiClient));
  });

  it('cannot collide when authorization fields contain scope separators', () => {
    const first: AuthState = {
      status: 'authenticated',
      session: bound('user|a', 'org', 'generation'),
    };
    const second: AuthState = {
      status: 'authenticated',
      session: bound('user', 'a|org', 'generation'),
    };
    const apiClient = {};

    expect(sessionQueryScopeKey(first, apiClient))
      .not.toBe(sessionQueryScopeKey(second, apiClient));
  });

  it('replaces and clears cache on an A-to-B subject swap', async () => {
    const clients: QueryClient[] = [];
    const port = mutablePort(bound('user-a', 'org-a', 'g-a'));
    render(<Harness port={port} apiClient={{}} factory={clientFactory(clients)} />);
    await screen.findByText('user-a');
    const oldClient = clients.at(-1)!;
    expect(oldClient.getQueryData(['session-value'])).toBe('user-a');

    act(() => port.emit(bound('user-b', 'org-a', 'g-b')));

    await screen.findByText('user-b');
    expect(clients.at(-1)).not.toBe(oldClient);
    expect(oldClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('replaces and clears cache on a same-subject organization swap', async () => {
    const clients: QueryClient[] = [];
    const port = mutablePort(bound('user-a', 'org-a', 'g-a'));
    render(<Harness port={port} apiClient={{}} factory={clientFactory(clients)} />);
    await screen.findByText('user-a');
    const oldClient = clients.at(-1)!;

    act(() => port.emit(bound('user-a', 'org-b', 'g-org')));

    await waitFor(() => expect(clients.at(-1)).not.toBe(oldClient));
    expect(oldClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('replaces cache on logout/login as the same identity through generation scope', async () => {
    const clients: QueryClient[] = [];
    const port = mutablePort(bound('user-a', 'org-a', 'before'));
    render(<Harness port={port} apiClient={{}} factory={clientFactory(clients)} />);
    await screen.findByText('user-a');
    const beforeLogout = clients.at(-1)!;

    act(() => port.emit(null));
    await waitFor(() => expect(clients.at(-1)).not.toBe(beforeLogout));
    const anonymousClient = clients.at(-1)!;
    act(() => port.emit(bound('user-a', 'org-a', 'after')));

    await waitFor(() => expect(clients.at(-1)).not.toBe(anonymousClient));
    expect(beforeLogout.getQueryCache().getAll()).toHaveLength(0);
    expect(anonymousClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('replaces cache when the API client instance changes', async () => {
    const clients: QueryClient[] = [];
    const port = mutablePort(bound('user-a', 'org-a', 'g-a'));
    const factory = clientFactory(clients);
    const firstApiClient = {};
    const view = render(
      <Harness port={port} apiClient={firstApiClient} factory={factory} />,
    );
    await screen.findByText('user-a');
    const oldClient = clients.at(-1)!;

    view.rerender(<Harness port={port} apiClient={{}} factory={factory} />);

    await waitFor(() => expect(clients.at(-1)).not.toBe(oldClient));
    expect(oldClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('isolates the old cache immediately while a replacement port initializes', async () => {
    const clients: QueryClient[] = [];
    const apiClient = {};
    const factory = clientFactory(clients);
    const oldPort = mutablePort(bound('user-a', 'org-a', 'old-generation'));
    const replacement = deferred<BoundSession | null>();
    const newPort = mutablePort(null);
    newPort.initialize = vi.fn(() => replacement.promise);
    const view = render(
      <Harness port={oldPort} apiClient={apiClient} factory={factory} />,
    );
    await screen.findByText('user-a');
    const authenticatedClient = clients.at(-1)!;
    expect(authenticatedClient.getQueryData(['session-value'])).toBe('user-a');

    view.rerender(
      <Harness port={newPort} apiClient={apiClient} factory={factory} />,
    );

    await screen.findByText('loading');
    expect(clients.at(-1)).not.toBe(authenticatedClient);
    expect(authenticatedClient.getQueryCache().getAll()).toHaveLength(0);
    oldPort.emit(bound('user-a', 'org-a', 'late-old-generation'));
    expect(screen.getByTestId('query-value')).toHaveTextContent('loading');

    replacement.resolve(bound('user-b', 'org-b', 'new-generation'));
    await screen.findByText('user-b');
  });

  it('creates a fresh loading cache scope for every rapid A-to-B-to-A port transition', async () => {
    const clients: QueryClient[] = [];
    const apiClient = {};
    const factory = clientFactory(clients);
    const initialA = bound('user-a', 'org-a', 'initial-a');
    const portA = mutablePort(initialA);
    const pendingA = deferred<BoundSession | null>();
    portA.initialize = vi.fn()
      .mockResolvedValueOnce(initialA)
      .mockImplementationOnce(() => pendingA.promise);
    const portB = mutablePort(null);
    const pendingB = deferred<BoundSession | null>();
    portB.initialize = vi.fn(() => pendingB.promise);
    const view = render(
      <Harness port={portA} apiClient={apiClient} factory={factory}>
        <ScopeProbe />
        <QueryProbe />
      </Harness>,
    );
    await screen.findByText('user-a');
    const initialAuthenticatedClient = clients.at(-1)!;

    view.rerender(
      <Harness port={portB} apiClient={apiClient} factory={factory}>
        <ScopeProbe />
        <QueryProbe />
      </Harness>,
    );
    expect(screen.getByTestId('auth-scope')).toHaveTextContent('loading:1');
    const loadingBClient = clients.at(-1)!;
    expect(loadingBClient).not.toBe(initialAuthenticatedClient);
    expect(initialAuthenticatedClient.getQueryCache().getAll()).toHaveLength(0);

    view.rerender(
      <Harness port={portA} apiClient={apiClient} factory={factory}>
        <ScopeProbe />
        <QueryProbe />
      </Harness>,
    );

    expect(screen.getByTestId('auth-scope')).toHaveTextContent('loading:2');
    const loadingAClient = clients.at(-1)!;
    expect(loadingAClient).not.toBe(loadingBClient);
    expect(loadingBClient.getQueryCache().getAll()).toHaveLength(0);
    pendingB.resolve(bound('user-b', 'org-b', 'late-b'));
    await act(async () => undefined);
    expect(screen.getByTestId('auth-scope')).toHaveTextContent('loading:2');

    pendingA.resolve(bound('user-a', 'org-a', 'reinitialized-a'));
    await screen.findByText('user-a');
    expect(clients.at(-1)).not.toBe(loadingAClient);
    expect(loadingAClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('does not let an abandoned suspended B render poison committed A authority or cache scope', async () => {
    const clients: QueryClient[] = [];
    const apiClient = {};
    const factory = clientFactory(clients);
    const portA = mutablePort(bound('user-a', 'org-a', 'generation-a'));
    const portB = mutablePort(bound('user-b', 'org-b', 'generation-b'));
    const suspendedB = deferred<void>();

    function ConcurrentHarness() {
      const [selectedPort, setSelectedPort] = useState<AuthPort>(portA);
      return (
        <>
          <button
            type="button"
            onClick={() => startTransition(() => setSelectedPort(portB))}
          >
            speculate B
          </button>
          <button type="button" onClick={() => setSelectedPort(portA)}>
            abandon B
          </button>
          <Suspense fallback={<output data-testid="suspense-fallback">suspended</output>}>
            <AuthProvider port={selectedPort}>
              <ScopeProbe />
              {selectedPort === portB ? <SuspendPending pending={suspendedB.promise} /> : null}
              <SessionScopedQueryProvider apiClient={apiClient} createQueryClient={factory}>
                <QueryProbe />
              </SessionScopedQueryProvider>
            </AuthProvider>
          </Suspense>
        </>
      );
    }

    render(<ConcurrentHarness />);
    await screen.findByText('user-a');
    const authenticatedAClient = clients.at(-1)!;
    expect(screen.getByTestId('auth-scope')).toHaveTextContent('authenticated:0');

    fireEvent.click(screen.getByRole('button', { name: 'speculate B' }));
    await act(async () => undefined);
    expect(screen.queryByTestId('suspense-fallback')).not.toBeInTheDocument();
    expect(screen.getByTestId('query-value')).toHaveTextContent('user-a');

    act(() => portA.emit(null));

    await screen.findByText('anonymous');
    expect(authenticatedAClient.getQueryCache().getAll()).toHaveLength(0);
    expect(screen.getByTestId('auth-scope')).toHaveTextContent('anonymous:0');

    fireEvent.click(screen.getByRole('button', { name: 'abandon B' }));
    suspendedB.resolve();
    await act(async () => undefined);
    expect(screen.getByTestId('query-value')).toHaveTextContent('anonymous');
    expect(screen.getByTestId('auth-scope')).toHaveTextContent('anonymous:0');
    expect(portA.initialize).toHaveBeenCalledOnce();
    expect(portB.initialize).not.toHaveBeenCalled();
  });

  it('does not admit a stale pending result into either the disposed or new client', async () => {
    const clients: QueryClient[] = [];
    const port = mutablePort(bound('user-a', 'org-a', 'g-a'));
    let resolveA!: (value: string) => void;
    const pendingA = new Promise<string>((resolve) => {
      resolveA = resolve;
    });
    const load = vi.fn((subject: string) => subject === 'user-a'
      ? pendingA
      : Promise.resolve(`fresh-${subject}`));
    render(
      <Harness
        port={port}
        apiClient={{}}
        factory={clientFactory(clients)}
      >
        <QueryProbe load={load} />
      </Harness>,
    );
    await waitFor(() => expect(load).toHaveBeenCalledWith('user-a'));
    const oldClient = clients.at(-1)!;

    act(() => port.emit(bound('user-b', 'org-b', 'g-b')));
    await screen.findByText('fresh-user-b');
    const newClient = clients.at(-1)!;
    resolveA('stale-user-a');
    await act(async () => undefined);

    expect(oldClient.getQueryData(['session-value'])).toBeUndefined();
    expect(newClient.getQueryData(['session-value'])).toBe('fresh-user-b');
  });

  it('clears the consumer cache when a real cross-tab revalidation becomes anonymous', async () => {
    const clients: QueryClient[] = [];
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
    render(<Harness port={port} apiClient={{}} factory={clientFactory(clients)} />);
    await screen.findByText('user-a');
    const authenticatedClient = clients.at(-1)!;
    expect(authenticatedClient.getQueryData(['session-value'])).toBe('user-a');
    authenticated = false;

    act(() => receiveInvalidation?.('remote-generation'));

    await screen.findByText('anonymous');
    expect(clients.at(-1)).not.toBe(authenticatedClient);
    expect(authenticatedClient.getQueryCache().getAll()).toHaveLength(0);
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('clears the consumer cache when real established-session token verification fails', async () => {
    const clients: QueryClient[] = [];
    const pair = tokenPair();
    let rejectAccessToken = false;
    const verifier: KindeTokenVerifier = {
      async verifyAccessToken(token) {
        if (rejectAccessToken) throw new Error('synthetic verification failure');
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
      createGeneration: () => 'generation',
      tokenVerifier: verifier,
    });
    render(<Harness port={port} apiClient={{}} factory={clientFactory(clients)} />);
    await screen.findByText('user-a');
    const authenticatedClient = clients.at(-1)!;
    rejectAccessToken = true;

    window.dispatchEvent(new Event('focus'));

    await screen.findByText('anonymous');
    expect(clients.at(-1)).not.toBe(authenticatedClient);
    expect(authenticatedClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('keeps provider authority and cache anonymous when focus occurs during real logout', async () => {
    const clients: QueryClient[] = [];
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
    render(
      <Harness port={port} apiClient={{}} factory={clientFactory(clients)}>
        <QueryProbe />
        <LogoutControl />
      </Harness>,
    );
    await screen.findByText('user-a');
    const authenticatedClient = clients.at(-1)!;
    fireEvent.click(screen.getByRole('button', { name: 'logout' }));
    await screen.findByText('anonymous');
    expect(authenticatedClient.getQueryCache().getAll()).toHaveLength(0);

    window.dispatchEvent(new Event('focus'));
    await act(async () => undefined);

    expect(screen.getByTestId('query-value')).toHaveTextContent('anonymous');
    expect(client.isAuthenticated).toHaveBeenCalledOnce();
    expect(channel.publish).not.toHaveBeenCalled();
    sdkLogout.resolve();
    await waitFor(() => expect(channel.publish).toHaveBeenCalledOnce());
    expect(channel.publish).toHaveBeenCalledWith('logout-generation');
    expect(screen.getByTestId('query-value')).toHaveTextContent('anonymous');
  });

  it('keeps a rejected SDK logout fail-closed through revalidation until an explicit retry succeeds', async () => {
    const clients: QueryClient[] = [];
    const pair = tokenPair();
    const failedSdkLogout = deferred<void>();
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
      getAccessToken: vi.fn(async () => pair.accessToken),
      getIdToken: vi.fn(async () => pair.idToken),
      getToken: vi.fn(async () => pair.accessToken),
      login: vi.fn(async () => undefined),
      logout: vi.fn()
        .mockImplementationOnce(() => failedSdkLogout.promise)
        .mockResolvedValueOnce(undefined),
    };
    const generations = ['authenticated-generation', 'retry-invalidation'];
    const port = createKindeAuthPort(runtime, {
      origin: 'http://localhost:8791',
      createClient: async () => client,
      createGeneration: () => generations.shift() ?? 'unexpected',
      sessionChannel: channel,
      tokenVerifier: fixtureVerifier,
    });
    const logoutOperations: Promise<void>[] = [];
    render(
      <Harness port={port} apiClient={{}} factory={clientFactory(clients)}>
        <QueryProbe />
        <ObservedLogoutControl observe={(operation) => logoutOperations.push(operation)} />
      </Harness>,
    );
    await screen.findByText('user-a');
    const establishedSession = port.getCurrentSession();
    if (!establishedSession) throw new Error('fixture failed to authenticate');
    const authenticatedClient = clients.at(-1)!;

    fireEvent.click(screen.getByRole('button', { name: 'observed logout' }));
    await screen.findByText('anonymous');
    expect(logoutOperations).toHaveLength(1);
    const firstLogoutOutcome = expect(logoutOperations[0]).rejects.toThrow(
      'synthetic SDK logout rejection',
    );
    failedSdkLogout.reject(new Error('synthetic SDK logout rejection'));
    await firstLogoutOutcome;

    expect(port.getCurrentSession()).toBeNull();
    expect(authenticatedClient.getQueryCache().getAll()).toHaveLength(0);
    expect(channel.publish).not.toHaveBeenCalled();

    const initializeAttempt = port.initialize();
    const refreshAttempt = port.revalidate('refresh');
    window.dispatchEvent(new Event('focus'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    act(() => receiveInvalidation?.('remote-generation'));

    await expect(initializeAttempt).resolves.toBeNull();
    await expect(refreshAttempt).resolves.toBeNull();
    await expect(port.login('/app')).rejects.toThrow('logout');
    await expect(port.getAccessToken(establishedSession)).rejects.toThrow('not current');
    await act(async () => undefined);
    expect(screen.getByTestId('query-value')).toHaveTextContent('anonymous');
    expect(client.isAuthenticated).toHaveBeenCalledOnce();
    expect(client.getAccessToken).toHaveBeenCalledOnce();
    expect(client.getIdToken).toHaveBeenCalledOnce();
    expect(client.getToken).not.toHaveBeenCalled();
    expect(client.login).not.toHaveBeenCalled();
    expect(channel.publish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'observed logout' }));
    await waitFor(() => expect(logoutOperations).toHaveLength(2));
    await expect(logoutOperations[1]).resolves.toBeUndefined();

    expect(client.logout).toHaveBeenCalledTimes(2);
    expect(channel.publish).toHaveBeenCalledOnce();
    expect(channel.publish).toHaveBeenCalledWith('retry-invalidation');
    expect(port.getCurrentSession()).toBeNull();
    expect(screen.getByTestId('query-value')).toHaveTextContent('anonymous');
  });
});
