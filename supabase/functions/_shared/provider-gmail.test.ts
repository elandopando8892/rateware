import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import {
  PROVIDER_GMAIL_READONLY_SCOPE,
  PROVIDER_GMAIL_SEND_SCOPE,
  validateProviderGmailOutboundScopes,
  validateProviderGmailScopes,
} from "./provider-gmail.ts";

Deno.test("provider Gmail keeps inbound read-only compatible while requiring send for outbound", () => {
  assertEquals(validateProviderGmailScopes([PROVIDER_GMAIL_READONLY_SCOPE]), [
    PROVIDER_GMAIL_READONLY_SCOPE,
  ]);
  assertThrows(
    () => validateProviderGmailOutboundScopes([PROVIDER_GMAIL_READONLY_SCOPE]),
    Error,
    "gmail.send",
  );
  assertEquals(
    validateProviderGmailOutboundScopes([
      PROVIDER_GMAIL_READONLY_SCOPE,
      PROVIDER_GMAIL_SEND_SCOPE,
    ]),
    [PROVIDER_GMAIL_READONLY_SCOPE, PROVIDER_GMAIL_SEND_SCOPE],
  );
});

Deno.test("provider Gmail still rejects broad compose and modify authority", () => {
  for (const forbidden of [
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
  ]) {
    assertThrows(
      () =>
        validateProviderGmailOutboundScopes([
          PROVIDER_GMAIL_READONLY_SCOPE,
          PROVIDER_GMAIL_SEND_SCOPE,
          forbidden,
        ]),
      Error,
      "forbidden scope",
    );
  }
});

Deno.test("provider Gmail outbound rejects unrelated Google authority", () => {
  assertThrows(
    () =>
      validateProviderGmailOutboundScopes([
        PROVIDER_GMAIL_READONLY_SCOPE,
        PROVIDER_GMAIL_SEND_SCOPE,
        "https://www.googleapis.com/auth/calendar",
      ]),
    Error,
    "unexpected scope",
  );
});
