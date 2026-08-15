# Platform 55 Sprint 8 - Intelligence Decision Brief

## Outcome

Sprint 8 adds a local, observation-only decision brief to Analyze. It summarizes the last successful Geo, Pivot, Copilot, or Carrier Ranking result already loaded in the browser session.

The brief never starts a new query. It does not persist data and has no executor.

## Evidence contract

The JSON artifact uses `rateware.intelligence_brief.v1` and records:

- the source Analyze view;
- the source-provided `data_as_of` value, if present;
- sample counts and the metric being reviewed;
- explicit currencies for monetary evidence;
- rate or upload lineage references supplied by the source;
- source warnings and evidence gaps;
- AI or optimization ideas as `proposal` records that always require confirmation.

`generated_at` is the time the local artifact was created. It is never presented as data freshness. If the source does not provide a governed date, currency, sample, or lineage, the brief remains blocked or requires review instead of inventing a value.

Lineage labels and filenames are context, not identifiers: a structured reference must include an `id`, `raw_upload_id`, or `rate_staging_id`. Empty objects and boolean-only placeholders do not count as usable observations. Monetary values found in rows, points, or nested recommendation metrics require an explicit single currency, including cost-based ranking modes.

## Safety boundary

The contract fixes all material-action flags to `false`:

- no carrier outreach or RFx invitation;
- no bid, award, dispatch, payment, or financial approval;
- no Rateware, CRM, ERP, or TMS writeback;
- no external distribution authorization;
- only an explicit local JSON download is available.

The existing Carrier Ranking promotion action remains separate and is not called or embedded by the brief.

## Deferred scope

This sprint does not add forecasting, an optimization solver, persistent alerts, background agents, new models, new APIs, new database objects, or administration surfaces. Those require governed source timestamps, tenant-scoped lineage, real validation data, and separate authorization.

## Validation boundary

Passing local tests proves only the deterministic artifact and UI wiring. It does not prove deployment, production data freshness, live tenant isolation, or human approval.
