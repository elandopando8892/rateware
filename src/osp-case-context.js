// Shared case context for the Onboarding Service Provider shell.
//
// The shell hosts each surface in an iframe, so the surfaces are isolated: choosing a
// case in the Command Center could not tell the Evidence or Approvals screens which case
// the operator is working. Every screen started from nothing and the operator re-found
// the same case in each one.
//
// This is the narrow channel that fixes that. The shell owns the active case; a surface
// announces a selection upward and reads the current one from its own URL.
//
// SECURITY
//
// postMessage is a cross-document channel and, left open, accepts anything from anyone
// framed or framing. Both directions are therefore checked:
//   - the origin must be this exact origin, never '*'
//   - the shell additionally requires the message to come from its own frame's window
//   - the payload must be a case id in UUID form and a short label; anything else is
//     dropped without acting on it
// A message is a hint about navigation, never a command: nothing here performs a
// privileged action, and the surface still authorises and loads the case itself.

export const CASE_MESSAGE = 'osp:case-selected';
export const CASE_PARAM = 'case';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LABEL_LIMIT = 120;

/** The case id this document was opened for, if it carries a valid one. */
export function caseFromUrl(search = window.location.search) {
  const value = new URLSearchParams(search).get(CASE_PARAM);
  return value && UUID.test(value) ? value : null;
}

/** Adds the active case to a surface URL. Absent case leaves the URL untouched. */
export function withCase(url, caseId) {
  if (!caseId || !UUID.test(caseId)) return url;
  const parsed = new URL(url, window.location.href);
  parsed.searchParams.set(CASE_PARAM, caseId);
  return `${parsed.pathname}${parsed.search}`;
}

/** Normalises an untrusted payload, or returns null. */
function readPayload(data) {
  if (!data || data.type !== CASE_MESSAGE) return null;
  const id = String(data.caseId ?? '');
  if (!UUID.test(id)) return null;
  const label = String(data.label ?? '').replace(/\s+/g, ' ').trim().slice(0, LABEL_LIMIT);
  return { caseId: id, label };
}

/**
 * Called by a surface when the operator picks a case. A no-op when the surface is not
 * framed, so the same code runs standalone.
 */
export function announceCase(caseId, label) {
  if (window.parent === window) return;
  if (!caseId || !UUID.test(caseId)) return;
  window.parent.postMessage(
    { type: CASE_MESSAGE, caseId, label: String(label ?? '').slice(0, LABEL_LIMIT) },
    window.location.origin,
  );
}

/**
 * Called by the shell. Invokes `handler` only for well-formed messages that came from
 * `expectedSource` on this origin.
 *
 * @returns a function that removes the listener
 */
export function listenForCase(handler, expectedSource) {
  const onMessage = (event) => {
    if (event.origin !== window.location.origin) return;
    if (expectedSource && event.source !== expectedSource()) return;
    const payload = readPayload(event.data);
    if (payload) handler(payload);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
