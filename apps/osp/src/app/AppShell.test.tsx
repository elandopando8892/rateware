import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { type OspClient } from '../api/osp-client';
import { type AuthPort, type OspUser } from '../auth/auth-port';
import { AuthProvider } from '../auth/AuthProvider';
import { createOspRouter } from './router';

const verifiedUser: OspUser = {
  subject: 'kp_test_operator',
  email: 'operator@xbfreight.com',
  displayName: 'OSP Operator',
};

function fakeAuthPort(authenticated: boolean): AuthPort {
  return {
    initialize: async () => undefined,
    isAuthenticated: async () => authenticated,
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    getAccessToken: async () => 'test-token-not-rendered',
    getUser: async () => authenticated ? verifiedUser : null,
  };
}

function fakeOspClient(): OspClient {
  return {
    listOnboardingWorkspace: vi.fn(),
    getGmailStatus: vi.fn(),
  } as unknown as OspClient;
}

function Providers({ auth, children }: { auth: AuthPort; children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider port={auth}>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

function renderRoute(path: string, authenticated = true) {
  const auth = fakeAuthPort(authenticated);
  const ospClient = fakeOspClient();
  const router = createOspRouter(
    { auth, ospClient },
    createMemoryHistory({ initialEntries: [path] }),
  );
  const result = render(
    <Providers auth={auth}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...result, auth, router };
}

test('redirects the application index to the read-only pipeline shell', async () => {
  // Catches leaving /app blank or outside the authenticated route tree.
  const { router } = renderRoute('/app');

  expect(await screen.findByRole('heading', { name: 'Pipeline' })).toBeVisible();
  await waitFor(() => expect(router.state.location.pathname).toBe('/app/pipeline'));
  expect(screen.getByRole('status', { name: /fase actual/i })).toHaveTextContent('Fase 1: consulta solamente');
});

test('shows authenticated navigation, verified identity, and accessible route state', async () => {
  // Catches removing workflow context, verified session identity, or keyboard/current-page affordances.
  renderRoute('/app/intake');

  expect(await screen.findByRole('status', { name: /sesión actual/i })).toHaveTextContent('operator@xbfreight.com');
  const navigation = screen.getByRole('navigation', { name: 'Flujo OSP' });
  for (const label of [
    'Pipeline',
    'Capturas',
    'Entity Vault',
    'Firma JAGP',
    'Autorización',
    'Respuestas',
    'Auditoría',
  ]) {
    expect(screen.getByRole('link', { name: label })).toBeVisible();
  }
  expect(navigation).toContainElement(screen.getByRole('link', { name: 'Capturas' }));
  expect(screen.getByRole('link', { name: 'Capturas' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#osp-main');
});

test.each([
  ['/app/cases/case-123', 'Expediente'],
  ['/app/intake', 'Capturas'],
  ['/app/vault', 'Entity Vault'],
  ['/app/approvals', 'Aprobaciones'],
  ['/app/approvals/signature', 'Firma JAGP'],
  ['/app/approvals/authorization', 'Autorización'],
  ['/app/delivery', 'Respuestas'],
  ['/app/audit', 'Auditoría'],
])('keeps future route %s as an honest read-only placeholder', async (path, title) => {
  // Catches accidentally wiring a future sensitive workflow or disguising an unfinished route.
  const { container } = renderRoute(path);

  expect(await screen.findByRole('heading', { name: title })).toBeVisible();
  expect(screen.getByText('Disponible en una fase posterior')).toBeVisible();
  expect(container.querySelector('iframe')).toBeNull();
  expect(screen.queryByRole('button', { name: /aprobar|firmar|autorizar|enviar/i })).toBeNull();
});

test('keeps application data hidden until authentication is verified', async () => {
  // Catches rendering the shell or route content to an anonymous browser session.
  const user = userEvent.setup();
  const { auth } = renderRoute('/app/pipeline', false);

  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
  expect(screen.queryByRole('navigation', { name: 'Flujo OSP' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Pipeline' })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(auth.login).toHaveBeenCalledWith('/app/pipeline');
});
