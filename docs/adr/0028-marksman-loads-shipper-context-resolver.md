# ADR-0028: Rateware read-only Shipper CRM context for MARKSMAN Loads

**Status:** Implemented as a disabled, read-only endpoint
**Date:** 2026-09-13

## Decision

Rateware exposes a separate Edge Function, `marksman-shipper-context`, for the
server-to-server request made by MARKSMAN Loads before an instruction letter
is accepted. It verifies the HMAC request, resolves the canonical
`rfx_lane_vendors` offer, follows `rfx_events.customer_id` to `shippers.id`,
and returns only the Shipper CRM context required by the Loads letter flow.

The endpoint never creates a bid, award, shipment, Fleet Rocket record,
invoice, message or tracking record. It uses the service-role key only inside
the Rateware function and returns no credential material.

## Binding rules

The resolver supports two explicitly observable bindings:

- direct rehearsal: `offerId` is the Rateware `rfx_lane_vendors.id` and
  `postId` is the related event or lane id;
- production-ready bridge shape: `postId/offerId` are local Loads ids found in
  `marksman_loads_rateware_agreement_bindings`, which must point to the exact
  Rateware vendor invitation and event.

In both cases:

- `ratewareVendorId` must equal the offer's `vendor_id`;
- the event must have a canonical `customer_id` pointing to Shipper CRM;
- the Shipper record must contain `tms_system_id` and an explicit
  `metadata.marksman_loads.fleetRocketAccounts` array with an environment,
  numeric Fleet Rocket shipper id, status and source reference;
- a structured TONU/cancellation policy must be available in the linked RFI
  business rules. Human-readable policy text is not parsed into numbers.

The migration creates the bridge table with RLS enabled and no browser policy.
It is intentionally read-only to this resolver. A future reviewed server-side
command must populate it; the resolver does not create or repair bindings.

## Contract

The response is `marksman-loads.rateware-shipper-crm-context.v1` with the same
`requestId`, `keyId` and expiration evidence as the signed request. It always
includes `externalExecution: false` and returns:

```text
context.shipperCrmLink
context.cancellationPolicy
```

If either environment mapping or policy evidence is absent, the function
returns a typed `409` incomplete-context response. It does not fall back to a
default Fleet Rocket id, default environment, or default cancellation rule.

## Configuration and release fence

The function is disabled unless all three server-side values are present:

```text
MARKSMAN_LOADS_SHIPPER_CONTEXT_ENABLED=true
MARKSMAN_LOADS_SHIPPER_CONTEXT_SHARED_SECRET=<32+ chars>
MARKSMAN_LOADS_SHIPPER_CONTEXT_KEY_ID=<rotatable id>
```

This change does not deploy the function, register a secret, change Supabase
production, call Fleet Rocket, or enable the Loads resolver. Those remain
separate authorized release gates.
