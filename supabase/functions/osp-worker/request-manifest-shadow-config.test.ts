import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import { resolveRequestManifestShadow } from "./request-manifest-shadow-config.ts";

const values = {
  OSP_REQUEST_MANIFEST_SHADOW_ENABLED: "true",
  OSP_REQUEST_MANIFEST_SHADOW_ORGANIZATION_ID:
    "11111111-1111-4111-8111-111111111111",
  OSP_REQUEST_MANIFEST_SHADOW_CASE_ID: "22222222-2222-4222-8222-222222222222",
  OSP_REQUEST_MANIFEST_SHADOW_GMAIL_MESSAGE_ID:
    "33333333-3333-4333-8333-333333333333",
  OSP_REQUEST_MANIFEST_SHADOW_GMAIL_SOURCE_SHA256: "a".repeat(64),
  OSP_REQUEST_MANIFEST_SHADOW_DOCUMENT_VERSION_ID:
    "44444444-4444-4444-8444-444444444444",
  OSP_REQUEST_MANIFEST_SHADOW_DOCUMENT_SOURCE_SHA256: "b".repeat(64),
  OPENAI_API_KEY: "secret",
  OPENAI_MODEL: "gpt-model",
};

const environment = (input: Record<string, string>) => ({
  get: (name: string) => input[name],
});

Deno.test("request manifest shadow is disabled by default and exact when enabled", () => {
  assertEquals(resolveRequestManifestShadow(environment({})), undefined);
  assertEquals(resolveRequestManifestShadow(environment(values)), {
    organizationId: values.OSP_REQUEST_MANIFEST_SHADOW_ORGANIZATION_ID,
    caseId: values.OSP_REQUEST_MANIFEST_SHADOW_CASE_ID,
    gmailMessageId: values.OSP_REQUEST_MANIFEST_SHADOW_GMAIL_MESSAGE_ID,
    gmailSourceSha256: values.OSP_REQUEST_MANIFEST_SHADOW_GMAIL_SOURCE_SHA256,
    documentVersionId: values.OSP_REQUEST_MANIFEST_SHADOW_DOCUMENT_VERSION_ID,
    documentSourceSha256:
      values.OSP_REQUEST_MANIFEST_SHADOW_DOCUMENT_SOURCE_SHA256,
    openAiApiKey: values.OPENAI_API_KEY,
    openAiModel: values.OPENAI_MODEL,
  });
});

Deno.test("request manifest shadow rejects partial or ambiguous allowlists", () => {
  assertThrows(
    () =>
      resolveRequestManifestShadow(environment({
        ...values,
        OSP_REQUEST_MANIFEST_SHADOW_CASE_ID: "wrong",
      })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertThrows(
    () =>
      resolveRequestManifestShadow(environment({
        OSP_REQUEST_MANIFEST_SHADOW_ENABLED: "false",
      })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
});
