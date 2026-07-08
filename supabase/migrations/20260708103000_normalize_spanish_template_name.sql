update public.outreach_templates
set
  name = 'RFx carrier invitation - Spanish',
  active = true,
  is_default = true,
  updated_at = now()
where owner_email is null
  and (
    name = 'RFx carrier invitation - Spanish'
    or name like 'RFx carrier invitation - Espa%'
  );
