import type { RequestManifestReadModel } from '../../api/contracts';

const REQUEST_TYPE_LABELS: Record<RequestManifestReadModel['requestType'], string> = {
  customer_setup: 'Customer setup',
  credit_application: 'Credit application',
  compliance_update: 'Compliance update',
  unknown: 'Needs classification',
};

const READINESS_LABELS: Record<RequestManifestReadModel['readiness']['status'], string> = {
  ready_for_prefill: 'Ready to prefill',
  needs_clarification: 'Clarification required',
  unsupported: 'Manual handling required',
};

const HUMAN_DATE = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

function EvidenceCount({ ids }: { ids: readonly string[] }) {
  return <span className="manifest-evidence">{ids.length} {ids.length === 1 ? 'source' : 'sources'}</span>;
}

export function RequestManifestPanel({ manifest }: { manifest: RequestManifestReadModel | null }) {
  if (!manifest) {
    return (
      <section className="panel request-manifest request-manifest-empty" aria-labelledby="request-manifest-title">
        <div className="panel-heading">
          <div><p className="eyebrow">AI request manifest</p><h2 id="request-manifest-title">Request interpretation pending</h2></div>
          <span className="manual-mode-badge">No analysis</span>
        </div>
        <p>OSP has preserved the request, but no governed case-level interpretation is available yet.</p>
      </section>
    );
  }

  const unresolved = manifest.missingInformation.length + manifest.contradictions.length;
  const readinessTone = manifest.readiness.status === 'ready_for_prefill' ? 'ready' : manifest.readiness.status === 'needs_clarification' ? 'warning' : 'blocked';
  return (
    <section className="panel request-manifest" aria-labelledby="request-manifest-title">
      <div className="panel-heading request-manifest-heading">
        <div>
          <p className="eyebrow">AI request manifest · human review required</p>
          <h2 id="request-manifest-title">What this carrier is asking XBF to complete</h2>
          <p>One governed interpretation across the email and its PDF, XLSX and DOCX evidence.</p>
        </div>
        <span className="manifest-status">{manifest.status.replaceAll('_', ' ')}</span>
      </div>

      <dl className="manifest-summary" aria-label="Request manifest summary">
        <div><dt>Request</dt><dd>{REQUEST_TYPE_LABELS[manifest.requestType]}</dd></div>
        <div><dt>XBF entity</dt><dd>{manifest.targetXbfEntity === 'unknown' ? 'Not resolved' : manifest.targetXbfEntity}</dd></div>
        <div><dt>Deadline</dt><dd>{manifest.dueDate ? HUMAN_DATE.format(new Date(`${manifest.dueDate}T00:00:00.000Z`)) : 'Not stated'}</dd></div>
        <div><dt>Evidence</dt><dd>{manifest.sourceCount} sources</dd></div>
      </dl>

      <div className={`manifest-readiness manifest-readiness-${readinessTone}`} role="status">
        <div><span className="manifest-readiness-dot" aria-hidden="true" /><strong>{READINESS_LABELS[manifest.readiness.status]}</strong></div>
        <p>{unresolved === 0 ? 'No blockers were detected in the preserved evidence.' : `${unresolved} evidence issue${unresolved === 1 ? '' : 's'} must be resolved before signature or delivery.`}</p>
      </div>

      <div className="manifest-columns">
        <div className="manifest-stack">
          <section aria-labelledby="manifest-forms-title">
            <div className="manifest-section-heading"><h3 id="manifest-forms-title">Forms to process</h3><span>{manifest.forms.length}</span></div>
            {manifest.forms.length === 0 ? <p className="manifest-empty-copy">No form was explicitly requested.</p> : (
              <ul className="manifest-list">
                {manifest.forms.map((form) => <li key={`${form.name}:${form.action}`}>
                  <div><strong>{form.name}</strong><p>{form.action} · {form.format.toUpperCase()}</p></div>
                  <div className="manifest-list-meta"><span className={form.required ? 'manifest-required' : 'manifest-optional'}>{form.required ? 'Required' : 'Optional'}</span><EvidenceCount ids={form.evidenceIds} /></div>
                </li>)}
              </ul>
            )}
          </section>

          <section aria-labelledby="manifest-documents-title">
            <div className="manifest-section-heading"><h3 id="manifest-documents-title">Documents requested</h3><span>{manifest.requestedDocuments.length}</span></div>
            <ul className="manifest-list manifest-document-list">
              {manifest.requestedDocuments.map((document) => <li key={document.documentType}>
                <div><strong>{document.documentType}</strong>{document.acceptableAlternatives.length > 0 ? <p>Alternative: {document.acceptableAlternatives.join(', ')}</p> : null}</div>
                <div className="manifest-list-meta"><span className={document.required ? 'manifest-required' : 'manifest-optional'}>{document.required ? 'Required' : 'Optional'}</span><EvidenceCount ids={document.evidenceIds} /></div>
              </li>)}
            </ul>
          </section>
        </div>

        <section className="manifest-fields" aria-labelledby="manifest-fields-title">
          <div className="manifest-section-heading"><h3 id="manifest-fields-title">Fields identified</h3><span>{manifest.requestedFields.length}</span></div>
          <div className="manifest-field-table" role="table" aria-label="Requested fields">
            <div className="manifest-field-row manifest-field-header" role="row"><span role="columnheader">Carrier label</span><span role="columnheader">XBF match</span><span role="columnheader">Evidence</span></div>
            {manifest.requestedFields.map((field) => <div className="manifest-field-row" role="row" key={field.id}>
              <span role="cell"><strong>{field.sourceLabel}</strong><small>{field.required ? 'Required' : 'Optional'} · {field.valueType}</small></span>
              <span role="cell">{field.canonicalFieldId ? <code>{field.canonicalFieldId}</code> : <em>Needs mapping</em>}</span>
              <span role="cell"><EvidenceCount ids={field.evidenceIds} /></span>
            </div>)}
          </div>
        </section>
      </div>

      {(manifest.clarificationQuestions.length > 0 || manifest.contradictions.length > 0) ? (
        <section className="manifest-blockers" aria-labelledby="manifest-blockers-title">
          <div>
            <p className="eyebrow">Operations checkpoint</p>
            <h3 id="manifest-blockers-title">Resolve before package assembly</h3>
          </div>
          <ul>
            {manifest.contradictions.map((item) => <li key={item.text}><strong>Contradiction</strong><span>{item.text}</span><EvidenceCount ids={item.evidenceIds} /></li>)}
            {manifest.clarificationQuestions.map((item) => <li key={`${item.fieldId}:${item.question}`}><strong>Clarification</strong><span>{item.question}</span><EvidenceCount ids={item.evidenceIds} /></li>)}
          </ul>
        </section>
      ) : null}

      <footer className="manifest-guardrail">
        <span>Model {manifest.modelVersion}</span>
        <strong>AI proposes. Operations confirms. No external effects.</strong>
      </footer>
    </section>
  );
}
