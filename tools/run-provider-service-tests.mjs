import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROVIDER_SERVICE_TEST = /^provider-service-.*\.test\.mjs$/;

export function listProviderServiceTests() {
  return readdirSync("tests")
    .filter((filename) => PROVIDER_SERVICE_TEST.test(filename))
    .sort((left, right) => left.localeCompare(right));
}

export function runProviderServiceTests() {
  const files = listProviderServiceTests();
  console.log(`Provider Service tests (${files.length}):`);
  for (const filename of files) console.log(`- ${filename}`);

  for (const filename of files) {
    const child = spawnSync(process.execPath, [resolve("tests", filename)], { stdio: "inherit" });
    if (child.error) {
      console.error(`Provider Service test could not start: ${filename}`);
      console.error(child.error.message);
      return 1;
    }
    if (child.status !== 0) return Number.isInteger(child.status) ? child.status : 1;
  }
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  process.exitCode = runProviderServiceTests();
}
