# Sprint 13: conciliación productiva y corrección previa a activación

Fecha: 2026-09-05. Resultado: **NO-GO para promover directamente la preview**.
El desarrollo reciente no está instalado en producción. Se delimitó la actualización
y se corrigió localmente un fallo SQL antes de desplegarlo; no se modificó producción.

Objetivo preservado: completar el alta de XBF como cliente del transportista con
su formulario original, todos los documentos/requisitos y confirmaciones humanas.
La memoria corporativa evita repetir respuestas acreditadas; no entrena los pesos
del LLM ni convierte un paquete incompleto en uno aceptable para el carrier.

Modelo/esfuerzo recomendado para esta actividad: **GPT-6 Astra · Xhigh**.
No se cambió el modelo de la sesión ni se delegó a otros agentes. Se reutilizaron
el runbook de lote completo, la consulta de catálogo y el patrón interno de hotfix
SQL de `20260902054500`; sin dependencias ni infraestructura nuevas. Las habilidades
de checklist, depuración y pruebas exigieron conciliar el despliegue real, reproducir
el error y comprobar que la corrección conserva permisos e idempotencia.

## Evidencia actual, no inferida de Git

- Checkout `D:\andre\apps\codex-data\worktrees\Rateware\osp-s7-main-integration`,
  rama `codex/osp-s7-main-integration`. No se usó el cwd ambiental de carrier-list-templates.
- Candidato corregido: **`e4924b5d6f75d859fdfc1a8f9cf5304a6eed8406`**.
  Incluye la UI/APIs de `dc31dec` sin cambios y el hotfix SQL de este bloque.
- `git ls-remote`: la rama remota seguía en `1291fce`. Había 22 commits hasta
  `dc31dec` pendientes de push, antes de la documentación y este hotfix.
- Vercel resolvió `osp.heymarksman.com` a `dpl_Ggf4PYD79X66rfFLipw3kNuj5Fhe`,
  fuente `ed12d16`, `READY`, target `production`.
- La preview visible `dpl_eeDrKcQeJubUUpjeLtEhDCNreBQL` es **sintética**. No debe
  promoverse al dominio productivo. Su UI no prueba autenticación ni datos reales.
- Proyecto compartido verificado: `alqjqzqagdmcywpjtnnr`, `rateware-prod`,
  PostgreSQL **17.6**, `ACTIVE_HEALTHY`; sin proyecto nuevo.
- Snapshot SQL: **2026-09-05 17:19:12 UTC**, `transaction_read_only=on`.
  Los 14 objetos base consultados existen. Las cuatro tablas nuevas no existen.
  No aparecen las ocho migraciones previas en el ledger, ni con otra versión del
  mismo nombre. El nuevo hotfix es la novena. Esto corrige la lista incompleta
  de cuatro dependencias del informe anterior, sin alterar su evidencia histórica.
- El bucket exacto `osp-derived-documents` es privado, límite 26,214,400 bytes,
  con PDF/XLSX/DOCX en el orden esperado por el primer guard de migración.
- Salientes: `outbound_enabled=false`, `release_mode=shadow`.

Datos verificables y hashes: [snapshot JSON](releases/2026-09-05-activation-preflight.json).
Consulta reutilizable: [preflight de lectura](../../tools/osp-s13-release-preflight.sql).
El SQL devuelve sólo metadatos y conteos; nunca valores corporativos, documentos,
cuerpos de correo, tokens ni Vault. Las huellas MD5 de definiciones identifican
deriva, no son prueba criptográfica de integridad de un despliegue.

### Funciones mínimas de la actualización

Se recuperaron sus archivos desplegados y se compararon con el checkout candidato,
normalizando únicamente CRLF/LF. La versión del proveedor no se interpretó como SHA Git.

| Función | Versión instalada | Archivos iguales / recuperados | Motivo para actualizar |
| --- | ---: | ---: | --- |
| `osp-case-api` | 111 | 13 / 26 | Request Contract y frenos antes de las acciones consecuentes |
| `osp-worker` | 141 | 56 / 68 | Requisitos, destinos del original y completado fiel de tablas |
| `osp-form-api` | 82 | 7 / 13 | Referencias, captura/revisión y enlace de memoria |
| `osp-document-api` | 92 | 10 / 13 | Confirmación del lote documental completo |
| `osp-read-api` | 109 | 9 / 12 | Comparación completa del perfil |

El conteo incluye archivos sólo de tipos y diferencias de formato: no es un conteo
de defectos. Los archivos nuevos no se incluyen en el denominador remoto. Los
verificadores JWT/identidad recuperados permanecen iguales; no se propone cambiar
Google, Supabase Auth, roles o Kinde. `osp-gmail-poll`, `osp-gmail-sync-api`,
`osp-release-control` y funciones de otros productos quedan fuera del despliegue.
El cambio compartido de `http.ts` añade `FULFILLMENT_BLOCKED=409`; no obliga a
actualizar callers que no producen ese error. No se afirma que todos los bundles
del proyecto correspondan al mismo commit.

## Migraciones exactas, en orden

Los SHA-256 completos de cada archivo están en el snapshot JSON. **No ejecutar
`db push` indiscriminado**: el repositorio y Supabase se comparten con otros productos.

1. `20260902120000_osp_request_contract_semantic_stop.sql`: tipos/documentos,
   validación de adjuntos, catálogo de requisitos y MIME XLSM del bucket existente.
   Sí cambia configuración de Storage; no es solamente una lectura o DDL inerte.
2. `20260902130000_osp_operations_review_contract_gate.sql`: transición de Operaciones
   requiere revisión resuelta del manifiesto vigente; no certifica el paquete completo.
3. `20260905050000_osp_approved_profile_memory_reuse.sql`: lector de hechos acreditados.
4. `20260905053000_osp_case_answer_memory_candidates.sql`: captura append-only en
   guardados futuros; no hace backfill de respuestas históricas.
5. `20260905060000_osp_answer_memory_human_review.sql`: decisiones humanas separadas.
6. `20260905083000_osp_answer_memory_evidence_preflight.sql`: comparación en lectura.
7. `20260905110000_osp_answer_memory_evidence_links.sql`: enlace y renovación auditables.
8. `20260905143000_osp_profile_complete_batch_confirmation.sql`: comparación y wrapper
   atómico; revoca la ejecución directa del antiguo comando para el rol workflow.
9. `20260905173000_osp_request_constraint_actor_regex_hotfix.sql`: corrección de actor.

La primera migración y su hotfix deben quedar instalados antes de habilitar APIs
que llamen al comando. No cambiar el archivo histórico ya publicado en Git.

## Fallo reproducido y corregido localmente

El comando `record_request_knowledge_constraints_command` de la primera migración
usa `{1,256}`. PostgreSQL devuelve **2201B: invalid repetition count(s)** incluso
para una identidad válida. La prueba previa sólo comprobaba texto de la migración.

Se reprodujo con un `SELECT` constante en PostgreSQL 17.6, sin invocar comandos de
negocio. El hotfix separa alfabeto y longitud 1–256, rechaza `NULL` explícitamente y
preserva owner, `SECURITY DEFINER`, `search_path`, permisos y la lógica del ledger.
Falla si no encuentra el predicado exacto esperado; no oculta una segunda aplicación
ni sustituye otra definición desconocida.

Pruebas de este bloque:

- **6 tests Deno / 40 pasos, cero fallos**: error original, corrección ejecutable,
  identidad, permisos, extremos de longitud, replay, vigencia de manifiesto,
  captura/revisión de respuestas, renovación y lote completo.
- La regresión nueva aplica la migración original entera y el hotfix en PGlite.
  Dos proyecciones upstream del catálogo son fixtures deterministas; no se presenta
  como replay integral del esquema Supabase ni del paquete de nueve migraciones.
- **8/8** comprobaciones del predicado corregido en el PostgreSQL 17 productivo,
  sólo mediante expresiones `SELECT`; no se creó/reemplazó ninguna función remota.
- Deno format/lint, typecheck de los tests y diff-check aprobados.
- Contrato de acciones **168/168** vigente, sin nuevos endpoints ni grants.

No se repitió el smoke visual: no hay cambio de UI en este hotfix. El canary nativo
de concurrencia anterior era PostgreSQL 16.15; no llamarlo una prueba nativa 17.
No se arrancó Docker, el cluster temporal anterior ni un servicio nuevo.

## Riesgos concretos y secuencia de activación propuesta

**Falta el ensayo conjunto antes de solicitar la activación definitiva.** Preparar
el candidato `e4924b5` con las nueve migraciones en PostgreSQL 17 aislado/sintético,
incluyendo compatibilidad real de las consultas/API y el orden de actualización.
Las comprobaciones de existencia de objetos no prueban todas sus columnas,
constraints, RLS ni las transiciones entre versiones de UI/API.

Además, existe una cola productiva que no se puede drenar como prueba:

- Salzillo `ddbb675c-a769-4741-9b85-7d4798509913`: `sent`, versión 16, un formulario,
  dos manifiestos, un payload y un recibo de firma; sin cambios en este bloque.
- Trabajo `1cdf4b0a-6d24-419e-b579-1046c4fae35a` de `generate_supplier_package`,
  para ese mismo Salzillo: pendiente, intento 0, sin lease. **No ejecutarlo,
  cancelarlo, eliminarlo ni cambiarlo sin autorización específica.**
- Hay diez trabajos trimestrales pendientes. Los cron de intake cada cinco minutos
  y de revisión diaria están activos. El poller puede llamar al worker existente.
  Antes de desplegarlo, identificar y contener la ejecución programada durante la
  ventana; pausar/restaurar cron o controles requiere autorización, no se hizo aquí.
- No se inspeccionaron valores de flags/secrets remotos: `outbound_enabled=false`
  no demuestra por sí solo que las allowlists de firma/paquete estén deshabilitadas.
  Verificar su estado sin revelar secretos. En los resolvers actuales un flag vacío
  significa apagado; el literal `false` puede ser configuración inválida.

Secuencia posterior, con alcance autorizado y reconciliado de nuevo:

1. Ensayo local conjunto, fuente Git exacta, hashes, respaldo de bundles/config y
   validación de los permisos de compatibilidad. Sin tocar los datos de Salzillo.
2. Preparar una **nueva compilación** con `VITE_OSP_AUTH_PROVIDER=supabase`,
   `VITE_OSP_BUILD_PROFILE=production-readonly` y el proyecto compartido. El nombre
   histórico `production-readonly` NO es un bloqueo global de escrituras.
   Validar configuración existente sin imprimir claves. No promover el build sintético.
3. Ventana controlada que contenga jobs y acciones de usuarios, aplicar sólo los SQL
   aprobados, desplegar las cinco funciones y coordinar la UI compatible. Hay schemas
   estrictos: no asumir que una UI antigua admite respuestas nuevas. Las sesiones
   antiguas pueden requerir recarga; probar el orden en el ensayo, no improvisarlo en vivo.
4. Canary autenticado `sales@heymarksman.com`, sólo perfil/formulario/revisión en
   lectura de Salzillo; Crane `f2fa004f-d674-446c-80ca-e929cce75b51` como caso sin
   binding/formulario. Leer no debe crear una candidata ni un binding.
5. Confirmar HTTP 200, parseo UI, entidad correcta y comparación sólo donde exista
   evidencia; repetir baselines. Cero guardados, promociones, aprobaciones, firmas,
   jobs iniciados, correos o webhooks causados por el canary. No invocar el worker.
6. Si falla, detener la activación. Preservar tablas/recibos y el job pendiente.
   Restaurar UI/bundles sólo con la compatibilidad probada. No reotorgar automáticamente
   el comando de promoción directo revocado: mantener esa escritura bloqueada hasta
   un forward-fix. No basta una promesa genérica de rollback por URL.

`gmailLedgerReceipts=0` en una tabla no demuestra ausencia de un correo histórico:
no es permiso para reenviar ni motivo para cambiar el estado `sent`.

## Qué no se completó aquí

Sin push, migraciones remotas, despliegues, cambios de cron/config, datos de negocio,
firmas, autorización Sales, correos, webhooks, cargos ni nueva infraestructura.
No se certificó el paquete corregido de Salzillo: siguen separados el ensayo de
activación, los faltantes reales y la aprobación del paquete completo antes del envío.
El inventario de celdas y la revisión exacta del PDF requieren su validación real;
una pantalla que sólo aparece en `preview-synthetic` no cuenta como funcionalidad
productiva terminada. Ver los pendientes de [cierre Salzillo](salzillo-closeout.md).
