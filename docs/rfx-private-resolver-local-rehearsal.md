# Private resolver local rehearsal — Beta 10.0

Beta 10.0 rehearses the resolver sequence only in disposable local
infrastructure. It verifies the pinned candidate, unit behavior, migration
replay and RLS in PostgreSQL, Edge Function type safety, the durable rate limit,
and the fail-closed canary switch.

This is not a staging deployment. No remote project, environment, secret,
migration, function, scheduler, bid or external message was created. Provider
monitoring, a remote rollback and an external canary remain blocked because no
staging target, named owners, billing acknowledgement or release authorization
exists. There is also no honest rollback target until an earlier deployment has
been explicitly approved and recorded.

The resulting state is:

`LOCAL_REHEARSAL_COMPLETE_REMOTE_BLOCKED`

The carrier experience remains unchanged. These controls are internal release
evidence and do not appear in the MARKSMAN Loads workspace.
