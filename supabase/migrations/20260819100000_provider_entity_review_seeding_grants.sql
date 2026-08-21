-- Let the runtime create the human reviews it already knows how to decide.
--
-- service_role held SELECT and UPDATE on the review tables — enough to read the
-- review queue and to record a reviewer's decision, but not to create a review in
-- the first place. Nothing in the codebase created one, so the missing grant went
-- unnoticed until review seeding was built: every insert failed with
-- 'permission denied', with the documents already promoted into the vault.
--
-- INSERT only, and only on the two tables a seeded review needs. No DELETE is
-- granted: a review, once raised, is decided or cancelled through its commands —
-- never quietly removed by the runtime.
grant insert on table public.provider_entity_document_reviews to service_role;
grant insert on table public.provider_entity_document_review_fields to service_role;
