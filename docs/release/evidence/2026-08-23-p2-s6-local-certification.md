# P2-S6 local Platform55 shell certification

Date: 2026-08-23

Local implementation verdict: **GO**

Independent review: **PENDING**

Global Platform55 verdict: **NO-GO** until detached independent review, preview, production deployment, smoke, and monitoring gates are completed.

## Immutable product candidate

- Candidate SHA: `31ca1105865570acd575ae17eeb25c236df45c7c`
- Candidate tree: `1421417c0f737d8bbd4a420300812f11c38af628`
- Direct parent SHA: `512c15679957abd5dcbfeee4afe3208d76edab92`
- Original S6 base SHA: `858f8102cb3b5c7ce74955b00e7ac357b6511cdf`
- Matrix SHA-256: `0a5ee5b28467afd3a978b803e4c3ed53bc14f9c507aa3fc835d07a2d60f779db`
- Reference disposition SHA-256: `7791637bf6dc530698848ba168505e6966825771be6e7f0de542114100de6667`
- Geometry baseline SHA-256: `12b469d2c9edb322f28ad755c224a1fff7ee5f231c7b84e4f08dd4417d67b3f9`
- Geometry projection SHA-256: `9f88ad27e79f790c9590bb6832f2761b35523e614c0e6c2a142936190a09178a`
- Browser run manifest SHA-256: `862d00305774a9627d278a86a5b57b9b1b9fe92d619a641291bcd7e996af5fd4`
- Source supersession record SHA-256: `53fcacd4005c0070dc52499f506c255184fb2ea255dd9a325b27d8b27c34b71f`

## Machine audit

The deterministic audit stdout SHA-256 was `f6050ecc262db1b1c14de1f2d601bf66e6c0b27325158e222d8110a8ad164f97` and produced this sanitized result:

```json
{
  "candidate_sha": "31ca1105865570acd575ae17eeb25c236df45c7c",
  "routes": { "adopted": 29, "tenant": 22, "public_or_entry": 7, "errors": 0 },
  "build_matrix": { "namespaces": 12, "states": 1150, "resolved": 1150, "unresolved": 0 },
  "surface_inventory": { "records": 95, "dispositioned": 95, "invalid": 0 },
  "legacy_shell_selectors": 0,
  "ok": true
}
```

The 22 previously reviewed matrix decisions remain unchanged. The other 1,128 Build reference states are preserved as `reference_only` and receive no implementation credit.

## Browser certification

The local-only runner completed all 29 routes and 42 deterministic captures: one representative from every domain and public shell at `1440x900`, `1024x768`, and `390x844`, plus all five Command Center states at those viewports.

- Maximum shell boot: 303.7 ms against a 2,000 ms budget.
- Maximum CLS: 0.0799 against a 0.1 budget.
- Maximum JS/CSS transfer: 1,440,415 bytes against a 3,000,000-byte budget.
- Geometry drift: at most 2 px against the accepted P2-S5 baseline.
- Missing accessible names: 0.
- WCAG contrast samples: 3,312; minimum accepted ratio: 4.521:1; failures: 0.
- Document horizontal overflows: 0.
- External requests: 0.
- Unexpected writes: 0.
- Mobile drawer focus restore: PASS.
- Mobile drawer forward/backward Tab cycle: PASS.
- Search focus restore: PASS.
- Search dialog forward/backward Tab cycle: PASS.
- 200% text zoom reflow: PASS.

The browser contexts were fresh, the servers were loopback-only, and the only POST requests allowed by fixtures were explicit read-only RPCs. No screenshot or browser result is counted as production evidence.

## Historical evidence preservation

P2-S2 through P2-S5 manifests remain byte-immutable and anchored to their original subjects. Current-source parity may differ only for these exact S6-certified shared files, each bound to its exact candidate Git blob in `2026-08-23-p2-s6-local-certification.json`:

- `src/platform55-shell.js`
- `src/platform55-shell.css`
- `src/platform55-public-shell.css`
- `src/provider-service-page.css`
- `src/rateware.js`
- `src/staging-review.js`

Any additional path, wrong blob, historical-subject drift, current HEAD drift, or working-tree drift fails closed. This supersession does not retroactively alter historical screenshots or grant release credit.

## Boundaries

No push, pull request mutation, Vercel build, deployment, promotion, Kinde change, Supabase branch, migration, DDL, DML, secret change, upload, approval, or production-data mutation was performed. Formal progress remains General 81.6% / P2 80% until an independent detached review records GO for the exact candidate.
