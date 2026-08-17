# Provider Service Onboarding — Form Engine

As of `8a187b0`. Scope decision: **Option B**, approved 2026-08-17 — PDF, XLSX and DOCX
are filled in place; legacy XLS and DOC are preserved and routed to a human.

---

## 1. Layers

```
provider-onboarding-form-adapters.mjs   format detection + per-format fill
        ▲
provider-onboarding-assembler.mjs       fetch, verify, fill, hash, store privately
        ▲
provider-onboarding-form-assembly.ts    orchestration: approval, disclosure, consent, lease
```

The orchestration layer existed since Build 28 and declared a
`ProviderOnboardingFormAssembler` interface that nothing implemented. The lower two layers
are new on this branch.

Runtime dependencies added: `pdf-lib`, `exceljs`, `docxtemplater`, `pizzip`.

---

## 2. Format detection

`detectFormat(filename, declaredMimeType)` resolves from both and **errors when they
disagree** — a `.pdf` declared as a spreadsheet is the shape of a malicious upload, not a
preference to reconcile.

Ingestion (`_shared/provider-entity-upload.ts`) accepts pdf, png, jpeg, xlsx, docx, xls,
doc. Legacy xls/doc are accepted for storage and human review only; no adapter fills them.

---

## 3. Per-format behaviour

### PDF

AcroForm fields: text, checkbox, radio, dropdown. A value outside a dropdown's option list
is **refused** and raised as `invalid_choice`, not coerced. A mapping with no matching
field raises `unmatched_field` rather than failing silently.

A flat PDF is never rewritten blind. Without approved overlay coordinates the adapter
returns `fidelity: 'requires_human_layout_review'` and the assembler refuses. With
coordinates it draws text at those positions only.

Page size, page count and rotation survive; tests assert size and count are unchanged.

### XLSX

Targets are `Sheet!Cell` addresses. **Formula cells are never overwritten** — a mapping
landing on one is refused as `formula_cell_protected`, verified by a test that attempts to
write over `SUM(B3:B4)` and confirms it survives. Column widths and untouched cells are
preserved. Invalid targets and missing sheets are reported, not skipped.

### DOCX

`{placeholder}` substitution via docxtemplater, which leaves tables, headers, footers and
page breaks intact. A test asserts `<w:tbl>` markup survives a fill.

### XLS / DOC

The original is returned **byte-identical** with
`review_tasks: [{ kind: 'legacy_format_requires_human_conversion' }]`. The assembler turns
this into a refusal. Automated conversion would need an isolated LibreOffice process,
which is out of scope until approved.

---

## 4. Assembler invariants

Beyond what the orchestration layer already enforces:

1. **Template integrity.** The template is downloaded and re-hashed; a mismatch against
   the `template_sha256` registered at approval refuses assembly and stores nothing.
2. **Signature placement is configuration.** A stored signature is drawn only where an
   operator pre-approved coordinates for that template path. No placement → refusal.
3. **Signature asset integrity.** The PNG is re-hashed against its registered
   `file_sha256` before embedding, so a swapped image in the bucket is caught.
4. **Private only.** `upsert: false`; no public URL is ever requested.

`external_esign` and `manual_wet` complete outside the worker and draw nothing.

Output extension follows the template. It was previously hardcoded to `.pdf`, which
mislabelled every XLSX and DOCX assembly.

---

## 5. Field mapping

`_shared/provider-onboarding-ontology.mjs`, version `2026.08.17`. 35 canonical codes.

| Match | Confidence | Review |
| --- | --- | --- |
| Exact alias | 1 | no |
| Single-candidate containment | 0.6 | yes |
| Multiple candidates | 0 | yes — returns `ambiguous` + candidate list |
| No match / empty | 0 | yes |

`resolveField('address')` deliberately refuses to choose between fiscal, commercial and
billing.

`NEVER_INFERRED` — banking, trade references, credit, payment terms, bond, years in
business, signature fields — always require a reviewed canonical fact, so
`mapExtractedFields` returns `needs_review` even when a value is present.

Missing or blank values return `proposed_value: null, status: 'pending'`. Nothing is
approximated. Each row carries the original question, normalized label, field code, data
type, sensitivity, evidence document, confidence, match kind, reason and ontology version.

The tables are frozen; a test asserts runtime mutation throws, so learned aliases cannot
silently rewrite the ontology.

---

## 6. Testing

`tests/provider-onboarding-form-adapters.test.mjs` (16) builds every fixture in-process
with the real libraries and verifies byte-level round-trips — no structural regex-on-source
assertions, and no real XBF document, name, identifier or signature.

`tests/provider-onboarding-assembler.test.mjs` (9) drives a fake storage client and asserts
each refusal path stores nothing.

`tests/provider-onboarding-ontology.test.mjs` (13) covers the brief's documented alias
examples, Spanish aliases, ambiguity, and the never-inferred rule.

---

## 7. Not built

- Scanned-PDF OCR. A scanned form is a flat PDF and takes the human-layout-review path.
- Table and multi-row extraction. The ontology is scalar-field oriented.
- XLSX checkbox and form controls.
- Automated XLS/DOC conversion.
- Learned-alias promotion workflow. The ontology is versioned but edited by hand.
- Any wiring to an HTTP entrypoint. The assembly commands remain unreachable pending a
  sender allowlist and recipient-domain policy.
