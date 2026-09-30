-- Match the server-side receipt read already available in the live environment.
-- Fresh migration replay lacked this grant. No browser role or write permission.
grant select on table public.outreach_messages to service_role;
