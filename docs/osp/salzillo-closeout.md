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

### Preview del bloque de referencias

- Código: `182c5b4`. Proyecto existente `osp-customer-setup`.
- Deployment: `dpl_JECJPE8vKEZzkz5Muwd5VG1jKmfv`, estado `READY`, preview.
- [Formulario sintético](https://osp-customer-setup-1pnidaqea-elandopando8892s-projects.vercel.app/app/cases/11111111-1111-4111-8111-111111111115/form).
- Sólo build estático precompilado; no funciones, migraciones ni backend nuevos.
- SHA-256 del HTML desplegado:
  `78cd07dee6d284e1b134827bbd81625a1d84f36e9b1149288548f3c5e6fd98f1`.
- Verificación en navegador: tres correos faltantes visibles, porcentaje 75%;
  al introducir correos `example.test` y salir del campo, porcentaje 100%.
  La revisión de evidencia sigue separada. No se guardó ni entregó el borrador.
- Vista móvil 390×844: referencias apiladas con etiquetas y valores legibles.
  En escritorio la tabla conserva desplazamiento horizontal. Se reutilizan
  logo, paleta y estilos existentes; no se declara una auditoría integral de marca.
- Se restableció el tamaño del navegador y se recargó el ejemplo: los cambios
  de prueba sólo existían en memoria. No se alteró Salzillo productivo.
- El contrato de acciones continúa aprobado: 157/157 superficies.

## Pendientes para cerrar Salzillo

### Puente de tablas al Excel original

La siguiente continuación del Sprint 13 corrige una omisión del worker: su
consulta sólo aceptaba valores JSON simples y no podía llevar tablas al original.
Ahora resuelve los destinos explícitos del mapa asociado al snapshot de revisión:

```json
{"fieldKey":"references","rowIndex":0,"columnId":"email","sheet":"1-2","cell":"E10"}
```

`rowIndex` comienza en cero. Es un ejemplo sintético, no una coordenada aprobada
de Salzillo. Los destinos simples existentes conservan su forma
`canonicalFieldId` + `sheet` + `cell`. No se infieren destinos usando celdas
desbloqueadas ni se escriben secciones internas del carrier automáticamente.

- La consulta conserva destinos desconocidos para rechazarlos, en vez de
  descartarlos mediante un `JOIN` o un filtro y generar un archivo abreviado.
- Las tablas requeridas no pueden omitirse por completo; tampoco se permite un
  mapa parcial de sus celdas obligatorias o provistas. Se validan los datos con
  el mismo validador de formulario antes de reservar la generación.
- Prueba de archivo: 12 valores sintéticos, dos hojas; se reabre el XLSX y se
  comprueban las celdas, fórmulas, combinaciones, estilo, áreas de impresión y
  catálogo oculto. El hash de los bytes originales permanece intacto.
- Prueba de integración: se ejecutan las dos consultas nuevas/revisadas reales
  en PGlite. Cinco escenarios incluyen mapa completo, destino desconocido,
  tabla parcial, tabla omitida y huella distinta. Lease, reserva y descarga son
  dobles de prueba; no se presenta como replay completo de RLS/Supabase.
- Artefactos locales reproducibles con el test `reviewed-spreadsheet-targets.test.ts`
  y argumento `--export-synthetic`: `tmp/osp-s13-original-targets/DEMO-original.xlsx`,
  `DEMO-references-completed.xlsx` y `DEMO-receipt.json`. No contienen referencias
  personales del usuario y no son un paquete aprobado para enviar.
- Lint enfocado conserva la convención de imports versionados de pruebas del
  repositorio (`--rules-exclude=no-import-prefix`); no se alteró la configuración global.

Pendiente de producción: preparar y revisar el mapa concreto del Salzillo real,
con sus datos faltantes resueltos. Este cambio no publica ese mapa, no modifica
el expediente ni prueba PDF, firma autógrafa o cumplimiento total del carrier.

### Inventario concreto del original Salzillo (borrador local)

El archivo `docs/osp/maps/salzillo-format-3-3.json` contiene 114 destinos y sus
áreas combinadas reales, vinculados al SHA-256 del original. Se verificaron las
dos hojas renderizadas y su OOXML sin ejecutar macros. El inventario no contiene
datos personales ni secciones de `artifactTargets` ejecutables: no es una
plantilla publicada ni una aprobación semántica.

- Clasificación: 42 datos por comprobar, 38 decisiones, 10 comprobaciones de
  evidencia, 3 destinos de cuarta referencia, 11 datos del carrier a conservar,
  3 contenidos/cálculos preservados, 3 espacios sin campo, 2 credenciales en
  espera, 1 espacio de firma y 1 entrada bloqueada en el original.
- Las secciones internas `2-2!B53:M62` quedan excluidas. Se identificaron además
  seis anclas desbloqueadas dentro de esa exclusión; no se cuentan como datos
  XBF faltantes. Se preserva el pie de control `2-2!D64:J65`.
- Referencias reales: primera `C43/C44/C45`, segunda `G43/G44/G45`, tercera
  `C47/C48/C49`, todas en `1-2`. La cuarta ocupa `G47/G48/G49`.
  El original no tiene columna separada para contacto: aún se debe revisar una
  proyección empresa/contacto y comprobar su ajuste visual. El worker actual
  no admite dos valores independientes sobre un mismo destino; no omitir el
  contacto para forzar la generación.
- Seguridad: `1-2!D52:D55`, `H52:H55` y `J53` (CCTV). Son celdas de respuesta,
  no las celdas de sus etiquetas. Mantener las nueve respuestas pendientes.
- `1-2!H16:J16` (país) está bloqueada aunque tiene etiqueta de entrada. Se
  registra como `locked_input_review`; no quitar protección ni marcar completa.
- Usuario y contraseña del portal (`2-2!D17/D18`) requieren una decisión de
  acceso seguro o exclusión documentada; no recopilar ni incluir credenciales
  automáticamente en el paquete enviado.
- `tools/osp-check-workbook-map.py` sólo lee: comprueba huella, celdas existentes,
  anclas de combinaciones, unicidad, fórmulas preservadas, áreas excluidas y que
  ninguna ancla desbloqueada quede sin clasificación. No interpreta ni aprueba
  valores, listas desplegables, requisitos, firmas, PDF o completitud del paquete.
- Prueba real del inventario: 114 entradas, cero anclas desbloqueadas sin
  clasificar, archivo fuente sin cambio. Nueve pruebas sintéticas cubren XML
  real, deriva de huella, anclas interiores, omisiones, fórmulas/protección,
  área interna, duplicados, hoja oculta, tratamiento desconocido y límites.
- Se preparó el mapa privado navegable en
  `tmp/osp-s13-artifacts/salzillo-mapa-de-celdas.html`. No se publica el formulario
  del carrier ni los datos reales en una preview abierta.

Reproducción, sin servicios ni efectos de negocio:

```powershell
python -B tests/osp-workbook-map.test.py
python -B tools/osp-check-workbook-map.py --source "<original.xlsm>" --map docs/osp/maps/salzillo-format-3-3.json
```

Pendiente: revisión semántica del mapa, decisiones y datos faltantes, enlace a
la extracción/plantilla/snapshot revisados, llenado del original y prueba del
PDF. No se modificó el caso Salzillo productivo, ni se firmó o reenvió correo.

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
