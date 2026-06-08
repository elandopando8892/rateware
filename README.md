# Rateware Upload Center

Static Upload Center module for preserving carrier quotation source files before any Rateware normalization.

## What it does

- Accepts drag-and-drop XLSX, PDF, image, and EML email files.
- Uploads original files into the private `raw-uploads` Supabase Storage bucket.
- Creates a `raw_uploads` record for each stored file.
- Marks every upload with `staging_target = 'rate_staging'`.
- Provides an Upload History page for recent source intake.
- Interprets uploaded files into `rate_staging` through the `interpret-upload` Supabase function.
- Provides a Staging Review page for human approval before production.
- Provides a Vendor CRM page for carrier master data, import, tags, completeness scoring, duplicate signals, and profile review.

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
