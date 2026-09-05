import { useRef, useState } from 'react';
import './answer-memory-evidence.css';
import type { AnswerMemoryCandidate } from './answer-memory-contract';
import type { AnswerMemoryEvidence, AnswerMemoryEvidenceOption } from './answer-memory-evidence-contract';
import type { AnswerMemoryEvidenceLinkInput, AnswerMemoryEvidenceLinkReceipt } from './answer-memory-evidence-contract';

const states: Record<AnswerMemoryEvidenceOption['state'], string> = {
  already_reusable: 'El dato ya tiene evidencia vigente para reutilización',
  renewal_required: 'Necesita renovación auditable de evidencia',
  document_promotion_required: 'La revisión documental requiere publicación explícita',
  fact_conflict: 'La respuesta difiere del dato corporativo vigente',
  blocked: 'El origen del dato no permite este enlace',
};

export function AnswerMemoryEvidencePanel({ candidate, load, caseId, onLink }: {
  candidate: AnswerMemoryCandidate; load(): Promise<AnswerMemoryEvidence>;
  caseId?: string; onLink?(input: AnswerMemoryEvidenceLinkInput): Promise<AnswerMemoryEvidenceLinkReceipt>;
}) {
  const [result, setResult] = useState<AnswerMemoryEvidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  async function inspect() {
    if (loading || selected) return;
    setLoading(true); setError(false); setResult(null);
    try { setResult(await load()); } catch { setError(true); }
    finally { setLoading(false); }
  }
  return <section className="answer-memory-evidence" aria-label="Comparación de evidencia">
    <h5>Respuesta → evidencia → dato reutilizable</h5>
    <p>Comparar es sólo lectura. Registrar un vínculo o renovar su respaldo requiere la confirmación específica de abajo; no publica otros campos ni autoriza envíos.</p>
    <button type="button" disabled={loading || selected !== null} onClick={() => void inspect()}>{loading ? 'Comparando…' : 'Comparar evidencia documental'}</button>
    {selected ? <p>Se conserva la comparación previa al intento. El recibo de abajo documenta su resultado.</p> : null}
    {error ? <p role="alert">No se pudo consultar la evidencia. No se realizó ningún cambio; puedes volver a consultar.</p> : null}
    {result?.options.length === 0 ? <p role="status">No hay evidencia coincidente disponible para esta respuesta aceptada y su entidad. Revisa el origen, la vigencia y la revisión documental.</p> : null}
    {result?.options.map((option) => <div className="answer-memory-evidence-option" key={option.reviewFieldId}>
      <strong>{states[option.state]}</strong>
      <dl>
        <dt>Respuesta aceptada</dt><dd>{candidate.value}</dd>
        <dt>Evidencia aprobada · {option.fieldCode}</dt><dd>{option.reviewedValue}</dd>
        <dt>Dato corporativo actual</dt><dd>{option.currentValue ?? 'Sin dato visible vigente'}</dd>
        <dt>Revisión documental</dt><dd>{option.reviewId} · versión {option.reviewRevision}</dd>
        <dt>Vencimiento de la evidencia</dt><dd>{option.evidenceExpiresOn ?? 'Sin vencimiento registrado; sujeto al requerimiento del carrier'}</dd>
      </dl>
      <p>El documento contiene {option.documentFieldCount} campos aprobados. Su publicación abarca el documento completo, no sólo esta respuesta.</p>
      {caseId && onLink && option.expectationSha256 && option.currentFactId && ['already_reusable', 'renewal_required'].includes(option.state)
        ? <EvidenceAction key={`${option.reviewFieldId}:${option.expectationSha256}`} candidate={candidate} caseId={caseId} option={option} onLink={onLink}
          disabled={selected !== null && selected !== option.reviewFieldId} onStart={() => setSelected(option.reviewFieldId)} />
        : <p>Sin acción de enlace disponible. Primero debe existir un dato publicado y evidencia vigente; no se publica el documento desde esta respuesta.</p>}
    </div>)}
    {result ? <p>Hasta 20 coincidencias de la misma entidad. No es una validación completa del paquete del carrier.</p> : null}
  </section>;
}

function EvidenceAction({ candidate, caseId, option, onLink, disabled, onStart }: {
  candidate: AnswerMemoryCandidate; caseId: string; option: AnswerMemoryEvidenceOption; disabled: boolean; onStart(): void;
  onLink(input: AnswerMemoryEvidenceLinkInput): Promise<AnswerMemoryEvidenceLinkReceipt>;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [receipt, setReceipt] = useState<AnswerMemoryEvidenceLinkReceipt | null>(null);
  const intent = useRef<AnswerMemoryEvidenceLinkInput | null>(null);
  const inFlight = useRef(false);
  const renew = option.state === 'renewal_required';
  const ready = !disabled && !busy && !receipt && (uncertain || confirmed && reason.trim().length >= 10 && reason.trim().length <= 1000);
  async function confirm() {
    if (!ready || inFlight.current || !option.currentFactId || !option.expectationSha256) return;
    inFlight.current = true; onStart(); setBusy(true);
    intent.current ??= { caseId, candidateId: candidate.id, answerSha256: candidate.answerSha256, reviewFieldId: option.reviewFieldId,
      factId: option.currentFactId, expectationSha256: option.expectationSha256, action: renew ? 'renew' : 'link', reason: reason.trim(),
      idempotencyKey: `answer-evidence:${crypto.randomUUID()}`, confirmed: true };
    try { setReceipt(await onLink(intent.current)); setUncertain(false); }
    catch { setUncertain(true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section aria-label="Confirmar respaldo de respuesta">
    <p>{renew ? 'Conserva el dato y su fuente original; añade esta evidencia vigente como respaldo auditable.' : 'Registra la relación con el dato existente; no crea ni reemplaza hechos.'}</p>
    <label>Motivo del respaldo<textarea maxLength={1000} value={reason} disabled={disabled || busy || uncertain || !!receipt} onChange={(event) => setReason(event.target.value)} /></label>
    <label><input type="checkbox" checked={confirmed} disabled={disabled || busy || uncertain || !!receipt} onChange={(event) => setConfirmed(event.target.checked)} /> Confirmo esta respuesta, entidad y evidencia exactas; sin firma, adjuntos ni envío.</label>
    <button type="button" disabled={!ready} onClick={() => void confirm()}>{busy ? 'Registrando…' : uncertain ? 'Conciliar el mismo intento' : renew ? 'Renovar respaldo y vincular' : 'Registrar vínculo'}</button>
    {uncertain ? <p role="alert">Resultado no confirmado. Se conserva la misma clave e intención para conciliar; no se generará otra operación. Si el origen cambió, vuelve a consultar después de conciliar.</p> : null}
    {receipt ? <p role="status">{receipt.action === 'renew' ? 'Renovación y vínculo registrados.' : 'Vínculo registrado.'} Recibo: {receipt.receiptId}. La reutilización vuelve a validar vigencia y permisos; no autoriza un paquete ni un envío.</p> : null}
  </section>;
}
