// deno-lint-ignore-file no-import-prefix
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import type { SqlPort } from "../_shared/osp/database-context.ts";
import {
  loadReviewedPackageSetSources,
  type SourceRow,
} from "./supplier-package-set-sources.ts";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  organizationId: id(1),
  caseId: id(2),
  snapshotId: id(3),
  jobId: id(4),
  leaseToken: id(5),
};
const source = (
  n: number,
) => ({
  source_version_id: id(n),
  mappings: [{ value: n }],
} as unknown as SourceRow);
const nativeSource = (n: number, kind: "acroform" | "content_control") => ({
  source_version_id: id(n),
  content_type: kind === "acroform"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  mapping_decision_id: id(50 + n),
  mappings: [{
    kind,
    canonicalFieldId: "company.name",
    mappingDecisionId: id(50 + n),
    value: "Synthetic XBF",
    ...(kind === "acroform"
      ? { fieldName: "legal_name" }
      : { targetTag: "company.name" }),
  }],
} as unknown as SourceRow);
function port(
  expected: number[],
  primary: SourceRow[],
  fallback: SourceRow[],
  native: SourceRow[],
) {
  return ((strings: TemplateStringsArray) => {
    const query = strings.join("?");
    return Promise.resolve(
      query.startsWith("select distinct")
        ? expected.map((n) => ({ source_version_id: id(n) }))
        : query.includes("'reviewedTarget'")
        ? primary
        : query.includes("'xlsx_cell'")
        ? fallback
        : native,
    );
  }) as SqlPort;
}
Deno.test("mixed originals retain reviewed XLSX and native reviewed PDF/DOCX independently", async () => {
  const result = await loadReviewedPackageSetSources(
    port([6, 7, 8, 9], [source(6)], [{
      ...source(6),
      mappings: [{ value: "must not override" }],
    }, source(7)], [
      nativeSource(8, "acroform"),
      nativeSource(9, "content_control"),
    ]),
    input,
  );
  assertEquals(result.map((row) => row.source_version_id), [
    id(6),
    id(7),
    id(8),
    id(9),
  ]);
  assertEquals(result[0].mappings, [{ value: 6 }]);
});
Deno.test("missing or ambiguous originals never downgrade to a partial set", async () => {
  await assertRejects(
    () =>
      loadReviewedPackageSetSources(port([6, 7], [source(6)], [], []), input),
    Error,
    "SUPPLIER_PACKAGE_SET_SOURCE_CONFLICT",
  );
  await assertRejects(
    () =>
      loadReviewedPackageSetSources(
        port([6], [source(6), source(6)], [], []),
        input,
      ),
    Error,
    "SUPPLIER_PACKAGE_SET_SOURCE_CONFLICT",
  );
});
