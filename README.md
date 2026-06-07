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

## Setup

1. Run `supabase/raw_uploads.sql` in Supabase SQL Editor.
2. Copy `src/config.example.js` values into `src/config.js`.
3. Replace the project URL and anon key in `src/config.js`.
4. Confirm Supabase email OTP authentication is enabled.
5. Deploy `supabase/functions/interpret-upload`.
6. Set Supabase function secrets:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`
   - `SUPABASE_ANON_KEY`
7. Open `index.html`, or run `npm run dev` and use the served URL.

## GitHub and Vercel

This project can be deployed as a static Vercel site from GitHub.

Recommended Vercel settings:

- Framework preset: `Other`
- Build command: leave empty
- Output directory: `.`
- Install command: leave empty or `npm install`

After the Vercel URL is created, add it in Supabase Auth redirect URLs:

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
