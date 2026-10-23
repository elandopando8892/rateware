export interface RestrictionIssue { code: string; status: 'pending' | 'blocked'; laneId: string | null; }
export interface ReeferDecision { applies: boolean; ok: boolean; status: 'not_applicable' | 'compatible' | 'pending' | 'blocked'; issues: RestrictionIssue[]; policyId: string | null; sourceRefs: string[]; scopeCode?: string | null; }
export const REEFER_POLICY: Readonly<{id:string;templateId:string;organizationId:string;evidence:string}>;
export function isReeferTemplate(templateId: unknown): boolean;
export function reeferFacts(lane: Record<string, unknown>): Record<string, {state:'known';value:string|number|boolean} | {state:'ambiguous'}>;
export function evaluateReeferRestrictions(input: {templateId:unknown;organizationId:unknown;vendorId:unknown;lanes:Record<string,unknown>[]}): ReeferDecision;
