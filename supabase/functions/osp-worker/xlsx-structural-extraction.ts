import type {
  EvidenceItem,
  EvidenceLocator,
  ExtractedField,
  ExtractionSnapshot,
} from "../_shared/osp/extraction-contracts.ts";
import { assertExtractionSnapshot } from "../_shared/osp/extraction-contracts.ts";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import type { ParsedSheet, XlsxStructure } from "./xlsx-structure.ts";

const PROMPT_VERSION = "osp-xlsx-adjacent-label-v1";
const SCHEMA_VERSION = "osp-xlsx-canonical-fields-v1";
const CELL = /^([A-Z]{1,3})([1-9][0-9]*)$/;

const FIELD_ALIASES = Object.freeze(
  [
    {
      fieldKey: "supplier.legalName",
      labels: [
        "legal name",
        "company legal name",
        "legal company name",
        "nombre legal",
        "nombre o razon social",
        "razon social",
      ],
    },
    {
      fieldKey: "fiscal.taxIdentifier",
      labels: [
        "tax identifier",
        "tax id",
        "rfc",
        "registro federal de contribuyentes",
      ],
    },
    {
      fieldKey: "supplier.address",
      labels: [
        "registered address",
        "legal address",
        "fiscal address",
        "domicilio fiscal",
        "direccion fiscal",
      ],
    },
    {
      fieldKey: "banking.accountNumber",
      labels: [
        "bank account",
        "bank account number",
        "account number",
        "clabe",
        "clabe interbancaria",
        "cuenta bancaria",
        "numero de cuenta",
      ],
    },
  ] as const,
);

type Candidate = Readonly<{
  value: string | number | boolean;
  evidence: readonly EvidenceItem[];
}>;

function normalize(value: string): string {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function coordinates(address: string): readonly [number, number] | null {
  const match = CELL.exec(address);
  if (!match) return null;
  let column = 0;
  for (const character of match[1]) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  return [column, Number(match[2])];
}

function address(column: number, row: number): string {
  let value = "";
  while (column > 0) {
    column -= 1;
    value = String.fromCharCode(65 + column % 26) + value;
    column = Math.floor(column / 26);
  }
  return `${value}${row}`;
}

function scalar(
  cell: ParsedSheet["cells"][number] | undefined,
): string | number | boolean | null {
  if (!cell || cell.kind === "formula") return null;
  if (typeof cell.value === "string") {
    const trimmed = cell.value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return cell.value;
}

function stable(value: string | number | boolean): string {
  return `${typeof value}:${JSON.stringify(value)}`;
}

async function extractedField(input: {
  source: {
    organizationId: string;
    caseId: string;
    documentVersionId: string;
  };
  extractionId: string;
  fieldKey: string;
  candidates: readonly Candidate[];
  blankEvidence: readonly EvidenceItem[];
  modelVersion: string;
}): Promise<ExtractedField> {
  if (input.candidates.length === 0) {
    const beforeSha256 = await sha256Hex(
      new TextEncoder().encode(
        JSON.stringify({ presence: "absent", value: null }),
      ),
    );
    const afterSha256 = await sha256Hex(
      new TextEncoder().encode(
        JSON.stringify({ presence: "blank", value: null }),
      ),
    );
    return Object.freeze({
      id: crypto.randomUUID(),
      organizationId: input.source.organizationId,
      caseId: input.source.caseId,
      extractionId: input.extractionId,
      beforeSha256,
      afterSha256,
      fieldKey: input.fieldKey,
      presence: "blank" as const,
      value: null,
      confidence: 1,
      evidence: Object.freeze(input.blankEvidence.map((item) => item.locator)),
      provider: "xlsx_structural" as const,
      modelVersion: input.modelVersion,
      schemaVersion: 1 as const,
      validation: "valid" as const,
    });
  }
  const distinct = new Map<string, Candidate>();
  for (const candidate of input.candidates) {
    const key = stable(candidate.value);
    if (!distinct.has(key)) distinct.set(key, candidate);
  }
  const contradictory = distinct.size > 1;
  const selected = distinct.values().next().value as Candidate | undefined;
  const presence = contradictory ? "uncertain" as const : "present" as const;
  const value = contradictory ? null : selected!.value;
  const locators = [...new Map(
    input.candidates.flatMap((candidate) => candidate.evidence).map((item) => [
      `${item.locator.kind}:${item.id}`,
      item.locator,
    ]),
  ).values()] as EvidenceLocator[];
  const beforeSha256 = await sha256Hex(
    new TextEncoder().encode(
      JSON.stringify({ presence: "absent", value: null }),
    ),
  );
  const afterSha256 = await sha256Hex(
    new TextEncoder().encode(JSON.stringify({ presence, value })),
  );
  return Object.freeze({
    id: crypto.randomUUID(),
    organizationId: input.source.organizationId,
    caseId: input.source.caseId,
    extractionId: input.extractionId,
    beforeSha256,
    afterSha256,
    fieldKey: input.fieldKey,
    presence,
    value,
    confidence: contradictory ? 0 : 1,
    evidence: Object.freeze(locators),
    provider: "xlsx_structural" as const,
    modelVersion: input.modelVersion,
    schemaVersion: 1 as const,
    validation: contradictory ? "contradictory" as const : "valid" as const,
  });
}

export async function createXlsxStructuralSnapshot(input: {
  source: {
    organizationId: string;
    caseId: string;
    documentVersionId: string;
    sourceSha256: string;
  };
  structure: XlsxStructure;
}): Promise<ExtractionSnapshot> {
  const extractionId = crypto.randomUUID();
  const evidenceById = new Map(
    input.structure.evidence.map((item) => [item.id, item]),
  );
  const aliases = new Map<string, string>();
  for (const field of FIELD_ALIASES) {
    for (const label of field.labels) {
      aliases.set(normalize(label), field.fieldKey);
    }
  }
  const candidates = new Map<string, Candidate[]>();
  const detectedLabels = new Map<string, EvidenceItem[]>();
  for (
    let sheetIndex = 0;
    sheetIndex < input.structure.sheets.length;
    sheetIndex += 1
  ) {
    const sheet = input.structure.sheets[sheetIndex];
    const cells = new Map(sheet.cells.map((cell) => [cell.address, cell]));
    for (const labelCell of sheet.cells) {
      if (labelCell.kind !== "string") continue;
      const fieldKey = aliases.get(normalize(String(labelCell.value)));
      if (!fieldKey) continue;
      const cellCoordinates = coordinates(labelCell.address);
      if (!cellCoordinates) continue;
      const [column, row] = cellCoordinates;
      const labelEvidence = evidenceById.get(
        `xlsx:${sheetIndex + 1}:${labelCell.address}`,
      );
      if (!labelEvidence) throw new Error("XLSX_EVIDENCE_CLOSURE");
      const detected = detectedLabels.get(fieldKey) ?? [];
      detected.push(labelEvidence);
      detectedLabels.set(fieldKey, detected);
      const valueCell = cells.get(address(column + 1, row)) ??
        cells.get(address(column, row + 1));
      const value = scalar(valueCell);
      if (
        value === null || !valueCell ||
        (typeof value === "string" && aliases.has(normalize(value)))
      ) continue;
      const valueEvidence = evidenceById.get(
        `xlsx:${sheetIndex + 1}:${valueCell.address}`,
      );
      if (!valueEvidence) {
        throw new Error("XLSX_EVIDENCE_CLOSURE");
      }
      const existing = candidates.get(fieldKey) ?? [];
      existing.push({ value, evidence: [labelEvidence, valueEvidence] });
      candidates.set(fieldKey, existing);
    }
  }
  if (detectedLabels.size === 0) {
    throw new Error("XLSX_CANONICAL_FIELDS_NOT_FOUND");
  }
  const fields: ExtractedField[] = [];
  for (const definition of FIELD_ALIASES) {
    const labels = detectedLabels.get(definition.fieldKey);
    if (!labels) continue;
    fields.push(
      await extractedField({
        source: input.source,
        extractionId,
        fieldKey: definition.fieldKey,
        candidates: candidates.get(definition.fieldKey) ?? [],
        blankEvidence: labels,
        modelVersion: `${input.structure.modelVersion}/adjacent-label-v1`,
      }),
    );
  }
  const snapshot: ExtractionSnapshot = Object.freeze({
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
  assertExtractionSnapshot(snapshot);
  return snapshot;
}
