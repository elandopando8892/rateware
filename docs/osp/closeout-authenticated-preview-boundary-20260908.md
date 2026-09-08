# Authenticated preview boundary — work in progress

## Purpose

An authenticated preview must exercise the real shared Rateware/OSP APIs before
claiming the persistent file-review milestone. Synthetic preview authentication
does not prove this requirement.

The candidate uses one exact owned HTTPS origin configured independently in the
UI (`VITE_OSP_PREVIEW_ORIGIN`) and APIs (`OSP_APPROVED_PREVIEW_ORIGIN`). There is
no wildcard CORS permission. The UI option requires Supabase and the existing
live runtime profile; a preview-configured build cannot run at the production
origin. Token verification, identity bindings and approval permissions remain
applicable. The UI explicitly warns that this is real data, not a simulation.

## Boundary inventory reconciliation

The UI inventory omitted three already implemented sources: manifest-blockers,
MemberInspectionPanel and its stylesheet. The exact expected inventory now
includes those files. Request-review imports allow only the exact pure
manifest-blockers helper in addition to the existing reviewed imports; no
generic import allowance was introduced.

Verification in this continuation: `node --test
apps/osp/scripts/osp-read-only-ui-boundary.test.mjs` completed with **39 passed,
zero failed**, including raw-hash tampering, alternate Vite configurations,
unreachable imports and semantic mutation boundaries (126.04 seconds).

## Not yet proven

No preview origin has been activated by this change. Deployment, exact Auth
redirect configuration, authenticated browser demonstration and persistent
per-file review remain pending. This is not evidence of production readiness.
No production data, signatures, emails or webhooks were changed in this step.

## Release checklist

- [x] Type-check the compositions of osp-read-api, osp-case-api, osp-form-api
  and osp-document-api together: `deno check --config deno.json --frozen
  --unstable-sloppy-imports` completed with exit 0.
- [x] UI TypeScript compilation (`tsc --noEmit -p tsconfig.json`) completed
  with exit 0.
- [x] Updated action-contract fingerprints passed their executable verifier:
  **169/169 surfaces**, one Node test, zero failures (514.16 seconds). The slow
  execution was allowed to finish; it was not restarted or treated as a pass
  while still running.
- [ ] Commit the reviewed candidate to the private OSP repository (not the
  public Rateware origin).
- [ ] Build a full Vercel preview including its scanner route, not a static-only
  synthetic artifact. Record the deployment ID and exact build inputs.
- [ ] Configure the same exact owned preview origin in the live UI, API CORS
  configuration and Supabase Auth redirect. Preserve existing production redirects.
- [ ] Verify login and authenticated reads before attempting any permitted
  persistent review. Keep outbound controls disabled.
- [ ] Demonstrate persistent review against an isolated permitted case and exact
  file bytes; do not modify the historical Salzillo case.

Abort promotion on failed login, failed authenticated reads, missing scanner,
unexpected writes, cross-identity visibility or a mismatch between the reviewed
bytes and the displayed package. A preview-configured build must not be promoted
to the production domain; production needs its own build without the preview
origin setting. Preserve the previous production deployment for rollback.
