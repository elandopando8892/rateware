-- PROPUESTA SIN APLICAR. Requiere confirmación humana explícita.
-- Orden: desplegar list_rfx_segment_confirmations, publicar los clientes que la
-- usan, verificar lectura del mismo workspace/rechazo de otro y luego aprobar.
-- El portal público usa rfx-bid-api con service_role; no lee vía authenticated.
-- Revisión 2026-09-30: SELECT authenticated tiene qual=true. No hay políticas
-- de escritura para authenticated en esta tabla.
begin;

-- Bloquear si cambió la topología de políticas revisada.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'rfx_segment_confirmations'
      and policyname <> 'authenticated users can read rfx segment confirmations'
      and cmd in ('ALL', 'SELECT')
  ) then
    raise exception 'Hay otras políticas de lectura; revisar antes de endurecer.';
  end if;
end $$;

drop policy if exists "authenticated users can read rfx segment confirmations"
  on public.rfx_segment_confirmations;

-- Sin política SELECT para el navegador: la API valida requireOwnedRfxEvent.
-- No recreamos aquí la resolución de workspace de Edge/Auth dentro de RLS.
-- Sustituir por COMMIT únicamente después de aprobación explícita.
rollback;

-- Reversión explícita si se aprueba, NO ejecutar junto a lo anterior:
-- create policy "authenticated users can read rfx segment confirmations"
-- on public.rfx_segment_confirmations for select to authenticated using (true);
