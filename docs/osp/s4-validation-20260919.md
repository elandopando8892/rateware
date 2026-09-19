# S4 read workspace validation — 2026-09-19

Status: local candidate; not released or certified end to end.

Base: `5120c1f4`, branch `codex/osp-production-closeout-20260908`.

The pending change returns an explicit not-ready workspace when the current
reviewed request cannot be assessed. Authentication, tenant and unexpected
dependency failures must continue to propagate. Finalization commands retain
their fulfillment checks.

Verified this session:

- Deno workflow-view and handler tests: 32 passed, zero failed.
- Vitest workflow-client and approval-communications-pages: 33 passed, zero failed.
- Vite build from `apps/osp`: 435 modules, successful. A prior invocation from
  repository root built a different entry; it is excluded from OSP evidence.
- Remote `osp-case-api`: ACTIVE version 193, bundle SHA-256
  `8946ff474280dee061f2089a216e010fb3b97bbb70a7bc5c4bb2fdadcd3bbdc6`.
- Remote `osp-worker`: ACTIVE version 224, bundle SHA-256
  `de6cf191e195505b31908fbf1383d65351d1a3fbc028f4792686302e56c311a9`.

Terra confirmed and corrected the circular inspection condition: an evaluated
matrix with pending inspections allows recording inspection, while finalizing
Operations remains blocked. The explicit not-ready sentinel still disables
inspection. Post-correction workflow-view and handler suite: 33 passed.
The scoped diff whitespace check passed. Terra independent review: PASS after
the correction, with no further S4 findings on security, null contracts,
unexpected error propagation or legitimate remediation.

Remaining: independent review, final focused checks, commit/private push,
candidate deployment, authenticated Crane read and remediation journey.
No business records, signatures or outbound messages were changed in this session.

## Authenticated baseline before S4 release

Chrome session `ops@xbfreight.com` opened Crane
`f2fa004f-d674-446c-80ca-e929cce75b51` in production.
The review route still showed the unavailable-workflow error. The case root
loaded successfully, with four open decisions, 20/22 field mappings, XBFUS
identified by the request, no bound profile and no internal draft.
The entity selector initially showed XBFMX despite that XBFUS request context;
no selection or binding was submitted. This mismatch needs correction before
the positive journey is certified.

Persisted answers already include the incorporation correction and delivery
contact. Pending decisions concern signature position, VAT applicability,
insurance status and amount. The COI MVP note is visible but does not resolve
those decisions. The historical interpretation and current review are both
shown; their different counts must not be treated as completed requirements.

## Release and live finding

Commit b941e943 pushed to the private OSP repository. API v194 ACTIVE,
bundle `ce3a4b05254b061310422d04f6e318d940e55733156b5018ed66f2ead53a2887`.
Preview `dpl_42EsUftKrbiMycAKoxC2zhrXnYDa` READY; protected review route
returned HTTP 200 using Vercel CLI. Production promotion
`dpl_BmheKHUYgWvPqESQxDWovfLfWMcX` READY with osp.heymarksman.com alias.
UI rollback: `dpl_3CS3cwR2HbqQogUaeYnpc8w2BZEv`; API rollback v193.

Authenticated live review now loads but displays only "No evidence package is
ready for review." The component returns before rendering fulfillment when
inputSnapshot is null. This contradicts S4's complete UI exit criterion.
A local follow-up now renders the matrix and request link in that branch;
regression reproduces awaiting_clarification with null snapshot. Pending check
and release. No case mutations or outbound actions occurred.
