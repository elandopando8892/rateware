import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import type { CaseFormWorkspace as CaseFormWorkspaceModel, FormValues } from '../../api/contracts';
import type { OspClient } from '../../api/osp-client';
import { assessFormCompletion } from './form-completion';

const FormRuntime = lazy(() => import('./FormRuntime').then((module) => ({ default: module.FormRuntime })));

type CaseFormClient = Pick<OspClient, 'getCaseFormWorkspace' | 'saveCaseFormDraft' | 'acceptCaseFormMapping' | 'submitCaseFormForReview'>;

export function CaseFormWorkspace({ client, caseId }: { client: CaseFormClient; caseId: string }) {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['case-form-workspace', caseId], queryFn: () => client.getCaseFormWorkspace(caseId), retry: false, refetchOnWindowFocus: false });
  if (query.isPending) return <section className="case-form-page"><p role="status">Loading the controlled case form…</p></section>;
  if (query.isError || !query.data) return <section className="case-form-page"><Link to="/app/cases/$caseId" params={{ caseId }}>← Back to case</Link><p role="alert">The case form is unavailable. Return to the case and retry.</p></section>;
  return <CaseFormEditor key={`${query.data.instance?.id ?? 'new'}:${query.data.instance?.version ?? 0}`} workspace={query.data} onSave={async (values, idempotencyKey) => {
    await client.saveCaseFormDraft({
      idempotencyKey, caseId, templateVersionId: query.data.template?.id ?? '',
      instanceId: query.data.instance?.id ?? null, expectedVersion: query.data.instance?.version ?? 0, values,
    });
    await query.refetch();
  }} onAcceptMapping={async (mappingId, expectedMappingVersion, expectedAfterSha256, idempotencyKey) => {
    await client.acceptCaseFormMapping({ idempotencyKey, caseId, mappingId, expectedMappingVersion, expectedAfterSha256 });
    await query.refetch();
  }} onSubmit={async (values, idempotencyKey) => {
    await client.submitCaseFormForReview({
      idempotencyKey, caseId, expectedCaseVersion: query.data.caseVersion, templateVersionId: query.data.template?.id ?? '',
      instanceId: query.data.instance?.id ?? null, expectedVersion: query.data.instance?.version ?? 0, values,
    });
    await navigate({ to: '/app/cases/$caseId/review', params: { caseId } });
  }} />;
}

function CaseFormEditor({ workspace, onSave, onAcceptMapping, onSubmit }: { workspace: Awaited<ReturnType<CaseFormClient['getCaseFormWorkspace']>>; onSave(values: FormValues, idempotencyKey: string): Promise<void>; onAcceptMapping(mappingId: string, expectedMappingVersion: number, expectedAfterSha256: string, idempotencyKey: string): Promise<void>; onSubmit(values: FormValues, idempotencyKey: string): Promise<void> }) {
  const initialValues = useMemo(() => structuredClone(workspace.instance?.values ?? {}), [workspace.instance]);
  const [values, setValues] = useState<FormValues>(initialValues);
  const mapping = workspace.mappings.find((item) => item.status === 'unresolved') ?? workspace.mappings[0] ?? null;
  const idempotencyKeyRef = useRef(`case-form-save:${crypto.randomUUID()}`);
  const mappingKeyRef = useRef(`case-mapping-accept:${crypto.randomUUID()}`);
  const submitKeyRef = useRef(`case-form-submit:${crypto.randomUUID()}`);
  const [saving, setSaving] = useState(false);
  const [acceptingMapping, setAcceptingMapping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [mappingFailed, setMappingFailed] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const completion = useMemo(() => workspace.template ? assessFormCompletion(workspace.template, values) : { required: 0, completed: 0, progress: 0, issues: [], ready: false }, [workspace.template, values]);
  const draftChanged = JSON.stringify(values) !== JSON.stringify(initialValues);
  const mappingResolved = workspace.mappings.length > 0 && workspace.mappings.every((item) => item.status === 'accepted' || item.status === 'corrected');
  useEffect(() => { setMappingConfirmed(false); setMappingFailed(false); }, [mapping?.id, mapping?.status, mapping?.version]);
  const save = async () => {
    setSaveFailed(false); setSaving(true);
    try {
      await onSave(values, idempotencyKeyRef.current);
      idempotencyKeyRef.current = `case-form-save:${crypto.randomUUID()}`;
    } catch { setSaveFailed(true); } finally { setSaving(false); }
  };
  const submit = async () => {
    setSubmitFailed(false); setSubmitting(true);
    try {
      await onSubmit(values, submitKeyRef.current);
      submitKeyRef.current = `case-form-submit:${crypto.randomUUID()}`;
    } catch { setSubmitFailed(true); } finally { setSubmitting(false); }
  };
  const acceptMapping = async () => {
    if (!mapping) return;
    setMappingFailed(false); setAcceptingMapping(true);
    try {
      await onAcceptMapping(mapping.id, mapping.version, mapping.afterSha256, mappingKeyRef.current);
      mappingKeyRef.current = `case-mapping-accept:${crypto.randomUUID()}`;
    } catch { setMappingFailed(true); } finally { setAcceptingMapping(false); }
  };

  return (
    <div className="case-form-page">
      <Link className="back-link" to="/app/cases/$caseId" params={{ caseId: workspace.caseId }}>← Back to case</Link>
      <header className="case-form-hero">
        <div><p className="eyebrow">XBF case form</p><h1>Complete customer setup</h1><p>{workspace.supplierName} · Case {workspace.caseId.slice(0, 8).toUpperCase()}</p></div>
        <span className="form-status draft">{workspace.instance ? `Draft v${workspace.instance.version}` : 'New draft'}</span>
      </header>

      <section className="case-form-progress" aria-label="Form completion">
        <div><p className="eyebrow">Completion</p><strong>{completion.progress}%</strong><span>{completion.completed} of {completion.required} required fields</span></div>
        <div className="progress-track" aria-hidden="true"><span style={{ width: `${completion.progress}%` }} /></div>
        <p>{workspace.instance ? `Last saved ${new Date(workspace.instance.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' })}` : 'Not saved yet'}</p>
      </section>

      <AutomaticPrefillReview
        workspace={workspace}
        mapping={mapping}
        confirmed={mappingConfirmed}
        draftChanged={draftChanged}
        pending={acceptingMapping}
        failed={mappingFailed}
        onConfirmed={setMappingConfirmed}
        onAccept={() => void acceptMapping()}
      />

      <div className="case-form-layout">
        <aside className="case-form-rail" aria-label="Case form stages">
          <ol>
            <li className="done"><span>1</span><div><strong>Request received</strong><small>Case and source documents preserved</small></div></li>
            <li className="current"><span>2</span><div><strong>Complete XBF form</strong><small>Review prefilled facts and fill gaps</small></div></li>
            <li><span>3</span><div><strong>Operations review</strong><small>Unlocks after evidence is complete</small></div></li>
            <li><span>4</span><div><strong>Authorization</strong><small>Exact payload remains separately gated</small></div></li>
          </ol>
        </aside>

        <main className="case-form-card">
          <header><div><p className="eyebrow">Published template</p><h2>{workspace.templateName ?? 'No published template'}</h2></div>{workspace.template ? <span>Version {workspace.template.version}</span> : null}</header>
          {!workspace.template ? <p role="status">Publish a controlled XBF template before completing this case.</p> : (
            <Suspense fallback={<p role="status">Loading published form…</p>}><FormRuntime template={workspace.template} initialValues={initialValues} showCompleteButton={false} onChange={setValues} onComplete={() => undefined} /></Suspense>
          )}
          {saveFailed ? <p role="alert">The draft could not be saved. Reload the current case version and retry.</p> : null}
          {submitFailed ? <p role="alert">The form was not submitted. Required evidence or the current case version may have changed; reload before retrying.</p> : null}
          <footer><p>Save freely while working. Submission atomically preserves the exact values and evidence snapshot.</p><div className="case-form-actions"><button type="button" className="secondary" disabled={!workspace.template || !workspace.capabilities.saveDraft || saving || acceptingMapping || submitting} onClick={() => void save()}>{saving ? 'Saving…' : 'Save draft'}</button><button type="button" disabled={!workspace.template || !workspace.capabilities.submitForReview || !completion.ready || saving || acceptingMapping || submitting} onClick={() => void submit()}>{submitting ? 'Submitting…' : 'Submit for Operations review'}</button></div></footer>
        </main>

        <aside className="case-form-gates" aria-labelledby="case-form-gates-title">
          <p className="eyebrow">Next gate</p><h2 id="case-form-gates-title">{!workspace.template ? 'Published template required' : !completion.ready ? `${completion.issues.length} ${completion.issues.length === 1 ? 'field needs' : 'fields need'} attention` : !mappingResolved ? 'Prefill review required' : !workspace.evidenceReady ? 'Evidence review required' : 'Ready to submit'}</h2>
          {!workspace.template ? <p>Create and publish the controlled XBF template before completing this case.</p> : completion.issues.length > 0 ? <ul>{completion.issues.map((issue) => <li key={issue.fieldId}>{issue.label} · {issue.code}</li>)}</ul> : !workspace.evidenceReady && mappingResolved ? <p>The prefill is accepted. Source documents and protected extracted fields must also have recorded Operations decisions.</p> : <p>Submission saves this exact form and creates the immutable Operations evidence snapshot in one controlled transaction.</p>}
          {workspace.template && !mappingResolved ? <p className="privacy-note">Operations must accept every automatic prefill before submission is enabled.</p> : workspace.template && mappingResolved && !workspace.evidenceReady ? <p className="privacy-note">OSP keeps submission disabled until the database confirms every evidence gate.</p> : workspace.template && !workspace.capabilities.submitForReview ? <p className="privacy-note">The case must be in Preparing state with Operations authority before submission is enabled.</p> : null}
          <p className="privacy-note">Private document bytes and extracted evidence remain outside this browser view.</p>
        </aside>
      </div>
    </div>
  );
}

const sourceLabels = Object.freeze({ existing_draft: 'Existing draft', rateware: 'Rateware', attachment: 'Attachment', missing: 'Missing' });

function reviewValue(value: string | number | boolean | null): string {
  if (value === null) return 'No value';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function AutomaticPrefillReview({ workspace, mapping, confirmed, draftChanged, pending, failed, onConfirmed, onAccept }: {
  workspace: CaseFormWorkspaceModel;
  mapping: CaseFormWorkspaceModel['mappings'][number] | null;
  confirmed: boolean;
  draftChanged: boolean;
  pending: boolean;
  failed: boolean;
  onConfirmed(value: boolean): void;
  onAccept(): void;
}) {
  const labels = new Map(workspace.template?.fields.map((field) => [field.id, field.label]) ?? []);
  const accepted = mapping?.status === 'accepted' || mapping?.status === 'corrected';
  const prepared = mapping?.automaticStatus === 'ready_for_operations_review' && mapping.fields.length > 0 && mapping.fields.every((field) => field.status === 'prepared' && field.evidenceCount > 0);
  const evidenceReviewable = Boolean(mapping && ['review_required', 'approved'].includes(mapping.evidence.sourceDocumentStatus) && ['review_required', 'reviewed'].includes(mapping.evidence.extractionStatus) && mapping.evidence.invalidFieldCount === 0 && mapping.evidence.protectedFields.every((field) => field.evidenceCount > 0));
  const canAccept = Boolean(mapping && workspace.capabilities.acceptMapping && prepared && evidenceReviewable && mapping.matchesCurrentDraft && !draftChanged);
  return <section className={`automatic-prefill-review${accepted ? ' accepted' : ''}`} aria-labelledby="automatic-prefill-title">
    <header>
      <div><p className="eyebrow">Human control · zero external effects</p><h2 id="automatic-prefill-title">Automatic prefill review</h2><p>Confirm what OSP prepared from Rateware and the preserved source evidence.</p></div>
      <span className={`form-status ${accepted ? 'published' : 'draft'}`}>{accepted ? 'Accepted' : mapping ? 'Awaiting review' : 'Not prepared'}</span>
    </header>
    {!mapping ? <p role="status">Automatic preparation has not produced a reviewable prefill for this case.</p> : <>
      <dl className="automatic-prefill-metrics">
        <div><dt>Prepared fields</dt><dd>{mapping.fields.filter((field) => field.status === 'prepared').length}/{mapping.fields.length}</dd></div>
        <div><dt>Source</dt><dd>Req. v{mapping.evidence.sourceDocumentVersion}</dd></div>
        <div><dt>Extracted fields</dt><dd>{mapping.evidence.totalFieldCount}</dd></div>
        <div><dt>Fingerprint</dt><dd><code>{mapping.afterSha256.slice(0, 12)}</code></dd></div>
      </dl>
      <ul className="automatic-prefill-fields">
        {mapping.fields.map((field) => <li key={field.fieldId}><span><strong>{labels.get(field.fieldId) ?? field.fieldId}</strong><small>{sourceLabels[field.source]} · {field.evidenceCount} evidence {field.evidenceCount === 1 ? 'link' : 'links'}</small></span><span className={`mapping-field-status ${field.status}`}>{field.status}</span></li>)}
      </ul>
      <section className="protected-evidence" aria-labelledby="protected-evidence-title">
        <header><div><h3 id="protected-evidence-title">Protected evidence</h3><p>Fiscal, banking, low-confidence, and contradictory values require an explicit Operations decision.</p></div><span className={`form-status ${mapping.evidence.extractionStatus === 'reviewed' ? 'published' : 'draft'}`}>{mapping.evidence.extractionStatus === 'reviewed' ? 'Reviewed' : 'Review required'}</span></header>
        {mapping.evidence.invalidFieldCount > 0 ? <p role="alert">{mapping.evidence.invalidFieldCount} invalid extracted {mapping.evidence.invalidFieldCount === 1 ? 'field blocks' : 'fields block'} acceptance.</p> : mapping.evidence.protectedFields.length === 0 ? <p className="privacy-note">No protected extracted fields require an individual decision for this source.</p> : <ul>
          {mapping.evidence.protectedFields.map((field) => <li key={field.id}><span><code>{field.fieldKey}</code><strong>{reviewValue(field.value)}</strong><small>{Math.round(field.confidence * 100)}% confidence · {field.evidenceCount} evidence {field.evidenceCount === 1 ? 'link' : 'links'}</small></span><span className={`mapping-field-status ${field.validation}`}>{field.reviewed ? 'reviewed' : field.validation.replace('_', ' ')}</span></li>)}
        </ul>}
        <p className="evidence-fingerprint">Source document <code>{mapping.evidence.sourceDocumentVersionId.slice(0, 8)}</code> · extraction <code>{mapping.evidence.extractionId.slice(0, 8)}</code> · source fingerprint <code>{mapping.evidence.sourceDocumentFingerprint.slice(0, 12)}</code></p>
      </section>
      {accepted ? <p className="mapping-review-result" role="status">Operations accepted the source document, protected extracted fields, and this exact prefill. All decisions are preserved for the package snapshot.</p> : <div className="mapping-review-control">
        {!prepared ? <p role="status">Missing or contradictory prefill fields must be resolved before this evidence can be accepted.</p> : !evidenceReviewable ? <p role="alert">The source extraction contains invalid or incomplete evidence and cannot be accepted.</p> : !mapping.matchesCurrentDraft ? <p role="alert">The saved draft no longer matches this automatic prefill. A correction review is required.</p> : draftChanged ? <p role="status">Unsaved edits differ from the prefill. Revert them to accept it unchanged, or save them for the correction workflow.</p> : null}
        <label className="control-confirmation"><input type="checkbox" checked={confirmed} disabled={!canAccept || pending} onChange={(event) => onConfirmed(event.target.checked)} /> I reviewed the source document, every protected extracted value, and every prefilled field shown above.</label>
        {failed ? <p role="alert">The prefill was not accepted. The case, draft, or fingerprint changed; reload and review the current version.</p> : null}
        <button type="button" disabled={!canAccept || !confirmed || pending} onClick={onAccept}>{pending ? 'Recording review…' : 'Accept evidence and prefill'}</button>
      </div>}
    </>}
  </section>;
}
