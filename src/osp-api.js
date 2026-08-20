// The Onboarding Service Provider's API client.
//
// OSP's actions used to be reached by naming Rateware's function at nine call sites:
// callRatewareFunction('shipper-directory-api', …). They now have their own edge runtime,
// and the name of that runtime is a fact about OSP that belongs in one place.
//
// The transport is still Rateware's: src/rateware-api.js handles the bearer token, the
// retry on a stale token, and unwrapping the response envelope. That is 69 lines of
// genuinely generic plumbing and forking it would buy nothing today. When OSP grows its
// own auth module, this file is the only thing that has to change.

import { callRatewareFunction } from './rateware-api.js';

/** OSP's own edge function. Moving the runtime again means editing this line. */
export const OSP_FUNCTION = 'provider-onboarding-api';

/** The Gmail intake runtime, already OSP's own. */
export const OSP_GMAIL_FUNCTION = 'provider-gmail-intake-api';

/** Calls an OSP onboarding action. */
export function callOsp(action, payload) {
  return callRatewareFunction(OSP_FUNCTION, action, payload);
}

/** Calls an OSP Gmail intake action. */
export function callOspGmail(action, payload) {
  return callRatewareFunction(OSP_GMAIL_FUNCTION, action, payload);
}
