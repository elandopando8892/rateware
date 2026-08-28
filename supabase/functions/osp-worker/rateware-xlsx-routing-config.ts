export type RatewareXlsxRoutingConfiguration = Readonly<{
  enabled: true;
}>;

export interface RatewareXlsxRoutingEnvironment {
  get(name: string): string | undefined;
}

export function resolveRatewareXlsxRouting(
  env: RatewareXlsxRoutingEnvironment,
): RatewareXlsxRoutingConfiguration | undefined {
  const enabled = env.get("OSP_RATEWARE_XLSX_ROUTING_ENABLED")?.trim() ?? "";
  if (enabled === "") return undefined;
  if (enabled !== "true") throw new Error("INVALID_RUNTIME_CONFIGURATION");
  return Object.freeze({ enabled: true });
}
