export type OspXlsxIntakeConfiguration = Readonly<{
  enabled: true;
}>;

export interface OspXlsxIntakeEnvironment {
  get(name: string): string | undefined;
}

export function resolveOspXlsxIntake(
  env: OspXlsxIntakeEnvironment,
): OspXlsxIntakeConfiguration | undefined {
  const enabled = env.get("OSP_XLSX_INTAKE_ENABLED")?.trim() ?? "";
  if (enabled === "") return undefined;
  if (enabled !== "true") throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return Object.freeze({ enabled: true });
}
