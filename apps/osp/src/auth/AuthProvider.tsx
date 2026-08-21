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
const safeActionError = 'Unable to complete that authentication action. Please try again.';
const checkingState: AuthState = { status: 'checking', user: null, error: null };

export const AuthContext = createContext<AuthContextValue | null>(null);

export function safeReturnTo(value: string | undefined, origin = window.location.origin): string {
  if (!value) {
    return '/app';
  }

  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin || (parsed.pathname !== '/app' && !parsed.pathname.startsWith('/app/'))) {
      return '/app';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/app';
  }
}

export function AuthProvider({ port, children }: { port: AuthPort; children: ReactNode }) {
  const [session, setSession] = useState<{ port: AuthPort; state: AuthState }>({ port, state: checkingState });
  const state = session.port === port ? session.state : checkingState;

  useEffect(() => {
    let active = true;
    const setStateForPort = (nextState: AuthState) => {
      setSession({ port, state: nextState });
    };

    void (async () => {
      try {
        await port.initialize();
        const authenticated = await port.isAuthenticated();
        if (!active) {
          return;
        }
        if (!authenticated) {
          setStateForPort({ status: 'anonymous', user: null, error: null });
          return;
        }

        const user = await port.getUser();
        if (!active) {
          return;
        }
        if (!user) {
          throw new Error('Authenticated session did not provide a user.');
        }
        setStateForPort({ status: 'authenticated', user, error: null });
      } catch {
        if (active) {
          setStateForPort({ status: 'error', user: null, error: safeSessionError });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [port]);

  async function login(returnTo?: string) {
    try {
      await port.login(safeReturnTo(returnTo));
    } catch {
      setSession({ port, state: { status: 'error', user: null, error: safeActionError } });
    }
  }

  async function logout() {
    try {
      await port.logout();
      setSession({ port, state: { status: 'anonymous', user: null, error: null } });
    } catch {
      setSession({ port, state: { status: 'error', user: null, error: safeActionError } });
    }
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
