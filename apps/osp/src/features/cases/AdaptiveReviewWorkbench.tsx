import { Link } from '@tanstack/react-router';

import type { CaseDetail, RequestManifestReadModel } from '../../api/contracts';

type ProfileWorkspace = CaseDetail['profile_workspace'];

const stageCopy = [
  ['01', 'Understand', 'Read every preserved request source.'],
  ['02', 'Decide', 'Resolve only the material ambiguities.'],
  ['03', 'Complete', 'Map approved XBF facts into the forms.'],
  ['04', 'Prepare', 'Assemble an internal package draft.'],
] as const;

function stageState(index: number, manifest: RequestManifestReadModel, profile: ProfileWorkspace, openDecisionCount: number) {
  if (index === 0) return 'complete';
  if (index === 1) return openDecisionCount > 0 ? 'current' : 'complete';
  if (index === 2) return openDecisionCount > 0 ? 'locked' : profile.binding ? 'complete' : 'current';
  return profile.draft ? 'complete' : profile.binding ? 'current' : 'locked';
}

export function AdaptiveReviewWorkbench({ caseId, manifest, profile }: {
  caseId: string;
  manifest: RequestManifestReadModel | null;
  profile: ProfileWorkspace;
}) {
  if (!manifest) return null;

  const canonicalMatchCount = manifest.requestedFields.filter((field) => field.canonicalFieldId !== null).length;
  const requiredDocumentCount = manifest.requestedDocuments.filter((document) => document.required).length;
  const unresolvedEntity = manifest.targetXbfEntity === 'unknown' && profile.binding === null;
  const clarifiedFieldIds = new Set(manifest.clarificationQuestions.map((item) => item.fieldId));
  const decisions = [
    ...manifest.clarificationQuestions.map((item) => ({ kind: 'Clarify', text: item.question, evidence: item.evidenceIds.length })),
    ...manifest.contradictions.map((item) => ({ kind: 'Conflict', text: item.text, evidence: item.evidenceIds.length })),
    ...manifest.missingInformation.filter((item) => !clarifiedFieldIds.has(item.fieldId)).map((item) => ({ kind: 'Missing', text: item.description, evidence: item.evidenceIds.length })),
  ];
  const openDecisionCount = decisions.length;
  const decisionPreview = decisions.slice(0, 4);

  return (
    <section className="panel adaptive-workbench" aria-labelledby="adaptive-workbench-title">
      <div className="adaptive-workbench-heading">
        <div>
          <p className="eyebrow">Adaptive review workbench</p>
          <h2 id="adaptive-workbench-title">One session from request to package draft</h2>
          <p>OSP has normalized the PDF, DOCX and email into a controlled decision queue. Sales confirms the exceptions; the reusable XBF facts do the rest.</p>
        </div>
        <span className={openDecisionCount > 0 ? 'adaptive-status adaptive-status-review' : 'adaptive-status adaptive-status-ready'}>
          {openDecisionCount > 0 ? `${openDecisionCount} open decisions` : 'Ready to complete'}
        </span>
      </div>

      <ol className="adaptive-stages" aria-label="Adaptive review progress">
        {stageCopy.map(([number, label, description], index) => {
          const state = stageState(index, manifest, profile, openDecisionCount);
          return (
            <li className={`adaptive-stage adaptive-stage-${state}`} key={number}>
              <span>{state === 'complete' ? '✓' : number}</span>
              <div><strong>{label}</strong><p>{description}</p></div>
            </li>
          );
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
          {decisionPreview.length > 0 ? (
            <ul>
              {decisionPreview.map((decision, index) => (
                <li key={`${decision.kind}-${index}`}>
                  <span className={`adaptive-decision-kind adaptive-decision-${decision.kind.toLowerCase()}`}>{decision.kind}</span>
                  <p>{decision.text}</p>
                  <small>{decision.evidence} {decision.evidence === 1 ? 'source' : 'sources'}</small>
                </li>
              ))}
            </ul>
          ) : <p className="adaptive-ready-copy">No material ambiguity remains. The request can move to controlled completion.</p>}
          <Link className="adaptive-action adaptive-action-primary" to="/app/clarifications">Review decisions</Link>
        </section>

        <aside className="adaptive-package-plan" aria-labelledby="adaptive-package-title">
          <div className="adaptive-section-heading"><div><p className="eyebrow">Controlled preparation</p><h3 id="adaptive-package-title">Package plan</h3></div></div>
          <ul>
            <li><span className={profile.binding ? 'adaptive-check adaptive-check-complete' : 'adaptive-check'}>{profile.binding ? '✓' : '1'}</span><div><strong>Choose legal entity</strong><p>{profile.binding ? `${profile.binding.entity_code} is bound to this case.` : 'Confirm XBFMX or XBFUS against the request.'}</p></div></li>
            <li><span className={canonicalMatchCount > 0 ? 'adaptive-check adaptive-check-complete' : 'adaptive-check'}>{canonicalMatchCount > 0 ? '✓' : '2'}</span><div><strong>Reuse reviewed facts</strong><p>{canonicalMatchCount} requested fields already map to canonical XBF data.</p></div></li>
            <li><span className={profile.draft ? 'adaptive-check adaptive-check-complete' : 'adaptive-check'}>{profile.draft ? '✓' : '3'}</span><div><strong>Assemble internal draft</strong><p>Preserve the source layout; signature and delivery remain locked.</p></div></li>
          </ul>
          <div className="adaptive-actions">
            <a className="adaptive-action" href="#case-profile-assembler">Choose XBF entity</a>
            <Link className="adaptive-action" to="/app/cases/$caseId/form" params={{ caseId }}>Open form workspace</Link>
          </div>
        </aside>
      </div>

      <footer className="adaptive-effects-lock">
        <span aria-hidden="true">◆</span>
        <div><strong>Human-approved mode</strong><p>No signature, email, webhook or external disclosure is executed from this workbench.</p></div>
      </footer>
    </section>
  );
}
