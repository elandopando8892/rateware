# S15-03: fuente local alineada con el backend 682 (candidato LOCAL)

Fecha: 2/oct/2026. Estado: **candidato local para integración**. No se afirma que `main` esté alineado: el `main` remoto `3aa8f2b3e7e738e6f969ce5f748cfcabb1d5c43f` conserva el handler 681 y requiere una integración PUBLICADA posterior.

## Gate CI actualizado y comprobado · 2/oct/2026 14:50 México

Se encontró un gate obsoleto en `clean-migration-replay.yml`: esperaba `402|20260930005749` mientras el árbol canónico contiene 404 migraciones, con versión final `20261002191824`. Se reutilizó el workflow y test Node existentes; eliminar el gate debilitaría la verificación y añadir otra herramienta duplicaría infraestructura. No hubo cambio de SQL, handler, dependencias ni arquitectura.

Claude Sonnet 5.5 actualizó el literal y sustituyó el test de una constante por la comparación contra cantidad/versión de los archivos canónicos. Run real `db11912bef674a4f9af217ea53d6b8f7`, sesión `fd86a996-fd4a-41d9-aee3-eb3ea17e2721`, release fijado `chat-20261002T203733Z` con manifiesto validado. Modelo solicitado/devuelto `claude-sonnet-5-5`, esfuerzo medio solicitado; el runtime no expuso esfuerzo. Nueve pasos de un máximo de 16, 24.75 segundos, cero reintentos y proceso cerrado/reserva nula. La elección del usuario ya estaba vigente; no hubo nueva petición de permiso para Claude.

Codex revisó el diff y verificó cuatro pruebas positivas. Dos mutaciones temporales independientes (cantidad errónea y versión final errónea) produjeron salida 1 y el diagnóstico esperado. Se restauraron los bytes originales de la corrección y las cuatro pruebas finales volvieron a pasar; `git diff --check` pasó. No se ejecutó aquí el replay completo de las 404 migraciones ni GitHub Actions: la suite PostgreSQL del cambio de rebotes sigue siendo la comprobada en el bloque anterior. Evidencia local: `.test-output/s15-03-ci-ledger/verification.json` y `claude-result.json`.

Consumo reportado por CLI: entrada 8, creación de caché 11,347, lectura de caché 39,062 y salida 2,450 tokens; estimación a tarifa de lista USD 0.0777164, no cargo de la suscripción. Cuota actual, importe real y consumo atribuible del plan desconocidos. No se activó uso extra ni proveedor nuevo.

El paquete permanece LOCAL; publicar fuente y frontend requiere la decisión concreta pendiente. La corrección añade únicamente workflow, prueba y este registro al commit `6ccd7b5d`. No vuelve a aplicar las migraciones productivas ni acredita aceptación real del sprint.

## Verificación final de Codex · 2/oct/2026

La integración local quedó comprobada después del cierre del escritor Claude. Se restauraron mecánicamente los dos CRLF del SQL aprobado; ambas migraciones en disco tienen exactamente los hashes de la tabla siguiente. Se retiró únicamente la candidata obsoleta `20261002072000…`, después de comprobar su hash original. No se volvió a ejecutar ninguna migración productiva. El índice del handler permanece en `bf462f7c…`, idéntico al candidato ya desplegado.

El runner final pasó completo en PostgreSQL 17.11 aislado: default grants amplios reproducidos, ACL SELECT/INSERT exacta, seis estados de supresión y sus replays, tres bloqueos protegidos conservados, nuevo bloqueo del sustituto rechazado, atomicidad, dos casos de concurrencia con bloqueo observado y rollback que conserva correcciones/recibos/RLS. Log completo: `.test-output/s15-03-source-final.log`; marcador final `PASS: complete bounce suite, including preservation, ACL, concurrency and rollback`. Contenedor propio retirado y consulta por etiqueta vacía. Una prueba adicional con Docker simulado fallando, sin motor ni SQL real, confirmó salida 1 y error conservado.

Claude Sonnet 5.5 escribió los cambios en el job `s15-03-align-source-20261002t2020z`; Codex integró y verificó. Runs `92f5f31d4e2846d9bfe9f5bc706437ca` y continuación `a898b1c12a474802ae07f73ad1d4bacd`, misma sesión. Modelo solicitado/devuelto `claude-sonnet-5-5`, esfuerzo medio solicitado y no expuesto por metadata. Ambos cerraron procesos y devolvieron la reserva. Los apartados posteriores conservan los checkpoints del escritor y el fallo inicial; la verificación final anterior sustituye sus pendientes locales, no los de publicación o aceptación real.

## Paquete

| Archivo | Ledger productivo | SHA-256 esperado del contenido aprobado |
| --- | --- | --- |
| `supabase/migrations/20261002190932_resolve_vendor_bounce_atomic.sql` | `20261002190932 resolve_vendor_bounce_atomic` | `418cf0afe1ff6898496b3fec2bd2665dbe8e272d877992bb264b3840c1dfe14b` |
| `supabase/migrations/20261002191824_restrict_vendor_bounce_receipt_grants.sql` | `20261002191824 restrict_vendor_bounce_receipt_grants` | `748229b64e1eedccfa62cd7912560b08777101b461e689212a41fa3e2be97472` |

Los archivos son copia del contenido aprobado (`approved-atomic.sql`, `approved-grants.sql`), sin SQL añadido. **El escritor no calculó ni verificó estos hashes** (no hay herramienta de hash autorizada); Codex integrador debe compararlos con los archivos en disco. Ninguna migración debe volver a aplicarse en producción.

Runtime 682, bundle `584ee02d695071e8904880eb0bf4934ccaf244db3f568360abb302731ee76f4d`; índice de este HEAD `bf462f7cf0df32648a54d085017c7e114cceaf0751b2526d38a24681140d7eee`, declarado idéntico al desplegado (15 archivos verificados por el supervisor, no por este escritor).

## Retirada del archivo viejo

`supabase/migrations/20261002072000_resolve_vendor_bounce_atomic.sql` (SHA-256 `70cc9571…`, defectuoso, nunca aplicado) **no se editó**. El escritor no tiene herramienta Delete; se solicita a Codex integrador su eliminación mecánica exacta tras este checkpoint. Hasta entonces el runner ya no lo referencia, pero seguiría presente en el árbol.

## Runner y pruebas

`tests/run-bounce-postgres.ps1 -SqlAuthorized` (PostgreSQL local aislado, imagen cacheada, sin red/puertos/volumen) ejecuta, en orden:

1. `vendor-bounce-fixture.sql`
2. `vendor-bounce-default-grants.sql`: reproduce los default privileges amplios de producción (`grant all` a service_role).
3. Migración `…190932`, y comprobación de que service_role quedó con UPDATE/DELETE (grants amplios reproducidos antes de restringir).
4. Migración `…191824`.
5. `vendor-bounce-receipt-grants.sql`: ACL exacta, service_role solo SELECT/INSERT; anon/authenticated denegados.
6. `vendor-bounce-suppression-preservation.sql` con `require_preservation=true`: complaint/unsubscribed/manual conservados; hard/soft/delivery_incomplete resueltos; replay con mismo UUID; sustituto recién protegido bloquea el replay.
7. `vendor-bounce-atomic.sql`, concurrencia (dos conexiones con bloqueo observado) y rollback existentes, sin cambios.

## Evidencia

**Primera ejecución del supervisor: FALLÓ** antes de completar, con `invalid input syntax for type integer: "PASS: broad default grants reproduced before ACL migration"`. Causa: la consulta de comprobación del runner mezclaba texto y `1/0` en un `CASE`. Que el supervisor reportara completed/returncode 0 no era prueba válida (su stderr incluía `Docker command failed: exec`).

Corrección en el runner (sin cambiar SQL de producto ni pruebas): la comprobación devuelve un booleano y el runner exige `t`; el mensaje de default grants se imprime solo si pasa; cualquier fallo de suite o de limpieza se informa por stderr y termina con código 1 tras la limpieza (la decisión de salida está fuera de `finally`); el código 0 y el marcador final `PASS: complete bounce suite, including preservation, ACL, concurrency and rollback` solo aparecen al terminar toda la suite. **Esta versión corregida aún no ha sido ejecutada; resultado pendiente del supervisor.** Ninguna otra ejecución se ha realizado ni se afirma que pase.

Codex verificó que la migración de permisos y los tests copiados coinciden exactamente y que la migración atomic difiere solo en dos CRLF frente a LF; Codex restaurará los bytes aprobados al integrar.

Ejecución previa: **ninguna por el escritor.** El supervisor Codex ejecutará el runner una vez después de este checkpoint; su resultado debe registrarse aquí o en el informe de integración. Sin esa ejecución, no hay evidencia de que pase. Un posible riesgo: `vendor-bounce-atomic.sql` y el rollback no se revisaron frente a las nuevas migraciones.

## Límites

- Evidencia productiva previa citada por el encargo: 12 lecturas reales 200 Admin/Operador, 0 recibos; no hubo reemplazo real. No acredita la aceptación del Sprint 15.
- Auditlog posterior es best-effort; el recibo transaccional es la fuente persistente.
- Es PostgreSQL sintético mínimo: no prueba JWT/RLS ni triggers productivos completos.
- No se cambió el handler, ni se publicó, ni se ejecutó SQL productivo.
