import { Link, Outlet } from '@tanstack/react-router';
import { useAuth } from '../auth/AuthProvider';

const workflowLinks = [
  { to: '/app/pipeline', label: 'Pipeline' },
  { to: '/app/intake', label: 'Capturas' },
  { to: '/app/vault', label: 'Entity Vault' },
  { to: '/app/approvals/signature', label: 'Firma JAGP' },
  { to: '/app/approvals/authorization', label: 'Autorización' },
  { to: '/app/delivery', label: 'Respuestas' },
  { to: '/app/audit', label: 'Auditoría' },
] as const;

export function AppShell() {
  const { state, login, logout } = useAuth();

  if (state.status === 'checking') {
    return <p role="status">Checking access…</p>;
  }

  if (state.status === 'error') {
    return <p role="alert">{state.error}</p>;
  }

  if (state.status === 'anonymous') {
    return (
      <main className="auth-gate">
        <h1>XBF Customer Setup</h1>
        <p>Register XBF as the provider&apos;s customer.</p>
        <button type="button" onClick={() => void login('/app/pipeline')}>Sign in</button>
      </main>
    );
  }

  return (
    <div className="osp-shell">
      <a className="skip-link" href="#osp-main">Saltar al contenido</a>
      <header className="osp-header">
        <div>
          <h1>OSP · XBF Customer Setup</h1>
          <p>Register XBF as the provider&apos;s customer.</p>
        </div>
        <div className="osp-session">
          <p role="status" aria-label="Sesión actual">Sesión: {state.user.email}</p>
          <button type="button" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>
      <nav aria-label="Flujo OSP" className="osp-navigation">
        {workflowLinks.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            activeProps={{ 'aria-current': 'page' }}
          >
            {label}
          </Link>
        ))}
      </nav>
      <aside className="phase-banner" role="status" aria-label="Fase actual">
        Fase 1: consulta solamente
      </aside>
      <main id="osp-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
