import type { OspReadClient } from '../../api/osp-client';
import { deriveMailboxHealth, type MailboxHealth } from './pipeline-health';
import { usePipelineOverview } from './use-pipeline-overview';

const metrics = [
  ['requests_total', 'Requests total'],
  ['documents_pending', 'Documents pending'],
  ['under_review', 'Under review'],
  ['ready_for_approval', 'Ready for approval'],
] as const;

const healthLabels: Record<MailboxHealth, string> = {
  unknown: 'Unknown',
  disconnected: 'Disconnected',
  connected: 'Connected',
  watching: 'Watching',
  degraded: 'Degraded',
};

export function PipelineOverview({ client }: { client: OspReadClient }) {
  const { pipeline, gmail } = usePipelineOverview(client);
  const health = gmail.data ? deriveMailboxHealth(gmail.data) : 'unknown';
  const pipelineActivity = pipeline.fetchStatus === 'paused'
    ? ['Pipeline loading paused', 'Pipeline loading paused.']
    : pipeline.isFetched
      ? ['Revalidating pipeline', 'Revalidating pipeline…']
      : ['Loading pipeline', 'Loading pipeline…'];
  const gmailActivity = gmail.fetchStatus === 'paused'
    ? ['Gmail health loading paused', 'Gmail health loading paused.']
    : gmail.isFetched
      ? ['Revalidating Gmail health', 'Revalidating Gmail health…']
      : ['Loading Gmail health', 'Loading Gmail health…'];
  return (
    <div className="pipeline-page">
      <header className="page-heading">
        <p className="eyebrow">Customer onboarding</p>
        <h1>Onboarding pipeline</h1>
        <p>Read-only status for provider setup requests and mailbox intake.</p>
      </header>

      <section className="panel" aria-labelledby="pipeline-title">
        <div className="panel-heading">
          <h2 id="pipeline-title">Pipeline</h2>
          <span className="read-only-badge">Read only</span>
        </div>
        {!pipeline.data && !pipeline.isError ? <p role="status" aria-label={pipelineActivity[0]}>{pipelineActivity[1]}</p> : null}
        {pipeline.isError ? <p role="alert" aria-label="Pipeline unavailable">Pipeline data is temporarily unavailable.</p> : null}
        {pipeline.data ? (
          <dl className="metric-grid">
            {metrics.map(([key, label]) => (
              <div className="metric" key={key}>
                <dt>{label}</dt>
                <dd data-testid={`metric-${key}`} aria-label={pipeline.data?.[key] === undefined ? `${label}: data unavailable` : undefined}>{pipeline.data?.[key] ?? '—'}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      <section className="panel health-panel" aria-labelledby="gmail-title">
        <div className="panel-heading"><h2 id="gmail-title">Gmail intake health</h2></div>
        {!gmail.data && !gmail.isError ? <p role="status" aria-label={gmailActivity[0]}>{gmailActivity[1]}</p> : null}
        {gmail.isError ? <p role="alert" aria-label="Gmail health unavailable">Gmail health is temporarily unavailable.</p> : null}
        {gmail.data ? (
          <div className={`health health-${health}`} role="status" aria-label={`Gmail status: ${healthLabels[health]}`}>
            <span className="health-dot" aria-hidden="true" />
            <div><strong>{healthLabels[health]}</strong><p>Inbound connection evidence only.</p></div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
