import assert from "node:assert/strict";
import test from "node:test";

import { createCarrierListTemplateController } from "../src/carrier-list-template-controller.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("latest lifecycle load wins when list responses finish out of order", async () => {
  const active = deferred();
  const draft = deferred();
  const controller = createCarrierListTemplateController({
    fetchList: (lifecycleStatus) => lifecycleStatus === "active" ? active.promise : draft.promise,
    fetchDetail: async () => ({ row: null })
  });

  const activeLoad = controller.load("active");
  const draftLoad = controller.load("draft");
  draft.resolve({ enabled: true, rows: [{ id: "draft-a", lifecycle_status: "draft" }] });
  assert.equal((await draftLoad).current, true);
  active.resolve({ enabled: true, rows: [{ id: "active-a", lifecycle_status: "active" }] });
  assert.equal((await activeLoad).current, false);

  assert.deepEqual(controller.snapshot(), {
    capability: "enabled",
    lifecycleStatus: "draft",
    rows: [{ id: "draft-a", lifecycle_status: "draft" }],
    selectedId: "",
    detail: null,
    error: null
  });
});

test("latest selected template wins when detail responses finish out of order", async () => {
  const detailA = deferred();
  const detailB = deferred();
  const controller = createCarrierListTemplateController({
    fetchList: async () => ({ enabled: true, rows: [] }),
    fetchDetail: (id) => id === "template-a" ? detailA.promise : detailB.promise
  });
  await controller.load("all");

  const selectA = controller.select("template-a");
  const selectB = controller.select("template-b");
  detailB.resolve({ row: { id: "template-b", template_version: 8 } });
  assert.equal((await selectB).current, true);
  detailA.resolve({ row: { id: "template-a", template_version: 2 } });
  assert.equal((await selectA).current, false);

  assert.equal(controller.snapshot().selectedId, "template-b");
  assert.deepEqual(controller.snapshot().detail, { id: "template-b", template_version: 8 });
});

test("a detail response cannot commit after a newer lifecycle request starts", async () => {
  const detail = deferred();
  const drafts = deferred();
  let listCount = 0;
  const controller = createCarrierListTemplateController({
    fetchList: async () => {
      listCount += 1;
      return listCount === 1 ? { enabled: true, rows: [] } : drafts.promise;
    },
    fetchDetail: async () => detail.promise
  });
  await controller.load("active");

  const selection = controller.select("template-a");
  const draftLoad = controller.load("draft");
  detail.resolve({ row: { id: "template-a", template_version: 2 } });
  assert.equal((await selection).current, false);
  drafts.resolve({ enabled: true, rows: [{ id: "template-b", lifecycle_status: "draft" }] });
  await draftLoad;

  assert.equal(controller.snapshot().lifecycleStatus, "draft");
  assert.equal(controller.snapshot().detail, null);
});

test("only explicit disabled capability or 404 becomes disabled; operational errors are retryable", async () => {
  const operationalError = Object.assign(new Error("Gateway unavailable"), { status: 503 });
  let mode = "error";
  const controller = createCarrierListTemplateController({
    fetchList: async () => {
      if (mode === "error") throw operationalError;
      if (mode === "disabled") return { enabled: false, rows: [{ id: "must-not-leak" }] };
      throw Object.assign(new Error("Not found"), { status: 404 });
    },
    fetchDetail: async () => ({ row: null })
  });

  await controller.load("active");
  assert.equal(controller.snapshot().capability, "error");
  assert.deepEqual(controller.snapshot().rows, []);
  assert.strictEqual(controller.snapshot().error, operationalError);

  mode = "disabled";
  await controller.retry();
  assert.equal(controller.snapshot().capability, "disabled");
  assert.deepEqual(controller.snapshot().rows, []);

  mode = "404";
  await controller.load("active");
  assert.equal(controller.snapshot().capability, "disabled");
});

test("conflict codes route version refresh separately from duplicate-name guidance", async () => {
  let detailReads = 0;
  const controller = createCarrierListTemplateController({
    fetchList: async () => ({
      enabled: true,
      rows: [{ id: "template-a", segment_name: "Core", template_version: 4 }]
    }),
    fetchDetail: async () => {
      detailReads += 1;
      return { row: { id: "template-a", segment_name: "Core", template_version: 5 } };
    }
  });
  await controller.load("active");

  const nameConflict = await controller.handleConflict(
    { status: 409, code: "template_name_conflict" },
    { id: "template-a", displayedVersion: 4, action: "duplicate" }
  );
  assert.equal(nameConflict.kind, "name");
  assert.equal(detailReads, 0);
  assert.equal(controller.snapshot().selectedId, "template-a");

  const versionConflict = await controller.handleConflict(
    { status: 409, code: "template_version_conflict" },
    { id: "template-a", displayedVersion: 4, action: "duplicate" }
  );
  assert.equal(versionConflict.kind, "version");
  assert.equal(versionConflict.current, true);
  assert.equal(detailReads, 1);
  assert.equal(controller.snapshot().selectedId, "template-a");
  assert.equal(controller.snapshot().detail.template_version, 5);
});
