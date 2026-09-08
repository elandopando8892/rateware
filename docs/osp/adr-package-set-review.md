# ADR: exact multi-form review basis

Status: policy, persistence and authoritative SQL source connected and tested locally; human-review UI/API activation pending.
Date: 2026-09-08
Decider: product owner requested continuation of the multi-form package workflow.

## Context

Generating every file does not establish that every carrier requirement is met.
Existing approvals and signature jobs identify a single generated package. A new
set must not reuse an old single-file signature or a generic case-level approval.
OSP remains XBF customer registration, using the existing Rateware/OSP database.

## Decision

Prepare one canonical review basis binding organization, case/version, input
snapshot hash, request-contract hash, set identity/version/manifest hash and every
member's source identity, output bytes, requirement identity, persisted review
decision and signature policy/version. Input order does not change the digest.
Missing/extra/duplicate members, unresolved reviews, unverified completeness and
changed hashes stop preparation. Autograph remains distinct from image signature.
Preparing the basis does not approve anything or prove an autograph exists.

The internal policy accepts trusted inputs only. It has no HTTP route and is not
yet invoked by the approval command. The next adapter must load authoritative
decisions under the same database lock as current set/case checks and persist the
exact basis with actor and idempotency evidence before advancing Operations.
Do not expose completenessVerified as an authority-bearing browser checkbox.

## Options and consequences

- Approve first file: rejected; omits independent originals.
- Approve only set UUID: rejected; does not bind request/review/policy revisions.
- Bind complete canonical basis: selected; explicit stale-review detection, but
  requires an additive transactional approval path and set-wide signature jobs.

The workflow projection now suppresses all downstream capabilities when a set is
present, including draft/freeze/Sales/send capabilities formerly derived from a
legacy signed file. This is a projection safeguard, not a new database permission
or a substitute for endpoint enforcement. Existing semantic guards remain intact.

## Evidence and remaining work

51 typed tests pass: 14 review-basis cases, 13 workflow-view cases, 7 existing
multi-form semantic regressions, 8 Operations/signature regressions and 9 set-reader
tests. Lint passes for the new policy/tests. An initial
typecheck failed to narrow a possibly absent map lookup through an inferred arrow
helper; an explicit never-returning function fixed it, without disabling checks.

- [x] Exact review-basis policy and adversarial unit tests.
- [x] Prevent legacy signed-file capabilities for a current multi-form set.
- [x] Implement and locally test atomic review-basis/actor persistence with the existing transition.
- [x] Implement authoritative per-output review loading as the persistence adapter default.
- [ ] Connect authenticated human-review capture and the UI command boundary.
- [ ] Recheck the same basis in signature, Sales and outbound execution.
- [ ] Real-schema integration, preview and controlled production verification.

No deployment, migration, business-data mutation, signature or outbound action in
this increment. The historical Salzillo case is unchanged. This is not the closure
of multi-form approval in production.

## Transactional persistence increment

`package-set-review-store.ts` uses one tenant transaction for an advisory
idempotency lock, exact receipt replay, trusted locked-context loading, review
digest verification, the existing `complete_operations_review_command`, and
the immutable review receipt. Failed persistence rolls back both the existing
case transition and its audit event. Replay checks current actor authority but
does not re-approve or reload mutable evidence. Changed commands conflict.

The additive migration `20260908180000_osp_package_set_operations_reviews.sql`
adds an append-only tenant receipt ledger with set/case identity constraints.
It grants only select/insert to the existing workflow role; neither workers nor
browser roles receive access. It creates no job and does not activate a route.
The role remains a trusted server boundary, not a permission exposed to a user.

At that checkpoint the source loader was an explicit test seam: existing mapping
decisions do not prove final-output completeness. The following increment supplies
the SQL implementation. No UI capability is enabled by the adapter itself.

Validation: 21 typed tests including six PostgreSQL integration steps. PGlite
executes the actual new migration and the existing Operations command definition
against a reduced parent schema. The actor and snapshot helper dependencies and
locked decision loader are explicit test seams, not full deployed-schema proof.
The real TypeScript actor policy is exercised. Tests cover rollback after transition,
stale/rejected evidence, unauthorized identity, immutable receipts, exact replay,
tenant read/write denial and the 256-character idempotency boundary. Existing
approval-store regressions remain passing. No multi-session concurrency claim.

Initial failed probes are retained in task output: two unknown-row TypeScript
errors, a noncanonical synthetic session timestamp, then PostgreSQL rejecting a
`{1,256}` regex quantifier. Explicit row typing, a canonical timestamp and separate
length/character validation fixed them without disabling checks or weakening policy.

## Authoritative final-output review source

`20260908190000_osp_package_set_member_reviews.sql` adds append-only human decisions
over exact output hashes, scoped to the current set and request manifest. Approval
records full-output inspection, reviewed completion percentage and page count;
these are explicit human attestations, not LLM self-certification or occupied-cell
heuristics. A SQL trigger checks actor authority, locks the case, verifies the
current member/output identity and enforces sequential review versions. No browser
or worker role receives access. There is no backfill from mapping decisions.

`loadLockedPackageSetReview` is now the default source of the transactional adapter.
It locks the case/current set, relevant sources and review records in the same
transaction; verifies the latest resolved contract, approved original/hash/snapshot
membership and newest per-output decisions; and binds each form through its unique
source citation. It reuses the existing corporate-document evidence evaluator for
formats and validity, and the existing pre-signature semantic gate for completeness.
Autograph and image policies remain distinct; no signature is inferred or applied.

The PostgreSQL integration now exercises the actual new migrations, locking helper,
review trigger, default SQL loader, semantic evaluation and atomic store together.
The parent schema is still reduced and the pre-existing actor/snapshot SQL helper
dependencies are test stubs; this is not a deployed-schema or multi-session test.
Eight steps cover rollback, missing reviews, rejected source, unresolved contract,
stale case version, incomplete output, missing corporate evidence, successful
two-file review, replay, immutable receipts and tenant isolation. Negative probes
that insert newer incomplete reviews are rolled back rather than deleting evidence.
The combined typed regression run passes 70 tests and eight integration steps;
lint and all 168 action-contract checks pass. Only the 12 case-API dependency
fingerprints changed; no new HTTP action or permission is exposed.

Pending: authenticated per-output review capture in the API/UI, deployed-schema
and concurrency verification, then explicit set-wide signature/Sales/send consumers.
The new adapter is not wired to an HTTP action and all set-wide UI capabilities
remain disabled. No migration has been applied remotely and no historical case
has been modified. Production readiness remains an estimate, not a test percentage.

## Download identity correction before review capture

Runtime composition previously forced `XBF-OSP-Supplier-Package.xlsx` for every
signed Storage download, including PDF/DOCX set members. The view now supplies a
source-UUID-based name with the verified MIME extension for each member, and
composition forwards it to Storage. The legacy single-XLSX name stays unchanged.
No browser-provided path/name is accepted. This fixes inspection prerequisites;
it does not implement the pending review-capture UI or activate any approval.
Focused validation: 27 tests (name/format, workflow projection and composition)
plus lint. No new route, permission, migration or deployment in this correction.

## Internal inspection command (not yet exposed)

Decision: separate saving a member inspection from completing Operations. Reuse
the existing tenant transaction, fresh actor policy and database insert guard;
do not introduce a second approval workflow or allow browser table writes.
`createPackageMemberReviewStore.save` records the inspected output hash, set,
request, completion/page attestations and signature requirement. It checks the
current case version and exact latest input snapshot before writing. Approval of
an inspection does not mean that the whole request is fulfilled: the existing
set-wide semantic evaluator remains responsible for that later decision.

The additive `20260908200000_osp_member_review_command_identity.sql` stores a
command digest. Existing evidence remains immutable with a null digest, so it
cannot accidentally be claimed as an idempotent application replay. The caller
retains a UUID for a retry; identical authenticated commands replay the receipt,
while a changed decision or principal conflicts. Every request checks current
authority and session freshness. A fresh login by the same still-authorized
principal can reconcile the original UUID without creating another inspection;
the original actor/session evidence is never overwritten. Review versions are
assigned under the existing case lock.

Rejected alternatives: writing directly from the UI (untrusted authority),
reusing mapping approvals (not final-output inspection), and advancing the case
on every member save (would skip package-wide completeness checks).

Integration uses the real writer instead of seeding the two human reviews with
raw inserts. It verifies invalid attestations, stale case/output, unauthorized
actors, exact replay, changed-command conflict and no case transition/events.
The earlier reduced-schema and SQL-authority-stub limitations still apply.
No HTTP route, UI control or runtime import activates this writer yet. Next:
authenticated route, persisted review projection, per-file UI and browser proof;
then deployed-schema validation. No remote migration or business action performed.

## Authenticated inspection capture and read projection — candidate

The candidate runtime now wires `save_package_member_review` to the existing
verified-approval token verifier and internal member store. Its JSON boundary
limits streamed bodies to 8 KiB and rejects extra keys, tenant and actor claims.
Only verified identity supplies the actor. Conflicting/stale reviews return a
typed 409; no command is retried by the server. CORS requires the exact approval
proof and JSON headers. The new action is inspection-only, not case completion.

The workflow projection reads the latest persisted decision for each exact
set/output and returns its request hash. Operations renders this saved evidence
and displays when the request has changed. The UI sends a persistent retry UUID;
an uncertain response locks the original answers for reconciliation. Session
storage contains inspection command metadata only, never authentication tokens.
The server remains authoritative over permissions, versions and evidence.

Local evidence: 35 API/projection/composition tests; 28 UI/client tests; the real
PostgreSQL member writer and reload projection within the existing eight-step
integration; one Chrome harness test verifies signed synthetic identity, save,
reload, and one request across desktop/mobile. The browser harness uses controlled
responses, not Supabase. Initial browser run failed because the harness lacked
the new callback; wiring it produced a passing repeat. Visual inspection then
found crowded mobile labels; grid spacing was added and needs a refreshed capture.
An initial fixture type error was fixed without skipping TypeScript checks.

Still required: final release checks, actual routed-app/preview verification,
fresh-session reconciliation UX and set-wide Operations completion. No production
activation or claim that Hito 1 is complete. The plan's remaining signature,
Sales, fidelity and deployment gates are unchanged.

## Set-wide Operations command — candidate connected

The workflow read now evaluates all persisted inspections and corporate evidence
under the existing context lock. Only a valid complete basis yields
`operationsReviewSha256`; the UI submits this exact digest on the existing
Operations command. The command reloads/revalidates the basis inside its atomic
transaction before advancing to signature review. It never applies a signature.
The legacy single-package approval adapter locks the case and rejects a current
set, preventing direct callers from omitting the new digest to bypass set review.
The read projection uses the set's evaluated matrix when complete rather than a
contradictory legacy single-file matrix.

Both inspection and set-review retries reauthorize the current session but bind
idempotency to the principal. A fresh session of the same authorized principal
can recover the immutable original receipt; a changed principal or decision
cannot. Operations routes request fresh authentication when required.

The worker envelope changes because `reviewed-spreadsheet-targets.ts` imports
`FormComponentSchema` from the UI contracts file; adding inspection fields to
that file changes its dependency fingerprint without changing the worker's
spreadsheet mapping behavior. Focused spreadsheet regressions pass. Fingerprints
must still be reconciled against the final frozen candidate before release.

Latest live read-only check: 2026-09-08 19:06:14 UTC, shared project
`alqjqzqagdmcywpjtnnr`, PostgreSQL 17.6. `supplier_package_sets`,
`package_set_member_reviews` and `package_set_operations_reviews` are absent.
Vercel still serves `dpl_Ggf4PYD79X66rfFLipw3kNuj5Fhe` / `ed12d1658fce` at
`osp.heymarksman.com`. These checks do not activate anything.

Remaining verification: final typed regressions and fingerprints, refreshed
browser capture, actual routed-app authenticated preview and full-schema rehearsal.
The latest browser retry timed out while still loading, and the UI runner failed
to start workers before running tests; neither is a PASS. Avoid simultaneous
validation edits, retain failed outputs, and rerun only terminal attempts.
Signature-policy selection still exposes a technical version field; replace it
with verified per-file policy selection before claiming a pragmatic production UX.
# Reconciliación de lectura y recuperación — 8 de septiembre de 2026

Actualización posterior: [el ensayo nativo](package-review-native-rehearsal-20260908.md)
reemplazó los sustitutos de actor/snapshot por validadores reales, aplicó las
cuatro migraciones de conjuntos y descubrió/corrigió la codificación JSON de los
dos stores nuevos. PostgreSQL 17.11 pasó diez pasos y dos sesiones concurrentes
produjeron un único recibo. Esto supera la evidencia anterior reducida, pero no
certifica todo el esquema productivo ni el recorrido de UI.

La consulta de sólo lectura del catálogo
`public.provider_legal_entity_document_assets` del tenant OSP encontró dos actas
constitutivas y un INE activos, con `verification_status = verified` y referencia
de almacenamiento. No se deben pedir otra vez como si nunca se hubieran cargado.
Esto no verifica los bytes, la vigencia del documento de identidad, la entidad
exacta ni su inclusión/divulgación en un paquete. No apareció un poder notarial
como documento separado; tampoco se presume que el acta lo sustituya.

El evaluador nuevo de conjuntos todavía consume `osp_private.document_versions`;
la conciliación de estos soportes corporativos con la selección y el manifiesto
exacto de entrega continúa pendiente. No añadirlos automáticamente saltándose
la revisión o la política de divulgación.

La UI ahora libera un reintento incierto cuando una lectura posterior confirma
el mismo reviewId, contrato, conjunto y hash de salida. Otra revisión no libera
el bloqueo y no se genera una segunda escritura. Se agregó la regresión de
refetch posterior al error. La prueba focalizada pasó con el timeout normal:
una aprobada y 16 omitidas por el filtro, 3,84 segundos de ejecución de prueba
y 112,18 segundos totales de arranque/carga/ejecución. No es una prueba del router
real ni del backend desplegado. El contrato completo pasó: 169/169 superficies,
una prueba, cero fallos (650,56 segundos totales). La suite posterior de UI y
cliente no ejecutó ninguna prueba: dos timeouts al iniciar workers después de
120,53 segundos. Sigue pendiente, no es una validación aprobada ni un fallo
funcional demostrado del recorrido. No se promueve este checkpoint por esos
resultados locales.
La comprobación TypeScript anterior a esta corrección terminó con código cero.
