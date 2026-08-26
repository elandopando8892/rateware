import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { OspClient, OspReadClient } from '../../api/osp-client';
import { deriveMailboxHealth, type MailboxHealth } from './pipeline-health';
import { pipelineOverviewQueryKey, usePipelineOverview } from './use-pipeline-overview';

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

type PipelineClient = OspReadClient & Partial<Pick<OspClient, 'syncGmailInbox'>>;

export function PipelineOverview({ client }: { client: PipelineClient }) {
  const queryClient = useQueryClient();
  const { pipeline, gmail } = usePipelineOverview(client);
  const health = gmail.data ? deriveMailboxHealth(gmail.data) : 'unknown';
  const sync = useMutation({
    mutationFn: async () => {
      if (!client.syncGmailInbox) throw new Error('manual sync unavailable');
      return await client.syncGmailInbox();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pipelineOverviewQueryKey.pipeline }),
        queryClient.invalidateQueries({ queryKey: pipelineOverviewQueryKey.gmail }),
      ]);
    },
  });
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
        <div className="panel-heading">
          <h2 id="gmail-title">Gmail intake</h2>
          <span className="manual-mode-badge">Manual · no Pub/Sub</span>
        </div>
        {!gmail.data && !gmail.isError ? <p role="status" aria-label={gmailActivity[0]}>{gmailActivity[1]}</p> : null}
        {gmail.isError ? <p role="alert" aria-label="Gmail health unavailable">Gmail health is temporarily unavailable.</p> : null}
        {gmail.data ? (
          <div className={`health health-${health}`} role="status" aria-label={`Gmail status: ${healthLabels[health]}`}>
            <span className="health-dot" aria-hidden="true" />
            <div><strong>{healthLabels[health]}</strong><p>{gmail.data.pubsub_configured ? 'Automatic watch evidence available.' : 'Connected for manual inbox synchronization.'}</p></div>
          </div>
        ) : null}
        <div className="sync-card">
          <div>
            <strong>Bring in new requests</strong>
            <p>Checks the connected inbox and processes new onboarding email using the existing Rateware/OSP infrastructure.</p>
          </div>
          <button
            className="sync-button"
            type="button"
            disabled={!client.syncGmailInbox || !gmail.data?.connection_exists || sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending ? 'Syncing…' : 'Sync inbox now'}
          </button>
        </div>
        <div className="sync-result" aria-live="polite">
          {sync.isSuccess ? <p>Sync complete: {sync.data.inserted_messages} new Gmail message(s); OSP processed {sync.data.osp_processed} job(s).</p> : null}
          {sync.isError ? <p role="alert">Sync could not complete. No outgoing email was sent.</p> : null}
        </div>
      </section>
    </div>
  );
}
