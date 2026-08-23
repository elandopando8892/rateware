# P2-S6 local Platform55 shell certification

Date: 2026-08-23

Local implementation verdict: **GO**

Independent review: **PENDING**

Global Platform55 verdict: **NO-GO** until detached independent review, preview, production deployment, smoke, and monitoring gates are completed.

## Immutable product candidate

- Candidate SHA: `9eec19fcb1ff45de204cb087a89d6a56bf256710`
- Candidate tree: `6e3c91a9361b986db38b9b28bbf353db11a980f1`
- Base SHA: `858f8102cb3b5c7ce74955b00e7ac357b6511cdf`
- Matrix SHA-256: `0a5ee5b28467afd3a978b803e4c3ed53bc14f9c507aa3fc835d07a2d60f779db`
- Reference disposition SHA-256: `7791637bf6dc530698848ba168505e6966825771be6e7f0de542114100de6667`
- Geometry baseline SHA-256: `12b469d2c9edb322f28ad755c224a1fff7ee5f231c7b84e4f08dd4417d67b3f9`
- Geometry projection SHA-256: `9f88ad27e79f790c9590bb6832f2761b35523e614c0e6c2a142936190a09178a`
- Browser run manifest SHA-256: `3e3bf78ee2150519c14c76594e090162ffec71c98beb023a34d3264983f190f0`
- Source supersession record SHA-256: `27e3d9ee387796684f9d6a2d6992be24edeeb5daec132cacc6674570b14b2878`

## Machine audit

The deterministic audit stdout SHA-256 was `9837672a66cdea7965b32a3bf0583b90be1965d368ac4444d42efda72af2b4cd` and produced this sanitized result:

```json
{
  "candidate_sha": "9eec19fcb1ff45de204cb087a89d6a56bf256710",
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

- Maximum shell boot: 317.1 ms against a 2,000 ms budget.
- Maximum CLS: 0.0799 against a 0.1 budget.
- Maximum JS/CSS transfer: 1,439,216 bytes against a 3,000,000-byte budget.
- Geometry drift: at most 2 px against the accepted P2-S5 baseline.
- Missing accessible names: 0.
- Document horizontal overflows: 0.
- External requests: 0.
- Unexpected writes: 0.
- Mobile drawer focus restore: PASS.
- Search focus restore: PASS.
- 200% text zoom reflow: PASS.

The browser contexts were fresh, the servers were loopback-only, and the only POST requests allowed by fixtures were explicit read-only RPCs. No screenshot or browser result is counted as production evidence.

## Historical evidence preservation

P2-S2 through P2-S5 manifests remain byte-immutable and anchored to their original subjects. Current-source parity may differ only for these exact S6-certified shared files, each bound to its exact candidate Git blob in `2026-08-23-p2-s6-local-certification.json`:

- `src/platform55-shell.js`
- `src/platform55-shell.css`
- `src/rateware.js`
- `src/staging-review.js`

Any additional path, wrong blob, historical-subject drift, current HEAD drift, or working-tree drift fails closed. This supersession does not retroactively alter historical screenshots or grant release credit.

## Boundaries

No push, pull request mutation, Vercel build, deployment, promotion, Kinde change, Supabase branch, migration, DDL, DML, secret change, upload, approval, or production-data mutation was performed. Formal progress remains General 81.6% / P2 80% until an independent detached review records GO for the exact candidate.
