# Exact profile correction JSON binding

The authenticated preview correction for review
`cb9fd68d-ea0d-44eb-889d-f8807335142c` exposed a real driver-binding defect:
the legal-name string was stored with an extra JSON string layer. The review
remains in review; this attempt was not promoted or finalized. Do not overwrite
the decided field or remove the failed evidence to repair it.

Root cause: postgres 3.4.7 infers a JSONB parameter for `::jsonb` and serializes
the already serialized input. Bind as `::text::jsonb`, matching the existing
promotion command. No schema or permission change is required.

Validation on 2026-09-08:
- Document API suite: 31 tests and 13 steps passed; 3 opt-in native tests ignored.
- Separately opted-in PostgreSQL 17.11 test: 1 passed. Seven synthetic values
  (plain/quoted/Unicode strings, number, boolean, object, array) reproduce the
  old double serialization and round-trip exactly with the fixed binding.
  SQL NULL remains NULL. Only SELECT statements execute in this probe.
- Initial native probe failed with connection refused because the rehearsal
  server started on its default port. Restarted the exact local cluster on
  loopback 55472; the probe passed and the server was stopped afterward.

## Production publication

`feb45bb4fe3fedb4eb64efd4f83cac57cf9f1da4` was pushed to the private OSP
closeout branch. Deployed only `osp-document-api` with the existing API bundler.
Version 164 was ACTIVE with SHA
`4bea9142b75d244356fa2b0e9140a31b772532ed3ffa5c53840e49585d9415b7`.
Version 165 is ACTIVE with SHA
`3c61b6baf975c6c4e0e45f96e5a920ccad818926fdc73753a4bea628fa859b44`.
Retrieved both deployed source sets: their only changed file is
`postgres-document-store.ts`; the new JSON text cast is present. Auth and
verify_jwt configuration are unchanged. No migration or worker deployment.

The authenticated preview, signed in as Sales, loaded the corporate profile
and all four quarterly-document categories after deployment. This is a read
smoke, not a successful production correction-write demonstration.

Read-only database inspection confirms the affected review is still revision 3,
in_review, with legal_name corrected and the other two fields pending. The first
diagnostic query used a nonexistent field_key column and failed without writes;
the corrected field_code query returned this state. No decisions were made.

Recovery is still pending. The existing field command accepts only pending
fields; direct replacement of the decided value would destroy provenance.
The failed decision must remain auditable before any profile fact promotion.
Gmail remains a separate reconnection dependency. Product completion is unproven.
