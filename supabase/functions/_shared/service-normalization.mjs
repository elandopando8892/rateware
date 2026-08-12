export function serviceFromNormalizedText(value) {
  const key = String(value || "").trim().toUpperCase();
  if (!key) return null;

  const hasOneWay = /(^| )OW( |$)/.test(key) || key.includes("ONE WAY") || key.includes("ONEWAY");
  const deniesRoundtrip = [
    /\b(?:NO|NOT|WITHOUT)\s+(?:AN?\s+)?(?:EXPLICIT\s+)?(?:RT|ROUND\s*TRIP)\b/,
    /\b(?:RT|ROUND\s*TRIP)\s+(?:MARKER\s+)?(?:IS\s+)?(?:ABSENT|MISSING|NOT\s+PROVIDED|NOT\s+SHOWN)\b/,
    /\bCORRECTED\s+TO\s+ONE\s+WAY\b/
  ].some((pattern) => pattern.test(key));

  if (hasOneWay && deniesRoundtrip) return "One Way";
  if (!deniesRoundtrip && (/(^| )RT( |$)/.test(key) || key.includes("ROUND TRIP") || key.includes("ROUNDTRIP"))) return "Roundtrip";
  if (key.includes("BACKHAUL")) return "Backhaul";
  if (hasOneWay) return "One Way";
  return null;
}
