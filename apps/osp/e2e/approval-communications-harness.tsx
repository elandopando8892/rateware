import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { ApprovalCommunicationsWorkspace } from '../src/api/contracts';
import { createWorkflowClient, OspWorkflowError } from '../src/api/workflow-client';
import { retainIdempotencyKeyForExplicitRetry } from '../src/app/router';
import { SalesAuthorizationPage } from '../src/features/approval/SalesAuthorizationPage';
import { SignatureApprovalPage } from '../src/features/approval/SignatureApprovalPage';
import { OutboundPayloadPage } from '../src/features/communications/OutboundPayloadPage';
import { OperationsReviewPage } from '../src/features/review/OperationsReviewPage';
import '../src/styles/tokens.css';
import '../src/styles/global.css';

const caseId = '33333333-3333-4333-8333-333333333333';
const payloadId = '44444444-4444-4444-8444-444444444444';

function Harness() {
  const actor = JSON.parse(sessionStorage.getItem('osp-e2e-actor') ?? '{}') as { token?: string; email?: string; subject?: string; organization?: string };
  const stage = new URL(location.href).searchParams.get('stage') ?? 'review';
  const session = useMemo(() => ({
    generation: `e2e:${actor.subject ?? 'anonymous'}`,
    identity: {
      issuer: 'https://auth.heymarksman.com', authorizedParty: 'osp-e2e-client', subject: actor.subject ?? 'anonymous',
      organization: actor.organization ?? '11111111-1111-4111-8111-111111111111', email: actor.email ?? 'anonymous@example.test', emailVerified: true,
    },
  }), [actor.email, actor.organization, actor.subject]);
  const client = useMemo(() => createWorkflowClient({
    supabaseUrl: location.origin,
    getCurrentSession: () => session,
    getAccessToken: async () => actor.token ?? '',
    getApprovalIdToken: async () => actor.token ?? '',
  }), [actor.token, session]);
  const [workspace, setWorkspace] = useState<ApprovalCommunicationsWorkspace | null>(null);
  const [failed, setFailed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const keys = useRef<Record<string, string>>({});
  const load = useCallback(async () => {
    setFailed(false);
    try { setWorkspace(await client.getApprovalCommunicationsWorkspace({ caseId, payloadId })); }
    catch { setFailed(true); }
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  const run = async (name: string, command: (key: string) => Promise<unknown>) => {
    setConflict(false);
    const key = keys.current[name] ??= `${name}:${crypto.randomUUID()}`;
    try { await command(key); delete keys.current[name]; await load(); }
    catch (error) {
      if (!retainIdempotencyKeyForExplicitRetry(error)) delete keys.current[name];
      if (error instanceof OspWorkflowError && error.code === 'VERSION_CONFLICT') { setConflict(true); await load(); }
      throw error;
    }
  };
  if (failed) return <p role="alert">Workspace unavailable.</p>;
  if (!workspace) return <p role="status">Loading current state…</p>;
  if (stage === 'review') return <OperationsReviewPage workspace={workspace} conflict={conflict} onComplete={() => run('operations', (idempotencyKey) => client.completeOperationsReview({ caseId, expectedVersion: workspace.caseVersion, idempotencyKey, inputSnapshotSha256: workspace.inputSnapshot?.sha256 ?? '' }))} />;
  if (stage === 'signature') return <SignatureApprovalPage workspace={workspace} conflict={conflict} onApprove={() => run('signature', (idempotencyKey) => client.approveAndApplySignature({ caseId, expectedVersion: workspace.caseVersion, idempotencyKey, inputSnapshotSha256: workspace.inputSnapshot?.sha256 ?? '', signaturePositionVersion: workspace.signature?.positionVersion ?? 0 }))} />;
  if (stage === 'authorization') return <SalesAuthorizationPage workspace={workspace} conflict={conflict} onAuthorize={() => run('sales', (idempotencyKey) => client.authorizeOutboundPayload({ caseId, expectedVersion: workspace.caseVersion, idempotencyKey, payloadId, payloadSha256: workspace.outbound?.mimeSha256 ?? '', attachmentSha256: workspace.outbound?.attachmentSha256 ?? [] }))} />;
  return <OutboundPayloadPage workspace={workspace} conflict={conflict}
    onFreeze={() => run('freeze', (idempotencyKey) => client.freezeOutboundPayload({ caseId, payloadId, expectedVersion: workspace.caseVersion, idempotencyKey }))}
    onRequestSend={() => run('send', (idempotencyKey) => client.requestAuthorizedSend({ caseId, expectedVersion: workspace.caseVersion, idempotencyKey, salesAuthorizationId: workspace.outbound?.salesAuthorizationId ?? '', payloadSha256: workspace.outbound?.mimeSha256 ?? '' }))}
  />;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness /></React.StrictMode>);
