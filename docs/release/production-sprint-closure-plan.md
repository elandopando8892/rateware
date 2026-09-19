# Rateware: plan de cierre a produccion

Fecha: 2026-09-19. Objetivo activo; no constituye certificacion de produccion.

## Objetivo

Publicar en rates.heymarksman.com una version visualmente aprobada y estable del
flujo CRM -> listas de carriers -> Bid Room -> preparacion Gmail/WhatsApp -> revision.
Recuperar la simplicidad anterior al shell sin restaurar Kinde ni perder Supabase
Google Auth, permisos, templates y correcciones actuales del servidor.

## Alcance y limites

- Una candidata, sin crear ramas adicionales ni rediseniar modulos ajenos al flujo.
- Manual MARKSMAN obligatorio: activos aprobados, colores, fuentes y accesibilidad.
  Cualquier fallback tipografico requiere documentacion y aprobacion.
- No restaurar la base de datos ni desplegar el backend historico del checkout.
- No enviar invitaciones ni mensajes reales sin autorizacion especifica.
- Reservar 25% de capacidad para defectos; estimar fechas tras verificar integracion.
- Modelos siguientes son recomendaciones, no cambios automaticos del modelo activo.

## Sprints secuenciales

| Sprint | Entrega visible | Modelo / esfuerzo recomendado | Criterio de cierre |
| --- | --- | --- | --- |
| 1. Base compatible | Preview pre-shell con login Google, CRM y Bid Room | Sol / alto | Sesion autenticada, permisos permitidos y denegados comprobados, contratos del servidor vigentes verificados; sin Kinde ni dependencias rotas |
| 2. UI y UX aprobadas | Build y Launch consistentes, textos legibles, una accion principal por paso, menos controles redundantes | Sol / alto | Evidencia desktop y movil, teclado y foco, marca MARKSMAN y aprobacion visual del usuario |
| 3. Flujo completo | Crear, editar, archivar y cargar listas; preparar colas Gmail y WhatsApp separadas | Sol / alto | Fixtures no productivas: 89 carriers x 69 rutas, reintentos sin duplicados, recuperacion parcial, cambio de evento seguro, cero envios; mediciones de carga con presupuestos acordados |
| 4. Certificacion y lanzamiento | Candidata aprobada en dominio final, con rollback identificado | Terra / alto; Sol para defectos | Cero P0/P1 abiertos, smoke autenticado, SHA y deployment exactos, alias/TLS/callbacks correctos y verificacion posdeploy sin envios |

Dependencias: 2 requiere 1; 3 requiere contratos de 1 y el flujo aprobado de 2;
4 requiere todos los cierres anteriores. Un fallo devuelve la candidata al sprint
correspondiente; una prueba local no sustituye evidencia autenticada.

## Estado verificado del expediente

- Sprint 1 abierto: candidata implementada con pruebas locales y preview publicada.
- Preview: https://rateware-81sy2u3jt-elandopando8892s-projects.vercel.app
- Evidencia detallada: pre-shell-recovery.md.
- Pendiente acceso autenticado: el ultimo intento registrado termina en login Vercel.
- Pendiente verificar en servidor el limite de preparacion: 89 x 69 = 6,141 pares.
- Sprints 2, 3 y 4 no certificados; no declarar la candidata estable por su antiguedad.

## Siguiente entrega y narrativa

Primero cerrar acceso, permisos y compatibilidad de API; despues mostrar el mismo bid
en Build y Launch en desktop y movil para aprobar la direccion visual.
Cada incremento termina con: cambio visible, pruebas y alcance, enlace/SHA,
pendientes concretos y siguiente paso. No mas sprints de ampliacion antes del cierre.

Si una aprobacion o sesion del usuario impide continuar, comunicar un unico bloqueo
accionable. No repetir comprobaciones sin cambios ni consumir trabajo en revisiones
equivalentes. Produccion solo se promueve tras cumplir los criterios anteriores.
