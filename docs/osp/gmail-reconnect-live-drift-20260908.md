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
