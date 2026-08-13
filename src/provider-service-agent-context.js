export function buildProviderAgentContext(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Agent context must be an object.');
  const organizationId = String(input.organizationId || '').trim();
  const legalEntityId = String(input.legalEntityId || '').trim();
  if (!organizationId || !legalEntityId) throw new TypeError('organizationId and legalEntityId are required.');
  const collections = ['documents','requirements','openCases','communications','approvals'];
  for (const key of collections) {
    for (const item of Array.isArray(input[key]) ? input[key] : []) {
      if (item?.legalEntityId && String(item.legalEntityId) !== legalEntityId) throw new RangeError(`${key} contains cross-entity data.`);
    }
  }
  const providerRelationshipId = String(input.providerRelationshipId || '').trim() || null;
  return Object.freeze({
    organizationId,
    legalEntityId,
    providerRelationshipId,
    providerResolved: Boolean(providerRelationshipId),
    threadId: String(input.threadId || '').trim() || null,
    caseId: String(input.caseId || '').trim() || null,
    activationId: String(input.activationId || '').trim() || null,
    goldenRecord: input.goldenRecord && typeof input.goldenRecord === 'object' ? input.goldenRecord : {},
    provider: input.provider && typeof input.provider === 'object' ? input.provider : null,
    activation: input.activation && typeof input.activation === 'object' ? input.activation : null,
    documents: Object.freeze([...(input.documents || [])]),
    requirements: Object.freeze([...(input.requirements || [])]),
    openCases: Object.freeze([...(input.openCases || [])]),
    communications: Object.freeze([...(input.communications || [])]),
    approvals: Object.freeze([...(input.approvals || [])]),
  });
}
