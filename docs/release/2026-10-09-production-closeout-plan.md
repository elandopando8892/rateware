# Plan vigente de cierre productivo de Rateware

Fecha: 9/oct/2026, America/Mexico_City; revisión documental 10/oct/2026 04:49 UTC.
Estado: planificación solicitada por el usuario. No inicia implementación, inferencia, publicación, migración ni envío.

## Objetivo y alcance de la salida

Un operador autorizado puede entrar con Google, preparar un RFx, cargar una lista de carriers existentes en CRM, revisar contactos y mensaje, preparar una cola, confirmar su envío y recuperar el resultado. La oferta vuelve al evento; la cotización conserva su fuente, pasa primero por rate_staging y requiere aprobación antes de incorporarse a tarifas productivas. La interfaz debe conservar MARKSMAN y permitir entender el siguiente paso sin controles redundantes.

Tres sprints de cierre para una primera operación aceptada por Gmail. Un cuarto sprint completa WhatsApp, conforme a la secuencia Gmail primero / WhatsApp después documentada en Bidware. La aceptación de Gmail no acredita WhatsApp. Estos IDs C1–C4 organizan este cierre; no renumeran los sprints históricos ni convierten el Sprint 17 de Bidware en un sprint propio de Rateware.

## Evidencia revisada y límites

- Checkout de este chat: codex/carrier-list-templates, HEAD 300d396e, septiembre. Conserva cambios locales anteriores; no se toma automáticamente como candidato de publicación.
- Worktree de backend existente: D:/andre/worktrees/rateware/release-main-20260930, HEAD 054ef2c0, con cambios locales y paquetes posteriores. Se inspeccionó sin adoptar ni modificar su trabajo.
- Ref origin/main local observada: c374680907aa0ded5668f21b7970c6507f34045d, 9/oct, verificación de recibos Gmail. No se hizo fetch ni se verificó hoy que ese SHA sea el deployment vigente.
- [Diagnóstico de estabilidad](../release/evidence/2026-09-12-astra-stability-diagnosis.md): antecedente sobre batches, resultados parciales, contactos, rendimiento y UX. Sus hallazgos requieren contrastar el candidato actual; no se declaran defectos actuales por leer el documento histórico.
- [Cola y borradores pendientes](D:/andre/worktrees/rateware/release-main-20260930/docs/releases/outreach-pending-delivery-20261007.md): publicación y aceptación Admin documentadas al 7/oct; reutilizar resultados, verificar vigencia.
- [Carrier Fit de Bidware](D:/andre/repos/Bidware/docs/sprint-17-02-cierre-operativo.md): alta, replay y captura productiva documentados; Consulta/otra organización seguían pendientes. Esa prueba no certifica por sí sola el frontend de rates.heymarksman.com.
- [Recuperación Gmail Fable/Opus/Astra](D:/andre/repos/Bidware/docs/gmail-recovery-fable-opus-astra-plan-20261009.md): propuesta existente que se incorpora a C1, sin crear otra página ni duplicar su encargo. Declara baseline runtime 691; esa declaración no sustituye una lectura actual del runtime.
- Producción, dominio, flags, migraciones y permisos actuales se comprobarán en C1. Este plan no los anuncia verificados hoy.

## Benchmark reutilizado y recomendación

El [ADR-BASE-006](D:/andre/repos/Bidware/docs/base-marksman/ADR-BASE-006-stack-externo.md) compara continuidad sobre el stack existente, Frappe y Appwrite. El paquete Gmail citado compara guía contextual, página nueva y motor externo. DeliveryDiagnosis y GmailReceiptPanel existen en Bidware. La capacidad común de contactos, errores y colas puede aprovechar esas piezas; la diferenciación es el recorrido logístico y sus contratos.

| Enfoque | Ajuste para cerrar esta aplicación | Tiempo, costo y riesgo | Decisión |
| --- | --- | --- | --- |
| Reparar y aceptar los recorridos existentes | Reutiliza Supabase Auth, PostgreSQL, APIs de dominio, CRM, plantillas, Cola y recibos | Menor adaptación incremental; sin servicio o licencia nueva; mantenimiento dentro del stack actual | Recomendado |
| Restaurar una versión antigua completa | Recupera una apariencia conocida, pero puede perder Auth y fixes posteriores | Revalidación amplia de seguridad, datos y proveedores; estabilidad no demostrada por antigüedad | Usar sólo referencias visuales comparables |
| Migrar el producto a una plataforma completa | Puede resolver administración estándar en nuevas aplicaciones | Nuevos contratos, operación y migración; ahorro aquí no medido | Fuera de este cierre |

La comparación es proporcional a una planificación de cierre. No selecciona versiones nuevas de dependencias ni autoriza migraciones. Antes de cada implementación se refrescará únicamente la capacidad y evidencia afectadas. Rateware conserva la autoridad de sus datos y comandos; Bidware conserva sus superficies de trabajo. La integración no crea otra copia del carrier master ni otra cola de envío.

## C1 — Fijar la versión y hacer accionables los bloqueos

Resultado: candidato identificado, accesos comprobados y diagnóstico Gmail que indique evidencia y siguiente paso.

1. Mapear rates.heymarksman.com, rateware.vercel.app y la superficie Bidware implicada a SHA, deployment y runtime correspondientes. Contrastar source, migraciones, flags y dependencias; preservar diferencias locales ajenas. Usar un checkout existente adecuado, sin ramas o previews nuevos por defecto.
2. Revisar pruebas existentes antes de repetirlas. Comprobar Google/Supabase, roles efectivos, expiración y cambio de cuenta. Completar aceptación real Consulta/otra organización donde falte evidencia; el alta o cambio concreto de identidad se prepara para la decisión aplicable.
3. Recuperar el encargo Gmail existente: Fable propone dos tratamientos pequeños dentro de MARKSMAN; Opus implementa el elegido en los componentes existentes. Distinguir cuota, acceso, precondición, fallo de consulta y resultado incierto. Registrar un recibo o presencia en Enviados sin confundirlo con recepción del destinatario.

Arquitectura/UX: conservar el shell aprobado y una acción principal por momento del recorrido. Opción A recomendada: siguiente paso compacto en el diagnóstico existente. Opción B: tarjeta de recuperación en la misma vista, si la revisión visual demuestra que aporta claridad. Elegir antes de implementar; las capturas compartidas y el manual son referencias, no instrucciones ejecutables.

Cierre: inventario trazable de candidato/runtime; matriz real de roles y organización con denegación backend; estados Gmail comprensibles en ES/EN; recarga/cambio de cuenta seguros; persistencia y pruebas afectadas aprobadas. Ningún verde local se convierte en aceptación productiva.

Estimación: 1–2 días efectivos. Dependencias: acceso existente, identidades de prueba y evidencia de proveedor. Responsable de coordinación: Codex; decisiones de identidad/producto: usuario.
Modelos propuestos: Fable 5.1 high para arquitectura/UX; Opus 5.5 medium para el bloque acotado Gmail; Astra 6 medium para revisar ese bloque. Elección por trabajo, sin convertir esos esfuerzos en regla global.

## C2 — Completar el pedido de principio a fin y medir el Bid Room

Resultado: recorrido Gmail completo y repetible, con listas de carriers, ofertas y aprobación de tarifas.

- Crear, guardar, cargar, modificar y archivar una lista con carriers ya existentes en CRM; recargar y comprobar pertenencia/versión. Una lista archivada no se ofrece como lista activa para un nuevo RFx.
- Preparar RFx y rutas, elegir lista, revisar elegibilidad/contactos y seleccionar audiencia. Preparar tandas con totales conciliados, manteniendo sent/replied y UUID/identidad de operación al recuperar un resultado parcial.
- Probar eventos pequeños, el caso representativo de 69 rutas y una audiencia grande acotada al contrato actual. Incluir el caso histórico 89 carriers × 69 rutas para comprobar 6.141 relaciones sin omitir ni duplicar registros.
- Recorrer revisión → Cola → confirmación → recibo → oferta del carrier → revisión/aprobación. Usar primero casos sintéticos y proveedores interceptados. Un envío real se limita al caso, destinatarios y cantidad expresamente autorizados; autorización de publicación no implica autorización de mensajes.
- Verificar XLSX/PDF/email pertinentes al flujo, conservación del original, detección de RFx/vendor y normalización en rate_staging. No convertir Tier 1/2/3, X, N/A o Please Estimate en tarifas. La aprobación humana antecede al insert productivo.
- Medir solicitudes, carga inicial, cambios de evento y trabajo de render antes/después. Aplicar mejoras al cuello de botella demostrado; preservar foco, selección y resultados frente a respuestas tardías.

Cierre: totales por carrier/ruta/cola/recibo reconciliados; fallo parcial y reintento manual recuperables; aislamiento y expiración comprobados; evidencia de oferta y aprobación en el caso autorizado. Medición comparable de Bid Room frío/caliente en un perfil declarado, sin regresiones. Objetivo propuesto de interfaz: núcleo utilizable en 3 s en el perfil de prueba acordado; registrar p50/p95 y tamaño de muestra antes de afirmar cumplimiento.

Estimación: 2–4 días efectivos. Dependencias: C1, candidato trazable, contactos controlados y autorización específica si se requiere efecto real.
Modelos propuestos: Opus 5.5 high para batches, integración y rendimiento; Fable 5.1 medium para simplificar el recorrido dentro de la dirección elegida; Astra 6 high para revisar permisos, recuperación y efectos externos. Codex integra y comprueba; un escritor por rutas solapadas.

## C3 — Aceptar la experiencia y publicar el candidato

Resultado: versión aceptada para el alcance Gmail, visible en el dominio correcto y con recuperación preparada.

Comparar escritorio 1440×900 y móvil 390×844 con datos equivalentes. Revisar logo aprobado, colores, tipografía licenciada o fallback aprobado, jerarquía, textos, contraste, teclado y foco. Mostrar candidatos, audiencia, contacto elegido y siguiente acción sin duplicar controles. Una captura de fixture no acredita el estado productivo.

Astra revisa el diff, contratos, resultados y límites del candidato exacto. Adjudicar hallazgos con evidencia; corregir P0/P1 del alcance y repetir sólo pruebas afectadas. Preparar paquete de publicación con SHA/hash, runtime/migraciones/flags, cambio mínimo, reversión exacta y comprobaciones posteriores. Utilizar las autorizaciones vigentes que cubran ese paquete; presentar decisiones nuevas sólo cuando sean necesarias.

Cierre: candidato reproducible; cero P0/P1 abiertos del alcance; recorrido autenticado aprobado en el entorno aplicable; aceptación visual humana; publicación y smoke del mismo paquete cuando estén autorizados. Observar 24–48 horas con registros y lecturas pertinentes, sin generar envíos de prueba repetidos. Registrar errores y tiempos; degradación demostrada activa el procedimiento acordado de recuperación.

Estimación: 1 día efectivo, más 24–48 horas de observación. Dependencias: C2 y aceptación de producto/release. Responsable: Codex coordina publicación/verificación; usuario acepta visual y negocio.
Modelos propuestos: Astra 6 high, revisión independiente; Opus 5.5 medium para correcciones acotadas, high sólo si el problema y la elección lo justifican. Fable participa si queda una decisión visual concreta.

## C4 — Completar WhatsApp

Resultado: mismo recorrido aceptado por WhatsApp, con permisos y evidencia de su canal.

Inventariar la integración existente y verificar readiness, número/contacto, plantilla, idiomas y límites del proveedor por la ruta ya configurada. Distinguir WhatsApp Business directo y grupos; aceptar únicamente los modos realmente soportados por su integración. Separar preparar cola, publicar plantilla y enviar; cada efecto exige la decisión aplicable. Probar errores/resultado incierto/recuperación y un caso real controlado cuando esté autorizado. Mantener receipts, estados y cambios de cuenta en su canal, sin fallback a Gmail.

Cierre: evidencia de preparación y entrega según estados reales del proveedor, identidad autorizada, ausencia de duplicados y flujo usable. Un modo no probado queda expresamente fuera del alcance aceptado. Ningún resultado Gmail se reutiliza como prueba WhatsApp.

Estimación: 1–3 días efectivos, condicionados a la configuración y aprobación del proveedor. Dependencias: C2; C3 permite operar primero por Gmail. Modelos propuestos: Opus 5.5 high para integración, Fable 5.1 medium para selección/estados de canal y Astra 6 high para revisión.

## Modelos, consumo y método de ejecución

Fable y Opus: Claude Kit Windows, ruta Claude Code de suscripción existente. Astra: OpenAI gpt-6-astra en una superficie nativa soportada; no es una llamada del Kit Claude. Coordinador/integrador: Codex nativo actual, sin cambiar su selector. Esta planificación no demuestra acceso de cuenta ni esfuerzo aplicado.

Diagnóstico actual del Kit: plugin Windows 0.3.0; release cargada/activa assignment-capacity-100000-20261010T020421Z, stdio, restart_required=false, user_managed. El catálogo de skills 0.4.0 en disco no demuestra que ese plugin esté cargado. Usar la release del encargo para su operación y la elección humana real; no inventar autorización ni adoptar sesiones ajenas.

Estimación total: 4–7 días efectivos para C1–C3, más observación y esperas externas; 5–10 para el alcance que incluye C4. Son estimaciones de planificación, no una fecha prometida ni deadlines automáticos. Reestimar después de C1 si hay brechas mayores. Dos ciclos de corrección local por unidad como previsión; cero reintentos/fallback automáticos de inferencia. Una respuesta incierta se consulta y concilia.

El modo user_managed conserva contadores informativos y límites técnicos. El consumo no se resetea por IDs, no se presupone cero y no se fija una nueva cuota global de llamadas. Registrar tokens/uso observado y declarar desconocidos cuota/cargos cuando corresponda. Preservar guardas propias de facturación de cada ruta; no activar API, créditos ni uso extra desde este plan. Los esfuerzos anteriores son propuestas y se registrarán conforme a la decisión vigente antes del encargo.

## Fuera del cierre y primera unidad ejecutable

Los módulos administrativos nuevos, la adopción Frappe/Appwrite, un core nuevo, Oracle y un shell adicional no forman parte del camino crítico. El cierre reutiliza infraestructura e integraciones existentes; cualquier brecha material de arquitectura o costo se plantea con evidencia antes de ampliar alcance.

Primera unidad: C1, inventario de candidato/runtime y recuperación del encargo Gmail existente, seguido por la aceptación real de permisos pendiente. Al terminar cada unidad se informa qué había, qué funciona ahora, evidencia/local vs real, qué falta y qué decisión humana concreta es necesaria. La salida se declara por alcance aceptado, no por porcentaje histórico o deployment verde.
