import type { BackgroundJobStore } from "../_shared/osp/background-jobs.ts";
import {
  assertExtractionSnapshot,
  type EvidenceItem,
  type ExtractedField,
  type ExtractionSnapshot,
} from "../_shared/osp/extraction-contracts.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import type {
  StructuredEvidenceInput,
  StructuredExtractionResult,
  StructuredFieldValue,
} from "./openai-structured-extraction.ts";
import { parseXlsxStructure } from "./xlsx-structure.ts";
import { createXlsxStructuralSnapshot } from "./xlsx-structural-extraction.ts";
import type { AzureAnalysis } from "./azure-document-intelligence.ts";

export type ManagedExtractionSource = Readonly<{
  organizationId: string;
  caseId: string;
  documentVersionId: string;
  bucketId: "osp-corporate-documents";
  objectKey: string;
  contentType: string;
  sourceSha256: string;
  sourceSafety: "safe";
  templateVersionId: string | null;
  existingExtractionId: string | null;
}>;

export interface ManagedExtractionStore {
  load(input: {
    organizationId: string;
    documentVersionId: string;
  }): Promise<ManagedExtractionSource>;
  persist(input: {
    source: ManagedExtractionSource;
    snapshot: ExtractionSnapshot;
  }): Promise<string>;
}

export interface ManagedExtractionStorage {
  download(input: {
    bucketId: "osp-corporate-documents";
    objectKey: string;
  }): Promise<Uint8Array>;
}

export interface LayoutAnalyzer {
  analyze(input: {
    sourceVersionId: string;
    sourceSafety: "safe";
    contentType: string;
    bytes: Uint8Array;
  }): Promise<AzureAnalysis>;
}

export interface StructuredExtractor {
  modelVersion: string;
  extract(input: {
    evidence: StructuredEvidenceInput[];
  }): Promise<StructuredExtractionResult>;
}

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSM = "application/vnd.ms-excel.sheet.macroEnabled.12";
const PROMPT_VERSION = "osp-supplier-requirement-v1";
const SCHEMA_VERSION = "osp-supplier-extraction-schema-v1";

function validation(
  value: StructuredFieldValue,
  contradictory: boolean,
): ExtractedField["validation"] {
  if (contradictory) return "contradictory";
  if (value.presence !== "present") return "low_confidence";
  return value.confidence >= 0.8 ? "valid" : "low_confidence";
}

function locators(
  evidenceIds: readonly string[],
  evidence: ReadonlyMap<string, EvidenceItem>,
) {
  return evidenceIds.map((id) => {
    const item = evidence.get(id);
    if (!item) throw new Error("OPENAI_EVIDENCE_CLOSURE");
    return item.locator;
  });
}

async function extractedField(input: {
  source: ManagedExtractionSource;
  extractionId: string;
  fieldKey: string;
  value: StructuredFieldValue;
  evidence: ReadonlyMap<string, EvidenceItem>;
  modelVersion: string;
  contradictory: boolean;
}): Promise<ExtractedField> {
  const beforeSha256 = await sha256Hex(
    new TextEncoder().encode(
      JSON.stringify({ presence: "absent", value: null }),
    ),
  );
  const afterSha256 = await sha256Hex(
    new TextEncoder().encode(JSON.stringify({
      presence: input.value.presence,
      value: input.value.value,
    })),
  );
  return Object.freeze({
    id: crypto.randomUUID(),
    organizationId: input.source.organizationId,
    caseId: input.source.caseId,
    extractionId: input.extractionId,
    beforeSha256,
    afterSha256,
    fieldKey: input.fieldKey,
    presence: input.value.presence,
    value: input.value.value,
    confidence: input.value.confidence,
    evidence: Object.freeze(locators(input.value.evidenceIds, input.evidence)),
    provider: "openai_structured_outputs" as const,
    modelVersion: input.modelVersion,
    schemaVersion: 1 as const,
    validation: validation(input.value, input.contradictory),
  });
}

async function snapshot(input: {
  source: ManagedExtractionSource;
  evidence: readonly EvidenceItem[];
  result: StructuredExtractionResult;
  modelVersion: string;
}): Promise<ExtractionSnapshot> {
  const extractionId = crypto.randomUUID();
  const evidence = new Map(input.evidence.map((item) => [item.id, item]));
  const contradictory = input.result.contradictions.length > 0;
  const fields: ExtractedField[] = [
    await extractedField({
      source: input.source,
      extractionId,
      fieldKey: "supplier.legalName",
      value: input.result.supplier.legalName,
      evidence,
      modelVersion: input.modelVersion,
      contradictory,
    }),
  ];
  for (let index = 0; index < input.result.requestedDocuments.length; index++) {
    const item = input.result.requestedDocuments[index];
    const base = {
      presence: "present" as const,
      confidence: 1,
      evidenceIds: item.evidenceIds,
    };
    fields.push(
      await extractedField({
        source: input.source,
        extractionId,
        fieldKey: `requestedDocuments.${index + 1}.documentType`,
        value: { ...base, value: item.documentType },
        evidence,
        modelVersion: input.modelVersion,
        contradictory,
      }),
    );
    fields.push(
      await extractedField({
        source: input.source,
        extractionId,
        fieldKey: `requestedDocuments.${index + 1}.required`,
        value: { ...base, value: String(item.required) },
        evidence,
        modelVersion: input.modelVersion,
        contradictory,
      }),
    );
  }
  for (let index = 0; index < input.result.requirements.length; index++) {
    const item = input.result.requirements[index];
    fields.push(
      await extractedField({
        source: input.source,
        extractionId,
        fieldKey: `requirements.${index + 1}.text`,
        value: {
          presence: "present",
          value: item.text,
          confidence: 1,
          evidenceIds: item.evidenceIds,
        },
        evidence,
        modelVersion: input.modelVersion,
        contradictory,
      }),
    );
  }
  const created: ExtractionSnapshot = Object.freeze({
    id: extractionId,
    organizationId: input.source.organizationId,
    caseId: input.source.caseId,
    sourceVersionId: input.source.documentVersionId,
    inputSha256: input.source.sourceSha256,
    promptSha256: await sha256Hex(new TextEncoder().encode(PROMPT_VERSION)),
    schemaSha256: await sha256Hex(new TextEncoder().encode(SCHEMA_VERSION)),
    fields: Object.freeze(fields),
    status: "review_required",
  });
  assertExtractionSnapshot(created);
  return created;
}

export function createManagedExtractionService(deps: {
  store: ManagedExtractionStore;
  storage: ManagedExtractionStorage;
  layout?: LayoutAnalyzer;
  structured?: StructuredExtractor;
  jobs: Pick<BackgroundJobStore, "enqueue">;
}) {
  return Object.freeze({
    async extract(input: {
      organizationId: string;
      documentVersionId: string;
      correlationId: string;
      leaseToken: string;
    }): Promise<void> {
      const source = await deps.store.load(input);
      let extractionId = source.existingExtractionId;
      if (!extractionId) {
        const bytes = await deps.storage.download({
          bucketId: source.bucketId,
          objectKey: source.objectKey,
        });
        if (await sha256Hex(bytes) !== source.sourceSha256) {
          throw new Error("SOURCE_HASH_MISMATCH");
        }
        let created: ExtractionSnapshot;
        if ([XLSX, XLSM].includes(source.contentType)) {
          const structure = await parseXlsxStructure({
            sourceVersionId: source.documentVersionId,
            bytes,
            contentType: source.contentType as typeof XLSX | typeof XLSM,
          });
          created = await createXlsxStructuralSnapshot({ source, structure });
        } else {
          if (!deps.layout || !deps.structured) {
            throw new Error("PROVIDER_CONFIGURATION_REQUIRED");
          }
          const evidence = (await deps.layout.analyze({
            sourceVersionId: source.documentVersionId,
            sourceSafety: source.sourceSafety,
            contentType: source.contentType,
            bytes,
          })).evidence;
          if (evidence.length === 0) {
            throw new Error("EXTRACTION_EVIDENCE_REQUIRED");
          }
          const result = await deps.structured.extract({
            evidence: evidence.map(({ id, locator, content }) => ({
              id,
              kind: locator.kind,
              content,
            })),
          });
          created = await snapshot({
            source,
            evidence,
            result,
            modelVersion: deps.structured.modelVersion,
          });
        }
        extractionId = await deps.store.persist({ source, snapshot: created });
      }
      if (source.templateVersionId) {
        await deps.jobs.enqueue({
          organizationId: source.organizationId,
          kind: "form_ai_mapping",
          opaquePayload: {
            caseId: source.caseId,
            extractionId,
            templateVersionId: source.templateVersionId,
          },
          idempotencyKey:
            `prepare:${source.caseId}:${extractionId}:${source.templateVersionId}`,
        });
      }
    },
  });
}
