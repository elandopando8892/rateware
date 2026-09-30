-- The no-write carrier peek verifies that each invitation was actually sent.
-- Fresh database replays need a server-only read grant for the evidence table.
-- Do not grant browser roles access to outreach messages.
grant select on table public.outreach_messages to service_role;
