# ADR-008: Ingesta mínima de `shipment.created` desde MARKSMAN Loads

**Status:** Accepted; implementation candidate, deployment deferred
**Date:** 2026-09-07
**Deciders:** Rateware and MARKSMAN Loads product owner

## Context

Fleet Rocket ejecuta el embarque, MARKSMAN Loads produce un recibo confirmado y
Rateware ya conserva el evento append-only que consulta Service Desk. El RPC de
registro es deliberadamente `service_role` y no debe exponerse al navegador ni
obligar a Loads a conservar una llave administrativa de Rateware.

## Decision

Añadir `shipment-event-ingest-api`, una Edge Function sin CORS y de una sola
acción. Acepta el sobre HMAC existente `rateware-internal-request.v1`, verifica
emisor, audiencia, llave nombrada, firma y expiración máxima de cinco minutos,
valida un recibo ejecutado con campos exactos —incluidos hashes SHA-256— y llama al RPC dentro de Rateware.
La respuesta devuelve sólo el UUID del evento, replay e identificadores de
correlación.

Como la autenticación ocurre dentro del handler mediante HMAC y no mediante una
sesión de usuario, la función declara `verify_jwt=false` de forma explícita. Esto
no vuelve pública la operación: una solicitud sin la firma nombrada no llega al
RPC de registro.

## Options considered

- Compartir `service_role` con Loads: rechazado por privilegio excesivo.
- Dar acceso al navegador: rechazado por la frontera de confianza.
- Cola nueva: diferida; el ledger idempotente ya resuelve deduplicación y replay.
- Endpoint HMAC específico: seleccionado por mínimo privilegio y reutilización.

## Consequences

- Ningún dato comercial completo cruza a Rateware.
- Una respuesta incierta permite repetir sólo la publicación; el RPC devuelve
  el evento original si el payload coincide.
- Despliegue, secreto y activación en Loads necesitan autorización separada.
