update public.outreach_templates
set
  active = false,
  is_default = false,
  updated_at = now()
where owner_email is null
  and name = 'Marksman RFx lane book invitation';

update public.outreach_templates
set
  name = 'RFx carrier invitation - English',
  channel = 'multi',
  subject = 'RFx {{rfx_id}} | {{event_name}} | {{lane_count}} lane(s)',
  html_body = $html$
<div style="font-family:Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.45">
  <p>Hello {{contact_name}},</p>
  <p>We would like to invite you to quote <strong>{{event_name}}</strong>.</p>

  <p>
    <strong>RFx:</strong> {{rfx_id}}<br>
    <strong>Due date:</strong> {{due_date}}<br>
    <strong>Equipment:</strong> {{equipment}} {{trailer}} {{config}}<br>
    <strong>Operation:</strong> {{operation}} / {{service}}
  </p>

  <p>Please review the lanes below and submit your bid in the Private Bid Room.</p>
  {{lane_table}}

  <p>For more details about the logistics model, operating criteria, business rules, service specifications, and additional notes, please review the Private Bid Room.</p>

  <p><strong>Submit your bid here:</strong><br><a href="{{bid_link}}" style="color:#2563eb;font-weight:700">{{bid_link}}</a></p>

  <p>Thank you,<br>MARKSMAN Procurement</p>
</div>
$html$,
  whatsapp_body = $whatsapp$
Hello {{contact_name}},

We would like to invite you to quote {{rfx_id}} / {{event_name}}.

Due date: {{due_date}}
Lanes: {{lane_count}}
Equipment: {{equipment}} {{trailer}} {{config}}
Operation: {{operation}} / {{service}}

Submit your bid here:
{{bid_link}}

For logistics model, operating criteria, business rules, service specifications, and additional notes, please review the Private Bid Room.

Lane summary:
{{lane_rows_text}}
$whatsapp$,
  active = true,
  is_default = true,
  placeholders = array[
    'vendor_name',
    'contact_name',
    'vendor_domain',
    'vendor_email',
    'rfx_id',
    'event_name',
    'customer',
    'due_date',
    'equipment',
    'trailer',
    'config',
    'operation',
    'service',
    'lane_count',
    'lane_table',
    'lane_rows_text',
    'bid_link'
  ],
  updated_at = now()
where owner_email is null
  and name in ('RFx carrier invitation', 'RFx carrier invitation - English');

insert into public.outreach_templates (
  owner_user_id,
  owner_email,
  name,
  channel,
  subject,
  html_body,
  whatsapp_body,
  active,
  is_default,
  placeholders
)
select
  null,
  null,
  'RFx carrier invitation - Spanish',
  'multi',
  'RFx {{rfx_id}} | {{event_name}} | {{lane_count}} lane(s)',
  $html$
<div style="font-family:Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.45">
  <p>Hola {{contact_name}},</p>
  <p>Nos gustaria invitarte a cotizar <strong>{{event_name}}</strong>.</p>

  <p>
    <strong>RFx:</strong> {{rfx_id}}<br>
    <strong>Fecha limite:</strong> {{due_date}}<br>
    <strong>Equipo:</strong> {{equipment}} {{trailer}} {{config}}<br>
    <strong>Operacion:</strong> {{operation}} / {{service}}
  </p>

  <p>Por favor revisa las rutas siguientes y captura tu propuesta en el Private Bid Room.</p>
  {{lane_table}}

  <p>Para conocer mas detalles del modelo logistico, criterios de operacion, reglas de negocio, especificaciones de servicio y otras notas, por favor revisa el Private Bid Room.</p>

  <p><strong>Captura tu propuesta aqui:</strong><br><a href="{{bid_link}}" style="color:#2563eb;font-weight:700">{{bid_link}}</a></p>

  <p>Gracias,<br>MARKSMAN Procurement</p>
</div>
$html$,
  $whatsapp$
Hola {{contact_name}},

Nos gustaria invitarte a cotizar {{rfx_id}} / {{event_name}}.

Fecha limite: {{due_date}}
Rutas: {{lane_count}}
Equipo: {{equipment}} {{trailer}} {{config}}
Operacion: {{operation}} / {{service}}

Captura tu propuesta aqui:
{{bid_link}}

Para conocer mas detalles del modelo logistico, criterios de operacion, reglas de negocio, especificaciones de servicio y otras notas, por favor revisa el Private Bid Room.

Resumen de rutas:
{{lane_rows_text}}
$whatsapp$,
  true,
  true,
  array[
    'vendor_name',
    'contact_name',
    'vendor_domain',
    'vendor_email',
    'rfx_id',
    'event_name',
    'customer',
    'due_date',
    'equipment',
    'trailer',
    'config',
    'operation',
    'service',
    'lane_count',
    'lane_table',
    'lane_rows_text',
    'bid_link'
  ]
where not exists (
  select 1
  from public.outreach_templates
  where owner_email is null
    and name = 'RFx carrier invitation - Spanish'
);

update public.outreach_templates
set
  channel = 'multi',
  subject = 'RFx {{rfx_id}} | {{event_name}} | {{lane_count}} lane(s)',
  html_body = $html$
<div style="font-family:Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.45">
  <p>Hola {{contact_name}},</p>
  <p>Nos gustaria invitarte a cotizar <strong>{{event_name}}</strong>.</p>

  <p>
    <strong>RFx:</strong> {{rfx_id}}<br>
    <strong>Fecha limite:</strong> {{due_date}}<br>
    <strong>Equipo:</strong> {{equipment}} {{trailer}} {{config}}<br>
    <strong>Operacion:</strong> {{operation}} / {{service}}
  </p>

  <p>Por favor revisa las rutas siguientes y captura tu propuesta en el Private Bid Room.</p>
  {{lane_table}}

  <p>Para conocer mas detalles del modelo logistico, criterios de operacion, reglas de negocio, especificaciones de servicio y otras notas, por favor revisa el Private Bid Room.</p>

  <p><strong>Captura tu propuesta aqui:</strong><br><a href="{{bid_link}}" style="color:#2563eb;font-weight:700">{{bid_link}}</a></p>

  <p>Gracias,<br>MARKSMAN Procurement</p>
</div>
$html$,
  whatsapp_body = $whatsapp$
Hola {{contact_name}},

Nos gustaria invitarte a cotizar {{rfx_id}} / {{event_name}}.

Fecha limite: {{due_date}}
Rutas: {{lane_count}}
Equipo: {{equipment}} {{trailer}} {{config}}
Operacion: {{operation}} / {{service}}

Captura tu propuesta aqui:
{{bid_link}}

Para conocer mas detalles del modelo logistico, criterios de operacion, reglas de negocio, especificaciones de servicio y otras notas, por favor revisa el Private Bid Room.

Resumen de rutas:
{{lane_rows_text}}
$whatsapp$,
  active = true,
  is_default = true,
  updated_at = now()
where owner_email is null
  and name = 'RFx carrier invitation - Spanish';
