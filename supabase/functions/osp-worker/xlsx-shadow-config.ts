export type XlsxShadowConfiguration = Readonly<{
  organizationId: string;
  caseId: string;
  sourceSha256: string;
}>;

export interface XlsxShadowEnvironment {
  get(name: string): string | undefined;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function resolveXlsxShadow(
  env: XlsxShadowEnvironment,
): XlsxShadowConfiguration | undefined {
  const enabled = env.get("OSP_XLSX_SHADOW_ENABLED")?.trim() ?? "";
  if (enabled === "") return undefined;
  if (enabled !== "true") throw new Error("INVALID_RUNTIME_CONFIGURATION");
  const organizationId = env.get("OSP_XLSX_SHADOW_ORGANIZATION_ID")?.trim() ??
    "";
  const caseId = env.get("OSP_XLSX_SHADOW_CASE_ID")?.trim() ?? "";
  const sourceSha256 = env.get("OSP_XLSX_SHADOW_SOURCE_SHA256")?.trim() ?? "";
  if (
    !UUID.test(organizationId) || !UUID.test(caseId) ||
    !SHA256.test(sourceSha256)
  ) {
    throw new Error("INVALID_RUNTIME_CONFIGURATION");
  }
  return Object.freeze({ organizationId, caseId, sourceSha256 });
}
