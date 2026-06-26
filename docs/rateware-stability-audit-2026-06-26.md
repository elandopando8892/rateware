# Rateware Stability Audit - 2026-06-26

## Scope

Audit focused on production-impact bugs in:

- Rateware approved rate book
- Carrier CRM / Vendor Intelligence / Procurement Pipeline
- Vendor matching and ownership
- Supabase Edge Function performance
- Data integrity risks caused by historical imports

## Executive Summary

Rateware is usable as a prototype, but it is not yet stable enough as an operational SaaS without a stabilization sprint.

Main causes:

1. Too much data is loaded inside single Edge Function requests.
2. Vendor ownership is inconsistent across Kinde IDs and email ownership.
3. Vendor matching allowed generic email domains like gmail.com and hotmail.com.
4. Pipeline logic depends on Procurement Base, but current data has all vendors in Sourcing Base.
5. Automated test coverage is very thin.

## Production Data Snapshot

Observed in remote Supabase:

- `rate_staging` approved rows: 55,766
- archived rows: 276
- rows with `vendor_id`: 41,756
- distinct linked vendors in approved rates: 557
- vendors by owner:
  - `sales@heymarksman.com`: 1,269 sourcing vendors
  - `kp_1adaf709ff42498282b025162afd5c75`: 1,274 sourcing vendors
  - `kp_a636ecabd92d4fb3805bfd79590f5237`: 1,274 sourcing vendors
- procurement vendors: 0

## Critical Bugs Found

### 1. Rateware Load Fragility

Rateware was reading row payloads that were too heavy for a large rate book.

Impact:

- Rateware could fail to load with HTTP 546 / compute resource errors.
- Filtered views and spreadsheet rendering became unstable with 55k+ rows.

Fix applied:

- Rateware list endpoint now uses a lightweight response select.
- Heavy fields such as audit evidence and source JSON are excluded from the table list response.
- Approved Rateware pagination now has a partial database index matching the default sort order.
- The default approved-rate page query moved from sequential scan/sort to index scan.

Remaining work:

- Load audit/source evidence lazily only when the user opens a row drawer.

### 2. Vendor Intelligence Performance

Vendor Intelligence calculated metrics by scanning rates repeatedly per vendor.

Impact:

- Complexity was roughly vendors x rates.
- With 1,274 vendors and thousands of rates, Edge Functions can run out of compute.

Fix applied:

- Rates are grouped by vendor once.
- Vendor metrics are calculated from pre-grouped rate sets.

Remaining work:

- Move broader AI recommendation slices to SQL-backed aggregations when they need route/corridor-specific filters.

Status update:

- Vendor Intelligence now reads vendor-level metrics from the Postgres RPC `vendor_rate_metrics_for_owner`.
- The Edge Function no longer loads raw `rate_staging` rows just to calculate Vendor Intelligence.
- Vendor metrics include linked/approved/pending rates, cross-border signals, D2D Import/Export signals, Mexico signals, average all-in, cost per mile/km, markets, lanes, equipment, border pairs, and last quote date.
- Generic email domains remain excluded from domain-based vendor matching.

### 3. Procurement Pipeline Heavy Load

Pipeline loaded full Vendor Intelligence and then filtered down to Procurement Base.

Impact:

- Pipeline could fail even when there were zero procurement vendors.

Fix applied:

- Pipeline now queries Procurement Base first.
- If there are no procurement vendors, it returns quickly without scanning all rates.

Data note:

- Current production has zero procurement vendors, so Pipeline being empty is expected until vendors are promoted from Sourcing to Procurement.

### 4. Vendor Ownership Split

Vendor data exists under multiple owner identities:

- `sales@heymarksman.com`
- Kinde principal IDs beginning with `kp_...`

Impact:

- Carrier CRM may show one vendor base while Rateware rows link to another copy.
- Vendor Intelligence under `sales@heymarksman.com` can miss rates linked to the Kinde-owned copies.

Fix applied:

- Added migration to relink rate rows from Kinde-owned vendor copies to the `sales@heymarksman.com` vendor copy when an exact non-generic domain match exists.

Remaining work:

- Add a canonical workspace/user ownership model.
- Add a one-time duplicate vendor cleanup workflow.

### 5. Generic Email Domain Matching

Matching allowed domains such as:

- gmail.com
- hotmail.com
- yahoo.com
- outlook.com

Impact:

- Personal email domains created false vendor links.
- Around 11k linked rows were associated with generic email domains and cannot be trusted as carrier-domain matches.

Fix applied:

- Domain-based vendor matching now ignores generic email domains.
- Exact email matching remains allowed when a full email address is available.
- Migration clears existing generic-domain vendor links while preserving `vendor_domain`.

Remaining work:

- Capture full sender email and vendor email source when interpreting files.
- Build a manual review queue for generic-domain vendor references.

## High Priority Pending Bugs / Risks

### A. Filters Still Use In-Memory Scans

`fetchBulkRateRowsByFilter` still scans up to 50k rows in the Edge Function for some global filters.

Risk:

- Column filter menus and filtered bulk actions may still be slow under large data.

Recommended fix:

- Move simple filters to SQL.
- Use server-side pagination and SQL `distinct` for dropdown filter values.
- Keep in-memory filtering only for complex derived checks.

Status update:

- Direct spreadsheet filters were moved to SQL-backed API paths.
- Derived filters and filtered bulk actions now use the `rateware_filtered_rate_ids` Postgres RPC instead of Edge Function row scans.
- Composite filters for vendor, origin, and destination now use database RPCs for both row filtering and dropdown values.
- Filter dropdowns no longer hydrate full rate rows inside the Edge Function.
- Dropdown values use a fast SQL path when no advanced filters are active, and only run the full matcher when needed.

### B. Rateware Audit Drawer Needs Lazy Load

The table should not load audit JSON, source evidence, confidence, or candidate arrays by default.

Recommended fix:

- Add `get_rate_row_detail` endpoint.
- Rateware/Staging drawer requests heavy fields only for the selected row.

### C. Current Test Coverage Is Insufficient

Existing automated tests only cover upload file rules.

Missing tests:

- Vendor match excludes generic domains.
- Rateware list endpoint returns paginated rows.
- Bulk filtered actions do not act on only visible rows.

Status update:

- Added stability guards ensuring Vendor Intelligence and Procurement Pipeline do not call the raw BI rate-row loader.
- Added guards for the vendor metrics RPC and supporting indexes.

### D. Data Ownership Needs Canonicalization

Current owner strategy uses `email || id`.

Risk:

- If Kinde token shape changes, new rows can again be stored under `kp_...` instead of email.

Recommended fix:

- Canonical owner should be resolved through `user_profiles` or workspace membership.
- Persist one workspace id and use it everywhere.

### E. Procurement Pipeline UX Is Misleading

Pipeline shows zero because no vendor has been promoted to Procurement Base.

Recommended fix:

- Add an empty-state action: "Promote selected sourcing vendors to Procurement".
- Add a diagnostic line: "0 procurement vendors / 1,269 sourcing vendors".

## Hotfixes Applied In This Audit

- Block generic email domains from domain-based vendor matching.
- Add data repair migration for historical vendor links.
- Keep exact full-email vendor matching.
- Optimize Vendor Intelligence metric grouping.
- Optimize Procurement Pipeline loading path.
- Reduce Rateware list response payload.

## Post-Hotfix Production Validation

After applying the data repair migration:

- linked rate rows under `sales@heymarksman.com`: 30,453
- linked vendor count under `sales@heymarksman.com`: 448
- linked rate rows still under old Kinde owner IDs: 1
- linked rows using generic email domains: 0
- total rows with `vendor_id`: 30,454
- approved rate rows remain unchanged: 55,766
- pending review rows: 0

The migration did not delete rates or vendor records. It only repaired `rate_staging.vendor_id` links and cleared unsafe generic-domain links.

## Stability Block 2 Validation

Applied after the first hotfix:

- Added Postgres RPC `rateware_filtered_rate_ids`.
- Added SQL helpers for derived filters: split-rate, all-in, conflicts, source-audit, ready, cross-border.
- Moved filtered archive/remove/update/match actions to RPC-backed ID resolution.
- Added lazy row detail endpoint for heavy Rateware evidence payloads.
- Added canonical Kinde owner resolution through `user_profiles`.
- Added regression guards in `tests/rateware-stability.test.mjs`.

Production validation:

- `rateware_filtered_rate_ids('rateware', ..., 'split-rate', ...)` returned rows.
- `rateware_filtered_rate_ids('rateware', ..., 'conflicts', ...)` returned rows.
- `rateware_filtered_rate_ids('staging', 'pending_review', ..., 'ready', ...)` returned 0 rows because production currently has no pending review rows.
- RPC function exists in `pg_proc`.

## Stability Block 3 Validation

Applied in this block:

- Added SQL helper `rateware_domain_key` for consistent vendor-domain matching.
- Added SQL helper `rateware_is_generic_email_domain` so generic email domains are excluded in database-side matching.
- Added RPC `vendor_rate_metrics_for_owner` to aggregate quote/rate signals by vendor in Postgres.
- Rewired Vendor Intelligence and Procurement Pipeline to consume vendor-level metrics instead of raw `rate_staging` rows.
- Replaced quadratic duplicate detection with indexed duplicate candidate buckets.
- Added regression guards to prevent Vendor Intelligence and Pipeline from reintroducing raw BI scans.

## Stability Block 4 Validation

Applied in this block:

- Added BI aggregation RPCs for pivots, drilldown, geo density, summary, and filtered vendor metrics.
- Rewired AI Analyst, carrier recommendations, pivots, drilldown, and map density away from raw Edge Function row scans.
- Kept the frontend response shapes stable while moving heavy grouping and filtering into Postgres.
- Added regression guards so Analyze endpoints cannot reintroduce `fetchBusinessIntelligenceRows` as their hot path.
- Added an indexed vendor-domain-key lookup and removed correlated vendor-metric array subqueries.
- Suppressed generic email domains from BI carrier labels so `gmail.com`/`hotmail.com` roll up as unmatched, not as carriers.

Remaining risk:

- The AI prompt parser is still deterministic-first. Route-specific natural-language parsing can improve later, but the current blocker was compute stability.
- Geo density still depends on known centroid coverage. Admin Catalogs should keep hardening exact city/market coordinates.

Production validation:

- `rateware_bi_summary_for_owner('sales@heymarksman.com', '{}')` returned 55,763 transactions and 28,753 crossborder rows.
- Crossborder pivot RPC returned rows from the full database and grouped generic domains under `Unmatched carrier`.
- `rateware-api` deployed as Supabase function version 100.

## Recommended Stabilization Sprint

### Sprint Goal

Make Rateware + Carrier CRM reliable before adding more product surface.

### Quickwins

1. Deploy the data repair migration.
2. Add `get_rate_row_detail` endpoint for lazy audit/source evidence.
3. Add endpoint-level tests for Rateware list, Vendor Intelligence, Pipeline, and vendor matching.
4. Add SQL-backed filter value endpoints for common columns.
5. Add owner canonicalization migration and runtime guard.
6. Add CRM diagnostics for Sourcing vs Procurement vs Linked Rates.

## Definition Of Done

- Rateware loads first page in production with 55k+ rows.
- Carrier CRM Directory loads 1k+ vendors consistently.
- Vendor Intelligence does not throw compute-resource errors.
- Pipeline loads instantly when Procurement Base is empty.
- No new vendor links are created from generic email domains.
- Data repair relinks historical non-generic vendor links to the visible user-owned vendor base.
- Automated tests cover the above.
