# WhatsApp Business Integration

Rateware supports Meta WhatsApp Business Platform for RFx/Bid Room outreach.

## Scope

- Automated channel: direct WhatsApp Business template messages to opted-in vendor phone numbers.
- Manual channel: vendor WhatsApp groups can be tracked and marked as manually sent.
- Not supported in this sprint: Twilio, WhatsApp Web automation, scraping, or automated WhatsApp group posting.

## Required Supabase secrets

Set these in the Supabase project used by Rateware:

```text
WHATSAPP_PROVIDER=meta
WHATSAPP_CONNECTION_MODE=internal_managed
WHATSAPP_GRAPH_API_VERSION=v23.0
WHATSAPP_PHONE_NUMBER_ID=<Meta phone number id>
WHATSAPP_BUSINESS_ACCOUNT_ID=<WhatsApp Business Account id>
WHATSAPP_ACCESS_TOKEN=<Meta system/user access token with WhatsApp permissions>
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<custom verify token used in Meta webhook setup>
WHATSAPP_APP_SECRET=<Meta app secret for x-hub-signature-256 validation>
WHATSAPP_GROUPS_ENABLED=false
```

`WHATSAPP_WABA_ID` can be used as an alias for `WHATSAPP_BUSINESS_ACCOUNT_ID`.

Optional embedded-signup values:

```text
META_APP_ID=<Meta app id>
META_CONFIG_ID=<Meta embedded signup config id>
META_REDIRECT_URI=https://rateware.vercel.app/app/settings.html?tab=integrations
```

## Meta webhook

Configure the Meta WhatsApp webhook callback URL as:

```text
https://<supabase-project-ref>.supabase.co/functions/v1/whatsapp-webhook
```

Use the same value as `WHATSAPP_WEBHOOK_VERIFY_TOKEN` when Meta asks for the verify token.

The webhook records outbound delivery states and inbound replies into Rateware contact history. Deploy this function without JWT verification because Meta will call it directly.

## Vendor CRM fields

Each vendor can store:

- `whatsapp_phone`
- `preferred_channel`: `email`, `whatsapp`, `whatsapp_group`, `multi`, `portal`
- `whatsapp_permission_basis`: `contractual`, `consent`, `manual`, `unknown`
- `whatsapp_do_not_contact`
- `whatsapp_opt_in_status`: `contractual`, `opted_in`, `manual`, `unknown`, `opted_out`
- `whatsapp_group_name`
- `whatsapp_group_url`
- `whatsapp_meta_group_id`
- `whatsapp_group_status`: `manual_only`, `pending`, `api_ready`, `verified`, `blocked`, `error`
- `whatsapp_notes`

## RFx outreach behavior

When creating RFx invitation drafts:

- `Email + WhatsApp direct` creates email and direct WhatsApp drafts.
- `WhatsApp direct` creates direct WhatsApp drafts only.
- `WhatsApp group` creates manual group draft rows only.
- `Email + WhatsApp group` creates email drafts plus manual group draft rows.

Internally, outreach campaigns may use composite channel values such as `email_whatsapp`, `email_whatsapp_group`, or `whatsapp_direct_group`; generated message rows are still stored as concrete `email`, `whatsapp`, or `whatsapp_group` rows.

Direct WhatsApp drafts require:

- connected WhatsApp Business sender,
- vendor phone number,
- no WhatsApp do-not-contact flag,
- approved Meta template name/language on the outreach template.

Group draft rows require a vendor group name or group URL. Rateware does not post to WhatsApp groups automatically in this sprint.
