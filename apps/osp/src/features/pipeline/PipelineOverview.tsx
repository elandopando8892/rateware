import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import type { OspCaseReadClient, OspClient, OspReadClient } from '../../api/osp-client';
import type { CaseState } from '../../api/contracts';
import { HistoricalIntakePanel } from '../cases/HistoricalIntakePanel';
import { caseNextGates, caseStateLabels, caseStateTone, formatCaseDate } from '../cases/case-presenter';
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
  polling: 'Automated',
  watching: 'Watching',
  degraded: 'Degraded',
};

const preparedStates = new Set<CaseState>([
  'preparing', 'operations_review', 'signature_approval', 'sales_authorization',
  'ready_to_send', 'sent', 'accepted', 'closed',
]);
const evidenceStates = new Set<CaseState>([
  'analyzing_requirements', 'awaiting_clarification', 'awaiting_xbf_information',
  'preparing', 'operations_review', 'signature_approval', 'sales_authorization',
  'ready_to_send', 'sent', 'manual_reconciliation_required', 'accepted', 'rejected', 'closed',
]);
const reviewStates = new Set<CaseState>([
  'operations_review', 'signature_approval', 'sales_authorization',
  'ready_to_send', 'sent', 'accepted', 'closed',
]);

type PipelineClient = OspReadClient & Partial<OspCaseReadClient> &
  Partial<Pick<OspClient, 'syncGmailInbox' | 'renewGmailWatch' | 'previewHistoricalGmailSearch' | 'importHistoricalGmailMessage'>>;

const salzilloHistoricalIntake = {
  status: 'preview_only' as const,
  query: 'in:inbox subject:"PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN" after:2026/08/09 before:2026/08/12',
  after_date: '2026-08-09',
  before_date: '2026-08-12',
  candidate_count: 0,
  duplicate_state: 'ready' as const,
  checkpoint_unchanged: true as const,
  source_preserved: true as const,
  external_effects: false as const,
};

const salzilloSubject = 'PROCESO DE ALTA GRUPO SALZILLO - HEYMARKSMAN';

export function PipelineOverview({ client, email = '' }: { client: PipelineClient; email?: string }) {
  const queryClient = useQueryClient();
  const { pipeline, gmail } = usePipelineOverview(client);
  const cases = useQuery({
    queryKey: pipelineOverviewQueryKey.cases,
    queryFn: () => client.listCustomerRegistrationCases?.() ?? Promise.resolve([]),
    retry: false,
    staleTime: 0,
  });
  const health = gmail.data ? deriveMailboxHealth(gmail.data) : 'unknown';
  const automaticWatch = health === 'watching';
  const automaticPoll = health === 'polling';
  const automaticIntake = automaticWatch || automaticPoll;
  const gmailConnected = gmail.data?.connection_exists === true;
  const pubsubReady = gmailConnected && gmail.data?.pubsub_configured === true;
  const visibleCases = cases.data ?? [];
  const preparedCases = visibleCases.filter((caseRecord) => preparedStates.has(caseRecord.state)).length;
  const evidenceCases = visibleCases.filter((caseRecord) => evidenceStates.has(caseRecord.state)).length;
  const reviewCases = visibleCases.filter((caseRecord) => reviewStates.has(caseRecord.state)).length;
  const sync = useMutation({
    mutationFn: async () => {
      if (!client.syncGmailInbox) throw new Error('manual sync unavailable');
      return await client.syncGmailInbox();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pipelineOverviewQueryKey.pipeline }),
        queryClient.invalidateQueries({ queryKey: pipelineOverviewQueryKey.gmail }),
        queryClient.invalidateQueries({ queryKey: pipelineOverviewQueryKey.cases }),
      ]);
    },
  });
  const watch = useMutation({
    mutationFn: async () => {
      if (!client.renewGmailWatch) throw new Error('Gmail watch renewal unavailable');
      return await client.renewGmailWatch();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pipelineOverviewQueryKey.gmail });
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
        <p>Adaptive setup requests from Gmail to a Sales-approved response package.</p>
      </header>

      <section className="panel" aria-labelledby="pipeline-title">
        <div className="panel-heading">
          <h2 id="pipeline-title">Pipeline</h2>
          <span className="read-only-badge">Human approved</span>
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

      <section className="panel cases-panel" aria-labelledby="cases-title">
        <div className="panel-heading">
          <div><p className="eyebrow">Work queue</p><h2 id="cases-title">Customer setup cases</h2></div>
          <span className="case-count">{cases.data?.length ?? '—'} visible</span>
        </div>
        {cases.isPending ? <p role="status">Loading customer setup cases…</p> : null}
        {cases.isError ? <p role="alert">Cases are temporarily unavailable.</p> : null}
        {cases.data?.length === 0 ? <p className="empty-cases">No cases have been captured yet. Sync the connected inbox to check for new requests.</p> : null}
        {cases.data && cases.data.length > 0 ? (
          <div className="case-list">
            {cases.data.map((caseRecord) => (
              <Link className="case-card" key={caseRecord.case_id} to="/app/cases/$caseId" params={{ caseId: caseRecord.case_id }}>
                <div className="case-card-main">
                  <span className={`case-state case-state-${caseStateTone(caseRecord.state)}`}>{caseStateLabels[caseRecord.state]}</span>
                  <h3>{caseRecord.supplier_name}</h3>
                  <p>{caseNextGates[caseRecord.state]}</p>
                </div>
                <dl className="case-card-meta">
                  <div><dt>Updated</dt><dd>{formatCaseDate(caseRecord.updated_at)}</dd></div>
                  <div><dt>Evidence</dt><dd>{caseRecord.message_count} email · {caseRecord.attachment_count} files</dd></div>
                </dl>
                <span className="case-open">Open case →</span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {email.trim().toLowerCase() === 'sales@heymarksman.com' ? (
        <HistoricalIntakePanel
          intake={salzilloHistoricalIntake}
          subject={salzilloSubject}
          client={client}
        />
      ) : null}

      <section className="panel health-panel" aria-labelledby="gmail-title">
        <div className="panel-heading">
          <div><p className="eyebrow">Automatic intake</p><h2 id="gmail-title">Email to Operations review</h2></div>
          <span className={automaticIntake ? 'automatic-mode-badge' : 'manual-mode-badge'}>
            {automaticPoll ? 'Automatic · scheduled sync' : automaticWatch ? 'Automatic · Gmail watch' : pubsubReady ? 'Ready · watch inactive' : gmailConnected ? 'Manual · no cloud trigger' : 'Manual · Gmail disconnected'}
          </span>
        </div>
        {!gmail.data && !gmail.isError ? <p role="status" aria-label={gmailActivity[0]}>{gmailActivity[1]}</p> : null}
        {gmail.isError ? <p role="alert" aria-label="Gmail health unavailable">Gmail health is temporarily unavailable.</p> : null}
        {gmail.data ? (
          <div className={`health health-${health}`} role="status" aria-label={`Gmail status: ${healthLabels[health]}`}>
            <span className="health-dot" aria-hidden="true" />
            <div><strong>{healthLabels[health]}</strong><p>{automaticPoll
              ? `The connected inbox is checked automatically every ${Math.round((gmail.data?.poll_interval_seconds ?? 300) / 60)} minutes using the existing Supabase project.`
              : automaticWatch
              ? 'New inbox notifications enter the preparation path without a manual sync.'
              : pubsubReady
                ? 'The cloud trigger is configured; activate the Gmail watch to make intake automatic.'
                : gmailConnected
                  ? 'The mailbox is connected for manual sync, but the cloud trigger is not configured.'
                  : 'Connect the approved Gmail mailbox before intake can run.'}</p></div>
          </div>
        ) : null}

        <ol className="automation-path" aria-label="Automatic onboarding path">
          <li className={automaticIntake ? 'automation-step-complete' : 'automation-step-pending'}>
            <span className="automation-step-marker" aria-hidden="true">1</span>
            <div><strong>Inbox monitored</strong><p>{automaticPoll
              ? `Scheduled sync runs every ${Math.round((gmail.data?.poll_interval_seconds ?? 300) / 60)} minutes; manual sync remains available as fallback.`
              : automaticWatch ? 'Gmail push is ready to capture new requests.' : 'An automatic cloud trigger still needs activation.'}</p></div>
          </li>
          <li className={visibleCases.length > 0 ? 'automation-step-complete' : 'automation-step-pending'}>
            <span className="automation-step-marker" aria-hidden="true">2</span>
            <div><strong>Request captured</strong><p>{visibleCases.length} visible case(s) preserve the source email and attachments.</p></div>
          </li>
          <li className={evidenceCases > 0 ? 'automation-step-complete' : 'automation-step-pending'}>
            <span className="automation-step-marker" aria-hidden="true">3</span>
            <div><strong>Request interpreted</strong><p>{evidenceCases} case(s) have hash-verified PDF, XLSX, XLSM or DOCX evidence, or passed that point.</p></div>
          </li>
          <li className={preparedCases > 0 ? 'automation-step-complete' : 'automation-step-pending'}>
            <span className="automation-step-marker" aria-hidden="true">4</span>
            <div><strong>Package prepared</strong><p>{preparedCases} case(s) have a prepared XBF package or passed that point.</p></div>
          </li>
          <li className={reviewCases > 0 ? 'automation-step-complete' : 'automation-step-pending'}>
            <span className="automation-step-marker" aria-hidden="true">5</span>
            <div><strong>Operations handoff</strong><p>{reviewCases} case(s) reached the human evidence-review gate.</p></div>
          </li>
        </ol>

        <div className="effects-lock" role="note">
          <span aria-hidden="true">🔒</span>
          <div><strong>Human-approved delivery</strong><p>AI prepares the case; accountable users review it. No reply, signature, authorization or provider write occurs until Sales approves the exact recipients, wording and attachments.</p></div>
        </div>

        <div className={`sync-card watch-card${automaticIntake ? ' sync-card-fallback' : ''}`}>
          <div>
            <strong>{automaticPoll ? 'No-cost scheduled intake' : automaticWatch ? 'Automatic Gmail watch' : pubsubReady ? 'Enable automatic intake' : gmailConnected ? 'Cloud trigger not configured' : 'Gmail connection required'}</strong>
            <p>{automaticPoll
              ? `Active on the shared Supabase project. Last completed ${formatCaseDate(gmail.data?.poll_last_completed_at ?? '')}. No Pub/Sub provider is required.`
              : automaticWatch
              ? `Active until ${formatCaseDate(gmail.data?.watch_expires_at ?? '')}. Renew it before expiration to avoid falling back to manual sync.`
              : pubsubReady
                ? 'Starts the existing INBOX-only Gmail watch. It captures new requests but never sends email or writes to a provider.'
                : gmailConnected
                  ? 'Google Pub/Sub topic, push identity and audience are still absent. Manual sync remains available without creating a paid provider.'
                  : 'The approved carriers@xbfreight.com connection must exist before the automatic watch can be enabled.'}</p>
          </div>
          <button
            className="sync-button"
            type="button"
            title={automaticPoll ? 'Scheduled polling is managed by the production release control.' : !gmailConnected ? 'Connect the approved Gmail mailbox first.' : !pubsubReady ? 'Configure the approved Google Pub/Sub trigger first.' : undefined}
            disabled={automaticPoll || !client.renewGmailWatch || !pubsubReady || watch.isPending}
            onClick={() => watch.mutate()}
          >
            {watch.isPending ? 'Activating…' : automaticPoll ? 'Scheduled sync active' : !gmailConnected ? 'Connect Gmail first' : !pubsubReady ? 'Pub/Sub required' : automaticWatch ? 'Renew watch' : 'Enable automatic intake'}
          </button>
        </div>
        <div className="sync-result" aria-live="polite">
          {watch.isSuccess ? <p>Automatic intake active until {formatCaseDate(watch.data.watch_expires_at)}.</p> : null}
          {watch.isError ? <p role="alert">Automatic intake could not be activated. No outgoing email was sent.</p> : null}
        </div>

        <div className={`sync-card${automaticIntake ? ' sync-card-fallback' : ''}`}>
          <div>
            <strong>{automaticIntake ? 'Manual fallback' : 'Bring in new requests'}</strong>
            <p>{automaticIntake ? 'Not required for normal flow. Use only if an automatic check is delayed.' : 'Checks the connected inbox and processes new onboarding email using the existing Rateware/OSP infrastructure.'}</p>
          </div>
          <button
            className="sync-button"
            type="button"
            disabled={!client.syncGmailInbox || !gmail.data?.connection_exists || sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending ? 'Syncing…' : automaticIntake ? 'Run fallback sync' : 'Sync inbox now'}
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
