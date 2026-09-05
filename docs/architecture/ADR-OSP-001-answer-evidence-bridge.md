# ADR-OSP-001: conectar respuestas aceptadas con evidencia reutilizable

**Status:** Accepted for local/preview implementation; production not authorized

**Date:** 2026-09-05

**Deciders:** responsable de producto OSP; implementación Codex

## Context

El objetivo sigue siendo completar el alta de **XBF como cliente del carrier**,
incluyendo todos sus requisitos de formulario y documentos. La memoria evita
preguntas repetidas; no entrena automáticamente los pesos del LLM ni convierte
un correo o una respuesta guardada en prueba de un dato corporativo.

El usuario autorizó continuar la siguiente actividad. Este bloque entrega el
diseño del enlace y una prueba ejecutable del mecanismo existente. No autoriza
migraciones remotas, publicaciones de datos, cambios en Salzillo, firmas o envíos.
Las tres etapas locales anteriores (proyección de hechos, captura y revisión de
respuestas) no se consideran activadas en producción por estar en Git.

## Inspección de reutilización

Barrido acotado del repositorio autorizado, con código y SQL reales, no sólo README:

| Base inspeccionada | Decisión | Compatibilidad, mantenimiento y esfuerzo |
| --- | --- | --- |
| Catálogo `provider_legal_entity_facts`, revisión documental y `promote_profile_review_facts_command` | **Adaptar** mediante un enlace OSP, conservando el catálogo compartido | PostgreSQL/TypeScript existentes; comando de agosto 2026, commit `824495f`. Conserva procedencia e historial, pero publica el lote documental completo y no renueva la fuente de valores iguales. Es la base con menor duplicación. |
| `case_answer_memory_candidates` + `case_answer_memory_reviews` | **Reutilizar** como origen y aprobación de respuesta | Mismo repositorio, versiones locales de septiembre 2026. Ya conserva valor/hash/entidad/revisión y recibos idempotentes. No tiene evidencia documental ni permiso de reutilización implícitos. |
| `request_knowledge_catalog_entries` | **Rechazar como almacén de valores**, mantener para conceptos | Commit `d43f815`, agosto/septiembre 2026. Expresamente almacena conceptos y alias, no valores corporativos. Mezclar ambos catálogos distorsionaría su contrato. |

No se incorpora código de terceros ni una nueva dependencia. Los candidatos son
código interno del mismo checkout autorizado; no se les atribuye una licencia
open source ni permiso de redistribución. Se conserva la UI y el branding XBF
existentes. No hay motivo para añadir un vector store, otro proyecto Supabase,
una nueva aplicación, un proveedor de IA o infraestructura de pago.

## Evidencia ejecutada antes de decidir

`answer-memory-promotion-compatibility.test.ts` aplica las migraciones reales del
ledger, del comando de promoción y de la proyección de memoria sobre PGlite con
dependencias mínimas. Para la firma `extensions.digest` usa SHA-256 nativo en la
fixture; no reemplaza la promoción ni las decisiones de revisión por mocks.

1. Un documento aprobado con teléfono y website rechaza promover sólo teléfono:
   `PROFILE_FACT_EXPECTATION_INCOMPLETE`; quedan cero hechos y cero promociones.
2. Presentando ambos campos, publica dos hechos. Repetir exactamente la operación
   devuelve replay y conserva dos hechos/una promoción.
3. Otro documento aprobado acredita los mismos valores. El comando registra dos
   valores sin cambios, **pero los hechos conservan el documento original**.
   Cuando vence ese original, la proyección no devuelve ningún dato, aunque la
   evidencia nueva siga vigente.

Estos tres pasos pasaron. Son caracterización de límites actuales, no prueba de
que el puente propuesto esté implementado ni aceptación de la conducta de
renovación como resultado deseado. No prueban concurrencia PostgreSQL remota.

Validación conjunta final: **5 pruebas Deno, 34 pasos, cero fallos**, incluyendo
captura/revisión con guards reales, proyección de hechos y contrato de la promoción.
Contrato de acciones **160/160** conservado; no se modifica código operativo.

## Decision propuesta

Separar **comprobación en lectura**, **publicación documental** y **enlace auditable**.
Mostrar una comparación y una confirmación por alcance dentro de la aplicación,
sin pedir una cadena de autorizaciones por campo en el chat. Reutilizar los roles
verificados del servidor; no añadir roles ni interpretar un correo escrito en
el cuerpo de una petición como identidad.

### Experiencia visible

En la tarjeta de una respuesta aceptada, dentro del formulario existente:

```text
Respuesta aceptada: teléfono [valor visible según permisos]
Entidad XBF: [entidad vinculada, nunca inferida]
Evidencia: [documento / revisión / vigencia]
Comparación: respuesta | evidencia aprobada | dato actual
Alcance: [campos nuevos, reemplazados, iguales y excluidos]
Estado: [uno de los estados siguientes]
[Ver evidencia y comparación]   [Acción disponible para este estado]
Nota: no firma, adjunta documentos ni envía correos.
```

| Estado | Acción propuesta | Lo que no significa |
| --- | --- | --- |
| Coincide con dato ya reutilizable | Registrar el enlace a su evidencia actual, sin crear otro hecho | No vuelve a aprobar ni publicar el documento |
| Evidencia válida, todavía no publicada | Mostrar **todo el lote documental** y abrir su revisión de promoción existente | El botón de una respuesta no puede autorizar silenciosamente los otros campos |
| Dato igual, fuente original vencida | Mostrar la nueva evidencia; ofrecer una renovación explícita cuando exista su comando seguro | `unchanged_count` o un replay anterior no prueba renovación |
| Falta evidencia o hay conflicto | Mostrar el faltante o diferencia; mantenerlo pendiente | No inventar documentos ni resolver por confianza del modelo |
| Respuesta obsoleta, sin entidad o no aceptada | Revisión de respuesta primero; publicación bloqueada | No reasignar una respuesta mexicana a la entidad estadounidense |

La primera entrega implementable será esta comparación **sólo de lectura**, con
fixtures sintéticas y la UI XBF existente. Target de preview: proyecto conectado
`osp-customer-setup`, ruta `/app/cases/:caseId/form`. No publicar datos reales,
promover la UI ni aparentar que una evaluación sintética habilita reutilización.

### Contrato del enlace

- El servidor resuelve la organización, caso y entidad a partir de la sesión
  verificada y binding vigente. La selección del navegador aporta IDs/expectativas,
  no valores maestros ni autoridad.
- Exigir candidata aceptada, misma revisión de formulario/plantilla/valor/hash y
  misma revisión de binding. La aceptación previa queda inmutable.
- Mapear sólo los siete conceptos básicos ya permitidos. Comparar valor JSON
  exacto con el campo documental aceptado/corregido; no usar texto de presentación
  truncado o enmascarado del perfil como igualdad técnica.
- Resolver revisión y campo documental de la misma entidad y organización;
  fuente activa/verificada, fechas válidas, sensibilidad permitida y valor exacto.
- No reducir un lote por omitir IDs en la petición. Toda promoción documental
  debe presentar y confirmar la revisión completa, su hash y los IDs actuales
  esperados. Para un lote con alcance sensible no autorizado, mantener el bloqueo.
- Al enlazar, guardar un recibo append-only que referencia candidata, evaluación,
  revisión/campo documental, hecho vigente, sujeto, expectativas e idempotencia.
  No copiar valores en un segundo catálogo. La vinculación no reabre ni modifica
  el caso de origen ni un paquete ya congelado.
- La escritura futura debe revalidar en una transacción el estado visto en
  preflight. Conciliar primero el orden de locks con comandos existentes; probar
  simultaneidad real de edición, rebinding, promoción y retirada de evidencia.
- Reintento exacto devuelve el mismo recibo; misma clave con otra intención
  falla. Un timeout requiere conciliación, no una nueva operación automática.
- Antes de sugerir un dato a otro caso, comprobar otra vez entidad, hecho
  vigente, evidencia y sensibilidad. El recibo del enlace no es permiso eterno.

### Renovación de evidencia: decisión separada del valor

La recomendación es un enlace de respaldo documental versionado/auditable al
hecho vigente, sin borrar la fuente original ni reescribir recibos anteriores.
El lector podrá usar ese respaldo únicamente si una confirmación explícita lo
habilita, coincide exactamente con el hecho actual y sigue vigente/verificado.
La renovación no debe reactivar hechos retirados, fuentes rechazadas, restricciones
de divulgación ni una entidad inactiva. La validación de antigüedad específica de
cada carrier permanece en el Request Contract, aunque la memoria general sea válida.

Esta extensión fue aprobada para local/preview. La implementación del recibo,
comando y lector renovado se documenta en `../osp/answer-evidence-link-delivery.md`;
no implica activación en el Supabase compartido ni autoridad de envío.

## Options Considered

| Opción | Complejidad/costo | Ventaja | Riesgo y decisión |
| --- | --- | --- | --- |
| A. Invocar el comando actual al aceptar una respuesta | Baja; sin infraestructura | Menos código inmediato | Alcance de todo el documento y evidencia igual no renovada. **Rechazada**. |
| B. Preflight + promoción documental explícita + enlace auditable | Media; mismo Supabase/UI | Conserva el catálogo, evidencia y control de alcance | Requiere recibo y renovación probada. **Recomendada**. |
| C. Catálogo paralelo o fine-tuning de respuestas | Alta; costo y operación adicionales posibles | Aparente independencia del flujo actual | Duplica verdades y no resuelve vigencia, consentimiento o evidencia. **Rechazada**. |

## Trade-off Analysis

B exige más que conectar un botón, pero evita el fallo de publicar datos fuera
de la selección y el de perder reutilización al vencer la evidencia antigua.
La comparación se entrega primero sin escrituras; los comandos se habilitan
sólo cuando exista validación real de sus efectos. No se amplía el mecanismo a
declaraciones sin documento, referencias comerciales o banca en este bloque.

## Consequences

- No volver a solicitar un dato ya válido de la misma entidad.
- Mostrar por qué falta evidencia o hay contradicción, en lugar de declarar
  que la IA ya aprendió y ocultar el pendiente.
- Añadir evidencia válida sin borrar el origen ni rehacer un caso productivo.
- Mantener una sola fuente corporativa y el catálogo de requisitos separado.
- El paquete aún debe cumplir cada requisito del carrier y pasar sus controles
  de firma, autorización Sales y envío; este diseño no los sustituye.

## Action Items

1. [x] Inspeccionar bases existentes y ejecutar prueba SQL de compatibilidad.
2. [x] Definir límites, estados visibles y alternativas sin modificar producción.
3. [x] Diseño B y política de renovación aprobados por el usuario para local/preview.
4. [x] Implementar preflight en lectura y comparación UI; preview sintética visible
   (`50111e4`, `dpl_9stxxL3C4oLrcKGrb64n8qp31LVa`); ver entrega y pruebas en
   `../osp/answer-evidence-preflight-delivery.md`.
5. [ ] Implementar enlace/renovación atómicos con pruebas de conflicto, vigencia,
   permisos y concurrencia; verificar el catálogo existente y el aislamiento Rateware.
   Enlace, renovación y lectura implementados y probados con SQL embebido;
   falta el canary de contención entre sesiones PostgreSQL independientes.
6. [ ] Activación productiva únicamente con autorización de alcance/SHA/migraciones
   exactas; sin enviar un correo final por aprobar memoria.

Actividad de arquitectura recomendada: **GPT-6 Astra · Xhigh**. La habilidad
`engineering:architecture` guió este ADR y las alternativas. Sus conclusiones
no son permiso para implementar una nueva autoridad de publicación silenciosa.
