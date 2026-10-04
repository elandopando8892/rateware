-- READ ONLY: metadata for this table only. No commercial rows, DDL, DML or COMMIT.
-- Prepared for project alqjqzqagdmcywpjtnnr / rateware-prod.
-- Human confirmation required before execution under the user's SQL convention.
WITH target AS (
  SELECT c.oid, c.relowner, c.relacl, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'rateware_catalog_items'
    AND c.relkind IN ('r', 'p')
)
SELECT pg_catalog.jsonb_build_object(
  'table_exists', EXISTS (SELECT 1 FROM target),
  'table', 'public.rateware_catalog_items',
  'row_security', (SELECT relrowsecurity FROM target),
  'force_row_security', (SELECT relforcerowsecurity FROM target),
  'owner_role', (SELECT pg_catalog.pg_get_userbyid(relowner) FROM target),
  'backend_role', (
    SELECT pg_catalog.jsonb_build_object('name', rolname, 'superuser', rolsuper, 'bypass_rls', rolbypassrls)
    FROM pg_catalog.pg_roles WHERE rolname = 'service_role'
  ),
  'indexes', COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', ci.relname, 'unique', i.indisunique, 'valid', i.indisvalid,
      'ready', i.indisready, 'primary', i.indisprimary,
      'definition', pg_catalog.pg_get_indexdef(i.indexrelid)
    ) ORDER BY ci.relname)
    FROM pg_catalog.pg_index AS i
    JOIN pg_catalog.pg_class AS ci ON ci.oid = i.indexrelid
    WHERE i.indrelid = (SELECT oid FROM target)
  ), '[]'::jsonb),
  'grants', COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'role', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
      'privilege', a.privilege_type, 'grantable', a.is_grantable
    ) ORDER BY a.grantee, a.privilege_type)
    FROM target AS t,
      LATERAL pg_catalog.aclexplode(COALESCE(t.relacl, pg_catalog.acldefault('r', t.relowner))) AS a
  ), '[]'::jsonb),
  'policies', COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', p.polname, 'command', p.polcmd, 'permissive', p.polpermissive, 'role_oids', p.polroles,
      'using', pg_catalog.pg_get_expr(p.polqual, p.polrelid),
      'with_check', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
    ) ORDER BY p.polname)
    FROM pg_catalog.pg_policy AS p WHERE p.polrelid = (SELECT oid FROM target)
  ), '[]'::jsonb),
  'triggers', COALESCE((
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name', t.tgname, 'enabled', t.tgenabled,
      'definition', pg_catalog.pg_get_triggerdef(t.oid),
      'function', t.tgfoid::pg_catalog.regprocedure::text,
      'function_definition', pg_catalog.pg_get_functiondef(t.tgfoid)
    ) ORDER BY t.tgname)
    FROM pg_catalog.pg_trigger AS t
    WHERE t.tgrelid = (SELECT oid FROM target) AND NOT t.tgisinternal
  ), '[]'::jsonb)
) AS catalog_write_prerequisites;
