# Backend Action Contract

## Purpose and boundary

Phase 0.1 records governable backend surfaces in a canonical, versioned contract and blocks unreviewed source, metadata, dependency, lifecycle, and inventory drift. It is a static developer control only.

The contract **does not perform authorization enforcement**. It is not imported by the application, frontend, or Edge runtime; it does not change authentication, tenant resolution, data access, endpoint responses, full-access, RLS, shadow evaluation, pilot behavior, or permissions.

## Repository-driven discovery

Discovery starts from the committed repository structure:

1. enumerate every directory under `supabase/functions`, excluding only `_shared`;
2. treat each tracked `index.ts` as an Edge entrypoint candidate;
3. recognize literal comparisons, static template literals, switch cases, deterministic object handler registries, deterministic `new Map` registries, direct or safely sanitized aliases of `body.action` (including literal bracket access), and reviewed fixed HTTP-method endpoints;
4. emit a blocking candidate for nonliteral templates in comparisons or switch cases (including comment-separated cases), spreads or computed registry keys, callback wrappers, conflicting handler attribution across registries, ambiguous fallbacks, unresolved registries, multiple dispatchers, mutable aliases, and entrypoints whose dispatch cannot be resolved safely;
5. record directories without `index.ts` separately and require an explicit non-governable disposition;
6. scan migration statements while respecting comments, strings, quoted identifiers, and dollar-quoted bodies, then replay `CREATE FUNCTION`, `CREATE OR REPLACE FUNCTION`, and `DROP FUNCTION` in filename and statement order.

This is conservative static analysis, not a universal JavaScript, TypeScript, or SQL parser. Recognized structures are inventoried; ambiguous structures block; no dynamic surface is reported as verified merely because a pattern returned no rows.

## Handler states

- `inline-real`: the dispatch branch itself demonstrably returns or performs the operation.
- `named-existing`: dispatch names a local or deterministically imported/re-exported function whose declaration is present.
- `named-missing`: dispatch names a function whose declaration is absent; validation fails.
- `undetermined`: static structure cannot establish a handler; validation fails.

Inline is never used as a fallback for a missing named function. A preliminary guard or lookup is not selected merely because it is the first call in a branch. Multiple plausible operations remain `undetermined` and block validation. A generic function or member call that receives an inline callback is treated as a wrapper, not asserted as the terminal business handler. Babel AST identity, lexical bindings, invoked local functions, computed properties, aliases, declarations and assignment destructuring, `Object.assign` mutations, and receiver state determine that classification. Alternative `if`/`else`, `try`/`catch`, and loop paths are joined conservatively; an array transform is certified only when the modeled alternatives do not include a known non-array receiver. Trivial local functions and IIFEs with a directly demonstrable array return are recognized. If AST parsing fails, the handler is unconditionally `undetermined`; lexical analysis cannot certify it. Deterministically imported or re-exported handlers remain valid during the repository-backed validation pass.

## Canonical identity

- Edge: `edge.<edge-function>.<stable-action-name>`
- PostgreSQL: `rpc.<schema>.<function>(<input-type-signature>)`
- Non-governable declaration: `declaration.edge.<directory-name>`

RPC signatures distinguish overloads. Argument names, defaults, comments, line positions, and irrelevant formatting are excluded from signature identity. A signed `DROP FUNCTION` removes its exact active signature. A signature-free DROP removes a function only when exactly one active overload exists; multiple active overloads are ambiguous and block validation. Multi-target DROP statements evaluate every target. `IF EXISTS`, `CASCADE`, `RESTRICT`, later recreation, quoted names, arrays, schema-qualified types, defaults, and variadic arguments are covered by the production tests.

A potential rename is not silently treated as unrelated deletion/addition: matching source/handler evidence emits `RENAME_REQUIRES_DISPOSITION`. Rename, alias, split, merge, deprecation, and removal still require explicit human disposition. Leading SQL trivia is scanned with nested block-comment awareness so a real statement after nested comments cannot disappear.

## Sensitive metadata review

Each surface has a reviewed metadata fingerprint covering action name, source kind/file, handler, endpoint, module, operation, resource, read/write access, exposure, sensitivity, tenant relevance, proposed permission, functional owner, decision status, lifecycle, replacement, analysis coverage, coverage signals, and RPC signature.

Changing any covered field without deliberately refreshing its reviewed fingerprint blocks validation. The fingerprint is evidence of an explicit contract diff, not proof that the new classification has been approved.

## Source and authorization fingerprints

Direct source fingerprints use lexical tokens that ignore comments and formatting while preserving strings and code tokens.

Authorization envelope fingerprints include the complete Edge source and recursively observed local static imports, side-effect-only imports, and literal dynamic imports. Legal comments between import tokens and module specifiers do not remove a dependency from the envelope. Deterministic local re-exports used for handler attribution are followed. The fingerprint therefore changes with observed dispatch, wrappers, authentication helpers, tenant/service-role guards, and other determinable shared local dependencies.

Coverage is recorded with explicit signals: `direct`, `shared_dependency_observed`, `unresolved_local_dependency`, `dynamic_dependency`, `external_dependency`, and `coverage_not_determinable`. External imports are identified but their semantics are not claimed as locally covered. Nonliteral dynamic imports and unresolved local imports produce `coverage_not_determinable` and block validation; they are never silently downgraded to direct coverage. Import cycles terminate through a visited-file set.

An unresolved local dependency or non-determinable dispatch is a blocking error. Local-looking path aliases such as `@/`, `~/`, and `#/` are blocked unless a future resolver can determine them; they are not classified as external packages. The mechanism does not claim semantic certainty for remote modules, runtime reflection, generated code, arbitrary wrapper semantics, or provider behavior. It remains a conservative recognizer rather than a universal JavaScript, TypeScript, or SQL parser.

## Counts after hardening

Committed-source discovery produces:

- 284 active Edge operations;
- 63 active PostgreSQL/RPC signatures;
- 347 active discovered surfaces;
- 244 `rateware-api` actions.

The contract retains 349 rows because two historically counted RPCs are now proven absent after committed `DROP FUNCTION` statements:

- `public.rateware_rfx_lane_rate_score(public.rfx_lanes,public.rate_staging)`;
- `public.rateware_rfx_text_match_score(text,text,integer)`.

They remain active contract records with `REMOVED_WITHOUT_DISPOSITION` errors until H07 receives human approval. Counts were not forced back to 349.

## Decision and lifecycle boundary

The contract preserves 256 `pending_human_approval`, 27 `explicitly_allowed`, and 66 `internal_only` rows. No pending surface is converted to allowed.

H07 remains **PENDING HUMAN APPROVAL**. Duplicate names, dead candidates, aliases, removals, replacements, merges, and retirements are not decided by this hardening. Consequently Phase 0.1 is technically hardened but not complete.

`whatsapp-healthcheck` has no committed `index.ts`, is not an active surface, and remains a historical non-governable declaration pending disposition.

## Workflow

1. Change real source in an isolated branch.
2. Run `npm run validate:action-contract`; new or ambiguous surfaces must fail.
3. Classify the difference without changing counts mechanically.
4. Update the contract row and reviewed fingerprints in a visible diff.
5. For rename/removal/alias/deprecation, obtain the required human disposition.
6. Run `npm run test:action-contract`.
7. Review source, metadata, dependency, lifecycle, and count changes independently.

Warnings and informational findings remain visible. Errors always produce a non-zero validator exit.

## Later increments

Phase 0.2-0.10 may consume this contract only after separate authorization. This hardening adds no tenant model, persistent roles/permissions, authorization engine, CI platform, data change, shadow mode, pilot, or enforcement. H10 and process ownership remain **PENDING HUMAN APPROVAL**.
