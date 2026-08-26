import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import type { OspCaseReadClient } from '../../api/osp-client';
import { caseNextGates, caseStateLabels, caseStateTone, formatCaseDate } from './case-presenter';

export function CaseWorkspace({ client, caseId }: { client: OspCaseReadClient; caseId: string }) {
  const query = useQuery({
    queryKey: ['osp', 'case', caseId],
    queryFn: () => client.getCustomerRegistrationCase(caseId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (query.isPending || query.fetchStatus !== 'idle') {
    return <section className="case-workspace"><p role="status">Loading case workspace…</p></section>;
  }
  if (query.isError || !query.data) {
    return <section className="case-workspace"><Link to="/app/pipeline">← Back to pipeline</Link><p role="alert">This case is unavailable. Return to the pipeline and retry.</p></section>;
  }

  const caseRecord = query.data;
  const latest = caseRecord.latest_request;
  return (
    <div className="case-workspace">
      <Link className="back-link" to="/app/pipeline">← Back to pipeline</Link>
      <header className="case-hero">
        <div>
          <p className="eyebrow">Customer setup case</p>
          <h1>{caseRecord.supplier_name}</h1>
          <p className="case-reference">Case {caseRecord.case_id.slice(0, 8).toUpperCase()} · version {caseRecord.aggregate_version}</p>
        </div>
        <span className={`case-state case-state-${caseStateTone(caseRecord.state)}`}>{caseStateLabels[caseRecord.state]}</span>
      </header>

      {caseRecord.blocked_by_duplicate_review ? <p className="case-warning" role="alert">Duplicate review is blocking this case.</p> : null}

      <section className="next-gate" aria-labelledby="next-gate-title">
        <p className="eyebrow">Next gate</p>
        <h2 id="next-gate-title">{caseStateLabels[caseRecord.state]}</h2>
        <p>{caseNextGates[caseRecord.state]}</p>
        <Link className="case-primary-action" to="/app/cases/$caseId/form" params={{ caseId }}>Open XBF case form</Link>
      </section>

      <dl className="case-metrics" aria-label="Case evidence counts">
        <div><dt>Messages</dt><dd>{caseRecord.message_count}</dd></div>
        <div><dt>Attachments</dt><dd>{caseRecord.attachment_count}</dd></div>
        <div><dt>Documents</dt><dd>{caseRecord.document_count}</dd></div>
        <div><dt>Last updated</dt><dd>{formatCaseDate(caseRecord.updated_at)}</dd></div>
      </dl>

      <div className="case-detail-grid">
        <section className="panel" aria-labelledby="request-title">
          <div className="panel-heading"><h2 id="request-title">Latest request</h2><span className="read-only-badge">Read only</span></div>
          {latest.subject ? (
            <dl className="request-details">
              <div><dt>Subject</dt><dd>{latest.subject}</dd></div>
              <div><dt>Sender domain</dt><dd>{latest.sender_domain}</dd></div>
              <div><dt>Received</dt><dd>{latest.received_at ? formatCaseDate(latest.received_at) : '—'}</dd></div>
            </dl>
          ) : <p>No preserved request metadata is available yet.</p>}
          <p className="privacy-note">Message bodies and private files stay outside this summary.</p>
        </section>

        <section className="panel" aria-labelledby="activity-title">
          <div className="panel-heading"><h2 id="activity-title">Activity</h2><span className="read-only-badge">Audit</span></div>
          {caseRecord.recent_events.length === 0 ? <p>No lifecycle events are available yet.</p> : (
            <ol className="case-timeline">
              {caseRecord.recent_events.map((event) => (
                <li key={event.sequence}>
                  <span className={`timeline-dot case-state-${caseStateTone(event.state)}`} aria-hidden="true" />
                  <div><strong>{caseStateLabels[event.state]}</strong><p>{event.reason_code.replaceAll('_', ' ')} · {formatCaseDate(event.occurred_at)}</p></div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
