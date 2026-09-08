# Google login dialog recovery — local candidate

Scope: `codex/carrier-list-templates`, base HEAD `64f3418` plus working changes.
No deployment, Google configuration changes, invitations or production writes.

## Finding and correction

`src/auth.js` settled `loginPromise` on its Close button or OAuth completion but
not native dialog cancellation/closure. Escape could leave the promise pending,
causing subsequent `openLogin()` calls to return the old promise without opening
the dialog. The correction settles cancellation, removes listeners, ignores
late results from dismissed attempts and ignores stale close events when reopened.
No visual design, provider or authorization policy was changed.

Four executable lifecycle cases load the production source with an EventTarget
dialog and mocked OAuth: Escape/reopening, native closure, late OAuth response,
and OAuth error/retry. Included in the existing carrier-template test command.
This is a simulated DOM lifecycle test, not browser or Google acceptance evidence.

Initial run: 8/9 passed; retry assertion ran before the VM's asynchronous callback.
After flushing one event-loop turn, focused login/Auth suite: 9/9 passed.
Changed-file whitespace check passed.
Full `npm run test:carrier-list-templates` completed successfully: browser-domain
checks, 12 Node tests and 74 Deno contract tests. Auth/tenant calls in these tests
are mocked; no remote authenticated certification was performed.

## Auth review boundary

The reviewed `rateware-api` entry imports `requireRatewareUser` from `auth.ts`.
That verifier calls Supabase `/auth/v1/user`, trusts server app metadata and does
not select Kinde as a verifier. Browser `src/auth.js` requests Google OAuth.
`_shared/kinde.ts` now contains HTTP/CORS helpers, not Kinde verification.
Historical names/claims remain elsewhere; this review does not certify every
entry point or currently deployed configuration as migrated.

## Remaining acceptance

Real browser Escape/reopen and Google redirect/session recovery on the isolated
deployed candidate; authenticated template journey, tenant denial, final schema,
then conditional production release. Local checks do not close P3-A or P4.
