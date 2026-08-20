# OSP deploy order

**The edge function must be deployed before the frontend. Not after, not at the same time
by accident.**

## Why this is now true, and was not before

OSP's actions used to execute inside `shipper-directory-api`, which has been deployed for
months. The frontend named a function that already existed, so frontend and backend could
ship in any order.

They no longer can. `src/osp-api.js` names `provider-onboarding-api`, and as of this
branch that function **does not exist in production** — it was verified absent on
2026-08-20. The frontend is a static site on Vercel; edge functions deploy separately.
Ship the static site first and every OSP action returns 404: the Command Center, the
vault, approvals, delivery, document review, and every command including the waiver
override.

## The order

1. **Deploy `supabase/functions/provider-onboarding-api`.** It carries `index.ts` and
   `provider-service.ts`, and imports `_shared/kinde.ts`, `_shared/runtime-identity.ts`,
   `_shared/identity-contract.mjs` and `_shared/workspace.ts`.
2. **Verify it answers.** Call one read (`list_provider_onboarding_workspace`) and confirm
   real data, and one unknown action and confirm `Unknown Provider onboarding action.`
   A green deploy is not evidence the function works; a response is.
3. **Deploy `shipper-directory-api`.** It no longer imports `provider-service.ts`. Until
   this lands, the old copy is still serving OSP's six original actions, which is harmless
   — both answer correctly during the window.
4. **Deploy the static site.**
5. **Confirm the old path is dead.** Call a migrated action against
   `shipper-directory-api` and require `Unknown Shipper directory action.` If it still
   answers, step 3 did not land and there are two live copies of OSP's backend.

## Rolling back

Reverting the static site alone is safe: the previous build names
`shipper-directory-api`, which still serves the six original read actions. The eighteen
actions added on this branch have never existed in production, so nothing that works today
stops working.

Reverting the edge functions alone is **not** safe once the static site has shipped, for
the same reason the order matters.

## Before any of it

Diff every deployed function against the branch first. This project has had deploys with
no source commit — `noop` is one, and it is still running. Deploying without a diff is how
someone else's work disappears.
