import { useQuery } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { type OspClient } from '../api/osp-client';
import { type AuthPort, type OspUser } from '../auth/auth-port';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { App, SessionScopedQueryProvider } from './App';

function authenticatedPort(user: OspUser): AuthPort {
  return {
    initialize: async () => undefined,
    isAuthenticated: async () => true,
    login: async () => undefined,
    logout: async () => undefined,
    getAccessToken: async () => 'test-token-not-rendered',
    getUser: async () => user,
  };
}

function anonymousPort(): AuthPort {
  return {
    initialize: async () => undefined,
    isAuthenticated: async () => false,
    login: async () => undefined,
    logout: async () => undefined,
    getAccessToken: async () => 'test-token-not-rendered',
    getUser: async () => null,
  };
}

function fakeOspClient(): OspClient {
  return {
    listOnboardingWorkspace: vi.fn(),
    getGmailStatus: vi.fn(),
  } as unknown as OspClient;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function IdentityQuery({ load }: { load: () => Promise<string> }) {
  const query = useQuery({
    queryKey: ['osp', 'session-cache-regression'],
    queryFn: load,
    staleTime: Infinity,
  });
  if (query.isPending) return <p>Loading identity data…</p>;
  return <p>{query.data}</p>;
}

function ProtectedIdentityQuery({ load }: { load: () => Promise<string> }) {
  const { state } = useAuth();
  if (state.status !== 'authenticated') return <p>Session {state.status}</p>;
  return <IdentityQuery load={load} />;
}

function QueryScopeHarness({
  auth,
  ospClient,
  children,
}: {
  auth: AuthPort;
  ospClient: OspClient;
  children: ReactNode;
}) {
  return (
    <AuthProvider port={auth}>
      <SessionScopedQueryProvider ospClient={ospClient}>
        {children}
      </SessionScopedQueryProvider>
    </AuthProvider>
  );
}

test('identifies OSP as XBF customer setup and contains no iframe', async () => {
  const auth = authenticatedPort({
    subject: 'kp_test',
    email: 'operator@example.test',
    displayName: 'OSP Operator',
  });
  const ospClient = fakeOspClient();
  const { container } = render(
    <App
      auth={auth}
      ospClient={ospClient}
      history={createMemoryHistory({ initialEntries: ['/app/pipeline'] })}
    />,
  );
  expect(await screen.findByRole('heading', { name: /customer setup/i })).toBeVisible();
  expect(screen.getByText(/xBF as the provider's customer/i)).toBeVisible();
  expect(container.querySelector('iframe')).toBeNull();
});

test('makes cached query data unreachable before a replacement identity can load', async () => {
  // Catches reusing a stable-key query cache across authenticated subjects.
  const ospClient = fakeOspClient();
  const authA = authenticatedPort({
    subject: 'kp_a',
    email: 'a@example.test',
    displayName: 'Operator A',
  });
  const authB = authenticatedPort({
    subject: 'kp_b',
    email: 'b@example.test',
    displayName: 'Operator B',
  });
  const loadA = vi.fn(async () => 'customer A private data');
  const dataB = deferred<string>();
  const loadB = vi.fn(() => dataB.promise);
  const { rerender } = render(
    <QueryScopeHarness auth={authA} ospClient={ospClient}>
      <ProtectedIdentityQuery load={loadA} />
    </QueryScopeHarness>,
  );
  expect(await screen.findByText('customer A private data')).toBeVisible();

  rerender(
    <QueryScopeHarness auth={authB} ospClient={ospClient}>
      <ProtectedIdentityQuery load={loadB} />
    </QueryScopeHarness>,
  );

  expect(screen.queryByText('customer A private data')).toBeNull();
  expect(await screen.findByText('Loading identity data…')).toBeVisible();
  expect(loadB).toHaveBeenCalledOnce();

  await act(async () => dataB.resolve('customer B private data'));
  expect(await screen.findByText('customer B private data')).toBeVisible();
  expect(screen.queryByText('customer A private data')).toBeNull();
});

test('makes cached query data unreachable when the injected OSP client changes', async () => {
  // Catches retaining one backend client's cache when runtime dependency injection changes.
  const auth = authenticatedPort({
    subject: 'kp_stable',
    email: 'stable@example.test',
    displayName: 'Stable Operator',
  });
  const clientA = fakeOspClient();
  const clientB = fakeOspClient();
  const loadA = vi.fn(async () => 'client A data');
  const dataB = deferred<string>();
  const loadB = vi.fn(() => dataB.promise);
  const { rerender } = render(
    <QueryScopeHarness auth={auth} ospClient={clientA}>
      <ProtectedIdentityQuery load={loadA} />
    </QueryScopeHarness>,
  );
  expect(await screen.findByText('client A data')).toBeVisible();

  rerender(
    <QueryScopeHarness auth={auth} ospClient={clientB}>
      <ProtectedIdentityQuery load={loadB} />
    </QueryScopeHarness>,
  );

  expect(screen.queryByText('client A data')).toBeNull();
  expect(await screen.findByText('Loading identity data…')).toBeVisible();
  expect(loadB).toHaveBeenCalledOnce();

  await act(async () => dataB.resolve('client B data'));
  expect(await screen.findByText('client B data')).toBeVisible();
});

test('does not restore a prior cache after an anonymous-to-authenticated transition', async () => {
  // Catches logout/login with the same subject reviving data from the prior browser session.
  const ospClient = fakeOspClient();
  const user = {
    subject: 'kp_returning',
    email: 'returning@example.test',
    displayName: 'Returning Operator',
  };
  const loadFirstSession = vi.fn(async () => 'first session data');
  const secondSessionData = deferred<string>();
  const loadSecondSession = vi.fn(() => secondSessionData.promise);
  const { rerender } = render(
    <QueryScopeHarness auth={authenticatedPort(user)} ospClient={ospClient}>
      <ProtectedIdentityQuery load={loadFirstSession} />
    </QueryScopeHarness>,
  );
  expect(await screen.findByText('first session data')).toBeVisible();

  rerender(
    <QueryScopeHarness auth={anonymousPort()} ospClient={ospClient}>
      <ProtectedIdentityQuery load={loadSecondSession} />
    </QueryScopeHarness>,
  );
  expect(await screen.findByText('Session anonymous')).toBeVisible();
  expect(screen.queryByText('first session data')).toBeNull();

  rerender(
    <QueryScopeHarness auth={authenticatedPort(user)} ospClient={ospClient}>
      <ProtectedIdentityQuery load={loadSecondSession} />
    </QueryScopeHarness>,
  );
  expect(await screen.findByText('Loading identity data…')).toBeVisible();
  expect(screen.queryByText('first session data')).toBeNull();
  expect(loadSecondSession).toHaveBeenCalledOnce();

  await act(async () => secondSessionData.resolve('second session data'));
  expect(await screen.findByText('second session data')).toBeVisible();
});
