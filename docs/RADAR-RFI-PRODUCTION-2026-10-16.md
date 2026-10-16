# Radar RFI receiver: Git integration and QA acceptance

## Current deployment

Rateware `rateware-api` version 696 is active in `alqjqzqagdmcywpjtnnr`.
It preserves main `ba7125c2` Gmail verification/quota changes and adds atomic
RFI link issuance. All 21 runtime source files match this checkout after
normalizing line endings and trailing whitespace.

The exact migration `20261008180000_rfx_rfi_link_atomic.sql` was applied once
under remote history version **20261016054432**, name `rfx_rfi_link_atomic`.
Do not apply it again or use generic `db push`: reconcile that existing ledger
entry by its content, not by the local filename timestamp.

Demand Radar API 214 and frontend a7dfdff already consume this receiver.
Only `DEMAND_RADAR_SPOT_LINK_ISSUANCE_ENABLED` was activated in the preceding
release. Creating projects, Gmail switches and encryption keys were unchanged.

## Integration boundary

Existing dirty Rateware checkouts were preserved. This integration starts from
current main and records only the already deployed receiver, migration, its
scoped contract registration and regression tests. It does not import the
unrelated shared-registry reconciliation or interpret-upload changes from the
older candidate. The scoped RFI authorization fingerprint explicitly includes
main's current Gmail modules; no global fingerprints or permissions are reset.
Local historical candidate documentation remains historical, not release state.

## Verification on the integrated source

- Seven Node/PostgreSQL tests pass: concurrency, one persisted winner,
  source binding, ownership, closure, recovery and rollback.
- Deno actual-handler contract passes, including type checking, role/workspace
  denial and replay with synthetic authentication/database.
- Scoped action contract test passes for the receiver and both SQL functions.
  Its first run exposed the older dependency fingerprint; it was updated only
  for this endpoint after checking the exact current main/production sources.
- `npm run test:product` passes all 21 commands. This is the product suite,
  not a claim that every unrelated Rateware test or global registry gate passed.
- `git diff --check` passes. No frontend build or redeployment is needed.
- Full-schema rehearsal passed in the preceding release (494-table snapshot,
  10 concurrent calls/one link, ACL/RLS preserved); not rerun for this Git-only cut.

## Authorized QA, no real business operation

The existing fixture project `26d88fac-61e4-4176-bcc5-c68f7f75e20e`, titled
“QA E2 Spot fdfcea7c — no publicar ni enviar”, was used with its existing QA
lead. One link was created from that card, without email or a new project.
The form identified the synthetic company. Dallas/Laredo, one dry-van route,
test operator and explicit no-commercial-validity notes were entered; email
and telephone were left empty. Reload preserved the data.

The public form delivered the request for internal review and displayed
“Recibimos tu solicitud”. Readback confirmed one submission `submitted`,
one lane, one link, project `rfi_submitted`, and immutable Radar origin.
Submission timestamp: **2026-10-16 06:10:49.201 UTC**.
Radar readback displayed “Requerimiento recibido · pendiente de revisión” and
the submitted Dallas–Laredo route, keeping the QA lead's existing stage.
Presentation observation: that Spot summary labels the single load as
“1 cargas/semana”. This acceptance does not validate that frequency wording;
the fixture explicitly remains synthetic and not commercial demand.
No RFx event was linked, no carriers invited, no rate/capacity represented.

Other-project and other-link fingerprints remain unchanged. The complete
Radar records fingerprint also remains unchanged, including real leads and
historical Gmail receipts. QA evidence is retained, not deleted or relabeled
as commercial engagement. No bearer URL/token is stored in this repository.

The live UI and final Git receipt are recorded in the private release evidence
under `D:/andre/data/marksman-demand-radar/releases/2026-10-15-rfi/`.
