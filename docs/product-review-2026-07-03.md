# Revisión de producto — Rateware / Carrierware / Bidware / Intelware / Adminware
**2026-07-03 · basado en el modelo de datos real, uso real y recorrido de cada módulo**

---

## 1. El diagnóstico en una frase

> **Hoy tienes un excelente motor de *costo de compra* de flete (procurement), pero no tienes producto *comercial*. Todo el sistema mira hacia adentro (conseguir tarifas de carriers), no hacia el cliente (vender flete con margen). Tu visión —"de lo comercial hacia lo operativo"— requiere construir la mitad que falta, no pulir la que existe.**

El modelo de datos lo confirma sin ambigüedad:

- **No existe la tabla `customers` / `shippers`.** No hay cliente.
- **No existe `quote` a cliente, `sell_rate`, `margin`, `won/lost`, `opportunity`, `deal`.** No hay venta.
- **`rate_staging` = 56,047 filas.** Ese es todo el producto: un catálogo normalizado de tarifas de compra a carriers.
- Lo que llamas **"Bidware" es procurement inverso** (invitar carriers a cotizar lanes), **no cotización a cliente**. Y está **casi sin uso: 2 eventos en toda la historia.**

Un brokerage/forwarder comercial funciona así:
`Cliente pide precio → cotizas SELL = costo + margen → ganas la carga → cubres con carrier al costo`.
**Tu producto hoy solo hace el último paso.** Rateware no es el producto final: es el *motor de costo* que debería alimentar una cotización.

---

## 2. Veredicto módulo por módulo

### 🟩 Rateware (gestión de tarifas) — **SIRVE. Es tu activo core. Pero está mal posicionado.**
- 56k tarifas normalizadas, catálogos, FSC, FX, mileage, cross-border MX/US. Es serio y difícil de replicar.
- **Problema de enfoque:** lo tratas como el *producto*. En realidad es el **COST ENGINE** — el "costo de la mercancía" de una cotización. Su valor se multiplica cuando alimenta un precio de venta, no cuando vive solo.
- **Está demás dentro:** `rates` (0 filas, legacy de `rate_staging`), `rateware_book_versions` (0 — el versionado se construyó y nunca se usó).
- **Falta:** vigencia de tarifa (valid_from/valid_to/expiry) — hoy 100% del libro tiene >60 días y el sistema no lo sabe estructuralmente. Sin vigencia, un cost engine miente.

### 🟨 Carrierware (gestión de proveedores) — **SIRVE, pero es un directorio, no un motor de capacidad.**
- 1,556 vendors, pipeline de procurement, health scoring, duplicados, segmentos.
- **Lo bueno:** es el mejor módulo secundario. CRM de carriers real.
- **Enfoque equivocado:** mide "completitud de perfil" (dato operativo) en vez de **capacidad y confiabilidad comercial** (¿este carrier cubre esta lane?, ¿a qué costo?, ¿cumplió?). Un carrier sirve por su *capacidad de cubrir cargas ganadas*, no por tener el logo lleno.
- **Falta:** vínculo carrier↔lane↔performance. Hoy no sabes "quién cubre Laredo→Dallas y qué tan bien".

### 🟥 Bidware (gestión de cotizaciones) — **EL MÁS SOBRE-CONSTRUIDO Y MENOS USADO. Aquí está el mayor desperdicio Y la mayor oportunidad.**
- Es de los módulos con más código (rfx-events.js es enorme) y **2 eventos creados en toda la historia**. `rfx` (0 filas) duplica a `rfx_events`.
- **La trampa conceptual:** "Bidware" hoy = recolectar pujas *de carriers*. Pero "cotización" en un negocio comercial = **cotizar al CLIENTE**. Construiste la mitad de procurement de un producto de bidding, y le falta la mitad que genera dinero: la cotización de venta.
- **Veredicto:** no lo tires — **reorienta su motor** (lanes, invitaciones, comparación de pujas) para que sea el paso *"cubrir la carga ganada"*, subordinado al quoting comercial. Colapsa `rfx`+`rfx_events`+`lanes`(0) en un solo modelo.

### 🟨 Intelware (inteligencia de negocios) — **SIRVE POCO HOY porque no hay negocio comercial que analizar.**
- Geo map, pivots, AI copilot. Técnicamente potente (aunque lo arreglamos: daba statement timeout con 55k filas).
- **El problema no es el módulo, es que solo puede analizar *procurement*** (concentración de carriers, costo/milla). No puede responder lo comercial —margen por cliente, win rate, rentabilidad por lane, precio óptimo de venta— **porque esos datos no existen**.
- Intelware brillará *cuando exista el lado venta*. Hoy es un Ferrari en un estacionamiento.

### 🟩 Adminware (settings) — **SIRVE, es delgado, y está bien que sea delgado.**
- Access (full para todos, RBAC pospuesto — correcto para MVP), Perfil, Org, Onboarding, Catálogos, Audit.
- **Enfoque:** no inviertas aquí todavía. RBAC y multi-org importan cuando tengas usuarios comerciales con roles (vendedor ve sus clientes, gerente ve márgenes). Hoy no.
- **Nota de datos:** hay **3 identidades de owner** (`kp_...`×2 + `sales@heymarksman.com`) con ~1,270 vendors cada una — data duplicada por identidad. Adminware debería resolver "quién es el workspace canónico".

---

## 3. Qué está demás (cortar / consolidar)

| Elemento | Estado | Acción |
|---|---|---|
| Tabla `rates` | 0 filas, legacy | Eliminar (todo vive en `rate_staging`) |
| Tabla `rfx` | 0 filas, legacy | Consolidar en `rfx_events` |
| Tabla `lanes` | 0 filas | Eliminar / consolidar en `rfx_lanes`/rateware |
| `rateware_book_versions` | 0 filas | Feature de versionado muerto — quitar o justificar |
| Complejidad de Bid Room | 2 eventos de uso | No expandir; reorientar (ver §5) |
| Medición de "completitud de perfil" de vendor | dato vanidoso | Reemplazar por capacidad/performance |

---

## 4. Qué falta — **la capa comercial completa (el corazón del producto que quieres)**

Esto es lo que convierte "herramienta de procurement" en "SaaS comercial":

1. **Customer / Shipper CRM** — la contraparte de Carrierware. Clientes, contactos, lanes que mueven, volumen, tarifas objetivo. *Hoy: no existe.*
2. **Quote-to-customer (Quoteware / el ware que falta)** — el acto comercial:
   `lane del cliente → jala costo de Rateware (cost engine) → aplica margen → precio de venta → envía cotización → gana/pierde`.
   *Este es el flujo "de lo comercial hacia lo operativo" que pediste, literal.*
3. **Margen y pricing** — `sell = buy + margin`. Margen por lane/cliente/servicio. Pricing sugerido (Intelware puede recomendarlo con los 56k costos que ya tienes).
4. **Win/Loss & pipeline comercial** — oportunidades, tasa de cierre, razones de pérdida, forecast. (El "pipeline" actual es de *vendors*, no de *ventas*.)
5. **Vigencia de tarifa** — valid_from/valid_to; alertas de tarifas vencidas (hoy el 100% del libro está vencido y nadie lo sabe).
6. **Cierre del loop operativo (ligero):** carga ganada → cubrir con carrier (reusar el motor de Bid Room) → margen realizado. *Más comercial que operativo: el foco es ganar y el margen, no el tracking de la carga.*

---

## 5. La arquitectura objetivo — un SaaS comercial moderno

Reordena los "wares" alrededor del **flujo de dinero**, no del flujo de datos:

```
        COMERCIAL (donde entra el dinero)          →        OPERATIVO (donde se ejecuta)
  ┌─────────────┐   ┌──────────────┐   ┌─────────────┐     ┌──────────────┐   ┌───────────┐
  │  Customer   │→ │  QUOTEWARE   │→ │   Won load  │  →  │  Carrierware │→ │  Bidware  │
  │  CRM (nuevo)│   │ (nuevo:      │   │  (deal)     │     │  (capacidad) │   │(cubrir)   │
  └─────────────┘   │  cotizar al  │   └─────────────┘     └──────────────┘   └───────────┘
                    │  cliente)    │           │
                    └──────┬───────┘           │
                           │ jala costo         │ margen realizado
                           ▼                    ▼
                    ┌──────────────┐     ┌──────────────┐
                    │  RATEWARE    │     │  INTELWARE   │
                    │ (COST ENGINE)│     │ (margen,     │
                    │  56k costos  │     │  win-rate,   │
                    └──────────────┘     │  pricing)    │
                                         └──────────────┘
```

- **Rateware deja de ser el producto y pasa a ser el motor de costo** que alimenta cada cotización.
- **Quoteware es el nuevo producto estrella** (el que hoy no existe) — la entrada comercial.
- **Bidware se subordina**: se dispara *después* de ganar, para cubrir la carga (ya tienes el motor).
- **Intelware por fin analiza dinero** (margen, rentabilidad, precio) y no solo costo.
- **Carrierware mide capacidad/performance**, no completitud.

---

## 6. Roadmap recomendado (secuenciado por retorno)

**Fase 0 — Higiene (1 sprint):** cortar tablas muertas (`rates`,`rfx`,`lanes`,`book_versions`), consolidar el modelo RFx, resolver las 3 identidades de owner, agregar vigencia a las tarifas. *Deja la base limpia para construir venta.*

**Fase 1 — El acto comercial (el desbloqueo):** Customer CRM mínimo + **Quote builder** (lane → costo Rateware → margen → precio → PDF/link de cotización → ganar/perder). *Esto convierte el producto.*

**Fase 2 — Cerrar el loop:** carga ganada → cubrir con carrier (reusar Bid Room) → margen realizado. Win/loss + pipeline comercial.

**Fase 3 — Inteligencia comercial:** Intelware sobre márgenes: precio sugerido por lane, rentabilidad por cliente, alertas de tarifa vencida vs cotización activa.

**Fase 4 — Escala SaaS:** RBAC (vendedor/gerente), multi-org real, onboarding comercial.

---

## 7. Lo que NO haría

- No expandir Bid Room como producto independiente (2 usos en la historia).
- No invertir en Adminware/RBAC todavía (no hay roles comerciales que separar aún).
- No seguir midiendo "completitud de perfil" de vendors como métrica estrella.
- No tratar Rateware como el destino final del usuario — es el motor, no el producto.

**La pregunta que ordena todo:** *¿esta feature ayuda a cotizar, ganar y proteger margen con el cliente?* Si no, es operativo, y tú dijiste: más comercial que operativo.
