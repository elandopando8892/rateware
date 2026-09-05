# OSP: cierre por resultado

Revisión local: 2026-09-04. Objetivo: responder un alta de XBF solicitada por
un transportista con su formulario original completo y el paquete documental
correspondiente. Un correo entregado o una revisión marcada `resolved` no prueban
ese resultado.

## Evidencia revisada

- Original aportado: `Copia de Formato 3.3 Alta Cliente (1).xlsm`.
- SHA-256: `af45f6627106edc5fd5fd114dca56a337290301a5a059aa07f7e36f8e236b3ee`.
- Pestañas visibles `1-2` y `2-2`; catálogo `BD` separado. Macros presentes,
  no ejecutadas. Se inspeccionaron las dos vistas del original.
- El correo pide PDF, ambas páginas completas, firma autógrafa y siete documentos.
- El libro también pide mínimo tres referencias (`1-2!F36`), cuestionario de
  seguridad (`1-2!B51:J55`), políticas de crédito (`2-2!B31:L42`) y una declaración
  bajo protesta (`2-2!B44:L51`). Estos elementos deben figurar en la revisión,
  aunque no aparezcan como adjuntos independientes en el correo.
- El correo exige un mes para SAT/CSF/banco; el libro indica tres meses para
  algunos documentos. Preservar ambas fuentes y satisfacer el límite más estricto
  mientras no exista una aclaración específica.
- `2-2!B53:L62` es uso interno del transportista. No completar sus decisiones,
  aprobaciones o validaciones con datos de XBF.

## Correcciones de esta entrega

1. La API selecciona primero la versión más reciente del manifiesto y después
   su última revisión. Comprueba estado, versión y hash. Un manifiesto nuevo sin
   revisión invalida el uso de la revisión anterior.
2. El trigger SQL aplica el mismo prerrequisito. Su alcance está documentado como
   vigencia de revisión; no se presenta como un evaluador documental completo.
3. Un recibo de aplicación electrónica de firma no se convierte en evidencia de
   firma autógrafa. Los requisitos autógrafos siguen pendientes de evidencia del
   método solicitado o de una alternativa aceptada expresamente.
4. Prueba ejecutable de la migración y de la consulta real de la API en PostgreSQL
   temporal con PGlite, sin Docker ni conexión a Supabase. Cubre ausencia de
   manifiesto/revisión, sustitución, versión/hash incorrectos, otra organización
   y varias versiones revisadas. Es una prueba de integración enfocada con esquema
   mínimo, no un replay completo del Supabase compartido ni una prueba de producción.
5. El validador compartido por la UI y `osp-form-api` acepta `false` como respuesta
   a sí/no, sin confundirlo con una casilla obligatoria de aceptación. Filas vacías
   ya no completan una tabla requerida; filas adicionales vacías tampoco pasan.
6. La pantalla identifica el denominador del porcentaje como campos de la plantilla
   publicada y enumera las exclusiones condicionales. No equivale a certificar el
   original, sus documentos o su firma. Se reutiliza el resumen de faltantes existente.
7. El cliente reconoce `FULFILLMENT_BLOCKED` con HTTP 409 y no reintenta ese bloqueo.
   Su omisión anterior también impedía la comprobación estática de TypeScript.

La continuación del Sprint 13 agrega mínimo de filas, obligatoriedad por columna,
formatos de correo/teléfono y una clave de unicidad opcional a la tabla canónica.
La omisión de estas propiedades conserva la estructura anterior y sus hashes.
Estas reglas se aplican sólo donde la versión de plantilla las declara; no se
han publicado nuevas plantillas ni promovido datos personales en producción.

La preview sintética del formulario Sierra incluye tres empresas ficticias sin
correo, muestra el faltante por fila y bloquea la entrega. No es el expediente
Salzillo ni evidencia de que su formulario original esté completo.

Se adapta la matriz existente de SurveyJS 3.0.1 (licencia MIT del paquete local),
sin dependencias nuevas ni cambios de licencia del editor. Referencia técnica:
[matriz dinámica oficial](https://surveyjs.io/form-library/examples/dynamic-matrix-add-new-rows/documentation).
No se introduce un generador paralelo de formularios.

Validación del bloque de referencias: 80 pruebas Vitest, 12 Deno, 38 de frontera
de UI; TypeScript, lint enfocado y build sintético aprobados. La guía de pruebas
se aplicó a tres capas: round-trip de esquema y reglas, interacción real con
SurveyJS y comandos HTTP con almacenamiento en memoria. La prueba HTTP verifica
que un rechazo no cree instancia ni avance el caso. No sustituye un replay en
el Supabase compartido. La prueba de interfaz completa tres correos ficticios y
comprueba que sólo entonces se ejecuta la entrega del formulario.

## Pendientes para cerrar Salzillo

| Resultado necesario | Pendiente concreto |
| --- | --- |
| Formulario original completo | Vincular todos los campos aplicables a valores comprobados o una exclusión razonada; no usar cantidad de celdas desbloqueadas como prueba de completitud. |
| Referencias | Hay tres empresas comunicadas por el usuario; faltan sus correos. Mantener estos datos en el borrador privado, no en fixtures ni en este documento. |
| Seguridad | Respuestas sobre controles, CCTV, procedimientos, antecedentes y certificaciones. No presumir respuestas afirmativas. |
| Facturación y crédito | Confirmar datos mexicanos: no trasladar automáticamente términos, cuenta bancaria ni contactos del perfil estadounidense. |
| Documentos vigentes | Conciliar las versiones aprobadas actuales de los siete documentos con el paquete exacto. Esta entrega no consultó su vigencia en producción. |
| PDF y firma | Generar e inspeccionar el PDF real y acreditar el método solicitado; pestañas visibles no equivalen a páginas renderizadas. |
| Decisiones y declaración | Presentar las condiciones y el alcance de la declaración al firmante; no confundir la aprobación de desarrollo con su aceptación. |
| Resultado de negocio | Sales revisa el paquete corregido. No modificar ni reenviar el caso Salzillo productivo antes de esa revisión. |

## Esfuerzo recomendado de Codex

Estos son ajustes de razonamiento, no estimaciones de horas ni cambios del modelo
de IA usado por la aplicación. El ajuste de esta conversación lo controla el usuario.

| Bloque de cierre | Modelo / esfuerzo | Criterio de salida |
| --- | --- | --- |
| Salzillo: completar el Sprint 13 | Astra / alto; muy alto sólo para un fallo de integración no explicado | Dos páginas correctas, PDF y ocho entregables del correo conciliados, requisitos adicionales del libro resueltos. |
| Adaptabilidad: Sprint 14 | Astra / alto; muy alto para resolver diferencias entre formatos | Dos solicitudes adicionales con formatos y cantidades de requisitos diferentes, incluyendo varios formularios; ninguna omisión silenciosa. |
| Validación y lanzamiento: agrupar 15–16 | Astra / alto en integración; medio en ajustes rutinarios | Flujo autenticado repetible desde la app, paquete correcto revisado por Sales, versión desplegada identificada y recuperación comprobada. |

No asignar un porcentaje ni declarar terminados estos bloques sólo por commits,
tests unitarios o entrega de un correo. La evidencia exigible es el resultado
contra la solicitud fuente.

## Reproducción de las pruebas

Validación local completada el 2026-09-04:

- Vitest: 82 pruebas aprobadas en nueve archivos de formularios y clientes API.
- Deno: 21 pruebas aprobadas, con ocho escenarios PostgreSQL adicionales.
- Contrato de acciones: 157/157 superficies registradas con huellas vigentes.
- Frontera de UI: 38 pruebas aprobadas tras actualizar sólo las tres huellas
  de archivos fuente modificados. No se relajó la frontera ni su inventario.
- TypeScript, lint enfocado, build y `git diff --check` aprobados.
- Sin despliegue, migración remota, validación visual cloud ni prueba productiva.

Los primeros intentos detectaron tipos de fixture incorrectos, el código de error
faltante y huellas desactualizadas. Se corrigieron y se repitieron las comprobaciones;
el build por sí solo no se usó para declarar aprobada la comprobación de tipos.

Desde el checkout OSP:

```powershell
deno test --allow-env --allow-read --allow-sys --node-modules-dir=none --no-lock supabase/functions/osp-case-api/request-review-freshness.integration.test.ts supabase/functions/osp-case-api/request-semantic-gate.test.ts supabase/functions/_shared/osp/request-contract.test.ts supabase/functions/osp-case-api/operations-review.test.ts
```

La dependencia PostgreSQL está fijada en `npm:@electric-sql/pglite@0.5.8` sólo en
la prueba. La primera ejecución puede descargarla. Los casos son sintéticos;
no lee archivos de clientes ni envía comunicaciones.
