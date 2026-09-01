import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import JSZip from "npm:jszip@3.10.1";
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";

import {
  assertStrictDocxPackage,
  assertStrictPdfPackage,
  createStrictDocumentPackageScanner,
} from "./strict-document-package-scanner.ts";

async function safePdf() {
  const document = await PDFDocument.create();
  document.addPage([612, 792]);
  return await document.save({ useObjectStreams: false });
}

async function safeDocx(external = false) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"${
      external ? ' TargetMode="External"' : ""
    }/></Relationships>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Supplier setup</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
  );
  zip.file("docProps/core.xml", '<?xml version="1.0"?><coreProperties/>');
  return await zip.generateAsync({ type: "uint8array" });
}

Deno.test("strict PDF policy accepts passive pages and rejects active content", async () => {
  const bytes = await safePdf();
  await assertStrictPdfPackage(bytes);
  const activeDocument = await PDFDocument.create();
  activeDocument.addPage([612, 792]);
  const action = activeDocument.context.obj({
    S: PDFName.of("JavaScript"),
    JS: "app.alert('blocked')",
  }) as PDFDict;
  activeDocument.catalog.set(PDFName.of("OpenAction"), action);
  const active = await activeDocument.save({ useObjectStreams: false });
  await assertRejects(
    () => assertStrictPdfPackage(active),
    Error,
    "PDF_PACKAGE_POLICY_REJECTED",
  );
  assertEquals(
    await createStrictDocumentPackageScanner("application/pdf")(bytes),
    "clean",
  );
});

Deno.test("strict PDF policy does not treat passive compressed text as an action dictionary", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("Passive supplier text /AA is not an action", {
    font,
    x: 36,
    y: 740,
  });
  await assertStrictPdfPackage(await document.save());
});

Deno.test("strict DOCX policy accepts passive OOXML and rejects external relationships", async () => {
  await assertStrictDocxPackage(await safeDocx());
  const external = await safeDocx(true);
  await assertRejects(
    () => assertStrictDocxPackage(external),
    Error,
    "DOCX_PACKAGE_POLICY_REJECTED",
  );
});
