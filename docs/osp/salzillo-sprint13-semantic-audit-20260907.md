# Sprint 13 — auditoría semántica Salzillo (inicio inmediato)

Fecha: 2026-09-07. Modelo de esta actividad: **GPT-6 Astra · High**.
Motivo: reconciliación de un libro XLSM con un correo de requisitos, un mapa de
coordenadas y el contrato de paquete; no es una tarea mecánica de celdas.

## Evidencia física reproducida

Fuente local: `Copia de Formato 3.3 Alta Cliente (1).xlsm`.

- SHA-256 de la fuente: `af45f6627106edc5fd5fd114dca56a337290301a5a059aa07f7e36f8e236b3ee`.
- Hojas visibles inspeccionadas: `1-2` y `2-2`; la hoja `BD` se conserva como
  catálogo separado.
- Macros no ejecutadas. El libro original no se modifica.
- `tools/osp-check-workbook-map.py` pasó en modo lectura:
  - 114 entradas únicas;
  - cero anclas desbloqueadas sin clasificar;
  - seis anclas desbloqueadas excluidas por áreas internas;
  - una celda bloqueada retenida como `locked_input_review` (`1-2!H16`);
  - alcance declarado por el propio verificador: coordenadas y estructura física,
    no valores, semántica, PDF, firma ni completitud.

## Matriz de cobertura del requerimiento

| Solicitud del carrier | Evidencia en el libro/mapa | Estado de cierre |
| --- | --- | --- |
| Formato 3.3 completo, dos páginas, PDF y firma autógrafa | Anclas de las hojas `1-2`/`2-2` y `declaration.signature`; no existe todavía un artefact target ni PDF final | **Bloqueado**: falta llenar/reabrir/renderizar el original y acreditar el método de firma solicitado |
| Acta constitutiva | `evidence.incorporation` (`1-2!J30`) | Requisito identificado; falta evidencia vigente y revisión humana |
| INE del representante legal | `evidence.identity` (`1-2!J32`) | Requisito identificado; falta evidencia vigente y revisión humana |
| Poder notarial, si aplica | `evidence.power_of_attorney` (`1-2!J35`) | Requisito identificado; aplicabilidad/evidencia pendientes |
| Opinión positiva SAT | `evidence.tax_opinion` (`1-2!J34`) | Requisito identificado; falta fecha y evidencia vigente |
| Constancia de situación fiscal | `evidence.tax_status` (`1-2!J33`) | Requisito identificado; falta fecha y evidencia vigente |
| Carátula del banco emisor de pagos MXN | El contrato semántico reconoce `banking.account_evidence` y el runtime reconoce `bank_statement`; el inventario físico no tiene una fila dedicada | **Gap de paquete**: debe permanecer como requisito externo explícito, sin inventar una celda ni marcarla cumplida por tener datos bancarios |
| Comprobante de domicilio | `evidence.address` (`1-2!J31`) | Requisito identificado; falta vigencia máxima y evidencia |
| Tres referencias comerciales comprobables, con nombre, teléfono y correo | Filas 1–3 (`C43:C45`, `G43:G45`, `C47:C49`); cuarta opcional | **Bloqueado**: nombres/teléfonos no sustituyen los correos faltantes; no descartar la tercera referencia |
| Cuestionario de seguridad | Nueve decisiones `1-2!D52:D55`, `H52:H55`, `J53` | **Bloqueado**: requiere respuesta explícita, no inferencia |
| Políticas de crédito | `requirementsOutsideValueMapping` en `2-2!B31:L42` | **Bloqueado**: aceptación o excepción explícita antes de firma |
| Carta bajo protesta | `requirementsOutsideValueMapping` en `2-2!B44:L51` | **Bloqueado**: presentar declaración real al firmante |

El correo y el libro usan ventanas de antigüedad distintas. Se conserva la fuente
de cada regla y se aplica el límite más estricto hasta una aclaración: un mes para
opinión SAT, constancia fiscal y carátula bancaria; tres meses para domicilio.

## Decisiones que el freno debe exigir

1. Registrar la carátula bancaria como requisito del **paquete documental**, con
   tipo aceptado, fecha efectiva/expiración y revisión; nunca como simple dato de
   `bank.name`, `bank.account` o `bank.clabe`.
2. Obtener los correos de las tres referencias. La referencia VIFAA comunicada
   hasta ahora tiene nombre y teléfono, pero no correo; las otras referencias
   tampoco deben rellenarse con dominios inventados.
3. Resolver las nueve respuestas de seguridad y la aplicabilidad del poder,
   crédito, portal y cuarta referencia con una decisión humana trazable.
4. Mantener `2-2!D17:D18` como `sensitive_hold`; no recopilar ni adjuntar usuario
   o contraseña del portal en el paquete.
5. Mantener `1-2!H16` bloqueada. No desprotegerla ni convertir una celda bloqueada
   en un falso faltante resuelto.
6. Enlazar el mapa con extracción, plantilla y snapshot revisados antes de
   producir cualquier archivo. El mapa de 114 entradas sigue siendo un borrador
   de revisión, no permiso de llenado, firma o envío.

## Resultado de esta actividad

Se confirmó que la validación geométrica del mapa es correcta pero insuficiente
para el objetivo de negocio. El freno correcto debe detener el paquete por el
gap de carátula bancaria, los correos de referencias, las respuestas de seguridad,
la firma autógrafa y la revisión de las cláusulas de crédito/declaración. Un XLSX
con pocas celdas llenas o un recibo de correo no puede pasar este gate.

No se escribieron valores en el XLSM, no se modificó el caso Salzillo, no se
subieron documentos, no se aplicaron migraciones, no se ejecutó el worker, no se
firmó ni se envió correo. Esta auditoría es local y de lectura.

## Próximo incremento seguro

Exponer en la matriz y en la pantalla de aclaraciones los requisitos de texto
reconocidos que aún no tienen una fila documental, cita utilizable o respuesta
estructurada (incluidas referencias comerciales sin correo). El objetivo es que
ningún concepto quede silenciosamente fuera del paquete y que el freno dirija a
una aclaración humana. Usar **GPT-5.6 Sol · High** para esta integración normal;
subir a Astra sólo si aparece una incompatibilidad de persistencia, permisos o
idempotencia. El resultado debe ser sintético y no debe modificar Salzillo
productivo.

## Incremento ejecutado

El contrato ahora materializa cualquier concepto documental reconocido desde el
texto citado por el carrier cuando el manifiesto no trae una fila documental
equivalente; esto incluye `banking.account_evidence`. La regla conserva la cita
original, exige evidencia aprobada y mantiene el requisito como bloqueante; los
datos bancarios del formulario no pueden satisfacer la carátula por coincidencia
de concepto. Las filas ya mapeadas no se duplican ni se invalidan por una cita
textual vacía de una versión antigua del manifiesto. La matriz UI identifica el
registro como evidencia de paquete y dirige a revisión documental. La pantalla
del manifiesto también muestra cada `missingInformation`, aunque el modelo no
haya generado una pregunta de aclaración, para que el faltante no desaparezca
de la revisión humana. El contador de bloqueos suma también las preguntas de
aclaración abiertas, incluso cuando no existe otro faltante en la lista.
Si el modelo declara `ready_for_prefill` mientras persiste cualquier problema,
la UI rebaja ese estado a `Clarification required` y conserva el freno.
Además conserva en una lista de sólo lectura todo el wording citado del carrier,
aunque todavía no tenga una fila de formulario o documento asociada.

Regresión sintética validada:

- 11/11 pruebas de `request-contract.test.ts` pasan.
- `request-semantic-gate.test.ts`: 20/20 pasan.
- `deno check` de los módulos del contrato pasa y `git diff --check` no reporta
  errores.
- `RequestManifestPanel.test.tsx`: 8/8 pasan con el runtime empaquetado Node
  24.19.0; lint enfocado y build de OSP pasan con los mismos cambios.
- El Node 20.14.0 del host no puede iniciar Vitest por `ERR_REQUIRE_ESM` en
  `html-encoding-sniffer`/`@exodus/bytes`; el proyecto declara Node >=22.12.0 y
  la prueba se repitió con ese runtime compatible.

No se modificó el XLSM, el caso Salzillo, Supabase, migraciones, despliegues ni
ningún efecto externo.

## Incremento ejecutado — deduplicación segura del freno visible

La pantalla del manifiesto ahora construye una lista determinista de bloqueos
de evidencia. Dos entradas son la misma sólo cuando conservan el mismo tipo,
campo y texto normalizado; en ese caso se muestra una sola decisión y se une la
totalidad de sus citas. Dos restricciones distintas para el mismo campo siguen
siendo dos bloqueos. Esto evita que una aclaración repetida infle el contador o
parezca una nueva exigencia, sin permitir que el freno descarte requisitos
materialmente diferentes.

Regresión sintética adicional:

- `RequestManifestPanel.test.tsx`: 10/10 pruebas pasan con Node 24.19.0.
- ESLint enfocado, TypeScript (`tsc --noEmit`), build de OSP (430 módulos) y
  `git diff --check` pasan.

El cambio es sólo de presentación y cálculo determinista del bloqueo visible;
no altera el manifiesto persistido, no resuelve decisiones, no promueve
conocimiento y no cambia el contrato de firma o envío.

## Incremento ejecutado — cola humana alineada con el mismo freno

La cola de `AdaptiveReviewWorkbench` reutiliza ahora la identidad normalizada
de los bloqueos. El primer índice original se conserva como `decisionId`, por
lo que una revisión persistida no cambia de referencia al retirar una
duplicación posterior. La cola sólo colapsa la misma condición textual para el
mismo campo; una condición distinta del mismo campo permanece visible y exige
su propia resolución humana.

Regresión sintética adicional:

- `AdaptiveReviewWorkbench.test.ts` y `RequestManifestPanel.test.tsx`: 12/12
  pruebas pasan con Node 24.19.0.
- ESLint enfocado, TypeScript (`tsc --noEmit`) y `git diff --check` pasan.

El incremento mantiene el modo human-approved: no marca decisiones como
resueltas, no crea registros y no habilita firma, Sales, correo o webhook.

## Incremento ejecutado — aclaraciones sin duplicados

La revisión de aclaraciones reutiliza la misma identidad de evidencia que el
manifiesto. Preguntas exactamente repetidas se consolidan y conservan la unión
de sus citas tanto durante la edición como en la vista inmutable de una revisión
ya guardada. Preguntas distintas del mismo campo siguen siendo editables por
separado; por ello el freno no puede ocultar una condición adicional del
carrier.

Regresión sintética adicional:

- `ClarificationReview.test.tsx`, `RequestManifestPanel.test.tsx` y
  `AdaptiveReviewWorkbench.test.ts`: 17/17 pruebas pasan con Node 24.19.0.
- ESLint enfocado, TypeScript (`tsc --noEmit`), build de OSP (430 módulos) y
  `git diff --check` pasan.

El cambio afecta sólo la presentación y edición controlada de preguntas; no
envía aclaraciones, no guarda datos reales y no altera autorizaciones externas.

## Incremento ejecutado — deduplicación en el backend antes de persistir

El worker ya no deja que una duplicación textual llegue al borrador persistido:
normaliza tipo, campo y pregunta, conserva una sola condición y une sus citas.
Dos preguntas distintas del mismo campo sí se conservan. La revisión de
Operaciones empareja cada edición por tipo, campo y alcance de evidencia, con
consumo único de cada alcance; por eso no se puede sustituir una fuente ni
duplicar una decisión durante la edición.

Regresión sintética adicional:

- `clarification-draft.test.ts`: 5/5 pruebas.
- `request-manifest-review.test.ts`: 3/3 pruebas.
- `postgres-store.test.ts`: 12/12 pruebas.
- `osp-case-api/handler.test.ts`: 14/14 pruebas.
- Total de la corrida backend: 31/31 pruebas, más `deno check` y
  `git diff --check` correctos.

El cambio sólo afecta la construcción y revisión de borradores de aclaración;
no envía mensajes, no toca casos reales, no aplica migraciones y mantiene la
idempotencia y el control humano.

## Incremento ejecutado — API de revisión alineada con los scopes

La entrada `save_clarification_review` ya no bloquea cualquier repetición de
campo. El handler consolida antes del store únicamente la misma condición
textual (tipo + campo + pregunta normalizada), une sus citas y deja pasar
condiciones diferentes del mismo campo. El store mantiene el alcance de
evidencia y el control de versión, por lo que un cliente antiguo no puede
sortear la revisión ni crear una decisión sin fuente.

Regresión sintética adicional:

- `osp-case-api/handler.test.ts`: 15/15 pruebas.
- `osp-case-api/postgres-store.test.ts`: 12/12 pruebas.
- `osp-worker/clarification-draft.test.ts`: 5/5 pruebas.
- Total backend: 32/32 pruebas; `deno check` y `git diff --check` correctos.

No se enviaron aclaraciones ni se modificó ningún caso. El cambio sólo
normaliza el payload de revisión antes de persistirlo.

## Incremento ejecutado — handler de revisión sin pérdida de requisitos

La API de aclaraciones queda alineada con el worker y la UI. Antes rechazaba
cualquier segundo registro del mismo campo; ahora acepta condiciones distintas,
consolida repeticiones exactas y une sus citas antes de llamar al store. El
alcance sigue cerrado por tipo, campo y evidencia, así que el cambio no permite
agregar una pregunta sin fuente ni sustituir una cita durante la revisión.

Regresión sintética adicional:

- `osp-case-api/handler.test.ts`: 15/15 pruebas.
- `osp-case-api/postgres-store.test.ts`: 12/12 pruebas.
- `osp-worker/clarification-draft.test.ts`: 5/5 pruebas.
- Total backend: 32/32 pruebas; `deno check` y `git diff --check` correctos.

No se enviaron aclaraciones, no se modificaron casos ni se habilitaron acciones
externas.

## Incremento ejecutado — backend del manifiesto alineado con el freno

La cola de decisiones del manifiesto ya no descarta una condición distinta sólo
porque comparte `fieldId` con otra aclaración. El backend consolida únicamente
la misma condición textual, conserva el primer `decisionId` y une todas sus
citas. El alcance de una revisión sigue exigiendo una decisión exacta por cada
condición y mantiene bloqueadas las transiciones cuando queda una respuesta
externa.

Regresión sintética adicional:

- `handler.test.ts`: 15/15.
- `postgres-store.test.ts`: 12/12.
- `request-manifest-review.test.ts`: 4/4.
- `request-semantic-gate.test.ts`: 20/20.
- `clarification-draft.test.ts`: 5/5.
- Total de la corrida: 56/56; `deno check` y `git diff --check` correctos.

No se modificaron datos, casos, migraciones, Supabase ni acciones salientes.

## Incremento ejecutado — regresión transversal Salzillo/Crane y extracción multi-concepto

Se agregó una regresión sintética de extremo a extremo que compara el mismo
requerimiento del carrier en cuatro superficies: semillas de decisiones del
manifiesto, borrador de aclaraciones, contrato de cumplimiento y matriz
semántica. Salzillo cubre dos faltantes distintos sobre el mismo campo; Crane
cubre un paquete DOCX con anexos PDF y una frase que exige simultáneamente
autoridad MC y fianza.

La regresión descubrió y corrigió una pérdida real: el contrato sólo tomaba el
primer concepto documental de una frase compuesta, por lo que “MC authority y
surety bond” podía omitir la fianza. Ahora cada concepto reconocido de la misma
fuente conserva su propia exigencia, citas y bloqueo. Las preguntas de
aclaración ya existentes permanecen en su cola separada y no se confunden con
los faltantes/contradicciones que genera el borrador.

Regresión ejecutada:

- `request-cross-view-regression.test.ts`: 3/3.
- `request-contract.test.ts`: 11/11.
- `request-manifest-review.test.ts`: 4/4.
- `clarification-draft.test.ts`: 5/5.
- Total enfocado: 23/23; `deno check` y `git diff --check` deben permanecer
  como gates del commit.

El cambio es determinista y fail-closed: no rellena datos no citados, no
resuelve decisiones humanas, no crea registros, no aplica migraciones y no
envía correos, webhooks o firmas.

## Incremento ejecutado — gate de formato contra la evidencia binaria

El servicio de borrador ahora valida después de la interpretación y antes de
persistir que cada formulario declarado como `xlsx`, `xlsm`, `pdf` o `docx`
tenga una cita que pertenezca a una fuente binaria del mismo formato. Para
hojas de cálculo se resuelve el prefijo de evidencia estructural contra el
`versionId`; para PDF/DOCX/imágenes se valida el `file:<versionId>` exacto.

Esto cubre un riesgo de producción que no se resolvía con el esquema JSON: un
LLM podía devolver un formato válido sintácticamente pero incompatible con el
archivo recibido. En ese caso el servicio falla con
`REQUEST_MANIFEST_FORM_FORMAT_MISMATCH` antes de guardar el manifiesto, sin
crear una falsa señal de aprendizaje ni permitir que el paquete cambie de
formato sin revisión.

Regresión ejecutada:

- `request-manifest-draft.test.ts`: 4/4.
- `openai-request-manifest.test.ts`: 3/3.
- `xlsx-structure.test.ts`: 2/2.
- Total del gate de extracción: 9/9; `deno check` y `git diff --check`
  correctos.

El gate no ejecuta macros, no persiste un borrador incompatible y no modifica
casos, migraciones, Supabase o acciones salientes.

## Incremento ejecutado — corpus sintético completo de entrada multi-formato

Se añadió una prueba de recorrido completo con cinco documentos sintéticos en
una misma solicitud: PDF, DOCX, imagen, XLSX y XLSM. El servicio conserva el
conteo por formato, genera evidencia estructurada por fila para ambas hojas de
cálculo y entrega al intérprete únicamente los binarios que corresponden a
PDF/DOCX/imagen.

El XLSM se procesa con la política de macro segura: ejecución bloqueada,
análisis sobre copia saneada y separación entre el hash original y el hash de
análisis. La cita del formulario XLSM sigue apuntando al `versionId` original,
por lo que el paquete no puede confundirse con un XLSX ni perder trazabilidad.

Regresión ejecutada:

- `request-manifest-draft.test.ts`: 5/5.
- `openai-request-manifest.test.ts`: 3/3.
- `xlsx-structure.test.ts`: 2/2.
- `strict-xlsx-package-scanner.test.ts`: 5/5.
- Total del corpus: 15/15; `deno check` y `git diff --check` correctos.

El corpus es sintético y no crea manifiestos reales, no ejecuta macros, no
envía archivos a proveedores externos y no cambia migraciones, casos,
Supabase, firmas, correos o webhooks.

## Incremento ejecutado — razones de freno visibles para Operaciones

La pantalla del manifiesto ahora expone los `reasonCodes` del modelo como una
lista de motivos legibles y deduplicados. Los códigos conocidos se traducen a
lenguaje operativo (entidad XBF no resuelta, referencia comercial faltante,
instrucciones ambiguas, autoridad de firma ausente, etc.); los códigos nuevos
se muestran con un fallback seguro sin romper la UI. La sección sólo aparece
cuando el estado no está listo, para no llamar “detenido” a un caso ya
preparado.

La narrativa operativa queda completa: cobertura de fuentes, aislamiento XLSM,
contador de bloqueos, texto original del carrier y ahora la causa exacta del
freno se observan antes del ensamblado. No se agrega ningún botón de acción
externa.

Regresión ejecutada:

- `RequestManifestPanel.test.tsx`: 11/11.
- ESLint enfocado y TypeScript (`tsc --noEmit`): correctos.
- Build OSP: 430 módulos transformados; `git diff --check` correcto.

El cambio es sólo de lectura/presentación: no resuelve requisitos, no modifica
datos y no habilita firma, autorización de Sales, correo, webhook o despliegue.

## Incremento ejecutado — auditoría WCAG de motivos de freno y estado de fuentes

Se revisó `RequestManifestPanel` con foco en la legibilidad operativa del
freno semántico. Los motivos ahora se presentan con encabezado y lista
semánticos, se deduplican antes de renderizarse y los códigos no reconocidos
conservan un fallback legible. Cuando no existe ningún formato reconocido, la
interfaz ya no deja una lista vacía: muestra explícitamente que la cobertura
de fuentes está pendiente. El layout mantiene una sola columna en móvil y
conserva el foco visible y los landmarks existentes, sin introducir acciones
externas ni cambios de flujo.

Regresión ejecutada:

- `RequestManifestPanel.test.tsx`: 12/12.
- ESLint enfocado y TypeScript (`tsc --noEmit`): correctos.
- Build OSP: 430 módulos transformados; `git diff --check`: correcto.

La evidencia es automatizada y de componente; no se ejecutó un lector de
pantalla real (NVDA/VoiceOver) ni una auditoría manual en navegador. No se
crearon registros, no se aplicaron migraciones, no se tocó Supabase, no se
enviaron correos/webhooks, no se firmó ni se promovió a producción.
