alter table public.provider_portal_requirement_responses add constraint provider_portal_requirement_responses_revision_check check (revision > 0);
alter table public.provider_portal_requirement_responses add constraint provider_portal_requirement_responses_status_check check (status in ('draft','submitted','under_review','accepted','rejected','correction_required'));
alter table public.provider_portal_requirement_responses add constraint provider_portal_requirement_responses_payload_check check (nullif(btrim(coalesce(response_text,'')),'') is not null or document_version_id is not null);
