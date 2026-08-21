# Six migration files this branch was missing

**Corrected 2026-08-20.** An earlier version of this document said these six migrations
"lived only in production" and had been orphaned. That was wrong, and the way it was wrong
is worth keeping.

## What is actually true

This branch forked from `main` at `c5200a3`. Six migrations were applied to
`alqjqzqagdmcywpjtnnr` after that point, through `apply_migration`, while fixing defects.
No file was written for them at the time.

Someone else noticed the same drift and reconciled it: `main` now carries all six, in
commit `bc7686e`, *"Reconcile Supabase production migration ledger (#60)"*. Because this
branch forked earlier, it never received them — so they were missing **here**, but not
missing from the project.

| version | name |
|---|---|
| `20260819214744` | `provider_release_item_hash_check_null_safe` |
| `20260819221154` | `provider_release_approval_separation_allows_flagged_self` |
| `20260819223726` | `provider_mailbox_policy_enabled_domains_cardinality` |
| `20260819224030` | `provider_mailbox_domain_predicate_execution_hardening` |
| `20260821010804` | `provider_read_model_service_role_grants_chain` |
| `20260821011805` | `provider_command_service_role_grants` |

They are added here so this branch replays to the schema it was tested against. The
bodies match `main`'s byte for byte, because both were extracted from the same
`schema_migrations.statements` rows. Two differences, both trivial: these carry a comment
explaining what each one fixes, and they drop a doubled `;;` that the other extraction
left behind. **Expect a conflict on these six files when this branch merges. Either side
is correct; prefer whichever is commented.**

## How the wrong conclusion was reached

The comparison was run against the wrong baseline. Production was compared to the
**working tree of this branch** — 363 files against 369 applied migrations — and the
six-file gap was read as "production has work the repo lost."

The correct comparison is against `origin/main`, which had already been reconciled. A
`git fetch` earlier in the same session had even pulled that commit down; it simply was
not consulted before drawing the conclusion.

**The lesson is not "check migrations." It is: a drift check is meaningless without
naming what it drifted from.** "The repo is missing this" and "my branch is missing this"
are different claims with different consequences, and only one of them was true.

## The check, stated properly

    -- what is applied
    select count(*) from supabase_migrations.schema_migrations;

Compare against `git ls-tree -r --name-only origin/main -- supabase/migrations | wc -l`,
**not** against the working tree, unless the question really is about the working tree.
If they differ, recover the difference from `schema_migrations.statements` — after
confirming it is not already sitting on a branch someone else pushed.

## What remains true and worth acting on

`apply_migration` writes the database and stamps a version; nothing writes the file. That
gap is real, it leaves no trace in git, and no test in this repo detects it — the suite
runs against code, not against a replayed schema. Three of these six are constraints that
looked like they enforced something and enforced nothing (`null ~ regex` is NULL, and a
CHECK only rejects on false), so a database rebuilt without them would silently accept
what production rejects.

That hazard is why the drift check belongs before any deploy. It is just not the story of
these six files.
