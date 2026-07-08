update public.outreach_templates
set
  html_body = replace(
    html_body,
    '<div style="margin-top:18px;padding-top:12px;border-top:1px solid #d0d7de;font-family:Arial,sans-serif;color:#1f2937">',
    '<div style="margin-top:18px;padding-top:12px;border-top:1px solid #d0d7de;font-family:Arial,sans-serif;color:#1f2937"><img src="https://rateware.vercel.app/assets/marksman-email-signature.png" alt="MARKSMAN signature" style="display:block;max-width:720px;width:100%;height:auto;border:0;margin:0 0 10px">'
  ),
  updated_at = now()
where owner_email is null
  and name in ('RFx carrier invitation - English', 'RFx carrier invitation - Spanish')
  and html_body not like '%marksman-email-signature.png%';
