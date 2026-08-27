import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import { resolveGovernedAutomation } from "./governed-automation-config.ts";

function environment(values: Record<string, string | undefined>) {
  return { get: (name: string) => values[name] };
}

Deno.test("shared Rateware provider secrets do not enable OSP automation or spend", () => {
  assertEquals(
    resolveGovernedAutomation(environment({
      OPENAI_API_KEY: "shared-rateware-key",
      OPENAI_MODEL: "shared-rateware-model",
    })),
    undefined,
  );
});

Deno.test("OSP automation requires its explicit switch and a complete provider set", () => {
  assertThrows(
    () =>
      resolveGovernedAutomation(environment({
        OSP_GOVERNED_AUTOMATION_ENABLED: "true",
        OPENAI_API_KEY: "shared-rateware-key",
        OPENAI_MODEL: "shared-rateware-model",
      })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertThrows(
    () =>
      resolveGovernedAutomation(environment({
        OSP_GOVERNED_AUTOMATION_ENABLED: "false",
      })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
});

Deno.test("complete explicitly enabled OSP configuration is normalized", () => {
  assertEquals(
    resolveGovernedAutomation(environment({
      OSP_GOVERNED_AUTOMATION_ENABLED: "true",
      OSP_MALWARE_SCANNER_ORIGIN: " https://scanner.example.test ",
      OSP_MALWARE_SCANNER_TOKEN: "scanner-token-value",
      OSP_AZURE_DOCUMENT_ENDPOINT: "https://osp.cognitiveservices.azure.com",
      OSP_AZURE_DOCUMENT_API_KEY: "azure-key",
      OPENAI_API_KEY: "openai-key",
      OPENAI_MODEL: "gpt-model",
    })),
    {
      malwareScannerOrigin: "https://scanner.example.test",
      malwareScannerToken: "scanner-token-value",
      azureDocumentEndpoint: "https://osp.cognitiveservices.azure.com",
      azureDocumentApiKey: "azure-key",
      openAiApiKey: "openai-key",
      openAiModel: "gpt-model",
    },
  );
});
