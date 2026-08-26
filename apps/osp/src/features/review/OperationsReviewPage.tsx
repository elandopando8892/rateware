import { useEffect, useState } from 'react';

import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';

export function OperationsReviewPage({ workspace, conflict = false, onComplete }: { workspace: ApprovalCommunicationsWorkspace; conflict?: boolean; onComplete(): Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const snapshot = workspace.inputSnapshot;
  const reviewComplete = ['signature_approval', 'sales_authorization', 'ready_to_send', 'sent', 'manual_reconciliation_required'].includes(workspace.caseState);
  useEffect(() => { setConfirmed(false); setFailed(false); }, [workspace.caseVersion, snapshot?.sha256]);
  if (!snapshot) return <section className="workflow-page"><h1>Operations review</h1><p role="status">No evidence package is ready for review.</p></section>;
  const submit = async () => {
    setPending(true); setFailed(false);
    try { await onComplete(); } catch { setFailed(true); } finally { setPending(false); }
  };
  return <section className="workflow-page" aria-labelledby="operations-review-title">
    <p className="eyebrow">CONTROL 01 · OPERATIONS</p>
    <h1 id="operations-review-title">Operations evidence review</h1>
    <p className="lede">Verify the package. Advance only when the evidence is complete.</p>
    <dl className="evidence-grid">
      <div><dt>Documents</dt><dd>{snapshot.documentCount} reviewed documents</dd></div>
      <div><dt>Extraction</dt><dd>{snapshot.extractionCount} extracted fields</dd></div>
      <div><dt>Decisions</dt><dd>{snapshot.reviewDecisionCount} review decisions</dd></div>
      <div><dt>Evidence fingerprint</dt><dd><code>{snapshot.sha256.slice(0, 12)}</code></dd></div>
    </dl>
    <label className="control-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> The evidence package is complete and ready for signature review.</label>
    {conflict ? <p role="alert">The review was not completed. Current state was reloaded; review it before retrying explicitly.</p> : failed ? <p role="alert">The review was not completed. Reload the current state before retrying explicitly.</p> : null}
    {workspace.capabilities.completeOperationsReview ? <button type="button" disabled={!confirmed || pending} onClick={() => void submit()}>{pending ? 'Completing…' : 'Complete Operations review'}</button> : reviewComplete ? <p role="status">Operations review complete.</p> : workspace.caseState === 'operations_review' ? <p role="status">Operations authority is required for this step.</p> : <p role="status">Operations review is not active for the current state.</p>}
  </section>;
}
