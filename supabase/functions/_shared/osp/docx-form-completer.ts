import JSZip from "npm:jszip@3.10.1";

import {
  type AppliedArtifactMapping,
  artifactReceipt,
  type SupplierArtifactContext,
  validateArtifactContext,
  validateArtifactValue,
  validateMappingIdentity,
  validateReviewedMappingSet,
} from "./supplier-artifact-port.ts";
import { assertStrictDocxPackage } from "../../osp-worker/strict-document-package-scanner.ts";

export type DocxArtifactMapping = Readonly<{
  kind: "content_control" | "appendix";
  mappingDecisionId: string;
  canonicalFieldId: string;
  targetTag?: string;
  value: string | number | boolean;
}>;

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll(
      "'",
      "&apos;",
    );
}

function validateMappings(
  input: readonly DocxArtifactMapping[],
): DocxArtifactMapping[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 500) {
    throw new Error("ARTIFACT_MAPPING_INVALID");
  }
  const targets = new Set<string>();
  return [...input].sort((left, right) =>
    left.canonicalFieldId.localeCompare(right.canonicalFieldId)
  )
    .map((mapping) => {
      validateMappingIdentity(
        mapping.mappingDecisionId,
        mapping.canonicalFieldId,
      );
      validateArtifactValue(mapping.value);
      if (
        mapping.kind === "content_control" &&
        (typeof mapping.targetTag !== "string" ||
          !/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(mapping.targetTag))
      ) throw new Error("ARTIFACT_MAPPING_INVALID");
      if (mapping.kind === "appendix" && mapping.targetTag !== undefined) {
        throw new Error("ARTIFACT_MAPPING_INVALID");
      }
      const target = mapping.targetTag ??
        `appendix:${mapping.canonicalFieldId}`;
      if (targets.has(target)) throw new Error("ARTIFACT_MAPPING_INVALID");
      targets.add(target);
      return mapping;
    });
}

function replaceContentControl(
  documentXml: string,
  tag: string,
  value: string,
): { xml: string; replaced: boolean } {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(<w:sdt\\b[\\s\\S]*?<w:tag\\b[^>]*w:val=["']${escapedTag}["'][^>]*/>[\\s\\S]*?<w:sdtContent\\b[^>]*>)[\\s\\S]*?(</w:sdtContent>[\\s\\S]*?</w:sdt>)`,
    "i",
  );
  if (!pattern.test(documentXml)) return { xml: documentXml, replaced: false };
  return {
    xml: documentXml.replace(
      pattern,
      `$1<w:p><w:r><w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p>$2`,
    ),
    replaced: true,
  };
}

export async function completeDocxArtifact(
  input: SupplierArtifactContext & { mappings: readonly DocxArtifactMapping[] },
) {
  await validateArtifactContext(input);
  await assertStrictDocxPackage(input.sourceBytes);
  const mappings = validateMappings(input.mappings);
  validateReviewedMappingSet(
    input,
    mappings.map(({ mappingDecisionId }) => mappingDecisionId),
  );
  const zip = await JSZip.loadAsync(input.sourceBytes.slice());
  const documentPart = zip.file("word/document.xml");
  if (!documentPart) throw new Error("ARTIFACT_SOURCE_INVALID");
  let documentXml = await documentPart.async("string");
  const appendix: DocxArtifactMapping[] = [];
  const applied: AppliedArtifactMapping[] = [];
  for (const mapping of mappings) {
    if (mapping.kind === "content_control") {
      const replaced = replaceContentControl(
        documentXml,
        mapping.targetTag!,
        String(mapping.value),
      );
      documentXml = replaced.xml;
      if (replaced.replaced) {
        applied.push({
          kind: "docx_content_control",
          mappingDecisionId: mapping.mappingDecisionId,
          canonicalFieldId: mapping.canonicalFieldId,
          target: mapping.targetTag!,
        });
        continue;
      }
    }
    appendix.push(mapping);
  }
  if (appendix.length > 0) {
    const paragraphs = [
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
      "<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>XBF completed response</w:t></w:r></w:p>",
      ...appendix.map((mapping) =>
        `<w:p><w:r><w:t xml:space="preserve">${
          xml(
            `${mapping.canonicalFieldId}: ${
              String(mapping.value).replace(/\s+/g, " ")
            }`,
          )
        }</w:t></w:r></w:p>`
      ),
    ].join("");
    const marker = documentXml.lastIndexOf("<w:sectPr");
    const bodyEnd = documentXml.lastIndexOf("</w:body>");
    const insertion = marker >= 0 && marker < bodyEnd ? marker : bodyEnd;
    if (insertion < 0) throw new Error("ARTIFACT_SOURCE_INVALID");
    documentXml = documentXml.slice(0, insertion) + paragraphs +
      documentXml.slice(insertion);
    for (const mapping of appendix) {
      applied.push({
        kind: "docx_appendix",
        mappingDecisionId: mapping.mappingDecisionId,
        canonicalFieldId: mapping.canonicalFieldId,
        target: `appendix:${mapping.canonicalFieldId}`,
      });
    }
  }
  zip.file("word/document.xml", documentXml, {
    date: new Date("2000-01-01T00:00:00.000Z"),
  });
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  if (bytes.byteLength < 1 || bytes.byteLength > 25 * 1024 * 1024) {
    throw new Error("ARTIFACT_OUTPUT_INVALID");
  }
  await assertStrictDocxPackage(bytes);
  return Object.freeze({
    bytes,
    receipt: await artifactReceipt(
      input,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes,
      applied,
    ),
  });
}
