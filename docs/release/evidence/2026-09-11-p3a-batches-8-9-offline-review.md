# P3-A migration review — batches 8 and 9

## Scope

The next eleven chronological migrations after the verified 47-entry local
ledger were read and hash-pinned as two schema-only groups:

- Batch 8: six rate-filter functions and indexes; predecessor ledger 47.
- Batch 9: five vendor/BI functions and indexes; predecessor ledger 53.

The runner now rejects `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `COPY`,
`CALL`, grants, revokes, cron, and `net.http` in either group. The generated
local control-ledger insert is the only permitted insert in the composed SQL.

## Verification

- `node --test tests/advance-rateware-local-migrations.test.mjs
  tests/p3v6-certification-boundaries.test.mjs`: PASS, 12 tests.
- `npm run test:carrier-list-templates`: PASS, 74/74 contract tests.
- `node tests/rateware-stability.test.mjs`: PASS.
- Exact SHA-256 hashes are embedded in `tools/advance-rateware-local-migrations.mjs`.

Neither batch was applied. Docker Engine is unavailable on this host, so no
local schema state, remote project, production data, OAuth setting, invitation,
or message changed. P3-A remains open until the isolated runtime returns and
both batches pass transactional dry-run and empty-local apply verification.
