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
    .map((candidate) => `${candidate.kind}:${candidate.canonicalKey}:${candidate.catalogState}`)
    .join('|') ?? '';

  useEffect(() => {
    if (!query.data) return;
    setSelected(new Set(query.data.candidates
      .filter((candidate) => candidate.catalogState === 'new')
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
  const newCount = workspace.candidates.filter((candidate) => candidate.catalogState === 'new').length;
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
          <p>Promote only reviewed field names and document concepts. Values, files, recipients and signatures never enter this catalog.</p>
        </div>
        <span>{workspace.catalogEntryCount} known</span>
      </div>

      <dl className="request-knowledge-scorecard">
        <div><dt>Concepts detected</dt><dd>{workspace.candidates.length}</dd></div>
        <div><dt>New candidates</dt><dd>{newCount}</dd></div>
        <div><dt>Already reusable</dt><dd>{workspace.candidates.length - newCount}</dd></div>
        <div><dt>Prior promotions</dt><dd>{workspace.priorPromotionCount}</dd></div>
      </dl>

      {workspace.candidates.length > 0 ? (
        <div className="request-knowledge-list" role="list" aria-label="Reusable knowledge candidates">
          {workspace.candidates.map((candidate) => {
            const key = `${candidate.kind}:${candidate.canonicalKey}`;
            const known = candidate.catalogState === 'known';
            return <label className={known ? 'request-knowledge-item request-knowledge-known' : 'request-knowledge-item'} key={key}>
              <input type="checkbox" checked={known || selected.has(key)} disabled={known || busy} onChange={(event) => toggle(key, event.target.checked)} />
              <span className="request-knowledge-kind">{candidate.kind}</span>
              <span><strong>{candidate.displayLabel}</strong><code>{candidate.canonicalKey}</code><small>{candidate.aliases.length} alias{candidate.aliases.length === 1 ? '' : 'es'} · {candidate.evidenceCount} evidence reference{candidate.evidenceCount === 1 ? '' : 's'}</small></span>
              <span className={known ? 'request-knowledge-state request-knowledge-state-known' : 'request-knowledge-state'}>{known ? 'Known' : 'Proposed'}</span>
            </label>;
          })}
        </div>
      ) : <p className="request-knowledge-empty">This reviewed manifest contains no reusable field or document concepts.</p>}

      {receipt ? <p className="request-knowledge-success" role="status">Catalog updated: {receipt.promoted} promoted, {receipt.unchanged} already known.</p> : null}
      {failed ? <p className="case-warning" role="alert">The catalog was not changed. Reload the current review and retry once.</p> : null}
      {newCount > 0 ? <div className="request-knowledge-action">
        <label><input type="checkbox" checked={confirmed} disabled={busy || selectedKeys.length < 1} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm these selected concepts are reusable across future supplier requests.</label>
        <button className="adaptive-action adaptive-action-primary" type="button" disabled={!confirmed || selectedKeys.length < 1 || busy} onClick={() => void promote()}>{busy ? 'Promoting…' : `Promote ${selectedKeys.length} reviewed concept${selectedKeys.length === 1 ? '' : 's'}`}</button>
      </div> : <p className="request-knowledge-complete">This case is already covered by the supervised catalog.</p>}

      <footer><strong>Learning boundary</strong><span>Human approval updates recognition vocabulary only. No fine-tuning and no external effects.</span><code>{workspace.candidateSha256.slice(0, 12)}</code></footer>
    </section>
  );
}
