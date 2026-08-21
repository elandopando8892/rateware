import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createOspClient } from './api/osp-client';
import { App } from './app/App';
import type { RouterContext } from './app/router';
import { createKindeAuthPort } from './auth/kinde-auth-port';
import { getRuntimeConfig } from './config/runtime';
import './styles/tokens.css';
import './styles/global.css';
import './styles/shell.css';

declare global {
  interface Window {
    __OSP_E2E_RUNTIME__?: RouterContext;
  }
}

const runtime = import.meta.env.DEV && window.__OSP_E2E_RUNTIME__
  ? window.__OSP_E2E_RUNTIME__
  : (() => {
      const config = getRuntimeConfig();
      const auth = createKindeAuthPort(config);
      return {
        auth,
        ospClient: createOspClient({
          supabaseUrl: config.VITE_SUPABASE_URL,
          auth,
          fetchImpl: window.fetch.bind(window),
        }),
      };
    })();

createRoot(document.getElementById('root')!).render(
  <StrictMode><App auth={runtime.auth} ospClient={runtime.ospClient} /></StrictMode>,
);
