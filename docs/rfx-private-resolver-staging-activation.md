# Private resolver staging activation — Beta 10.1

The user authorized Sprint 10.1 preparation. The authorization covers the
read-only environment inventory, staging design and release evidence in this
sprint. It does not authorize paid resource creation, production mutation or a
remote canary.

The inventory found the healthy `rateware-prod` parent and one persistent
preview branch named `fcm-gmail-staging`. That branch belongs to the Freight
Cost Model Gmail receiver and a different Git branch, so it is rejected for
MARKSMAN Loads. The default `main` branch is production and is also rejected.
GitHub exposes `Preview` and `Production`, but no protected `Staging`
environment. The checkout is not linked to a remote project.

The correct target is a dedicated persistent preview branch named
`marksman-loads-staging`, fixture-only and without cloned production data. It
has not been created because billing acknowledgement and resource-creation
authorization are still absent. Named release, security, monitoring and
rollback owners also remain unassigned.

Decision: `ACTIVATION_PREPARED_TARGET_NOT_SELECTED`.

No project, branch, GitHub environment, secret, migration, function, scheduler,
bid or external message was created or changed.
