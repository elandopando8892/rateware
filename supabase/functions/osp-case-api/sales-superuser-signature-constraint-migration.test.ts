import { assertMatch, assertNotMatch } from "jsr:@std/assert@1.0.14";

const migrationUrl = new URL(
  "../../migrations/20260902030000_osp_sales_superuser_signature_approval_constraint.sql",
  import.meta.url,
);

Deno.test("signature approval storage accepts the reviewed Sales superuser without rewriting history", async () => {
  const sql = (await Deno.readTextFile(migrationUrl))
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  assertMatch(
    sql,
    /alter table osp_private\.signature_approvals drop constraint signature_approvals_actor_email_check/,
  );
  assertMatch(
    sql,
    /add constraint signature_approvals_actor_email_check check \( actor_email in \( 'jgonzalez@xbfreight\.com', 'sales@heymarksman\.com' \) \)/,
  );
  assertNotMatch(sql, /insert into|update osp_private|delete from/);
  assertNotMatch(sql, /gmail|webhook|http_post|net\.http|pg_net/);
});
