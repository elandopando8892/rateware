# RFx private resolver local PostgreSQL preflight

Sprint 9.5 validates the candidate ledger against a disposable local container
using `public.ecr.aws/supabase/postgres:17.6.1.165`. It does not connect to a
Supabase project or any remote database.

Run:

```text
npm run test:release:private-resolver
```

The integration harness:

1. creates an exact, process-scoped container;
2. creates only the minimal foreign-key tables and fixture UUIDs;
3. applies the durable ledger and aggregate-health migrations;
4. launches 16 concurrent claims for one request identifier;
5. proves one winner, exact replay, altered replay, terminal failure and the
   `external_execution=false` constraint;
6. proves table and health-RPC denial for `anon` and `authenticated`;
7. proves service-role-only access and absence of sensitive columns;
8. removes the exact container in `finally`, including after failure.

Aggregate health reports only current/expired processing counts, terminal counts
for the last 24 hours, oldest processing timestamp and fixed containment flags.
It contains no carrier, lane, quote, request-body or credential data.

## Known release blocker

Retention duration and cleanup ownership remain unapproved. The health migration
therefore adds no delete function, scheduled job or invented retention period.
This candidate remains non-production until that policy and the other deployment
gates are explicitly approved.
