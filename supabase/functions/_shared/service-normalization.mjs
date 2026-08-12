export function serviceFromNormalizedText(value) {
  const key = String(value || "").trim().toUpperCase();
  if (!key) return null;

  const hasOneWay = /(^| )OW( |$)/.test(key) || key.includes("ONE WAY") || key.includes("ONEWAY");
  const confirmsRoundtrip = [
    /\b(?:RT|ROUND\s*TRIP)\s+(?:MARKER\s+)?(?:IS\s+)?(?:VISIBLE|EXPLICIT|SHOWN|PRESENT)\b/,
    /\b(?:RT|ROUND\s*TRIP)\s+(?:IS\s+)?EXPLICITLY\s+(?:QUOTED|STATED|SHOWN)\b/
  ].some((pattern) => pattern.test(key));
  const deniesRoundtrip = [
    /\b(?:NO|NOT|WITHOUT)\s+(?:AN?\s+)?(?:EXPLICIT\s+)?(?:RT|ROUND\s*TRIP)(?=\s+(?:MARKER|SERVICE|QUOTE|RATE)\b|\s*$|\s*[.;,|)])/,
    /\b(?:RT|ROUND\s*TRIP)\s+(?:MARKER\s+)?(?:IS\s+)?(?:ABSENT|MISSING|NOT\s+PROVIDED|NOT\s+SHOWN)\b/,
    /\bCORRECTED\s+TO\s+ONE\s+WAY\b/
  ].some((pattern) => pattern.test(key));

  if (confirmsRoundtrip) return "Roundtrip";
  if (hasOneWay && deniesRoundtrip) return "One Way";
  if (deniesRoundtrip) return null;
  if (key.includes("BACKHAUL")) return "Backhaul";
  if (hasOneWay) return "One Way";
  if (/(^| )RT( |$)/.test(key) || key.includes("ROUND TRIP") || key.includes("ROUNDTRIP")) return "Roundtrip";
  return null;
}
