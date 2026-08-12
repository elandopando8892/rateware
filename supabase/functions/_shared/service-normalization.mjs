export function serviceFromNormalizedText(value) {
  const key = String(value || "").trim().toUpperCase();
  if (!key) return null;

  const hasOneWay = /(^| )OW( |$)/.test(key) || key.includes("ONE WAY") || key.includes("ONEWAY");
  if (/\bCORRECTED\s+TO\s+ONE\s+WAY\b/.test(key)) return "One Way";

  const exactService = key.replace(/[.;,|:()]+$/g, "").trim();
  if (["RT", "ROUND TRIP", "ROUNDTRIP"].includes(exactService)) return "Roundtrip";
  const confirmsRoundtrip = [
    /(?<!NO )(?<!NOT )(?<!WITHOUT )\b(?:RT|ROUND\s*TRIP)\s+(?:SERVICE\s+)?MARKER\s+(?:IS\s+)?(?:VISIBLE|EXPLICIT|SHOWN|PRESENT|TRUE)\b(?!\s*[:=]\s*FALSE)/,
    /\b(?:VISIBLE|EXPLICIT|SHOWN|PRESENT)\s+(?:SERVICE\s+)?MARKER\s+(?:IS\s+)?(?:RT|ROUND\s*TRIP)\b/,
    /\bVISIBLE\s+SERVICE\s+MARKER\s+(?:IS\s+)?(?:RT|ROUND\s*TRIP)\b/,
    /(?<!NO )(?<!NOT )(?<!WITHOUT )\b(?:RT|ROUND\s*TRIP)\s+(?:IS\s+)?EXPLICITLY\s+(?:QUOTED|STATED|SHOWN|INCLUDED)\b(?!\s*[:=]\s*FALSE)/
  ].some((pattern) => pattern.test(key));

  if (confirmsRoundtrip) return "Roundtrip";
  if (key.includes("BACKHAUL")) return "Backhaul";
  if (hasOneWay) return "One Way";
  return null;
}
