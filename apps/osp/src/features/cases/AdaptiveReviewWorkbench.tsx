import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import type { CaseDetail, RequestManifestReadModel, RequestManifestReviewReadModel } from '../../api/contracts';

type ProfileWorkspace = CaseDetail['profile_workspace'];
type DecisionOutcome = 'answered' | 'external' | 'not_applicable';
type DecisionSeed = {
  decisionId: string;
  kind: 'clarification' | 'contradiction' | 'missing';
  fieldId: string | null;
  prompt: string;
  evidenceIds: readonly string[];
};
export type RequestDecisionSubmission = { decisionId: string; outcome: DecisionOutcome; resolution: string };

const stageCopy = [
  ['01', 'Understand', 'Read every preserved request source.'],
  ['02', 'Decide', 'Resolve only the material ambiguities.'],
  ['03', 'Complete', 'Map approved XBF facts into the forms.'],
  ['04', 'Prepare', 'Assemble an internal package draft.'],
] as const;

function decisionSeeds(manifest: RequestManifestReadModel): readonly DecisionSeed[] {
  const clarifiedFieldIds = new Set(manifest.clarificationQuestions.map((item) => item.fieldId));
  return [
    ...manifest.clarificationQuestions.map((item, index) => ({ decisionId: `clarification:${index}`, kind: 'clarification' as const, fieldId: item.fieldId, prompt: item.question, evidenceIds: item.evidenceIds })),
    ...manifest.contradictions.map((item, index) => ({ decisionId: `contradiction:${index}`, kind: 'contradiction' as const, fieldId: null, prompt: item.text, evidenceIds: item.evidenceIds })),
    ...manifest.missingInformation.map((item, index) => ({ item, index })).filter(({ item }) => !clarifiedFieldIds.has(item.fieldId)).map(({ item, index }) => ({ decisionId: `missing:${index}`, kind: 'missing' as const, fieldId: item.fieldId, prompt: item.description, evidenceIds: item.evidenceIds })),
  ];
}

function stageState(index: number, reviewResolved: boolean, profile: ProfileWorkspace, openDecisionCount: number) {
  if (index === 0) return 'complete';
  if (index === 1) return reviewResolved ? 'complete' : 'current';
  if (index === 2) return !reviewResolved ? 'locked' : profile.binding ? 'complete' : 'current';
  return profile.draft ? 'complete' : profile.binding && openDecisionCount === 0 ? 'current' : 'locked';
}

function outcomeLabel(outcome: DecisionOutcome) {
  if (outcome === 'answered') return 'Use XBF answer';
  if (outcome === 'external') return 'Ask carrier';
  return 'Not applicable';
}

export function AdaptiveReviewWorkbench({ caseId, manifest, profile, review, saving = false, saveError = false, onSaveReview }: {
  caseId: string;
  manifest: RequestManifestReadModel | null;
  profile: ProfileWorkspace;
  review: RequestManifestReviewReadModel | null;
  saving?: boolean;
  saveError?: boolean;
  onSaveReview?(decisions: readonly RequestDecisionSubmission[]): void | Promise<void>;
}) {
  if (!manifest) return null;

  const seeds = decisionSeeds(manifest);
  const prior = new Map(review?.review?.decisions.map((item) => [item.decisionId, item]));
  const [drafts, setDrafts] = useState<Record<string, RequestDecisionSubmission>>(() => Object.fromEntries(seeds.map((seed) => {
    const existing = prior.get(seed.decisionId);
    return [seed.decisionId, { decisionId: seed.decisionId, outcome: existing?.outcome ?? 'answered', resolution: existing?.resolution ?? '' }];
  })));
  const [confirmed, setConfirmed] = useState(false);
  const reviewResolved = review?.review?.status === 'resolved';
  const externallyBlocked = review?.review?.status === 'needs_external_clarification';
  const canonicalMatchCount = manifest.requestedFields.filter((field) => field.canonicalFieldId !== null).length;
  const requiredDocumentCount = manifest.requestedDocuments.filter((document) => document.required).length;
  const unresolvedEntity = manifest.targetXbfEntity === 'unknown' && profile.binding === null;
  const openDecisionCount = reviewResolved ? 0 : externallyBlocked
    ? review.review?.decisions.filter((item) => item.outcome === 'external').length ?? seeds.length
    : seeds.length;
  const complete = seeds.every((seed) => (drafts[seed.decisionId]?.resolution.trim().length ?? 0) >= 3);
  const update = (decisionId: string, change: Partial<RequestDecisionSubmission>) => {
    setDrafts((current) => ({ ...current, [decisionId]: { ...current[decisionId], ...change } }));
    setConfirmed(false);
  };
  const save = async () => {
    if (!confirmed || !complete || !onSaveReview) return;
    await onSaveReview(seeds.map((seed) => ({ ...drafts[seed.decisionId], resolution: drafts[seed.decisionId].resolution.trim() })));
  };

  return (
    <section className="panel adaptive-workbench" aria-labelledby="adaptive-workbench-title">
      <div className="adaptive-workbench-heading">
        <div>
          <p className="eyebrow">Adaptive review workbench</p>
          <h2 id="adaptive-workbench-title">One session from request to package draft</h2>
          <p>OSP has normalized the request into a controlled decision queue. Sales resolves the exceptions; reviewed XBF facts do the repeatable work.</p>
        </div>
        <span className={reviewResolved ? 'adaptive-status adaptive-status-ready' : 'adaptive-status adaptive-status-review'}>
          {reviewResolved ? 'Decisions resolved' : `${openDecisionCount} open decisions`}
        </span>
      </div>

      <ol className="adaptive-stages" aria-label="Adaptive review progress">
        {stageCopy.map(([number, label, description], index) => {
          const state = stageState(index, reviewResolved, profile, openDecisionCount);
          return <li className={`adaptive-stage adaptive-stage-${state}`} key={number}><span>{state === 'complete' ? '✓' : number}</span><div><strong>{label}</strong><p>{description}</p></div></li>;
        })}
      </ol>

      <dl className="adaptive-scorecard" aria-label="Request readiness scorecard">
        <div><dt>Sources understood</dt><dd>{manifest.sourceCount}</dd><small>{Object.entries(manifest.sourceCoverage).filter(([, count]) => count > 0).map(([format]) => format.toUpperCase()).join(' · ')}</small></div>
        <div><dt>Fields matched</dt><dd>{canonicalMatchCount}/{manifest.requestedFields.length}</dd><small>to the XBF Entity Vault</small></div>
        <div><dt>Required documents</dt><dd>{requiredDocumentCount}</dd><small>{manifest.requestedDocuments.length - requiredDocumentCount} optional</small></div>
        <div><dt>Package draft</dt><dd>{profile.draft ? 'Ready' : 'Pending'}</dd><small>{profile.binding?.entity_code ?? (unresolvedEntity ? 'entity decision needed' : manifest.targetXbfEntity)}</small></div>
      </dl>

      <div className="adaptive-workbench-grid">
        <section className="adaptive-decision-queue" aria-labelledby="adaptive-decisions-title">
          <div className="adaptive-section-heading"><div><p className="eyebrow">Human judgment</p><h3 id="adaptive-decisions-title">Decision queue</h3></div><span>{openDecisionCount}</span></div>
          {reviewResolved ? (
            <ol className="adaptive-reviewed-decisions">
              {review.review?.decisions.map((decision) => <li key={decision.decisionId}>
                <div><span className={`adaptive-decision-kind adaptive-decision-${decision.kind}`}>{decision.kind}</span><strong>{outcomeLabel(decision.outcome)}</strong></div>
                <p>{decision.prompt}</p><blockquote>{decision.resolution}</blockquote>
                <small>{decision.evidenceIds.length} {decision.evidenceIds.length === 1 ? 'source' : 'sources'} · immutable review v{review.review?.reviewVersion}</small>
              </li>)}
            </ol>
          ) : seeds.length > 0 ? (
            <form className="adaptive-decision-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
              {externallyBlocked ? <p className="adaptive-review-note" role="status">Carrier clarification is still required. Replace the external items with verified answers when evidence arrives.</p> : null}
              <ol>
                {seeds.map((decision) => <li key={decision.decisionId}>
                  <div className="adaptive-decision-prompt"><span className={`adaptive-decision-kind adaptive-decision-${decision.kind}`}>{decision.kind}</span><p>{decision.prompt}</p><small>{decision.evidenceIds.length} {decision.evidenceIds.length === 1 ? 'source' : 'sources'}</small></div>
                  <label>Decision<select value={drafts[decision.decisionId]?.outcome ?? 'answered'} onChange={(event) => update(decision.decisionId, { outcome: event.target.value as DecisionOutcome })}><option value="answered">Use XBF answer</option><option value="external">Ask the carrier</option><option value="not_applicable">Not applicable</option></select></label>
                  <label>{drafts[decision.decisionId]?.outcome === 'external' ? 'Question or reason' : 'Reviewed answer or rationale'}<textarea value={drafts[decision.decisionId]?.resolution ?? ''} maxLength={2_000} onChange={(event) => update(decision.decisionId, { resolution: event.target.value })} placeholder="Record the exact reviewed decision and its rationale." /></label>
                </li>)}
              </ol>
              {saveError ? <p className="case-warning" role="alert">The decision review was not saved. Refresh and retry with the current case version.</p> : null}
              <label className="adaptive-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm these decisions are supported by the preserved evidence or reviewed XBF information.</label>
              <button className="adaptive-action adaptive-action-primary" type="submit" disabled={!confirmed || !complete || saving}>{saving ? 'Saving review…' : externallyBlocked ? 'Save revised review' : 'Save decision review'}</button>
            </form>
          ) : (
            <div className="adaptive-empty-review"><p>No material ambiguity was detected.</p><label className="adaptive-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Confirm the manifest can proceed to XBF completion.</label><button className="adaptive-action adaptive-action-primary" type="button" disabled={!confirmed || saving} onClick={() => void save()}>{saving ? 'Saving review…' : 'Confirm manifest review'}</button></div>
          )}
        </section>

        <aside className="adaptive-package-plan" aria-labelledby="adaptive-package-title">
          <div className="adaptive-section-heading"><div><p className="eyebrow">Controlled preparation</p><h3 id="adaptive-package-title">Package plan</h3></div></div>
          <ul>
            <li><span className={reviewResolved ? 'adaptive-check adaptive-check-complete' : 'adaptive-check'}>{reviewResolved ? '✓' : '1'}</span><div><strong>Resolve decisions</strong><p>{reviewResolved ? 'The evidence-bound review is complete.' : 'Complete the decision queue before using XBF facts.'}</p></div></li>
            <li><span className={profile.binding ? 'adaptive-check adaptive-check-complete' : 'adaptive-check'}>{profile.binding ? '✓' : '2'}</span><div><strong>Choose legal entity</strong><p>{profile.binding ? `${profile.binding.entity_code} is bound to this case.` : 'Confirm XBFMX or XBFUS against the request.'}</p></div></li>
            <li><span className={profile.draft ? 'adaptive-check adaptive-check-complete' : 'adaptive-check'}>{profile.draft ? '✓' : '3'}</span><div><strong>Assemble internal draft</strong><p>Preserve the source layout; signature and delivery remain locked.</p></div></li>
          </ul>
          <div className="adaptive-actions">
            <a className={reviewResolved ? 'adaptive-action' : 'adaptive-action adaptive-action-disabled'} aria-disabled={!reviewResolved} href={reviewResolved ? '#case-profile-assembler' : undefined}>Choose XBF entity</a>
            <Link className={profile.draft ? 'adaptive-action' : 'adaptive-action adaptive-action-disabled'} aria-disabled={!profile.draft} to="/app/cases/$caseId/form" params={{ caseId }}>Open form workspace</Link>
          </div>
        </aside>
      </div>

      <footer className="adaptive-effects-lock"><span aria-hidden="true">◆</span><div><strong>Human-approved mode</strong><p>No signature, email, webhook or external disclosure is executed from this workbench.</p></div></footer>
    </section>
  );
}
