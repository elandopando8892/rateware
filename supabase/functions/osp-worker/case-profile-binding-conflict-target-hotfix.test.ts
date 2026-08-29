import { assertMatch } from 'jsr:@std/assert@1.0.14';

const sql = await Deno.readTextFile(
  new URL(
    '../../migrations/20260828233802_osp_case_profile_binding_conflict_target_hotfix.sql',
    import.meta.url,
  ),
);

Deno.test('case profile binding hotfix uses the named primary-key constraint', () => {
  assertMatch(sql, /bind_case_profile_command/);
  assertMatch(sql, /on conflict on constraint case_profile_bindings_pkey/);
  assertMatch(
    sql,
    /replace\(definition, ambiguous_target, qualified_target\)/,
  );
  assertMatch(sql, /strpos\(definition, ambiguous_target\) > 0/);
  assertMatch(sql, /OSP_CASE_PROFILE_BINDING_CONFLICT_TARGET_HOTFIX_FAILED/);
});
