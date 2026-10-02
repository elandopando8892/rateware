-- Ajuste exclusivo de permisos de la tabla creada en S15-02. No modifica filas.
begin;
revoke all on public.vendor_email_bounce_resolutions from service_role;
grant select, insert on public.vendor_email_bounce_resolutions to service_role;
commit;
