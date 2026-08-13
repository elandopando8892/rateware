-- Provider Service Build 3: fail-closed document registry access boundary.

alter table public.provider_documents enable row level security;
alter table public.provider_document_versions enable row level security;
alter table public.provider_document_extractions enable row level security;
alter table public.provider_document_reviews enable row level security;
alter table public.provider_document_requirement_links enable row level security;
alter table public.provider_document_events enable row level security;

revoke all on table public.provider_documents from public, anon, authenticated, service_role;
revoke all on table public.provider_document_versions from public, anon, authenticated, service_role;
revoke all on table public.provider_document_extractions from public, anon, authenticated, service_role;
revoke all on table public.provider_document_reviews from public, anon, authenticated, service_role;
revoke all on table public.provider_document_requirement_links from public, anon, authenticated, service_role;
revoke all on table public.provider_document_events from public, anon, authenticated, service_role;
