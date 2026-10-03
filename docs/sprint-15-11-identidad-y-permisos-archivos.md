# Sprint 15.11 — Identidad Operador y permisos de archivos

**Estado: identidad autorizada y registrada; corrección de permisos publicada en 42d68a5c y desplegada, pendiente de aceptación con Consulta/otra organización reales.** No cierra S15. La interpretación EML falló por falta de acceso al modelo y su bundle se retiró; véase S15-09.

## Alcance
- SQL autorizado y ejecutado una vez: `docs/sql/s15-10-register-operator-identity.sql`. Ensayo ROLLBACK con guardas y después COMMIT: una fila activa `a05f13b0-c99d-466d-ae97-211282b33bd5`, revisada a `2026-10-03T05:11:25.93096Z`. Sin DDL, UPDATE, DELETE, UPSERT ni grants; rol operator y metadata Auth conservados por readback. El artefacto mantiene ROLLBACK; no volver a ejecutarlo, sus guardas rechazan identidad preexistente.
- Patch `docs/patches/s15-source-file-role-gates.patch` integrado localmente y regenerado contra `018f4ff850a1a73e60478e7912af8dc5b78380aa`: añade `teamRoleDenial` a `create-raw-upload` (acción `create_raw_upload`) e `interpret-upload` (acción `interpret_upload`) justo después de `requireRatewareUser` y antes de `resolveSourceFileUser`, formData, lectura de jobs, storage u OpenAI.
- Test `tests/source-file-role-gates.test.mjs`: ejecuta los callbacks `Deno.serve` reales con stubs. Codex lo ejecutó después de integrar y completar las comprobaciones: 16/16 aprobadas. Claude no ejecutó estas pruebas nuevas.

## Benchmark
Elegido: reutilizar `external_identities` y el contrato canónico. Rechazado: desactivar el requisito/fallback legacy. Cambiar a Admin no acredita Operador.

## Controles
- Guardas SQL previas al INSERT: Auth Operador y Admin (id, email, confirmado, roles exactos, org), link de organización activo, registry coincidente, ausencia de identidad previa; locks `FOR SHARE`; `lock_timeout` 5s, `statement_timeout` 15s; rowcount 1 y readback exacto.
- Roles solo desde claims server-managed; acción fija; adminOnlyDenial de aprobadas y chequeos canónicos se preservan.
- Impacto: la alta concede acceso canónico a archivos de toda su organización, no solo al fixture.

## Funciones impactadas
Tras autorización humana específica: `create-raw-upload` ACTIVE v261, bundle `1d785a3676b74b628848665853e252ef46b1ee6337f7a7468316a9814e300a55`; `interpret-upload` ACTIVE v309, bundle `81ffa008e3126c71a31b4c369d0d6a3150f1091c2ffb00a401fa92a1b1eb6b11`. Main remoto `42d68a5c018de5221cbefcc68d3da5942b62e6df`, push fast-forward confirmado. Readback: los nueve archivos de create y doce de interpret coinciden exactamente con el paquete revisado. Auth actual con roles incluido en create; team-roles actual incluido en ambas. Las otras dependencias coinciden con el runtime anterior normalizando CRLF; vendor XLSX conservado exacto. verify_jwt=false previo y autenticación personalizada se conservan.

POST sin Authorization a ambas funciones devuelve 401 `Bearer token is required.`: prueba negativa de autenticación, no prueba de Consulta ni de aislamiento. SELECT READ ONLY posterior: un archivo, un job fallido, cero staging/aprobadas, reprocess_count=0 y SHA/tamaño conservados. No se invocó interpretación autenticada ni se creó otra carga. Evidencia `.test-output/s15-file-role-deployment/publication-evidence.json`; bundles rollback completos en before-create-raw-upload.json (v260) y before-interpret-upload.json (v308).

## Limitaciones y supuestos no verificados
- Codex rechazó el nombre incorrecto `public.organization_registry` y el autorreporte «no recibió esquema»: el contexto sí proporcionó `workspace_registry`, roles y metadata, corroborados mediante SELECT READ ONLY. Corrigió solo ese nombre y el cast innecesario de reviewed_by_user_id (text) antes del ensayo SQL. El patch de contexto mínimo no aplicó con git apply --check --recount; se integraron sus dos cambios preservando el resto y finales de línea. El diff exacto se regeneró después de la retirada EML.
- En interpret, `getClient()` ocurre antes del gate (sin consultas).
- Comparación del rollback con main publicado: index y diez dependencias coinciden normalizando finales de línea; `team-roles.ts` desplegado conserva el bundle antiguo (mapas de otras APIs anteriores). No se declara coincidencia total del bundle con main. Para estas dos funciones la necesidad sigue siendo operate y adminOnlyDenial conserva su comportamiento. Una publicación futura incluye la versión actual comprobada del contrato compartido, sin desplegar otras APIs.

## Rollback
- Código: volver al checkpoint fuente `018f4ff850a1a73e60478e7912af8dc5b78380aa`; bundles productivos antes de esta corrección: create v260, interpret v308. El rollback EML ya ejecutado restauró exactamente v306 como v308.
- SQL: suspender solo la identidad creada, bajo futuras autorizaciones aplicables.

## Pruebas
Host del kit: wiring existente aprobado. Después de integración Codex: 16/16 pruebas nuevas ejecutan módulos/callbacks reales transpilados con transporte simulado; viewer/sin roles 403 antes de efectos y operator/admin alcanzan reconciliación. Se prueba el adaptador Auth real (roles app_metadata; user_metadata ignorada), ausencia de identidad canónica, protección Admin de tarifas aprobadas y rechazo de elevación desde el body. Wiring y normalización existentes pasan después de restaurar el código. Las 19 pruebas EML pasaron antes de retirar ese paquete por acceso denegado. TypeScript 5.9.3 proviene de la instalación existente de Bidware, sin dependencias nuevas. Deno no instalado: no se afirma prueba Deno ni rechazo real de Consulta/otra organización.

## Paquete revisable para publicar

El artefacto patch usa contexto cero para evitar whitespace de líneas vacías CRLF; aplicar sobre el checkpoint con `git apply --unidiff-zero docs/patches/s15-source-file-role-gates.patch`. Su comprobación inversa pasó contra el árbol ya integrado. No aplicarlo otra vez sobre este árbol.

La publicación exacta anterior fue autorizada y ejecutada; no queda pendiente esa confirmación de AGENTS.md §10. Sin SQL adicional, migraciones, cambios de rol/Auth, variables globales ni nuevas interpretaciones. Consulta debe recibir 403 antes de efectos; Operador/Admin siguen sujetos a identidad canónica y owner. La aprobación de registro ya se ejecutó y no se vuelve a pedir. El intento EML fallido se conserva; una nueva interpretación requiere resolver el acceso al modelo y autorizar otro intento acotado.

Publicación/verificación: Codex, dentro de la asignación explícita del usuario; no hubo nueva llamada Claude ni cambio del modelo principal. Las cuotas históricas no se presentan como actuales y no se atribuye ahorro o consumo cero a este trabajo. Los 16 tests son locales; las sesiones reales Consulta/otra organización siguen pendientes.

## Registro de ejecución
Escritor: Claude Sonnet 5.5 (solicitado medium; observado claude-sonnet-5-5; esfuerzo efectivo no expuesto), run `730326f788af41688093b6800b27dc6a`, sesión `70436caa-2170-4f23-96f6-87d0d9c90e09`. 94 segundos, 6 pasos de 24, una llamada y cero retry/fallback; completed, cierre confirmado, lease null. Release resuelta por puntero `chat-20261003T022045Z`, manifest sin discrepancias. Estimación CLI a tarifa de lista USD 0.1917624, no factura; cuotas 5h/semanal/Fable restantes y cargos desconocidos, guard de ruta Max/OFF vigente aplicado. Codex corrigió los errores anteriores y verificó por separado. Sin escritores concurrentes, cambios de package/lock ni historia reescrita; Q1006 no enviado.
