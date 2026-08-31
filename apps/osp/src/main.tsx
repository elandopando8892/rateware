import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createOspClient } from './api/osp-client';
import { App } from './app/App';
import { assertAllowedAppOrigin, loadRuntimeConfig } from './config/runtime';
import { createPreviewRuntime } from './preview/preview-runtime';
import './styles/tokens.css';
import './styles/global.css';
import './styles/shell.css';
import './styles/pipeline.css';
import './styles/forms.css';
import './styles/profile.css';

const config = loadRuntimeConfig(import.meta.env);
assertAllowedAppOrigin(window.location.origin, config.VITE_OSP_BUILD_PROFILE);
const createAuthenticatedRuntime = async () => {
  if (config.VITE_OSP_AUTH_PROVIDER === 'supabase') {
    const { createSupabaseAuthPort } = await import('./auth/supabase-auth-port');
    const authPort = createSupabaseAuthPort(config);
    return {
      authPort,
      apiClient: createOspClient({
        supabaseUrl: config.VITE_SUPABASE_URL,
        getCurrentSession: () => authPort.getCurrentSession(),
        getAccessToken: (session, forceRefresh) => authPort.getAccessToken(session, forceRefresh),
        getApprovalIdToken: (session) => authPort.getApprovalProof(session),
      }),
    };
  }
  const { createKindeAuthPort } = await import('./auth/kinde-auth-port');
  const authPort = createKindeAuthPort(config);
  return {
    authPort,
    apiClient: createOspClient({
      supabaseUrl: config.VITE_SUPABASE_URL,
      getCurrentSession: () => authPort.getCurrentSession(),
      getAccessToken: (session, forceRefresh) => authPort.getAccessToken(session, forceRefresh),
      getApprovalIdToken: (session) => authPort.getIdToken(session),
    }),
  };
};
const runtime = config.VITE_OSP_BUILD_PROFILE === 'preview-synthetic'
  ? createPreviewRuntime()
  : await createAuthenticatedRuntime();
const root = document.getElementById('root');
if (!root) throw new Error('OSP root element is missing');
createRoot(root).render(<StrictMode><App authPort={runtime.authPort} apiClient={runtime.apiClient} buildProfile={config.VITE_OSP_BUILD_PROFILE} authProvider={config.VITE_OSP_AUTH_PROVIDER} /></StrictMode>);
