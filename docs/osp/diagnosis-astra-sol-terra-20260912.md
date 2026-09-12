# Diagnóstico de cierre OSP v1 — 12 septiembre 2026

Estado: NO-GO para declarar el objetivo completo. Diagnóstico de código y consultas productivas de solo lectura; no certifica artefactos finales ni una sesión UI nueva. Base Git bc07a3e en codex/osp-production-closeout-20260908. El parser de reenvío y su prueba tienen cambios locales sin publicar. No sobrescribirlos ni asumir que están integrados.

## Resultado exigido

Mantener las seis puertas de production-exit-plan-20260908.md: requerimientos, fidelidad, evidencia, recorrido UI, paquete/entrega y producción. Salzillo histórico ddbb675c-a769-4741-9b85-7d4798509913 es inmutable para esta tarea. La prueba corregida necesita un expediente separado. Los dos casos reales PDF/DOCX necesitan identidad y procedencia explícitas: dos archivos o dos correos de un mismo hilo no prueban dos casos.

Se reutiliza Rateware/OSP y el producto actual. No hay nueva infraestructura ni cargos. Una excepción mantiene el faltante visible y su alcance; no afirma que existe el COI pendiente ni que una imagen demuestra firma autógrafa. Sales debe autorizar específicamente la entrega exacta.

## Evidencia actual y límites

Consultas de 12 septiembre, proyecto alqjqzqagdmcywpjtnnr:

- Tablas supplier_package_sets, package_set_member_reviews y package_set_operations_reviews existen. Documentos antiguos que dicen que faltan no describen el estado actual.
- Los cinco casos del tenant ca0a8f30-1382-4316-9bd5-cb76d9ab4920 tienen cero filas en esas tres tablas. Esto no niega paquetes legacy: demuestra ausencia de evidencia del nuevo recorrido.
- Crane f2fa004f-d674-446c-80ca-e929cce75b51 está awaiting_clarification. Salzillo histórico está sent.
- Job 5611ec1f-9238-480b-8289-e9305f1c9f19: intento 1, finalizado con INVALID_INPUT; log previo identifica mime_parse / UNQUALIFIED_GMAIL_MESSAGE. Job c3f07cf7-05f9-4997-8407-52555103e415: intento 0, pendiente.
- Cron osp-gmail-poll-every-5-minutes existe, active=false. Quarterly-document-check está activo. No se necesita inferir que falta Pub/Sub para esta modalidad.
- Funciones ACTIVE: worker 218, gmail-sync-api 162, case-api 187, read-api 186, document-api 169, form-api 158. Versiones activas no prueban por sí solas correspondencia de todo el código o compatibilidad semántica.
- bc07a3e desplegó rechazo de falso éxito en ejecución exacta y replay de fallo terminal. No vuelve procesable el job fallido.
- outbound_enabled=false en última consulta. No se invocaron jobs, firmas ni correos durante el diagnóstico.
- No se verificó en este diagnóstico un nuevo login, alias actual de Vercel, render de archivos finales ni rollback ejecutado. Esas pruebas siguen abiertas.

## Causas y paquetes de implementación para Sol

### S1. Captura y procedencia del requerimiento — prioridad P0

gmail-envelope.ts exige proveedor externo en destinatarios. El reenvío real Sales → Carriers no lo tiene; el proveedor está en el original RFC822 adjunto. El gate SQL permite el relay, pero el parser no lo interpretaba. El cambio local añade una opción que aún no se conecta a intake: no desplegarlo como solución terminada.

Sol: definir un resultado de procedencia que preserve separadamente sobre de transporte, original, identidad del proveedor, destinatarios de respuesta y hashes. Conectar la interpretación solo al flujo permitido; validar remitente del original, relación con XBF, cardinalidad, tamaño y adjuntos. Conciliar original y enmienda QF-167/QF-168 sin perder historial. No convertir automáticamente al reenviador interno en destinatario final ni inventar un To externo.

Archivos iniciales: _shared/osp/gmail-envelope.ts; osp-worker/intake-service.ts, shadow-runtime.ts, postgres-intake-persistence.ts; osp-gmail-sync-api/historical-import-store.ts. Prefijo: supabase/functions/.

Gate Terra: original y enmienda aparecen en el caso correcto, cuerpo y adjuntos conservan hashes y no hay duplicado; falta/ambigüedad produce error explícito. Recuperación del job fallido conserva evidencia anterior y usa mecanismo idempotente revisado. No drenar cola global.

### S2. Requisitos y archivos originales — prioridad P0

Los runtimes supplier-package-runtime.ts:266/276 y supplier-package-set-runtime.ts:147 construyen mappings PDF/DOCX como appendix. Los motores soportan AcroForm/overlay y content_control, pero ese runtime no los selecciona: añade respuestas sin demostrar llenado del original. La revisión de Salzillo identifica dos páginas, referencias, cuestionarios, declaraciones y zonas exclusivas del carrier. Cada sección debe estar conciliada con fuente y destino.

Sol: reutilizar mapa y formulario, completar destinos del original o permitir cargar una corrección humana vinculada al hash de origen. Preservar páginas, fórmulas y áreas internas. Hacer explícito si un formato carece de soporte automático. Incorporar correo y enmiendas al contrato sin borrar requisitos.

Archivos: _shared/osp/pdf-form-completer.ts, docx-form-completer.ts, xlsx-form-completer.ts, request-contract.ts; osp-worker/reviewed-spreadsheet-targets.ts y supplier-package-set-*.ts; docs/osp/maps/salzillo-format-3-3.json.

Gate Terra: inspección visual de todas las páginas de Salzillo corregido aislado y de los dos casos reales; leer valores en sus posiciones, comprobar soportes, formato de entrega y ausencia de datos inventados. Un caso bloqueado solo prueba el negativo; no satisface la prueba positiva de formulario completo.

### S3. Vigencia y revisión persistente — prioridad P0

request-contract.ts:648 evalúa expiresAt dentro de maximumAgeDays != null: un soporte vencido sin exigencia de antigüedad puede no ser rechazado por ese control. SQL de snapshot sí tiene verificación de fechas (20260824111323_osp_signature_application.sql:101–106); es una inconsistencia de evaluación y selección, no evidencia de envío indebido. Separar expiración absoluta de antigüedad. request-semantic-gate.ts usa evidencia legacy y necesita conciliar las inspecciones del conjunto con la completitud evaluada.

Sol: comprobar vencimiento independientemente del máximo de edad; invalidar fechas inválidas y revisiones desactualizadas. Derivar evidencia de revisiones persistentes vinculadas a source/output/request/set hashes; no convertir un porcentaje escrito en prueba automática de fidelidad. Guardar justificación, actor y alcance de excepciones.

Hallazgo final Astra: request-contract.ts declara waived pero el evaluador no produce ese estado. Resolver aclaraciones como answered/external/not_applicable no alimenta por sí solo aplicabilidad del contrato reconstruido desde manifest_json. Conectar la decisión a un requisito estable y su versión; incluir su hash en revisión/aprobación. Texto libre o estado resolved no equivalen a dispensa válida.

Gate Terra: recargar UI conserva revisiones; sustituir un byte, versión de requisito o soporte invalida aprobación previa. Probar vencido sin maximumAgeDays, empresa equivocada, COI ausente, firma inaplicable y sección faltante. Cada negativo bloquea la transición correspondiente.

### S4. Un mismo conjunto hasta firma, Sales y entrega — prioridad P0

outbound-draft.ts:314 selecciona un único generated_packages signed; descarga legacy en :869. La función SQL productiva prepare_signature_application referencia generated_packages y no directamente supplier_package_sets. Esta observación requiere revisar también sus llamadas antes de cambiar SQL. Astra detecta que request-semantic-gate y signature-approval no transportan la identidad completa de revisión/conjunto.

Sol: conectar el conjunto aprobado a preparación de firma aplicable por miembro, manifiesto firmado resultante, congelación y autorización Sales. Preservar todos los adjuntos requeridos; hash/version de conjunto aprobado y destinatarios/cuerpo deben quedar inmutables. Conservar compatibilidad de lectura legacy y Salzillo histórico. No crear otra ruta paralela que eluda gates.

Gate Terra: al cambiar archivo, soporte, requisito, firma o destinatario se invalida la autorización anterior. La descarga y el payload contienen exactamente el conjunto aprobado. Prueba de idempotencia concurrente y fallo ambiguo del proveedor: reconciliar recibo antes de reintentar. La entrega real solo bajo autorización específica; mientras falte, registrar entrega pendiente.

### S5. Liberación coordinada y operación — prioridad P0

Sol: consolidar contrato UI/API/SQL y manifest de release; reparar la proyección de salud para distinguir cron apagado, token no renovable y fallo de ejecución. Mantener el mecanismo de cron existente. Proponer una activación acotada luego de cerrar S1–S4 y reconciliar cola.

Terra: ejecutar runbook siguiente, registrar resultados; ante causa nueva devolver a Sol/Astra, sin alterar gates para lograr PASS.

## Runbook para Terra

1. Verificar worktree, rama, HEAD, diff y remoto privado OSP. Identificar los tres canaries y excluir Salzillo histórico y registros Rateware ajenos. Capturar baseline de estados y controles.
2. Comparar migraciones por contenido y definición con ledger real, no solo timestamp. El release de septiembre 8 usó timestamps de aplicación distintos. No usar db push general.
3. Ensayar SQL cambiado con roles, RLS, triggers y consumidores reales; ejecutar pruebas negativas y concurrencia relevantes. Build de cada función con su import map y entrada real. Registrar hash del candidato único.
4. Preview autenticada con esquema compatible; ejecutar S1–S4 y conservar artefactos y recibos de UI por caso. La preview sintética solo sirve de ensayo.
5. Antes de promoción, verificar backups de funciones/definiciones y deployment UI anterior compatibles. Probar recuperación en ensayo; no ejecutar un rollback que borre evidencia ni revierta datos de negocio.
6. Desplegar candidato coordinado autorizado. Repetir lectura y recorrido permitido desde UI; comparar hashes y estados. Si falla, aislar el release y aplicar rollback compatible documentado.
7. Conciliar cola, demostrar salud de cron/token y activar solo alcance autorizado. No confundir captura programada con envío automático.
8. Firma/correo: comprobar autorización concreta vigente, paquete, método y destinatarios. Si no existe, detener esa acción y dejar el resultado preparado. No reutilizar autorización histórica para nuevos bytes.

## Reparto y regla de cierre

| Responsable | Modelo / esfuerzo | Entrega |
|---|---|---|
| Diagnóstico y conflictos de contrato | Astra / alto | Causas priorizadas y revisión de solución integrada |
| Implementación S1–S5 | Sol / alto | Un candidato coherente con pruebas y migraciones concretas |
| Ensayo, UI y release | Terra / medio | Evidencia reproducible; escalar errores nuevos en vez de improvisar |

Dependencias de cierre: contrato de conjunto y decisiones → generación/corrección original → consumidores firma/Sales/envío → certificación. S1 puede resolverse como tarea acotada de captura en paralelo conceptual, pero no sustituye esas dependencias ni cierra una puerta por sí solo. No contar cada hotfix como sprint terminado. El criterio de fin son las seis puertas del plan original sobre los tres canaries, no el número de commits o tests. La ausencia de revisión/entrega final sigue siendo pendiente, incluso si el código pasa pruebas.

Astra terminó 41 pruebas focalizadas locales de contrato, multiformulario, revisión de conjunto, idempotencia y relay. Pasaron; no acreditan DB/Gmail/UI productivos. Se cierra la fase de diagnóstico amplio. Sol implementa y Terra valida; volver a Astra únicamente por un conflicto nuevo concreto.
