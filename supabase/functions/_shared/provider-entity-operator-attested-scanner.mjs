// Operator-attested processor for the Entity Vault.
//
// Used for a bootstrap import of the company's OWN documents from a trusted
// operator drive — not untrusted uploads from the provider portal. It performs no
// machine malware scan and does not pretend to: it returns 'operator_attested', a
// status the processor records truthfully and accepts ONLY when the ingestion is
// an operator import (source_channel='manual'). A portal upload still requires a
// real scanner. Hashing and human review are unaffected — every document is still
// hash-verified and still lands in Document Review before it is releasable.
import { classifyDocument } from './provider-entity-import.mjs';

/**
 * @param {string} attestedByUserId
 * @returns {{
 *   scan: () => Promise<{status:'operator_attested'; engine:string; reference:string}>,
 *   classify: (bytes: any, context: {mimeType?: string; filename?: string}) => Promise<{
 *     status:'classified'|'needs_review'|'rejected';
 *     documentType?: string; sensitivity?: string; confidence?: number;
 *   }>
 * }}
 */
export function createOperatorAttestedProcessor(attestedByUserId) {
  const attestedBy = String(attestedByUserId || '').trim() || 'operator';
  return {
    async scan() {
      return /** @type {const} */ ({ status: 'operator_attested', engine: 'operator-attested', reference: attestedBy });
    },
    async classify(_bytes, context) {
      const result = classifyDocument((context && context.filename) || '');
      if (result.requires_human_classification) {
        // The unnamed files route to human classification instead of promotion.
        return /** @type {const} */ ({ status: 'needs_review' });
      }
      return /** @type {const} */ ({
        status: 'classified',
        documentType: result.document_type,
        sensitivity: result.sensitivity,
        confidence: 0.95,
      });
    },
  };
}
