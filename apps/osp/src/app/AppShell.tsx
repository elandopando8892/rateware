import { useQueryClient } from '@tanstack/react-query';
import { useState, type MouseEvent, type ReactNode } from 'react';

export function AppShell({
  email,
  onLogout,
  homeLink,
  children,
}: {
  email: string;
  onLogout(): Promise<void>;
  homeLink?: ReactNode;
  children: ReactNode;
}) {
  const isSuperuser = email.trim().toLowerCase() === 'sales@heymarksman.com';
  const queryClient = useQueryClient();
  const [logoutFailed, setLogoutFailed] = useState(false);
  const logout = async () => {
    setLogoutFailed(false);
    await queryClient.cancelQueries();
    queryClient.clear();
    try { await onLogout(); } catch { setLogoutFailed(true); }
  };
  const focusMain = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={focusMain}>Skip to content</a>
      <header className="topbar">
        {homeLink ?? <a className="wordmark" href="/app/pipeline" aria-label="XBF OSP pipeline home"><span aria-hidden="true">XBF</span><small>Powering Freight Logistics</small></a>}
        <div className="account">
          <span className="account-identity">{email}{isSuperuser ? <small>OSP administrator</small> : null}</span>
          <button type="button" onClick={() => void logout()}>{logoutFailed ? 'Retry sign out' : 'Sign out'}</button>
        </div>
      </header>
      {logoutFailed ? <p className="session-error" role="alert">We could not sign out. Please retry.</p> : null}
      <main id="main-content" tabIndex={-1}>{children}</main>
    </div>
  );
}
