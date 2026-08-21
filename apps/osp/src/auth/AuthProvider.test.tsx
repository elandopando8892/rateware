import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { type AuthPort, type OspUser } from './auth-port';
import { AuthProvider, safeReturnTo, useAuth } from './AuthProvider';
import { createKindeAuthPort } from './kinde-auth-port';

const { createKindeClientMock } = vi.hoisted(() => ({
  createKindeClientMock: vi.fn(),
}));

vi.mock('@kinde-oss/kinde-auth-pkce-js', () => ({
  default: createKindeClientMock,
}));

type FakeAuthPort = AuthPort & {
  finishInitialization(): void;
};

function fakeAuthPort({
  authenticated,
  user = null,
  initializeError,
}: {
  authenticated: boolean;
  user?: OspUser | null;
  initializeError?: Error;
}): FakeAuthPort {
  let finishInitialization!: () => void;
  const initialization = new Promise<void>((resolve, reject) => {
    finishInitialization = () => {
      if (initializeError) {
        reject(initializeError);
        return;
      }
      resolve();
    };
  });

  return {
    initialize: vi.fn(() => initialization),
    isAuthenticated: vi.fn(async () => authenticated),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    getAccessToken: vi.fn(async () => 'access-token-not-rendered'),
    getUser: vi.fn(async () => user),
    finishInitialization,
  };
}

function AuthProbe({ returnTo = '/app/pipeline' }: { returnTo?: string }): ReactNode {
  const { state, login, logout } = useAuth();

  if (state.status === 'checking') {
    return <p>Checking access…</p>;
  }

  if (state.status === 'anonymous') {
    return <button onClick={() => void login(returnTo)}>Sign in</button>;
  }

  if (state.status === 'authenticated') {
    return (
      <>
        <p>{state.user.email}</p>
        <button onClick={() => void logout()}>Sign out</button>
      </>
    );
  }

  return <p role="alert">{state.error}</p>;
}

function renderWithPort(port: FakeAuthPort, child: ReactNode) {
  return render(<AuthProvider port={port}>{child}</AuthProvider>);
}

describe('AuthProvider', () => {
  test('keeps the UI in checking state until session initialization completes', async () => {
    // Catches removing the initialization barrier and rendering anonymous UI too early.
    const port = fakeAuthPort({ authenticated: false });
    renderWithPort(port, <AuthProbe />);

    expect(screen.getByText('Checking access…')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();

    port.finishInitialization();

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('normalizes a sign-in return path before delegating login', async () => {
    // Catches forwarding an untrusted external redirect to the auth SDK.
    const user = userEvent.setup();
    const port = fakeAuthPort({ authenticated: false });
    renderWithPort(port, <AuthProbe />);
    port.finishInitialization();

    await user.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(port.login).toHaveBeenCalledWith('/app/pipeline');
  });

  test('rejects external and non-app return paths while preserving a same-origin app path', () => {
    // Catches open redirects and routes outside the protected application shell.
    expect(safeReturnTo('https://attacker.example/app/pipeline', 'https://osp.heymarksman.com')).toBe('/app');
    expect(safeReturnTo('/settings', 'https://osp.heymarksman.com')).toBe('/app');
    expect(safeReturnTo('/app/pipeline?tab=all#active', 'https://osp.heymarksman.com')).toBe('/app/pipeline?tab=all#active');
  });

  test('renders the verified user email for an authenticated session', async () => {
    // Catches failing to fetch presentation identity after authentication succeeds.
    const port = fakeAuthPort({
      authenticated: true,
      user: {
        subject: 'kp_test_jagp',
        email: 'jgonzalez@xbfreight.com',
        displayName: 'José Andrés González Perales',
      },
    });
    renderWithPort(port, <AuthProbe />);
    port.finishInitialization();

    expect(await screen.findByText('jgonzalez@xbfreight.com')).toBeVisible();
    expect(port.getUser).toHaveBeenCalledOnce();
  });

  test('clears presentation identity after a successful sign out', async () => {
    // Catches retaining an authenticated browser state after the auth port signs out.
    const user = userEvent.setup();
    const port = fakeAuthPort({
      authenticated: true,
      user: {
        subject: 'kp_test_jagp',
        email: 'jgonzalez@xbfreight.com',
        displayName: 'José Andrés González Perales',
      },
    });
    renderWithPort(port, <AuthProbe />);
    port.finishInitialization();

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(port.logout).toHaveBeenCalledOnce();
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('renders a safe error when session initialization fails', async () => {
    // Catches leaking provider or token details from an SDK initialization failure.
    const port = fakeAuthPort({
      authenticated: false,
      initializeError: new Error('Kinde access token kp_secret_123 could not be restored'),
    });
    renderWithPort(port, <AuthProbe />);
    port.finishInitialization();

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to verify your session. Please try again.');
    expect(screen.queryByText(/kp_secret_123/i)).toBeNull();
  });
});

describe('createKindeAuthPort', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('adapts the supported Kinde PKCE client methods without exposing token storage', async () => {
    // Catches bypassing the configured callback, dropping return state, or mapping the wrong SDK methods.
    const client = {
      getAccessToken: vi.fn(async () => 'access-token'),
      getToken: vi.fn(async () => 'refreshed-access-token'),
      isAuthenticated: vi.fn(async () => true),
      getUser: vi.fn(() => ({ id: 'kp_cached', email: 'cached@example.com' })),
      getUserProfile: vi.fn(async () => ({
        id: 'kp_test_jagp',
        email: 'jgonzalez@xbfreight.com',
        given_name: 'José Andrés',
        family_name: 'González Perales',
        picture: undefined,
      })),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
      getClaim: vi.fn(() => ({ name: 'email_verified', value: true })),
    };
    createKindeClientMock.mockResolvedValue(client);
    const port = createKindeAuthPort({
      VITE_KINDE_DOMAIN: 'https://auth.heymarksman.com',
      VITE_KINDE_CLIENT_ID: 'osp-client-id',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
    });

    await port.initialize();
    await port.login('/app/pipeline');

    expect(createKindeClientMock).toHaveBeenCalledWith({
      domain: 'https://auth.heymarksman.com',
      client_id: 'osp-client-id',
      redirect_uri: 'http://localhost:3000/app',
      logout_uri: 'http://localhost:3000/app',
      is_dangerously_use_local_storage: false,
    });
    expect(await port.isAuthenticated()).toBe(true);
    expect(await port.getAccessToken(true)).toBe('refreshed-access-token');
    expect(await port.getUser()).toEqual({
      subject: 'kp_test_jagp',
      email: 'jgonzalez@xbfreight.com',
      displayName: 'José Andrés González Perales',
    });
    expect(client.login).toHaveBeenCalledWith({ app_state: { returnTo: '/app/pipeline' } });
    await port.logout();
    expect(client.logout).toHaveBeenCalledOnce();
  });

  test('rejects an authenticated profile that lacks a verified email claim', async () => {
    // Catches treating a browser email value as verified identity.
    createKindeClientMock.mockResolvedValue({
      getAccessToken: vi.fn(async () => 'access-token'),
      getToken: vi.fn(async () => 'access-token'),
      isAuthenticated: vi.fn(async () => true),
      getUser: vi.fn(() => ({ id: 'kp_test_jagp', email: 'jgonzalez@xbfreight.com' })),
      getUserProfile: vi.fn(async () => ({
        id: 'kp_test_jagp',
        email: 'jgonzalez@xbfreight.com',
        given_name: 'José Andrés',
        family_name: 'González Perales',
        picture: undefined,
      })),
      login: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
      getClaim: vi.fn(() => ({ name: 'email_verified', value: false })),
    });
    const port = createKindeAuthPort({
      VITE_KINDE_DOMAIN: 'https://auth.heymarksman.com',
      VITE_KINDE_CLIENT_ID: 'osp-client-id',
      VITE_SUPABASE_URL: 'https://example.supabase.co',
    });
    await port.initialize();

    await expect(port.getUser()).rejects.toThrow('Kinde user profile is missing a verified email.');
  });
});
