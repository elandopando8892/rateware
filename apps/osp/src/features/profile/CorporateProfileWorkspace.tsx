import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { CorporateProfileEntity } from '../../api/contracts';
import type { OspCorporateProfileClient } from '../../api/osp-client';

type Readiness = 'verified' | 'review_required' | 'withheld';
type SupportFilter = 'all' | CorporateProfileEntity['fields'][number]['support_status'];

const sectionDefinitions = [
  { title: 'Legal identity', codes: ['tax_identifier', 'entity_identifier', 'entity_type', 'tax_regime', 'mc_number', 'usdot_number'] },
  { title: 'Registered presence', codes: ['registered_address', 'commercial_address', 'business_start_year', 'address_tenure_years'] },
  { title: 'Management and billing', codes: ['legal_representative', 'general_manager', 'accounts_payable_contact', 'billing_email', 'business_phone', 'website', 'principal_names'] },
  { title: 'Credit and bank reference', codes: ['requested_credit_amount', 'payment_terms', 'billing_instructions', 'bank_name', 'bank_address', 'bank_officer_reference', 'trade_references', 'affiliated_company'] },
  { title: 'Execution', codes: ['signer_name', 'signer_title', 'effective_date'] },
] as const;

const statusLabel: Record<Readiness, string> = {
  verified: 'Verified',
  review_required: 'Review required',
  withheld: 'Withheld',
};

const supportLabel: Record<Exclude<SupportFilter, 'all'>, string> = {
  verified_match: 'Document matched',
  conflict: 'Conflict detected',
  evidence_available: 'Evidence available',
  unsupported: 'No evidence mapped',
};

function fieldStatus(entity: CorporateProfileEntity, code: string): Readiness {
  const field = entity.fields.find((candidate) => candidate.code === code);
  if (!field) return 'review_required';
  if (field.display_value === 'Withheld' || field.sensitivity === 'highly_restricted') return 'withheld';
  return field.verification_status === 'verified' ? 'verified' : 'review_required';
}

function evidenceStatus(evidence: CorporateProfileEntity['evidence'][number]): Readiness {
  if (evidence.release_policy === 'never_release' || evidence.sensitivity === 'highly_restricted') return 'withheld';
  return evidence.verification_status === 'verified' ? 'verified' : 'review_required';
}

function readiness(entity: CorporateProfileEntity): number {
  const total = Number(entity.total_fields);
  return total === 0 ? 0 : Math.round((Number(entity.verified_fields) / total) * 100);
}

export function CorporateProfileWorkspace({ client }: { client: OspCorporateProfileClient }) {
  const query = useQuery({
    queryKey: ['osp', 'corporate-profile'],
    queryFn: () => client.getCorporateProfile(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [selectedId, setSelectedId] = useState<string>('');
  const [supportFilter, setSupportFilter] = useState<SupportFilter>('all');
  const [selectedReview, setSelectedReview] = useState<{ fieldCode: string; reviewId: string } | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [lastOutcome, setLastOutcome] = useState('');
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<unknown>) => await operation(),
    onSuccess: async () => { setLastOutcome('Review action stored in the audit ledger. No profile facts were promoted.'); await query.refetch(); },
  });

  if (query.isPending || query.fetchStatus !== 'idle') {
    return <section className="workflow-page"><h1>Corporate profile</h1><p role="status">Loading the governed XBF profile…</p></section>;
  }
  if (query.isError || !query.data || query.data.entities.length === 0) {
    return <section className="workflow-page"><h1>Corporate profile</h1><p role="alert">The corporate profile is unavailable. Reload and retry.</p></section>;
  }

  const entities = query.data.entities;
  const entity = entities.find((candidate) => candidate.entity_id === selectedId) ?? entities[0];
  const totalFacts = entities.reduce((sum, candidate) => sum + Number(candidate.total_fields), 0);
  const verifiedFacts = entities.reduce((sum, candidate) => sum + Number(candidate.verified_fields), 0);
  const evidenceCount = entities.reduce((sum, candidate) => sum + candidate.evidence.length, 0);
  const releasableEvidence = entity.evidence.filter((item) => evidenceStatus(item) === 'verified').length;
  const mappedCodes = new Set<string>(sectionDefinitions.flatMap((section) => [...section.codes]));
  const sections: Array<{ title: string; fields: CorporateProfileEntity['fields'][number][] }> = sectionDefinitions.map((section) => ({
    title: section.title,
    fields: section.codes.flatMap((code) => {
      const field = entity.fields.find((candidate) => candidate.code === code);
      return field ? [field] : [];
    }),
  })).filter((section) => section.fields.length > 0);
  const otherFields = entity.fields.filter((field) => !mappedCodes.has(field.code));
  if (otherFields.length > 0) sections.push({ title: 'Other verified facts', fields: [...otherFields] });
  const supportCounts = entity.fields.reduce<Record<Exclude<SupportFilter, 'all'>, number>>((counts, field) => {
    counts[field.support_status] += 1;
    return counts;
  }, { verified_match: 0, conflict: 0, evidence_available: 0, unsupported: 0 });
  const visibleReviewFields = supportFilter === 'all' ? entity.fields : entity.fields.filter((field) => field.support_status === supportFilter);
  const selectedField = selectedReview ? entity.fields.find((field) => field.code === selectedReview.fieldCode) : undefined;
  const selectedCandidate = selectedField?.review_candidates.find((candidate) => candidate.review_id === selectedReview?.reviewId);
  const noteReady = decisionNote.trim() === decisionNote && decisionNote.length >= 3;
  const restrictedDecision = selectedField ? ['restricted', 'highly_restricted'].includes(selectedField.sensitivity) : false;

  return <div className="corporate-profile-page">
    <header className="profile-hero">
      <div>
        <p className="eyebrow">Reusable XBF source of truth</p>
        <h1>Corporate profile</h1>
        <p className="lede">Select the legal entity requested by a provider, then assemble only verified facts and approved evidence. Nothing is sent from this workspace.</p>
      </div>
      <div className="profile-hero-score" aria-label="Combined corporate readiness">
        <strong>{totalFacts === 0 ? 0 : Math.round((verifiedFacts / totalFacts) * 100)}%</strong><span>combined readiness</span><small>{verifiedFacts} verified facts · {evidenceCount} controlled items</small>
      </div>
    </header>

    <section className="entity-switcher" aria-label="XBF legal entities">
      {entities.map((item) => <button key={item.entity_id} type="button" className={item.entity_id === entity.entity_id ? 'entity-option entity-option-active' : 'entity-option'} aria-pressed={item.entity_id === entity.entity_id} onClick={() => setSelectedId(item.entity_id)}>
        <span>{item.country_code === 'MX' ? 'Mexico entity' : item.country_code === 'US' ? 'United States entity' : `${item.country_code} entity`}</span>
        <strong>{item.legal_name}</strong><small>{item.country_code} · {item.default_currency ?? 'No currency'}</small>
        <b>{readiness(item)}% ready</b>
      </button>)}
    </section>

    <div className="profile-workspace-grid">
      <main className="profile-main">
        <section className="profile-summary panel" aria-labelledby="entity-profile-title">
          <div className="panel-heading">
            <div><p className="eyebrow">{entity.entity_code}</p><h2 id="entity-profile-title">{entity.legal_name}</h2><p>{entity.country_code} · {entity.default_currency ?? 'Currency not set'} · {entity.status}</p></div>
            <div className="entity-readiness"><strong>{readiness(entity)}%</strong><span>{entity.verified_fields}/{entity.total_fields} facts verified</span></div>
          </div>
          <div className="readiness-track" aria-hidden="true"><span style={{ width: `${readiness(entity)}%` }} /></div>
        </section>

        <section className="profile-review-queue panel" aria-labelledby="profile-review-title">
          <div className="panel-heading">
            <div><p className="eyebrow">Sprint 6 · documentary validation</p><h2 id="profile-review-title">Verification queue</h2><p>Compare each reusable fact with the governed evidence already in the vault. Values remain masked when their sensitivity requires it.</p></div>
            <span className="read-only-badge">Controlled review</span>
          </div>
          <div className="verification-scorecards" aria-label="Document verification status">
            <button type="button" className={supportFilter === 'verified_match' ? 'verification-scorecard verification-scorecard-active' : 'verification-scorecard'} onClick={() => setSupportFilter('verified_match')}><strong>{supportCounts.verified_match}</strong><span>Matched</span></button>
            <button type="button" className={supportFilter === 'evidence_available' ? 'verification-scorecard verification-scorecard-active' : 'verification-scorecard'} onClick={() => setSupportFilter('evidence_available')}><strong>{supportCounts.evidence_available}</strong><span>Evidence ready</span></button>
            <button type="button" className={supportFilter === 'conflict' ? 'verification-scorecard verification-scorecard-active' : 'verification-scorecard'} onClick={() => setSupportFilter('conflict')}><strong>{supportCounts.conflict}</strong><span>Conflicts</span></button>
            <button type="button" className={supportFilter === 'unsupported' ? 'verification-scorecard verification-scorecard-active' : 'verification-scorecard'} onClick={() => setSupportFilter('unsupported')}><strong>{supportCounts.unsupported}</strong><span>Unsupported</span></button>
          </div>
          <div className="verification-filter-row">
            <p>{visibleReviewFields.length} of {entity.fields.length} facts shown</p>
            {supportFilter !== 'all' ? <button type="button" className="text-button" onClick={() => setSupportFilter('all')}>Show all facts</button> : null}
          </div>
          <ul className="verification-list">
            {visibleReviewFields.map((field) => <li key={field.code}>
              <div className="verification-field-copy"><strong>{field.label}</strong><span>{field.display_value}</span><small>{field.code.replaceAll('_', ' ')}</small></div>
              <div className="verification-evidence-count"><strong>{field.reviewed_candidate_count}/{field.evidence_candidate_count}</strong><span>reviewed / found</span></div>
              <span className={`support-status support-status-${field.support_status}`}>{supportLabel[field.support_status]}</span>
              {field.review_candidates.length > 0 ? <button type="button" className="review-evidence-button" onClick={() => { setSelectedReview({ fieldCode: field.code, reviewId: field.review_candidates[0].review_id }); setDecisionNote(''); setLastOutcome(''); }}>Review evidence</button> : null}
            </li>)}
          </ul>
          {selectedCandidate && selectedField ? <section className="profile-decision-panel" aria-labelledby="profile-decision-title">
            <div className="panel-heading"><div><p className="eyebrow">Human checkpoint</p><h3 id="profile-decision-title">Review {selectedField.label}</h3></div><button type="button" className="text-button" onClick={() => setSelectedReview(null)}>Close</button></div>
            <dl className="profile-decision-evidence">
              <div><dt>Evidence</dt><dd>{selectedCandidate.evidence_label}</dd></div>
              <div><dt>Proposed value</dt><dd>{selectedCandidate.proposed_display_value}</dd></div>
              <div><dt>Progress</dt><dd>{Number(selectedCandidate.total_field_count) - Number(selectedCandidate.pending_field_count)}/{selectedCandidate.total_field_count} fields decided</dd></div>
            </dl>
            {selectedCandidate.ownership === 'locked' ? <p role="status" className="review-lock-message">Another reviewer owns this evidence review. Reload after they finish.</p> : null}
            {selectedCandidate.ownership === 'available' ? <button type="button" className="primary-action" disabled={mutation.isPending} onClick={() => mutation.mutate(() => client.claimProfileReview({ reviewId: selectedCandidate.review_id, expectedRevision: selectedCandidate.review_revision }))}>Start review</button> : null}
            {selectedCandidate.ownership === 'owned' ? <>
              <label className="decision-note-field">Decision note<textarea value={decisionNote} maxLength={1000} onChange={(event) => setDecisionNote(event.target.value)} placeholder="State what the evidence proves or why it is rejected." /></label>
              {selectedCandidate.field_status === 'pending' ? <div className="decision-actions">
                {restrictedDecision ? <button type="button" disabled={!noteReady || mutation.isPending} onClick={() => mutation.mutate(() => client.decideProfileReviewField({ reviewId: selectedCandidate.review_id, fieldId: selectedCandidate.review_field_id, expectedRevision: selectedCandidate.review_revision, decision: 'withheld', decisionNote, reviewerValue: null }))}>Withhold restricted value</button> : <button type="button" className="primary-action" disabled={!noteReady || mutation.isPending} onClick={() => mutation.mutate(() => client.decideProfileReviewField({ reviewId: selectedCandidate.review_id, fieldId: selectedCandidate.review_field_id, expectedRevision: selectedCandidate.review_revision, decision: 'accepted', decisionNote, reviewerValue: null }))}>Accept evidence</button>}
                <button type="button" className="danger-action" disabled={!noteReady || mutation.isPending} onClick={() => mutation.mutate(() => client.decideProfileReviewField({ reviewId: selectedCandidate.review_id, fieldId: selectedCandidate.review_field_id, expectedRevision: selectedCandidate.review_revision, decision: 'rejected', decisionNote, reviewerValue: null }))}>Reject evidence</button>
              </div> : null}
              {selectedCandidate.field_status !== 'pending' && selectedCandidate.pending_field_count === '0' ? <div className="decision-actions">
                <button type="button" className="primary-action" disabled={!noteReady || mutation.isPending || selectedCandidate.field_status === 'rejected'} onClick={() => mutation.mutate(() => client.finalizeProfileReview({ reviewId: selectedCandidate.review_id, expectedRevision: selectedCandidate.review_revision, decision: 'approved', decisionNote }))}>Approve completed review</button>
                <button type="button" disabled={!noteReady || mutation.isPending} onClick={() => mutation.mutate(() => client.finalizeProfileReview({ reviewId: selectedCandidate.review_id, expectedRevision: selectedCandidate.review_revision, decision: 'changes_required', decisionNote }))}>Request changes</button>
              </div> : null}
            </> : null}
            {mutation.isError ? <p role="alert">The review changed or could not be stored. Reload and try again.</p> : null}
          </section> : null}
          {lastOutcome ? <p className="review-outcome" role="status">{lastOutcome}</p> : null}
          <div className="effects-lock" role="note"><span aria-hidden="true">✓</span><div><strong>Promotion remains a separate gate</strong><p>Review decisions are auditable, but they do not promote, release or send any corporate fact.</p></div></div>
        </section>

        {sections.map((section) => <section className="profile-section panel" key={section.title} aria-labelledby={`section-${section.title.replaceAll(' ', '-').toLowerCase()}`}>
          <div className="panel-heading"><h2 id={`section-${section.title.replaceAll(' ', '-').toLowerCase()}`}>{section.title}</h2><span className="read-only-badge">Private vault</span></div>
          <dl className="profile-field-grid">
            {section.fields.map((field) => {
              const status = fieldStatus(entity, field.code);
              return <div className="profile-field" key={field.code}>
                <dt>{field.label}</dt><dd>{field.display_value}</dd>
                <span className={`profile-status profile-status-${status}`}>{statusLabel[status]}</span>
                <small>{field.sensitivity.replace('_', ' ')}</small>
              </div>;
            })}
          </dl>
        </section>)}
      </main>

      <aside className="profile-side" aria-label="Provider-ready package">
        <section className="panel package-readiness">
          <p className="eyebrow">Provider-ready package</p><h2>{releasableEvidence}/{entity.evidence.length} evidence items ready</h2>
          <p>OSP can map verified fields immediately. Restricted documents remain withheld until their exact recipient and purpose are approved.</p>
          <ol>
            <li className="package-step-complete"><span>1</span><div><strong>Entity selected</strong><small>{entity.entity_code}</small></div></li>
            <li className="package-step-complete"><span>2</span><div><strong>Facts mapped</strong><small>{entity.verified_fields} verified</small></div></li>
            <li><span>3</span><div><strong>Evidence approval</strong><small>{entity.evidence.length - releasableEvidence} controlled item(s)</small></div></li>
            <li><span>4</span><div><strong>Provider form</strong><small>Generated only after review</small></div></li>
          </ol>
        </section>
        <section className="panel evidence-panel">
          <div className="panel-heading"><h2>Evidence vault</h2><span>Metadata only</span></div>
          {entity.evidence.length === 0 ? <p role="status">No governed evidence is registered for this entity yet.</p> : <ul>
            {entity.evidence.map((item) => {
              const status = evidenceStatus(item);
              return <li key={`${item.document_type}:${item.name}`}>
                <div><strong>{item.name}</strong><small>{item.document_type.replaceAll('_', ' ')} · {item.release_policy.replaceAll('_', ' ')}</small></div>
                <span className={`profile-status profile-status-${status}`}>{statusLabel[status]}</span>
              </li>;
            })}
          </ul>}
        </section>
        <div className="effects-lock" role="note"><span aria-hidden="true">🔒</span><div><strong>Disclosure remains locked</strong><p>Banking, signatures and identity evidence require a named recipient, release purpose and human approval.</p></div></div>
      </aside>
    </div>
  </div>;
}
