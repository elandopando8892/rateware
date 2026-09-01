# RFx private resolver local PostgreSQL preflight

Sprints 9.5 and 9.6 validate the candidate ledger against a disposable local container
using `public.ecr.aws/supabase/postgres:17.6.1.165`. It does not connect to a
Supabase project or any remote database.

Run:

```text
npm run test:release:private-resolver
```

The integration harness:

1. creates an exact, process-scoped container;
2. creates only the minimal foreign-key tables and fixture UUIDs;
3. applies the durable ledger, aggregate-health and retention-candidate migrations;
4. launches 16 concurrent claims for one request identifier;
5. proves one winner, exact replay, altered replay, terminal failure and the
   `external_execution=false` constraint;
6. proves table and health-RPC denial for `anon` and `authenticated`;
7. proves service-role-only access and absence of sensitive columns;
8. recovers an expired processing lease, compacts terminal detail and proves an
   exact tombstoned replay cannot reopen invitation lookup;
9. advances the controlled clock beyond the tombstone horizon and proves only
   eligible tombstones are purged;
10. removes the exact container in `finally`, including after failure.

Aggregate health reports only current/expired processing counts, terminal counts
for the last 24 hours, oldest processing timestamp and fixed containment flags.
It contains no carrier, lane, quote, request-body or credential data.

## Remaining release gates

The candidate policy is 90 days of sanitized terminal detail plus a 400-day
purpose-limited anti-replay tombstone. The database behavior is now tested, but
the owner has not approved production activation and no scheduler is configured.
Remote migration, cron cadence/ownership, monitoring, secret provisioning,
network/rate limiting and deployment authorization remain explicit gates.
