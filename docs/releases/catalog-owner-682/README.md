# Catálogo: paquete acotado contra runtime 682

3/oct/2026. **Candidato local preparado y probado; publicación no autorizada ni ejecutada.** No sustituye el cierre operativo del Sprint 15.

## Baseline comprobada

El listado Supabase omitía Rateware, pero `get_project` directo con la referencia pública conocida devolvió `rateware-prod`, `alqjqzqagdmcywpjtnnr`, ACTIVE_HEALTHY, PostgreSQL 17.6.1.127. `list_edge_functions` y `get_edge_function` confirmaron `rateware-api` ACTIVE **682**, `verify_jwt: false`, bundle `584ee02d695071e8904880eb0bf4934ccaf244db3f568360abb302731ee76f4d`. No se cambió cuenta, autenticación o permisos ni se buscaron credenciales. Un resultado omitido del inventario no prueba falta de acceso: ésta quedó resuelta mediante una lectura soportada del ID conocido.

Se recuperaron los quince archivos del runtime sin imprimir su código completo y se conservó el contenido exacto, incluidos saltos mixtos CRLF/LF. Snapshot local: `.test-output/catalog-owner-production-682-20261003/runtime-682.json`, SHA-256 `417d2d1de0607e18ef64e22b041f5dc52cca1056e3f497262f66b545ba32e7ae`. Contiene fuente privada del proyecto ya autorizado, no tokens ni filas comerciales; no enviarlo a otro proveedor ni incluirlo en un PR público.

## Candidato y revisión previa

Se reutiliza el benchmark y la decisión de [aislamiento local](../../catalog-owner-isolation-local.md). Se comparó desplegar todo el checkout frente a aplicar sólo el parche probado al bundle productivo. Se elige el segundo: conserva la versión de los helpers y evita incluir archivos ajenos al arreglo. No hay arquitectura, librerías, UI, migración o SQL de datos nuevos.

`catalog-owner.patch` procede del commit local `6d4733a0`; pasó `git apply --check` contra el snapshot y se aplicó sólo a `candidate/supabase/functions/rateware-api/index.ts`. Su SHA-256 final es `ee7344277c01abf29dd8aa56b7382bb319fe7c6d84e77a31aa864ab9c4a868be`, igual al handler local ensayado previamente. Los otros **14 archivos son idénticos byte a byte a 682**. [manifest.json](manifest.json) registra hashes de cada archivo antes/después, inventario y flag JWT. No se toma el checkout completo como paquete de despliegue.

Cambio: impedir que un upsert por clave global transfiera un alias entre equipos; INSERT ignore-duplicates y UPDATE condicionado por owner en la propia sentencia; archivo también condicionado. Se conserva el límite de auditoría posterior a la escritura y el 500 del guard de confirmación ausente. No cambiar `verify_jwt` en esta publicación: sigue el valor de la baseline y su autenticación de aplicación. Las pruebas con identidad inyectada no verifican un JWT productivo.

## Pruebas y metadatos

- **25/25 tests**, primera ejecución contra este candidato: 21 contratos de ownership y cuatro del SDK real Supabase JS 2.57.4 con fetch inyectado. Deno cached-only, chequeo de tipos normal, sin red ni locks nuevos. Son el handler/dependencias exactos del candidato, con identidad y base simuladas.
- Se reutilizan las **18 comprobaciones SQL y dos sesiones solapadas de PostgreSQL local 17.11** documentadas en el arreglo original. No se repitieron ni se afirman ejecutadas en producción 17.6.
- `list_tables` verbose confirmó tabla `public.rateware_catalog_items`, RLS habilitado, PK `id`, columnas compatibles (metadata jsonb, active bool y cuatro campos text de la clave no nulos). [Metadatos sanitizados](catalog-schema-observed.json); sin contenidos de filas.
- Esa herramienta no muestra índices únicos, ACL ni triggers. El usuario autorizó después [la consulta única de metadatos](inspect-catalog-write-prerequisites.sql): sólo SELECT/CTE de `pg_catalog`, sin DDL/DML/COMMIT ni lectura de filas comerciales. **Ejecutada una vez con éxito**, sin reintento SQL, el 3/oct/2026 a las 20:22 de México (4/oct 02:22 UTC). SHA-256 de la consulta: `aa80fd9bffb389396f1e1c6befb5b557f278d12df05f69d517ab83809472f4ab`.
- [Resultado sanitizado](catalog-write-prerequisites-observed.json): índice `rateware_catalog_items_source_category_raw_value_normalized_key` único, válido y ready para `(source, category, raw_value, normalized_value)`; ACL explícita de `service_role` con SELECT, INSERT y UPDATE; RLS habilitado, sin FORCE, y rol con BYPASSRLS; ningún trigger de usuario. El aislamiento del backend depende de sus filtros de owner. La observación de ACL/política no acredita aceptación real con JWT, usuarios o equipos diferentes.
- El listado posterior confirmó de nuevo **682 ACTIVE**, el mismo bundle y el mismo flag JWT. El verificador del paquete volvió a pasar. Un primer parseo local de la respuesta encontró la etiqueta citada en el texto explicativo; se corrigió para leer la etiqueta real con salto de línea, reutilizando la respuesta almacenada. No hubo otra consulta ni mutación.

Los prerequisitos de escritura del paquete están comprobados. Sigue pendiente la autorización concreta de publicación de estos quince archivos y su lectura autenticada posterior; la autorización recibida cubre sólo el SELECT. Antes de publicar, comprobar nuevamente versión/bundle para detectar cambios desde 682. No generar datos comerciales o aliases productivos para completar pruebas sin su propio alcance.

## Verificar y recuperar

Desde este checkout:

```powershell
pwsh -NoProfile -File docs/releases/catalog-owner-682/verify-candidate.ps1 -RuntimeSnapshot .test-output/catalog-owner-production-682-20261003/runtime-682.json -CandidateRoot .test-output/catalog-owner-production-682-20261003/candidate
```

Los tests se copiaron sin modificar a `candidate/tests/` y se ejecutaron desde ese directorio raíz:

```powershell
deno test --cached-only --allow-env --allow-read --node-modules-dir=none --no-lock tests/catalog-owner.contract.test.ts tests/catalog-owner-sdk.test.ts
```

La verificación del candidato es de sólo lectura. Si el runtime cambia, falta un archivo o un hash difiere, detener y reconstruir el paquete sobre la nueva baseline; no usar este snapshot como prueba de versión vigente. Para una publicación futura, repetir la comprobación de versión/bundle por conector, enviar únicamente los quince archivos del candidato y conservar el flag JWT. No desplegar por ahora. Recuperación futura: republicar el snapshot 682 sólo con decisión explícita y explicación de que reintroduce el defecto de ownership; no hacer fallback automático. No hay rollback de datos que ejecutar, pues este trabajo no cambió datos.

`verify-candidate.ps1` pasó contra el snapshot/candidato sellados; dos pruebas negativas rechazaron una versión cambiada a 683 en una copia y una carpeta candidata vacía. El candidato no se alteró para esas pruebas y pasó la última verificación. El script no ejecuta SQL ni despliega.

El primer `git diff --cached --check` señaló los espacios obligatorios de tres líneas vacías de contexto del unified diff guardado como artefacto. Se conservó el patch válido y se limita la excepción de whitespace a `catalog-owner.patch` mediante `.gitattributes` de este directorio; el resto de archivos conserva la comprobación normal. No se relajaron controles del código candidato ni se alteró su hash.

## Ejecutor y presupuesto

Codex/OpenAI conserva el rol de operador/integrador local de la sesión; modelo/versión/esfuerzo efectivos no observables. Claude se consideró sin ventaja para sellar un artefacto verificable; no se invocó. Hasta 60 minutos efectivos y dos ciclos por causa; sin instalaciones, cargos activados o inferencia externa. Consumo/cuota/cargos nativos no observables. Sólo snapshot/candidato propios y estos documentos se escriben; se preserva `.test-output/` ajeno. Sin rama nueva, worktree nuevo, push, PR o despliegue. La única ejecución SQL productiva fue el SELECT de metadatos autorizado, sin datos comerciales ni mutaciones.
