import { OspApiError, type OspClient } from '../../api/osp-client';
import '../../styles/pipeline.css';
import { deriveMailboxHealth } from './pipeline-health';
import { usePipelineOverview } from './use-pipeline-overview';

const SAFE_INCIDENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function safeIncidentId(error: unknown): string {
  if (!(error instanceof OspApiError)) return '';
  const incidentId = error.incidentId.trim();
  if (/bearer|token|authorization/i.test(incidentId)) return '';
  return SAFE_INCIDENT_ID.test(incidentId) ? incidentId : '';
}

function ReadAlert({
  label,
  guidance,
  retryLabel,
  error,
  onRetry,
}: {
  label: string;
  guidance: string;
  retryLabel: string;
  error: unknown;
  onRetry: () => void;
}) {
  const incidentId = safeIncidentId(error);
  return (
    <div className="pipeline-alert" role="alert" aria-label={label}>
      <p>{guidance}</p>
      {incidentId ? <p>ID de incidente: {incidentId}</p> : null}
      <button type="button" onClick={onRetry}>{retryLabel}</button>
    </div>
  );
}

export function PipelineOverview({ client }: { client: OspClient }) {
  const { pipeline, gmail } = usePipelineOverview(client);
  const mailboxHealth = deriveMailboxHealth(gmail.data?.data.connections);

  return (
    <section className="pipeline-overview" aria-labelledby="pipeline-overview-title">
      <header className="pipeline-overview__header">
        <p className="pipeline-overview__eyebrow">Pipeline OSP</p>
        <h2>Pipeline</h2>
        <h3 id="pipeline-overview-title">Vista global de la organización</h3>
        <p>
          Los conteos provienen del modelo de lectura del servidor; esta consulta no representa
          una lista completa de expedientes.
        </p>
      </header>

      <section className="pipeline-panel" aria-labelledby="pipeline-counts-title">
        <h3 id="pipeline-counts-title">Conteos del pipeline</h3>
        {pipeline.isPending ? (
          <p role="status" aria-label="Cargando conteos del pipeline">Cargando conteos…</p>
        ) : null}
        {pipeline.data ? (
          <dl className="pipeline-metrics" role="group" aria-label="Conteos del pipeline">
            <div><dt>Total</dt><dd>{pipeline.data.data.metrics.total}</dd></div>
            <div><dt>Bloqueados</dt><dd>{pipeline.data.data.metrics.blocked}</dd></div>
            <div><dt>Requieren aprobación</dt><dd>{pipeline.data.data.metrics.approval}</dd></div>
            <div><dt>Vencidos</dt><dd>{pipeline.data.data.metrics.overdue}</dd></div>
          </dl>
        ) : null}
        {pipeline.isError ? (
          <ReadAlert
            label="Error de conteos del pipeline"
            guidance="No se pudieron cargar los conteos. Selecciona Reintentar conteos del pipeline; si persiste, comparte el ID de incidente con soporte."
            retryLabel="Reintentar conteos del pipeline"
            error={pipeline.error}
            onRetry={() => { void pipeline.refetch(); }}
          />
        ) : null}
      </section>

      <section className="pipeline-panel" aria-labelledby="mailbox-status-title">
        <h3 id="mailbox-status-title">Estado del buzón de captura</h3>
        {gmail.isPending ? (
          <p role="status" aria-label="Cargando estado del buzón">Cargando estado del buzón…</p>
        ) : null}
        {gmail.data ? (
          <dl className="mailbox-status">
            <div><dt>Buzón</dt><dd>{gmail.data.data.mailbox_email}</dd></div>
            <div><dt>Estado</dt><dd>{gmail.isError ? 'unknown' : mailboxHealth}</dd></div>
          </dl>
        ) : null}
        {gmail.isError ? (
          <>
            {!gmail.data ? (
              <dl className="mailbox-status">
                <div><dt>Estado</dt><dd>unknown</dd></div>
              </dl>
            ) : null}
            <ReadAlert
              label="Error de estado del buzón"
              guidance="No se pudo verificar el buzón. Selecciona Reintentar estado del buzón; si persiste, comparte el ID de incidente con soporte."
              retryLabel="Reintentar estado del buzón"
              error={gmail.error}
              onRetry={() => { void gmail.refetch(); }}
            />
          </>
        ) : null}
      </section>
    </section>
  );
}
