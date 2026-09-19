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

## Remaining controlled runtime work

Apply the two additive migrations, deploy `osp-worker`, `osp-read-api` and the
UI, then execute one exact Crane association canary. Object uploads precede the
database receipt; a failed/replayed attempt can leave immutable orphan objects,
but cannot duplicate a case, Gmail row or command receipt. Reconciliation of
such unreferenced originals remains a bounded storage-maintenance follow-up.
