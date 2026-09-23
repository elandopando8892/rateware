# Crane exact-thread recovery — 2026-09-19

## Outcome

OSP can preserve a reviewed original Gmail relay and its amendment as one new,
tenant-scoped case. The command is exact, idempotent and outbound-disabled. A
legacy `.doc` attachment is retained in `osp-originals` as immutable evidence
with `manual_conversion_required`; it cannot enter malware-safe promotion,
extraction, package generation or signature.

## Product boundary

- The failed historical `gmail_ingest` job remains unchanged as evidence.
- The new case is created only when both Gmail IDs, the common thread, external
  sender and all outer/original EML hashes match.
- `application/msword` is admitted only to the private originals bucket. It is
  explicitly rejected if present in corporate or derived buckets.
- The case read model names the pending file and source hash. Profile binding
  and draft assembly remain blocked until a reviewed conversion is attached.
- No signature, Sales authorization, email, webhook or paid provider is called.

## Verification

- Broad worker regression: 275 passed; one stale fixture failed, was corrected
  with the required `automatic_eligible` disposition, and its end-to-end flow
  then passed.
- Exact recovery, handler, producer, claim and bucket-policy tests: 24 passed.
- Read API focused regression: 88 passed.
- UI contract: 25 passed; App routing: 23 passed; manual-conversion behavior:
  1 passed; production Vite build: 435 modules.
- Independent Terra review found two P0 gaps (missing producer/payload support
  and missing originals-bucket MIME). Both were remediated and re-tested.

## Original runtime plan, superseded below

The original plan was to apply the two additive migrations, deploy `osp-worker`,
`osp-read-api` and the UI, then execute one exact Crane association canary.
That association is now recorded below. Object uploads precede the
database receipt; a failed/replayed attempt can leave immutable orphan objects,
but cannot duplicate a case, Gmail row or command receipt. Reconciliation of
such unreferenced originals remains a bounded storage-maintenance follow-up.

## Production association — 2026-09-22

The first exact association job `8d6490fe-993a-44d8-a926-3a9e9f070247`
remains terminal with `PERMANENT_FAILURE`. Its 2026-09-19 Postgres log identified
SQLSTATE `42501`: `osp_workflow_api` attempted `SELECT ... FOR UPDATE` on
`osp_private.background_jobs`, where it has `SELECT` but intentionally lacks
`UPDATE`. The failed attempt created no case, Gmail rows or command receipt.

Commit `8a496d62` removed the unnecessary row lock on the already terminal
predecessor. Commit `80744d90` added a required recovery UUID to distinguish a
new bounded job from the immutable failed job. The latter deployed as
`osp-worker` version 236. `deno check` on the worker entrypoint passed; 28
focused handler, job, runtime and persistence tests passed.

Read-only production preflight returned the original and amendment Gmail IDs
with the same four outer/EML SHA-256 values recorded in the exact claim. The
new recovery `4ecf2604-8061-4514-88ed-0ab8d0c2e82d` ran once and returned
HTTP 200 with `processed: 1`. Job `0c381ea7-2f70-4059-b9e8-90ae6e5cf643`
completed at 2026-09-23 04:11:26 UTC, attempt 1, with no error.

Readback showed exactly one new case
`eed22bb3-1699-49d2-aae6-5f00f40bed93` in `received`, two Gmail messages,
nine attachments, one `historical_gmail_thread_associated` event and one
`gmail_thread_association_create` receipt. The eleven referenced private
storage objects were downloaded and each SHA-256 matched its persisted digest.
Outbound remained disabled; this case has zero drafts, payloads, signature
approvals, Sales authorizations and send attempts. A fresh read-only check of
the historical Salzillo case `ddbb675c-a769-4741-9b85-7d4798509913`
returned `sent`, aggregate version 16, last updated 2026-09-02 14:30:57 UTC.

QF-167 arrived as legacy `.doc`. It remains `manual_conversion_required` and
must be converted and visually reviewed before it can contribute to a complete
Crane package. The six DOCX originals are preserved but the new case has no
document promotion or request manifest yet. The old failed attempt left eleven
unreferenced immutable originals; do not delete them without a separate
reconciliation of storage references and retention policy.

The bundled Windows document runtime exposes no `soffice.exe`; no `.doc`
conversion or visual fidelity review has been performed. The OSP UI currently
shows the manual blocker but does not provide a reviewed-conversion upload
linked to this source attachment. A safe continuation requires that provenance
link and review gate before changing the blocker state. Do not substitute a
generic upload or enqueue an unrestricted worker drain to bypass the gate.
