# ADR: Consulta privada de Bid Room sin registrar vista

**Estado:** Propuesto; implementado y probado localmente, no desplegado
**Fecha:** 2026-09-28
**Decisores:** Producto y operaciones de Rateware/MARKSMAN Loads

## Contexto

MARKSMAN Loads necesita revalidar un enlace privado contra la identidad del vendor en cada lectura del libro de invitaciones. `get_invitation` registra `viewed_at` y puede cambiar `invited` a `viewed`, aun con `refresh_only=true`. Además, la búsqueda y la hidratación de tokens legados pueden migrarlos mediante `UPDATE`. Una lectura periódica de Loads no debe producir ninguno de esos efectos.

## Decisión propuesta

Agregar `peek_invitation` al mismo endpoint `rfx-bid-api`, con el mismo token bearer y las mismas consultas y proyección de `get_invitation`, pero sin marcar la invitación como vista ni migrar tokens legados. La respuesta incorpora `Cache-Control: private, no-store, max-age=0`. No cambia el comportamiento de `get_invitation` ni el flujo original de Bid Room. Loads usa `peek_invitation` **solo** para revalidar `GET /api/private-book`; la apertura ordinaria del enlace sigue siendo `get_invitation`.

El resultado de `peek_invitation` omite los tokens de invitación del objeto principal, del tablero y de las filas del libro; también omite historial y confirmaciones de segmento, que no son necesarios para esta vista y podrían contener metadatos sensibles. Loads reduce de nuevo la respuesta a su proyección existente y jamás entrega tokens al navegador. El mismo vendor del enlace y de la sesión OAuth se compara en el servidor. El interruptor del libro privado de Loads permanece apagado.

## Opciones consideradas

| Opción | Ventaja | Riesgo / coste |
|---|---|---|
| Reutilizar `get_invitation` | Sin código nuevo | Produce escrituras y confunde lectura con apertura; rechazada |
| Agregar `read_only` al mismo action | Poco cambio | Fácil que un cliente nuevo omita el flag y vuelva a escribir |
| Acción explícita `peek_invitation` | Semántica verificable, conserva contrato original | Requiere desplegar y probar Rateware antes de activar Loads; elegida |
| Endpoint independiente | Aislamiento más fuerte | Duplica consultas y proyección del libro, aumenta deriva |

## Evidencia y consecuencias

- Prueba Deno con un PostgREST simulado: lectura `refresh_only` y lectura completa con token legado; cualquier método distinto de `GET` provoca fallo. Ambas pasaron sin escritura.
- La prueba sintética incorpora dos vendors y comprueba que cada token devuelve únicamente las invitaciones de su propio vendor. No sustituye la prueba integrada no productiva.
- La nueva acción se registra en el contrato gobernado como lectura tokenizada con aprobación humana pendiente; el registro no autoriza despliegue productivo.
- `deno check` y regresiones de Bid Room pasaron. Esto **no** prueba integración contra Supabase/Rateware desplegados.
- No hay inserción de tarifas, bids, awards o cambios de perfil; tampoco se altera el estado de las invitaciones.
- La lectura sin escritura no elimina el carácter sensible del token ni sustituye revocación, caducidad y la comprobación de vendor en Loads.

## Acciones de salida

1. Revisar el cambio en Rateware y aceptar explícitamente este contrato antes de desplegar la Edge Function.
2. Probar en un entorno no productivo con dos vendors e invitaciones sintéticas/autorizadas; comprobar lectura correcta, mismatch, caducidad y revocación sin cambios en `viewed_at` ni columnas de token.
3. Solo entonces activar el interruptor del Preview de Loads y validar su UI. Producción y envío de ofertas permanecen fuera de este gate.
