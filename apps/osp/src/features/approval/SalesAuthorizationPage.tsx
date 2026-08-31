import { useEffect, useState } from 'react';

import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';
import { FinalResponseComposer, type FinalResponseDraftFields } from './FinalResponseComposer';

type SalesAuthorizationPageProps = {
  workspace: ApprovalCommunicationsWorkspace;
  conflict?: boolean;
  reauthenticationRequired?: boolean;
  onSaveDraft(input: FinalResponseDraftFields): Promise<void>;
  onFreeze(): Promise<void>;
  onReauthenticate?(): Promise<void>;
  onAuthorize(): Promise<void>;
};

function PayloadReview({ workspace }: { workspace: ApprovalCommunicationsWorkspace }) {
  const outbound = workspace.outbound;
  if (!outbound) return null;
  return <dl className="payload-review">
    <div><dt>Message type</dt><dd>{outbound.kind === 'clarification' ? 'Clarification' : 'Final response'}</dd></div>
    <div><dt>Status</dt><dd>{outbound.status}</dd></div>
    <div><dt>From</dt><dd>{outbound.from}</dd></div>
    <div><dt>To</dt><dd>{outbound.to.join(', ')}</dd></div>
    <div><dt>Cc</dt><dd>{outbound.cc.length ? outbound.cc.join(', ') : 'None'}</dd></div>
    <div><dt>Subject</dt><dd>{outbound.subject}</dd></div>
    <div><dt>In-Reply-To</dt><dd>{outbound.inReplyTo ?? 'None'}</dd></div>
    <div><dt>References</dt><dd>{outbound.references.length ? outbound.references.join(' ') : 'None'}</dd></div>
    <div><dt>Body</dt><dd className="message-preview">{outbound.bodyText}</dd></div>
    <div><dt>Attachments</dt><dd>{outbound.attachmentSha256.length ? outbound.attachmentSha256.map((hash) => <code key={hash}>{hash}</code>) : 'None'}</dd></div>
    <div><dt>MIME fingerprint</dt><dd>{outbound.mimeSha256 ? <code>{outbound.mimeSha256}</code> : 'Created when Operations freezes this exact draft'}</dd></div>
  </dl>;
}

export function SalesAuthorizationPage({
  workspace,
  conflict = false,
  reauthenticationRequired = false,
  onSaveDraft,
  onFreeze,
  onReauthenticate = async () => undefined,
  onAuthorize,
}: SalesAuthorizationPageProps) {
  const outbound = workspace.outbound;
  const revision = outbound ? JSON.stringify({
    caseVersion: workspace.caseVersion, status: outbound.status, to: outbound.to, cc: outbound.cc,
    subject: outbound.subject, inReplyTo: outbound.inReplyTo, references: outbound.references,
    bodyText: outbound.bodyText, attachmentSha256: outbound.attachmentSha256, mimeSha256: outbound.mimeSha256,
  }) : '';
  const [confirmed, setConfirmed] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [pending, setPending] = useState<'freeze' | 'reauthenticate' | 'authorize' | null>(null);
  const [failed, setFailed] = useState(false);
  const [reauthenticationFailed, setReauthenticationFailed] = useState(false);
  useEffect(() => {
    setConfirmed(false);
    setDraftDirty(false);
    setFailed(false);
    setReauthenticationFailed(false);
  }, [revision]);

  const act = async (action: 'freeze' | 'authorize', command: () => Promise<void>) => {
    setPending(action); setFailed(false);
    try { await command(); } catch { setFailed(true); } finally { setPending(null); }
  };
  const reauthenticate = async () => {
    setPending('reauthenticate'); setReauthenticationFailed(false);
    try { await onReauthenticate(); } catch { setReauthenticationFailed(true); } finally { setPending(null); }
  };

  if (!outbound) {
    if (workspace.capabilities.saveOutboundDraft && workspace.signedPackage && workspace.replyContext && workspace.inputSnapshot) {
      return <section className="workflow-page" aria-labelledby="sales-title">
        <p className="eyebrow">CONTROL 03 · OPERATIONS</p><h1 id="sales-title">Prepare final response</h1>
        <p className="lede">Compose the reply that Sales will review. This step saves an internal draft and never sends email.</p>
        <FinalResponseComposer signedPackage={workspace.signedPackage} replyContext={workspace.replyContext} onSave={onSaveDraft} />
      </section>;
    }
    return <section className="workflow-page"><h1>Sales authorization</h1><p role="status">No outbound draft is ready. Operations must prepare the internal final response first.</p></section>;
  }

  if (outbound.status === 'draft') {
    return <section className="workflow-page" aria-labelledby="sales-title">
      <p className="eyebrow">CONTROL 03 · OPERATIONS</p><h1 id="sales-title">Freeze final response</h1>
      <p className="lede">Review the exact internal draft. Freezing creates an immutable review artifact for Sales; it does not send email.</p>
      <PayloadReview workspace={workspace} />
      {workspace.capabilities.saveOutboundDraft && workspace.signedPackage && workspace.replyContext
        ? <FinalResponseComposer key={outbound.payloadId} signedPackage={workspace.signedPackage} replyContext={workspace.replyContext} initialBodyText={outbound.bodyText} revision onDirtyChange={setDraftDirty} onSave={onSaveDraft} />
        : null}
      {draftDirty ? <p role="status">Save or discard the body correction before freezing this draft.</p> : null}
      <label className="control-confirmation"><input type="checkbox" checked={confirmed} disabled={draftDirty} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm this exact draft, recipients and signed package are ready for Sales review.</label>
      {conflict ? <p role="alert">Freeze failed safely. Current state was reloaded; review the draft before retrying.</p> : failed ? <p role="alert">Freeze failed safely. No message was sent. Reload the current state before retrying.</p> : null}
      {workspace.capabilities.freezeOutboundPayload
        ? <button type="button" disabled={draftDirty || !confirmed || pending !== null} onClick={() => void act('freeze', onFreeze)}>{pending === 'freeze' ? 'Freezing internal draft…' : 'Freeze for Sales review'}</button>
        : <p role="status">Operations authority is required to freeze this draft.</p>}
    </section>;
  }

  if (!outbound.mimeSha256) return <section className="workflow-page"><h1>Sales authorization</h1><p role="alert">The frozen payload fingerprint is unavailable. Authorization remains disabled.</p></section>;

  return <section className="workflow-page" aria-labelledby="sales-title">
    <p className="eyebrow">CONTROL 03 · SALES</p><h1 id="sales-title">Authorize exact outbound payload</h1>
    <p className="lede">Review every recipient, word and attachment fingerprint. Authorization does not send.</p>
    <PayloadReview workspace={workspace} />
    {workspace.capabilities.authorizeOutboundPayload && reauthenticationRequired ? <>
      <p role="status">A fresh Sales authentication is required before authorization. No authorization command will be sent yet.</p>
      {reauthenticationFailed ? <p role="alert">We could not start fresh Sales authentication. Please retry.</p> : null}
      <button type="button" disabled={pending !== null} onClick={() => void reauthenticate()}>{pending === 'reauthenticate' ? 'Starting secure authentication…' : 'Authenticate Sales to authorize'}</button>
    </> : <>
      <label className="control-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I reviewed the exact recipients, content and attachments shown above.</label>
      {conflict ? <p role="alert">Authorization failed safely. Current state was reloaded; review the payload before retrying.</p> : failed ? <p role="alert">Authorization failed safely. Reload the current state and review the payload before retrying.</p> : null}
      {workspace.capabilities.authorizeOutboundPayload ? <button type="button" disabled={!confirmed || pending !== null} onClick={() => void act('authorize', onAuthorize)}>{pending === 'authorize' ? 'Authorizing…' : 'Authorize outbound payload'}</button> : outbound.status === 'authorized' || workspace.caseState === 'ready_to_send' || workspace.caseState === 'sent' || workspace.caseState === 'manual_reconciliation_required' ? <p role="status">Sales authorization complete.</p> : <p role="status">sales@heymarksman.com authorization is required.</p>}
    </>}
  </section>;
}
