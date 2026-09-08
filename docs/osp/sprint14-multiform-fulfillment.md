# Sprint 14 — requisitos independientes por formulario

## Resultado del incremento (2026-09-07)

OSP debe preparar el alta de XBF como cliente del carrier. Una solicitud puede
contener varios formularios y documentos, cada uno con reglas diferentes. Este
incremento corrige el contrato determinista y sus evaluaciones; no declara
terminada la adaptabilidad productiva ni entrena un LLM.

El escenario sintético combina cuatro formularios: alta XLSM que se debe devolver
como PDF de dos páginas con firma autógrafa, cuestionario DOCX, referencias XLSX
y anexo XLSM; además exige un W-9 PDF. Cada requisito conserva su formato,
completitud, firma, revisión e inclusión en el paquete.

Antes de implementar se reprodujeron seis fallos: la palabra común «Carrier»
propagaba PDF/dos páginas/firma a los otros formularios, un DOCX sin firma no
pasaba Operaciones, el PDF solicitado para el W-9 contaminaba al único DOCX y
el MIME oficial de XLSM quedaba sin restricción por una comparación sensible a
mayúsculas. También se añadió una reproducción fallida para instrucciones de
formulario y documento mezcladas en la misma frase.

La corrección:

- Usa nombres completos y palabras distintivas para delimitar instrucciones.
- Conserva instrucciones explícitas para todos los formularios.
- Reconoce formatos de devolución PDF, DOCX, XLSX y XLSM por encima de la
  extensión de origen; normaliza los MIME oficiales.
- Exige revisión cuando el formato es desconocido, hay formatos contradictorios
  o no se puede determinar a qué formulario pertenece la instrucción. No trata
  un formato desconocido como aceptación universal.
- Permite evaluar un DOCX sin requisito de firma bajo los controles normales
  de evidencia; no añade soporte de firma DOCX.
- Mantiene separados los frenos por archivo faltante, llenado incompleto,
  formato incorrecto, firma ausente, revisión pendiente y falta de adjunto.

La heurística es conservadora, no una interpretación universal de lenguaje
natural. Una frase que combina un formulario y otro documento puede exigir
revisión aun si una persona puede desambiguarla. No se inventa su alcance.

## Verificación

70 pruebas aprobadas, cero fallos, en estos ocho archivos:

| Área | Archivo | Pruebas |
| --- | --- | ---: |
| Contrato existente | `_shared/osp/request-contract.test.ts` | 12 |
| Solicitud mixta nueva | `_shared/osp/request-multiform-fulfillment.test.ts` | 10 |
| Límite del adaptador real | `osp-case-api/request-multiform-gate.test.ts` | 1 |
| Salzillo/Crane entre vistas | `osp-case-api/request-cross-view-regression.test.ts` | 3 |
| Evidencia PDF y controles | `osp-case-api/request-semantic-gate.test.ts` | 20 |
| Handler de revisión | `osp-case-api/handler.test.ts` | 15 |
| Decisiones del manifiesto | `osp-case-api/request-manifest-review.test.ts` | 4 |
| Aclaraciones | `osp-worker/clarification-draft.test.ts` | 5 |

Rutas relativas a `supabase/functions/`. Ejecución con `deno test --frozen
--allow-read --allow-env` y esos archivos explícitos. Lint y formato Deno de los
tres TypeScript modificados/nuevos: correctos. `git diff --check`: correcto.

El ensayo de la matriz usa evidencia fabricada e independiente del resultado
del contrato. No abre archivos reales, no consulta Supabase y no envía mensajes.
El ensayo del adaptador inyecta SQL sintético: cuatro artefactos legacy,
aunque sus MIME coincidan y declaren 100%, dan **0/4 satisfechos**, los seis
controles permanecen cerrados y no se pueden obtener adjuntos autorizables.

## Registro de acciones y aislamiento

Base de trabajo: `085a2d4a8acaaa42ed6ec3b5b8a03138704db11a`.
El registro estático ya tenía 19 huellas de dependencias desactualizadas en
HEAD antes de este incremento. Se revisó el diff desde `dc31dec` de
`request-contract.ts`, `osp-case-api/handler.ts`, `request-manifest-review.ts`
y `clarification-draft.ts`; la suite anterior incluye sus regresiones.

Se actualizan únicamente las 19 huellas de autorización de dependencias del
contrato (12 acciones de case-api y 7 de worker). No se cambian permisos,
superficies, huellas directas ni metadatos, ni se regenera todo el inventario.

La prueba completa `osp-action-contract.test.mjs` valida **168/168** para el
candidato. Para aislarlo sin alterar archivos se usó una superposición de lectura
en memoria que toma `osp-read-api/handler.ts` desde HEAD. Este archivo y su test
ya tenían cambios de orígenes ServiceDesk ajenos al incremento; se conservan y
se excluyen del commit. La validación del candidato no certifica esos cambios
ni equivale a afirmar que el worktree combinado está listo para desplegar.
La ejecución directa sobre el worktree combinado se realizó y falla en la
huella de `edge.osp-read-api.get_corporate_profile`, cuyo handler contiene esos
orígenes adicionales. No se aceptó esa huella ni se ocultó el fallo del conjunto.

## Pendiente concreto para cerrar adaptabilidad

`request-semantic-gate.ts` todavía rechaza asignar evidencia de formularios
cuando hay más de uno: los recibos legacy no demuestran a qué requisito
pertenece cada artefacto. Se conserva ese freno; no se asigna por posición,
nombre parecido ni MIME. La cobertura del formulario tampoco puede deducirse
de una declaración suelta de «100%»: necesita evidencia revisada vinculada a
los bytes exactos generados.

El siguiente incremento debe llevar esa vinculación desde el productor y su
recibo hasta la evaluación, invalidándola al cambiar manifiesto o artefacto.
La salida exige dos solicitudes distintas con varios formularios y prueba de
que un archivo incorrecto no puede satisfacer otro requisito. Modelo/esfuerzo
recomendado: Astra alto para ese contrato e integración, no como requisito de
ejecución de OSP ni como nueva llamada pagada.

No hubo push, despliegue, migración, cambio de datos/cron, promoción de
conocimiento, firma, aprobación de Sales, correo, webhook ni cargo. No se
modificó el caso productivo Salzillo ni la UI.
