# Phase 0.2B runtime tenant enforcement

Phase 0.2B wires every Kinde-protected Edge Function through the reviewed Phase 0.2A identity contract. It does not change public token-scoped carrier/customer endpoints.

## Rollout modes

Set `RATEWARE_TENANT_ENFORCEMENT` independently on each Edge Function:

- `disabled` (default): preserve the current workspace resolver while the production mappings are reconciled.
- `shadow`: evaluate the canonical resolver, emit `TENANT_ENFORCEMENT_SHADOW_REJECT` with a request id and truncated SHA-256 identity/organization references (never token or email), and preserve current access.
- `required`: fail closed with HTTP 403 unless the identity, organization link, and workspace registry are active, unique, reviewed, and mutually consistent.

An absent or empty value resolves to `disabled`. Any non-empty unknown value is a configuration error and denies the request; a typo cannot silently preserve legacy access.

## Production gate

Do not enable `required` until all of the following are evidenced:

1. The production Kinde organization has one approved canonical organization UUID.
2. Each operator subject has one active reviewed `external_identities` row.
3. The Kinde organization has one active reviewed `external_organization_links` row.
4. `workspace_registry.organization_uuid` matches that link.
5. Shadow logs show no legitimate-user rejection during a controlled operating window.
6. A controlled authenticated smoke covers Rateware API, Shipper directory, upload creation, interpretation, and catalog sync.

### Phase 0.2E evidence gate

Phase 0.2E turns those conditions into a repeatable, fail-closed evidence check. Keep production in `shadow` while collecting a controlled window of at least 24 hours. The evidence file must use one 16-hex pseudonymous tenant reference throughout; do not include email, Kinde subject, bearer token, or the raw external organization id.

Run:

```powershell
npm run check:tenant-readiness -- --input .\phase0-shadow-evidence.json
```

The command exits successfully only when all mapping gates agree, the window contains legitimate traffic with zero legitimate shadow rejections, and these five authenticated smokes pass exactly once:

- `rateware-api`: read-only authenticated request;
- `shipper-directory-api`: read-only authenticated request;
- `create-raw-upload`: exactly one auditable raw upload;
- `interpret-upload`: one or more `pending_review` staging rows and zero approved rows;
- `sync-rateware-catalog`: `dry_run=true` and zero writes.

The tool evaluates supplied evidence only. It does not query Supabase, activate mappings, invoke Edge Functions, approve a rate, change the environment, or enable `required`. A `GO` is evidence for a separate human cutover decision, not an automatic deployment instruction.

Existing business rows remain scoped by the reconciled external Kinde organization id during this phase. Moving `organization_id` columns to the canonical UUID requires a separate bounded backfill/cutover with row counts, rollback, and independent review.

## Rollback

Set `RATEWARE_TENANT_ENFORCEMENT=disabled` and redeploy the affected Edge Functions. No schema rollback or data rewrite is required by Phase 0.2B.
