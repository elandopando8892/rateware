import { useEffect, useRef, useState } from 'react';
import { assessArtifactReview, fingerprintBytes, fingerprintInventory } from './artifact-review';
import type { ArtifactFieldDecision, ArtifactReviewDraft, ArtifactReviewField } from './artifact-review';

export function ArtifactReviewPanel({ caseId, manifestSha256, inventory }: {
  caseId: string; manifestSha256: string; inventory: readonly ArtifactReviewField[];
}) {
  const [inventorySha256, setInventorySha256] = useState('');
  const [output, setOutput] = useState<{ name: string; sha256: string } | null>(null);
  const [draft, setDraft] = useState<ArtifactReviewDraft | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const readGeneration = useRef(0);
  useEffect(() => {
    let current = true;
    setInventorySha256('');
    void fingerprintInventory(inventory).then((hash) => { if (current) setInventorySha256(hash); })
      .catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [inventory]);
  useEffect(() => () => { readGeneration.current++; }, []);
  const context = { caseId, manifestSha256, inventorySha256, outputSha256: output?.sha256 ?? '' };
  const assessment = assessArtifactReview(context, inventory, draft);
  const loadPdf = async (file?: File) => {
    const generation = ++readGeneration.current;
    setOutput(null); setError(false); setBusy(!!file);
    if (!file) return;
    try {
      if (file.size < 5 || file.size > 25 * 1024 * 1024) throw new Error('PDF_SIZE_INVALID');
      const bytes = await file.arrayBuffer();
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('PDF_HEADER_INVALID');
      const hash = await fingerprintBytes(bytes);
      if (generation === readGeneration.current) setOutput({ name: file.name, sha256: hash });
    } catch { if (generation === readGeneration.current) setError(true); }
    finally { if (generation === readGeneration.current) setBusy(false); }
  };
  const update = (fieldId: string, patch: Partial<ArtifactFieldDecision>) => {
    if (busy || assessment.invalid || assessment.stale || !output) return;
    const existing = draft?.decisions.find((item) => item.fieldId === fieldId);
    const next = { fieldId, disposition: 'pending' as const, outputLocation: '', note: '', ...existing, ...patch };
    setDraft({ context, decisions: [...(draft?.decisions.filter((item) => item.fieldId !== fieldId) ?? []), next] });
  };
  return <section className="artifact-review panel" aria-labelledby="artifact-review-title">
    <p className="eyebrow">SPRINT 13 · BORRADOR LOCAL</p>
    <h2 id="artifact-review-title">Revisar el PDF campo por campo</h2>
    <p>Inventario sintético para probar la revisión. El archivo se lee únicamente en este navegador; no se sube, guarda, firma ni envía. Use un PDF ficticio.</p>
    <label>PDF local (máximo 25 MB)<input type="file" accept="application/pdf,.pdf" onChange={(event) => void loadPdf(event.target.files?.[0])} /></label>
    <p>La huella identifica bytes, no demuestra que el PDF sea válido o esté completo. Abra el archivo en su visor y compruebe cada ubicación.</p>
    {busy ? <p role="status">Calculando huella del archivo…</p> : null}
    {error ? <p role="alert">No se pudo leer el PDF. Seleccione un archivo con cabecera PDF, de hasta 25 MB.</p> : null}
    {output ? <p className="artifact-fingerprint">{output.name}<code>{output.sha256}</code></p> : null}
    {assessment.stale ? <div role="alert"><p>El archivo, el caso o el inventario cambió. La revisión anterior ya no corresponde.</p><button type="button" disabled={!output || busy || !inventorySha256} onClick={() => setDraft(null)}>Iniciar revisión del archivo actual</button></div> : null}
    <p role="status">{assessment.reviewed} comprobados · {assessment.excluded} no aplicables · {assessment.pending} pendientes</p>
    <div className="artifact-review-fields">
      {inventory.map((field, index) => {
        const decision = !assessment.stale ? draft?.decisions.find((item) => item.fieldId === field.id) : undefined;
        const disabled = !output || busy || assessment.invalid || assessment.stale;
        return <fieldset key={field.id} disabled={disabled}>
          <legend>{index + 1}. {field.label}</legend>
          <small>Origen: {field.sourceLocation}</small>
          <label>Resultado<select value={decision?.disposition ?? 'pending'} onChange={(event) => update(field.id, { disposition: event.target.value as ArtifactFieldDecision['disposition'] })}>
            <option value="pending">Pendiente</option><option value="verified">Comprobado en el PDF</option>
            {field.allowNotApplicable ? <option value="not_applicable">No aplica, con motivo</option> : null}
          </select></label>
          <label>Ubicación en el PDF<input maxLength={200} placeholder="Página 1, bloque de referencias" value={decision?.outputLocation ?? ''} onChange={(event) => update(field.id, { outputLocation: event.target.value })} /></label>
          <label>Qué comprobó o por qué no aplica<textarea maxLength={2000} value={decision?.note ?? ''} onChange={(event) => update(field.id, { note: event.target.value })} /></label>
          <small>{assessment.items[index].status === 'pending' ? 'Falta revisión: resultado, ubicación y nota de al menos 12 caracteres; excluir exige motivo.' : 'Decisión registrada sólo en este borrador local.'}</small>
        </fieldset>;
      })}
    </div>
    <p className="semantic-stop">{assessment.readyForServerReview ? 'Borrador de revisión completo. Falta validarlo y persistirlo con identidad autorizada en el servidor.' : 'No se ha acreditado la cobertura completa del archivo.'} Este panel nunca habilita Operaciones, firma, Sales ni envío.</p>
  </section>;
}
