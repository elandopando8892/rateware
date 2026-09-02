import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { OspCaseReadClient } from '../../api/osp-client';

export function RequestKnowledgePanel({ client, caseId, enabled }: {
  client: OspCaseReadClient;
  caseId: string;
  enabled: boolean;
}) {
  const query = useQuery({
    queryKey: ['osp', 'request-knowledge', caseId],
    queryFn: () => client.getRequestKnowledgeWorkspace(caseId),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [receipt, setReceipt] = useState<{ promoted: number; unchanged: number } | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const candidateStateKey = query.data?.candidates
    .map((candidate) => `${candidate.kind}:${candidate.canonicalKey}:${candidate.catalogMatch}:${candidate.reuseEligibility}:${candidate.targetCanonicalKey ?? ''}`)
    .join('|') ?? '';

  useEffect(() => {
    if (!query.data) return;
    setSelected(new Set(query.data.candidates
      .filter((candidate) => candidate.catalogMatch === 'none' && candidate.reuseEligibility === 'eligible')
      .map((candidate) => `${candidate.kind}:${candidate.canonicalKey}`)));
    setConfirmed(false);
  }, [query.data?.candidateSha256, candidateStateKey]);

  if (!enabled) return null;
  if (query.isPending || query.fetchStatus !== 'idle') {
    return <section className="panel request-knowledge-panel"><p role="status">Loading reusable knowledge candidates…</p></section>;
  }
  if (query.isError || !query.data) {
    return <section className="panel request-knowledge-panel"><p role="alert">Reusable knowledge is unavailable. The case remains unchanged.</p></section>;
  }

  const workspace = query.data;
  const eligibleCount = workspace.candidates.filter((candidate) => candidate.catalogMatch === 'none' && candidate.reuseEligibility === 'eligible').length;
  const knownCount = workspace.candidates.filter((candidate) => candidate.catalogState === 'known').length;
  const ambiguousCount = workspace.candidates.filter((candidate) => candidate.catalogMatch === 'ambiguous').length;
  const heldCount = workspace.candidates.filter((candidate) => candidate.catalogMatch === 'none' && candidate.reuseEligibility !== 'eligible').length;
  const selectedKeys = [...selected].sort();
  const toggle = (key: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
    setConfirmed(false);
    setReceipt(null);
  };
  const promote = async () => {
    if (!confirmed || selectedKeys.length < 1) return;
    setBusy(true);
    setFailed(false);
    try {
      idempotencyKey.current ??= `knowledge:${crypto.randomUUID()}`;
      const result = await client.promoteRequestKnowledge({
        caseId,
        reviewId: workspace.reviewId,
        expectedCandidateSha256: workspace.candidateSha256,
        selectedKeys,
        idempotencyKey: idempotencyKey.current,
        confirmation: 'PROMOTE_REVIEWED_REQUEST_KNOWLEDGE',
      });
      idempotencyKey.current = null;
      setReceipt({ promoted: result.promotedCount, unchanged: result.unchangedCount });
      setConfirmed(false);
      await query.refetch();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel request-knowledge-panel" aria-labelledby="request-knowledge-title">
      <div className="request-knowledge-heading">
        <div>
          <p className="eyebrow">Supervised OSP memory</p>
          <h2 id="request-knowledge-title">Reuse what this request taught us</h2>
          <p>OSP separates reusable concepts from provider forms and process instructions. Values, files, recipients and signatures never enter this catalog.</p>
        </div>
        <span>{workspace.catalogEntryCount} known · {workspace.priorPromotionCount} prior promotions</span>
      </div>

      <dl className="request-knowledge-scorecard">
        <div><dt>Concepts detected</dt><dd>{workspace.candidates.length}</dd></div>
        <div><dt>Recognized</dt><dd>{knownCount}</dd></div>
        <div><dt>Reusable now</dt><dd>{eligibleCount}</dd></div>
        <div><dt>Held out</dt><dd>{heldCount}</dd></div>
      </dl>

      {workspace.candidates.length > 0 ? (
        <div className="request-knowledge-list" role="list" aria-label="Reusable knowledge candidates">
          {workspace.candidates.map((candidate) => {
            const key = `${candidate.kind}:${candidate.canonicalKey}`;
            const known = candidate.catalogState === 'known';
            const ambiguous = candidate.catalogMatch === 'ambiguous';
            const eligible = candidate.reuseEligibility === 'eligible';
            const caseSpecific = candidate.reuseEligibility === 'case_specific';
            const stateLabel = candidate.catalogMatch === 'exact' ? 'Known exact' : candidate.catalogMatch === 'alias' ? 'Recognized alias' : ambiguous ? 'Review conflict' : caseSpecific ? 'Provider-specific' : eligible ? 'Reusable' : 'Taxonomy review';
            const className = known ? 'request-knowledge-item request-knowledge-known' : eligible ? 'request-knowledge-item' : 'request-knowledge-item request-knowledge-held';
            return <label className={className} key={key}>
              <input type="checkbox" checked={known || selected.has(key)} disabled={known || !eligible || busy} onChange={(event) => toggle(key, event.target.checked)} />
              <span className="request-knowledge-kind">{candidate.kind}</span>
              <span>
                <strong>{candidate.displayLabel}</strong>
                <code>{candidate.canonicalKey}</code>
                <small>{candidate.aliases.length} alias{candidate.aliases.length === 1 ? '' : 'es'} · {candidate.evidenceCount} evidence reference{candidate.evidenceCount === 1 ? '' : 's'}</small>
                {known ? <small className="request-knowledge-provenance">Maps to {candidate.matchedDisplayLabel} <code>{candidate.matchedCanonicalKey}</code> · catalog v{candidate.catalogVersion} · source case {candidate.sourceCaseId?.slice(0, 8).toUpperCase()}</small> : null}
                {!known && eligible ? <small className="request-knowledge-target">Will normalize to {candidate.targetDisplayLabel} <code>{candidate.targetCanonicalKey}</code></small> : null}
                {ambiguous ? <small className="request-knowledge-conflict">More than one approved alias matches this label. OSP will not reuse or promote it automatically.</small> : null}
                {!known && caseSpecific ? <small className="request-knowledge-held-note">Kept with this case because it identifies a provider form or process instruction.</small> : null}
                {!known && !eligible && !caseSpecific && !ambiguous ? <small className="request-knowledge-held-note">Needs a reusable canonical concept before it can enter shared memory.</small> : null}
              </span>
              <span className={known ? 'request-knowledge-state request-knowledge-state-known' : eligible ? 'request-knowledge-state' : 'request-knowledge-state request-knowledge-state-held'}>{stateLabel}</span>
            </label>;
          })}
        </div>
      ) : <p className="request-knowledge-empty">This reviewed manifest contains no reusable field or document concepts.</p>}

      {receipt ? <p className="request-knowledge-success" role="status">Catalog updated: {receipt.promoted} promoted, {receipt.unchanged} already known.</p> : null}
      {failed ? <p className="case-warning" role="alert">The catalog was not changed. Reload the current review and retry once.</p> : null}
      {ambiguousCount > 0 ? <p className="request-knowledge-conflict-summary" role="status">{ambiguousCount} ambiguous concept{ambiguousCount === 1 ? '' : 's'} held for catalog review. No automatic reuse or promotion was applied.</p> : null}
      {heldCount > 0 ? <p className="request-knowledge-held-summary" role="status">{heldCount} case-specific or unnormalized concept{heldCount === 1 ? '' : 's'} kept out of shared memory.</p> : null}
      {eligibleCount > 0 ? <div className="request-knowledge-action">
        <label><input type="checkbox" checked={confirmed} disabled={busy || selectedKeys.length < 1} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm these selected concepts are reusable across future supplier requests.</label>
        <button className="adaptive-action adaptive-action-primary" type="button" disabled={!confirmed || selectedKeys.length < 1 || busy} onClick={() => void promote()}>{busy ? 'Promoting…' : `Promote ${selectedKeys.length} reviewed concept${selectedKeys.length === 1 ? '' : 's'}`}</button>
      </div> : heldCount === 0 ? <p className="request-knowledge-complete">This case is already covered by the supervised catalog.</p> : null}

      <footer><strong>Learning boundary</strong><span>Human approval updates recognition vocabulary only. No fine-tuning and no external effects.</span><code>{workspace.candidateSha256.slice(0, 12)}</code></footer>
    </section>
  );
}
