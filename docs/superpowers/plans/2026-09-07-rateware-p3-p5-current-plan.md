# Rateware P3-P5 — Plan vigente hacia el objetivo gobernado

**Fecha de corte:** 2026-09-07  
**Checkout:** `D:\andre\apps\codex-data\worktrees\Rateware\carrier-list-templates`  
**Rama y HEAD verificados:** `codex/carrier-list-templates` / `62942bb04f29b9d7d444d8f9476f1c2b47e31721`  
**Horizonte:** cuatro sprints de dos semanas  
**Capacidad asumida:** un agente principal de ingeniería con revisión humana de producto/release; 40 puntos nominales por sprint, 30 puntos comprometidos (75%) y 10 puntos de reserva.

## Resultado de negocio preservado

Rateware gobierna la adquisición y comercialización de capacidad mediante intake, Carrier/Provider CRM, RFx, Bid Room, RateBooks y outreach revisado. El flujo debe interpretar cotizaciones, conservar el archivo fuente, normalizar primero en `rate_staging` y exigir aprobación humana antes de insertar en producción.

Rateware es el sistema de registro para compatibilidad del carrier master, relaciones con proveedores, RFx y lanes, bids y awards, tarifas comerciales y RateBooks. No es el sistema de registro para estimación técnica de costos, ejecución de embarques, registros financieros o fiscales ni Customer Setup.

## Evidencia y estado inicial

- Graphify Health: `ok`, sólo lectura, sin efectos externos.
- Graphify: alias `rateware-core`, `sourceAsOf = 2026-09-04`, `graphFreshness = DIVERGENT`.
- El corte funcional de Graphify es `e7110f11ed81ee8fda6460e8f37ec73ff0688269`; el checkout actual avanzó 85 commits hasta `62942bb`.
- Vercel producción: proyecto `rateware`, deployment `dpl_AwqkGHNewjZduTcY4inBUGU7qKw8`, estado `READY`, aliases `rateware.vercel.app` y `rates.heymarksman.com`. La lectura disponible no confirmó el SHA Git exacto del deployment.
- Carrier List Templates: dominio de navegador PASS; probes unitarios 3/3; contrato Deno 73/73.
- P3: registro de mutaciones 3/3; award atómico 4/4; paquete de award e implementación versionada 8/8.
- P3-V6 agregado: 5/5 pruebas PASS.
- La matriz canónica todavía registra 5 rutas `accepted` y 24 `unverified`; no coincide con la certificación agregada posterior.
- `npm run release:progress` falla por `working tree source drift: rateware.html`.
- El CLI de Supabase no está disponible en este host; el estado remoto de la migración `20260825160000_carrier_list_templates.sql` y del flag `CARRIER_LIST_TEMPLATES_V2_ENABLED` no quedó confirmado en esta revisión.
- El checkout conserva cambios locales ajenos en `.codex/config.toml`, `deno.lock`, `.codex-tmp/` y `tmp/`; deben preservarse.

## Sprint P3-A — Experiencia funcional convergente

**Fechas tentativas:** 2026-09-08 a 2026-09-19  
**Modelo:** GPT-5.6 Sol, esfuerzo alto  
**Carga comprometida:** 30/40 puntos

**Objetivo:** entregar y acreditar la jornada visible `Carrier CRM → Template Library → Builder/import preview → Carrier Fit → Message` en desktop y móvil, sin enviar invitaciones.

### Entregables visibles

- Biblioteca de templates con crear, guardar draft, activar, modificar, duplicar, archivar y restaurar.
- Importación CSV/XLSX con preview por fila, estados `matched`, `ambiguous`, `not_found` y `duplicate`, y reporte descargable.
- Carrier Fit consume sólo templates activos, recalcula elegibilidad actual y permite selección humana total o parcial.
- Handoff a Message con audiencia explícita; Delivery queue permanece como decisión posterior.
- Evidencia MARKSMAN desktop/móvil: logos aprobados, colores, tipografía o fallback documentado, jerarquía, contraste, foco y legibilidad operacional.

### Trabajo comprometido

| Prioridad | Trabajo | Puntos | Dependencia |
|---|---|---:|---|
| P0 | Reconciliar matriz P3-V y evidencia agregada para las 29 rutas | 7 | SHA y manifests actuales |
| P0 | Resolver el drift de `rateware.html` sin debilitar verificadores históricos | 5 | fuente/supersession canónica |
| P0 | Reproducir el journey completo de templates en preview aislado | 8 | fixtures de dos organizaciones |
| P0 | Confirmar migración y flag en un entorno no productivo | 5 | acceso Supabase de sólo lectura/preview |
| P1 | Cerrar evidencia responsive y accesibilidad MARKSMAN | 5 | manual y assets aprobados |

### Puerta de salida

- Las 29 rutas tienen una disposición canónica coherente con sus manifests.
- `release:progress` y el preflight pasan sobre el SHA candidato limpio.
- El journey completo pasa en desktop y móvil con cero envíos y cero inserciones productivas.
- Tenant ajeno, usuario read-only, versión stale y template archivado fallan de forma controlada.
- El estado remoto de migración y flag queda demostrado; el flag sigue apagado en producción.

## Sprint P3-B — Operación observable y recuperable

**Fechas tentativas:** 2026-09-21 a 2026-10-02  
**Modelo:** GPT-5.6 Sol, esfuerzo alto  
**Carga comprometida:** 30/40 puntos

**Objetivo:** convertir el hardening ya implementado en una puerta reproducible para releases y acciones críticas.

### Entregables visibles y operativos

- Inspector de readiness que muestra identidad de entorno, tenant, actor, correlación, versión y estado de rollback.
- Métricas consistentes en Carrier CRM y estado entendible para errores de Shipper CRM.
- RFx award y paquetes de implementación con replay seguro y mensajes recuperables ante conflicto de versión.
- Runbooks ejecutables para frontend, Edge Functions, migraciones, flags y configuración.

### Trabajo comprometido

| Prioridad | Trabajo | Puntos | Dependencia |
|---|---|---:|---|
| P0 | Cerrar inventario de mutaciones críticas: idempotente, guardada o ledger-required | 8 | action contract vigente |
| P0 | Estandarizar `request_id` y `operation_id` en rutas críticas restantes | 6 | inventario anterior |
| P0 | Resolver inconsistencias de métricas/estado en Carrier y Shipper CRM | 6 | consultas y tenant real |
| P0 | Validar rollback y consultas de 4xx/5xx/latencia/tenant | 6 | entorno desplegado controlado |
| P1 | Revisión independiente y paquete de evidencia inmutable | 4 | SHA candidato limpio |

### Puerta de salida

- Ninguna mutación crítica carece de tenant, autorización y correlación demostrables.
- Los reintentos no duplican awards, participantes, mensajes ni auditorías.
- El dashboard o consultas equivalentes muestran errores y latencia durante una ventana de release.
- Cada rollback tiene disparador, responsable, comando y consulta de verificación.
- Revisión independiente emite GO para P3; sólo entonces el ledger puede mover P3 de 0%.

## Sprint P4 — Aceptación autenticada de extremo a extremo

**Fechas tentativas:** 2026-10-05 a 2026-10-16  
**Modelo:** GPT-5.6 Sol, esfuerzo `xhigh`  
**Carga comprometida:** 28/40 puntos

**Objetivo:** probar la jornada completa con identidades reales en un entorno desplegado controlado y evidencia ligada al SHA.

### Flujos obligatorios

1. Login y resolución del tenant canónico.
2. XLSX/PDF/imagen/email → interpretación → archivo fuente preservado → `rate_staging`.
3. Revisión humana → aprobación controlada; nunca usar Tier 1/2/3 como tarifa y omitir `X`, `N/A` y `Please Estimate`.
4. RFx → Carrier Fit → Message → Delivery queue → respuesta → decisión humana de award.
5. RateBook con linaje, moneda, vigencia y aprobación.
6. Handoffs de operaciones y finanzas observados como contratos separados, sin atribuir su sistema de registro a Rateware.
7. Denegación cross-tenant y rollback representativo de frontend, función y base de datos.

### Trabajo comprometido

| Prioridad | Trabajo | Puntos | Dependencia |
|---|---|---:|---|
| P0 | Matriz E2E autenticada con casos y evidencia timestamped | 10 | P3 GO |
| P0 | Jornada realista de intake a `rate_staging` y aprobación | 6 | fixtures autorizados |
| P0 | RFx/award/RateBook con linaje e idempotencia | 6 | P3-B receipts |
| P0 | Cross-tenant denial y rollback drills | 4 | entorno aislado |
| P1 | Aceptación visual/producto desktop y móvil | 2 | assets y journeys finales |

### Puerta de salida

- Cada flujo tiene evidencia ligada al mismo SHA y a las versiones desplegadas.
- Ninguna prueba aprueba una tarifa, envía mensajes o produce efectos externos automáticamente.
- No hay hallazgos P0/P1 abiertos; revisión independiente produce recomendación GO.
- Diseño/producto confirma claridad, accesibilidad, densidad de datos y confirmación humana.

## Sprint P5 — Go-live controlado y estabilización

**Fechas tentativas:** 2026-10-19 a 2026-10-30, más ventana de 24–48 horas  
**Modelo:** GPT-5.6 Sol, esfuerzo `xhigh`  
**Carga comprometida:** 24/40 puntos; reserva ampliada para incidentes

**Objetivo:** liberar el candidato aprobado y demostrar comportamiento estable y recuperable en producción.

### Trabajo comprometido

| Prioridad | Trabajo | Puntos | Dependencia |
|---|---|---:|---|
| P0 | Congelar SHA, migrations, functions, frontend, flags y postura de entorno | 5 | P4 GO |
| P0 | Ejecutar release en orden aprobado y smoke autenticado | 7 | autorización humana final |
| P0 | Activar Carrier Templates sólo tras smoke y validación del flag | 3 | migración/función verificadas |
| P0 | Monitorear 24–48 h errores, latencia, tenant y escrituras inesperadas | 5 | observabilidad P3-B |
| P0 | Probar umbrales y capacidad real de rollback | 2 | runbooks P3-B |
| P1 | Cerrar ledger, riesgos residuales y responsables | 2 | evidencia completa |

### Puerta de salida

- Production smoke pasa sobre el SHA exacto desplegado.
- La ventana de estabilización permanece dentro de umbrales acordados.
- No aparecen aprobaciones, comunicaciones, mutaciones CRM/TMS ni inserts productivos inesperados.
- Ledger, evidencia, propietarios y rollback quedan completos.
- P5 y el objetivo formal alcanzan 100% sólo con GO humano documentado.

## Dependencias y decisiones humanas

- Acceso de lectura a Supabase para confirmar migraciones, funciones, secrets por nombre y flag sin exponer valores.
- Assets y licencias aprobadas de New Black Typeface, Lenia Mono y logos MARKSMAN; cualquier fallback requiere aceptación de diseño.
- Fixtures autorizados y dos identidades de organizaciones distintas para P3-A/P4.
- Umbrales de error, latencia y rollback acordados antes de P5.
- Push, PR, preview, migración, deploy, cambio de flag, mensajes, awards y producción requieren su puerta humana correspondiente.

## Fuera de alcance

- Construir un motor de costo técnico dentro de Rateware.
- Ejecutar embarques o sustituir Fleet Rocket/MARKSMAN Loads.
- Crear postings financieros, fiscales o CFDI.
- Absorber el caso y workflow de OSP Customer Setup.
- Convertir contratos `PROPOSED`, prototipos o evidencia local en integración productiva sin implementación y aceptación observadas.

