import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import { resolveXlsxShadow } from "./xlsx-shadow-config.ts";

function environment(values: Record<string, string | undefined>) {
  return { get: (name: string) => values[name] };
}

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const sourceSha256 = "a".repeat(64);

Deno.test("XLSX shadow stays disabled unless its dedicated switch is present", () => {
  assertEquals(
    resolveXlsxShadow(environment({
      OSP_XLSX_SHADOW_CASE_ID: caseId,
      OSP_XLSX_SHADOW_SOURCE_SHA256: sourceSha256,
    })),
    undefined,
  );
});

Deno.test("XLSX shadow requires an exact organization, case, and source hash allowlist", () => {
  assertThrows(
    () => resolveXlsxShadow(environment({ OSP_XLSX_SHADOW_ENABLED: "true" })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertThrows(
    () => resolveXlsxShadow(environment({ OSP_XLSX_SHADOW_ENABLED: "false" })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertEquals(
    resolveXlsxShadow(environment({
      OSP_XLSX_SHADOW_ENABLED: "true",
      OSP_XLSX_SHADOW_ORGANIZATION_ID: ` ${organizationId} `,
      OSP_XLSX_SHADOW_CASE_ID: ` ${caseId} `,
      OSP_XLSX_SHADOW_SOURCE_SHA256: ` ${sourceSha256} `,
    })),
    { organizationId, caseId, sourceSha256 },
  );
});
