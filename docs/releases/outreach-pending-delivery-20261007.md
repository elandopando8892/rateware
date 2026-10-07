# Borradores de preguntas visibles en la Cola

7/oct/2026. Autorización humana: «Autorizo» al paquete probado de migración y despliegue. SQL aplicado una vez; rateware-api **686 ACTIVE**, 17 archivos verificados, únicamente index.ts cambiado.

El carrier ya cotizado ocultaba preguntas pendientes en el filtro y contador. La proyección de entrega preserva drafted/queued/sending sin recibo; deduplicación y totales por carrier usan el clasificador anterior. No se modifican ofertas ni se envían correos.

Lectura real: 0 borradores antes, 3 después (dos preguntas y otro borrador); también reaparece un queued. Total 101 mensajes y 98 carriers; 4 carriers cotizados antes/después. Dos preguntas siguen drafted con cero recibos.

Pruebas: 13 Node y 11 escenarios en PostgreSQL17 local con fixtures sintéticos, incluyendo rollback exacto, permisos y límites de propietario/evento/canal. Deno check aprobado. Evidencia detallada conservada en Bidware .test-output/carrier-release-20261007/queue-tracking; benchmark y límites en docs/releases/carrier-excel-20261007/queue-pending-questions.md.

Migración SHA256 2e5411ef67cbf29b4e87e2ff3d3fce34802c506c90f7c5fe8998bcf563e12e79; index.ts candidato 302660cfa8d12f371f513fa1809bae5da57b5cd54c041e3930d2fcf75600f5c0. Reversión guardada en docs/sql/rollback-outreach-pending-delivery-20261007.sql.

Codex nativo integra y verifica; modelo/esfuerzo efectivos no observables. Sin llamadas Claude. La verificación de interfaz se registra por separado en Bidware; no se equipara un SELECT con una comprobación de navegador.
