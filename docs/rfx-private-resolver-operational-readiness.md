# RFx private resolver operational readiness

Sprint 9.7 prepares operational controls without deploying or approving the
private resolver. `rfx-private-resolver-controls.v1` remains a local candidate.

## Durable rate limit

- Scope: SHA-256 of issuer + key ID + carrier organization ID.
- Stored scope: hash only; no raw organization, carrier, lane or request data.
- Window: one minute.
- Candidate limit: 30 newly claimed requests per minute per scope.
- Successful exact replay: returned from the ledger without consuming a second
  rate-limit slot.
- Denied new request: terminal `PRIVATE_RESOLVER_RATE_LIMITED`; private
  invitation lookup is not executed.
- Window detail retention: 24 hours, purged only by the explicit maintenance
  RPC.

The database test launches 40 concurrent checks and requires exactly 30 allowed
and 10 denied. `anon` and `authenticated` cannot read windows or execute control
RPCs. `service_role` can call the security-definer functions but receives only
aggregate readiness evidence.

## Secret custody gate

Expected server-side values:

- `RATEWARE_PRIVATE_RESOLVER_SHARED_SECRET`
- `RATEWARE_PRIVATE_RESOLVER_KEY_ID`
- `RATEWARE_SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`

Before any deployment, the owner must prove that the HMAC secret has at least
32 unpredictable bytes, the key ID identifies the active rotation, and the
database secret exists only in the Edge Function secret store. Values must not
appear in Git, browser code, logs, tickets or release evidence. This sprint does
not create, read, rotate or transmit a real secret.

## Network and monitoring gates

Provider/gateway controls remain external dependencies. Production requires a
documented service-to-service ingress rule, abuse/rate-limit ownership and an
approved response path for 401, 409, 429, 5xx and expired-processing alerts.

`get_rfx_private_resolver_operational_readiness()` exposes only:

- current window count;
- requests and denials over 24 hours;
- windows eligible for purge;
- configured rate-limit values;
- boolean release gates.

It exposes no request, organization, carrier, lane, invitation, quote, body,
credential or secret value.

## Kill switch and rollback rehearsal

The first rollback action is always to set
`RATEWARE_PRIVATE_RESOLVER_CANARY_ENABLED=false`. This prevents resolver work
before HMAC verification, ledger claim, rate limiting or invitation lookup.

The release owner must then:

1. confirm the endpoint returns `CANARY_EXECUTION_DISABLED`;
2. stop any future scheduler job without deleting ledger evidence;
3. preserve aggregate health and deployment identifiers for incident review;
4. restore the previously approved Edge Function version;
5. reconcile migration history before any database rollback;
6. re-enable only after secret, network, monitoring and owner approval gates
   are reconfirmed.

The new database objects are additive. An incident rollback must disable the
function first; it must not drop ledger, tombstone or rate-limit tables while
requests may still be in flight.

## Current readiness

- Rate limiting: verified locally.
- Secret custody: not verified.
- Network controls: not verified.
- Monitoring owner: not assigned.
- Rollback rehearsal: not performed against a deployed environment.
- Production approval: false.
- Release ready: false.
