import type { FormComponent, FormTemplateVersion } from '../../../apps/osp/src/features/forms/surveyjs-canonical-adapter.ts';

export type FormTemplateCatalogItem = {
  templateId: string;
  name: string;
  updatedAt: string;
  latest: FormTemplateVersion;
};

export type SaveFormDraftInput = {
  organizationId: string;
  subject: string;
  idempotencyKey: string;
  templateId: string | null;
  expectedVersion: number;
  name: string;
  fields: readonly FormComponent[];
  schemaSha256: string;
};

export type PublishFormInput = {
  organizationId: string;
  subject: string;
  idempotencyKey: string;
  templateId: string;
  templateVersionId: string;
  expectedVersion: number;
};

export type FormMutationReceipt = { template: FormTemplateCatalogItem; replayed: boolean };

export interface FormStore {
  list(organizationId: string): Promise<readonly FormTemplateCatalogItem[]>;
  saveDraft(input: SaveFormDraftInput): Promise<FormMutationReceipt>;
  publish(input: PublishFormInput): Promise<FormMutationReceipt>;
}

type Receipt = { hash: string; value: FormMutationReceipt };

function fail(code: string): never { throw new Error(code); }

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function hash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function locked<T>(lock: { current: Promise<void> }, action: () => Promise<T>): Promise<T> {
  const previous = lock.current;
  let release!: () => void;
  lock.current = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await action(); } finally { release(); }
}

export function createInMemoryFormStore(now: () => Date = () => new Date('2026-08-26T20:00:00.000Z')): FormStore {
  const byOrganization = new Map<string, Map<string, FormTemplateCatalogItem>>();
  const receipts = new Map<string, Receipt>();
  const lock = { current: Promise.resolve() };
  const templates = (organizationId: string) => {
    let organization = byOrganization.get(organizationId);
    if (!organization) { organization = new Map(); byOrganization.set(organizationId, organization); }
    return organization;
  };
  const receiptKey = (organizationId: string, operation: string, idempotencyKey: string) => `${organizationId}\u0000${operation}\u0000${idempotencyKey}`;

  async function replayOrRun(input: { organizationId: string; idempotencyKey: string }, operation: string, request: unknown, action: () => FormMutationReceipt): Promise<FormMutationReceipt> {
    return await locked(lock, async () => {
      const key = receiptKey(input.organizationId, operation, input.idempotencyKey);
      const requestHash = await hash(request);
      const prior = receipts.get(key);
      if (prior) {
        if (prior.hash !== requestHash) fail('IDEMPOTENCY_CONFLICT');
        return structuredClone({ ...prior.value, replayed: true });
      }
      const value = action();
      receipts.set(key, { hash: requestHash, value: structuredClone(value) });
      return structuredClone(value);
    });
  }

  return Object.freeze({
    async list(organizationId: string) {
      return [...templates(organizationId).values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((item) => structuredClone(item));
    },
    async saveDraft(input: SaveFormDraftInput) {
      return await replayOrRun(input, 'save_form_template_draft', input, () => {
        const organization = templates(input.organizationId);
        const current = input.templateId === null ? null : organization.get(input.templateId) ?? null;
        if (input.templateId === null) {
          if (input.expectedVersion !== 0) fail('VERSION_CONFLICT');
          if ([...organization.values()].some((item) => item.name === input.name)) fail('FORM_NAME_CONFLICT');
        } else if (!current) fail('FORM_NOT_FOUND');
        else if (current.latest.version !== input.expectedVersion || current.name !== input.name) fail('VERSION_CONFLICT');
        const templateId = current?.templateId ?? crypto.randomUUID();
        const version = (current?.latest.version ?? 0) + 1;
        const item: FormTemplateCatalogItem = {
          templateId, name: input.name, updatedAt: now().toISOString(),
          latest: { id: crypto.randomUUID(), templateId, version, status: 'draft', fields: structuredClone(input.fields), schemaSha256: input.schemaSha256 },
        };
        organization.set(templateId, item);
        return { template: item, replayed: false };
      });
    },
    async publish(input: PublishFormInput) {
      return await replayOrRun(input, 'publish_form_template', input, () => {
        const item = templates(input.organizationId).get(input.templateId);
        if (!item) fail('FORM_NOT_FOUND');
        if (item.latest.id !== input.templateVersionId || item.latest.version !== input.expectedVersion || item.latest.status !== 'draft') fail('VERSION_CONFLICT');
        item.latest = { ...item.latest, status: 'published' };
        item.updatedAt = now().toISOString();
        return { template: item, replayed: false };
      });
    },
  });
}

export const formStoreInternals = Object.freeze({ stable, hash });
