import { discoverGovernableInventory, repoRootFrom } from "./action-contract-lib.mjs";

const repoRoot = repoRootFrom(process.cwd());
const numeric = process.argv.slice(2).filter((value) => !value.startsWith("--"));
const start = Number.parseInt(numeric[0] || "0", 10);
const count = Number.parseInt(numeric[1] || "100000", 10);
const inventory = discoverGovernableInventory(repoRoot);

if (!Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count < 1) {
  throw new Error("Usage: node tools/discover-action-contract.mjs [start>=0] [count>=1] [--inventory]");
}

if (process.argv.includes("--inventory")) {
  process.stdout.write(JSON.stringify({
    counts: {
      active: inventory.surfaces.length,
      edge: inventory.surfaces.filter((entry) => entry.canonicalId.startsWith("edge.")).length,
      postgres: inventory.surfaces.filter((entry) => entry.canonicalId.startsWith("rpc.")).length,
      ratewareApi: inventory.surfaces.filter((entry) => entry.canonicalId.startsWith("edge.rateware-api.")).length
    },
    candidates: inventory.candidates,
    declarations: inventory.declarations,
    surfaces: inventory.surfaces.slice(start, start + count)
  }) + "\n");
} else {
  process.stdout.write(JSON.stringify(inventory.surfaces.slice(start, start + count)) + "\n");
}
