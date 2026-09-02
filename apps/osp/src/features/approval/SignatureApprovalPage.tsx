import { useEffect, useState } from 'react';
import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';
import { FulfillmentMatrixPanel } from '../review/FulfillmentMatrixPanel';

export function SignatureApprovalPage({ workspace, conflict = false, reauthenticationRequired = false, onReauthenticate = async () => undefined, onApprove }: { workspace: ApprovalCommunicationsWorkspace; conflict?: boolean; reauthenticationRequired?: boolean; onReauthenticate?(): Promise<void>; onApprove(): Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reauthenticationFailed, setReauthenticationFailed] = useState(false);
  const signature = workspace.signature;
  useEffect(() => { setConfirmed(false); setFailed(false); setReauthenticationFailed(false); }, [workspace.caseVersion, workspace.inputSnapshot?.sha256, signature?.positionVersion]);
  if (!signature) return <section className="workflow-page"><h1>Signature approval</h1><p role="status">No signature position is ready.</p></section>;
  const submit = async () => { setPending(true); setFailed(false); try { await onApprove(); } catch { setFailed(true); } finally { setPending(false); } };
  const reauthenticate = async () => { setPending(true); setReauthenticationFailed(false); try { await onReauthenticate(); } catch { setReauthenticationFailed(true); } finally { setPending(false); } };
  return <section className="workflow-page" aria-labelledby="signature-title">
    <p className="eyebrow">CONTROL 02 · JOSÉ</p><h1 id="signature-title">Signature approval</h1>
    <p className="lede">Confirm policy and placement. Private signature material never enters this browser.</p>
    <FulfillmentMatrixPanel workspace={workspace} />
    <dl className="evidence-grid"><div><dt>Artifact</dt><dd>{workspace.supplierPackage ? `Reviewed XLSX · version ${workspace.supplierPackage.version}` : 'Reviewed package'}</dd></div><div><dt>Position</dt><dd>Position version {signature.positionVersion}</dd></div><div><dt>Signed output</dt><dd><code>{signature.outputSha256?.slice(0, 12) ?? 'Pending'}</code></dd></div></dl>
    {workspace.capabilities.approveAndApplySignature && reauthenticationRequired ? <>
      <p role="status">A fresh authentication is required before this approval. No signature command will be sent yet.</p>
      {reauthenticationFailed ? <p role="alert">We could not start fresh authentication. Please retry.</p> : null}
      <button type="button" disabled={pending} onClick={() => void reauthenticate()}>{pending ? 'Starting secure authentication…' : 'Authenticate to approve'}</button>
    </> : <>
      <label className="control-confirmation"><input type="checkbox" checked={confirmed} disabled={workspace.fulfillment?.gates.signatureApproval !== true} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm the approved signature policy and placement for this package.</label>
      {conflict ? <p role="alert">Signature approval failed safely. Current state was reloaded; review it before retrying.</p> : failed ? <p role="alert">Signature approval failed safely. Reload the current state before retrying.</p> : null}
      {workspace.capabilities.approveAndApplySignature ? <button type="button" disabled={!confirmed || pending} onClick={() => void submit()}>{pending ? 'Applying…' : 'Approve and apply signature'}</button> : signature.approvalStatus === 'approved' ? <p role="status">Signature applied.</p> : signature.approvalId ? <p role="status">Signature approval recorded; secure application is pending.</p> : <p role="status">José approval authority is required.</p>}
    </>}
  </section>;
}
