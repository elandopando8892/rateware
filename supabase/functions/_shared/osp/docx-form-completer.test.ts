import { assertEquals } from "jsr:@std/assert@1.0.14";
import JSZip from "npm:jszip@3.10.1";

import { completeDocxArtifact } from "./docx-form-completer.ts";
import { sha256Hex } from "./source-hash.ts";

const sourceVersionId = "11111111-1111-4111-8111-111111111111";
const packageSnapshotId = "22222222-2222-4222-8222-222222222222";
const mappingDecisionId = "33333333-3333-4333-8333-333333333333";

async function sourceDocx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Supplier form</w:t></w:r></w:p><w:sdt><w:sdtPr><w:tag w:val="supplier.legalName"/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Blank</w:t></w:r></w:p></w:sdtContent></w:sdt><w:sectPr/></w:body></w:document>`,
  );
  zip.file("docProps/core.xml", '<?xml version="1.0"?><coreProperties/>');
  return await zip.generateAsync({ type: "uint8array" });
}

Deno.test("DOCX completer fills content controls and appends unmatched reviewed values", async () => {
  const sourceBytes = await sourceDocx();
  const input = {
    sourceVersionId,
    sourceBytes,
    sourceSha256: await sha256Hex(sourceBytes),
    packageSnapshotId,
    packageSnapshotSha256: "a".repeat(64),
    approvedMappingDecisionIds: [mappingDecisionId],
    version: 1,
    mappings: [{
      kind: "content_control" as const,
      mappingDecisionId,
      canonicalFieldId: "supplier.legalName",
      targetTag: "supplier.legalName",
      value: "XBF Systems",
    }, {
      kind: "appendix" as const,
      mappingDecisionId,
      canonicalFieldId: "supplier.taxId",
      value: "32-0786975",
    }],
  };
  const first = await completeDocxArtifact(input);
  const repeated = await completeDocxArtifact(input);
  assertEquals(first.bytes, repeated.bytes);
  const documentXml = await (await JSZip.loadAsync(first.bytes)).file(
    "word/document.xml",
  )!.async("string");
  assertEquals(documentXml.includes("XBF Systems"), true);
  assertEquals(documentXml.includes("supplier.taxId: 32-0786975"), true);
  assertEquals(first.receipt.mappings.map(({ kind }) => kind), [
    "docx_content_control",
    "docx_appendix",
  ]);
});
