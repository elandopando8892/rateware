# Loads Sprint 3 — private invitation send-evidence backend gate

Status: code prepared, NOT activated. Production acceptance remains NO-GO.

## Product outcome and boundaries

The compact carrier book in MARKSMAN Loads must not treat a drafted route or an
authorized send as a delivered invitation. Bidware retains its invitation and
quoting experience; Rateware remains the source backend. This increment changes
only the no-write `peek_invitation` projection. Ordinary `get_invitation`, public
board, bidding, sending, awards and Fleet Rocket are not changed.

Repository: Rateware; branch `codex/loads-private-send-evidence-20260930` in a
dedicated worktree, based on `origin/main` at
`3b1ef12ee4c26a902d6c84ba262ca733afa97d7b`. No work on `codex/osp360`.
Related Loads preparation: draft PR 12, commit `f4362f8`.
Recommended model: GPT-6.1 Sol, high; a focused Astra high isolation review may
precede activation, but is not a requirement for routine implementation.

## Reuse, adaptation and deferral

| Existing capability | Treatment |
| --- | --- |
| Bidware invitation generation and Rateware outreach queue | Reuse unchanged; no messages sent |
| Gmail/Meta provider IDs and existing manual-send stamps | Read server-side, never expose provider IDs |
| Rateware paged invitation sent-at reads | Adapt: owner + vendor + event + explicit invitation ID |
| `peek_invitation`, carrier projection and internal-field redaction | Reuse; filter before summary counts |
| Configured `BID_DEADLINE_UTC_OFFSET` | Project an authoritative `expires_at` for date-only deadlines |
| Ordinary Bid Room mutations / public board | No change |
| Loads private source activation / live invitation acceptance | Defer to a separately authorized gate |
| Tracking, awards, Shipment API, messages, applying production migrations | Outside this increment |

## Contract and evidence semantics

Successful peeks (full and refresh) emit:

```json
{"delivery_evidence":{"contractVersion":"rateware-private-book-sent.v1","source":"outreach_messages","sentOnly":true}}
```

Each authorized root and projected book row also has `expires_at` and a minimal
`delivery_receipt` containing `sent_at` and `basis`:

- `provider_accepted`: Gmail/email or Meta/WhatsApp with a nonblank provider ID.
  This proves recorded provider acceptance, NOT receipt/read by the carrier.
- `manual_reported`: valid manual-send timestamp and responsible owner recorded.
  This is an accountable manual report, NOT independent provider proof.

The receipt must match the invitation's owner, vendor and event and list its
explicit ID (direct or `metadata.rfx_lane_vendor_ids`). Event-level messages
without invitation IDs do not authorize every route. Future/missing timestamps,
unknown or failed delivery, bounced/suppressed messages, drafts, queued/sending
states and unaudited sent labels fail closed. Historical `failed_at` alone does
not invalidate a later successful retry. Archiving a message does not revoke the
invitation; revoking/archiving/declining the invitation does.

The root and book are limited to valid invited/viewed/responded/quoted/
bid_submitted/awarded invitations in open, unexpired events. Closed/expired
events are not offered as active opportunities. The existing book cap remains
500 invitations. If the root is outside that capped read, the full peek fails
closed instead of asserting a complete root projection. Root evidence is checked
again on the full book read. This is request-time verification, not transactional
snapshot isolation or a guarantee of instantaneous updates between requests.

Outreach reads use pages of 200, event chunks of 100 and a 25-query budget. Read
errors or saturation return sanitized HTTP 503; absent evidence/ineligible roots
return generic HTTP 404. No repair writes, token migrations or sending take place.
Successful peeks and evidence denials carry private/no-store cache headers.

## Validation and closure gates

Local validation completed:

- Node: 6 test groups PASS, including scope, accountable manual evidence, negative
  statuses, configured deadlines, pagination, chunking and saturated-budget denial.
- Deno: 13 tests PASS across peek HTTP contract, carrier payload privacy, void
  lanes, existing admin sent-at semantics and no-award contract regression.
- JS syntax and `git diff --check`: PASS.
- Full authorization validator: 449 discovered surfaces, zero errors; action
  contract regression test PASS. One pre-existing missing WhatsApp-healthcheck
  declaration warning remains, unrelated to this increment.
- All HTTP tests intercept fetch; no live credentials, sends or production writes.

Isolated database CI is required before review readiness. The workflow replays
the local Supabase stack, asserts service-role SELECT / anon denial on outreach,
seeds only synthetic invitations and receipts, exercises the actual Edge
function, checks no invitation mutations and removes the isolated stack.
Its result is not a real Bidware invitation or authenticated carrier acceptance.

First CI attempts caught two preparation gaps, not production changes:

- The receipt dependency/handler fingerprints require explicit registration in
  the effective action contract. Permission, exposure and human-approval status
  are preserved; no validator is skipped or weakened. The contract test's stale
  inventory assertions are aligned to main's existing 449 surfaces, not an added
  public API, and explicitly assert peek remains pending/read/tokenized.
- Fresh replay produced private-book grants `t|t|t|t|f|f|f`: the missing permission
  was service-role SELECT on outreach, whereas live read-only inspection reported
  it already true and anon false. Migration
  `20260930185000_grant_private_peek_outreach_read.sql` adds only that SELECT for
  reproducibility. It is prepared in Git and applied only in disposable CI, NOT
  applied to the live database. Replay ledger expectation becomes 403 migrations.

Remaining before Sprint 3 closure:

1. Review the backend diff and isolated DB CI result.
2. Adapt Loads to prefer authoritative `expires_at`, rejecting invalid provided
   values rather than silently falling back. Its current date-only fallback must
   not override a server-configured zone. Keep source flags off during adaptation.
3. Approve the specific backend release and protected Loads preview activation;
   no deploy or migration is performed by this increment.
4. Open a genuine invitation obtained through the normal Bidware channel, without
   administrative token retrieval or a new message sent merely to finish a test.
5. Verify the carrier's own book, a foreign Google identity denial, revalidation
   after account change/revocation/expiry, and no leakage or writes.
6. Record authenticated evidence and product acceptance before marking complete.

No production readiness claim, private access activation, new paid resource or
external operational effect is authorized or executed here.
