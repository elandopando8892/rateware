import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  P2_S4_CLOSURE,
  validateP2S4EvidenceFiles,
  validateP2S4Manifest,
} from "../tools/platform55-network-service-evidence.mjs";

const loadManifest = async () => JSON.parse(await readFile(P2_S4_CLOSURE.manifest, "utf8"));

test("anchors the exact P2-S4 Network and Service evidence matrix", async () => {
  const manifest = await loadManifest();
  validateP2S4Manifest(manifest);
  validateP2S4EvidenceFiles(process.cwd(), manifest);
});

test("rejects fabricated P2-S4 Network and Service evidence", async () => {
  const manifest = await loadManifest();
  const mutations = [
    (copy) => { copy.subject_sha = "0".repeat(40); },
    (copy) => { copy.captures = copy.captures.slice(1); },
    (copy) => { copy.captures[1].file = copy.captures[0].file; },
    (copy) => { copy.captures[0].state = "unclassified"; },
    (copy) => { copy.captures[0].viewport = "390x844"; copy.captures[0].source_frame = "390x844"; },
    (copy) => { copy.captures[0].route = "vendor-support.html"; },
    (copy) => { copy.captures[0].kind = "public"; },
    (copy) => { copy.captures[0].console_errors = 1; },
    (copy) => { copy.captures[0].http_errors = 1; },
    (copy) => { copy.captures[0].page_errors = 1; },
    (copy) => { copy.captures[0].request_errors = 1; },
    (copy) => { copy.captures[0].document_overflow = true; },
    (copy) => { copy.captures[0].state_visible = false; },
    (copy) => { copy.captures[0].state_intersection_ratio = 0.1; },
    (copy) => { copy.captures[0].content_width_ratio = 0.1; },
    (copy) => { copy.captures[0].reduced_motion = false; },
    (copy) => { copy.captures[0].scroll_x = 1; },
    (copy) => { copy.captures.find((capture) => capture.kind === "public").private_controls = 1; },
    (copy) => { copy.source_git_blobs[Object.keys(copy.source_git_blobs)[0]] = "0".repeat(40); },
    (copy) => { copy.captures[0].sha256 = "0".repeat(64); },
  ];

  for (const mutate of mutations) {
    const fabricated = structuredClone(manifest);
    mutate(fabricated);
    assert.throws(() => validateP2S4Manifest(fabricated));
  }
});
