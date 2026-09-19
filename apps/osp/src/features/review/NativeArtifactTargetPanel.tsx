import { useMemo, useRef, useState } from 'react';

import type { ApprovalCommunicationsWorkspace, NativeArtifactTarget } from '../../api/contracts';
import type { NativeArtifactTargetsInput } from '../../api/workflow-client';
import './native-artifact-targets.css';

type Review = NonNullable<ApprovalCommunicationsWorkspace['nativeArtifactTargets']>[number];
type Draft = Record<string, NativeArtifactTarget | null>;

const stateLabel: Record<Review['state'], string> = {
  ready: 'Ready to confirm', missing: 'Placement missing', ambiguous: 'Conflicting placement',
  stale: 'Out of date', persisted: 'Saved · preparing new package',
};

function initialDraft(review: Review): Draft {
  return Object.fromEntries(review.fields.map(field => [field.canonicalFieldId, field.target]));
}

function targetIsComplete(target: NativeArtifactTarget | null): target is NativeArtifactTarget {
  if (!target) return false;
  if (target.kind === 'acroform') return target.fieldName.trim().length > 0;
  if (target.kind === 'content_control') return /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(target.targetTag);
  return true;
}

export function NativeArtifactTargetPanel({ caseId, caseState, review, onSave, blocked = false }: {
  caseId: string;
  caseState: ApprovalCommunicationsWorkspace['caseState'];
  review: Review;
  onSave(input: NativeArtifactTargetsInput): Promise<void>;
  blocked?: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(review));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const idempotencyKey = useRef(`native-targets:${crypto.randomUUID()}`);
  const targets = useMemo(() => review.fields.map(field => draft[field.canonicalFieldId]).filter(targetIsComplete), [draft, review.fields]);
  const complete = targets.length === review.requiredFieldCount;
  const editable = !blocked && caseState === 'operations_review' && !['ambiguous', 'stale', 'persisted'].includes(review.state);
  const setTarget = (canonicalFieldId: string, target: NativeArtifactTarget | null) => {
    setDraft(current => ({ ...current, [canonicalFieldId]: target }));
    setConfirmed(false);
  };
  const submit = async () => {
    if (!complete || !confirmed || !editable) return;
    const input: NativeArtifactTargetsInput = {
      caseId, mappingId: review.mappingId, expectedMappingVersion: review.mappingVersion,
      expectedMappingSha256: review.mappingSha256, expectedSourceVersionId: review.sourceVersionId,
      expectedSourceSha256: review.sourceSha256, idempotencyKey: idempotencyKey.current,
      targets,
    };
    setBusy(true); setFailed(false);
    try { await onSave(input); } catch { setFailed(true); } finally { setBusy(false); }
  };
  return <section className="native-target-review" aria-labelledby={`native-target-${review.sourceVersionId}`}>
    <div className="native-target-heading">
      <div><p className="eyebrow">ORIGINAL PLACEMENT</p><h3 id={`native-target-${review.sourceVersionId}`}>{review.contentType === 'application/pdf' ? 'PDF form' : 'DOCX form'}</h3></div>
      <span className={`native-target-state native-target-state-${review.state}`}>{stateLabel[review.state]}</span>
    </div>
    <p>Match each prepared answer to a native field in the carrier's original. This does not sign or send anything.</p>
    <dl className="native-target-identity">
      <div><dt>Source</dt><dd><code>{review.sourceSha256.slice(0, 12)}</code></dd></div>
      <div><dt>Mapping</dt><dd>v{review.mappingVersion} · <code>{review.mappingSha256.slice(0, 12)}</code></dd></div>
      <div><dt>Coverage</dt><dd>{targets.length} of {review.requiredFieldCount} · {Math.floor(targets.length * 100 / review.requiredFieldCount)}%</dd></div>
    </dl>
    {review.sourceDownloadUrl ? <a className="button-link" href={review.sourceDownloadUrl} target="_blank" rel="noreferrer">Open preserved original</a> : <p role="status">The original preview is unavailable. Refresh before confirming placement.</p>}
    {review.state === 'ambiguous' ? <p className="case-warning" role="alert">More than one reviewed mapping matches this original. Resolve the conflict before editing.</p> : null}
    {review.state === 'stale' ? <p className="case-warning" role="alert">The source, review, or mapping changed. Reload the current Operations package.</p> : null}
    {blocked ? <p className="case-warning" role="alert">Review the current request requirements before recording native destinations.</p> : null}
    <fieldset disabled={!editable || busy} className="native-target-fields">
      <legend>Native destinations</legend>
      {review.fields.map(field => {
        const target = draft[field.canonicalFieldId];
        return <div className="native-target-field" key={field.canonicalFieldId}>
          <div><strong>{field.label}</strong><small>{field.canonicalFieldId}</small></div>
           {review.contentType === 'application/pdf' ? <>
            {target?.kind === 'overlay' ? <p className="native-target-placement">Reviewed placement retained on page {target.page}. To avoid fabricated or altered coordinates, this screen only permits confirming the persisted placement.</p> : <label>Destination type<select value={target?.kind ?? ''} onChange={event => {
               const kind = event.target.value;
               if (kind === 'acroform') setTarget(field.canonicalFieldId, { kind, canonicalFieldId: field.canonicalFieldId, fieldName: '' });
               else setTarget(field.canonicalFieldId, null);
             }}>
               <option value="">Not assigned</option><option value="acroform">PDF form field</option>
             </select></label>}
             {target?.kind === 'acroform' ? <label>Field name in PDF<input value={target.fieldName} onChange={event => setTarget(field.canonicalFieldId, { ...target, fieldName: event.target.value })} /></label> : null}
           </> : <label>Content control tag<input value={target?.kind === 'content_control' ? target.targetTag : ''} onChange={event => setTarget(field.canonicalFieldId, event.target.value ? { kind: 'content_control', canonicalFieldId: field.canonicalFieldId, targetTag: event.target.value } : null)} /></label>}
        </div>;
      })}
    </fieldset>
    <label className="control-confirmation"><input type="checkbox" checked={confirmed} disabled={!editable || !complete || !review.sourceDownloadUrl || busy} onChange={event => setConfirmed(event.target.checked)} /> I compared every destination with the preserved original and confirm 100% coverage.</label>
    {!complete ? <p role="status">Every prepared field needs one native destination. Appendices do not count.</p> : null}
    {failed ? <p role="alert">Save was not confirmed. The current version was reloaded; review it before retrying.</p> : null}
    {review.state === 'persisted' ? <p role="status">Mapping v{review.mappingVersion} is saved. The case is preparing a new package from these exact destinations.</p> : <button type="button" disabled={!editable || !complete || !confirmed || !review.sourceDownloadUrl || busy} onClick={() => void submit()}>{busy ? 'Saving reviewed destinations…' : 'Save reviewed destinations'}</button>}
  </section>;
}
