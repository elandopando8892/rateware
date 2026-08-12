export function serviceFromNormalizedText(value) {
  const key = String(value || "").trim().toUpperCase();
  if (!key) return null;

  const hasOneWay = /(^| )OW( |$)/.test(key) || key.includes("ONE WAY") || key.includes("ONEWAY");
  const negativeMarkerPatterns = [
    /\b(?:NO|NOT|WITHOUT)\s+(?:AN?\s+)?(?:EXPLICIT\s+)?(?:RT|ROUND\s*TRIP)\s+(?:MARKER|SERVICE|QUOTE|RATE)(?:\s+(?:IS\s+)?(?:VISIBLE|PRESENT|SHOWN|PROVIDED))?/g,
    /\b(?:NO|NOT|WITHOUT)\s+(?:AN?\s+)?(?:EXPLICIT\s+)?(?:RT|ROUND\s*TRIP)(?=\s*$|\s*[.;,|)])/g,
    /\b(?:RT|ROUND\s*TRIP)\s+(?:(?:MARKER|SERVICE|QUOTE|RATE)\s+)?(?:IS\s+)?(?:ABSENT|MISSING|NOT\s+(?:PROVIDED|SHOWN|VISIBLE|PRESENT))\b/g,
    /\bCORRECTED\s+TO\s+ONE\s+WAY\b/g
  ];
  const chargeContextPatterns = [
    /\b(?:NO|NOT|WITHOUT)\s+(?:AN?\s+)?(?:RT|ROUND\s*TRIP)\s+(?:SURCHARGE|ACCESSORIAL|FEE|CHARGE)\b/g,
    /\b(?:RT|ROUND\s*TRIP)\s+(?:SURCHARGE|ACCESSORIAL|FEE|CHARGE)(?:\s+(?:IS\s+)?(?:WAIVED|ABSENT|MISSING|NOT\s+(?:APPLICABLE|CHARGED|INCLUDED)))?\b/g
  ];
  const deniesRoundtrip = negativeMarkerPatterns.some((pattern) => new RegExp(pattern.source).test(key));
  const serviceEvidence = [...negativeMarkerPatterns, ...chargeContextPatterns]
    .reduce((text, pattern) => text.replace(pattern, " "), key)
    .replace(/\s+/g, " ")
    .trim();
  const confirmsRoundtrip = [
    /\b(?:RT|ROUND\s*TRIP)\s+(?:MARKER\s+)?(?:IS\s+)?(?:VISIBLE|EXPLICIT|SHOWN|PRESENT)\b/,
    /\b(?:RT|ROUND\s*TRIP)\s+(?:IS\s+)?EXPLICITLY\s+(?:QUOTED|STATED|SHOWN)\b/
  ].some((pattern) => pattern.test(serviceEvidence));

  if (confirmsRoundtrip) return "Roundtrip";
  if (hasOneWay && deniesRoundtrip) return "One Way";
  if (deniesRoundtrip) return null;
  if (key.includes("BACKHAUL")) return "Backhaul";
  if (hasOneWay) return "One Way";
  if (/(^| )RT( |$)/.test(serviceEvidence) || serviceEvidence.includes("ROUND TRIP") || serviceEvidence.includes("ROUNDTRIP")) return "Roundtrip";
  return null;
}
