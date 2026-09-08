import { useRef, useState } from 'react';
import type { AnswerMemoryCandidate, AnswerMemoryReviewInput, AnswerMemoryReviewReceipt } from './answer-memory-contract';
import type { AnswerMemoryEvidence } from './answer-memory-evidence-contract';
import type { AnswerMemoryEvidenceLinkInput, AnswerMemoryEvidenceLinkReceipt } from './answer-memory-evidence-contract';
import { AnswerMemoryEvidencePanel } from './AnswerMemoryEvidencePanel';

export function AnswerMemoryReviewPanel({ caseId, candidates, allowed, onReview, loadEvidence, onLinkEvidence }: {
  caseId: string; candidates: readonly AnswerMemoryCandidate[]; allowed: boolean;
  onReview(input: AnswerMemoryReviewInput): Promise<AnswerMemoryReviewReceipt>;
  loadEvidence?(candidateId: string): Promise<AnswerMemoryEvidence>;
  onLinkEvidence?(input: AnswerMemoryEvidenceLinkInput): Promise<AnswerMemoryEvidenceLinkReceipt>;
}) {
  return <section className="answer-memory-review" aria-label="Review saved answers">
    <h3>Revisar respuestas para la memoria XBF</h3>
    <p>Hasta 50 candidatas recientes. Aceptar conserva tu evaluación; todavía no publica un dato maestro ni permite reutilizarlo. La promoción requiere evidencia y alcance propios.</p>
    {candidates.length === 0 ? <p>No hay candidatas capturadas para mostrar.</p> : candidates.map((candidate) => <CandidateReview key={`${candidate.id}:${candidate.answerSha256}:${candidate.stale}:${candidate.legalEntityId}`} candidate={candidate} caseId={caseId} allowed={allowed} onReview={onReview} loadEvidence={loadEvidence} onLinkEvidence={onLinkEvidence} />)}
  </section>;
}

function CandidateReview({ candidate, caseId, allowed, onReview, loadEvidence, onLinkEvidence }: {
  candidate: AnswerMemoryCandidate; caseId: string; allowed: boolean;
  onReview(input: AnswerMemoryReviewInput): Promise<AnswerMemoryReviewReceipt>;
  loadEvidence?(candidateId: string): Promise<AnswerMemoryEvidence>;
  onLinkEvidence?(input: AnswerMemoryEvidenceLinkInput): Promise<AnswerMemoryEvidenceLinkReceipt>;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState<AnswerMemoryReviewReceipt | null>(null);
  const key = useRef(`answer-review:${crypto.randomUUID()}`);
  const controlSuffix = `${candidate.id}-${candidate.answerSha256.slice(0, 8)}`;
  const reasonId = `answer-memory-reason-${controlSuffix}`;
  const reasonHelpId = `answer-memory-reason-help-${controlSuffix}`;
  const confirmId = `answer-memory-confirm-${controlSuffix}`;
  const status = receipt?.decision ?? candidate.decision;
  const editable = allowed && status === 'pending_review' && !busy && !uncertain;
  const ready = editable && confirmed && reason.trim().length >= 10 && reason.trim().length <= 1000;
  async function decide(decision: 'accepted' | 'rejected') {
    if (!ready || decision === 'accepted' && (candidate.stale || !candidate.legalEntityId)) return;
    setBusy(true);
    try { setReceipt(await onReview({ caseId, candidateId: candidate.id, answerSha256: candidate.answerSha256, decision, reason: reason.trim(), idempotencyKey: key.current })); }
    catch { setUncertain(true); }
    finally { setBusy(false); }
  }
  return <article className="answer-memory-card" aria-label={candidate.label}>
    <h4>{candidate.label} · {candidate.canonicalFieldId}</h4>
    <p className="answer-memory-value">{candidate.value}</p>
    <p>Formulario {candidate.sourceInstanceId} · versión {candidate.sourceVersion}</p>
    <p>Entidad XBF: {candidate.legalEntityId ?? 'sin vincular'} · {candidate.stale ? 'origen cambió: no aceptar' : 'origen sin cambios'}</p>
    <p>Estado: {status === 'pending_review' ? 'pendiente' : status === 'accepted' ? 'aceptada para futura promoción; no reutilizable' : 'descartada'}</p>
    {candidate.reason ? <p>Motivo registrado: {candidate.reason}</p> : null}
    {status === 'pending_review' ? <>
      <label htmlFor={reasonId}>Motivo de la decisión
        <textarea id={reasonId} aria-describedby={reasonHelpId} value={reason} maxLength={1000} disabled={!editable} onChange={(event) => setReason(event.target.value)} />
      </label>
      <small id={reasonHelpId}>Escribe entre 10 y 1000 caracteres para dejar una justificación auditable.</small>
      <label htmlFor={confirmId}><input id={confirmId} type="checkbox" checked={confirmed} disabled={!editable} onChange={(event) => setConfirmed(event.target.checked)} /> Revisé esta respuesta y su entidad; no estoy autorizando un envío.</label>
      <div className="case-form-actions">
        <button type="button" disabled={!ready || candidate.stale || !candidate.legalEntityId} onClick={() => void decide('accepted')}>Aceptar candidata</button>
        <button type="button" disabled={!ready} onClick={() => void decide('rejected')}>Descartar candidata</button>
      </div>
    </> : null}
    {busy ? <p role="status" aria-live="polite">Guardando evaluación…</p> : null}
    {receipt ? <p role="status" aria-live="polite">Evaluación registrada. No habilita autollenado ni salientes.</p> : null}
    {uncertain ? <p role="alert">No se pudo confirmar el resultado. Recarga para conciliar el estado antes de otro intento.</p> : null}
    {status === 'accepted' && !candidate.stale && candidate.legalEntityId && loadEvidence ? <AnswerMemoryEvidencePanel candidate={candidate} caseId={caseId} load={() => loadEvidence(candidate.id)} onLink={allowed ? onLinkEvidence : undefined} /> : null}
  </article>;
}
