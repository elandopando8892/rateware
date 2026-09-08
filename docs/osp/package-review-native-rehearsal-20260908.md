# OSP: revisión del paquete con PostgreSQL 17 y driver real

Fecha: 8 de septiembre de 2026. Ensayo local sintético; no es despliegue.
Base: `0e3c530`, más la corrección de transporte JSON y las pruebas de este cambio.

## Resultado y corrección

La prueba anterior usaba sustitutos SQL para validar actor y vigencia del snapshot.
Ahora ejecuta los validadores reales de las migraciones `20260831133838`,
`20260830034601` y `package_snapshot_hash_is_current` de `20260824111323`.
Sus definiciones se contrastaron en lectura con el Supabase compartido.
También aplica completas y juntas las cuatro migraciones nuevas de conjuntos:
`20260908160000`, `20260908180000`, `20260908190000`, `20260908200000`.

El ensayo nativo detectó doble codificación del JSON serializado con postgres.js.
El actor llegaba como escalar JSON en `package-member-review-store`, provocando
un rechazo de autorización. Se convirtió explícitamente texto a JSONB en ese
guardado y en el recibo de `package-set-review-store`, como ya hace el worker.
No se cambiaron permisos, reglas de aprobación, restricciones SQL ni timeouts.

## Ejecuciones preservadas

| Base local | Evidencia |
| --- | --- |
| `osp_package_review_run_1` | Falló el armado del fixture: el plan de fuentes fue recibido como escalar JSON. Sin aceptación del recorrido. |
| `osp_package_review_run_2` | Fixture corregido; falló el guardado real de inspección por actor JSON escalar. Los fallos posteriores son cascada o adaptación de resultados del driver, no cinco defectos independientes. |
| `osp_package_review_run_3` | PostgreSQL 17.11: una prueba, diez pasos aprobados, cero fallos, diez segundos. Dos sesiones distintas completaron concurrentemente la misma revisión: una transición y un recibo; el otro resultado fue replay. |

Los diez pasos comprueban rollback ante fallo de recibo, rechazo de revisión
obsoleta, captura y recarga de inspecciones reales, faltantes bloqueados, actor
vencido/incompatible rechazado por SQL, snapshot obsoleto rechazado, finalización
atómica, replay con sesión fresca, inmutabilidad y aislamiento de los recibos.
Las regresiones de snapshot incluyen formulario cambiado, documento descartado,
vencido o sustituido, extracción o mapping ausente y snapshot posterior.

## Entorno y repetición

Se reutilizó el cluster local existente `osp-s13-pg17-rehearsal/cluster`,
exclusivamente en `127.0.0.1:55472`. No Docker, servicio Windows ni infraestructura
cloud nueva. El adaptador exige usuario, host, puerto, directorio exacto, versión
mayor 17 y una base vacía llamada `osp_package_review_run_<n>` antes de ejecutar DDL.
No reciclar ni borrar las tres bases: conservan el historial de fallos.
Al terminar se detuvo el cluster con `pg_ctl -m fast -w stop`; la consulta
posterior `pg_ctl status` confirmó que no hay servidor en ese directorio.

Prueba: `supabase/functions/osp-case-api/package-set-review-store.integration.test.ts`.
Adaptador: `supabase/functions/osp-case-api/package-review-test-db.ts`.
Sin `OSP_LOCAL_PACKAGE_REVIEW=1` usa PGlite. En modo nativo exige
`OSP_LOCAL_PG_DATABASE` y `OSP_LOCAL_PG_DIRECTORY`; los valores se validan contra
el cluster local permitido. La red del proceso de prueba se limitó a
`--allow-net=127.0.0.1:55472`. El adaptador fija las transacciones a conexiones
reales; no simula concurrencia sobre una única conexión.

## Límites de la evidencia

La base sigue siendo un fixture de tablas acotado, **no un clon completo de
Rateware/OSP**. No prueba el resto de triggers, esquema, volumen o RLS productivos.
Sí ejecuta las cuatro migraciones nuevas y los validadores de aprobación/vigencia
reales, con el driver postgres.js y concurrencia nativa.
No certifica Google Auth, UI, fidelidad de los tres paquetes, firma ni entrega.
No hubo escrituras en Supabase, cambios al Salzillo histórico, correos ni webhooks.
El hito 1 sigue pendiente del recorrido autenticado compatible.

Validación adicional tras corregir los dos stores: 20 pruebas y diez pasos
aprobados (HTTP, proyección de capacidades e integración PGlite), cero fallos.
Lint Deno de los cuatro archivos pasó. La comprobación de tipos de la UI pendiente
del checkpoint anterior terminó con código cero, antes de este cambio exclusivo
del backend y de pruebas. Las 13 huellas de dependencia de `osp-case-api` se
reconciliaron únicamente por las conversiones JSON de los dos stores; no se
cambiaron otras superficies, metadatos de permisos ni la huella del worker.

Validaciones finales adicionales: contrato completo 169/169 aprobado; UI/cliente
30/30 aprobadas en 39,91 segundos; Chrome una prueba aprobada en 34,2 segundos,
guardando y recuperando la inspección tras recargar y completando Operaciones una
sola vez. Se inspeccionaron capturas de 1440x1000 y 390x844, sin desbordamiento
horizontal. Ese navegador usa un harness con JWT sintético y backend HTTP
controlado: **no constituye Google Auth real, UI completa ni canary productivo**.
Las capturas están en `apps/osp/test-results/approval-communications-me-56aae-eload-on-desktop-and-mobile/`.
El formulario ofrece una nueva inspección vacía después de guardar: es funcional,
pero esa presentación y la selección de versión de política de firma aún deben
simplificarse antes de considerar cerrada la experiencia operacional.
