# Crane original and persisted decision review

Read-only verification on 2026-09-08; no signature, delivery, binding, worker
execution or historical Salzillo change.

## Persisted review

Shared database review `926f421f-bc52-488f-97be-7359dc94dda9`, version 1,
case `f2fa004f-d674-446c-80ca-e929cce75b51`, saved at
2026-09-08 23:30:55.797184 UTC. Status `needs_external_clarification`, seven
decisions. Authenticated Sales UI independently displays case version 2,
AWAITING CLARIFICATION, three answered and four open decisions. Recipient
instruction is preserved; it is not an authorization to send.

## Original PDF inspected

Source: `H:/Mi unidad/Socios/Ventas y Marketing/Commercial/Customers/Crane/CWW-QF-147 Vendor Application Form.pdf`.
SHA256 `b837ffbf1d751e43a9c63879921a2f049125ba04d2744fd98694b1d32e78dd26`
matches shared document version `85955a14-5622-4257-943b-6b23826e0552`.
Both pages were rendered and visually inspected, without editing the source.

- No applicant signature box or explicit applicant signing instruction appears
  on these two pages. Page 2 APPROVER/REVIEWER/AUTHOR and VERSION HISTORY are
  Crane template governance, not XBF signature placement.
- Do not convert that absence into a waiver of a signature requested elsewhere:
  the preserved email and DOCX still need cross-source verification.
- Incorporation entry incorrectly contains 2026; template effective/revision
  dates describe the template, not the company's incorporation.
- Existing form values are supplied source content, not newly verified canonical
  facts. In particular, banking details must not be silently replaced or reused
  from an older conversational profile.
- Page 2 insurance-limit row overlays the branded header in the source. Final
  output must prove legibility, not merely preserve this rendering defect.

## Remaining work

Cross-check the exact DOCX and email to determine whether applicant signature is
actually required. Confirm VAT applicability. COI and coverage limits remain
pending user/provider evidence; pending certificate does not mean no insurance.
Other files located alongside this form are not automatically requirements of
this case and have not been imported or processed.

Package remains unassembled and blocked. This is evidence review, not product
closure or a completed Crane package.

## Cross-source scope correction

Live `gmail_messages` row `7eb33378-650a-41bb-a4a3-6e287efc1c89` is a
controlled internal canary message, not the original carrier email. Its safe
body describes an internal adaptable customer-setup canary and prohibits
reply/external action. It contains no applicant signing instruction. This
proves processing of real source files in a controlled case, NOT coverage of
the complete original carrier request. Obtain the preserved original request
before treating this as full business end-to-end evidence.

The adjacent original DOCX SHA256
`c334c907572bf009f6193e0c43f8eb41b9baa55ac9e5311538730e65ca3745ee`
matches case document version `7cd7a96f-2f0a-4695-9460-75187fc750e6`.
Bundled `render_docx.py` failed before conversion because `soffice.exe` was not
found on PATH. No DOCX visual PASS, edit or signature inference is asserted.
