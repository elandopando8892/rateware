export type SupplierPackageCanaryConfiguration = Readonly<{
  organizationId: string;
  caseId: string;
  snapshotId: string;
  snapshotSha256: string;
}>;

export interface SupplierPackageCanaryEnvironment {
  get(name: string): string | undefined;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function resolveSupplierPackageCanary(
  env: SupplierPackageCanaryEnvironment,
): SupplierPackageCanaryConfiguration | undefined {
  const enabled = env.get("OSP_SUPPLIER_PACKAGE_CANARY_ENABLED")?.trim() ?? "";
  if (enabled === "") return undefined;
  if (enabled !== "true") throw new Error("INVALID_RUNTIME_CONFIGURATION");
  const organizationId = env.get(
    "OSP_SUPPLIER_PACKAGE_CANARY_ORGANIZATION_ID",
  )?.trim() ?? "";
  const caseId = env.get("OSP_SUPPLIER_PACKAGE_CANARY_CASE_ID")?.trim() ?? "";
  const snapshotId = env.get("OSP_SUPPLIER_PACKAGE_CANARY_SNAPSHOT_ID")
    ?.trim() ?? "";
  const snapshotSha256 = env.get(
    "OSP_SUPPLIER_PACKAGE_CANARY_SNAPSHOT_SHA256",
  )?.trim() ?? "";
  if (
    !UUID.test(organizationId) || !UUID.test(caseId) ||
    !UUID.test(snapshotId) || !SHA256.test(snapshotSha256)
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return Object.freeze({ organizationId, caseId, snapshotId, snapshotSha256 });
}
