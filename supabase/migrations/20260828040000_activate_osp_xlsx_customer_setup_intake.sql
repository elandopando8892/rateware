do $$
declare
  affected integer;
begin
  update osp_private.production_controls
  set osp_xlsx_intake_enabled = true,
      osp_xlsx_intake_active_after = statement_timestamp(),
      version = version + 1,
      updated_at = statement_timestamp()
  where id = 'singleton'
    and release_mode = 'shadow'
    and outbound_enabled = false
    and rateware_xlsx_routing_enabled = false
    and rateware_xlsx_routing_active_after is null
    and osp_xlsx_intake_enabled = false
    and osp_xlsx_intake_active_after is null
    and version < 2147483647;

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception using
      errcode = '55000',
      message = 'OSP_XLSX_INTAKE_ACTIVATION_CONFLICT';
  end if;
end;
$$;
