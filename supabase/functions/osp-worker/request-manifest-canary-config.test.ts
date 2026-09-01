import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import { resolveRequestManifestCanary } from "./request-manifest-canary-config.ts";

const values = {
  OSP_REQUEST_MANIFEST_DRAFT_ENABLED: "true",
  OSP_REQUEST_MANIFEST_DRAFT_ORGANIZATION_ID:
    "11111111-1111-4111-8111-111111111111",
  OSP_REQUEST_MANIFEST_DRAFT_CASE_ID: "22222222-2222-4222-8222-222222222222",
  OPENAI_API_KEY: "synthetic-secret",
  OPENAI_MODEL: "gpt-5-mini",
};
const environment = (input: Record<string, string>) => ({
  get: (name: string) => input[name],
});

Deno.test("multimodal manifest canary is disabled by default and exact when enabled", () => {
  assertEquals(resolveRequestManifestCanary(environment({})), undefined);
  assertEquals(resolveRequestManifestCanary(environment(values)), {
    organizationId: values.OSP_REQUEST_MANIFEST_DRAFT_ORGANIZATION_ID,
    caseId: values.OSP_REQUEST_MANIFEST_DRAFT_CASE_ID,
    openAiApiKey: values.OPENAI_API_KEY,
    openAiModel: values.OPENAI_MODEL,
  });
});

Deno.test("multimodal manifest canary rejects partial and ambiguous activation", () => {
  assertThrows(
    () =>
      resolveRequestManifestCanary(
        environment({ ...values, OSP_REQUEST_MANIFEST_DRAFT_CASE_ID: "wrong" }),
      ),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertThrows(
    () =>
      resolveRequestManifestCanary(
        environment({ OSP_REQUEST_MANIFEST_DRAFT_ENABLED: "false" }),
      ),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
});
