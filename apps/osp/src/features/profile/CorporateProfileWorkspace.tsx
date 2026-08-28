import { useState } from 'react';

type Readiness = 'verified' | 'review_required' | 'withheld';

type ProfileField = {
  label: string;
  value: string;
  status: Readiness;
  sensitivity?: 'internal' | 'confidential' | 'restricted';
};

type ProfileSection = { title: string; fields: readonly ProfileField[] };
type EvidenceItem = { name: string; kind: string; status: Readiness; policy: string };

type LegalEntityProfile = {
  id: 'mx' | 'us';
  eyebrow: string;
  legalName: string;
  jurisdiction: string;
  entityType: string;
  readiness: number;
  verifiedFacts: number;
  totalFacts: number;
  sections: readonly ProfileSection[];
  evidence: readonly EvidenceItem[];
};

const entities: readonly LegalEntityProfile[] = [
  {
    id: 'mx',
    eyebrow: 'Mexico entity',
    legalName: 'XBF Demo Logistics, S. de R.L. de C.V.',
    jurisdiction: 'Querétaro · Mexico',
    entityType: 'Limited liability company',
    readiness: 88,
    verifiedFacts: 7,
    totalFacts: 8,
    sections: [
      { title: 'Legal identity', fields: [
        { label: 'Legal name', value: 'Verified corporate name', status: 'verified', sensitivity: 'internal' },
        { label: 'Tax identifier', value: '••••••••••••', status: 'verified', sensitivity: 'restricted' },
        { label: 'Tax regime', value: 'General corporate regime', status: 'verified', sensitivity: 'confidential' },
        { label: 'Legal representative', value: 'Verified principal', status: 'verified', sensitivity: 'restricted' },
      ] },
      { title: 'Registered presence', fields: [
        { label: 'Registered address', value: 'Querétaro, Querétaro · 76000', status: 'verified', sensitivity: 'confidential' },
        { label: 'Mobile contact', value: '+52 •• •••• ••••', status: 'review_required', sensitivity: 'restricted' },
        { label: 'Fixed phone', value: 'Not applicable', status: 'verified', sensitivity: 'internal' },
        { label: 'Fax', value: 'Not applicable', status: 'verified', sensitivity: 'internal' },
      ] },
    ],
    evidence: [
      { name: 'Tax status certificate', kind: 'Fiscal', status: 'verified', policy: 'Approval required' },
      { name: 'Proof of address', kind: 'Corporate', status: 'verified', policy: 'Approval required' },
      { name: 'Legal representative authority', kind: 'Identity', status: 'review_required', policy: 'Explicit approval' },
    ],
  },
  {
    id: 'us',
    eyebrow: 'United States entity',
    legalName: 'XBF Demo Freight Systems LLC',
    jurisdiction: 'Texas · United States',
    entityType: 'Multi-member LLC partnership',
    readiness: 82,
    verifiedFacts: 18,
    totalFacts: 22,
    sections: [
      { title: 'Legal and operating identity', fields: [
        { label: 'Federal tax ID', value: '••-•••••••', status: 'verified', sensitivity: 'restricted' },
        { label: 'State entity ID', value: '•••••••••', status: 'verified', sensitivity: 'confidential' },
        { label: 'MC authority', value: 'MC •••••••', status: 'verified', sensitivity: 'internal' },
        { label: 'USDOT', value: '•••••••', status: 'verified', sensitivity: 'internal' },
        { label: 'Registered address', value: 'Austin, Texas · 78701', status: 'verified', sensitivity: 'confidential' },
        { label: 'Commercial address', value: 'San Antonio, Texas · 78205', status: 'verified', sensitivity: 'confidential' },
      ] },
      { title: 'Management and billing', fields: [
        { label: 'General manager', value: 'Verified principal', status: 'verified', sensitivity: 'restricted' },
        { label: 'Accounts payable', value: 'Verified finance contact', status: 'verified', sensitivity: 'restricted' },
        { label: 'Billing mailbox', value: 'finance@example.test', status: 'verified', sensitivity: 'restricted' },
        { label: 'Website', value: 'xbf.example', status: 'verified', sensitivity: 'internal' },
        { label: 'Years in business', value: 'Established 2022', status: 'verified', sensitivity: 'internal' },
        { label: 'Years at address', value: '2 years', status: 'review_required', sensitivity: 'internal' },
      ] },
      { title: 'Credit and bank reference', fields: [
        { label: 'Credit requested', value: '$25,000 USD', status: 'review_required', sensitivity: 'confidential' },
        { label: 'Payment terms', value: 'Net 15', status: 'review_required', sensitivity: 'confidential' },
        { label: 'Bank reference', value: 'Demo regional bank', status: 'withheld', sensitivity: 'restricted' },
        { label: 'Trade references', value: '2 references preserved', status: 'review_required', sensitivity: 'restricted' },
      ] },
    ],
    evidence: [
      { name: 'W-9', kind: 'Tax', status: 'review_required', policy: 'Approval required' },
      { name: 'Broker authority', kind: 'Operating authority', status: 'verified', policy: 'Approval required' },
      { name: 'Surety bond', kind: 'Insurance', status: 'verified', policy: 'Approval required' },
      { name: 'Signature specimen', kind: 'Signature', status: 'withheld', policy: 'Purpose-specific approval' },
      { name: 'Bank reference', kind: 'Banking', status: 'withheld', policy: 'Explicit approval' },
    ],
  },
] as const;

const statusLabel: Record<Readiness, string> = {
  verified: 'Verified',
  review_required: 'Review required',
  withheld: 'Withheld',
};

export function CorporateProfileWorkspace() {
  const [selectedId, setSelectedId] = useState<LegalEntityProfile['id']>('mx');
  const entity = entities.find((item) => item.id === selectedId) ?? entities[0];
  const releasableEvidence = entity.evidence.filter((item) => item.status === 'verified').length;

  return <div className="corporate-profile-page">
    <header className="profile-hero">
      <div>
        <p className="eyebrow">Reusable XBF source of truth</p>
        <h1>Corporate profile</h1>
        <p className="lede">Select the legal entity requested by a provider, then assemble only verified facts and approved evidence. Nothing is sent from this workspace.</p>
      </div>
      <div className="profile-hero-score" aria-label="Combined corporate readiness">
        <strong>85%</strong><span>combined readiness</span><small>25 verified facts · 7 controlled items</small>
      </div>
    </header>

    <section className="entity-switcher" aria-label="XBF legal entities">
      {entities.map((item) => <button key={item.id} type="button" className={item.id === entity.id ? 'entity-option entity-option-active' : 'entity-option'} aria-pressed={item.id === entity.id} onClick={() => setSelectedId(item.id)}>
        <span>{item.eyebrow}</span><strong>{item.legalName}</strong><small>{item.jurisdiction}</small>
        <b>{item.readiness}% ready</b>
      </button>)}
    </section>

    <div className="profile-workspace-grid">
      <main className="profile-main">
        <section className="profile-summary panel" aria-labelledby="entity-profile-title">
          <div className="panel-heading">
            <div><p className="eyebrow">{entity.eyebrow}</p><h2 id="entity-profile-title">{entity.legalName}</h2><p>{entity.entityType} · {entity.jurisdiction}</p></div>
            <div className="entity-readiness"><strong>{entity.readiness}%</strong><span>{entity.verifiedFacts}/{entity.totalFacts} facts verified</span></div>
          </div>
          <div className="readiness-track" aria-hidden="true"><span style={{ width: `${entity.readiness}%` }} /></div>
        </section>

        {entity.sections.map((section) => <section className="profile-section panel" key={section.title} aria-labelledby={`section-${section.title.replaceAll(' ', '-').toLowerCase()}`}>
          <div className="panel-heading"><h2 id={`section-${section.title.replaceAll(' ', '-').toLowerCase()}`}>{section.title}</h2><span className="read-only-badge">Private vault</span></div>
          <dl className="profile-field-grid">
            {section.fields.map((field) => <div className="profile-field" key={field.label}>
              <dt>{field.label}</dt><dd>{field.value}</dd>
              <span className={`profile-status profile-status-${field.status}`}>{statusLabel[field.status]}</span>
              {field.sensitivity ? <small>{field.sensitivity.replace('_', ' ')}</small> : null}
            </div>)}
          </dl>
        </section>)}
      </main>

      <aside className="profile-side" aria-label="Provider-ready package">
        <section className="panel package-readiness">
          <p className="eyebrow">Provider-ready package</p><h2>{releasableEvidence}/{entity.evidence.length} evidence items ready</h2>
          <p>OSP can map verified fields immediately. Restricted documents remain withheld until their exact recipient and purpose are approved.</p>
          <ol>
            <li className="package-step-complete"><span>1</span><div><strong>Entity selected</strong><small>{entity.jurisdiction}</small></div></li>
            <li className="package-step-complete"><span>2</span><div><strong>Facts mapped</strong><small>{entity.verifiedFacts} verified</small></div></li>
            <li><span>3</span><div><strong>Evidence approval</strong><small>{entity.evidence.length - releasableEvidence} controlled item(s)</small></div></li>
            <li><span>4</span><div><strong>Provider form</strong><small>Generated only after review</small></div></li>
          </ol>
        </section>
        <section className="panel evidence-panel">
          <div className="panel-heading"><h2>Evidence vault</h2><span>Metadata only</span></div>
          <ul>
            {entity.evidence.map((item) => <li key={item.name}>
              <div><strong>{item.name}</strong><small>{item.kind} · {item.policy}</small></div>
              <span className={`profile-status profile-status-${item.status}`}>{statusLabel[item.status]}</span>
            </li>)}
          </ul>
        </section>
        <div className="effects-lock" role="note"><span aria-hidden="true">🔒</span><div><strong>Disclosure remains locked</strong><p>Banking, signatures and identity evidence require a named recipient, release purpose and human approval.</p></div></div>
      </aside>
    </div>
  </div>;
}
