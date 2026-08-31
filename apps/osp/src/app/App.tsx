import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { OspClient } from '../api/osp-client';
import type { AuthPort, BoundSession } from '../auth/auth-port';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { SessionScopedQueryProvider, sessionQueryScopeKey } from '../auth/SessionScopedQueryProvider';
import { createAppRouter } from './router';
import type { OspAuthProvider, OspBuildProfile } from '../config/runtime';

const APPROVAL_SESSION_CLIENT_WINDOW_MS = 4 * 60 * 1_000 + 30 * 1_000;
const SUPERUSER_SESSION_CLIENT_WINDOW_MS = 29 * 60 * 1_000 + 30 * 1_000;
const APPROVAL_SESSION_CLOCK_SKEW_MS = 30 * 1_000;

export function isApprovalSessionFresh(session: BoundSession, now = Date.now()): boolean {
  const issuedAt = Date.parse(session.approvalSessionIssuedAt ?? '');
  if (!Number.isFinite(issuedAt) || !Number.isFinite(now)) return false;
  const age = now - issuedAt;
  const windowMs = session.identity.email === 'sales@heymarksman.com'
    ? SUPERUSER_SESSION_CLIENT_WINDOW_MS
    : APPROVAL_SESSION_CLIENT_WINDOW_MS;
  return age >= -APPROVAL_SESSION_CLOCK_SKEW_MS
    && age <= windowMs;
}

function AuthenticatedApp({ apiClient, authProvider, buildProfile, routerHistory }: { apiClient: OspClient; authProvider: OspAuthProvider; buildProfile: OspBuildProfile; routerHistory?: RouterHistory }) {
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
        {authProvider === 'kinde'
          ? <button type="button" onClick={() => void auth.login('/app/pipeline').catch(() => undefined)}>Authorize workspace</button>
          : null}
        <button type="button" onClick={() => void auth.logout().catch(() => undefined)}>
          {auth.logoutFailed ? 'Retry new session' : 'Start new session'}
        </button>
      </main>
    );
  }
  if (auth.state.status === 'anonymous') {
    const login = async () => {
      setLoginFailed(false);
      try {
        await auth.login('/app/pipeline');
      } catch { setLoginFailed(true); }
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
          : authProvider === 'supabase'
            ? <div className="auth-google-login">
                <p>Use one of the Google Workspace accounts authorized for OSP.</p>
                <button type="button" onClick={() => void login()}>{loginFailed ? 'Retry Google sign in' : 'Continue with Google'}</button>
              </div>
            : <button type="button" onClick={() => void login()}>{loginFailed ? 'Retry sign in' : 'Sign in'}</button>}
      </main>
    );
  }
  const authenticatedSession = auth.state.session;
  const reauthenticateForApproval = authProvider === 'supabase'
    ? (returnTo: string) => auth.login(returnTo, authenticatedSession.identity.email)
    : (returnTo: string) => auth.login(returnTo);
  return <AuthenticatedRouter
    apiClient={apiClient}
    email={authenticatedSession.identity.email}
    logout={auth.logout}
    reauthenticateForApproval={reauthenticateForApproval}
    approvalSessionFresh={() => buildProfile !== 'production-readonly' || isApprovalSessionFresh(authenticatedSession)}
    routerHistory={routerHistory}
    sessionKey={sessionQueryScopeKey(auth.state, apiClient, auth.scopeVersion)}
  />;
}

function AuthenticatedRouter({ apiClient, email, logout, reauthenticateForApproval, approvalSessionFresh, routerHistory, sessionKey }: { apiClient: OspClient; email: string; logout(): Promise<void>; reauthenticateForApproval(returnTo: string): Promise<void>; approvalSessionFresh(): boolean; routerHistory?: RouterHistory; sessionKey: string }) {
  const router = useMemo(() => createAppRouter(routerHistory), [apiClient, routerHistory, sessionKey]);
  return <RouterProvider router={router} context={{ apiClient, email, logout, reauthenticateForApproval, approvalSessionFresh }} />;
}

export function App({ authPort, apiClient, authProvider = 'kinde', buildProfile = 'local-e2e', routerHistory }: { authPort: AuthPort; apiClient: OspClient; authProvider?: OspAuthProvider; buildProfile?: OspBuildProfile; routerHistory?: RouterHistory }) {
  return (
    <>
      {buildProfile === 'preview-synthetic' ? <aside className="synthetic-preview-banner" role="status">Preview sintética — las decisiones viven solo en memoria; no ejecuta envíos, divulgaciones ni cambios productivos.</aside> : null}
      <AuthProvider port={authPort}>
        <SessionScopedQueryProvider apiClient={apiClient}>
          <AuthenticatedApp apiClient={apiClient} authProvider={authProvider} buildProfile={buildProfile} routerHistory={routerHistory} />
        </SessionScopedQueryProvider>
      </AuthProvider>
    </>
  );
}
