const SERVICE_BY_KEY = new Map([
  ["RT", "Roundtrip"],
  ["R T", "Roundtrip"],
  ["ROUND TRIP", "Roundtrip"],
  ["ROUNDTRIP", "Roundtrip"],
  ["OW", "One Way"],
  ["O W", "One Way"],
  ["ONE WAY", "One Way"],
  ["ONEWAY", "One Way"],
  ["BACKHAUL", "Backhaul"]
]);

const SERVICE_PATTERN = "ROUND\\s+TRIP|ROUNDTRIP|ONE\\s+WAY|ONEWAY|BACKHAUL|R\\s+T|RT|O\\s+W|OW";
const SERVICE_TOKEN = `(?:${SERVICE_PATTERN})`;
const CHARGE_SIGNAL = /\b(?:ACCESSORIALS?|CHARGES?|COSTS?|FEES?|FSC|SURCHARGES?)\b/;
const CHARGE_CONTEXT_SIGNAL = /\b(?:ACCESSORIALS?|CHARGES?|COSTS?|DETENTION|FEES?|FSC|FUEL|SURCHARGES?|TOLLS?)\b/;
const CHARGE_ONLY_QUALIFIER = /\b(?:CALCULATION|CODE|LEGEND|NOT\s+SERVICE|NOTES?|ONLY|TABLE|UNDER)\b/;
const NON_FINAL_SIGNAL = /\b(?:ADVISE|ASKS?|AWAITING|CAN|COULD|DECLINED|DRAFT|FAILED\s+TO|GUIDANCE|HYPOTHETICAL|INTEND|MAY|MIGHT|OPTION|PENDING|PERHAPS|PLANNING|POSSIBILITIES|PREFERENCE|PROHIBITED|PROPOSAL|PROPOSED|RATE\s+REQUEST|RESCINDED|RETRACTING|REVIEW|SHOULD|SUBJECT\s+TO|SUGGESTION|TENTATIVE|TENTATIVELY|UNLESS)\b/;
const NEGATIVE_SIGNAL = /\b(?:DENIED|FALSE|LACKING|LACKS|NEITHER|NEVER|NO|NOT|NULL|REJECTED|UNABLE|UNCONFIRMED|WITHOUT)\b/;

/** @typedef {"Roundtrip" | "One Way" | "Backhaul"} Service */
/** @typedef {"structured" | "narrative"} EvidenceTier */
/** @typedef {{ service: Service, tier: number }} Observation */
/**
 * @typedef {{ state: "absent" }
 * | { state: "invalid", tier: EvidenceTier, reason: string }
 * | { state: "resolved", service: Service, tier: EvidenceTier }
 * | { state: "conflict", tier: EvidenceTier, services: Service[] }} ServiceResolution
 */

function normalizedServiceText(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** @returns {ServiceResolution} */
function absent() {
  return { state: "absent" };
}

/** @param {EvidenceTier} tier @param {string} reason @returns {ServiceResolution} */
function invalid(tier, reason) {
  return { state: "invalid", tier, reason };
}

/** @param {Service} service @param {EvidenceTier} tier @returns {ServiceResolution} */
function resolved(service, tier) {
  return { state: "resolved", service, tier };
}

/** @param {EvidenceTier} tier @param {Service[]} services @returns {ServiceResolution} */
function conflict(tier, services) {
  return { state: "conflict", tier, services: [...new Set(services)].sort() };
}

/** @returns {Service | null} */
function serviceFromKey(key) {
  return SERVICE_BY_KEY.get(key) || null;
}

/** @returns {Service | null} */
function serviceFromCaptured(value) {
  return serviceFromKey(value.replace(/\s+/g, " "));
}

/** @returns {ServiceResolution} */
function parseStructuredMarker(value) {
  if (value === null || value === undefined) return absent();
  if (typeof value !== "string") return invalid("structured", "non_string_marker");
  if (!value.trim()) return absent();
  const key = normalizedServiceText(value);
  if (!key) return invalid("structured", "unrecognized_marker");

  const direct = serviceFromKey(key);
  if (direct) return resolved(direct, "structured");

  const wrapped = key.match(new RegExp(`^(?:SOURCE )?SERVICE MARKER(?: IS)? (${SERVICE_PATTERN})$`));
  const wrappedService = wrapped ? serviceFromCaptured(wrapped[1]) : null;
  return wrappedService
    ? resolved(wrappedService, "structured")
    : invalid("structured", "unrecognized_marker");
}

/** @param {unknown[]} values @returns {ServiceResolution} */
function resolveStructuredMarkers(values) {
  /** @type {Service[]} */
  const services = [];
  /** @type {ServiceResolution | null} */
  let sawInvalid = null;
  for (const value of values) {
    const result = parseStructuredMarker(value);
    if (result.state === "invalid") sawInvalid ||= result;
    if (result.state === "resolved") services.push(result.service);
  }
  if (sawInvalid) return sawInvalid;
  if (!services.length) return absent();
  const unique = [...new Set(services)];
  return unique.length === 1 ? resolved(unique[0], "structured") : conflict("structured", unique);
}

function hasRejectedSuffix(clause, index) {
  const suffix = clause.slice(index).trim();
  if (/^NO\s+(?:(?:RT|ROUND\s+TRIP)\s+)?(?:ACCESSORIALS?|CHARGES?|COSTS?|FEES?|FSC|SURCHARGES?)\b/.test(suffix)) {
    return false;
  }
  return /^(?:(?:IS|WAS)\s+)?(?:0|DISABLED|FALSE|N A|NEGATIVE|NEVER|NO\b|NONE|NOT\b|NULL|OFF|REJECTED|UNAVAILABLE)/.test(suffix)
    || /^(?:ABSENT|EXCLUDED|REMOVED|WAIVED)\b/.test(suffix);
}

function hasNegativeBefore(clause, index) {
  return NEGATIVE_SIGNAL.test(clause.slice(0, index));
}

function isNonFinalClause(rawClause, clause) {
  if (rawClause.includes("?")) return true;
  if (/^(?:ARE|CAN|COULD|DO|DOES|IS|SHOULD|WOULD)\b/.test(clause)) return true;
  if (/^(?:KINDLY|PLEASE)\s+(?:CHOOSE|CONFIRM|SELECT|USE)\b/.test(clause)) return true;
  if (/^TELL\s+US\s+(?:IF|WHETHER)\b/.test(clause)) return true;
  if (/^(?:IF|PROVIDED|SHOULD|UPON)\b/.test(clause) || /\b(?:IF|ONLY\s+IF)\b/.test(clause)) return true;
  if (NON_FINAL_SIGNAL.test(clause)) return true;
  if (/\b(?:BEFORE\s+RETRACTING|NOT\s+APPROVED|NOW\s+REJECTED)\b/.test(clause)) return true;
  return false;
}

/** @returns {Observation[]} */
function transitionObservations(value) {
  const key = normalizedServiceText(value);
  if (isNonFinalClause(value, key)) return [];
  const explicitFinal = key.match(new RegExp(`\\bCARRIER\\s+(?:FINALLY|LATER|NOW|ULTIMATELY)\\s+(?:ACCEPTED|APPROVED|CONFIRMED|SELECTED)\\s+(${SERVICE_PATTERN})\\b`));
  const explicitFinalService = explicitFinal ? serviceFromCaptured(explicitFinal[1]) : null;
  if (explicitFinalService) return [{ service: explicitFinalService, tier: 4 }];
  /** @type {RegExp[]} */
  const patterns = [
    new RegExp(`\\b(?:CORRECTED|CORRECTION)\\s+FROM\\s+(${SERVICE_PATTERN})\\s+TO\\s+(${SERVICE_PATTERN})\\b`),
    new RegExp(`\\b(?:CORRECTED|CORRECTION)\\s+TO\\s+(${SERVICE_PATTERN})(?:\\s+(?:THEN|AFTERWARDS|LATER|SUBSEQUENTLY))?\\s+(?:REVERTED\\s+TO|SUPERSEDED\\s+BY)\\s+(${SERVICE_PATTERN})\\b`),
    new RegExp(`\\b(?:CARRIER\\s+)?REJECTED\\s+(${SERVICE_PATTERN})(?:\\s+THEN)?\\s+(?:CARRIER\\s+)?CONFIRMED\\s+(${SERVICE_PATTERN})\\b`),
    new RegExp(`\\b(?:CARRIER\\s+)?DID\\s+NOT\\s+CONFIRM\\s+(${SERVICE_PATTERN}).*\\b(?:BUT\\s+)?(?:EVENTUALLY\\s+|LATER\\s+)?CONFIRMED\\s+(${SERVICE_PATTERN})\\b`),
    new RegExp(`\\b(?:SERVICE\\s+WAS\\s+)?(${SERVICE_PATTERN}).*\\b(?:HAS\\s+SINCE\\s+BEEN\\s+)?(?:REPLACED\\s+(?:BY|WITH)|CHANGED\\s+TO|TRANSITIONED\\s+TO|SUPERSEDED\\s+BY)\\s+(${SERVICE_PATTERN})\\b`),
    new RegExp(`\\b(?:INITIAL|EARLIER|PREVIOUS)\\s+(?:SERVICE|QUOTE|SELECTION)?\\s*(?:IS|WAS)?\\s*(${SERVICE_PATTERN}).*\\b(?:FINAL|NOW|ULTIMATELY)\\s+(?:CARRIER\\s+)?(?:SERVICE\\s+)?(?:IS|CONFIRMS|APPROVED|SELECTED)?\\s*(${SERVICE_PATTERN})\\b`),
    new RegExp(`\\b(?:CARRIER\\s+)?(?:REVOKED|WITHDREW|WITHDRAW|REJECTED)\\s+(${SERVICE_PATTERN}).*\\b(?:CARRIER\\s+)?(?:LATER\\s+|THEN\\s+|EVENTUALLY\\s+|NOW\\s+)?(?:ACCEPTED|APPROVED|CONFIRMS?|SELECTED)\\s+(${SERVICE_PATTERN})\\b`),
    new RegExp(`\\b(${SERVICE_PATTERN})\\s+(?:(?:IS|WAS)\\s+)?(?:OBSOLETE|EXPIRED).*\\b(${SERVICE_PATTERN})\\s+(?:IS\\s+)?FINAL\\b`),
    new RegExp(`\\bCARRIER\\s+FIRST\\s+QUOTED\\s+(${SERVICE_PATTERN}).*\\bULTIMATELY\\s+(?:APPROVED|CONFIRMED|SELECTED)\\s+(${SERVICE_PATTERN})\\b`),
    new RegExp(`\\bPREVIOUS\\s+(${SERVICE_PATTERN})\\s+SELECTION\\s+EXPIRED.*\\bFINAL\\s+CARRIER\\s+SERVICE\\s+IS\\s+(${SERVICE_PATTERN})\\b`),
    new RegExp(`\\b(?:EARLIER|INITIAL)\\s+(?:QUOTE|SERVICE)\\s+(?:IS|WAS)\\s+(${SERVICE_PATTERN}).*\\bCARRIER\\s+NOW\\s+(?:APPROVES|CONFIRMS|SELECTS)\\s+(${SERVICE_PATTERN})\\b`),
    new RegExp(`\\bCARRIER\\s+INITIALLY\\s+QUOTED\\s+(${SERVICE_PATTERN}).*\\bFINAL\\s+CONFIRMED\\s+SERVICE\\s+IS\\s+(${SERVICE_PATTERN})\\b`),
    new RegExp(`\\bCARRIER\\s+CHANGED\\s+SERVICE\\s+FROM\\s+(${SERVICE_PATTERN})\\s+TO\\s+(${SERVICE_PATTERN})\\b`),
    new RegExp(`\\bFINAL\\s+AWARD\\s+SUPERSEDES\\s+(${SERVICE_PATTERN})\\s+WITH\\s+(${SERVICE_PATTERN})\\b`)
  ];
  for (const pattern of patterns) {
    const match = key.match(pattern);
    const finalService = match ? serviceFromCaptured(match[2]) : null;
    if (finalService) return [{ service: finalService, tier: 4 }];
  }
  return [];
}

/** @returns {Observation[]} */
function alternativeObservations(rawClause, clause) {
  if (CHARGE_SIGNAL.test(clause)) return [];
  if (rawClause.includes("?")) return [];
  const carrierEvidencePatterns = [
    new RegExp(`^(?:THE\\s+)?CARRIER\\s+OFFERS\\s+(?:EITHER\\s+)?${SERVICE_TOKEN}\\s+(?:AND|OR)\\s+${SERVICE_TOKEN}(?:\\s+FOR\\s+THIS\\s+LANE)?$`),
    new RegExp(`^(?:THE\\s+)?QUOTE\\s+CONTAINS\\s+BOTH\\s+${SERVICE_TOKEN}\\s+AND\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^CARRIER\\s+SUBMITTED\\s+${SERVICE_TOKEN}\\s+VERSUS\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^SERVICE\\s+ALTERNATIVES\\s+${SERVICE_TOKEN}\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^CARRIER\\s+CAN\\s+HONOR\\s+${SERVICE_TOKEN}\\s+OR\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^CARRIER\\s+RESPONSE\\s+SHOWS\\s+${SERVICE_TOKEN}\\s+VERSUS\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^BOTH\\s+${SERVICE_TOKEN}\\s+AND\\s+${SERVICE_TOKEN}\\s+WERE\\s+QUOTED\\s+BY\\s+THE\\s+CARRIER$`),
    new RegExp(`^CARRIER\\s+PRICED\\s+${SERVICE_TOKEN}\\s+ALONGSIDE\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^(?:THE\\s+)?SIGNED\\s+SHEET\\s+CONTAINS\\s+${SERVICE_TOKEN}\\s+COMPARED\\s+AGAINST\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^CARRIER\\s+CONFIRMED\\s+${SERVICE_TOKEN}\\s+AS\\s+AN\\s+ALTERNATIVE\\s+TO\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^(?:THE\\s+)?FINAL\\s+QUOTE\\s+INCLUDES\\s+(?:BOTH\\s+)?${SERVICE_TOKEN}\\s+(?:AND|OR)\\s+${SERVICE_TOKEN}\\s+SERVICE$`),
    new RegExp(`^CARRIER\\s+CONFIRMED\\s+SERVICES\\s+${SERVICE_TOKEN}\\s+AND\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^CARRIER\\s+ACCEPTANCE\\s+NAMES\\s+${SERVICE_TOKEN}\\s+OR\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^OPERATIONAL\\s+SERVICES\\s+ARE\\s+${SERVICE_TOKEN}\\s+AND\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^CARRIER\\s+COMMITMENT\\s+INCLUDES\\s+${SERVICE_TOKEN}\\s+ALONGSIDE\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^AWARDED\\s+SERVICES\\s+${SERVICE_TOKEN}\\s+AND\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^FINALIZED\\s+SERVICE\\s+ALTERNATIVES\\s+ARE\\s+${SERVICE_TOKEN}\\s+VERSUS\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^CARRIER\\s+VERIFIED\\s+${SERVICE_TOKEN}\\s+AND\\s+${SERVICE_TOKEN}$`),
    new RegExp(`^CARRIER\\s+QUOTED\\s+${SERVICE_TOKEN}\\s+${SERVICE_TOKEN}\\s+AND\\s+${SERVICE_TOKEN}$`)
  ];
  if (carrierEvidencePatterns.some((pattern) => pattern.test(clause))) {
    const services = [...clause.matchAll(new RegExp(`\\b(${SERVICE_PATTERN})\\b`, "g"))]
      .map((match) => serviceFromCaptured(match[1]))
      .filter(Boolean);
    const unique = [...new Set(services)];
    return unique.length > 1 ? unique.map((service) => ({ service, tier: 2 })) : [];
  }
  if (isNonFinalClause(rawClause, clause)) return [];
  const patterns = [
    new RegExp(`^(?:SIGNED\\s+QUOTE\\s+SPECIFIES|(?:THE\\s+)?CARRIER\\s+(?:CONFIRMED|LISTED|OFFERS?|PRICED|QUOTED|STATED|SUBMITTED|VERIFIED)|(?:THE\\s+)?(?:SERVICE|QUOTE)\\s+IS|CONFIRMED)\\s+(?:BOTH\\s+)?(${SERVICE_PATTERN})\\s+(?:ALONGSIDE|AND|OR|PLUS|TOGETHER\\s+WITH|VERSUS)\\s+(${SERVICE_PATTERN})$`),
    new RegExp(`^(${SERVICE_PATTERN})\\s+(?:AND|OR|PLUS|VERSUS|VS|V)\\s+(${SERVICE_PATTERN})$`),
    new RegExp(`^(${SERVICE_PATTERN})\\s+(?:ALONGSIDE|AS\\s+AN\\s+ALTERNATIVE\\s+TO|COMPARED\\s+AGAINST|OR\\s+POTENTIALLY)\\s+(${SERVICE_PATTERN})$`)
  ];
  let services = [];
  for (const pattern of patterns) {
    const match = clause.match(pattern);
    if (!match) continue;
    services = [serviceFromCaptured(match[1]), serviceFromCaptured(match[2])];
    break;
  }
  if (!services.length) {
    const triple = clause.match(new RegExp(`^EITHER\\s+(${SERVICE_PATTERN})\\s+(${SERVICE_PATTERN})\\s+OR\\s+(${SERVICE_PATTERN})$`));
    if (triple) services = [serviceFromCaptured(triple[1]), serviceFromCaptured(triple[2]), serviceFromCaptured(triple[3])];
  }
  if (!services.length && /^[A-Z0-9 .]+(?:\/|\+)[A-Z0-9 .]+$/i.test(rawClause.trim())) {
    services = [...clause.matchAll(new RegExp(`\\b(${SERVICE_PATTERN})\\b`, "g"))].map((match) => serviceFromCaptured(match[1]));
  }
  const unique = [...new Set(services.filter(Boolean))];
  return unique.length > 1 ? unique.map((service) => ({ service, tier: 2 })) : [];
}

/** @returns {Observation[]} */
function contrastObservations(clause) {
  if (CHARGE_SIGNAL.test(clause)) return [];
  const preferred = clause.match(new RegExp(`^(${SERVICE_PATTERN})\\s+(?:RATHER\\s+THAN|INSTEAD\\s+OF|OVER)\\s+(${SERVICE_PATTERN})$`));
  if (preferred) {
    const service = serviceFromCaptured(preferred[1]);
    return service ? [{ service, tier: 2 }] : [];
  }
  const positiveNot = clause.match(new RegExp(`^(?:(?:THE\\s+)?CARRIER\\s+(?:CONFIRMED|QUOTED|STATED)(?:\\s+THE\\s+SERVICE)?(?:\\s+AS)?\\s+|USE\\s+)?(${SERVICE_PATTERN})\\s+NOT\\s+(${SERVICE_PATTERN})$`));
  if (positiveNot) {
    const service = serviceFromCaptured(positiveNot[1]);
    return service ? [{ service, tier: 2 }] : [];
  }
  return [];
}

function stripNegatedCorrections(clause) {
  const pattern = new RegExp(`\\b(?:NO|NOT|WITHOUT)(?:\\s+[A-Z0-9]+){0,5}\\s+(?:BEING\\s+)?(?:CORRECTED|CORRECTION)\\s+TO\\s+(?:${SERVICE_PATTERN})\\b`, "g");
  return clause.replace(pattern, " ").replace(/\s+/g, " ").trim();
}

/** @returns {Observation[]} */
function correctionObservations(rawClause, clause) {
  if (isNonFinalClause(rawClause, clause)) return [];
  const pattern = new RegExp(`\\b(?:CORRECTED|CORRECTION)\\s+TO\\s+(${SERVICE_PATTERN})\\b`, "g");
  /** @type {Observation[]} */
  const observations = [];
  for (const match of clause.matchAll(pattern)) {
    const start = match.index || 0;
    if (hasNegativeBefore(clause, start) || hasRejectedSuffix(clause, start + match[0].length)) continue;
    const service = serviceFromCaptured(match[1]);
    if (service) observations.push({ service, tier: 3 });
  }
  return observations;
}

/** @returns {Observation[]} */
function explicitRoundtripObservations(rawClause, clause) {
  if (isNonFinalClause(rawClause, clause)) return [];
  if (CHARGE_CONTEXT_SIGNAL.test(clause) && CHARGE_ONLY_QUALIFIER.test(clause)) return [];
  const patterns = [
    { pattern: /\b(?:RT|ROUND\s+TRIP)\s+(?:SERVICE\s+)?MARKER\s+(?:IS\s+)?(?:VISIBLE|EXPLICIT|SHOWN|PRESENT|TRUE)\b/g, allowCharge: true },
    { pattern: /\b(?:VISIBLE|EXPLICIT|SHOWN|PRESENT)\s+(?:SERVICE\s+)?MARKER\s+(?:IS\s+)?(?:RT|ROUND\s+TRIP)\b/g, allowCharge: true },
    { pattern: /\b(?:RT|ROUND\s+TRIP)\s+(?:IS\s+)?EXPLICITLY\s+(?:QUOTED|STATED|SHOWN)\b/g, allowCharge: true },
    { pattern: /\b(?:RT|ROUND\s+TRIP)\s+(?:IS\s+)?EXPLICITLY\s+INCLUDED\b/g, allowCharge: false },
    { pattern: /\bSAME\s+RATE\s+COVERS\s+(?:THE\s+)?ROUND\s+TRIP\b/g, allowCharge: true }
  ];
  for (const { pattern, allowCharge } of patterns) {
    if (!allowCharge && CHARGE_SIGNAL.test(clause)) continue;
    for (const match of clause.matchAll(pattern)) {
      const start = match.index || 0;
      if (hasNegativeBefore(clause, start) || hasRejectedSuffix(clause, start + match[0].length)) continue;
      return [{ service: "Roundtrip", tier: 2 }];
    }
  }
  return [];
}

/** @returns {Observation[]} */
function directServiceObservations(rawClause, clause) {
  if (!clause || CHARGE_SIGNAL.test(clause) || isNonFinalClause(rawClause, clause)) return [];

  const useNot = clause.match(new RegExp(`^USE\\s+(${SERVICE_PATTERN})\\s+NOT\\s+(${SERVICE_PATTERN})$`));
  if (useNot) {
    const service = serviceFromCaptured(useNot[1]);
    return service ? [{ service, tier: 1 }] : [];
  }

  const scrubbed = stripNegatedCorrections(clause);
  /** @type {RegExp[]} */
  const patterns = [
    new RegExp(`^(${SERVICE_PATTERN})$`),
    new RegExp(`^USE\\s+(${SERVICE_PATTERN})$`),
    new RegExp(`^(?:THE\\s+)?(?:SERVICE|RATE|QUOTE)\\s+(?:IS|WAS)\\s+(${SERVICE_PATTERN})$`),
    new RegExp(`^(?:THE\\s+)?CARRIER\\s+(?:CONFIRMED|QUOTED|STATED)(?:\\s+THE\\s+SERVICE)?(?:\\s+AS)?\\s+(${SERVICE_PATTERN})$`),
    new RegExp(`^(?:CONFIRMED|QUOTED|STATED)(?:\\s+THE\\s+SERVICE)?(?:\\s+AS)?\\s+(${SERVICE_PATTERN})$`),
    new RegExp(`^(?:THE\\s+)?CARRIER\\s+(?:(?:FINALLY|NOW|ULTIMATELY)\\s+)?(?:HAS\\s+)?(?:EXPLICITLY\\s+)?(?:ACCEPTED|APPROVED|FINALIZED|RECONFIRMED|SELECTED|VERIFIED)(?:\\s+THE\\s+SERVICE)?\\s+(${SERVICE_PATTERN})(?:\\s+(?:AS\\s+(?:THE\\s+)?(?:BINDING|FINAL)?\\s*SERVICE|AS\\s+FINAL|FOR\\s+THIS\\s+(?:MOVEMENT|LANE)))?$`),
    new RegExp(`^(?:FINAL\\s+(?:CARRIER\\s+SELECTION|SERVICE)|SERVICE\\s+FINAL|SERVICE\\s+DESIGNATION|THE\\s+AGREED\\s+SERVICE|OPERATIONAL\\s+SERVICE|FINALIZED\\s+SERVICE|SERVICE\\s+BASIS|AWARDED\\s+SERVICE|CARRIER\\s+COMMITMENT)\\s+(?:IS|EQUALS|REMAINS)?\\s*(${SERVICE_PATTERN})$`),
    new RegExp(`^(${SERVICE_PATTERN})\\s+(?:REMAINS\\s+THE\\s+AGREED\\s+SERVICE|SERVICE\\s+IS\\s+LOCKED\\s+IN|WAS\\s+FORMALLY\\s+SELECTED|WAS\\s+EXPLICITLY\\s+AGREED|IS\\s+THE\\s+FINAL\\s+CARRIER\\s+APPROVED\\s+SERVICE|SERVICE\\s+WAS\\s+APPROVED\\s+BY\\s+THE\\s+CARRIER)$`),
    new RegExp(`^(?:THE\\s+)?(?:SIGNED\\s+QUOTE\\s+SPECIFIES|QUOTE\\s+REFLECTS|RATE\\s+WAS\\s+ACCEPTED\\s+AS|CARRIER\\s+ACCEPTANCE\\s+NAMES)\\s+(${SERVICE_PATTERN})(?:\\s+SERVICE)?$`),
    new RegExp(`^(?:WE\\s+RECEIVED\\s+CARRIER\\s+CONFIRMATION\\s+OF|THE\\s+CARRIER\\s+DID\\s+CONFIRM)\\s+(${SERVICE_PATTERN})$`)
  ];
  for (const pattern of patterns) {
    const match = scrubbed.match(pattern);
    const service = match ? serviceFromCaptured(match[1]) : null;
    if (service) return [{ service, tier: 1 }];
  }

  const perRule = scrubbed.match(/^(?:OW|ONE\s+WAY|ONEWAY)\s+PER\s+RULE\b/);
  return perRule ? [{ service: "One Way", tier: 1 }] : [];
}

function revokesPriorObservation(clause) {
  return /\b(?:ABANDONED|ANNULLED|CANCELED|CANCELLED|DECLINED|DISAVOWED|DISCONTINUED|EXPIRED|INVALIDATED|NO\s+LONGER\s+(?:BINDING|EFFECTIVE|VALID)|REJECTED|RESCINDED|RETRACTED|REVOKED|TERMINATED|VOIDED|WITHDREW|WITHDRAWN)\b/.test(clause)
    && !/\b(?:ACCEPTED|APPROVED|CONFIRMED|FINAL|SELECTED)\s+(?:RT|ROUND\s+TRIP|ROUNDTRIP|OW|ONE\s+WAY|ONEWAY|BACKHAUL)\b/.test(clause);
}

/** @returns {Observation[]} */
function observationsFromNarrative(value) {
  const transition = transitionObservations(value);
  if (transition.length) return transition;

  /** @type {Observation[]} */
  const observations = [];
  for (const rawClause of value.split(/[;|\n\r]+/)) {
    const clause = normalizedServiceText(rawClause);
    if (!clause) continue;
    if (revokesPriorObservation(clause)) {
      observations.length = 0;
      continue;
    }

    const contrasts = contrastObservations(clause);
    if (contrasts.length) {
      observations.push(...contrasts);
      continue;
    }

    const alternatives = alternativeObservations(rawClause, clause);
    if (alternatives.length) {
      observations.push(...alternatives);
      continue;
    }
    observations.push(...correctionObservations(rawClause, clause));
    observations.push(...explicitRoundtripObservations(rawClause, clause));
    observations.push(...directServiceObservations(rawClause, clause));
  }
  return observations;
}

/** @param {unknown[]} values @returns {ServiceResolution} */
function resolveNarrativeParts(values) {
  /** @type {Observation[]} */
  const observations = [];
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value !== "string") return invalid("narrative", "non_string_narrative");
    observations.push(...observationsFromNarrative(value));
  }
  if (!observations.length) return absent();
  const highestTier = Math.max(...observations.map((item) => item.tier));
  const services = observations.filter((item) => item.tier === highestTier).map((item) => item.service);
  const unique = [...new Set(services)];
  return unique.length === 1 ? resolved(unique[0], "narrative") : conflict("narrative", unique);
}

/**
 * Resolve carrier service evidence without allowing malformed structured data
 * or contradictory evidence to fall through to a default service.
 * @param {unknown} [parts]
 * @returns {ServiceResolution}
 */
export function resolveServiceEvidence(parts = {}) {
  try {
    if (parts === null || typeof parts !== "object" || Array.isArray(parts)) {
      return invalid("structured", "invalid_evidence_container");
    }
    const prototype = Object.getPrototypeOf(parts);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalid("structured", "invalid_evidence_container");
    }

    const input = /** @type {{ sourceMarkers?: unknown, narrativeParts?: unknown }} */ (parts);
    const sourceMarkers = input.sourceMarkers === undefined ? [] : input.sourceMarkers;
    if (!Array.isArray(sourceMarkers)) return invalid("structured", "non_array_source_markers");
    const narrativeParts = input.narrativeParts === undefined ? [] : input.narrativeParts;
    if (!Array.isArray(narrativeParts)) return invalid("narrative", "non_array_narrative_parts");

    const structured = resolveStructuredMarkers(sourceMarkers);
    if (structured.state !== "absent") return structured;
    return resolveNarrativeParts(narrativeParts);
  } catch {
    return invalid("structured", "invalid_evidence_container");
  }
}

/**
 * Apply a resolution to the business default without allowing invalid or
 * conflicting evidence to masquerade as absence.
 * @param {ServiceResolution} resolution
 * @param {{ currentService?: unknown, oneDirection?: boolean, priced?: boolean }} [context]
 */
export function decideServiceFromResolution(
  resolution,
  { currentService = null, oneDirection = false, priced = false } = {}
) {
  if (resolution.state === "resolved") {
    return { state: "resolved", service: resolution.service };
  }
  if (resolution.state === "invalid" || resolution.state === "conflict") {
    return { state: "blocked", service: null, evidenceState: resolution.state };
  }

  const currentKey = normalizedServiceText(currentService);
  if (currentKey.includes("ROUNDTRIP") || currentKey.includes("ROUND TRIP")) {
    return { state: "corrected", service: "One Way" };
  }
  if (!currentKey && (oneDirection || priced)) {
    return { state: "defaulted", service: "One Way" };
  }
  return { state: "unchanged", service: null };
}

export function serviceFromNormalizedText(value) {
  const result = resolveNarrativeParts([value]);
  return result.state === "resolved" ? result.service : null;
}

/**
 * Backward-compatible value-only view for callers that do not need audit state.
 * @param {unknown} [parts]
 */
export function serviceEvidenceFromParts(parts = {}) {
  const result = resolveServiceEvidence(parts);
  return result.state === "resolved" ? result.service : null;
}
