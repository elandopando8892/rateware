import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { AuthPort, BoundSession } from './auth-port';

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; session: BoundSession }
  | { status: 'error'; error: Error };

type AuthContextValue = {
  state: AuthState;
  scopeVersion: number;
  logoutFailed: boolean;
  login(returnTo: string): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  getAccessToken(forceRefresh?: boolean): Promise<string>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type PortOwnership = {
  port: AuthPort;
  version: number;
};

function stateForSession(session: BoundSession | null): AuthState {
  return session ? { status: 'authenticated', session } : { status: 'anonymous' };
}

export function AuthProvider({ port, children }: { port: AuthPort; children: ReactNode }) {
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [snapshot, setSnapshot] = useState<{ ownership: PortOwnership; state: AuthState }>({
    ownership: { port, version: 0 },
    state: { status: 'loading' },
  });
  const ownership = snapshot.ownership;
  const isPortTransition = ownership.port !== port;
  const state: AuthState = isPortTransition ? { status: 'loading' } : snapshot.state;
  const scopeVersion = isPortTransition ? ownership.version + 1 : ownership.version;
  const ownershipRef = useRef(ownership);
  const stateRef = useRef(state);
  const validationSequence = useRef(0);

  useLayoutEffect(() => {
    if (snapshot.ownership.port !== port) {
      const nextOwnership: PortOwnership = {
        port,
        version: snapshot.ownership.version + 1,
      };
      ownershipRef.current = nextOwnership;
      stateRef.current = { status: 'loading' };
      setLogoutFailed(false);
      setSnapshot({ ownership: nextOwnership, state: { status: 'loading' } });
      return;
    }
    ownershipRef.current = snapshot.ownership;
    stateRef.current = snapshot.state;
  }, [port, snapshot]);

  const runValidation = useCallback(async (
    targetOwnership: PortOwnership,
    validation: () => Promise<BoundSession | null>,
  ) => {
    const sequence = ++validationSequence.current;
    try {
      const session = await validation();
      if (
        targetOwnership === ownershipRef.current
        && sequence === validationSequence.current
      ) {
        setSnapshot({ ownership: targetOwnership, state: stateForSession(session) });
      }
    } catch (error) {
      console.warn(
        '[OSP auth] Access validation failed:',
        error instanceof Error ? error.message : 'Unknown authentication failure',
      );
      if (
        targetOwnership === ownershipRef.current
        && sequence === validationSequence.current
      ) {
        setSnapshot({
          ownership: targetOwnership,
          state: {
            status: 'error',
            error: error instanceof Error ? error : new Error(String(error)),
          },
        });
      }
    }
  }, []);

  useEffect(() => {
    if (ownership.port !== port) return undefined;
    let active = true;
    void runValidation(ownership, async () => {
      if ('activate' in port && typeof port.activate === 'function') {
        const activation = port.activate();
        if (activation) await activation;
      }
      const session = await port.initialize();
      return active ? session : null;
    });

    const unsubscribe = port.subscribe(() => {
      validationSequence.current += 1;
      if (active && ownership === ownershipRef.current) {
        setSnapshot({ ownership, state: stateForSession(port.getCurrentSession()) });
      }
    });
    const onFocus = () => void runValidation(ownership, () => port.revalidate('focus'));
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void runValidation(ownership, () => port.revalidate('visible'));
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      validationSequence.current += 1;
      unsubscribe();
      if ('deactivate' in port && typeof port.deactivate === 'function') {
        port.deactivate();
      }
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ownership, port, runValidation]);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    scopeVersion,
    logoutFailed,
    login: (returnTo) => port.login(returnTo),
    async logout() {
      setLogoutFailed(false);
      const sequence = ++validationSequence.current;
      const targetPort = port;
      const targetOwnership = ownership;
      try {
        await targetPort.logout();
      } catch (error) {
        if (targetOwnership === ownershipRef.current) setLogoutFailed(true);
        throw error;
      }
      if (
        targetOwnership === ownershipRef.current
        && sequence === validationSequence.current
      ) {
        setSnapshot({ ownership: targetOwnership, state: { status: 'anonymous' } });
      }
    },
    refresh: () => runValidation(ownership, () => port.revalidate('refresh')),
    async getAccessToken(forceRefresh) {
      const current = stateRef.current;
      if (current.status !== 'authenticated') throw new Error('No authenticated session');
      return port.getAccessToken(current.session, forceRefresh);
    },
  }), [logoutFailed, ownership, port, runValidation, scopeVersion, state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
