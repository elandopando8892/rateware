update public.outreach_templates
set
  subject = 'RFx | {{event_name}} | {{lane_count}} lanes | {{equipment}} {{trailer}} | {{vendor_domain}}',
  html_body = $html$
<div dir="ltr">
  <div style="direction:ltr;min-height:991px">
    <p style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:14px;margin:0px 0px 10px">Estimados {{contact_name}},</p>
    <p style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:14px;margin:0px 0px 10px">Espero se encuentren muy bien.</p>
    <p style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:14px;margin:0px 0px 10px">Les compartimos el siguiente <strong>{{rfx_type}}</strong> para evaluar capacidad, modelo operativo y propuesta economica para un proyecto de transporte <strong>{{operation}} / {{service}}</strong>.</p>
    <p style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:14px;margin:0px 0px 10px">Favor de revisar la cedula del proyecto y completar la tabla de rutas con su tarifa, capacidad disponible y supuestos operativos. En caso de que puedan proponer una estructura alternativa mas eficiente, por ejemplo roundtrip, dedicated capacity, through-trailer, transfer, B1 o cualquier otro modelo, agradeceremos indicarlo claramente en su propuesta.</p>
    <p style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:14px;background:rgb(255,247,237);border-left:4px solid rgb(249,115,22);padding:9px 12px;margin:14px 0px"><strong>Fecha limite para envio de propuesta:</strong> {{due_date}}</p>

    <h3 style="font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;margin:20px 0px 8px;color:rgb(15,23,42)">Cedula del Proyecto</h3>
    <table style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;border-collapse:collapse;width:auto;max-width:100%;table-layout:auto;font-size:12px;margin-bottom:14px">
      <thead>
        <tr>
          <th style="background:rgb(31,78,121);color:rgb(255,255,255);border:1px solid rgb(183,201,217);padding:6px 8px;text-align:left;vertical-align:top;line-height:1.15;white-space:nowrap;width:174px">Campo</th>
          <th style="background:rgb(31,78,121);color:rgb(255,255,255);border:1px solid rgb(183,201,217);padding:6px 8px;text-align:left;vertical-align:top;line-height:1.15;white-space:nowrap">Detalle</th>
        </tr>
      </thead>
      <tbody>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">RFx Reference</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">{{rfx_id}}</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Tipo de solicitud</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">{{rfx_type}}</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Modelo comercial</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">Brokerage / Direct Carrier Program</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Entidad / Autoridad</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">XBF / MARKSMAN</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Tipo de operacion</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">{{operation}} / {{service}}</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Origen principal</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">{{lane_origin}}<br>{{origin_market}}</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Destinos / Mercados</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">{{lane_destination}}<br>{{destination_market}}</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Mercancia</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">Favor de confirmar producto / commodity y restricciones aplicables.</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Equipo requerido</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">{{equipment}} / {{trailer}} / {{config}}</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Peso maximo</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">Por confirmar por lane.</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Dimensiones</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">Favor de indicar si aplica.</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Requerimientos de securement</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">Straps / cadenas / edge protectors / gatas / otro, si aplica.</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Tiempo libre</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">Favor de indicar horas libres de carga, descarga y frontera.</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Frecuencia esperada</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">{{weekly_volume}}</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Arranque estimado</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">Por confirmar.</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Moneda</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">{{currency}}</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">FSC</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">Separar FSC si aplica; si no, indicar all-in.</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Cruce / Puerto</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">Favor de indicar puerto propuesto, si aplica.</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Modelo operativo requerido</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">B1 / transfer / through-trailer / power-only / transload / directo / alternativa propuesta.</td></tr>
        <tr><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22;background:rgb(248,250,252);font-weight:700;white-space:nowrap">Vigencia de tarifa</td><td style="border:1px solid rgb(208,215,222);padding:6px 8px;vertical-align:top;line-height:1.22">Favor de indicar vigencia.</td></tr>
      </tbody>
    </table>

    <h3 style="font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;margin:20px 0px 8px;color:rgb(15,23,42)">Tabla de Rutas / Lanes</h3>
    {{lane_table}}

    <p style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:14px;margin:14px 0px 10px"><strong>Nota:</strong> Los rangos objetivo iniciales y millas estimadas son unicamente una referencia para orientar la cotizacion. No representan tarifa maxima, tarifa final ni compromiso de compra. Agradecemos cotizar conforme a su estructura real de costos, capacidad disponible, cruce propuesto, millaje real validado y modelo operativo.</p>
    <p style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:14px;margin:0px 0px 10px">Para ingresar a su Private Bid Room y capturar la propuesta, use el siguiente enlace:</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:14px;margin:0px 0px 14px"><a href="{{bid_link}}" style="color:rgb(15,118,110);font-weight:700">{{bid_link}}</a></p>
    <p style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:14px;margin:0px 0px 8px"><strong>Favor de incluir en su propuesta</strong></p>
    <ol style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:14px;margin-top:0px">
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
    <p style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:14px;margin:0px 0px 10px">Buscamos propuestas competitivas, pero tambien operativamente defendibles, considerando consistencia de capacidad, cumplimiento de citas, manejo adecuado de frontera, disponibilidad real de equipo y claridad en accessorials.</p>
    <p style="color:rgb(31,41,55);font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:14px;margin:0px 0px 10px">Quedamos atentos a sus comentarios y a su propuesta antes de la fecha limite.</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:13px;color:rgb(31,41,55);margin-top:18px"><strong>Linkedin:</strong> https://www.linkedin.com/in/andresgzz88/ | <strong>Website:</strong> https://www.heymarksman.com</p>
    <p style="font-family:-apple-system,BlinkMacSystemFont,&quot;Segoe UI&quot;,Roboto,Oxygen,Ubuntu,Cantarell,&quot;Helvetica Neue&quot;,Arial,sans-serif;font-size:11px;color:rgb(71,85,105);line-height:1.35;margin-top:10px"><strong>Confidentiality &amp; Privacy Notice:</strong> This email and any attachments may contain confidential, proprietary, privileged, commercial, operational, financial, legal, or otherwise protected information intended only for the addressed recipient. If received in error, please notify the sender, delete it, and do not copy, disclose, forward, distribute, rely on, or use its contents.</p>
  </div>
</div>
$html$,
  whatsapp_body = $whatsapp$
Estimados {{contact_name}},

Les compartimos {{rfx_id}} / {{event_name}} con {{lane_count}} lane(s) para cotizar.

Favor de revisar el Private Bid Room y capturar tarifa, capacidad semanal, transit time, cruce/modelo operativo, vigencia, accessorials y supuestos:
{{bid_link}}

Resumen de lanes:
{{lane_rows_text}}

Fecha limite: {{due_date}}
$whatsapp$,
  placeholders = array[
    'vendor_name',
    'contact_name',
    'vendor_domain',
    'rfx_id',
    'rfx_type',
    'event_name',
    'customer',
    'due_date',
    'lane_origin',
    'lane_destination',
    'origin_market',
    'destination_market',
    'equipment',
    'trailer',
    'config',
    'operation',
    'service',
    'weekly_volume',
    'target_rate',
    'currency',
    'lane_count',
    'lane_table',
    'lane_rows_text',
    'bid_link'
  ],
  updated_at = now()
where owner_email is null
  and name = 'Marksman RFx lane book invitation';
