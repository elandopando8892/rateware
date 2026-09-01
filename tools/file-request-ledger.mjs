import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

const clone = (value) => structuredClone(value);

async function pause(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }

export function createFileRequestLedger(path) {
  const lockPath = `${path}.lock`;

  async function withLock(operation) {
    await mkdir(dirname(path), { recursive: true });
    let handle;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try { handle = await open(lockPath, "wx"); break; }
      catch (error) {
        if (error?.code !== "EEXIST" || attempt === 29) throw error;
        await pause(10);
      }
    }
    try {
      let state = { records: {} };
      try { state = JSON.parse(await readFile(path, "utf8")); }
      catch (error) { if (error?.code !== "ENOENT") throw error; }
      const output = await operation(state);
      const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      await rename(temporary, path);
      return clone(output);
    } finally {
      await handle?.close();
      await unlink(lockPath).catch(() => {});
    }
  }

  return {
    async claim(input) {
      return withLock((state) => {
        const current = state.records[input.requestId];
        if (!current) {
          const record = { ...clone(input), status: "processing", completedAt: null };
          state.records[input.requestId] = record;
          return { claimed: true, mismatch: false, record };
        }
        return { claimed: false, mismatch: current.requestHash !== input.requestHash, record: current };
      });
    },
    async complete(input) {
      return withLock((state) => {
        const current = state.records[input.requestId];
        if (!current || current.requestHash !== input.requestHash || current.status !== "processing") {
          const error = new Error("REQUEST_LEDGER_STATE_CONFLICT");
          error.code = "REQUEST_LEDGER_STATE_CONFLICT";
          throw error;
        }
        const record = { ...current, ...clone(input), status: "resolution_canary_passed", errorCode: null };
        state.records[input.requestId] = record;
        return record;
      });
    },
    async fail(input) {
      return withLock((state) => {
        const current = state.records[input.requestId];
        if (!current || current.requestHash !== input.requestHash || current.status !== "processing") return current || null;
        const record = { ...current, status: "failed", errorCode: input.errorCode || "PRIVATE_RESOLVER_ERROR", completedAt: input.completedAt };
        state.records[input.requestId] = record;
        return record;
      });
    },
  };
}
