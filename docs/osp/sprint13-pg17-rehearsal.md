# Sprint 13 — ensayo conjunto PostgreSQL 17 y compatibilidad UI/API

Fecha: 2026-09-05. **Ensayo funcional local aprobado; no es una activación productiva.**
La ejecución final aplicó las nueve migraciones y pasó ocho comprobaciones nativas;
la UI pasó cuatro pruebas contra las respuestas sintéticas producidas por ese ensayo.
Se conserva una ejecución intermedia fallida por timeout: no se certifica rendimiento.

El objetivo sigue siendo entregar al carrier el alta completa de XBF: formulario
original, requisitos y documentos acreditados, con confirmación humana. La memoria
reutilizable no entrena los pesos del LLM ni acredita por sí sola un paquete completo.

## Alcance y fuente

- Checkout/rama: `osp-s7-main-integration` / `codex/osp-s7-main-integration`.
- HEAD inicial: `780e4435853d6e3bd1fe20c25da9281318523e38`.
- Fuente funcional ensayada: `e4924b5d6f75d859fdfc1a8f9cf5304a6eed8406`, que conserva
  UI/APIs de `dc31dec` y añade el hotfix SQL. Este bloque agrega sólo pruebas y este informe.
- Se aplicaron, en el orden y con los SHA-256 exactos, las **nueve** migraciones de
  [la conciliación previa](releases/2026-09-05-activation-preflight.json).
  El test verifica cada hash antes de ejecutar. No se usó `db push`.
- Se reutilizaron los contratos, stores, handlers y fixtures internos existentes.
  Las habilidades de pruebas/checklist delimitaron el ensayo y la reversión; depuración
  exigió preservar el timeout y medirlo sin aumentar los límites.
- Modelo/esfuerzo recomendado: **GPT-6 Astra · Xhigh**. No se cambió la configuración
  del modelo ni se delegó a otros agentes.

## Motor aislado

PostgreSQL **17.11**, misma versión mayor que el **17.6** verificado en el preflight
anterior; no se volvió a consultar ni modificar Supabase en esta actividad.
Binarios de EDB enlazados desde [PostgreSQL para Windows](https://www.postgresql.org/download/windows/)
y su [catálogo de binarios](https://www.enterprisedb.com/download-postgresql-binaries).
Archivo usado: `postgresql-17.11-3-windows-x64-binaries.zip`, 341325378 bytes.
SHA-256: `4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf`.
Authenticode reportó `NotSigned`: el hash identifica la descarga, no acredita una firma.

Sin Docker, instalación de servicio Windows, cuentas, proyectos o infraestructura cloud.
Cluster temporal exacto: `tmp/osp-s13-pg17-rehearsal/cluster`, sólo `127.0.0.1:55472`.
Las conexiones comprueban host, puerto, usuario, nombre de base, directorio y versión
antes de escribir. Se rechaza una base no vacía; no se reciclan ni borran ensayos previos.
Se usó `pg_ctl -m fast -w stop` al terminar; el cluster y los logs se conservan localmente.
Verificado: `pg_ctl status` sin servidor, cero listeners en 55472 y sin `postmaster.pid`.

## Resultado nativo

Prueba: [release-rehearsal.native.test.ts](../../supabase/functions/osp-document-api/release-rehearsal.native.test.ts).
Base contractual: [osp-release-foundation.sql](../../tests/fixtures/osp-release-foundation.sql).

| Comprobación final | Resultado |
| --- | --- |
| Nueve migraciones juntas; sin backfill ni cambio inicial del caso | Aprobada |
| SQL real de perfil y handler/store de formulario; caso vinculado y sin vincular; lectura sin crear datos | Aprobada |
| Comando antiguo de publicación directa revocado para workflow | Aprobada |
| Trigger real captura revisión futura; decisión y replay no publican hechos | Aprobada |
| Comparación de lote completo sin mutación; publicación y replay con JSON del driver nativo | Aprobada |
| Vínculo documental y replay; rechazo de otra organización y de evidencia vencida | Aprobada |
| Freno de Operaciones ante revisión ausente/obsoleta; sólo permite el manifiesto coincidente | Aprobada |
| Actor de 256 caracteres, recibo/replay y sin nuevo permiso a `authenticated` | Aprobada |

Historial, sin ocultar intentos:

1. `osp_release_rehearsal_run_1`: **1 test / 8 pasos aprobados**, 1m10s. El fixture de
   formulario aún omitía `minLength`; por eso no se usa como aceptación final de UI.
2. `osp_release_rehearsal_run_2`: **5 pasos aprobados y fallo en el sexto** por
   `statement_timeout=6000` al leer `load_answer_memory_evidence_intents`, contexto
   `answer_memory_evidence_fingerprint`. No genera artefacto de aceptación completa.
3. Dos probes de sólo lectura sobre esa base: **1408.533 ms y 1178.097 ms** de ejecución,
   con el mismo límite de seis segundos, sin cambiar SQL, índices ni configuración.
   El timeout no se reprodujo ahí; esto no demuestra su causa ni un SLA productivo.
4. `osp_release_rehearsal_run_3`, fixture corregido: **1 test / 8 pasos / cero fallos**,
   13s total; bloque de evidencia 3s. Mismo límite de seis segundos. Incluyó typecheck Deno.

Las tres bases y `postgres.log` se preservan, incluyendo el fallo. Los artefactos
sintéticos completos son `tmp/osp-s13-pg17-rehearsal/osp_release_rehearsal_run_{1,3}.json`.
No hay datos reales, tokens ni documentos de XBF en estos fixtures.
SHA-256 del JSON nativo final: `2e28d042074a435e645b966395048da1d7717624aefd922dfea1963772f294c6`.

## Consumidor UI y orden de actualización

Prueba: [release-rehearsal.compatibility.test.ts](../../apps/osp/src/api/release-rehearsal.compatibility.test.ts).
Resultado final: **4/4**, usando únicamente el artefacto nativo `run_3`.
Los schemas antiguos se cargan del Git exacto `ed12d1658fcef898fdadbc848d3b94b7684c601b`;
no se sustituyen por una imitación escrita para el test.

| Respuesta | UI anterior `ed12d16` | UI candidata |
| --- | --- | --- |
| Forma anterior, proyectada quitando sólo los campos nuevos | Acepta | Acepta; sin lote, no ofrece publicar |
| Perfil/formulario nuevos, producidos por los stores nativos | Rechaza campos nuevos por schemas estrictos | Acepta |
| Comparación completa actual en componente React | No aplica | Requiere checkbox; callback una vez |

El test también comprueba que leer un caso sin vincular no inventa formulario y
que aceptar una respuesta no la declara automáticamente reutilizable.
El callback React es un espía local: no publica en Supabase.

Intentos UI previos preservados: worker `forks` no arrancó; resolución inicial
`import.meta.url` incompatible con jsdom; fixture antiguo sin `minLength`; dos
timeouts de cinco segundos al preparar schemas históricos/interactuar con DOM.
La preparación Git/transpilación se carga ahora una sola vez en setup, manteniendo
objetos JSON frescos por prueba. No se aumentaron los límites ni retiraron assertions.
Reportes: `ui-run-1.json`, `ui-run-3.json`, `ui-run-3-cached-fixture.json` bajo el mismo
directorio temporal; el último es el resultado final aprobado, 4/4 en 51.99s total.
SHA-256 del reporte UI final: `52069edbcc4444d3c65d7b7b60815160be43b17a771daf3e1f7e2a40d2d322ed`.
Validaciones adicionales aprobadas: TypeScript `tsc --noEmit` de la UI, ESLint del
test consumidor, format/lint Deno del test nativo, contrato de acciones vigente y
`git diff --check`. No se compiló ni promovió un nuevo bundle de producto.

**Consecuencia:** coordinar UI y APIs; las pestañas antiguas requieren recarga.
La UI nueva tolera el formato anterior, pero promoverla no invalida automáticamente
sesiones/pestañas viejas. Antes de cambiar respuestas del backend hace falta una
ventana controlada sin operaciones de usuarios/jobs y comprobación de recarga.
No se implementó aquí un nuevo mecanismo de mantenimiento o bloqueo remoto.

## Límites y siguiente actividad

- Es una **base contractual reducida**, no un clon del esquema/RLS/volumen productivo.
  Las dos proyecciones upstream de conocimiento son fixtures deterministas. Se ejecutan
  las migraciones reales y guards seleccionados, no todo el historial de Rateware.
- La identidad del handler es un fixture verificado en memoria, no Google/JWT real.
  El formato anterior es una proyección validada por su schema, no un smoke del backend antiguo.
- No cubre todos los endpoints de las cinco funciones, rendimiento, concurrencia de esta
  actualización, PDF final, fidelidad del carrier ni revisión visual desktop/mobile.
  No hubo cambio de UI de producto en este bloque que requiriera nueva preview visual.
- El timeout intermitente queda como riesgo a comprobar en el canary/control de rendimiento;
  no se convierte esta repetición funcional aprobada en garantía de latencia.
- **Rollback limitado:** las migraciones revocan el comando directo antiguo. Revertir
  UI/API no restaura esa escritura; mantenerla bloqueada y corregir hacia adelante.
  No reotorgar automáticamente el bypass ni borrar tablas/recibos de evidencia.

Sigue preparar la activación, no abrir otro sprint: build no sintético con Supabase
Auth y perfil correcto, protección de la cola/cron durante la ventana y autorización
exacta para push, las nueve migraciones, cinco funciones y UI. Usar la secuencia de
[activación](sprint13-activation-preflight.md), incorporando la compatibilidad anterior.
No promover directamente la preview sintética. El canary posterior debe ser autenticado
y sólo de lectura, sin invocar worker ni consumir el job pendiente de Salzillo.

**No se hizo:** push, migraciones o despliegues remotos, cambios de cron/flags, cambios
de datos productivos, ejecución de trabajos, aprobaciones, firmas, correos, webhooks
ni cargos. Salzillo sigue intacto por esta actividad. La entrega corregida y sus
[faltantes reales](salzillo-closeout.md) siguen siendo un gate separado de este ensayo.
