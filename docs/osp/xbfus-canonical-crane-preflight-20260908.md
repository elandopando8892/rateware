# XBFUS canonical publication and Crane preflight

The original Operating Authority asset has effective_date and expiration_date
NULL. Its file_sha256 matches the inspected source. An initial diagnostic used
a nonexistent status column; it failed without writes. Actual asset columns
were then inspected rather than treating guessed JSON keys as evidence.

Official corroboration opened directly in the browser on 2026-09-08:
https://safer.fmcsa.dot.gov/query.asp?query_type=queryCarrierSnapshot&searchtype=ANY&query_param=USDOT&query_string=4483382

The live SAFER page states data as of 09/07/2026: XBFREIGHT SYSTEMS LLC,
USDOT 4483382 active, MC-1771165, authorized broker of property except household
goods. Search-index content had an older July date and was not used as current
proof. This corroboration is not insurance coverage proof and does not grant
evergreen currentness to the undated original document. Recheck when needed.

Authenticated Sales UI displayed the complete approved r7 batch: three new
values and no excluded fields. Confirmed the exact visible batch and clicked
Publish once. Read-back confirms exactly three current XBFUS facts:
legal_name = XBFREIGHT SYSTEMS LLC, mc_number = 1771165,
broker_authority_status = ACTIVE. Each source_review_id remains
cb9fd68d-ea0d-44eb-889d-f8807335142c.

Crane case f2fa004f-d674-446c-80ca-e929cce75b51 now visibly offers XBFUS with
three reviewed facts. It still blocks binding and assembly behind seven open
decisions: incorporation, submission channel/recipient, signer/placement,
template-vs-incorporation dates, conditional VAT, insurance status and limit.
Do not choose XBFMX merely because it is the default selection. No decision or
binding was saved on Crane. No package, signature, email or webhook was executed.
No historical Salzillo mutation. Full closure remains unproven.
