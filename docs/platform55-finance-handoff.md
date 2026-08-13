# Platform 55 Sprint 7 — Finance handoff

The Rateware Finance view can prepare a local JSON handoff for MARKSMAN ERP from selected approved Rateware rows.

This handoff is deliberately observation-only. It never calls MARKSMAN, creates an invoice, creates a payment, records an accounting entry, changes a Rateware rate, or uses carrier banking details. `manual_entry_required` remains true and all financial approval flags remain false.

Each rate requires a Rateware row reference, source-upload reference, vendor reference and name, origin, destination, commercial model, currency, and a positive all-in rate. Incomplete rows remain in the downloaded artifact with `status: "blocked"` and explicit `missing_fields`; no values are invented.

The artifact preserves commercial context and the source-upload reference (plus the source filename when it is available) so a finance operator can complete the controlled MARKSMAN workflow. If a selected row is no longer available on the approved surface when it is re-read, it remains in the artifact as blocked. MARKSMAN ERP remains the accounting system of record and human approval remains mandatory.
