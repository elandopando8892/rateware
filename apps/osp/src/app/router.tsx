import { Link, Outlet, createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, redirect, type RouterHistory } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import type { OspClient } from '../api/osp-client';
import { OspWorkflowError } from '../api/workflow-client';
import { RoutePlaceholder } from '../components/RoutePlaceholder';
import { PipelineOverview } from '../features/pipeline/PipelineOverview';
import { AppShell } from './AppShell';

const CaseWorkspace = lazyRouteComponent(() => import('../features/cases/CaseWorkspace'), 'CaseWorkspace');
const CaseFormWorkspace = lazyRouteComponent(() => import('../features/forms/CaseFormWorkspace'), 'CaseFormWorkspace');
const FormTemplateLibrary = lazyRouteComponent(() => import('../features/forms/FormTemplateLibrary'), 'FormTemplateLibrary');
const QuarterlyDocumentVault = lazyRouteComponent(() => import('../features/documents/QuarterlyDocumentVault'), 'QuarterlyDocumentVault');
const ClarificationReview = lazyRouteComponent(() => import('../features/communications/ClarificationReview'), 'ClarificationReview');
const OperationsReviewPage = lazyRouteComponent(() => import('../features/review/OperationsReviewPage'), 'OperationsReviewPage');
const SignatureApprovalPage = lazyRouteComponent(() => import('../features/approval/SignatureApprovalPage'), 'SignatureApprovalPage');
const SalesAuthorizationPage = lazyRouteComponent(() => import('../features/approval/SalesAuthorizationPage'), 'SalesAuthorizationPage');
const OutboundPayloadPage = lazyRouteComponent(() => import('../features/communications/OutboundPayloadPage'), 'OutboundPayloadPage');

type AppRouterContext = { apiClient: OspClient; email: string; logout(): Promise<void> };

const rootRoute = createRootRouteWithContext<AppRouterContext>()({ component: Outlet });
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: function AppLayout() {
    const context = appRoute.useRouteContext();
    return (
      <AppShell email={context.email} onLogout={context.logout} homeLink={
        <nav className="primary-navigation" aria-label="Workspace">
          <Link className="wordmark" to="/app/pipeline" aria-label="XBF OSP pipeline home"><span aria-hidden="true">XBF</span><small>Powering Freight Logistics</small></Link>
          <Link to="/app/forms/builder">Forms</Link>
          <Link to="/app/documents">Documents</Link>
          <Link to="/app/clarifications">Clarifications</Link>
        </nav>
      }>
        <Outlet />
      </AppShell>
    );
  },
  notFoundComponent: RoutePlaceholder,
});
const appIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => { throw redirect({ to: '/app/pipeline', replace: true }); },
});
const pipelineRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'pipeline',
  component: function PipelineRoute() {
    const context = pipelineRoute.useRouteContext();
    return <PipelineOverview client={context.apiClient} />;
  },
});
const caseWorkspaceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'cases/$caseId',
  component: function CaseWorkspaceRoute() {
    const context = caseWorkspaceRoute.useRouteContext();
    const { caseId } = caseWorkspaceRoute.useParams();
    return <CaseWorkspace client={context.apiClient} caseId={caseId} />;
  },
});
const caseFormRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'cases/$caseId/form',
  component: function CaseFormRoute() {
    const context = caseFormRoute.useRouteContext();
    const { caseId } = caseFormRoute.useParams();
    return <CaseFormWorkspace client={context.apiClient} caseId={caseId} />;
  },
});
function FormBuilderWorkspace() {
  const { apiClient } = formBuilderRoute.useRouteContext();
  const query = useQuery({ queryKey: ['form-template-catalog'], queryFn: () => apiClient.listFormTemplates(), retry: false, refetchOnWindowFocus: false });
  const [busy, setBusy] = useState(false);
  const licenseEvidence = {
    approved: import.meta.env.VITE_OSP_SURVEYJS_LICENSE_APPROVED === 'true',
    licenseKey: import.meta.env.VITE_OSP_SURVEYJS_LICENSE_KEY ?? '',
  };
  if (query.isPending || query.fetchStatus !== 'idle') return <section className="workflow-page"><h1>Form template library</h1><p role="status">Loading controlled form versions…</p></section>;
  if (query.isError || !query.data) return <section className="workflow-page"><h1>Form template library</h1><p role="alert">Form templates are unavailable. Reload and retry.</p></section>;
  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    try { await operation(); await query.refetch(); } finally { setBusy(false); }
  };
  return <FormTemplateLibrary catalog={query.data} licenseEvidence={licenseEvidence} busy={busy}
    onCreateStarter={() => mutate(async () => {
      const { XBF_STARTER_SURVEY } = await import('../features/forms/FormTemplateLibrary');
      return apiClient.saveFormTemplateDraft({ idempotencyKey: `form-create:${crypto.randomUUID()}`, templateId: null, expectedVersion: 0, name: 'XBF customer setup', surveyJson: XBF_STARTER_SURVEY });
    })}
    onSaveDraft={(input) => mutate(() => apiClient.saveFormTemplateDraft({ idempotencyKey: `form-save:${crypto.randomUUID()}`, ...input }))}
    onPublish={(input) => mutate(() => apiClient.publishFormTemplate({ idempotencyKey: `form-publish:${crypto.randomUUID()}`, ...input }))}
  />;
}
const formBuilderRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'forms/builder',
  component: FormBuilderWorkspace,
});
function DocumentsWorkspace() {
  const { apiClient } = documentsRoute.useRouteContext();
  const query = useQuery({
    queryKey: ['quarterly-document-versions'],
    queryFn: () => apiClient.listDocumentVersions(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const visibleVersions = query.fetchStatus === 'idle' && !query.isError ? query.data ?? [] : [];
  return <QuarterlyDocumentVault
    referenceDate={new Date().toISOString().slice(0, 10)}
    versions={visibleVersions}
    loading={query.isPending || query.fetchStatus !== 'idle'}
    loadFailed={query.isError}
    onUploadNewVersion={async (input) => {
      const receipt = await apiClient.uploadDocumentVersion(input);
      void query.refetch();
      return receipt;
    }}
    onApproveVersion={async (input) => {
      const receipt = await apiClient.approveDocumentVersion(input);
      void query.refetch();
      return receipt;
    }}
  />;
}
const documentsRoute = createRoute({ getParentRoute: () => appRoute, path: 'documents', component: DocumentsWorkspace });

function ClarificationsWorkspace() {
  const { apiClient } = clarificationsRoute.useRouteContext();
  const query = useQuery({
    queryKey: ['clarification-reviews'],
    queryFn: () => apiClient.listClarificationReviews(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (query.isPending || query.fetchStatus !== 'idle') {
    return <section aria-labelledby="clarifications-title"><h1 id="clarifications-title">Clarification review</h1><p role="status">Loading clarification reviews…</p></section>;
  }
  if (query.isError) {
    return <section aria-labelledby="clarifications-title"><h1 id="clarifications-title">Clarification review</h1><p role="alert">Clarification reviews are unavailable. Please retry.</p></section>;
  }
  const drafts = query.data ?? [];
  const draft = drafts.find((candidate) => candidate.status === 'operations_review_required') ?? drafts[0] ?? null;
  if (!draft) return <section aria-labelledby="clarifications-title"><h1 id="clarifications-title">Clarification review</h1><p role="status">No clarification draft is ready for Operations review.</p></section>;
  return <ClarificationReview
    key={`${draft.id}:${draft.version}`}
    draft={draft}
    onSaveReview={async (input) => {
      await apiClient.saveClarificationReview({
        draftId: draft.id,
        expectedCaseVersion: draft.caseVersion,
        expectedCanonicalSha256: input.expectedCanonicalSha256,
        questions: input.questions.map((question) => ({ ...question, evidenceIds: [...question.evidenceIds] })),
      });
      await query.refetch();
    }}
  />;
}
const clarificationsRoute = createRoute({ getParentRoute: () => appRoute, path: 'clarifications', component: ClarificationsWorkspace });

function useWorkflowWorkspace(route: typeof operationsReviewRoute | typeof signatureApprovalRoute | typeof salesAuthorizationRoute | typeof outboundPayloadRoute) {
  const { apiClient } = route.useRouteContext();
  const params = route.useParams() as { caseId: string; payloadId?: string };
  const query = useQuery({
    queryKey: ['approval-communications-workspace', params.caseId, params.payloadId ?? 'none'],
    queryFn: () => apiClient.getApprovalCommunicationsWorkspace({ caseId: params.caseId, ...(params.payloadId ? { payloadId: params.payloadId } : {}) }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const keys = useRef<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const key = (action: string) => keys.current[action] ??= `${action}:${crypto.randomUUID()}`;
  const run = async (action: string, command: (idempotencyKey: string) => Promise<unknown>) => {
    setConflict(false);
    try {
      await command(key(action));
      delete keys.current[action];
      await query.refetch();
    } catch (error) {
      if (!retainIdempotencyKeyForExplicitRetry(error)) delete keys.current[action];
      if (error instanceof OspWorkflowError && error.code === 'VERSION_CONFLICT') {
        setConflict(true);
        await query.refetch();
      }
      throw error;
    }
  };
  return { apiClient, params, query, run, conflict };
}

export function retainIdempotencyKeyForExplicitRetry(error: unknown): boolean {
  return error instanceof OspWorkflowError && error.code === 'NETWORK_UNAVAILABLE';
}

function WorkflowLoading({ title, message }: { title: string; message: string }) {
  return <section className="workflow-page"><h1>{title}</h1><p role="status">{message}</p></section>;
}

function WorkflowFailure({ title }: { title: string }) {
  return <section className="workflow-page"><h1>{title}</h1><p role="alert">Current workflow state is unavailable. Reload and retry.</p></section>;
}

function OperationsReviewWorkspace() {
  const { apiClient, params, query, run, conflict } = useWorkflowWorkspace(operationsReviewRoute);
  const navigate = operationsReviewRoute.useNavigate();
  if (query.isPending || query.fetchStatus !== 'idle') return <WorkflowLoading title="Operations review" message="Loading current evidence package…" />;
  if (query.isError || !query.data) return <WorkflowFailure title="Operations review" />;
  return <OperationsReviewPage workspace={query.data} conflict={conflict} onComplete={async () => {
    await run('operations', (idempotencyKey) => apiClient.completeOperationsReview({
      caseId: params.caseId, expectedVersion: query.data.caseVersion, idempotencyKey,
      inputSnapshotSha256: query.data.inputSnapshot?.sha256 ?? '',
    }));
    await navigate({ to: '/app/cases/$caseId/signature', params: { caseId: params.caseId } });
  }} />;
}
const operationsReviewRoute = createRoute({ getParentRoute: () => appRoute, path: 'cases/$caseId/review', component: OperationsReviewWorkspace });

function SignatureApprovalWorkspace() {
  const { apiClient, params, query, run, conflict } = useWorkflowWorkspace(signatureApprovalRoute);
  if (query.isPending || query.fetchStatus !== 'idle') return <WorkflowLoading title="Signature approval" message="Loading current signature policy…" />;
  if (query.isError || !query.data) return <WorkflowFailure title="Signature approval" />;
  return <SignatureApprovalPage workspace={query.data} conflict={conflict} onApprove={() => run('signature', (idempotencyKey) => apiClient.approveAndApplySignature({
    caseId: params.caseId, expectedVersion: query.data.caseVersion, idempotencyKey,
    inputSnapshotSha256: query.data.inputSnapshot?.sha256 ?? '',
    signaturePositionVersion: query.data.signature?.positionVersion ?? 0,
  }))} />;
}
const signatureApprovalRoute = createRoute({ getParentRoute: () => appRoute, path: 'cases/$caseId/signature', component: SignatureApprovalWorkspace });

function SalesAuthorizationWorkspace() {
  const { apiClient, params, query, run, conflict } = useWorkflowWorkspace(salesAuthorizationRoute);
  if (query.isPending || query.fetchStatus !== 'idle') return <WorkflowLoading title="Sales authorization" message="Loading exact outbound payload…" />;
  if (query.isError || !query.data) return <WorkflowFailure title="Sales authorization" />;
  return <SalesAuthorizationPage workspace={query.data} conflict={conflict} onAuthorize={() => run('sales', (idempotencyKey) => apiClient.authorizeOutboundPayload({
    caseId: params.caseId, payloadId: query.data.outbound?.payloadId ?? '', expectedVersion: query.data.caseVersion, idempotencyKey,
    payloadSha256: query.data.outbound?.mimeSha256 ?? '', attachmentSha256: query.data.outbound?.attachmentSha256 ?? [],
  }))} />;
}
const salesAuthorizationRoute = createRoute({ getParentRoute: () => appRoute, path: 'cases/$caseId/authorization', component: SalesAuthorizationWorkspace });

function OutboundPayloadWorkspace() {
  const { apiClient, params, query, run, conflict } = useWorkflowWorkspace(outboundPayloadRoute);
  if (query.isPending || query.fetchStatus !== 'idle') return <WorkflowLoading title="Outbound execution" message="Loading current payload state…" />;
  if (query.isError || !query.data) return <WorkflowFailure title="Outbound execution" />;
  return <OutboundPayloadPage workspace={query.data} conflict={conflict}
    onFreeze={() => run('freeze', (idempotencyKey) => apiClient.freezeOutboundPayload({ caseId: params.caseId, payloadId: params.payloadId ?? '', expectedVersion: query.data.caseVersion, idempotencyKey }))}
    onRequestSend={() => run('send', (idempotencyKey) => apiClient.requestAuthorizedSend({ caseId: params.caseId, expectedVersion: query.data.caseVersion, idempotencyKey, salesAuthorizationId: query.data.outbound?.salesAuthorizationId ?? '', payloadSha256: query.data.outbound?.mimeSha256 ?? '' }))}
  />;
}
const outboundPayloadRoute = createRoute({ getParentRoute: () => appRoute, path: 'cases/$caseId/communications/$payloadId', component: OutboundPayloadWorkspace });

const routeTree = rootRoute.addChildren([appRoute.addChildren([
  appIndexRoute, pipelineRoute, caseWorkspaceRoute, caseFormRoute, formBuilderRoute, documentsRoute, clarificationsRoute,
  operationsReviewRoute, signatureApprovalRoute, salesAuthorizationRoute, outboundPayloadRoute,
])]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, context: undefined!, defaultPreload: false, history });
}

export const router = createAppRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
