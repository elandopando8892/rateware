// Sensitivity of a taxpayer identifier, decided from the identifier itself.
//
// WHY THIS EXISTS
//
// The ontology gives each field code one sensitivity. That is wrong for `rfc`, because a
// Mexican RFC is two different things wearing the same name:
//
//   XSL260511N11   12 characters -- persona moral. A company's RFC is business
//                  identification. It is printed on every CFDI the company issues and is
//                  routinely exchanged during customer setup.
//
//   XAXX010101000  13 characters -- persona fisica. The middle six digits are the
//                  person's DATE OF BIRTH, so the identifier is personal data about a
//                  named individual. (This example is the SAT's generic RFC, which
//                  belongs to nobody. A real one is not written down here, for the
//                  reason this whole module exists.)
//
// Classifying the field code globally forces a choice between blocking every company RFC
// from ever reaching a form, or publishing the birth date of every sole trader we
// onboard. Mexican freight is full of personas fisicas, so neither is acceptable.
//
// The identifier declares which one it is, so nothing external has to be consulted: the
// length and shape are the discriminator. That makes this decidable at promotion time,
// when a value finally exists -- at seeding time there is none, by design (section 7).
//
// A value that does not parse as either is treated as personal. Guessing wrong in that
// direction over-protects; guessing wrong the other way publishes a birth date.

export const TAXPAYER_CLASSIFICATION_VERSION = '2026.08.20';

/** Field codes whose sensitivity depends on the value rather than the code. */
export const VALUE_CLASSIFIED_FIELDS = Object.freeze(['rfc', 'tax_id']);

// Persona moral: 3 letters + YYMMDD + 3-character homoclave.
const RFC_MORAL = /^[A-ZÑ&]{3}\d{6}[A-Z\d]{3}$/;
// Persona fisica: 4 letters + YYMMDD + 3-character homoclave.
const RFC_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$/;

const normalize = (value) => String(value ?? '').trim().toUpperCase().replace(/[\s-]/g, '');

/**
 * Which kind of taxpayer an RFC belongs to.
 *
 * @returns {'moral'|'fisica'|'unknown'}
 */
export function rfcKind(value) {
  const rfc = normalize(value);
  if (RFC_MORAL.test(rfc)) return 'moral';
  if (RFC_FISICA.test(rfc)) return 'fisica';
  return 'unknown';
}

/**
 * Sensitivity for one promoted fact.
 *
 * Only the value-classified fields are touched; every other field keeps the sensitivity
 * the ontology and the review assigned it. The reason is returned alongside so the
 * promotion can record WHY a value was classified the way it was -- an operator seeing an
 * RFC marked public needs to be able to tell that from a mistake.
 *
 * @param fieldCode canonical field code
 * @param value the promoted value
 * @param reviewSensitivity what the review field carried
 * @returns {{ sensitivity, reason, taxpayer_kind }}
 */
export function factSensitivity(fieldCode, value, reviewSensitivity) {
  const code = String(fieldCode ?? '').trim();
  if (!VALUE_CLASSIFIED_FIELDS.includes(code)) {
    return { sensitivity: reviewSensitivity, reason: 'ontology_default', taxpayer_kind: null };
  }
  const kind = rfcKind(value);
  if (kind === 'moral') {
    // Business identification, printed on every invoice the company issues.
    return { sensitivity: 'public', reason: 'rfc_persona_moral', taxpayer_kind: 'moral' };
  }
  if (kind === 'fisica') {
    // Contains the individual's date of birth.
    return { sensitivity: 'restricted', reason: 'rfc_persona_fisica_contains_birth_date', taxpayer_kind: 'fisica' };
  }
  // Unparseable: keep it closed. A generic tax_id from another country lands here too,
  // and there is no basis to open it.
  return { sensitivity: 'restricted', reason: 'taxpayer_id_unrecognised', taxpayer_kind: 'unknown' };
}
