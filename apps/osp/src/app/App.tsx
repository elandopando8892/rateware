import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { OspClient } from '../api/osp-client';
import type { AuthPort } from '../auth/auth-port';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { SessionScopedQueryProvider, sessionQueryScopeKey } from '../auth/SessionScopedQueryProvider';
import { createAppRouter } from './router';
import type { OspBuildProfile } from '../config/runtime';

function AuthenticatedApp({ apiClient, routerHistory }: { apiClient: OspClient; routerHistory?: RouterHistory }) {
  const auth = useAuth();
  const [loginFailed, setLoginFailed] = useState(false);
  if (auth.state.status === 'loading') {
    return <main className="auth-page"><p role="status" aria-label="Checking access">Checking access…</p></main>;
  }
  if (auth.state.status === 'error') {
    return (
      <main className="auth-page">
        <p role="alert">We could not verify access. Please try again.</p>
        <button type="button" onClick={() => void auth.refresh()}>Retry access</button>
        <button type="button" onClick={() => void auth.login('/app/pipeline').catch(() => undefined)}>
          Authorize workspace
        </button>
        <button type="button" onClick={() => void auth.logout().catch(() => undefined)}>
          {auth.logoutFailed ? 'Retry new session' : 'Start new session'}
        </button>
      </main>
    );
  }
  if (auth.state.status === 'anonymous') {
    const login = async () => {
      setLoginFailed(false);
      try { await auth.login('/app/pipeline'); } catch { setLoginFailed(true); }
    };
    return (
      <main className="auth-page">
        <p className="eyebrow">OSP customer setup</p>
        <h1>Provider onboarding workspace</h1>
        <p>Sign in to view your organization’s read-only request status.</p>
        {auth.logoutFailed ? <p role="alert">We could not sign out. Please retry.</p> : null}
        {loginFailed ? <p role="alert">We could not start sign in. Please retry.</p> : null}
        {auth.logoutFailed
          ? <button type="button" onClick={() => void auth.logout().catch(() => undefined)}>Retry sign out</button>
          : <button type="button" onClick={() => void login()}>{loginFailed ? 'Retry sign in' : 'Sign in'}</button>}
      </main>
    );
  }
  return <AuthenticatedRouter apiClient={apiClient} email={auth.state.session.identity.email} logout={auth.logout} routerHistory={routerHistory} sessionKey={sessionQueryScopeKey(auth.state, apiClient, auth.scopeVersion)} />;
}

function AuthenticatedRouter({ apiClient, email, logout, routerHistory, sessionKey }: { apiClient: OspClient; email: string; logout(): Promise<void>; routerHistory?: RouterHistory; sessionKey: string }) {
  const router = useMemo(() => createAppRouter(routerHistory), [apiClient, routerHistory, sessionKey]);
  return <RouterProvider router={router} context={{ apiClient, email, logout }} />;
}

export function App({ authPort, apiClient, buildProfile = 'local-e2e', routerHistory }: { authPort: AuthPort; apiClient: OspClient; buildProfile?: OspBuildProfile; routerHistory?: RouterHistory }) {
  return (
    <>
      {buildProfile === 'preview-synthetic' ? <aside className="synthetic-preview-banner" role="status">Preview sintética — las decisiones viven solo en memoria; no ejecuta envíos, divulgaciones ni cambios productivos.</aside> : null}
      <AuthProvider port={authPort}>
        <SessionScopedQueryProvider apiClient={apiClient}>
          <AuthenticatedApp apiClient={apiClient} routerHistory={routerHistory} />
        </SessionScopedQueryProvider>
      </AuthProvider>
    </>
  );
}
