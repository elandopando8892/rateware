# Salzillo feedback learning — OSP

## Outcome

The Salzillo Formato 3.3 pilot exposed a gap between the legal-entity vault and the operational answers required by real customer onboarding forms. OSP now has a supervised answer-memory layer that is separate from documentary legal facts.

## Data layers

1. **Verified legal facts** remain evidence-backed and document-reviewed.
2. **Entity answer memory** stores human-reviewed, reusable operational answers such as billing workflow, portal, CFDI/payment conventions, POD handling, and signer title.
3. **Counterparty answer memory** stores answers that are valid only for one external party, such as requested credit amount/terms or relationship-source answers.

Restricted/highly restricted memory is stored separately from generic automatic preparation and is not eligible for unsupervised reuse.

## Salzillo field-discovery gaps found

The original XLSX structural extractor recognized only legal name, tax ID, fiscal address, and bank account. The pilot additionally requires recognition of commercial name, tax regime, website, commercial profile, credit request, CFDI/payment terms, purchase-order/contract flags, POD mode, billing/collections workflow, portal fields, and banking fields.

Two structural issues were also found:

- merged label cells can place the writable value more than one column away;
- CLABE must be a distinct canonical field from bank account number.

The staged runtime update addresses both issues.

## Credential boundary

Portal passwords and other credentials are deliberately excluded from learned answer memory and structural canonical fields. Placeholder values such as TBD do not become reusable secrets.

## Release boundary

This work does not authorize signatures, send email, submit a provider application, or enable OSP outbound delivery. Existing human-approval and release controls remain in place.
