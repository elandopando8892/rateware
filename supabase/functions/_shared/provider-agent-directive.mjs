// Explicit operator directives inside an inbound message.
//
// §6 requires the agent to recognise an express instruction from the user. The
// operating pattern is: an XBF operator forwards a carrier's email to the intake
// mailbox and writes a directive next to it — "Aplica protocolo OSP360" — meaning
// "this is an XBF Customer Setup case, work it".
//
// A directive is far more reliable than inferring intent from prose. The live
// mailbox proved why: it is full of "New Carrier Registration Invitation" notices
// that read like a customer setup but are the opposite direction of the flow, and
// the model classified them customer_setup at 0.95. An operator saying so directly
// removes the guess.
//
// THE SECURITY PROPERTY THAT MAKES THIS SAFE
//
// A directive is content, not authority. Anyone can type "Aplica protocolo OSP360"
// into an email. If the agent obeyed text alone, any external carrier could steer
// it — choosing the request type, and through it the work the system queues.
//
// So a directive is honoured ONLY when the message comes from a trusted internal
// sender. From anyone else it is recorded as attempted-but-refused, never obeyed.
// That refusal is deliberately visible: someone outside trying to drive the agent
// is worth an operator seeing.

export const DIRECTIVE_VERSION = '2026.08.19';

/** Protocols an operator can invoke, and what each one asserts. */
export const OPERATOR_PROTOCOLS = Object.freeze({
  osp360: Object.freeze({
    protocol: 'osp360',
    // Onboarding Service Provider: the carrier is asking XBF to register as their
    // customer. This is the product's primary case.
    request_type: 'customer_setup',
    description: 'XBF Customer Setup — work the carrier\'s client-registration request',
  }),
});

/**
 * Recognised directive forms. A bare mention of the protocol name is deliberately
 * NOT enough: "we discussed OSP360 yesterday" is prose, not an instruction. The
 * directive must be given as a command or as an explicit tag.
 */
const DIRECTIVE_PATTERNS = [
  // "Aplica protocolo OSP360", "aplicar protocolo osp-360", "apply protocol OSP 360"
  /\b(?:aplica(?:r)?|apply|ejecuta(?:r)?|run)\s+(?:el\s+|the\s+)?protocolo?\s+osp[\s-]?360\b/i,
  // "[OSP360]" or "#OSP360" as a deliberate tag
  /[\[#]\s*osp[\s-]?360\s*\]?/i,
];

const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase();

/** Domain of an email address, lowercased. */
export function domainOf(email) {
  const match = String(email ?? '').trim().toLowerCase().match(/@([^@\s>]+)/);
  return match ? match[1] : null;
}

/**
 * Internal domains whose senders may issue a directive.
 *
 * Defaults to the intake mailbox's own domain — a message from inside the company
 * that owns the mailbox. Additional domains are configured explicitly, because the
 * operator may forward from a different corporate domain than the mailbox's.
 */
export function trustedDirectiveDomains({ mailboxEmail, configured } = {}) {
  const domains = new Set();
  const own = domainOf(mailboxEmail);
  if (own) domains.add(own);
  for (const entry of String(configured ?? '').split(',')) {
    const domain = entry.trim().toLowerCase().replace(/^@/, '');
    if (domain) domains.add(domain);
  }
  return domains;
}

/**
 * Finds an operator directive and decides whether it may be obeyed.
 *
 * @returns {{ found, protocol, request_type, honored, reason }}
 *   found    — the text contains a directive
 *   honored  — it came from a trusted sender and may drive the run
 *   reason   — why it was refused, when it was
 */
export function detectOperatorDirective(input = {}) {
  const haystack = `${normalize(input.subject)} \n ${normalize(input.body_text)}`;
  const matched = DIRECTIVE_PATTERNS.some((pattern) => pattern.test(haystack));
  if (!matched) {
    return Object.freeze({ found: false, protocol: null, request_type: null, honored: false, reason: null });
  }

  const protocol = OPERATOR_PROTOCOLS.osp360;
  const senderDomain = domainOf(input.sender_email);
  const trusted = input.trusted_domains instanceof Set
    ? input.trusted_domains
    : new Set(Array.isArray(input.trusted_domains) ? input.trusted_domains : []);

  if (!senderDomain) {
    return Object.freeze({
      found: true, protocol: protocol.protocol, request_type: null,
      honored: false, reason: 'sender_unknown',
    });
  }
  if (!trusted.has(senderDomain)) {
    // Recorded, never obeyed. An external sender invoking an internal protocol is
    // an attempt to steer the agent and an operator should be able to see it.
    return Object.freeze({
      found: true, protocol: protocol.protocol, request_type: null,
      honored: false, reason: 'directive_from_untrusted_sender',
    });
  }

  return Object.freeze({
    found: true,
    protocol: protocol.protocol,
    request_type: protocol.request_type,
    honored: true,
    reason: null,
  });
}
