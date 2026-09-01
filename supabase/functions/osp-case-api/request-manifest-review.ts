export type RequestManifestDecisionOutcome =
  | "answered"
  | "external"
  | "not_applicable";

export type RequestManifestDecisionInput = Readonly<{
  decisionId: string;
  outcome: RequestManifestDecisionOutcome;
  resolution: string;
}>;

export type RequestManifestDecision =
  & RequestManifestDecisionInput
  & Readonly<{
    kind: "clarification" | "contradiction" | "missing";
    fieldId: string | null;
    prompt: string;
    evidenceIds: readonly string[];
  }>;

export type RequestManifestDecisionReview = Readonly<{
  status: "resolved" | "needs_external_clarification";
  decisions: readonly RequestManifestDecision[];
  canonicalSha256: string;
}>;

const DECISION_ID =
  /^(?:clarification|contradiction|missing):(?:0|[1-9][0-9]{0,2})$/;
const FIELD_ID = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;
const EVIDENCE_ID = /^[A-Za-z0-9:_-]{1,256}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("REQUEST_MANIFEST_REVIEW_INVALID");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, minimum: number, maximum: number): string {
  if (
    typeof value !== "string" || value.trim() !== value ||
    value.length < minimum || value.length > maximum ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  ) {
    throw new Error("REQUEST_MANIFEST_REVIEW_INVALID");
  }
  return value;
}

function evidence(value: unknown): readonly string[] {
  if (
    !Array.isArray(value) || value.length > 20 ||
    value.some((item) => typeof item !== "string" || !EVIDENCE_ID.test(item)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error("REQUEST_MANIFEST_REVIEW_INVALID");
  }
  return Object.freeze([...value].sort()) as readonly string[];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${
      Object.keys(value as Record<string, unknown>).sort().map((key) =>
        `${JSON.stringify(key)}:${
          stable((value as Record<string, unknown>)[key])
        }`
      ).join(",")
    }}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stable(value)),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function requestManifestDecisionSeeds(
  manifest: unknown,
): readonly Omit<RequestManifestDecision, "outcome" | "resolution">[] {
  const row = record(manifest);
  if (
    !Array.isArray(row.clarificationQuestions) ||
    !Array.isArray(row.contradictions) || !Array.isArray(row.missingInformation)
  ) {
    throw new Error("REQUEST_MANIFEST_REVIEW_INVALID");
  }
  const clarifiedFields = new Set<string>();
  const seeds: Omit<RequestManifestDecision, "outcome" | "resolution">[] = [];
  row.clarificationQuestions.forEach((value, index) => {
    const item = record(value);
    const fieldId = text(item.fieldId, 1, 128);
    if (!FIELD_ID.test(fieldId) || clarifiedFields.has(fieldId)) {
      throw new Error("REQUEST_MANIFEST_REVIEW_INVALID");
    }
    clarifiedFields.add(fieldId);
    seeds.push(Object.freeze({
      decisionId: `clarification:${index}`,
      kind: "clarification" as const,
      fieldId,
      prompt: text(item.question, 3, 500),
      evidenceIds: evidence(item.evidenceIds),
    }));
  });
  row.contradictions.forEach((value, index) => {
    const item = record(value);
    seeds.push(Object.freeze({
      decisionId: `contradiction:${index}`,
      kind: "contradiction" as const,
      fieldId: null,
      prompt: text(item.text, 1, 10_000),
      evidenceIds: evidence(item.evidenceIds),
    }));
  });
  row.missingInformation.forEach((value, index) => {
    const item = record(value);
    const fieldId = text(item.fieldId, 1, 128);
    if (!FIELD_ID.test(fieldId)) {
      throw new Error("REQUEST_MANIFEST_REVIEW_INVALID");
    }
    if (clarifiedFields.has(fieldId)) return;
    seeds.push(Object.freeze({
      decisionId: `missing:${index}`,
      kind: "missing" as const,
      fieldId,
      prompt: text(item.description, 1, 500),
      evidenceIds: evidence(item.evidenceIds),
    }));
  });
  if (
    seeds.length > 200 ||
    new Set(seeds.map((item) => item.decisionId)).size !== seeds.length
  ) {
    throw new Error("REQUEST_MANIFEST_REVIEW_INVALID");
  }
  return Object.freeze(seeds);
}

export async function buildRequestManifestDecisionReview(input: {
  manifest: unknown;
  decisions: readonly RequestManifestDecisionInput[];
}): Promise<RequestManifestDecisionReview> {
  const seeds = requestManifestDecisionSeeds(input.manifest);
  if (
    !Array.isArray(input.decisions) || input.decisions.length !== seeds.length
  ) throw new Error("REQUEST_MANIFEST_REVIEW_SCOPE_MISMATCH");
  const submitted = new Map<string, RequestManifestDecisionInput>();
  for (const item of input.decisions) {
    if (
      !item || typeof item !== "object" || !DECISION_ID.test(item.decisionId) ||
      submitted.has(item.decisionId) ||
      !["answered", "external", "not_applicable"].includes(item.outcome)
    ) {
      throw new Error("REQUEST_MANIFEST_REVIEW_INVALID");
    }
    submitted.set(
      item.decisionId,
      Object.freeze({
        decisionId: item.decisionId,
        outcome: item.outcome,
        resolution: text(item.resolution, 3, 2_000),
      }),
    );
  }
  const decisions = seeds.map((seed) => {
    const decision = submitted.get(seed.decisionId);
    if (!decision) throw new Error("REQUEST_MANIFEST_REVIEW_SCOPE_MISMATCH");
    return Object.freeze({
      ...seed,
      outcome: decision.outcome,
      resolution: decision.resolution,
    });
  });
  const status = decisions.some((item) => item.outcome === "external")
    ? "needs_external_clarification" as const
    : "resolved" as const;
  const canonical = { status, decisions };
  return Object.freeze({
    ...canonical,
    canonicalSha256: await sha256(canonical),
  });
}
