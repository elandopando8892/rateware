# Authorization inventory reconciliation — PR180

Base: main `18a4c0417cd60ef4618e0b66da7163166a74e9ed`.
Runtime proposal: `baea8ed46e7d8b1859bb771921eaf8a6acfcbb50`.
This increment records existing source. It does not grant permissions, deploy,
enable features, change authentication, modify customer data or change SQL ACLs.

## Reviewed inventory

The unchanged scanner discovers 493 active surfaces; the old contract has 474
rows, including two intentionally removed RPCs, and expects 472 active surfaces.
Seven existing human actions and fourteen internal SQL functions were missing.
The static increment adds exactly these 21 rows and the corresponding count
deltas (7 Edge/Rateware, 14 PostgreSQL). The two historical removals remain.

The seven human actions remain `pending_human_approval`:

| Action | Classification and reviewed boundary |
| --- | --- |
| associate_whatsapp_reply | Write: server-derived owner/actor, exact review identity, stale-review checks, owner-scoped locks and audit. |
| review_whatsapp_reply_association | Read: owner-scoped receipt/candidate preview; no association commit. |
| check_gmail_connection | Write: owned mailbox/profile check may renew the existing OAuth credential; never sends mail. |
| verify_outreach_gmail_message | Write: owned event/message/mailbox plus stored receipt; minimal provider GET may renew an existing credential; never sends mail. |
| get_carrier_provider_advisory | Read: verified identity/workspace agreement, server-resolved canonical tenant and scoped vendor/provider/document reads. |
| get_markos_bid_room_snapshot | Read: POST-only owned event, bounded allowlisted projection, private no-store, no mutation or error audit write. |
| get_published_carrier_classification | Read: verified organization equals workspace; fixed published-classification RPC; body cannot choose organization. |

The fourteen SQL rows remain `internal_only`. Source review covers:

- WhatsApp association/review/candidates: owner-scoped receipt, connection,
  event and vendor joins; association locks and exact evidence; phone helper is pure.
- Outreach approval/evidence triggers: identity and approval/attempt locking;
  delivery-state helper is a pure projection over input arguments.
- Bounce resolution: owner/operation lock, suppression/vendor checks, replay
  receipt and changed-state rejection.
- RFx handoff: owned event lock, optimistic fingerprint, exact plan/table/column
  allowlists, same-owner staging/vendor checks, transactional receipt and replay.
  Inner hash/insert/fence helpers are postgres-only, not browser endpoints.

A read-only `pg_proc`/ACL observation of the existing production catalog confirmed
no PUBLIC, anon or authenticated execution grants on these 14 functions.
Eleven allow service_role; handoff hash/insert/event-fence are postgres-only.
This is catalog evidence, not a replay certification or a new approval of runtime
authorization. No GRANT, REVOKE or SQL body changes are included here.

`save_rfx_lane_conditions` already proposes `rfx.manage`, like the other RFx
manage actions, but had operation `update`. Its metadata now says `manage`;
the permission key, pending decision, resource, access, exposure and tenant
classification remain unchanged. No executable policy is changed.

## Deliberately unresolved gates

Do not refresh all observed fingerprints mechanically. The previously measured
main debt includes 293 authorization-envelope mismatches; the runtime proposal
adds 26 shared-envelope mismatches and two direct-source mismatches.
The increment does not bless unrelated baseline source/dependency deltas.

The two direct-source changes introduced by PR180 are reviewed separately:
`list_rfx_detail` no longer repairs coverage while reading, and both normal and
tracking-only `list_outreach_messages` reads opt out of legacy-token persistence.
The prior 18 integrated and 36 handler regression cases cover these boundaries.
Their two static source hashes are refreshed. The 26 `rfx-bid-api` envelopes are
also refreshed for the shared role-module reconciliation: the tested matrix
(319 action names, 34 body variants, four domains) preserves v347 classifications
and every QuoteDesk/current-main classification. The rfx function source itself
is unchanged. These 28 owned deltas do not approve unrelated baseline drift.

Five inline actions remain statically undetermined. Their query-client provenance
passes through a dependency-injected client factory and an audit-context binder.
The scanner therefore cannot prove the returned callback receiver to be an array.
Changing a TypeScript annotation or labelling the handler manually would not prove
the runtime value. Keep the conservative gate blocking until the source/analysis
change has an independent regression test. The bounce-replacement action also
needs source attribution review: the heuristic currently selects `tryWriteAuditLog`
rather than the complete inline business operation. Do not certify that helper's
fingerprint as if it covered the full action.

## Isolated replay evidence

GitHub Actions diagnostic run
https://github.com/elandopando8892/rateware/actions/runs/41009594126
replayed the exact migration prefix before
`20261007204842_outreach_pending_delivery_projection.sql` on PostgreSQL 17.6.
It completed successfully, stopped the isolated stack and verified exact restoration
of every temporarily held migration. It did not connect to production or use local Docker.

| Function | Committed-prefix MD5 | October-7 guard MD5 |
| --- | --- | --- |
| tracking_page | 1aebae34b0896c0c23b5a0454be80e33 | 90b7e462d575e17a75b3274e46ca0e83 |
| tracking_state_sql | b29d37b7d58ee6cb534e6a4c2c8ac1cc | same |
| tracking_summary | 9ab00002d1bfa3e0019daa9facdb44ce | same |

The page definition exactly reconstructs from the committed August-3 scope-array
migration, including its PostgreSQL canonical header. Tested CRLF variants do not
explain the expected guard hash.

A subsequent bounded, read-only query of the production migration ledger recovered
the exact recorded statement for version `20260803013648`,
`optimize_outreach_tracking_scope_arrays`. Its function body reconstructs the
expected `90b7e462d575e17a75b3274e46ca0e83` definition exactly. Two `translate`
string literals had been normalized in Git but retain their historical encoding
in the recorded migration. This is a recorded-source mismatch, not evidence that
PostgreSQL changed its parser or that an unknown state should be accepted.

The correction restores only those two string literals in the August migration
to the exact recorded values, preserving the file's other bytes and timestamp.
The October guard, its accepted MD5, all SQL grants and the final function
definitions remain unchanged. This intentionally reproduces historical source;
it is not an accent-search improvement or a production migration execution.
No migration is added, removed, renamed, reapplied or marked as applied.

`tests/outreach-replay-precondition.test.mjs` locks the reconstructed PostgreSQL
17.6 precondition to the unchanged guard and rejects modified function bodies.
The real isolated integration replay must still certify the complete chain.

The temporary diagnostic workflow is removed after collecting this evidence to
avoid running another stack on every PR synchronization. The diagnostic tool stays
restricted to ephemeral GitHub Actions runners and prints no local stack keys.

## Verification and restoration

Local validation against the captured unchanged source inventory finds all 21
new rows, matching count deltas and compatible permission metadata. Remaining
source/envelope/handler errors stay blocking. Full fresh CI must still run.
Negative checks must reject an unknown surface, a source-fingerprint change and
an unreviewed permission-decision change.

Revert the inventory reconciliation commit to restore the previous contract;
it changes no runtime state, customer data or SQL grants. The historical-source
correction is a separate commit: reverting it restores the two Git literals and
the previously failing clean-replay precondition. Neither revert executes SQL.
The two runtime fixes from the earlier PR commit remain separately reviewable.
