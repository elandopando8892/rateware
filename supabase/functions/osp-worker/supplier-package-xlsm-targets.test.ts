import { assert, assertMatch } from "jsr:@std/assert@1.0.14";

const source = await Deno.readTextFile(
  new URL("./supplier-package-runtime.ts", import.meta.url),
);

Deno.test("supplier package runtime uses reviewed targets for XLSM and emits clean XLSX", () => {
  assertMatch(
    source,
    /application\/vnd[.]ms-excel[.]sheet[.]macroEnabled[.]12/,
  );
  assertMatch(source, /mapping[.]mapping_json->'artifactTargets'/);
  assertMatch(source, /prepared[.]source[.]content_type === XLSM/);
  assertMatch(source, /kind: "xlsx" as const/);
  assert(!source.includes("contentType: XLSM"));
});
