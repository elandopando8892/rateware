update public.outreach_templates
set
  html_body = replace(
    html_body,
    '<p>Thank you,<br>MARKSMAN Procurement</p>',
    $signature$
  <p>Thank you,<br>MARKSMAN Procurement</p>
  <div style="margin-top:18px;padding-top:12px;border-top:1px solid #d0d7de;font-family:Arial,sans-serif;color:#1f2937">
    <p style="margin:0 0 6px;font-size:13px">
      <strong>Linkedin:</strong> <a href="https://www.linkedin.com/in/andresgzz88/" style="color:#2563eb">https://www.linkedin.com/in/andresgzz88/</a>
      |
      <strong>Website:</strong> <a href="https://www.heymarksman.com/" style="color:#2563eb">https://www.heymarksman.com</a>
    </p>
    <p style="margin:0;font-size:11px;line-height:1.35;color:#475569">
      <strong>Confidentiality &amp; Privacy Notice:</strong>
      This email and any attachments may contain confidential, proprietary, privileged, commercial, operational, financial, legal, or otherwise protected information intended only for the addressed recipient. If received in error, please notify the sender, delete it, and do not copy, disclose, forward, distribute, rely on, or use its contents. For purposes of this notice, the &ldquo;Company&rdquo; may refer, as applicable, to MARKSMAN XBF LLC, XBFREIGHT SYSTEMS LLC, MARKSMAN XBF HOLDING GROUP, S.A.P.I. de C.V., and/or XBF SISTEMAS LOG&Iacute;STICOS, S. de R.L. de C.V. The Company may process business contact, corporate, tax, compliance, quote, shipment, billing, payment, operational, and communication data for commercial, logistics, contractual, administrative, legal, tax, compliance, and regulatory purposes, and may share such data with affiliates, customers, carriers, service providers, advisors, authorities, or other necessary third parties. This message does not create any binding transportation, brokerage, carrier, agency, fiduciary, mandate, partnership, payment, or service obligation unless expressly confirmed in a duly executed agreement or authorized written document. To exercise privacy rights or opt out of marketing communications, contact sales@heymarksman.com.
    </p>
  </div>
$signature$
  ),
  updated_at = now()
where owner_email is null
  and name = 'RFx carrier invitation - English'
  and html_body not like '%Confidentiality &amp; Privacy Notice:%';

update public.outreach_templates
set
  html_body = replace(
    html_body,
    '<p>Gracias,<br>MARKSMAN Procurement</p>',
    $signature$
  <p>Gracias,<br>MARKSMAN Procurement</p>
  <div style="margin-top:18px;padding-top:12px;border-top:1px solid #d0d7de;font-family:Arial,sans-serif;color:#1f2937">
    <p style="margin:0 0 6px;font-size:13px">
      <strong>Linkedin:</strong> <a href="https://www.linkedin.com/in/andresgzz88/" style="color:#2563eb">https://www.linkedin.com/in/andresgzz88/</a>
      |
      <strong>Website:</strong> <a href="https://www.heymarksman.com/" style="color:#2563eb">https://www.heymarksman.com</a>
    </p>
    <p style="margin:0;font-size:11px;line-height:1.35;color:#475569">
      <strong>Confidentiality &amp; Privacy Notice:</strong>
      This email and any attachments may contain confidential, proprietary, privileged, commercial, operational, financial, legal, or otherwise protected information intended only for the addressed recipient. If received in error, please notify the sender, delete it, and do not copy, disclose, forward, distribute, rely on, or use its contents. For purposes of this notice, the &ldquo;Company&rdquo; may refer, as applicable, to MARKSMAN XBF LLC, XBFREIGHT SYSTEMS LLC, MARKSMAN XBF HOLDING GROUP, S.A.P.I. de C.V., and/or XBF SISTEMAS LOG&Iacute;STICOS, S. de R.L. de C.V. The Company may process business contact, corporate, tax, compliance, quote, shipment, billing, payment, operational, and communication data for commercial, logistics, contractual, administrative, legal, tax, compliance, and regulatory purposes, and may share such data with affiliates, customers, carriers, service providers, advisors, authorities, or other necessary third parties. This message does not create any binding transportation, brokerage, carrier, agency, fiduciary, mandate, partnership, payment, or service obligation unless expressly confirmed in a duly executed agreement or authorized written document. To exercise privacy rights or opt out of marketing communications, contact sales@heymarksman.com.
    </p>
  </div>
$signature$
  ),
  updated_at = now()
where owner_email is null
  and name = 'RFx carrier invitation - Spanish'
  and html_body not like '%Confidentiality &amp; Privacy Notice:%';
