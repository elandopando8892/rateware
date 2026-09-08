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
