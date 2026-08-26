import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';

import type { FormValues } from '../../api/contracts';
import type { OspClient } from '../../api/osp-client';

const FormRuntime = lazy(() => import('./FormRuntime').then((module) => ({ default: module.FormRuntime })));

type CaseFormClient = Pick<OspClient, 'getCaseFormWorkspace' | 'saveCaseFormDraft'>;

function hasValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined && value !== false;
}

export function CaseFormWorkspace({ client, caseId }: { client: CaseFormClient; caseId: string }) {
  const query = useQuery({ queryKey: ['case-form-workspace', caseId], queryFn: () => client.getCaseFormWorkspace(caseId), retry: false, refetchOnWindowFocus: false });
  if (query.isPending) return <section className="case-form-page"><p role="status">Loading the controlled case form…</p></section>;
  if (query.isError || !query.data) return <section className="case-form-page"><Link to="/app/cases/$caseId" params={{ caseId }}>← Back to case</Link><p role="alert">The case form is unavailable. Return to the case and retry.</p></section>;
  return <CaseFormEditor key={`${query.data.instance?.id ?? 'new'}:${query.data.instance?.version ?? 0}`} workspace={query.data} onSave={async (values, idempotencyKey) => {
    await client.saveCaseFormDraft({
      idempotencyKey, caseId, templateVersionId: query.data.template?.id ?? '',
      instanceId: query.data.instance?.id ?? null, expectedVersion: query.data.instance?.version ?? 0, values,
    });
    await query.refetch();
  }} />;
}

function CaseFormEditor({ workspace, onSave }: { workspace: Awaited<ReturnType<CaseFormClient['getCaseFormWorkspace']>>; onSave(values: FormValues, idempotencyKey: string): Promise<void> }) {
  const values = useMemo(() => structuredClone(workspace.instance?.values ?? {}), [workspace.instance]);
  const valuesRef = useRef<FormValues>(values);
  const idempotencyKeyRef = useRef(`case-form-save:${crypto.randomUUID()}`);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const requiredFields = useMemo(() => workspace.template?.fields.filter((field) => field.required && !['section', 'instruction', 'derived_readonly', 'signature_position'].includes(field.definition.kind)) ?? [], [workspace.template]);
  const missing = requiredFields.filter((field) => !hasValue(values[field.id]));
  const completed = requiredFields.length - missing.length;
  const progress = requiredFields.length === 0 ? 0 : Math.round(completed / requiredFields.length * 100);
  const initialValues = useMemo(() => structuredClone(workspace.instance?.values ?? {}), [workspace.instance]);
  const save = async () => {
    setSaveFailed(false); setSaving(true);
    try {
      await onSave(valuesRef.current, idempotencyKeyRef.current);
      idempotencyKeyRef.current = `case-form-save:${crypto.randomUUID()}`;
    } catch { setSaveFailed(true); } finally { setSaving(false); }
  };

  return (
    <div className="case-form-page">
      <Link className="back-link" to="/app/cases/$caseId" params={{ caseId: workspace.caseId }}>← Back to case</Link>
      <header className="case-form-hero">
        <div><p className="eyebrow">XBF case form</p><h1>Complete customer setup</h1><p>{workspace.supplierName} · Case {workspace.caseId.slice(0, 8).toUpperCase()}</p></div>
        <span className="form-status draft">{workspace.instance ? `Draft v${workspace.instance.version}` : 'New draft'}</span>
      </header>

      <section className="case-form-progress" aria-label="Form completion">
        <div><p className="eyebrow">Completion</p><strong>{progress}%</strong><span>{completed} of {requiredFields.length} required fields</span></div>
        <div className="progress-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
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
            <Suspense fallback={<p role="status">Loading published form…</p>}><FormRuntime template={workspace.template} initialValues={initialValues} showCompleteButton={false} onChange={(next) => { valuesRef.current = next; }} onComplete={() => undefined} /></Suspense>
          )}
          {saveFailed ? <p role="alert">The draft could not be saved. Reload the current case version and retry.</p> : null}
          <footer><p>Save after reviewing the prefilled facts and required gaps.</p><button type="button" disabled={!workspace.template || !workspace.capabilities.saveDraft || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save draft'}</button></footer>
        </main>

        <aside className="case-form-gates" aria-labelledby="case-form-gates-title">
          <p className="eyebrow">Next gate</p><h2 id="case-form-gates-title">{missing.length === 0 ? 'Ready for evidence review' : `${missing.length} required ${missing.length === 1 ? 'field' : 'fields'} missing`}</h2>
          {missing.length > 0 ? <ul>{missing.map((field) => <li key={field.id}>{field.label}</li>)}</ul> : <p>Save this exact draft before Operations creates the immutable package snapshot.</p>}
          <p className="privacy-note">Private document bytes and extracted evidence remain outside this browser view.</p>
        </aside>
      </div>
    </div>
  );
}
