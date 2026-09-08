import { assertEquals } from "jsr:@std/assert@1.0.14";

Deno.test("read and form deployments pin their shared UI Zod dependency without the root import map", async () => {
  const app = JSON.parse(await Deno.readTextFile(new URL("../../../apps/osp/package.json", import.meta.url)));
  for (const service of ["osp-read-api", "osp-form-api"]) {
    const map = JSON.parse(await Deno.readTextFile(new URL(`../${service}/deno.json`, import.meta.url)));
    assertEquals(map.imports.zod, `npm:zod@${app.dependencies.zod}`);
  }
});
