# Sprint 15.13 — Paquete local EML gpt-5.6-luna (PROBADO LOCALMENTE, NO DESPLEGADO)

Fecha: 2026-10-03. Estado: integrado y probado localmente, pendiente de autorización de publicación y un nuevo intento. No se ha subido, desplegado ni publicado este paquete.

## Decisión
- Modelo para correos (`email`): `gpt-5.6-luna`, razonamiento `none`, confirmado directamente por la persona usuaria el 2026-10-03.
- Se reutiliza el módulo acotado ya revisado (`email-interpretation-policy.mjs`) y sus 19 pruebas. Codex añadió un rechazo de respuesta vacía y una prueba del handler: 20 casos finales.

## Parámetros
- Tope de solicitud: 131072 bytes UTF-8 del cuerpo completo (sin truncar).
- Salida máxima: 16384 tokens; `service_tier` `default`; JSON estricto; solo `input_text`.
- Respuestas con rechazo, incompletas, JSON inválido o cero filas se descartan antes de staging. Una sola llamada: sin reintentos ni fallback.
- Metadatos saneados (modelo solicitado/efectivo y conteo de tokens).

## Precios y estimación
- Precio estándar de lista: USD 0.20 / M entrada y USD 1.20 / M salida (revisado 2026-10-03, documentación oficial del modelo).
- Estimación al tope: (131072 × 0.20 + 16384 × 1.20) / 1e6 = **USD 0.0458752**.
- Es una estimación de lista, NO un monto facturado ni un tope contractual.

## Qué incluye este paquete
- `supabase/functions/interpret-upload/email-interpretation-policy.mjs` (modelo y precios actualizados).
- `tests/interpret-upload-email-budget.test.mjs` (20 pruebas; la expectativa de estimación es 0.0458752).
- `supabase/functions/interpret-upload/index.ts`: Codex integró el parche anterior revisado. El modelo del job coincide con la petición; los metadatos del modelo efectivo/usage quedan en el audit. La autenticación y los gates publicados se conservan. PDF, imagen y XLSX mantienen el cuerpo/modelo previo; OPENAI_MODEL global no se modifica.
- Este documento.

## Verificación final
- 20/20 EML y 16/16 roles, tras la última modificación. Los casos del handler ejecutan código real con transporte simulado; no son respuestas reales de OpenAI ni pruebas de cuentas Consulta/otra organización.
- Wiring de roles y normalización existentes: PASS. Sintaxis/transpilación TypeScript de ambos handlers y sintaxis del módulo: PASS. Deno no disponible: no se afirma typecheck semántico de Deno.
- Runtime leído en esta actividad: interpret-upload ACTIVE v309, bundle 81ffa008e3126c71a31b4c369d0d6a3150f1091c2ffb00a401fa92a1b1eb6b11. Backup completo conservado en .test-output/s15-eml-gpt56/before-interpret-upload-309.json.
- Paquete revisable .test-output/s15-eml-gpt56/deployment-package.json: 13 archivos, solo el handler actualizado y el módulo nuevo; las otras 11 dependencias conservan exactamente el contenido desplegado. Comparación con fuente local tolerando CRLF: coinciden. Vendor XLSX preservado.
- La prueba de publicación futura debe releer todos los archivos y comparar el paquete. Conservar verify_jwt=false y autenticación personalizada; no publicar otra función.

## Pendiente (no hecho)
- Ninguna solicitud real nueva a OpenAI: la lista de permitidos admite gpt-5.6-luna, pero el éxito real sigue sin comprobarse.
- Sin carga ni interpretación, sin SQL/configuración de producción. Solo `pending_review`; inserción en producción requiere aprobación humana; el original se conserva.
- Autorizar publicación de este paquete y UN intento nuevo sobre raw_upload_id a7800f34-7977-4437-b326-45e25987ae0a, presupuesto humano USD 0.25, sin retry/fallback ni otra carga. La autorización del intento anterior ya se usó. Validar 20 campos, una fila pending_review, cero aprobadas, sin duplicados; un nuevo job es esperado para este intento y se conservará el fallido histórico.
- Recuperación de bytes del original pendiente por bloqueo del navegador; no eludirlo. También siguen pendientes Consulta/otra organización, replay de rebote y aceptación humana ES/EN.
- Sprint no completado.

## Ejecución y traspaso
Claude solicitado/observado claude-sonnet-5-5; medium solicitado, esfuerzo efectivo no expuesto. Run 3231f26baf74416292d86831f1874768, sesión ebd0747b-8b1a-439b-ae45-edd1345f4338, release chat-20261003T022045Z resuelta del puntero y manifiesto comprobado. Escribió los tres artefactos declarados; host ejecutó wiring PASS. Codex integró después del cierre confirmado y lease liberado, añadió la guarda de cero filas y realizó las pruebas finales.

Presupuesto: una llamada, 12 pasos, 10 min, cero retry/fallback; observado 5 pasos y 51.375 s. Uso CLI: 4 entrada, 19522 cache write, 15440 cache read, 9824 salida (311 thinking incluidos); estimación a tarifa de lista USD 0.179424, no cargo ni porcentaje de cuota. Max/claude.ai/firstParty comprobados por el kit; OFF es última observación del 2/oct 16:46:59 UTC ligada a cuenta, no lectura viva. Ventana 5h/semanal/Fable restante y reposición desconocidas. Fable no justificado para esta restauración acotada; modelo principal Codex no expuesto ni cambiado.

Preflight inicial rechazó un literal de autenticación ficticio en contexto, sin inferencia. Se sustituyó por otro marcador sintético corto, manteniendo el guard; no hubo credencial real, bypass ni ampliación de permisos. Evidencia local: .test-output/s15-eml-gpt56/{claude-result.json,eml-tests.log,role-tests.log,package-review.json}. Ningún envío, SQL o cargo API de interpretación adicional en esta actividad.
