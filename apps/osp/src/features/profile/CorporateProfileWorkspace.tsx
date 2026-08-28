import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { CorporateProfileEntity } from '../../api/contracts';
import type { OspCorporateProfileClient } from '../../api/osp-client';

type Readiness = 'verified' | 'review_required' | 'withheld';

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
