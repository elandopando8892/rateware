import type { ParsedSheet, XlsxStructure } from "./xlsx-structure.ts";

const CELL = /^([A-Z]{1,3})([1-9][0-9]*)$/;
const BLOCKED_RATE = new Set([
  "x",
  "n a",
  "na",
  "please estimate",
  "tier 1",
  "tier 2",
  "tier 3",
]);

const DEFINITIONS = Object.freeze(
  [
    { key: "vendor", labels: ["vendor", "carrier", "transportista"] },
    { key: "rfx", labels: ["rfx", "rfx id", "rfx number", "rfx numero"] },
    { key: "origin", labels: ["origin", "origen"] },
    { key: "destination", labels: ["destination", "destino"] },
    { key: "equipment", labels: ["equipment", "equipo"] },
    { key: "operation", labels: ["operation", "operacion"] },
    { key: "service", labels: ["service", "servicio"] },
    { key: "linehaul", labels: ["linehaul", "line haul"] },
    {
      key: "borderFee",
      labels: ["border fee", "border crossing fee", "cruce"],
    },
    { key: "fsc", labels: ["fsc", "fuel surcharge"] },
    { key: "allInRate", labels: ["all in rate", "all-in rate", "all in"] },
    {
      key: "weeklyCapacity",
      labels: ["weekly capacity", "capacity per week", "capacidad semanal"],
    },
  ] as const,
);

type QuoteField = typeof DEFINITIONS[number]["key"];
type Scalar = string | number | boolean;
type Candidate = Readonly<{ value: Scalar; evidenceIds: readonly string[] }>;
const RATE_SIGNAL_FIELDS = new Set<QuoteField>([
  "linehaul",
  "borderFee",
  "fsc",
  "allInRate",
  "weeklyCapacity",
]);

export type RatewareXlsxQuote = Readonly<{
  parserVersion: "osp-rateware-xlsx-adjacent-label-v1";
  vendor: string;
  rfx: string;
  origin: string;
  destination: string;
  equipment: string;
  operation: string;
  service: string;
  linehaul: number;
  borderFee: number;
  fsc: number;
  fscMode: "fraction_of_linehaul" | "amount";
  allInRate: number;
  weeklyCapacity: number;
  evidence: Readonly<Record<QuoteField, readonly string[]>>;
}>;

function normalize(value: string): string {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function coordinates(value: string): readonly [number, number] | null {
  const match = CELL.exec(value);
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

function scalar(cell: ParsedSheet["cells"][number] | undefined): Scalar | null {
  if (!cell || cell.kind === "formula") return null;
  if (typeof cell.value === "string") {
    const value = cell.value.trim();
    return value.length > 0 ? value : null;
  }
  return cell.value;
}

function stable(value: Scalar): string {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function requiredCandidate(
  candidates: ReadonlyMap<QuoteField, readonly Candidate[]>,
  key: QuoteField,
): Candidate {
  const values = candidates.get(key) ?? [];
  const distinct = new Map(
    values.map((candidate) => [stable(candidate.value), candidate]),
  );
  if (distinct.size !== 1) {
    throw new Error(
      distinct.size === 0
        ? "RATEWARE_XLSX_FIELDS_NOT_FOUND"
        : "RATEWARE_XLSX_CONTRADICTORY",
    );
  }
  return distinct.values().next().value!;
}

function textValue(candidate: Candidate): string {
  const value = String(candidate.value).trim();
  if (!value || value.length > 500) {
    throw new Error("RATEWARE_XLSX_VALUE_INVALID");
  }
  return value;
}

function numericValue(
  candidate: Candidate,
  options: { percentage?: boolean } = {},
): number {
  if (typeof candidate.value === "boolean") {
    throw new Error("RATEWARE_XLSX_RATE_INVALID");
  }
  const raw = String(candidate.value).trim();
  const normalized = normalize(raw);
  if (BLOCKED_RATE.has(normalized)) {
    throw new Error("RATEWARE_XLSX_RATE_NOT_USABLE");
  }
  const percent = raw.endsWith("%");
  const cleaned = raw.replace(/[$,%\s]/g, "").replace(/^(?:usd|mxn)/i, "")
    .replace(/(?:usd|mxn)$/i, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    throw new Error("RATEWARE_XLSX_RATE_INVALID");
  }
  let value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 100_000_000) {
    throw new Error("RATEWARE_XLSX_RATE_INVALID");
  }
  if (options.percentage && (percent || value > 1 && value <= 100)) {
    value /= 100;
  }
  return value;
}

function almostEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.01;
}

function quoteCandidates(
  structure: XlsxStructure,
): ReadonlyMap<QuoteField, readonly Candidate[]> {
  const aliases = new Map<string, QuoteField>();
  for (const definition of DEFINITIONS) {
    for (const label of definition.labels) {
      aliases.set(normalize(label), definition.key);
    }
  }
  const candidates = new Map<QuoteField, Candidate[]>();
  for (
    let sheetIndex = 0;
    sheetIndex < structure.sheets.length;
    sheetIndex += 1
  ) {
    const sheet = structure.sheets[sheetIndex];
    const cells = new Map(sheet.cells.map((cell) => [cell.address, cell]));
    const labels = new Map<string, QuoteField>();
    for (const cell of sheet.cells) {
      if (cell.kind !== "string") continue;
      const key = aliases.get(normalize(String(cell.value)));
      if (key) labels.set(cell.address, key);
    }
    const labelsPerRow = new Map<number, number>();
    for (const labelAddress of labels.keys()) {
      const position = coordinates(labelAddress);
      if (position) {
        labelsPerRow.set(position[1], (labelsPerRow.get(position[1]) ?? 0) + 1);
      }
    }
    for (const [labelAddress, key] of labels) {
      const position = coordinates(labelAddress);
      if (!position) continue;
      const [column, row] = position;
      if ((labelsPerRow.get(row - 1) ?? 0) > 1) continue;
      const below = cells.get(address(column, row + 1));
      const right = cells.get(address(column + 1, row));
      const headerRow = (labelsPerRow.get(row) ?? 0) > 1;
      const valueCell = headerRow
        ? below
        : labels.has(right?.address ?? "")
        ? below
        : right ?? below;
      const value = scalar(valueCell);
      if (value === null || !valueCell) continue;
      const bucket = candidates.get(key) ?? [];
      bucket.push({
        value,
        evidenceIds: Object.freeze([
          `xlsx:${sheetIndex + 1}:${labelAddress}`,
          `xlsx:${sheetIndex + 1}:${valueCell.address}`,
        ]),
      });
      candidates.set(key, bucket);
    }
  }

  return candidates;
}

function quoteFromCandidates(
  candidates: ReadonlyMap<QuoteField, readonly Candidate[]>,
): RatewareXlsxQuote {
  const found = Object.fromEntries(
    DEFINITIONS.map(({ key }) => [key, requiredCandidate(candidates, key)]),
  ) as Record<QuoteField, Candidate>;
  const linehaul = numericValue(found.linehaul);
  const borderFee = numericValue(found.borderFee);
  const fsc = numericValue(found.fsc, { percentage: true });
  const allInRate = numericValue(found.allInRate);
  const weeklyCapacity = numericValue(found.weeklyCapacity);
  if (
    linehaul <= 0 || allInRate <= 0 || !Number.isSafeInteger(weeklyCapacity) ||
    weeklyCapacity < 1
  ) {
    throw new Error("RATEWARE_XLSX_RATE_INVALID");
  }
  const fractionTotal = linehaul + borderFee + linehaul * fsc;
  const amountTotal = linehaul + borderFee + fsc;
  const fscMode = almostEqual(allInRate, fractionTotal)
    ? "fraction_of_linehaul" as const
    : almostEqual(allInRate, amountTotal)
    ? "amount" as const
    : null;
  if (!fscMode) throw new Error("RATEWARE_XLSX_TOTAL_INCONSISTENT");

  return Object.freeze({
    parserVersion: "osp-rateware-xlsx-adjacent-label-v1",
    vendor: textValue(found.vendor),
    rfx: textValue(found.rfx),
    origin: textValue(found.origin),
    destination: textValue(found.destination),
    equipment: textValue(found.equipment),
    operation: textValue(found.operation),
    service: textValue(found.service),
    linehaul,
    borderFee,
    fsc,
    fscMode,
    allInRate,
    weeklyCapacity,
    evidence: Object.freeze(Object.fromEntries(
      DEFINITIONS.map(({ key }) => [key, found[key].evidenceIds]),
    ) as Record<QuoteField, readonly string[]>),
  });
}

export function classifyRatewareXlsxQuote(
  structure: XlsxStructure,
): RatewareXlsxQuote | null {
  const candidates = quoteCandidates(structure);
  const signaled = [...RATE_SIGNAL_FIELDS].some((key) =>
    (candidates.get(key)?.length ?? 0) > 0
  );
  if (!signaled) return null;
  if (
    DEFINITIONS.some(({ key }) => (candidates.get(key)?.length ?? 0) === 0)
  ) throw new Error("RATEWARE_XLSX_PARTIAL_QUOTE");
  return quoteFromCandidates(candidates);
}

export function parseRatewareXlsxQuote(
  structure: XlsxStructure,
): RatewareXlsxQuote {
  const quote = classifyRatewareXlsxQuote(structure);
  if (!quote) throw new Error("RATEWARE_XLSX_FIELDS_NOT_FOUND");
  return quote;
}
