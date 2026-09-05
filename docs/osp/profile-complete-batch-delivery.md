# Sprint 13 · lote documental completo y concurrencia real

## Resultado y alcance

OSP conserva el objetivo: responder altas de XBF como cliente de transportistas,
con todos los requisitos del proveedor y aprobación humana de las acciones
consecuentes. Este bloque mejora el catálogo corporativo reutilizable; no completa
por sí solo un paquete Salzillo, no entrena pesos del LLM y no sustituye los gates
de cumplimiento, firma, Sales o envío.

Actividad recomendada: **GPT-6 Astra · Xhigh** (reglas, integridad y concurrencia).
No se cambió el modelo configurado ni se lanzaron agentes independientes.
Se reutilizó la revisión documental, el ledger de hechos y su comando de publicación.
Las habilidades `engineering:testing-strategy` y `engineering:deploy-checklist`
guiaron pruebas de identidad, integridad, reintento y preview aislada.

Entrega local + preview sintética. Sin push, producción, migraciones remotas,
datos reales, servicios de pago nuevos, firmas, correos ni webhooks.

## Cambios

- El perfil muestra todos los campos de la revisión: nuevo, reemplaza, sin cambio,
  reservado, rechazado o bloqueado. Antes/después se ocultan para campos excluidos
  o restringidos; no se transmite su valor a la UI.
- La publicación requiere una sola confirmación del lote completo, no un subconjunto
  de campos. Una nueva revisión, huella o comparación reinicia la confirmación.
- La comparación incluye en su huella la entidad, revisión, respaldo, todos los
  campos (también los excluidos), hechos actuales y fecha de evaluación.
- El servidor bloquea respaldo vencido, futuro, retirado o sin verificar; entidad
  inactiva; campos pendientes/restringidos; valores ausentes; lotes incompletos,
  duplicados o mayores de 128 campos. La UI no publica usando un resumen antiguo.
- El wrapper atómico conserva el comando de ledger existente, pero retira su
  ejecución directa al rol workflow. Comprueba huella, revisión y mapa exacto de
  IDs bajo locks antes de invocarlo. El recibo guarda comparación, actor y mapa.
- Replay: misma revisión, actor, mapa y huella devuelve el mismo recibo, sin otro
  hecho. Una intención distinta falla. Un recibo histórico no concede vigencia.
- Un valor igual conserva su procedencia original. Renovar su evidencia requiere
  el enlace auditable del bloque anterior, no una reescritura silenciosa.

Archivos centrales: `20260905143000_osp_profile_complete_batch_confirmation.sql`,
`ProfilePromotionBatchPanel.tsx`, `profile-promotion-batch-contract.ts`,
`osp-read-api`, `osp-document-api`. Dos funciones nuevas; ningún endpoint nuevo.

## Concurrencia nativa y fallo descubierto

No se tocó `C:\Program Files\PostgreSQL\16\data` (sólo quedaban datos, sin binarios).
Se descargaron los binarios portables enlazados por
[PostgreSQL para Windows](https://www.postgresql.org/download/windows/) y
[EDB](https://www.enterprisedb.com/download-postgresql-binaries): PostgreSQL 16.15,
Windows x64, archivo `postgresql-16.15-3-windows-x64-binaries.zip`.
SHA-256 local: `5e8afffe67daf949aeeb03b74951f1ec2324e1888f73fbd036ab0e567ab004d9`.
El ejecutable no tiene firma Authenticode; el hash identifica el artefacto usado,
no se presenta como validación de una firma del proveedor.

Cluster temporal en `tmp/osp-s13-pg-concurrency-tools/cluster`, puerto 55471,
escucha sólo `127.0.0.1`, usuario `osp_local_test`, sin Docker ni servicio Windows.
El test verifica host, puerto, usuario, base, directorio real y base vacía antes
de inicializar. No usa `DATABASE_URL` ni credenciales Supabase. Sólo datos sintéticos.
Tres sesiones independientes, PostgreSQL 16.15 y `postgres` 3.4.7: PIDs del canary
final **25500, 37624, 11688**, base `osp_evidence_concurrency_run_3`.

Prueba final: **1 test / 9 pasos**, incluyendo diez clases de locks de origen,
edición confirmada después de comparar, misma clave simultánea, clave con otra
intención, claves distintas para el mismo vínculo, revocación posterior, encoding
nativo, contención de respaldo/hecho durante publicación y publicación simultánea.
En la carrera final hubo una publicación, un replay y tres hechos actuales;
cuatro filas históricas y dos promociones en total, sin duplicados.

La prueba nativa detectó que `${JSON.stringify(ids)}::jsonb` llegaba como JSON
de tipo **string**, no **object**. Esto producía `PROFILE_FACT_PROMOTION_FORBIDDEN`.
Se corrigió exclusivamente el mapa de expectativas de esta operación a
`::text::jsonb`, con caracterización nativa de ambos tipos y regresión del store.
No se interpreta este hallazgo como auditoría de todos los comandos históricos.

Fallos preservados: comparación inicial de dirección con `/32` en el harness;
run 2 con seis pasos aprobados y dos fallidos por encoding; pruebas de tipos del
harness; build con nueve chunks iniciales y manifest sin tres archivos nuevos.
Se corrigieron sin omitir gates ni aumentar presupuestos. PostgreSQL emite avisos
25P01 por rollback de limpieza tras commit; no son fallos de operaciones.
**El cluster quedó detenido y se verificó que el puerto 55471 ya no escucha.**
Se conservaron directorio, logs y bases sintéticas para trazabilidad.

Para repetir: arrancar únicamente ese cluster aislado, crear una base vacía con
nombre `osp_evidence_concurrency_run_<numero>`, establecer `OSP_LOCAL_PG_CONCURRENCY=1`,
`OSP_LOCAL_PG_DATABASE` y `OSP_LOCAL_PG_DIRECTORY` al directorio exacto y ejecutar
`answer-evidence-concurrency.test.ts` con permiso de red sólo `127.0.0.1:55471`.
Detener el cluster en `finally`; el test no reinicia ni borra bases existentes.

## Verificación

- **62 Vitest** / seis archivos: comparación, alcance, confirmación, UI anterior,
  contratos, red ambigua sin retry y runtime sintético.
- **60 Deno / 13 pasos**: SQL real embebido, exclusiones, vigencia, permisos,
  revisión/huella/matriz obsoletas, publicación, replay, HTTP y lectura.
- **1 nativo / 9 pasos** descrito arriba. No es una prueba de carga ni prueba
  de configuración, RLS completa o rendimiento del Supabase productivo.
- **39 pruebas de frontera UI**, inventario explícito **168/168 acciones**
  (53 Edge, 115 PostgreSQL); sin aumentar autoridad de firma o envío.
- TypeScript, Deno check de cuatro módulos operativos, ESLint enfocado y diff-check.
- Build sintético: **429 módulos**, sin aumentar el máximo de ocho chunks iniciales.
  Se evitó cargar dos veces el parser en chunks UI diferentes.
- Smoke local desktop 1280×900 y mobile 390×844: cinco disposiciones, un recibo
  sintético, cero escrituras de red/persistentes, cero solicitudes externas, cero
  errores y cero overflow; recargar reinicia la confirmación. Inspección visual
  del antes/después, exclusiones y botón móvil. Conserva estilos XBF existentes.
- Regresión local del formulario: aceptación, descarte obsoleto, dos comparaciones
  y una renovación sintética; sin red saliente. Se bloquearon las dos fuentes
  Open Sans preexistentes de SurveyJS.

Evidencia local: `tmp/osp-s13-complete-batch-evidence/local/` y
`tmp/osp-s13-evidence-link-evidence/`. Tokens de acceso nunca se incluyen en Git.

## Activación y rollback pendientes

No se consultó/aplicó el ledger remoto en este bloque. Antes de cualquier
activación hay que conciliar las migraciones pendientes del reader/puente/lote
(`20260905050000`, `20260905083000`, `20260905110000`, `20260905143000`) con el
estado real; no asumir que faltan todas ni aplicar otras migraciones del repositorio.
La nueva lectura depende de su función SQL y el nuevo comando exige comparación.
Orden futuro, sólo con autorización específica: migraciones exactas verificadas,
APIs correspondientes, lectura autenticada, luego UI y canary acotado. Nada de esto
fue desplegado a producción aquí.

Rollback de preview: abrir la anterior `dpl_FHoyEVEucHnWDmXFwXCcahu8vmMd`.
No borrar evidencia. Si se activara el SQL nuevo, no basta volver a una API vieja:
su comando directo quedó revocado. Mantener publicaciones deshabilitadas y lectura
compatible hasta un forward-fix o una restauración de permisos expresamente revisada.
No restaurar automáticamente la publicación sin comparación.

## Preview cloud verificada

- Fuente: `dc31dec7e7316ec5aaeccb349dfeecff5d5b420d`.
- Deployment: `dpl_eeDrKcQeJubUUpjeLtEhDCNreBQL`.
- Proyecto existente: `prj_6mVnZ4DNVH3U2KCyQgyRMZDCJx8s`.
- Vercel confirmó `READY`, target `null`, aliases vacíos, `gitCommitSha` y
  `ospSourceSha` iguales a la fuente; scope `synthetic-complete-batch-preview`.
- [Perfil en preview](https://osp-customer-setup-p16vcw55o-elandopando8892s-projects.vercel.app/app/profile).

Se enviaron sólo 33 archivos estáticos más configuración de rutas (4,566,687 bytes
en el output). No se publicaron ZIP, bases de prueba, SQL, .env ni documentos reales.
El árbol rastreado estaba limpio; `gitDirty=1` corresponde a `tmp/` sin rastrear.
Se conservó la protección SSO de Vercel y se usó acceso temporal para probarla.

Smoke cloud del perfil: cinco campos/disposiciones, un recibo sintético de lote,
confirmación reiniciada al recargar, cero solicitudes externas o escrituras de
red/persistentes, cero errores y cero overflow en 390×844. Inspección visual cloud
del botón móvil, exclusiones y antes/después. Capturas y `proof.json` en
`tmp/osp-s13-complete-batch-evidence/cloud/`.

Regresión cloud del formulario también aprobada: dos comparaciones, una aceptación,
un descarte obsoleto y una renovación sintética; dos fuentes externas existentes
bloqueadas, ninguna escritura o solicitud externa permitida, sin errores/overflow.
Esta evidencia no es autenticación Google real ni validación del backend productivo.
El panel de la app aceptó la apertura del enlace en estado `queued`.
