-- S15-10: registro acotado de UNA identidad Operador en public.external_identities.
-- Sin DDL, sin UPDATE/DELETE/UPSERT, sin grants. Termina en ROLLBACK por defecto.
-- Para aplicar, el ejecutor autorizado (Codex/conector) cambia SOLO la ultima
-- linea a COMMIT tras revisar el SELECT final. Este fichero no contiene COMMIT.
-- Esquema comprobado por Codex con SELECT READ ONLY antes de integrar:
-- public.workspace_registry, roles server-managed en raw_app_meta_data,
-- external_identities.metadata jsonb y reviewed_by_user_id text.
-- Se corrigió la tabla registry incorrecta del autorreporte del escritor.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

DO $s15$
DECLARE
  v_operator_id  constant text := '6c701e97-3e79-40af-8c42-f5a3766834fc';
  v_operator_mail constant text := 'carriers@xbfreight.com';
  v_admin_id     constant text := '76f75fce-fbdc-497a-9667-9a3825dc44e5';
  v_admin_mail   constant text := 'sales@heymarksman.com';
  v_ext_org      constant text := 'org_dbc2fd12c76';
  v_org_uuid     constant uuid := 'ca0a8f30-1382-4316-9bd5-cb76d9ab4920';
  v_count        integer;
  v_inserted     integer;
  v_row          public.external_identities%ROWTYPE;
BEGIN
  -- Locks antes de leer precondiciones.
  PERFORM 1 FROM auth.users
   WHERE id::text IN (v_operator_id, v_admin_id) FOR SHARE;
  PERFORM 1 FROM public.external_organization_links
   WHERE provider = 'supabase' AND external_organization_id = v_ext_org FOR SHARE;
  PERFORM 1 FROM public.workspace_registry
   WHERE organization_id = v_ext_org FOR SHARE;

  -- Operador en Auth: exactamente 1.
  SELECT count(*) INTO v_count FROM auth.users
   WHERE id::text = v_operator_id
     AND lower(email) = lower(v_operator_mail)
     AND email_confirmed_at IS NOT NULL
     AND raw_app_meta_data->'roles' = '["operator"]'::jsonb
     AND raw_app_meta_data->>'rateware_organization_id' = v_ext_org;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'S15 guard: operator auth user mismatch (count=%)', v_count;
  END IF;

  -- Revisor Admin en Auth: exactamente 1.
  SELECT count(*) INTO v_count FROM auth.users
   WHERE id::text = v_admin_id
     AND lower(email) = lower(v_admin_mail)
     AND email_confirmed_at IS NOT NULL
     AND raw_app_meta_data->'roles' = '["admin"]'::jsonb
     AND raw_app_meta_data->>'rateware_organization_id' = v_ext_org;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'S15 guard: admin reviewer auth user mismatch (count=%)', v_count;
  END IF;

  -- Link de organizacion: exactamente 1.
  SELECT count(*) INTO v_count FROM public.external_organization_links
   WHERE provider = 'supabase'
     AND external_organization_id = v_ext_org
     AND status = 'active'
     AND organization_id = v_org_uuid;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'S15 guard: organization link mismatch (count=%)', v_count;
  END IF;

  -- Registry: exactamente 1.
  SELECT count(*) INTO v_count FROM public.workspace_registry
   WHERE organization_id = v_ext_org
     AND organization_uuid = v_org_uuid
     AND canonical_owner_key = 'org:' || v_ext_org;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'S15 guard: organization registry mismatch (count=%)', v_count;
  END IF;

  -- Abortar si ya existe CUALQUIER identidad para provider/subject (sin upsert).
  SELECT count(*) INTO v_count FROM public.external_identities
   WHERE provider = 'supabase' AND external_subject = v_operator_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'S15 guard: external identity already exists (count=%)', v_count;
  END IF;

  INSERT INTO public.external_identities
    (provider, external_subject, email, status, reviewed_at, reviewed_by_user_id, metadata)
  VALUES
    ('supabase', v_operator_id, v_operator_mail, 'active', now(), v_admin_id,
     jsonb_build_object('human_authorization', true, 'sprint', 'sprint15', 'case', 'S15F'));
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> 1 THEN
    RAISE EXCEPTION 'S15 guard: insert rowcount % <> 1', v_inserted;
  END IF;

  -- Readback exacto.
  SELECT * INTO v_row FROM public.external_identities
   WHERE provider = 'supabase' AND external_subject = v_operator_id;
  IF v_row.status IS DISTINCT FROM 'active'
     OR v_row.email IS DISTINCT FROM v_operator_mail
     OR v_row.reviewed_at IS NULL
     OR v_row.reviewed_by_user_id::text IS DISTINCT FROM v_admin_id THEN
    RAISE EXCEPTION 'S15 guard: readback mismatch';
  END IF;
END
$s15$;

-- Cuadre final: solo la fila insertada (id nuevo), sin otros usuarios.
SELECT id, provider, external_subject, email, status, reviewed_at, reviewed_by_user_id
  FROM public.external_identities
 WHERE provider = 'supabase'
   AND external_subject = '6c701e97-3e79-40af-8c42-f5a3766834fc';

ROLLBACK;
