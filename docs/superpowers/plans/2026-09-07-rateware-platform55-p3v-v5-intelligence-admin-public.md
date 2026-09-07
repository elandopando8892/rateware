# Rateware Platform 55 P3-V5 — Intelligence, Administration, and Public/Entry

## Outcome

Make the remaining twelve Platform 55 routes read as three coherent MARKSMAN workspaces without changing their production controllers, route URLs, data contracts, permissions, or human-approval gates.

The user-visible result is a disciplined visual system where:

- intelligence pages distinguish observed evidence, data-as-of, gaps, and recommendations;
- administration pages make configuration scope, auditability, and read-only/read-write boundaries explicit;
- public and entry routes remain useful and branded without exposing private tenant controls.

## Scope and non-scope

### In scope

- Add presentation-only P3-V5 hooks to the twelve existing HTML routes.
- Extend shared MARKSMAN visual tokens, focus states, responsive layout, and route-family geometry.
- Add route-family context banners and accessible state hooks.
- Certify loaded, empty/blocked/error, signed-out, permission-denied, keyboard-focus, contrast, and overflow states at desktop/tablet/mobile viewports.
- Record exact source identities and browser evidence for independent review.

### Explicitly out of scope

- No Supabase schema, SQL, DDL, DML, Edge Function, auth, CORS, secret, or tenant-enforcement changes.
- No changes to existing IDs, event handlers, API calls, mutations, exports, pagination, or authorization semantics.
- No automatic recommendations becoming actions; no catalog sync, campaign launch, invitations, bids, messages, or production writes.
- No public route may gain private workspace navigation or tenant data.

## Route families

| Family | Routes | Visual contract |
|---|---|---|
| Intelligence | `business-intelligence.html`, `growth-hacking.html` | Evidence first; data-as-of and gaps remain adjacent to, but visually separate from, proposals/recommendations. |
| Administration | `settings.html`, `interpretation-memory.html`, `catalog-workbench.html` | Configuration is scoped, observable, and auditable; destructive or privileged actions retain explicit confirmation and fail-closed status. |
| Public/entry | `bid-room-board.html`, `carrier-profile.html`, `customer-rfi.html`, `index.html`, `ratebook-carrier.html`, `rfx-bid.html`, `shipper-profile.html` | MARKSMAN public shell, clear private/public boundary, helpful loading/empty/denied/error states, and no private tenant controls. |

## Capacity and model

Two-week sprint, one primary implementer, planned at 75% capacity (roughly 6 effective engineering days plus buffer for review and browser certification). Recommended model: GPT-5.6-terra with high reasoning for the implementation and test design; GPT-5.6-luna with medium reasoning is sufficient for mechanical follow-up fixes. The high-reasoning pass is required because twelve routes have distinct access and controller seams, not because the CSS is complex.

## Implementation sequence

1. Verify repository root, branch, HEAD, worktrees, status, route matrix, and current source identities.
2. Add the P3-V5 route classes/data attributes and visible boundary copy without replacing existing markup contracts.
3. Extend `src/platform55-visual-parity.css`, `src/platform55-intelligence-admin.css`, and create/extend `src/platform55-public.css` only for presentation primitives.
4. Add a contract test covering all twelve routes, family separation, accessibility hooks, non-happy states, and forbidden autonomous effects.
5. Add a browser certification tool that reports per-route/per-viewport loaded and non-happy evidence; it must be read-only and use synthetic/local state only.
6. Run targeted P3-V5 tests, existing visual-parity suites, action-contract validation, and diff checks. Preserve unrelated worktree changes.
7. Generate immutable source-supersession evidence and request independent review. Do not claim route acceptance until every route is independently `GO` at all required viewports.

## Exit gates

- [ ] All twelve routes contain the correct P3-V5 family hook and a visible boundary appropriate to their access model.
- [ ] Intelligence evidence, data-as-of, gaps, and recommendations remain semantically separate in DOM and visual hierarchy.
- [ ] Administration actions remain scoped/auditable and fail closed when evidence or permission is missing.
- [ ] Public/entry routes expose no private tenant controls or tenant data.
- [ ] Loaded and route-specific non-happy states pass at desktop, tablet, and mobile widths.
- [ ] Keyboard focus, accessible names, contrast, reduced-motion, and horizontal-overflow checks pass.
- [ ] No unexpected network write, message send, invitation, bid, catalog sync, campaign activation, or tenant mutation occurs during certification.
- [ ] Exact source SHA/tree and evidence are recorded; independent review returns `GO` with no P0/P1/P2 findings.
- [ ] Only after all twelve independent `GO` results may the route matrix advance P3-V5 to 90%.

## Release narrative to provide when complete

Report the sprint as a finished development with five parts: (1) business outcome, (2) routes and visible UX changes by family, (3) validation evidence and exact commit/deployment status, (4) what was intentionally not executed, and (5) the next sprint or remaining gate. Keep production deployment and external communications behind the existing explicit authorization.
