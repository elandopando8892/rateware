# MARKSMAN Loads private resolver — closed pilot readiness

Beta 10.4 prepares the existing fixture-only staging branch for a supervised closed pilot. It does not expose another carrier-facing feature and does not authorize production.

Direct Postgres access is no longer open to the internet. The branch accepts direct database connections only from the current authorized operator host; the CIDR is intentionally omitted from repository evidence. The resolver continues to use Supabase HTTPS APIs, so its staging canary passed after the restriction was applied.

Monitoring is assigned to the authorized MARKSMAN Loads ADMIN conducting the pilot. The runbook requires that operator and a second observer to be recorded in a private change ticket, then requires aggregate health checks before the pilot, every 15 minutes while open, and after closeout. A separately named human owner is still required before production.

The post-restriction rehearsal matched one synthetic invitation, returned the same terminal result on replay, rejected tampering, blocked the live action, created zero bids, and finished with the canary disabled. The final health check reported no current or expired work, no failures, no denied requests, no stored request body or credential material, and no external execution possibility.

The database security advisor was executed and returned 43 existing warning records across the inherited Rateware schema. This sprint does not claim those historical findings are resolved; it only records that the private-resolver pilot controls passed.

The decision is `CLOSED_PILOT_TECHNICALLY_READY_PRODUCTION_BLOCKED`. A supervised fixture-only session may follow the runbook. Real bids, external communications, Fleet Rocket, ERP, payments, and production remain prohibited.
