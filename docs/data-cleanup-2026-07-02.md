# Approved Rate Book — Data Cleanup Run, 2026-07-02

General data-quality cleanup of the production approved rate book
(55,766 rows), driven through the app's own repair machinery
(`renormalize_rate_rows`, `match_rate_vendors`) via authenticated batch
runs. Audit tooling added for this run: `book_audit`,
`book_audit_scan`, `list_vendor_unmatched_ids` actions in
`rateware-api` (kept — reusable for future data-quality passes).

## Results (before → after)

| Issue class | Before | After | Change |
|---|---|---|---|
| Market gaps (missing origin/destination market) | 7,369 | **649** | **−91%** |
| ZIP gaps (US/CA side missing prefix) | 9,341 | **2,593** | **−72%** |
| Normalized-lane mismatch (heuristic, see note) | 27,191 | 15,157 | −44% |
| Vendor unmatched | 25,320 | **22,019** | −3,301 linked |
| Missing quote date | 1,751 | 1,751 | needs human input |
| Currency missing (rate present) | 126 | 126 | needs human input |
| Rate-less rows | 0 | 0 | clean |
| Catalog unmatched | 0 | 0 | clean |

**What ran:** ~19.5k rows re-normalized against the current catalog +
alias tables (fixes mis-anchored markets like `Orizaba -> Xalapa
Market`, fills missing markets/ZIPs, idempotent on correct rows);
24,450 vendor-match attempts linking 2,420+ rows to CRM vendors.
Zero data loss — only derived fields (`normalized_*`, `*_market`,
`*_zip_prefix`, `*_region`, catalog status) were recomputed; raw
origin/destination/rates/dates untouched. Row-level audit history
preserved.

## Notes and caveats

- **Normalized-mismatch is a heuristic, not a defect count.** The
  pipeline intentionally anchors satellite cities to market cities
  (Apodaca -> Monterrey, Lerma -> Toluca), which the text heuristic
  flags. The remaining 15,157 are predominantly intentional anchors;
  genuine corruption (e.g. `Laredo, TX -> "Amarillo"`) was re-derived
  in the renormalize wave.
- **Sample validation before the mass wave** confirmed renormalize
  fixes mis-anchors (Xalapa->Orizaba), fills gaps (Merida null->Merida
  Market), updates to current catalog granularity (Dallas Mkt->Ft
  Worth Mkt), and no-ops on correct rows.

## Remaining work (needs business/human decisions)

1. **649 market gaps** — locations the catalog does not know. Add
   catalog locations or aliases (Catalog workbench), then re-run
   renormalize on the remainder.
2. **22,019 vendor-unmatched rows** — mostly quotes received from
   personal domains (`gmail.com`, `yahoo.com`) whose real carrier
   (e.g. "Expedites NLM") has no CRM record. Options: bulk-create
   vendors from `detected_vendor_reference`, or correct domains in
   staging. The match errors include per-row correction templates.
3. **1,751 rows without quote date / 126 without currency** — cannot
   be inferred safely; bulk-edit by source file in the Rateware
   workbench.
4. **Quote freshness**: the book contains quotes dated 2020-2021;
   100% of the book is >60 days old. Consider archiving historical
   rates or re-quoting via Bid Room.
5. ~700 rows from 7 failed vendor-match batches (transient) — will be
   picked up by any future match pass.

## Operational learnings (for future runs)

- Edge CPU/statement limits: full-table scans must be cursor-sliced
  per invocation; unindexed OR/NOT head-counts hit statement timeouts
  (empty-body 500s on HEAD requests).
- PostgREST caps responses at 1,000 rows regardless of `limit`.
- `match_rate_vendors` works reliably at batch size ≤100 (400 times
  out).
- Mass update waves temporarily degrade count queries (dead tuples
  until autovacuum catches up) — pause before re-auditing.
- Browser-driven runners must persist state in `localStorage`; tabs
  get closed/reused mid-run.
