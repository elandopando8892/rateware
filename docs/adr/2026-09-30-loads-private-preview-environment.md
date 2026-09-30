# ADR: Entorno temporal aislado para validar el libro privado en Loads

**Estado:** Proyecto temporal creado; esquema, funcion y Auth pendientes
**Fecha:** 2026-09-30
**Decisor:** sales@heymarksman.com

## Resultado visible buscado

Un carrier con Google y una invitacion de Bidware realmente enviada ve solo sus rutas en un Preview protegido de MARKSMAN Loads. Otro carrier, una invitacion no enviada, una invitacion revocada y una sesion Google de vendor distinto no ven esas rutas. El tablero es de solo lectura: ningun bid, award, correo o cambio de Fleet Rocket se ejecuta.

## Restricciones verificadas

- Rateware y Loads son repositorios y productos distintos. El Preview no debe cambiar sus despliegues productivos.
- La primera rama temporal de Rateware termino `MIGRATIONS_FAILED` antes de crear las tablas de RFx/outreach y ya fue eliminada. La rama principal y la rama de Demand Radar siguen reportando ese mismo estado, aunque el proyecto principal esta `ACTIVE_HEALTHY`.
- La lista remota contiene 593 migraciones aplicadas. El repositorio contiene migraciones con `INSERT` de contactos reales. Una rama `with_data=false` no evita que el propio SQL de una migracion inserte esos registros.
- Segun la [documentacion de Supabase sobre ramas desde el panel](https://supabase.com/docs/guides/deployment/branching/dashboard), si main tiene historial de migraciones, una nueva rama se crea desde ese historial y no desde un volcado de esquema. [Su guia de diagnostico](https://supabase.com/docs/guides/troubleshooting/branch-in-migrations-failed-status) explica el estado parcialmente migrado. Por ello repetir la creacion de la misma rama no es una solucion segura.
- El ensayo [CI 36671655772](https://github.com/elandopando8892/rateware/actions/runs/36671655772) restauro solo definiciones de `public` en una segunda instancia local desechable, retiro acceso directo de los roles `anon` y `authenticated` a tablas y rutinas, y ejecuto la Edge Function con datos sinteticos. Ambos jobs pasaron. Eso no es una prueba alojada ni de Google OAuth.

## Opciones

| Opcion | A favor | En contra / decision |
|---|---|---|
| Nueva rama de Rateware | Mismo proyecto y administracion | Reproduce el historial fallido y puede ejecutar importaciones; descartada para este gate. |
| Proyecto Supabase temporal e independiente | Permite iniciar vacio y aplicar solo estructura revisada | Costo y configuracion de Auth separados; elegida **solo si** el propietario confirma organizacion y costo. |
| Funcion temporal en Rateware productivo | Reutiliza Google y evita proyecto adicional | Cambia un sistema productivo para una prueba; requiere otro gate de produccion, no incluido aqui. |
| Simulacion en Vercel sin fuente | Reversible y sin nueva base | Valida interfaz, no autorizacion ni contrato Rateware; no cierra este gate. |

## Decision propuesta y limites

Preparar un proyecto Supabase temporal **independiente**, sin GitHub branching ni datos de Rateware. Antes de crearlo se solicita la cotizacion del proveedor para la organizacion confirmada y se obtiene aprobacion especifica del costo. La aprobacion previa del costo de una *rama* no equivale a aprobar un *proyecto*.

El propietario confirmo la organizacion `lfwjwlwdcjumomhwupba` para cotizar y despues autorizo continuar tras la cotizacion. El conector indico `0` por mes para un proyecto nuevo, sin especificar moneda ni otros posibles consumos. El proyecto temporal `iegaganvuvcicynszxds` (`marksman-loads-private-book-preview-temporary`) se creo el 2026-09-30 a las 05:03:53 UTC en `us-east-1`. La lectura inicial confirmo `ACTIVE_HEALTHY`, cero tablas base en `public`, cero funciones y cero migraciones. No esta conectado a Loads ni se han sembrado identidades o invitaciones.

El generador `tools/build-rfx-peek-preview-schema.mjs` extrajo solo seis tablas del esquema local (`vendors`, `rfx_events`, `rfx_lanes`, `rfx_lane_vendors`, `outreach_campaigns`, `outreach_messages`) con 19 restricciones, diez de ellas relaciones internas. La salida no contiene filas, funciones ni disparadores. Se restauro en una base local desechable: seis tablas, diez relaciones, `anon` sin lectura, `service_role` con lectura y sin escritura. La misma estructura se aplico mediante una sola migracion al proyecto temporal; su lectura posterior verifico esas propiedades y cero filas en vendors, eventos, invitaciones y outreach. Este esquema reducido sirve para el contrato de lectura, no sustituye el esquema completo de Rateware ni prueba una sincronizacion productiva.

1. Revisar el volcado de definiciones antes de alojarlo: funciones, defaults, grants, extensiones y literales incrustados. Aplicarlo solamente al ref nuevo; no marcar las migraciones historicas como ejecutadas ni editar el historial de main.
2. Retirar en el proyecto temporal el acceso directo `anon` y `authenticated` a tablas, secuencias y rutinas de `public`; conservar el acceso de servidor estrictamente necesario. El CI debe demostrar ese cierre y que `peek_invitation` continua funcionando con dos vendors sinteticos.
3. Cargar solo IDs generados y contactos `.invalid`; verificar filas vacias antes de sembrar. No copiar usuarios, tokens, contactos, propuestas ni clientes productivos.
4. Generar una variante `rfx-bid-api` exclusiva del Preview mediante `tools/build-rfx-peek-preview.mjs`; el archivo fuente productivo permanece intacto. La variante debe negar toda accion distinta de `peek_invitation` antes de construir el cliente service-role. Desplegarla solo despues de comprobar el contenido generado, el esquema y los grants. Conectar un Preview protegido de Loads. El Auth de ese Preview y la fuente deben pertenecer al **mismo ref**. Configurar Google y callbacks especificos del Preview; no relajar la comprobacion de origen de Loads.
5. Ensayar invitacion enviada, no enviada, vendor correcto/distinto, expiracion, revocacion, ausencia de tokens en respuestas y ausencia de cambios en `viewed_at`/`updated_at`. Una prueba con identidades sinteticas no sustituye la aceptacion con un carrier real.
6. Mantener los flags comerciales y productivos apagados. Registrar ID exacto del proyecto, despliegue de Vercel, variables temporales, hora de inicio y costo; retirar solo esos recursos y verificar ausencia al terminar.

## Criterios de pausa y reversa

Pausar si el costo no es aprobado, el volcado contiene valores operativos no revisados, existe acceso directo desde roles de navegador, el proveedor no permite el Google OAuth aislado, o alguna lectura revela otro vendor, un bearer o muta una invitacion. Desactivar el Preview y eliminar sus variables/alias temporales; borrar el proyecto solo con ID verificado. No tocar Rateware main, Demand Radar, dominios ni Loads productivo.

## Consecuencia

El siguiente gate tendra un costo y una configuracion separados, pero no arrastrara el historial de migraciones de Rateware. Hasta que ese Preview pase con Google e identidad de vendor, PR #167 y el libro privado productivo siguen sin aprobarse para activacion.
