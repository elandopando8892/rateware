# Unmatched Carriers Analysis — 2026-07-02

After the vendor-match wave, **22,019 of 55,766 approved rows still have no
linked CRM vendor** (`vendor_id is null`). This breaks them down so the gap can
be closed deliberately. All queries were read-only against production via
`supabase db query --linked` (no browser, no data mutated).

## Breakdown of the 22,019 unmatched rows

| Group | Rows | Distinct | What it means | Action |
|---|---|---|---|---|
| **Real corporate domain** | 4,794 | **286 carriers** | `vendor_domain` is a valid domain with no CRM record | **Create these vendors** (list attached) |
| Not-a-domain / temp-mail | 5,924 | 322 | `vendor_domain` holds junk (`transportes`, `ta`, `cargo`, `yopmail.com`) | Fix the vendor field first, then re-match |
| Personal email | 11,301 | 7 | `gmail/hotmail/yahoo/outlook/…` — real carrier name not captured | Manual attribution from source files |

Key finding: **0 of the corporate domains match an existing CRM vendor by domain**
(4 rows were ambiguous, the rest had no vendor at all). So linking-by-domain does
nothing here — the carriers genuinely need to be created.

## Deliverable

`docs/unmatched-corporate-carriers-2026-07-02.csv` — all 608 corporate-domain
values with columns: `domain, kind, rows, source_files, suggested_name`.
- Filter `kind = real_domain` → the **286 carriers (4,794 rows)** ready to create.
- `suggested_name` is derived from the domain (e.g. `conquestcarriers.com` →
  "Conquestcarriers"); intended as a starting label to refine.

Top real-domain carriers by row count: fleteradelnorte.com.mx (451),
wtsllc.net (353), conquestcarriers.com (350), codysurgroup.com (268),
tnt-trucklines.com (236), alpha-carriers.com (205), santoyotransport.com (194),
simple-logistics.com (181), multicarriers.mx (152)…

## Recommended next steps

1. **Create the 286 real-domain carriers** in Carrier CRM, then run the vendor
   match again to auto-link their 4,794 rows. Options:
   - Import the CSV via **Vendors → Import** (uses the app's dedup/validation), or
   - I can bulk-insert them from a local SQL migration if you confirm the naming
     approach (derived `suggested_name` + `base_stage='sourcing'`).
2. **Field-fix the 322 junk `vendor_domain` values** — many are the carrier's
   actual name typed into the domain column; a staging/rateware bulk-edit by
   source file can correct them.
3. **11,301 personal-email rows** — need the real carrier identified from the
   original source file; not automatable.

## Data-quality note

The `vendor_domain` field is being used inconsistently at intake (real domains,
bare company names, and disposable emails all land there). Tightening the
interpret/import step to separate *carrier name* from *email domain* would
prevent this class of gap going forward.
