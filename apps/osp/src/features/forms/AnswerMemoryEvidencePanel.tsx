import { useState } from 'react';
import './answer-memory-evidence.css';
import type { AnswerMemoryCandidate } from './answer-memory-contract';
import type { AnswerMemoryEvidence, AnswerMemoryEvidenceOption } from './answer-memory-evidence-contract';

const states: Record<AnswerMemoryEvidenceOption['state'], string> = {
  already_reusable: 'El dato ya tiene evidencia vigente para reutilización',
  renewal_required: 'Necesita renovación auditable de evidencia',
  document_promotion_required: 'La revisión documental requiere publicación explícita',
  fact_conflict: 'La respuesta difiere del dato corporativo vigente',
  blocked: 'El origen del dato no permite este enlace',
};

export function AnswerMemoryEvidencePanel({ candidate, load }: {
  candidate: AnswerMemoryCandidate; load(): Promise<AnswerMemoryEvidence>;
}) {
  const [result, setResult] = useState<AnswerMemoryEvidence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  async function inspect() {
    if (loading) return;
    setLoading(true); setError(false); setResult(null);
    try { setResult(await load()); } catch { setError(true); }
    finally { setLoading(false); }
  }
  return <section className="answer-memory-evidence" aria-label="Comparación de evidencia">
    <h5>Respuesta → evidencia → dato reutilizable</h5>
    <p>Consulta en lectura. No registra un enlace, renueva evidencia ni publica datos.</p>
    <button type="button" disabled={loading} onClick={() => void inspect()}>{loading ? 'Comparando…' : 'Comparar evidencia documental'}</button>
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
      {option.state === 'already_reusable' ? <p>El enlace de esta respuesta aún no está registrado. Esto no autoriza adjuntar documentos ni enviar información.</p> : <p>El enlace y la renovación permanecen deshabilitados en esta entrega de lectura.</p>}
    </div>)}
    {result ? <p>Hasta 20 coincidencias de la misma entidad. No es una validación completa del paquete del carrier.</p> : null}
  </section>;
}
