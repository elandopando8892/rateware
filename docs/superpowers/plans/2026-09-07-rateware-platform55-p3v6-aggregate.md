# Rateware Platform 55 — P3‑V6 Aggregate Convergence

**Fecha:** 2026-09-07
**Objetivo:** certificar la convergencia visual y operativa de las 29 rutas registradas en Platform 55, preservando la navegación compartida, las fronteras público/privado y la aprobación humana.

## Resultado de negocio

Una persona que entra a Rateware debe reconocer el mismo workspace MARKSMAN en Home, Operate, Analyze, Source, Service, Admin y Public/Entry. La navegación debe ser predecible; cada superficie debe mostrar su estado y límite operativo; ninguna certificación debe crear registros, enviar comunicaciones o cambiar datos.

## Alcance

Se certifican exactamente las 29 rutas de `docs/platform55-visual-parity/p3v-route-matrix.csv`:

- Home: `app.html`.
- Operate: `upload-center.html`, `upload-history.html`, `staging-review.html`, `rateware.html`.
- Analyze: `business-intelligence.html`, `growth-hacking.html`.
- Source: `vendors.html`, `shipper-crm.html`, `rfx-process.html`, `rfx-events.html`, `ratebook.html`, `outreach.html`.
- Service: `vendor-support.html`, `vendor-improvement.html`, `provider-service.html`, `provider-onboarding.html`, `provider-gmail.html`, `provider-communications.html`.
- Admin: `settings.html`, `interpretation-memory.html`, `catalog-workbench.html`.
- Public/Entry: `bid-room-board.html`, `carrier-profile.html`, `customer-rfi.html`, `index.html`, `ratebook-carrier.html`, `rfx-bid.html`, `shipper-profile.html`.

Cada ruta conserva su controlador de negocio. P3‑V6 agrega contrato, matriz y evidencia; no reescribe dominio, Auth, Supabase, migraciones ni acciones de outreach.

## No alcance

- No insertar, actualizar, archivar ni eliminar datos de negocio.
- No enviar invitaciones, emails, WhatsApp, mensajes ni bids.
- No cambiar la migración Kinde → Supabase ni configuración de Google Sign‑In.
- No agregar ramas de producto ni reemplazar la ruta `codex/carrier-list-templates`.
- No declarar aceptación independiente sin una revisión separada en SHA exacto.

## Capacidad y modelo

| Recurso | Planeado | Criterio |
|---|---:|---|
| Equipo | 1 implementador | Trabajo acotado a contrato/certificación |
| Duración | 2 semanas | Incluye buffer para regresiones |
| Capacidad planificada | 75% | 25% reservado para correcciones y revisión |
| Modelo principal | GPT‑5.6‑terra | Razonamiento alto para matriz, gates y reconciliación |
| Modelo de seguimiento | GPT‑5.6‑luna | Razonamiento medio para ajustes mecánicos y reportes |

## Entregables visibles

1. Plan P3‑V6 con la ruta exacta, estados, riesgos y gates.
2. Contrato automatizado que impide alterar la ruta registrada, la frontera pública/privada, los límites de mutación y el enlace al source record.
3. Certificador agregado de 29 rutas con contexto de navegador fresco, estados cargados y no-happy, tres viewports, overflow, controles sin nombre, consola y HTTP errors.
4. Evidencia SHA-bound bajo `docs/platform55-visual-parity/evidence/p3v6/<candidate-sha>/`.
5. Actualización de la matriz solamente con evidencia reproducible; una captura estática no otorga `accepted` por sí sola.

## Secuencia

1. Registrar este plan antes de cualquier cambio de contrato o evidencia.
2. Implementar el contrato y el certificador sin dependencias de runtime del producto.
3. Ejecutar la matriz 29 × 3 viewports × estados requeridos en servidor estático local, JavaScript deshabilitado para validar shell/markup y sin red externa.
4. Ejecutar regresiones dirigidas y revisar que no haya mutación ni cambios en ledger/migraciones.
5. Registrar evidencia y dejar `unverified` hasta revisión independiente en worktree limpio y SHA exacto.
6. Solicitar autorización separada para cualquier push, PR, preview o producción; el presente sprint no presupone esas acciones.

## Gates de salida

- [ ] 29 rutas exactas presentes y clasificadas una sola vez.
- [ ] Contrato P3‑V6 en verde.
- [ ] Matriz de navegador sin overflow, controles sin nombre, errores HTTP o de consola reales.
- [ ] Evidencia reproducible y vinculada al SHA candidato.
- [ ] Revisión independiente `GO` en worktree limpio.
- [ ] Solo después: actualización de `parity_status` a `accepted` donde la evidencia y la revisión lo justifiquen.

## Riesgos conocidos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Rutas históricas tienen capas P3‑V1…P3‑V4 distintas | Falsa homogeneidad visual | Certificar familia, shell, estado y límites sin exigir DOM idéntico |
| La matriz contiene referencias históricas | Evidencia no reproducible | No convertir `unverified` a `accepted` sin reviewer y hash |
| Algunas rutas dependen de Auth o APIs | Flaky smoke | Servidor estático para visual; smoke autenticado separado y read-only |
| Cambios de usuario en `.codex/`, `deno.lock`, `tmp/` | Difusión accidental | No tocar ni stagear archivos fuera del alcance |

## Narrativa de cierre requerida

Al terminar, reportar: objetivo de negocio, familias y rutas verificadas, pruebas y conteos, evidencia y SHA, lo que no se ejecutó, riesgos preexistentes, deployment solo si fue autorizado y el siguiente gate.
