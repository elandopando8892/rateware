# Crane original request reconciliation

Read-only Gmail connector access verified as Sales on 2026-09-08. No mailbox
mutation, reconnect, import, worker execution or outgoing action.

## Authoritative messages

- Original: Gmail `19ce39a524507c5b`, 2026-03-12 19:50:25 UTC,
  subject `Documentacion de alta para proveedores`, from Marco Circosta.
- Amendment: Gmail `19d211f61ba8e86a`, 2026-03-24 18:32:59 UTC,
  same thread. Explicitly replaces QF-168 Non-Carrier with QF-167 Line Haul
  Carrier. Preserve both and link the supersession; do not discard history.
- Both full text/plain bodies were inspected. Connector text contains charset
  mojibake; preserve raw source before any normalization on import.

## Required package from these messages

| Requirement | Current controlled case coverage |
| --- | --- |
| QF-147 Vendor Application | PDF/DOCX present, not completed |
| QF-050 FCPA Certificate | Not represented |
| QF-248 Conflict of Interest | Not represented |
| QF-167 Vendor Agreement | Not represented; supersedes QF-168 |
| QF-169 NDA and Non-Solicitation | Not represented |
| QF-154 Supply Chain Security Assessment | Not represented |
| RFC copy | Not represented |
| Constancia de Situacion Fiscal | Not represented |

Do not infer signature method or legal acceptance from this email list; inspect
each applicable original. The email requests Mexican tax documents while the
controlled QF-147 targets XBFUS. Entity/applicability must be reconciled; never
silently substitute EIN for RFC or bind XBFMX just to pass the gate.

Original emailed QF-147 DOCX is 167154 bytes; the local/case DOCX is 158862.
They are not byte-identical. Local filled copies cannot be presented as the
untouched carrier attachment. Retrieve and preserve the original attachment
through the governed intake before assembly.

## Release consequence

Case f2fa004f-d674-446c-80ca-e929cce75b51 remains a restricted single-form
canary, not full original request coverage. Build the real request contract
from original plus amendment in an isolated controlled flow, with attachment
provenance, supersession and all eight dispositions. Do not overwrite the
existing canary or claim completeness from its seven decision items.

This closes source discovery, not OSP production acceptance. No legal document
was signed or accepted and no package was sent.

## Verified implementation gap

`osp-worker/postgres-request-manifest-source.ts` loads case email evidence with
`order by received_at desc, id desc limit 1`; the source contract has a singular
`message`. Thus a later amendment can hide earlier independent requirements.
The historical importer imports one selected message per action, not a reviewed
thread bundle. This is not yet a supported full-thread reconciliation path.

Required next implementation: bounded ordered message sources retaining each
message ID/hash, original and amendment attachment identities, explicit reviewed
supersession, and invalidation of downstream review when evidence changes.
Regression must prove the five unaffected forms and fiscal requirements survive
the QF-168 -> QF-167 amendment. A newest-message-only test or text concatenation
without source identities is insufficient. Existing single-message compatibility
and protected historical cases must remain unchanged.

Entity clarification requested from XBF: XBFUS, XBFMX or both. No automatic
answer or fiscal document substitution has been made.
