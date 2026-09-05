import { useState } from 'react';
import type { CorporateProfileEntity } from '../../api/contracts';

type Candidate = CorporateProfileEntity['promotion_candidates'][number];
const labels = { new: 'Nuevo', replace: 'Reemplaza', unchanged: 'Sin cambio', withheld: 'Reservado · excluido', rejected: 'Rechazado · excluido', blocked: 'Bloqueado' };

export function ProfilePromotionBatchPanel({ candidate, pending, onPromote }: {
  candidate: Candidate; pending: boolean; onPromote: (candidate: Candidate) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  // The API boundary validates the strict batch schema; avoid importing its
  // parser a second time into this deferred UI chunk.
  const batch = candidate.batch;
  if (!batch) return <p role="status">Falta la comparación completa del documento. No se puede publicar con sólo un resumen.</p>;
  const included = batch.rows.filter((row) => ['new', 'replace', 'unchanged'].includes(row.change));
  const complete = batch.reviewId === candidate.review_id && batch.reviewRevision === candidate.review_revision &&
    batch.rows.length === batch.totalFields && batch.rows.length <= 128 &&
    included.length === Number(candidate.candidate_count) &&
    included.filter((row) => row.change !== 'unchanged').length === Number(candidate.change_count) &&
    included.filter((row) => row.change === 'unchanged').length === Number(candidate.unchanged_count) &&
    batch.rows.filter((row) => row.change === 'withheld').length === Number(candidate.withheld_count) &&
    Object.keys(candidate.expected_current_fact_ids).length === included.length &&
    included.every((row) => Object.hasOwn(candidate.expected_current_fact_ids, row.fieldCode) && candidate.expected_current_fact_ids[row.fieldCode] === row.currentFactId);
  return <section className="profile-batch-panel" aria-label="Comparación completa del documento">
    <h3>Documento completo · {batch.totalFields} campos</h3>
    <p>Revisa cada cambio antes de confirmar. Esta acción incluye todo el documento aprobado, no sólo la respuesta que lo originó.</p>
    <ul className="profile-batch-fields">
      {batch.rows.map((row) => <li key={row.fieldId}>
        <div className="profile-batch-field-heading"><strong>{row.fieldCode.replaceAll('_', ' ')}</strong><span>{labels[row.change]}</span></div>
        {['withheld', 'rejected', 'blocked'].includes(row.change) ? <p>Valor no mostrado. Este campo no se publica.</p> :
          <dl><div><dt>Actual</dt><dd>{row.before ?? 'Sin dato'}</dd></div><div><dt>Propuesto</dt><dd>{row.after}</dd></div></dl>}
      </li>)}
    </ul>
    <p className="profile-batch-stamp">Revisión {batch.reviewRevision} · comparación {batch.comparisonSha256.slice(0, 12)}…</p>
    {candidate.promotion_status === 'ready' && batch.ready && complete ? <div className="promotion-control">
      <label><input type="checkbox" checked={confirmed} disabled={pending} onChange={(event) => setConfirmed(event.target.checked)} /> Confirmo todos los cambios visibles y los campos excluidos de esta revisión exacta.</label>
      <button type="button" className="primary-action" disabled={!confirmed || pending} onClick={() => onPromote(candidate)}>{pending ? 'Publicando…' : 'Publicar lote completo en el perfil XBF'}</button>
    </div> : candidate.promotion_status === 'ready' ? <p role="alert">No publicable: falta resolver campos, verificar el respaldo vigente o actualizar la comparación completa.</p> : null}
    <p>Los valores sin cambio conservan su origen. Renovar el respaldo requiere el vínculo documental correspondiente.</p>
  </section>;
}
