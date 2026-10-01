/** RFI classifications are not the catalog values selected by the shipper. */
function selectedValue(lane: Record<string, unknown>, field: string, classification: string) {
  const payload = lane.normalized_payload && typeof lane.normalized_payload === "object" && !Array.isArray(lane.normalized_payload)
    ? lane.normalized_payload as Record<string, unknown> : {};
  for (const value of [payload[field], lane[field], lane[classification], payload[classification]]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export const rfxDemandOperation = (lane: Record<string, unknown>) => selectedValue(lane, "operation", "operation_type");
export const rfxDemandService = (lane: Record<string, unknown>) => selectedValue(lane, "service", "service_type");
