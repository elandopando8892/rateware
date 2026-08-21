import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { AuthProvider } from '../auth/AuthProvider';
import { createOspRouter, type RouterContext } from './router';

type AppProps = RouterContext & {
  history?: RouterHistory;
};

export function App({ auth, ospClient, history }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());
  const router = useMemo(
    () => createOspRouter({ auth, ospClient }, history),
    [auth, history, ospClient],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider port={auth}>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
