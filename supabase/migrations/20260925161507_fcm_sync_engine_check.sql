-- QuoteDesk's hourly FCM copy also checks that its copy of the FCM engine still
-- calculates like the FCM (supabase/functions/sync-fcm-bases/engine-check.mjs).
-- Each run records the result; quotedesk-api reads the latest one to flag its
-- FCM estimates "en revisión" when the FCM changed.
alter table public.fcm_sync_runs add column if not exists engine_check jsonb;
