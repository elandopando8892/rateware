import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import { resolveManualRequestCanary } from "./manual-request-canary-config.ts";

function environment(values: Record<string, string>) {
  return { get: (name: string) => values[name] };
}

Deno.test("manual request canary configuration is absent or exact", () => {
  assertEquals(resolveManualRequestCanary(environment({})), undefined);
  const configuration = resolveManualRequestCanary(environment({
    OSP_MANUAL_CANARY_ORGANIZATION_ID: "11111111-1111-4111-8111-111111111111",
    OSP_MANUAL_CANARY_PDF_SHA256: "a".repeat(64),
    OSP_MANUAL_CANARY_DOCX_SHA256: "b".repeat(64),
    OSP_MANUAL_CANARY_TOKEN: "t".repeat(64),
  }));
  assertEquals(configuration?.pdfSha256, "a".repeat(64));
  assertThrows(
    () =>
      resolveManualRequestCanary(environment({
        OSP_MANUAL_CANARY_ORGANIZATION_ID:
          "11111111-1111-4111-8111-111111111111",
      })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
});
