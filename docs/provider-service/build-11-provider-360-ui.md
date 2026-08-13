# Provider Service 360 — Build 11

## Provider 360 UI

Branch: `provider-service-build11-provider-360-ui`  
Base: `provider-service-build10`  
Status: draft implementation; not deployed.

Build 11 turns the Provider Service domain from Builds 1–10 into one Vendor CRM view. It is not a separate application. The intended surface is a new `Provider Service` tab inside the existing vendor drawer.

## Read model

The browser does not query Provider Service tables. Build 11 adds service-role-only projections:

- `provider_service_360_relationship_summary`
- `provider_service_360_activation_requirements`
- `provider_service_360_activity_feed`

The projections deliberately exclude raw EIN/RFC/TIN values, bank data, identity documents, signature assets, storage paths, SHA hashes, email bodies, portal token hashes and approval payload snapshots.

Tenant resolution must be:

```text
Kinde user
  -> canonical Rateware workspace (text organization_id)
  -> workspace_registry.organization_uuid
  -> vendor must belong to that workspace
  -> provider relationship UUID tenant
  -> optional legal entity scope
```

## Visible information

The Provider 360 panel shows:

- XBF legal-entity-specific provider relationship and `VND-*` code;
- lifecycle, activation and risk state;
- document counts and attention state;
- open/escalated cases;
- open communications and replies needed;
- pending approvals;
- portal invitation state;
- latest compliance state;
- required vs ready downstream integrations;
- activation requirements grouped by track;
- recent normalized activity.

`src/provider-service-360-domain.js` derives presentation-only attention states. It does not create a weighted health score; that belongs to Build 12.

`src/provider-service-360.js` is a mountable, lazy-load panel. It only knows the standard `callRatewareApi()` client and the `get_provider_360` action. It has no Supabase table knowledge.

## Drawer integration contract

Two small hooks remain before merge:

1. Add `get_provider_360` to the existing authenticated `rateware-api` dispatcher. The handler must resolve the canonical workspace, verify the vendor belongs to that workspace, map to `workspace_registry.organization_uuid`, and read only the Build 11 private projections.
2. Add a `Provider Service` tab/panel to `vendors.html` and lazy-call `mountProviderService360()` when the tab is selected for `activeDrawerVendorId`.

The connector cannot safely patch the very large `rateware-api/index.ts` and `vendors.js` files atomically, so these hooks are intentionally left as explicit pre-merge work rather than weakening the access boundary or duplicating privileged credentials.

## Non-goals

Build 11 does not:

- expose Provider Service tables to authenticated browser users;
- reveal restricted company/person data;
- enable case or requirement mutations from the panel;
- connect Gmail;
- execute signatures;
- write Fleet Rocket or MARKSMAN ERP;
- compute autonomous health decisions;
- deploy or merge to production.

## Next build

Build 12 adds Provider Health & Intelligence as a versioned deterministic prioritization layer over the same Provider 360 facts. Health will surface risk and work priority but will never activate, suspend, merge or alter a provider by itself.
