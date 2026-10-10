# steel-intake-api

Edge Function servidor a servidor por la que **The Steel Marketplace** publica oportunidades spot en
el Bid Room de Rateware y consulta el directorio de carriers. Implementa los contratos
`steel.freight-request.v1` y `rateware.carrier-directory.v1` (sección 2 de
`steel-marketplace/docs/contracts/README.md`). No pasa por el dispatcher `rateware-api`.

**No invita carriers.** Crea el evento y su lane; un operador de Rateware decide a quién invitar.

## Variables (secrets de la función)

| Variable | Uso |
| --- | --- |
| `STEEL_INTAKE_SECRET_SHA256` | SHA-256 hex del secreto que envía el marketplace. Sin ella toda llamada responde `503 intake_not_configured`. El secreto en claro nunca se guarda en Rateware. |
| `STEEL_INTAKE_ORGANIZATION_ID` | Workspace (organización) dueño de los eventos. Debe existir en `workspace_registry`. |
| `STEEL_INTAKE_OWNER_EMAIL` | Identidad que actúa (`actor_email` del audit log). Debe ser alias del workspace en `workspace_identity_aliases`. |
| `STEEL_INTAKE_CLIENT_ID` | Opcional. Nombre lógico del cliente en logs (default `steel-marketplace`). |
| `SUPABASE_URL`, `RATEWARE_SUPABASE_SERVICE_ROLE_KEY` | Cliente service role, igual que las demás funciones. |

Las filas se guardan con `owner_email = workspace_registry.canonical_owner_key` (p. ej. `org:<id>`),
`organization_id = STEEL_INTAKE_ORGANIZATION_ID` y `owner_user_id = canonical_owner_user_id`: es la
llave con la que el Bid Room del workspace las ve. Si la organización o el alias no existen, la
función responde `503 intake_workspace_not_configured`.

## Contrato

`POST /functions/v1/steel-intake-api` con `Authorization: Bearer <STEEL_INTAKE_SECRET>`,
`Content-Type: application/json` y `X-Request-Id` (se devuelve en la respuesta). Cuerpo ≤ 32 KB.

| `action` | Efecto |
| --- | --- |
| `publish_spot_opportunity` | Crea `rfx_events` (`event_type='spot'`, `status='open'`, `bid_visibility_mode='private'`, `customer='The Steel Marketplace'`, `rfx_id='STEEL-<order_number>-<4 hex del shipment>'`) y una `rfx_lanes` (`weekly_volume = ceil(weight_kg / 22000)` camiones; peso, mercancía, recolección y notas en `notes`). `201` con receipt; replay `200` con `replayed: true`. |
| `get_spot_status` | Sólo eventos marcados en `steel_intake_events`. Ofertas = `rfx_lane_vendors` con `bid_rate` (excluye `withdrawn`, `declined`, `archived`); adjudicación = `award_role = 'primary'` (lo que escribe `rateware_award_rfx_lane_vendor`). |
| `cancel_spot_opportunity` | `status = 'archived'` con el motivo en `notes`. Idempotente; si ya estaba archivado no lo toca (`already_archived: true`). `409 spot_already_awarded` si hay adjudicación primaria. |
| `list_carrier_directory` | Vendors del workspace con `status='active'` y `base_stage <> 'archived'`: `{vendor_id, name, domain, status, tags}`, sin correos ni teléfonos. `limit` 1–200 (default 50), `offset` ≤ 10000, `search` opcional sobre nombre, razón social y dominio. |

Idempotencia: `request_hash = sha256(JSON canónico del cuerpo completo)` — llaves ordenadas
recursivamente, sin espacios, arreglos en orden. Misma llave y mismo hash devuelve la respuesta
guardada; otra llave igual con otro hash (u otra acción) responde `409 idempotency_conflict`.

Errores: `{ "error": "<codigo>", "message": "..." }` — `400 invalid_payload | invalid_json |
unsupported_contract | unknown_action | invalid_limit`, `401 unauthorized`, `404 spot_not_found`,
`405`, `409 idempotency_conflict | spot_already_awarded`, `413 payload_too_large`, `503`.

## Datos

Migración `supabase/migrations/20261010195538_steel_intake.sql`:

- `steel_intake_receipts` (receipt por `idempotency_key`) y `steel_intake_events` (marca del
  `rfx_event` creado, con `external_ref`). RLS activa sin políticas; sin acceso para `anon` ni
  `authenticated`; el service role sólo puede `select`/`insert` (receipts inmutables).
- `steel_intake_publish_spot(...)` y `steel_intake_cancel_spot(...)`: escriben evento, lane, marca,
  receipt y `saas_audit_log` en una sola transacción, serializadas por llave con
  `pg_advisory_xact_lock`. Sólo `service_role` puede ejecutarlas.

Pendiente conocido: el evento nace sin `source_rfx_process_project_id` ni Ratebook. El Bid Room los
crea en la primera edición del evento o al sincronizar Ratebooks, igual que con cualquier evento sin
proyecto.

## Pruebas

```bash
npm run test:steel-intake   # node --test tests/steel-intake-api.test.mjs + deno check de la función
```

## Despliegue (no automático)

1. Aplicar la migración con el flujo normal de migraciones de `rateware-prod`.
2. Guardar secrets: `npx supabase@latest secrets set --project-ref <ref> STEEL_INTAKE_SECRET_SHA256=<hex> STEEL_INTAKE_ORGANIZATION_ID=<org> STEEL_INTAKE_OWNER_EMAIL=<email>`.
   El hex se obtiene con `printf %s "$STEEL_INTAKE_SECRET" | sha256sum`.
3. `npx supabase@latest functions deploy steel-intake-api --project-ref <ref> --no-verify-jwt`
   (`supabase/config.toml` ya declara `verify_jwt = false`).
4. Las acciones quedan `pending_human_approval` en el contrato de acciones hasta el primer
   intercambio observado con receipt.
