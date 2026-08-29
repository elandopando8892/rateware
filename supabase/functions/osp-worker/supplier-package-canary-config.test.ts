import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.14";

import { resolveSupplierPackageCanary } from "./supplier-package-canary-config.ts";

function environment(values: Record<string, string | undefined>) {
  return { get: (name: string) => values[name] };
}

const organizationId = "11111111-1111-4111-8111-111111111111";
const caseId = "22222222-2222-4222-8222-222222222222";
const snapshotId = "33333333-3333-4333-8333-333333333333";
const snapshotSha256 = "a".repeat(64);

Deno.test("supplier package canary stays disabled without its dedicated switch", () => {
  assertEquals(
    resolveSupplierPackageCanary(environment({
      OSP_SUPPLIER_PACKAGE_CANARY_CASE_ID: caseId,
    })),
    undefined,
  );
});

Deno.test("supplier package canary requires one exact snapshot allowlist", () => {
  assertThrows(
    () =>
      resolveSupplierPackageCanary(environment({
        OSP_SUPPLIER_PACKAGE_CANARY_ENABLED: "true",
      })),
    Error,
    "INVALID_RUNTIME_CONFIGURATION",
  );
  assertEquals(
    resolveSupplierPackageCanary(environment({
      OSP_SUPPLIER_PACKAGE_CANARY_ENABLED: "true",
      OSP_SUPPLIER_PACKAGE_CANARY_ORGANIZATION_ID: ` ${organizationId} `,
      OSP_SUPPLIER_PACKAGE_CANARY_CASE_ID: ` ${caseId} `,
      OSP_SUPPLIER_PACKAGE_CANARY_SNAPSHOT_ID: ` ${snapshotId} `,
      OSP_SUPPLIER_PACKAGE_CANARY_SNAPSHOT_SHA256: ` ${snapshotSha256} `,
    })),
    { organizationId, caseId, snapshotId, snapshotSha256 },
  );
});
