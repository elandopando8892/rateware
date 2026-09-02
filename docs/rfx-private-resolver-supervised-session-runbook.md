# Runbook: MARKSMAN Loads supervised fixture session

**Owner role:** Authorized MARKSMAN Loads ADMIN

**Observer:** A second named human for an actual pilot; automated evidence only for the Beta 10.5 technical rehearsal

**Environment:** `marksman-loads-staging` only

**Production:** Not authorized

## Purpose

Run a bounded, fixture-only private-resolution session with explicit preflight, canary, postflight and closeout checkpoints. Beta 10.5 proves the technical procedure; it does not claim that two humans supervised an actual carrier pilot.

## Prerequisites

- The branch is persistent, `with_data=false`, and reports `FUNCTIONS_DEPLOYED`.
- `rfx-private-resolver` is the only active Edge Function.
- Direct Postgres access is restricted to the current authorized operator host; no CIDR is copied into evidence.
- The fixture contains one synthetic invitation and zero bid values.
- For an actual human pilot, record a named operator, a different named observer, start/end time and rollback use in a private change ticket. That record does not belong in Git.

## Technical rehearsal

Run from the Rateware worktree:

```powershell
./tools/run-rfx-private-resolver-supervised-session.ps1 `
  -ParentProjectRef alqjqzqagdmcywpjtnnr `
  -BranchName marksman-loads-staging `
  -BranchProjectRef ilcpzfgxjrkaxmtnvzud
```

Expected result: four passed checkpoints, a synthetic match, exact replay, tampering rejected, live execution blocked, zero bid rows, and `finalCanaryState=DISABLED`.

If any step fails, the runner invokes the disable script before returning an error. Do not retry an ambiguous canary request.

## Actual human pilot gate

Do not describe a session as human-supervised until all items are true:

- a private change ticket exists;
- one named operator and a different named observer accepted responsibility;
- both confirmed the fixture-only scope;
- monitoring is performed before opening, every 15 minutes, and at closeout;
- a stop decision can be taken immediately without waiting for approval;
- production and every real business effect remain disabled.

## Stop triggers

Stop immediately for expired processing, any failure in the last 24 hours, any non-null bid value, another deployed function, an open database CIDR, an unavailable health check, or an uncertain canary state.

## Rollback

1. Run `disable-rfx-private-resolver-staging.ps1`.
2. Do not replay an ambiguous request.
3. Preserve only aggregate evidence.
4. Escalate to the MARKSMAN Loads product owner and Rateware platform owner.
5. Resume only after the failed checkpoint is explained and a new bounded session is authorized.

No real bid, carrier communication, payment, Fleet Rocket mutation, ERP mutation or production mutation is permitted.
