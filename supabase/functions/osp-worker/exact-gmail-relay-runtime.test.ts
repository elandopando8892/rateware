import { assertMatch } from "jsr:@std/assert@1.0.14";

const runtime = await Deno.readTextFile(
  new URL("./shadow-runtime.ts", import.meta.url),
);

Deno.test("internal relay is enabled only on the exact Gmail intake service", () => {
  assertMatch(
    runtime,
    /const intake = createIntakeService\(\{[\s\S]*?jobs,\s*\}\);[\s\S]*?const exactGmailIntake = createIntakeService\(\{[\s\S]*?internalRelay: "single_attached_rfc822"/,
  );
  assertMatch(
    runtime,
    /run: \(limit: number\)[\s\S]*?jobs,\s*intake,\s*attachmentPromotions/,
  );
  assertMatch(
    runtime,
    /runExactGmailIngest:[\s\S]*?claimExactGmailIngest[\s\S]*?intake: exactGmailIntake/,
  );
});
