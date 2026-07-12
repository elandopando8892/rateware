# Rateware Upload Center

Static Upload Center module for preserving carrier quotation source files before any Rateware normalization.

## What it does

- Accepts drag-and-drop XLSX, PDF, image, and EML email files.
- Uploads original files into the private `raw-uploads` Supabase Storage bucket.
- Creates a `raw_uploads` record for each stored file.
- Marks every upload with `staging_target = 'rate_staging'`.
- Provides an Upload History page for recent source intake.
- Interprets uploaded files into `rate_staging` through the `interpret-upload` Supabase function.
- Bulk imports structured XLSX templates into `rate_staging` without OpenAI when headers already match Rateware-style data.
- Provides a Staging Review page for human approval before production.
- Provides a Vendor CRM page for carrier master data, import, tags, completeness scoring, duplicate signals, and profile review.
- Provides a downloadable vendor import template and validates imports before saving valid rows.
- Links interpreted uploads and staged rate rows to the best matching vendor when a confident match is found.
- Provides a guided Vendor Wizard and saved vendor segments for reusable RFx lists.
- Uses vendor tabs, health metrics, quick filters, and a side profile drawer to keep the carrier directory operational.
- Supports editing vendors from the drawer and reviewing duplicate candidates without deleting source records.

## Setup

1. Run `supabase/raw_uploads.sql` in Supabase SQL Editor.
2. Copy `src/config.example.js` values into `src/config.js`.
3. Replace the project URL and anon key in `src/config.js`.
4. Configure Kinde as a front-end/mobile application.
5. Deploy Supabase functions: `create-raw-upload`, `rateware-api`, and `interpret-upload`.
6. Set Supabase function secrets:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`
   - `KINDE_DOMAIN`
   - optional `KINDE_AUDIENCE`
   - `RATEWARE_SUPABASE_ANON_KEY`
   - `RATEWARE_SUPABASE_SERVICE_ROLE_KEY`
7. Configure `KINDE_DOMAIN` and `KINDE_CLIENT_ID` in `src/config.js`.
8. Open `index.html`, or run `npm run dev` and use the served URL.

## Kinde

Create a Kinde application with type `Front-end and mobile`.

Allowed callback URLs:

```text
http://127.0.0.1:3000/app.html
https://your-vercel-app.vercel.app/app
https://your-vercel-app.vercel.app/app.html
```

Allowed logout redirect URLs:

```text
http://127.0.0.1:3000
https://your-vercel-app.vercel.app
```

Copy the Kinde application `Domain` and `Client ID` into `src/config.js`. JavaScript SPA apps do not use a client secret.

For the current MVP, Kinde is used only for sign-in/session. All authenticated users have full access to every Rateware module; role and permission enforcement is intentionally deferred.

This static multipage app enables Kinde refresh-token persistence with local storage so users remain signed in while navigating between modules. For a later enterprise hardening sprint, replace this with Kinde custom-domain/httpOnly refresh cookies or a backend-for-frontend session.

## GitHub and Vercel

This project can be deployed as a static Vercel site from GitHub.

Recommended Vercel settings:

- Framework preset: `Other`
- Build command: leave empty
- Output directory: `.`
- Install command: leave empty or `npm install`

After the Vercel URL is created, add it in Kinde callback and logout redirect URLs:

```text
https://your-vercel-app.vercel.app
```

Production inserts are intentionally not implemented here. Uploaded source files must be reviewed, parsed, and staged in `rate_staging` before any approved production insert.

## Interpretation flow

1. Upload source files in Upload Center.
2. Go to Upload History and select `Interpret`.
3. The function downloads the preserved source file from Storage.
4. XLSX and EML files are converted into text; PDFs and images are sent as source files to the model.
5. Structured Rateware rows are inserted into `rate_staging`.
6. Review rows in Staging Review and mark them approved or rejected.

## Structured bulk import flow

Use this when the XLSX is already a template/database, not an unstructured carrier quote.

1. Upload the XLSX in Upload Center.
2. Go to Upload History and select `Bulk import`.
3. The backend reads the workbook from Storage, maps known headers like `Vendor Domain`, `Origen`, `Destino`, `Equipment`, `Trailer`, `Operation`, `Service`, `Rate`, and `Currency`.
4. Existing pending/rejected rows for that upload are archived to avoid duplicates; approved rows are not touched.
5. Imported rows are normalized and inserted into `rate_staging` for review before approval.

## WhatsApp Business Meta setup

Rateware supports two isolated Meta Cloud API connection modes:

- `internal_managed`: the HeyMarksman sender is read from Supabase Edge Function secrets and is available only to owner emails or Kinde organization ids explicitly allowlisted server-side.
- `tenant_connected`: each external workspace stores its own Meta identifiers and encrypted credentials in `whatsapp_business_connections`. External tenants never fall back to the HeyMarksman sender.

Do not paste access tokens, app secrets, verify tokens, WABA ids, phone number ids, or encryption keys into source code, static config, README examples, screenshots, or Git commits.

Required Supabase secrets:

- `WHATSAPP_PROVIDER`
- `WHATSAPP_CONNECTION_MODE`
- `WHATSAPP_GRAPH_API_VERSION`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_WABA_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`
- `WHATSAPP_INTERNAL_OWNER_EMAILS`
- `WHATSAPP_INTERNAL_ORGANIZATION_IDS` (optional)
- `WHATSAPP_GROUPS_ENABLED`

Recommended production values:

- `WHATSAPP_PROVIDER=meta`
- `WHATSAPP_CONNECTION_MODE=internal_managed`
- `WHATSAPP_GRAPH_API_VERSION=v23.0`
- `WHATSAPP_INTERNAL_OWNER_EMAILS=<comma-separated internal owner emails>`
- `WHATSAPP_GROUPS_ENABLED=false`

Set secrets from a local shell without committing them:

```powershell
$env:SUPABASE_ACCESS_TOKEN=[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')
npx supabase@latest secrets set WHATSAPP_PROVIDER=meta --project-ref alqjqzqagdmcywpjtnnr
npx supabase@latest secrets set WHATSAPP_CONNECTION_MODE=internal_managed --project-ref alqjqzqagdmcywpjtnnr
npx supabase@latest secrets set WHATSAPP_GRAPH_API_VERSION=v23.0 --project-ref alqjqzqagdmcywpjtnnr
npx supabase@latest secrets set WHATSAPP_GROUPS_ENABLED=false --project-ref alqjqzqagdmcywpjtnnr
```

Set the remaining values from your password manager or Supabase dashboard:

```text
WHATSAPP_PHONE_NUMBER_ID=<Meta phone number id>
WHATSAPP_BUSINESS_ACCOUNT_ID=<Meta business account id>
WHATSAPP_WABA_ID=<WhatsApp Business Account id>
WHATSAPP_ACCESS_TOKEN=<Meta access token>
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<private verify token generated for this webhook>
WHATSAPP_APP_SECRET=<Meta app secret>
WHATSAPP_TOKEN_ENCRYPTION_KEY=<independent random encryption secret>
WHATSAPP_INTERNAL_OWNER_EMAILS=<internal owner allowlist>
WHATSAPP_INTERNAL_ORGANIZATION_IDS=<optional Kinde organization id allowlist>
```

The global Meta identifiers and credentials above belong only to the internal HeyMarksman workspace. An external workspace connects from `Settings > Integrations > WhatsApp Business > Connect your own WhatsApp Business` and enters its own App ID, App Secret, Meta Business ID, WABA ID, Phone Number ID, Access Token, and Webhook Verify Token. The API encrypts App Secret, Access Token, and Webhook Verify Token before storage and never returns them to the browser. Replacing a credential does not reveal its previous value.

The callback URL is the only shared value: every tenant configures the Rateware webhook URL in its own Meta app. In manual mode, Rateware resolves the incoming WABA/Phone Number ID first and validates the request signature with that tenant's encrypted App Secret. A future Meta Embedded Signup flow can remove the need for tenants to paste credentials, but it must still issue and store a workspace-scoped connection.

After changing secrets, redeploy the Edge Functions that read them:

```powershell
$env:SUPABASE_ACCESS_TOKEN=[Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','User')
npx supabase@latest functions deploy rateware-api --project-ref alqjqzqagdmcywpjtnnr --no-verify-jwt
npx supabase@latest functions deploy whatsapp-webhook --project-ref alqjqzqagdmcywpjtnnr --no-verify-jwt
```

Configure the Meta webhook:

1. In Meta Business Manager, open the WhatsApp app webhook settings.
2. Callback URL:
   `https://alqjqzqagdmcywpjtnnr.supabase.co/functions/v1/whatsapp-webhook`
3. Verify token: use the exact server-side value stored as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. Subscribe to WhatsApp message events/statuses for delivery tracking.
5. Keep WhatsApp groups manual for now. `WHATSAPP_GROUPS_ENABLED=false` means Rateware can open/copy group messages but should not automate group delivery.

Test the internal connection in Rateware:

1. Go to `Settings > Integrations > WhatsApp Business`.
2. Click `Refresh`.
3. Click `Test line`; the backend action `test_whatsapp_business_connection` should return the sender display phone, verified name, and quality rating.
4. Click `Sync templates`; the backend action `sync_whatsapp_templates` reads `/{WHATSAPP_WABA_ID}/message_templates`.
5. Click `Verify webhook`; the backend action `verify_whatsapp_webhook` confirms the endpoint and whether verify token/app secret are configured.

Test an external tenant connection:

1. Sign in to the external workspace and open `Settings > Integrations > WhatsApp Business`.
2. Confirm the HeyMarksman phone number is not displayed.
3. Choose `Connect your own WhatsApp Business`, complete Manual setup, and save.
4. Run `Test line`. A successful Meta response activates only that workspace connection.
5. Run `Sync templates`; the request must use the tenant row's `meta_waba_id`.
6. Disconnect and confirm WhatsApp sends return `Connect your WhatsApp Business account before sending WhatsApp messages.`

### Outreach templates and Meta approval

The WhatsApp copy stored in an Outreach template is the editorial source of truth. Meta still requires a separately registered and approved message template for business-initiated WhatsApp sends outside the customer-service window. Rateware deliberately separates those two responsibilities:

- Outreach owns the editable message, RFx context, lane detail, and preview.
- Meta sends one compact, reusable notification per language with a private Bid Room link.
- The private Bid Room is the canonical location for the complete and current business book.

Rateware uses these stable Meta templates instead of creating a new Meta template every time Outreach copy changes:

- `rateware_rfx_invitation_en_v1` (`en_US`)
- `rateware_rfx_invitation_es_v1` (`es_MX`)

Both use the same ordered parameters: carrier name, event name, lane count, due date, and private Bid Room link. This keeps Meta approval operationally manageable while preserving Outreach as the user-editable source.

1. Edit and save the WhatsApp copy in `Bid Room > Outreach` or `Invitation Admin > Templates`.
2. Generate the Draft Queue. Rateware automatically selects the EN or ES notifier, creates it in the active WABA if missing, and reads its current Meta status.
3. While Meta shows `PENDING`, email drafts remain usable but automated WhatsApp sends remain disabled.
4. Send from Draft Queue when ready. The server checks Meta again at send time, updates the draft with the current notifier status, and sends only when the notifier is approved.
5. Rateware uses the same workspace WhatsApp connection that owns the approved mapping; no separate Create or Sync action is required in Bid Room.

Mappings are stored per `whatsapp_connection_id` and `outreach_template_id`. A global/default Outreach template therefore does not share a Meta mapping across tenants, and external workspaces cannot inherit the internal HeyMarksman template or sender.

Optional CLI check:

```powershell
$env:RATEWARE_API_BEARER="<current Kinde access token>"
node tools/whatsapp-env-check.mjs
```

The check prints only configured/missing status and never prints secret values.
