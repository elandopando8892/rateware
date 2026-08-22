# OSP Phase 1 Security Remediation — Design

**Date:** 2026-08-21

**Status:** Approved

**Product:** Onboarding Service Provider (OSP) — XBF Customer Setup

## 1. Objective

Deliver a publishable, read-only Phase 1 foundation for the workflow in which a carrier or supplier asks XBF to register as its customer. A person at XBF copies `carriers@xbfreight.com`; OSP captures the request and later manages the customer-setup pipeline.

OSP is not a quotation product and does not onboard carriers as XBF suppliers.

Phase 1 exposes only an authenticated pipeline summary and Gmail intake health. It cannot approve, sign, authorize, send, mutate CRM data, upload documents, or provision a signature.

## 2. Approved separation of duties

The complete product preserves these distinct authorities:

| Actor | Authority | Phase 1 behavior |
|---|---|---|
| OSP operator | Review cases and prepare future packages | Read-only visibility |
| `jgonzalez@xbfreight.com` | Approve and digitally sign the exact package | No signing surface in Phase 1 |
| `sales@heymarksman.com` | Authorize the exact reply | No authorization surface in Phase 1 |
| `carriers@xbfreight.com` | Capture CC messages and send an authorized reply | Gmail health is read-only; no send action |
| OSP automation | Classify, extract, propose, and prepare | No autonomous approval, signature, authorization, or send |

Frontend visibility never grants authority. Every eventual consequential action requires a distinct backend permission and human gate.

## 3. Sanitized history and provenance

The deliverable branch is `codex/osp-customer-setup-sanitized`, created from current `origin/main` at `4a74b2fea0fbee89d09c3e56603e50cb7591e2f1`.

The previous local implementation tree at `eefa4346ae9df2f71674781ee8e63a8a1672481e` is reference material only. It must not be merged, rebased, cherry-picked, or otherwise made an ancestor of the sanitized branch. Safe source is reconstructed into new commits after content inspection.

The previous branch remains local and quarantined with the disposition:

`NO PUSH / NO MERGE / NO DEPLOY`

No private locator, private filename, business document, signature image, or historical object containing them may be copied into the sanitized branch.

### 3.1 Approved baseline exception

The original delivery's literal baseline is not a completion gate. It contained six authorization-envelope failures and its aggregate claim could not be reproduced honestly. The replacement evidence is:

1. A clean `origin/main` baseline.
2. Recorded source and base hashes as provenance, without Git ancestry.
3. A reviewed allowlist of reconstructed files.
4. A denylist of excluded private or historical content.
5. Red/green regression evidence for every remediation.
6. Fresh root, Provider Service, action-contract, OSP, build, verifier, routing, and browser gates.
7. An independent final `GO` review with no open P0, P1, or P2 finding.

Reports must publish only counts reproduced in the sanitized checkout. They must not claim that the original aggregate passed.

## 4. Technology and application boundary

### 4.1 Frontend

- React 19 and TypeScript.
- Vite with base `/app/`.
- TanStack Router for typed application routes.
- TanStack Query for session-scoped remote reads.
- Zod for strict response validation.
- Vitest and React Testing Library for unit and integration tests.
- Playwright for desktop and mobile browser tests.
- pnpm 11.19.0 and Node.js 22.12.0 or newer.

The application is a private SPA. Its canonical URLs are:

- Local: `http://localhost:8791/app`
- Production: `https://osp.heymarksman.com/app`

Unexpected production origins fail closed. Production callbacks and logout redirects use exact URLs, never wildcards.

### 4.2 Browser authority

The browser has exactly two operations:

- `list_provider_onboarding_workspace`
- `provider_gmail_status`

Both operations are POST reads against one dedicated Edge Function, `osp-read-api`. The browser does not call `provider-onboarding-api`, `provider-gmail-intake-api`, PostgREST, RPCs, tables, Storage buckets, Gmail OAuth, Gmail sync, watch renewal, or any write dispatcher.

## 5. Dedicated read API

### 5.1 Endpoint

`osp-read-api` accepts a JSON object with an `action` discriminator. Its action parser is an exact allowlist of the two names above. Unknown keys may be rejected where they create ambiguity; unknown actions always return a safe `400` response.

The function performs these steps in order:

1. Enforce POST or preflight only.
2. Match the request origin against the OSP CORS allowlist.
3. Validate the Kinde bearer token.
4. Normalize and bind the stable identity.
5. Require `osp:read`.
6. Resolve the organization to one reviewed workspace mapping.
7. Ignore tenant or workspace identifiers supplied by the browser.
8. Execute the selected read with server-derived tenant scope.
9. Return a minimal read model with `Cache-Control: no-store`.
10. Record an internal request ID while returning only a safe incident ID and error code to the browser.

The API owns no generic command dispatcher and imports no module that registers consequential Provider Service or Gmail actions.

### 5.2 Required Kinde validation

The Kinde API identifier is:

`https://osp.heymarksman.com/api`

The frontend requests that audience. The backend requires it; the audience is not optional.

The server validates:

- An explicitly permitted asymmetric JWT algorithm.
- Signature through the configured Kinde issuer's JWKS.
- Exact issuer.
- Exact audience.
- `exp` and `nbf`, with one documented bounded clock tolerance.
- A non-empty stable `sub`.
- `email_verified === true`.
- A normalized email consistent with the verified token identity.
- Exactly one active organization identifier.
- Permission `osp:read` in the access token.

Missing, ambiguous, malformed, expired, or mismatched claims fail closed. Authorization errors do not disclose which claim or mapping failed.

### 5.3 Workspace resolution

The server resolves `{issuer, subject, organization}` through the existing reviewed runtime identity and workspace registry path. Resolution must produce exactly one active user, one reviewed organization link, and one canonical `organization_uuid`.

The organization UUID used in database filters is always server-derived. Browser values cannot override or broaden it.

### 5.4 Read models

The pipeline response contains only:

- Rows needed by the Phase 1 pipeline shell.
- Honest pagination metadata.
- Four strict metrics: `total`, `blocked`, `approval`, and `overdue`.

The Gmail response contains only:

- Whether a connection exists.
- Connection status.
- Watch expiration.
- Last error presence or safe error code, not raw upstream text.
- Token expiration when needed for health derivation.
- Whether Pub/Sub is configured.
- `outbound_enabled: false`.

It excludes OAuth URLs, scopes, history identifiers, database IDs, raw errors, token material, sync commands, and watch-renewal commands.

## 6. Strict data semantics

### 6.1 Metrics

A metric is valid only when it is:

- A finite non-negative integer number; or
- A non-empty base-10 string representing a finite non-negative integer.

`null`, `undefined`, blank strings, booleans, arrays, objects, fractions, negative numbers, `NaN`, and infinities are invalid. They never become zero.

The backend returns zero only when an explicit count result is zero. Missing aggregate fields remain unavailable and cause the affected metric group to render `—` with a safe data-unavailable state.

### 6.2 Gmail health

The visible health union is:

`unknown | disconnected | connected | watching | degraded`

The deterministic derivation receives an injected current time and follows this precedence:

1. Missing or malformed response: `unknown`.
2. Explicitly no connection: `disconnected`.
3. Connection plus any safe error indicator: `degraded`.
4. Connection with missing Pub/Sub, expired token, expired watch, or malformed expiration: `degraded`.
5. Valid connection without an active watch: `connected`.
6. Valid connection, Pub/Sub configured, no error, valid token, and future watch expiration: `watching`.

A previous string status of `watching` is never sufficient by itself.

## 7. Session and cross-tab isolation

### 7.1 Bound identity

The frontend session identity is immutable for one session generation:

```ts
type OspSessionIdentity = {
  issuer: string;
  subject: string;
  organization: string;
  email: string;
  displayName: string;
  emailVerified: true;
};
```

Every access token obtained for an API request must match the bound issuer, subject, organization, verified email, and audience. A mismatch invalidates the generation before its result may enter cache.

### 7.2 Revalidation events

The auth adapter revalidates on:

- Initial callback/session restoration.
- A cross-tab invalidation event.
- Window focus.
- Visibility becoming visible.
- Forced token refresh.

The cross-tab channel carries only a session-invalidated signal and a random generation marker. It never carries access, ID, or refresh tokens.

If `BroadcastChannel` is unavailable, cross-tab token synchronization is disabled. Local Storage is not used as a token transport fallback.

Kinde callback failures become a safe visible error, not an anonymous session. A validated `app_state.returnTo` is consumed once and restricted to `/app` paths on the same origin.

### 7.3 Query cache

The QueryClient scope key contains:

`authentication status + issuer + subject + organization + session generation + OspClient instance`

Any identity or generation change immediately unmounts and clears the previous QueryClient. Pending results from a previous generation cannot update the new cache or UI.

## 8. Documents and signature containment

Business documents and signature assets are data, not source code.

- Git, the frontend source, test fixtures, logs, reports, and build output contain no document bytes or signature bytes.
- The signature is stored in a dedicated private vault and represented elsewhere only by an opaque identifier.
- Only the future signing service may retrieve it, after the explicit authenticated approval of `jgonzalez@xbfreight.com` for an immutable package revision.
- General document ingestion cannot infer a signature safely from a filename.
- Raster images, PDFs, office documents, and unclassified files remain in private quarantine until reviewed classification.
- A dry run emits only sanitized counts, MIME types, sizes, hashes, dispositions, and opaque IDs.
- CLI output and errors never print source roots, absolute paths, private filenames, document bodies, or rejected names.
- No import or provisioning command is part of Phase 1 execution.

## 9. Build and release enforcement

### 9.1 Atomic build gate

Vercel's build command executes the production build and verifier in one command. Verification cannot be an optional follow-up and cannot inspect a stale artifact.

The verifier accepts only the exact Phase 1 artifact shape and an explicit file-extension allowlist. Any unrecognized file, binary asset, link, symlink, junction, path escape, hidden loader, or unexpected route fails the build.

### 9.2 Artifact policy

The verifier inspects filenames, normalized text contents, parsed HTML references, resolved paths, and CSS tokenization. It rejects:

- External or non-rooted scripts and stylesheets.
- `<base>`, inline `<style>`, CSS `@import`, and equivalent escaped forms.
- Non-HTML scripts and declarative shadow roots.
- Frames or compiled frame element creation.
- Test markers, example identities, secrets, token-like configuration, private-data markers, and document/signature markers.
- Direct Supabase table, RPC, or Storage usage.
- Any backend action literal except the two approved reads.

The verifier requires both approved action literals to be present exactly as expected and rejects known consequential action names from the action contract.

### 9.3 Routing evidence

Tests cover:

- Vite development routing under `/app`.
- Built artifact paths rooted under `/app/`.
- Vercel filesystem-first rewrite behavior for `/app` and internal routes.
- Desktop and mobile direct navigation and client-side navigation.
- Server startup and cleanup on exact port `8791`.

## 10. Deployment configuration

`osp-read-api` has `verify_jwt = false` in `supabase/config.toml` because Supabase's gateway does not validate Kinde-issued tokens. This does not disable authentication in the function; the function performs the mandatory Kinde validation described in section 5 before any read.

The dedicated function's CORS allowlist is exactly:

- `http://localhost:8791`
- `https://osp.heymarksman.com`

No wildcard or fallback origin is returned. A disallowed origin receives no permissive CORS header.

Required future configuration is documented but not applied in Phase 1 implementation:

- Register Kinde API audience `https://osp.heymarksman.com/api`.
- Link the audience to the existing frontend application.
- Define and assign `osp:read`.
- Preserve exact local and production callback/logout URLs.
- Configure the server-side issuer, audience, Supabase URL, and service-role secrets.

No Kinde change, Supabase secret change, Edge deployment, Vercel deployment, live request, data mutation, email action, signature provisioning, push, or merge is authorized by this design.

## 11. Error and audit contract

Browser errors have this stable form:

```ts
type OspSafeError = {
  error: {
    code: string;
    incident_id: string;
  };
};
```

The API may use `400`, `401`, `403`, `405`, `415`, `429`, and `500` as appropriate. It never returns raw exception messages, SQLSTATE details, relation names, constraints, upstream Gmail messages, token claims, private paths, or configuration values.

Internal logs use the incident ID and structured safe metadata. Sensitive payloads are omitted.

## 12. Test strategy and stop rules

Every implementation task follows red/green/refactor and ends with a focused review.

Required adversarial regressions include:

- Missing, wrong, or multiple audiences.
- Wrong issuer, expired token, future token, algorithm mismatch, unverified email, missing permission, missing or ambiguous organization.
- Raw POST attempts for every consequential Provider Service and Gmail action.
- Tenant identifiers supplied by the browser.
- Cross-tab A-to-B user and organization swaps with pending requests.
- Local Storage token-fallback attempts.
- Callback failure and malicious `returnTo` values.
- Every invalid metric input described in section 6.
- Gmail watch expiry, token expiry, Pub/Sub absence, last error, malformed timestamps, and clock boundaries.
- Private path/name redaction in import and error output.
- Binary, filename, frame, action, loader, symlink, junction, traversal, and stale-dist verifier bypasses.
- Vercel route behavior and exact-port cleanup.

The work remains `NO-GO` if any of these conditions holds:

- A browser-reachable consequential action exists.
- Audience, verified email, organization, permission, or tenant mapping is optional.
- A stale-session result can enter another identity's cache.
- Missing metrics render as zero or stale Gmail health renders as `watching`.
- Any private locator, filename, document, or signature asset exists in the branch or bundle.
- Production build can bypass verification.
- The sanitized branch gains the previous branch as an ancestor.
- Any supported root, Provider Service, action-contract, OSP, verifier, route, or E2E gate fails.
- Independent review reports an open P0, P1, or P2.

## 13. Acceptance criteria

Phase 1 is complete when:

1. The branch remains based on current `origin/main` without contaminated ancestry.
2. The clean-main baseline and all reproduced post-change gates pass.
3. OSP renders its authenticated shell and read-only pipeline at `/app`.
4. The browser contains exactly the two approved read operations and calls only `osp-read-api`.
5. The server requires exact Kinde identity, audience, organization, verified email, `osp:read`, and canonical workspace mapping.
6. Cross-tab identity changes cannot mix cache or UI data.
7. Metrics and Gmail health follow the strict semantics in section 6.
8. No private document or signature data exists in Git, logs, reports, frontend, fixtures, or bundle.
9. Vercel cannot publish without a fresh successful build verification.
10. Local routing and desktop/mobile E2E pass on exact port `8791` with cleanup proof.
11. Documentation clearly separates local evidence from live production proof.
12. Independent review returns `GO` with no open P0, P1, or P2.

## 14. Deferred work

The following remain outside Phase 1:

- Live Kinde or Supabase configuration.
- Production deployment or connectivity proof.
- Gmail OAuth, sync, watch renewal, capture, or sending.
- Document upload or processing.
- Entity Vault provisioning.
- Package assembly.
- Approval, graphical signature, Sales authorization, or reply delivery.
- Any production data mutation.

Each deferred capability requires its own approved design, backend permission, negative authorization tests, idempotency controls where applicable, and explicit authorization before external effects.
