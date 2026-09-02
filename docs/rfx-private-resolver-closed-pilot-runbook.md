# Runbook: MARKSMAN Loads private resolver closed pilot

**Owner role:** Authorized MARKSMAN Loads ADMIN conducting the pilot

**Frequency:** Before the pilot, every 15 minutes while it is open, and immediately after closing

**Environment:** `marksman-loads-staging` only
**Production:** Not authorized

## Purpose

Operate a supervised, fixture-only resolver rehearsal while keeping live bid execution unavailable. The operator is the monitoring owner for the pilot window; production still requires a separately named human owner and approval record.

## Preconditions

- Confirm the Supabase branch is persistent, healthy, associated with the approved Git branch, and has `with_data=false`.
- Confirm direct Postgres access is restricted to the current authorized operator host. Never record the IP address in Git evidence.
- Confirm `rfx-private-resolver` is the only deployed Edge Function.
- Confirm the fixture contains one synthetic invitation and zero bids.
- Record the pilot operator and observer in the private change ticket. Do not put names, emails, keys, IP addresses, or tokens in this repository.

## Preflight

Run:

```powershell
./tools/run-rfx-private-resolver-staging-health.ps1 `
  -ParentProjectRef alqjqzqagdmcywpjtnnr `
  -BranchName marksman-loads-staging
```

Expected result: `PASS_CLOSED_PILOT_STAGING`, zero expired claims, zero failures, rate limiting enabled, production approval false, and external execution impossible.

If it fails, do not enable the canary. Disable it with:

```powershell
./tools/disable-rfx-private-resolver-staging.ps1 `
  -BranchProjectRef ilcpzfgxjrkaxmtnvzud
```

## Supervised rehearsal

The approved rehearsal script rotates the staging-only shared secret, enables the canary, performs one synthetic match, proves exact replay, rejects tampering, proves live execution is blocked, and disables the canary again. Never interrupt the script between enable and disable. If interrupted, run the disable command immediately.

## Monitoring cadence

Run the health command every 15 minutes during the pilot window. Stop the pilot when any of these conditions occurs:

- `processingExpired > 0`
- `failed24h > 0`
- the health RPC is unavailable on two consecutive checks
- any non-null bid row appears
- any function other than `rfx-private-resolver` appears
- network restrictions return `0.0.0.0/0` or `::/0`
- the canary cannot be proven disabled after rehearsal

## Rollback

1. Set `RATEWARE_PRIVATE_RESOLVER_CANARY_ENABLED=false` with the disable script.
2. Do not retry an ambiguous canary request.
3. Preserve aggregate health evidence; never export request bodies or credentials.
4. If the current operator IP changes, update the staging allowlist through the Supabase control plane. The emergency network rollback is `0.0.0.0/0` and `::/0`, but it is only for restoring administrator access and must be narrowed again before any rehearsal.
5. Escalate to the MARKSMAN Loads product owner and Rateware platform owner before resuming.

## Closeout

- Verify the canary is disabled.
- Run the health check one final time.
- Confirm zero bid rows and no external business effects.
- Record start time, end time, operator, observer, result, and rollback use in the private change ticket.

No real bid, carrier message, payment, Fleet Rocket mutation, ERP mutation, or production mutation is permitted by this runbook.
