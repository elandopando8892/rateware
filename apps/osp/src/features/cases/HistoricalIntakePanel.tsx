import type { CaseDetail } from '../../api/contracts';

type HistoricalIntake = NonNullable<CaseDetail['historical_intake']>;

export function HistoricalIntakePanel({ intake }: { intake: HistoricalIntake | null }) {
  if (!intake) return null;
  return (
    <section className="panel historical-intake" aria-labelledby="historical-intake-title">
      <div className="panel-heading historical-intake-heading">
        <div>
          <p className="eyebrow">Historical source recovery</p>
          <h2 id="historical-intake-title">Bounded Gmail preflight</h2>
          <p>The existing intake can locate an older request before any message is persisted or processed.</p>
        </div>
        <span className="read-only-badge">{intake.status === 'preview_only' ? 'Preview only' : 'Imported'}</span>
      </div>
      <dl className="historical-intake-metrics" aria-label="Historical intake preflight">
        <div><dt>Search window</dt><dd>{intake.after_date} → {intake.before_date}</dd></div>
        <div><dt>Candidates</dt><dd>{intake.candidate_count}</dd></div>
        <div><dt>Replay status</dt><dd>{intake.duplicate_state === 'already_imported' ? 'Already captured' : 'Ready to import'}</dd></div>
      </dl>
      <div className="historical-intake-query"><span>Exact Gmail query</span><code>{intake.query}</code></div>
      <ul className="historical-intake-guards" aria-label="Historical intake safety controls">
        <li><span aria-hidden="true">✓</span><strong>Source preserved</strong><small>Original email and attachment remain unchanged.</small></li>
        <li><span aria-hidden="true">✓</span><strong>Checkpoint unchanged</strong><small>Normal automatic intake does not lose its position.</small></li>
        <li><span aria-hidden="true">✓</span><strong>No external effects</strong><small>No reply, signature, webhook or provider write.</small></li>
      </ul>
    </section>
  );
}
