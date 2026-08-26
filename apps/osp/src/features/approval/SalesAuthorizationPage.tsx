import { useEffect, useState } from 'react';
import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';

export function SalesAuthorizationPage({ workspace, conflict = false, onAuthorize }: { workspace: ApprovalCommunicationsWorkspace; conflict?: boolean; onAuthorize(): Promise<void> }) {
  const outbound = workspace.outbound;
  const authorizationRevision = outbound ? JSON.stringify({
    caseVersion: workspace.caseVersion, to: outbound.to, cc: outbound.cc,
    subject: outbound.subject, bodyText: outbound.bodyText,
    attachmentSha256: outbound.attachmentSha256, mimeSha256: outbound.mimeSha256,
  }) : '';
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setConfirmed(false); setFailed(false); }, [authorizationRevision]);
  if (!outbound?.mimeSha256) return <section className="workflow-page"><h1>Sales authorization</h1><p role="status">No frozen outbound payload is ready.</p></section>;
  const submit = async () => { setPending(true); setFailed(false); try { await onAuthorize(); } catch { setFailed(true); } finally { setPending(false); } };
  return <section className="workflow-page" aria-labelledby="sales-title">
    <p className="eyebrow">CONTROL 03 · SALES</p><h1 id="sales-title">Authorize exact outbound payload</h1>
    <p className="lede">Review every recipient, word and attachment fingerprint. Authorization does not send.</p>
    <dl className="payload-review">
      <div><dt>Message type</dt><dd>{outbound.kind === 'clarification' ? 'Clarification' : 'Final response'}</dd></div>
      <div><dt>From</dt><dd>{outbound.from}</dd></div><div><dt>To</dt><dd>{outbound.to.join(', ')}</dd></div><div><dt>Cc</dt><dd>{outbound.cc.length ? outbound.cc.join(', ') : 'None'}</dd></div>
      <div><dt>Subject</dt><dd>{outbound.subject}</dd></div><div><dt>Body</dt><dd className="message-preview">{outbound.bodyText}</dd></div>
      <div><dt>Attachments</dt><dd>{outbound.attachmentSha256.map((hash) => <code key={hash}>{hash}</code>)}</dd></div><div><dt>MIME fingerprint</dt><dd><code>{outbound.mimeSha256}</code></dd></div>
    </dl>
    <label className="control-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I reviewed the exact recipients, content and attachments shown above.</label>
    {conflict ? <p role="alert">Authorization failed safely. Current state was reloaded; review the payload before retrying.</p> : failed ? <p role="alert">Authorization failed safely. Reload the current state and review the payload before retrying.</p> : null}
    {workspace.capabilities.authorizeOutboundPayload ? <button type="button" disabled={!confirmed || pending} onClick={() => void submit()}>{pending ? 'Authorizing…' : 'Authorize outbound payload'}</button> : outbound.status === 'authorized' || workspace.caseState === 'ready_to_send' || workspace.caseState === 'sent' || workspace.caseState === 'manual_reconciliation_required' ? <p role="status">Sales authorization complete.</p> : <p role="status">sales@heymarksman.com authorization is required.</p>}
  </section>;
}
