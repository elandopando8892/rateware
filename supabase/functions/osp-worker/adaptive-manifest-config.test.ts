import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import { resolveAdaptiveManifest } from "./adaptive-manifest-config.ts";

const env = (values: Record<string, string>) => ({
  get: (name: string) => values[name],
});

Deno.test("adaptive request manifests are explicit and reuse the configured OpenAI provider", () => {
  assertEquals(resolveAdaptiveManifest(env({})), undefined);
  assertEquals(
    resolveAdaptiveManifest(env({
      OSP_ADAPTIVE_MANIFEST_ENABLED: "true",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-5.1",
    })),
    {
      enabled: true,
      openAiApiKey: "test-key",
      openAiModel: "gpt-5.1",
    },
  );
  assertThrows(
    () =>
      resolveAdaptiveManifest(env({ OSP_ADAPTIVE_MANIFEST_ENABLED: "false" })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertThrows(
    () =>
      resolveAdaptiveManifest(env({ OSP_ADAPTIVE_MANIFEST_ENABLED: "true" })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
});
