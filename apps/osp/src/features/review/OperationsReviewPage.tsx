import { useEffect, useState } from 'react';

import type { ApprovalCommunicationsWorkspace } from '../../api/contracts';
import { FulfillmentMatrixPanel } from './FulfillmentMatrixPanel';
import { ArtifactReviewPanel } from './ArtifactReviewPanel';
import { syntheticArtifactInventory } from '../../preview/artifact-review-inventory';
import { MemberInspectionPanel } from './MemberInspectionPanel';
import type { MemberInspectionInput } from '../../api/workflow-client';
import type { NativeArtifactTargetsInput } from '../../api/workflow-client';
import { NativeArtifactTargetPanel } from './NativeArtifactTargetPanel';

export function OperationsReviewPage({ workspace, conflict = false, onComplete, onSaveInspection, onSaveNativeTargets }: { workspace: ApprovalCommunicationsWorkspace; conflict?: boolean; onComplete(): Promise<void>; onSaveInspection?(input: MemberInspectionInput): Promise<void>; onSaveNativeTargets?(input: NativeArtifactTargetsInput): Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const snapshot = workspace.inputSnapshot;
  const supplierPackage = workspace.supplierPackage;
  const packageSet = workspace.supplierPackageSet;
  const fulfillmentNotReady = workspace.fulfillment?.assessmentStatus === 'not_ready';
  const evidenceReady = packageSet ? Boolean(packageSet.operationsReviewSha256) : Boolean(supplierPackage) && workspace.fulfillment?.gates.operationsReview === true;
  const formatLabel = (contentType: string) => contentType === 'application/pdf' ? 'PDF'
    : contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? 'DOCX'
    : contentType === 'application/vnd.ms-excel.sheet.macroEnabled.12' ? 'XLSM' : 'XLSX';
  const reviewComplete = ['signature_approval', 'sales_authorization', 'ready_to_send', 'sent', 'manual_reconciliation_required'].includes(workspace.caseState);
  useEffect(() => { setConfirmed(false); setFailed(false); }, [workspace.caseVersion, snapshot?.sha256, packageSet?.manifestSha256, packageSet?.operationsReviewSha256]);
  if (!snapshot) return <section className="workflow-page"><h1>Operations review</h1><p role="status">No evidence package is ready for review.</p><FulfillmentMatrixPanel workspace={workspace} /><a href={`/app/cases/${workspace.caseId}`}>Open request workspace</a></section>;
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
    <FulfillmentMatrixPanel workspace={workspace} />
    {onSaveNativeTargets && (workspace.nativeArtifactTargets?.length ?? 0) > 0 ? <section className="review-package" aria-labelledby="native-targets-title">
      <p className="eyebrow">SOURCE FIDELITY</p><h2 id="native-targets-title">Place answers in the original forms</h2>
      <p>Operations confirms native destinations before a new package is generated. Missing or conflicting placement remains blocked.</p>
      {workspace.nativeArtifactTargets?.map(review => <NativeArtifactTargetPanel key={`${review.mappingId}:${review.mappingVersion}`} caseId={workspace.caseId} caseState={workspace.caseState} review={review} onSave={onSaveNativeTargets} blocked={fulfillmentNotReady} />)}
    </section> : null}
    {import.meta.env.VITE_OSP_BUILD_PROFILE === 'preview-synthetic' ? <ArtifactReviewPanel key={workspace.caseId} caseId={workspace.caseId} manifestSha256={workspace.fulfillment?.manifestSha256 ?? ''} inventory={syntheticArtifactInventory} /> : null}
    <section className="review-package" aria-labelledby="supplier-package-title">
      <p className="eyebrow">GENERATED OUTPUT</p>
      <h2 id="supplier-package-title">{packageSet ? 'Completed supplier forms' : 'Completed supplier workbook'}</h2>
      {packageSet ? <>
        <p>{packageSet.files.length} files · set version {packageSet.version}. Package fingerprint <code>{packageSet.manifestSha256.slice(0, 12)}</code>.</p>
        <ul>{packageSet.files.map((file, index) => <li key={file.sourceVersionId}>
          <p>Form {index + 1} · {formatLabel(file.contentType)} · <code>{file.outputSha256.slice(0, 12)}</code></p>
          {file.downloadUrl ? <a className="button-link" href={file.downloadUrl}>Download form {index + 1} ({formatLabel(file.contentType)})</a>
            : <p>Refresh to request a new secure download link for form {index + 1}.</p>}
          {onSaveInspection && packageSet.canRecordInspection === true && workspace.caseState === 'operations_review' && workspace.fulfillment && <MemberInspectionPanel key={`${file.outputSha256}:${file.latestReview?.reviewId ?? 'none'}`} workspace={workspace} file={file} onSave={onSaveInspection} />}
        </li>)}</ul>
        <p role="status">{packageSet.operationsReviewSha256 ? 'All file inspections and pre-signature requirements are validated for this exact package.' : 'Complete the file inspections and required evidence before Operations can advance.'} Signature and sending remain separate steps.</p>
      </> : supplierPackage ? <>
        <p>The reviewed XBF values are assembled in version {supplierPackage.version}. Output fingerprint <code>{supplierPackage.outputSha256.slice(0, 12)}</code>.</p>
        {supplierPackage.downloadUrl
          ? <a className="button-link" href={supplierPackage.downloadUrl}>Download reviewed XLSX</a>
          : <p>The workbook is generated; refresh to request a new secure download link.</p>}
      </> : <p>The reviewed workbook is being generated. Operations cannot complete this gate until it is available.</p>}
    </section>
    <label className="control-confirmation"><input type="checkbox" checked={confirmed} disabled={!evidenceReady || reviewComplete || !workspace.capabilities.completeOperationsReview} onChange={(event) => setConfirmed(event.target.checked)} /> All pre-signature requirements are satisfied and the evidence package is ready for signature review.</label>
    {conflict ? <p role="alert">The review was not completed. Current state was reloaded; review it before retrying explicitly.</p> : failed ? <p role="alert">The review was not completed. Reload the current state before retrying explicitly.</p> : null}
    {workspace.capabilities.completeOperationsReview ? <button type="button" disabled={!confirmed || pending} onClick={() => void submit()}>{pending ? 'Completing…' : 'Complete Operations review'}</button> : reviewComplete ? <p role="status">Operations review complete.</p> : workspace.caseState === 'operations_review' ? <p role="status">Complete the required evidence and sign in with Operations authority to advance.</p> : <p role="status">Operations review is not active for the current state.</p>}
  </section>;
}
