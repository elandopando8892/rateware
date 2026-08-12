#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { evaluateShadowReadiness } from "./phase0-shadow-readiness-lib.mjs";

const args = process.argv.slice(2);

function argument(name) {
  const inline = args.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function help() {
  console.log(`Phase 0.2E shadow readiness gate

Usage:
  node tools/phase0-shadow-readiness.mjs --input evidence.json

The evidence file must contain pseudonymous mapping counts, a controlled shadow
window, and one authenticated smoke for each protected entrypoint. The command
is read-only and exits 0 only when every gate passes.
`);
}

if (args.includes("--help")) {
  help();
  process.exit(0);
}

const input = argument("--input");
if (!input) {
  help();
  process.exit(2);
}

try {
  const evidence = JSON.parse(await readFile(input, "utf8"));
  const result = evaluateShadowReadiness(evidence);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ready ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({
    ready: false,
    verdict: "INVALID_EVIDENCE",
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(2);
}
