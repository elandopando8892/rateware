# Respuesta, evidencia y dato: enlace y renovación

2026-09-05. Continuación local/preview autorizada de ADR-OSP-001.
Objetivo: reutilizar información respaldada para dar de alta a XBF como cliente
de distintos carriers. No entrena los pesos del LLM ni sustituye el Request Contract.

## Resultado implementado

- Desde la comparación XBF existente se confirma un vínculo con el dato válido
  o la renovación de su respaldo vencido. La UI pide motivo y confirmación exacta,
  muestra el recibo y conserva la misma intención al conciliar una respuesta perdida.
- Un documento todavía no publicado no puede publicarse desde este control.
  No modifica valores maestros, otros campos, paquetes, firmas, Sales ni envíos.
- Nuevo ledger privado append-only con referencias a respuesta, evaluación,
  entidad, hecho, revisión/campo documental, vigencias, sujeto y huella esperada.
  No hay segundo catálogo de valores ni modificación de la fuente original.
- El lector existente admite el respaldo explícito sólo para los siete conceptos
  básicos del ADR. Revalida en cada lectura la entidad, hecho actual, origen,
  revisión, campo exacto, sensibilidad, promoción aplicada y fechas.
- Un caso posterior de la misma entidad recibe el hecho renovado; otra entidad
  no. Un origen retirado/rechazado no revive por disponer de un recibo antiguo.

La UI cloud es **sintética**: las decisiones viven en memoria y se reinician al
recargar. La persistencia real se probó ejecutando el SQL local, no con datos
productivos ni con una simulación de promoción. No se aplica la migración remota.

## Reutilización y alcance

Se revisaron otra vez las tres bases internas del ADR: catálogo corporativo,
evaluación de respuestas y catálogo de conceptos. Se adaptan las dos primeras;
la tercera sigue sin almacenar valores. No se incorpora una dependencia,
licencia de terceros, proyecto o infraestructura nuevos.

Migración local: `20260905110000_osp_answer_memory_evidence_links.sql`.
Depende de memoria aprobada, captura, revisión y preflight locales del mismo día,
además del ledger/revisión/promoción corporativos existentes.

API: una acción `link_answer_memory_evidence` en `osp-form-api`; el servidor deriva
organización, sujeto y permiso de la sesión verificada (`osp:operate` o superusuario).
Ni el cuerpo ni la respuesta aceptan autoridad de envío. Comparar sigue siendo lectura.

SQL: sólo el rol workflow puede ejecutar el comando; ningún rol de aplicación
recibe escritura directa sobre los recibos. La función de huella es privada.
La clave idempotente exacta devuelve el recibo histórico; otra intención con la
misma clave falla. El recibo no afirma permiso eterno de reutilización.

## Locks y frontera de aceptación

Orden: clave idempotente; candidata; formulario; binding; evaluación/entidad;
revisiones ordenadas; campos; assets; promociones; hecho. Revalidación posterior
de las referencias capturadas y de la huella completa antes del único INSERT.
La revisión precede al campo/hecho como en los comandos documentales existentes.
Los locks de filas usan NOWAIT: contención rechaza el comando, sin reintento
automático ni efectos parciales. No se modifican comandos de Rateware.

**No hay prueba de sesiones PostgreSQL independientes todavía.** No se hallaron
`pg_ctl`, `postgres` o `initdb` en PATH y no se instaló ni arrancó infraestructura.
PGlite ejecuta SQL real con dependencias mínimas, pero no demuestra concurrencia
multisesión ni rendimiento productivo. Ese canary permanece como gate de activación.

## Verificación y evidencia

Las habilidades `engineering:testing-strategy` y `engineering:deploy-checklist`
guiaron pruebas de identidad, integridad, reintento y preview sin efectos externos.

- 52 pruebas Vitest: UI, aceptación previa, confirmación exacta, doble clic,
  respuesta perdida/conciliación, lector sin permiso, servidor antiguo sin huella,
  contrato HTTP y runtime sintético.
- 19 pruebas Deno / 28 pasos: SQL de promoción y puente, HTTP, lector original y
  preparación automática. Renovar un teléfono devuelve sólo ese hecho; website
  permanece fuera. Los hechos conservan todas sus filas y valores originales;
  no aumenta el número de promociones.
- Variantes bloqueadas: respuesta/formulario/binding cambiados, entidad inactiva,
  fuente no aprobada, dato restringido/retirado, revisión o fecha cambiada,
  permiso insuficiente, entidad ajena, huella distinta y clave con otra intención.
- 39 pruebas de frontera UI; inventario explícito de acciones 166/166
  (53 Edge, 113 PostgreSQL). No se debilitó el conteo ni se admitieron superficies
  desconocidas: se registraron una acción HTTP y tres funciones nuevas.
- TypeScript, ESLint de componentes/contrato, Deno lint del helper operativo,
  build sintético de 426 módulos y diff-check.
- Smoke local desktop 1280×900 / mobile 390×844: una renovación sintética con
  recibo, dos comparaciones, cero escrituras de red, cero solicitudes externas
  permitidas, cero errores y cero desbordamiento. Dos fuentes externas existentes
  fueron bloqueadas. Capturas privadas: `tmp/osp-s13-evidence-link-evidence`.

Fallos conservados: el primer SQL requirió paréntesis en una expresión CASE;
el control de inventario detectó un conteo antiguo en una segunda aserción;
el primer smoke local encontró el servidor anterior apagado. Se corrigieron y
repitieron, sin bajar timeouts ni omitir pruebas. El lint amplio de tests señala
tres imports npm/jsr preexistentes con la regla no-import-prefix; no se altera la
política global ni se presenta ese lint amplio como aprobado.

## Despliegue y rollback

Sólo preview estática prebuilt en `osp-customer-setup` existente, perfil
`preview-synthetic`; no push, migraciones remotas, functions, secretos ni promoción
productiva. La selección de auth sintética del build no cambia Supabase Auth real.
Metadata y smoke cloud se registrarán al terminar el despliegue exacto.

Rollback de preview: usar la anterior `50111e4`, sin borrar datos. Para una futura
activación, revertir primero UI/API y restaurar la definición anterior del lector;
conservar siempre el ledger. Bloquear producción hasta probar contención real y
verificar las migraciones pendientes con autorización específica.

Pendiente independiente: comparación detallada del lote documental antes de su
publicación (hoy se muestra el conteo), aceptación del flujo con evidencia real y
activación autorizada. No se ha tocado Salzillo ni reenviado su correo.
