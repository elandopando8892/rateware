alter table public.provider_compliance_evidence_links add constraint provider_compliance_evidence_links_kind_check check (evidence_kind in ('document','external','manual'));
alter table public.provider_compliance_evidence_links add constraint provider_compliance_evidence_links_status_check check (status in ('active','revoked','superseded'));
alter table public.provider_compliance_evidence_links add constraint provider_compliance_evidence_links_verified_check check (verified_at is null or nullif(btrim(coalesce(verified_by_user_id,'')),'') is not null);
