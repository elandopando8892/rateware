# Provider Service 360 — Build 5

## Communications Inbox

**Branch:** `provider-service-build5-communications`  
**Base:** `provider-service-build4-cases`  
**Status:** implementation only; no live mailbox connected

Build 5 creates the channel-neutral communication layer that will later receive `carriers@xbfreight.com`. Gmail is a source, not the system of record.

```text
external channel
  → communication thread
      → idempotent messages
      → attachment metadata
      → provider match candidates
      → Provider Service case links
      → Document Registry links
      → communication events
```

## Hard rules

1. A new email never creates or merges a vendor by itself.
2. `existing_thread`, `exact_email`, and `verified_contact` may auto-match only when the evidence is deterministic and unambiguous.
3. Domain, legal name, MC, DOT, EIN, RFC, phone and address are candidate evidence that remains reviewable.
4. An unmatched thread is a valid durable state.
5. Every thread and message is scoped to one XBF legal entity before it can touch provider data.
6. Attachments become Provider Service documents only through an explicit link to a Build 3 `document_version_id`.
7. A communication can link to a Build 4 case only after the thread is matched to the same provider relationship and legal entity.
8. Message ingestion is idempotent by channel + mailbox + external message ID.
9. Direct browser/service-role writes remain closed until audited commands are introduced.

## Inbox queues

The initial deterministic queues are:

```text
unmatched
needs_review
needs_reply
waiting_provider
waiting_xbf
waiting_external
active
resolved
```

## Live Gmail boundary

This build does **not** store OAuth credentials, call Gmail, register push notifications, send messages, or authorize `carriers@xbfreight.com`. Those runtime capabilities are intentionally deferred until the Provider Service Agent and approval boundaries exist.

## Validation target

Focused tests cover:

- email normalization;
- deterministic versus soft matching evidence;
- ambiguous-match rejection;
- reply-state calculation;
- thread and message idempotency;
- attachment-to-document relationship scope;
- case-link relationship scope;
- fail-closed direct writes.

Full clean migration replay remains blocked by GitHub issue #19 and therefore remains a pre-merge gate for Builds 1–5.

## Next build

Build 6 — Provider Service Agent will assemble context from relationship, activation, documents, cases and communications, then produce bounded actions such as classify, propose match, extract requirements, prepare a form, draft a reply and request approval. Live Gmail takeover will still remain disabled until those action contracts are reviewed.
