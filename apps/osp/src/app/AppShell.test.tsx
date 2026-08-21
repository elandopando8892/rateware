import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor } from '@testing-library/react';
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

function deferredInitialization() {
  let resolve!: () => void;
  const promise = new Promise<void>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function Providers({ auth, children }: { auth: AuthPort; children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider port={auth}>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

function renderRouteWithAuth(path: string, auth: AuthPort) {
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

function renderRoute(path: string, authenticated = true) {
  return renderRouteWithAuth(path, fakeAuthPort(authenticated));
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

test('keeps route content hidden while authentication is still checking', async () => {
  // Catches rendering a protected route during the asynchronous session barrier.
  const initialization = deferredInitialization();
  const auth = {
    ...fakeAuthPort(true),
    initialize: vi.fn(() => initialization.promise),
  };
  renderRouteWithAuth('/app/pipeline', auth);

  expect(await screen.findByRole('status')).toHaveTextContent('Checking access…');
  expect(screen.queryByRole('navigation', { name: 'Flujo OSP' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Pipeline' })).toBeNull();

  await act(async () => initialization.resolve());
  expect(await screen.findByRole('heading', { name: 'Pipeline' })).toBeVisible();
});

test('keeps route content hidden when authentication initialization fails', async () => {
  // Catches an auth error falling through to the protected shell or exposing provider details.
  const auth = {
    ...fakeAuthPort(true),
    initialize: vi.fn(async () => {
      throw new Error('provider token should never render');
    }),
  };
  renderRouteWithAuth('/app/pipeline', auth);

  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to verify your session. Please try again.');
  expect(screen.queryByText(/provider token should never render/i)).toBeNull();
  expect(screen.queryByRole('navigation', { name: 'Flujo OSP' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Pipeline' })).toBeNull();
});

test('renders an unknown app URL as a controlled unavailable route', async () => {
  // Catches unknown URLs falling through to an unrelated route or an unbounded framework error.
  const { container } = renderRoute('/app/not-a-real-route');

  expect(await screen.findByRole('heading', { name: 'Ruta no disponible' })).toBeVisible();
  expect(screen.getByText('La ruta solicitada no forma parte de esta fase.')).toBeVisible();
  expect(container.querySelector('iframe')).toBeNull();
});
