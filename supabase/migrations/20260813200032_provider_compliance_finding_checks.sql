alter table public.provider_compliance_findings add constraint provider_compliance_findings_code_check check (finding_code ~ '^[a-z][a-z0-9_]{1,127}$');
alter table public.provider_compliance_findings add constraint provider_compliance_findings_title_not_blank check (btrim(title) <> '');
alter table public.provider_compliance_findings add constraint provider_compliance_findings_severity_check check (severity in ('info','low','medium','high','critical'));
alter table public.provider_compliance_findings add constraint provider_compliance_findings_status_check check (status in ('open','remediation','waiver_pending','waived','remediated','accepted_risk','dismissed'));
alter table public.provider_compliance_findings add constraint provider_compliance_findings_waiver_check check (status not in ('waived','accepted_risk') or approval_request_id is not null);
alter table public.provider_compliance_findings add constraint provider_compliance_findings_resolved_check check (status not in ('waived','remediated','accepted_risk','dismissed') or (resolved_at is not null and nullif(btrim(coalesce(resolution_note,'')),'') is not null));
