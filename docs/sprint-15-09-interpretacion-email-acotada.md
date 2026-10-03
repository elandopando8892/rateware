# S15 — Interpretación EML acotada (publicada; prueba operativa pendiente)

Estado: **publicado con autorización humana**. S15 **no está cerrado**. El commit `cc40fedc7eb0afeef6400b25b6c947373a60d0cd` se publicó por fast-forward a `main`; `interpret-upload` está ACTIVE v307. La carga del EML controlado por Operador respondió 403 antes de interpretar: no hubo llamada OpenAI ni cambios de variables globales.

## Benchmark de opciones (revisado 2/oct/2026)

Fuente vigente: [documentación oficial de GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) (Responses + Structured Outputs, `reasoning.effort: none`, tarifa standard USD 0.10/M entrada y USD 0.50/M salida). Acceso de la cuenta API todavía desconocido.

| Opción | Resultado |
| --- | --- |
| Cambiar `OPENAI_MODEL` globalmente | Rechazada: la misma variable la usan también `rateware-api` y `rfx-bid-api`; afectaría otras capacidades. |
| Parser regex para el fixture EML | Rechazada: reconstruiría una extracción ya resuelta y no probaría la interpretación. |
| **Adaptar el contrato Responses existente solo para `document_type=email`, con modelo fijo local a `interpret-upload`** | **Elegida.** |

## Alcance

- Solo `document_type=email`. PDF, imagen y XLSX conservan modelo y cuerpo de petición actuales, sin límite de bytes nuevo.
- El modelo no viene del cliente. Helper puro: `supabase/functions/interpret-upload/email-interpretation-policy.mjs`.
- Para email la petición fija: modelo `gpt-6-luna`, `reasoning: {effort: "none"}`, `max_output_tokens: 16384`, `service_tier: "default"`. Sin herramientas, sin reintentos, sin fallback: una sola llamada.
- El contenido email debe ser solo `input_text`; si no, se rechaza.
- `interpretation_jobs.model` usa `selectInterpretationModel(document_type, OPENAI_MODEL)`, de modo que coincide con la petición.

## Límites

- El cuerpo JSON completo (prompt, schema, reglas y archivo) se limita a **131072 bytes UTF-8** y se comprueba **antes** de `fetch`. No se trunca.
- Impacto en correos reales grandes: la interpretación falla con un error claro; el archivo original se conserva y no se escribe nada en staging.
- Respuestas email con `status` distinto de `completed`, `incomplete_details`, refusal, ausencia de salida estructurada o JSON inválido/sin `rows` se rechazan antes de normalizar o escribir filas. Nunca se acepta JSON parcial. Los errores no incluyen el payload.
- Metadata guardada: solo el modelo efectivamente devuelto y `usage` (`input_tokens`, `output_tokens`, `total_tokens`) si son enteros no negativos; si falta, queda desconocido (`null`). Se añade como `email_model_metadata` a `interpretation_audit` (JSONB existente, sin DDL) y a `audit` de la respuesta.

## Costo

Estimación conservadora a tarifa de lista, usando bytes como cota aproximada de tokens de entrada más la salida máxima: **≈ USD 0.022** por intento (`estimateEmailCostUsd`). Es una estimación, no un techo contractual ni un costo real. USD 0.25 es el presupuesto humano para UN intento, no una cuota ni una factura. La factura real es desconocida.

## Capacidad de la cuenta

Acceso de la cuenta API al modelo **no verificado**; no se hizo ninguna llamada de prueba. El valor actual de `OPENAI_MODEL` es desconocido y no se modifica.

## Cableado en `index.ts`

Codex aplicó y revisó el parche escrito por Claude. `index.ts` (124 KB) supera el límite de 64 KiB del ejecutor; no se amplió ese permiso. Import del helper; rama email en `requestRatewareInterpretation`; ambas llamadas pasan `rawUpload.document_type`; modelo del job y metadata sanitizada sumada a `uploadAudit` antes de persistir. PDF/imagen conservan la rama anterior. No se cambiaron variables globales, normalización, permisos ni dependencias.

La revisión rechazó un defecto del parche: inyectaba `fetch` sin el header de autenticación. Codex lo corrigió con el header existente del handler y probó esa función real con un transporte local simulado. El parche aplicó con `git apply --recount`; la clave interna se separa de la interpretación y se conserva en el audit explícito para emails.

## Pruebas

Verificación host Codex: **19/19** pruebas del helper y de la función real de petición con transporte simulado; prueba de normalización existente aprobada. Incluyen límite UTF-8 y multibyte, prompt/schema, rechazo antes de fetch, una sola llamada ante 429/500, incomplete/refusal/sin salida, usage sanitizada, autenticación y no-email intacto. Un primer test falló porque el dato de prueba era un email vacío; se corrigió el dato, conservando el rechazo de emails vacíos. Análisis de sintaxis con TypeScript 5.9.3: cero diagnósticos. Deno no está instalado: no se afirma compilación Deno ni prueba de cuenta/API. `git -c core.whitespace=cr-at-eol diff --check` aprobado, conservando el CRLF ya registrado en este archivo; el chequeo sin esa opción señala CRLF como whitespace.

## Ejecución y consumo Claude

Usuario: Sonnet 5.5 medio escritor, Codex integrador/verificador. Modelo solicitado y observado `claude-sonnet-5-5`; esfuerzo medio solicitado, efectivo no expuesto. Sin deadline total, máximo 32 pasos acumulados y cero retry/fallback automático. Un arranque preinferencia fue bloqueado por el tamaño del handler; revisión del paquete también retiró referencias innecesarias a headers/credenciales y ajustó contexto a 23 KB antes de la llamada. Ninguna clave real fue leída ni transmitida.

Primera llamada `1736c647c1164a80ac36ceb3b2593379`: escribió helper, siguiente Write fuera del alcance sellado fue rechazada; causa de la ruta desconocida, cierre confirmado, 4 pasos, 62.593 s. Estimación CLI a tarifa de lista USD 0.144398. Una continuación correctiva explícita de la misma sesión `ca302189-2c38-42e4-ad46-3bd05836f1fa`, run `209da9e2dfb74b8bbe85738a8c8bf740`, escribió test, parche y documento; terminó con un test host fallido (dato vacío), después corregido por Codex. Helper reaped, Job cerrado y lease null. Estimación CLI de la continuación USD 0.3841462; puede incluir consumo previo y no se suma como factura. Cuota Max/semanal/Fable restante y cargo real desconocidos; sin uso extra activado, pagos ni proveedor alternativo. No se justificó Fable/Opus para esta tarea verificable. No hubo consumo de interpretación API.

## Publicación

El usuario autorizó expresamente publicar `cc40fedc`, desplegar únicamente `interpret-upload` y efectuar una interpretación del fixture con presupuesto USD 0.25, sin reintento. Push y `ls-remote` confirmaron `main` en ese SHA. Despliegue ACTIVE v307, bundle `d9ac0bf8c226851e9749387ed5ef5db2d946bb90fd59b7af4104604d34cf3262`; readback confirmó index y helper iguales a los probados y los otros 11 archivos idénticos al bundle v306. Se conservó `verify_jwt=false` preexistente y la autenticación propia del handler. No se desplegó otra función.

### Comprobación operativa y bloqueo

Desde la sesión real Operador `carriers@xbfreight.com`, se seleccionaron el carrier piloto existente y `sprint-15-tarifa-controlada.eml`, RFx vacío. Un solo clic Subir y leer produjo OPTIONS 200 y **POST create-raw-upload 403**, respuesta `External identity is not registered.` No se llamó a interpret-upload ni se reintentó la carga. SELECT READ ONLY confirmó cero raw_uploads y cero rate_staging para ese archivo antes y después.

Diagnóstico acotado: `create-raw-upload` ACTIVE v260 exige `resolveSourceFileUser` con identidad canónica registrada. La cuenta Operador está confirmada, tiene rol operator y organización revisada `org_dbc2fd12c76`; el enlace de organización está activo y coincide con workspace_registry. Falta únicamente su fila en `external_identities` (cero filas para provider supabase y su subject Auth). El contrato compartido de identidad coincide con interpret-upload; no es evidencia de un fallo de GPT-6 Luna ni del despliegue v307.

La reparación propuesta reutiliza el registro canónico existente: revisar y registrar solo la identidad de esa cuenta, conservando rol, organización y Auth metadata. Activar un registro de identidad habilita acceso a archivos y requiere autorización específica antes del SQL. No se ejecutó INSERT/UPDATE ni se debilitó el requisito. Acceso API y resultado EML siguen sin comprobar. Evidencia sanitizada en Bidware `.test-output/s15-production/eml-publication-and-upload-20261003.json`.

## Rollback

Antes de publicar: revertir exactamente estos archivos al checkpoint `2756794`: el helper, el test, este documento, el parche, y `supabase/functions/interpret-upload/index.ts` si el parche ya se aplicó. No hay cambios de variables, SQL ni dependencias que deshacer. Si ya se publicó, volver a publicar la versión `interpret-upload` ACTIVE 306 (bundle `855e3c58fb431011c3723d6f2e4b14f68147d4c77a004c107afd6d31f1372ebe`).
