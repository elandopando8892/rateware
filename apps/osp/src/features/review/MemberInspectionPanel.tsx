import { useEffect, useState } from 'react';
import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';
import type { MemberInspectionInput } from '../../api/workflow-client';
import './member-inspection.css';

type PackageFile = NonNullable<ApprovalCommunicationsWorkspace['supplierPackageSet']>['files'][number];
export function MemberInspectionPanel({ workspace, file, onSave }: {
  workspace: ApprovalCommunicationsWorkspace; file: PackageFile;
  onSave(input: MemberInspectionInput): Promise<void>;
}) {
  const [inspected, setInspected] = useState(false);
  const [percent, setPercent] = useState('');
  const [pages, setPages] = useState('');
  const [decision, setDecision] = useState<'approved' | 'rejected'>('rejected');
  const [signature, setSignature] = useState<'' | 'none' | 'image' | 'autograph'>('');
  const [policy, setPolicy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const key = `osp:member-inspection:${workspace.caseId}:${file.sourceVersionId}:${file.outputSha256}`;
  const [retry, setRetry] = useState<MemberInspectionInput | null>(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null') as MemberInspectionInput | null;
      if (stored?.reviewId === file.latestReview?.reviewId) { sessionStorage.removeItem(key); return null; }
      return stored?.caseId === workspace.caseId && stored.sourceVersionId === file.sourceVersionId && stored.outputSha256 === file.outputSha256 ? stored : null;
    } catch { return null; }
  });
  const review = file.latestReview;
  useEffect(() => {
    // A refetch may confirm the saved command after the original request failed.
    // Only the same immutable review can settle that uncertain request.
    if (retry && review?.reviewId === retry.reviewId
      && review.requestManifestSha256 === retry.requestManifestSha256
      && file.outputSha256 === retry.outputSha256
      && workspace.supplierPackageSet?.setId === retry.setId
      && workspace.supplierPackageSet.manifestSha256 === retry.setManifestSha256) {
      sessionStorage.removeItem(key);
      setRetry(null);
      setError(false);
    }
  }, [retry, review, file.outputSha256, workspace.supplierPackageSet, key]);
  const current = review?.requestManifestSha256 === workspace.fulfillment?.manifestSha256;
  const valid = signature !== '' && (signature === 'none' || /^[1-9][0-9]*$/.test(policy))
    && (percent === '' ? decision === 'rejected' : /^[0-9]{1,3}$/.test(percent) && Number(percent) <= 100)
    && (file.contentType !== 'application/pdf' || /^[1-9][0-9]{0,2}$/.test(pages))
    && (decision !== 'approved' || inspected);
  const submit = async () => {
    if (!workspace.supplierPackageSet || !workspace.inputSnapshot || !workspace.fulfillment) return;
    const input: MemberInspectionInput = retry ?? {
      reviewId: crypto.randomUUID(), caseId: workspace.caseId, setId: workspace.supplierPackageSet.setId,
      sourceVersionId: file.sourceVersionId, outputSha256: file.outputSha256,
      expectedCaseVersion: workspace.caseVersion, inputSnapshotSha256: workspace.inputSnapshot.sha256,
      setManifestSha256: workspace.supplierPackageSet.manifestSha256, requestManifestSha256: workspace.fulfillment.manifestSha256,
      status: decision, fullOutputInspected: inspected, completionPercent: percent === '' ? null : Number(percent),
      pageCount: pages === '' ? null : Number(pages), signatureRequirement: signature as MemberInspectionInput['signatureRequirement'],
      signaturePolicyVersion: signature === 'none' ? null : Number(policy),
    };
    setBusy(true); setError(false);
    try {
      sessionStorage.setItem(key, JSON.stringify(input)); // Persist retry identity before any request; no tokens or personal data.
      setRetry(input);
      await onSave(input);
      sessionStorage.removeItem(key); setRetry(null);
    } catch { setError(true); } finally { setBusy(false); }
  };
  return <section aria-label="File inspection">
    <h3>Record file inspection</h3>
    {review ? <p role="status">Saved inspection v{review.reviewVersion}: {review.status}, {review.completionPercent ?? 'unrecorded'}% inspected completion. {current ? 'Matches the current request.' : 'Request changed: a new inspection is required.'}</p> : <p>No inspection saved for these exact bytes.</p>}
    <p>This records your inspection, not a signature or approval to send. An image signature is not an autograph.</p>
    {retry ? <p role="alert">A previous request needs reconciliation. Retry uses its original identity and unchanged answers. If it conflicts, reload the saved evidence; do not submit a replacement blindly.</p> : null}
    <fieldset className="member-inspection-fields" disabled={busy || retry !== null}>
      <legend>Findings for this file</legend>
      <label className="member-inspection-confirmation"><input type="checkbox" checked={inspected} onChange={event => setInspected(event.target.checked)} /> I inspected the complete downloaded file</label>
      <label>Verified completion (%) <input type="number" min="0" max="100" value={percent} onChange={event => setPercent(event.target.value)} /></label>
      {file.contentType === 'application/pdf' ? <label>Inspected pages <input type="number" min="1" max="999" value={pages} onChange={event => setPages(event.target.value)} /></label> : null}
      <label>Inspection decision <select value={decision} onChange={event => setDecision(event.target.value as typeof decision)}><option value="rejected">Requires correction</option><option value="approved">Inspection accepted</option></select></label>
      <label>Required signature method <select value={signature} onChange={event => setSignature(event.target.value as typeof signature)}><option value="">Select from the carrier request</option><option value="none">No signature required</option><option value="image">Image / electronic method</option><option value="autograph">Autograph required</option></select></label>
      {signature && signature !== 'none' ? <label>Reviewed signature policy version <input type="number" min="1" value={policy} onChange={event => setPolicy(event.target.value)} /></label> : null}
    </fieldset>
    {error ? <p role="alert">Save not confirmed. The original request is retained for reconciliation.</p> : null}
    <button type="button" disabled={busy || (!retry && !valid)} onClick={() => void submit()}>{busy ? 'Saving…' : retry ? 'Reconcile original inspection' : 'Save file inspection'}</button>
  </section>;
}
