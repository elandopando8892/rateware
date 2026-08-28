import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import { resolveRatewareXlsxRouting } from "./rateware-xlsx-routing-config.ts";

function environment(values: Record<string, string>) {
  return { get: (name: string) => values[name] };
}

Deno.test("Rateware XLSX routing is opt-in and accepts only literal true", () => {
  assertEquals(resolveRatewareXlsxRouting(environment({})), undefined);
  assertEquals(
    resolveRatewareXlsxRouting(environment({
      OSP_RATEWARE_XLSX_ROUTING_ENABLED: "true",
    })),
    { enabled: true },
  );
  assertThrows(
    () =>
      resolveRatewareXlsxRouting(environment({
        OSP_RATEWARE_XLSX_ROUTING_ENABLED: "false",
      })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
});
