import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { type ReactNode, useEffect, useMemo } from 'react';
import { type OspClient } from '../api/osp-client';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { createOspRouter, type RouterContext } from './router';

type AppProps = RouterContext & {
  history?: RouterHistory;
};

let nextQueryScopeId = 0;

export function SessionScopedQueryProvider({
  ospClient,
  children,
}: {
  ospClient: OspClient;
  children: ReactNode;
}) {
  const { state } = useAuth();
  const sessionScope = state.status === 'authenticated'
    ? `authenticated:${state.user.subject}`
    : state.status;
  const queryScope = useMemo(
    () => ({
      id: ++nextQueryScopeId,
      client: new QueryClient(),
      owner: { ospClient, sessionScope },
    }),
    [ospClient, sessionScope],
  );

  useEffect(() => () => queryScope.client.clear(), [queryScope]);

  return (
    <QueryClientProvider key={queryScope.id} client={queryScope.client}>
      {children}
    </QueryClientProvider>
  );
}

export function App({ auth, ospClient, history }: AppProps) {
  const router = useMemo(
    () => createOspRouter({ auth, ospClient }, history),
    [auth, history, ospClient],
  );

  return (
    <AuthProvider port={auth}>
      <SessionScopedQueryProvider ospClient={ospClient}>
        <RouterProvider router={router} />
      </SessionScopedQueryProvider>
    </AuthProvider>
  );
}
