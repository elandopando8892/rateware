import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';

import type { FormValues } from '../../api/contracts';
import type { OspClient } from '../../api/osp-client';
import { assessFormCompletion } from './form-completion';

const FormRuntime = lazy(() => import('./FormRuntime').then((module) => ({ default: module.FormRuntime })));

type CaseFormClient = Pick<OspClient, 'getCaseFormWorkspace' | 'saveCaseFormDraft' | 'submitCaseFormForReview'>;

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
  }} onSubmit={async (values, idempotencyKey) => {
    await client.submitCaseFormForReview({
      idempotencyKey, caseId, expectedCaseVersion: query.data.caseVersion, templateVersionId: query.data.template?.id ?? '',
      instanceId: query.data.instance?.id ?? null, expectedVersion: query.data.instance?.version ?? 0, values,
    });
    await navigate({ to: '/app/cases/$caseId/review', params: { caseId } });
  }} />;
}

function CaseFormEditor({ workspace, onSave, onSubmit }: { workspace: Awaited<ReturnType<CaseFormClient['getCaseFormWorkspace']>>; onSave(values: FormValues, idempotencyKey: string): Promise<void>; onSubmit(values: FormValues, idempotencyKey: string): Promise<void> }) {
  const initialValues = useMemo(() => structuredClone(workspace.instance?.values ?? {}), [workspace.instance]);
  const [values, setValues] = useState<FormValues>(initialValues);
  const idempotencyKeyRef = useRef(`case-form-save:${crypto.randomUUID()}`);
  const submitKeyRef = useRef(`case-form-submit:${crypto.randomUUID()}`);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);
  const completion = useMemo(() => workspace.template ? assessFormCompletion(workspace.template, values) : { required: 0, completed: 0, progress: 0, issues: [], ready: false }, [workspace.template, values]);
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
          <footer><p>Save freely while working. Submission atomically preserves the exact values and evidence snapshot.</p><div className="case-form-actions"><button type="button" className="secondary" disabled={!workspace.template || !workspace.capabilities.saveDraft || saving || submitting} onClick={() => void save()}>{saving ? 'Saving…' : 'Save draft'}</button><button type="button" disabled={!workspace.template || !workspace.capabilities.submitForReview || !completion.ready || saving || submitting} onClick={() => void submit()}>{submitting ? 'Submitting…' : 'Submit for Operations review'}</button></div></footer>
        </main>

        <aside className="case-form-gates" aria-labelledby="case-form-gates-title">
          <p className="eyebrow">Next gate</p><h2 id="case-form-gates-title">{!workspace.template ? 'Published template required' : completion.ready ? 'Ready to submit' : `${completion.issues.length} ${completion.issues.length === 1 ? 'field needs' : 'fields need'} attention`}</h2>
          {!workspace.template ? <p>Create and publish the controlled XBF template before completing this case.</p> : completion.issues.length > 0 ? <ul>{completion.issues.map((issue) => <li key={issue.fieldId}>{issue.label} · {issue.code}</li>)}</ul> : <p>Submission saves this exact form and creates the immutable Operations evidence snapshot in one controlled transaction.</p>}
          {workspace.template && !workspace.capabilities.submitForReview ? <p className="privacy-note">The case must be in Preparing state with Operations authority before submission is enabled.</p> : null}
          <p className="privacy-note">Private document bytes and extracted evidence remain outside this browser view.</p>
        </aside>
      </div>
    </div>
  );
}
