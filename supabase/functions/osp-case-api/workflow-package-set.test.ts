// deno-lint-ignore-file no-import-prefix
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import { canonicalPackageSetJson } from "../_shared/osp/package-set-json.ts";
import {
  loadWorkflowPackageSet,
  packageSetDownloadName,
  parseWorkflowPackageSet,
} from "./workflow-package-set.ts";
import type { SqlPort } from "../_shared/osp/database-context.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

Deno.test("each supported form keeps its real extension and distinct stable download name", () => {
  const types = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel.sheet.macroEnabled.12",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  const extensions = ["pdf", "xlsx", "xlsm", "docx"];
  assertEquals(
    types.map((contentType, index) =>
      packageSetDownloadName({ sourceVersionId: id(index + 5), contentType })
    ),
    extensions.map((extension, index) =>
      `XBF-OSP-Form-${id(index + 5)}.${extension}`
    ),
  );
});
Deno.test("download names reject unsupported formats and untrusted path identities", async () => {
  for (
    const file of [{
      sourceVersionId: "../../private",
      contentType: "application/pdf",
    }, { sourceVersionId: id(5), contentType: "text/html" }]
  ) {
    await assertRejects(
      async () => {
        await Promise.resolve();
        packageSetDownloadName(file);
      },
      Error,
      "WORKFLOW_PACKAGE_SET_INVALID",
    );
  }
});
const scope = {
  organizationId: id(1),
  caseId: id(2),
  snapshotSha256: "a".repeat(64),
};
async function fixture() {
  const receipt = {
    schemaVersion: 1,
    ...scope,
    setId: id(3),
    snapshotId: id(4),
    version: 1,
    planSha256: "b".repeat(64),
    members: [5, 6, 7].map((n) => ({
      requirementId: `form.${n}`,
      objectId: `${id(1)}:${id(2)}:${id(3)}:${id(n)}`,
      artifact: {
        sourceVersionId: id(n),
        sourceSha256: "c".repeat(64),
        packageSnapshotId: id(4),
        packageSnapshotSha256: scope.snapshotSha256,
        version: 1,
        outputSha256: "d".repeat(64),
        contentType: "application/pdf",
        mappings: [{
          kind: "pdf_overlay",
          mappingDecisionId: id(n + 20),
          canonicalFieldId: `field_${n}`,
          target: `page:1:${n}`,
        }],
      },
    })),
  };
  return {
    ...receipt,
    manifestSha256: await sha256Hex(
      new TextEncoder().encode(canonicalPackageSetJson(receipt)),
    ),
  };
}

Deno.test("package-set view retains every independently identified file", async () => {
  const result = await parseWorkflowPackageSet(await fixture(), scope);
  assertEquals(result.files.length, 3);
  assertEquals(result.files.map((f) => f.sourceVersionId), [
    id(5),
    id(6),
    id(7),
  ]);
  assertEquals(result.files.every((f) => f.downloadUrl === null), true);
});

Deno.test("one through twenty originals share one contract; twenty-one is rejected", async () => {
  const receipt = await fixture();
  receipt.members = Array.from({ length: 20 }, (_value, index) => {
    const n = index + 5;
    return {
      requirementId: `form.${n}`,
      objectId: `${id(1)}:${id(2)}:${id(3)}:${id(n)}`,
      artifact: {
        sourceVersionId: id(n),
        sourceSha256: "c".repeat(64),
        packageSnapshotId: id(4),
        packageSnapshotSha256: scope.snapshotSha256,
        version: 1,
        outputSha256: "d".repeat(64),
        contentType: "application/pdf",
        mappings: [{
          kind: "pdf_overlay",
          mappingDecisionId: id(n + 20),
          canonicalFieldId: `field_${n}`,
          target: `page:1:${n}`,
        }],
      },
    };
  });
  const { manifestSha256: _sha, ...manifest } = receipt;
  receipt.manifestSha256 = await sha256Hex(
    new TextEncoder().encode(canonicalPackageSetJson(manifest)),
  );
  assertEquals(
    (await parseWorkflowPackageSet(receipt, scope)).files.length,
    20,
  );
  receipt.members.push(structuredClone(receipt.members[0]));
  const { manifestSha256: _nextSha, ...overLimit } = receipt;
  receipt.manifestSha256 = await sha256Hex(
    new TextEncoder().encode(canonicalPackageSetJson(overLimit)),
  );
  await assertRejects(
    () => parseWorkflowPackageSet(receipt, scope),
    Error,
    "WORKFLOW_PACKAGE_SET_INVALID",
  );
});

for (
  const scenario of [
    "hash",
    "object",
    "tenant",
    "duplicate",
    "snapshot",
    "format",
    "empty",
  ] as const
) {
  Deno.test(`package-set view rejects ${scenario} before generating links`, async () => {
    const receipt = await fixture();
    if (scenario === "hash") receipt.manifestSha256 = "f".repeat(64);
    if (scenario === "object") {
      receipt.members[2].objectId = "other:tenant:object";
    }
    if (scenario === "tenant") receipt.organizationId = id(99);
    if (scenario === "duplicate") receipt.members[2] = receipt.members[0];
    if (scenario === "snapshot") {
      receipt.members[2].artifact.packageSnapshotId = id(99);
    }
    if (scenario === "format") {
      receipt.members[2].artifact.contentType = "text/html";
    }
    if (scenario === "empty") receipt.members = [];
    if (scenario !== "hash") {
      const { manifestSha256: _sha, ...manifest } = receipt;
      receipt.manifestSha256 = await sha256Hex(
        new TextEncoder().encode(canonicalPackageSetJson(manifest)),
      );
    }
    await assertRejects(
      () => parseWorkflowPackageSet(receipt, scope),
      Error,
      "WORKFLOW_PACKAGE_SET_INVALID",
    );
  });
}

Deno.test("absent migration preserves legacy reads; failed provenance does not", async () => {
  let calls = 0;
  const absent = (() => {
    calls++;
    return Promise.resolve([{ package_sets_available: false }]);
  }) as SqlPort;
  assertEquals(await loadWorkflowPackageSet(absent, scope), null);
  assertEquals(calls, 1);
  const receipt = await fixture();
  const sql = ((strings: TemplateStringsArray) =>
    Promise.resolve(
      strings.join("").includes("to_regclass")
        ? [{ package_sets_available: true }]
        : [{ receipt_json: receipt, verified_sources: 2 }],
    )) as SqlPort;
  await assertRejects(
    () => loadWorkflowPackageSet(sql, scope),
    Error,
    "WORKFLOW_PACKAGE_SET_INVALID",
  );
});
