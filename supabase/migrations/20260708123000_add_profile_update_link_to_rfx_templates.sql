update public.outreach_templates
set
  html_body = replace(
    html_body,
    '<p><strong>Submit your bid here:</strong><br><a href="{{bid_link}}" style="color:#2563eb;font-weight:700">{{bid_link}}</a></p>',
    '<p><strong>Submit your bid here:</strong><br><a href="{{bid_link}}" style="color:#2563eb;font-weight:700">{{bid_link}}</a></p>

  <p><strong>Keep your carrier profile current:</strong><br><a href="{{profile_link}}" style="color:#2563eb;font-weight:700">{{profile_link}}</a></p>'
  ),
  whatsapp_body = replace(
    whatsapp_body,
    'Submit your bid here:
{{bid_link}}',
    'Submit your bid here:
{{bid_link}}

Update your carrier profile:
{{profile_link}}'
  ),
  placeholders = array(select distinct unnest(placeholders || array['profile_link']::text[])),
  updated_at = now()
where owner_email is null
  and name = 'RFx carrier invitation - English'
  and html_body not like '%{{profile_link}}%';

update public.outreach_templates
set
  html_body = replace(
    html_body,
    '<p><strong>Captura tu propuesta aqui:</strong><br><a href="{{bid_link}}" style="color:#2563eb;font-weight:700">{{bid_link}}</a></p>',
    '<p><strong>Captura tu propuesta aqui:</strong><br><a href="{{bid_link}}" style="color:#2563eb;font-weight:700">{{bid_link}}</a></p>

  <p><strong>Manten actualizado tu perfil de carrier:</strong><br><a href="{{profile_link}}" style="color:#2563eb;font-weight:700">{{profile_link}}</a></p>'
  ),
  whatsapp_body = replace(
    whatsapp_body,
    'Captura tu propuesta aqui:
{{bid_link}}',
    'Captura tu propuesta aqui:
{{bid_link}}

Actualiza tu perfil de carrier:
{{profile_link}}'
  ),
  placeholders = array(select distinct unnest(placeholders || array['profile_link']::text[])),
  updated_at = now()
where owner_email is null
  and name = 'RFx carrier invitation - Spanish'
  and html_body not like '%{{profile_link}}%';
