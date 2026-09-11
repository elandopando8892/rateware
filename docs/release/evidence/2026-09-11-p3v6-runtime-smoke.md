# P3-V6 runtime smoke evidence — 2026-09-11

## Result

The existing local browser certification was rerun with JavaScript enabled and deterministic QA boundaries:

`Platform55 S6 browser certification passed: 29 routes, 42 captures, local-only and read-only.`

The run covered all 29 shell routes, representative desktop/tablet/mobile captures, command-center state captures, focus checks, accessibility names/contrast, and the explicit read-only network policy. No external requests or business mutations were permitted.

This is runtime evidence for the P3-V6 review; it does not close the P3-V6 aggregate gate. The aggregate's exact 261 route/state/viewport matrix remains explicitly `NOT_CERTIFIED`, and the normal geometry-baseline run still reports existing drift on `business-intelligence.html`. The successful smoke used baseline mode to isolate runtime behavior from that pre-existing geometry mismatch.

## Related corrections

- MARKSMAN orange actions now use charcoal text where white text failed normal-size WCAG contrast.
- Provider communication and onboarding active filters use explicit MARKSMAN surfaces instead of the inherited cobalt button treatment.
- The public customer RFI brand mark remains white on the charcoal public header.
- Procurement QA fixtures now expose the current carrier-list-template and Supabase Auth APIs in read-only mode, so Carrier Fit and Carrier CRM can be exercised without creating records.

No invitations, emails, WhatsApp messages, bids, or production records were created.
