import { assert, assertMatch } from "jsr:@std/assert@1.0.14";

const source = await Deno.readTextFile(
  new URL("./supplier-package-runtime.ts", import.meta.url),
);

Deno.test("supplier package runtime uses reviewed targets and preserves the XLSM source content type", () => {
  assertMatch(
    source,
    /application\/vnd[.]ms-excel[.]sheet[.]macroEnabled[.]12/,
  );
  assertMatch(source, /mapping[.]mapping_json->'artifactTargets'/);
  assertMatch(source, /prepared[.]source[.]content_type === XLSM/);
  assertMatch(source, /kind: "xlsx" as const/);
  assertMatch(source, /sourceContentType: prepared[.]source[.]content_type/);
  assert(!source.includes("contentType: XLSM"));
});
