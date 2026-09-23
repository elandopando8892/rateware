# Carrier rate sheet intake

The Holding website sends a signed `submit_carrier_rate_sheet` request to
`website-lead-intake`. The receiver accepts only CSV, XLS and XLSX files up to
1.5 MB, retains the original in the private `website-carrier-rate-sheets`
bucket, records a receipt in `website_lead_intakes`, and notifies the Holding
commercial recipient with a seven-day private download link. Duplicate
requests use the existing idempotency key and notification claim workflow.

This intake does **not** import rates or promote a carrier. Commercial staff
review the source file before any Rateware staging or operational use.

Activation order:

1. Apply `20260923120000_website_carrier_rate_sheets.sql` and verify the bucket
   is private with a 1.5 MB object limit.
2. Deploy this revision of `website-lead-intake` without changing the existing
   website lead signing key or Gmail connection.
3. Verify one controlled carrier submission produces a stored original, a
   single receipt, and a single sales notification. Replaying the same key
   must return the same receipt without sending another email.
4. Set `HOLDING_CARRIER_UPLOAD_ENABLED=1` in the Holding Vercel project. Until
   that setting exists, the public page continues the email handoff.

If the bucket, Gmail delivery, or receipt fails, the Holding page must not
claim the file was received. Do not replay an uncertain notification until its
provider state has been reconciled.
