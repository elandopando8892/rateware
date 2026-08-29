import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const source = await Deno.readTextFile(
  new URL("./supplier-package-runtime.ts", import.meta.url),
);

Deno.test("supplier package lease validation stays within osp_worker SELECT privilege", () => {
  assertMatch(
    source,
    /select id from osp_private\.background_jobs[\s\S]*?completed_at is null/,
  );
  assertNotMatch(
    source,
    /select id from osp_private\.background_jobs[^`]*for update/,
  );
});
