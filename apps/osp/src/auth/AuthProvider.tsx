import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { type AuthPort, type OspUser } from './auth-port';

export type AuthState =
  | { status: 'checking'; user: null; error: null }
  | { status: 'anonymous'; user: null; error: null }
  | { status: 'authenticated'; user: OspUser; error: null }
  | { status: 'error'; user: null; error: string };

type AuthContextValue = {
  state: AuthState;
  login(returnTo?: string): Promise<void>;
  logout(): Promise<void>;
};

const safeSessionError = 'Unable to verify your session. Please try again.';

export const AuthContext = createContext<AuthContextValue | null>(null);

export function safeReturnTo(value: string | undefined, origin = window.location.origin): string {
  if (!value) {
    return '/app';
  }

  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin || !parsed.pathname.startsWith('/app')) {
      return '/app';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/app';
  }
}

export function AuthProvider({ port, children }: { port: AuthPort; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'checking', user: null, error: null });

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        await port.initialize();
        const authenticated = await port.isAuthenticated();
        if (!active) {
          return;
        }
        if (!authenticated) {
          setState({ status: 'anonymous', user: null, error: null });
          return;
        }

        const user = await port.getUser();
        if (!active) {
          return;
        }
        if (!user) {
          throw new Error('Authenticated session did not provide a user.');
        }
        setState({ status: 'authenticated', user, error: null });
      } catch {
        if (active) {
          setState({ status: 'error', user: null, error: safeSessionError });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [port]);

  async function login(returnTo?: string) {
    await port.login(safeReturnTo(returnTo));
  }

  async function logout() {
    await port.logout();
    setState({ status: 'anonymous', user: null, error: null });
  }

  return <AuthContext.Provider value={{ state, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return value;
}
