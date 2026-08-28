import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import { resolveOspXlsxIntake } from "./osp-xlsx-intake-config.ts";

function environment(values: Record<string, string>) {
  return { get: (name: string) => values[name] };
}

Deno.test("OSP customer-setup XLSX intake is opt-in and accepts only literal true", () => {
  assertEquals(resolveOspXlsxIntake(environment({})), undefined);
  assertEquals(
    resolveOspXlsxIntake(environment({ OSP_XLSX_INTAKE_ENABLED: "true" })),
    { enabled: true },
  );
  assertThrows(
    () =>
      resolveOspXlsxIntake(environment({ OSP_XLSX_INTAKE_ENABLED: "false" })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
});
