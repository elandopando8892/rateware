import { discoverGovernableSurfaces, repoRootFrom } from "./action-contract-lib.mjs";

const repoRoot = repoRootFrom(process.cwd());
const start = Number.parseInt(process.argv[2] || "0", 10);
const count = Number.parseInt(process.argv[3] || "100000", 10);
const surfaces = discoverGovernableSurfaces(repoRoot);

if (!Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1) {
  throw new Error("Usage: node tools/discover-action-contract.mjs [start>=0] [count>=1]");
}

process.stdout.write(`${JSON.stringify(surfaces.slice(start, start + count))}\n`);
