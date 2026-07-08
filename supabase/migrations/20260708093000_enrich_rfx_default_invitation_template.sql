update public.outreach_templates
set
  is_default = true,
  updated_at = now()
where owner_email is null
  and name = 'Marksman RFx lane book invitation';

update public.outreach_templates
set
  is_default = false,
  subject = 'RFx | {{rfx_id}} | {{event_name}} | {{lane_count}} lane(s) | {{vendor_domain}}',
  html_body = $html$
<div style="font-family:Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.45">
  <p>Hello {{contact_name}},</p>
  <p>We would like to invite you to quote <strong>{{event_name}}</strong> for <strong>{{customer}}</strong>.</p>
  <p>Please review the business book below and submit your proposal through the Private Bid Room. Quote only what you can support operationally, including capacity, transit time, commercial structure, border crossing assumptions, accessorials, and any exclusions.</p>

  <table style="border-collapse:collapse;width:auto;max-width:100%;font-size:12px;margin:12px 0">
    <tbody>
      <tr><td style="border:1px solid #d0d7de;padding:6px 8px;background:#f8fafc;font-weight:700">RFx</td><td style="border:1px solid #d0d7de;padding:6px 8px">{{rfx_id}}</td></tr>
      <tr><td style="border:1px solid #d0d7de;padding:6px 8px;background:#f8fafc;font-weight:700">Project</td><td style="border:1px solid #d0d7de;padding:6px 8px">{{event_name}}</td></tr>
      <tr><td style="border:1px solid #d0d7de;padding:6px 8px;background:#f8fafc;font-weight:700">Due date</td><td style="border:1px solid #d0d7de;padding:6px 8px">{{due_date}}</td></tr>
      <tr><td style="border:1px solid #d0d7de;padding:6px 8px;background:#f8fafc;font-weight:700">Equipment</td><td style="border:1px solid #d0d7de;padding:6px 8px">{{equipment}} / {{trailer}} / {{config}}</td></tr>
      <tr><td style="border:1px solid #d0d7de;padding:6px 8px;background:#f8fafc;font-weight:700">Operation</td><td style="border:1px solid #d0d7de;padding:6px 8px">{{operation}} / {{service}}</td></tr>
      <tr><td style="border:1px solid #d0d7de;padding:6px 8px;background:#f8fafc;font-weight:700">Currency</td><td style="border:1px solid #d0d7de;padding:6px 8px">{{currency}}</td></tr>
    </tbody>
  </table>

  <h3 style="margin:18px 0 8px;color:#0f172a">Business book</h3>
  {{lane_table}}

  <h3 style="margin:18px 0 8px;color:#0f172a">Please include</h3>
  <ol>
    <li>All-in rate or clear split of linehaul, FSC, border fee, and other charges.</li>
    <li>Weekly committed capacity per lane.</li>
    <li>Transit days, pickup ETA assumptions, delivery ETA assumptions, and validity window.</li>
    <li>Commercial model: MARKSMAN Direct cost-plus, MARKSMAN Billing Share, or XBF Buy-Sell.</li>
    <li>Any suggested MARKSMAN margin/share when applicable.</li>
    <li>Border crossing city, operating model, direct/transload/transfer assumptions, and trailer continuity.</li>
    <li>Alternative offers if you cannot serve the primary request exactly.</li>
    <li>Unit availability, equipment details, driver/trailer restrictions, and accessorial assumptions.</li>
  </ol>

  <p><strong>Private Bid Room:</strong><br><a href="{{bid_link}}" style="color:#2563eb;font-weight:700">{{bid_link}}</a></p>
  <p>Thank you,<br>MARKSMAN Procurement</p>
</div>
$html$,
  whatsapp_body = $whatsapp$
Hello {{contact_name}},

Please quote {{rfx_id}} / {{event_name}} for {{customer}}.

Lanes: {{lane_count}}
Due date: {{due_date}}
Equipment: {{equipment}} / {{trailer}} / {{config}}
Operation: {{operation}} / {{service}}

Submit your proposal in the Private Bid Room:
{{bid_link}}

Include all-in or split cost, capacity, transit, border/operating assumptions, commercial model, validity, accessorials, and alternatives if applicable.

Lane summary:
{{lane_rows_text}}
$whatsapp$,
  placeholders = array[
    'vendor_name',
    'contact_name',
    'vendor_domain',
    'vendor_email',
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
  and name = 'RFx carrier invitation';
