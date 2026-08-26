import type { OspAuthorityContext } from '../_shared/osp/workflow-authority.ts';
import type { CaseEvent, CaseState, OspWriteCommand } from '../_shared/osp/workflow-contracts.ts';

export type CaseTransaction = { transactionId: string; organizationId: string };
export type CaseDetail = { id: string; organizationId: string; state: CaseState; aggregateVersion: number; supplierId: string; blockedByDuplicateReview: boolean };
export type CasePage = { items: readonly CaseDetail[]; nextCursor: string | null };
export type AssignCaseCommand = OspWriteCommand<'assign_case', { caseId: string; assigneeSubject: string }>;
export type AddCommentCommand = OspWriteCommand<'add_case_comment', { caseId: string; body: string }>;
export type SaveClarificationDraftCommand = OspWriteCommand<'save_clarification_draft', { caseId: string; body: string; attachmentIds: readonly string[] }>;
export type ResolveDuplicateCommand = OspWriteCommand<'resolve_duplicate_candidate', { caseId: string; candidateId: string; resolution: 'link' | 'keep_separate'; reasonCode: string }>;

export interface CaseStore {
  transactCommand<T>(authority: OspAuthorityContext, command: OspWriteCommand<string, unknown>, operation: (tx: CaseTransaction) => Promise<T>): Promise<T>;
  listCases(authority: OspAuthorityContext, cursor: string | null, limit: number): Promise<CasePage>;
  getCase(authority: OspAuthorityContext, caseId: string): Promise<CaseDetail>;
  appendEvent(tx: CaseTransaction, event: CaseEvent): Promise<void>;
  assignCase(authority: OspAuthorityContext, command: AssignCaseCommand): Promise<CaseDetail>;
  addComment(authority: OspAuthorityContext, command: AddCommentCommand): Promise<CaseDetail>;
  saveClarificationDraft(authority: OspAuthorityContext, command: SaveClarificationDraftCommand): Promise<CaseDetail>;
  resolveDuplicate(authority: OspAuthorityContext, command: ResolveDuplicateCommand): Promise<CaseDetail>;
}
