/** Scope acknowledgement only: never consumed by readiness or approval gates. */
export function MvpPendingNotice({ caseId }: { caseId: string }) {
  if (caseId !== 'f2fa004f-d674-446c-80ca-e929cce75b51') return null;
  return (
    <aside className="adaptive-review-note" aria-label="MVP pending acknowledgement">
      <strong>Pendiente — override de alcance MVP</strong>
      <p>Nota de alcance del 8 de septiembre de 2026 · Crane · XBFUS: Certificate of Insurance pendiente de entrega por el proveedor al autorizar la continuación de la demostración interna del MVP.</p>
      <p>Esta nota histórica no reemplaza el estado documental actual: no acredita cobertura ni monto, no satisface el requisito documental y no habilita firma ni envío. Al recibir el certificado, debe revisarse antes de cerrar este pendiente.</p>
    </aside>
  );
}
