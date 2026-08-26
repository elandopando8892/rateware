import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  type ReactNode,
  useEffect,
  useMemo,
} from 'react';

import { type AuthState, useAuth } from './AuthProvider';

const clientInstanceIds = new WeakMap<object, string>();
let nextClientInstanceId = 1;

function apiClientInstanceId(apiClient: object): string {
  let identifier = clientInstanceIds.get(apiClient);
  if (!identifier) {
    identifier = `api-client-${nextClientInstanceId++}`;
    clientInstanceIds.set(apiClient, identifier);
  }
  return identifier;
}

export function sessionQueryScopeKey(
  state: AuthState,
  apiClient: object,
  scopeVersion = 0,
): string {
  const client = apiClientInstanceId(apiClient);
  if (state.status !== 'authenticated') {
    return JSON.stringify([state.status, scopeVersion, client]);
  }

  const { identity, generation } = state.session;
  return JSON.stringify([
    state.status,
    scopeVersion,
    identity.issuer,
    identity.authorizedParty,
    identity.subject,
    identity.organization,
    identity.email,
    generation,
    client,
  ]);
}

function createDefaultQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function SessionScopedQueryProvider({
  apiClient,
  createQueryClient = createDefaultQueryClient,
  children,
}: {
  apiClient: object;
  createQueryClient?: () => QueryClient;
  children: ReactNode;
}) {
  const { state, scopeVersion } = useAuth();
  const scopeKey = sessionQueryScopeKey(state, apiClient, scopeVersion);
  const queryClient = useMemo(
    () => createQueryClient(),
    [createQueryClient, scopeKey],
  );

  useEffect(() => () => {
    void queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient} key={scopeKey}>
      {children}
    </QueryClientProvider>
  );
}
