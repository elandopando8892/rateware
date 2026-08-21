import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router';
import { type OspClient } from '../api/osp-client';
import { type AuthPort } from '../auth/auth-port';
import { RoutePlaceholder } from '../components/RoutePlaceholder';
import { AppShell } from './AppShell';

export type RouterContext = {
  auth: AuthPort;
  ospClient: OspClient;
};

function PipelinePlaceholder() {
  return (
    <RoutePlaceholder
      title="Pipeline"
      message="La vista operativa de consulta se habilitará en el siguiente incremento."
    />
  );
}

export function createOspRouter(context: RouterContext, history?: RouterHistory) {
  const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet });
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'app',
    component: AppShell,
    notFoundComponent: () => (
      <RoutePlaceholder
        title="Ruta no disponible"
        message="La ruta solicitada no forma parte de esta fase."
      />
    ),
  });
  const appIndexRoute = createRoute({
    getParentRoute: () => appRoute,
    path: '/',
    beforeLoad: () => {
      throw redirect({ to: '/app/pipeline' });
    },
  });
  const pipelineRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'pipeline',
    component: PipelinePlaceholder,
  });
  const caseRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'cases/$caseId',
    component: () => <RoutePlaceholder title="Expediente" />,
  });
  const intakeRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'intake',
    component: () => <RoutePlaceholder title="Capturas" />,
  });
  const vaultRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'vault',
    component: () => <RoutePlaceholder title="Entity Vault" />,
  });
  const approvalsRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'approvals',
    component: Outlet,
  });
  const approvalsIndexRoute = createRoute({
    getParentRoute: () => approvalsRoute,
    path: '/',
    component: () => <RoutePlaceholder title="Aprobaciones" />,
  });
  const signatureRoute = createRoute({
    getParentRoute: () => approvalsRoute,
    path: 'signature',
    component: () => <RoutePlaceholder title="Firma JAGP" />,
  });
  const authorizationRoute = createRoute({
    getParentRoute: () => approvalsRoute,
    path: 'authorization',
    component: () => <RoutePlaceholder title="Autorización" />,
  });
  const deliveryRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'delivery',
    component: () => <RoutePlaceholder title="Respuestas" />,
  });
  const auditRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'audit',
    component: () => <RoutePlaceholder title="Auditoría" />,
  });

  const routeTree = rootRoute.addChildren([
    appRoute.addChildren([
      appIndexRoute,
      pipelineRoute,
      caseRoute,
      intakeRoute,
      vaultRoute,
      approvalsRoute.addChildren([
        approvalsIndexRoute,
        signatureRoute,
        authorizationRoute,
      ]),
      deliveryRoute,
      auditRoute,
    ]),
  ]);

  return createRouter({ routeTree, context, history });
}

export type OspRouter = ReturnType<typeof createOspRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: OspRouter;
  }
}
