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

These are local regression results, not proof of recovered production data or
product completion. Pending: publish the API fix, verify its deployed source,
and recover the failed review through an explicit auditable workflow before
any profile fact promotion. Gmail remains a separate reconnection dependency.
