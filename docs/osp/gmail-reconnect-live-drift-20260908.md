# Gmail recovery: live contract drift

Read-only inspection after the user-authorized dashboard pause of cron job 3.

- Database confirms job 3 inactive; jobs 1, 2 and 4 remain active.
- Stored carriers connection has gmail.readonly, gmail.send, userinfo.email and openid. Access token expiry 2026-09-08 00:15:48 UTC; expiry alone does not prove refresh token failure.
- Live provider-gmail-intake-api version 179 (bundle 084d8e7589f6639cafc4ec214bc1ea1f12c0ceff82956bbce8f098940b0de576) creates consent with openid, email and gmail.readonly only; include_granted_scopes=false. Live dashboard also explicitly describes inbound-only scope.
- Live provider-gmail-oauth-callback version 170 uses validateProviderGmailScopes, unlike this OSP checkout's validateProviderGmailOutboundScopes. Therefore the local callback is not a faithful description of current shared runtime.
- No consent initiated, no credentials changed, no reconnect/import/sync or outgoing action. Do not overwrite shared provider functions with this older OSP checkout to restore send support.

Next: reconcile the current shared inbound-only contract with OSP's separately authorized delivery requirement before changing credentials or deploying shared functions. Preserve the paused intake and historical jobs.

## OSP-specific verification

- Live osp-gmail-sync-api v150 and osp-gmail-poll v125 bundle a different provider-gmail helper that permits gmail.send. The shared callback discrepancy therefore does NOT establish the cause of current OSP refresh failure.
- Existing refresh token is present; last_error is null. Do not describe the refresh token as revoked without evidence.
- One authenticated UI preflight was attempted for subject `Documentacion de alta para proveedores`, after 2026-03-12, before 2026-03-13. UI returned `The exact candidate changed or could not be verified. Nothing was imported.` No import, sync, watch, reconnection or outbound action clicked.
- After that attempt, connection updated_at and token_expires_at remained unchanged. Exact API failure code still needs observation; generic UI text cannot distinguish authentication, token refresh, or provider failure.

## HTTP diagnosis

- Browser observation of the same bounded read-only preflight from authenticated preview: HTTP 403 and failed browser request. Live handler uses an exact origin allowlist; do not infer Google refresh failure from this result.
- From authenticated production origin osp.heymarksman.com: OPTIONS 204, POST 503; response `DEPENDENCY_UNAVAILABLE`, incident `0b5dbd34-4104-49ca-9bea-2b8a7818f748`. This is a distinct server-side dependency failure, not the preview-origin rejection. No import/sync clicked.
- Next diagnostic target is this incident's server-side failure. Do not reconnect or replace shared OAuth functions solely on the generic 503.

## Deployed stage diagnosis

- Deployed osp-gmail-sync-api v151, bundle ea258ae44a00803a6f351c2ddd98153656ecc71eaa5545e0308599fedebeb410. Built from downloaded live v150 with only the preflight stage wrapper and its import; all other live dependencies preserved. Backup: tmp/osp-sync-v150-backup. Private Git diagnostic source 417ddbf.
- Nine local handler/wrapper tests passed. One production authenticated Crane preflight on v151 returned no import; Supabase logs show `OSP_GMAIL_DEPENDENCY_FAILED` stage `access_token`.
- Connection selection completed; search was not reached. Failure is within token decryption, refresh exchange, scope validation, or token persistence. This does not yet prove Google revocation or identify which substep failed.
- Cron remains intentionally paused; no import, broad sync, signature or email action performed.

## Exact token diagnosis and bounded reconnect rollback

- Deployed `osp-gmail-sync-api` v152 with redacted reason classification only. A single authenticated production preflight returned stage `access_token` and reason `google_grant_expired_or_revoked`; search and import were not reached.
- A bounded reconnect bridge was deployed temporarily to the shared provider functions so the exact OSP mailbox could request only `gmail.readonly` plus `gmail.send`. No OAuth callback completed because `carriers@xbfreight.com` was not present in the connected Chrome profile and requires an interactive Google sign-in.
- The bridge was withdrawn before leaving the flow waiting on credentials. `provider-gmail-intake-api` v181 now contains the original v179 inbound-only source, and `provider-gmail-oauth-callback` v172 contains the original v170 callback source. The different bundle hashes are new deployment bundles; source inspection confirms the restored contracts.
- SQL readback after restoration confirms cron job 3, `osp-gmail-poll-every-5-minutes`, remains `active = false`.
- No Gmail connection row was changed, no message was searched or imported, and no signature, email, webhook or other outgoing action occurred.

## Entity selection and second safe rollback

- Database readback shows exactly one historical Provider Gmail connection: `carriers@xbfreight.com` is bound to legal entity `XBFMX`. OSP sync and poll require exactly one eligible mailbox connection; creating a second XBFUS connection would make that selector ambiguous and break intake. Crane remains an XBFUS business case, but the shared mailbox credential must be renewed on the existing XBFMX connection.
- Authenticated Rateware UI was opened as `sales@heymarksman.com`, XBFMX was selected, and the reconnect button was invoked. The UI remained at `Preparing ...` and no new OAuth state row appeared, proving the request stopped before consent-state persistence. No Google consent page opened.
- A direct SQL fallback was not used: the available connector executed in a read-only transaction. The temporary bridge was restored again. Current deployed restore bundles are `provider-gmail-intake-api` v183 hash `9867c4e70377cdc5eef1cf9b593fd96a198a6630161ebe21fa44251fa5a03e75` and callback v174 hash `938f558beb64f6e93a0059c337aeca52ed9aa5adc05ac58361b6c691206a8005`.
- Next action: authenticate `carriers@xbfreight.com` interactively in a connected Chrome profile, then repeat the bounded bridge and inspect consent/callback before any preflight or import.
