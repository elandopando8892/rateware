const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

export type ManualRequestCanaryConfiguration = Readonly<{
  organizationId: string;
  pdfSha256: string;
  docxSha256: string;
  token: string;
}>;

export interface ManualRequestCanaryEnvironment {
  get(name: string): string | undefined;
}

export function resolveManualRequestCanary(
  env: ManualRequestCanaryEnvironment,
): ManualRequestCanaryConfiguration | undefined {
  const values = {
    organizationId: env.get("OSP_MANUAL_CANARY_ORGANIZATION_ID")?.trim() ?? "",
    pdfSha256: env.get("OSP_MANUAL_CANARY_PDF_SHA256")?.trim().toLowerCase() ??
      "",
    docxSha256:
      env.get("OSP_MANUAL_CANARY_DOCX_SHA256")?.trim().toLowerCase() ?? "",
    token: env.get("OSP_MANUAL_CANARY_TOKEN")?.trim() ?? "",
  };
  if (Object.values(values).every((value) => value === "")) return undefined;
  if (
    !UUID.test(values.organizationId) || !SHA256.test(values.pdfSha256) ||
    !SHA256.test(values.docxSha256) || values.pdfSha256 === values.docxSha256 ||
    values.token.length < 32 || values.token.length > 4096 ||
    /\s/.test(values.token)
  ) throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return Object.freeze(values);
}
