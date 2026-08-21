import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createOspClient } from './api/osp-client';
import { App } from './app/App';
import { createKindeAuthPort } from './auth/kinde-auth-port';
import { getRuntimeConfig } from './config/runtime';
import './styles/tokens.css';
import './styles/global.css';
import './styles/shell.css';

const config = getRuntimeConfig();
const auth = createKindeAuthPort(config);
const ospClient = createOspClient({
  supabaseUrl: config.VITE_SUPABASE_URL,
  auth,
  fetchImpl: window.fetch.bind(window),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode><App auth={auth} ospClient={ospClient} /></StrictMode>,
);
