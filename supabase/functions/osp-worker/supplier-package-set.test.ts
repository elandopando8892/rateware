// deno-lint-ignore-file no-import-prefix -- pinned dependencies used by existing artifact tests
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import JSZip from "npm:jszip@3.10.1";
import { sha256Hex } from "../_shared/osp/source-hash.ts";
import {
  generateSupplierPackageSet,
  type SupplierPackageSetInput,
  type SupplierPackageSetReceipt,
} from "./supplier-package-set.ts";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function fixture(): Promise<SupplierPackageSetInput> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Original").getCell("A1").value = "Carrier original";
  const xlsx = new Uint8Array(await workbook.xlsx.writeBuffer());
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  pdf.getForm().createTextField("name").addToPage(page);
  const pdfBytes = await pdf.save();
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:sdt><w:sdtPr><w:tag w:val="name"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Blank</w:t></w:r></w:p></w:sdtContent></w:sdt><w:sectPr/></w:body></w:document>',
  );
  const docx = await zip.generateAsync({ type: "uint8array" });
  const context = async (bytes: Uint8Array, sourceId: number) => ({
    sourceVersionId: id(sourceId),
    sourceBytes: bytes,
    sourceSha256: await sha256Hex(bytes),
    packageSnapshotId: id(4),
    packageSnapshotSha256: "a".repeat(64),
    approvedMappingDecisionIds: [id(8)],
    version: 1,
  });
  const mapping = {
    mappingDecisionId: id(8),
    canonicalFieldId: "supplier.name",
    value: "Synthetic XBF",
  };
  return {
    organizationId: id(1),
    caseId: id(2),
    setId: id(3),
    snapshotId: id(4),
    snapshotSha256: "a".repeat(64),
    version: 1,
    members: [
      {
        requirementId: "form.xlsx",
        artifact: {
          ...await context(xlsx, 5),
          kind: "xlsx",
          mappings: [{ ...mapping, sheet: "Original", cell: "A2" }],
        },
      },
      {
        requirementId: "form.pdf",
        artifact: {
          ...await context(pdfBytes, 6),
          kind: "pdf",
          flatten: false,
          mappings: [{ ...mapping, kind: "acroform", fieldName: "name" }],
        },
      },
      {
        requirementId: "form.docx",
        artifact: {
          ...await context(docx, 7),
          kind: "docx",
          mappings: [{
            ...mapping,
            kind: "content_control",
            targetTag: "name",
          }],
        },
      },
    ],
  };
}

function harness() {
  const writes = new Map<string, Uint8Array>();
  let current: SupplierPackageSetReceipt | null = null;
  let publishes = 0;
  let holds = 0;
  return {
    writes,
    get current() {
      return current;
    },
    get publishes() {
      return publishes;
    },
    get holds() {
      return holds;
    },
    deps: {
      objects: {
        writeExclusive: (
          input: { objectId: string; bytes: Uint8Array },
        ) => {
          if (writes.has(input.objectId)) {
            assertEquals(writes.get(input.objectId), input.bytes);
          }
          writes.set(input.objectId, input.bytes);
          return Promise.resolve();
        },
      },
      publisher: {
        publish: (receipt: SupplierPackageSetReceipt) => {
          publishes++;
          assertEquals(writes.size, receipt.members.length);
          current = receipt;
          return Promise.resolve();
        },
        load: () => Promise.resolve(current),
        hold: () => {
          holds++;
          return Promise.resolve();
        },
      },
    },
  };
}

Deno.test("set generates three real formats and publishes once after all writes", async () => {
  const input = await fixture();
  const originalHashes = await Promise.all(
    input.members.map((m) => sha256Hex(m.artifact.sourceBytes)),
  );
  const h = harness();
  const receipt = await generateSupplierPackageSet(input, h.deps);
  assertEquals(h.publishes, 1);
  assertEquals(receipt.members.length, 3);
  assertEquals(new Set(receipt.members.map((m) => m.objectId)).size, 3);
  const xlsx = new ExcelJS.Workbook();
  await xlsx.xlsx.load(h.writes.get(receipt.members[0].objectId) as never);
  assertEquals(
    xlsx.getWorksheet("Original")?.getCell("A1").value,
    "Carrier original",
  );
  assertEquals(
    xlsx.getWorksheet("Original")?.getCell("A2").value,
    "Synthetic XBF",
  );
  const pdf = await PDFDocument.load(
    h.writes.get(receipt.members[1].objectId)!,
  );
  assertEquals(pdf.getForm().getTextField("name").getText(), "Synthetic XBF");
  const docx = await JSZip.loadAsync(
    h.writes.get(receipt.members[2].objectId)!,
  );
  assertEquals(
    (await docx.file("word/document.xml")!.async("string")).includes(
      "Synthetic XBF",
    ),
    true,
  );
  for (const member of receipt.members) {
    assertEquals(
      await sha256Hex(h.writes.get(member.objectId)!),
      member.artifact.outputSha256,
    );
  }
  assertEquals(
    await Promise.all(
      input.members.map((m) => sha256Hex(m.artifact.sourceBytes)),
    ),
    originalHashes,
  );
});

Deno.test("set is deterministic when source order changes", async () => {
  const input = await fixture();
  const first = await generateSupplierPackageSet(input, harness().deps);
  const second = await generateSupplierPackageSet({
    ...input,
    members: [...input.members].reverse(),
  }, harness().deps);
  assertEquals(first, second);
});

for (
  const scenario of [
    "duplicate_requirement",
    "duplicate_source",
    "wrong_snapshot",
    "wrong_hash",
    "wrong_version",
    "invalid_last_file",
    "empty",
  ] as const
) {
  Deno.test(`set rejects ${scenario} before any storage write`, async () => {
    const input = await fixture();
    const members = structuredClone(input.members) as {
      requirementId: string;
      artifact: typeof input.members[number]["artifact"];
    }[];
    if (scenario === "duplicate_requirement") {
      members[2].requirementId = members[0].requirementId;
    }
    if (scenario === "duplicate_source") {
      members[2].artifact.sourceVersionId = members[0].artifact.sourceVersionId;
    }
    if (scenario === "wrong_snapshot") {
      members[2].artifact.packageSnapshotId = id(9);
    }
    if (scenario === "wrong_hash") {
      members[2].artifact.packageSnapshotSha256 = "b".repeat(64);
    }
    if (scenario === "wrong_version") members[2].artifact.version = 2;
    if (scenario === "invalid_last_file") {
      members[2].artifact.sourceSha256 = "b".repeat(64);
    }
    const h = harness();
    await assertRejects(() =>
      generateSupplierPackageSet({
        ...input,
        members: scenario === "empty" ? [] : members,
      }, h.deps)
    );
    assertEquals(h.writes.size, 0);
    assertEquals(h.publishes, 0);
    assertEquals(h.holds, 0);
  });
}

Deno.test("failed second upload never publishes partial set or deletes first object", async () => {
  const h = harness();
  const input = await fixture();
  let calls = 0;
  const write = h.deps.objects.writeExclusive;
  h.deps.objects.writeExclusive = async (entry) => {
    if (++calls === 2) throw new Error("NETWORK_FAILURE");
    await write(entry);
  };
  await assertRejects(
    () => generateSupplierPackageSet(input, h.deps),
    Error,
    "SUPPLIER_PACKAGE_SET_RECONCILIATION_REQUIRED",
  );
  assertEquals(h.writes.size, 1);
  assertEquals(h.publishes, 0);
  assertEquals(h.current, null);
  assertEquals(h.holds, 1);
});

Deno.test("lost commit response reconciles exact published receipt without republishing", async () => {
  const input = await fixture();
  const h = harness();
  const publish = h.deps.publisher.publish;
  h.deps.publisher.publish = async (receipt) => {
    await publish(receipt);
    throw new Error("LOST_RESPONSE");
  };
  // Simulate jsonb key reordering on the authoritative database read.
  const load = h.deps.publisher.load;
  h.deps.publisher.load = async () => {
    const receipt = await load();
    return receipt
      ? Object.fromEntries(
        Object.entries(receipt).reverse(),
      ) as SupplierPackageSetReceipt
      : null;
  };
  const result = await generateSupplierPackageSet(input, h.deps);
  assertEquals(result, h.current);
  assertEquals(h.publishes, 1);
  assertEquals(h.holds, 0);
});

Deno.test("conflicting persisted receipt is held rather than accepted", async () => {
  const input = await fixture();
  const prior = await generateSupplierPackageSet(
    { ...input, setId: id(9) },
    harness().deps,
  );
  const h = harness();
  h.deps.publisher.publish = () => {
    throw new Error("CONFLICT");
  };
  h.deps.publisher.load = () => Promise.resolve(prior);
  await assertRejects(
    () => generateSupplierPackageSet(input, h.deps),
    Error,
    "SUPPLIER_PACKAGE_SET_RECONCILIATION_REQUIRED",
  );
  assertEquals(h.holds, 1);
});
