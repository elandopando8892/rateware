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

### Empresa y contacto sobre un mismo destino revisado

La continuación del Sprint 13 permite una proyección explícita de varias
columnas de texto de la misma fila sobre una sola celda, reutilizando el
resolver y generador existentes. Ejemplo de forma del mapa (no publicado):

```json
{"fieldKey":"references","rowIndex":0,"columnIds":["company","contact"],"separator":" — ","sheet":"1-2","cell":"C43"}
```

Se admiten entre dos y ocho columnas distintas de texto, en el orden revisado,
y separador ` — ` o salto de línea. El target normal de una columna no cambia.
No se infieren combinaciones, eliminan partes vacías, truncan valores largos ni
mezclan filas. Cada componente seleccionado, aunque sea opcional en la tabla,
debe existir y tener texto; los datos restantes requeridos o provistos deben
conservar sus destinos. Correo y teléfono mantienen sus columnas tipadas y su
validación, no entran a esta concatenación de texto.

El recibo identifica `references.row1.joined.company.contact`; el mapa revisado
conserva los selectores, su orden y separador. La consulta productiva existente
transporta ese target sin cambios: siguen aplicando los enlaces de tenant,
extracción, decisión, versión y snapshot. No se publicó ningún mapa real.

Pruebas nuevas y ampliadas:

- Combinación completa de tres referencias en nueve celdas: se conservan las
  doce piezas de información. Orden, separadores, duplicados, campos inexistentes,
  componentes vacíos/opcionales, columnas tipadas, texto excesivo y cobertura
  parcial se comprueban sin datos personales.
- Generación y reapertura XLSX sobre áreas combinadas con las coordenadas de
  referencia inspeccionadas; preservación de estilos, altura, área de impresión
  y sección interna. La fixture es sintética, no una copia de Salzillo.
- Variante XLSM sintética: el archivo reabre, mantiene los valores escapados y
  todas las partes ZIP ajenas a la hoja editada idénticas. Los bytes de VBA e
  impresión son centinelas inertes, no macros ejecutadas ni prueba de impresión.
- SQL real del worker en PGlite: ocho escenarios, incluidos selectores combinados,
  selector inválido y mapa sin revisión aceptada. Los rechazos no reservan ni
  descargan archivos; infraestructura restante simulada, no smoke en Supabase.

La primera prueba de reapertura XLSM falló con XML inválido. La guía de depuración
permitió aislar el parser regex de celdas: una etiqueta vacía `<c .../>` se tomaba
como apertura y consumía hasta el cierre de una celda posterior. Se corrigieron
la sustitución y el conteo de ocupación para reconocer primero el autocierre.
La regresión comprueba también el valor y la fórmula vecinos y el listado de
celdas realmente vacías. No se atribuyen fallos productivos históricos a esta
causa sin inspeccionar sus artefactos.

Validación enfocada: 18 pruebas Deno y ocho escenarios SQL aprobados; lint de
los archivos afectados y contrato de acciones 157/157. La guía de pruebas
organizó validación, transformación, integración SQL y reapertura de artefactos.
No se instaló dependencia ni servicio nuevo.

Pendiente: elegir y revisar la proyección real y su ajuste visual en el original
Salzillo. Una cadena correctamente persistida no prueba que se vea completa al
imprimir. Faltan valores reales, aplicabilidad, evidencia vigente, PDF y revisión
de Sales. Sin push, despliegue, migración, firma, correo o cambio de caso real.

### Verificación visual del bloque de referencias

Se inspeccionó el original y se generaron capturas locales con las tres empresas,
contactos y teléfonos comunicados. Los correos se muestran como pendientes; no
se inventó ninguno. Los datos permanecen en `tmp`, fuera de los fixtures y Git.

- La vista de una línea muestra completos los tres pares empresa/contacto en
  `1-2!C43`, `G43` y `C47`, sin cambiar alturas ni anchos. Se propone separador
  ` — ` para la revisión del mapa, no su publicación automática.
- La alternativa con salto de línea y filas 43/47 a 30 puntos fue legible pero
  cambia la geometría vertical. No se aplicó al original ni al worker.
- La primera captura muestra un teléfono internacional sin espacios en notación
  científica pese a que el getter de Artifact Tool devuelve el string exacto.
  Aplicar formato de texto en el probe no corrigió esa representación. La
  captura legible añade sólo espacios de presentación después de comprobar que
  los dígitos y el prefijo no cambian. No se atribuye este comportamiento a OSP.
- Se reforzaron las pruebas sintéticas del generador: al reabrir XLSX y XLSM se
  conserva un teléfono sin espacios, con `+`, como string exacto. En el XML de
  XLSM se verifica `inlineStr` y el valor literal, sin conversión numérica.
  Nueve pruebas enfocadas aprobadas, incluidas las dos rutas de archivo.
- Las celdas de referencia del original declaran Arial Nova Cond Light, 10 pt.
  No se encontró esa fuente en las carpetas de fuentes Windows consultadas;
  no se verificó el fallback interno de Artifact Tool. El ajuste observado es
  evidencia del visor, no certificación de impresión ni del PDF definitivo.
- El proceso de render imprimió resultados y generó las capturas pero devolvió
  código 1 al terminar, sin diagnóstico adicional. Se conserva esa limitación;
  no se etiqueta la ejecución completa como un gate automático aprobado.
- El hash del original permaneció
  `af45f6627106edc5fd5fd114dca56a337290301a5a059aa07f7e36f8e236b3ee`.
  No se exportó una conversión XLSX que pudiera perder sus macros o controles.

La habilidad de hojas de cálculo se aplicó a inspección de estilos y coordenadas,
comparación visual y preservación del original. Informe privado navegable:
`tmp/osp-s13-artifacts/revision-visual-referencias.html`.

Esta iteración **no entrega el PDF final**. Las imágenes son probes en memoria,
no el paquete real producido por el worker. Falta verificar el render de los
bytes exactos del paquete con los valores completos y el entorno tipográfico
elegido. La verificación visual del bloque no acredita las otras secciones,
documentos, aprobación de Sales o firma autógrafa.

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

### PDF sin truncación y evidencia del archivo exacto

Continuación local del Sprint 13, 2026-09-04. Se reutilizó `pdf-lib` y el
generador existente; sin nuevas dependencias, infraestructura ni proveedores.

- El anexo PDF ya no recorta valores a 180 caracteres. Conserva el texto y los
  párrafos, ajusta líneas y pagina; rechaza una salida que exceda 100 páginas
  adicionales, en lugar de descartar contenido silenciosamente.
- Una escritura sobre un PDF plano rechaza texto más ancho que su rectángulo
  revisado; no lo deja desbordar mediante ajuste automático de líneas.
- El recibo incluye `pdfStructure`, con páginas contadas al reabrir los bytes
  serializados y su SHA-256. Es estructura, no prueba de legibilidad, cobertura
  del original ni cumplimiento del carrier.
- El gate acepta esa estructura sólo para un PDF y su hash exacto. Ya no
  interpreta hojas visibles o celdas ocupadas del Excel como páginas PDF o
  cumplimiento al 100%, ni hereda el recibo de un paquete anterior a la firma.
- `completionPercent` queda desconocido en este adaptador hasta implementar
  evidencia revisada de campos aplicables vinculada a los bytes finales. Por
  tanto, un requisito de llenado al 100% permanece bloqueado: esta corrección
  elimina un falso PASS, **no termina la integración del paquete corregido**.
  Los PDF firmados también necesitan su propia evidencia de estructura.

Validación de esta iteración: 43 pruebas Deno y ocho escenarios SQL aprobados;
contrato de acciones 157/157, formato, lint enfocado y `git diff --check`
aprobados. La habilidad de estrategia de pruebas guio
la regresión de recibos heredados, hash incorrecto, páginas fraccionarias,
tipo incorrecto y diferencia entre firma electrónica y autógrafa.

La habilidad PDF añadió verificación independiente de los bytes y revisión
visual. Un PDF sintético conserva 120 entradas y el marcador final: pypdf
recuperó las 121 líneas esperadas, sin faltantes. Se inspeccionaron las cinco
páginas renderizadas con Poppler: una página fuente vacía deliberada y cuatro
de anexo, sin recortes ni solapamientos visibles. Poppler terminó con código 0
y advertencias de fuentes de respaldo Symbol/ArialUnicode; este fixture usa
Helvetica y texto ASCII. No acredita tipografía ni impresión de Salzillo.
Los archivos de prueba permanecen en `tmp/osp-s13-pdf-regression`, fuera de Git.

No se generó el PDF final Salzillo, convirtió su XLSM, modificó su caso real,
firmó ni envió. Sin push, despliegue o migración. Siguiente integración:
conciliar campos aplicables y evidencia revisada con el PDF final exacto, sin
confundir una captura o el mero número de páginas con el cumplimiento.

### Revisión local por campo del PDF exacto

Continuación del Sprint 13: panel integrado en Operaciones exclusivamente en
build `preview-synthetic`, con seis requisitos ficticios. Reutiliza React, la
pantalla y estilos operativos XBF; no instala dependencias ni crea otro flujo.

Cada decisión conserva su campo, ubicación en el PDF y nota. La exclusión exige
motivo y sólo se ofrece donde el inventario permite no aplicabilidad. Caso,
manifiesto, inventario y bytes del archivo forman el contexto de la revisión;
cambiar cualquiera invalida las decisiones. La huella del inventario incluye
identificador, etiqueta, ubicación fuente y aplicabilidad, con orden canónico.
Una lectura de archivo lenta no puede sustituir una selección posterior.

La selección lee como máximo 25 MB en memoria y exige cabecera PDF. **No es un
parser PDF ni valida contenido, páginas o renderizado**. No sube el archivo,
no persiste decisiones, no emite recibo autorizado ni modifica el gate del
servidor. Se muestran comprobados, no aplicables y pendientes por separado,
nunca un porcentaje de cumplimiento. Un borrador local completo sólo está
listo para futura revisión autenticada; `authorizesWorkflow` siempre es falso.

El escenario Sierra ahora muestra explícitamente su PDF pendiente en lugar
del fallback de caso completo. Otros escenarios mantienen sus estados.
La frontera de UI admite únicamente el selector PDF de este archivo revisado;
rechaza otros tipos, importaciones de cliente API, red, almacenamiento local
y acciones productivas. Las huellas e inventario se actualizaron explícitamente.

Evidencia local: 39 pruebas Vitest, 39 de frontera, TypeScript y lint enfocado
aprobados. Smoke Chrome sobre el build estático: seis decisiones, invalidación
al cambiar bytes, reinicio explícito, Operaciones todavía bloqueado, cero
solicitudes externas y cero errores de página. Desktop 1280×900 y móvil 390×844
inspeccionados; sin desbordamiento horizontal. Capturas privadas bajo
`tmp/osp-s13-review-preview-evidence`. El fixture del smoke es deliberadamente
sólo una cabecera PDF: prueba identidad de bytes, no validez documental.

La habilidad de pruebas guio identidad, exclusiones y carreras asíncronas; la
lista de despliegue limita la entrega a preview estática en el proyecto Vercel
existente. No hay CI remoto ni validación productiva. Ante un fallo de preview,
no promoverla; la URL anterior y producción permanecen sin cambios.

Pendiente real: inventario aprobado completo por formulario, persistencia con
identidad/versión y verificación del archivo por el servidor, integración de
esa evidencia en el gate y revisión del paquete corregido por Sales. No se
aplicó al caso Salzillo, firmó, envió ni promovió conocimiento.

Preview de este bloque: código `e0969ec`, deployment
`dpl_C648QP6b3xMZ4opxP3QwAYdQX5Sj`, estado `READY`, target preview (`null`).
Proyecto existente `prj_6mVnZ4DNVH3U2KCyQgyRMZDCJx8s`; sólo archivos estáticos.
[Revisión sintética Sierra](https://osp-customer-setup-hfuvpt64m-elandopando8892s-projects.vercel.app/app/cases/11111111-1111-4111-8111-111111111115/review).
La protección Vercel permanece activa. Se generó un enlace temporal de acceso;
no se conserva su token en Git. El primer smoke sin sesión terminó en la
protección de Vercel, y el HTTP 200 observado era login, no OSP. Tras obtener
acceso temporal se repitió el smoke sobre cloud: seis campos, cambio de bytes
invalidante, workflow bloqueado, cero peticiones externas desde la interacción,
cero errores de página y móvil sin desbordamiento. No equivale a aceptación
del documento Salzillo ni prueba autenticada del backend productivo.

El CLI rechazó `--skip-domain` antes de desplegar porque esa bandera sólo sirve
para producción. Se retiró únicamente esa bandera y se mantuvo el destino
preview. No hubo promoción, migración, función nueva ni push de Git.

### Memoria corporativa aprobada conectada al autollenado

Implementación local: `20260905050000_osp_approved_profile_memory_reuse.sql`.
Se inspeccionaron dos bases internas: el catálogo semántico supervisado y el
registro `provider_legal_entity_facts`. Se reutiliza el segundo para valores;
el primero conserva conceptos, no respuestas empresariales. No hay tabla nueva,
reentrenamiento, proveedor adicional ni modificación del contrato del RPC.

El worker ya consume `load_xbf_customer_setup_candidates_for_case`. Su proyección
pasa de cuatro conceptos a diez mediante trece códigos explícitos: razón social,
identificador fiscal, domicilio fiscal, teléfono, correo, sitio web, representante
legal, régimen fiscal, banco y número de cuenta. Los aliases cuenta/CLABE no se
resuelven por prioridad si difieren: el motor conserva ambos y pide aclaración.
Una plantilla debe declarar el identificador canónico correspondiente para usarlo.

Sólo se devuelven valores escalares del perfil de la entidad activa vinculada al
caso y al tenant actual. Se exige hecho vigente, promoción aplicada, revisión
aprobada, campo aceptado/corregido con el mismo valor promovido y soporte activo
y verificado. Se respetan fechas efectivas y expiración declaradas del soporte.
Datos o campos restringidos quedan fuera de esta reutilización genérica; no se
relajan las políticas separadas de divulgación ni se adjunta el documento fuente.
La referencia `rateware:legal-entity-fact:<id>` acompaña el valor al borrador.

Validación: 13 pruebas Deno con 19 escenarios PostgreSQL efímeros aprobados;
incluye dos casos de la misma entidad, aislamiento de otra entidad/tenant,
revisión pendiente, dato retirado, soporte vencido/no verificado/revocado,
corrección aprobada, valor cambiado tras aprobación y los trece códigos.
Se ejecuta la migración real dos veces sobre esquemas mínimos basados en las
columnas existentes; no sustituye probar el esquema completo de Supabase.
El pipeline de autollenado mantiene conflictos, evidencia y cero efectos
externos. Lint enfocado y contrato de acciones 157/157 aprobados. La habilidad
de pruebas guio las comprobaciones de persistencia, consumo y aislamiento.

Límites: no presume fecha de expiración cuando no está declarada, no acredita
la antigüedad máxima que pida un carrier y no sustituye la matriz documental.
No incorpora tablas de referencias, respuestas de seguridad o términos de
crédito particulares como hechos generales. Tampoco captura automáticamente
respuestas nuevas del formulario o de la preview: sigue pendiente presentarlas
como candidatas con alcance, fuente y decisión humana antes de incorporarlas
a memoria persistente. Este bloque consume hechos ya aprobados y promovidos.

Sin aplicación remota, push, despliegue, canary productivo, promoción de datos,
firma o correo. La preview de revisión PDF no cambió. Para activar esta parte
se requiere aplicar la migración autorizada y verificar lectura en el backend
compartido; el worker conserva la misma llamada y firma del RPC.

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
