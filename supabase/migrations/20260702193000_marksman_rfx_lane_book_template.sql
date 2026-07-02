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
  'Marksman RFx lane book invitation',
  'multi',
  'RFx | {{event_name}} | {{lane_count}} lanes | {{vendor_domain}}',
  $html$
  <div style="font-family:Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.45">
    <p>Estimados {{contact_name}},</p>
    <p>Espero se encuentren muy bien.</p>
    <p>Les compartimos el siguiente <strong>{{rfx_type}}</strong> para evaluar capacidad, modelo operativo y propuesta economica para este proyecto de transporte.</p>
    <p>Favor de revisar la cedula del proyecto y completar la tabla de rutas con su tarifa, capacidad disponible y supuestos operativos. Si pueden proponer una estructura alternativa mas eficiente, por ejemplo roundtrip, dedicated capacity, through-trailer, transfer, B1 o cualquier otro modelo, agradeceremos indicarlo claramente en su propuesta.</p>
    <p><strong>Fecha limite para envio de propuesta:</strong> {{due_date}}</p>

    <h3 style="margin:18px 0 8px">Cedula del Proyecto</h3>
    <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12px">
      <tbody>
        <tr><td style="border:1px solid #d8e0e7;padding:6px;background:#f8fafc"><strong>RFx Reference</strong></td><td style="border:1px solid #d8e0e7;padding:6px">{{rfx_id}}</td></tr>
        <tr><td style="border:1px solid #d8e0e7;padding:6px;background:#f8fafc"><strong>Proyecto</strong></td><td style="border:1px solid #d8e0e7;padding:6px">{{event_name}}</td></tr>
        <tr><td style="border:1px solid #d8e0e7;padding:6px;background:#f8fafc"><strong>Cliente</strong></td><td style="border:1px solid #d8e0e7;padding:6px">{{customer}}</td></tr>
        <tr><td style="border:1px solid #d8e0e7;padding:6px;background:#f8fafc"><strong>Equipo / Operacion</strong></td><td style="border:1px solid #d8e0e7;padding:6px">{{equipment}} {{trailer}} / {{operation}}</td></tr>
        <tr><td style="border:1px solid #d8e0e7;padding:6px;background:#f8fafc"><strong>Moneda</strong></td><td style="border:1px solid #d8e0e7;padding:6px">{{currency}}</td></tr>
      </tbody>
    </table>

    <h3 style="margin:18px 0 8px">Tabla de Rutas / Lanes</h3>
    {{lane_table}}

    <p style="margin-top:14px"><strong>Nota:</strong> Los rangos objetivo iniciales y millas estimadas son unicamente referencia para orientar la cotizacion. No representan tarifa maxima, tarifa final ni compromiso de compra. Agradecemos cotizar conforme a su estructura real de costos, capacidad disponible, cruce propuesto, millaje real validado y modelo operativo.</p>

    <p><strong>Favor de incluir en su propuesta:</strong></p>
    <ol>
      <li>Tarifa por lane, separando FSC si aplica.</li>
      <li>Tarifa roundtrip unicamente donde puedan empatar ida + retorno.</li>
      <li>Capacidad semanal comprometida por lane.</li>
      <li>Transit time estimado.</li>
      <li>Puerto de cruce propuesto, si aplica.</li>
      <li>Modelo operativo propuesto: B1, transfer, through-trailer, power-only, directo o alternativa.</li>
      <li>Vigencia de tarifa.</li>
      <li>Accessorials aplicables: detention, layover, TONU, cruce, demoras en frontera, yard storage, maniobras, permisos, etc.</li>
      <li>Condiciones de pago requeridas.</li>
      <li>Cobertura de seguro y restricciones relevantes.</li>
      <li>Supuestos operativos y exclusiones relevantes.</li>
    </ol>

    <p>Para ingresar a su Private Bid Room y capturar la propuesta, use el siguiente enlace:</p>
    <p><a href="{{bid_link}}" style="color:#0f766e;font-weight:bold">{{bid_link}}</a></p>

    <p>Buscamos propuestas competitivas, pero tambien operativamente defendibles, considerando consistencia de capacidad, cumplimiento de citas, manejo adecuado de frontera, disponibilidad real de equipo y claridad en accessorials.</p>
    <p>Quedamos atentos a sus comentarios y a su propuesta antes de la fecha limite.</p>
    <p>Saludos,<br>Marksman XBF Procurement</p>
  </div>
  $html$,
  $whatsapp$
Estimados {{contact_name}},

Les compartimos {{rfx_id}} / {{event_name}} con {{lane_count}} lane(s) para cotizar.

Favor de revisar el Private Bid Room y capturar tarifa, capacidad semanal, transit time, cruce/modelo operativo, vigencia, accessorials y supuestos:
{{bid_link}}

Resumen de lanes:
{{lane_rows_text}}

Fecha limite: {{due_date}}
  $whatsapp$,
  true,
  true,
  array[
    'vendor_name',
    'contact_name',
    'vendor_domain',
    'rfx_id',
    'rfx_type',
    'event_name',
    'customer',
    'due_date',
    'equipment',
    'trailer',
    'operation',
    'currency',
    'lane_count',
    'lane_table',
    'lane_rows_text',
    'bid_link'
  ]
where not exists (
  select 1
  from public.outreach_templates
  where owner_email is null
    and name = 'Marksman RFx lane book invitation'
);
