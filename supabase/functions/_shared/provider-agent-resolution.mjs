// Agent core: deterministic provider matching and XBF legal-entity resolution.
//
// These are the two decisions the agent must make before anything else can happen,
// and neither is a language problem — both are evidence problems. They are kept
// deterministic so a match or an entity choice is an inspectable number with a stated
// basis, not a model's opinion. PROVIDER_AGENT_ACTION_POLICY declares
// create_provider_from_ambiguous_match as forbidden, which is only enforceable if
// confidence is computed.
//
// Output shape matches provider_communication_match_candidates: match_basis,
// confidence, evidence.

export const AGENT_RESOLUTION_VERSION = '2026.08.17';

// Auto-linking on one of these would match every provider using a consumer mailbox.
const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com',
  'yahoo.com', 'yahoo.com.mx', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com',
  'msn.com', 'me.com', 'mail.com', 'gmx.com', 'zoho.com',
]);

// A candidate at or above this confidence may be auto-linked; below it the thread
// stays unmatched and the candidates are queued for a human.
export const AUTO_LINK_THRESHOLD = 0.9;

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();

export function emailDomain(value) {
  const parts = lower(value).split('@');
  return parts.length === 2 && parts[1] ? parts[1] : null;
}

export function isGenericDomain(domain) {
  return GENERIC_EMAIL_DOMAINS.has(lower(domain));
}

/** Normalizes a company name for comparison: case, accents, punctuation, legal suffixes. */
export function normalizeCompanyName(value) {
  // Punctuation is stripped first, so "S.A. de C.V." arrives as "s a de c v".
  // Every suffix pattern therefore tolerates spaces between letters.
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(s\s*de\s*r\s*l(\s*de\s*c\s*v)?|s\s*a\s*(de\s*c\s*v|p\s*i)?|s\s*c|l\s*l\s*c|inc(orporated)?|corp(oration)?|co(mpany)?|ltd|limited|l\s*l\s*p|l\s*p)$/g, '')
    .trim();
}

/** Extracts MC and DOT numbers from free text. These are strong provider identifiers. */
export function extractCarrierIdentifiers(value) {
  const source = String(value ?? '');
  const mc = [...source.matchAll(/\bMC[-\s#]*(\d{4,8})\b/gi)].map((match) => match[1]);
  const dot = [...source.matchAll(/\b(?:US)?DOT[-\s#]*(\d{5,8})\b/gi)].map((match) => match[1]);
  return Object.freeze({
    mc_numbers: Object.freeze([...new Set(mc)]),
    dot_numbers: Object.freeze([...new Set(dot)]),
  });
}

function candidate(relationshipId, basis, confidence, evidence) {
  return Object.freeze({
    provider_relationship_id: relationshipId,
    match_basis: basis,
    confidence,
    evidence: Object.freeze(evidence),
    resolution_version: AGENT_RESOLUTION_VERSION,
  });
}

/**
 * Scores provider-relationship candidates for an inbound message.
 *
 * @param signals   { from_email, reply_to_email, subject, body_text, sender_name }
 * @param relationships [{ id, legal_entity_id, display_name, contact_emails,
 *                         domains, mc_numbers, dot_numbers }]
 * @returns { candidates, auto_link, decision, reason }
 *
 * Never returns an auto-link when two distinct relationships tie at the top: the
 * agent may propose, but an ambiguous provider is a human decision.
 */
export function scoreProviderMatch(rawSignals = {}, relationships = []) {
  // Default parameters only fire on undefined; a null body is a realistic input.
  const signals = rawSignals ?? {};
  const fromEmail = lower(signals.from_email);
  const replyTo = lower(signals.reply_to_email);
  const senderDomain = emailDomain(fromEmail) || emailDomain(replyTo);
  const generic = senderDomain ? isGenericDomain(senderDomain) : false;
  const haystack = `${text(signals.subject)} ${text(signals.body_text)}`;
  const identifiers = extractCarrierIdentifiers(haystack);
  const senderName = normalizeCompanyName(signals.sender_name);

  const candidates = [];
  for (const relationship of Array.isArray(relationships) ? relationships : []) {
    const id = text(relationship?.id);
    if (!id) continue;
    const contactEmails = (relationship.contact_emails || []).map(lower);
    const domains = (relationship.domains || []).map(lower).filter((domain) => !isGenericDomain(domain));

    if (fromEmail && contactEmails.includes(fromEmail)) {
      candidates.push(candidate(id, 'contact_email', 1, { matched_email: fromEmail }));
      continue;
    }
    if (replyTo && contactEmails.includes(replyTo)) {
      candidates.push(candidate(id, 'reply_to_email', 0.95, { matched_email: replyTo }));
      continue;
    }
    const mcHit = (relationship.mc_numbers || []).map(text).find((value) => identifiers.mc_numbers.includes(value));
    const dotHit = (relationship.dot_numbers || []).map(text).find((value) => identifiers.dot_numbers.includes(value));
    if (mcHit || dotHit) {
      candidates.push(candidate(id, 'carrier_identifier', 0.95, mcHit ? { mc_number: mcHit } : { dot_number: dotHit }));
      continue;
    }
    // A generic sender domain proves nothing about which provider sent the mail.
    if (senderDomain && !generic && domains.includes(senderDomain)) {
      candidates.push(candidate(id, 'sender_domain', 0.9, { domain: senderDomain }));
      continue;
    }
    const relationshipName = normalizeCompanyName(relationship.display_name);
    if (senderName && relationshipName && senderName === relationshipName) {
      candidates.push(candidate(id, 'normalized_name', 0.6, { normalized_name: relationshipName }));
    }
  }

  candidates.sort((left, right) => right.confidence - left.confidence);
  const top = candidates[0] ?? null;
  const tied = top ? candidates.filter((entry) => entry.confidence === top.confidence) : [];
  const distinct = new Set(tied.map((entry) => entry.provider_relationship_id));

  let decision = 'unmatched';
  let reason = 'no_candidate';
  let autoLink = null;
  if (top && distinct.size > 1) {
    decision = 'ambiguous';
    reason = 'multiple_candidates_at_equal_confidence';
  } else if (top && top.confidence >= AUTO_LINK_THRESHOLD) {
    decision = 'matched';
    reason = top.match_basis;
    autoLink = top;
  } else if (top) {
    decision = 'needs_review';
    reason = 'confidence_below_auto_link_threshold';
  }

  return Object.freeze({
    candidates: Object.freeze(candidates),
    auto_link: autoLink,
    decision,
    reason,
    sender_domain_generic: generic,
    resolution_version: AGENT_RESOLUTION_VERSION,
  });
}

// --- XBF legal-entity resolution (brief §4) --------------------------------

const MX_SIGNALS = [
  [/\brfc\b|registro federal de contribuyentes/i, 'rfc_reference'],
  [/constancia de situacion fiscal|\bcsf\b/i, 'csf_reference'],
  [/acta constitutiva/i, 'acta_constitutiva_reference'],
  [/\bsat\b|servicio de administracion tributaria/i, 'sat_reference'],
  [/\bcfdi\b|complemento carta porte/i, 'cfdi_reference'],
  [/\bmxn\b|pesos mexicanos/i, 'mxn_currency'],
  [/\bmexico\b|méxico|mexican entity/i, 'mexico_jurisdiction'],
];

const US_SIGNALS = [
  [/\bein\b|employer identification number/i, 'ein_reference'],
  [/\bw-?9\b/i, 'w9_reference'],
  [/\birs\b/i, 'irs_reference'],
  [/\bmc[-\s#]*\d|motor carrier number/i, 'mc_reference'],
  [/\b(?:us)?dot[-\s#]*\d/i, 'dot_reference'],
  [/\bfmcsa\b/i, 'fmcsa_reference'],
  [/\busd\b|us dollars/i, 'usd_currency'],
  [/\bunited states\b|\bu\.s\.\b|\busa\b/i, 'us_jurisdiction'],
];

function collect(rules, source) {
  // Accents are stripped before matching so "Situación Fiscal" hits the same rule as
  // "Situacion Fiscal" — Spanish sources routinely carry them.
  const normalized = String(source ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return rules.filter(([pattern]) => pattern.test(normalized)).map(([, label]) => label);
}

/**
 * Resolves which XBF legal entity a request is addressed to.
 *
 * An explicit instruction wins. Otherwise evidence is weighed, and conflicting or
 * absent evidence yields `ambiguous` with a review reason — §4 forbids selecting an
 * entity automatically when the evidence is ambiguous.
 */
export function resolveXbfEntity(rawSignals = {}) {
  const signals = rawSignals ?? {};
  const explicit = lower(signals.explicit_entity_kind);
  if (explicit === 'mx' || explicit === 'us') {
    return Object.freeze({
      entity_kind: explicit,
      decision: 'resolved',
      basis: 'explicit_instruction',
      confidence: 1,
      mx_signals: Object.freeze([]),
      us_signals: Object.freeze([]),
      requires_human_selection: false,
      resolution_version: AGENT_RESOLUTION_VERSION,
    });
  }

  const source = [signals.subject, signals.body_text, signals.attachment_names, signals.form_title]
    .flat().filter(Boolean).join(' \n ');
  const mx = collect(MX_SIGNALS, source);
  const us = collect(US_SIGNALS, source);

  let entityKind = null;
  let decision = 'ambiguous';
  let basis = 'no_jurisdiction_evidence';
  let confidence = 0;

  if (mx.length && !us.length) {
    entityKind = 'mx'; decision = 'resolved'; basis = 'jurisdiction_evidence';
    confidence = Math.min(1, 0.6 + 0.1 * mx.length);
  } else if (us.length && !mx.length) {
    entityKind = 'us'; decision = 'resolved'; basis = 'jurisdiction_evidence';
    confidence = Math.min(1, 0.6 + 0.1 * us.length);
  } else if (mx.length && us.length) {
    // Both jurisdictions cited. A bilingual packet may legitimately mention both, so
    // this is never resolved silently — it becomes a review task.
    decision = 'ambiguous'; basis = 'conflicting_jurisdiction_evidence';
  } else if (signals.relationship_entity_kind) {
    // Falling back to the entity already linked to the relationship is a proposal,
    // not a resolution: it reflects history, not this request.
    const linked = lower(signals.relationship_entity_kind);
    if (linked === 'mx' || linked === 'us') {
      entityKind = linked; decision = 'needs_review'; basis = 'existing_relationship_entity'; confidence = 0.5;
    }
  }

  return Object.freeze({
    entity_kind: entityKind,
    decision,
    basis,
    confidence,
    mx_signals: Object.freeze(mx),
    us_signals: Object.freeze(us),
    requires_human_selection: decision !== 'resolved',
    resolution_version: AGENT_RESOLUTION_VERSION,
  });
}
