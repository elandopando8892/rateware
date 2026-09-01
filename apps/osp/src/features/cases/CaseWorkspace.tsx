import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import type { OspCaseReadClient, OspClient } from '../../api/osp-client';
import { caseNextGates, casePrimaryAction, caseStateLabels, caseStateTone, formatCaseDate, type CasePrimaryAction } from './case-presenter';
import { RequestManifestPanel } from './RequestManifestPanel';
import { HistoricalIntakePanel } from './HistoricalIntakePanel';

const emptyProfileWorkspace = { candidates: [], binding: null, draft: null, disclosure_locked: true as const };

function PrimaryAction({ action, caseId }: { action: CasePrimaryAction; caseId: string }) {
  switch (action.kind) {
    case 'clarification':
      return <Link className="case-primary-action" to="/app/clarifications">{action.label}</Link>;
    case 'form':
      return <Link className="case-primary-action" to="/app/cases/$caseId/form" params={{ caseId }}>{action.label}</Link>;
    case 'operations_review':
      return <Link className="case-primary-action" to="/app/cases/$caseId/review" params={{ caseId }}>{action.label}</Link>;
    case 'signature':
      return <Link className="case-primary-action" to="/app/cases/$caseId/signature" params={{ caseId }}>{action.label}</Link>;
    case 'sales_authorization':
      return <Link className="case-primary-action" to="/app/cases/$caseId/authorization" params={{ caseId }}>{action.label}</Link>;
  }
}

type CaseWorkspaceClient = OspCaseReadClient & Partial<Pick<OspClient, 'previewHistoricalGmailSearch' | 'importHistoricalGmailMessage'>>;

export function CaseWorkspace({ client, caseId }: { client: CaseWorkspaceClient; caseId: string }) {
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [bindingConfirmed, setBindingConfirmed] = useState(false);
  const [draftConfirmed, setDraftConfirmed] = useState(false);
  const [pendingAction, setPendingAction] = useState<'binding' | 'draft' | null>(null);
  const [actionError, setActionError] = useState(false);
  const query = useQuery({
    queryKey: ['osp', 'case', caseId],
    queryFn: () => client.getCustomerRegistrationCase(caseId),
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const workspace = query.data?.profile_workspace;
    if (workspace && !selectedEntityId) setSelectedEntityId(workspace.binding?.legal_entity_id ?? workspace.candidates[0]?.entity_id ?? '');
  }, [query.data, selectedEntityId]);

  if (query.isPending || query.fetchStatus !== 'idle') {
    return <section className="case-workspace"><p role="status">Loading case workspace…</p></section>;
  }
  if (query.isError || !query.data) {
    return <section className="case-workspace"><Link to="/app/pipeline">← Back to pipeline</Link><p role="alert">This case is unavailable. Return to the pipeline and retry.</p></section>;
  }

  const caseRecord = query.data;
  const latest = caseRecord.latest_request;
  const profile = caseRecord.profile_workspace ?? emptyProfileWorkspace;
  const selectedEntity = profile.candidates.find((candidate) => candidate.entity_id === selectedEntityId);
  const bindingMatchesSelection = profile.binding?.legal_entity_id === selectedEntityId;
  const runProfileAction = async (action: 'binding' | 'draft') => {
    setPendingAction(action);
    setActionError(false);
    try {
      if (action === 'binding') {
        await client.bindCaseProfile({ caseId, legalEntityId: selectedEntityId, expectedCaseVersion: caseRecord.aggregate_version, expectedBindingRevision: profile.binding?.binding_revision ?? 0, confirmation: 'BIND_CASE_TO_XBF_ENTITY' });
        setBindingConfirmed(false);
      } else if (profile.binding) {
        await client.assembleCaseProfileDraft({ caseId, expectedCaseVersion: caseRecord.aggregate_version, expectedBindingRevision: profile.binding.binding_revision, expectedFactsSha256: profile.binding.facts_sha256, confirmation: 'ASSEMBLE_INTERNAL_PROFILE_DRAFT' });
        setDraftConfirmed(false);
      }
      await query.refetch();
    } catch {
      setActionError(true);
    } finally {
      setPendingAction(null);
    }
  };
  const primaryAction = casePrimaryAction(caseRecord.state);
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
        {primaryAction ? <PrimaryAction action={primaryAction} caseId={caseId} /> : <p className="next-gate-status">No action is available until the next controlled transition.</p>}
      </section>

      <dl className="case-metrics" aria-label="Case evidence counts">
        <div><dt>Messages</dt><dd>{caseRecord.message_count}</dd></div>
        <div><dt>Attachments</dt><dd>{caseRecord.attachment_count}</dd></div>
        <div><dt>Documents</dt><dd>{caseRecord.document_count}</dd></div>
        <div><dt>Last updated</dt><dd>{formatCaseDate(caseRecord.updated_at)}</dd></div>
      </dl>

      <RequestManifestPanel manifest={caseRecord.request_manifest ?? null} />
      <HistoricalIntakePanel intake={caseRecord.historical_intake ?? null} subject={latest.subject} client={client} />

      <section className="panel case-profile-assembler" aria-labelledby="profile-assembler-title">
        <div className="panel-heading">
          <div><p className="eyebrow">Governed package draft</p><h2 id="profile-assembler-title">Choose the XBF legal entity for this request</h2></div>
          <span className="read-only-badge">Disclosure locked</span>
        </div>
        <p className="privacy-note">This freezes canonical fact references for internal review. It does not disclose values, send email, call a webhook, or authorize release.</p>
        <div className="case-profile-options" role="radiogroup" aria-label="XBF legal entity">
          {profile.candidates.map((candidate) => (
            <label className={candidate.entity_id === selectedEntityId ? 'case-profile-option case-profile-option-active' : 'case-profile-option'} key={candidate.entity_id}>
              <input type="radio" name="case-profile-entity" value={candidate.entity_id} checked={candidate.entity_id === selectedEntityId} onChange={() => { setSelectedEntityId(candidate.entity_id); setBindingConfirmed(false); }} />
              <span><strong>{candidate.entity_code}</strong>{candidate.legal_name}<small>{candidate.country_code} · {candidate.fact_count} reviewed facts</small></span>
            </label>
          ))}
        </div>
        {selectedEntity ? (
          <div className="case-profile-control">
            <label><input type="checkbox" checked={bindingConfirmed} onChange={(event) => setBindingConfirmed(event.target.checked)} /> Confirm this supplier request must use {selectedEntity.entity_code}.</label>
            <button type="button" disabled={!bindingConfirmed || bindingMatchesSelection || pendingAction !== null || caseRecord.blocked_by_duplicate_review} onClick={() => void runProfileAction('binding')}>{pendingAction === 'binding' ? 'Binding…' : bindingMatchesSelection ? 'Entity bound' : 'Bind entity to case'}</button>
          </div>
        ) : <p>No active XBF entity with canonical facts is available.</p>}
        <div className="case-profile-summary">
          <div><span>Bound profile</span><strong>{profile.binding?.entity_code ?? 'Not selected'}</strong></div>
          <div><span>Internal draft</span><strong>{profile.draft ? `${profile.draft.fact_count} references frozen` : 'Not assembled'}</strong></div>
          <div><span>Restricted references</span><strong>{profile.draft?.restricted_fact_count ?? '—'}</strong></div>
        </div>
        {profile.binding ? (
          <div className="case-profile-control">
            <label><input type="checkbox" checked={draftConfirmed} onChange={(event) => setDraftConfirmed(event.target.checked)} /> Assemble a reference-only internal draft from the currently bound facts.</label>
            <button type="button" disabled={!draftConfirmed || pendingAction !== null || caseRecord.blocked_by_duplicate_review} onClick={() => void runProfileAction('draft')}>{pendingAction === 'draft' ? 'Assembling…' : profile.draft ? 'Refresh internal draft' : 'Assemble internal draft'}</button>
          </div>
        ) : null}
        {profile.draft ? <p className="case-profile-manifest">Manifest {profile.draft.manifest_sha256.slice(0, 12)}… · binding revision {profile.draft.binding_revision}</p> : null}
        {actionError ? <p className="case-warning" role="alert">The profile action was not applied. Refresh the case and retry with the current version.</p> : null}
      </section>

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
