# Base 3 — Aislamiento local de escrituras del catálogo

Fecha: 3/oct/2026. Estado: **arreglo local implementado y validado, incluida concurrencia real en PostgreSQL aislado**. El usuario pidió continuar con el siguiente desarrollo después del hallazgo de Base 2 y después autorizó el ensayo SQL local concreto. No hay autorización nueva para SQL o publicación productivos. El esquema efectivo de Rateware queda pendiente: el conector disponible sólo enumeró dos proyectos de staging ajenos a ese runtime; no se consultaron sus datos.

## Objetivo y decisión

Un Admin puede crear, actualizar/reactivar y archivar su alias manual. Una organización diferente recibe conflicto/rechazo sin transferir owner, mutar la fila ni registrar auditoría de éxito, incluso con solicitudes concurrentes. El owner proviene del resolver del servidor; el body no lo elige. Los valores seed/Google permanecen iguales. Se conserva la lectura histórica existente; un alias manual sin owner no puede apropiarse ni archivarse con esta acción.

Es una capacidad estándar de aislamiento. Se reutilizan PostgreSQL, Supabase JS 2.57.4, el resolver/roles actuales y las acciones del catálogo. No hay pantalla ni propuesta visual nuevas: el cliente conserva alta/archivo y recibe error visible en colisión. No se introduce RPC, esquema ni dependencia.

| Alternativa | Ajuste y costo | Decisión |
| --- | --- | --- |
| Insertar con ignore-duplicates; actualizar con clave y owner en WHERE | Mantiene unicidad/sync; una llamada al crear, dos al actualizar; sin migración | Recomendada para este arreglo |
| RPC con ON CONFLICT DO UPDATE WHERE owner | Una operación SQL, requiere función, grants, migración y publicación coordinada | Reservar si se necesita atomicidad con recibo/auditoría |
| Clave por organización | Permite aliases iguales en distintos equipos; cambia esquema, sync y resolución | Fuera del arreglo acotado; requiere decisión de producto |

Un SELECT de owner seguido del upsert original conserva la carrera y se descarta. La opción elegida protege la propiedad en cada escritura: el INSERT en conflicto no modifica nada; el UPDATE exige owner vigente en la propia sentencia. No es una transacción única que incluya auditoría. Un fallo de auditoría posterior mantiene la limitación existente y puede devolver error tras haber escrito; el reintento no duplica el alias, pero no se promete auditoría exactamente una vez.

Benchmark revisado: handler/migración/roles/tests locales y piloto Base 2. Fuentes oficiales: [upsert Supabase](https://supabase.com/docs/reference/javascript/upsert), [PostgREST ignore-duplicates y filtros JSON](https://postgrest.org/en/stable/references/api/tables_views.html?highlight=operators), [INSERT PostgreSQL 17](https://www.postgresql.org/docs/17/sql-insert.html), [UPDATE y concurrencia](https://www.postgresql.org/docs/17/transaction-iso.html). Se revisó el [changelog de Supabase](https://supabase.com/changelog.md), incluido el aviso de PostgreSQL 17.11; este slice no utiliza ltree/btree_gist ni cifrados pgcrypto heredados y no actualiza runtimes.

## Alcance, ejecutor y cierre

Rutas: `supabase/functions/rateware-api/index.ts`, pruebas nuevas `tests/catalog-owner*.test.ts`, `tests/sql/catalog-owner-*.sql`, runner `tests/run-catalog-owner-postgres.ps1` y este documento. Se utiliza el checkout existente `e030ff8c`, sin rama/worktree nuevo y sin adoptar `.test-output/` ajeno. No tocar manifests/locks ni otros dominios. En Bidware sólo se documenta el enlace al resultado posterior, si resulta útil.

Codex/OpenAI conserva el rol de escritor/integrador local de la sesión; Claude es alternativa ya considerada, sin retorno demostrado para una segunda inferencia en este arreglo determinista. Modelo/versionado/esfuerzo nativos no observables; no cambiar proveedor ni atribuir una recomendación como runtime. Presupuesto acotado de trabajo: una sesión de hasta 90 minutos y dos ciclos de corrección por causa; sin inferencias externas, cargos nuevos ni instalaciones. Consumo nativo/cuota/cargo desconocidos.

Cierre local: handler real con identidad/base simuladas; semántica HTTP del SDK instalado; regresiones de roles/lecturas; SQL y concurrencia en PostgreSQL aislado con dos conexiones realmente solapadas. Roles y datos de prueba no acreditan JWT/RLS reales. La imagen PostgreSQL 17 cacheada está disponible por digest; el runner no debe descargar, abrir red/puertos, montar rutas ni usar volúmenes persistentes.

La convención del usuario exige confirmación humana antes de aplicar SQL/migraciones. Se preparó primero código, arnés y SQL; el usuario respondió **«autorizo»** a la pregunta concreta de ejecutar los cinco archivos únicamente en PostgreSQL local efímero sin red/puertos/volúmenes/datos reales. Con esa confirmación se ejecutó el runner con `-SqlAuthorized`. La autorización no se extiende a producción.

Rollback del código: revertir exclusivamente el commit de este arreglo. No reintroducir el upsert inseguro como fallback automático. El runner sólo elimina su contenedor después de comprobar id, nombre y etiqueta propios; estado sintético efímero. Publicación futura requiere comprobar esquema/runtime real y su autorización específica; no desplegar todo el checkout por defecto.

## Evidencia ejecutada y pendientes

- `catalog-owner.contract.test.ts`: **21/21** contra el handler real, identidad/base simuladas. Rechazo 409 sin fila ni auditoría de éxito ante owner ajeno; alta con owner resuelto, actualización/reactivación propia, fila ownerless, roles, logout, validación, deduplicación, seed, archivo y carrera después del pre-read. La concurrencia de este mock no acredita bloqueos de PostgreSQL.
- `catalog-owner-sdk.test.ts`: **4/4** usando Supabase JS **2.57.4** real y fetch inyectado. Comprueba headers ignore-duplicates, owner JSON en PATCH y el recorrido completo handler+SDK para actualización propia y conflicto ajeno. No es PostgREST vivo.
- `staging-options-active-catalog.test.ts`: **3/3**; conserva las opciones activas, ownership de lectura y cruces existentes.
- `team-roles.contract.test.ts`: **16/16**; identidades/DB simuladas. `node tests/team-roles-wiring.test.mjs`: exit 0.
- Esas suites se ejecutaron con chequeo de tipos locales, sin red ni lock nuevo: primero 42 casos, luego los cuatro SDK finales después de añadir dos recorridos handler+SDK. Son **44 casos distintos** sobre el handler final. No se afirma que se corrieron los 44 en una sola invocación.
- Sintaxis PowerShell del runner válida; ejecución sin `-SqlAuthorized` rechazada antes de cualquier Docker/SQL; sin contenedores con la etiqueta propia después de esa prueba. La imagen cacheada y el motor local Docker están disponibles, sin descarga.
- `git diff --check`: exit 0. Manifests/locks de las aplicaciones permanecen sin modificaciones.

Comandos de las verificaciones con tipos:

```powershell
deno test --cached-only --allow-env --allow-read --node-modules-dir=none --no-lock tests/catalog-owner.contract.test.ts tests/catalog-owner-sdk.test.ts tests/staging-options-active-catalog.test.ts tests/team-roles.contract.test.ts
deno test --cached-only --allow-env --allow-read --node-modules-dir=none --no-lock tests/catalog-owner-sdk.test.ts
node tests/team-roles-wiring.test.mjs
```

La primera ejecución sin tipos de las nuevas pruebas dio 20 aprobados y tres fallos: dos por asumir un objeto/null en respuesta de mutaciones del SDK y uno por esperar 400 del guard de confirmación ya existente. Se corrigió el manejo de arreglos de INSERT/PATCH y se conservó/documentó el 500 de confirmación ausente; no se relajó esa obligación. La siguiente dio 23/23 antes de ampliar los dos casos SDK. Un intento de `deno check --cached-only` no ejecutó chequeo porque esa suborden no admite la opción; se utilizó `deno test --cached-only` con chequeo normal. Estos intentos fallidos no se cuentan como aprobados.

La suite `node tests/rateware-stability.test.mjs` **falla** en línea 3911: espera un patrón anterior `identity = await requireRatewareUser(request); user = await resolveSourceFileUser(supabase, identity)` en `interpret-upload/index.ts`. Se verificó que la fuente actual es idéntica a HEAD (`SHA-256 72960ac78b8892a1eec82ea6aba7c197c4602047396df289b4028623534d3c7c`) y que el patrón no coincide en ninguna de ambas. Es una discrepancia preexistente fuera del catálogo, preservada. No se declara verde la suite general ni listo un despliegue de todo el checkout.

Validación SQL completada con esa autorización: **PostgreSQL 17.11**, 18 comprobaciones y **dos solapamientos observados** mediante `pg_stat_activity`/`pg_blocking_pids`. En el caso ajeno: un INSERT de A, INSERT duplicado ignorado y **UPDATE 0** de B; owner A y fila única conservados. En el caso propio: un INSERT, duplicado ignorado y **UPDATE 1**, sin cambiar owner ni duplicar fila. Triggers sintéticos comprobaron esos conteos. También pasaron reactivación, ownerless, referencia inmutable y reintento sin otra inserción. Primera ejecución SQL exitosa, sin correcciones ni reintentos.

El arnés usa una tabla/grants/trigger sintéticos mínimos; sus sentencias equivalen al INSERT/UPDATE que emite PostgREST pero no ejecutan su servidor, JWT o políticas productivas. Contador de mutaciones y roles del fixture no son auditoría productiva. La prueba sólo cierra el arreglo local, no la integración real.

Comando ejecutado desde este checkout:

```powershell
pwsh -NoProfile -File tests/run-catalog-owner-postgres.ps1 -SqlAuthorized
```

El runner exige socket Docker local (npipe/unix), imagen cacheada por digest, `--pull=never`, `--network=none`, tmpfs, ningún puerto/montaje/volumen de host. Observa la primera transacción dormida y la segunda bloqueada por ella, espera las dos salidas, verifica filas y contador de INSERT/UPDATE; elimina únicamente el contenedor propio con id/nombre/etiqueta validados. Un error de prueba o limpieza devuelve exit 1. Los SQL no son migraciones, no cambian la base real y nunca se deben dirigir a producción.

El proceso terminó con **exit 0** y la lectura posterior por `marksman.catalog-owner-test=true` quedó vacía: contenedor propio retirado. Log local: `.test-output/catalog-owner/postgres-20261003-183952.log`; SHA-256 `711fc700e65a939e3917184e32b3e011863fc291bbe463a51f121c99b9a1d977`. Handler probado: SHA-256 `ee7344277c01abf29dd8aa56b7382bb319fe7c6d84e77a31aa864ab9c4a868be`. Las verificaciones de contrato/SDK/types y SQL corresponden a esa fuente; después sólo se actualizó documentación. Checkpoint del arreglo: **`6d4733a08baf4ff9fc638d5e912c5474c9a291ec`**, commit local, sin push/merge/publicación.

La comprobación inicial byte a byte de manifests contra blobs Git produjo un falso rechazo por CRLF del checkout frente a LF de Git. Se verificaron nuevamente normalizando sólo los saltos de línea: `package.json` y `package-lock.json` coinciden con HEAD; no se editaron. El checkpoint contiene únicamente las diez rutas declaradas. Se preservó `.test-output/` ajeno.

Siguiente paso para una publicación futura: resolver la discrepancia preexistente de la suite general y disponer de acceso soportado al proyecto Rateware para inspeccionar esquema, permisos y runtime actuales. Preparar el diff exacto contra ese runtime; pedir autorización de publicación sólo con el paquete comprobado. No se propone una migración ni se solicita enviar datos comerciales para este arreglo.

El probe histórico de Base 2 esperaba reproducir el defecto en la fuente `e030ff8c`; no debe interpretarse como un test verde del handler corregido. Para este estado se usa la nueva regresión negativa. No se sobrescribieron los resultados ni la baseline histórica de Base 2.
