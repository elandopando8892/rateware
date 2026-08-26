export type DuplicateSignal = {
  kind: 'gmail_message_id' | 'raw_mime_hash' | 'attachment_hash' | 'thread_ancestry' | 'supplier_domain' | 'application_reference' | 'date_window' | 'requirement_similarity';
  score: number;
  sourceIds: readonly string[];
};

export type DuplicateAssessment =
  | { outcome: 'new'; evidence: readonly DuplicateSignal[] }
  | { outcome: 'exact'; existingCaseId: string; evidence: readonly DuplicateSignal[] }
  | { outcome: 'probable'; candidateCaseIds: readonly string[]; evidence: readonly DuplicateSignal[] };

export type DuplicateCandidate = {
  caseId: string;
  gmailMessageId: string;
  rawMimeHash: string;
  attachmentHashes: readonly string[];
  gmailThreadId: string;
  supplierDomain: string;
  applicationReference: string | null;
  receivedAt: string;
  requirementTokens: readonly string[];
};

function signal(kind: DuplicateSignal['kind'], score: number, left: string, right: string): DuplicateSignal {
  return Object.freeze({ kind, score, sourceIds: Object.freeze([left, right].sort()) });
}
function jaccard(left: readonly string[], right: readonly string[]): number {
  const a = new Set(left.map((value) => value.toLowerCase()));
  const b = new Set(right.map((value) => value.toLowerCase()));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : [...a].filter((value) => b.has(value)).length / union.size;
}
function withinThirtyDays(left: string, right: string): boolean {
  const a = Date.parse(left); const b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 30 * 24 * 60 * 60 * 1000;
}

export function assessDuplicates(incoming: DuplicateCandidate, existing: readonly DuplicateCandidate[]): DuplicateAssessment {
  const evidence: DuplicateSignal[] = [];
  const probable = new Set<string>();
  for (const candidate of existing) {
    if (candidate.gmailMessageId === incoming.gmailMessageId) return { outcome: 'exact', existingCaseId: candidate.caseId, evidence: [signal('gmail_message_id', 1, incoming.gmailMessageId, candidate.gmailMessageId)] };
    if (candidate.rawMimeHash === incoming.rawMimeHash) return { outcome: 'exact', existingCaseId: candidate.caseId, evidence: [signal('raw_mime_hash', 1, incoming.rawMimeHash, candidate.rawMimeHash)] };
    for (const hash of incoming.attachmentHashes) if (candidate.attachmentHashes.includes(hash)) evidence.push(signal('attachment_hash', 0.25, incoming.caseId, candidate.caseId));
    const sameThread = candidate.gmailThreadId === incoming.gmailThreadId;
    const sameDomain = candidate.supplierDomain === incoming.supplierDomain;
    if (sameThread) evidence.push(signal('thread_ancestry', 0.8, incoming.caseId, candidate.caseId));
    if (sameDomain) evidence.push(signal('supplier_domain', 0.4, incoming.caseId, candidate.caseId));
    if (sameThread && sameDomain) probable.add(candidate.caseId);
    if (incoming.applicationReference && incoming.applicationReference === candidate.applicationReference && withinThirtyDays(incoming.receivedAt, candidate.receivedAt)) {
      evidence.push(signal('application_reference', 0.8, incoming.caseId, candidate.caseId));
      evidence.push(signal('date_window', 0.4, incoming.caseId, candidate.caseId));
      probable.add(candidate.caseId);
    }
    const similarity = jaccard(incoming.requirementTokens, candidate.requirementTokens);
    if (similarity >= 0.82) { evidence.push(signal('requirement_similarity', similarity, incoming.caseId, candidate.caseId)); probable.add(candidate.caseId); }
  }
  return probable.size > 0 ? { outcome: 'probable', candidateCaseIds: [...probable].sort(), evidence } : { outcome: 'new', evidence };
}
